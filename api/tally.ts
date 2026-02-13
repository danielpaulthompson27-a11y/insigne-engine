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

  // 🔑 Tally sends submission ID in different places depending on context
  const submissionId =
    body?.submission?.id ||
    body?.data?.submission?.id ||
    body?.event?.data?.id ||
    body?.data?.id ||
    body?.id;

  if (!submissionId) {
    console.error("TALLY BODY:", JSON.stringify(body, null, 2));
    return res.status(400).json({ ok: false, error: "Missing submission id" });
  }

  // 1) Create insigne
  const { data: insigne, error: insigneErr } = await supabase
    .from("insignes")
    .insert({ status: "draft" })
    .select("id")
    .single();

  if (insigneErr || !insigne) {
    return res.status(500).json({ ok: false, error: insigneErr?.message });
  }

  // 2) Store lookup
  const { error: lookupErr } = await supabase
    .from("submission_lookup")
    .upsert(
      { submission_id: String(submissionId), insigne_id: insigne.id },
      { onConflict: "submission_id" }
    );

  if (lookupErr) {
    return res.status(500).json({ ok: false, error: lookupErr.message });
  }

  return res.status(200).json({
    ok: true,
    submission_id: submissionId,
    insigne_id: insigne.id,
  });
}
