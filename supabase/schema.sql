-- 말랑 운빨 디펜스 랭킹 서버 스키마 (Supabase SQL Editor 에 통째로 붙여넣고 Run. 여러 번 실행해도 안전)
--
-- 원칙: anon(공개 키)은 "읽기"만 가능. 쓰기는 submit-score Edge Function(service_role)이
--       입력 로그를 서버 엔진으로 재생해 점수를 검증한 뒤 submit_score_best() 로만 한다.

-- ───────────────────────── scores ─────────────────────────
create table if not exists public.scores (
  id           bigint generated always as identity primary key,
  name         text        not null check (char_length(name) between 1 and 10),
  score        int         not null check (score between 0 and 30000),
  round        int         not null check (round between 1 and 50),
  win          boolean     not null default false,
  mode         text        not null default 'daily' check (mode in ('daily', 'practice')),
  seed         int         not null,
  hero         text        not null,
  units        jsonb       not null default '{}'::jsonb,   -- 요약: {"count":n,"pts":n,"kills":n,"draws":n}
  ver          text        not null,
  inputs_hash  text,                                        -- 검증에 쓴 입력 로그의 sha256(hex)
  device_id    uuid,                                        -- 익명 기기 ID (공개 안 함)
  played_at    timestamptz not null default now()
);

-- 같은 기기의 같은 날(seed) 일일 기록은 최고점 1건만 유지 (device_id 가 null 인 행은 제약 대상 아님)
create unique index if not exists scores_device_day_uq on public.scores (device_id, mode, seed);
create index if not exists scores_daily_idx   on public.scores (seed, score desc) where mode = 'daily';
create index if not exists scores_all_idx     on public.scores (score desc) where mode = 'daily';
create index if not exists scores_played_idx  on public.scores (played_at desc);

-- ───────────────────────── RLS ─────────────────────────
alter table public.scores enable row level security;

drop policy if exists scores_public_read on public.scores;
create policy scores_public_read on public.scores for select to anon, authenticated using (true);
-- insert/update/delete 정책을 만들지 않는다 = anon/authenticated 는 직접 쓸 수 없다. (service_role 은 RLS 우회)

revoke all on public.scores from anon, authenticated;
-- 읽기도 컬럼 단위로만 허용: device_id, inputs_hash 는 공개하지 않는다.
grant select (id, name, score, round, win, mode, seed, hero, units, ver, played_at) on public.scores to anon, authenticated;

-- ───────────────────────── 랭킹 뷰 (클라이언트는 이것만 조회) ─────────────────────────
-- (뷰는 소유자 권한으로 실행되어 device_id 를 내부에서 쓰되 밖으로는 내보내지 않는다.)
-- 일일 챌린지: 클라이언트가 오늘 seed 로 필터  /rest/v1/leaderboard_daily?seed=eq.20261027&order=score.desc&limit=50
create or replace view public.leaderboard_daily as
  select name, score, round, win, hero, seed, played_at
  from public.scores
  where mode = 'daily';

-- 전체: 기기별 최고 기록 1건씩 (한 기기가 순위를 도배하지 못하게)
create or replace view public.leaderboard_all as
  select name, score, round, win, hero, seed, played_at
  from (
    select distinct on (coalesce(device_id::text, id::text)) name, score, round, win, hero, seed, played_at
    from public.scores
    where mode = 'daily'
    order by coalesce(device_id::text, id::text), score desc, played_at asc
  ) t;

grant select on public.leaderboard_daily, public.leaderboard_all to anon, authenticated;

-- ───────────────────────── 쓰기 함수 (service_role 전용) ─────────────────────────
-- 같은 (device_id, mode, seed) 가 이미 있으면 더 높은 점수일 때만 갱신. saved=false 면 기존 기록이 더 높거나 같음.
create or replace function public.submit_score_best(
  p_name text, p_score int, p_round int, p_win boolean, p_mode text, p_seed int,
  p_hero text, p_units jsonb, p_ver text, p_inputs_hash text, p_device_id uuid
) returns table (o_saved boolean, o_best int)
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.scores as s (name, score, round, win, mode, seed, hero, units, ver, inputs_hash, device_id)
  values (p_name, p_score, p_round, p_win, p_mode, p_seed, p_hero, coalesce(p_units, '{}'::jsonb), p_ver, p_inputs_hash, p_device_id)
  on conflict (device_id, mode, seed) do update
    set name = excluded.name, score = excluded.score, round = excluded.round, win = excluded.win,
        hero = excluded.hero, units = excluded.units, ver = excluded.ver, inputs_hash = excluded.inputs_hash, played_at = now()
    where s.score < excluded.score;
  get diagnostics n = row_count;
  return query select n > 0, (select max(x.score) from public.scores x where x.device_id is not distinct from p_device_id and x.mode = p_mode and x.seed = p_seed);
end $$;

revoke all on function public.submit_score_best(text, int, int, boolean, text, int, text, jsonb, text, text, uuid) from public, anon, authenticated;
grant execute on function public.submit_score_best(text, int, int, boolean, text, int, text, jsonb, text, text, uuid) to service_role;

-- ───────────────────────── rate limit (Edge Function 이 호출) ─────────────────────────
create table if not exists public.submit_log (
  id        bigint generated always as identity primary key,
  ip_hash   text,
  device_id text,
  at        timestamptz not null default now()
);
create index if not exists submit_log_at_idx on public.submit_log (at desc);
alter table public.submit_log enable row level security;   -- 정책 없음 = service_role 외 접근 불가
revoke all on public.submit_log from anon, authenticated;

-- 최근 1분간 같은 IP 가 p_ip_max 회, 같은 기기가 p_dev_max 회를 넘으면 false(차단). 아니면 기록하고 true.
create or replace function public.rate_limit_hit(p_ip text, p_device text, p_ip_max int default 20, p_dev_max int default 5)
returns boolean language plpgsql security definer set search_path = public as $$
declare ci int; cd int;
begin
  if random() < 0.02 then delete from public.submit_log where at < now() - interval '1 hour'; end if;
  select count(*) into ci from public.submit_log where ip_hash = p_ip and at > now() - interval '1 minute';
  select count(*) into cd from public.submit_log where device_id = p_device and at > now() - interval '1 minute';
  if ci >= p_ip_max or cd >= p_dev_max then return false; end if;
  insert into public.submit_log (ip_hash, device_id) values (p_ip, p_device);
  return true;
end $$;

revoke all on function public.rate_limit_hit(text, text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, text, int, int) to service_role;
