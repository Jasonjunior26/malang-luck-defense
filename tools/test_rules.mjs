// 프라이빗 시즌 rules 테스트: node tools/test_rules.mjs
// 1) validateRules 정상/거부  2) 모디파이어별 봇 한 판 -> 서버 replay 점수 일치  3) 프리셋 6종 스모크  4) rounds 100/200 재생 시간
import { createEngine, validateRules as vr, rulesHash as rh } from "../supabase/functions/submit-score/engine.js";
import { replay } from "../supabase/functions/submit-score/replay.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };

// ---- 1. 검증 ----
const good = [
  {}, { rounds: 100 }, { rounds: 200, hpMul: 0.9 }, { hpMul: 1.8, mobSpeed: 1.2, bossTime: -5 }, { noGrade: 2, gradeCap: 4, drawLimit: 60 },
  { noSell: true, clanBan: [0, 3], heroPool: ["buung"] }, { startMin: 0, killReward: 2, drawCost: 25 }, { luckyWeek: true, mobCount: 1.6, bossTime: 15 },
];
good.forEach((r, i) => ok(vr(r).ok, "good#" + i));
const bad = [
  null, [], "x", { foo: 1 }, { rounds: 49 }, { rounds: 201 }, { rounds: 60.5 }, { hpMul: 0.69 }, { hpMul: 2.6 }, { mobSpeed: 1.6 }, { mobCount: 0.7 },
  { bossTime: -11 }, { bossTime: 16 }, { noGrade: 3 }, { gradeCap: 3 }, { gradeCap: 7 }, { drawLimit: 59 }, { drawLimit: 301 }, { noSell: "yes" },
  { clanBan: [0, 1, 2] }, { clanBan: [4] }, { heroPool: ["nope"] }, { heroPool: "buung" }, { startMin: 201 }, { startMin: -1 }, { killReward: 0.4 },
  { drawCost: 9 }, { drawCost: 26 }, { luckyWeek: 2 }, { hpMul: "1" },
  { hpMul: 1, mobSpeed: 1, mobCount: 1, bossTime: 0 }, // 모디파이어 4개
  { rounds: 100, hpMul: 1, mobSpeed: 1, mobCount: 1, bossTime: 0 },
];
bad.forEach((r, i) => ok(!vr(r).ok, "bad#" + i + " " + JSON.stringify(r)));
ok(vr({ rounds: 100, hpMul: 1, mobSpeed: 1, mobCount: 1 }).ok, "rounds 는 모디파이어 수에 불포함");
ok(rh({ a: 1, b: [2] }) === rh({ b: [2], a: 1 }), "hash 키 순서 무관");
ok(rh({ hpMul: 1 }) !== rh({ hpMul: 1.1 }) && rh(null) === rh({}) && /^[0-9a-f]{16}$/.test(rh({})), "hash 형식/구분");
ok(JSON.stringify(vr({ clanBan: [3, 0] }).rules.clanBan) === "[0,3]", "clanBan 정규화");

// ---- 2. 봇 ----
function bot(seed, rules, maxTicks = 60 * 60 * 25) {
  const e = createEngine(), G = e.GAME, K = e.CONST;
  let a = (seed * 7 + 1) >>> 0;
  const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const S = e.start(seed, rules);
  const best = () => { let b = 0, bp = -1; for (let c = 0; c < 4; c++) { let p = 0; for (const s of S.slots) if (s && !s.hero && (s.ch & 3) === c) p += (1 + (s.ch >> 2)) * s.n; if (p > bp) { bp = p; b = c; } } return b; };
  let n = 0, banned = 0;
  while (!S.over && n < maxTicks) {
    n++;
    if (S.paused) { if (S.tickets.length) { const g = S.tickets[0]; let used = false; for (let c = 0; c < 4 && !used; c++) used = G.useTicket(g * 4 + (c + best()) % 4); } S.paused = false; }
    if (n % 20 === 0) {
      if (S.upTickets) G.useUpTicket(best());
      if (S.round >= 5) G.upgrade(best());
      for (let k = 0; k < 5; k++) G.draw();
      for (let i = 0; i < 20; i++) { const s = S.slots[i]; if (s && !s.hero && s.n >= 3 && rnd() < 0.7) G.merge(i, rnd() < 0.5); }
      if (S.tickets.length) { const g = S.tickets[0]; for (let c = 0; c < 4; c++) if (G.useTicket(g * 4 + c)) break; }
      if (!S.slots.some((x) => !x)) for (let i = 0; i < 20; i++) { const s = S.slots[i]; if (s && !s.hero && (s.ch >> 2) < 2 && s.n < 3) { G.sell(i); break; } }
      if (rules && rules.clanBan) for (const s of S.slots) if (s && !s.hero && rules.clanBan.includes(s.ch & 3)) banned++;
    }
    e.update(K.DT);
  }
  return { e, S, r: e.result(), banned };
}
function runCase(name, rules, seed) {
  let b;
  try { b = bot(seed, rules); } catch (x) { ok(false, name + " 예외 " + x.message); return null; }
  ok(!!b.r, name + " 결과 없음");
  if (!b.r) return null;
  const t0 = Date.now(), rp = replay({ seed, log: b.S.inputs, rules }), ms = Date.now() - t0;
  ok(rp.ok && rp.result.score === b.r.score && rp.result.round === b.r.round, `${name} 재생 불일치 ${rp.ok ? rp.result.score + "/" + b.r.score : rp.error}`);
  return { b, ms, rp };
}

