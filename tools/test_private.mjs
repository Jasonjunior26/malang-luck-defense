// 프라이빗 시즌 핸들러 테스트 (메모리 가짜 DB, Deno/fetch 모킹): node tools/test_private.mjs
// RPC 의 SQL 규칙(supabase/migrations/004_private_seasons.sql)을 같은 의미로 흉내낸다. 실제 SQL 은 Supabase 에서 실행해 확인한다.
// 엔진(validateRules/rulesHash/replay)은 engine.js/replay.js 의 실물을 쓴다. index.ts 위임(ps* -> handlePrivate)도 확인.
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const U = (n) => `${n}0000000-0000-4000-8000-000000000000`;
const [u1, u2, u3, u4] = [1, 2, 3, 4].map(U);
let handler, rateOk = true;

// ---- 가짜 DB ----
const seasons = [], members = [], scores = []; const names = { [u1]: "호스트", [u2]: "둘째", [u3]: "셋째", [u4]: "넷째" };
let clock = 0, nid = 0; const kst = (iso) => new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(0, 10);
const live = (s, today) => s.status === "active" && !s.ended && s.end >= today;
const cnt = (u, today) => ({ joined: members.filter((m) => m.player === u && !m.kicked && live(seasons.find((s) => s.id === m.season), today)).length, hosted: seasons.filter((s) => s.owner === u && live(s, today)).length });
const sj = (s, u) => ({ id: s.id, name: s.name, start: s.start, end: s.end, rules: s.rules, rules_hash: s.hash, max_players: s.max, daily_run_limit: s.daily, status: s.status, ended: s.ended,
  is_owner: s.owner === u, invite_code: s.owner === u ? s.code : null, member_count: members.filter((m) => m.season === s.id && !m.kicked).length, is_member: members.some((m) => m.season === s.id && m.player === u && !m.kicked) });
const bestRows = (sid) => { const best = new Map();
  for (const x of scores.filter((x) => x.season === sid && members.some((m) => m.season === sid && m.player === x.player && !m.kicked))) {
    const o = best.get(x.player); if (!o || x.score > o.score || (x.score === o.score && (x.round > o.round || (x.round === o.round && x.at < o.at)))) best.set(x.player, x); }
  return [...best.values()].sort((a, b) => b.score - a.score || b.round - a.round || a.at - b.at).map((x, i) => ({ ...x, rank: i + 1 })); };
