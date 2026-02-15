import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const key = req.headers["x-admin-key"];
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return res.status(401).json({ ok: false });

  const id = (req.query.id as string) || "";
  if (!id) return res.status(400).json({ ok: false, error: "Missing id" });

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: insigne } = await supabase
    .from("insignes")
    .select("client_email, access_token, motto_latin")
    .eq("id", id)
    .maybeSingle();

  if (!insigne?.client_email || !insigne?.access_token) {
    return res.status(400).json({ ok: false, error: "Missing email/token" });
  }

  const link = `${process.env.PUBLIC_RESULTS_URL_BASE}?token=${insigne.access_token}`;

  const emailPayload = {
    from: process.env.FROM_EMAIL,
    to: insigne.client_email,
    subject: "Your Insigne has been forged",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;line-height:1.5">
        <h2>Your Insigne has been forged</h2>
        <p>Your private dossier and Insigne are ready to view.</p>
        <p><a href="${link}" style="display:inline-block;padding:12px 16px;background:#111;color:#fff;text-decoration:none;border-radius:10px">View your Insigne</a></p>
        <p style="color:#666;font-size:12px">This link is private. Keep it secure.</p>
      </div>
    `
  };

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(emailPayload)
  });

  if (!r.ok) {
    const t = await r.text();
    return res.status(500).json({ ok: false, error: t });
  }

  await supabase.from("insignes").update({ status: "delivered" }).eq("id", id);

  return res.json({ ok: true });
}
