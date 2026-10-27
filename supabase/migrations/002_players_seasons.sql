-- 말랑 운빨 디펜스: 플레이어(닉네임 고정/중복 불가) + 시즌제 랭킹 마이그레이션
-- Supabase SQL Editor 에 통째로 붙여넣고 Run. 기존 scores 데이터는 지우지 않는다. 여러 번 실행해도 안전(if not exists / create or replace).
-- 이 파일이 "이미 schema.sql 을 실행한 DB" 의 정식 적용 경로다. (schema.sql 은 처음부터 만드는 사람을 위한 최종 상태 사본)
--
-- 원칙: anon 은 뷰(leaderboard_*) 읽기만. 모든 쓰기·device_id 가 필요한 조회는 submit-score 함수(service_role)가 아래 RPC 로 한다.
-- 시즌 정의(기간)는 data.js 의 SEASONS 한 곳에만 있다. 이 SQL 은 시즌 기간을 모르고, 함수가 서버 시간(KST)으로 정한 season 번호를 넘겨준다.

-- ───────────────────────── players: 닉네임은 기기(device_id)에 붙고 서버에서 중복 불가 ─────────────────────────
create table if not exists public.players (
  device_id       uuid primary key,
  name            text        not null check (char_length(name) between 2 and 10),
  name_changed_at timestamptz,                          -- 마지막 "변경" 시각 (등록은 null). 1일 1회 제한(KST 날짜) 기준
  plays           int         not null default 0,       -- 서버가 검증한 누적 판수
  created_at      timestamptz not null default now()
);
-- 대소문자 무시 중복 불가
create unique index if not exists players_name_uq on public.players (lower(name));
alter table public.players enable row level security;     -- 정책 없음 = service_role 외 접근 불가
revoke all on public.players from anon, authenticated;

-- ───────────────────────── scores: 시즌 컬럼 ─────────────────────────
alter table public.scores add column if not exists season int;
create index if not exists scores_season_idx on public.scores (season, device_id, score desc) where mode = 'daily';
-- 기존 기록 중 시즌 1 기간(KST)에 해당하는 것만 시즌 1 로 표시. 그 밖(시즌 전 테스트 기록)은 season=null 이라 시즌 랭킹에 안 나온다.
update public.scores set season = 1
 where season is null and mode = 'daily'
   and (played_at at time zone 'Asia/Seoul')::date between date '2026-10-27' and date '2026-11-15';
grant select (season) on public.scores to anon, authenticated;

-- ───────────────────────── 랭킹 뷰 ─────────────────────────
-- 내부용(공개 안 함): 시즌별 플레이어당 최고점 1건 + 순위 (동점이면 먼저 달성한 기록이 위, 그래도 같으면 device_id 순)
create or replace view public.season_best_internal as
  select t.season, t.device_id, t.name, t.score, t.round, t.win, t.hero, t.seed, t.played_at,
         row_number() over (partition by t.season order by t.score desc, t.played_at asc, t.device_id) as rank
  from (
    select distinct on (s.season, s.device_id) s.season, s.device_id, p.name, s.score, s.round, s.win, s.hero, s.seed, s.played_at
    from public.scores s join public.players p on p.device_id = s.device_id
    where s.mode = 'daily' and s.season is not null
    order by s.season, s.device_id, s.score desc, s.played_at asc
  ) t;
revoke all on public.season_best_internal from anon, authenticated;

-- 공개: 시즌 랭킹  /rest/v1/leaderboard_season?season=eq.1&order=rank.asc&limit=50
create or replace view public.leaderboard_season as
  select season, rank, name, score, round, win, hero, seed, played_at from public.season_best_internal;

-- 오늘(일일 seed) 랭킹: 현재 닉네임(players) 기준으로 표시 -> 닉네임을 바꾸면 과거 기록도 새 이름. 끝에 season 컬럼 추가.
create or replace view public.leaderboard_daily as
  select coalesce(p.name, s.name) as name, s.score, s.round, s.win, s.hero, s.seed, s.played_at, s.season
  from public.scores s left join public.players p on p.device_id = s.device_id
  where s.mode = 'daily';

