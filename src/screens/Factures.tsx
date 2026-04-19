import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Receipt, Download, ArrowRight, Loader2, Check, AlertTriangle, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import LockedFeature from '@/components/ui/LockedFeature'
import { supabase } from '@/lib/supabase'
import { generateFacturePDF } from '@/lib/pdf'
import type { Devis, Facture, Lead, FactureStatut } from '@/lib/supabase'

// ── Statut config ────────────────────────────────────────────────
const STATUT: Record<FactureStatut, { label: string; cls: string }> = {
  brouillon: { label: 'Brouillon', cls: 'text-text3 bg-bg3  border-border'           },
  envoyee:   { label: 'Envoyée',   cls: 'text-blue  bg-bdim border-blue/20'          },
  payee:     { label: 'Payée',     cls: 'text-green bg-gdim border-green/20'         },
  retard:    { label: 'Retard',    cls: 'text-red   bg-rdim border-red/20'           },
  annulee:   { label: 'Annulée',   cls: 'text-text3 bg-bg3  border-border'           },
}

const eur = (n: number) => n.toFixed(2).replace('.', ',') + ' €'

function nextNumero(list: Facture[]): string {
  const year = new Date().getFullYear()
  const nums = list.map(f => { const m = f.numero.match(/FAC-\d+-(\d+)/); return m ? parseInt(m[1], 10) : 0 })
  const next = nums.length ? Math.max(...nums) + 1 : 1
  return `FAC-${year}-${String(next).padStart(3, '0')}`
}

