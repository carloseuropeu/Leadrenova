import { createClient } from '@supabase/supabase-js'

const SITADEL_PORTAL_URL =
  'https://www.statistiques.developpement-durable.gouv.fr/liste-des-permis-de-construire-et-autres-autorisations-durbanisme'

// ── CSV HELPERS ──────────────────────────────────────────────────

function detectSeparator(line) {
  const semicolons = (line.match(/;/g) || []).length
  const commas = (line.match(/,/g) || []).length
  return semicolons >= commas ? ';' : ','
}

function parseCsvLine(line, sep) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === sep && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ''))
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim().replace(/^"|"$/g, ''))
  return result
}

function findCol(headers, candidates) {
  const lower = headers.map(h => h.toLowerCase().trim().replace(/["\r]/g, ''))
  for (const c of candidates) {
    const idx = lower.indexOf(c.toLowerCase())
    if (idx !== -1) return idx
  }
  return -1
}

// ── CSV DISCOVERY ────────────────────────────────────────────────

async function discoverCsvUrl() {
  // Env var override takes priority
  if (process.env.SITADEL_CSV_URL) return process.env.SITADEL_CSV_URL

  const pageRes = await fetch(SITADEL_PORTAL_URL, {
    headers: { 'User-Agent': 'LeadRenov/1.0 (import bot)' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!pageRes.ok) throw new Error(`Portal page HTTP ${pageRes.status}`)

  const html = await pageRes.text()

  // Look for any href ending in .csv (portal uses relative /sites/default/files/... paths)
  const csvLinks = [...html.matchAll(/href="([^"]*\.csv[^"]*)"/gi)]
    .map(m => m[1])
    .filter(href => /sitadel/i.test(href))

  if (!csvLinks.length) throw new Error('No SITADEL CSV links found on portal page')

  const href = csvLinks[0]
  if (href.startsWith('http')) return href

  const origin = new URL(SITADEL_PORTAL_URL).origin
  return `${origin}${href.startsWith('/') ? '' : '/'}${href}`
}

// ── MAIN HANDLER ─────────────────────────────────────────────────

export default async function handler(req, res) {
  const authHeader = req.headers['authorization'] || ''
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant' })
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  try {
    // ── 1. Discover & download CSV ─────────────────────────────
    console.log('[import-sitadel] Discovering CSV URL...')
    const csvUrl = await discoverCsvUrl()
    console.log('[import-sitadel] Downloading:', csvUrl)

    const csvRes = await fetch(csvUrl, {
      headers: { 'User-Agent': 'LeadRenov/1.0 (import bot)' },
      signal: AbortSignal.timeout(60_000),
    })
    if (!csvRes.ok) throw new Error(`CSV download HTTP ${csvRes.status} — ${csvUrl}`)

    // Strip BOM and normalise line endings
    const raw = await csvRes.text()
    const csvText = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')

    // ── 2. Parse CSV ───────────────────────────────────────────
    const lines = csvText.split('\n').filter(l => l.trim())
    if (lines.length < 2) return res.status(422).json({ error: 'CSV vide ou format invalide' })

    const sep     = detectSeparator(lines[0])
    const headers = parseCsvLine(lines[0], sep)

    // Map columns — SITADEL columns vary by vintage; list multiple candidates
    const col = {
      code_postal:       findCol(headers, ['code_postal', 'cp', 'codepostal', 'cod_postal']),
      commune:           findCol(headers, ['nom_com', 'libelle_commune', 'lib_com', 'commune']),
      departement:       findCol(headers, ['dep', 'departement', 'num_dep', 'code_dep']),
      type_travaux:      findCol(headers, ['type_autorisation', 'type_decis', 'nature_projet', 'type_travaux', 'nature_travaux']),
      surface_m2:        findCol(headers, ['surface', 'surface_m2', 'shon', 'surface_totale', 'surf_loc']),
      nom_petitionnaire: findCol(headers, ['nom_petitionnaire', 'petitionnaire', 'demandeur', 'nom_moa', 'raison_sociale']),
      date_autorisation: findCol(headers, ['date_auth', 'date_autorisation', 'dat_auth', 'date_decision', 'date_real']),
      depcom:            findCol(headers, ['depcom', 'code_insee', 'insee', 'cod_dep_com', 'dep_com']),
    }

    // ── 3. Build records & batch-insert ───────────────────────
    const BATCH = 200
    let batch    = []
    let inserted = 0
    let skipped  = 0

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i], sep)
      if (cols.length < 3) { skipped++; continue }

      // Derive postal code from INSEE depcom when not directly present
      let codePostal = col.code_postal >= 0 ? cols[col.code_postal] : null
      if (!codePostal && col.depcom >= 0) {
        const depcom = (cols[col.depcom] || '').padStart(5, '0')
        // INSEE 75056 → dept 75, rest of France 2-char dept code
        codePostal = depcom.substring(0, 2)
      }

      const nomPetitionnaire = col.nom_petitionnaire >= 0 ? cols[col.nom_petitionnaire] : null
      if (!nomPetitionnaire) { skipped++; continue }

      const record = {
        code_postal:       codePostal       || null,
        commune:           col.commune           >= 0 ? cols[col.commune]           || null : null,
        departement:       col.departement       >= 0 ? cols[col.departement]       || null : null,
        type_travaux:      col.type_travaux      >= 0 ? cols[col.type_travaux]      || null : null,
        surface_m2:        col.surface_m2        >= 0 ? parseFloat(cols[col.surface_m2]) || null : null,
        nom_petitionnaire: nomPetitionnaire,
        date_autorisation: col.date_autorisation >= 0 ? cols[col.date_autorisation] || null : null,
      }

      batch.push(record)

      if (batch.length >= BATCH) {
        const { error } = await supabase
          .from('permis_construire')
          .upsert(batch, { onConflict: 'nom_petitionnaire,date_autorisation,commune', ignoreDuplicates: true })
        if (error) console.error('[import-sitadel] upsert error:', error.message)
        else inserted += batch.length
        batch = []
      }
    }

    // Flush remaining records
    if (batch.length > 0) {
      const { error } = await supabase
        .from('permis_construire')
        .upsert(batch, { onConflict: 'nom_petitionnaire,date_autorisation,commune', ignoreDuplicates: true })
      if (error) console.error('[import-sitadel] final upsert error:', error.message)
      else inserted += batch.length
    }

    console.log(`[import-sitadel] Done — inserted: ${inserted}, skipped: ${skipped}, total lines: ${lines.length - 1}`)
    return res.status(200).json({ success: true, inserted, skipped, total: lines.length - 1, source: csvUrl })

  } catch (err) {
    console.error('[import-sitadel] Fatal error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
