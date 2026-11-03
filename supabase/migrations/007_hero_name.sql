-- 007: '내 영웅' 이름을 랭킹에 표시. 여러 번 실행해도 안전. Supabase SQL Editor 에서 실행. 선행: 006.
-- scores.hero_name = 플레이어가 내 영웅에 붙인 이름(랜덤 영웅 판은 null). 서버가 리플레이로 점수를 검증한 뒤에만 submit-score 함수가 기록한다.
-- 배포 순서: 이 마이그레이션 -> submit-score 함수(내 영웅 지원판) -> config.js MYHERO_RANKED:true 클라이언트.
-- (함수가 먼저 나가도 hero_name 기록만 실패하고 점수는 저장된다. 클라이언트는 hero_name 컬럼이 없으면 자동으로 빼고 조회한다.)

alter table public.scores add column if not exists hero_name text;

-- 뷰: hero_name 을 맨 끝에 추가(기존 컬럼·순서 유지)
create or replace view public.season_best_internal as
  select t.season, t.device_id, t.name, t.score, t.round, t.win, t.hero, t.seed, t.played_at,
         row_number() over (partition by t.season order by t.score desc, t.played_at asc, t.device_id) as rank, t.build, t.hero_name
  from (
    select distinct on (s.season, s.device_id) s.season, s.device_id, p.name, s.score, s.round, s.win, s.hero, s.seed, s.played_at, s.build, s.hero_name
    from public.scores s join public.players p on p.device_id = s.device_id
    where s.mode = 'daily' and s.season is not null
    order by s.season, s.device_id, s.score desc, s.played_at asc
  ) t;
revoke all on public.season_best_internal from anon, authenticated;

create or replace view public.leaderboard_season as
  select season, rank, name, score, round, win, hero, seed, played_at, build, hero_name from public.season_best_internal;

create or replace view public.leaderboard_daily as
  select coalesce(p.name, s.name) as name, s.score, s.round, s.win, s.hero, s.seed, s.played_at, s.season, s.build, s.hero_name
  from public.scores s left join public.players p on p.device_id = s.device_id
  where s.mode = 'daily';
grant select on public.leaderboard_season, public.leaderboard_daily to anon, authenticated;

-- 제출 직후 호출(service_role 전용). 점수가 이긴 행(= 방금 저장된 기록)에만 이름을 붙인다.
create or replace function public.score_set_hero_name(p_device uuid, p_mode text, p_seed int, p_hero_name text)
returns void language sql security definer set search_path = public as $$
  update public.scores set hero_name = p_hero_name where device_id = p_device and mode = p_mode and seed = p_seed;
$$;
revoke all on function public.score_set_hero_name(uuid, text, int, text) from public, anon, authenticated;
