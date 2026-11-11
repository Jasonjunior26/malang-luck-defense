-- 013: 이용 행동 기록(이벤트 수집). 새 객체만 만든다(기존 테이블·뷰·함수 변경 없음). 여러 번 실행해도 안전. Supabase SQL Editor 에서 실행.
-- 설계: docs/행동지표_설계.md. (설계 초안은 012 라고 불렀지만 012 는 주간 보상이 이미 썼으므로 013.)
-- 배포 순서: 이 마이그레이션 -> submit-score 함수(ev 액션 + 시크릿 EV_SALT) -> 클라이언트(CONFIG.ANALYTICS 는 false) -> 플래그 true.
-- 개인정보: dev 는 함수가 sha256(EV_SALT + device_id) 앞 16자로 만든 값이다. 원 device_id·닉네임·입력 텍스트는 이 테이블에 없다. players/scores 와 조인 불가.
-- 보존: ev_raw 14일(롤업이 끝난 날만 삭제), ev_session 90일, ev_daily 무기한. 정리는 ev_maintain() 을 수동 또는 pg_cron 으로 호출(파일 맨 아래 주석).
-- 롤백(새 객체뿐, 기존 데이터 영향 없음):
--   drop function if exists public.ev_maintain();
--   drop function if exists public.ev_prune(int, int);
--   drop function if exists public.ev_rollup(date);
--   drop function if exists public.ev_ingest(text, text, text, jsonb, jsonb);
--   drop function if exists public.ev_merge_counts(jsonb, jsonb);
--   drop table if exists public.ev_rollup_log;
--   drop table if exists public.ev_daily;
--   drop table if exists public.ev_session;
--   drop table if exists public.ev_raw;

-- 원본(짧은 보존). hd(숨김 스냅샷)는 s=마지막 화면, n={vis,play,act,rec} 로 저장한다.
create table if not exists public.ev_raw (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),         -- 서버 수신 시각(클라이언트 시계 불신)
  day date not null,                             -- KST 날짜
  dev text not null,                             -- sha256 앞 16자
  sid text not null, ver text not null,
  e text not null, s text, b text, lg text, hero text, ex text,
  t_ms int, r int, w smallint, sc int, dur int, n jsonb
);
create index if not exists ev_raw_day_e on public.ev_raw (day, e);
create index if not exists ev_raw_dev_sid on public.ev_raw (dev, sid);

-- 세션 요약(1행/세션, 90일)
create table if not exists public.ev_session (
  sid text primary key, dev text not null, day date not null, started_at timestamptz not null default now(),
  ver text, pf text, sa smallint, vw text, is_new smallint,
  vis_s int not null default 0, play_s int not null default 0, act_s int not null default 0, last_scr text,
  runs int not null default 0, runs_done int not null default 0, screens jsonb not null default '{}'::jsonb,
  ended_clean smallint not null default 0
);
create index if not exists ev_session_day on public.ev_session (day);
create index if not exists ev_session_dev on public.ev_session (dev);

-- 일별 집계(영구, 작음). key = scr.s / tap.b / rs.lg / re.ex / ss.src
create table if not exists public.ev_daily (
  day date not null, ver text not null, e text not null, key text not null,
  cnt int not null, devs int not null, primary key (day, ver, e, key)
);
-- 롤업이 끝난 날(정리가 이 목록에 있는 날의 원본만 지운다)
create table if not exists public.ev_rollup_log (day date primary key, done_at timestamptz not null default now());

alter table public.ev_raw enable row level security;        -- 정책 없음 = service_role 외 접근 불가
alter table public.ev_session enable row level security;
alter table public.ev_daily enable row level security;
alter table public.ev_rollup_log enable row level security;
revoke all on public.ev_raw, public.ev_session, public.ev_daily, public.ev_rollup_log from anon, authenticated;

-- jsonb 카운트 객체 합산: {"a":1} + {"a":2,"b":1} = {"a":3,"b":1}
create or replace function public.ev_merge_counts(a jsonb, b jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(k, coalesce((a->>k)::int, 0) + coalesce((b->>k)::int, 0)), '{}'::jsonb)
  from (select jsonb_object_keys(coalesce(a, '{}'::jsonb) || coalesce(b, '{}'::jsonb)) k) z
$$;

