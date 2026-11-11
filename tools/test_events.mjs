// 이용 행동 기록 테스트: node tools/test_events.mjs
// (1) events.ts 검증·속도 제한·핸들러(가짜 rpc)  (2) index.ts 라우팅 + 기존 액션 불변  (3) track.js 클라이언트(가짜 window/localStorage/fetch)
// SQL(013_events.sql)은 로컬 Postgres 가 없어 실행하지 못한다: 정적 점검만 하고, 운영 적용 전 SQL Editor 에서 확인한다.
import path from "node:path"; import fs from "node:fs"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const ENV = { SUPABASE_URL: "http://x", SUPABASE_SERVICE_ROLE_KEY: "svc", EV_SALT: "salt-for-test" };
let handler; const rpcs = [];
globalThis.Deno = { env: { get: (k) => ENV[k] }, serve: (h) => (handler = h) };
globalThis.fetch = async (url, o) => { // index.ts 의 rpc() 가 부르는 가짜 PostgREST
  const fn = String(url).split("/rpc/")[1]; const args = JSON.parse(o.body); rpcs.push({ fn, args });
  const body = fn === "rate_limit_hit" ? true : fn === "ev_ingest" ? args.p_events.length : null;
  return new Response(JSON.stringify(body), { status: 200 });
};
const EV = await import(pathToFileURL(path.join(root, "supabase/functions/submit-score/events.ts")).href);
await import(pathToFileURL(path.join(root, "supabase/functions/submit-score/index.ts")).href);
const DEV = "11111111-2222-4333-8444-555555555555";
const good = () => ({ action: "ev", device_id: DEV, sid: "abcdefghij12", ver: "10", env: { pf: "ios", sa: 1, vw: "m", new: 1 },
  ev: [{ t: 0, e: "ss", src: "launch" }, { t: 100, e: "scr", s: "home" }, { t: 200, e: "tap", b: "start_rand" }, { t: 300, e: "rs", lg: "rand", h: "fox" },
    { t: 9000, e: "re", lg: "rand", r: 30, w: 0, sc: 1234, dur: 300, ex: "end", n: { dr: 50, mg: 20, sl: 3, up: 10, rg: 5, tk: 1, lk: 2, au: 1, sp: 4 } },
    { t: 9500, e: "hd", vis: 400, play: 300, act: 120, last: "over", rec: 0 }] });
const post = async (o, ctype = "text/plain;charset=UTF-8") => { const r = await handler(new Request("http://f/", { method: "POST", headers: { "content-type": ctype }, body: typeof o === "string" ? o : JSON.stringify(o) })); return [r.status, await r.json(), r.headers]; };

