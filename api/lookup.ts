import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

function json(res: VercelResponse, status: number, body: any) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS + no-cache (helps when calling from Webflow)
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return json(res, 405, { ok: false, error: "Method not allowed" });

  const submissionId = (req.query.submission_id as string) || "";
  if (!submissionId) {
    return json(res, 400, { ok: false, error: "Missing query param: submission_id" });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(res, 500, {
      ok: false,
      error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Vercel env vars",
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // IMPORTANT: This table must exist in Supabase:
  // submission_lookup(submission_id text primary key, insigne_id uuid, created_at timestamp)
  const { data, error } = await supabase
    .from("submission_lookup")
    .select("insigne_id")
    .eq("submission_id", submissionId)
    .maybeSingle();

  if (error) {
    return json(res, 500, { ok: false, error: "Lookup query failed", details: error });
  }

  if (!data?.insigne_id) {
    return json(res, 404, { ok: false, error: "Not found" });
  }

  return json(res, 200, { ok: true, submission_id: submissionId, insigne_id: data.insigne_id });
}
