-- 012: 주간 랭킹 보상. 새 객체만 만든다(기존 테이블·뷰·함수 변경 없음). 여러 번 실행해도 안전. Supabase SQL Editor 에서 실행.
-- 선행: 009(season_best_board), 010(season_current). 스펙: docs/주간보상_스펙.md, 검산: docs/주간보상_서버.md.
-- 배포 순서: 이 마이그레이션 -> submit-score 함수(rewards / rewardAck) -> 클라이언트. 클라이언트는 서버에 rewards 가 없으면 조용히 무시한다.
-- 정산은 크론 없이 지연 정산: submit-score 의 rewards 조회 때 season_rewards_get() 이 끝난 시즌(2 이상) 중 미정산 시즌을 정산한다.
-- 순위는 season_best_board.rank(점수 내림차순, 달성시각 오름차순, device_id: 공동 순위 없음) 그대로라 운영 랭킹 화면과 항상 같다.
-- 롤백(새 객체뿐, 기존 데이터 영향 없음):
--   drop function if exists public.season_rewards_ack(uuid, int[]);
--   drop function if exists public.season_rewards_get(uuid);
--   drop function if exists public.season_rewards_settle(int);
--   drop function if exists public.reward_bonus(int);
--   drop function if exists public.reward_base(int, int);
--   drop function if exists public.reward_settled_upto();
--   drop function if exists public.reward_tbl();
--   drop table if exists public.season_rewards;
--   drop table if exists public.season_reward_runs;

-- 보상 상수: 이 함수 한 곳에서만 정한다(TOP1_EXTRA = extra1). 응답의 tbl 도 이 값을 그대로 쓴다.
create or replace function public.reward_tbl() returns jsonb
language sql immutable as $$
  select '{"top":200,"last":10,"b1":100,"b2":70,"b3":50,"extra1":100,"ratio":30}'::jsonb
$$;

-- 정산 가능한 마지막 시즌 = (지금-10분)이 속한 시즌 - 1. 시즌 종료 직후 10분은 정산·팝업을 열지 않는다(유예).
-- 이유: submit-score 는 요청 수신 시각에 시즌 id 를 정하고 재생 후 저장하므로, 경계 직전에 시작한 제출이 종료 직후에 저장될 수 있다.
-- 규칙은 season_current()(010)와 같은 앵커(2026-11-08 = 시즌 2, 7일마다 +1)를 쓴다.
create or replace function public.reward_settled_upto() returns int
language sql stable as $$
  select (case when d >= date '2026-11-08' then 2 + ((d - date '2026-11-08') / 7) else 1 end) - 1
  from (select ((now() - interval '10 minutes') at time zone 'Asia/Seoul')::date as d) x
$$;

-- 기본 보상: 1위 200 -> K위 10 선형, 10 단위 올림. 정수 연산만. 범위 밖(r<1, r>k, k<10)은 0.
create or replace function public.reward_base(r int, k int) returns int
language sql immutable as $$
  select case
    when r is null or k is null or k < 10 or r < 1 or r > k then 0
    else ((200 * (k - 1) - 190 * (r - 1) + 10 * (k - 1) - 1) / (10 * (k - 1))) * 10
  end
$$;

-- 1·2·3위 별도 보상 + 리그 1위 추가(1위 = b1 + extra1). 4위 이하 0.
create or replace function public.reward_bonus(r int) returns int
language sql immutable as $$
  select case r
    when 1 then (public.reward_tbl()->>'b1')::int + (public.reward_tbl()->>'extra1')::int
    when 2 then (public.reward_tbl()->>'b2')::int
    when 3 then (public.reward_tbl()->>'b3')::int
    else 0 end
$$;

-- 정산 완료 기록(시즌·리그당 1행; 0명 보드도 기록). 재정산 금지의 기준.
create table if not exists public.season_reward_runs (
  season int not null,
  is_mine boolean not null,
  n int not null,
  k int not null,
  settled_at timestamptz not null default now(),
  primary key (season, is_mine)
);
alter table public.season_reward_runs enable row level security;   -- 정책 없음 = service_role 외 접근 불가
revoke all on public.season_reward_runs from anon, authenticated;

create table if not exists public.season_rewards (
  season int not null,
  is_mine boolean not null,
  device_id uuid not null,
  name text,           -- 정산 시점의 닉네임·영웅 이름(점수 레코드가 나중에 이동해도 팝업 top 이 정산 결과와 같도록 저장)
  hero_name text,
  rank int not null,
  base int not null,
  bonus int not null,
  total int generated always as (base + bonus) stored,
  settled_at timestamptz not null default now(),
  claimed_at timestamptz null,
  primary key (season, is_mine, device_id)
);
create index if not exists season_rewards_device_idx on public.season_rewards (device_id) where claimed_at is null;
alter table public.season_rewards enable row level security;       -- 정책 없음 = 익명 키로 읽기 불가
revoke all on public.season_rewards from anon, authenticated;

