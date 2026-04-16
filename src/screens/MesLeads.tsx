import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, X, Phone, Mail, Globe, MapPin,
  Calendar, ChevronRight, Eye, Check, Loader2, Zap, CheckCircle
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import { generateEmail, sendEmail } from '@/lib/ai'
import type { Lead, LeadStatus } from '@/lib/supabase'

// ── Status pipeline ──────────────────────────────────────────────
const STATUSES: { id: LeadStatus; label: string; color: string }[] = [
  { id: 'nouveau',      label: 'Nouveau',      color: 'text-blue   bg-bdim border-blue/20'   },
  { id: 'contacte',     label: 'Contacté',     color: 'text-amber  bg-adim border-amber/20'  },
  { id: 'visite',       label: 'Visite',       color: 'text-purple bg-bdim border-purple/20' },
  { id: 'devis_envoye', label: 'Devis envoyé', color: 'text-green  bg-gdim border-green/20'  },
  { id: 'confirme',     label: 'Confirmé',     color: 'text-green  bg-gdim border-green/20'  },
  { id: 'en_cours',     label: 'En cours',     color: 'text-green  bg-gdim border-green/20'  },
  { id: 'termine',      label: 'Terminé',      color: 'text-text2  bg-bg3  border-border'    },
  { id: 'paye',         label: 'Payé',         color: 'text-green  bg-gdim border-green/20'  },
  { id: 'archive',      label: 'Archivé',      color: 'text-text3  bg-bg3  border-border'    },
]

const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.id, s]))

// Filter tabs (subset for quick filtering)
const FILTER_TABS: { id: LeadStatus | 'all'; label: string }[] = [
  { id: 'all',          label: 'Tous'      },
  { id: 'nouveau',      label: 'Nouveau'   },
  { id: 'contacte',     label: 'Contacté'  },
  { id: 'visite',       label: 'Visite'    },
  { id: 'devis_envoye', label: 'Devis'     },
  { id: 'confirme',     label: 'Confirmé'  },
  { id: 'archive',      label: 'Archivé'   },
]

