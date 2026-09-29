-- ─────────────────────────────────────────────────────────────────────────────
-- Labarile Agents — installation de la base (Supabase → SQL Editor → Run)
-- Idempotent : peut être relancé sans casser les données.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists pgcrypto;

-- Réglages (modes des agents, identité graphique, URL de l'app, secret de la boucle)
create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into settings (key, value) values
  ('cron_secret', to_jsonb(encode(gen_random_bytes(24), 'hex'))),
  ('modes', '{"insta":"off","mail":"off","support":"off","stories":"off"}'),
  ('quiet_hours', '{"start":"22:00","end":"08:00"}'),
  ('brand', '{"name":"Labarile English","primary":"#0B2545","secondary":"#13315C","accent":"#E63946","background":"#F7F4EE","text":"#0B2545","logoUrl":"","fontUrl":""}')
on conflict (key) do nothing;

-- Cerveaux : un par agent (insta, mail, support, stories)
create table if not exists brains (
  agent text primary key,
  docs jsonb not null default '[]',   -- [{ "name": "01-methode.md", "content": "..." }]
  config jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- ── Instagram DM ────────────────────────────────────────────────────────────
create table if not exists ig_conversations (
  id text primary key,                 -- id PlugKit
  name text,
  picture text,
  status text not null default 'bot',  -- bot | human | booked | lost | out
  stage text not null default 'ouverture',
  fields jsonb not null default '{}',
  summary text,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  follow_ups int not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Dernier message pour lequel l'agent a déjà décidé (évite de redemander à Claude à chaque tour)
alter table ig_conversations add column if not exists last_decided_id text;

create table if not exists ig_messages (
  id text primary key,
  conversation_id text not null references ig_conversations(id) on delete cascade,
  direction text not null,             -- incoming | outgoing
  text text not null default '',
  created_at timestamptz not null
);
create index if not exists ig_messages_conv on ig_messages (conversation_id, created_at);

-- ── Mails (boîte commerciale et boîte support) ──────────────────────────────
create table if not exists mail_state (
  mailbox text primary key,            -- mail | support
  last_uid bigint not null default 0,
  uid_validity bigint
);

create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  category text,
  status text not null default 'ouvert', -- ouvert | attente_client | attente_decision | resolu
  info jsonb not null default '{}',
  summary text,
  decision text,                         -- accorde | refuse
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists emails (
  id uuid primary key default gen_random_uuid(),
  mailbox text not null,               -- mail | support
  message_id text,
  uid bigint,
  from_email text not null,
  from_name text,
  subject text,
  body text,
  received_at timestamptz,
  category text,
  phones text[] not null default '{}',
  status text not null default 'new',  -- new | drafted | replied | ignored | escalated | forwarded | error
  ticket_id uuid references support_tickets(id) on delete set null,
  direction text not null default 'in',-- in | out
  created_at timestamptz not null default now(),
  unique (mailbox, message_id)
);
create index if not exists emails_from on emails (mailbox, from_email, created_at);

-- Numéros détectés → équipe setting
create table if not exists setting_alerts (
  id uuid primary key default gen_random_uuid(),
  email_id uuid references emails(id) on delete set null,
  phone text not null,
  name text,
  context text,
  claimed_by text,
  claimed_at timestamptz,
  done_at timestamptz,
  tg_message_id bigint,
  created_at timestamptz not null default now()
);

-- ── Stories ─────────────────────────────────────────────────────────────────
create table if not exists stories (
  id uuid primary key default gen_random_uuid(),
  template text not null,
  title text not null,
  body text not null default '',
  cta text,
  photo_url text,
  status text not null default 'draft', -- draft | approved | published | rejected | failed
  scheduled_for timestamptz,
  image_url text,
  ig_media_id text,
  error text,
  created_at timestamptz not null default now()
);

-- ── Brouillons : tout ce qui attend un clic avant de partir ────────────────
create table if not exists drafts (
  id uuid primary key default gen_random_uuid(),
  channel text not null,               -- insta | mail | support
  ref_id text not null,                -- conversation IG ou email d'origine
  content text not null,
  meta jsonb not null default '{}',
  status text not null default 'pending', -- pending | sent | rejected | failed | superseded
  error text,
  tg_message_id bigint,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists drafts_pending on drafts (status, channel);

-- Réponses Telegram en attente (bouton ✏️ Modifier)
create table if not exists tg_edits (
  prompt_message_id bigint primary key,
  draft_id uuid not null references drafts(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Journal visible dans le tableau de bord
create table if not exists events (
  id bigserial primary key,
  agent text not null,
  level text not null default 'info',  -- info | warn | error
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists events_recent on events (created_at desc);

-- Accès : uniquement la clé service_role (le serveur). Personne d'autre.
alter table settings enable row level security;
alter table brains enable row level security;
alter table ig_conversations enable row level security;
alter table ig_messages enable row level security;
alter table mail_state enable row level security;
alter table support_tickets enable row level security;
alter table emails enable row level security;
alter table setting_alerts enable row level security;
alter table stories enable row level security;
alter table drafts enable row level security;
alter table tg_edits enable row level security;
alter table events enable row level security;

-- Stockage des images de stories (lecture publique : Instagram doit pouvoir les lire)
insert into storage.buckets (id, name, public) values ('stories', 'stories', true)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('photos', 'photos', true)
on conflict (id) do nothing;

-- ── La boucle : toutes les 3 minutes, Supabase réveille l'app ──────────────
create or replace function labarile_tick() returns void
language plpgsql security definer as $$
declare
  app_url text;
  secret text;
begin
  select value #>> '{}' into app_url from settings where key = 'app_url';
  select value #>> '{}' into secret from settings where key = 'cron_secret';
  if app_url is null or app_url = '' then
    return;
  end if;
  perform net.http_post(
    url := rtrim(app_url, '/') || '/api/cron',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
end;
$$;

select cron.unschedule('labarile-tick') where exists (select 1 from cron.job where jobname = 'labarile-tick');
select cron.schedule('labarile-tick', '*/3 * * * *', 'select labarile_tick()');

-- Ménage : journal de plus de 30 jours
select cron.unschedule('labarile-cleanup') where exists (select 1 from cron.job where jobname = 'labarile-cleanup');
select cron.schedule('labarile-cleanup', '17 3 * * *', $$delete from events where created_at < now() - interval '30 days'$$);
