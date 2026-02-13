import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

function send(res: VercelResponse, status: number, body: any) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(body));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return send(res, 405, { ok: false, error: "Method not allowed" });

  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return send(res, 500, { ok: false, error: "Missing Supabase env vars in Vercel" });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Body can be object or a JSON string depending on how Vercel parsed it
  const raw = (req.body ?? {}) as any;
  const body = typeof raw === "string" ? JSON.parse(raw) : raw;

  const submissionId = body?.submission?.id || body?.data?.submission?.id;
  if (!submissionId) {
    return send(res, 400, { ok: false, error: "Missing submission id", receivedKeys: Object.keys(body || {}) });
  }

  // 1) If lookup already exists, return it (prevents duplicates if Tally retries)
  const { data: existing } = await supabase
    .from("submission_lookup")
    .select("submission_id, insigne_id")
    .eq("submission_id", submissionId)
    .maybeSingle();

  if (existing?.insigne_id) {
    return send(res, 200, { ok: true, submission_id: submissionId, insigne_id: existing.insigne_id, deduped: true });
  }

  // 2) Create insigne
  const { data: insigne, error: insigneErr } = await supabase
    .from("insignes")
    .insert({ status: "draft" })
    .select("id")
    .single();

  if (insigneErr || !insigne?.id) {
    return send(res, 500, { ok: false, error: "Failed to create insigne", details: insigneErr });
  }

  // 3) Store lookup
  const { error: lookupErr } = await supabase.from("submission_lookup").insert({
    submission_id: submissionId,
    insigne_id: insigne.id,
  });

  if (lookupErr) {
    return send(res, 500, { ok: false, error: "Failed to store submission lookup", details: lookupErr });
  }

  return send(res, 200, { ok: true, submission_id: submissionId, insigne_id: insigne.id });
}
