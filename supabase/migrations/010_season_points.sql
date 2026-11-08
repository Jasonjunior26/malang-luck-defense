-- 010: 주간 시즌(일~토, KST) 현재 시즌 id 함수 + 리그별 누적 승점(1위 3 / 2위 2 / 3위 1). 여러 번 실행해도 안전. Supabase SQL Editor 에서 실행.
-- 선행: 009(season_best_board, scores.is_mine). 008 은 '내 기록' 탭 영웅 이름용으로 예약(건너뜀).
-- 크론/배치 없음: 끝난 시즌(season < season_current())의 최종 순위는 새 기록이 더 들어오지 않으므로(서버가 제출 시각의 시즌에만 저장) 뷰가 항상 같은 값을 돌려준다.
-- 규칙은 data.js 의 SEASONS-BEGIN~END 와 같아야 한다: 앵커 2026-11-08(일) = 시즌 2, 7일마다 +1, 그 전은 시즌 1(옛 시즌, 2026-10-27~11-07).
-- 동점: 시즌 순위는 season_best_board 가 (점수 내림차순, 먼저 달성한 기록 played_at 오름차순, device_id) 로 정해 항상 순서가 확정된다(공동 순위 없음).
--       누적 승점 동점은 금 > 은 > 동 횟수 순으로 가르고, 그래도 같으면 공동 순위(rank() 의 동일 순위, 목록은 이름순).
-- 배포 순서: 007 -> 009 -> 이 마이그레이션 -> submit-score 함수(engine.js 재생성본) -> 클라이언트. 클라이언트는 이 뷰가 없으면(404/400) '승점 준비 중'으로 폴백한다.
-- 롤백: drop view public.leaderboard_points; drop view public.season_final_points; drop function public.season_current();  (데이터 변경 없음)

create or replace function public.season_current() returns int
language sql stable as $$
  select case when d >= date '2026-11-08' then 2 + ((d - date '2026-11-08') / 7) else 1 end
  from (select (now() at time zone 'Asia/Seoul')::date as d) x
$$;
grant execute on function public.season_current() to anon, authenticated, service_role;

-- 끝난 시즌의 리그별 TOP 3 (내부용)
create or replace view public.season_final_points as
  select b.season, b.is_mine, b.device_id, b.rank::int as rank,
         case b.rank when 1 then 3 when 2 then 2 else 1 end as pts
  from public.season_best_board b
  where b.rank <= 3 and b.season < public.season_current();
revoke all on public.season_final_points from anon, authenticated;

-- 공개: 리그별 누적 승점 순위 (is_mine=false 운빨 리그 / true 나만의 영웅 리그)
create or replace view public.leaderboard_points as
  select rank() over (partition by t.is_mine order by t.points desc, t.gold desc, t.silver desc, t.bronze desc)::int as rank,
         t.is_mine, t.name, t.points, t.gold, t.silver, t.bronze, t.last_season
  from (
    select f.is_mine, p.name, sum(f.pts)::int as points,
           (count(*) filter (where f.rank = 1))::int as gold,
           (count(*) filter (where f.rank = 2))::int as silver,
           (count(*) filter (where f.rank = 3))::int as bronze,
           max(f.season)::int as last_season
    from public.season_final_points f join public.players p on p.device_id = f.device_id
    group by f.is_mine, f.device_id, p.name
  ) t;
grant select on public.leaderboard_points to anon, authenticated;
