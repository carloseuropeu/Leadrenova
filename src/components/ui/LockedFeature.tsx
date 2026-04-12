import { Lock } from 'lucide-react'
import { usePlan, type Feature } from '@/hooks/usePlan'
import type { UserPlan } from '@/lib/supabase'

const PLAN_LABELS: Record<UserPlan, string> = {
  trial: 'Essai',
  basic: 'Essentiel',
  pro: 'Pro',
  business: 'Business',
}

const PLAN_PRICES: Record<UserPlan, string> = {
  trial: '14 jours offerts',
  basic: '€29/mois',
  pro: '€59/mois',
  business: '€99/mois',
}

interface LockedFeatureProps {
  feature: Feature
  children: React.ReactNode
  message?: string
  blurContent?: boolean
  onUpgrade?: (plan: UserPlan) => void
}

export default function LockedFeature({
  feature,
  children,
  message,
  blurContent = true,
  onUpgrade,
}: LockedFeatureProps) {
  const { hasAccess, upgradeRequired } = usePlan()

  if (hasAccess(feature)) return <>{children}</>

  const requiredPlan = upgradeRequired(feature)

  return (
    <div className="relative">
      {/* Blurred content behind */}
      {blurContent && (
        <div className="pointer-events-none select-none" style={{ filter: 'blur(4px)', opacity: 0.4 }}>
          {children}
        </div>
      )}

      {/* Lock overlay */}
      <div
        className={`${blurContent ? 'absolute inset-0' : ''} flex flex-col items-center justify-center bg-bg2/80 backdrop-blur-sm rounded-xl border border-border p-6 text-center`}
        style={blurContent ? {} : { minHeight: 120 }}
      >
        <div className="w-10 h-10 rounded-xl bg-gdim border border-green/20 flex items-center justify-center mb-3">
          <Lock size={18} className="text-green" />
        </div>

        <div className="text-sm font-semibold text-text mb-1">
          Plan {PLAN_LABELS[requiredPlan]}
        </div>

        <div className="text-xs text-text2 mb-4 max-w-[200px] leading-relaxed">
          {message || `Disponible dans le plan ${PLAN_LABELS[requiredPlan]} à partir de ${PLAN_PRICES[requiredPlan]}`}
        </div>

        <button
          onClick={() => onUpgrade?.(requiredPlan)}
          className="bg-green text-bg text-xs font-bold py-2 px-4 rounded-lg hover:bg-green2 transition-colors"
        >
          Passer au plan {PLAN_LABELS[requiredPlan]} →
        </button>
      </div>
    </div>
  )
}

// ── LOCKED NAV ITEM ─────────────────────────────────────────────
export function LockedNavItem({ feature, label, icon: Icon }: {
  feature: Feature
  label: string
  icon: React.ComponentType<any>
}) {
  const { hasAccess, upgradeRequired } = usePlan()
  if (hasAccess(feature)) return null

  const plan = upgradeRequired(feature)

  return (
    <div className="flex-1 flex flex-col items-center gap-1 py-2 pt-3 text-text3 relative opacity-50">
      <Icon size={22} strokeWidth={1.5} />
      <span className="text-[10px] font-mono tracking-wider">{label}</span>
      <span className="absolute top-2 right-1/4 bg-amber text-bg text-[8px] font-bold px-1 rounded">
        {PLAN_LABELS[plan]}
      </span>
    </div>
  )
}
