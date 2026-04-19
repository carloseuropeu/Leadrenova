import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, FileText, Loader2, Zap, Download, X, Trash2, Check,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { usePlan } from '@/hooks/usePlan'
import LockedFeature from '@/components/ui/LockedFeature'
import { supabase } from '@/lib/supabase'
import { generateDevis as generateDevisAI } from '@/lib/ai'
import { generateDevisPDF } from '@/lib/pdf'
import type { Lead, Devis, LigneDevis, DevisStatut } from '@/lib/supabase'

// ── Statut config ─────────────────────────────────────────────────
const STATUT: Record<DevisStatut, { label: string; cls: string }> = {
  brouillon: { label: 'Brouillon', cls: 'text-text3 bg-bg3 border-border'           },
  envoye:    { label: 'Envoyé',    cls: 'text-blue  bg-bdim border-blue/20'          },
  accepte:   { label: 'Accepté',  cls: 'text-green bg-gdim border-green/20'         },
  refuse:    { label: 'Refusé',   cls: 'text-red   bg-rdim border-red/20'           },
}

const eur = (n: number) => n.toFixed(2).replace('.', ',') + ' €'

function nextNumero(list: Devis[]): string {
  const year = new Date().getFullYear()
  const nums = list.map(d => { const m = d.numero.match(/DEV-\d+-(\d+)/); return m ? parseInt(m[1], 10) : 0 })
  const next = nums.length ? Math.max(...nums) + 1 : 1
  return `DEV-${year}-${String(next).padStart(3, '0')}`
}

