// 친구 핸들러 테스트 (메모리 가짜 DB, Deno/fetch 모킹): node tools/test_friends.mjs
// RPC 의 SQL 규칙(supabase/migrations/005_friends.sql)을 같은 의미로 흉내낸다. 실제 SQL 은 Supabase 에서 실행해 확인한다.
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const U = (n) => `${n}0000000-0000-4000-8000-000000000000`;
const [u1, u2, u3, u4, u5] = [1, 2, 3, 4, 5].map(U); // u5 = player 없는 로그인 유저
let handler, rateOk = true, rateKinds = [];

// ---- 가짜 DB ----
const players = [
  { user: u1, name: "하나", code: "AAAA" }, { user: u2, name: "둘이", code: "BBBB" },
  { user: u3, name: "셋이", code: "CCCC" }, { user: u4, name: "넷이", code: "DDDD" },
];
const rel = []; // {a,b,status,by}
const sb = { 1: { [u1]: { score: 900, round: 30 }, [u2]: { score: 1200, round: 33 }, [u3]: { score: 500, round: 20 } } };
const pl = (u) => players.find((p) => p.user === u), byCode = (c) => players.find((p) => p.code === c.toUpperCase());
const key = (x, y) => (x < y ? [x, y] : [y, x]);
const find = (x, y) => { const [a, b] = key(x, y); return rel.find((r) => r.a === a && r.b === b); };
const cnt = (u, st) => rel.filter((r) => (r.a === u || r.b === u) && r.status === st).length;
const fr = (p) => ({ name: p.name, code: p.code });
const rpcImpl = {
  rate_limit_hit: (a) => { rateKinds.push(a.p_kind); return rateOk; },
  friend_my_code: (a) => { const p = pl(a.p_user); return p ? { status: "ok", name: p.name, code: p.code } : { status: "no_player" }; },
  friend_request: (a) => { const me = pl(a.p_user); if (!me) return { status: "no_player" }; const t = byCode(a.p_code); if (!t) return { status: "no_such_code" };
    if (t.user === a.p_user) return { status: "self" }; const x = find(a.p_user, t.user);
    if (x) { if (x.status === "blocked") return x.by === a.p_user ? { status: "you_blocked" } : { status: "no_such_code" };
      if (x.status === "accepted") return { status: "already_friends" }; if (x.by === a.p_user) return { status: "already_requested" };
      x.status = "accepted"; return { status: "ok", result: "accepted", friend: fr(t) }; }
    if (cnt(a.p_user, "accepted") >= 100) return { status: "friend_limit" };
    if (rel.filter((r) => r.by === a.p_user && r.status === "pending").length >= 30) return { status: "request_limit" };
    const [A, B] = key(a.p_user, t.user); rel.push({ a: A, b: B, status: "pending", by: a.p_user }); return { status: "ok", result: "requested", friend: fr(t) }; },
  friend_accept: (a) => { const t = byCode(a.p_code); if (!t) return { status: "no_such_code" }; const x = find(a.p_user, t.user);
    if (!x || x.status !== "pending" || x.by !== t.user) return { status: "no_such_request" }; x.status = "accepted"; return { status: "ok", friend: fr(t) }; },
  friend_decline: (a) => { const t = byCode(a.p_code); if (!t) return { status: "no_such_code" }; const x = find(a.p_user, t.user);
    if (!x || x.status !== "pending") return { status: "no_such_request" }; rel.splice(rel.indexOf(x), 1); return { status: "ok" }; },
  friend_remove: (a) => { const t = byCode(a.p_code); if (!t) return { status: "no_such_code" }; const x = find(a.p_user, t.user);
    if (!x || !(x.status === "accepted" || (x.status === "blocked" && x.by === a.p_user))) return { status: "not_friends" }; rel.splice(rel.indexOf(x), 1); return { status: "ok" }; },
  friend_block: (a) => { if (!pl(a.p_user)) return { status: "no_player" }; const t = byCode(a.p_code); if (!t) return { status: "no_such_code" }; if (t.user === a.p_user) return { status: "self" };
    const x = find(a.p_user, t.user); if (x) { if (x.status !== "blocked") { x.status = "blocked"; x.by = a.p_user; } } else { const [A, B] = key(a.p_user, t.user); rel.push({ a: A, b: B, status: "blocked", by: a.p_user }); }
    return { status: "ok" }; },
  friend_list: (a) => { if (!pl(a.p_user)) return { status: "no_player" }; const mine = rel.filter((r) => r.a === a.p_user || r.b === a.p_user);
    const o = (r) => pl(r.a === a.p_user ? r.b : r.a);
    return { status: "ok", friends: mine.filter((r) => r.status === "accepted").map((r) => ({ ...fr(o(r)), best: 1, best_round: 2, last_played: null })),
      incoming: mine.filter((r) => r.status === "pending" && r.by !== a.p_user).map((r) => fr(o(r))), outgoing: mine.filter((r) => r.status === "pending" && r.by === a.p_user).map((r) => fr(o(r))),
      blocked: mine.filter((r) => r.status === "blocked" && r.by === a.p_user).map((r) => fr(o(r))) }; },
  friend_board: (a) => { if (!pl(a.p_user)) return { status: "no_player" };
    const ids = [a.p_user, ...rel.filter((r) => r.status === "accepted" && (r.a === a.p_user || r.b === a.p_user)).map((r) => (r.a === a.p_user ? r.b : r.a))];
    const rows = ids.map((u) => ({ name: pl(u).name, code: pl(u).code, me: u === a.p_user, score: sb[a.p_season]?.[u]?.score ?? null, round: sb[a.p_season]?.[u]?.round ?? null })).sort((x, y) => (y.score ?? -1) - (x.score ?? -1));
    let n = 0; rows.forEach((r) => (r.rank = r.score == null ? null : ++n)); return { status: "ok", season: a.p_season, rows }; },
};
globalThis.Deno = { env: { get: (k) => ({ SUPABASE_URL: "http://x", SUPABASE_SERVICE_ROLE_KEY: "svc" })[k] }, serve: (h) => (handler = h) };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith("http://x/rest/v1/rpc/")) { const fn = String(url).split("/").pop(); return new Response(JSON.stringify(rpcImpl[fn](JSON.parse(init.body))), { status: 200 }); }
  if (String(url) === "http://x/auth/v1/user") { const t = init.headers.Authorization.slice(7); return [u1, u2, u3, u4, u5].includes(t) ? new Response(JSON.stringify({ id: t }), { status: 200 }) : new Response("{}", { status: 401 }); }
  return realFetch(url, init);
};
globalThis.__NOW__ = Date.parse("2026-11-01T12:00:00+09:00");
await import(pathToFileURL(path.join(root, "supabase/functions/submit-score/index.ts")).href);

