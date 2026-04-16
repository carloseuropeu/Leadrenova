import { useAuthStore } from '@/store/authStore'
import type { UserPlan } from '@/lib/supabase'

// Feature access matrix
const PLAN_FEATURES = {
  // Básico features
  prospection:        ['trial', 'basic', 'pro', 'business'],
  email_ia:           ['trial', 'basic', 'pro', 'business'],
  map_basic:          ['trial', 'basic', 'pro', 'business'],
  export_csv:         ['basic', 'pro', 'business'],

  // Pro features (preview in basic)
  map_full:           ['pro', 'business'],
  pipeline:           ['pro', 'business'],
  photos_chantier:    ['pro', 'business'],
  alerts_followup:    ['pro', 'business'],
  email_unlimited:    ['pro', 'business'],
  phone_reveal:       ['pro', 'business'],
  multi_region:       ['pro', 'business'],

  // Business features (preview in pro)
  devis_generator:    ['business'],
  factures:           ['business'],
  financial_dashboard:['business'],
} as const

export type Feature = keyof typeof PLAN_FEATURES

const ADMIN_EMAILS = ['mmotivacao36@gmail.com']

export function usePlan() {
  const { profile } = useAuthStore()
  const plan: UserPlan = profile?.plan ?? 'trial'

  const isAdmin = ADMIN_EMAILS.includes(profile?.email ?? '')

  // Check if trial has expired
  const isTrialExpired = !isAdmin && plan === 'trial' &&
    profile?.trial_ends_at ? new Date(profile.trial_ends_at) < new Date() : false

  const hasAccess = (feature: Feature): boolean => {
    if (isAdmin) return true
    if (isTrialExpired && plan === 'trial') return false
    return (PLAN_FEATURES[feature] as readonly string[]).includes(plan)
  }

  const canRevealEmail = (): boolean => {
    if (isAdmin) return true
    return (profile?.credits_remaining ?? 0) > 0
  }

  const trialDaysLeft = (): number => {
    if (!profile?.trial_ends_at) return 0
    const diff = new Date(profile.trial_ends_at).getTime() - Date.now()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  }

  const upgradeRequired = (feature: Feature): UserPlan => {
    const plans: UserPlan[] = ['trial', 'basic', 'pro', 'business']
    for (const p of plans) {
      if ((PLAN_FEATURES[feature] as readonly string[]).includes(p)) return p
    }
    return 'business'
  }

  return {
    plan,
    isAdmin,
    hasAccess,
    canRevealEmail,
    trialDaysLeft,
    upgradeRequired,
    isTrialExpired,
    creditsRemaining: profile?.credits_remaining ?? 0,
  }
}
