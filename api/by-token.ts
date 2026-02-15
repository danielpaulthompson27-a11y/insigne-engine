import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ ok: false });

  const token = (req.query.token as string) || "";
  if (!token) return res.status(400).json({ ok: false, error: "Missing token" });

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: insigne, error: insigneErr } = await supabase
    .from("insignes")
    .select("id,status,motto_latin,report_text,client_email,access_token")
    .eq("access_token", token)
    .maybeSingle();

  if (insigneErr) return res.status(500).json({ ok: false, error: insigneErr.message });
  if (!insigne) return res.status(404).json({ ok: false, error: "Not found" });

  const { data: assets } = await supabase
    .from("assets")
    .select("asset_type, storage_path")
    .eq("insigne_id", insigne.id);

  // Signed URLs
  const expiresIn = 60 * 15;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET!;
  const signedAssets = await Promise.all((assets || []).map(async (a) => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(a.storage_path, expiresIn);

    return {
      asset_type: a.asset_type,
      storage_path: a.storage_path,
      signed_url: data?.signedUrl ?? null,
      signed_url_error: error?.message ?? null,
    };
  }));

  return res.status(200).json({
    ok: true,
    insigne: {
      id: insigne.id,
      status: insigne.status,
      motto_latin: insigne.motto_latin,
      report_text: insigne.report_text,
    },
    assets: signedAssets
  });
}
