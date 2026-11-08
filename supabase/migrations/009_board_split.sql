-- 009: 랭킹 보드 분리(랜덤 영웅 보드 / 내 영웅 보드). 여러 번 실행해도 안전. Supabase SQL Editor 에서 실행. 선행: 006, 007 (008 은 '내 기록' 탭 영웅 이름용으로 예약).
-- scores.is_mine = 내 영웅 판 여부. 두 보드는 따로 순위를 매기고(이름별 시즌 최고 1건씩), 서로 점수가 섞이지 않는다.
-- 배포 순서: 이 마이그레이션 -> submit-score 함수(내 영웅 판에 p_is_mine=true 전달) -> config.js MYHERO_RANKED:true 클라이언트.
-- 하위 호환: 마이그레이션 전 클라이언트는 is_mine 필터가 400 이면 필터 없이 조회(랜덤 보드), 내 영웅 보드는 '준비 중'으로 보인다.
-- 내부 뷰 season_best_internal(기존 rpc 가 사용, 보드 합산)은 그대로 둔다. 보드별 순위는 새 뷰 season_best_board 를 쓴다.

alter table public.scores add column if not exists is_mine boolean not null default false;

create or replace view public.season_best_board as
  select t.season, t.is_mine, t.device_id, t.name, t.score, t.round, t.win, t.hero, t.seed, t.played_at,
         row_number() over (partition by t.season, t.is_mine order by t.score desc, t.played_at asc, t.device_id) as rank, t.build, t.hero_name
  from (
    select distinct on (s.season, s.is_mine, s.device_id) s.season, s.is_mine, s.device_id, p.name, s.score, s.round, s.win, s.hero, s.seed, s.played_at, s.build, s.hero_name
    from public.scores s join public.players p on p.device_id = s.device_id
    where s.mode = 'daily' and s.season is not null
    order by s.season, s.is_mine, s.device_id, s.score desc, s.played_at asc
  ) t;
revoke all on public.season_best_board from anon, authenticated;

-- 공개 뷰: is_mine 을 맨 끝에 추가(기존 컬럼·순서 유지). rank 는 보드별 순위.
create or replace view public.leaderboard_season as
  select season, rank, name, score, round, win, hero, seed, played_at, build, hero_name, is_mine from public.season_best_board;

create or replace view public.leaderboard_daily as
  select coalesce(p.name, s.name) as name, s.score, s.round, s.win, s.hero, s.seed, s.played_at, s.season, s.build, s.hero_name, s.is_mine
  from public.scores s left join public.players p on p.device_id = s.device_id
  where s.mode = 'daily';
grant select on public.leaderboard_season, public.leaderboard_daily to anon, authenticated;

-- submit_score_season: p_is_mine(기본 false) 추가. 순위/응답 값은 그 판이 속한 보드 기준.
-- 옛 시그니처를 지우고 새로 만든다(두 개가 공존하면 기본값 때문에 호출이 모호해진다).
drop function if exists public.submit_score_season(int, int, int, boolean, text, int, text, jsonb, text, text, uuid, jsonb);
create or replace function public.submit_score_season(
  p_season int, p_score int, p_round int, p_win boolean, p_mode text, p_seed int,
  p_hero text, p_units jsonb, p_ver text, p_inputs_hash text, p_device_id uuid, p_build jsonb default null, p_is_mine boolean default false
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
  select b.rank::int, b.score into rb, pb from public.season_best_board b where b.season = p_season and b.is_mine = p_is_mine and b.device_id = p_device_id;

  insert into public.scores as s (name, score, round, win, mode, seed, hero, units, ver, inputs_hash, device_id, season, build, is_mine)
  values (pname, p_score, p_round, p_win, p_mode, p_seed, p_hero, coalesce(p_units, '{}'::jsonb), p_ver, p_inputs_hash, p_device_id, p_season, p_build, p_is_mine)
  on conflict (device_id, mode, seed) do update
    set name = excluded.name, score = excluded.score, round = excluded.round, win = excluded.win,
        hero = excluded.hero, units = excluded.units, ver = excluded.ver, inputs_hash = excluded.inputs_hash,
        season = excluded.season, build = excluded.build, is_mine = excluded.is_mine, played_at = now()
    where s.score < excluded.score;
  get diagnostics n = row_count;
  update public.players set plays = plays + 1 where device_id = p_device_id;

  select b.rank::int, b.score into ra, sb from public.season_best_board b where b.season = p_season and b.is_mine = p_is_mine and b.device_id = p_device_id;
  select count(*)::int into tot from public.season_best_board b where b.season = p_season and b.is_mine = p_is_mine;
  select b.score into tp from public.season_best_board b where b.season = p_season and b.is_mine = p_is_mine and b.rank = 1;
  select b.score into nx from public.season_best_board b where b.season = p_season and b.is_mine = p_is_mine and b.rank = ra - 1;
  return query select 'ok'::text, n > 0, (select max(x.score) from public.scores x where x.device_id = p_device_id and x.mode = p_mode and x.seed = p_seed),
                       pname, pb, sb, rb, ra, nx, tp, tot;
end $$;
revoke all on function public.submit_score_season(int, int, int, boolean, text, int, text, jsonb, text, text, uuid, jsonb, boolean) from public, anon, authenticated;
