import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false });
  }

  const payload = req.body;
  const submissionId = payload?.data?.submissionId;

  if (!submissionId) {
    return res.status(400).json({ ok: false, error: "Missing submissionId" });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // 1. Create Insigne
  const { data: insigne, error: insigneErr } = await supabase
    .from("insignes")
    .insert({
      status: "draft",
      motto_latin: "",
      report_text: "This is your initial Insigne report. Forged from intention.",
    })
    .select("id")
    .single();

  if (insigneErr) {
    return res.status(500).json({ ok: false, error: "Failed to create insigne" });
  }

  // 2. Link submission → insigne
  await supabase.from("tally_submissions").insert({
    submission_id: submissionId,
    insigne_id: insigne.id,
  });

  return res.json({
    ok: true,
    insigne_id: insigne.id,
  });
}
