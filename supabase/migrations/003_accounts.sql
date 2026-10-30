-- 003: 카카오(Supabase Auth) 계정 연결. 기존 데이터에 영향 없음(모두 if not exists / or replace). Supabase SQL Editor 에서 실행.
-- players 는 여전히 device_id 가 키다. 로그인한 사용자는 player 하나를 user_id 로 "연결"만 한다(계정당 1개).
alter table public.players add column if not exists user_id uuid;
alter table public.players add column if not exists kakao_nick text;
create unique index if not exists players_user_uq on public.players (user_id) where user_id is not null;

-- 연결: ok | already(이미 내 계정에 연결) | no_player | device_linked_other(이 기기 player 가 다른 계정에 연결됨) | user_has_player(내 계정에 다른 player 가 이미 있음 -> o_device/o_name 반환)
create or replace function public.player_link(p_device uuid, p_user uuid, p_nick text default null)
returns table (o_status text, o_device uuid, o_name text) language plpgsql security definer set search_path = public as $$
declare pl public.players%rowtype; up public.players%rowtype;
begin
  select * into pl from public.players where device_id = p_device for update;
  if not found then return query select 'no_player'::text, null::uuid, null::text; return; end if;
  if pl.user_id = p_user then return query select 'already'::text, pl.device_id, pl.name; return; end if;
  if pl.user_id is not null then return query select 'device_linked_other'::text, null::uuid, null::text; return; end if;
  select * into up from public.players where user_id = p_user;
  if found then return query select 'user_has_player'::text, up.device_id, up.name; return; end if;
  begin
    update public.players set user_id = p_user, kakao_nick = left(p_nick, 40) where device_id = p_device;
  exception when unique_violation then -- 동시에 다른 기기가 먼저 연결한 경우
    select * into up from public.players where user_id = p_user;
    return query select 'user_has_player'::text, up.device_id, up.name; return;
  end;
  return query select 'ok'::text, pl.device_id, pl.name;
end $$;

-- 계정에 연결된 player 조회 (새 기기 로그인용)
create or replace function public.player_get_by_user(p_user uuid)
returns table (o_device uuid, o_name text) language sql security definer set search_path = public as $$
  select device_id, name from public.players where user_id = p_user;
$$;

do $$
declare f text;
begin
  foreach f in array array['player_link(uuid, uuid, text)', 'player_get_by_user(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
-- players 는 RLS + anon/authenticated 권한 없음(002) 이라 user_id 컬럼도 service_role(Edge Function)만 읽고 쓴다.
