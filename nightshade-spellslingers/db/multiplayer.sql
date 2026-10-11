-- ============================================================
-- NIGHTSHADE SPELLSLINGING — head-to-head online matches
-- Run once in the Supabase SQL editor AFTER schema.sql (safe to re-run).
--
-- Both browsers run the rules engine themselves; the server only
-- matches players up, hands out the shuffle seed, and keeps the
-- ordered list of moves. It enforces whose turn it is, the move
-- order (seq), and the 60 s turn clock.
-- ============================================================

create table if not exists public.matches (
  id              uuid primary key default gen_random_uuid(),
  status          text not null default 'waiting' check (status in ('waiting', 'active', 'done', 'cancelled')),
  listed          boolean not null default true,       -- shown in the lobby list (quick-match games are not)
  seed            bigint not null default floor(random() * 2147483647)::bigint,
  host_id         uuid not null references public.players on delete cascade,
  host_name       text not null,
  host_deck       jsonb not null,
  guest_id        uuid references public.players on delete cascade,
  guest_name      text,
  guest_deck      jsonb,
  first_seat      int,                                 -- 0 = host, 1 = guest
  active_seat     int,
  turn_started_at timestamptz,
  timeouts        int[] not null default '{0,0}',      -- consecutive timed-out turns per seat
  last_seq        int not null default 0,
  winner_seat     int,
  end_reason      text,                                -- life | concede | timeout | desync
  created_at      timestamptz not null default now()
);
create index if not exists matches_waiting_idx on public.matches(created_at) where status = 'waiting';
create index if not exists matches_host_idx  on public.matches(host_id);
create index if not exists matches_guest_idx on public.matches(guest_id);

create table if not exists public.match_actions (
  match_id   uuid not null references public.matches on delete cascade,
  seq        int  not null,
  seat       int  not null,
  action     jsonb not null,
  created_at timestamptz not null default now(),
  primary key (match_id, seq)
);

alter table public.matches       enable row level security;
alter table public.match_actions enable row level security;
revoke all on public.matches, public.match_actions from anon, authenticated;
grant select on public.matches, public.match_actions to anon, authenticated;
drop policy if exists matches_read on public.matches;
drop policy if exists match_actions_read on public.match_actions;
create policy matches_read       on public.matches       for select using (true);
create policy match_actions_read on public.match_actions for select using (true);

-- ---------- helpers ----------

