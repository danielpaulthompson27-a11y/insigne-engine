import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { makeToken } from "./_utils";

function cors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
}

function getSubmissionId(body: any): string | null {
  return body?.data?.submissionId || body?.data?.responseId || null;
}

// ⚠️ This depends on your Tally form: make sure there is an email question.
// In Tally payload, fields are usually in body.data.fields.
function getEmailFromTally(body: any): string | null {
  const fields = body?.data?.fields;
  if (!Array.isArray(fields)) return null;

  // Try to find an email-type field or a label containing "email"
  const emailField = fields.find((f: any) => {
    const label = String(f?.label || "").toLowerCase();
    return f?.type === "EMAIL" || label.includes("email");
  });

  const val = emailField?.value;
  if (typeof val === "string" && val.includes("@")) return val.trim();
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const body = req.body;

  const submissionId = getSubmissionId(body);
  const clientEmail = getEmailFromTally(body);

  // Helpful logs while building
  console.log("TALLY event:", {
    submissionId,
    clientEmail,
    createdAt: body?.createdAt,
  });

  if (!submissionId) {
    return res.status(400).json({ ok: false, error: "Missing Tally submission id (body.data.submissionId/responseId)" });
  }
  if (!clientEmail) {
    return res.status(400).json({ ok: false, error: "Missing client email. Add an Email field to the Tally form." });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // 1) Create Insigne
  const token = makeToken();
  const { data: insigne, error: insigneErr } = await supabase
    .from("insignes")
    .insert({
      client_email: clientEmail,
      access_token: token,
      status: "generating",
    })
    .select("id, access_token, client_email")
    .single();

  if (insigneErr || !insigne) {
    return res.status(500).json({ ok: false, error: insigneErr?.message || "Failed to create insigne" });
  }

  // 2) Store lookup (optional but useful)
  await supabase.from("submission_lookup").upsert(
    { submission_id: submissionId, insigne_id: insigne.id },
    { onConflict: "submission_id" }
  );

  // 3) Store raw answers payload
  const { error: answersErr } = await supabase
    .from("answers")
    .insert({ insigne_id: insigne.id, payload: body });

  if (answersErr) {
    return res.status(500).json({ ok: false, error: answersErr.message });
  }

  // 4) Fire-and-forget generate (don’t block webhook)
  const base = "https://insigne-engine.vercel.app"; // <-- set to your Vercel domain
  fetch(`${base}/api/generate?id=${encodeURIComponent(insigne.id)}`, { method: "POST" })
    .then(() => console.log("generate triggered"))
    .catch((e) => console.log("generate trigger failed", e));

  // 5) Return OK to Tally
  return res.status(200).json({
    ok: true,
    insigne_id: insigne.id,
    token: insigne.access_token,
    results_url: `${process.env.PUBLIC_RESULTS_URL_BASE}?token=${insigne.access_token}`,
  });
}
