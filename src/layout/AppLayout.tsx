import { Outlet, NavLink } from 'react-router-dom'
import { Home, Search, Users, Map, User } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { usePlan } from '@/hooks/usePlan'

const NAV = [
  { to: '/dashboard',  icon: Home,   label: 'Accueil'   },
  { to: '/prospecter', icon: Search, label: 'Prospecter' },
  { to: '/mes-leads',  icon: Users,  label: 'Mes leads'  },
  { to: '/carte',      icon: Map,    label: 'Carte'       },
  { to: '/compte',     icon: User,   label: 'Compte'      },
]

export default function AppLayout() {
  const { profile } = useAuthStore()
  const { trialDaysLeft, plan } = usePlan()
  const days = trialDaysLeft()

  return (
    <div className="flex flex-col h-screen bg-bg overflow-hidden">
      {/* Trial banner */}
      {plan === 'trial' && days > 0 && days <= 7 && (
        <div className="bg-amber/10 border-b border-amber/20 px-4 py-2 flex items-center justify-between flex-shrink-0">
          <span className="text-xs text-amber font-mono">⏳ J-{days} — Fin de l'essai gratuit</span>
          <button className="text-xs text-amber border border-amber/30 rounded px-2 py-1">Upgrade →</button>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {/* Bottom navigation */}
      <nav className="flex-shrink-0 bg-bg/95 backdrop-blur border-t border-border pb-safe">
        <div className="flex">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center gap-1 py-2 pt-3 transition-colors ${
                  isActive ? 'text-green' : 'text-text3'
                }`
              }
            >
              <Icon size={22} strokeWidth={1.5} />
              <span className="text-[10px] font-mono tracking-wider">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