// ── Score badge ──────────────────────────────────────────────────
function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 80
    ? 'text-green bg-gdim border-green/20'
    : score >= 60
      ? 'text-amber bg-adim border-amber/20'
      : 'text-red bg-rdim border-red/20'
  return (
    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${cls}`}>
      {score}
    </span>
  )
}

// ── Detail modal ─────────────────────────────────────────────────
function LeadModal({ lead, onClose, onStatusChange }: {
  lead: Lead
  onClose: () => void
  onStatusChange: (id: string, status: LeadStatus) => void
}) {
  const { profile } = useAuthStore()
  const [notes, setNotes]           = useState(lead.notes ?? '')
  const [saving, setSaving]         = useState(false)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody]       = useState('')
  const [genLoading, setGenLoading]     = useState(false)
  const [sending, setSending]           = useState(false)
  const [sentTo, setSentTo]             = useState('')
  const [emailError, setEmailError]     = useState('')

  const saveNotes = async () => {
    setSaving(true)
    await supabase.from('leads').update({ notes }).eq('id', lead.id)
    setSaving(false)
  }

  const handleGenerate = async () => {
    if (!profile) return
    setGenLoading(true)
    setEmailError('')
    try {
      const result = await generateEmail(lead, {
        full_name: profile.full_name,
        metiers: profile.metiers,
        zone_principale: profile.zone_principale,
      })
      setEmailSubject(result.subject)
      setEmailBody(result.body)
    } catch (e: any) {
      setEmailError(e.message || "Erreur de génération.")
    } finally {
      setGenLoading(false)
    }
  }

  const handleSend = async () => {
    if (!lead.email || !emailSubject || !emailBody) return
    setSending(true)
    setEmailError('')
    try {
      await sendEmail({
        to: lead.email,
        subject: emailSubject,
        body: emailBody,
        fromName: profile?.full_name,
      })
      setSentTo(lead.email)
      await supabase.from('leads')
        .update({ status: 'contacte', last_contact_at: new Date().toISOString() })
        .eq('id', lead.id)
      onStatusChange(lead.id, 'contacte')
    } catch (e: any) {
      setEmailError(e.message || "Erreur lors de l'envoi.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-bg/90 backdrop-blur-sm z-50 flex items-end">
      <div className="w-full max-w-lg mx-auto bg-bg2 border border-border rounded-t-3xl overflow-hidden max-h-[90vh] flex flex-col">

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-border rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-border">
          <div className="w-12 h-12 bg-bg3 border border-border rounded-2xl flex items-center justify-center flex-shrink-0">
            <span className="text-base font-bold text-text2">
              {lead.company.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-text">{lead.company}</p>
            <p className="text-xs text-text2 mt-0.5">{lead.type} · {lead.city}</p>
            <div className="flex items-center gap-2 mt-1">
              <ScoreBadge score={lead.renovation_score} />
              {lead.priority && (
                <span className="text-[9px] font-mono font-bold text-green bg-gdim border border-green/20 rounded-full px-1.5 py-0.5">
                  PRIORITÉ
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-text3 hover:text-text2 p-1">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Contact info */}
          <div className="space-y-2">
            <p className="text-[11px] font-mono text-text3 uppercase tracking-wide">Contact</p>
            <div className="bg-bg3 border border-border rounded-xl divide-y divide-border">
              {lead.contact_name && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-4 flex-shrink-0 text-center">
                    <span className="text-text3 text-xs">👤</span>
                  </div>
                  <span className="text-sm text-text">
                    {lead.contact_name}
                    {lead.contact_role && <span className="text-text2"> · {lead.contact_role}</span>}
                  </span>
                </div>
              )}
              {lead.email && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <Mail size={14} className="text-text3 flex-shrink-0" />
                  <a href={`mailto:${lead.email}`} className="text-sm text-blue truncate">
                    {lead.email_revealed ? lead.email : lead.email.replace(/(.{2}).*(@.*)/, '$1***$2')}
                  </a>
                  {!lead.email_revealed && (
                    <Eye size={12} className="text-text3 flex-shrink-0" />
                  )}
                </div>
              )}
              {lead.phone && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <Phone size={14} className="text-text3 flex-shrink-0" />
                  <a href={`tel:${lead.phone}`} className="text-sm text-blue">
                    {lead.phone_revealed ? lead.phone : '** ** ** ** **'}
                  </a>
                </div>
              )}
              {lead.website && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <Globe size={14} className="text-text3 flex-shrink-0" />
                  <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-sm text-blue truncate">
                    {lead.website.replace(/^https?:\/\//, '')}
                  </a>
                </div>
              )}
              <div className="flex items-center gap-3 px-4 py-3">
                <MapPin size={14} className="text-text3 flex-shrink-0" />
                <span className="text-sm text-text2">{lead.address}, {lead.city}</span>
              </div>
            </div>
          </div>

          {/* Status pipeline */}
          <div>
            <p className="text-[11px] font-mono text-text3 uppercase tracking-wide mb-2">Pipeline</p>
            <div className="grid grid-cols-3 gap-2">
              {STATUSES.slice(0, 6).map(s => (
                <button
                  key={s.id}
                  onClick={() => onStatusChange(lead.id, s.id)}
                  className={`relative text-xs font-mono py-2 px-3 rounded-xl border text-center transition-all ${
                    lead.status === s.id
                      ? s.color
                      : 'text-text3 bg-bg3 border-border hover:border-border2'
                  }`}
                >
                  {lead.status === s.id && (
                    <Check size={10} className="absolute top-1 right-1" />
                  )}
                  {s.label}
                </button>
              ))}
            </div>
            {/* Archive / Payé */}
            <div className="flex gap-2 mt-2">
              {STATUSES.slice(6).map(s => (
                <button
                  key={s.id}
                  onClick={() => onStatusChange(lead.id, s.id)}
                  className={`flex-1 text-xs font-mono py-2 px-3 rounded-xl border text-center transition-all ${
                    lead.status === s.id
                      ? s.color
                      : 'text-text3 bg-bg3 border-border hover:border-border2'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Opportunity */}
          {lead.opportunity && (
            <div>
              <p className="text-[11px] font-mono text-text3 uppercase tracking-wide mb-2">Opportunité</p>
              <p className="text-sm text-text2 bg-bg3 border border-border rounded-xl px-4 py-3 leading-relaxed">
                {lead.opportunity}
              </p>
            </div>
          )}

          {/* Chantier dates */}
          {(lead.chantier_start || lead.chantier_end) && (
            <div>
              <p className="text-[11px] font-mono text-text3 uppercase tracking-wide mb-2">Chantier</p>
              <div className="flex items-center gap-2 text-sm text-text2">
                <Calendar size={14} className="text-text3" />
                {lead.chantier_start && <span>{lead.chantier_start}</span>}
                {lead.chantier_start && lead.chantier_end && <span>→</span>}
                {lead.chantier_end && <span>{lead.chantier_end}</span>}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <p className="text-[11px] font-mono text-text3 uppercase tracking-wide mb-2">Notes</p>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={saveNotes}
              placeholder="Ajoute tes notes sur ce lead..."
              rows={4}
              className="w-full bg-bg3 border border-border focus:border-green/50 rounded-xl px-4 py-3 text-sm text-text placeholder-text3 outline-none resize-none"
            />
            {saving && (
              <p className="text-xs text-text3 font-mono mt-1">Sauvegarde...</p>
            )}
          </div>

          {/* Email IA — visible pour tous les leads avec email */}
          {lead.email && (
            <div>
              <p className="text-[11px] font-mono text-text3 uppercase tracking-wide mb-2">Email IA</p>
              <div className="bg-bg3 border border-border rounded-xl p-4 space-y-3">
                <p className="text-xs text-text2">
                  <span className="text-text3">Destinataire :</span>{' '}
                  <span className="font-mono text-green">{lead.email}</span>
                </p>

                {!emailSubject && !genLoading && (
                  <button
                    onClick={handleGenerate}
                    className="w-full flex items-center justify-center gap-2 bg-bg text-text2 border border-border text-xs font-mono py-2.5 rounded-xl hover:border-border2 transition-colors"
                  >
                    <Zap size={13} className="text-green" /> Générer avec IA
                  </button>
                )}

                {genLoading && (
                  <div className="flex items-center justify-center gap-2 py-3">
                    <Loader2 size={15} className="animate-spin text-green" />
                    <span className="text-xs text-text2">Rédaction en cours...</span>
                  </div>
                )}

                {emailSubject && !genLoading && (
                  <>
                    <input
                      value={emailSubject}
                      onChange={e => setEmailSubject(e.target.value)}
                      className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-text outline-none focus:border-green/50"
                      placeholder="Objet"
                    />
                    <textarea
                      value={emailBody}
                      onChange={e => setEmailBody(e.target.value)}
                      rows={6}
                      className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-text outline-none focus:border-green/50 resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleGenerate}
                        className="flex-1 text-xs font-mono text-text2 border border-border bg-bg rounded-xl py-2 hover:border-border2 transition-colors"
                      >
                        Régénérer
                      </button>
                    </div>
                  </>
                )}

                {emailError && (
                  <p className="text-xs text-red bg-rdim border border-red/20 rounded-xl px-3 py-2">
                    {emailError}
                  </p>
                )}

                {sentTo ? (
                  <div className="flex items-center justify-center gap-2 py-2 text-green text-xs font-bold">
                    <CheckCircle size={14} /> Email envoyé · Statut mis à jour → Contacté
                  </div>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={sending || !emailSubject || !emailBody}
                    className="w-full bg-green text-bg font-bold text-sm py-3 rounded-xl hover:bg-green2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {sending ? (
                      <><Loader2 size={15} className="animate-spin" /> Envoi...</>
                    ) : (
                      <><Mail size={15} /> Envoyer l'email</>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main screen ──────────────────────────────────────────────────
export default function MesLeads() {
  const { profile } = useAuthStore()
  const queryClient = useQueryClient()

  const [search, setSearch]         = useState('')
  const [activeTab, setActiveTab]   = useState<LeadStatus | 'all'>('nouveau')
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)

  const { data: leads = [], isLoading } = useQuery<Lead[]>({
    queryKey: ['leads', profile?.id],
    enabled: !!profile?.id,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const { data } = await supabase
        .from('leads')
        .select('*')
        .eq('user_id', profile!.id)
        .order('created_at', { ascending: false })
      return (data ?? []) as Lead[]
    },
  })

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: LeadStatus }) => {
      await supabase.from('leads').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', profile?.id] })
      // Update selected lead optimistically
      setSelectedLead(prev => prev ? { ...prev, status: updateStatus.variables?.status ?? prev.status } : null)
    },
  })

  const filtered = useMemo(() => leads.filter(l => {
    const matchTab = activeTab === 'all' || l.status === activeTab
    const q = search.toLowerCase()
    const matchSearch = !q || [l.company, l.city, l.type, l.contact_name ?? '']
      .some(f => f.toLowerCase().includes(q))
    return matchTab && matchSearch
  }), [leads, activeTab, search])

  return (
    <div className="min-h-full bg-bg flex flex-col">

      {/* Fixed header */}
      <div className="bg-bg px-4 pt-6 pb-3 space-y-3">
        <h1 className="font-display font-bold text-2xl text-text">Mes leads</h1>

        {/* Search bar */}
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text3" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un lead..."
            className="w-full bg-bg2 border border-border focus:border-green/50 rounded-xl pl-9 pr-10 py-3 text-sm text-text placeholder-text3 outline-none transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text3 hover:text-text2"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Status filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {FILTER_TABS.map(({ id, label }) => {
            const count = id === 'all' ? leads.length : leads.filter(l => l.status === id).length
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-full border transition-colors ${
                  activeTab === id
                    ? 'bg-gdim border-green/30 text-green'
                    : 'bg-bg2 border-border text-text3 hover:border-border2 hover:text-text2'
                }`}
              >
                {label}
                {count > 0 && (
                  <span className={`text-[10px] font-bold ${activeTab === id ? 'text-green' : 'text-text3'}`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Lead list */}
      <div className="flex-1 px-4 pb-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-border border-t-green rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 bg-bg2 border border-border rounded-2xl flex items-center justify-center mb-4">
              <Search size={22} className="text-text3" />
            </div>
            <p className="text-sm font-medium text-text mb-1">
              {search ? 'Aucun résultat' : 'Aucun lead ici'}
            </p>
            <p className="text-xs text-text3">
              {search ? `"${search}" ne correspond à aucun lead` : 'Lance une prospection pour trouver des chantiers'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(lead => {
              const s = STATUS_MAP[lead.status] ?? STATUS_MAP.nouveau
              return (
                <button
                  key={lead.id}
                  onClick={() => setSelectedLead(lead)}
                  className="w-full bg-bg2 border border-border hover:border-border2 rounded-xl p-4 text-left transition-colors active:bg-bg3 flex items-center gap-3"
                >
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    lead.priority ? 'bg-gdim border border-green/20' : 'bg-bg3 border border-border'
                  }`}>
                    <span className={`text-sm font-bold ${lead.priority ? 'text-green' : 'text-text2'}`}>
                      {lead.company.charAt(0).toUpperCase()}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-medium text-text truncate">{lead.company}</p>
                      <ScoreBadge score={lead.renovation_score} />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-text2">
                      <span className="truncate">{lead.city}</span>
                      <span className="text-text3">·</span>
                      <span className="truncate">{lead.type}</span>
                    </div>
                    {lead.last_contact_at && (
                      <p className="text-[11px] text-text3 mt-0.5">
                        Dernier contact : {new Date(lead.last_contact_at).toLocaleDateString('fr-FR')}
                      </p>
                    )}
                  </div>

                  {/* Status + chevron */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${s.color}`}>
                      {s.label}
                    </span>
                    <ChevronRight size={14} className="text-text3" />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Lead detail modal */}
      {selectedLead && (
        <LeadModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onStatusChange={(id, status) => updateStatus.mutate({ id, status })}
        />
      )}
    </div>
  )
}
