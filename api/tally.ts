import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

function setCors(res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function safeJsonParse(x: any) {
  if (!x) return null;
  if (typeof x === "object") return x;
  if (typeof x === "string") {
    try { return JSON.parse(x); } catch { return null; }
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Vercel usually parses JSON automatically, but we support either.
  const body = (req.body && typeof req.body === "object") ? req.body : safeJsonParse(req.body);

  const submissionId =
    body?.submission?.id ||
    body?.data?.submission?.id ||
    body?.event?.data?.id ||
    body?.id;

  if (!submissionId) {
    return res.status(400).json({ ok: false, error: "Missing submission id", got_keys: Object.keys(body || {}) });
  }

  // 1) Create Insigne
  const { data: insigne, error: insigneErr } = await supabase
    .from("insignes")
    .insert({ status: "draft" })
    .select("id")
    .single();

  if (insigneErr || !insigne?.id) {
    return res.status(500).json({ ok: false, error: "Failed to create insigne", details: insigneErr?.message });
  }

  // 2) Store lookup (upsert so repeats don’t break)
  const { error: lookupErr } = await supabase
    .from("submission_lookup")
    .upsert({ submission_id: String(submissionId), insigne_id: insigne.id }, { onConflict: "submission_id" });

  if (lookupErr) {
    return res.status(500).json({ ok: false, error: "Failed to store lookup", details: lookupErr.message });
  }

  return res.status(200).json({ ok: true, submission_id: String(submissionId), insigne_id: insigne.id });
}
