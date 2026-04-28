import { createClient } from '@supabase/supabase-js'

// Vercel Pro: 60s execution budget. On Hobby plan the default 10s limit applies.
export const config = { maxDuration: 60 }

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
    commune:           findCol(headers, ['NOM_COM', 'LIBELLE_COM', 'LIB_COM', 'COMMUNE', 'nom_com', 'libelle_commune']),
    code_postal:       findCol(headers, ['CP', 'CODE_POSTAL', 'COD_POSTAL', 'DEPCOM', 'DEP_COM', 'code_postal', 'cp']),
    departement:       findCol(headers, ['DEP', 'NUM_DEP', 'CODE_DEP', 'DEPARTEMENT', 'dep', 'departement']),
    type_travaux:      findCol(headers, ['TYPE_AUTORISATION', 'TYPE_DECIS', 'NATURE_PROJET', 'TYPE_TRAVAUX', 'TYP_CONST', 'type_autorisation', 'nature_travaux']),
    surface_m2:        findCol(headers, ['SURFACE', 'SHO', 'SHON', 'SURFACE_M2', 'SU_LOC', 'SURF_LOC', 'surface', 'surface_totale']),
    nom_petitionnaire: findCol(headers, ['NOM_MOA', 'RAISON_SOCIALE', 'NOM_PETITIONNAIRE', 'PETITIONNAIRE', 'nom_petitionnaire', 'demandeur']),
    date_autorisation: findCol(headers, ['DATE_AUTH', 'DATE_REAL', 'DATE_DECISION', 'DAT_AUTH', 'DATE_AUTORISATION', 'date_auth', 'date_real']),
    depcom:            findCol(headers, ['DEPCOM', 'DEP_COM', 'CODE_INSEE', 'INSEE', 'depcom', 'cod_dep_com']),
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


// ── MAIN HANDLER ─────────────────────────────────────────────────

export default async function handler(req, res) {
  // Auth desactivada temporariamente para testes

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant' })
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  // ── Optional reset: ?reset=true apaga todos os registos antes de importar
  if (req.query?.reset === 'true') {
    const { error: deleteError } = await supabase
      .from('permis_construire')
      .delete()
      .neq('id', 0)
    if (deleteError) {
      return res.status(500).json({ error: 'Reset failed: ' + deleteError.message })
    }
    console.log('[import-sitadel] Table reset — all records deleted')
  }

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
    // ── 1. Discover CSV URL via data.gouv.fr API ───────────────
    const datasetUrl = 'https://www.data.gouv.fr/api/1/datasets/liste-des-permis-de-construire-et-autres-autorisations-durbanisme/'
    const datasetRes = await fetch(datasetUrl)
    const dataset    = await datasetRes.json()
    const csvResource = dataset.resources?.find(r =>
      r.format?.toUpperCase() === 'CSV' ||
      r.mime?.includes('csv') ||
      r.url?.includes('.csv')
    )

    // Debug: se ainda não encontrar, retorna os recursos disponíveis
    if (!csvResource) {
      return res.status(500).json({
        error: 'CSV resource not found in dataset',
        available_resources: dataset.resources?.map(r => ({
          format: r.format,
          mime: r.mime,
          title: r.title,
          url: r.url?.substring(0, 80)
        }))
      })
    }
    const csvUrl = csvResource.url
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
        const clean   = line.replace(/^﻿/, '') // strip BOM
        sep           = detectSeparator(clean)
        const headers = parseCsvLine(clean, sep)
        col           = buildColMap(headers)
        headerDone    = true
        console.log('CSV headers found:', headers)
        return
      }

      lineCount++
      const cols = parseCsvLine(line, sep)
      if (lineCount === 1) console.log('First row sample:', cols)
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