// ---- (1) 이벤트 검증 ----
for (const [name, e] of Object.entries({
  ss_bad_src: { t: 0, e: "ss", src: "x" }, scr_unknown: { t: 0, e: "scr", s: "nickname_is_bob" }, scr_text: { t: 0, e: "scr", s: "home<script>" }, tap_unknown: { t: 0, e: "tap", b: "zzz" },
  neg_t: { t: -1, e: "scr", s: "home" }, str_t: { t: "5", e: "scr", s: "home" }, unknown_e: { t: 0, e: "evil" }, rs_bad_hero: { t: 0, e: "rs", lg: "rand", h: "Bob Kim!" },
  re_bad_ex: { t: 0, e: "re", lg: "rand", r: 3, w: 0, sc: 1, dur: 1, ex: "quit" }, re_neg_round: { t: 0, e: "re", lg: "rand", r: -1, w: 0, sc: 1, dur: 1, ex: "end" },
  re_bad_n: { t: 0, e: "re", lg: "rand", r: 3, w: 0, sc: 1, dur: 1, ex: "end", n: { dr: "x" } }, hd_float: { t: 0, e: "hd", vis: 1.5, play: 0, act: 0 }, hd_bad_last: { t: 0, e: "hd", vis: 1, play: 1, act: 1, last: "free text" },
})) ok(EV.cleanEvent(e) === null, "drop " + name);
ok(EV.cleanEvent(null) === null && EV.cleanEvent([]) === null && EV.cleanEvent("x") === null, "non-object dropped");
const c1 = EV.cleanEvent({ t: 5, e: "scr", s: "home", nick: "밥", text: "hi", extra: { a: 1 } });
eq(c1, { e: "scr", t: 5, s: "home" }, "unknown keys stripped (닉네임·자유 문자열 불가)");
const c2 = EV.cleanEvent({ t: 5, e: "re", lg: "rand", r: 3, w: 0, sc: 1, dur: 1, ex: "end", n: { dr: 1, evil: 99, sp: 2 } });
eq(c2.n, { dr: 1, sp: 2 }, "re.n 허용 키만");
ok(EV.cleanEvent(good().ev[4]) !== null, "full re within byte limit");
// 설계의 모든 화면/버튼 enum 이 통과
for (const s of EV.SCREENS) ok(EV.cleanEvent({ t: 0, e: "scr", s }) !== null, "screen " + s);
for (const b of EV.TAPS) ok(EV.cleanEvent({ t: 0, e: "tap", b }) !== null, "tap " + b);
// 배치
ok("err" in EV.cleanBatch({ ...good(), sid: "short" }), "bad sid");
ok("err" in EV.cleanBatch({ ...good(), ver: "abc" }), "bad ver");
ok("err" in EV.cleanBatch({ ...good(), ev: [] }), "empty ev");
ok("err" in EV.cleanBatch({ ...good(), ev: Array(31).fill({ t: 0, e: "scr", s: "home" }) }), "31 events");
const cb = EV.cleanBatch({ ...good(), ev: [...good().ev, { t: 0, e: "bad" }], env: { pf: "toaster", sa: 7, vw: "x", new: "yes" } });
eq([cb.events.length, cb.dropped, cb.env], [6, 1, { pf: "other", sa: 0, vw: "l", new: 0 }], "batch drops invalid event only, env coarse");
// 속도 제한
EV._resetRate(); const t0 = 1_700_000_000_000;
let allowed = 0; for (let i = 0; i < 20; i++) if (EV.rateAllow("devA", t0)) allowed++;
eq(allowed, 12, "분당 12회"); ok(EV.rateAllow("devB", t0), "다른 기기는 독립"); ok(EV.rateAllow("devA", t0 + 60_000), "다음 분 초기화");
eq(EV.samplePct(undefined), 100, "샘플 기본 100"); eq([EV.samplePct("50"), EV.samplePct("-5"), EV.samplePct("999"), EV.samplePct("abc")], [50, 0, 100, 100], "샘플 클램프");

