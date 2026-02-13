import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

function send(res: VercelResponse, status: number, body: any) {
  res.status(status);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(body));
}

async function readRawBody(req: VercelRequest): Promise<string> {
  return await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") return send(res, 405, { ok: false, error: "Method not allowed" });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return send(res, 500, { ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Read body safely
    const raw = typeof req.body === "string" && req.body.length
      ? req.body
      : await readRawBody(req);

    const body = raw ? JSON.parse(raw) : {};

    // Try multiple shapes
    const submissionId =
      body?.submission?.id ||
      body?.data?.submissionId ||
      body?.submissionId ||
      null;

    // Create insigne (so you can SEE it working end-to-end)
    const { data: insigne, error: insigneErr } = await supabase
      .from("insignes")
      .insert({
        status: "draft",
        motto_latin: "omnia cum moderatione",
        report_text: "TEST: This is your report. Next step is generating real content from your answers.",
      })
      .select("id")
      .single();

    if (insigneErr) {
      return send(res, 500, { ok: false, error: insigneErr.message });
    }

    // Optional lookup write
    if (submissionId) {
      const { error: lookupErr } = await supabase
        .from("submission_lookup")
        .insert({ submission_id: submissionId, insigne_id: insigne.id });

      if (lookupErr) {
        // Don’t fail the whole request — just report it
        return send(res, 200, { ok: true, insigne_id: insigne.id, submission_id: submissionId, lookup_warning: lookupErr.message });
      }
    }

    return send(res, 200, { ok: true, insigne_id: insigne.id, submission_id: submissionId });
  } catch (e: any) {
    return send(res, 500, { ok: false, error: "Unexpected error", details: e?.message ?? String(e) });
  }
}
