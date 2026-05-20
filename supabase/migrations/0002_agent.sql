-- Bolsa V2: agent activity audit + kill switch.
--
-- `agent_events` is an append-only log of everything an agent does:
-- its reasoning (kind = 'thought'), each MCP tool call (tool_call /
-- tool_result), errors, and lifecycle events (session_start /
-- session_end). The browser subscribes via Supabase realtime to
-- stream these into the spectator UI.
--
-- `agent_state` is a single-row pointer for the currently-active
-- session and the kill-switch flag. V2 is single-user single-session;
-- multi-agent (V3) will replace the single-row constraint with a
-- per-session table.
--
-- RLS is permissive (anon all-access) to match the V1 watchlists
-- pattern. The deploy is login-protected on Vercel; tightening to
-- per-user policies comes with V3 auth.

create table if not exists agent_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id text not null,
  kind text not null,
  tool text,
  data jsonb not null default '{}'::jsonb
);

create index if not exists agent_events_session_created
  on agent_events (session_id, created_at desc);
create index if not exists agent_events_created
  on agent_events (created_at desc);

alter publication supabase_realtime add table agent_events;

alter table agent_events enable row level security;

create policy "anon read agent_events"
  on agent_events for select to anon using (true);

create policy "anon insert agent_events"
  on agent_events for insert to anon with check (true);

-- Single-row table; the `id = 1` check ensures we never accumulate rows.
create table if not exists agent_state (
  id int primary key default 1 check (id = 1),
  should_stop boolean not null default false,
  active_session_id text,
  updated_at timestamptz not null default now()
);

insert into agent_state (id) values (1) on conflict do nothing;

alter publication supabase_realtime add table agent_state;

alter table agent_state enable row level security;

create policy "anon read agent_state"
  on agent_state for select to anon using (true);

create policy "anon update agent_state"
  on agent_state for update to anon using (true) with check (true);
