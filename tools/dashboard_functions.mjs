// Edge Function 일별 지표를 Supabase 관리 API(logs 엔드포인트, ClickHouse SQL)에서 받아 로컬 DB 에 쌓는다.
// 필요: 환경변수 DASH_LOGS_TOKEN (Logs: Read 권한만 있는 토큰이면 충분. CLI 가 쓰는 SUPABASE_ACCESS_TOKEN 과 이름을 분리해 DB 조회에 영향 없게 함). 프로젝트는 supabase/.temp/project-ref.
// 한계: 이 API 에서 실행 시간 필드를 찾지 못해 avg_ms/p95_ms/max_ms 는 null 로 둔다. 호출 수·상태 코드·CPU 제한 오류만 센다.
//   로그는 호출 1건당 "POST | 200 | https://<ref>.supabase.co/functions/v1/<함수>" 한 줄이다(메시지에서 상태 코드를 읽는다).
// 하루 단위(KST 자정~자정)로 다시 계산해 덮어쓰므로 여러 번 돌려도 안전하다. 로그는 보관 기간이 짧아 최근 며칠만 받는다.
import { readFileSync } from 'node:fs';
import { upsert } from './dashboard_store.mjs';

const FUNCTIONS = ['submit-score'];
const DAYS = Number(process.env.DASH_FN_DAYS || 7);
const KST_MS = 9 * 3600e3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function query(ref, token, sql, start, end, tries = 6) {
  const u = new URL(`https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/logs`);
  u.searchParams.set('sql', sql);
  u.searchParams.set('iso_timestamp_start', start);
  u.searchParams.set('iso_timestamp_end', end);
  for (let i = 0; i < tries; i++) {
    const res = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.result) return body.result;
    const msg = JSON.stringify(body).slice(0, 200);
    if (res.status === 429 || /Throttl/i.test(msg)) { await sleep(15000 * (i + 1)); continue; }   // 요청 제한: 점점 길게 쉰다
    throw new Error(`logs API ${res.status}: ${msg}`);
  }
  throw new Error('logs API 요청 제한이 풀리지 않음');
}

export async function syncFunctionMetrics(store, capturedAt) {
  const token = process.env.DASH_LOGS_TOKEN;
  const ref = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
  const nowKst = Date.now() + KST_MS;
  const todayStart = Math.floor(nowKst / 86400e3) * 86400e3;   // KST 오늘 00:00 (KST 시계를 UTC 필드로 본 값)
  let rows = 0;
  for (let d = DAYS - 1; d >= 0; d--) {
    const dayStartKst = todayStart - d * 86400e3;
    const start = new Date(dayStartKst - KST_MS).toISOString();                         // UTC 로 환산
    const end = new Date(Math.min(dayStartKst + 86400e3 - KST_MS, Date.now())).toISOString();
    const day = new Date(dayStartKst).toISOString().slice(0, 10);
    for (const fn of FUNCTIONS) {
      const like = `%/functions/v1/${fn}`;
      const r = (await query(ref, token,
        `SELECT count() AS calls,
           countIf(event_message LIKE 'POST | 2%') AS s2,
           countIf(event_message LIKE 'POST | 4%') AS s4,
           countIf(event_message LIKE 'POST | 5%') AS s5
         FROM logs WHERE event_message LIKE '${like}'`, start, end))[0] || {};
      await sleep(3000);
      const cpu = (await query(ref, token,
        `SELECT count() AS n FROM logs WHERE event_message LIKE '%CPU time limit%'`, start, end))[0] || {};
      await sleep(3000);
      rows += upsert(store, 'function_daily',
        ['day', 'fn', 'calls', 'status_2xx', 'status_4xx', 'status_5xx', 'avg_ms', 'p95_ms', 'max_ms', 'cpu_limit_errors', 'captured_at'],
        ['day', 'fn'],
        [{ day, fn, calls: Number(r.calls || 0), status_2xx: Number(r.s2 || 0), status_4xx: Number(r.s4 || 0), status_5xx: Number(r.s5 || 0),
           avg_ms: null, p95_ms: null, max_ms: null, cpu_limit_errors: Number(cpu.n || 0), captured_at: capturedAt }]);
    }
  }
  return rows;
}
