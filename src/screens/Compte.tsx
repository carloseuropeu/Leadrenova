import { useState } from 'react'
import {
  LogOut, MapPin, Bell, BellOff, ChevronRight,
  CreditCard, Zap, Star, Building2, Check
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { usePlan } from '@/hooks/usePlan'
import type { UserPlan } from '@/lib/supabase'

// ── Plan config ───────────────────────────────────────────────────
const PLANS: {
  id: UserPlan
  name: string
  price: string
  credits: string
  features: string[]
  color: string
  icon: React.ComponentType<any>
}[] = [
  {
    id: 'basic',
    name: 'Essentiel',
    price: '€29/mois',
    credits: '50 crédits/mois',
    features: ['Prospection IA', 'Email IA', 'Export CSV', '1 région'],
    color: 'text-text2',
    icon: Zap,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '€59/mois',
    credits: '200 crédits/mois',
    features: ['Tout Essentiel', 'Carte interactive', 'Pipeline chantiers', 'France entière', 'Photos'],
    color: 'text-green',
    icon: Star,
  },
  {
    id: 'business',
    name: 'Business',
    price: '€99/mois',
    credits: 'Crédits illimités',
    features: ['Tout Pro', 'Génération de devis IA', 'Facturation', 'Dashboard financier'],
    color: 'text-purple',
    icon: Building2,
  },
]

const PLAN_LABEL: Record<UserPlan, string> = {
  trial: 'Essai gratuit',
  basic: 'Essentiel',
  pro: 'Pro',
  business: 'Business',
}

const PLAN_BADGE: Record<UserPlan, string> = {
  trial:    'text-amber  bg-adim border-amber/20',
  basic:    'text-text2  bg-bg3  border-border',
  pro:      'text-green  bg-gdim border-green/20',
  business: 'text-purple bg-bdim border-purple/20',
}

const METIER_EMOJIS: Record<string, string> = {
  carreleur: '🪨', plombier: '🔧', peintre: '🖌️',
  electricien: '⚡', macon: '🏗️', menuisier: '🪵',
  couvreur: '🏠', chauffagiste: '🔥', plaquier: '🧱',
}

// ── Initials avatar ──────────────────────────────────────────────
function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map(w => w.charAt(0).toUpperCase())
    .join('')

  return (
    <div className="w-16 h-16 bg-gdim border-2 border-green/30 rounded-2xl flex items-center justify-center flex-shrink-0">
      <span className="font-display font-bold text-xl text-green">{initials || '?'}</span>
    </div>
  )
}

// ── Credit progress bar ──────────────────────────────────────────
function CreditBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0
  const low  = pct > 75
  return (
    <div>
      <div className="flex justify-between text-xs font-mono mb-2">
        <span className={low ? 'text-amber' : 'text-text2'}>
          {total - used} crédit{total - used !== 1 ? 's' : ''} restant{total - used !== 1 ? 's' : ''}
        </span>
        <span className="text-text3">{used} / {total}</span>
      </div>
      <div className="h-2 bg-bg3 border border-border rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${low ? 'bg-amber' : 'bg-green'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {low && (
        <p className="text-[11px] text-amber mt-1.5">
          Crédits presque épuisés — pense à upgrader
        </p>
      )}
    </div>
  )
}