// ---- (2) 핸들러·라우팅 ----
EV._resetRate(); rpcs.length = 0;
let [st, j] = await post(good());
eq([st, j.ok, j.keep, j.sample], [200, true, 1, 100], "ev ok (text/plain 본문)");
const ing = rpcs.filter((r) => r.fn === "ev_ingest"); eq(ing.length, 1, "ev_ingest 1회");
ok(!rpcs.some((r) => r.fn === "rate_limit_hit"), "ev 는 rate_limit_hit RPC 를 쓰지 않는다");
ok(/^[0-9a-f]{16}$/.test(ing[0].args.p_dev) && !JSON.stringify(ing[0].args).includes(DEV), "기기는 16자 해시, 원 device_id 저장 안 함");
const expectDev = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ENV.EV_SALT + DEV)))].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
eq(ing[0].args.p_dev, expectDev, "sha256(EV_SALT+device_id) 앞 16자");
eq(ing[0].args.p_events.length, 6, "이벤트 6건 전달");
[st, j] = await post(good(), "application/json"); eq([st, j.ok], [200, true], "application/json 도 허용");
[st, j] = await post({ ...good(), device_id: "nope" }); eq([st, j.error], [400, "bad_device"], "bad device");
[st, j] = await post({ ...good(), sid: "x" }); eq([st, j.error], [400, "bad_sid"], "bad sid");
[st, j] = await post({ ...good(), ev: [{ t: 0, e: "bad" }] }); eq([st, j.ok], [200, true], "전부 폐기돼도 200");
const before = rpcs.length; await post({ ...good(), ev: [{ t: 0, e: "bad" }] }); eq(rpcs.length, before, "저장할 이벤트 없으면 RPC 안 부름");
[st, j] = await post(JSON.stringify({ ...good(), pad: "x".repeat(5000) })); eq([st, j.error], [413, "too_large"], "4KB 초과");
EV._resetRate(); let last; for (let i = 0; i < 14; i++) last = await post(good()); eq([last[0], last[1].error], [429, "rate_limited"], "13번째부터 429");
// IP 제한: 기기 ID 를 바꿔 가며 보내도 같은 IP 는 분당 60회까지(위조한 device_id 로 DB 를 채우는 요청 차단)
EV._resetRate(); let ipOk = 0, ip429 = 0;
for (let i = 0; i < 65; i++) { const r = await post({ ...good(), device_id: `${String(i).padStart(8, "0")}-aaaa-4bbb-8ccc-dddddddddddd` }); if (r[0] === 429) ip429++; else ipOk++; }
eq([ipOk, ip429], [60, 5], "같은 IP 분당 60회 초과분은 429");
ok(EV.ipAllow("1.2.3.4", t0) && EV.ipAllow("5.6.7.8", t0), "다른 IP 는 독립"); EV._resetRate();
// EV_SALT 없음: 기록 건너뜀 + keep:0, 점수 경로 영향 없음
EV._resetRate(); delete ENV.EV_SALT; rpcs.length = 0; [st, j] = await post(good()); eq([st, j.ok, j.keep, rpcs.length], [200, true, 0, 0], "솔트 없으면 건너뜀(keep:0, RPC 없음)"); ENV.EV_SALT = "salt-for-test";
// 샘플링 0 / 50
EV._resetRate(); ENV.EV_SAMPLE_PCT = "0"; rpcs.length = 0; [st, j] = await post(good()); eq([j.keep, j.sample, rpcs.length], [0, 0, 0], "샘플 0%: 저장 없음");
ENV.EV_SAMPLE_PCT = "50"; let kept = 0;
for (let i = 0; i < 200; i++) { EV._resetRate(); const r = await post({ ...good(), device_id: `${String(i).padStart(8, "0")}-2222-4333-8444-555555555555` }); if (r[1].keep) kept++; }
ok(kept > 70 && kept < 130, "샘플 50% 대략 절반: " + kept); delete ENV.EV_SAMPLE_PCT;
// rpc 실패해도 서버가 죽지 않는다
EV.deps.rpc = async () => { throw new Error("db down"); }; EV._resetRate(); [st, j] = await post(good()); eq([st, j.ok], [500, false], "DB 실패는 500 JSON(점수 경로 무관)");
EV.deps.rpc = (fn, a) => import(pathToFileURL(path.join(root, "supabase/functions/submit-score/private.ts")).href).then((m) => m.deps.rpc(fn, a));
// 기존 액션 불변: 잘못된 action, 형식 오류, OPTIONS, submit 검증 순서
[st, j] = await post({ action: "nope", device_id: DEV }); eq([st, j.error], [400, "bad_action"], "알 수 없는 action 은 그대로 bad_action");
[st, j] = await post({ action: "profile" }); eq([st, j.error], [400, "bad_device"], "profile 은 device_id 필수(그대로)");
[st, j] = await post("not json"); eq([st, j.error], [400, "bad_json"], "bad_json");
[st, j] = await post({ device_id: DEV, mode: "practice" }); eq([st, j.error], [400, "practice_not_ranked"], "submit 기본 action 경로 그대로");
const o = await handler(new Request("http://f/", { method: "OPTIONS" })); eq(o.status, 204, "OPTIONS 204");
[st, j] = await post({ action: "register", device_id: DEV, name: "a" }); ok(st === 400 && /bad_name/.test(j.error), "register 닉네임 검증 그대로");
const src = fs.readFileSync(path.join(root, "supabase/functions/submit-score/index.ts"), "utf8");
ok(src.indexOf('action === "ev"') < src.indexOf('action.startsWith("ps")') && src.indexOf('action === "ev"') < src.indexOf("rate_limit_hit"), "ev 분기는 ps/fr/점수 경로·rate_limit 앞");
const allowList = src.match(/\["submit", "register"[^\]]*\]/)[0]; ok(!allowList.includes('"ev"'), "ev 는 점수 경로 허용 목록에 섞지 않음");
// 설계의 이벤트 사전 = 서버 enum 일치(ui 훅이 보내는 화면 이름이 서버에서 안 버려지는지)
const hooks = new Set(); for (const f of ["ui.js", "seasons.js", "myhero.js"]) for (const m of fs.readFileSync(path.join(root, f), "utf8").matchAll(/Track\.scr\("([a-z_]+)"/g)) hooks.add(m[1]);
for (const m of fs.readFileSync(path.join(root, "ui.js"), "utf8").matchAll(/Track\.scr\("(ranks_)" \+ \(tab/g)) hooks.add("ranks_season");
hooks.delete("ranks_"); for (const s of hooks) ok(EV.SCREENS.has(s), "훅 화면이 서버 enum 에 있음: " + s);
for (const s of ["ranks_season", "ranks_points", "ranks_mine"]) ok(EV.SCREENS.has(s), "enum " + s);
const tm = fs.readFileSync(path.join(root, "track.js"), "utf8").match(/const TAPMAP = \{([^}]*)\}/)[1]; for (const m of tm.matchAll(/: "([a-z_]+)"/g)) ok(EV.TAPS.has(m[1]), "훅 버튼이 서버 enum 에 있음: " + m[1]);
// SQL 정적 점검
const sql = fs.readFileSync(path.join(root, "supabase/migrations/013_events.sql"), "utf8");
for (const t of ["ev_raw", "ev_session", "ev_daily", "ev_rollup_log"]) { ok(new RegExp(`create table if not exists public\\.${t}\\b`).test(sql), "create " + t); ok(new RegExp(`alter table public\\.${t} enable row level security`).test(sql), "RLS " + t); }
ok(!/\bdevice_id\b/.test(sql.replace(/--.*$/gm, "")), "SQL 에 device_id 컬럼 없음");
ok(/revoke all on function/.test(sql) && /grant execute on function public\.%s to service_role/.test(sql), "함수는 service_role 전용");
ok((sql.match(/\(/g) || []).length === (sql.match(/\)/g) || []).length, "괄호 균형");

// ---- (3) track.js ----
async function loadTrack(cfg, store = {}) {
  const calls = { fetch: [], beacon: [] }; let hidden = false; const lis = { doc: {}, win: {} }; let t = 1_800_000_000_000;
  const g = globalThis; g.window = g; g.CONFIG = cfg; g.__calls = calls;
  g.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  g.document = { get hidden() { return hidden; }, addEventListener: (n, f) => { (lis.doc[n] ||= []).push(f); } };
  g.addEventListener = (n, f) => { (lis.win[n] ||= []).push(f); };
  Object.defineProperty(g, "navigator", { configurable: true, value: { userAgent: "iPhone", sendBeacon: (u, b) => { calls.beacon.push([u, b]); return true; } } });
  g.innerWidth = 390; g.matchMedia = () => ({ matches: false });
  const realNow = Date.now; Date.now = () => t; g.fetch = async (u, o) => { calls.fetch.push([u, o]); return new Response(JSON.stringify(g.__resp ?? { ok: true, keep: 1 }), { status: g.__status ?? 200 }); };
  delete g.Track; (0, eval)(fs.readFileSync(path.join(root, "track.js"), "utf8"));
  let playing = false;
  const host = { deviceId: () => DEV, ver: "10", playing: () => playing, state: () => ({ round: 7, score: () => 321, inputs: [[1, "draw", 0], [2, "draw", 0], [3, "merge", 1]] }) };
  return { T: g.Track, calls, store, host, lis, setHidden: (v) => { hidden = v; (lis.doc.visibilitychange || []).forEach((f) => f()); }, adv: (ms) => { t += ms; }, setPlaying: (v) => { playing = v; }, restore: () => { Date.now = realNow; } };
}
const bodyOf = (c) => JSON.parse(c[1].body);
const tick = () => new Promise((r) => setTimeout(r, 30));
{ // 플래그 off: 아무 것도 안 함
  const x = await loadTrack({ SUPABASE_URL: "http://s" }); x.T.init(x.host); x.T.scr("home"); x.T.tap("menu"); x.T.rs("rand", "fox"); x.T.re({ round: 1 }); x.T.flush();
  x.setHidden(true); await tick();
  eq([x.calls.fetch.length, x.calls.beacon.length, Object.keys(x.lis.doc).length, Object.keys(x.store).length], [0, 0, 0, 0], "ANALYTICS off: 네트워크·리스너·저장 없음"); x.restore();
}
{ // 옵트아웃: 이벤트 없음
  const x = await loadTrack({ SUPABASE_URL: "http://s", ANALYTICS: true }, { "malang-ev-off": "1" }); x.T.init(x.host); x.T.scr("home"); x.T.flush(); x.setHidden(true); await tick();
  eq([x.calls.fetch.length, x.calls.beacon.length], [0, 0], "옵트아웃: 아무 것도 안 보냄"); x.restore();
}
{ // 정상 흐름
  const x = await loadTrack({ SUPABASE_URL: "http://s", ANALYTICS: true }); x.T.init(x.host); x.T.scr("home");
  x.adv(5000); x.setPlaying(true); x.T.rs("rand", "Fox!"); x.adv(60_000); x.T.tap("spd"); x.T.tap("spd"); x.adv(30_000);
  x.setPlaying(false); x.T.re({ round: 12, win: true, score: 999, inputs: [[1, "draw", 0], [2, "draw", 0], [3, "merge", 1], [4, "up", 2], [5, "weird", 0]] });
  await tick(); await new Promise((r) => setTimeout(r, 250));
  eq(x.calls.fetch.length, 1, "re 뒤 200ms 에 fetch 1회"); const b = bodyOf(x.calls.fetch[0]);
  eq([b.action, b.device_id, b.ver, b.sid.length], ["ev", DEV, "10", 12], "본문 공통 필드");
  eq(x.calls.fetch[0][1].headers["Content-Type"], "text/plain;charset=UTF-8", "text/plain(사전 요청 없음)");
  eq(b.ev.map((e) => e.e), ["ss", "scr", "rs", "tap", "tap", "re"], "이벤트 순서"); eq(b.ev[2].h, "fox_", "영웅 id 정리");
  const re = b.ev[5]; eq([re.lg, re.r, re.w, re.sc, re.ex, re.n], ["rand", 12, 1, 999, "end", { sp: 2, dr: 2, mg: 1, up: 1 }], "re 요약(행동 횟수 포함, 모르는 op 제외)");
  ok(re.dur >= 90, "판 보이는 시간 dur ~90s: " + re.dur);
  x.adv(10_000); x.setHidden(true); eq(x.calls.beacon.length, 1, "숨김 시 sendBeacon"); const hb = JSON.parse(await x.calls.beacon[0][1].text());
  const hd = hb.ev.find((e) => e.e === "hd"); eq([hd.vis, hd.play, hd.rec, hd.last], [105, 90, 0, "home"], "hd 누적(보이는 시간·게임 중 시간)");
  eq(hb.sid, b.sid, "같은 세션"); eq(JSON.parse(x.store["malang-ses"]).closed, 1, "정상 종료 표시");
  x.adv(10 * 60_000); x.setHidden(false); x.T.scr("prob"); x.setHidden(true); await tick(); const hb2 = JSON.parse(await x.calls.beacon[1][1].text());
  eq(hb2.sid, b.sid, "30분 안 복귀는 같은 세션"); x.adv(40 * 60_000); x.setHidden(false); x.T.scr("home"); x.setHidden(true);
  const hb3 = JSON.parse(await x.calls.beacon[2][1].text()); ok(hb3.sid !== b.sid && hb3.ev[0].e === "ss" && hb3.ev[0].src === "resume", "30분 초과 복귀는 새 세션(ss resume)");
  x.restore();
}
{ // 강제 종료 복구 + 429/keep:0 후 중단 + 큐 20건 전송
  const store = { "malang-ses": JSON.stringify({ sid: "oldsession123", t0: 1, n: 2, last: 1_800_000_000_000 - 3_600_000, vis: 200, play: 100, act: 50, lastScr: "ranks_season", closed: 0 }) };
  const x = await loadTrack({ SUPABASE_URL: "http://s", ANALYTICS: true }, store); x.T.init(x.host); await tick();
  const rb = bodyOf(x.calls.fetch[0]); eq([rb.sid, rb.ev[0].rec, rb.ev[0].vis], ["oldsession123", 1, 200], "비정상 종료 세션 복구 hd(rec:1)");
  for (let i = 0; i < 20; i++) x.T.tap("menu"); await tick(); ok(x.calls.fetch.length >= 2, "큐 20건이면 전송");
  global.__resp = { ok: true, keep: 0 }; const n0 = x.calls.fetch.length; for (let i = 0; i < 20; i++) x.T.tap("menu"); await tick(); for (let i = 0; i < 20; i++) x.T.tap("menu"); await tick();
  eq(x.calls.fetch.length, n0 + 1, "keep:0 응답 후 더는 안 보냄"); ok(!!x.store["malang-ev-skip"], "keep:0 는 하루 건너뛰기 기록"); delete global.__resp; x.restore();
}
{ // 429 중단 / 네트워크 실패 무시 / 샘플링 제외 기기는 init 단계에서 건너뜀
  const x = await loadTrack({ SUPABASE_URL: "http://s", ANALYTICS: true }); global.__status = 429; x.T.init(x.host); for (let i = 0; i < 20; i++) x.T.tap("menu"); await tick();
  const n0 = x.calls.fetch.length; for (let i = 0; i < 20; i++) x.T.tap("menu"); await tick(); eq(x.calls.fetch.length, n0, "429 후 세션 전송 중단"); delete global.__status; x.restore();
  const y = await loadTrack({ SUPABASE_URL: "http://s", ANALYTICS: true }); globalThis.fetch = async () => { throw new Error("offline"); }; y.T.init(y.host);
  let threw = false; try { for (let i = 0; i < 25; i++) y.T.tap("menu"); y.setHidden(true); await tick(); } catch { threw = true; } ok(!threw, "오프라인에서도 예외 없음(조용히 폐기)"); y.restore();
  const z = await loadTrack({ SUPABASE_URL: "http://s", ANALYTICS: true }, { "malang-ev-skip": String(1_800_000_000_000 - 1000) }); z.T.init(z.host); z.T.scr("home"); z.setHidden(true); eq([z.calls.fetch.length, z.calls.beacon.length], [0, 0], "skip 기록이 있으면 하루 동안 안 보냄"); z.restore();
  const w = await loadTrack({ SUPABASE_URL: "http://s", ANALYTICS: true }); w.T.init(w.host); w.T.setOpt(false); w.T.scr("home"); w.T.flush(); eq(w.calls.fetch.length, 0, "setOpt(false) 후 전송 없음"); w.T.setOpt(true); w.T.scr("home"); w.T.flush(); await tick(); ok(w.calls.fetch.length >= 1, "setOpt(true) 후 다시 전송"); w.restore();
}
console.log(`${fail ? "FAIL" : "OK"} test_events: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
