import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const { id } = req.query

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing insigne id' })
  }

  // 1. Fetch insigne
  const { data: insigne, error: insigneError } = await supabase
    .from('insignes')
    .select('*')
    .eq('id', id)
    .single()

  if (insigneError || !insigne) {
    return res.status(404).json({
      ok: false,
      error: 'Insigne not found'
    })
  }

  // 2. Fetch assets
  const { data: assets, error: assetsError } = await supabase
    .from('assets')
    .select('*')
    .eq('insigne_id', id)

  if (assetsError) {
    return res.status(500).json({
      ok: false,
      error: 'Failed to load assets'
    })
  }

  // 3. Generate signed URLs
  const signedAssets = await Promise.all(
    assets.map(async (asset) => {
      const { data, error } = await supabase.storage
        .from('insignes')
        .createSignedUrl(asset.storage_path, 60 * 60) // 1 hour

      return {
        asset_type: asset.asset_type,
        signed_url: data?.signedUrl || null
      }
    })
  )

  // 4. Respond
  return res.status(200).json({
    ok: true,
    insigne_id: insigne.id,
    status: insigne.status,
    motto_latin: insigne.motto_latin,
    assets: signedAssets
  })
}
