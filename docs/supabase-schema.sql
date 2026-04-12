-- ═══════════════════════════════════════════════════════════════
-- LeadRénov — Supabase Schema v1.0
-- Executar no SQL Editor do Supabase Dashboard
-- ═══════════════════════════════════════════════════════════════

-- ── PROFILES ────────────────────────────────────────────────────
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text,
  metiers text[] default '{}',
  zone_principale text default 'Orléans',
  departement text default '45',
  rayon_km integer default 50,
  plan text default 'trial' check (plan in ('trial','basic','pro','business')),
  trial_ends_at timestamptz default (now() + interval '14 days'),
  stripe_customer_id text,
  credits_remaining integer default 50,
  credits_monthly integer default 50,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── LEADS ───────────────────────────────────────────────────────
create table public.leads (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  company text not null,
  type text not null,
  contact_name text,
  contact_role text,
  email text,
  email_revealed boolean default false,
  phone text,
  phone_revealed boolean default false,
  website text,
  address text,
  city text not null,
  lat numeric,
  lng numeric,
  employees text,
  renovation_score integer default 70 check (renovation_score >= 0 and renovation_score <= 100),
  opportunity text,
  priority boolean default false,
  status text default 'nouveau' check (status in (
    'nouveau','contacte','visite','devis_envoye',
    'confirme','en_cours','termine','paye','archive'
  )),
  notes text,
  last_contact_at timestamptz,
  chantier_start date,
  chantier_end date,
  photos text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.leads enable row level security;

create policy "Users can manage own leads"
  on leads for all using (auth.uid() = user_id);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger leads_updated_at
  before update on leads
  for each row execute procedure update_updated_at();

-- ── GENERATED EMAILS ────────────────────────────────────────────
create table public.generated_emails (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  lead_id uuid references public.leads(id) on delete cascade not null,
  subject text not null,
  body text not null,
  created_at timestamptz default now()
);

alter table public.generated_emails enable row level security;

create policy "Users can manage own emails"
  on generated_emails for all using (auth.uid() = user_id);

-- ── DEVIS ───────────────────────────────────────────────────────
-- Disponível apenas no plano Business (feature preview nos outros planos)
create table public.devis (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  lead_id uuid references public.leads(id) on delete cascade not null,
  numero text not null,
  lignes jsonb default '[]',
  montant_ht numeric default 0,
  tva_rate numeric default 20,
  montant_ttc numeric default 0,
  statut text default 'brouillon' check (statut in ('brouillon','envoye','accepte','refuse')),
  notes text,
  created_at timestamptz default now()
);

alter table public.devis enable row level security;

create policy "Users can manage own devis"
  on devis for all using (auth.uid() = user_id);

-- ── CREDIT USAGE LOG ────────────────────────────────────────────
create table public.credit_usage (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  lead_id uuid references public.leads(id) on delete set null,
  action text not null check (action in ('reveal_email','reveal_phone','generate_email')),
  created_at timestamptz default now()
);

alter table public.credit_usage enable row level security;

create policy "Users can view own credit usage"
  on credit_usage for select using (auth.uid() = user_id);

create policy "Users can insert own credit usage"
  on credit_usage for insert with check (auth.uid() = user_id);

-- ── MONTHLY CREDIT RESET (função utilitária) ────────────────────
create or replace function reset_monthly_credits()
returns void as $$
begin
  update public.profiles
  set credits_remaining = credits_monthly
  where plan != 'trial';
end;
$$ language plpgsql security definer;

-- ═══════════════════════════════════════════════════════════════
-- INSTRUÇÕES APÓS EXECUTAR:
-- 1. Ativar Google OAuth em Authentication > Providers
-- 2. Adicionar URL do Vercel em Authentication > URL Configuration
-- 3. Criar bucket "lead-photos" em Storage (público)
-- ═══════════════════════════════════════════════════════════════
