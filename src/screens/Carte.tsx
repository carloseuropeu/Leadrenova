import { useState, useMemo, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  GoogleMap,
  useJsApiLoader,
  MarkerF,
  InfoWindowF,
} from '@react-google-maps/api'
import { MapPin, Navigation, Layers, List } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { usePlan } from '@/hooks/usePlan'
import LockedFeature from '@/components/ui/LockedFeature'
import { supabase } from '@/lib/supabase'
import type { Lead } from '@/lib/supabase'

// ── Score helpers ─────────────────────────────────────────────────
function scoreColor(score: number): string {
  if (score >= 80) return '#4ade80'
  if (score >= 60) return '#fbbf24'
  return '#f87171'
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

// ── Dark map style ────────────────────────────────────────────────
const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#0a0f0a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0a0f0a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7a917a' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a261a' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0d140d' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#223322' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#060c06' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#0d140d' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#0d140d' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#1e2e1e' }] },
]

// ── Custom pin SVG icon ───────────────────────────────────────────
function pinIcon(color: string, score: number): google.maps.Symbol {
  return {
    path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
    fillColor: color,
    fillOpacity: 1,
    strokeColor: '#0a0f0a',
    strokeWeight: 1.5,
    scale: 1.6,
    anchor: new google.maps.Point(12, 22),
    labelOrigin: new google.maps.Point(12, 9),
  } as google.maps.Symbol
}

