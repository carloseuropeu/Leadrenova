# LeadRénov — Instruções para o Claude Code

## O que é este projecto
LeadRénov é uma PWA mobile-first para artesãos BTP franceses encontrarem chantiers.
Tagline: "Trouve tes chantiers, pas tes clients"

## Stack
- React 18 + TypeScript + Vite
- Tailwind CSS (tokens definidos em tailwind.config.js)
- Supabase (auth + base de dados + storage)
- React Router v6
- Zustand (estado global)
- TanStack Query (cache de dados)
- Vite PWA Plugin (installable no mobile)
- Vercel (deploy)

## Fontes Google (adicionar no index.html)
```html
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
```

## Design System — cores principais
- bg: #0a0f0a (fundo principal)
- green: #4ade80 (cor de acento principal)
- amber: #fbbf24 (avisos, trial)
- text: #dfe8df (texto principal)
- text2: #7a917a (texto secundário)

## Estrutura de ficheiros já criados
```
src/
  App.tsx              ← routing principal
  lib/
    supabase.ts        ← cliente Supabase + tipos
    ai.ts              ← Vibe Prospecting + Claude AI
  store/
    authStore.ts       ← auth com Zustand
  hooks/
    usePlan.ts         ← controlo de acesso por plano
  layout/
    AppLayout.tsx      ← layout com bottom nav
  components/
    ui/
      LockedFeature.tsx ← sistema de feature preview/blur
  screens/             ← CRIAR ESTES ECRÃS:
    Landing.tsx
    Login.tsx
    Onboarding.tsx
    Dashboard.tsx
    Prospecter.tsx
    MesLeads.tsx
    Carte.tsx
    Compte.tsx
docs/
  supabase-schema.sql  ← executar no Supabase SQL Editor
```

## Ecrãs a construir (por ordem de prioridade)

### 1. Login.tsx
- Botão "Continuer avec Google" (supabase signInWithOAuth)
- Separador "ou"
- Form email + password
- Link para criar conta
- Fundo dark com glow verde

### 2. Onboarding.tsx (2 passos)
- Passo 1: grid de métiers (Carreleur, Plombier, Peintre, Électricien, Maçon, Menuisier)
- Passo 2: input de zona + slider de raio (20–150km)
- Salva no perfil Supabase ao completar
- Redireciona para /dashboard

### 3. Dashboard.tsx
- Banner de trial (se plan === 'trial' e days <= 7)
- Greeting com nome do utilizador
- 4 metric cards (leads ce mois, emails générés, agences contactées, en discussion)
- Lista dos últimos 3 leads
- Botão "Nouvelle recherche" → /prospecter

### 4. Prospecter.tsx
- Filtros: zone, type de cible, nombre de résultats
- Chips de filtros rápidos
- Botão "Lancer la recherche" → chama searchLeads() de src/lib/ai.ts
- Loading animado com etapas
- Lista de lead cards com:
  - Score badge colorido (verde ≥80, amber 60-79, vermelho <60)
  - Botão "Révéler email" (consome 1 crédito — ver usePlan.canRevealEmail())
  - Botão "Email IA" → chama generateEmail() de src/lib/ai.ts
  - Salva leads no Supabase automaticamente
- Export CSV dos resultados

### 5. MesLeads.tsx
- Search bar
- Filtros por status (chips)
- Lista de lead cards com status e última acção
- Click num lead → modal de detalhe com pipeline de status

### 6. Carte.tsx
- LockedFeature com feature="map_full" para utilizadores Básico
- Para Pro+: mapa mock com pins coloridos por score
- Slider de raio
- Lista de leads ordenada por distância
- (Google Maps API real pode ser adicionada depois)

### 7. Compte.tsx
- Avatar com iniciais
- Info do plano actual + créditos restantes
- Barra de progresso de créditos
- Botão "Passer au Pro" / "Gérer l'abonnement"
- Preferências (zona, notificações)
- Botão logout

## Sistema de planos — IMPORTANTE
Usar sempre o hook usePlan() para verificar acesso:
```tsx
const { hasAccess, canRevealEmail } = usePlan()

// Feature totalmente bloqueada com blur
<LockedFeature feature="pipeline" message="Gère tes chantiers avec le plan Pro">
  <PipelineComponent />
</LockedFeature>

// Verificação manual
if (!hasAccess('map_full')) {
  // mostrar preview bloqueado
}
```

## Planos e preços
- trial: 14 dias grátis, 50 créditos, funcionalidades básicas
- basic: €29/mês, 50 créditos/mês, 1 região
- pro: €59/mês, 200 créditos/mês, França inteira, pipeline, fotos
- business: €99/mês, créditos ilimitados, orçamentos, facturas

## Comandos para começar
```bash
npm install
cp .env.example .env.local
# preencher .env.local com as chaves Supabase
npm run dev
```

## Deploy
1. Push para GitHub
2. Importar projecto no Vercel
3. Adicionar variáveis de ambiente no Vercel
4. Adicionar URL do Vercel no Supabase Authentication > URL Configuration
