import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const submissionId = req.query.submission_id as string;

  if (!submissionId) {
    return res.status(400).json({ ok: false, error: "Missing submission_id" });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .from("tally_submissions")
    .select("insigne_id")
    .eq("submission_id", submissionId)
    .maybeSingle();

  if (error || !data) {
    return res.status(404).json({ ok: false, error: "Not found" });
  }

  return res.json({
    ok: true,
    insigne_id: data.insigne_id,
  });
}
