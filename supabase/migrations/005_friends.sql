-- 005: 친구 시스템. 여러 번 실행해도 안전(if not exists / or replace). Supabase SQL Editor 에서 실행. 선행: 002, 003.
-- 친구 식별은 계정(user_id)에 연결된 players 의 friend_code(4자, 전역 유일). 전화번호 등 연락처는 다루지 않는다.
-- 전부 service_role 전용(Edge Function 이 JWT 로 user 를 확인한 뒤 호출). anon/authenticated 접근 없음.

-- ───────── 친구 코드: 혼동 글자(0 O 1 I L) 제외한 31자 알파벳 4자 ─────────
alter table public.players add column if not exists friend_code text;

create or replace function public.friend_code_gen() returns text language plpgsql volatile set search_path = public as $$
declare al constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; c text; i int; n int := 0;
begin
  loop
    c := '';
    for i in 1..4 loop c := c || substr(al, 1 + floor(random() * 31)::int, 1); end loop;
    exit when not exists (select 1 from public.players where friend_code = c);
    n := n + 1; if n > 200 then raise exception 'friend_code_exhausted'; end if;
  end loop;
  return c;
end $$;

-- 신규 players 는 자동으로 코드를 받는다(player_register 수정 불필요)
create or replace function public.players_set_friend_code() returns trigger language plpgsql set search_path = public as $$
begin
  if new.friend_code is null then new.friend_code := public.friend_code_gen(); end if;
  return new;
end $$;
drop trigger if exists players_friend_code_trg on public.players;
create trigger players_friend_code_trg before insert on public.players for each row execute function public.players_set_friend_code();

-- 기존 players 백필(행마다 따로 실행해 중복 방지)
do $$
declare r record;
begin
  for r in select device_id from public.players where friend_code is null loop
    update public.players set friend_code = public.friend_code_gen() where device_id = r.device_id and friend_code is null;
  end loop;
end $$;
create unique index if not exists players_friend_code_uq on public.players (friend_code);

-- ───────── friendships: 쌍(a<b) 정규화, 쌍당 1행 ─────────
-- status: pending(requested_by=요청자) | accepted | blocked(requested_by=차단한 사람)
create table if not exists public.friendships (
  a            uuid        not null,
  b            uuid        not null,
  status       text        not null check (status in ('pending', 'accepted', 'blocked')),
  requested_by uuid        not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (a, b),
  check (a < b),
  check (requested_by = a or requested_by = b)
);
create index if not exists friendships_b_idx on public.friendships (b);
alter table public.friendships enable row level security;   -- 정책 없음 = service_role 외 접근 불가
revoke all on public.friendships from anon, authenticated;

-- ───────── 헬퍼 ─────────
create or replace function public.fr_target(p_code text) returns setof public.players language sql stable set search_path = public as $$
  select p.* from public.players p where p.friend_code = upper(p_code) and p.user_id is not null limit 1;
$$;

-- 한도: 친구 100명, 보낸 대기 요청 30개
create or replace function public.fr_count(p_user uuid, p_status text) returns int language sql stable set search_path = public as $$
  select count(*)::int from public.friendships f where (f.a = p_user or f.b = p_user) and f.status = p_status;
$$;