-- Validate a deck sent by the client and stamp it with the player's real name and portrait.
create or replace function public._mp_deck(p_deck jsonb, p_player uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare total int; pl players;
begin
  if p_deck is null or jsonb_typeof(p_deck) <> 'object' or octet_length(p_deck::text) > 65536
     or jsonb_typeof(p_deck->'list') is distinct from 'object' then
    raise exception 'bad_deck';
  end if;
  if exists (select 1 from jsonb_each(p_deck->'list') e
             where e.key !~ '^[a-z0-9_]{1,40}$' or jsonb_typeof(e.value) <> 'number'
                or (e.value)::numeric <> floor((e.value)::numeric) or (e.value)::int not between 1 and 30) then
    raise exception 'bad_deck';
  end if;
  select coalesce(sum((value)::int), 0) into total from jsonb_each(p_deck->'list');
  if total <> 30 then raise exception 'bad_deck'; end if;
  if p_deck ? 'cards' and (jsonb_typeof(p_deck->'cards') <> 'array' or jsonb_array_length(p_deck->'cards') > 30
      or exists (select 1 from jsonb_array_elements(p_deck->'cards') c
                 where jsonb_typeof(c) <> 'object' or coalesce(c->>'id', '') !~ '^c_[a-z0-9]{4,24}$' or octet_length(c::text) > 4096)) then
    raise exception 'bad_deck';
  end if;
  select * into pl from players where id = p_player;
  return jsonb_build_object(
    'name',     left(coalesce(nullif(trim(p_deck->>'name'), ''), 'Deck'), 24),
    'colors',   case when jsonb_typeof(p_deck->'colors') = 'array' then p_deck->'colors' else '[]'::jsonb end,
    'feature',  left(coalesce(p_deck->>'feature', ''), 40),
    'list',     p_deck->'list',
    'cards',    coalesce(p_deck->'cards', '[]'::jsonb),
    'username', pl.username,
    'portrait', to_jsonb(pl.portrait));
end $$;

-- Seat p_player as the guest of a waiting match the caller has already locked.
create or replace function public._mp_seat_guest(p_match uuid, p_player uuid, p_deck jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare f int := floor(random() * 2)::int;
begin
  update matches set status = 'cancelled' where host_id = p_player and status = 'waiting' and id <> p_match;
  update matches set
    guest_id = p_player, guest_name = p_deck->>'username', guest_deck = p_deck,
    status = 'active', first_seat = f, active_seat = f,
    turn_started_at = now() + interval '8 seconds'   -- time for the dice roll and banner
  where id = p_match;
  return json_build_object('id', p_match, 'status', 'active');
end $$;

-- ---------- matchmaking ----------

create or replace function public.mp_create(p_token uuid, p_deck jsonb, p_listed boolean default true) returns json
language plpgsql security definer set search_path = public as $$
declare pid uuid := _player_from_token(p_token); d jsonb; mid uuid;
begin
  d := _mp_deck(p_deck, pid);
  update matches set status = 'cancelled' where host_id = pid and status = 'waiting';
  insert into matches(host_id, host_name, host_deck, listed)
  values (pid, d->>'username', d, coalesce(p_listed, true)) returning id into mid;
  return json_build_object('id', mid, 'status', 'waiting');
end $$;

create or replace function public.mp_join(p_token uuid, p_match uuid, p_deck jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare pid uuid := _player_from_token(p_token); d jsonb; m matches;
begin
  d := _mp_deck(p_deck, pid);
  select * into m from matches
  where id = p_match and status = 'waiting' and created_at > now() - interval '10 minutes'
  for update skip locked;
  if not found then return json_build_object('error', 'match_gone'); end if;
  if m.host_id = pid then return json_build_object('error', 'own_match'); end if;
  return _mp_seat_guest(m.id, pid, d);
end $$;

-- Join the oldest waiting match, or wait in a new unlisted one. Waiting clients call this again
-- every few seconds with p_mine; if an OLDER waiting match has appeared they move to it, so two
-- players who queued at the same moment still find each other (the older match never moves).
create or replace function public.mp_quick(p_token uuid, p_deck jsonb, p_mine uuid default null) returns json
language plpgsql security definer set search_path = public as $$
declare pid uuid := _player_from_token(p_token); d jsonb; w matches; other uuid;
begin
  d := _mp_deck(p_deck, pid);
  if p_mine is not null then
    select * into w from matches where id = p_mine and host_id = pid for update;
    if found and w.status = 'active' then return json_build_object('id', w.id, 'status', 'active'); end if;
    if not found or w.status <> 'waiting' then w := null; end if;
  end if;

  select id into other from matches
  where status = 'waiting' and host_id <> pid and created_at > now() - interval '10 minutes'
    and (w.id is null or created_at < w.created_at)
  order by created_at
  limit 1
  for update skip locked;

  if other is not null then
    if w.id is not null then update matches set status = 'cancelled' where id = w.id; end if;
    return _mp_seat_guest(other, pid, d);
  end if;
  if w.id is not null then return json_build_object('id', w.id, 'status', 'waiting'); end if;
  return mp_create(p_token, p_deck, false);
end $$;

create or replace function public.mp_cancel(p_token uuid, p_match uuid) returns json
language plpgsql security definer set search_path = public as $$
declare pid uuid := _player_from_token(p_token);
begin
  update matches set status = 'cancelled' where id = p_match and host_id = pid and status = 'waiting';
  return json_build_object('ok', true);
end $$;

-- ---------- playing ----------

create or replace function public.mp_submit(p_token uuid, p_match uuid, p_seq int, p_action jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare pid uuid := _player_from_token(p_token); m matches; s int; t text := p_action->>'t'; v_seq int := p_seq;
begin
  if jsonb_typeof(p_action) is distinct from 'object' or octet_length(p_action::text) > 1024 or p_action ? 'forced'
     or t is null or t not in ('land', 'cast', 'spell', 'trap', 'attack', 'end', 'concede', 'result') then
    raise exception 'bad_action';
  end if;
  if t = 'result' and coalesce(p_action->>'winner', '') not in ('0', '1', '-1') then raise exception 'bad_action'; end if;

  select * into m from matches where id = p_match for update;
  if not found or m.status <> 'active' then return json_build_object('error', 'not_active'); end if;
  s := case when m.host_id = pid then 0 when m.guest_id = pid then 1 end;
  if s is null then raise exception 'not_in_match'; end if;

  if t in ('concede', 'result') then
    v_seq := m.last_seq + 1;          -- allowed at any time, so not tied to the caller's move count
  else
    if v_seq is distinct from m.last_seq + 1 then return json_build_object('error', 'bad_seq'); end if;
    if m.active_seat <> s then return json_build_object('error', 'not_your_turn'); end if;
  end if;

  insert into match_actions(match_id, seq, seat, action) values (p_match, v_seq, s, p_action);
  update matches set
    last_seq        = v_seq,
    active_seat     = case when t = 'end' then 1 - s else active_seat end,
    turn_started_at = case when t = 'end' then now() + interval '2 seconds' else turn_started_at end,
    timeouts        = case when t = 'end' and s = 0 then array[0, timeouts[2]]
                           when t = 'end' and s = 1 then array[timeouts[1], 0]
                           else timeouts end,
    status          = case when t in ('concede', 'result') then 'done' else status end,
    winner_seat     = case when t = 'concede' then 1 - s
                           when t = 'result' then nullif((p_action->>'winner')::int, -1)
                           else winner_seat end,
    end_reason      = case when t = 'concede' then 'concede'
                           when t = 'result' then case when p_action->>'reason' = 'desync' then 'desync' else 'life' end
                           else end_reason end
  where id = p_match;
  return json_build_object('ok', true, 'seq', v_seq);
end $$;

-- The opponent let their 60 s run out (65 s with lag grace): end their turn for them.
-- Two timeouts in a row forfeits the match, which also covers a closed tab.
create or replace function public.mp_claim_timeout(p_token uuid, p_match uuid) returns json
language plpgsql security definer set search_path = public as $$
declare pid uuid := _player_from_token(p_token); m matches; s int; v int; n int; forfeit boolean;
begin
  select * into m from matches where id = p_match for update;
  if not found or m.status <> 'active' then return json_build_object('error', 'not_active'); end if;
  s := case when m.host_id = pid then 0 when m.guest_id = pid then 1 end;
  if s is null then raise exception 'not_in_match'; end if;
  if m.active_seat = s then return json_build_object('error', 'your_turn'); end if;
  if now() < m.turn_started_at + interval '65 seconds' then return json_build_object('error', 'too_early'); end if;

  v := 1 - s;
  n := m.timeouts[v + 1] + 1;
  forfeit := n >= 2;
  insert into match_actions(match_id, seq, seat, action)
  values (p_match, m.last_seq + 1, v, '{"t":"end","forced":true}'::jsonb);
  update matches set
    last_seq        = m.last_seq + 1,
    active_seat     = s,
    turn_started_at = now() + interval '2 seconds',
    timeouts        = case when v = 0 then array[n, timeouts[2]] else array[timeouts[1], n] end,
    status          = case when forfeit then 'done' else status end,
    winner_seat     = case when forfeit then s else winner_seat end,
    end_reason      = case when forfeit then 'timeout' else end_reason end
  where id = p_match;
  return json_build_object('ok', true, 'forfeit', forfeit);
end $$;

-- One cheap call per second while playing: the match's live fields plus any new moves.
create or replace function public.mp_poll(p_match uuid, p_after int) returns json
language sql stable set search_path = public as $$
  select json_build_object(
    'now', now(),
    'match', (select json_build_object('status', status, 'active_seat', active_seat, 'turn_started_at', turn_started_at,
                                       'last_seq', last_seq, 'winner_seat', winner_seat, 'end_reason', end_reason)
              from matches where id = p_match),
    'actions', coalesce((select json_agg(json_build_object('seq', seq, 'seat', seat, 'action', action) order by seq)
                         from match_actions where match_id = p_match and seq > p_after), '[]'::json));
$$;

-- ---------- function permissions ----------
revoke execute on function public._mp_deck(jsonb, uuid), public._mp_seat_guest(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function
  public.mp_create(uuid, jsonb, boolean),
  public.mp_join(uuid, uuid, jsonb),
  public.mp_quick(uuid, jsonb, uuid),
  public.mp_cancel(uuid, uuid),
  public.mp_submit(uuid, uuid, int, jsonb),
  public.mp_claim_timeout(uuid, uuid),
  public.mp_poll(uuid, int)
to anon, authenticated;