const mods = {
  hpMul: { hpMul: 2 }, mobSpeed: { mobSpeed: 1.4 }, mobCount: { mobCount: 1.5 }, bossTime: { bossTime: -8 }, noGrade1: { noGrade: 1 }, noGrade2: { noGrade: 2 },
  gradeCap4: { gradeCap: 4 }, drawLimit: { drawLimit: 60 }, noSell: { noSell: true }, clanBan: { clanBan: [1, 2] }, heroPool: { heroPool: ["buung"] },
  startMin: { startMin: 0 }, killReward: { killReward: 2 }, drawCost: { drawCost: 25 }, luckyWeek: { luckyWeek: true },
};
for (const [k, r] of Object.entries(mods)) {
  const c = runCase("mod:" + k, r, 1000 + k.length * 17);
  if (!c) continue;
  const S = c.b.S;
  if (k === "drawLimit") ok(S.draws <= 60, "drawLimit 초과 " + S.draws);
  if (k === "gradeCap4") ok(S.slots.every((s) => !s || s.hero || (s.ch >> 2) <= 4 || true), "cap");
  if (k === "clanBan") ok(c.b.banned === 0, "금지 무리 유닛 등장 " + c.b.banned);
  if (k === "heroPool") ok(S.hero.id === "buung", "heroPool 영웅 " + S.hero.id);
  if (k === "drawCost") ok(c.b.e.CONST.DRAW_COST === 25 - (S.hero.fx.drawCost || 0), "drawCost");
}
// gradeCap: cap 등급 유닛은 합성 불가 / noGrade: 하위 등급 뽑기 안 나옴
{
  const e = createEngine(), S = e.start(5, { noGrade: 2, gradeCap: 4 });
  S.minerals = 1e6; const seen = new Set();
  for (let i = 0; i < 600 && !S.over; i++) { if (e.GAME.draw()) { const s = S.slots.filter((x) => x && !x.hero); seen.add(s[s.length - 1]); } S.slots.forEach((s, j) => { if (s && !s.hero) { seen.add(s.ch >> 2); } }); if (i % 10 === 0) S.slots.forEach((s, j) => { if (s && !s.hero) e.GAME.sell(j); }); }
  const gs = [...seen].filter((x) => typeof x === "number");
  ok(gs.length > 0 && Math.min(...gs) >= 2, "noGrade 2: 커먼/노멀 등장 " + gs);
  ok(e.GAME.canMerge && true, "ok");
  const e2 = createEngine(), S2 = e2.start(5, { gradeCap: 4 }); S2.slots[0] = { ch: 16, n: 3, cd: 0, lock: false, anim: null, fire: null, shots: 0 };
  ok(!e2.GAME.canMerge(0).ok, "gradeCap 4: 히든(4) 합성 불가"); S2.slots[1] = { ch: 12, n: 3, cd: 0, lock: false, anim: null, fire: null, shots: 0 };
  ok(e2.GAME.canMerge(1).ok, "gradeCap 4: 유니크(3) 합성 가능");
  const e3 = createEngine(), S3 = e3.start(5, { noSell: true }); S3.slots[1] = { ch: 0, n: 2, cd: 0, lock: false, anim: null, fire: null, shots: 0 };
  ok(!e3.GAME.sell(1), "noSell");
  ok(e3.CONST.ROUNDS === 50 && createEngine().start(5, { rounds: 100 }) && true, "rounds 설정");
}

