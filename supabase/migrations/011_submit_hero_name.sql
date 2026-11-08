-- 011: submit_score_season 이 영웅 이름(p_hero_name)을 직접 저장 -> 제출마다 DB 왕복 1회(score_set_hero_name) 절약. 여러 번 실행해도 안전.
-- 배포 순서: 이 마이그레이션 -> submit-score 함수(p_hero_name 전달). 옛 함수는 p_hero_name 없이 불러도 동작(기본값 null).
-- 더 높은 점수로 덮어쓸 때 hero_name 도 새 판 값으로 바뀐다(랜덤 판이면 null).
drop function if exists public.submit_score_season(int, int, int, boolean, text, int, text, jsonb, text, text, uuid, jsonb, boolean);
create or replace function public.submit_score_season(
  p_season int, p_score int, p_round int, p_win boolean, p_mode text, p_seed int,
  p_hero text, p_units jsonb, p_ver text, p_inputs_hash text, p_device_id uuid, p_build jsonb default null, p_is_mine boolean default false,
  p_hero_name text default null
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

  insert into public.scores as s (name, score, round, win, mode, seed, hero, units, ver, inputs_hash, device_id, season, build, is_mine, hero_name)
  values (pname, p_score, p_round, p_win, p_mode, p_seed, p_hero, coalesce(p_units, '{}'::jsonb), p_ver, p_inputs_hash, p_device_id, p_season, p_build, p_is_mine, p_hero_name)
  on conflict (device_id, mode, seed) do update
    set name = excluded.name, score = excluded.score, round = excluded.round, win = excluded.win,
        hero = excluded.hero, units = excluded.units, ver = excluded.ver, inputs_hash = excluded.inputs_hash,
        season = excluded.season, build = excluded.build, is_mine = excluded.is_mine, hero_name = excluded.hero_name, played_at = now()
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
revoke all on function public.submit_score_season(int, int, int, boolean, text, int, text, jsonb, text, text, uuid, jsonb, boolean, text) from public, anon, authenticated;
