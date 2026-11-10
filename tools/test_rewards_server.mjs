// 주간 보상 서버 테스트: node tools/test_rewards_server.mjs
// (a) reward_base 정수식(012_season_rewards.sql 과 같은 식)의 JS 참조 구현 vs 손계산 기대표 (b) 총액·K 산출 (c) rewards/rewardAck 핸들러(목 RPC).
// SQL 자체는 실행하지 못한다(로컬 Postgres 없음) -> docs/주간보상_서버.md 의 줄 단위 검산 표 참고. 이 JS 식은 SQL 식의 복사본이므로 SQL 을 고치면 같이 고친다.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, failN = 0; const tb = (n, ok) => { ok ? pass++ : failN++; console.log(ok ? "PASS" : "FAIL", n); };

// ---- 참조 구현(SQL 과 동일한 정수식, 정수 나눗셈은 Math.floor; 피제수는 항상 >= 0) ----
const base = (r, k) => (r == null || k == null || k < 10 || r < 1 || r > k) ? 0 : Math.floor((200 * (k - 1) - 190 * (r - 1) + 10 * (k - 1) - 1) / (10 * (k - 1))) * 10;
const bonus = (r) => r === 1 ? 200 : r === 2 ? 70 : r === 3 ? 50 : 0;
const kOf = (n) => Math.max(10, Math.floor((3 * n + 9) / 10)); // ceil(0.3 n) 정수 연산

// ---- (a) 손계산 기대표(선형 200 -> 10 을 10 단위 올림) ----
const full = {
  10: [200, 180, 160, 140, 120, 100, 80, 60, 40, 10],
  11: [200, 190, 170, 150, 130, 110, 90, 70, 50, 30, 10],
  15: [200, 190, 180, 160, 150, 140, 120, 110, 100, 80, 70, 60, 40, 30, 10],
};
const spot = { // [r, 기대] 손계산: 200 - 190(r-1)/(K-1) 를 10 단위 올림
  34: [[1, 200], [2, 200], [3, 190], [4, 190], [5, 180], [10, 150], [17, 110], [32, 30], [33, 20], [34, 10]],
  100: [[1, 200], [5, 200], [10, 190], [50, 110], [98, 20], [99, 20], [100, 10]],
  1000: [[1, 200], [10, 200], [500, 110], [998, 20], [999, 20], [1000, 10]],
};
for (const K of Object.keys(full)) tb(`reward_base K=${K} 전체 표`, JSON.stringify(Array.from({ length: +K }, (_, i) => base(i + 1, +K))) === JSON.stringify(full[K]));
for (const K of Object.keys(spot)) tb(`reward_base K=${K} 손계산 지점`, spot[K].every(([r, w]) => base(r, +K) === w));
for (const K of [10, 11, 15, 34, 100, 1000]) {
  let prev = Infinity, ok = true;
  for (let r = 1; r <= K; r++) { const v = base(r, K); if (v > prev || v < 10 || v > 200 || v % 10) ok = false; prev = v; }
  tb(`K=${K}: 단조 비증가·10~200·10의 배수`, ok && base(1, K) === 200 && base(K, K) === 10);
}
// 유리수(교차 검산): 선형값을 분수로 정확히 비교 -> base 는 선형값 이상이고 10 미만 차이(올림)
for (const K of [10, 11, 15, 34, 100, 1000]) {
  let ok = true;
  for (let r = 1; r <= K; r++) { const b = base(r, K); const lhs = b * (K - 1), lin = 200 * (K - 1) - 190 * (r - 1); if (!(lhs >= lin && lhs - lin < 10 * (K - 1))) ok = false; }
  tb(`K=${K}: 올림 정확성(선형값 <= base < 선형값+10)`, ok);
}
tb("범위 밖은 0 (r=0, r>K, K<10, null)", base(0, 10) === 0 && base(11, 10) === 0 && base(1, 9) === 0 && base(null, 10) === 0);

