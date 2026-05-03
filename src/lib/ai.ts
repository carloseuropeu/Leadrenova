import type { Lead, LigneDevis } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'

const ANTHROPIC_API = '/api/prospect'
const MODEL = 'claude-sonnet-4-6'

// ── AUTH HEADERS ─────────────────────────────────────────────────
async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }
  return headers
}

// ── HELPERS: SITADEL → LEADS ─────────────────────────────────────

function fallbackEmail(company: string): string {
  const slug = (company ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['\s&()/.,]+/g, '')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-').replace(/^-|-$/g, '')
    .substring(0, 40) || 'contact'
  return `contact@${slug}.fr`
}

function extractCodePostal(zone: string): string | null {
  return zone.match(/\b\d{5}\b/)?.[0] ?? zone.match(/\b\d{2,3}\b/)?.[0] ?? null
}

function extractCommune(zone: string): string | null {
  const word = zone.replace(/\b\d{2,5}\b/g, '').trim().split(/[\s,]+/).find(w => w.length > 2)
  return word ?? null
}

function scoreFromPermit(permit: Record<string, unknown>): number {
  let score = 60
  const surface = Number(permit.surface_m2) || 0
  const type    = String(permit.type_travaux || '').toLowerCase()
  if (surface > 100) score += 10
  if (surface > 500) score += 10
  if (type.includes('rénovation') || type.includes('renovation')) score += 15
  if (type.includes('extension')  || type.includes('réhabilitation')) score += 10
  return Math.min(score, 100)
}

async function enrichWithRechercheAPI(nom: string, departement: string): Promise<Partial<Lead>> {
  const controller = new AbortController()
  const timeoutId  = setTimeout(() => controller.abort(), 5000)
  try {
    const url = `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(nom)}&departement=${departement}&per_page=1`
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return {}
    const data = await res.json()
    const r    = data.results?.[0]
    if (!r) return {}
    const dirigeant = r.dirigeants?.[0]
    return {
      company:      r.nom_complet || nom,
      address:      r.siege?.adresse || '',
      city:         r.siege?.libelle_commune || '',
      email:        r.siege?.email || undefined,
      contact_name: dirigeant
        ? `${dirigeant.prenom || ''} ${dirigeant.nom || ''}`.trim() || undefined
        : undefined,
      contact_role: dirigeant?.qualite || 'Dirigeant',
      type:         r.activite_principale_libelle || undefined,
    }
  } catch {
    return {}
  } finally {
    clearTimeout(timeoutId)
  }
}

// Sequential enrichment with 100 ms delay to avoid API rate-limiting.
// Priority for email: pre-enriched permit.email → recherche-entreprises → fallback slug.
async function enrichSequential(
  permits: Record<string, unknown>[],
  codePostal: string,
): Promise<Partial<Lead>[]> {
  const results: Partial<Lead>[] = []
  for (let i = 0; i < permits.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 100))
    const permit = permits[i]
    const dep    = String(permit.departement || codePostal.substring(0, 2))
    const extra  = await enrichWithRechercheAPI(String(permit.nom_petitionnaire || ''), dep)

    const surface = permit.surface_m2 ? ` pour ${permit.surface_m2} m²` : ''
    const date    = permit.date_autorisation ? ` le ${permit.date_autorisation}` : ''
    const score   = scoreFromPermit(permit)

    // Use the email already stored by the batch enrichment (api/prospect enrich_leads action)
    // if available; otherwise fall back to the real-time API lookup or the slug fallback.
    const email =
      (permit.email ? String(permit.email) : null) ||
      extra.email ||
      fallbackEmail(String(permit.nom_petitionnaire || ''))

    results.push({
      company:          extra.company      || String(permit.nom_petitionnaire || 'Entreprise'),
      type:             extra.type         || String(permit.type_travaux || 'Construction'),
      address:          extra.address      || '',
      city:             extra.city         || String(permit.commune || ''),
      email,
      contact_name:     extra.contact_name || undefined,
      contact_role:     extra.contact_role || 'Dirigeant',
      opportunity:      `Permis de construire accordé${date}${surface}`,
      renovation_score: score,
      priority:         score >= 75,
    } as Partial<Lead>)
  }
  return results
}

