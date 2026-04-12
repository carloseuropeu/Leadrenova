import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ArrowLeft, MapPin, Check } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

const METIERS = [
  { id: 'carreleur',     label: 'Carreleur',     emoji: '🪨' },
  { id: 'plombier',      label: 'Plombier',      emoji: '🔧' },
  { id: 'peintre',       label: 'Peintre',       emoji: '🖌️' },
  { id: 'electricien',   label: 'Électricien',   emoji: '⚡' },
  { id: 'macon',         label: 'Maçon',         emoji: '🏗️' },
  { id: 'menuisier',     label: 'Menuisier',     emoji: '🪵' },
  { id: 'couvreur',      label: 'Couvreur',      emoji: '🏠' },
  { id: 'chauffagiste',  label: 'Chauffagiste',  emoji: '🔥' },
  { id: 'plaquier',      label: 'Plaquier',      emoji: '🧱' },
]

const RADIUS_MARKS = [20, 50, 100, 150]

export default function Onboarding() {
  const navigate = useNavigate()
  const { updateProfile } = useAuthStore()

  const [step, setStep]           = useState(1)
  const [metiers, setMetiers]     = useState<string[]>([])
  const [zone, setZone]           = useState('')
  const [rayon, setRayon]         = useState(50)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  const toggleMetier = (id: string) => {
    setMetiers(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    )
  }

  const handleFinish = async () => {
    if (!zone.trim()) { setError('Indique ta zone de travail'); return }
    setError('')
    setLoading(true)
    try {
      await updateProfile({
        metiers,
        zone_principale: zone.trim(),
        rayon_km: rayon,
      })
      navigate('/dashboard')
    } catch {
      setError('Erreur lors de la sauvegarde. Réessaie.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col px-6 pt-10 pb-8 relative overflow-hidden">
      {/* Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-green/5 rounded-full blur-3xl pointer-events-none" />

      {/* Progress */}
      <div className="relative z-10 mb-8">
        <div className="flex items-center gap-2 mb-6">
          {step > 1 && (
            <button
              onClick={() => setStep(1)}
              className="text-text3 hover:text-text2 transition-colors"
              aria-label="Étape précédente"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="flex-1 flex gap-2">
            {[1, 2].map(n => (
              <div
                key={n}
                className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                  n <= step ? 'bg-green' : 'bg-border'
                }`}
              />
            ))}
          </div>
          <span className="text-xs font-mono text-text3">{step}/2</span>
        </div>

        <p className="text-green text-xs font-mono uppercase tracking-widest mb-2">
          {step === 1 ? 'Étape 1 — Ton métier' : 'Étape 2 — Ta zone'}
        </p>
        <h1 className="font-display font-bold text-2xl text-text">
          {step === 1
            ? 'Quel est ton métier ?'
            : 'Où travailles-tu ?'}
        </h1>
        <p className="text-text2 text-sm mt-1">
          {step === 1
            ? 'Sélectionne un ou plusieurs métiers'
            : 'Définis ta zone principale de prospection'}
        </p>
      </div>

      {/* Step 1 — Métiers grid */}
      {step === 1 && (
        <div className="relative z-10 flex-1">
          <div className="grid grid-cols-3 gap-3 mb-6">
            {METIERS.map(({ id, label, emoji }) => {
              const selected = metiers.includes(id)
              return (
                <button
                  key={id}
                  onClick={() => toggleMetier(id)}
                  className={`relative flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
                    selected
                      ? 'bg-gdim border-green/40 shadow-lg shadow-green/10'
                      : 'bg-bg2 border-border hover:border-border2'
                  }`}
                >
                  {selected && (
                    <div className="absolute top-2 right-2 w-4 h-4 bg-green rounded-full flex items-center justify-center">
                      <Check size={10} className="text-bg" strokeWidth={3} />
                    </div>
                  )}
                  <span className="text-2xl">{emoji}</span>
                  <span className={`text-xs font-medium text-center leading-tight ${selected ? 'text-green' : 'text-text2'}`}>
                    {label}
                  </span>
                </button>
              )
            })}
          </div>

          <button
            onClick={() => { if (metiers.length > 0) setStep(2) }}
            disabled={metiers.length === 0}
            className="w-full bg-green text-bg font-bold py-4 rounded-2xl flex items-center justify-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-green2 transition-colors shadow-lg shadow-green/20"
          >
            Continuer
            <ArrowRight size={18} />
          </button>

          {metiers.length === 0 && (
            <p className="text-center text-xs text-text3 mt-3">
              Sélectionne au moins un métier
            </p>
          )}
        </div>
      )}

      {/* Step 2 — Zone + rayon */}
      {step === 2 && (
        <div className="relative z-10 flex-1 flex flex-col">
          <div className="flex-1 space-y-6">

            {/* Zone input */}
            <div>
              <label className="text-[11px] font-mono text-text2 uppercase tracking-wide block mb-2">
                Ville ou code postal
              </label>
              <div className="relative">
                <MapPin size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-text3" />
                <input
                  type="text"
                  value={zone}
                  onChange={e => setZone(e.target.value)}
                  placeholder="ex: Paris, Lyon, 69000..."
                  autoFocus
                  className="w-full bg-bg2 border border-border focus:border-green/50 rounded-xl pl-10 pr-4 py-3.5 text-sm text-text placeholder-text3 outline-none transition-colors"
                />
              </div>
            </div>

            {/* Radius slider */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] font-mono text-text2 uppercase tracking-wide">
                  Rayon de prospection
                </label>
                <span className="font-display font-bold text-green text-lg">{rayon} km</span>
              </div>

              <input
                type="range"
                min={20}
                max={150}
                step={5}
                value={rayon}
                onChange={e => setRayon(Number(e.target.value))}
                className="w-full h-2 bg-bg3 rounded-full appearance-none cursor-pointer accent-green"
              />

              <div className="flex justify-between mt-2">
                {RADIUS_MARKS.map(mark => (
                  <button
                    key={mark}
                    onClick={() => setRayon(mark)}
                    className={`text-xs font-mono px-2 py-0.5 rounded-full transition-colors ${
                      rayon === mark
                        ? 'text-green bg-gdim'
                        : 'text-text3 hover:text-text2'
                    }`}
                  >
                    {mark}km
                  </button>
                ))}
              </div>
            </div>

            {/* Summary card */}
            <div className="bg-bg2 border border-border rounded-2xl p-4">
              <p className="text-xs font-mono text-text3 uppercase tracking-wide mb-3">Récapitulatif</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-text3 text-xs font-mono w-16">Métiers</span>
                  <div className="flex flex-wrap gap-1.5">
                    {metiers.map(m => (
                      <span key={m} className="text-[11px] font-mono text-green bg-gdim border border-green/20 rounded-full px-2 py-0.5 capitalize">
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
                {zone && (
                  <div className="flex items-center gap-2">
                    <span className="text-text3 text-xs font-mono w-16">Zone</span>
                    <span className="text-text text-xs">{zone}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-text3 text-xs font-mono w-16">Rayon</span>
                  <span className="text-text text-xs">{rayon} km</span>
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-rdim border border-red/20 rounded-xl px-4 py-3 text-xs text-red">
                {error}
              </div>
            )}
          </div>

          <button
            onClick={handleFinish}
            disabled={loading || !zone.trim()}
            className="w-full bg-green text-bg font-bold py-4 rounded-2xl flex items-center justify-center gap-2 text-sm mt-6 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-green2 transition-colors shadow-lg shadow-green/20"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-bg/30 border-t-bg rounded-full animate-spin" />
            ) : (
              <>
                Commencer à prospecter
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
