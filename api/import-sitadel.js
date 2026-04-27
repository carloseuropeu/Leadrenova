import { createClient } from '@supabase/supabase-js'

// Vercel Pro: 60s execution budget. On Hobby plan the default 10s limit applies.
export const config = { maxDuration: 60 }

const DATAGOUV_DATASET_ID = '55218fa4c751df0b3f494069'
const MAX_LINES  = 5000   // lines per cron run — full dataset covered incrementally over months
const BATCH_SIZE = 500

// ── CSV HELPERS ──────────────────────────────────────────────────

function detectSeparator(line) {
  return (line.match(/;/g) || []).length >= (line.match(/,/g) || []).length ? ';' : ','
}

function parseCsvLine(line, sep) {
  const result = []
  let current  = ''
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

function buildColMap(headers) {
  return {
    code_postal:       findCol(headers, ['code_postal', 'cp', 'codepostal', 'cod_postal']),
    commune:           findCol(headers, ['nom_com', 'libelle_commune', 'lib_com', 'commune']),
    departement:       findCol(headers, ['dep', 'departement', 'num_dep', 'code_dep']),
    type_travaux:      findCol(headers, ['type_autorisation', 'type_decis', 'nature_projet', 'type_travaux', 'nature_travaux']),
    surface_m2:        findCol(headers, ['surface', 'surface_m2', 'shon', 'surface_totale', 'surf_loc']),
    nom_petitionnaire: findCol(headers, ['nom_petitionnaire', 'petitionnaire', 'demandeur', 'nom_moa', 'raison_sociale']),
    date_autorisation: findCol(headers, ['date_auth', 'date_autorisation', 'dat_auth', 'date_decision', 'date_real']),
    depcom:            findCol(headers, ['depcom', 'code_insee', 'insee', 'cod_dep_com', 'dep_com']),
  }
}

function buildRecord(cols, col, importMonth) {
  let codePostal = col.code_postal >= 0 ? cols[col.code_postal] : null
  if (!codePostal && col.depcom >= 0) {
    codePostal = (cols[col.depcom] || '').padStart(5, '0').substring(0, 2)
  }

  const nomPetitionnaire = col.nom_petitionnaire >= 0 ? cols[col.nom_petitionnaire] : null
  if (!nomPetitionnaire) return null

  return {
    code_postal:       codePostal || null,
    commune:           col.commune           >= 0 ? cols[col.commune]           || null : null,
    departement:       col.departement       >= 0 ? cols[col.departement]       || null : null,
    type_travaux:      col.type_travaux      >= 0 ? cols[col.type_travaux]      || null : null,
    surface_m2:        col.surface_m2        >= 0 ? parseFloat(cols[col.surface_m2]) || null : null,
    nom_petitionnaire: nomPetitionnaire,
    date_autorisation: col.date_autorisation >= 0 ? cols[col.date_autorisation] || null : null,
    processed_month:   importMonth,
  }
}

// ── CSV DISCOVERY VIA DATA.GOUV.FR ───────────────────────────────

async function discoverCsvUrl() {
  if (process.env.SITADEL_CSV_URL) return process.env.SITADEL_CSV_URL

  const apiUrl = `https://www.data.gouv.fr/api/1/datasets/${DATAGOUV_DATASET_ID}/`
  const res = await fetch(apiUrl, {
    headers: { 'User-Agent': 'LeadRenov/1.0 (import bot)' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`data.gouv.fr API HTTP ${res.status}`)

  const dataset   = await res.json()
  const resources = (dataset.resources || [])
    .filter(r => (r.format || '').toLowerCase() === 'csv')
    .sort((a, b) => new Date(b.last_modified || 0) - new Date(a.last_modified || 0))

  if (!resources.length) throw new Error('Aucun resource CSV dans le dataset data.gouv.fr 55218fa4c751df0b3f494069')
  return resources[0].url
}

// ── MAIN HANDLER ─────────────────────────────────────────────────

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers['authorization'] || ''

  // Debug: log para ver o que chega
  console.log('CRON_SECRET exists:', !!cronSecret)
  console.log('Auth header received:', authHeader)
  console.log('Expected:', `Bearer ${cronSecret}`)
  console.log('Match:', authHeader === `Bearer ${cronSecret}`)

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({
      error: 'Unauthorized',
      debug_secret_exists: !!cronSecret,
      debug_header_received: authHeader,
      debug_expected: `Bearer ${cronSecret}`
    })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant' })
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  // ── Guard: skip if this month was already imported ─────────────
  const now         = new Date()
  const importMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const { count } = await supabase
    .from('permis_construire')
    .select('id', { count: 'exact', head: true })
    .eq('processed_month', importMonth)

  if (count && count > 0) {
    console.log(`[import-sitadel] ${importMonth} déjà importé (${count} enregistrements)`)
    return res.status(200).json({
      success: true,
      skipped: true,
      reason: `Mois ${importMonth} déjà importé (${count} lignes)`,
    })
  }

  try {
    // ── 1. Discover CSV URL ────────────────────────────────────
    console.log('[import-sitadel] Discovering CSV URL...')
    const csvUrl = await discoverCsvUrl()
    console.log('[import-sitadel] Streaming from:', csvUrl)

    const csvRes = await fetch(csvUrl, {
      headers: { 'User-Agent': 'LeadRenov/1.0 (import bot)' },
    })
    if (!csvRes.ok) throw new Error(`CSV download HTTP ${csvRes.status}`)
    if (!csvRes.body) throw new Error('Response body null — streaming indisponível')

    // ── 2. Stream & parse CSV line-by-line ────────────────────
    const reader  = csvRes.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer    = ''
    let col        = null
    let sep        = null
    let headerDone = false
    let batch      = []
    let inserted   = 0
    let skipped    = 0
    let lineCount  = 0
    let truncated  = false

    const flushBatch = async () => {
      if (!batch.length) return
      const { error } = await supabase
        .from('permis_construire')
        .upsert(batch, { onConflict: 'nom_petitionnaire,date_autorisation,commune', ignoreDuplicates: true })
      if (error) console.error('[import-sitadel] upsert error:', error.message)
      else inserted += batch.length
      batch = []
    }

    const processLine = async (raw) => {
      const line = raw.replace(/\r$/, '')
      if (!line.trim()) return

      if (!headerDone) {
        const clean = line.replace(/^﻿/, '') // strip BOM
        sep        = detectSeparator(clean)
        col        = buildColMap(parseCsvLine(clean, sep))
        headerDone = true
        return
      }

      lineCount++
      const cols   = parseCsvLine(line, sep)
      if (cols.length < 3) { skipped++; return }

      const record = buildRecord(cols, col, importMonth)
      if (!record) { skipped++; return }

      batch.push(record)
      if (batch.length >= BATCH_SIZE) await flushBatch()
    }

    let streamDone = false
    while (!streamDone) {
      const { done, value } = await reader.read()
      if (done) { streamDone = true; break }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (lineCount >= MAX_LINES) {
          truncated = true
          await reader.cancel()
          streamDone = true
          break
        }
        await processLine(line)
      }
    }

    // Process final buffered fragment
    if (buffer.trim() && !truncated && headerDone && lineCount < MAX_LINES) {
      await processLine(buffer)
    }

    await flushBatch()

    console.log(`[import-sitadel] ${importMonth} — inserted: ${inserted}, skipped: ${skipped}, lines: ${lineCount}, truncated: ${truncated}`)
    return res.status(200).json({
      success: true, inserted, skipped, lines: lineCount, truncated, month: importMonth,
    })

  } catch (err) {
    console.error('[import-sitadel] Fatal error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
