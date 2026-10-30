-- 006: 랭킹 줄에 '빌드 요약'(무리별 유닛 수·강화 Lv·최고 등급) 표시. 여러 번 실행해도 안전. Supabase SQL Editor 에서 실행. 선행: 002, 004.
-- build = {"clans":[{"n":유닛수,"lv":최종 공업Lv} x4 (숲·불꽃·물결·별빛), "top":0~7}  (서버가 리플레이로 계산, 기존 기록은 null)
-- 배포 순서: 이 마이그레이션 -> submit-score 함수 -> 클라이언트. (p_build 는 default null 이라 구 함수/구 호출도 계속 동작)

alter table public.scores add column if not exists build jsonb;

-- 시그니처가 바뀌므로 구 버전 삭제 후 재생성(p_build default null 이라 기존 호출 호환)
drop function if exists public.submit_score_season(int, int, int, boolean, text, int, text, jsonb, text, text, uuid);
drop function if exists public.submit_score_private(uuid, uuid, text, int, int, boolean, int, text, jsonb, text, text, date, timestamptz);

-- 뷰: build 를 맨 끝에 추가(기존 컬럼·순서 유지)
create or replace view public.season_best_internal as
  select t.season, t.device_id, t.name, t.score, t.round, t.win, t.hero, t.seed, t.played_at,
         row_number() over (partition by t.season order by t.score desc, t.played_at asc, t.device_id) as rank, t.build
  from (
    select distinct on (s.season, s.device_id) s.season, s.device_id, p.name, s.score, s.round, s.win, s.hero, s.seed, s.played_at, s.build
    from public.scores s join public.players p on p.device_id = s.device_id
    where s.mode = 'daily' and s.season is not null
    order by s.season, s.device_id, s.score desc, s.played_at asc
  ) t;
revoke all on public.season_best_internal from anon, authenticated;

create or replace view public.leaderboard_season as
  select season, rank, name, score, round, win, hero, seed, played_at, build from public.season_best_internal;

create or replace view public.leaderboard_daily as
  select coalesce(p.name, s.name) as name, s.score, s.round, s.win, s.hero, s.seed, s.played_at, s.season, s.build
  from public.scores s left join public.players p on p.device_id = s.device_id
  where s.mode = 'daily';
grant select on public.leaderboard_season, public.leaderboard_daily to anon, authenticated;

create or replace function public.submit_score_season(
  p_season int, p_score int, p_round int, p_win boolean, p_mode text, p_seed int,
  p_hero text, p_units jsonb, p_ver text, p_inputs_hash text, p_device_id uuid, p_build jsonb default null
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

  insert into public.scores as s (name, score, round, win, mode, seed, hero, units, ver, inputs_hash, device_id, season, build)
  values (pname, p_score, p_round, p_win, p_mode, p_seed, p_hero, coalesce(p_units, '{}'::jsonb), p_ver, p_inputs_hash, p_device_id, p_season, p_build)
  on conflict (device_id, mode, seed) do update
    set name = excluded.name, score = excluded.score, round = excluded.round, win = excluded.win,
        hero = excluded.hero, units = excluded.units, ver = excluded.ver, inputs_hash = excluded.inputs_hash,
        season = excluded.season, build = excluded.build, played_at = now()
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

create or replace function public.submit_score_private(
  p_user uuid, p_season uuid, p_name text, p_score int, p_round int, p_win boolean, p_seed int,
  p_hero text, p_units jsonb, p_ver text, p_inputs_hash text, p_today date, p_now timestamptz, p_build jsonb default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.private_seasons; m public.season_members; used int; rb int; ra int; sb int; pb int; tot int; n int;
begin
  select * into s from public.private_seasons where id = p_season;
  if not found then return jsonb_build_object('status', 'no_such_season'); end if;
  select * into m from public.season_members where season_id = p_season and player_id = p_user for update;  -- 같은 유저의 동시 제출 직렬화
  if not found or m.kicked then return jsonb_build_object('status', 'not_member'); end if;
  if s.status = 'cancelled' then return jsonb_build_object('status', 'cancelled'); end if;
  if p_today < s.start_date then return jsonb_build_object('status', 'not_started'); end if;
  if s.ended_at is not null or p_now > ((s.end_date + 1)::timestamp at time zone 'Asia/Seoul') + interval '10 minutes' then
    return jsonb_build_object('status', 'season_over');
  end if;
  if s.daily_run_limit is not null then
    select count(*) into used from public.scores x
     where x.season_id = p_season and x.device_id = p_user and (x.played_at at time zone 'Asia/Seoul')::date = p_today;
    if used >= s.daily_run_limit then return jsonb_build_object('status', 'daily_limit', 'limit', s.daily_run_limit); end if;
  end if;
  select r.rank::int, r.score into rb, pb from (
    select b.player_id, b.score, row_number() over (order by b.score desc, b.round desc, b.played_at asc, b.player_id) as rank
    from (select distinct on (x.device_id) x.device_id as player_id, x.score, x.round, x.played_at
          from public.scores x join public.season_members mm on mm.season_id = x.season_id and mm.player_id = x.device_id and not mm.kicked
          where x.season_id = p_season order by x.device_id, x.score desc, x.round desc, x.played_at asc) b) r where r.player_id = p_user;

  insert into public.scores (name, score, round, win, mode, seed, hero, units, ver, inputs_hash, device_id, season_id, build)
  values (p_name, p_score, p_round, p_win, 'private', p_seed, p_hero, coalesce(p_units, '{}'::jsonb), p_ver, p_inputs_hash, p_user, p_season, p_build)
  on conflict (device_id, mode, seed) do nothing;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('status', 'duplicate'); end if;
  update public.season_members set name = p_name where season_id = p_season and player_id = p_user;

  select r.rank::int, r.score into ra, sb from (
    select b.player_id, b.score, row_number() over (order by b.score desc, b.round desc, b.played_at asc, b.player_id) as rank
    from (select distinct on (x.device_id) x.device_id as player_id, x.score, x.round, x.played_at
          from public.scores x join public.season_members mm on mm.season_id = x.season_id and mm.player_id = x.device_id and not mm.kicked
          where x.season_id = p_season order by x.device_id, x.score desc, x.round desc, x.played_at asc) b) r where r.player_id = p_user;
  select count(distinct x.device_id)::int into tot from public.scores x join public.season_members mm on mm.season_id = x.season_id and mm.player_id = x.device_id and not mm.kicked where x.season_id = p_season;
  return jsonb_build_object('status', 'ok', 'saved', true, 'season_best', sb, 'prev_best', pb, 'rank_before', rb, 'rank_after', ra, 'total', tot);
end $$;

create or replace function public.private_season_leaderboard(p_user uuid, p_id uuid, p_limit int default 100)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare rows jsonb;
begin
  if not exists (select 1 from public.season_members where season_id = p_id and player_id = p_user and not kicked) then
    return jsonb_build_object('status', 'not_member');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('rank', t.rank, 'name', t.name, 'score', t.score, 'round', t.round, 'win', t.win,
                                               'hero', t.hero, 'build', t.build, 'played_at', t.played_at, 'me', t.player_id = p_user,
                                               'owner', t.player_id = (select owner from public.private_seasons where id = p_id)) order by t.rank), '[]'::jsonb)
    into rows
  from (
    select b.*, row_number() over (order by b.score desc, b.round desc, b.played_at asc, b.player_id) as rank
    from (
      select distinct on (m.player_id) m.player_id, m.name, x.score, x.round, x.win, x.hero, x.build, x.played_at
      from public.season_members m join public.scores x on x.season_id = m.season_id and x.device_id = m.player_id
      where m.season_id = p_id and not m.kicked
      order by m.player_id, x.score desc, x.round desc, x.played_at asc
    ) b
  ) t where t.rank <= p_limit;
  return jsonb_build_object('status', 'ok', 'rows', rows,
    'total', (select count(distinct x.device_id) from public.scores x join public.season_members m on m.season_id = x.season_id and m.player_id = x.device_id and not m.kicked where x.season_id = p_id));
end $$;

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
    select seed, score, round, win, hero, build, played_at from public.scores
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
    'submit_score_season(int, int, int, boolean, text, int, text, jsonb, text, text, uuid, jsonb)',
    'submit_score_private(uuid, uuid, text, int, int, boolean, int, text, jsonb, text, text, date, timestamptz, jsonb)',
    'private_season_leaderboard(uuid, uuid, int)',
    'player_profile(uuid, int, timestamptz)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
