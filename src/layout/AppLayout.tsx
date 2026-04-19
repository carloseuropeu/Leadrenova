import { Outlet, NavLink } from 'react-router-dom'
import { Home, Search, Users, Map, FileText, Receipt, User } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { usePlan } from '@/hooks/usePlan'

const NAV = [
  { to: '/dashboard',  icon: Home,     label: 'Accueil'  },
  { to: '/prospecter', icon: Search,   label: 'Prospect' },
  { to: '/mes-leads',  icon: Users,    label: 'Leads'    },
  { to: '/carte',      icon: Map,      label: 'Carte'    },
  { to: '/devis',      icon: FileText, label: 'Devis'    },
  { to: '/factures',   icon: Receipt,  label: 'Factures' },
  { to: '/compte',     icon: User,     label: 'Compte'   },
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

      {/* Bottom navigation — scrollable to fit all items */}
      <nav className="flex-shrink-0 bg-bg/95 backdrop-blur border-t border-border pb-safe">
        <div className="flex overflow-x-auto no-scrollbar">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex-none w-[53px] flex flex-col items-center gap-0.5 py-2 pt-3 transition-colors ${
                  isActive ? 'text-green' : 'text-text3'
                }`
              }
            >
              <Icon size={20} strokeWidth={1.5} />
              <span className="text-[9px] font-mono">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
