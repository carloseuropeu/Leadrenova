import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Search, Download, Mail, Eye, EyeOff, ChevronDown,
  Loader2, CheckCircle, AlertCircle, Zap
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { usePlan } from '@/hooks/usePlan'
import { supabase } from '@/lib/supabase'
import { searchLeads, generateEmail, sendEmail } from '@/lib/ai'
import type { Lead } from '@/lib/supabase'

// ── Config ───────────────────────────────────────────────────────
const TARGET_TYPES = [
  'Agence immobilière',
  'Syndic de copropriété',
  'Promoteur immobilier',
  'Bailleur social',
  'Cabinet de gestion',
  'Hôtel / Résidence',
]

const QUICK_FILTERS = [
  'Score > 80', 'Avec email', 'Paris IDF', 'Lyon métropole',
  'Bordeaux', 'Copropriétés',
]

const STEPS = [
  'Recherche en cours...',
  'Analyse des opportunités...',
  'Calcul des scores...',
  'Finalisation...',
]

const RESULT_OPTIONS = [3, 5, 10]

// ── Score badge ──────────────────────────────────────────────────
function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 80
    ? 'bg-gdim border-green/30 text-green'
    : score >= 60
      ? 'bg-adim border-amber/30 text-amber'
      : 'bg-rdim border-red/30 text-red'
  return (
    <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded-full border ${cls}`}>
      {score}
    </span>
  )
}

// ── Email modal ──────────────────────────────────────────────────
function EmailModal({
  lead, onClose,
}: { lead: Partial<Lead>; onClose: () => void }) {
  const { profile } = useAuthStore()
  const [subject, setSubject] = useState('')
  const [body, setBody]       = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied]   = useState(false)
  const [sending, setSending] = useState(false)
  const [sentTo, setSentTo]   = useState('')
  const [sendError, setSendError] = useState('')

  const generate = async () => {
    if (!profile) return
    setLoading(true)
    try {
      const result = await generateEmail(lead, {
        full_name: profile.full_name,
        metiers: profile.metiers,
        zone_principale: profile.zone_principale,
      })
      setSubject(result.subject)
      setBody(result.body)
    } catch {
      setSubject('Erreur')
      setBody("Impossible de générer l'email. Vérifiez votre connexion.")
    } finally {
      setLoading(false)
    }
  }

  const copyAll = async () => {
    await navigator.clipboard.writeText(`Objet : ${subject}\n\n${body}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSend = async () => {
    if (!lead.email || !subject || !body) return
    setSending(true)
    setSendError('')
    try {
      await sendEmail({
        to: lead.email,
        subject,
        body,
        fromName: profile?.full_name,
      })
      setSentTo(lead.email)
    } catch (e: any) {
      setSendError(e.message || "Erreur lors de l'envoi.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-bg/80 backdrop-blur-sm z-50 flex items-end px-4 pb-6">
      <div className="w-full max-w-lg mx-auto bg-bg2 border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <p className="font-semibold text-text text-sm">Email IA</p>
            <p className="text-xs text-text2 mt-0.5">{lead.company}</p>
          </div>
          <button onClick={onClose} className="text-text3 hover:text-text2 text-lg leading-none">✕</button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {!subject && !loading && (
            <div className="text-center py-4">
              <p className="text-text2 text-sm mb-4">
                Génère un email personnalisé pour {lead.company}
              </p>
              <button
                onClick={generate}
                className="bg-green text-bg font-bold text-sm py-3 px-6 rounded-xl hover:bg-green2 transition-colors inline-flex items-center gap-2"
              >
                <Zap size={15} /> Générer avec IA
              </button>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-8 gap-3">
              <Loader2 size={20} className="text-green animate-spin" />
              <span className="text-text2 text-sm">Rédaction en cours...</span>
            </div>
          )}

          {subject && !loading && (
            <>
              <div>
                <label className="text-[11px] font-mono text-text3 uppercase tracking-wide block mb-1.5">
                  Objet
                </label>
                <input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="w-full bg-bg3 border border-border rounded-xl px-4 py-2.5 text-sm text-text outline-none focus:border-green/50"
                />
              </div>
              <div>
                <label className="text-[11px] font-mono text-text3 uppercase tracking-wide block mb-1.5">
                  Corps
                </label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={8}
                  className="w-full bg-bg3 border border-border rounded-xl px-4 py-2.5 text-sm text-text outline-none focus:border-green/50 resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={generate}
                  className="flex-1 bg-bg3 border border-border text-text2 text-xs font-mono py-2.5 rounded-xl hover:border-border2 transition-colors"
                >
                  Régénérer
                </button>
                <button
                  onClick={copyAll}
                  className="flex-1 bg-bg3 border border-border text-text2 text-xs font-mono py-2.5 rounded-xl hover:border-border2 transition-colors"
                >
                  {copied ? '✓ Copié !' : 'Copier'}
                </button>
              </div>

              {sendError && (
                <p className="text-xs text-red bg-rdim border border-red/20 rounded-xl px-3 py-2">
                  {sendError}
                </p>
              )}

              {sentTo ? (
                <div className="flex items-center justify-center gap-2 py-2.5 text-green text-sm font-bold">
                  <CheckCircle size={16} /> Email envoyé à {sentTo}
                </div>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={sending || !lead.email}
                  className="w-full bg-green text-bg font-bold text-sm py-3 rounded-xl hover:bg-green2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {sending ? (
                    <><Loader2 size={15} className="animate-spin" /> Envoi en cours...</>
                  ) : !lead.email ? (
                    <><Mail size={15} /> Email inconnu</>
                  ) : (
                    <><Mail size={15} /> Envoyer l'email</>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Lead card ────────────────────────────────────────────────────
function LeadCard({
  lead,
  onRevealEmail,
  onEmailIA,
}: {
  lead: Partial<Lead> & { _revealed?: boolean }
  onRevealEmail: () => void
  onEmailIA: () => void
}) {
  const { canRevealEmail } = usePlan()

  return (
    <div className={`bg-bg2 border rounded-xl p-4 transition-colors ${
      lead.priority ? 'border-green/20' : 'border-border'
    }`}>
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 bg-bg3 border border-border rounded-xl flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-bold text-text2">
            {(lead.company ?? '?').charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-text">{lead.company}</p>
            {lead.priority && (
              <span className="text-[9px] font-mono font-bold text-green bg-gdim border border-green/20 rounded-full px-1.5 py-0.5">
                PRIORITÉ
              </span>
            )}
          </div>
          <p className="text-xs text-text2 mt-0.5">{lead.type} · {lead.city}</p>
        </div>
        <ScoreBadge score={lead.renovation_score ?? 0} />
      </div>

      {/* Opportunity */}
      {lead.opportunity && (
        <p className="text-xs text-text2 bg-bg3 border border-border rounded-lg px-3 py-2 mb-3 leading-relaxed">
          {lead.opportunity}
        </p>
      )}

      {/* Details row */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
        {lead.contact_name && (
          <span className="text-xs text-text2">
            <span className="text-text3">Contact:</span> {lead.contact_name}
            {lead.contact_role && ` · ${lead.contact_role}`}
          </span>
        )}
        {lead.employees && (
          <span className="text-xs text-text2">
            <span className="text-text3">Taille:</span> {lead.employees}
          </span>
        )}
      </div>

      {/* Email reveal */}
      <div className="flex items-center gap-2 mb-3 bg-bg3 border border-border rounded-lg px-3 py-2">
        {lead._revealed && lead.email ? (
          <>
            <Eye size={13} className="text-green flex-shrink-0" />
            <span className="text-xs text-green font-mono flex-1">{lead.email}</span>
          </>
        ) : (
          <>
            <EyeOff size={13} className="text-text3 flex-shrink-0" />
            <span className="text-xs text-text3 flex-1 font-mono">
              {lead.email
                ? lead.email.replace(/(.{2}).*(@.*)/, '$1***$2')
                : '—'}
            </span>
            {lead.email && (
              <button
                onClick={onRevealEmail}
                disabled={!canRevealEmail()}
                className="text-[11px] font-bold text-green bg-gdim border border-green/20 rounded-lg px-2.5 py-1 hover:bg-green/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
              >
                Révéler — 1 crédit
              </button>
            )}
          </>
        )}
      </div>

      {/* Actions */}
      <button
        onClick={onEmailIA}
        className="w-full flex items-center justify-center gap-2 bg-bg3 border border-border hover:border-border2 text-text2 text-xs font-medium py-2.5 rounded-xl transition-colors"
      >
        <Mail size={13} />
        Générer email IA
      </button>
    </div>
  )
}

// ── Main screen ──────────────────────────────────────────────────
type SearchLead = Partial<Lead> & { _revealed?: boolean; _tmpId: string }

export default function Prospecter() {
  const { profile, updateProfile } = useAuthStore()
  const { hasAccess, canRevealEmail, creditsRemaining } = usePlan()
  const queryClient = useQueryClient()

  const [zone, setZone]             = useState(profile?.zone_principale ?? '')
  const [targetType, setTargetType] = useState(TARGET_TYPES[0])
  const [maxResults, setMaxResults] = useState(5)
  const [activeFilters, setActiveFilters] = useState<string[]>([])
  const [showTargetMenu, setShowTargetMenu] = useState(false)

  const [results, setResults]   = useState<SearchLead[]>([])
  const [loading, setLoading]   = useState(false)
  const [loadStep, setLoadStep] = useState(0)
  const [error, setError]       = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [emailModal, setEmailModal] = useState<SearchLead | null>(null)

  const toggleFilter = (f: string) =>
    setActiveFilters(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f])

  const handleSearch = async () => {
    if (!zone.trim()) { setError('Indique une zone de recherche'); return }
    if (creditsRemaining <= 0) { setError('Crédits épuisés. Passe au plan supérieur pour continuer.'); return }
    setError('')
    setResults([])
    setSaveStatus('idle')
    setLoading(true)
    setLoadStep(0)

    const stepTimer = setInterval(() => {
      setLoadStep(s => Math.min(s + 1, STEPS.length - 1))
    }, 1800)

    try {
      console.log('[Prospecter] Lancement recherche', { zone, targetType, maxResults, filters: activeFilters })

      const leads = await searchLeads({
        zone: zone.trim(),
        targetType,
        maxResults,
        filters: activeFilters,
      })

      console.log('[Prospecter] Leads reçus de l\'API :', leads.length, leads)

      if (leads.length === 0) {
        console.warn('[Prospecter] L\'API a renvoyé 0 résultats')
      }

      const enriched: SearchLead[] = leads.map((l, i) => ({
        ...l,
        status: 'nouveau' as const,
        _tmpId: `tmp_${i}_${Date.now()}`,
        _revealed: false,
      }))

      console.log('[Prospecter] Enriched leads prêts pour affichage :', enriched.length)

      // ── Afficher les résultats immédiatement, indépendamment du save ──
      setResults(enriched)

      // ── Décrémenter 1 crédit après chaque recherche réussie ──
      if (enriched.length > 0) {
        updateProfile({ credits_remaining: Math.max(0, creditsRemaining - 1) })
          .catch(e => console.warn('[Prospecter] Erreur mise à jour crédits :', e))
      }

      // ── Sauvegarder en Supabase en arrière-plan (erreur non bloquante) ──
      if (profile?.id && enriched.length > 0) {
        const toInsert = enriched.map(l => ({
          user_id:          profile.id,
          company:          l.company          ?? '',
          type:             l.type             ?? '',
          contact_name:     l.contact_name     ?? null,
          contact_role:     l.contact_role     ?? null,
          email:            l.email            ?? null,
          phone:            l.phone            ?? null,
          website:          l.website          ?? null,
          address:          l.address          ?? '',
          city:             l.city             ?? '',
          employees:        l.employees        ?? null,
          renovation_score: l.renovation_score ?? 0,
          opportunity:      l.opportunity      ?? null,
          priority:         l.priority         ?? false,
          status:           'nouveau' as const,
          email_revealed:   false,
          phone_revealed:   false,
          photos:           [],
        }))
        supabase.from('leads').insert(toInsert).then(({ error: dbErr }) => {
          if (dbErr) {
            console.warn('[Prospecter] Supabase insert échoué :', dbErr.message)
            setSaveStatus('error')
          } else {
            console.log('[Prospecter] Leads sauvegardés en base')
            setSaveStatus('saved')
            queryClient.invalidateQueries({ queryKey: ['leads', profile.id] })
          }
        })
      }
    } catch (e: any) {
      console.error('[Prospecter] Erreur handleSearch :', e)
      setError(e.message || 'Erreur lors de la recherche. Vérifie ta connexion.')
    } finally {
      clearInterval(stepTimer)
      setLoading(false)
    }
  }

  const handleRevealEmail = async (tmpId: string) => {
    if (!canRevealEmail() || !profile) return
    setResults(prev => prev.map(l =>
      l._tmpId === tmpId ? { ...l, _revealed: true } : l
    ))
    await updateProfile({ credits_remaining: Math.max(0, creditsRemaining - 1) })
  }

  const exportCSV = () => {
    if (results.length === 0) return
    const headers = ['Entreprise', 'Type', 'Ville', 'Contact', 'Email', 'Score', 'Opportunité']
    const rows = results.map(l => [
      l.company ?? '', l.type ?? '', l.city ?? '',
      l.contact_name ?? '', l.email ?? '',
      String(l.renovation_score ?? 0), l.opportunity ?? ''
    ])
    const csv = [headers, ...rows]
      .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `leadrenov_${zone}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-full bg-bg px-4 pt-6 pb-8">

      {/* Header */}
      <div className="mb-5">
        <h1 className="font-display font-bold text-2xl text-text">Prospecter</h1>
        <p className="text-text2 text-sm mt-0.5">
          {creditsRemaining} crédit{creditsRemaining !== 1 ? 's' : ''} restant{creditsRemaining !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Filters card */}
      <div className="bg-bg2 border border-border rounded-2xl p-4 mb-4 space-y-4">

        {/* Zone */}
        <div>
          <label className="text-[11px] font-mono text-text3 uppercase tracking-wide block mb-1.5">Zone</label>
          <div className="relative">
            <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text3" />
            <input
              type="text"
              value={zone}
              onChange={e => setZone(e.target.value)}
              placeholder="Paris, Lyon, Bordeaux..."
              className="w-full bg-bg3 border border-border focus:border-green/50 rounded-xl pl-9 pr-4 py-3 text-sm text-text placeholder-text3 outline-none transition-colors"
            />
          </div>
        </div>

        {/* Target type */}
        <div>
          <label className="text-[11px] font-mono text-text3 uppercase tracking-wide block mb-1.5">Type de cible</label>
          <div className="relative">
            <button
              onClick={() => setShowTargetMenu(v => !v)}
              className="w-full bg-bg3 border border-border rounded-xl px-4 py-3 text-sm text-text text-left flex items-center justify-between"
            >
              {targetType}
              <ChevronDown size={14} className={`text-text3 transition-transform ${showTargetMenu ? 'rotate-180' : ''}`} />
            </button>
            {showTargetMenu && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-bg3 border border-border rounded-xl overflow-hidden z-20 shadow-xl">
                {TARGET_TYPES.map(t => (
                  <button
                    key={t}
                    onClick={() => { setTargetType(t); setShowTargetMenu(false) }}
                    className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                      t === targetType
                        ? 'text-green bg-gdim'
                        : 'text-text2 hover:bg-bg4 hover:text-text'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Nombre de résultats */}
        <div>
          <label className="text-[11px] font-mono text-text3 uppercase tracking-wide block mb-1.5">Résultats</label>
          <div className="flex gap-2">
            {RESULT_OPTIONS.map(n => (
              <button
                key={n}
                onClick={() => setMaxResults(n)}
                className={`flex-1 py-2 rounded-xl text-sm font-mono border transition-colors ${
                  maxResults === n
                    ? 'bg-gdim border-green/30 text-green'
                    : 'bg-bg3 border-border text-text2 hover:border-border2'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Quick filters */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-4 no-scrollbar">
        {QUICK_FILTERS.map(f => (
          <button
            key={f}
            onClick={() => toggleFilter(f)}
            className={`flex-shrink-0 text-xs font-mono px-3 py-1.5 rounded-full border transition-colors ${
              activeFilters.includes(f)
                ? 'bg-gdim border-green/30 text-green'
                : 'bg-bg2 border-border text-text3 hover:border-border2 hover:text-text2'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-rdim border border-red/20 rounded-xl px-4 py-3 text-xs text-red flex items-center gap-2 mb-4">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Search button */}
      <button
        onClick={handleSearch}
        disabled={loading}
        className="w-full bg-green text-bg font-bold py-4 rounded-2xl flex items-center justify-center gap-2 text-sm hover:bg-green2 transition-colors disabled:opacity-60 shadow-lg shadow-green/20 mb-5"
      >
        {loading ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Recherche...
          </>
        ) : (
          <>
            <Search size={18} />
            Lancer la recherche
          </>
        )}
      </button>

      {/* Loading steps */}
      {loading && (
        <div className="bg-bg2 border border-border rounded-2xl p-5 mb-4">
          <div className="space-y-3">
            {STEPS.map((step, i) => (
              <div key={step} className="flex items-center gap-3">
                {i < loadStep ? (
                  <CheckCircle size={16} className="text-green flex-shrink-0" />
                ) : i === loadStep ? (
                  <Loader2 size={16} className="text-green animate-spin flex-shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-border flex-shrink-0" />
                )}
                <span className={`text-sm ${i <= loadStep ? 'text-text' : 'text-text3'}`}>
                  {step}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save status */}
      {saveStatus === 'saved' && (
        <div className="flex items-center gap-2 text-xs text-green bg-gdim border border-green/20 rounded-xl px-4 py-2.5 mb-3">
          <CheckCircle size={13} />
          Leads sauvegardés — visibles dans Mes leads
        </div>
      )}
      {saveStatus === 'error' && (
        <div className="flex items-center gap-2 text-xs text-amber bg-adim border border-amber/20 rounded-xl px-4 py-2.5 mb-3">
          <AlertCircle size={13} />
          Résultats affichés mais non sauvegardés (vérifier la connexion Supabase)
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-mono text-text2">
              <span className="text-green font-bold">{results.length}</span> résultat{results.length > 1 ? 's' : ''} trouvé{results.length > 1 ? 's' : ''}
            </p>
            {hasAccess('export_csv') && (
              <button
                onClick={exportCSV}
                className="flex items-center gap-1.5 text-xs text-text2 font-mono border border-border rounded-lg px-3 py-1.5 hover:border-border2 transition-colors"
              >
                <Download size={12} />
                Export CSV
              </button>
            )}
          </div>

          <div className="space-y-3">
            {results.map(lead => (
              <LeadCard
                key={lead._tmpId}
                lead={lead}
                onRevealEmail={() => handleRevealEmail(lead._tmpId)}
                onEmailIA={() => setEmailModal(lead)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Email modal */}
      {emailModal && (
        <EmailModal lead={emailModal} onClose={() => setEmailModal(null)} />
      )}
    </div>
  )
}
