import Stripe from 'stripe'

const VALID_PRICES = new Set([
  'price_1TNFuNG54dd12zFbGAB7f0Kb', // Essentiel
  'price_1TNG0IG54dd12zFb0tV8DhaU', // Pro
  'price_1TNG1GG54dd12zFbgMQgdUFV', // Business
])

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    console.error('[api/create-checkout] STRIPE_SECRET_KEY manquante')
    return res.status(500).json({ error: 'Configuration serveur manquante : STRIPE_SECRET_KEY introuvable.' })
  }

  const { priceId, userId } = req.body ?? {}

  if (!priceId || !userId) {
    return res.status(400).json({ error: 'priceId et userId sont requis.' })
  }

  if (!VALID_PRICES.has(priceId)) {
    return res.status(400).json({ error: 'priceId invalide.' })
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-04-10' })

  // Base URL: prefer APP_URL env var, fall back to Vercel's generated URL
  const baseUrl =
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173')

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: userId,   // used by webhook to identify the user
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      success_url: `${baseUrl}/dashboard?upgraded=true`,
      cancel_url:  `${baseUrl}/compte`,
    })

    console.log('[api/create-checkout] Session créée', { id: session.id, userId })
    return res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('[api/create-checkout] Erreur Stripe :', err.message)
    return res.status(500).json({ error: err.message })
  }
}
