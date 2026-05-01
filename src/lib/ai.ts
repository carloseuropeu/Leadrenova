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

// ── PROSPECTION IA ───────────────────────────────────────────────
export async function searchLeads(params: {
  zone: string
  targetType: string
  maxResults: number
  filters: string[]
}): Promise<Partial<Lead>[]> {

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      system: `Tu es un expert en prospection BTP français. Tu génères des leads réalistes pour des artisans.
Réponds UNIQUEMENT avec un tableau JSON valide (sans markdown) avec cette structure exacte :
[{"company":"Nom Entreprise","type":"Type","city":"Ville","address":"Adresse complète","contact_name":"Prénom Nom","contact_role":"Directeur","email":"contact@entreprise.fr","phone":"01 23 45 67 89","renovation_score":85,"opportunity":"Description de l'opportunité de rénovation","priority":true}]
- renovation_score : entier entre 40 et 98
- priority : true si score >= 75
- Noms, villes et adresses cohérents avec la région française demandée`,
      messages: [{
        role: 'user',
        content: `Génère exactement ${params.maxResults} leads de type "${params.targetType}" dans la zone "${params.zone}".${params.filters.length > 0 ? `\nFiltres actifs : ${params.filters.join(', ')}.` : ''}`,
      }],
    }),
  })

  if (!res.ok) throw new Error(`Erreur API ${res.status} — vérifie la clé ANTHROPIC_API_KEY sur Vercel`)
  const data = await res.json()
  const text: string = data.content?.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('') ?? ''

  try {
    const match = text.match(/\[[\s\S]*\]/)
    const leads = JSON.parse(match ? match[0] : text.replace(/```json|```/g, '').trim())
    return Array.isArray(leads) ? leads : []
  } catch {
    console.error('[searchLeads] Impossible de parser la réponse IA :', text)
    return []
  }
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
