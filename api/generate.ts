import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

async function openaiText(prompt: string) {
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: prompt
    })
  });
  if (!r.ok) throw new Error(await r.text());
  const j = await r.json();
  // Responses API returns output text in a few shapes; this is a safe extraction:
  const text = j.output?.[0]?.content?.[0]?.text || j.output_text || "";
  return String(text);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false });

  const insigneId = (req.query.id as string) || "";
  if (!insigneId) return res.status(400).json({ ok: false, error: "Missing id" });

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Load latest answers payload
  const { data: ans, error: ansErr } = await supabase
    .from("answers")
    .select("payload")
    .eq("insigne_id", insigneId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ansErr || !ans) return res.status(500).json({ ok: false, error: ansErr?.message || "No answers found" });

  const payload = ans.payload;

  const prompt = `
You are "Insigne", a luxury heraldic house. Write:
1) A premium, intimate 1–2 page report in story form describing the person based on their questionnaire answers. Make it feel like a private dossier: confident, discreet, accurate.
2) A motto in English (short, powerful).
3) The motto translated into Latin (classical style, not Google translate awkwardness).

Return STRICT JSON:
{
  "report_text": "...",
  "motto_english": "...",
  "motto_latin": "..."
}

Here is the questionnaire payload JSON:
${JSON.stringify(payload).slice(0, 12000)}
`;

  // Set status generating (optional)
  await supabase.from("insignes").update({ status: "generating" }).eq("id", insigneId);

  const out = await openaiText(prompt);

  let parsed: any;
  try { parsed = JSON.parse(out); }
  catch {
    // fallback: store raw output
    parsed = { report_text: out, motto_english: "", motto_latin: "" };
  }

  const report_text = String(parsed.report_text || "").trim();
  const motto_latin = String(parsed.motto_latin || "").trim();

  await supabase
    .from("insignes")
    .update({
      report_text,
      motto_latin,
      status: "awaiting_approval"
    })
    .eq("id", insigneId);

  return res.status(200).json({ ok: true });
}