-- 함수가 검증·정리한 이벤트 배열을 저장한다(1회 호출: 원본 insert + 세션 upsert). 반환: 저장한 이벤트 수.
-- 이벤트 키: e t s b lg h ex r w sc dur n / hd: vis play act last rec. 세션의 vis/play/act 는 같은 sid 의 최댓값(누적값이라 재전송·순서 뒤바뀜에 안전).
create or replace function public.ev_ingest(p_dev text, p_sid text, p_ver text, p_env jsonb, p_events jsonb) returns int
language plpgsql as $$
declare
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_n int; v_last text; v_scr jsonb;
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) = 0 then return 0; end if;
  insert into public.ev_raw (day, dev, sid, ver, e, s, b, lg, hero, ex, t_ms, r, w, sc, dur, n)
  select v_day, p_dev, p_sid, p_ver, x->>'e',
         case when x->>'e' = 'hd' then x->>'last' else coalesce(x->>'s', x->>'src') end,
         x->>'b', x->>'lg', x->>'h', x->>'ex', (x->>'t')::int, (x->>'r')::int, (x->>'w')::smallint, (x->>'sc')::int, (x->>'dur')::int,
         case when x->>'e' = 'hd' then jsonb_build_object('vis', (x->>'vis')::int, 'play', (x->>'play')::int, 'act', (x->>'act')::int, 'rec', coalesce((x->>'rec')::int, 0)) else x->'n' end
  from jsonb_array_elements(p_events) x;
  get diagnostics v_n = row_count;

  insert into public.ev_session (sid, dev, day, ver, pf, sa, vw, is_new)
  values (p_sid, p_dev, v_day, p_ver, p_env->>'pf', coalesce((p_env->>'sa')::smallint, 0), p_env->>'vw', coalesce((p_env->>'new')::smallint, 0))
  on conflict (sid) do nothing;

  select coalesce(x->>'s', x->>'last') into v_last from jsonb_array_elements(p_events) with ordinality t(x, i)
   where x->>'e' = 'scr' or (x->>'e' = 'hd' and coalesce(x->>'last', 'none') <> 'none') order by i desc limit 1;
  select coalesce(jsonb_object_agg(s, c), '{}'::jsonb) into v_scr
    from (select x->>'s' s, count(*) c from jsonb_array_elements(p_events) x where x->>'e' = 'scr' group by 1) q;

  update public.ev_session s set
    vis_s = greatest(s.vis_s, a.vis), play_s = greatest(s.play_s, a.play), act_s = greatest(s.act_s, a.act),
    last_scr = coalesce(v_last, s.last_scr),
    runs = s.runs + a.runs, runs_done = s.runs_done + a.done,
    screens = public.ev_merge_counts(s.screens, v_scr),
    ended_clean = greatest(s.ended_clean, a.clean)
  from (
    select coalesce(max((x->>'vis')::int) filter (where x->>'e' = 'hd'), 0) vis,
           coalesce(max((x->>'play')::int) filter (where x->>'e' = 'hd'), 0) play,
           coalesce(max((x->>'act')::int) filter (where x->>'e' = 'hd'), 0) act,
           (count(*) filter (where x->>'e' = 'rs'))::int runs,
           (count(*) filter (where x->>'e' = 're' and x->>'ex' = 'end'))::int done,
           (case when bool_or(x->>'e' = 'hd' and coalesce((x->>'rec')::int, 0) = 0) then 1 else 0 end)::smallint clean
    from jsonb_array_elements(p_events) x
  ) a
  where s.sid = p_sid;
  return v_n;
end $$;

-- 하루치 원본을 ev_daily 로 집계(재실행 안전: 그 날짜를 지우고 다시 넣는다). hd 는 세션 요약이 맡으므로 제외.
create or replace function public.ev_rollup(p_day date) returns int
language plpgsql as $$
declare v_n int;
begin
  delete from public.ev_daily where day = p_day;
  insert into public.ev_daily (day, ver, e, key, cnt, devs)
  select day, ver, e, coalesce(case e when 'scr' then s when 'tap' then b when 'rs' then lg when 're' then ex when 'ss' then s end, '-'), count(*), count(distinct dev)
  from public.ev_raw where day = p_day and e <> 'hd' group by 1, 2, 3, 4;
  get diagnostics v_n = row_count;
  insert into public.ev_rollup_log (day) values (p_day) on conflict (day) do update set done_at = now();
  return v_n;
end $$;

-- 정리: 롤업이 끝난 날짜의 원본만 p_raw_days 일 지나면 삭제, 세션 요약은 p_session_days 일 지나면 삭제. 반환 {raw, session}
create or replace function public.ev_prune(p_raw_days int default 14, p_session_days int default 90) returns jsonb
language plpgsql as $$
declare v_today date := (now() at time zone 'Asia/Seoul')::date; a int; b int;
begin
  delete from public.ev_raw where day < v_today - p_raw_days and day in (select day from public.ev_rollup_log);
  get diagnostics a = row_count;
  delete from public.ev_session where day < v_today - p_session_days;
  get diagnostics b = row_count;
  return jsonb_build_object('raw', a, 'session', b);
end $$;

-- 한 번에: 어제까지 롤업이 안 된 날을 모두 집계한 뒤 정리. 수동(select public.ev_maintain();) 또는 pg_cron 에서 호출. 반환 {rolled, raw, session}
create or replace function public.ev_maintain() returns jsonb
language plpgsql as $$
declare v_today date := (now() at time zone 'Asia/Seoul')::date; d date; k int := 0; pr jsonb;
begin
  for d in select distinct day from public.ev_raw where day < v_today and day not in (select day from public.ev_rollup_log) order by 1 loop
    perform public.ev_rollup(d); k := k + 1;
  end loop;
  pr := public.ev_prune();
  return jsonb_build_object('rolled', k) || pr;
end $$;

do $$ declare f text; begin
  foreach f in array array['ev_merge_counts(jsonb, jsonb)', 'ev_ingest(text, text, text, jsonb, jsonb)', 'ev_rollup(date)', 'ev_prune(int, int)', 'ev_maintain()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- (선택) 자동 정리: Supabase 대시보드 Database > Extensions 에서 pg_cron 을 켠 뒤 한 번 실행. 가능 여부는 운영 프로젝트에서 확인하지 못했다.
--   select cron.schedule('ev-maintain', '10 18 * * *', $$select public.ev_maintain()$$);  -- 18:10 UTC = 03:10 KST
--   (해제) select cron.unschedule('ev-maintain');
-- pg_cron 을 안 쓰면 tools/dashboard_sync.mjs 가 읽기 전에 select ev_maintain() 을 호출하거나 SQL Editor 에서 가끔 수동 실행(원본 14일 안에서 따라잡음).