const rpcImpl = {
  rate_limit_hit: () => rateOk,
  ps_display_name: (a) => names[a.p_user] ?? null,
  private_season_create: (a) => { const c = cnt(a.p_owner, a.p_today); if (c.hosted >= 2) return { status: "host_limit" }; if (c.joined >= 3) return { status: "join_limit" };
    const s = { id: `${++nid}`.padStart(8, "0") + "-0000-4000-8000-000000000000", owner: a.p_owner, name: a.p_name, start: a.p_start, end: a.p_end, rules: a.p_rules, hash: a.p_hash, code: "ABCD" + String(1000 + nid), max: a.p_max, daily: a.p_daily, status: "active", ended: false };
    seasons.push(s); members.push({ season: s.id, player: a.p_owner, name: a.p_owner_name, kicked: false, at: ++clock }); return { status: "ok", season: sj(s, a.p_owner) }; },
  private_season_join: (a) => { const s = seasons.find((x) => x.code === a.p_code.toUpperCase()); if (!s) return { status: "no_such_season" };
    if (s.status === "cancelled") return { status: "cancelled" }; if (s.ended || s.end < a.p_today) return { status: "season_over" };
    const m = members.find((x) => x.season === s.id && x.player === a.p_user); if (m?.kicked) return { status: "kicked" }; if (m) return { status: "already", season: sj(s, a.p_user) };
    if (members.filter((x) => x.season === s.id && !x.kicked).length >= s.max) return { status: "full" };
    if (cnt(a.p_user, a.p_today).joined >= 3) return { status: "join_limit" };
    members.push({ season: s.id, player: a.p_user, name: a.p_name, kicked: false, at: ++clock }); return { status: "ok", season: sj(s, a.p_user) }; },
  private_season_get: (a) => { const s = seasons.find((x) => (a.p_id ? x.id === a.p_id : x.code === a.p_code.toUpperCase())); if (!s) return { status: "no_such_season" };
    const used = scores.filter((x) => x.season === s.id && x.player === a.p_user && kst(x.playedAt) === a.p_today).length;
    return { status: "ok", season: { ...sj(s, a.p_user), runs_today: used } }; },
  private_season_list_mine: (a) => seasons.filter((s) => members.some((m) => m.season === s.id && m.player === a.p_user && !m.kicked)).map((s) => sj(s, a.p_user)),
  private_season_leaderboard: (a) => { if (!members.some((m) => m.season === a.p_id && m.player === a.p_user && !m.kicked)) return { status: "not_member" };
    const rows = bestRows(a.p_id).map((x) => ({ rank: x.rank, name: members.find((m) => m.season === a.p_id && m.player === x.player).name, score: x.score, round: x.round, me: x.player === a.p_user })); return { status: "ok", rows, total: rows.length }; },
  private_season_kick: (a) => { const s = seasons.find((x) => x.id === a.p_id); if (!s) return { status: "no_such_season" }; if (s.owner !== a.p_owner) return { status: "not_owner" };
    if (a.p_target === a.p_owner) return { status: "cannot_kick_self" }; const m = members.find((x) => x.season === s.id && x.player === a.p_target && !x.kicked); if (!m) return { status: "no_such_member" }; m.kicked = true; return { status: "ok" }; },
  private_season_cancel: (a) => { const s = seasons.find((x) => x.id === a.p_id); if (!s) return { status: "no_such_season" }; if (s.owner !== a.p_owner) return { status: "not_owner" };
    if (s.status === "cancelled" || s.ended || s.end < a.p_today) return { status: "already" };
    if (a.p_today < s.start) { s.status = "cancelled"; return { status: "ok", result: "cancelled" }; } s.ended = true; return { status: "ok", result: "ended" }; },
  submit_score_private: (a) => { const s = seasons.find((x) => x.id === a.p_season); const m = members.find((x) => x.season === a.p_season && x.player === a.p_user);
    if (!m || m.kicked) return { status: "not_member" }; if (s.status === "cancelled") return { status: "cancelled" }; if (a.p_today < s.start) return { status: "not_started" };
    const endMs = Date.parse(s.end + "T00:00:00+09:00") + 86400e3 + 600e3; if (s.ended || Date.parse(a.p_now) > endMs) return { status: "season_over" };
    if (s.daily != null && scores.filter((x) => x.season === s.id && x.player === a.p_user && kst(x.playedAt) === a.p_today).length >= s.daily) return { status: "daily_limit", limit: s.daily };
    if (scores.some((x) => x.player === a.p_user && x.seed === a.p_seed)) return { status: "duplicate" };
    const before = bestRows(s.id).find((x) => x.player === a.p_user); scores.push({ season: s.id, player: a.p_user, score: a.p_score, round: a.p_round, seed: a.p_seed, at: ++clock, playedAt: a.p_now });
    m.name = a.p_name; const rows = bestRows(s.id), me = rows.find((x) => x.player === a.p_user);
    return { status: "ok", saved: true, season_best: me.score, prev_best: before?.score ?? null, rank_before: before?.rank ?? null, rank_after: me.rank, total: rows.length }; },
};
const calls = [];
globalThis.Deno = { env: { get: (k) => ({ SUPABASE_URL: "http://x", SUPABASE_SERVICE_ROLE_KEY: "svc" })[k] }, serve: (h) => (handler = h) };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith("http://x/rest/v1/rpc/")) { const fn = String(url).split("/").pop(), args = JSON.parse(init.body); calls.push(fn); return new Response(JSON.stringify(rpcImpl[fn](args)), { status: 200 }); }
  if (String(url) === "http://x/auth/v1/user") { const t = init.headers.Authorization.slice(7); return Object.values({ u1, u2, u3, u4 }).includes(t) ? new Response(JSON.stringify({ id: t }), { status: 200 }) : new Response("{}", { status: 401 }); }
  return realFetch(url, init);
};
const setNow = (day, hh = 12) => { globalThis.__NOW__ = Date.parse(`${day}T${String(hh).padStart(2, "0")}:00:00+09:00`); };
setNow("2026-11-01");
await import(pathToFileURL(path.join(root, "supabase/functions/submit-score/index.ts")).href);
const { replay, ENGINE_VER } = await import(pathToFileURL(path.join(root, "supabase/functions/submit-score/replay.js")).href);
const ENG = await import(pathToFileURL(path.join(root, "supabase/functions/submit-score/engine.js")).href);
if (!ENG.validateRules || !ENG.rulesHash) { console.log("FAIL engine.js 에 validateRules/rulesHash 없음 (node tools/build_engine.js 필요)"); process.exit(1); }

