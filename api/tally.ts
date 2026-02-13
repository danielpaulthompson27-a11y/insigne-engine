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
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const body =
    typeof req.body === "object"
      ? req.body
      : (() => {
          try {
            return JSON.parse(req.body as any);
          } catch {
            return null;
          }
        })();

  // ✅ Tally webhook format (from your screenshot)
  const submissionId = body?.data?.submissionId;

  console.log("TALLY submissionId:", submissionId);
  console.log("TALLY BODY:", JSON.stringify(body, null, 2));

  if (!submissionId) {
    return res.status(400).json({ ok: false, error: "Missing submissionId (body.data.submissionId)" });
  }

  // 1) Create Insigne
  const { data: insigne, error: insigneErr } = await supabase
    .from("insignes")
    .insert({ status: "draft" })
    .select("id")
    .single();

  if (insigneErr || !insigne) {
    return res.status(500).json({ ok: false, error: insigneErr?.message ?? "Failed to create insigne" });
  }

  // 2) Store lookup (submissionId -> insigneId)
  const { error: lookupErr } = await supabase.from("submission_lookup").upsert(
    {
      submission_id: String(submissionId),
      insigne_id: insigne.id,
    },
    { onConflict: "submission_id" }
  );

  if (lookupErr) {
    return res.status(500).json({ ok: false, error: lookupErr.message });
  }

  return res.status(200).json({ ok: true, submission_id: submissionId, insigne_id: insigne.id });
}
