// 코인 수입(운 층 포함) 시뮬: node tools/coin_income_sim.mjs [봇수=16]
// 봇을 돌려 라운드 도달 시점(캐주얼 R26 / 보통 R38)의 kills·topGrade 를 기록하고, 정해진 라운드 분포(평균 26/38, 편차 8)에 대해 myhero.js settle 과 같은 식으로 판당 코인을 계산한다.
import { createEngine } from "../supabase/functions/submit-score/engine.js";
import fs from "node:fs"; import vm from "node:vm";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const store = {}; const ctx = vm.createContext({ console, Date, Math, JSON, Number, Set, Array, String, RegExp, Object });
ctx.window = ctx; ctx.lsGet = (k, d = null) => (k in store ? store[k] : d); ctx.lsSet = (k, v) => { store[k] = v; };
for (const k of ["esc", "nf", "sfx", "modal", "closeModal", "$", "checkName"]) ctx[k] = () => {};
vm.runInContext(fs.readFileSync(root + "data.js", "utf8") + "\n" + fs.readFileSync(root + "myhero.js", "utf8"), ctx);
const MH = ctx.MyHero, coinsFor = (...a) => ctx.coinsFor(...a);
const N = Number(process.argv[2]) || 16;
function bot(seed) {
  const e = createEngine(), G = e.GAME, K = e.CONST; let a = (seed * 7 + 1) >>> 0;
  const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const S = e.start(seed, null, null), snap = {}; const best = () => { let b = 0, bp = -1; for (let c = 0; c < 4; c++) { let p = 0; for (const s of S.slots) if (s && !s.hero && (s.ch & 3) === c) p += (1 + (s.ch >> 2)) * s.n; if (p > bp) { bp = p; b = c; } } return b; };
  let n = 0;
  while (!S.over && n < 90000) {
    n++;
    if (S.paused) { if (S.tickets.length) { const g = S.tickets[0]; let u = false; for (let c = 0; c < 4 && !u; c++) u = G.useTicket(g * 4 + (c + best()) % 4); } S.paused = false; }
    if (n % 20 === 0) { if (S.upTickets) G.useUpTicket(best()); if (S.round >= 5) G.upgrade(best()); for (let k = 0; k < 5; k++) G.draw();
      for (let i = 0; i < 20; i++) { const s = S.slots[i]; if (s && !s.hero && s.n >= 3 && rnd() < 0.7) G.merge(i, rnd() < 0.5); }
      if (S.tickets.length) { const g = S.tickets[0]; for (let c = 0; c < 4; c++) if (G.useTicket(g * 4 + c)) break; }
      if (!S.slots.some((x) => !x)) for (let i = 0; i < 20; i++) { const s = S.slots[i]; if (s && !s.hero && (s.ch >> 2) < 2 && s.n < 3) { G.sell(i); break; } } }
    e.update(K.DT);
    for (const r of [26, 38]) if (S.round >= r && !snap[r]) snap[r] = { kills: S.kills, top: S.topGrade };
  }
  return snap;
}
const snaps = []; for (let i = 0; i < N; i++) snaps.push(bot(100 + i));
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
let st = 12345; const R = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
for (const [name, mu] of [["캐주얼", 26], ["보통", 38]]) {
  const key = mu === 26 ? 26 : 38; let b0 = 0, tot = 0, T = 3000, parts = { boss: 0, gold: 0, grade: 0, hero: 0, rec: 0, daily: 0 }; const arr = [];
  for (let i = 0; i < T; i++) {
    const rd = Math.max(5, Math.min(50, Math.round(mu + 8 * gauss(R)))), sn = snaps[i % N][key] || { kills: 42 * rd, top: 4 };
    const kills = Math.round(42 * rd), top = rd >= key ? sn.top : Math.max(0, sn.top - 1), base = coinsFor(rd, kills, rd >= 50, 0);
    const lk = MH.luck(1000 + i, rd, rd >= 50, top), sub = base + lk.boss + lk.gold + lk.grade, daily = i % 3 === 0 ? Math.min(15, Math.floor(sub * 0.2)) : 0; // 하루 3판 가정: 첫 판만 일일 보너스
    const g = Math.min(250, sub + daily); b0 += base; tot += g; arr.push(g); parts.boss += lk.boss; parts.gold += lk.gold; parts.grade += lk.grade; parts.daily += daily;
  }
  arr.sort((x, y) => x - y);
  console.log(`${name}: 현행 ${(b0 / T).toFixed(1)} -> 운 층 ${(tot / T).toFixed(1)} (x${(tot / b0).toFixed(2)}) p10 ${arr[T * 0.1 | 0]} p50 ${arr[T / 2 | 0]} p90 ${arr[T * 0.9 | 0]} | 보스 ${(parts.boss / T).toFixed(1)} 황금 ${(parts.gold / T).toFixed(1)} 등급 ${(parts.grade / T).toFixed(1)} 일일 ${(parts.daily / T).toFixed(1)}`);
}
console.log("봇 스냅샷(R26/R38 kills,top):", snaps.slice(0, 4).map((s) => JSON.stringify(s)).join(" "));