let pass = 0, fail = 0;
const t = (n, got, want) => { const ok = got[0] === want[0] && got[1] === want[1]; ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : got.join(" ") + " (want " + want.join(" ") + ")"); };
const tb = (n, ok) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", n); };
const call = async (user, o) => { const h = { "content-type": "application/json" }; if (user) h.authorization = "Bearer " + user;
  const r = await handler(new Request("http://f/", { method: "POST", headers: h, body: JSON.stringify(o) })); const j = await r.json(); return [r.status, j.error || "ok", j]; };
const post = async (u, o) => (await call(u, o)).slice(0, 2);

const rules = { rounds: 50, hpMul: 1.2 };
const mk = (o = {}) => ({ action: "psCreate", name: "친구방", start: "2026-11-01", end: "2026-11-10", rules, ...o });
const log = [[0, "draw", 0], [0, "draw", 0], [0, "draw", 0]];
const run = (seed) => { const v = replay({ seed, log, rules }); if (!v.ok) throw new Error(v.error); return v.result; };
const sub = (id, seed, over = {}) => { const r = run(seed); return { action: "psSubmit", id, seed, ver: ENGINE_VER, log, claimedScore: r.score, claimedRound: r.round, win: r.win, ...over }; };

// ---- 생성 ----
tb("인증 없으면 401", (await post(null, mk()))[0] === 401);
t("가짜 토큰 401", await post("bad", mk()), [401, "login_required"]);
const c1 = await call(u1, mk()); t("생성 정상", c1.slice(0, 2), [200, "ok"]);
const S1 = c1[2].season; tb("초대코드 8자 + 호스트만 보임 + rules_hash", /^[A-Za-z0-9]{8}$/.test(S1.invite_code) && S1.is_owner && S1.rules_hash === ENG.rulesHash(S1.rules) && S1.max_players === 10 && S1.daily_run_limit === null);
t("규칙 거부(범위)", await post(u1, mk({ rules: { rounds: 500 } })), [400, "bad_rules"]);
t("규칙 거부(모디파이어 4개)", await post(u1, mk({ rules: { rounds: 50, hpMul: 1.1, mobSpeed: 1.1, mobCount: 1.1, drawCost: 12 } })), [400, "bad_rules"]);
t("이름 금칙어", await post(u1, mk({ name: "씨발방" })), [400, "bad_name"]);
t("이름 길이", await post(u1, mk({ name: "a" })), [400, "bad_name_len"]);
t("기간 61일 거부", await post(u1, mk({ end: "2026-12-31" })), [400, "too_long"]);
tb("기간 60일 허용", (await post(u1, mk({ name: "육십일", end: "2026-12-30" })))[0] === 200);
t("과거 시작일", await post(u2, mk({ start: "2026-10-01" })), [400, "start_in_past"]);
t("인원 31", await post(u2, mk({ maxPlayers: 31 })), [400, "bad_max_players"]);
t("판수 4 불허", await post(u2, mk({ dailyRunLimit: 4 })), [400, "bad_daily_limit"]);
t("호스트 한도(3번째)", await post(u1, mk({ name: "셋째방" })), [409, "host_limit"]);
t("rate limit 429", (rateOk = false, await post(u2, mk())), [429, "rate_limited"]); rateOk = true;
const g = await call(u2, mk({ name: "제한방", maxPlayers: 2, dailyRunLimit: 3 })); const S2 = g[2].season; tb("인원2/판수3 생성", g[0] === 200 && S2.max_players === 2 && S2.daily_run_limit === 3);

