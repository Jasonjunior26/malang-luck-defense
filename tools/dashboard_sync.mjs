// 운영 대시보드용 스냅샷 생성: Supabase(연결된 프로젝트)에 집계 SQL 을 돌려 JSON 파일로 저장한다.
// 사용: node tools/dashboard_sync.mjs [출력폴더]   (기본: ./dashboard_out)
// 전제: `supabase link` 가 되어 있고 CLI 로그인이 되어 있어야 한다. 개인 식별값(device_id, user_id)은 내보내지 않는다.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { openStore, upsert } from './dashboard_store.mjs';
import { syncFunctionMetrics } from './dashboard_functions.mjs';

const out = process.argv[2] || 'dashboard_out';
mkdirSync(out, { recursive: true });

// KST 기준 날짜. scores.played_at 은 "최고점 갱신 시각"이라 하루 1건 이상 남지 않는다(활동 일수는 하한).
const KST = "at time zone 'Asia/Seoul'";
const Q = {
  kpi: `
    with p as (select device_id, created_at, plays, user_id from players),
    a as (select device_id, (played_at ${KST})::date d from scores where device_id is not null group by 1,2),
    today as (select (now() ${KST})::date t)
    select
      (select count(*) from p) players_total,
      (select coalesce(sum(plays),0) from p) plays_total,
      (select count(*) from scores) scores_saved,
      (select count(distinct device_id) from a, today where d >= t - 0) active_1d,
      (select count(distinct device_id) from a, today where d >= t - 6) active_7d,
      (select count(distinct device_id) from a, today where d >= t - 29) active_30d,
      (select count(*) from p, today where (created_at ${KST})::date >= t - 6) new_7d,
      (select count(*) from p, today where (created_at ${KST})::date between t - 13 and t - 7) new_prev7d,
      (select count(*) from p where user_id is not null) linked_accounts,
      round((select avg(plays) from p)::numeric, 1) avg_plays,
      round(pg_database_size(current_database())/1048576.0, 1) db_mb,
      (select count(*) from private_seasons) private_seasons,
      (select count(*) from friendships where status = 'accepted') friendships`,
  daily: `
    with days as (select generate_series((now() ${KST})::date - 59, (now() ${KST})::date, interval '1 day')::date d)
    select to_char(d,'YYYY-MM-DD') as day,
      (select count(*) from players where (created_at ${KST})::date = d) new_players,
      (select count(distinct device_id) from scores where (played_at ${KST})::date = d) active_players,
      (select count(*) from scores where (played_at ${KST})::date = d) saved_scores
    from days order by d`,
  hourly: `
    select extract(hour from played_at ${KST})::int as hour, count(*) as saved_scores
    from scores where played_at > now() - interval '30 days' group by 1 order by 1`,
  retention: `
    with p as (select device_id, (created_at ${KST})::date c from players),
    a as (select device_id, (played_at ${KST})::date d from scores where device_id is not null group by 1,2),
    t as (select (now() ${KST})::date t),
    n as (select unnest(array[1,3,7,14]) n)
    select 'D'||n.n label, n.n days,
      (select count(*) from p, t where t.t - p.c >= n.n) eligible,
      (select count(*) from p, t where t.t - p.c >= n.n
         and exists (select 1 from a where a.device_id = p.device_id and a.d = p.c + n.n)) retained
    from n order by n.n`,
  plays_dist: `
    select b.label, b.ord, count(p.*) players from (values
      (1,'1판',1,1),(2,'2~4판',2,4),(3,'5~9판',5,9),(4,'10~24판',10,24),(5,'25~49판',25,49),(6,'50판 이상',50,1000000)
    ) b(ord,label,lo,hi) left join players p on p.plays between b.lo and b.hi
    group by b.label, b.ord order by b.ord`,
  active_days: `
    with a as (select device_id, count(distinct (played_at ${KST})::date) days from scores where device_id is not null group by 1)
    select b.label, b.ord, count(a.*) players from (values
      (1,'1일',1,1),(2,'2~3일',2,3),(3,'4~7일',4,7),(4,'8~14일',8,14),(5,'15일 이상',15,1000)
    ) b(ord,label,lo,hi) left join a on a.days between b.lo and b.hi
    group by b.label, b.ord order by b.ord`,
  heroes: `
    select hero, count(*) runs, round(avg(round)::numeric,1) avg_round, round(100.0*avg(win::int),1) win_pct
    from scores where mode = 'daily' group by hero order by runs desc limit 20`,
  tables: `
    select c.relname "table", round(pg_total_relation_size(c.oid)/1048576.0, 2) mb, c.reltuples::bigint est_rows
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' order by pg_total_relation_size(c.oid) desc`,
};

