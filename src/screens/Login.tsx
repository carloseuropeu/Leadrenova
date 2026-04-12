import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, ArrowRight, User } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

type Mode = 'login' | 'signup'

export default function Login() {
  const navigate = useNavigate()
  const { signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuthStore()

  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [name, setName]         = useState('')
  const [showPwd, setShowPwd]   = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const switchMode = (m: Mode) => { setMode(m); setError('') }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'login') {
        await signInWithEmail(email, password)
      } else {
        await signUpWithEmail(email, password, name)
        navigate('/onboarding')
      }
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-6 relative overflow-hidden">

      {/* Green glow effects */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-80 h-80 bg-green/8 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-green/4 rounded-full blur-3xl" />
        <div className="absolute top-10 -right-20 w-48 h-48 bg-blue/4 rounded-full blur-3xl" />
      </div>

      {/* Back to landing */}
      <button
        onClick={() => navigate('/')}
        className="absolute top-6 left-6 text-text3 text-sm font-mono hover:text-text2 transition-colors"
      >
        ← Retour
      </button>

      {/* Logo */}
      <div className="mb-8 text-center relative z-10">
        <div className="inline-flex items-center gap-2.5 mb-2">
          <div className="w-9 h-9 bg-green rounded-xl flex items-center justify-center">
            <span className="text-bg font-display font-bold text-base">L</span>
          </div>
          <span className="font-display font-bold text-xl text-text">LeadRénov</span>
        </div>
        <p className="text-text3 text-xs font-mono">Trouve tes chantiers, pas tes clients</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm relative z-10">
        <div className="bg-bg2 border border-border rounded-2xl p-6 shadow-2xl">

          {/* Header */}
          <h1 className="font-display font-bold text-2xl text-text mb-1">
            {mode === 'login' ? 'Connexion' : 'Créer un compte'}
          </h1>
          <p className="text-text2 text-sm mb-6">
            {mode === 'login' ? 'Bienvenue de retour !' : '14 jours gratuits · Sans CB'}
          </p>

          {/* Google OAuth */}
          <button
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 bg-bg3 border border-border hover:border-border2 text-text font-medium text-sm py-3 rounded-xl transition-all active:scale-98 mb-4"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
              <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Continuer avec Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-border" />
            <span className="text-text3 text-xs font-mono">ou</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3">

            {mode === 'signup' && (
              <div>
                <label className="text-[11px] text-text2 font-mono mb-1.5 block uppercase tracking-wide">
                  Prénom & nom
                </label>
                <div className="relative">
                  <User size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text3" />
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Jean Dupont"
                    required
                    autoComplete="name"
                    className="w-full bg-bg3 border border-border focus:border-green/50 rounded-xl pl-9 pr-4 py-3 text-sm text-text placeholder-text3 outline-none transition-colors"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-[11px] text-text2 font-mono mb-1.5 block uppercase tracking-wide">
                Email
              </label>
              <div className="relative">
                <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text3" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="jean@exemple.fr"
                  required
                  autoComplete="email"
                  className="w-full bg-bg3 border border-border focus:border-green/50 rounded-xl pl-9 pr-4 py-3 text-sm text-text placeholder-text3 outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] text-text2 font-mono mb-1.5 block uppercase tracking-wide">
                Mot de passe
              </label>
              <div className="relative">
                <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text3" />
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  minLength={6}
                  className="w-full bg-bg3 border border-border focus:border-green/50 rounded-xl pl-9 pr-10 py-3 text-sm text-text placeholder-text3 outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text3 hover:text-text2 transition-colors"
                  aria-label={showPwd ? 'Masquer' : 'Afficher'}
                >
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {mode === 'signup' && (
                <p className="text-[11px] text-text3 mt-1">Minimum 6 caractères</p>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="bg-rdim border border-red/20 rounded-xl px-4 py-3 text-xs text-red leading-relaxed">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green text-bg font-bold text-sm py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-green2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-1 shadow-lg shadow-green/20"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-bg/30 border-t-bg rounded-full animate-spin" />
              ) : (
                <>
                  {mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Mode switch */}
          <p className="text-center text-xs text-text2 mt-5">
            {mode === 'login' ? "Pas encore de compte ? " : "Déjà un compte ? "}
            <button
              onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
              className="text-green hover:underline font-medium"
            >
              {mode === 'login' ? 'Créer un compte' : 'Se connecter'}
            </button>
          </p>
        </div>

        {/* Legal */}
        <p className="text-center text-[11px] text-text3 mt-4 px-4 leading-relaxed">
          En continuant, tu acceptes nos{' '}
          <span className="text-text2">Conditions d'utilisation</span> et notre{' '}
          <span className="text-text2">Politique de confidentialité</span>.
        </p>
      </div>
    </div>
  )
}
