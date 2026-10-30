// Edge Function 핸들러 통합 테스트 (Deno 없이 Node 에서 Deno.serve/fetch 를 모킹): node tools/test_function.mjs
// RPC 는 메모리 가짜 DB 로 대체한다(SQL 의 규칙 - 닉네임 중복/1일 1회/시즌 최고점 - 을 같은 의미로 흉내). 실제 SQL 은 마이그레이션을 Supabase 에서 실행해 확인한다.
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let handler; const rpcCalls = []; let rateOk = true;

// ---- 가짜 DB ----
const players = new Map(); // device -> {name, chg(ISO|null), plays}
const scores = [];          // {season, device, score, seed, at}
let tick = 0;
const kst = (iso) => new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(0, 10);
const board = (season) => {
  const best = new Map();
  for (const s of scores.filter((x) => x.season === season)) { const o = best.get(s.device); if (!o || s.score > o.score) best.set(s.device, s); }
  return [...best.values()].sort((a, b) => b.score - a.score || a.at - b.at || (a.device < b.device ? -1 : 1)).map((x, i) => ({ ...x, rank: i + 1 }));
};
const nameTaken = (n, except) => [...players].some(([d, p]) => d !== except && p.name.toLowerCase() === n.toLowerCase());
const rpcImpl = {
  rate_limit_hit: () => rateOk,
  player_register: (a) => {
    const cur = players.get(a.p_device); if (cur) return [{ o_status: "exists", o_name: cur.name }];
    if (nameTaken(a.p_name)) return [{ o_status: "name_taken", o_name: null }];
    players.set(a.p_device, { name: a.p_name, chg: null, plays: 0 }); return [{ o_status: "ok", o_name: a.p_name }];
  },
  player_rename: (a) => {
    const p = players.get(a.p_device); if (!p) return [{ o_status: "no_player" }];
    if (p.name === a.p_name) return [{ o_status: "same", o_name: p.name }];
    const nxt = new Date(Date.parse(kst(a.p_now) + "T00:00:00+09:00") + 86400e3).toISOString();
    if (p.chg && kst(p.chg) >= kst(a.p_now)) return [{ o_status: "cooldown", o_name: p.name, o_next: nxt }];
    if (nameTaken(a.p_name, a.p_device)) return [{ o_status: "name_taken", o_name: p.name }];
    p.name = a.p_name; p.chg = a.p_now; return [{ o_status: "ok", o_name: p.name, o_next: nxt }];
  },
  player_link: (a) => { // 003_accounts.sql 의 player_link 와 같은 규칙
    const p = players.get(a.p_device); if (!p) return [{ o_status: "no_player" }];
    if (p.user === a.p_user) return [{ o_status: "already", o_device: a.p_device, o_name: p.name }];
    if (p.user) return [{ o_status: "device_linked_other" }];
    const up = [...players].find(([, x]) => x.user === a.p_user);
    if (up) return [{ o_status: "user_has_player", o_device: up[0], o_name: up[1].name }];
    p.user = a.p_user; p.knick = a.p_nick; return [{ o_status: "ok", o_device: a.p_device, o_name: p.name }];
  },
  player_get_by_user: (a) => { const up = [...players].find(([, x]) => x.user === a.p_user); return up ? [{ o_device: up[0], o_name: up[1].name }] : []; },
  player_get: (a) => { const p = players.get(a.p_device); return p ? [{ o_name: p.name }] : []; },
  player_profile: (a) => {
    const p = players.get(a.p_device); if (!p) return { exists: false };
    const b = board(a.p_season), me = b.find((x) => x.device === a.p_device);
    return { exists: true, name: p.name, can_change: !p.chg || kst(p.chg) < kst(a.p_now), season_best: me?.score ?? null, season_rank: me?.rank ?? null, season_total: b.length, plays: p.plays, mine: [] };
  },
  submit_score_season: (a) => {
    const p = players.get(a.p_device_id); if (!p) return [{ o_status: "no_player" }];
    const before = board(a.p_season).find((x) => x.device === a.p_device_id);
    const day = scores.find((x) => x.device === a.p_device_id && x.seed === a.p_seed);
    let saved = false;
    if (!day) { scores.push({ season: a.p_season, device: a.p_device_id, score: a.p_score, seed: a.p_seed, at: ++tick }); saved = true; }
    else if (day.score < a.p_score) { day.score = a.p_score; day.at = ++tick; saved = true; }
    p.plays++;
    const after = board(a.p_season), me = after.find((x) => x.device === a.p_device_id);
    return [{ o_status: "ok", o_saved: saved, o_best: scores.find((x) => x.device === a.p_device_id && x.seed === a.p_seed).score, o_name: p.name,
      o_prev_best: before?.score ?? null, o_season_best: me.score, o_rank_before: before?.rank ?? null, o_rank_after: me.rank,
      o_next_score: me.rank > 1 ? after[me.rank - 2].score : null, o_top_score: after[0].score, o_total: after.length }];
  },
};
globalThis.Deno = { env: { get: (k) => ({ SUPABASE_URL: "http://x", SUPABASE_SERVICE_ROLE_KEY: "svc" })[k] }, serve: (h) => (handler = h) };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith("http://x/rest/v1/rpc/")) { const fn = String(url).split("/").pop(), args = JSON.parse(init.body); rpcCalls.push([fn, args]);
    return new Response(JSON.stringify(rpcImpl[fn](args)), { status: 200 }); }
  if (String(url) === "http://x/auth/v1/user") { // Supabase Auth 모킹: 토큰 "a.b.c" 형태, 끝 글자로 사용자 구분
    const tok = String(init.headers.Authorization || "").replace(/^Bearer /, ""), id = USERS[tok];
    return id ? new Response(JSON.stringify({ id, user_metadata: { name: "카톡닉" } }), { status: 200 }) : new Response("{}", { status: 401 });
  }
  return realFetch(url, init);
};
const USERS = { "h.u1.s": "a0000000-0000-4000-8000-000000000001", "h.u2.s": "a0000000-0000-4000-8000-000000000002" };
const setNow = (kstDay, hh = 12) => { globalThis.__NOW__ = Date.parse(`${kstDay}T${String(hh).padStart(2, "0")}:00:00+09:00`); };
setNow("2026-10-27");
await import(pathToFileURL(path.join(root, "supabase/functions/submit-score/index.ts")).href);
const { replay, ENGINE_VER } = await import(pathToFileURL(path.join(root, "supabase/functions/submit-score/replay.js")).href);
const { seasonPhase, checkName } = await import(pathToFileURL(path.join(root, "supabase/functions/submit-score/engine.js")).href);