-- 전체 최고(기기별 1건) - 호환용 유지, 이름은 현재 닉네임
create or replace view public.leaderboard_all as
  select name, score, round, win, hero, seed, played_at
  from (
    select distinct on (coalesce(s.device_id::text, s.id::text)) coalesce(p.name, s.name) as name, s.score, s.round, s.win, s.hero, s.seed, s.played_at
    from public.scores s left join public.players p on p.device_id = s.device_id
    where s.mode = 'daily'
    order by coalesce(s.device_id::text, s.id::text), s.score desc, s.played_at asc
  ) t;

grant select on public.leaderboard_season, public.leaderboard_daily, public.leaderboard_all to anon, authenticated;

-- ───────────────────────── rate limit: 종류(kind)별 집계 ─────────────────────────
alter table public.submit_log add column if not exists kind text not null default 'submit';
drop function if exists public.rate_limit_hit(text, text, int, int);
create or replace function public.rate_limit_hit(p_ip text, p_device text, p_ip_max int default 20, p_dev_max int default 5, p_kind text default 'submit')
returns boolean language plpgsql security definer set search_path = public as $$
declare ci int; cd int;
begin
  if random() < 0.02 then delete from public.submit_log where at < now() - interval '1 hour'; end if;
  select count(*) into ci from public.submit_log where ip_hash = p_ip and kind = p_kind and at > now() - interval '1 minute';
  select count(*) into cd from public.submit_log where device_id = p_device and kind = p_kind and at > now() - interval '1 minute';
  if ci >= p_ip_max or cd >= p_dev_max then return false; end if;
  insert into public.submit_log (ip_hash, device_id, kind) values (p_ip, p_device, p_kind);
  return true;
end $$;
revoke all on function public.rate_limit_hit(text, text, int, int, text) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, text, int, int, text) to service_role;

-- ───────────────────────── 플레이어 RPC (service_role 전용) ─────────────────────────
-- 등록: 이미 이 기기에 닉네임이 있으면 그대로 돌려줌(o_status='exists'). 이름이 겹치면 'name_taken'.
create or replace function public.player_register(p_device uuid, p_name text)
returns table (o_status text, o_name text)
language plpgsql security definer set search_path = public as $$
declare cur text;
begin
  select name into cur from public.players where device_id = p_device;
  if found then return query select 'exists'::text, cur; return; end if;
  begin
    insert into public.players (device_id, name) values (p_device, p_name);
  exception when unique_violation then
    return query select 'name_taken'::text, null::text; return;
  end;
  return query select 'ok'::text, p_name;
end $$;

-- 변경: KST 날짜 기준 1일 1회. p_now 는 함수(서버)가 넘기는 현재 시각. o_next 는 다음 변경 가능 시각(KST 자정).
create or replace function public.player_rename(p_device uuid, p_name text, p_now timestamptz)
returns table (o_status text, o_name text, o_next timestamptz)
language plpgsql security definer set search_path = public as $$
declare cur text; chg timestamptz; today date; nxt timestamptz;
begin
  select name, name_changed_at into cur, chg from public.players where device_id = p_device for update;
  if not found then return query select 'no_player'::text, null::text, null::timestamptz; return; end if;
  today := (p_now at time zone 'Asia/Seoul')::date;
  if cur = p_name then return query select 'same'::text, cur, null::timestamptz; return; end if;
  if chg is not null and (chg at time zone 'Asia/Seoul')::date >= today then
    nxt := ((today + 1)::timestamp at time zone 'Asia/Seoul');
    return query select 'cooldown'::text, cur, nxt; return;
  end if;
  begin
    update public.players set name = p_name, name_changed_at = p_now where device_id = p_device;
  exception when unique_violation then
    return query select 'name_taken'::text, cur, null::timestamptz; return;
  end;
  return query select 'ok'::text, p_name, ((today + 1)::timestamp at time zone 'Asia/Seoul');
end $$;

-- 계정 이전 코드 확인: 해당 device_id 의 플레이어가 있으면 닉네임을 돌려준다.
create or replace function public.player_get(p_device uuid)
returns table (o_name text) language sql security definer set search_path = public as $$
  select name from public.players where device_id = p_device;
$$;

-- 시즌 점수 저장: 같은 (기기, 모드, seed) 는 더 높은 점수일 때만 갱신. 순위 변동을 함께 돌려준다.
create or replace function public.submit_score_season(
  p_season int, p_score int, p_round int, p_win boolean, p_mode text, p_seed int,
  p_hero text, p_units jsonb, p_ver text, p_inputs_hash text, p_device_id uuid
) returns table (o_status text, o_saved boolean, o_best int, o_name text,
                 o_prev_best int, o_season_best int, o_rank_before int, o_rank_after int,
                 o_next_score int, o_top_score int, o_total int)
