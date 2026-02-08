import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  // CORS (needed for browser + some mobile clients)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

  if (req.method === "OPTIONS") return res.status(200).end();
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

    // Accept either { ... } or { data: { ... } }
    const body = req.body ?? {};
    const payload = body.data ?? body;

    const email = payload.email ?? payload.owner_email ?? null;
    const ownerMemberstackId =
      payload.owner_memberstack_id ?? payload.memberstack_id ?? null;

    // We store the whole payload as answers_json (safe for v1)
    const answersJson = payload.answers ?? payload;

    if (!email) {
      return res.status(400).json({ ok: false, error: "Missing email" });
    }
    if (!ownerMemberstackId) {
      return res
        .status(400)
        .json({ ok: false, error: "Missing owner_memberstack_id" });
    }

    // 1) Create insigne parent
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
      return res.status(500).json({
        ok: false,
        error: "Insert insigne failed",
        details: insigneErr
      });
    }

    // 2) Create answers child
    const { error: answersErr } = await supabase.from("answers").insert({
      insigne_id: insigne.id,
      answers_json: answersJson
    });

    if (answersErr) {
      return res.status(500).json({
        ok: false,
        error: "Insert answers failed",
        details: answersErr
      });
    }

    return res.status(200).json({ ok: true, insigne_id: insigne.id });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Unexpected error", details: String(e) });
  }
}