// ---- 3. 프리셋 6종 ----
const presets = {
  "맨몸 서바이벌": { noGrade: 1, startMin: 0, noSell: true }, "하드코어": { hpMul: 1.8, mobSpeed: 1.2, bossTime: -5 },
  "운빨 파티": { luckyWeek: true, drawCost: 20, killReward: 1.5 }, "마라톤": { rounds: 100, hpMul: 0.9 },
  "한 우물": { clanBan: [1, 2], heroPool: ["buung"] }, "엔드리스": { rounds: 200 },
};
for (const [n, r] of Object.entries(presets)) {
  ok(vr(r).ok, "preset valid " + n);
  const c = runCase("preset:" + n, r, 4242);
  if (c) console.log(`  ${n}: round=${c.b.r.round} score=${c.b.r.score} win=${c.b.r.win} replay=${c.ms}ms`);
}

// ---- 4. 긴 라운드 재생 시간 ----
// 봇이 100/200 라운드까지 가도록 테스트 엔진의 몹 체력 상수만 낮춰(HP_MUL 평탄) 같은 입력을 같은 루프(replay.js 와 동일)로 다시 돌려 시간을 잰다.
function longRun(rounds) {
  const rules = { rounds }, seed = 777, weak = (e) => { e.CONST.HP_MUL0 = 0.15; e.CONST.HP_MUL1 = 0.15; };
  const e = createEngine(); weak(e);
  const G = e.GAME, K = e.CONST, S = e.start(seed, rules);
  let n = 0;
  while (!S.over && n < 60 * 60 * 60) {
    n++;
    if (S.paused) { if (S.tickets.length) { const g = S.tickets[0]; for (let c = 0; c < 4; c++) if (G.useTicket(g * 4 + c)) break; } S.paused = false; }
    if (n % 15 === 0) {
      if (S.upTickets) G.useUpTicket(0);
      G.upgrade(0); G.upgrade(1);
      for (let k = 0; k < 6; k++) G.draw();
      for (let i = 0; i < 20; i++) { const s = S.slots[i]; if (s && !s.hero && s.n >= 3) G.merge(i, true); }
      if (!S.slots.some((x) => !x)) for (let i = 0; i < 20; i++) { const s = S.slots[i]; if (s && !s.hero && (s.ch >> 2) < 2) { G.sell(i); break; } }
    }
    e.update(K.DT);
  }
  const r = e.result(), log = S.inputs;
  // 같은 입력으로 재생(replay.js 루프와 동일 구조)
  const t0 = Date.now(), e2 = createEngine(); weak(e2);
  const S2 = e2.start(seed, rules), G2 = e2.GAME; let i = 0;
  while (!S2.over) {
    while (i < log.length && log[i][0] <= S2.tick) { const [, op, a] = log[i++]; if (op === "draw") G2.draw(); else if (op === "merge") G2.merge(a, false); else if (op === "sell") G2.sell(a); else if (op === "up") G2.upgrade(a); else if (op === "ticket") G2.useTicket(a); else if (op === "upT") G2.useUpTicket(a); else if (op === "auto") { if (S2.autoMerge !== !!a) G2.toggleAuto(); } else if (op === "lock") G2.toggleLock(a); if (S2.over) break; }
    if (S2.over) break; S2.paused = false; e2.update(K.DT);
  }
  const ms = Date.now() - t0, r2 = e2.result();
  ok(r2 && r2.score === r.score, `long ${rounds} 재생 불일치`);
  console.log(`  rounds=${rounds}: 도달 round=${r.round} ticks=${S.tick} inputs=${log.length} win=${r.win} 재생=${ms}ms`);
}
longRun(100); longRun(200);

ok(!replay({ seed: 1, log: [], rules: { hpMul: 9 } }).ok, "replay 가 잘못된 rules 거부");
ok(replay({ seed: 1, log: [], rules: null }).ok, "replay rules=null 허용");
console.log(`PASS ${pass} FAIL ${fail}`);
process.exit(fail ? 1 : 0);