language plpgsql security definer set search_path = public as $$
declare pname text; n int; rb int; ra int; pb int; sb int; nx int; tp int; tot int;
begin
  select name into pname from public.players where device_id = p_device_id;
  if not found then
    return query select 'no_player'::text, false, null::int, null::text, null::int, null::int, null::int, null::int, null::int, null::int, null::int; return;
  end if;
  select b.rank::int, b.score into rb, pb from public.season_best_internal b where b.season = p_season and b.device_id = p_device_id;

  insert into public.scores as s (name, score, round, win, mode, seed, hero, units, ver, inputs_hash, device_id, season)
  values (pname, p_score, p_round, p_win, p_mode, p_seed, p_hero, coalesce(p_units, '{}'::jsonb), p_ver, p_inputs_hash, p_device_id, p_season)
  on conflict (device_id, mode, seed) do update
    set name = excluded.name, score = excluded.score, round = excluded.round, win = excluded.win,
        hero = excluded.hero, units = excluded.units, ver = excluded.ver, inputs_hash = excluded.inputs_hash,
        season = excluded.season, played_at = now()
    where s.score < excluded.score;
  get diagnostics n = row_count;
  update public.players set plays = plays + 1 where device_id = p_device_id;

  select b.rank::int, b.score into ra, sb from public.season_best_internal b where b.season = p_season and b.device_id = p_device_id;
  select count(*)::int into tot from public.season_best_internal b where b.season = p_season;
  select b.score into tp from public.season_best_internal b where b.season = p_season and b.rank = 1;
  select b.score into nx from public.season_best_internal b where b.season = p_season and b.rank = ra - 1;
  return query select 'ok'::text, n > 0, (select max(x.score) from public.scores x where x.device_id = p_device_id and x.mode = p_mode and x.seed = p_seed),
                       pname, pb, sb, rb, ra, nx, tp, tot;
end $$;

-- 내 프로필(시즌 기준): 닉네임, 변경 가능 여부, 시즌 최고/순위/판수, 누적, 이번 시즌 내 판들
create or replace function public.player_profile(p_device uuid, p_season int, p_now timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pl public.players%rowtype; b record; tot int; top1 record; today date; can boolean; nxt timestamptz; mine jsonb; allbest int; srows int;
begin
  select * into pl from public.players where device_id = p_device;
  if not found then return jsonb_build_object('exists', false); end if;
  today := (p_now at time zone 'Asia/Seoul')::date;
  can := pl.name_changed_at is null or (pl.name_changed_at at time zone 'Asia/Seoul')::date < today;
  nxt := case when can then null else ((today + 1)::timestamp at time zone 'Asia/Seoul') end;
  select * into b from public.season_best_internal where season = p_season and device_id = p_device;
  select count(*)::int into tot from public.season_best_internal where season = p_season;
  select name, score into top1 from public.season_best_internal where season = p_season and rank = 1;
  select coalesce(max(score), 0) into allbest from public.scores where device_id = p_device and mode = 'daily';
  select count(*)::int into srows from public.scores where device_id = p_device and mode = 'daily' and season = p_season;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.played_at desc), '[]'::jsonb) into mine from (
    select seed, score, round, win, hero, played_at from public.scores
    where device_id = p_device and mode = 'daily' and season = p_season order by played_at desc limit 30) x;
  return jsonb_build_object(
    'exists', true, 'name', pl.name, 'can_change', can, 'next_change_at', nxt, 'plays', pl.plays,
    'season_best', b.score, 'season_round', b.round, 'season_rank', b.rank, 'season_total', tot, 'season_days', srows,
    'top_name', top1.name, 'top_score', top1.score, 'all_best', allbest, 'mine', mine,
    'next_score', (select x.score from public.season_best_internal x where x.season = p_season and x.rank = b.rank - 1));
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'player_register(uuid, text)', 'player_rename(uuid, text, timestamptz)', 'player_get(uuid)',
    'player_profile(uuid, int, timestamptz)',
    'submit_score_season(int, int, int, boolean, text, int, text, jsonb, text, text, uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
-- (옛 submit_score_best 는 남겨 두지만 service_role 전용이라 무해하다. 새 함수는 submit_score_season 을 쓴다.)
