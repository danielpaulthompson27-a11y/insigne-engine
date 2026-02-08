import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  // Basic CORS (important for Hoppscotch / Tally / Webflow)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const { email, owner_memberstack_id, answers } = req.body;

    // Basic validation
    if (!email || !owner_memberstack_id || !answers) {
      return res.status(400).json({
        ok: false,
        error: "Missing email, owner_memberstack_id, or answers"
      });
    }

    // Environment variables check
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        ok: false,
        error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Vercel env vars"
      });
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);

    /**
     * STEP 1 — Create the Insigne (OWNER = Memberstack user)
     * IMPORTANT:
     * - user_id is REQUIRED (NOT NULL)
     * - we intentionally use owner_memberstack_id as user_id
     */
    const { data: insigne, error: insigneError } = await supabase
      .from("insignes")
      .insert({
        user_id: owner_memberstack_id,           // ✅ FIX
        owner_memberstack_id: owner_memberstack_id,
        email: email,
        status: "draft"
      })
      .select()
      .single();

    if (insigneError) {
      return res.status(500).json({
        ok: false,
        error: "Insert insigne failed",
        details: insigneError
      });
    }

    /**
     * STEP 2 — Save raw answers payload
     */
    const { error: answersError } = await supabase
      .from("answers")
      .insert({
        insigne_id: insigne.id,
        payload: answers
      });

    if (answersError) {
      return res.status(500).json({
        ok: false,
        error: "Insert answers failed",
        details: answersError
      });
    }

    /**
     * SUCCESS
     */
    return res.status(200).json({
      ok: true,
      insigne_id: insigne.id
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Unexpected error",
      details: err.message
    });
  }
}
