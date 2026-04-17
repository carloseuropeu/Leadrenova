import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

// price ID → plan config
const PRICE_PLAN = {
  'price_1TNFuNG54dd12zFbGAB7f0Kb': { plan: 'basic',    credits_monthly: 50,     credits_remaining: 50 },
  'price_1TNG0IG54dd12zFb0tV8DhaU': { plan: 'pro',      credits_monthly: 200,    credits_remaining: 200 },
  'price_1TNG1GG54dd12zFbgMQgdUFV': { plan: 'business', credits_monthly: 999999, credits_remaining: 999999 },
}

// Read raw body from the request stream.
// Vercel buffers the incoming body — reading it here gives us the original bytes
// needed for Stripe's HMAC signature verification.
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    req.on('end',  () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const stripeKey     = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const supabaseUrl   = process.env.SUPABASE_URL
  const serviceKey    = process.env.SUPABASE_SERVICE_KEY

  if (!stripeKey || !webhookSecret) {
    console.error('[stripe-webhook] STRIPE_SECRET_KEY ou STRIPE_WEBHOOK_SECRET manquante')
    return res.status(500).json({ error: 'Configuration serveur incomplète.' })
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-04-10' })

  // ── Verify Stripe signature ──────────────────────────────────────
  let event
  try {
    const rawBody = await getRawBody(req)
    const sig = req.headers['stripe-signature']
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch (err) {
    console.error('[stripe-webhook] Signature invalide :', err.message)
    return res.status(400).json({ error: `Webhook signature invalide : ${err.message}` })
  }

  // ── Handle events ────────────────────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const userId  = session.client_reference_id

    if (!userId) {
      console.error('[stripe-webhook] client_reference_id absent de la session')
      return res.status(200).json({ received: true }) // ack to Stripe, don't retry
    }

    // Retrieve line items to get the price ID
    let priceId = null
    try {
      const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 })
      priceId = items.data[0]?.price?.id ?? null
    } catch (err) {
      console.error('[stripe-webhook] Impossible de récupérer les line items :', err.message)
    }

    const config = PRICE_PLAN[priceId]
    if (!config) {
      console.warn('[stripe-webhook] priceId inconnu ou non géré :', priceId)
      return res.status(200).json({ received: true })
    }

    if (!supabaseUrl || !serviceKey) {
      console.error('[stripe-webhook] SUPABASE_URL ou SUPABASE_SERVICE_KEY manquante')
      return res.status(500).json({ error: 'Configuration Supabase manquante.' })
    }

    // Use service role key — bypasses RLS, required for server-side writes
    const supabase = createClient(supabaseUrl, serviceKey)

    const { error: dbErr } = await supabase
      .from('profiles')
      .update({
        plan:               config.plan,
        credits_monthly:    config.credits_monthly,
        credits_remaining:  config.credits_remaining,
        stripe_customer_id: session.customer ?? null,
      })
      .eq('id', userId)

    if (dbErr) {
      console.error('[stripe-webhook] Supabase update échoué :', dbErr.message)
      return res.status(500).json({ error: dbErr.message })
    }

    console.log(`[stripe-webhook] Plan mis à jour : ${userId} → ${config.plan}`)
  }

  return res.status(200).json({ received: true })
}
