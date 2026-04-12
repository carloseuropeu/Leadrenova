import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MapPin, Navigation, Layers, List } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { usePlan } from '@/hooks/usePlan'
import LockedFeature from '@/components/ui/LockedFeature'
import { supabase } from '@/lib/supabase'
import type { Lead } from '@/lib/supabase'

// ── Score helpers ─────────────────────────────────────────────────
function scoreColor(score: number): string {
  if (score >= 80) return '#4ade80'  // green
  if (score >= 60) return '#fbbf24'  // amber
  return '#f87171'                   // red
}

function scoreBg(score: number): string {
  if (score >= 80) return 'bg-gdim border-green/30 text-green'
  if (score >= 60) return 'bg-adim border-amber/30 text-amber'
  return 'bg-rdim border-red/30 text-red'
}

// ── Haversine distance (km) ──────────────────────────────────────
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Mock map component ────────────────────────────────────────────
// Renders a stylised dark map with SVG pins at relative positions.
// Coordinates are normalised from lat/lng to a 0-100 % canvas.
function MockMap({
  leads,
  rayon,
  focusedId,
  onPinClick,
}: {
  leads: Lead[]
  rayon: number
  focusedId: string | null
  onPinClick: (id: string) => void
}) {
  // Build a bounding box from actual lead coords (fallback to France bounds)
  const lats = leads.filter(l => l.lat).map(l => l.lat!)
  const lngs = leads.filter(l => l.lng).map(l => l.lng!)

  const minLat = lats.length ? Math.min(...lats) - 0.3 : 43.0
  const maxLat = lats.length ? Math.max(...lats) + 0.3 : 49.0
  const minLng = lngs.length ? Math.min(...lngs) - 0.3 : -1.5
  const maxLng = lngs.length ? Math.max(...lngs) + 0.3 : 7.5

  const toXY = (lat: number, lng: number) => ({
    x: ((lng - minLng) / (maxLng - minLng)) * 100,
    y: ((maxLat - lat) / (maxLat - minLat)) * 100,
  })

  // Fallback mock positions when no real coords
  const mockPositions: Record<string, { x: number; y: number }> = {}
  leads.forEach((l, i) => {
    if (!l.lat || !l.lng) {
      mockPositions[l.id] = {
        x: 15 + ((i * 37) % 70),
        y: 15 + ((i * 53) % 70),
      }
    }
  })

  return (
    <div className="relative w-full bg-bg3 border border-border rounded-2xl overflow-hidden" style={{ paddingBottom: '60%' }}>
      {/* Grid lines — mock map texture */}
      <svg
        className="absolute inset-0 w-full h-full opacity-10"
        viewBox="0 0 100 60"
        preserveAspectRatio="none"
      >
        {/* Grid */}
        {Array.from({ length: 10 }).map((_, i) => (
          <line key={`v${i}`} x1={i * 10} y1={0} x2={i * 10} y2={60} stroke="#4ade80" strokeWidth={0.3} />
        ))}
        {Array.from({ length: 6 }).map((_, i) => (
          <line key={`h${i}`} x1={0} y1={i * 10} x2={100} y2={i * 10} stroke="#4ade80" strokeWidth={0.3} />
        ))}
        {/* Road-like lines */}
        <path d="M0,30 Q25,20 50,30 T100,25" stroke="#4ade80" strokeWidth={0.5} fill="none" />
        <path d="M20,0 Q30,15 25,30 T30,60" stroke="#4ade80" strokeWidth={0.5} fill="none" />
        <path d="M60,0 Q55,20 65,30 T60,60" stroke="#4ade80" strokeWidth={0.3} fill="none" />
        <path d="M0,45 Q40,40 70,50 T100,42" stroke="#4ade80" strokeWidth={0.3} fill="none" />
      </svg>

      {/* Zone radius circle */}
      <div
        className="absolute border-2 border-green/20 rounded-full bg-green/5 pointer-events-none"
        style={{
          width: `${Math.min(rayon * 0.6, 70)}%`,
          paddingBottom: `${Math.min(rayon * 0.6, 70)}%`,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      />

      {/* Lead pins */}
      {leads.map(lead => {
        const pos = lead.lat && lead.lng
          ? toXY(lead.lat, lead.lng)
          : (mockPositions[lead.id] ?? { x: 50, y: 50 })
        const isFocused = focusedId === lead.id
        const color = scoreColor(lead.renovation_score)

        return (
          <button
            key={lead.id}
            onClick={() => onPinClick(lead.id)}
            className="absolute -translate-x-1/2 -translate-y-full transition-transform hover:scale-125 focus:outline-none"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            aria-label={lead.company}
          >
            {/* Pin shape */}
            <div className={`relative flex flex-col items-center transition-transform ${isFocused ? 'scale-150' : ''}`}>
              <div
                className="w-6 h-6 rounded-full border-2 border-bg flex items-center justify-center shadow-md"
                style={{ backgroundColor: color }}
              >
                <span className="text-bg text-[8px] font-bold">{lead.renovation_score}</span>
              </div>
              <div
                className="w-1 h-2 rounded-b-full"
                style={{ backgroundColor: color }}
              />
            </div>
          </button>
        )
      })}

      {/* Centre marker */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-green rounded-full border-2 border-bg shadow-lg shadow-green/40 pointer-events-none" />

      {/* Legend */}
      <div className="absolute bottom-3 right-3 bg-bg2/90 backdrop-blur border border-border rounded-xl px-3 py-2 flex gap-3">
        {[['≥80', 'bg-green'], ['60–79', 'bg-amber'], ['<60', 'bg-red']].map(([label, cls]) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${cls}`} />
            <span className="text-[10px] font-mono text-text3">{label}</span>
          </div>
        ))}
      </div>

      {/* Google Maps CTA */}
      <div className="absolute top-3 left-3 bg-bg2/90 backdrop-blur border border-border rounded-xl px-3 py-1.5">
        <span className="text-[10px] font-mono text-text3">Carte simulée · Google Maps bientôt</span>
      </div>
    </div>
  )
}

// ── Main screen ───────────────────────────────────────────────────
export default function Carte() {
  const { profile } = useAuthStore()
  const { hasAccess } = usePlan()

  const [rayon, setRayon]         = useState(profile?.rayon_km ?? 50)
  const [view, setView]           = useState<'map' | 'list'>('map')
  const [focusedId, setFocusedId] = useState<string | null>(null)

  const { data: leads = [], isLoading } = useQuery<Lead[]>({
    queryKey: ['leads', profile?.id],
    enabled: !!profile?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('leads')
        .select('*')
        .eq('user_id', profile!.id)
        .order('renovation_score', { ascending: false })
      return (data ?? []) as Lead[]
    },
  })

  // Sort by distance from profile zone (mock: use lat/lng if present, else just keep order)
  const centreCoords = useMemo(() => {
    const leadsWithCoords = leads.filter(l => l.lat && l.lng)
    if (!leadsWithCoords.length) return null
    const avgLat = leadsWithCoords.reduce((s, l) => s + l.lat!, 0) / leadsWithCoords.length
    const avgLng = leadsWithCoords.reduce((s, l) => s + l.lng!, 0) / leadsWithCoords.length
    return { lat: avgLat, lng: avgLng }
  }, [leads])

  const sortedLeads = useMemo(() => {
    if (!centreCoords) return leads
    return [...leads].sort((a, b) => {
      const da = a.lat && a.lng ? haversine(centreCoords.lat, centreCoords.lng, a.lat, a.lng) : 9999
      const db = b.lat && b.lng ? haversine(centreCoords.lat, centreCoords.lng, b.lat, b.lng) : 9999
      return da - db
    })
  }, [leads, centreCoords])

  const filteredByRadius = useMemo(() => {
    if (!centreCoords) return sortedLeads
    return sortedLeads.filter(l => {
      if (!l.lat || !l.lng) return true
      return haversine(centreCoords.lat, centreCoords.lng, l.lat, l.lng) <= rayon
    })
  }, [sortedLeads, centreCoords, rayon])

  const focusedLead = leads.find(l => l.id === focusedId)

  return (
    <div className="min-h-full bg-bg flex flex-col">

      {/* Header */}
      <div className="px-4 pt-6 pb-3">
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-display font-bold text-2xl text-text">Carte</h1>
          {/* View toggle */}
          <div className="flex bg-bg2 border border-border rounded-xl p-0.5">
            <button
              onClick={() => setView('map')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                view === 'map' ? 'bg-bg3 text-text' : 'text-text3 hover:text-text2'
              }`}
            >
              <Layers size={13} />
              Carte
            </button>
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                view === 'list' ? 'bg-bg3 text-text' : 'text-text3 hover:text-text2'
              }`}
            >
              <List size={13} />
              Liste
            </button>
          </div>
        </div>
        <p className="text-text2 text-sm">
          {filteredByRadius.length} lead{filteredByRadius.length !== 1 ? 's' : ''} dans un rayon de {rayon} km
        </p>
      </div>

      {/* Radius slider */}
      <div className="px-4 pb-3">
        <div className="bg-bg2 border border-border rounded-xl px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Navigation size={13} className="text-text3" />
              <span className="text-xs font-mono text-text2">Rayon</span>
            </div>
            <span className="font-display font-bold text-green text-base">{rayon} km</span>
          </div>
          <input
            type="range"
            min={20}
            max={150}
            step={5}
            value={rayon}
            onChange={e => setRayon(Number(e.target.value))}
            className="w-full h-1.5 bg-bg3 rounded-full appearance-none cursor-pointer accent-green"
          />
          <div className="flex justify-between mt-1.5">
            {[20, 50, 100, 150].map(v => (
              <button
                key={v}
                onClick={() => setRayon(v)}
                className={`text-[11px] font-mono transition-colors ${rayon === v ? 'text-green' : 'text-text3'}`}
              >
                {v}km
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Locked content for non-Pro users */}
      <div className="flex-1 px-4 pb-6">
        <LockedFeature
          feature="map_full"
          message="La carte interactive est disponible dans le plan Pro. Visualise tes leads sur une carte et filtre par zone."
        >
          {/* === PRO+ CONTENT === */}
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-border border-t-green rounded-full animate-spin" />
            </div>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 bg-bg2 border border-border rounded-2xl flex items-center justify-center mb-4">
                <MapPin size={22} className="text-text3" />
              </div>
              <p className="text-sm font-medium text-text mb-1">Aucun lead sur la carte</p>
              <p className="text-xs text-text3">Lance une prospection pour voir tes leads ici</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Map view */}
              {view === 'map' && (
                <>
                  <MockMap
                    leads={filteredByRadius}
                    rayon={rayon}
                    focusedId={focusedId}
                    onPinClick={id => setFocusedId(prev => prev === id ? null : id)}
                  />

                  {/* Focused lead info */}
                  {focusedLead && (
                    <div className="bg-bg2 border border-green/20 rounded-2xl p-4 flex items-center gap-3">
                      <div className="w-10 h-10 bg-gdim border border-green/20 rounded-xl flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-green">
                          {focusedLead.company.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-text">{focusedLead.company}</p>
                        <p className="text-xs text-text2">{focusedLead.city} · {focusedLead.type}</p>
                      </div>
                      <div className={`text-xs font-mono font-bold px-2.5 py-1 rounded-full border ${scoreBg(focusedLead.renovation_score)}`}>
                        {focusedLead.renovation_score}
                      </div>
                      <button
                        onClick={() => setFocusedId(null)}
                        className="text-text3 hover:text-text2 ml-1"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* List view — sorted by distance */}
              {view === 'list' && (
                <div className="space-y-2">
                  {filteredByRadius.map((lead, idx) => {
                    const dist = centreCoords && lead.lat && lead.lng
                      ? haversine(centreCoords.lat, centreCoords.lng, lead.lat, lead.lng).toFixed(1)
                      : null

                    return (
                      <div
                        key={lead.id}
                        className="bg-bg2 border border-border rounded-xl p-4 flex items-center gap-3"
                      >
                        {/* Rank */}
                        <div className="w-7 text-center">
                          <span className="text-xs font-mono text-text3">{idx + 1}</span>
                        </div>

                        {/* Avatar */}
                        <div className="w-9 h-9 bg-bg3 border border-border rounded-xl flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-text2">
                            {lead.company.charAt(0).toUpperCase()}
                          </span>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text truncate">{lead.company}</p>
                          <div className="flex items-center gap-2 text-xs text-text2 mt-0.5">
                            <MapPin size={10} className="text-text3 flex-shrink-0" />
                            <span className="truncate">{lead.city}</span>
                            {dist && (
                              <>
                                <span className="text-text3">·</span>
                                <span className="text-text3 flex-shrink-0">{dist} km</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Score */}
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${scoreBg(lead.renovation_score)}`}>
                          {lead.renovation_score}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </LockedFeature>
      </div>
    </div>
  )
}
