// 입력 로그 리플레이 검증기 (Deno / Node 공용 ES 모듈).
// 입력 로그 형식: [[tick, op, arg], ...]  (game.js inp() 가 기록. tick = 일시정지를 제외한 시뮬 틱)
//   draw(0) merge(슬롯) sell(슬롯) up(무리0-3) ticket(CHARS 인덱스) upT(무리) auto(0/1) lock(슬롯)
import { createEngine, ENGINE_VER } from "./engine.js";

export { ENGINE_VER };
export const LIMITS = { MAX_INPUTS: 8000, MAX_TICKS: 60 * 60 * 25 };
const OPS = { draw: [0, 0], merge: [0, 19], sell: [0, 19], up: [0, 3], ticket: [0, 31], upT: [0, 3], auto: [0, 1], lock: [0, 19] };

export function validateInputs(inputs) {
  if (!Array.isArray(inputs)) return "inputs 형식 오류";
  if (inputs.length > LIMITS.MAX_INPUTS) return "inputs 가 너무 많음";
  let prev = 0;
  for (const x of inputs) {
    if (!Array.isArray(x) || x.length !== 3) return "입력 항목 형식 오류";
    const [t, op, a] = x, r = OPS[op];
    if (!r || !Number.isInteger(t) || t < prev || t > LIMITS.MAX_TICKS || !Number.isInteger(a) || a < r[0] || a > r[1]) return "입력 항목 값 오류";
    prev = t;
  }
  return null;
}

// 반환: { ok:true, result:{score,round,win,kills,hero,units,unitPts,draws,ticks,bossLeft} } | { ok:false, error }
export function replay(seed, inputs) {
  const bad = validateInputs(inputs);
  if (bad) return { ok: false, error: bad };
  const e = createEngine(), S = e.start(seed), G = e.GAME;
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
    if (++guard > LIMITS.MAX_TICKS + 5000) return { ok: false, error: "시뮬이 끝나지 않음" };
  }
  const r = e.result();
  if (!r) return { ok: false, error: "결과 없음" };
  return { ok: true, result: { score: r.score, round: r.round, win: !!r.win, kills: r.kills, hero: r.hero, units: r.units, unitPts: r.unitPts, draws: r.draws, bossLeft: r.bossLeft, ticks: S.tick } };
}
