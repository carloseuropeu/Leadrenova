import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL     as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!supabaseUrl || !supabaseAnonKey) {
  // Warn in console but never throw at module level — a module-level throw
  // crashes the entire React tree and produces a blank screen with no error message.
  console.error('[supabase] VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY manquant. Ajoute ces variables dans Vercel > Settings > Environment Variables.')
}

export const supabase = createClient(
  supabaseUrl     ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder-key',
)

// ── DATABASE TYPES ──────────────────────────────────────────────
export type UserPlan = 'trial' | 'basic' | 'pro' | 'business'

export type LeadStatus =
  | 'nouveau'
  | 'contacte'
  | 'visite'
  | 'devis_envoye'
  | 'confirme'
  | 'en_cours'
  | 'termine'
  | 'paye'
  | 'archive'

export interface Profile {
  id: string
  email: string
  full_name: string
  metiers: string[]
  zone_principale: string
  departement: string
  rayon_km: number
  plan: UserPlan
  trial_ends_at: string | null
  stripe_customer_id: string | null
  credits_remaining: number
  credits_monthly: number
  created_at: string
  // Facturation
  siret: string | null
  tva_number: string | null
  address: string | null
  is_micro_entreprise: boolean
}

export interface Lead {
  id: string
  user_id: string
  company: string
  type: string
  contact_name: string | null
  contact_role: string | null
  email: string | null
  email_revealed: boolean
  phone: string | null
  phone_revealed: boolean
  website: string | null
  address: string
  city: string
  lat: number | null
  lng: number | null
  employees: string | null
  renovation_score: number
  opportunity: string | null
  priority: boolean
  status: LeadStatus
  notes: string | null
  last_contact_at: string | null
  chantier_start: string | null
  chantier_end: string | null
  photos: string[]
  created_at: string
  updated_at: string
}

export interface GeneratedEmail {
  id: string
  user_id: string
  lead_id: string
  subject: string
  body: string
  created_at: string
}

export interface LigneDevis {
  id: string
  description: string
  quantite: number
  unite: string
  prix_unitaire_ht: number
  total_ht: number
}

export type DevisStatut = 'brouillon' | 'envoye' | 'accepte' | 'refuse'

export interface Devis {
  id: string
  user_id: string
  lead_id: string | null
  numero: string
  objet: string | null
  lignes: LigneDevis[]
  montant_ht: number
  tva_rate: number
  montant_tva: number
  montant_ttc: number
  statut: DevisStatut
  validite_jours: number
  notes: string | null
  sent_at: string | null
  accepted_at: string | null
  created_at: string
  updated_at: string
}

export type FactureStatut = 'brouillon' | 'envoyee' | 'payee' | 'retard' | 'annulee'

export interface Facture {
  id: string
  user_id: string
  lead_id: string | null
  devis_id: string | null
  numero: string
  objet: string | null
  lignes: LigneDevis[]
  montant_ht: number
  tva_rate: number
  montant_tva: number
  montant_ttc: number
  statut: FactureStatut
  date_emission: string
  date_echeance: string
  date_paiement: string | null
  notes: string | null
  sent_at: string | null
  created_at: string
  updated_at: string
}
