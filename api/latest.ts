import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .from("insignes")
    .select("id,status,motto_latin,report_text")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return res.status(404).json({ ok: false });
  }

  return res.status(200).json({
    ok: true,
    insigne_id: data.id,
    status: data.status,
    motto_latin: data.motto_latin,
    report_text: data.report_text,
  });
}