function addDays(date: Date, days: number): string {
  const d = new Date(date); d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

// ── Facture detail modal (edit dates / mark paid) ────────────────
function FactureModal({ facture, leads, onClose, onUpdate }: {
  facture: Facture
  leads: Lead[]
  onClose: () => void
  onUpdate: () => void
}) {
  const [echeance,    setEcheance]    = useState(facture.date_echeance)
  const [paiement,    setPaiement]    = useState(facture.date_paiement ?? '')
  const [notes,       setNotes]       = useState(facture.notes ?? '')
  const [saving,      setSaving]      = useState(false)

  const lead = leads.find(l => l.id === facture.lead_id)

  const save = async () => {
    setSaving(true)
    await supabase.from('factures').update({
      date_echeance: echeance,
      date_paiement: paiement || null,
      notes:         notes || null,
      statut:        paiement ? 'payee' : facture.statut,
      updated_at:    new Date().toISOString(),
    }).eq('id', facture.id)
    setSaving(false)
    onUpdate()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-bg/90 backdrop-blur-sm z-50 flex items-end">
      <div className="w-full max-w-lg mx-auto bg-bg2 border border-border rounded-t-3xl overflow-hidden max-h-[80vh] flex flex-col">
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-border rounded-full" /></div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <p className="font-mono text-xs text-text3">{facture.numero}</p>
            <h2 className="font-display font-bold text-base text-text">{facture.objet ?? lead?.company ?? '—'}</h2>
          </div>
          <button onClick={onClose}><X size={18} className="text-text3" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Lignes summary */}
          <div className="bg-bg3 border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b border-border flex justify-between text-[10px] font-mono text-text3 uppercase">
              <span>Prestation</span><span>Total HT</span>
            </div>
            {facture.lignes.map((l, i) => (
              <div key={i} className="px-4 py-2.5 flex justify-between text-xs border-b border-border last:border-0">
                <span className="text-text truncate max-w-[200px]">{l.description}</span>
                <span className="font-mono text-text2 flex-shrink-0 ml-2">{eur(l.total_ht)}</span>
              </div>
            ))}
            <div className="px-4 py-2.5 flex justify-between font-bold text-sm border-t border-border bg-gdim/30">
              <span className="text-text">TOTAL TTC</span>
              <span className="font-mono text-green">{eur(facture.montant_ttc)}</span>
            </div>
          </div>

          {/* Date échéance */}
          <div>
            <label className="text-[11px] font-mono text-text3 uppercase tracking-wide mb-1.5 block">Date d'échéance</label>
            <input
              type="date" value={echeance}
              onChange={e => setEcheance(e.target.value)}
              className="w-full bg-bg3 border border-border focus:border-green/50 rounded-xl px-4 py-3 text-sm text-text outline-none"
            />
          </div>

          {/* Date paiement */}
          <div>
            <label className="text-[11px] font-mono text-text3 uppercase tracking-wide mb-1.5 block">
              Date de paiement <span className="normal-case text-text3">(renseigner pour marquer Payée)</span>
            </label>
            <input
              type="date" value={paiement}
              onChange={e => setPaiement(e.target.value)}
              className="w-full bg-bg3 border border-border focus:border-green/50 rounded-xl px-4 py-3 text-sm text-text outline-none"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-[11px] font-mono text-text3 uppercase tracking-wide mb-1.5 block">Notes</label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full bg-bg3 border border-border focus:border-green/50 rounded-xl px-4 py-3 text-sm text-text placeholder-text3 outline-none resize-none"
            />
          </div>
        </div>

        <div className="p-5 border-t border-border">
          <button
            onClick={save}
            disabled={saving}
            className="w-full bg-green text-bg font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-green2 transition-colors disabled:opacity-40"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main screen ──────────────────────────────────────────────────
export default function Factures() {
  const { profile } = useAuthStore()
  const navigate    = useNavigate()
  const queryClient = useQueryClient()

  const [selectedFacture, setSelectedFacture] = useState<Facture | null>(null)

  const { data: facturesList = [], isLoading: loadingFactures } = useQuery<Facture[]>({
    queryKey: ['factures', profile?.id],
    enabled:  !!profile?.id,
    staleTime: 0,
    queryFn: async () => {
      const { data } = await supabase.from('factures').select('*').eq('user_id', profile!.id).order('created_at', { ascending: false })
      return (data ?? []) as Facture[]
    },
  })

  const { data: devisList = [] } = useQuery<Devis[]>({
    queryKey: ['devis', profile?.id],
    enabled:  !!profile?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase.from('devis').select('*').eq('user_id', profile!.id)
      return (data ?? []) as Devis[]
    },
  })

  const { data: leads = [] } = useQuery<Lead[]>({
    queryKey: ['leads', profile?.id],
    enabled:  !!profile?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('leads').select('id,company,city,address').eq('user_id', profile!.id)
      return (data ?? []) as Lead[]
    },
  })

  // Devis acceptés sans facture → à facturer
  const devisAFacturer = devisList.filter(d =>
    d.statut === 'accepte' && !facturesList.some(f => f.devis_id === d.id)
  )

  const convertMutation = useMutation({
    mutationFn: async (d: Devis) => {
      const today = new Date()
      const now   = today.toISOString()
      await supabase.from('factures').insert({
        user_id:       profile!.id,
        lead_id:       d.lead_id,
        devis_id:      d.id,
        numero:        nextNumero(facturesList),
        objet:         d.objet,
        lignes:        d.lignes,
        montant_ht:    d.montant_ht,
        tva_rate:      d.tva_rate,
        montant_tva:   d.montant_tva,
        montant_ttc:   d.montant_ttc,
        statut:        'envoyee',
        date_emission: today.toISOString().split('T')[0],
        date_echeance: addDays(today, 30),
        notes:         d.notes,
        created_at:    now,
        updated_at:    now,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['factures', profile?.id] })
      queryClient.invalidateQueries({ queryKey: ['devis',   profile?.id] })
    },
  })

  const updateStatut = useMutation({
    mutationFn: async ({ id, statut }: { id: string; statut: FactureStatut }) => {
      const patch: Record<string, unknown> = { statut, updated_at: new Date().toISOString() }
      if (statut === 'payee') patch.date_paiement = new Date().toISOString().split('T')[0]
      await supabase.from('factures').update(patch).eq('id', id)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['factures', profile?.id] }),
  })

  const handlePDF = (f: Facture) => {
    const lead = leads.find(l => l.id === f.lead_id)
    generateFacturePDF(f, profile ?? {}, lead?.company ?? 'Client', lead?.city)
  }

  // Check overdue factures (envoyee + date_echeance < today)
  const today = new Date().toISOString().split('T')[0]
  const overdueIds = new Set(
    facturesList
      .filter(f => f.statut === 'envoyee' && f.date_echeance < today)
      .map(f => f.id)
  )

  return (
    <div className="min-h-full bg-bg flex flex-col">

      {/* Header */}
      <div className="px-4 pt-6 pb-3 flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl text-text">Factures</h1>
          <p className="text-text2 text-sm">{facturesList.length} factures au total</p>
        </div>
      </div>

      <div className="flex-1 px-4 pb-6 space-y-4">
        <LockedFeature
          feature="factures"
          message="La facturation légale est disponible dans le plan Business."
          onUpgrade={() => navigate('/compte')}
        >

          {/* Devis à facturer */}
          {devisAFacturer.length > 0 && (
            <div>
              <p className="text-[11px] font-mono text-text3 uppercase tracking-wide mb-2">À facturer</p>
              <div className="space-y-2">
                {devisAFacturer.map(d => {
                  const lead = leads.find(l => l.id === d.lead_id)
                  return (
                    <div key={d.id} className="bg-gdim border border-green/20 rounded-xl px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-text truncate">{d.objet ?? lead?.company ?? d.numero}</p>
                        <p className="text-xs text-text2 font-mono">{d.numero} · {eur(d.montant_ttc)}</p>
                      </div>
                      <button
                        onClick={() => convertMutation.mutate(d)}
                        disabled={convertMutation.isPending}
                        className="flex items-center gap-1.5 bg-green text-bg text-xs font-bold px-3 py-2 rounded-xl hover:bg-green2 transition-colors flex-shrink-0 disabled:opacity-50"
                      >
                        {convertMutation.isPending
                          ? <Loader2 size={12} className="animate-spin" />
                          : <><ArrowRight size={12} /> Facturer</>}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Overdue alerts */}
          {overdueIds.size > 0 && (
            <div className="bg-adim border border-amber/20 rounded-xl px-4 py-3 flex items-start gap-3">
              <AlertTriangle size={15} className="text-amber flex-shrink-0 mt-0.5" />
              <p className="text-xs text-text2">
                <span className="text-amber font-bold">{overdueIds.size} facture{overdueIds.size > 1 ? 's' : ''} en retard</span>
                {' '}— échéance dépassée
              </p>
            </div>
          )}

          {/* Factures list */}
          {loadingFactures ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-border border-t-green rounded-full animate-spin" />
            </div>
          ) : facturesList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 bg-bg2 border border-border rounded-2xl flex items-center justify-center mb-4">
                <Receipt size={22} className="text-text3" />
              </div>
              <p className="text-sm font-medium text-text mb-1">Aucune facture</p>
              <p className="text-xs text-text3">Accepte un devis pour créer ta première facture</p>
            </div>
          ) : (
            <div className="space-y-3">
              {facturesList.map(f => {
                const cfg  = STATUT[f.statut] ?? STATUT.brouillon
                const lead = leads.find(l => l.id === f.lead_id)
                const isOverdue = overdueIds.has(f.id)
                return (
                  <div
                    key={f.id}
                    className={`bg-bg2 border rounded-2xl p-4 ${isOverdue ? 'border-amber/30' : 'border-border'}`}
                  >
                    {/* Header */}
                    <div className="flex items-start gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        f.statut === 'payee' ? 'bg-gdim border border-green/20' : 'bg-bg3 border border-border'
                      }`}>
                        <Receipt size={16} className={f.statut === 'payee' ? 'text-green' : 'text-text3'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="font-mono text-xs text-text3">{f.numero}</span>
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${cfg.cls}`}>{cfg.label}</span>
                          {isOverdue && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border bg-adim border-amber/20 text-amber">
                              Retard
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-text truncate">{f.objet ?? lead?.company ?? '—'}</p>
                        {lead && <p className="text-xs text-text2">{lead.company} · {lead.city}</p>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-display font-bold text-green">{eur(f.montant_ttc)}</p>
                        <p className="text-[10px] text-text3 font-mono">TTC</p>
                      </div>
                    </div>

                    {/* Dates */}
                    <div className="flex gap-4 text-[11px] font-mono text-text3 mb-3">
                      <span>Émise le {new Date(f.date_emission).toLocaleDateString('fr-FR')}</span>
                      <span>· Échéance {new Date(f.date_echeance).toLocaleDateString('fr-FR')}</span>
                    </div>

                    {/* Quick statut buttons */}
                    <div className="flex gap-1.5 mb-3">
                      {(['envoyee', 'payee', 'retard', 'annulee'] as FactureStatut[]).map(s => (
                        <button
                          key={s}
                          onClick={() => updateStatut.mutate({ id: f.id, statut: s })}
                          className={`flex-1 text-[10px] font-mono py-1.5 rounded-lg border transition-colors ${
                            f.statut === s ? STATUT[s].cls : 'text-text3 bg-bg3 border-border hover:border-border2'
                          }`}
                        >
                          {STATUT[s].label}
                        </button>
                      ))}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedFacture(f)}
                        className="flex-1 flex items-center justify-center gap-2 bg-bg3 border border-border text-text2 text-xs font-mono py-2.5 rounded-xl hover:border-border2 transition-colors"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => handlePDF(f)}
                        className="flex-1 flex items-center justify-center gap-2 bg-bg3 border border-border text-text2 text-xs font-mono py-2.5 rounded-xl hover:border-border2 transition-colors"
                      >
                        <Download size={13} /> PDF
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </LockedFeature>
      </div>

      {selectedFacture && (
        <FactureModal
          facture={selectedFacture}
          leads={leads}
          onClose={() => setSelectedFacture(null)}
          onUpdate={() => queryClient.invalidateQueries({ queryKey: ['factures', profile?.id] })}
        />
      )}
    </div>
  )
}
