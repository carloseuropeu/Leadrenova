import type { Lead } from '@/lib/supabase'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-20250514'

// ── PROSPECTION ─────────────────────────────────────────────────
export async function searchLeads(params: {
  zone: string
  targetType: string
  maxResults: number
  filters: string[]
}): Promise<Partial<Lead>[]> {

  const prompt = `Utilise Vibe Prospecting pour trouver ${params.maxResults} ${params.targetType} dans la zone ${params.zone}, France.
Filtres: ${params.filters.join(', ') || 'aucun'}.
Pour chaque résultat inclus: nom entreprise, adresse, ville, site web, contact décideur (nom, rôle, email, téléphone), taille équipe.
Score potentiel rénovation 0-100. Marque priority: true si score >= 75.
Réponds UNIQUEMENT en JSON valide sans markdown:
{"leads":[{"company":"","type":"","contact_name":"","contact_role":"","email":"","phone":"","website":"","address":"","city":"","employees":"","renovation_score":85,"opportunity":"","priority":true}]}`

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
      mcp_servers: [{
        type: 'url',
        url: 'https://www.vibeprospecting.ai/product/claude',
        name: 'vibe-prospecting'
      }]
    })
  })

  if (!res.ok) throw new Error(`API error ${res.status}`)
  const data = await res.json()
  const text = data.content?.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('') || ''

  try {
    const match = text.match(/\{[\s\S]*"leads"[\s\S]*\}/)
    const parsed = JSON.parse(match ? match[0] : text.replace(/```json|```/g, '').trim())
    return parsed.leads || []
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

  const data = await res.json()
  const text = data.content?.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('') || ''
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim())
  } catch {
    return { subject: `Partenariat rénovation — ${lead.company}`, body: text }
  }
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

  const data = await res.json()
  const text = data.content?.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('') || ''
  try { return JSON.parse(text.replace(/```json|```/g, '').trim()) }
  catch { return { lignes: [], notes_devis: '' } }
}
