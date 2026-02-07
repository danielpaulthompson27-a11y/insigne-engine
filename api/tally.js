import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return res.status(500).json({
        ok: false,
        error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Vercel env vars"
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Tally sends JSON. We'll accept either:
    // - { email, owner_memberstack_id, answers }
    // - or { data: { ... } } depending on your webhook settings
    const body = req.body || {};
    const payload = body.data ?? body;

    const email =
      payload.email ||
      payload.owner_email ||
      payload.fields?.email ||
      payload.respondent?.email ||
      null;

    const ownerMemberstackId =
      payload.owner_memberstack_id ||
      payload.memberstack_id ||
      payload.member?.id ||
      payload.fields?.owner_memberstack_id ||
      null;

    // We'll store the full payload as answers_json for now
    const answersJson = payload.answers ?? payload;

    if (!email) {
      return res.status(400).json({ ok: false, error: "Missing email in payload" });
    }
    if (!ownerMemberstackId) {
      return res.status(400).json({ ok: false, error: "Missing owner_memberstack_id in payload" });
    }

    // 1) Create insigne row
    const { data: insigne, error: insigneErr } = await supabase
      .from("insignes")
      .insert({
        status: "draft",
        version: 1,
        owner_email: email,
        owner_memberstack_id: ownerMemberstackId
      })
      .select("id")
      .single();

    if (insigneErr) {
      return res.status(500).json({ ok: false, error: "Insert insigne failed", details: insigneErr });
    }

    // 2) Create answers row
    const { error: answersErr } = await supabase
      .from("answers")
      .insert({
        insigne_id: insigne.id,
        answers_json: answersJson
      });

    if (answersErr) {
      return res.status(500).json({ ok: false, error: "Insert answers failed", details: answersErr });
    }

    return res.status(200).json({ ok: true, insigne_id: insigne.id });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Unexpected error", details: String(e) });
  }
}
