export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' })
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('[api/send-email] RESEND_API_KEY manquante')
    return res.status(500).json({ error: 'Configuration serveur manquante : RESEND_API_KEY introuvable.' })
  }

  const { to, subject, body, fromName } = req.body

  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'Champs requis manquants : to, subject, body.' })
  }

  // Adresse expéditrice — configurer RESEND_FROM_EMAIL dans les variables Vercel
  // (domaine vérifié dans Resend Dashboard). Fallback: adresse de test Resend.
  if (!process.env.RESEND_FROM_EMAIL) {
    console.warn('[api/send-email] RESEND_FROM_EMAIL non défini — utilisation du fallback onboarding@resend.dev (emails limités en production)')
  }
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'
  const fromLabel = fromName ? `${fromName} via LeadRénov` : 'LeadRénov'

  // Convertir le texte brut en HTML minimal (sauts de ligne → <br>)
  const htmlBody = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromLabel} <${fromEmail}>`,
        to: [to],
        subject,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">${htmlBody}</div>`,
        text: body,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('[api/send-email] Erreur Resend', response.status, data)
      return res.status(response.status).json({
        error: data?.message || `Resend error ${response.status}`,
      })
    }

    console.log('[api/send-email] Email envoyé', { id: data.id, to })
    return res.status(200).json({ id: data.id })
  } catch (error) {
    console.error('[api/send-email] Exception :', error.message)
    return res.status(500).json({ error: error.message })
  }
}
