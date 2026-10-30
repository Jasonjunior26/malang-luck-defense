// 프라이빗 시즌 클라 순수 로직 점검 (DOM 없이): 초대 링크 생성/파싱, rules 조립/검증 사유, 만들기 입력 검증, 참가 미리보기 판정(가짜 api).
// 실행: node tools/test_seasons_ui.mjs
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ctx = vm.createContext({ console, URLSearchParams, Date, Math, JSON });
ctx.window = ctx; ctx.globalThis = ctx;
for (const f of ["data.js", "seasons.js"]) vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
const T = ctx.SeasonMod._t;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + " " + JSON.stringify(a) + " != " + JSON.stringify(b));

// 1. 초대 링크
eq(T.inviteUrl({ origin: "https://x.github.io", pathname: "/malrang/" }, "ABCD2345"), "https://x.github.io/malrang/?join=ABCD2345", "inviteUrl");
eq(T.parseJoin("?join=abcd2345"), "ABCD2345", "parse lower");
eq(T.parseJoin("?a=1&join=ABCD2345"), "ABCD2345", "parse mixed");
eq(T.parseJoin("?join=short"), null, "parse short");
eq(T.parseJoin("?join=ABCD234!"), null, "parse bad char");
eq(T.parseJoin(""), null, "parse empty");
eq(T.parseJoin("?rules={}"), null, "parse none");

// 2. 프리셋 6종 -> rules -> validateRules 통과, 칩
for (const p of T.PRESETS) {
  const st = T.presetState(p), R = T.buildRules(st), v = T.checkRules(R);
  ok(v.ok, "preset valid " + p.n + " " + JSON.stringify(v));
  ok(T.ruleChips(R).length > 0, "chips " + p.n);
}
eq(T.buildRules({ mods: {}, rounds: 50 }), {}, "default rules empty");
eq(T.buildRules({ mods: { noSell: true }, rounds: 200 }), { noSell: true, rounds: 200 }, "rounds 200");
eq(T.ruleChips({ rounds: 200 }), ["엔드리스"], "chip endless");
eq(T.ruleChips({ rounds: 100, hpMul: 0.9 }), ["100라운드", "체력 ×0.9"], "chip marathon");
eq(T.ruleChips({ noGrade: 1, startMin: 0, noSell: true }), ["커먼 제외", "판매 금지", "시작 💎0"], "chip bare");
ok(T.ruleChips({ clanBan: [1, 2], heroPool: ["buung"] }).length === 2, "chip clan+hero");

// 3. 검증 사유
const bad = (R) => T.checkRules(R);
ok(!bad({ hpMul: 3 }).ok && /체력 값이 범위 밖/.test(bad({ hpMul: 3 }).err), "range reason");
eq(bad({ hpMul: 1, mobSpeed: 1, mobCount: 1, bossTime: 1 }).err, "모디파이어는 최대 3개예요", "max 3 reason");
ok(!bad({ rounds: 49 }).ok, "rounds low");
ok(bad({ rounds: 200, hpMul: 1, mobSpeed: 1, noSell: true }).ok, "rounds not counted as modifier");

// 4. 모디파이어 토글: 3개 초과 막기, 스텝 클램프 + 소수 오차
const w = { mods: {} };
eq([T.toggleMod(w, "hpMul"), T.toggleMod(w, "noSell"), T.toggleMod(w, "luckyWeek")], ["", "", ""], "toggle 3");
eq(T.toggleMod(w, "drawCost"), "모디파이어는 최대 3개예요", "toggle 4th blocked");
ok(!("drawCost" in w.mods), "4th not added");
eq(T.toggleMod(w, "noSell"), "", "toggle off"); ok(!("noSell" in w.mods), "off removed");
const M = T.MODS.find((m) => m.k === "hpMul");
let v = 1.5; for (let i = 0; i < 20; i++) v = T.stepVal(M, v, 1); eq(v, 2.5, "step clamp max");
eq(T.stepVal(M, 0.8, -1), 0.7, "step 0.1 float"); eq(T.stepVal(M, 0.7, -1), 0.7, "step clamp min");
for (const m of T.MODS) if (m.t === "num") ok(T.checkRules({ [m.k]: m.def }).ok, "default valid " + m.k);

