export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Bug corrigé : VITE_* n'existe pas côté serveur Vercel — utiliser ANTHROPIC_API_KEY
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.error('[api/prospect] ANTHROPIC_API_KEY manquante dans les variables d\'environnement Vercel');
    return res.status(500).json({ error: 'Configuration serveur manquante : clé API introuvable.' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();

    // Bug corrigé : propager le vrai statut HTTP plutôt que toujours 200
    // (une 401 Anthropic masquée en 200 faisait croire à un succès)
    if (!response.ok) {
      console.error('[api/prospect] Erreur Anthropic', response.status, data);
      return res.status(response.status).json({
        error: data?.error?.message || `Anthropic API error ${response.status}`
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('[api/prospect] Exception réseau :', error.message);
    return res.status(500).json({ error: error.message });
  }
}