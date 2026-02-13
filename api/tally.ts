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

function findFieldValue(body: any, key: string): string | null {
  // Tally payloads vary — this searches common shapes safely
  const candidates =
    body?.data?.fields ||
    body?.fields ||
    body?.data?.data?.fields ||
    body?.data?.submission?.fields ||
    [];

  if (!Array.isArray(candidates)) return null;

  for (const f of candidates) {
    if (!f) continue;
    if (f.key === key) return f.value ?? null;
    if (f.name === key) return f.value ?? null;
    if (f.label === key) return f.value ?? null;
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const raw = req.body as any;
  const body = typeof raw === "string" ? JSON.parse(raw) : raw;

  // ✅ Use the hidden field value first (this is the Webflow-generated sid)
  const submissionId =
    findFieldValue(body, "submission_id") ||
    body?.submission?.id ||
    body?.data?.submission?.id ||
    null;

  if (!submissionId) {
    return json(res, 400, { ok: false, error: "Missing submission id", receivedKeys: Object.keys(body || {}) });
  }

  // ✅ Dedup: if already exists, return existing mapping
  const { data: existing } = await supabase
    .from("submission_lookup")
    .select("submission_id, insigne_id")
    .eq("submission_id", submissionId)
    .maybeSingle();

  if (existing?.insigne_id) {
    return json(res, 200, { ok: true, submission_id: submissionId, insigne_id: existing.insigne_id, deduped: true });
  }

  // 1) Create Insigne (and a placeholder report so results page shows content)
  const { data: insigne, error: insigneErr } = await supabase
    .from("insignes")
    .insert({
      status: "draft",
      report_text: "Your Insigne is being forged. This is your initial profile preview.",
      motto_latin: "",
    })
    .select("id")
    .single();

  if (insigneErr || !insigne?.id) {
    return json(res, 500, { ok: false, error: "Failed to create insigne", details: insigneErr });
  }

  // 2) Store lookup
  const { error: lookupErr } = await supabase.from("submission_lookup").insert({
    submission_id: submissionId,
    insigne_id: insigne.id,
  });

  if (lookupErr) {
    return json(res, 500, { ok: false, error: "Failed to store submission lookup", details: lookupErr });
  }

  return json(res, 200, { ok: true, submission_id: submissionId, insigne_id: insigne.id });
}
