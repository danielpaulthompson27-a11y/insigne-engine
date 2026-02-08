import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

type AssetRow = {
  id: string;
  insigne_id: string;
  asset_type: string | null;
  storage_path: string | null;
};

type InsigneRow = {
  id: string;
  status: string | null;
  motto_latin: string | null;
};

function json(res: VercelResponse, status: number, body: any) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "GET") {
      return json(res, 405, { ok: false, error: "Method not allowed" });
    }

    const insigneId = (req.query.id as string) || "";
    if (!insigneId) {
      return json(res, 400, { ok: false, error: "Missing query param: id" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // IMPORTANT: set this in Vercel (Project Settings → Environment Variables)
    // Example bucket name: "assets" or "public" or whatever you created in Supabase Storage.
    const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "";

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(res, 500, {
        ok: false,
        error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Vercel env vars",
      });
    }

    if (!STORAGE_BUCKET) {
      return json(res, 500, {
        ok: false,
        error:
          "Missing SUPABASE_STORAGE_BUCKET in Vercel env vars (set it to your Storage bucket name)",
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // 1) Load the insigne
    const { data: insigne, error: insigneErr } = await supabase
      .from("insignes")
      .select("id,status,motto_latin")
      .eq("id", insigneId)
      .maybeSingle<InsigneRow>();

    if (insigneErr) {
      return json(res, 500, { ok: false, error: "Failed to load insigne", details: insigneErr });
    }
    if (!insigne) {
      return json(res, 404, { ok: false, error: "Insigne not found" });
    }

    // 2) Load assets
    const { data: assets, error: assetsErr } = await supabase
      .from("assets")
      .select("id,insigne_id,asset_type,storage_path")
      .eq("insigne_id", insigneId)
      .order("created_at", { ascending: true });

    if (assetsErr) {
      return json(res, 500, { ok: false, error: "Failed to load assets", details: assetsErr });
    }

    const expiresIn = 60 * 15; // 15 minutes

    // 3) Create signed URLs
    const assetsWithUrls = await Promise.all(
      (assets as AssetRow[]).map(async (a) => {
        if (!a.storage_path) {
          return {
            asset_type: a.asset_type,
            storage_path: a.storage_path,
            signed_url: null,
            signed_url_error: "Missing storage_path",
          };
        }

        // storage_path should be the path *inside the bucket*
        // Example: "insignes/test/owner-pack.pdf"
        const { data, error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .createSignedUrl(a.storage_path, expiresIn);

        return {
          asset_type: a.asset_type,
          storage_path: a.storage_path,
          signed_url: data?.signedUrl ?? null,
          signed_url_error: error?.message ?? null,
        };
      })
    );

    return json(res, 200, {
      ok: true,
      insigne_id: insigne.id,
      status: insigne.status,
      motto_latin: insigne.motto_latin,
      assets: assetsWithUrls,
    });
  } catch (e: any) {
    return json(res, 500, { ok: false, error: "Unexpected error", details: e?.message ?? e });
  }
}
