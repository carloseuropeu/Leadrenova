import { createClient } from '@supabase/supabase-js'

// ── EMAIL ENRICHMENT HELPERS ──────────────────────────────────────

function extractMairieEmail(nom) {
  const m = nom.match(/^(?:COMMUNE|MAIRIE)\s+DE\s+(.+)$/i)
  if (!m) return null
  const commune = m[1].trim().toLowerCase().replace(/\s+/g, '')
  return `mairie@${commune}.fr`
}

const COMPANY_PATTERN = /\b(SCI|SARL|SAS|SA|HABITAT|OFFICE)\b/i

async function lookupCompanyEmail(nom) {
  try {
    const url = `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(nom)}&limit=1`
    const r = await fetch(url, { headers: { 'User-Agent': 'LeadRenov/1.0' } })
    if (!r.ok) return null
    const json = await r.json()
    const site = json.results?.[0]?.siege?.site_internet
    if (!site) return null
    const href = site.startsWith('http') ? site : `https://${site}`
    const hostname = new URL(href).hostname.replace(/^www\./, '')
    return `contact@${hostname}`
  } catch {
    return null
  }
}

async function generateEmailWithAI(nom, apiKey) {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 60,
        messages: [{
          role: 'user',
          content: `Génère l'email de contact professionnel le plus probable pour "${nom}" (entreprise ou personne française). Réponds UNIQUEMENT avec l'adresse email, sans texte supplémentaire.`,
        }],
      }),
    })
    if (!r.ok) return null
    const json = await r.json()
    return json.content?.[0]?.text?.trim() || null
  } catch {
    return null
  }
}

async function deriveEmail(nom, apiKey) {
  // 1. Commune / Mairie
  const mairieEmail = extractMairieEmail(nom)
  if (mairieEmail) return mairieEmail

  // 2. Société (SCI, SARL, SAS, SA, HABITAT, OFFICE) → API d'entreprises
  if (COMPANY_PATTERN.test(nom)) {
    const companyEmail = await lookupCompanyEmail(nom)
    if (companyEmail) return companyEmail
    // If no site found, fall through to AI
  }

  // 3. Fallback: IA génère un email probable
  return generateEmailWithAI(nom, apiKey)
}

async function handleEnrichLeads(res, supabase, apiKey) {
  const BATCH = 50

  const { data: leads, error } = await supabase
    .from('permis_construire')
    .select('id, nom_petitionnaire')
    .not('nom_petitionnaire', 'is', null)
    .is('email', null)
    .limit(BATCH)

  if (error) {
    console.error('[enrich_leads] Query error:', error.message)
    return res.status(500).json({ error: error.message })
  }

  let enriched = 0
  for (const lead of leads) {
    const email = await deriveEmail(lead.nom_petitionnaire, apiKey)
    if (!email) continue

    const { error: updateError } = await supabase
      .from('permis_construire')
      .update({ email })
      .eq('id', lead.id)

    if (updateError) {
      console.error('[enrich_leads] Update error for id', lead.id, updateError.message)
    } else {
      enriched++
    }
  }

  console.log(`[enrich_leads] processed=${leads.length} enriched=${enriched}`)
  return res.status(200).json({ success: true, processed: leads.length, enriched })
}

// ── MAIN HANDLER ─────────────────────────────────────────────────

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

  // ── Email enrichment for permis_construire leads ──────────────
  if (req.body?.action === 'enrich_leads') {
    return handleEnrichLeads(res, supabase, apiKey)
  }

  // ── Existing: Claude API proxy (unchanged) ────────────────────
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