// ── PROSPECTION: SITADEL → RECHERCHE ENTREPRISES ─────────────────
export async function searchLeads(params: {
  zone: string
  targetType: string
  maxResults: number
  filters: string[]
}): Promise<Partial<Lead>[]> {

  const codePostal = extractCodePostal(params.zone)
  const commune    = extractCommune(params.zone)

  let permits: Record<string, unknown>[] = []

  // Step 1 — query by code_postal
  if (codePostal) {
    const { data } = await supabase
      .from('permis_construire')
      .select('*')
      .eq('code_postal', codePostal)
      .order('date_autorisation', { ascending: false })
      .limit(params.maxResults * 2)
    if (data?.length) permits = data
  }

  // Step 2 — supplement with commune ilike if still not enough results
  if (permits.length < params.maxResults && commune) {
    const existing = new Set(permits.map((p: any) => p.id))
    const { data } = await supabase
      .from('permis_construire')
      .select('*')
      .ilike('commune', `%${commune}%`)
      .order('date_autorisation', { ascending: false })
      .limit(params.maxResults * 2)
    if (data) permits = [...permits, ...data.filter((p: any) => !existing.has(p.id))]
  }

  // No real data found — return empty rather than inventing leads
  if (permits.length === 0) return []

  // Step 3 — enrich with recherche-entreprises API (real-time, sequential)
  return enrichSequential(permits.slice(0, params.maxResults), codePostal ?? '')
}

// ── EMAIL IA ────────────────────────────────────────────────────
export async function generateEmail(
  lead: Partial<Lead>,
  profile: { full_name: string; metiers: string[]; zone_principale: string },
): Promise<{ subject: string; body: string }> {

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      system: `Tu es ${profile.full_name}, artisan ${profile.metiers.join('/')} basé près de ${profile.zone_principale}.
Rédige des emails de prospection professionnels en français, courts (150-200 mots), directs et personnalisés.
Réponds UNIQUEMENT en JSON: {"subject":"...","body":"..."}`,
      messages: [{
        role: 'user',
        content: `Email pour: ${lead.company} | Contact: ${lead.contact_name || 'Directeur(trice)'} | Ville: ${lead.city} | Opportunité: ${lead.opportunity || 'rénovation'}`,
      }],
    }),
  })

  if (!res.ok) throw new Error(`API error ${res.status}`)
  const data = await res.json()
  const text = data.content?.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('') || ''
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim())
  } catch {
    return { subject: `Partenariat rénovation — ${lead.company}`, body: text }
  }
}

// ── SEND EMAIL (Resend) ─────────────────────────────────────────
export async function sendEmail(params: {
  to: string
  subject: string
  body: string
  fromName?: string
}): Promise<{ id: string }> {
  const res = await fetch('/api/send-email', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error || `Send error ${res.status}`)
  }
  return res.json()
}

// ── DEVIS IA (Pro/Business plan) ────────────────────────────────
export async function generateDevis(
  lead: Partial<Lead>,
  visitNotes: string,
  tvaRate = 20,
): Promise<{
  lignes: LigneDevis[]
  montant_ht: number
  montant_tva: number
  montant_ttc: number
  notes: string | null
}> {
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: `Tu es un expert en chiffrage BTP français. Génère un devis détaillé basé sur les notes de visite.
Chaque ligne doit avoir une description précise, une quantité réaliste, une unité standard (m², ml, u, forfait, heure) et un prix unitaire HT en euros cohérent avec le marché français.
Réponds UNIQUEMENT en JSON valide sans markdown :
{"lignes":[{"description":"Dépose ancien carrelage","quantite":25,"unite":"m²","prix_unitaire_ht":8.50},{"description":"Fourniture et pose carrelage 60x60","quantite":25,"unite":"m²","prix_unitaire_ht":45.00}],"notes_techniques":"Prévoir protection des sols existants. Délai estimé : 3 jours."}`,
      messages: [{
        role: 'user',
        content: `Entreprise : ${lead.company ?? 'Client'}\nVille : ${lead.city ?? ''}\nNotes de visite : ${visitNotes}`,
      }],
    }),
  })

  if (!res.ok) throw new Error(`API error ${res.status}`)
  const data = await res.json()
  const text: string = data.content?.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('') ?? ''

  let raw: { lignes: { description: string; quantite: number; unite: string; prix_unitaire_ht: number }[]; notes_techniques?: string }
  try {
    const match = text.match(/\{[\s\S]*"lignes"[\s\S]*\}/)
    raw = JSON.parse(match ? match[0] : text.replace(/```json|```/g, '').trim())
  } catch {
    return { lignes: [], montant_ht: 0, montant_tva: 0, montant_ttc: 0, notes: null }
  }

  const lignes: LigneDevis[] = (raw.lignes ?? []).map((l, i) => ({
    id:               String(i + 1),
    description:      l.description      ?? '',
    quantite:         Number(l.quantite)  || 0,
    unite:            l.unite             ?? 'u',
    prix_unitaire_ht: Number(l.prix_unitaire_ht) || 0,
    total_ht:         Math.round(Number(l.quantite) * Number(l.prix_unitaire_ht) * 100) / 100,
  }))

  const montant_ht  = Math.round(lignes.reduce((s, l) => s + l.total_ht, 0) * 100) / 100
  const montant_tva = Math.round(montant_ht * tvaRate / 100 * 100) / 100
  const montant_ttc = Math.round((montant_ht + montant_tva) * 100) / 100

  return { lignes, montant_ht, montant_tva, montant_ttc, notes: raw.notes_techniques ?? null }
}
