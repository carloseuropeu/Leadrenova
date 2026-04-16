import type { Lead } from '@/lib/supabase'

const ANTHROPIC_API = '/api/prospect'
const MODEL = 'claude-sonnet-4-6'

// ── EMAIL FALLBACK ───────────────────────────────────────────────
function fallbackEmail(company: string): string {
  const slug = (company ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/['\s&()/.,]+/g, '')                     // remove common punctuation
    .replace(/[^a-z0-9-]/g, '')                        // keep alphanumeric + hyphens
    .replace(/-+/g, '-').replace(/^-|-$/g, '')         // trim hyphens
    .substring(0, 40) || 'contact'
  return `contact@${slug}.fr`
}

// ── PROSPECTION ─────────────────────────────────────────────────
export async function searchLeads(params: {
  zone: string
  targetType: string
  maxResults: number
  filters: string[]
}): Promise<Partial<Lead>[]> {

  const prompt = `Trouve ${params.maxResults} ${params.targetType} réels dans la zone ${params.zone}, France.
Filtres: ${params.filters.join(', ') || 'aucun'}.
IMPORTANT: Pour chaque entreprise, l'email du contact décideur est OBLIGATOIRE. Si tu ne connais pas l'email exact, génère un email professionnel plausible basé sur le nom de l'entreprise (ex: contact@nomEntreprise.fr).
Pour chaque résultat inclus: nom entreprise, adresse complète, ville, site web, contact décideur (nom, rôle, email, téléphone), taille équipe.
Score potentiel rénovation 0-100. Marque priority: true si score >= 75.
Réponds UNIQUEMENT en JSON valide sans markdown:
{"leads":[{"company":"Immobilier Martin","type":"Agence immobilière","contact_name":"Sophie Martin","contact_role":"Directrice","email":"contact@immobiliermartin.fr","phone":"01 23 45 67 89","website":"https://immobiliermartin.fr","address":"12 rue de la Paix","city":"Paris","employees":"5-10","renovation_score":85,"opportunity":"Portefeuille de 200 appartements anciens nécessitant rénovation énergétique","priority":true}]}`

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })
  })

  if (!res.ok) throw new Error(`API error ${res.status}`)
  const data = await res.json()
  const text = data.content?.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('') || ''

  try {
    const match = text.match(/\{[\s\S]*"leads"[\s\S]*\}/)
    const parsed = JSON.parse(match ? match[0] : text.replace(/```json|```/g, '').trim())
    const leads: Partial<Lead>[] = parsed.leads || []
    // Garantit qu'un email est toujours présent
    return leads.map(l => ({
      ...l,
      email: l.email || fallbackEmail(l.company ?? ''),
    }))
  } catch {
    return []
  }
}

// ── EMAIL IA ────────────────────────────────────────────────────
export async function generateEmail(lead: Partial<Lead>, profile: { full_name: string; metiers: string[]; zone_principale: string }): Promise<{ subject: string; body: string }> {

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      system: `Tu es ${profile.full_name}, artisan ${profile.metiers.join('/')} basé près de ${profile.zone_principale}.
Rédige des emails de prospection professionnels en français, courts (150-200 mots), directs et personnalisés.
Réponds UNIQUEMENT en JSON: {"subject":"...","body":"..."}`,
      messages: [{
        role: 'user',
        content: `Email pour: ${lead.company} | Contact: ${lead.contact_name || 'Directeur(trice)'} | Ville: ${lead.city} | Opportunité: ${lead.opportunity || 'rénovation'}`
      }]
    })
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error || `Send error ${res.status}`)
  }
  return res.json()
}

// ── DEVIS IA (Business plan) ─────────────────────────────────────
export async function generateDevis(lead: Partial<Lead>, notes: string): Promise<any> {
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      system: `Tu es un assistant de devis BTP français. Génère un devis structuré basé sur les notes de visite.
Réponds UNIQUEMENT en JSON: {"lignes":[{"description":"","quantite":1,"unite":"m²","prix_unitaire":45}],"notes_devis":""}`,
      messages: [{ role: 'user', content: `Notes de visite pour ${lead.company}: ${notes}` }]
    })
  })

  if (!res.ok) throw new Error(`API error ${res.status}`)
  const data = await res.json()
  const text = data.content?.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('') || ''
  try { return JSON.parse(text.replace(/```json|```/g, '').trim()) }
  catch { return { lignes: [], notes_devis: '' } }
}