// ── New Devis Modal ──────────────────────────────────────────────
function NewDevisModal({ leads, devisList, onClose, onCreated }: {
  leads: Lead[]
  devisList: Devis[]
  onClose: () => void
  onCreated: () => void
}) {
  const { profile } = useAuthStore()

  const [selectedLeadId, setSelectedLeadId] = useState('')
  const [objet,          setObjet]          = useState('')
  const [visitNotes,     setVisitNotes]     = useState('')
  const [tvaRate,        setTvaRate]        = useState(20)
  const [lignes,         setLignes]         = useState<LigneDevis[]>([])
  const [montant_ht,     setHt]            = useState(0)
  const [montant_tva,    setTva]           = useState(0)
  const [montant_ttc,    setTtc]           = useState(0)
  const [genLoading,     setGenLoading]    = useState(false)
  const [saving,         setSaving]        = useState(false)
  const [aiError,        setAiError]       = useState('')

  const selectedLead = leads.find(l => l.id === selectedLeadId)

  const recalc = (updated: LigneDevis[], rate: number) => {
    const ht  = Math.round(updated.reduce((s, l) => s + l.total_ht, 0) * 100) / 100
    const tva = Math.round(ht * rate / 100 * 100) / 100
    setLignes(updated); setHt(ht); setTva(tva); setTtc(Math.round((ht + tva) * 100) / 100)
  }

  const handleGenerate = async () => {
    if (!selectedLead && !visitNotes.trim()) return
    setGenLoading(true); setAiError('')
    try {
      const result = await generateDevisAI(selectedLead ?? {}, visitNotes, tvaRate)
      recalc(result.lignes, tvaRate)
    } catch (e: any) {
      setAiError(e.message ?? 'Erreur de génération IA')
    } finally {
      setGenLoading(false)
    }
  }

  const updateLigne = (idx: number, field: keyof LigneDevis, raw: string | number) => {
    const val = typeof raw === 'string' ? raw : Number(raw)
    const updated = lignes.map((l, i) => {
      if (i !== idx) return l
      const next = { ...l, [field]: val }
      if (field === 'quantite' || field === 'prix_unitaire_ht') {
        next.total_ht = Math.round(Number(next.quantite) * Number(next.prix_unitaire_ht) * 100) / 100
      }
      return next
    })
    recalc(updated, tvaRate)
  }

  const addLigne = () => recalc([
    ...lignes,
    { id: String(Date.now()), description: '', quantite: 1, unite: 'u', prix_unitaire_ht: 0, total_ht: 0 },
  ], tvaRate)

  const removeLigne = (idx: number) => recalc(lignes.filter((_, i) => i !== idx), tvaRate)

  const handleSave = async () => {
    if (!profile || !lignes.length) return
    setSaving(true)
    const now = new Date().toISOString()
    await supabase.from('devis').insert({
      user_id: profile.id,
      lead_id: selectedLeadId || null,
      numero: nextNumero(devisList),
      objet: objet || null,
      lignes,
      montant_ht,
      tva_rate: tvaRate,
      montant_tva,
      montant_ttc,
      statut: 'brouillon',
      validite_jours: 30,
      notes: visitNotes || null,
      created_at: now,
      updated_at: now,
    })
    setSaving(false)
    onCreated()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-bg/90 backdrop-blur-sm z-50 flex items-end">
      <div className="w-full max-w-lg mx-auto bg-bg2 border border-border rounded-t-3xl overflow-hidden max-h-[92vh] flex flex-col">

        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-border rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="font-display font-bold text-lg text-text">Nouveau devis</h2>
          <button onClick={onClose}><X size={18} className="text-text3" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Lead */}
          <div>
            <label className="text-[11px] font-mono text-text3 uppercase tracking-wide mb-1.5 block">Client (lead)</label>
            <select
              value={selectedLeadId}
              onChange={e => setSelectedLeadId(e.target.value)}
              className="w-full bg-bg3 border border-border focus:border-green/50 rounded-xl px-4 py-3 text-sm text-text outline-none"
            >
              <option value="">— Sélectionner un lead —</option>
              {leads.map(l => <option key={l.id} value={l.id}>{l.company} · {l.city}</option>)}
            </select>
          </div>

          {/* Objet */}
          <div>
            <label className="text-[11px] font-mono text-text3 uppercase tracking-wide mb-1.5 block">Objet du devis</label>
            <input
              value={objet}
              onChange={e => setObjet(e.target.value)}
              placeholder="Travaux de rénovation salle de bain..."
              className="w-full bg-bg3 border border-border focus:border-green/50 rounded-xl px-4 py-3 text-sm text-text placeholder-text3 outline-none"
            />
          </div>

          {/* TVA */}
          <div>
            <label className="text-[11px] font-mono text-text3 uppercase tracking-wide mb-1.5 block">Taux TVA</label>
            <div className="flex gap-2">
              {[0, 10, 20].map(r => (
                <button
                  key={r}
                  onClick={() => { setTvaRate(r); recalc(lignes, r) }}
                  className={`flex-1 py-2 rounded-xl text-xs font-mono border transition-colors ${
                    tvaRate === r ? 'bg-gdim border-green/30 text-green' : 'bg-bg3 border-border text-text3'
                  }`}
                >
                  {r === 0 ? 'Exonéré' : `${r} %`}
                </button>
              ))}
            </div>
          </div>

          {/* Description + AI */}
          <div>
            <label className="text-[11px] font-mono text-text3 uppercase tracking-wide mb-1.5 block">Description des travaux</label>
            <textarea
              value={visitNotes}
              onChange={e => setVisitNotes(e.target.value)}
              placeholder="Décris les travaux à réaliser pour que l'IA génère le devis..."
              rows={3}
              className="w-full bg-bg3 border border-border focus:border-green/50 rounded-xl px-4 py-3 text-sm text-text placeholder-text3 outline-none resize-none"
            />
            <button
              onClick={handleGenerate}
              disabled={genLoading || (!selectedLeadId && !visitNotes.trim())}
              className="mt-2 w-full flex items-center justify-center gap-2 bg-bg3 border border-green/30 text-green text-xs font-bold py-3 rounded-xl hover:bg-gdim transition-colors disabled:opacity-40"
            >
              {genLoading
                ? <><Loader2 size={13} className="animate-spin" /> Génération en cours...</>
                : <><Zap size={13} /> Générer avec IA</>}
            </button>
            {aiError && <p className="text-xs text-red mt-1.5 bg-rdim border border-red/20 rounded-lg px-3 py-2">{aiError}</p>}
          </div>

          {/* Lines table */}
          {lignes.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] font-mono text-text3 uppercase tracking-wide">Lignes du devis</label>
                <button onClick={addLigne} className="text-xs text-green font-mono flex items-center gap-1 hover:underline">
                  <Plus size={11} /> Ajouter
                </button>
              </div>
              <div className="space-y-2">
                {lignes.map((l, i) => (
                  <div key={l.id} className="bg-bg3 border border-border rounded-xl p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <input
                        value={l.description}
                        onChange={e => updateLigne(i, 'description', e.target.value)}
                        placeholder="Description de la prestation"
                        className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text outline-none focus:border-green/40"
                      />
                      <button onClick={() => removeLigne(i)} className="text-text3 hover:text-red flex-shrink-0 mt-1">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 text-xs">
                      <input
                        type="number" min="0" value={l.quantite}
                        onChange={e => updateLigne(i, 'quantite', e.target.value)}
                        placeholder="Qté"
                        className="bg-bg border border-border rounded-lg px-2 py-1.5 text-text outline-none text-center"
                      />
                      <input
                        value={l.unite}
                        onChange={e => updateLigne(i, 'unite', e.target.value)}
                        placeholder="u"
                        className="bg-bg border border-border rounded-lg px-2 py-1.5 text-text outline-none text-center"
                      />
                      <input
                        type="number" min="0" step="0.01" value={l.prix_unitaire_ht}
                        onChange={e => updateLigne(i, 'prix_unitaire_ht', e.target.value)}
                        placeholder="€ HT"
                        className="bg-bg border border-border rounded-lg px-2 py-1.5 text-text outline-none text-center"
                      />
                      <div className="flex items-center justify-center font-mono text-green">{eur(l.total_ht)}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="mt-3 bg-bg3 border border-border rounded-xl p-3 space-y-1.5">
                <div className="flex justify-between text-xs text-text2">
                  <span>Total HT</span><span className="font-mono">{eur(montant_ht)}</span>
                </div>
                <div className="flex justify-between text-xs text-text2">
                  <span>TVA ({tvaRate} %)</span><span className="font-mono">{eur(montant_tva)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-text border-t border-border pt-1.5">
                  <span>TOTAL TTC</span><span className="font-mono text-green">{eur(montant_ttc)}</span>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={addLigne}
              className="w-full flex items-center justify-center gap-2 bg-bg3 border border-dashed border-border2 text-text3 text-xs font-mono py-3 rounded-xl hover:border-green/30 hover:text-text2 transition-colors"
            >
              <Plus size={13} /> Ajouter une ligne manuellement
            </button>
          )}
        </div>

        <div className="p-5 border-t border-border">
          <button
            onClick={handleSave}
            disabled={saving || lignes.length === 0}
            className="w-full bg-green text-bg font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-green2 transition-colors disabled:opacity-40"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            Enregistrer le devis
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main screen ──────────────────────────────────────────────────
export default function DevisScreen() {
  const { profile } = useAuthStore()
  const { hasAccess } = usePlan()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [showModal, setShowModal] = useState(false)

  const { data: devisList = [], isLoading } = useQuery<Devis[]>({
    queryKey: ['devis', profile?.id],
    enabled: !!profile?.id,
    staleTime: 0,
    queryFn: async () => {
      const { data } = await supabase.from('devis').select('*').eq('user_id', profile!.id).order('created_at', { ascending: false })
      return (data ?? []) as Devis[]
    },
  })

  const { data: leads = [] } = useQuery<Lead[]>({
    queryKey: ['leads', profile?.id],
    enabled: !!profile?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('leads').select('id,company,city,contact_name,email,address').eq('user_id', profile!.id)
      return (data ?? []) as Lead[]
    },
  })

  const updateStatut = useMutation({
    mutationFn: async ({ id, statut }: { id: string; statut: DevisStatut }) => {
      await supabase.from('devis').update({ statut, updated_at: new Date().toISOString() }).eq('id', id)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['devis', profile?.id] }),
  })

  const handlePDF = (d: Devis) => {
    const lead = leads.find(l => l.id === d.lead_id)
    generateDevisPDF(d, profile ?? {}, lead?.company ?? 'Client', lead?.city)
  }

  return (
    <div className="min-h-full bg-bg flex flex-col">

      {/* Header */}
      <div className="px-4 pt-6 pb-3 flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl text-text">Devis</h1>
          <p className="text-text2 text-sm">{devisList.length} devis au total</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-green text-bg font-bold text-sm px-4 py-2.5 rounded-xl flex items-center gap-2 hover:bg-green2 transition-colors shadow-md shadow-green/20"
        >
          <Plus size={16} /> Nouveau
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 pb-6">
        <LockedFeature
          feature="devis_generator"
          message="La génération de devis IA est disponible à partir du plan Pro."
          onUpgrade={() => navigate('/compte')}
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-border border-t-green rounded-full animate-spin" />
            </div>
          ) : devisList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 bg-bg2 border border-border rounded-2xl flex items-center justify-center mb-4">
                <FileText size={22} className="text-text3" />
              </div>
              <p className="text-sm font-medium text-text mb-1">Aucun devis</p>
              <p className="text-xs text-text3 mb-5">Crée ton premier devis en quelques secondes avec l'IA</p>
              <button
                onClick={() => setShowModal(true)}
                className="bg-green text-bg text-xs font-bold py-2.5 px-5 rounded-xl hover:bg-green2 transition-colors"
              >
                Créer un devis
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {devisList.map(d => {
                const cfg  = STATUT[d.statut] ?? STATUT.brouillon
                const lead = leads.find(l => l.id === d.lead_id)
                return (
                  <div key={d.id} className="bg-bg2 border border-border rounded-2xl p-4">

                    {/* Header row */}
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-10 h-10 bg-gdim border border-green/20 rounded-xl flex items-center justify-center flex-shrink-0">
                        <FileText size={16} className="text-green" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="font-mono text-xs text-text3">{d.numero}</span>
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${cfg.cls}`}>{cfg.label}</span>
                        </div>
                        <p className="text-sm font-semibold text-text truncate">{d.objet ?? lead?.company ?? '—'}</p>
                        {lead && <p className="text-xs text-text2">{lead.company} · {lead.city}</p>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-display font-bold text-green">{eur(d.montant_ttc)}</p>
                        <p className="text-[10px] text-text3 font-mono">TTC</p>
                      </div>
                    </div>

                    {/* Statut buttons */}
                    <div className="flex gap-1.5 mb-3">
                      {(['brouillon', 'envoye', 'accepte', 'refuse'] as DevisStatut[]).map(s => (
                        <button
                          key={s}
                          onClick={() => updateStatut.mutate({ id: d.id, statut: s })}
                          className={`flex-1 text-[10px] font-mono py-1.5 rounded-lg border transition-colors ${
                            d.statut === s ? STATUT[s].cls : 'text-text3 bg-bg3 border-border hover:border-border2'
                          }`}
                        >
                          {STATUT[s].label}
                        </button>
                      ))}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handlePDF(d)}
                        className="flex-1 flex items-center justify-center gap-2 bg-bg3 border border-border text-text2 text-xs font-mono py-2.5 rounded-xl hover:border-border2 transition-colors"
                      >
                        <Download size={13} /> Aperçu PDF
                      </button>
                    </div>

                    <p className="text-[10px] font-mono text-text3 mt-2 text-right">
                      {new Date(d.created_at).toLocaleDateString('fr-FR')} · Valable {d.validite_jours} jours
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </LockedFeature>
      </div>

      {showModal && (
        <NewDevisModal
          leads={leads}
          devisList={devisList}
          onClose={() => setShowModal(false)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ['devis', profile?.id] })}
        />
      )}
    </div>
  )
}