// ---- 가입 ----
t("가입 정상", await post(u2, { action: "psJoin", code: S1.invite_code }), [200, "ok"]);
tb("중복 가입은 already", (await call(u2, { action: "psJoin", code: S1.invite_code }))[2].already === true);
t("코드 형식 오류", await post(u3, { action: "psJoin", code: "x" }), [400, "bad_code"]);
t("없는 코드", await post(u3, { action: "psJoin", code: "ZZZZZZZZ" }), [404, "no_such_season"]);
t("정원 초과(2명 방)", (await post(u3, { action: "psJoin", code: S2.invite_code }), await post(u4, { action: "psJoin", code: S2.invite_code })), [409, "season_full"]);
const pv = await call(u4, { action: "psGet", code: S1.invite_code }); tb("초대 미리보기(비멤버, 코드 숨김)", pv[0] === 200 && !pv[2].season.is_member && pv[2].season.invite_code === null);
const tmp = (await call(u3, mk({ name: "취소될방", start: "2026-11-05", end: "2026-11-09" })))[2].season;
t("시작 전 취소", await post(u3, { action: "psCancel", id: tmp.id }), [200, "ok"]);
t("취소된 시즌 가입", await post(u4, { action: "psJoin", code: tmp.invite_code }), [410, "season_cancelled"]);
t("취소 재시도", await post(u3, { action: "psCancel", id: tmp.id }), [409, "already_done"]);
const old = (await call(u4, mk({ name: "지난방", start: "2026-11-01", end: "2026-11-02" })))[2].season; setNow("2026-11-03");
t("기간 후 가입", await post(u1, { action: "psJoin", code: old.invite_code }), [403, "season_closed"]); setNow("2026-11-01");

// ---- 제출 ----
const r0 = run(111);
const s1 = await call(u1, sub(S1.id, 111)); t("제출 정상", s1.slice(0, 2), [200, "ok"]); tb("응답: 점수/순위", s1[2].score === r0.score && s1[2].rank_after === 1 && s1[2].total === 1);
t("점수 변조 거부", await post(u2, sub(S1.id, 112, { claimedScore: run(112).score + 1 })), [422, "score_mismatch"]);
t("라운드 변조 거부", await post(u2, sub(S1.id, 112, { claimedRound: run(112).round + 1 })), [422, "score_mismatch"]);
t("같은 판 중복 제출", await post(u1, sub(S1.id, 111)), [409, "duplicate_run"]);
t("비멤버 제출", await post(u3, sub(S1.id, 115)), [403, "not_member"]);
t("엔진 버전 불일치", await post(u1, sub(S1.id, 116, { ver: "0" })), [409, "ver_mismatch"]);
t("로그 형식 오류", await post(u1, sub(S1.id, 116, { log: [[0, "bogus", 0]] })), [400, "bad_inputs"]);
setNow("2026-10-31"); t("시작 전 제출", await post(u2, sub(S2.id, 117)), [403, "season_not_started"]);
// 시즌2 는 11/01~11/10, 판수 3
setNow("2026-11-01");
for (let i = 0; i < 3; i++) t(`판수 제한 ${i + 1}/3`, await post(u2, sub(S2.id, 200 + i)), [200, "ok"]);
t("판수 제한 초과", await post(u2, sub(S2.id, 203)), [429, "daily_limit"]);
setNow("2026-11-02"); t("다음 날 판수 리셋(KST)", await post(u2, sub(S2.id, 203)), [200, "ok"]);
setNow("2026-11-10", 23); t("마지막 날 제출 가능", await post(u1, sub(S1.id, 120)), [200, "ok"]);
globalThis.__NOW__ = Date.parse("2026-11-11T00:05:00+09:00"); t("종료 +5분 유예 내 제출", await post(u1, sub(S1.id, 121)), [200, "ok"]);
globalThis.__NOW__ = Date.parse("2026-11-11T00:11:00+09:00"); t("종료 +11분 거부", await post(u1, sub(S1.id, 122)), [403, "season_closed"]);
setNow("2026-11-05");

