import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'

// Screens
import Landing     from '@/screens/Landing'
import Login       from '@/screens/Login'
import Onboarding  from '@/screens/Onboarding'
import Dashboard   from '@/screens/Dashboard'
import Prospecter  from '@/screens/Prospecter'
import MesLeads    from '@/screens/MesLeads'
import Carte       from '@/screens/Carte'
import Compte      from '@/screens/Compte'

// Layout
import AppLayout   from '@/layout/AppLayout'

const queryClient = new QueryClient()

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore()
  if (loading) return <div className="flex items-center justify-center h-screen bg-bg"><div className="loader" /></div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore()
  if (loading) return null
  if (user) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export default function App() {
  const { init } = useAuthStore()
  useEffect(() => { init() }, [init])

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/" element={<PublicRoute><Landing /></PublicRoute>} />
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />

          {/* Onboarding — requires auth but no layout */}
          <Route path="/onboarding" element={<PrivateRoute><Onboarding /></PrivateRoute>} />

          {/* App — with bottom nav layout */}
          <Route element={<PrivateRoute><AppLayout /></PrivateRoute>}>
            <Route path="/dashboard"   element={<Dashboard />} />
            <Route path="/prospecter"  element={<Prospecter />} />
            <Route path="/mes-leads"   element={<MesLeads />} />
            <Route path="/carte"       element={<Carte />} />
            <Route path="/compte"      element={<Compte />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