// ── Main screen ───────────────────────────────────────────────────
export default function Compte() {
  const { profile, signOut, updateProfile } = useAuthStore()
  const { plan, trialDaysLeft, creditsRemaining } = usePlan()
  const days = trialDaysLeft()

  const [zone, setZone]           = useState(profile?.zone_principale ?? '')
  const [notifs, setNotifs]       = useState(true)
  const [savingZone, setSavingZone] = useState(false)
  const [showPlans, setShowPlans] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const creditsTotal = profile?.credits_monthly ?? 50
  const creditsUsed  = creditsTotal - creditsRemaining

  const handleSaveZone = async () => {
    if (!zone.trim()) return
    setSavingZone(true)
    await updateProfile({ zone_principale: zone.trim() })
    setSavingZone(false)
  }

  const handleSignOut = async () => {
    setLoggingOut(true)
    await signOut()
  }

  if (!profile) return null

  const isPro      = plan === 'pro' || plan === 'business'
  const isBusiness = plan === 'business'

  return (
    <div className="min-h-full bg-bg px-4 pt-6 pb-10 space-y-5">

      {/* Profile header */}
      <div className="bg-bg2 border border-border rounded-2xl p-5">
        <div className="flex items-start gap-4 mb-4">
          <Avatar name={profile.full_name} />
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-xl text-text leading-tight">{profile.full_name}</p>
            <p className="text-text2 text-sm mt-0.5 truncate">{profile.email}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`text-[11px] font-mono px-2.5 py-1 rounded-full border ${PLAN_BADGE[plan]}`}>
                {PLAN_LABEL[plan]}
              </span>
              {plan === 'trial' && days > 0 && (
                <span className="text-[11px] font-mono text-amber">
                  J-{days}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Métiers */}
        {profile.metiers?.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {profile.metiers.map(m => (
              <span key={m} className="flex items-center gap-1.5 text-xs font-mono text-text2 bg-bg3 border border-border rounded-full px-3 py-1">
                {METIER_EMOJIS[m] ?? '🔨'} {m.charAt(0).toUpperCase() + m.slice(1)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Plan & crédits */}
      <div className="bg-bg2 border border-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-mono text-text3 uppercase tracking-widest">Plan & crédits</p>
          <CreditCard size={14} className="text-text3" />
        </div>

        <CreditBar used={creditsUsed} total={creditsTotal} />

        {/* Upgrade / manage */}
        {plan === 'trial' || plan === 'basic' ? (
          <button
            onClick={() => setShowPlans(v => !v)}
            className="w-full bg-green text-bg font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-green2 transition-colors shadow-lg shadow-green/20"
          >
            <Zap size={15} />
            Passer au Pro — €59/mois
          </button>
        ) : (
          <button className="w-full bg-bg3 border border-border text-text font-medium py-3 rounded-xl text-sm flex items-center justify-center gap-2 hover:border-border2 transition-colors">
            <CreditCard size={15} />
            Gérer l'abonnement
          </button>
        )}

        {/* Plan info line */}
        <div className="flex items-center justify-between text-xs text-text3">
          <span>{PLAN_LABEL[plan]}</span>
          <span className="font-mono">
            {plan === 'trial' ? '14 jours offerts' :
             plan === 'basic' ? '€29/mois' :
             plan === 'pro'   ? '€59/mois' :
                                '€99/mois'}
          </span>
        </div>
      </div>

      {/* Plans comparison */}
      {showPlans && (
        <div className="space-y-3">
          <p className="text-[11px] font-mono text-text3 uppercase tracking-widest px-1">Changer de plan</p>
          {PLANS.map(p => {
            const Icon = p.icon
            const isCurrent = plan === p.id
            return (
              <div
                key={p.id}
                className={`bg-bg2 border rounded-2xl p-4 transition-colors ${
                  isCurrent ? 'border-green/30' : 'border-border'
                }`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    p.id === 'pro' ? 'bg-gdim border border-green/20' :
                    p.id === 'business' ? 'bg-bdim border border-purple/20' :
                    'bg-bg3 border border-border'
                  }`}>
                    <Icon size={16} className={p.color} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`font-display font-bold text-base ${p.color}`}>{p.name}</p>
                      {isCurrent && (
                        <span className="text-[9px] font-mono font-bold text-green bg-gdim border border-green/20 rounded-full px-1.5 py-0.5">
                          ACTUEL
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text3 font-mono">{p.price} · {p.credits}</p>
                  </div>
                </div>
                <ul className="space-y-1.5 mb-4">
                  {p.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-xs text-text2">
                      <Check size={11} className={p.color} />
                      {f}
                    </li>
                  ))}
                </ul>
                {!isCurrent && (
                  <button className={`w-full py-2.5 rounded-xl text-xs font-bold transition-colors ${
                    p.id === 'pro'
                      ? 'bg-green text-bg hover:bg-green2 shadow-md shadow-green/20'
                      : p.id === 'business'
                        ? 'bg-bdim border border-purple/20 text-purple hover:bg-purple/15'
                        : 'bg-bg3 border border-border text-text2 hover:border-border2'
                  }`}>
                    Choisir {p.name} →
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Preferences */}
      <div className="bg-bg2 border border-border rounded-2xl overflow-hidden">
        <p className="text-[11px] font-mono text-text3 uppercase tracking-widest px-5 pt-4 pb-3">Préférences</p>

        {/* Zone */}
        <div className="px-5 pb-4 space-y-2 border-b border-border">
          <label className="text-[11px] font-mono text-text3 uppercase tracking-wide block">Zone principale</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <MapPin size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text3" />
              <input
                type="text"
                value={zone}
                onChange={e => setZone(e.target.value)}
                onBlur={handleSaveZone}
                onKeyDown={e => e.key === 'Enter' && handleSaveZone()}
                placeholder="Paris, Lyon..."
                className="w-full bg-bg3 border border-border focus:border-green/50 rounded-xl pl-9 pr-4 py-2.5 text-sm text-text placeholder-text3 outline-none transition-colors"
              />
            </div>
            <button
              onClick={handleSaveZone}
              disabled={savingZone || !zone.trim()}
              className="bg-bg3 border border-border hover:border-border2 text-text2 text-xs font-mono px-3 rounded-xl transition-colors disabled:opacity-40"
            >
              {savingZone ? '...' : 'OK'}
            </button>
          </div>
          {profile.rayon_km && (
            <p className="text-[11px] text-text3 font-mono">Rayon : {profile.rayon_km} km</p>
          )}
        </div>

        {/* Notifications toggle */}
        <button
          onClick={() => setNotifs(v => !v)}
          className="w-full flex items-center gap-3 px-5 py-4 hover:bg-bg3 transition-colors"
        >
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
            notifs ? 'bg-gdim border border-green/20' : 'bg-bg3 border border-border'
          }`}>
            {notifs
              ? <Bell size={15} className="text-green" />
              : <BellOff size={15} className="text-text3" />}
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm text-text">Notifications</p>
            <p className="text-xs text-text2 mt-0.5">
              {notifs ? 'Alertes nouveaux chantiers activées' : 'Notifications désactivées'}
            </p>
          </div>
          <div className={`w-10 h-5.5 rounded-full transition-colors flex items-center px-0.5 ${
            notifs ? 'bg-green' : 'bg-bg4 border border-border'
          }`} style={{ height: 22 }}>
            <div className={`w-4 h-4 rounded-full bg-bg transition-transform ${
              notifs ? 'translate-x-4' : 'translate-x-0'
            }`} />
          </div>
        </button>

        {/* Account info row */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-border">
          <div className="w-9 h-9 bg-bg3 border border-border rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="text-text3 text-sm">📅</span>
          </div>
          <div className="flex-1">
            <p className="text-sm text-text">Membre depuis</p>
            <p className="text-xs text-text2">
              {new Date(profile.created_at).toLocaleDateString('fr-FR', {
                year: 'numeric', month: 'long', day: 'numeric'
              })}
            </p>
          </div>
          <ChevronRight size={14} className="text-text3" />
        </div>
      </div>

      {/* Feature highlights for current plan */}
      {(isPro || isBusiness) && (
        <div className="bg-gdim border border-green/20 rounded-2xl p-4">
          <p className="text-[11px] font-mono text-green uppercase tracking-widest mb-3">
            Fonctionnalités {PLAN_LABEL[plan]}
          </p>
          <div className="space-y-2">
            {(PLANS.find(p => p.id === plan) ?? PLANS[1]).features.map(f => (
              <div key={f} className="flex items-center gap-2 text-xs text-text2">
                <Check size={11} className="text-green flex-shrink-0" />
                {f}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Logout */}
      <button
        onClick={handleSignOut}
        disabled={loggingOut}
        className="w-full flex items-center justify-center gap-2 bg-bg2 border border-border hover:border-red/30 hover:bg-rdim text-text2 hover:text-red font-medium py-3.5 rounded-2xl text-sm transition-all disabled:opacity-50"
      >
        {loggingOut ? (
          <div className="w-4 h-4 border-2 border-text3 border-t-text2 rounded-full animate-spin" />
        ) : (
          <LogOut size={16} />
        )}
        {loggingOut ? 'Déconnexion...' : 'Se déconnecter'}
      </button>

      {/* App version */}
      <p className="text-center text-[11px] text-text3 font-mono">
        LeadRénov v1.0.0 · Fait avec ❤️ pour les artisans BTP
      </p>
    </div>
  )
}