const seedOf = (day) => +day.replace(/-/g, "");
const seed = seedOf("2026-10-27");
const inputs = [[0, "draw", 0], [0, "draw", 0], [0, "draw", 0]];
const v = replay(seed, inputs).result;
const dev = "123e4567-e89b-12d3-a456-426614174000", dev2 = "223e4567-e89b-12d3-a456-426614174000", dev3 = "323e4567-e89b-12d3-a456-426614174000";
const base = { action: "submit", mode: "daily", seed, ver: ENGINE_VER, inputs, claimedScore: v.score, claimedRound: v.round, win: v.win, device_id: dev };
const call = async (o) => { const r = await handler(new Request("http://f/", { method: "POST", body: JSON.stringify(o) })); const j = await r.json(); return [r.status, j.error || "ok", j]; };
const post = async (o) => (await call(o)).slice(0, 2);
let fail = 0, pass = 0; const t = (n, got, want) => { const ok = got[0] === want[0] && got[1] === want[1]; ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", n, got.join(" ")); };
const tb = (n, ok) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", n); };

// ---- 시즌 정의 / 닉네임 규칙 (data.js 단일 출처가 engine.js 로 들어왔는지) ----
tb("시즌 정의: 10/27 live, 11/15 live, 10/26 before, 11/16 after",
  seasonPhase("2026-10-27").phase === "live" && seasonPhase("2026-11-15").phase === "live" && seasonPhase("2026-10-26").phase === "before" && seasonPhase("2026-11-16").phase === "after");
tb("닉네임 규칙: 길이/문자/금칙/공백정리", !checkName("a").ok && !checkName("가".repeat(11)).ok && !checkName("a<b>").ok && !checkName("씨 발").ok && checkName("  말랑  이 ").name === "말랑 이");

// ---- 닉네임 등록 ----
t("등록 전 제출은 거부(no_player)", await post(base), [409, "no_player"]);
t("등록: 정상", await post({ action: "register", device_id: dev, name: "  테스터  " }), [200, "ok"]);
t("등록: 같은 기기 재등록은 기존 이름 반환", (await call({ action: "register", device_id: dev, name: "다른이름" })).slice(0, 2), [200, "ok"]);
t("등록: 중복(대소문자 무시)", await post({ action: "register", device_id: dev2, name: "TESTER" }), [200, "ok"]); // 한글 테스터와는 다름
t("등록: 중복(대소문자 무시) 거부", await post({ action: "register", device_id: dev3, name: "tester" }), [409, "name_taken"]);
t("등록: 한 글자", await post({ action: "register", device_id: dev3, name: "가" }), [400, "bad_name_len"]);
t("등록: 허용 안 되는 문자", await post({ action: "register", device_id: dev3, name: "a<b>c" }), [400, "bad_name_chars"]);
t("등록: 금칙어", await post({ action: "register", device_id: dev3, name: "씨 발" }), [400, "bad_name"]);
t("등록: 형식 오류 device", await post({ action: "register", device_id: "abc", name: "가나다" }), [400, "bad_device"]);

// ---- 변경 1일 1회 (KST 날짜) ----
t("변경: 첫 변경 허용", await post({ action: "rename", device_id: dev, name: "새이름" }), [200, "ok"]);
const cd = await call({ action: "rename", device_id: dev, name: "또바꿈" });
t("변경: 같은 날 두 번째는 쿨다운", cd.slice(0, 2), [429, "rename_cooldown"]);
tb("변경: 다음 가능 시각이 다음날 KST 자정", cd[2].next_change_at === "2026-10-27T15:00:00.000Z");
t("변경: 중복 이름", await post({ action: "rename", device_id: dev2, name: "새이름" }), [409, "name_taken"]);
setNow("2026-10-28", 0); // KST 자정 직후
t("변경: 다음날(KST 00시) 다시 허용", await post({ action: "rename", device_id: dev, name: "테스터" }), [200, "ok"]);
setNow("2026-10-27");

// ---- 이전 코드 / 프로필 ----
t("이전 코드: 존재", await post({ action: "import", device_id: dev3, code: dev }), [200, "ok"]);
t("이전 코드: 없는 코드", await post({ action: "import", device_id: dev3, code: "923e4567-e89b-12d3-a456-426614174000" }), [404, "no_such_code"]);
t("이전 코드: 형식 오류", await post({ action: "import", device_id: dev3, code: "abc" }), [400, "bad_code"]);
const pf = await call({ action: "profile", device_id: dev });
t("프로필", pf.slice(0, 2), [200, "ok"]);
tb("프로필: 시즌 정보 포함, device_id 미노출", pf[2].season?.id === 1 && pf[2].profile.name === "테스터" && !JSON.stringify(pf[2]).includes(dev));

// ---- 점수 제출 ----
const r1 = await call(base);
t("정상", r1.slice(0, 2), [200, "ok"]);
tb("정상: 응답에 시즌/순위/닉네임(서버 값)", r1[2].season?.id === 1 && r1[2].rank_after === 1 && r1[2].name === "테스터" && r1[2].rank_before === null);
t("점수 부풀리기", await post({ ...base, claimedScore: v.score + 1 }), [422, "score_mismatch"]);
t("로그 변조(미네랄 부족한 draw 추가)", await post({ ...base, inputs: [...inputs, [0, "draw", 0]] }), [422, "replay_failed"]);
t("재현불가 입력(sell 빈 슬롯)", await post({ ...base, inputs: [[0, "sell", 5]] }), [422, "replay_failed"]);
t("연습 모드", await post({ ...base, mode: "practice" }), [400, "practice_not_ranked"]);
t("ver 불일치", await post({ ...base, ver: "0" }), [409, "ver_mismatch"]);
t("범위 밖 seed", await post({ ...base, seed: 0 }), [400, "bad_seed"]);
t("device 형식", await post({ ...base, device_id: "abc" }), [400, "bad_device"]);
t("op 오류", await post({ ...base, inputs: [[0, "x", 0]] }), [400, "bad_inputs"]);
t("잘못된 action", await post({ ...base, action: "hack" }), [400, "bad_action"]);
t("클라이언트가 보낸 name/season 은 무시(저장은 서버 닉네임)", await post({ ...base, name: "해커", season: 99 }), [200, "ok"]);
tb("저장된 이름은 players 의 닉네임", rpcCalls.filter((c) => c[0] === "submit_score_season").every((c) => !("p_name" in c[1])) && scores.every((s) => s.season === 1));

// ---- 시즌 밖 거부 ----
setNow("2026-10-26");
t("시즌 시작 전 제출 거부", await post({ ...base, seed: seedOf("2026-10-26") }), [403, "season_not_started"]);
setNow("2026-11-16");
t("시즌 종료 후 제출 거부", await post({ ...base, seed: seedOf("2026-11-16") }), [403, "season_closed"]);
const pAfter = await call({ action: "profile", device_id: dev });
tb("시즌 종료 후 프로필은 phase=after", pAfter[2].phase === "after");
setNow("2026-11-15", 23); // 마지막 날(양끝 포함)
t("시즌 마지막 날은 허용", await (async () => { const sd = seedOf("2026-11-15"), r2 = replay(sd, inputs).result; return post({ ...base, seed: sd, claimedScore: r2.score, claimedRound: r2.round, win: r2.win }); })(), [200, "ok"]);

// ---- 시즌 최고점만 반영 + 순위 ----
setNow("2026-10-27");
// 날짜(seed)마다 판이 달라지므로 각 날짜의 서버 재생 결과를 직접 계산해서 기대값을 만든다.
const alt = [[0, "draw", 0]];
const dB = "423e4567-e89b-12d3-a456-426614174000";
await post({ action: "register", device_id: dB, name: "라이벌" });
const mk = (device, inp, s) => { const vv = replay(s, inp).result; return [{ action: "submit", mode: "daily", seed: s, ver: ENGINE_VER, inputs: inp, claimedScore: vv.score, claimedRound: vv.round, win: vv.win, device_id: device }, vv]; };
const days = [["2026-10-27", alt], ["2026-10-28", inputs], ["2026-10-29", alt]];
let runBest = 0, okBest = true, okPrev = true, rankOk = true;
for (const [d, inp] of days) {
  setNow(d); const [req, vv] = mk(dB, inp, seedOf(d)), res = await call(req);
  const prev = runBest || null; runBest = Math.max(runBest, vv.score);
  if (res[2].season_best !== runBest) okBest = false;
  if (res[2].prev_best !== prev) okPrev = false;
  if (typeof res[2].rank_after !== "number" || res[2].total < 2) rankOk = false;
}
tb("시즌 최고점만 반영(날짜별 판 중 최고, 낮은 판은 낮추지 않음)", okBest);
tb("직전 시즌 최고점(prev_best) 반환", okPrev);
tb("순위/총 인원 반환", rankOk);
setNow("2026-10-27");
const nBoard = board(1).filter((x) => x.device === dB).length;
tb("시즌 랭킹에는 플레이어당 1건", nBoard === 1);

// ---- 카카오 계정 연결 (me / link) ----
const callA = async (o, tok) => { const r = await handler(new Request("http://f/", { method: "POST", headers: tok ? { authorization: "Bearer " + tok } : {}, body: JSON.stringify(o) })); const j = await r.json(); return [r.status, j.error || "ok", j]; };
const LA = "523e4567-e89b-12d3-a456-426614174000", LB = "623e4567-e89b-12d3-a456-426614174000", LC = "723e4567-e89b-12d3-a456-426614174000";
await post({ action: "register", device_id: LA, name: "연결갑" }); await post({ action: "register", device_id: LB, name: "연결을" }); await post({ action: "register", device_id: LC, name: "연결병" });
t("link: JWT 없음 -> 401", (await callA({ action: "link", device_id: LA }, null)).slice(0, 2), [401, "unauthorized"]);
t("link: 잘못된 JWT -> 401", (await callA({ action: "link", device_id: LA }, "bad.tok.en")).slice(0, 2), [401, "unauthorized"]);
t("link: JWT 형식 아님 -> 401", (await callA({ action: "link", device_id: LA }, "nodots")).slice(0, 2), [401, "unauthorized"]);
t("me: JWT 없음 -> 401", (await callA({ action: "me", device_id: LA }, null)).slice(0, 2), [401, "unauthorized"]);
t("me: 연결 전 -> account_player null", [(await callA({ action: "me", device_id: LA }, "h.u1.s"))[2].account_player], [null]);
{ const r = await callA({ action: "link", device_id: LA }, "h.u1.s"); tb("link: 정상 연결", r[0] === 200 && r[2].linked === true && r[2].account_player.device_id === LA); }
{ const r = await callA({ action: "link", device_id: LA }, "h.u1.s"); tb("link: 같은 계정에 다시 -> 멱등(linked false)", r[0] === 200 && r[2].linked === false && r[2].account_player.device_id === LA); }
t("link: 이미 다른 계정에 연결된 기기 -> 409", (await callA({ action: "link", device_id: LA }, "h.u2.s")).slice(0, 2), [409, "device_linked_other"]);
{ const r = await callA({ action: "link", device_id: LB }, "h.u1.s"); tb("link: 계정에 이미 player 있음 -> 기존 player 반환(병합 안 함)", r[0] === 200 && r[2].linked === false && r[2].account_player.device_id === LA && players.get(LB).user === undefined); }
{ const r = await callA({ action: "me", device_id: LB }, "h.u1.s"); tb("me: 새 기기에서 계정 player 조회", r[0] === 200 && r[2].account_player.device_id === LA && r[2].account_player.name === "연결갑"); }
t("link: player 없는 기기 -> 404", (await callA({ action: "link", device_id: "823e4567-e89b-12d3-a456-426614174000" }, "h.u2.s")).slice(0, 2), [404, "no_player"]);
tb("link: 익명 submit 은 계속 허용(JWT 불필요)", (await call({ ...base, device_id: LC })) [0] !== 401);
tb("link: 카카오 닉네임 저장 호출", rpcCalls.some((c) => c[0] === "player_link" && c[1].p_nick === "카톡닉"));

rateOk = false; t("rate limit", await post(base), [429, "rate_limited"]);
t("rate limit(닉네임)", await post({ action: "register", device_id: dev3, name: "가나다" }), [429, "rate_limited"]); rateOk = true;
tb("rate limit 종류 구분(kind)", rpcCalls.some((c) => c[0] === "rate_limit_hit" && c[1].p_kind === "name") && rpcCalls.some((c) => c[0] === "rate_limit_hit" && c[1].p_kind === "submit"));
const o = await handler(new Request("http://f/", { method: "OPTIONS" })); t("CORS preflight", [o.status, o.headers.get("access-control-allow-origin")], [204, "*"]);
const big = await handler(new Request("http://f/", { method: "POST", body: "x".repeat(400000) })); t("요청 크기", [big.status, "x"], [413, "x"]);
console.log("PASS", pass, "FAIL", fail);
process.exit(fail ? 1 : 0);