// ---- (b) 총액·K ----
const total = (r, K) => base(r, K) + bonus(r);
tb("총액: 1위 400, 2위 250, 3위 210, K=10 10위 10", total(1, 10) === 400 && total(2, 10) === 250 && total(3, 10) === 210 && total(10, 10) === 10);
tb("총액: 4위(K=10) 140, 보너스 합 1위200/2위70/3위50", total(4, 10) === 140 && bonus(1) === 200 && bonus(2) === 70 && bonus(3) === 50);
const kcase = [[0, 10], [5, 10], [33, 10], [34, 11], [100, 30], [1000, 300], [101, 31], [35, 11], [10, 10]];
tb("K 산출 N=0,5,33,34,100,1000,101,35", kcase.every(([n, k]) => kOf(n) === k));
tb("K 정수식 = ceil(0.3N) (N 0..5000 전수, 분수로 검사)", Array.from({ length: 5001 }, (_, n) => n).every((n) => { const k = kOf(n); const c = Math.max(10, Math.ceil(n * 3 / 10 - 1e-12)); return k === c; }));
tb("N<K 이면 순위권 전원 보상(N=5: 5행, 1~5위)", (() => { const n = 5, k = kOf(n); const rows = Array.from({ length: n }, (_, i) => i + 1).filter((r) => r <= k); return rows.length === 5 && total(5, k) === 120 + 0; })());
tb("SQL 상수 일치: reward_tbl() 의 값 = 스펙", (() => { const sql = fs.readFileSync(path.join(root, "supabase/migrations/012_season_rewards.sql"), "utf8"); return sql.includes('"top":200,"last":10,"b1":100,"b2":70,"b3":50,"extra1":100,"ratio":30'); })());

// SQL 정적 점검(실행 검증은 docs/주간보상_서버.md 의 PGlite 결과): 유예 헬퍼가 정산 컷오프·루프·last 에 쓰이고, 이름 저장, search_path 고정
{
  const sql = fs.readFileSync(path.join(root, "supabase/migrations/012_season_rewards.sql"), "utf8");
  tb("SQL: 유예 헬퍼 reward_settled_upto 정의(now()-10분)", /function public\.reward_settled_upto\(\)[\s\S]*now\(\) - interval '10 minutes'/.test(sql));
  tb("SQL: settle 컷오프·get 루프·last 가 모두 헬퍼 사용, season_current() 로 정산 판단 안 함", sql.includes("p_season > public.reward_settled_upto()") && sql.includes("generate_series(2, upto)") && sql.includes("last_s := upto") && !/p_season >= public\.season_current/.test(sql));
  tb("SQL: runs 없으면 last null(ok_runs)", sql.includes("ok_runs := false") && sql.includes("if ok_runs then last_j"));
  tb("SQL: 정산 시 name·hero_name 저장, top 은 보드 join 없음", sql.includes("b.name, b.hero_name") && !/join public\.season_best_board/.test(sql));
  tb("SQL: security definer 3개 모두 search_path = public, pg_temp", (sql.match(/security definer set search_path = public, pg_temp/g) || []).length === 3 && !/search_path = public as/.test(sql));
  tb("SQL: notify pgrst 포함", sql.includes("notify pgrst, 'reload schema'"));
}

// ---- (c) 핸들러 ----
const rpcCalls = []; let handler; let rateOk = true; let rewardsFail = false;
const mkLeague = (n, k, top) => ({ n, k, top });
const SAMPLE = { cur: 3, last: { season: 2, leagues: { luck: mkLeague(40, 12, [{ rank: 1, name: "가나", total: 400 }]), mine: mkLeague(3, 10, [{ rank: 1, name: "다라", hero: "불꽃", total: 400 }]) } },
  pending: [{ season: 2, league: "luck", rank: 1, base: 200, bonus: 200, total: 400 }], tbl: { top: 200, last: 10, b1: 100, b2: 70, b3: 50, extra1: 100, ratio: 30 } };
const acked = new Set(); // 목 DB: 본인 기기 것만
const rpcImpl = {
  rate_limit_hit: () => rateOk,
  season_rewards_get: (a) => { if (rewardsFail) throw new Error("boom"); return a.p_device === "123e4567-e89b-12d3-a456-426614174000" ? SAMPLE : { ...SAMPLE, pending: [] }; },
  season_rewards_ack: (a) => { let c = 0; for (const s of a.p_seasons) { const k = a.p_device + ":" + s; if (s === 2 && !acked.has(k)) { acked.add(k); c++; } } return c; },
};
globalThis.Deno = { env: { get: (k) => ({ SUPABASE_URL: "http://x", SUPABASE_SERVICE_ROLE_KEY: "svc" })[k] }, serve: (h) => (handler = h) };
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith("http://x/rest/v1/rpc/")) { const fn = String(url).split("/").pop(), args = JSON.parse(init.body); rpcCalls.push([fn, args]);
    try { return new Response(JSON.stringify(rpcImpl[fn](args)), { status: 200 }); } catch (e) { return new Response("err", { status: 500 }); } }
  return new Response("{}", { status: 404 });
};
globalThis.__NOW__ = Date.parse("2026-11-15T12:00:00+09:00"); // 시즌 3 진행 중(시즌 2 종료)
await import(pathToFileURL(path.join(root, "supabase/functions/submit-score/index.ts")).href);
const dev = "123e4567-e89b-12d3-a456-426614174000", dev2 = "223e4567-e89b-12d3-a456-426614174000";
const call = async (o) => { const r = await handler(new Request("http://f/", { method: "POST", body: JSON.stringify(o) })); const j = await r.json(); return [r.status, j]; };
const is = (n, got, st, err) => tb(n + ` (${got[0]} ${got[1].error ?? "ok"})`, got[0] === st && (err ? got[1].error === err : got[1].ok === true));