-- 내 코드
create or replace function public.friend_my_code(p_user uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.players%rowtype;
begin
  select * into me from public.players where user_id = p_user;
  if not found then return jsonb_build_object('status', 'no_player'); end if;
  return jsonb_build_object('status', 'ok', 'name', me.name, 'code', me.friend_code);
end $$;

-- 요청: status = ok(result=requested|accepted) | no_player | no_such_code | self | already_friends | already_requested | you_blocked | friend_limit | request_limit
-- 상대가 이미 나에게 요청해 둔 경우 자동 수락(result=accepted). 상대가 나를 차단했으면 존재 노출을 막으려고 no_such_code.
create or replace function public.friend_request(p_user uuid, p_code text) returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.players%rowtype; t public.players%rowtype; x public.friendships%rowtype; la uuid; lb uuid;
begin
  select * into me from public.players where user_id = p_user;
  if not found then return jsonb_build_object('status', 'no_player'); end if;
  select * into t from public.fr_target(p_code);
  if not found then return jsonb_build_object('status', 'no_such_code'); end if;
  if t.user_id = p_user then return jsonb_build_object('status', 'self'); end if;
  la := least(p_user, t.user_id); lb := greatest(p_user, t.user_id);
  select * into x from public.friendships where a = la and b = lb for update;
  if found then
    if x.status = 'blocked' then
      if x.requested_by = p_user then return jsonb_build_object('status', 'you_blocked'); end if;
      return jsonb_build_object('status', 'no_such_code');
    elsif x.status = 'accepted' then return jsonb_build_object('status', 'already_friends');
    elsif x.requested_by = p_user then return jsonb_build_object('status', 'already_requested');
    else
      if public.fr_count(p_user, 'accepted') >= 100 or public.fr_count(t.user_id, 'accepted') >= 100 then return jsonb_build_object('status', 'friend_limit'); end if;
      update public.friendships set status = 'accepted', updated_at = now() where a = la and b = lb;
      return jsonb_build_object('status', 'ok', 'result', 'accepted', 'friend', jsonb_build_object('name', t.name, 'code', t.friend_code));
    end if;
  end if;
  if public.fr_count(p_user, 'accepted') >= 100 then return jsonb_build_object('status', 'friend_limit'); end if;
  if (select count(*) from public.friendships f where f.requested_by = p_user and f.status = 'pending') >= 30 then return jsonb_build_object('status', 'request_limit'); end if;
  begin
    insert into public.friendships (a, b, status, requested_by) values (la, lb, 'pending', p_user);
  exception when unique_violation then
    return jsonb_build_object('status', 'already_requested');
  end;
  return jsonb_build_object('status', 'ok', 'result', 'requested', 'friend', jsonb_build_object('name', t.name, 'code', t.friend_code));
end $$;

-- 수락(받은 요청의 요청자 코드): ok | no_such_code | no_such_request | friend_limit
create or replace function public.friend_accept(p_user uuid, p_code text) returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.players%rowtype; x public.friendships%rowtype; la uuid; lb uuid;
begin
  select * into t from public.fr_target(p_code);
  if not found then return jsonb_build_object('status', 'no_such_code'); end if;
  la := least(p_user, t.user_id); lb := greatest(p_user, t.user_id);
  select * into x from public.friendships where a = la and b = lb for update;
  if not found or x.status <> 'pending' or x.requested_by <> t.user_id then return jsonb_build_object('status', 'no_such_request'); end if;
  if public.fr_count(p_user, 'accepted') >= 100 or public.fr_count(t.user_id, 'accepted') >= 100 then return jsonb_build_object('status', 'friend_limit'); end if;
  update public.friendships set status = 'accepted', updated_at = now() where a = la and b = lb;
  return jsonb_build_object('status', 'ok', 'friend', jsonb_build_object('name', t.name, 'code', t.friend_code));
end $$;

-- 거절(받은 요청) 또는 취소(내가 보낸 요청): 대기 행 삭제. ok | no_such_code | no_such_request
create or replace function public.friend_decline(p_user uuid, p_code text) returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.players%rowtype; n int;
begin
  select * into t from public.fr_target(p_code);
  if not found then return jsonb_build_object('status', 'no_such_code'); end if;
  delete from public.friendships where a = least(p_user, t.user_id) and b = greatest(p_user, t.user_id) and status = 'pending';
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('status', 'no_such_request'); end if;
  return jsonb_build_object('status', 'ok');
end $$;

-- 삭제: 친구 해제, 또는 내가 건 차단 해제. ok | no_such_code | not_friends
create or replace function public.friend_remove(p_user uuid, p_code text) returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.players%rowtype; n int;
begin
  select * into t from public.fr_target(p_code);
  if not found then return jsonb_build_object('status', 'no_such_code'); end if;
  delete from public.friendships where a = least(p_user, t.user_id) and b = greatest(p_user, t.user_id)
    and (status = 'accepted' or (status = 'blocked' and requested_by = p_user));
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('status', 'not_friends'); end if;
  return jsonb_build_object('status', 'ok');
end $$;

-- 차단: 어떤 기존 관계든 차단으로 덮어쓴다(상대가 이미 나를 차단 중이면 변경 없이 ok). ok | no_such_code | self | no_player
create or replace function public.friend_block(p_user uuid, p_code text) returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.players%rowtype; x public.friendships%rowtype; la uuid; lb uuid;
begin
  if not exists (select 1 from public.players where user_id = p_user) then return jsonb_build_object('status', 'no_player'); end if;
  select * into t from public.fr_target(p_code);
  if not found then return jsonb_build_object('status', 'no_such_code'); end if;
  if t.user_id = p_user then return jsonb_build_object('status', 'self'); end if;
  la := least(p_user, t.user_id); lb := greatest(p_user, t.user_id);
  select * into x from public.friendships where a = la and b = lb for update;
  if found then
    if x.status = 'blocked' then return jsonb_build_object('status', 'ok'); end if;
    update public.friendships set status = 'blocked', requested_by = p_user, updated_at = now() where a = la and b = lb;
  else
    insert into public.friendships (a, b, status, requested_by) values (la, lb, 'blocked', p_user);
  end if;
  return jsonb_build_object('status', 'ok');
end $$;

-- 목록: 친구(이름·코드·최고점·최고 라운드·최근 플레이) + 받은/보낸 요청 + 내가 차단한 목록. 점수는 공식(daily) 기록 전체 기준.
create or replace function public.friend_list(p_user uuid) returns jsonb language plpgsql security definer stable set search_path = public as $$
declare res jsonb;
begin
  if not exists (select 1 from public.players where user_id = p_user) then return jsonb_build_object('status', 'no_player'); end if;
  with rel as (
    select case when f.a = p_user then f.b else f.a end as other, f.status, f.requested_by, f.created_at
    from public.friendships f where f.a = p_user or f.b = p_user
  ), j as (
    select r.status, r.requested_by, r.created_at, p.name, p.friend_code as code, p.device_id,
           (select max(s.score) from public.scores s where s.device_id = p.device_id and s.mode = 'daily') as best,
           (select max(s.round) from public.scores s where s.device_id = p.device_id and s.mode = 'daily') as best_round,
           (select max(s.played_at) from public.scores s where s.device_id = p.device_id and s.mode = 'daily') as last_played
    from rel r join public.players p on p.user_id = r.other
  )
  select jsonb_build_object('status', 'ok',
    'friends',  coalesce((select jsonb_agg(jsonb_build_object('name', name, 'code', code, 'best', best, 'best_round', best_round, 'last_played', last_played) order by lower(name)) from j where status = 'accepted'), '[]'::jsonb),
    'incoming', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'code', code, 'at', created_at) order by created_at desc) from j where status = 'pending' and requested_by <> p_user), '[]'::jsonb),
    'outgoing', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'code', code, 'at', created_at) order by created_at desc) from j where status = 'pending' and requested_by = p_user), '[]'::jsonb),
    'blocked',  coalesce((select jsonb_agg(jsonb_build_object('name', name, 'code', code) order by lower(name)) from j where status = 'blocked' and requested_by = p_user), '[]'::jsonb))
  into res;
  return res;
