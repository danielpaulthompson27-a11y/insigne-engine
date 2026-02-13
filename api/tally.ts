import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false });

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const body =
    typeof req.body === "object"
      ? req.body
      : (() => {
          try { return JSON.parse(req.body as any); }
          catch { return null; }
        })();

  // Collect candidates (Tally varies by event type)
  const candidates = [
    body?.submission?.id,
    body?.data?.submission?.id,
    body?.event?.data?.id,
    body?.data?.id,
    body?.id,
    body?.submissionId,
    body?.submission_id,
  ]
    .filter(Boolean)
    .map(String);

  console.log("TALLY CANDIDATES:", candidates);
  console.log("TALLY BODY:", JSON.stringify(body, null, 2));

  if (candidates.length === 0) {
    return res.status(400).json({ ok: false, error: "Missing submission id" });
  }

  // Create insigne
  const { data: insigne, error: insigneErr } = await supabase
    .from("insignes")
    .insert({ status: "draft" })
    .select("id")
    .single();

  if (insigneErr || !insigne) {
    return res.status(500).json({ ok: false, error: insigneErr?.message });
  }

  // Insert lookup rows for ALL candidate ids (so redirect id will match one)
  const rows = candidates.map((sid) => ({
    submission_id: sid,
    insigne_id: insigne.id,
  }));

  const { error: lookupErr } = await supabase
    .from("submission_lookup")
    .upsert(rows, { onConflict: "submission_id" });

  if (lookupErr) {
    return res.status(500).json({ ok: false, error: lookupErr.message });
  }

  return res.status(200).json({
    ok: true,
    stored_submission_ids: candidates,
    insigne_id: insigne.id,
  });
}
