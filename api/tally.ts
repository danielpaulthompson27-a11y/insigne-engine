import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

function json(res: VercelResponse, status: number, body: any) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(body));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(res, 500, { ok: false, error: "Missing Supabase env vars" });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Vercel usually gives parsed JSON here, but we keep it defensive:
    const body: any = req.body ?? {};
    const submissionId = body?.submission?.id || body?.data?.submission?.id || body?.id;

    if (!submissionId) {
      return json(res, 400, { ok: false, error: "Missing submission id", got: body });
    }

    // 1) Create Insigne
    const { data: insigne, error: insigneErr } = await supabase
      .from("insignes")
      .insert({ status: "draft" })
      .select("id")
      .single();

    if (insigneErr || !insigne?.id) {
      return json(res, 500, { ok: false, error: "Failed to create insigne", details: insigneErr });
    }

    // 2) Store lookup (UPSERT so retries don’t create duplicates)
    const { error: lookupErr } = await supabase
      .from("submission_lookup")
      .upsert(
        { submission_id: submissionId, insigne_id: insigne.id },
        { onConflict: "submission_id" }
      );

    if (lookupErr) {
      return json(res, 500, { ok: false, error: "Failed to store lookup", details: lookupErr });
    }

    return json(res, 200, { ok: true, submission_id: submissionId, insigne_id: insigne.id });
  } catch (e: any) {
    return json(res, 500, { ok: false, error: "Unexpected error", details: e?.message ?? e });
  }
}