let pass = 0, fail = 0;
const t = (n, got, want) => { const ok = got[0] === want[0] && got[1] === want[1]; ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : got.join(" ") + " (want " + want.join(" ") + ")"); };
const tb = (n, ok) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", n); };
const call = async (user, o) => { const h = { "content-type": "application/json" }; if (user) h.authorization = "Bearer " + user;
  const r = await handler(new Request("http://f/", { method: "POST", headers: h, body: JSON.stringify(o) })); const j = await r.json(); return [r.status, j.error || "ok", j]; };
const post = async (u, o) => (await call(u, o)).slice(0, 2);
const list = async (u) => (await call(u, { action: "frList" }))[2];

// ---- 인증 / 입력 ----
tb("JWT 없으면 401", (await post(null, { action: "frList" }))[0] === 401);
t("가짜 토큰 401", await post("bad", { action: "frList" }), [401, "login_required"]);
t("알 수 없는 fr 액션", await post(u1, { action: "frNope" }), [400, "bad_action"]);
t("코드 형식 오류", await post(u1, { action: "frRequest", code: "x" }), [400, "bad_code"]);
t("혼동 글자(0/O) 코드 거부", await post(u1, { action: "frRequest", code: "A0OA" }), [400, "bad_code"]);
t("코드 누락", await post(u1, { action: "frRequest" }), [400, "bad_code"]);
t("존재하지 않는 코드", await post(u1, { action: "frRequest", code: "ZZZZ" }), [404, "no_such_code"]);
t("player 없는 계정", await post(u5, { action: "frRequest", code: "BBBB" }), [409, "no_player"]);
t("내 코드 조회", await post(u1, { action: "frMyCode" }), [200, "ok"]);
const mc = (await call(u1, { action: "frMyCode" }))[2]; tb("내 코드 응답(tag)", mc.code === "AAAA" && mc.tag === "하나#AAAA");
t("자기 자신 요청", await post(u1, { action: "frRequest", code: "AAAA" }), [400, "cannot_target_self"]);
t("자기 자신 차단", await post(u1, { action: "frBlock", code: "AAAA" }), [400, "cannot_target_self"]);