-- 한 시즌 정산. 멱등(이미 정산한 리그는 건너뜀), 동시 호출 안전(시즌별 advisory lock + 기본키 on conflict do nothing).
-- 시즌 < 2 이거나 아직 정산 불가인 시즌(> reward_settled_upto(): 진행 중이거나 종료 후 10분 이내)은 아무것도 안 하고 0. 반환: 이번 호출에서 새로 정산한 리그 수(0~2).
create or replace function public.season_rewards_settle(p_season int) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare lg boolean; n int; k int; done int := 0;
begin
  if p_season is null or p_season < 2 or p_season > public.reward_settled_upto() then return 0; end if;
  perform pg_advisory_xact_lock(1200012, p_season);                 -- 같은 시즌 동시 정산 직렬화(트랜잭션 끝에 해제)
  foreach lg in array array[false, true] loop
    if exists (select 1 from public.season_reward_runs x where x.season = p_season and x.is_mine = lg) then continue; end if;
    select count(*)::int into n from public.season_best_board b where b.season = p_season and b.is_mine = lg;
    k := greatest(10, (3 * n + 9) / 10);                            -- ceil(0.3 * N) 정수 연산
    insert into public.season_rewards (season, is_mine, device_id, name, hero_name, rank, base, bonus)
      select b.season, b.is_mine, b.device_id, b.name, b.hero_name, b.rank::int, public.reward_base(b.rank::int, k), public.reward_bonus(b.rank::int)
      from public.season_best_board b
      where b.season = p_season and b.is_mine = lg and b.rank <= k
      on conflict (season, is_mine, device_id) do nothing;
    insert into public.season_reward_runs (season, is_mine, n, k) values (p_season, lg, n, k) on conflict (season, is_mine) do nothing;
    done := done + 1;
  end loop;
  return done;
end $$;

-- 조회 + 지연 정산 + 응답 조립(submit-score 의 action "rewards" 가 그대로 돌려준다). 한 호출 = 한 트랜잭션.
create or replace function public.season_rewards_get(p_device uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare cur int := public.season_current(); upto int := public.reward_settled_upto(); s int; last_s int; lg boolean; lgname text; leagues jsonb := '{}'::jsonb; last_j jsonb := null; pend jsonb; tops jsonb; rn int; rk int; ok_runs boolean := true;
begin
  for s in select g from generate_series(2, upto) g
           where (select count(*) from public.season_reward_runs x where x.season = g) < 2 order by g loop
    perform public.season_rewards_settle(s);
  end loop;

  if upto >= 2 then
    last_s := upto;
    foreach lg in array array[false, true] loop
      lgname := case when lg then 'mine' else 'luck' end;
      rn := null; rk := null;
      select x.n, x.k into rn, rk from public.season_reward_runs x where x.season = last_s and x.is_mine = lg;
      if rn is null then ok_runs := false; exit; end if;      -- 정산 기록이 없으면 last 는 null(빈 보드로 오인 금지)
      select coalesce(jsonb_agg(
               jsonb_build_object('rank', r.rank, 'name', r.name, 'total', r.total)
               || case when lg and r.hero_name is not null and r.hero_name <> '' then jsonb_build_object('hero', r.hero_name) else '{}'::jsonb end
               order by r.rank), '[]'::jsonb)
        into tops
        from public.season_rewards r
        where r.season = last_s and r.is_mine = lg and r.rank <= 3;
      leagues := leagues || jsonb_build_object(lgname, jsonb_build_object('n', coalesce(rn, 0), 'k', coalesce(rk, 10), 'top', tops));
    end loop;
    if ok_runs then last_j := jsonb_build_object('season', last_s, 'leagues', leagues); end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('season', r.season, 'league', case when r.is_mine then 'mine' else 'luck' end,
                                                'rank', r.rank, 'base', r.base, 'bonus', r.bonus, 'total', r.total)
                            order by r.season, r.is_mine), '[]'::jsonb)
    into pend from public.season_rewards r where r.device_id = p_device and r.claimed_at is null;

  return jsonb_build_object('cur', cur, 'last', last_j, 'pending', pend, 'tbl', public.reward_tbl());
end $$;

-- 수령 완료 표시(본인 기기 것만, 멱등). 반환: 이번 호출에서 새로 표시한 건수.
create or replace function public.season_rewards_ack(p_device uuid, p_seasons int[]) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare c int;
begin
  update public.season_rewards r set claimed_at = now()
    where r.device_id = p_device and r.season = any (p_seasons) and r.claimed_at is null;
  get diagnostics c = row_count;
  return c;
end $$;

-- 보상 상수·기본 보상 계산은 읽기 전용이라 공개해도 무해. 정산·조회·수령 함수는 service role(Edge Function)만 실행한다.
revoke all on function public.season_rewards_settle(int) from public, anon, authenticated;
revoke all on function public.season_rewards_get(uuid) from public, anon, authenticated;
revoke all on function public.season_rewards_ack(uuid, int[]) from public, anon, authenticated;
grant execute on function public.season_rewards_settle(int) to service_role;
grant execute on function public.season_rewards_get(uuid) to service_role;
grant execute on function public.season_rewards_ack(uuid, int[]) to service_role;

-- PostgREST 스키마 캐시 갱신(새 함수가 404 로 보이는 것을 방지). SQL Editor 에서 안전하다.
notify pgrst, 'reload schema';
