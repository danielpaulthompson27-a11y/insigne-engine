import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const body = req.body;

  const submissionId = body?.submission?.id;
  if (!submissionId) {
    return res.status(400).json({ ok: false, error: "Missing submission id" });
  }

  // 1) Create Insigne
  const { data: insigne, error: insigneErr } = await supabase
    .from("insignes")
    .insert({ status: "draft" })
    .select("id")
    .single();

  if (insigneErr) {
    return res.status(500).json({ ok: false, error: insigneErr.message });
  }

  // 2) Store lookup
  await supabase.from("submission_lookup").insert({
    submission_id: submissionId,
    insigne_id: insigne.id,
  });

  return res.status(200).json({ ok: true });
}