// ---- 정상 흐름 ----
const r1 = await call(u1, { action: "frRequest", code: "bbbb" }); t("요청(소문자 코드 허용)", r1.slice(0, 2), [200, "ok"]); tb("result=requested + friend", r1[2].result === "requested" && r1[2].friend.name === "둘이");
t("닉네임#코드 형식 허용", await post(u1, { action: "frRequest", code: "셋이#CCCC" }), [200, "ok"]);
t("중복 요청", await post(u1, { action: "frRequest", code: "BBBB" }), [409, "already_requested"]);
let l2 = await list(u2); tb("받은 요청 표시(상대), 보낸 요청 표시(나)", l2.incoming.length === 1 && l2.incoming[0].code === "AAAA" && (await list(u1)).outgoing.length === 2);
t("요청자가 직접 수락 불가", await post(u1, { action: "frAccept", code: "BBBB" }), [404, "no_such_request"]);
const ac = await call(u2, { action: "frAccept", code: "AAAA" }); t("수락", ac.slice(0, 2), [200, "ok"]); tb("수락 응답 friend", ac[2].friend.code === "AAAA");
tb("쌍방 친구", (await list(u1)).friends.some((f) => f.code === "BBBB") && (await list(u2)).friends.some((f) => f.code === "AAAA"));
t("이미 친구", await post(u2, { action: "frRequest", code: "AAAA" }), [409, "already_friends"]);
t("이미 친구인데 재수락", await post(u2, { action: "frAccept", code: "AAAA" }), [404, "no_such_request"]);
t("없는 요청 수락", await post(u4, { action: "frAccept", code: "AAAA" }), [404, "no_such_request"]);

// ---- 거절 / 취소 ----
t("거절", await post(u3, { action: "frDecline", code: "AAAA" }), [200, "ok"]); tb("거절 후 요청 사라짐", (await list(u3)).incoming.length === 0 && (await list(u1)).outgoing.length === 0);
t("거절 후 재요청 가능", await post(u1, { action: "frRequest", code: "CCCC" }), [200, "ok"]);
t("보낸 요청 취소(요청자가 decline)", await post(u1, { action: "frDecline", code: "CCCC" }), [200, "ok"]);
t("없는 요청 거절", await post(u1, { action: "frDecline", code: "CCCC" }), [404, "no_such_request"]);

// ---- 상호 요청 자동 수락 ----
await post(u3, { action: "frRequest", code: "DDDD" });
const au = await call(u4, { action: "frRequest", code: "CCCC" }); t("상호 요청 자동 수락", au.slice(0, 2), [200, "ok"]); tb("result=accepted", au[2].result === "accepted");
tb("자동 수락 후 쌍방 친구", (await list(u3)).friends.some((f) => f.code === "DDDD") && (await list(u4)).friends.some((f) => f.code === "CCCC"));

