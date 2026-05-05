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

// ── GOOGLE PLACES ENRICHMENT ──────────────────────────────────────

async function lookupGooglePlaces(nom, commune, googleKey) {
  if (!googleKey) return null
  try {
    const query = [nom, commune, 'France'].filter(Boolean).join(' ')
    const url = new URL('https://maps.googleapis.com/maps/api/place/findplacefromtext/json')
    url.searchParams.set('input', query)
    url.searchParams.set('inputtype', 'textquery')
    url.searchParams.set('fields', 'name,formatted_phone_number,website,formatted_address')
    url.searchParams.set('key', googleKey)

    const r = await fetch(url.toString())
    if (!r.ok) return null
    const json = await r.json()
    if (json.status !== 'OK' || !json.candidates?.[0]) return null

    const place = json.candidates[0]
    return {
      phone:   place.formatted_phone_number || null,
      website: place.website               || null,
      address: place.formatted_address     || null,
      name:    place.name                  || null,
    }
  } catch {
    return null
  }
}

function emailFromWebsite(website) {
  try {
    const href = website.startsWith('http') ? website : `https://${website}`
    const hostname = new URL(href).hostname.replace(/^www\./, '')
    return `contact@${hostname}`
  } catch {
    return null
  }
}

// ── ENRICH HANDLER ────────────────────────────────────────────────

async function handleEnrichLeads(res, supabase, apiKey) {
  const BATCH     = 50
  const googleKey = process.env.VITE_GOOGLE_MAPS_KEY || ''

  // Fetch leads that still need phone enrichment (new column), with commune for Places query
  const { data: leads, error } = await supabase
    .from('permis_construire')
    .select('id, nom_petitionnaire, commune, email')
    .not('nom_petitionnaire', 'is', null)
    .is('phone', null)
    .limit(BATCH)

  if (error) {
    console.error('[enrich_leads] Query error:', error.message)
    return res.status(500).json({ error: error.message })
  }

  let enriched = 0
  for (let i = 0; i < leads.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 200)) // avoid Places rate-limit
    const lead   = leads[i]
    const update = {}

    // Step 1: Google Places → phone + website + domain email
    const places = await lookupGooglePlaces(lead.nom_petitionnaire, lead.commune, googleKey)
    if (places) {
      if (places.phone)   update.phone   = places.phone
      if (places.website) {
        update.site_web = places.website
        const domainEmail = emailFromWebsite(places.website)
        if (domainEmail) update.email = domainEmail
      }
    }

    // Step 2: If no email from Places website, derive by name (only when not already stored)
    if (!update.email && !lead.email) {
      const email = await deriveEmail(lead.nom_petitionnaire, apiKey)
      if (email) update.email = email
    }

    if (Object.keys(update).length === 0) continue

    const { error: updateError } = await supabase
      .from('permis_construire')
      .update(update)
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

  // Strip "Bearer " prefix and any surrounding whitespace from the token.
  const bearer = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim()

  // Parse body defensively: Vercel auto-parses JSON when Content-Type is set,
  // but a raw terminal call without Content-Type may leave req.body as a string or undefined.
  let parsedBody = req.body
  if (typeof parsedBody === 'string') {
    try { parsedBody = JSON.parse(parsedBody) } catch { parsedBody = {} }
  }
  parsedBody = parsedBody || {}

  // ── CRON path: enrich_leads uses CRON_SECRET, no Supabase session ──
  if (parsedBody.action === 'enrich_leads') {
    const cronSecret = (process.env.CRON_SECRET || '').trim()
    if (!cronSecret) {
      return res.status(401).json({ error: 'Unauthorized: CRON_SECRET not set on server' })
    }
    if (bearer !== cronSecret) {
      return res.status(401).json({ error: 'Unauthorized: invalid token' })
    }
    const supabase = createClient(
      process.env.SUPABASE_URL             || process.env.VITE_SUPABASE_URL      || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY      || '',
    )
    return handleEnrichLeads(res, supabase, process.env.ANTHROPIC_API_KEY || '')
  }

  // ── Standard path: Claude proxy uses Supabase session token ──────
  if (!bearer) return res.status(401).json({ error: 'Unauthorized' })

  const supabase = createClient(
    process.env.SUPABASE_URL      || process.env.VITE_SUPABASE_URL      || '',
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
  )
  const { data: { user }, error: authError } = await supabase.auth.getUser(bearer)
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[api/prospect] ANTHROPIC_API_KEY manquante dans les variables Vercel')
    return res.status(500).json({ error: 'Configuration serveur manquante : clé API introuvable.' })
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