// ---- 순위 ----
// 동점: u2 가 같은 시드로 u1 과 같은 점수를 낸다(먼저 낸 u1 이 위). u1 은 이미 111 로 냄.
await post(u2, sub(S1.id, 111));
let bd = (await call(u1, { action: "psBoard", id: S1.id }))[2];
tb("동점이면 먼저 달성한 쪽이 위", bd.rows[0].name === "호스트" && bd.rows[1].name === "둘째" && bd.rows[0].score === bd.rows[1].score);
tb("플레이어당 최고점 1건", bd.rows.filter((r) => r.name === "호스트").length === 1);
// 라운드 동점 규칙: 같은 점수에서 도달 라운드가 높은 쪽이 위(가짜 DB 직접 삽입)
const S3 = (await call(u4, mk({ name: "라운드방", start: "2026-11-05" })))[2].season; await post(u3, { action: "psJoin", code: S3.invite_code });
scores.push({ season: S3.id, player: u3, score: 500, round: 20, seed: 9001, at: 1, playedAt: "2026-11-05T00:00:00Z" }, { season: S3.id, player: u4, score: 500, round: 30, seed: 9002, at: 2, playedAt: "2026-11-05T00:00:00Z" });
bd = (await call(u3, { action: "psBoard", id: S3.id }))[2]; tb("동점이면 도달 라운드 높은 쪽이 위", bd.rows[0].name === "넷째" && bd.rows[1].name === "셋째");
t("비멤버 순위 열람 거부", await post(u3, { action: "psBoard", id: S1.id }), [403, "not_member"]);
const ls = (await call(u2, { action: "psList" }))[2]; tb("내 시즌 목록", ls.seasons.length === 2 && ls.seasons.every((s) => s.is_member));

// ---- 킥 / 취소(시작 후) ----
t("비호스트 킥 거부", await post(u2, { action: "psKick", id: S1.id, target: u1 }), [403, "not_owner"]);
t("자기 킥 거부", await post(u1, { action: "psKick", id: S1.id, target: u1 }), [400, "cannot_kick_self"]);
t("킥 정상", await post(u1, { action: "psKick", id: S1.id, target: u2 }), [200, "ok"]);
bd = (await call(u1, { action: "psBoard", id: S1.id }))[2]; tb("킥된 유저 순위 제외", bd.rows.length === 1 && bd.rows[0].name === "호스트");
t("킥된 유저 제출 거부", await post(u2, sub(S1.id, 130)), [403, "not_member"]);
t("킥된 유저 재입장 차단", await post(u2, { action: "psJoin", code: S1.invite_code }), [403, "kicked"]);
t("없는 멤버 킥", await post(u1, { action: "psKick", id: S1.id, target: u4 }), [404, "no_such_member"]);
t("비호스트 취소 거부", await post(u3, { action: "psCancel", id: S1.id }), [403, "not_owner"]);
const cc = await call(u1, { action: "psCancel", id: S1.id }); tb("시작 후 취소 = 조기 종료", cc[0] === 200 && cc[2].result === "ended");
t("종료 후 제출 거부", await post(u1, sub(S1.id, 131)), [403, "season_closed"]);
tb("종료 후 순위는 열람 가능", (await call(u1, { action: "psBoard", id: S1.id }))[0] === 200);
tb("조기 종료 시즌 목록에 유지", (await call(u1, { action: "psList" }))[2].seasons.some((s) => s.id === S1.id && s.ended));

// ---- 참가 한도 / 위임 ----
const ex = (await call(u4, mk({ name: "가방시즌", start: "2026-11-05", maxPlayers: 5 })))[2].season, ex2 = (await call(u1, mk({ name: "다방시즌", start: "2026-11-05", maxPlayers: 5 })))[2].season;
t("참가 3번째 허용", await post(u3, { action: "psJoin", code: ex.invite_code }), [200, "ok"]);
t("참가 한도 3개 초과", await post(u3, { action: "psJoin", code: ex2.invite_code }), [409, "join_limit"]);

// ---- index.ts 위임 / 비ps 액션 불변 ----
tb("ps 액션은 device_id 없이 index 에서 위임됨", (await post(u1, { action: "psList" }))[0] === 200);
const r404 = await post(u1, { action: "psNope" }); t("알 수 없는 ps 액션", r404, [400, "bad_action"]);
tb("기존 액션은 여전히 device_id 요구", (await post(u1, { action: "profile" }))[1] === "bad_device");

console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
