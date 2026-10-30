// 리플레이 검증 테스트: node tools/test_replay.mjs [판수=6]
// 1) 클라이언트와 같은 data.js+game.js 를 vm 에서(HEADLESS=false, 렌더 스텁) 봇으로 한 판 -> 입력 로그/점수
// 2) 그 로그를 서버 engine(replay.js)으로 재생 -> 점수 일치? 3) 조작(로그 변조/점수 부풀리기/seed 변조)은 거부/불일치?
import fs from "node:fs"; import vm from "node:vm"; import path from "node:path"; import { fileURLToPath } from "node:url";
import { replay } from "../supabase/functions/submit-score/replay.js";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const N = Number(process.argv[2] || 6);

function clientRun(botSeed, opts) {
  const noop = () => {}, ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === "createLinearGradient" || k === "createRadialGradient") ? () => ({ addColorStop: noop }) : k === "measureText" ? () => ({ width: 10 }) : noop), set: (t, k, v) => ((t[k] = v), true) });
  const el = { style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, getContext: () => ctx, addEventListener: noop, getBoundingClientRect: () => ({ width: 360, height: 400, left: 0, top: 0 }) };
  const sb = { document: { getElementById: () => el }, window: { devicePixelRatio: 1 }, performance: { now: () => 0 }, requestAnimationFrame: noop, Date };
  vm.createContext(sb);
  const run = (c, f) => vm.runInContext(c, sb, { filename: f });
  run(`const $ = () => document.getElementById("x"); var T = { over: null };
    function sfx(){} function vib(){} function updateHud(){} function uiLog(){} function uiBanner(){} function uiTicket(){} function uiUpTicket(){} function uiGameOver(r){ T.over = r; }
    function drawBoard(){} function drawUnit(){} function drawHero(){} function drawMob(){} function drawProj(){} function drawEfx(){} function drawPart(){} function drawParade(){} function gradeParticles(){}`, "pre");
  run(fs.readFileSync(path.join(root, "data.js"), "utf8"), "data.js");
  run(fs.readFileSync(path.join(root, "game.js"), "utf8"), "game.js");
  sb.__r = botSeed; sb.__opts = opts;
  run(`
    let a = __r >>> 0; const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    GAME.start(__opts.mode);
    const best = () => { const p = clanPower(S.slots); let b = 0; for (let c = 1; c < 4; c++) if (p[c] > p[b]) b = c; return b; };
    let n = 0;
    while (!S.over && n < 60 * 60 * 25) {
      n++;
      if (S.paused) { if (S.tickets.length) { const g = S.tickets[0]; if (!GAME.useTicket(g * 4 + best())) for (let c = 0; c < 4; c++) if (GAME.useTicket(g * 4 + c)) break; } S.paused = false; }
      if (rnd() < 0.002) { const w = 1 + Math.floor(rnd() * 90); S.paused = true; GAME.upgrade(best()); for (let k = 0; k < w; k++) update(CONST.DT); S.paused = false; } // 강화창 열린 채 시간 흐름(틱 정지)
      if (n % 20 === 0) {
        if (rnd() < 0.05) GAME.toggleAuto();
        if (rnd() < 0.05) GAME.toggleLock(Math.floor(rnd() * 20));
        if (S.upTickets) GAME.useUpTicket(best());
        if (S.round >= __opts.up) GAME.upgrade(best());
        for (let k = 0; k < 5; k++) GAME.draw();
        for (let i = 0; i < 20; i++) { const s = S.slots[i]; if (s && !s.hero && s.n >= 3 && (s.ch >> 2) < 6 && rnd() < 0.7) GAME.merge(i, rnd() < 0.5); }
        if (S.tickets.length) { const g = S.tickets[0]; for (let c = 0; c < 4; c++) if (GAME.useTicket(g * 4 + c)) break; }
        if (!S.slots.some((x) => !x)) for (let i = 0; i < 20; i++) { const s = S.slots[i]; if (s && !s.hero && (s.ch >> 2) < 2 && s.n < 3) { GAME.sell(i); break; } }
      }
      update(CONST.DT);
    }
  `, "bot");
  const r = run("T.over", "r");
  return { r: { score: r.score, round: r.round, win: r.win, kills: r.kills, hero: r.hero, build: r.build }, seed: r.seed, inputs: JSON.parse(JSON.stringify(r.inputs)) };
}

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => { (cond ? pass++ : fail++); if (!cond || process.env.V) console.log((cond ? "PASS " : "FAIL ") + name + " " + extra); };
const times = [];
for (let i = 0; i < N; i++) {
  const g = clientRun(1000 + i, { mode: i % 3 === 2 ? "practice" : "daily", up: i % 2 ? 8 : 99 }); // practice 판도 seed 만 알면 재현 가능한지 확인
  const t0 = Date.now(); const v = replay(g.seed, g.inputs); const dt = Date.now() - t0; times.push(dt);
  const same = v.ok && v.result.score === g.r.score && v.result.round === g.r.round && v.result.win === g.r.win && v.result.kills === g.r.kills && v.result.hero === g.r.hero;
  console.log(`run${i} seed=${g.seed} hero=${g.r.hero} round=${g.r.round} win=${g.r.win} score=${g.r.score} inputs=${g.inputs.length} replay=${v.ok ? v.result.score : v.error} ${dt}ms ${same ? "MATCH" : "MISMATCH"}`);
  check(`determinism run${i}`, same);
  if (i === 0) {
    // 변조 테스트 (첫 판 기준)
    const inp = g.inputs, m = (f) => { const c = JSON.parse(JSON.stringify(inp)); f(c); return c; };
    const cmp = (v2) => v2.ok && v2.result.score === g.r.score && v2.result.round === g.r.round;
    const mid = Math.floor(inp.length / 2);
    const k1 = inp.findIndex((x, j) => j > 20 && x[1] === "draw");
    check("변조: 입력 1개 삭제 -> 불일치/거부", !cmp(replay(g.seed, m((c) => c.splice(k1, 1)))));
    check("변조: 앞 입력 150개 삭제 -> 불일치/거부", !cmp(replay(g.seed, m((c) => c.splice(0, 150)))));
    // 인자 변경은 시드에 따라 우연히 점수가 같을 수 있어(예: 같은 칸 판매) 후보 여러 개 중 하나라도 달라지면 통과로 본다(안정화).
    check("변조: 입력 인자 변경 -> 불일치/거부", (() => {
      const cand = []; for (let q = mid; q < inp.length && cand.length < 8; q++) if (["sell", "merge", "up", "lock"].includes(inp[q][1])) cand.push(q);
      return cand.some((t) => !cmp(replay(g.seed, m((c) => { c[t][2] = inp[t][1] === "up" ? (c[t][2] + 1) % 4 : (c[t][2] + 7) % 20; }))));
    })());
    check("변조: 가짜 draw 100개 추가 -> 불일치/거부", !cmp(replay(g.seed, m((c) => { for (let q = 0; q < 100; q++) c.splice(mid, 0, [c[mid][0], "draw", 0]); }))));
    check("변조: seed 변경 -> 불일치/거부", !cmp(replay(g.seed + 1, inp)));
    check("변조: 잘못된 op -> 거부", !replay(g.seed, [[0, "hack", 1]]).ok);
    check("변조: 입력 없음(방치) -> 점수 낮음", replay(g.seed, []).ok && replay(g.seed, []).result.score < g.r.score);
    check("점수 부풀리기(claimed+1) -> 서버 재계산값과 불일치", v.result.score !== g.r.score + 1);
  }
}
console.log(`replay ms: avg ${Math.round(times.reduce((a, b) => a + b, 0) / times.length)} max ${Math.max(...times)}`);
console.log(`PASS ${pass} FAIL ${fail}`);
process.exit(fail ? 1 : 0);