// 5. 만들기 입력 검증
const base = { name: "우리끼리", start: "2026-11-01", end: "2026-11-14", max: 10, daily: null, rules: {} };
const today = "2026-10-30";
ok(T.validateCreate(base, today).ok, "create ok");
eq(T.validateCreate(base, today).body.dailyRunLimit, null, "unlimited daily");
ok(/2~20/.test(T.validateCreate({ ...base, name: "가" }, today).err), "name short");
eq(T.validateCreate({ ...base, start: "2026-10-29" }, today).err, "시작일이 지났어요", "past");
eq(T.validateCreate({ ...base, end: "2026-10-31" }, today).err, "종료일이 시작일보다 빨라요", "end<start");
ok(T.validateCreate({ ...base, end: "2026-12-30" }, today).ok, "60 days ok (11/1..12/30)");
eq(T.validateCreate({ ...base, end: "2026-12-31" }, today).err, "기간은 최대 60일이에요", "61 days");
eq(T.days("2026-11-01", "2026-12-30"), 60, "days inclusive");
eq(T.validateCreate({ ...base, max: 31 }, today).err, "인원은 2~30명이에요", "max players");
eq(T.validateCreate({ ...base, daily: 7 }, today).err, "하루 판수를 확인해 주세요", "daily bad");
ok(!T.validateCreate({ ...base, rules: { hpMul: 9 } }, today).ok, "rules bad in create");
ok(T.validateCreate({ ...base, daily: 5, max: 30 }, today).ok, "daily 5 max 30");

// 6. 시즌 단계
const S = { start: "2026-11-01", end: "2026-11-14", status: "active", ended: false };
eq([T.phase(S, "2026-10-31"), T.phase(S, "2026-11-01"), T.phase(S, "2026-11-14"), T.phase(S, "2026-11-15")], ["before", "live", "live", "after"], "phase");
eq(T.phase({ ...S, status: "cancelled" }, "2026-11-02"), "cancelled", "cancelled");
eq(T.phase({ ...S, ended: true }, "2026-11-02"), "after", "ended early");

// 7. 오류 문구/분류
eq(T.errKind({ st: 0, d: {} }), "offline", "net"); eq(T.errKind({ st: 401, d: {} }), "login", "401");
eq(T.errKind({ st: 404, d: {} }), "unavailable", "404 no body"); eq(T.errKind({ st: 400, d: { error: "bad_action" } }), "unavailable", "bad_action");
eq(T.errKind({ st: 404, d: { error: "no_such_season" } }), "error", "404 known");
eq(T.errText({ st: 409, d: { error: "season_full" } }), "자리가 다 찼어요", "full text");
ok(T.errText({ st: 500, d: { error: "server_error" } }).length > 0, "500 text");

// 8. 참가 미리보기 (가짜 api)
const mk = (st, d) => async () => ({ st, d });
const sea = (o) => ({ id: "i", name: "친구방", start: "2026-11-01", end: "2026-11-14", status: "active", ended: false, rules: { noSell: true }, max_players: 10, member_count: 3, is_member: false, kicked: false, ...o });
const pv = (st, d) => T.joinPreview("ABCD2345", mk(st, d));
eq((await pv(200, { ok: true, today, season: sea() })).kind, "ok", "preview ok");
eq((await pv(200, { ok: true, today, season: sea({ is_member: true }) })).kind, "joined", "already joined");
eq((await pv(200, { ok: true, today, season: sea({ member_count: 10 }) })).kind, "full", "full");
eq((await pv(200, { ok: true, today: "2026-11-20", season: sea() })).kind, "over", "over");
eq((await pv(200, { ok: true, today, season: sea({ status: "cancelled" }) })).kind, "cancelled", "cancelled");
eq((await pv(200, { ok: true, today, season: sea({ kicked: true }) })).kind, "kicked", "kicked");
eq((await pv(404, { ok: false, error: "no_such_season" })).kind, "notfound", "notfound");
eq((await pv(401, { error: "login_required" })).kind, "login", "login");
eq((await pv(0, {})).kind, "offline", "offline");
eq((await pv(404, {})).kind, "unavailable", "server not deployed");
eq((await pv(429, { error: "rate_limited" })).kind, "error", "rate limited");

console.log(`PASS ${pass} FAIL ${fail}`);
process.exit(fail ? 1 : 0);