function run(sql) {
  const raw = execFileSync('npx', ['--no-install', 'supabase', 'db', 'query', '--linked', '--output-format', 'json'],
    { encoding: 'utf8', shell: true, input: sql, stdio: ['pipe', 'pipe', 'ignore'], maxBuffer: 20 * 1024 * 1024 });
  return JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)).rows;
}

const at = new Date().toISOString();
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // KST 날짜
const store = openStore(process.env.DASH_DB || 'dashboard_data/metrics.db');
const runId = store.prepare('insert into sync_runs (started_at) values (?)').run(at).lastInsertRowid;
const notes = [];
const data = {};
for (const [name, sql] of Object.entries(Q)) {
  const rows = run(sql);
  data[name] = rows;
  writeFileSync(join(out, name + '.json'), JSON.stringify(rows));
  console.log(name, rows.length + '행');
}

// ── 로컬 이력 DB 에 쌓기 (같은 날 다시 돌리면 덮어씀)
const k = data.kpi[0];
upsert(store, 'service_daily',
  ['day', 'players_total', 'plays_total', 'scores_saved', 'active_1d', 'active_7d', 'active_30d', 'new_7d', 'linked_accounts', 'friendships', 'private_seasons', 'db_mb', 'captured_at'],
  ['day'], [{ ...k, day: today, db_mb: Number(k.db_mb), captured_at: at }]);
upsert(store, 'activity_daily', ['day', 'new_players', 'active_players', 'saved_scores', 'captured_at'], ['day'],
  data.daily.map((r) => ({ ...r, captured_at: at })));
upsert(store, 'retention_snapshots', ['taken_day', 'label', 'eligible', 'retained'], ['taken_day', 'label'],
  data.retention.map((r) => ({ ...r, taken_day: today })));
upsert(store, 'table_sizes', ['taken_day', 'table_name', 'mb'], ['taken_day', 'table_name'],
  data.tables.map((r) => ({ taken_day: today, table_name: r.table, mb: Number(r.mb) })));

// ── Edge Function 지표(관리 API 토큰이 있을 때만)
if (process.env.DASH_LOGS_TOKEN) {
  try { notes.push('함수 ' + (await syncFunctionMetrics(store, at)) + '행'); }
  catch (e) { notes.push('함수 지표 실패: ' + e.message); console.error(e.message); }
} else notes.push('함수 지표 건너뜀(DASH_LOGS_TOKEN 없음)');

// ── 대시보드용 파일: 누적 이력(로컬 DB)에서 뽑는다
const hist = store.prepare('select day, plays_total, players_total, active_7d, db_mb from service_daily order by day').all();
writeFileSync(join(out, 'history.json'), JSON.stringify(hist));
const fn = store.prepare('select day, fn, calls, status_4xx + status_5xx as errors, avg_ms, p95_ms, max_ms, cpu_limit_errors from function_daily order by day').all();
writeFileSync(join(out, 'functions.json'), JSON.stringify(fn));
console.log('history', hist.length + '행', 'functions', fn.length + '행');

store.prepare('update sync_runs set finished_at=?, status=?, note=? where id=?')
  .run(new Date().toISOString(), notes.some((n) => n.includes('실패')) ? 'partial' : 'ok', notes.join(' / '), runId);
writeFileSync(join(out, '_at.txt'), at);
writeFileSync(join(out, 'snap.json'), JSON.stringify([{ at, functions_included: process.env.DASH_LOGS_TOKEN ? 1 : 0 }])); // 대시보드의 "데이터 기준 시각"
console.log('완료', at, notes.join(' / '));
