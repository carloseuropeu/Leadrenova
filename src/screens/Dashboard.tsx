import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Plus, TrendingUp, Mail, Building2,
  MessageSquare, ArrowRight, AlertTriangle, Euro, Clock, BarChart2,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { usePlan } from '@/hooks/usePlan'
import LockedFeature from '@/components/ui/LockedFeature'
import { supabase } from '@/lib/supabase'
import type { Lead, LeadStatus, Devis, Facture } from '@/lib/supabase'

// ── SVG bar chart (no dependency) ────────────────────────────────
function MonthlyChart({ months }: { months: { label: string; value: number }[] }) {
  const max    = Math.max(...months.map(m => m.value), 1)
  const BAR_W  = 28
  const GAP    = 6
  const H      = 56
  const W      = months.length * (BAR_W + GAP) - GAP
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full" preserveAspectRatio="none">
      {months.map((m, i) => {
        const barH = m.value > 0 ? Math.max((m.value / max) * H, 4) : 3
        const x    = i * (BAR_W + GAP)
        return (
          <g key={i}>
            <rect x={x} y={H - barH} width={BAR_W} height={barH} rx={3}
              fill={m.value > 0 ? '#4ade80' : '#1e2e1e'} />
            <text x={x + BAR_W / 2} y={H + 13} textAnchor="middle" fontSize="7.5" fill="#7a917a">
              {m.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Status config ────────────────────────────────────────────────
const STATUS_CFG: Record<LeadStatus, { label: string; cls: string }> = {
  nouveau:      { label: 'Nouveau',      cls: 'text-blue   bg-bdim border-blue/20'   },
  contacte:     { label: 'Contacté',     cls: 'text-amber  bg-adim border-amber/20'  },
  visite:       { label: 'Visite',       cls: 'text-purple bg-bdim border-purple/20' },
  devis_envoye: { label: 'Devis envoyé', cls: 'text-green  bg-gdim border-green/20'  },
  confirme:     { label: 'Confirmé',     cls: 'text-green  bg-gdim border-green/20'  },
  en_cours:     { label: 'En cours',     cls: 'text-green  bg-gdim border-green/20'  },
  termine:      { label: 'Terminé',      cls: 'text-text2  bg-bg3  border-border'    },
  paye:         { label: 'Payé',         cls: 'text-green  bg-gdim border-green/20'  },
  archive:      { label: 'Archivé',      cls: 'text-text3  bg-bg3  border-border'    },
}

function ScoreDot({ score }: { score: number }) {
  const cls = score >= 80 ? 'text-green bg-gdim border-green/20'
    : score >= 60         ? 'text-amber bg-adim border-amber/20'
    :                       'text-red   bg-rdim border-red/20'
  return (
    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${cls}`}>
      {score}
    </span>
  )
}

// ── Plan badge ───────────────────────────────────────────────────
const PLAN_BADGE: Record<string, string> = {
  trial:    'text-amber  bg-adim border-amber/20',
  basic:    'text-text2  bg-bg3  border-border',
  pro:      'text-green  bg-gdim border-green/20',
  business: 'text-purple bg-bdim border-purple/20',
}
const PLAN_LABEL: Record<string, string> = {
  trial: 'Essai gratuit', basic: 'Essentiel', pro: 'Pro', business: 'Business',
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { profile } = useAuthStore()
  const { plan, trialDaysLeft, creditsRemaining } = usePlan()
  const days = trialDaysLeft()

  // Fetch all leads for this user
  const { data: leads = [] } = useQuery<Lead[]>({
    queryKey: ['leads', profile?.id],
    enabled: !!profile?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('leads')
        .select('*')
        .eq('user_id', profile!.id)
        .order('created_at', { ascending: false })
      return (data ?? []) as Lead[]
    },
  })

  // Metrics
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const leadsThisMonth  = leads.filter(l => new Date(l.created_at) >= startOfMonth).length
  const emailsGenerated = leads.filter(l => l.email_revealed).length
  const agenciesContact = leads.filter(l => l.status !== 'nouveau').length
  const enDiscussion    = leads.filter(l =>
    (['contacte', 'visite', 'devis_envoye'] as LeadStatus[]).includes(l.status)
  ).length

  // Fetch devis + factures for Finances section
  const { data: devisList = [] } = useQuery<Devis[]>({
    queryKey: ['devis', profile?.id],
    enabled:  !!profile?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('devis').select('id,statut,montant_ttc,created_at').eq('user_id', profile!.id)
      return (data ?? []) as Devis[]
    },
  })

  const { data: facturesList = [] } = useQuery<Facture[]>({
    queryKey: ['factures', profile?.id],
    enabled:  !!profile?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('factures').select('id,statut,montant_ttc,date_emission,date_paiement,devis_id').eq('user_id', profile!.id)
      return (data ?? []) as Facture[]
    },
  })

  // Financial metrics
  const thisMonth  = new Date(); thisMonth.setDate(1); thisMonth.setHours(0,0,0,0)
  const caMois     = facturesList
    .filter(f => f.statut === 'payee' && f.date_paiement && new Date(f.date_paiement) >= thisMonth)
    .reduce((s, f) => s + f.montant_ttc, 0)
  const caAttente  = facturesList
    .filter(f => f.statut === 'envoyee' || f.statut === 'retard')
    .reduce((s, f) => s + f.montant_ttc, 0)
  const devisAcceptes = devisList.filter(d => d.statut === 'accepte').length
  const txConversion  = devisList.length
    ? Math.round((devisAcceptes / devisList.length) * 100)
    : 0

  // Last 6 months bar chart
  const now6 = new Date()
  const chartMonths = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now6.getFullYear(), now6.getMonth() - 5 + i, 1)
    const value = facturesList
      .filter(f => f.statut === 'payee' && f.date_paiement)
      .filter(f => {
        const pd = new Date(f.date_paiement!)
        return pd.getFullYear() === d.getFullYear() && pd.getMonth() === d.getMonth()
      })
      .reduce((s, f) => s + f.montant_ttc, 0)
    return { label: d.toLocaleDateString('fr-FR', { month: 'short' }), value }
  })

  const eur = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'

  // Stale contact alerts: status 'contacte' with no update in 7+ days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const staleLeads = leads
    .filter(l => {
      if (l.status !== 'contacte') return false
      const lastActivity = new Date(l.last_contact_at ?? l.updated_at)
      return lastActivity < sevenDaysAgo
    })
    .slice(0, 3)

  const metrics = [
    { label: 'Leads ce mois',        value: leadsThisMonth,  icon: TrendingUp,   color: 'text-green'  },
    { label: 'Emails générés',       value: emailsGenerated, icon: Mail,         color: 'text-blue'   },
    { label: 'Agences contactées',   value: agenciesContact, icon: Building2,    color: 'text-purple' },
    { label: 'En discussion',        value: enDiscussion,    icon: MessageSquare, color: 'text-amber' },
  ]

  const recentLeads = leads.slice(0, 3)

  const firstName = profile?.full_name?.split(' ')[0] ?? 'Artisan'
  const hour      = new Date().getHours()
  const greeting  = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir'

  return (
    <div className="min-h-full bg-bg px-4 pt-6 pb-8 space-y-5">

      {/* Urgent trial warning (≤3 days) */}
      {plan === 'trial' && days > 0 && days <= 3 && (
        <div className="bg-adim border border-amber/20 rounded-xl px-4 py-3 flex items-start gap-3">
          <AlertTriangle size={15} className="text-amber flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono text-amber font-bold">
              Essai expire dans {days} jour{days > 1 ? 's' : ''}
            </p>
            <p className="text-xs text-text2 mt-0.5 leading-snug">
              Passe au plan Essentiel pour continuer à prospecter
            </p>
          </div>
          <button
            onClick={() => navigate('/compte')}
            className="text-xs text-amber border border-amber/30 rounded-lg px-2.5 py-1 hover:bg-amber/10 transition-colors flex-shrink-0 font-mono"
          >
            Upgrade
          </button>
        </div>
      )}

      {/* Stale contact alerts */}
      {staleLeads.map(lead => (
        <div key={lead.id} className="bg-adim border border-amber/20 rounded-xl px-4 py-3 flex items-start gap-3">
          <AlertTriangle size={15} className="text-amber flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono text-amber font-bold">Pas de nouvelles</p>
            <p className="text-xs text-text2 mt-0.5 leading-snug">
              Pas de nouvelles de{' '}
              <span className="text-text font-semibold">{lead.company}</span>{' '}
              depuis 7 jours
            </p>
          </div>
          <button
            onClick={() => navigate('/mes-leads')}
            className="text-xs text-amber border border-amber/30 rounded-lg px-2.5 py-1 hover:bg-amber/10 transition-colors flex-shrink-0 font-mono"
          >
            Voir
          </button>
        </div>
      ))}

      {/* Greeting */}
      <div>
        <p className="text-text2 text-sm font-mono">{greeting},</p>
        <h1 className="font-display font-extrabold text-3xl text-text mt-0.5">
          {firstName} 👷
        </h1>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className="text-xs font-mono text-text3">
            {creditsRemaining} crédit{creditsRemaining !== 1 ? 's' : ''} restant{creditsRemaining !== 1 ? 's' : ''}
          </span>
          <span className="text-text3 text-xs">·</span>
          <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${PLAN_BADGE[plan] ?? PLAN_BADGE.basic}`}>
            {PLAN_LABEL[plan] ?? plan}
          </span>
        </div>
      </div>

      {/* Metric cards — 2×2 grid */}
      <div className="grid grid-cols-2 gap-3">
        {metrics.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-bg2 border border-border rounded-xl p-4">
            <div className="flex items-start justify-between mb-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                color === 'text-green'  ? 'bg-gdim' :
                color === 'text-blue'   ? 'bg-bdim' :
                color === 'text-purple' ? 'bg-bdim' :
                                          'bg-adim'
              }`}>
                <Icon size={15} className={color} />
              </div>
              <span className={`font-display font-bold text-2xl leading-none ${color}`}>
                {value}
              </span>
            </div>
            <p className="text-xs text-text2 leading-snug">{label}</p>
          </div>
        ))}
      </div>

      {/* Finances section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-bold text-base text-text">Finances</h2>
          <button
            onClick={() => navigate('/factures')}
            className="text-xs text-green font-mono flex items-center gap-1 hover:underline"
          >
            Voir tout <ArrowRight size={12} />
          </button>
        </div>
        <LockedFeature
          feature="financial_dashboard"
          message="Le tableau de bord financier est disponible dans le plan Business."
          onUpgrade={() => navigate('/compte')}
        >
          <div className="space-y-3">
            {/* KPI row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-bg2 border border-border rounded-xl p-3 flex flex-col gap-1">
                <div className="w-7 h-7 bg-gdim border border-green/20 rounded-lg flex items-center justify-center">
                  <Euro size={13} className="text-green" />
                </div>
                <p className="font-display font-bold text-green text-lg leading-none mt-1">{eur(caMois)}</p>
                <p className="text-[10px] text-text2 leading-snug">CA encaissé ce mois</p>
              </div>
              <div className="bg-bg2 border border-border rounded-xl p-3 flex flex-col gap-1">
                <div className="w-7 h-7 bg-adim border border-amber/20 rounded-lg flex items-center justify-center">
                  <Clock size={13} className="text-amber" />
                </div>
                <p className="font-display font-bold text-amber text-lg leading-none mt-1">{eur(caAttente)}</p>
                <p className="text-[10px] text-text2 leading-snug">CA en attente</p>
              </div>
              <div className="bg-bg2 border border-border rounded-xl p-3 flex flex-col gap-1">
                <div className="w-7 h-7 bg-bdim border border-blue/20 rounded-lg flex items-center justify-center">
                  <BarChart2 size={13} className="text-blue" />
                </div>
                <p className="font-display font-bold text-blue text-lg leading-none mt-1">{txConversion} %</p>
                <p className="text-[10px] text-text2 leading-snug">Taux conversion</p>
              </div>
            </div>
            {/* Bar chart */}
            <div className="bg-bg2 border border-border rounded-xl p-4">
              <p className="text-[11px] font-mono text-text3 uppercase tracking-wide mb-3">CA mensuel encaissé</p>
              <MonthlyChart months={chartMonths} />
            </div>
          </div>
        </LockedFeature>
      </div>

      {/* Recent leads */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-bold text-base text-text">Derniers leads</h2>
          {leads.length > 3 && (
            <button
              onClick={() => navigate('/mes-leads')}
              className="text-xs text-green font-mono flex items-center gap-1 hover:underline"
            >
              Voir tout <ArrowRight size={12} />
            </button>
          )}
        </div>

        {recentLeads.length === 0 ? (
          <div className="bg-bg2 border border-border rounded-2xl p-8 text-center">
            <div className="w-14 h-14 bg-gdim border border-green/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <TrendingUp size={24} className="text-green" />
            </div>
            <p className="text-sm font-semibold text-text mb-1">Pas encore de leads</p>
            <p className="text-xs text-text2 mb-5 leading-relaxed max-w-[200px] mx-auto">
              Lance ta première prospection pour trouver des chantiers
            </p>
            <button
              onClick={() => navigate('/prospecter')}
              className="bg-green text-bg text-xs font-bold py-2.5 px-5 rounded-xl hover:bg-green2 transition-colors"
            >
              Prospecter maintenant
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {recentLeads.map(lead => {
              const cfg = STATUS_CFG[lead.status] ?? STATUS_CFG.nouveau
              return (
                <div
                  key={lead.id}
                  onClick={() => navigate('/mes-leads')}
                  className="bg-bg2 border border-border hover:border-border2 rounded-xl p-4 flex items-center gap-3 active:bg-bg3 transition-colors cursor-pointer"
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 bg-bg3 border border-border rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-text2">
                      {lead.company.charAt(0).toUpperCase()}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-medium text-text truncate">{lead.company}</p>
                      <ScoreDot score={lead.renovation_score} />
                    </div>
                    <p className="text-xs text-text2 truncate">
                      {lead.city} · {lead.type}
                    </p>
                  </div>

                  {/* Status badge */}
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border flex-shrink-0 ${cfg.cls}`}>
                    {cfg.label}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* CTA */}
      <button
        onClick={() => navigate('/prospecter')}
        className="w-full bg-green text-bg font-bold py-4 rounded-2xl flex items-center justify-center gap-2 text-sm hover:bg-green2 transition-colors shadow-lg shadow-green/20 active:scale-98"
      >
        <Plus size={18} />
        Nouvelle recherche
      </button>
    </div>
  )
}
