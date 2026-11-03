// 밸런스 시뮬: 헤드리스 엔진(engine.js)으로 간단한 봇을 돌려 도달 라운드/클리어율/점수를 잰다.
// 사용: node tools/build_engine.js 후
//   node tools/sim_bot.mjs ab [N]       공업 공식 변경 전(UP_STEP2=0)/후 비교 (히어로는 시드대로)
//   node tools/sim_bot.mjs heroes [N]   히어로 10종별 (heroPool 로 고정)
//   node tools/sim_bot.mjs one <heroId> [N]
// 봇: 선택권은 가장 강한 무리로, 합성 가능하면 전부 합성, 미네랄이 생기면 뽑기(자리 없으면 약한 유닛 판매),
//     남는 미네랄은 강한 무리 공업 강화, 공업 8단계마다 사거리 1단계. 시드 1..N 고정.
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { createEngine } = await import(pathToFileURL(path.join(root, "supabase/functions/submit-score/engine.js")).href);

const PTS = (g) => Math.pow(3.5, g); // 등급별 화력 근사(baseDps 비)
function play(seed, opt = {}) {
  const e = createEngine();
  if (opt.oldUp) e.CONST.UP_STEP2 = 0; // 변경 전 공식: 1 + 0.35*lv
  else if (opt.s2 != null) e.CONST.UP_STEP2 = opt.s2; // 민감도 확인용
  const S = e.start(seed, opt.hero ? { heroPool: [opt.hero] } : null), G = e.GAME, K = e.CONST;
  const power = () => { const p = [0, 0, 0, 0]; for (const s of S.slots) if (s && !s.hero) p[s.ch & 3] += PTS(s.ch >> 2) * s.n; return p; };
  let main = -1; // focusR 라운드부터 주력 무리 고정(선택권·강화·판매 기준)
  const best = () => { if (main >= 0) return main; const p = power(); let b = 0; for (let c = 1; c < 4; c++) if (p[c] > p[b]) b = c; if (opt.focusR && S.round >= opt.focusR) main = b; return b; };
  const upCost = (c) => K.UP_COST0 + K.UP_COSTK * S.up[c].bought;
  let n = 0;
  while (!S.over && n < 60 * 60 * 40) {
    n++;
    if (S.paused) { // 보스 선택권 자동 처리
      while (S.tickets.length) { const g = S.tickets[0]; if (!G.useTicket(g * 4 + best())) { let ok = false; for (let c = 0; c < 4 && !ok; c++) ok = G.useTicket(g * 4 + c); if (!ok) break; } }
      while (S.upTickets > 0) G.useUpTicket(best());
      S.paused = false;
    }
    if (n % 10 === 0) {
      for (let i = 0; i < 20; i++) { const s = S.slots[i]; if (s && !s.hero && s.n >= 3 && (s.ch >> 2) < 6) G.merge(i, true); }
      let b = best();
      if (opt.greedy) { // 강화 대상: (무리 화력 x 다음 Lv 배율 증가율 / 비용) 최대
        const p = power(), dm = (l) => 1 + K.UP_STEP * l + K.UP_STEP2 * l * l; let bv = -1;
        for (let c = 0; c < 4; c++) { if (S.up[c].bought >= K.UP_MAX) continue; const l = S.lv[c], v = p[c] * (dm(l + 1) - dm(l)) / dm(l) / upCost(c); if (v > bv) { bv = v; b = c; } }
      }
      // 강화 우선 조건: 뽑기 비용 대비 공업이 싸게 느껴지는 시점(라운드 비례 목표 Lv 미만이면 먼저 강화)
      const want = Math.min(K.UP_MAX, Math.floor(S.round * opt.upK));
      let save = false; // 목표 Lv 미달이면 뽑기를 멈추고 모은다(빈 칸이 많을 때는 예외)
      if (S.up[b].bought < want) { if (!G.upgrade(b) && S.slots.filter((x) => !x).length < opt.freeKeep) save = true; }
      const rc = G.rangeCost(b);
      if (!save && rc >= 0 && S.rangeUp[b] < Math.floor(S.up[b].bought / opt.rgEvery)) { if (!G.rangeUp(b) && S.slots.filter((x) => !x).length < opt.freeKeep) save = true; }
      let guard = 0;
      while (!save && guard++ < 30 && S.minerals >= G.drawCost()) {
        if (!S.slots.some((x) => !x)) { // 자리 없음: 강한 무리가 아닌 가장 낮은 등급 1기 판매
          let si = -1, sg = 9;
          for (let i = 0; i < 20; i++) { const s = S.slots[i]; if (s && !s.hero && (s.ch & 3) !== b && s.n < 3 && (s.ch >> 2) < sg && (s.ch >> 2) <= opt.sellG) { sg = s.ch >> 2; si = i; } }
          if (si < 0 || !G.sell(si)) break;
        }
        if (!G.draw()) break;
        for (let i = 0; i < 20; i++) { const s = S.slots[i]; if (s && !s.hero && s.n >= 3 && (s.ch >> 2) < 6) G.merge(i, true); }
      }
      if (S.minerals >= upCost(b)) G.upgrade(b); // 남으면 공업
    }
    const m0 = S.minerals; e.update(K.DT);
    if (opt.eco && S.minerals > m0) S.minerals += Math.round((S.minerals - m0) * opt.eco); // 숙련자 근사(참고용 치트): 수입 +eco 배
  }
  const r = e.result() || { round: S.round, win: false, score: S.score(), build: null };
  const bm = S.mobs.find((m) => m.boss), bossLeft = !r.win && bm ? bm.hp / bm.max : 0; // 보스에게 졌으면 남은 체력 비율
  return { bossLeft, bossDeath: !r.win && !!bm && S.mobs.length < K.MOB_LOSE, round: r.round, win: !!r.win, score: r.score, hero: r.hero, top: r.build ? r.build.top : -1, lv: r.build ? Math.max(...r.build.clans.map((c) => c.lv)) : 0 };
}
const POL = { upK: 0.3, rgEvery: 6, freeKeep: 6, focusR: 0, sellG: 2, greedy: 0, eco: 0 };
function batch(N, opt) {
  const rs = []; for (let s = 1; s <= N; s++) rs.push(play(s * 7919, { ...POL, ...opt }));
  const avg = (f) => rs.reduce((a, r) => a + f(r), 0) / rs.length;
  return { n: rs.length, round: +avg((r) => r.round).toFixed(2), clear: +(avg((r) => (r.win ? 1 : 0)) * 100).toFixed(1), score: Math.round(avg((r) => r.score)), max: Math.max(...rs.map((r) => r.score)), lv: +avg((r) => r.lv).toFixed(1), leg: +(avg((r) => (r.top >= 6 ? 1 : 0)) * 100).toFixed(0), bd: +(avg((r) => (r.bossDeath ? 1 : 0)) * 100).toFixed(0), r50: (() => { const l = rs.filter((r) => r.round === 50 && !r.win); return l.length ? +(l.reduce((a, r) => a + r.bossLeft, 0) / l.length * 100).toFixed(0) : -1; })(), n50: rs.filter((r) => r.round >= 50).length, rs };
}
const mode = process.argv[2] || "ab", N = +(process.argv[mode === "one" ? 4 : 3] || 30);
const row = (name, b) => `| ${name} | ${b.round} | ${b.clear}% | ${b.score} | ${b.max} | ${b.lv} | ${b.leg}% |` + (process.env.X ? ` 보스패배 ${b.bd}% R50도달 ${b.n50} R50보스잔여 ${b.r50}%` : "");
const HDR = "| 구분 | 평균 도달 R | 클리어율 | 평균 점수 | 최고 점수 | 평균 최고 Lv | 레전더리 이상 보유 |\n|---|---|---|---|---|---|---|";
if (process.argv.includes("--pol")) Object.assign(POL, JSON.parse(process.argv[process.argv.indexOf("--pol") + 1]));
if (mode === "ab") {
  const a = batch(N, { oldUp: true }), b = batch(N, {});
  console.log(HDR); console.log(row("변경 전 (1+0.35lv)", a)); console.log(row("변경 후 (+0.008lv²)", b));
  const noLeg = (x) => x.rs.filter((r) => r.top < 6); const m = (x) => { const l = noLeg(x); return l.length ? `${l.length}판 평균 ${Math.round(l.reduce((s, r) => s + r.score, 0) / l.length)} / 최고 ${Math.max(...l.map((r) => r.score))}` : "-"; };
  console.log(`\n레전더리 미보유 판: 전 ${m(a)} · 후 ${m(b)}`);
} else if (mode === "heroes") {
  const ids = ["bee", "goose", "weasel", "whale", "hedgehog", "chameleon", "frog", "penguin", "fennec", "owlsage"];
  const out = ids.map((h) => [h, batch(N, { hero: h })]);
  const mean = out.reduce((a, [, b]) => a + b.round, 0) / out.length;
  console.log("| 히어로 | 평균 도달 R | 클리어율 | 평균 점수 | 최고 점수 | 평균 최고 Lv | 레전더리 이상 보유 | 평균 대비 |\n|---|---|---|---|---|---|---|---|");
  for (const [h, b] of out) console.log(row(h, b) + ` ${((b.round / mean - 1) * 100).toFixed(1)}% |`);
  console.log(`\n전체 평균 도달 R ${mean.toFixed(2)}`);
} else if (mode === "one") {
  const b = batch(N, { hero: process.argv[3] }); console.log(HDR); console.log(row(process.argv[3], b));
}