// ── Geocode a single lead address ────────────────────────────────
async function geocodeLead(lead: Lead, apiKey: string): Promise<{ lat: number; lng: number } | null> {
  const query = [lead.address, lead.city, 'France'].filter(Boolean).join(', ')
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`
  try {
    const res = await fetch(url)
    const data = await res.json()
    if (data.status === 'OK' && data.results[0]) {
      const { lat, lng } = data.results[0].geometry.location
      return { lat, lng }
    }
  } catch {
    // silently skip
  }
  return null
}

// ── Google Map component ─────────────────────────────────────────
const MAP_CONTAINER = { width: '100%', height: '420px' }
const FRANCE_CENTER = { lat: 46.5, lng: 2.3 }

function RealMap({
  leads,
  focusedId,
  onPinClick,
  apiKey,
}: {
  leads: Lead[]
  focusedId: string | null
  onPinClick: (id: string) => void
  apiKey: string
}) {
  const queryClient = useQueryClient()
  const geocodingRef = useRef(new Set<string>())

  const leadsWithCoords = leads.filter(l => l.lat && l.lng)

  const centre = useMemo(() => {
    if (!leadsWithCoords.length) return FRANCE_CENTER
    return {
      lat: leadsWithCoords.reduce((s, l) => s + l.lat!, 0) / leadsWithCoords.length,
      lng: leadsWithCoords.reduce((s, l) => s + l.lng!, 0) / leadsWithCoords.length,
    }
  }, [leadsWithCoords])

  // Geocode leads that have no coords, then persist to Supabase
  const geocodeMissing = useCallback(async () => {
    const missing = leads.filter(l => !l.lat || !l.lng)
    if (!missing.length) return

    for (const lead of missing) {
      if (geocodingRef.current.has(lead.id)) continue
      geocodingRef.current.add(lead.id)

      const coords = await geocodeLead(lead, apiKey)
      if (!coords) continue

      await supabase
        .from('leads')
        .update({ lat: coords.lat, lng: coords.lng })
        .eq('id', lead.id)
    }

    // Invalidate so map re-renders with new coords
    queryClient.invalidateQueries({ queryKey: ['leads'] })
  }, [leads, apiKey, queryClient])

  const handleMapLoad = useCallback(() => {
    geocodeMissing()
  }, [geocodeMissing])

  const focusedLead = leads.find(l => l.id === focusedId) ?? null

  return (
    <div className="rounded-2xl overflow-hidden border border-border">
      <GoogleMap
        mapContainerStyle={MAP_CONTAINER}
        center={centre}
        zoom={leadsWithCoords.length ? 10 : 6}
        options={{
          styles: DARK_MAP_STYLES,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
        }}
        onLoad={handleMapLoad}
      >
        {leadsWithCoords.map(lead => (
          <MarkerF
            key={lead.id}
            position={{ lat: lead.lat!, lng: lead.lng! }}
            icon={pinIcon(scoreColor(lead.renovation_score), lead.renovation_score)}
            label={{
              text: String(lead.renovation_score),
              color: '#0a0f0a',
              fontSize: '9px',
              fontWeight: 'bold',
            }}
            onClick={() => onPinClick(lead.id)}
          >
            {focusedId === lead.id && focusedLead && (
              <InfoWindowF
                position={{ lat: lead.lat!, lng: lead.lng! }}
                onCloseClick={() => onPinClick(lead.id)}
              >
                <div style={{ background: '#131a13', color: '#dfe8df', padding: '8px 12px', borderRadius: 8, minWidth: 140 }}>
                  <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{focusedLead.company}</p>
                  <p style={{ fontSize: 11, color: '#7a917a' }}>{focusedLead.city}</p>
                  <p style={{ fontSize: 11, marginTop: 4, color: scoreColor(focusedLead.renovation_score) }}>
                    Score : {focusedLead.renovation_score}
                  </p>
                </div>
              </InfoWindowF>
            )}
          </MarkerF>
        ))}
      </GoogleMap>

      {/* Legend */}
      <div className="bg-bg2 border-t border-border px-4 py-2.5 flex items-center gap-4">
        {([['≥80', '#4ade80'], ['60–79', '#fbbf24'], ['<60', '#f87171']] as const).map(([label, color]) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-[11px] font-mono text-text3">{label}</span>
          </div>
        ))}
        {leads.some(l => !l.lat || !l.lng) && (
          <span className="ml-auto text-[10px] font-mono text-text3 animate-pulse">Géocodage en cours…</span>
        )}
      </div>
    </div>
  )
}

// ── Main screen ───────────────────────────────────────────────────
export default function Carte() {
  const { profile } = useAuthStore()
  const { hasAccess } = usePlan()

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey ?? '',
    libraries: ['places'],
  })

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

  const centreCoords = useMemo(() => {
    const withCoords = leads.filter(l => l.lat && l.lng)
    if (!withCoords.length) return null
    return {
      lat: withCoords.reduce((s, l) => s + l.lat!, 0) / withCoords.length,
      lng: withCoords.reduce((s, l) => s + l.lng!, 0) / withCoords.length,
    }
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
                  {loadError ? (
                    <div className="bg-bg2 border border-red/20 rounded-2xl p-6 text-center">
                      <p className="text-sm text-red">Impossible de charger Google Maps</p>
                      <p className="text-xs text-text3 mt-1">Vérifie la clé VITE_GOOGLE_MAPS_KEY</p>
                    </div>
                  ) : !isLoaded ? (
                    <div className="flex items-center justify-center py-16">
                      <div className="w-8 h-8 border-2 border-border border-t-green rounded-full animate-spin" />
                    </div>
                  ) : (
                    <RealMap
                      leads={filteredByRadius}
                      focusedId={focusedId}
                      onPinClick={id => setFocusedId(prev => prev === id ? null : id)}
                      apiKey={apiKey ?? ''}
                    />
                  )}

                  {/* Focused lead card */}
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
                      <button onClick={() => setFocusedId(null)} className="text-text3 hover:text-text2 ml-1">
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
                        <div className="w-7 text-center">
                          <span className="text-xs font-mono text-text3">{idx + 1}</span>
                        </div>
                        <div className="w-9 h-9 bg-bg3 border border-border rounded-xl flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-text2">
                            {lead.company.charAt(0).toUpperCase()}
                          </span>
                        </div>
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
