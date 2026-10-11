-- ============================================================
-- NIGHTSHADE SPELLSLINGING — online accounts, cards, decks
-- Run once in the Supabase SQL editor (safe to re-run).
--
-- Security model: the browser only ever has the public "anon" key.
--   * anon may READ cards, decks and the public player columns.
--   * anon may NOT write any table directly; every write goes through
--     the security-definer functions below, which check a session token.
--   * PINs are bcrypt-hashed; pin_hash is never readable by anon.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- tables ----------
create table if not exists public.players (
  id            uuid primary key default gen_random_uuid(),
  username      text not null check (username ~ '^[A-Za-z0-9_]{3,12}$'),
  username_lc   text generated always as (lower(username)) stored unique,
  pin_hash      text not null,
  portrait      text[],
  failed_logins int  not null default 0,
  locked_until  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.sessions (
  token      uuid primary key default gen_random_uuid(),
  player_id  uuid not null references public.players on delete cascade,
  expires_at timestamptz not null default now() + interval '30 days'
);
create index if not exists sessions_player_idx on public.sessions(player_id);

create table if not exists public.cards (
  id         text primary key,
  owner_id   uuid not null references public.players on delete cascade,
  data       jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cards_owner_idx   on public.cards(owner_id);
create index if not exists cards_updated_idx on public.cards(updated_at desc);

create table if not exists public.decks (
  id         text primary key,
  owner_id   uuid not null references public.players on delete cascade,
  name       text not null check (length(name) between 1 and 24),
  list       jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists decks_owner_idx on public.decks(owner_id);
<<<<<<< HEAD
-- Deck art: a sprite name (string) or 16 rows of drawn pixels (array). Null = automatic.
alter table public.decks add column if not exists art jsonb;
=======
>>>>>>> origin/main

-- ---------- access: read-only for the public, no direct writes ----------
alter table public.players  enable row level security;
alter table public.sessions enable row level security;
alter table public.cards    enable row level security;
alter table public.decks    enable row level security;

revoke all on public.players, public.sessions, public.cards, public.decks from anon, authenticated;
grant select (id, username, portrait, created_at) on public.players to anon, authenticated;
grant select on public.cards, public.decks to anon, authenticated;

drop policy if exists players_read on public.players;
drop policy if exists cards_read   on public.cards;
drop policy if exists decks_read   on public.decks;
create policy players_read on public.players for select using (true);
create policy cards_read   on public.cards   for select using (true);
create policy decks_read   on public.decks   for select using (true);
-- sessions: no policy at all, so it is invisible to anon.

-- ---------- helpers ----------
create or replace function public._player_from_token(p_token uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare pid uuid;
begin
  select player_id into pid from sessions where token = p_token and expires_at > now();
  if pid is null then raise exception 'not_logged_in'; end if;
  return pid;
end $$;

create or replace function public._new_session(p_player uuid) returns json
language plpgsql security definer set search_path = public as $$
declare tok uuid; p players;
begin
  delete from sessions where expires_at < now();
  insert into sessions(player_id) values (p_player) returning token into tok;
  select * into p from players where id = p_player;
  return json_build_object('token', tok, 'player',
    json_build_object('id', p.id, 'username', p.username, 'portrait', p.portrait));
end $$;

-- ---------- accounts ----------
create or replace function public.register(p_username text, p_pin text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare pid uuid;
begin
  if p_username is null or p_username !~ '^[A-Za-z0-9_]{3,12}$' then return json_build_object('error', 'bad_username'); end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then return json_build_object('error', 'bad_pin'); end if;
  if exists (select 1 from players where username_lc = lower(p_username)) then return json_build_object('error', 'username_taken'); end if;
  insert into players(username, pin_hash) values (p_username, crypt(p_pin, gen_salt('bf'))) returning id into pid;
  return _new_session(pid);
end $$;

-- Errors are returned (not raised) so the failed-attempt counter is not rolled back.
create or replace function public.login(p_username text, p_pin text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare p players;
begin
  select * into p from players where username_lc = lower(coalesce(p_username, ''));
  if not found then return json_build_object('error', 'bad_login'); end if;
  if p.locked_until is not null and p.locked_until > now() then
    return json_build_object('error', 'locked', 'until', p.locked_until);
  end if;
  if p_pin is null or p.pin_hash <> crypt(p_pin, p.pin_hash) then
    update players set
      failed_logins = failed_logins + 1,
      locked_until  = case when failed_logins + 1 >= 5 then now() + interval '15 minutes' else null end
    where id = p.id;
    return json_build_object('error', 'bad_login');
  end if;
  update players set failed_logins = 0, locked_until = null where id = p.id;
  return _new_session(p.id);
end $$;

create or replace function public.logout(p_token uuid) returns void
language sql security definer set search_path = public as $$
  delete from sessions where token = p_token;
$$;

-- ---------- profile ----------
create or replace function public.save_profile(p_token uuid, p_portrait text[]) returns json
language plpgsql security definer set search_path = public as $$
declare pid uuid := _player_from_token(p_token);
begin
  if p_portrait is not null then
    if coalesce(array_length(p_portrait, 1), 0) <> 16 then raise exception 'bad_portrait'; end if;
    if exists (select 1 from unnest(p_portrait) r where r is null or r !~ '^[.#+w-]{16}$') then raise exception 'bad_portrait'; end if;
  end if;
  update players set portrait = p_portrait, updated_at = now() where id = pid;
  return json_build_object('ok', true);
end $$;

-- ---------- cards ----------
create or replace function public.upsert_card(p_token uuid, p_id text, p_data jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare pid uuid := _player_from_token(p_token); cur_owner uuid;
begin
  if p_id is null or p_id !~ '^c_[a-z0-9]{4,24}$' then raise exception 'bad_id'; end if;
  if jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 4096 then raise exception 'bad_card'; end if;
  select owner_id into cur_owner from cards where id = p_id;
  if cur_owner is not null and cur_owner <> pid then return json_build_object('error', 'id_taken'); end if;
  if cur_owner is null and (select count(*) from cards where owner_id = pid) >= 200 then
    return json_build_object('error', 'too_many_cards');
  end if;
  insert into cards(id, owner_id, data) values (p_id, pid, p_data || jsonb_build_object('id', p_id))
  on conflict (id) do update set data = excluded.data, updated_at = now();
  return json_build_object('ok', true);
end $$;

create or replace function public.delete_card(p_token uuid, p_id text) returns json
language plpgsql security definer set search_path = public as $$
declare pid uuid := _player_from_token(p_token);
begin
  delete from cards where id = p_id and owner_id = pid;
  return json_build_object('ok', true);
end $$;

-- ---------- decks ----------
<<<<<<< HEAD
-- The pre-art 4-argument version would make calls ambiguous.
drop function if exists public.upsert_deck(uuid, text, text, jsonb);
create or replace function public.upsert_deck(p_token uuid, p_id text, p_name text, p_list jsonb, p_art jsonb default null) returns json
=======
create or replace function public.upsert_deck(p_token uuid, p_id text, p_name text, p_list jsonb) returns json
>>>>>>> origin/main
language plpgsql security definer set search_path = public as $$
declare pid uuid := _player_from_token(p_token); cur_owner uuid; total int;
begin
  if p_id is null or p_id !~ '^d_[a-z0-9]{4,24}$' then raise exception 'bad_id'; end if;
  if p_name is null or length(trim(p_name)) not between 1 and 24 then raise exception 'bad_name'; end if;
  if jsonb_typeof(p_list) <> 'object' then raise exception 'bad_list'; end if;
<<<<<<< HEAD
  if p_art is not null and jsonb_typeof(p_art) <> 'null' then
    if jsonb_typeof(p_art) = 'string' then
      if (p_art #>> '{}') !~ '^[a-z0-9_]{1,40}$' then raise exception 'bad_art'; end if;
    elsif jsonb_typeof(p_art) = 'array' then
      if jsonb_array_length(p_art) <> 16 or exists (select 1 from jsonb_array_elements(p_art) r
           where jsonb_typeof(r) <> 'string' or (r #>> '{}') !~ '^[.#+w-]{16}$') then
        raise exception 'bad_art';
      end if;
    else
      raise exception 'bad_art';
    end if;
  else
    p_art := null;
  end if;
=======
>>>>>>> origin/main
  -- keys look like card ids, counts are 1..30, total at most 30 (the game needs exactly 30 to play,
  -- but half-built decks can be saved).
  if exists (select 1 from jsonb_each(p_list) e
             where e.key !~ '^[a-z0-9_]{1,40}$' or jsonb_typeof(e.value) <> 'number'
                or (e.value)::numeric <> floor((e.value)::numeric) or (e.value)::int not between 1 and 30) then
    raise exception 'bad_list';
  end if;
  select coalesce(sum((value)::int), 0) into total from jsonb_each(p_list);
  if total > 30 then raise exception 'bad_list'; end if;

  select owner_id into cur_owner from decks where id = p_id;
  if cur_owner is not null and cur_owner <> pid then return json_build_object('error', 'id_taken'); end if;
  if cur_owner is null and (select count(*) from decks where owner_id = pid) >= 50 then
    return json_build_object('error', 'too_many_decks');
  end if;
<<<<<<< HEAD
  insert into decks(id, owner_id, name, list, art) values (p_id, pid, trim(p_name), p_list, p_art)
  on conflict (id) do update set name = excluded.name, list = excluded.list, art = excluded.art, updated_at = now();
=======
  insert into decks(id, owner_id, name, list) values (p_id, pid, trim(p_name), p_list)
  on conflict (id) do update set name = excluded.name, list = excluded.list, updated_at = now();
>>>>>>> origin/main
  return json_build_object('ok', true);
end $$;

create or replace function public.delete_deck(p_token uuid, p_id text) returns json
language plpgsql security definer set search_path = public as $$
declare pid uuid := _player_from_token(p_token);
begin
  delete from decks where id = p_id and owner_id = pid;
  return json_build_object('ok', true);
end $$;

-- ---------- function permissions ----------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.register(text, text),
  public.login(text, text),
  public.logout(uuid),
  public.save_profile(uuid, text[]),
  public.upsert_card(uuid, text, jsonb),
  public.delete_card(uuid, text),
<<<<<<< HEAD
  public.upsert_deck(uuid, text, text, jsonb, jsonb),
=======
  public.upsert_deck(uuid, text, text, jsonb),
>>>>>>> origin/main
  public.delete_deck(uuid, text)
to anon, authenticated;
