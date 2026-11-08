// 주간 시즌(일~토 KST) + 랭킹 캐시/호출 최소화 + 누적 승점 회귀 테스트. ui.js/data.js 발췌를 vm 에서 실행(가짜 fetch/localStorage/시계).
// 실행: node tools/test_season_rank.mjs
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = (f) => fs.readFileSync(path.join(root, f), "utf8");
const ui = rd("ui.js"), data = rd("data.js");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const cut = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error("slice " + a); return src.slice(i, j); };

// ---- 가짜 환경 ----
let NOW = Date.parse("2026-11-10T12:00:00+09:00");
class FakeDate extends Date { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
const store = new Map(), calls = [];
let handler = () => ({ status: 200, body: [] });
const ctx = vm.createContext({
  console, Math, JSON, Promise, Number, Object, Array, String, encodeURIComponent, Date: FakeDate, setTimeout,
  CONFIG: { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "sb_publishable_x", MYHERO_RANKED: true },
  remote: () => true, hdr: () => ({ apikey: "k" }), LS_KEY: "rows", myName: () => "나나",
  lsGet: (k, d = null) => (store.has(k) ? store.get(k) : d), lsSet: (k, v) => store.set(k, v),
  localStorage: { removeItem: (k) => store.delete(k) },
  fetch: async (url, opt) => { calls.push({ url, opt }); const r = await handler(url, opt); if (r.reject) throw new Error("net"); return { ok: r.status === 200, status: r.status, json: async () => r.body, headers: { get: (h) => (h.toLowerCase() === "content-range" ? r.range || null : null) } }; },
  api: async () => ({ st: 200, d: { profile: { exists: true, mine: [] } } }),
});
vm.runInContext(cut(data, "// SEASONS-BEGIN", "// SEASONS-END"), ctx);
vm.runInContext(cut(ui, "// ---- 시즌 ----", "// ---- 랭킹 제출 ----") + cut(ui, "// ---- 랭킹 캐시", "const buildTag"), ctx);
const run = (c) => vm.runInContext(c, ctx);
const at = (iso) => { NOW = Date.parse(iso); };
const reset = () => { store.clear(); calls.length = 0; handler = () => ({ status: 200, body: [] }); ctx.CONFIG.MYHERO_RANKED = true; };

// ---- 1. 시즌 규칙/경계 ----
at("2026-11-14T23:59:59+09:00");
ok(run("phaseNow().season.id") === 2 && run("phaseNow().season.end") === "2026-11-14", "토 23:59:59 KST = 시즌 2 마지막 순간");
ok(run("seasonLeft(phaseNow().season)") === 0, "토요일은 종료까지 0일(마지막 날)");
at("2026-11-15T00:00:00+09:00");
ok(run("phaseNow().season.id") === 3 && run("phaseNow().season.start") === "2026-11-15", "일 00:00:00 KST = 시즌 3 시작");
ok(run("seasonLeft(phaseNow().season)") === 6, "일요일은 종료까지 6일");
at("2026-11-14T15:00:00Z"); // = 11/15 00:00 KST (UTC 로 표현)
ok(run("phaseNow().season.id") === 3, "UTC 15:00 = 일 00:00 KST 에 전환(기기 시간대 무관)");
at("2026-11-08T00:00:00+09:00"); ok(run("phaseNow().season.id") === 2, "11/08 일요일 = 시즌 2 시작(앵커)");
at("2026-11-07T23:59:59+09:00"); ok(run("phaseNow().season.id") === 1, "11/07 토 = 옛 시즌 1 마지막");
at("2027-03-07T09:00:00+09:00"); ok(run("phaseNow().season.id") === 2 + Math.floor((Date.parse("2027-03-07") - Date.parse("2026-11-08")) / 864e5 / 7) && new Date(run("phaseNow().season.start") + "T00:00:00Z").getUTCDay() === 0, "먼 미래도 일요일 시작 7일 주기");
ok(run("seasonById(0)") === null && run("seasonById(1.5)") === null && run("seasonById(5).end") === "2026-12-05", "id 로 기간 복원(5 = 11/29~12/05)");

// ---- 2. 승점 집계(서버 뷰 leaderboard_points 와 같은 규칙) ----
const fin = (season, ...names) => ({ season, rows: names.map((name) => ({ name })) });
let P = run("tallyPoints")([fin(2, "A", "B", "C", "D"), fin(3, "B", "A", "D"), fin(4, "C", "A", "B")]);
ok(P.map((x) => x.name + x.points).join() === "A7,B6,C4,D1", "승점 합: 1위3/2위2/3위1, 4위 이하 0: " + P.map((x) => x.name + x.points));
ok(P[0].rank === 1 && P[1].rank === 2 && P[0].gold === 1 && P[1].gold === 1 && P[0].last_season === 4, "금 횟수/마지막 시즌 집계");
P = run("tallyPoints")([fin(2, "A", "B", "C"), fin(3, "B", "C", "A")]);
ok(P.map((x) => x.name).join() === "B,A,C" && P[0].points === 5 && P[1].points === 4, "금 많은 쪽이 승점 같을 때 앞(B 5? A 4)");
P = run("tallyPoints")([fin(2, "X", "Y"), fin(3, "Z", "W", "Y")]);
ok(P.slice(0, 3).map((x) => x.name + x.rank).join() === "X1,Z1,Y3", "승점 3 동률: 금1(X,Z) 공동 1위, 은1동1(Y) 은 금 적어 3위");
P = run("tallyPoints")([fin(2, "A", "B"), fin(3, "B", "A")]);
ok(P[0].points === 5 && P[1].points === 5 && P[0].gold === 1 && P[1].gold === 1 && P[0].rank === 1 && P[1].rank === 1 && P[0].name === "A", "승점·금은동 모두 같으면 공동 1위, 목록은 이름순");
ok(run("tallyPoints")([]).length === 0, "끝난 시즌 없으면 빈 목록");

// ---- 3. 캐시 / 호출 수 ----
const rows = (n) => Array.from({ length: n }, (_, i) => ({ name: "p" + i, score: 1000 - i, round: 20, win: false, hero: "x", build: null, played_at: "t", rank: i + 1, is_mine: false }));
reset(); at("2026-11-11T12:00:00+09:00"); handler = () => ({ status: 200, body: rows(30) });
let r = await run("fetchRanks(2 + 1, 'rand')");
ok(calls.length === 1 && r.rows.length === 30 && !r.cached && calls[0].url.includes("rank=lte.100") && !calls[0].url.includes("limit=1000"), "첫 조회 1회, 상위 100 제한");
await run("fetchRanks(3, 'rand')"); await run("fetchRanks(3, 'rand')");
ok(calls.length === 1, "TTL(3분) 안의 재열람은 서버 호출 0");
at("2026-11-11T12:02:59+09:00"); await run("fetchRanks(3, 'rand')"); ok(calls.length === 1, "179초 경과도 캐시");
at("2026-11-11T12:03:01+09:00"); r = await run("fetchRanks(3, 'rand')"); ok(calls.length === 2 && !r.cached, "TTL 만료 후 1회 재조회");
await run("fetchRanks(3, 'rand', {force:true})"); ok(calls.length === 3, "force 는 캐시 무시");
reset(); handler = () => ({ status: 200, body: rows(5) });
await Promise.all([run("fetchRanks(3, 'rand')"), run("fetchRanks(3, 'rand')"), run("fetchRanks(3, 'rand', {maxAge: 600000})")]);
ok(calls.length === 1, "동시에 같은 조회(홈+모달/이중 refreshTitle)는 한 번만");
// maxAge: 홈은 10분 허용, 모달은 3분
reset(); at("2026-11-11T12:00:00+09:00"); handler = () => ({ status: 200, body: rows(5) });
await run("fetchRanks(3, 'rand')"); at("2026-11-11T12:08:00+09:00");
await run("fetchRanks(3, 'rand', {maxAge: 600000})"); ok(calls.length === 1, "홈 조회는 10분 된 캐시도 사용(모달이 3분 넘으면 새로 조회)");
await run("fetchRanks(3, 'rand')"); ok(calls.length === 2, "모달은 3분 넘으면 재조회");
// 지난 시즌 영구 캐시
reset(); at("2026-11-15T00:30:00+09:00"); handler = () => ({ status: 200, body: rows(3) });
await run("fetchRanks(2, 'rand')"); at("2026-12-20T00:00:00+09:00"); r = await run("fetchRanks(2, 'rand')");
ok(calls.length === 1 && r.cached, "끝난 시즌(2)은 영구 캐시: 한 달 뒤에도 호출 0");
reset(); at("2026-11-14T23:59:00+09:00"); handler = () => ({ status: 200, body: rows(3) });
await run("fetchRanks(2, 'rand')"); at("2026-11-15T00:05:00+09:00"); await run("fetchRanks(2, 'rand')");
ok(calls.length === 2, "시즌 종료 직후 10분은 '최종' 취급하지 않음(시차 보호): 짧은 TTL");
at("2026-11-15T00:20:00+09:00"); await run("fetchRanks(2, 'rand')"); const n1 = calls.length;
at("2026-11-16T00:20:00+09:00"); await run("fetchRanks(2, 'rand')"); ok(calls.length === n1, "종료 10분 후 받은 것은 영구");
// 캐시는 시즌/리그별로 분리
reset(); at("2026-11-11T12:00:00+09:00"); handler = (u) => ({ status: 200, body: u.includes("is_mine=eq.true") ? rows(2).map((x) => ({ ...x, name: "m" + x.name })) : rows(4) });
const ra = await run("fetchRanks(3, 'rand')"), rm = await run("fetchRanks(3, 'mine')"), rp = await run("fetchRanks(2, 'rand')");
ok(ra.rows.length === 4 && rm.rows.length === 2 && rm.rows[0].name.startsWith("m") && calls.length === 3, "리그·시즌별 캐시 키 분리");
ok((await run("fetchRanks(3, 'mine')")).rows[0].name === "mp0" && calls.length === 3, "내 영웅 보드는 자기 캐시");

// ---- 4. (b) 서버에 is_mine 이 없을 때 내 영웅 리그는 반드시 '준비 중' ----
reset(); at("2026-11-11T12:00:00+09:00"); ctx.CONFIG.MYHERO_RANKED = false;
handler = (u) => (u.includes("is_mine") ? { status: 400, body: {} } : { status: 200, body: rows(11) });
r = await run("fetchRanks(3, 'mine')");
ok(r.unsup && r.rows.length === 0 && calls.length === 0, "MYHERO_RANKED=false: 호출 없이 준비 중(운빨 11명이 섞이지 않음)");
ctx.CONFIG.MYHERO_RANKED = true; reset();
handler = (u) => (u.includes("is_mine") ? { status: 400, body: {} } : { status: 200, body: rows(11) });
r = await run("fetchRanks(3, 'mine')");
ok(r.unsup && r.rows.length === 0, "is_mine 400 + 일반 200 서버(MYHERO_RANKED=true): 내 영웅 보드 = 준비 중");
ok(calls.length === 3, "후보 3개를 내려가며 시도(hero_name+is_mine -> is_mine -> 무필터)");
const c0 = calls.length; r = await run("fetchRanks(3, 'mine')"); ok(r.unsup && calls.length === c0, "준비 중 결과도 캐시(재열람마다 3회 호출 방지)");
r = await run("fetchRanks(3, 'rand')"); ok(!r.unsup && r.rows.length === 11 && calls.length === c0 + 1 && calls[calls.length - 1].url.includes("&season=eq.3") && !calls[calls.length - 1].url.includes("is_mine"), "같은 서버의 운빨 보드는 곧장 무필터 후보로 1회(능력 기억)");
const cap = JSON.parse(store.get("malang-rc:cap")); ok(cap.v.k === "00", "서버 능력(후보 번호)을 기억");
// 새로 배포된 서버: 30분 지나면 다시 탐색
at("2026-11-11T12:31:00+09:00"); handler = () => ({ status: 200, body: rows(2) });
r = await run("fetchRanks(3, 'mine')"); ok(!r.unsup && r.rows.length === 2, "능력 캐시 만료 후 배포된 서버를 인식");
// 네트워크 장애는 후보 체인을 타지 않는다
reset(); at("2026-11-11T12:00:00+09:00"); handler = () => ({ reject: true });
let thrown = false; try { await run("fetchRanks(3, 'rand')"); } catch { thrown = true; }
ok(thrown && calls.length === 1, "네트워크 오류: 1회만 시도하고 오류(구: 3회)");
reset(); handler = () => ({ status: 503, body: {} }); thrown = false; try { await run("fetchRanks(3, 'rand')"); } catch { thrown = true; }
ok(thrown && calls.length === 1, "5xx 도 후보 체인을 타지 않음");

// ---- 5. 내 순위 한 건 / 승점 ----
reset(); at("2026-11-11T12:00:00+09:00");
handler = (u) => (u.includes("name=eq.") ? { status: 200, body: [{ name: "나나", score: 321, rank: 137 }] } : { status: 200, body: rows(100), range: "0-99/230" });
r = await run("fetchRanks(3, 'rand')"); ok(r.total === 230 && r.rows.length === 100, "Content-Range 로 전체 인원 수");
let m = await run("fetchMyRank(3, 'rand', '나나')"); ok(m.rank === 137 && m.score === 321 && calls.length === 2 && calls[1].url.includes("limit=1"), "상위 100 밖 내 순위: 한 건 조회");
await run("fetchMyRank(3, 'rand', '나나')"); ok(calls.length === 2, "내 순위도 캐시");
handler = () => ({ status: 200, body: [] }); reset(); at("2026-11-11T12:00:00+09:00");
ok((await run("fetchMyRank(3, 'rand', '없음')")) === null, "기록 없음 = null");
ctx.CONFIG.MYHERO_RANKED = false; ok((await run("fetchMyRank(3, 'mine', '나나')")) === undefined, "내 영웅 미배포는 조회 안 함");
ctx.CONFIG.MYHERO_RANKED = true;
reset(); at("2026-11-17T12:00:00+09:00");
handler = () => ({ status: 404, body: {} }); r = await run("fetchPoints('rand')"); ok(r.unsup && calls.length === 1, "010 전(뷰 없음 404): 승점 준비 중");
await run("fetchPoints('rand')"); ok(calls.length === 1, "준비 중 결과 캐시");
reset(); handler = () => ({ status: 200, body: [{ rank: 1, name: "A", points: 3, gold: 1, silver: 0, bronze: 0, last_season: 3 }], range: "0-0/1" });
r = await run("fetchPoints('rand')"); ok(!r.unsup && r.rows[0].points === 3 && calls[0].url.includes("leaderboard_points") && calls[0].url.includes("is_mine=eq.false"), "승점 조회");
at("2026-11-21T12:00:00+09:00"); await run("fetchPoints('rand')"); ok(calls.length === 1, "같은 시즌 동안 승점은 불변 -> 재호출 0");
at("2026-11-22T00:10:00+09:00"); await run("fetchPoints('rand')"); ok(calls.length === 2, "새 시즌 시작 후(끝난 시즌 id 변경) 한 번만 다시 조회");
ctx.CONFIG.MYHERO_RANKED = false; r = await run("fetchPoints('mine')"); ok(r.unsup && calls.length === 2, "내 영웅 승점: MYHERO_RANKED 전 준비 중, 호출 0");
ctx.CONFIG.MYHERO_RANKED = true;

// ---- 6. 개인 최고 / 캐시 LRU ----
reset(); at("2026-11-11T12:00:00+09:00");
ok(run("sbestGet('rand', 3)") === null, "시즌 최고 기록 없음");
run("sbestSet('rand', 3, 500)"); run("sbestSet('rand', 3, 300)"); run("sbestSet('mine', 3, 900)");
ok(run("sbestGet('rand', 3)") === 500 && run("sbestGet('mine', 3)") === 900, "리그별 최고, 낮은 값으로 덮지 않음");
ok(run("sbestGet('rand', 4)") === null, "새 시즌에는 초기화");
reset(); for (let i = 0; i < 30; i++) run(`rcSet("k${i}", 1)`);
ok(JSON.parse(store.get("malang-rc:idx")).length === 16 && !store.has("malang-rc:k0") && store.has("malang-rc:k29"), "캐시 항목은 최대 16개(LRU)");
run("rcDrop('k2')"); ok(!store.has("malang-rc:k29") && store.has("malang-rc:k14"), "rcDrop 접두사 삭제(k2*)");

// ---- 7. 정적 점검 ----
const sub = cut(ui, "async function submitScore(P)", "// 게임오버 화면의 순위 변동");
ok(/P\.score <= lb\) \{ flushQueue\(\); return \{ st: "skip"/.test(sub), "개인 시즌 최고 이하 판은 서버 호출 생략");
ok(sub.includes("sbestSet(bd0, ssid, r.d.season_best)") && sub.includes("if (r.d.saved)") && sub.includes("rcDrop("), "서버 확정 최고만 기록 + 갱신 시 캐시 폐기");
ok(/season: sid0/.test(sub) && /item\.season !== cs\.id/.test(ui), "큐 항목에 시즌 id, 지난 시즌 큐는 폐기");
ok(ui.includes("LEAGUE[S.mine ? \"mine\" : \"rand\"]") && ui.includes("나만의 영웅 리그\" : \"운빨 리그\"} 랭킹 보기"), "(a) 판 종료 화면에 리그명 표시(제목/버튼)");
ok(/RK_LEAGUE/.test(cut(ui, "async function showRanks(", "function restartGame()")) && /data-b=/.test(ui) && /data-s=/.test(ui) && /data-t=/.test(ui) && /role="tab"/.test(ui) && /aria-selected/.test(ui), "랭킹 모달: 리그 탭+내 기록 탭, 보조 탭, 시즌 선택, role=tab/aria-selected");
ok(!/api\("profile"\)/.test(cut(ui, "async function refreshTitle()", "function showSeasonClosed")), "홈 진입은 Edge Function(profile) 호출 없음");
const mig = rd("supabase/migrations/010_season_points.sql");
ok(/2026-11-08/.test(mig) && /\/ 7/.test(mig) && /Asia\/Seoul/.test(mig) && /when 1 then 3 when 2 then 2 else 1/.test(mig) && /b\.season < public\.season_current\(\)/.test(mig), "010: season_current(앵커·7일·KST), 승점 3/2/1, 끝난 시즌만");
ok(/rank\(\) over \(partition by t\.is_mine order by t\.points desc, t\.gold desc, t\.silver desc, t\.bronze desc\)/.test(mig) && /grant select on public\.leaderboard_points to anon/.test(mig) && /revoke all on public\.season_final_points/.test(mig), "010: 리그별 승점 순위/동점 규칙/권한");
ok(!fs.existsSync(path.join(root, "supabase/migrations/008_x.sql")) && fs.readdirSync(path.join(root, "supabase/migrations")).every((f) => !f.startsWith("008")), "008 번호는 계속 비워 둠");
const engine = rd("supabase/functions/submit-score/engine.js");
ok(/const WEEK_ANCHOR = "2026-11-08"/.test(engine) && /function seasonIdOf/.test(engine) && /const ENGINE_VER = "7"/.test(engine + rd("game.js") + data) , "서버 번들에 주간 시즌 규칙 포함, GAME_VER 7(내 영웅 v2)");
const sw = rd("sw.js"); ok(!/v24-coin-market-btn/.test(sw) && /CACHE_VERSION = 'v\d+-/.test(sw), "sw CACHE_VERSION 갱신");
console.log(`pass ${pass} fail ${fail}`); process.exit(fail ? 1 : 0);
