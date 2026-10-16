-- ============================================================
-- BRIMSTONE SLINGSHOT — the game library
-- Official cards added from the Card Maker's "Add to game library" button.
-- Run once in the Supabase SQL editor AFTER schema.sql (safe to re-run;
-- re-run it whenever schema.sql is re-run, since that resets function permissions).
--
-- Everyone may read the library. Only the developer's account may add to it,
-- and that is checked here on the server, not in the browser.
-- To take a card back out, delete its row in the Table Editor.
-- ============================================================

create table if not exists public.library_cards (
  id         text primary key,
  data       jsonb not null,
  added_by   uuid references public.players on delete set null,
  created_at timestamptz not null default now()
);

alter table public.library_cards enable row level security;
revoke all on public.library_cards from anon, authenticated;
grant select on public.library_cards to anon, authenticated;
drop policy if exists library_read on public.library_cards;
create policy library_read on public.library_cards for select using (true);

create or replace function public.add_to_library(p_token uuid, p_id text, p_data jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare pid uuid := _player_from_token(p_token);
begin
  if (select username_lc from players where id = pid) is distinct from 'kyle' then raise exception 'not_allowed'; end if;
  -- Plain lowercase ids, like the built-in cards (never c_..., which custom cards use).
  if p_id is null or p_id !~ '^[a-z][a-z0-9]{0,15}$' then raise exception 'bad_id'; end if;
  if jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 4096 then raise exception 'bad_card'; end if;
  if coalesce(p_data->>'rarity', 'common') not in ('common', 'rare', 'mythical') then raise exception 'bad_card'; end if;
  if exists (select 1 from library_cards where id = p_id) then return json_build_object('error', 'id_taken'); end if;
  insert into library_cards(id, data, added_by) values (p_id, p_data || jsonb_build_object('id', p_id), pid);
  return json_build_object('ok', true);
end $$;

revoke execute on function public.add_to_library(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.add_to_library(uuid, text, jsonb) to anon, authenticated;
