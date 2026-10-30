// 입력 로그 리플레이 검증기 (Deno / Node 공용 ES 모듈).
// 입력 로그 형식: [[tick, op, arg], ...]  (game.js inp() 가 기록. tick = 일시정지를 제외한 시뮬 틱)
//   draw(0) merge(슬롯) sell(슬롯) up(무리0-3) ticket(CHARS 인덱스) upT(무리) auto(0/1) lock(슬롯)
import { createEngine, ENGINE_VER, validateRules, rulesHash } from "./engine.js";

export { ENGINE_VER, validateRules, rulesHash };
// 랭킹 표시용 빌드 요약 검증/정리: {clans:[{n,lv}]x4, top} 모양이 아니거나 범위를 벗어나면 null (저장은 하되 build 없음).
export function cleanBuild(b) {
  const ok = (v, mx) => Number.isInteger(v) && v >= 0 && v <= mx;
  if (!b || !Array.isArray(b.clans) || b.clans.length !== 4 || !ok(b.top, 7)) return null;
  for (const c of b.clans) if (!c || !ok(c.n, 400) || !ok(c.lv, 200)) return null;
  return { clans: b.clans.map((c) => ({ n: c.n, lv: c.lv })), top: b.top };
}
export const LIMITS = { MAX_INPUTS: 8000, MAX_TICKS: 60 * 60 * 25 };
const OPS = { draw: [0, 0], merge: [0, 19], sell: [0, 19], up: [0, 3], ticket: [0, 31], upT: [0, 3], auto: [0, 1], lock: [0, 19] };

// maxTicks: 규칙 rounds 에 따라 늘어나는 상한(rounds*1800). 기본 50라운드는 기존 LIMITS.MAX_TICKS 그대로.
export const maxTicksFor = (rounds) => Math.max(LIMITS.MAX_TICKS, (rounds || 50) * 1800);
export function validateInputs(inputs, maxTicks = LIMITS.MAX_TICKS) {
  if (!Array.isArray(inputs)) return "inputs 형식 오류";
  if (inputs.length > LIMITS.MAX_INPUTS) return "inputs 가 너무 많음";
  let prev = 0;
  for (const x of inputs) {
    if (!Array.isArray(x) || x.length !== 3) return "입력 항목 형식 오류";
    const [t, op, a] = x, r = OPS[op];
    if (!r || !Number.isInteger(t) || t < prev || t > maxTicks || !Number.isInteger(a) || a < r[0] || a > r[1]) return "입력 항목 값 오류";
    prev = t;
  }
  return null;
}

// 반환: { ok:true, result:{score,round,win,kills,hero,units,unitPts,draws,ticks,bossLeft} } | { ok:false, error }
// 호출: replay(seed, inputs, rules?) 또는 replay({ seed, log, rules })  (log = inputs)
export function replay(seed, inputs, rules) {
  if (seed && typeof seed === "object") ({ seed, log: inputs, rules } = seed);
  let rl = null;
  if (rules != null) { const v = validateRules(rules); if (!v.ok) return { ok: false, error: "rules: " + v.err }; rl = v.rules; }
  const bad = validateInputs(inputs, maxTicksFor(rl && rl.rounds));
  if (bad) return { ok: false, error: bad };
  const e = createEngine(), S = e.start(seed, rl), G = e.GAME;
  let i = 0, guard = 0;
  while (!S.over) {
    while (i < inputs.length && inputs[i][0] <= S.tick) {
      const [t, op, a] = inputs[i++];
      let ok;
      if (op === "draw") ok = G.draw();
      else if (op === "merge") ok = G.merge(a, false) === 1;
      else if (op === "sell") ok = G.sell(a);
      else if (op === "up") ok = G.upgrade(a);
      else if (op === "ticket") ok = G.useTicket(a);
      else if (op === "upT") ok = G.useUpTicket(a);
      else if (op === "auto") { if (S.autoMerge !== !!a) G.toggleAuto(); ok = true; }
      else if (op === "lock") { G.toggleLock(a); ok = true; }
      if (!ok) return { ok: false, error: `재현 불가 입력 #${i - 1} (${op} ${a} @${t})` };
      if (S.over) break;
    }
    if (S.over) break;
    S.paused = false; // 모달(선택권/강화 창) 일시정지는 시뮬 틱을 소모하지 않으므로 리플레이에서는 즉시 해제
    e.update(e.CONST.DT);
    if (++guard > maxTicksFor(rl && rl.rounds) + 5000) return { ok: false, error: "시뮬이 끝나지 않음" };
  }
  const r = e.result();
  if (!r) return { ok: false, error: "결과 없음" };
  return { ok: true, result: { score: r.score, round: r.round, win: !!r.win, kills: r.kills, hero: r.hero, units: r.units, unitPts: r.unitPts, draws: r.draws, bossLeft: r.bossLeft, build: r.build, ticks: S.tick } };
}
