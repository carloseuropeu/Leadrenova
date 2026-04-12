import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check your .env file.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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

export interface Devis {
  id: string
  user_id: string
  lead_id: string
  numero: string
  montant_ht: number
  tva_rate: number
  montant_ttc: number
  statut: 'brouillon' | 'envoye' | 'accepte' | 'refuse'
  created_at: string
}
