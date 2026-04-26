import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Validate Supabase session token
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const supabase = createClient(
    process.env.SUPABASE_URL      || process.env.VITE_SUPABASE_URL      || '',
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
  )
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[api/prospect] ANTHROPIC_API_KEY manquante dans les variables Vercel')
    return res.status(500).json({ error: 'Configuration serveur manquante : clé API introuvable.' })
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('[api/prospect] Erreur Anthropic', response.status, data)
      return res.status(response.status).json({
        error: data?.error?.message || `Anthropic API error ${response.status}`,
      })
    }

    return res.status(200).json(data)
  } catch (error) {
    console.error('[api/prospect] Exception réseau :', error.message)
    return res.status(500).json({ error: error.message })
  }
}
