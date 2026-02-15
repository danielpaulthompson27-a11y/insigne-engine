import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

function json(res: VercelResponse, status: number, body: any) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

// ---- Tally signature verification (optional but recommended) ----
// Tally sends a signature header. Depending on plan/version it may be one of these:
function getTallySignature(req: VercelRequest) {
  const h = req.headers;
  return (
    (h["tally-signature"] as string) ||
    (h["x-tally-signature"] as string) ||
    (h["x-webhook-signature"] as string) ||
    ""
  );
}

function safeRawBody(req: VercelRequest): string {
  // If Vercel already parsed JSON, reconstruct a stable string
  // (Not perfect signature-wise, but avoids crashing. If you need strict verification,
  // we can switch to raw body parsing later.)
  if (typeof req.body === "string") return req.body;
  try {
    return JSON.stringify(req.body ?? {});
  } catch {
    return "";
  }
}

function verifyHmacSha256(raw: string, secret: string, signature: string) {
  if (!secret || !signature) return false;
  const digest = crypto.createHmac("sha256", secret).update(raw).digest("hex");

  // Some providers prefix like: "sha256=...."
  const sig = signature.replace(/^sha256=/i, "").trim();

  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(sig));
  } catch {
    return false;
  }
}

// ---- Pull submission id from the payload (Tally has a couple shapes) ----
function extractSubmissionId(body: any): string | null {
  // Newer: body.data.submissionId
  const a = body?.data?.submissionId;
  if (typeof a === "string" && a.length) return a;

  // Sometimes: body.submission.id
  const b = body?.submission?.id;
  if (typeof b === "string" && b.length) return b;

  // Occasionally: responseId used as id
  const c = body?.data?.responseId;
  if (typeof c === "string" && c.length) return c;

  // If you used a hidden field called "submission_id" inside fields
  const fields = body?.data?.fields;
  if (Array.isArray(fields)) {
    const f = fields.find((x: any) => x?.label === "submission_id" || x?.key === "submission_id");
    if (f?.value && typeof f.value === "string") return f.value;
  }

  return null;
}

function extractEmail(body: any): string | null {
  // If you have an email field in your form, it will appear in fields
  const fields = body?.data?.fields;
  if (!Array.isArray(fields)) return null;

  const emailField = fields.find((x: any) => (x?.type || "").toLowerCase().includes("email"));
  const v = emailField?.value;
  if (typeof v === "string" && v.includes("@")) return v.trim();

  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS (so you can test easily)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, tally-signature, x-tally-signature");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const TALLY_SIGNING_SECRET = process.env.TALLY_SIGNING_SECRET || ""; // put this in Vercel env vars

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(res, 500, { ok: false, error: "Missing Supabase env vars" });
    }

    const body = req.body;
    const raw = safeRawBody(req);
    const signature = getTallySignature(req);

    // If you want signature enforcement, turn this on:
    // (For now you can leave it soft to get end-to-end working.)
    if (TALLY_SIGNING_SECRET && signature) {
      const okSig = verifyHmacSha256(raw, TALLY_SIGNING_SECRET, signature);
      if (!okSig) {
        // Don't block forever if headers differ — but show it clearly
        return json(res, 401, { ok: false, error: "Invalid signature" });
      }
    }

    const submissionId = extractSubmissionId(body);
    if (!submissionId) {
      return json(res, 400, { ok: false, error: "Missing submissionId in payload", debug: body?.data?.submissionId ?? null });
    }

    const email = extractEmail(body);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // 1) Create insigne
    const { data: insigne, error: insigneErr } = await supabase
      .from("insignes")
      .insert({ status: "draft", motto_latin: "" })
      .select("id")
      .single();

    if (insigneErr || !insigne?.id) {
      return json(res, 500, { ok: false, error: "Failed to create insigne", details: insigneErr?.message ?? null });
    }

    // 2) Store lookup (submissionId -> insigneId)
    const { error: lookupErr } = await supabase.from("submission_lookup").insert({
      submission_id: submissionId,
      insigne_id: insigne.id,
      // optional: store email too if you add a column later
    });

    if (lookupErr) {
      return json(res, 500, { ok: false, error: "Failed to store submission lookup", details: lookupErr.message });
    }

    // 3) Return OK (later we’ll kick off /api/generate + email)
    return json(res, 200, {
      ok: true,
      submission_id: submissionId,
      insigne_id: insigne.id,
      email: email ?? null,
    });
  } catch (e: any) {
    return json(res, 500, { ok: false, error: "Unexpected error", details: e?.message ?? e });
  }
}
