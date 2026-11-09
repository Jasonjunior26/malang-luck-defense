// 운영 대시보드용 로컬 이력 저장소 (SQLite, Node 내장 node:sqlite — 별도 설치 없음).
// 왜 필요한가: 서버(Supabase)는 "지금 값"만 알려준다. 함수 로그는 보관 기간이 짧고, 판수 같은 누적값은 일별 변화를
//   남겨 두지 않으면 사라진다. 동기화할 때마다 여기에 쌓아 두면 이력이 로컬에 남는다. 모든 쓰기는 upsert 라 여러 번 돌려도 안전하다.
// 개인정보: device_id, user_id, IP 는 저장하지 않는다(집계값만).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
pragma journal_mode = wal;
pragma foreign_keys = on;

-- 동기화 실행 기록: 언제 어떤 단계가 성공/실패했는지
create table if not exists sync_runs (
  id          integer primary key,
  started_at  text not null,
  finished_at text,
  status      text not null default 'running' check (status in ('running','ok','partial','failed')),
  note        text
);

-- 서비스 전체 일별 스냅샷(하루 1행, 같은 날 다시 돌리면 덮어씀). 누적값의 일별 차이로 "그날 판수" 등을 구한다.
create table if not exists service_daily (
  day            text primary key,          -- KST YYYY-MM-DD
  players_total  integer not null,
  plays_total    integer not null,          -- 서버 검증 누적 판수
  scores_saved   integer not null,
  active_1d      integer, active_7d integer, active_30d integer,
  new_7d         integer,
  linked_accounts integer, friendships integer, private_seasons integer,
  db_mb          real,
  captured_at    text not null
);

-- 일별 활동(서버 scores/players 에서 재계산). 서버 기록이 바뀌어도 로컬 이력은 남는다.
create table if not exists activity_daily (
  day            text primary key,
  new_players    integer not null,
  active_players integer not null,
  saved_scores   integer not null,
  captured_at    text not null
);

-- 재방문율 스냅샷(동기화 시점마다 1세트). 표본이 커지면 추이를 본다.
create table if not exists retention_snapshots (
  taken_day text not null,
  label     text not null,                  -- D1 D3 D7 D14
  eligible  integer not null,
  retained  integer not null,
  primary key (taken_day, label)
);

-- 테이블별 용량 스냅샷 → DB 증가 속도 계산
create table if not exists table_sizes (
  taken_day  text not null,
  table_name text not null,
  mb         real not null,
  primary key (taken_day, table_name)
);

-- Edge Function 일별 지표(로그 API). 로그 보관 기간이 짧으니 받을 때마다 여기에 쌓는다.
create table if not exists function_daily (
  day              text not null,
  fn               text not null,           -- 함수 이름 (예: submit-score)
  calls            integer not null,
  status_2xx       integer not null default 0,
  status_4xx       integer not null default 0,
  status_5xx       integer not null default 0,
  avg_ms           real, p95_ms real, max_ms real,   -- 걸린 시간(벽시계). CPU 시간 아님
  cpu_limit_errors integer not null default 0,        -- 'CPU time limit' 에러 로그 수
  captured_at      text not null,
  primary key (day, fn)
);

-- (유료화 대비, 지금은 비어 있음) 결제 사건. 사람 식별값은 넣지 않고 기기/계정은 해시만.
create table if not exists revenue_events (
  id          integer primary key,
  occurred_at text not null,
  kind        text not null check (kind in ('purchase','subscription','refund')),
  amount      real not null,                -- 부호 있는 금액 (환불은 음수)
  currency    text not null default 'KRW',
  sku         text,
  payer_hash  text,                          -- 결제자 구분용 단방향 해시(원본 저장 금지)
  source      text,                          -- 결제 수단/스토어
  note        text
);
create index if not exists revenue_events_at on revenue_events (occurred_at);

-- 대시보드가 바로 읽는 뷰
create view if not exists v_plays_daily as
  select day, plays_total - lag(plays_total) over (order by day) as plays
  from service_daily;
create view if not exists v_revenue_daily as
  select substr(occurred_at,1,10) as day, sum(amount) as revenue, count(distinct payer_hash) as payers
  from revenue_events group by 1;
`;

export function openStore(path = 'dashboard_data/metrics.db') {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

// 값 배열로 upsert (키 충돌 시 갱신)
export function upsert(db, table, cols, keys, rows) {
  if (!rows.length) return 0;
  const sets = cols.filter((c) => !keys.includes(c)).map((c) => `${c}=excluded.${c}`).join(',');
  const st = db.prepare(`insert into ${table} (${cols.join(',')}) values (${cols.map(() => '?').join(',')})
    on conflict(${keys.join(',')}) do ${sets ? 'update set ' + sets : 'nothing'}`);
  db.exec('begin');
  try { for (const r of rows) st.run(...cols.map((c) => r[c] ?? null)); db.exec('commit'); }
  catch (e) { db.exec('rollback'); throw e; }
  return rows.length;
}
