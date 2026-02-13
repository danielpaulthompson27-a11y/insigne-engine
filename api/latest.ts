import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

function json(res: VercelResponse, status: number, body: any) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(JSON.stringify(body));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") return json(res, 405, { ok: false, error: "Method not allowed" });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(res, 500, { ok: false, error: "Missing Supabase env vars" });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Latest insigne by created_at (assumes you have created_at on insignes)
    const { data, error } = await supabase
      .from("insignes")
      .select("id,status,motto_latin,report_text,created_at")
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) return json(res, 500, { ok: false, error: error.message });
    if (!data || data.length === 0) return json(res, 404, { ok: false, error: "No insignes found" });

    return json(res, 200, { ok: true, insigne: data[0] });
  } catch (e: any) {
    return json(res, 500, { ok: false, error: "Unexpected error", details: e?.message ?? e });
  }
}