// ---- 삭제 / 차단 ----
t("친구 삭제", await post(u4, { action: "frRemove", code: "CCCC" }), [200, "ok"]); tb("삭제 후 쌍방 해제", (await list(u3)).friends.length === 0);
t("친구 아닌데 삭제", await post(u4, { action: "frRemove", code: "CCCC" }), [404, "not_friends"]);
t("차단", await post(u2, { action: "frBlock", code: "AAAA" }), [200, "ok"]); tb("차단하면 친구 해제 + 내 차단 목록", !(await list(u1)).friends.some((f) => f.code === "BBBB") && (await list(u2)).blocked[0]?.code === "AAAA");
t("차단당한 쪽 요청 거부(존재 숨김)", await post(u1, { action: "frRequest", code: "BBBB" }), [404, "no_such_code"]);
t("차단한 쪽이 요청하면 you_blocked", await post(u2, { action: "frRequest", code: "AAAA" }), [403, "you_blocked"]);
t("차단당한 쪽은 차단 목록에 안 보임", (await list(u1)).blocked.length === 0 ? [200, "ok"] : [0, "x"], [200, "ok"]);
t("차단 해제(remove)", await post(u2, { action: "frRemove", code: "AAAA" }), [200, "ok"]);
t("해제 후 요청 가능", await post(u1, { action: "frRequest", code: "BBBB" }), [200, "ok"]);
await post(u2, { action: "frAccept", code: "AAAA" });
t("관계 없는 상대 삭제", await post(u1, { action: "frRemove", code: "CCCC" }), [404, "not_friends"]);

// ---- 친구 랭킹 ----
const bd = (await call(u1, { action: "frBoard" }))[2]; tb("시즌 미지정 = 현재 시즌 1, 친구+나만", bd.season === 1 && bd.rows.length === 2 && bd.rows.every((r) => ["AAAA", "BBBB"].includes(r.code)));
tb("친구 안 순위(1200 > 900)", bd.rows[0].code === "BBBB" && bd.rows[0].rank === 1 && bd.rows[1].me === true && bd.rows[1].rank === 2);
t("시즌 값 오류", await post(u1, { action: "frBoard", season: "x" }), [400, "bad_season"]);
tb("시즌 지정 + 기록 없는 시즌은 score null", (await call(u1, { action: "frBoard", season: 2 }))[2].rows.every((r) => r.score === null));

// ---- 한도 / 레이트 리밋 ----
const AL = "ABCDEFGHJKMNPQRSTUVWXYZ23456789", bot = (i) => "QQQ" + AL[i];
for (let i = 0; i < 30; i++) players.push({ user: U(10 + i), name: "봇" + i, code: bot(i) });
let lim = 0; for (let i = 0; i < 30; i++) lim += (await call(u3, { action: "frRequest", code: bot(i) }))[0] === 200 ? 1 : 0;
tb("보낸 대기 요청 30개까지", lim === 30);
t("31번째 요청 거부", await post(u3, { action: "frRequest", code: "AAAA" }), [429, "request_limit"]);
rateKinds = []; rateOk = false;
t("rate limit 429(쓰기)", await post(u1, { action: "frRequest", code: "DDDD" }), [429, "rate_limited"]);
t("rate limit 429(읽기)", await post(u1, { action: "frList" }), [429, "rate_limited"]); rateOk = true;
tb("rate kind friend / friend_read", rateKinds[0] === "friend" && rateKinds[1] === "friend_read");

// ---- 위임 ----
tb("fr 액션은 device_id 없이 index 에서 위임됨", (await post(u1, { action: "frList" }))[0] === 200);
tb("기존 액션은 여전히 device_id 요구", (await post(u1, { action: "profile" }))[1] === "bad_device");

console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
