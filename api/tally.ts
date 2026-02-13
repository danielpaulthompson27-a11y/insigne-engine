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
  try {
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(res, 500, { ok: false, error: "Missing Supabase env vars" });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Tally sometimes sends JSON, sometimes a string
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    // Be flexible: different Tally payload shapes
    const submissionId =
      body?.submission?.id ||
      body?.data?.submissionId ||
      body?.submissionId ||
      null;

    // Create an insigne no matter what, so you can see flow working
    const { data: insigne, error: insigneErr } = await supabase
      .from("insignes")
      .insert({
        status: "draft",
        motto_latin: "omnia cum moderatione",
        report_text: "TEST: This is your report. You value integrity, precision, and relentless growth...",
      })
      .select("id")
      .single();

    if (insigneErr) return json(res, 500, { ok: false, error: insigneErr.message });

    // If we DID get a submissionId, store it (optional)
    if (submissionId) {
      await supabase.from("submission_lookup").insert({
        submission_id: submissionId,
        insigne_id: insigne.id,
      });
    }

    return json(res, 200, { ok: true, insigne_id: insigne.id, submission_id: submissionId });
  } catch (e: any) {
    return json(res, 500, { ok: false, error: "Unexpected error", details: e?.message ?? e });
  }
}