end $$;

-- 친구 랭킹: 나 + 친구들의 해당 시즌 공식 랭킹 최고점(season_best_internal 재사용). rank 는 친구 안에서의 순위, season_rank 는 전체 공식 순위.
-- 점수가 없는 친구는 맨 아래(score=null, rank=null).
create or replace function public.friend_board(p_user uuid, p_season int) returns jsonb language plpgsql security definer stable set search_path = public as $$
declare res jsonb;
begin
  if not exists (select 1 from public.players where user_id = p_user) then return jsonb_build_object('status', 'no_player'); end if;
  with ids as (
    select p_user as uid
    union
    select case when f.a = p_user then f.b else f.a end from public.friendships f where (f.a = p_user or f.b = p_user) and f.status = 'accepted'
  ), m as (
    select p.name, p.friend_code as code, (p.user_id = p_user) as me, sb.score, sb.round, sb.win, sb.hero, sb.played_at, sb.rank as season_rank
    from ids join public.players p on p.user_id = ids.uid
    left join public.season_best_internal sb on sb.device_id = p.device_id and sb.season = p_season
  ), r as (
    select m.*, case when score is null then null else row_number() over (order by score desc nulls last, played_at asc) end as rank from m
  )
  select jsonb_build_object('status', 'ok', 'season', p_season,
    'rows', coalesce(jsonb_agg(jsonb_build_object('rank', rank, 'name', name, 'code', code, 'me', me, 'score', score, 'round', round, 'win', win, 'hero', hero, 'season_rank', season_rank)
            order by rank nulls last, lower(name)), '[]'::jsonb))
  into res from r;
  return res;
end $$;

do $$
declare f text;
begin
  foreach f in array array['friend_code_gen()', 'players_set_friend_code()', 'fr_target(text)', 'fr_count(uuid, text)', 'friend_my_code(uuid)', 'friend_request(uuid, text)',
    'friend_accept(uuid, text)', 'friend_decline(uuid, text)', 'friend_remove(uuid, text)', 'friend_block(uuid, text)', 'friend_list(uuid)', 'friend_board(uuid, int)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
