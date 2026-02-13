import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: insigne, error } = await supabase
    .from("insignes")
    .select("id,status,motto_latin")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !insigne) {
    return res.status(404).json({ ok: false });
  }

  const { data: assets } = await supabase
    .from("assets")
    .select("asset_type, storage_path")
    .eq("insigne_id", insigne.id);

  return res.json({
    ok: true,
    insigne,
    assets: assets ?? []
  });
}
