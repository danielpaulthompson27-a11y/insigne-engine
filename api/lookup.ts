import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");

  // CORS (for Webflow)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "GET") return res.status(405).end(JSON.stringify({ ok: false, error: "Method not allowed" }));

  const submission_id = (req.query.submission_id as string) || "";
  if (!submission_id) return res.status(400).end(JSON.stringify({ ok: false, error: "Missing submission_id" }));

  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from("tally_submissions")
    .select("insigne_id")
    .eq("submission_id", submission_id)
    .maybeSingle();

  if (error) return res.status(500).end(JSON.stringify({ ok: false, error: "Lookup failed", details: error }));
  if (!data?.insigne_id) return res.status(404).end(JSON.stringify({ ok: false, error: "Not found" }));

  return res.status(200).end(JSON.stringify({ ok: true, insigne_id: data.insigne_id }));
}