let g = await call({ action: "rewards", device_id: dev });
is("rewards 정상", g, 200);
tb("rewards 응답 모양: ok,cur,last,pending,tbl, device_id 미노출", ["ok", "cur", "last", "pending", "tbl"].every((k) => k in g[1]) && g[1].cur === 3 && g[1].last.season === 2 && g[1].pending[0].total === 400 && g[1].tbl.extra1 === 100 && !JSON.stringify(g[1]).includes(dev));
tb("rewards: RPC 는 season_rewards_get 한 번, 인자는 소문자 기기 id", rpcCalls.filter((c) => c[0] === "season_rewards_get").length === 1 && rpcCalls.find((c) => c[0] === "season_rewards_get")[1].p_device === dev);
tb("rewards: rate limit kind=read, ip 40/dev 20", (() => { const c = rpcCalls.find((x) => x[0] === "rate_limit_hit")[1]; return c.p_kind === "read" && c.p_ip_max === 40 && c.p_dev_max === 20; })());
g = await call({ action: "rewards", device_id: dev2 }); tb("rewards: 다른 기기는 pending []", g[0] === 200 && g[1].pending.length === 0);
is("rewards: device 형식 오류", await call({ action: "rewards", device_id: "abc" }), 400, "bad_device");
is("rewards: device 없음", await call({ action: "rewards" }), 400, "bad_device");
rateOk = false; is("rewards: 한도 초과 429", await call({ action: "rewards", device_id: dev }), 429, "rate_limited");
is("rewardAck: 한도 초과 429", await call({ action: "rewardAck", device_id: dev, seasons: [2] }), 429, "rate_limited"); rateOk = true;
rewardsFail = true; is("rewards: RPC 실패는 500 server_error", await call({ action: "rewards", device_id: dev }), 500, "server_error"); rewardsFail = false;

const nCalls = () => rpcCalls.filter((c) => c[0] === "season_rewards_ack").length;
is("rewardAck 정상", g = await call({ action: "rewardAck", device_id: dev, seasons: [2] }), 200);
tb("rewardAck: acked 1", g[1].acked === 1);
g = await call({ action: "rewardAck", device_id: dev, seasons: [2, 2] }); tb("rewardAck: 재호출 멱등(acked 0)", g[0] === 200 && g[1].acked === 0);
tb("rewardAck: 중복 시즌 제거 후 전달", rpcCalls.filter((c) => c[0] === "season_rewards_ack").at(-1)[1].p_seasons.length === 1);
g = await call({ action: "rewardAck", device_id: dev2, seasons: [2] }); tb("rewardAck: 본인 기기만(다른 기기 id 는 자기 몫만)", g[0] === 200 && rpcCalls.at(-1)[1].p_device === dev2);
const before = nCalls();
for (const [n, s] of [["seasons 없음", undefined], ["빈 배열", []], ["문자열", "2"], ["객체", { a: 1 }], ["소수", [1.5]], ["문자 원소", ["2"]], ["0", [0]], ["음수", [-1]], ["너무 큰 값", [100000]], ["null 원소", [null]], ["21개", Array.from({ length: 21 }, (_, i) => i + 1)]])
  is(`rewardAck 거부: ${n}`, await call({ action: "rewardAck", device_id: dev, seasons: s }), 400, "bad_seasons");
tb("rewardAck: 거부 건은 RPC 호출 없음", nCalls() === before);
is("rewardAck: 20개는 허용", await call({ action: "rewardAck", device_id: dev, seasons: Array.from({ length: 20 }, (_, i) => i + 1) }), 200);
is("rewardAck: device 형식 오류", await call({ action: "rewardAck", device_id: "x", seasons: [2] }), 400, "bad_device");
is("기존: 잘못된 action 여전히 거부", await call({ action: "hack", device_id: dev }), 400, "bad_action");
is("기존: profile 여전히 동작", await (async () => { rpcImpl.player_profile = () => ({ exists: false }); return call({ action: "profile", device_id: dev }); })(), 200);

console.log(`\n${pass} PASS / ${failN} FAIL`);
process.exit(failN ? 1 : 0);
