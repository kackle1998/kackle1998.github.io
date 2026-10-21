-- ============================================================
-- BRIMSTONE SLINGSHOT — art overrides
-- Built-in art redrawn with the pixel editor's "Overwrite game art" button.
-- Run once in the Supabase SQL editor AFTER schema.sql (safe to re-run;
-- re-run it whenever schema.sql is re-run, since that resets function permissions).
--
-- Everyone may read the overrides. Only the developer's account may change them,
-- and that is checked here on the server, not in the browser.
-- Each row replaces one sprite in js/data.js for every player. To restore the
-- original, use RESTORE ORIGINAL in the game or delete the row in the Table Editor.
-- ============================================================

create table if not exists public.art_overrides (
  sprite     text primary key,
  pixels     jsonb not null,
  updated_by uuid references public.players on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.art_overrides enable row level security;
revoke all on public.art_overrides from anon, authenticated;
grant select on public.art_overrides to anon, authenticated;
drop policy if exists art_read on public.art_overrides;
create policy art_read on public.art_overrides for select using (true);

-- p_pixels: 16 strings of 16 sprite characters (. # + - w), or null to restore the original.
create or replace function public.set_art(p_token uuid, p_sprite text, p_pixels jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare pid uuid := _player_from_token(p_token);
begin
  if (select username_lc from players where id = pid) is distinct from 'kyle' then raise exception 'not_allowed'; end if;
  -- Built-in sprite names only (never spr_..., which custom and library cards use).
  if p_sprite is null or p_sprite !~ '^[a-z][a-z0-9_]{0,31}$' or p_sprite like 'spr\_%' then raise exception 'bad_sprite'; end if;
  if p_pixels is null then
    delete from art_overrides where sprite = p_sprite;
    return json_build_object('ok', true);
  end if;
  if jsonb_typeof(p_pixels) <> 'array' or jsonb_array_length(p_pixels) <> 16 then raise exception 'bad_art'; end if;
  if exists (select 1 from jsonb_array_elements(p_pixels) e
             where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ '^[.#+w-]{16}$') then raise exception 'bad_art'; end if;
  insert into art_overrides(sprite, pixels, updated_by) values (p_sprite, p_pixels, pid)
  on conflict (sprite) do update set pixels = excluded.pixels, updated_by = excluded.updated_by, updated_at = now();
  return json_build_object('ok', true);
end $$;

revoke execute on function public.set_art(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.set_art(uuid, text, jsonb) to anon, authenticated;
