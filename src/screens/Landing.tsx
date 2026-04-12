import { useNavigate } from 'react-router-dom'
import { ArrowRight, CheckCircle, Zap, MapPin, Mail } from 'lucide-react'

const FEATURES = [
  { icon: Zap,       text: 'Prospection IA en quelques secondes' },
  { icon: MapPin,    text: 'Ciblage précis par zone et rayon' },
  { icon: Mail,      text: 'Emails personnalisés générés par IA' },
  { icon: CheckCircle, text: '14 jours gratuits, sans carte bancaire' },
]

const PLANS = [
  { name: 'Essentiel', price: '29', credits: '50 crédits/mois' },
  { name: 'Pro',       price: '59', credits: '200 crédits/mois', highlight: true },
  { name: 'Business',  price: '99', credits: 'Crédits illimités' },
]

export default function Landing() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-bg text-text font-body overflow-hidden">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-green/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-0 w-72 h-72 bg-blue/4 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 px-6 pt-14 pb-20 max-w-lg mx-auto">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-16">
          <div className="w-9 h-9 bg-green rounded-xl flex items-center justify-center">
            <span className="text-bg font-display font-bold text-base">L</span>
          </div>
          <span className="font-display font-bold text-xl text-text">LeadRénov</span>
        </div>

        {/* Hero */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 bg-gdim border border-green/20 rounded-full px-3 py-1 mb-5">
            <div className="w-1.5 h-1.5 bg-green rounded-full animate-pulse" />
            <span className="text-green text-xs font-mono">IA · Vibe Prospecting</span>
          </div>

          <h1 className="font-display font-extrabold text-4xl leading-tight text-text mb-4">
            Trouve tes<br />
            <span className="text-green">chantiers</span>,<br />
            pas tes clients
          </h1>

          <p className="text-text2 text-base leading-relaxed">
            L'outil de prospection IA pour les artisans BTP français. Trouve des agences immobilières, syndicats de copropriété et promoteurs qui ont besoin de toi.
          </p>
        </div>

        {/* CTA */}
        <div className="flex flex-col gap-3 mb-12">
          <button
            onClick={() => navigate('/login')}
            className="w-full bg-green text-bg font-bold py-4 rounded-2xl flex items-center justify-center gap-2 text-sm hover:bg-green2 transition-colors shadow-lg shadow-green/20"
          >
            Commencer gratuitement
            <ArrowRight size={18} />
          </button>
          <button
            onClick={() => navigate('/login')}
            className="w-full bg-bg2 border border-border text-text font-medium py-3.5 rounded-2xl text-sm hover:border-border2 transition-colors"
          >
            J'ai déjà un compte
          </button>
        </div>

        {/* Features */}
        <div className="mb-12 space-y-3">
          {FEATURES.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gdim border border-green/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Icon size={15} className="text-green" />
              </div>
              <span className="text-sm text-text2">{text}</span>
            </div>
          ))}
        </div>

        {/* Pricing teaser */}
        <div>
          <p className="text-xs text-text3 font-mono uppercase tracking-widest mb-4">Plans & tarifs</p>
          <div className="grid grid-cols-3 gap-2">
            {PLANS.map(({ name, price, credits, highlight }) => (
              <div
                key={name}
                className={`rounded-xl p-3 border text-center ${
                  highlight
                    ? 'bg-gdim border-green/30'
                    : 'bg-bg2 border-border'
                }`}
              >
                {highlight && (
                  <div className="text-[9px] font-mono font-bold text-green bg-green/10 rounded-full px-2 py-0.5 mb-2 inline-block">
                    POPULAIRE
                  </div>
                )}
                <p className={`font-display font-bold text-sm mb-0.5 ${highlight ? 'text-green' : 'text-text'}`}>
                  {name}
                </p>
                <p className="font-display font-bold text-xl text-text">€{price}</p>
                <p className="text-[10px] text-text3 mt-1 leading-tight">{credits}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-text3 mt-3">
            Essai gratuit 14 jours · Sans engagement
          </p>
        </div>
      </div>
    </div>
  )
}
