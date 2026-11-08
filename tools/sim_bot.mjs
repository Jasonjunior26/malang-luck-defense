// 밸런스 시뮬: 헤드리스 엔진(engine.js)으로 간단한 봇을 돌려 도달 라운드/클리어율/점수를 잰다.
// 사용: node tools/build_engine.js 후
//   node tools/sim_bot.mjs ab [N]       공업 계수 이전(0.35/0.008)/현재 비교 (히어로는 시드대로)
//   node tools/sim_bot.mjs heroes [N]   히어로 10종별 (heroPool 로 고정)
//   node tools/sim_bot.mjs one <heroId> [N]
//   node tools/sim_bot.mjs comp [N]     자연 구성별 집계: 51R 진입 시점 구성(레전더리 1+ / 에픽 4+ / 그 외)으로 나눠 55·60 도달률
//   node tools/sim_bot.mjs scen [N]     구성 강제 시나리오(low3/e4/e4eco/leg1/leg1eco)별 클리어율·점수
//   node tools/sim_bot.mjs table        51~60R(및 50R) 실제 몹 체력·방어·시간 표
// 봇: 선택권은 가장 강한 무리로, 합성 가능하면 전부 합성, 미네랄이 생기면 뽑기(자리 없으면 약한 유닛 판매),
//     남는 미네랄은 강한 무리 공업 강화, 공업 6단계마다 사거리 1단계. 시드 7919 x 1..N 고정.
// 시나리오(force): R41 시작 시 주력 무리에 유닛을 넣고(치트), 이후 구성을 유지한다.
//   low3 = 레전더리 금지(에픽 합성 안 함·생기면 제거) + 에픽 최대 3기(초과분 제거, 41R 에 3기까지 채움)
//   e4   = 레전더리 금지 + 41R 에 주력 무리 에픽 4기 이상 채움     leg1 = 41R 에 레전더리 없으면 주력 무리 레전더리 1기
//   *eco = 수입 +50% 봇("잘 키운" 근사, 공업 Lv 가 높아짐)
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { createEngine } = await import(pathToFileURL(path.join(root, "supabase/functions/submit-score/engine.js")).href);

const TUNE = process.env.TUNE ? JSON.parse(process.env.TUNE) : null;
const PTS = (g) => Math.pow(3.5, g); // 등급별 화력 근사(baseDps 비)
function comp(S) { // 필드 구성: 레전더리 이상 수, 에픽 수
  let leg = 0, epic = 0; for (const s of S.slots) if (s && !s.hero) { const g = s.ch >> 2; if (g >= 6) leg += s.n; else if (g === 5) epic += s.n; }
  return { leg, epic };
}
function play(seed, opt = {}) {
  const e = createEngine();
  if (opt.up) { e.CONST.UP_STEP = opt.up[0]; e.CONST.UP_STEP2 = opt.up[1]; }
  if (TUNE) for (const [k, v] of Object.entries(TUNE)) { const R = e.dbg.ROUNDS[+k.slice(1) - 1]; if (k[0] === "h") R[5] = v; else if (k[0] === "t") R[10] = v; else if (k[0] === "a") R[6] = v; } // 튜닝용: {"h55":hp,"t60":초,"a57":방어}
  const S = opt.mine ? e.start(seed, null, opt.mine) : e.start(seed, opt.hero ? { heroPool: [opt.hero] } : null), G = e.GAME, K = e.CONST, D = e.dbg;
  const power = () => { const p = [0, 0, 0, 0]; for (const s of S.slots) if (s && !s.hero) p[s.ch & 3] += PTS(s.ch >> 2) * s.n; return p; };
  let main = -1;
  const best = () => { if (main >= 0) return main; const p = power(); let b = 0; for (let c = 1; c < 4; c++) if (p[c] > p[b]) b = c; if (opt.focusR && S.round >= opt.focusR) main = b; return b; };
  const upCost = (c) => K.UP_COST0 + K.UP_COSTK * S.up[c].bought;
  const F = opt.force || "", noLeg = F.startsWith("low3") || F.startsWith("e4"), maxEpic = F.startsWith("low3") ? 3 : 99;
  let injected = false, snap51 = null, maxLv = 0;
  const canMergeBot = (s) => { const g = s.ch >> 2; if (g >= 6) return false; if (noLeg && g === 5) return false; if (g === 4 && comp(S).epic >= maxEpic) return false; return true; };
  const mergeAll = () => { for (let i = 0; i < 20; i++) { const s = S.slots[i]; if (s && !s.hero && s.n >= 3 && canMergeBot(s)) G.merge(i, true); } };
  const remove = (pred, keep) => { // 조건에 맞는 유닛을 keep 개만 남기고 제거(치트: 미네랄 없음). 주력 무리를 우선 남긴다.
    const b = best(); let left = keep; const idx = [];
    for (let i = 0; i < 20; i++) { const s = S.slots[i]; if (s && !s.hero && pred(s)) idx.push(i); }
    idx.sort((x, y) => ((S.slots[y].ch & 3) === b) - ((S.slots[x].ch & 3) === b));
    let ch = false;
    for (const i of idx) { const s = S.slots[i]; const k = Math.min(s.n, left); left -= k; if (k < s.n) { s.n = k; ch = true; if (!k) S.slots[i] = null; } }
    if (ch) D.afterChange();
  };
  const enforce = () => {
    if (noLeg) remove((s) => (s.ch >> 2) >= 6, 0);
    if (maxEpic < 99) remove((s) => (s.ch >> 2) === 5, maxEpic);
  };
  let n = 0;
  while (!S.over && n < 60 * 60 * 60) {
    n++;
    if (S.paused) {
      while (S.tickets.length) { const g = S.tickets[0]; if (!G.useTicket(g * 4 + best())) { let ok = false; for (let c = 0; c < 4 && !ok; c++) ok = G.useTicket(g * 4 + c); if (!ok) break; } }
      while (S.upTickets > 0) G.useUpTicket(best());
      S.paused = false;
    }
    if (F && !injected && S.round >= 41) { // 구성 강제(치트)
      injected = true; const b = best(), c0 = comp(S);
      const need = F.startsWith("leg1") ? (c0.leg ? 0 : 1) : 0, needE = F.startsWith("e4") ? Math.max(0, 4 - c0.epic) : F.startsWith("low3") ? Math.max(0, 3 - c0.epic) : 0;
      for (let i = 0; i < need; i++) { if (!S.slots.some((x) => !x)) remove((s) => (s.ch >> 2) <= 2 && (s.ch & 3) !== b, 0); D.addUnit(6 * 4 + b); }
      for (let i = 0; i < needE; i++) { if (!S.slots.some((x) => !x) && !S.slots.some((s) => s && s.ch === 5 * 4 + b)) remove((s) => (s.ch >> 2) <= 2 && (s.ch & 3) !== b, 0); D.addUnit(5 * 4 + b); }
    }
    if (n % 10 === 0) {
      mergeAll(); if (F) enforce();
      const b = best();
      const want = Math.min(K.UP_MAX, Math.floor(S.round * opt.upK));
      let save = false;
      if (S.up[b].bought < want) { if (!G.upgrade(b) && S.slots.filter((x) => !x).length < opt.freeKeep) save = true; }
      const rc = G.rangeCost(b);
      if (!save && rc >= 0 && S.rangeUp[b] < Math.floor(S.up[b].bought / opt.rgEvery)) { if (!G.rangeUp(b) && S.slots.filter((x) => !x).length < opt.freeKeep) save = true; }
      let guard = 0;
      while (!save && guard++ < 30 && S.minerals >= G.drawCost()) {
        if (!S.slots.some((x) => !x)) {
          let si = -1, sg = 9;
          for (let i = 0; i < 20; i++) { const s = S.slots[i]; if (s && !s.hero && (s.ch & 3) !== b && s.n < 3 && (s.ch >> 2) < sg && (s.ch >> 2) <= opt.sellG) { sg = s.ch >> 2; si = i; } }
          if (si < 0 || !G.sell(si)) break;
        }
        if (!G.draw()) break;
        mergeAll();
      }
      if (F) enforce();
      if (S.minerals >= upCost(b)) G.upgrade(b);
      maxLv = Math.max(maxLv, ...S.lv);
    }
    if (!snap51 && S.round >= 51) snap51 = { ...comp(S), lv: Math.max(...S.lv) };
    const m0 = S.minerals; e.update(K.DT);
    if (opt.eco && S.minerals > m0) S.minerals += Math.round((S.minerals - m0) * opt.eco);
  }
  const r = e.result() || { round: S.round, win: false, score: S.score(), build: null };
  const bm = S.mobs.find((m) => m.boss), bossLeft = !r.win && bm ? bm.hp / bm.max : 0;
  return { bossLeft, bossDeath: !r.win && !!bm && S.mobs.length < K.MOB_LOSE, round: r.round, win: !!r.win, score: r.score, hero: r.hero, top: r.build ? r.build.top : -1, lv: r.build ? Math.max(...r.build.clans.map((c) => c.lv)) : 0, snap51 };
}
const POL = { upK: 0.3, rgEvery: 6, freeKeep: 6, focusR: 0, sellG: 2, eco: 0 };
const R_END = 60;
function summ(rs) {
  const avg = (f) => rs.length ? rs.reduce((a, r) => a + f(r), 0) / rs.length : 0;
  const bl = (R) => { const l = rs.filter((r) => r.round === R && !r.win && r.bossDeath); return l.length ? +(l.reduce((a, r) => a + r.bossLeft, 0) / l.length * 100).toFixed(0) : -1; };
  return { n: rs.length, round: +avg((r) => r.round).toFixed(2), clear: +(avg((r) => (r.win ? 1 : 0)) * 100).toFixed(1), score: Math.round(avg((r) => r.score)), max: rs.length ? Math.max(...rs.map((r) => r.score)) : 0,
    lv: +avg((r) => r.lv).toFixed(1), leg: +(avg((r) => (r.top >= 6 ? 1 : 0)) * 100).toFixed(0), bd: +(avg((r) => (r.bossDeath ? 1 : 0)) * 100).toFixed(0),
    n50: rs.filter((r) => r.round > 50 || r.win).length, n55: rs.filter((r) => r.round > 55 || r.win).length, b50: bl(50), b55: bl(55), b60: bl(60), rs };
}
function batch(N, opt) { const rs = []; for (let s = 1; s <= N; s++) rs.push(play(s * 7919, { ...POL, ...opt })); return summ(rs); }
const mode = process.argv[2] || "ab", N = +(process.argv[mode === "one" ? 4 : 3] || 30);
const row = (name, b) => `| ${name} | ${b.round} | ${b.clear}% | ${b.score} | ${b.max} | ${b.lv} | ${b.leg}% |` + (process.env.X ? ` 보스패배 ${b.bd}% 50클리어 ${b.n50} 55클리어 ${b.n55} 보스잔여 50:${b.b50}% 55:${b.b55}% 60:${b.b60}%` : "");
const HDR = "| 구분 | 평균 도달 R | 클리어율 | 평균 점수 | 최고 점수 | 평균 최고 Lv | 레전더리 이상 보유 |\n|---|---|---|---|---|---|---|";
if (process.argv.includes("--pol")) Object.assign(POL, JSON.parse(process.argv[process.argv.indexOf("--pol") + 1]));
const srow = (name, b) => `| ${name} | ${b.n} | ${b.round} | ${b.n50}/${b.n} | ${b.n55}/${b.n} | ${b.clear}% | ${b.score} | ${b.lv} | ${b.b55}% / ${b.b60}% |` + (process.env.X ? (() => {
  const l = b.rs.filter((r) => r.snap51), av = (f) => l.length ? (l.reduce((a, r) => a + f(r), 0) / l.length).toFixed(1) : "-", h = {};
  for (const r of b.rs) if (!r.win && r.round > 50) h[r.round] = (h[r.round] || 0) + 1;
  return ` 51R 에픽 ${av((r) => r.snap51.epic)} 레전 ${av((r) => r.snap51.leg)} Lv ${av((r) => r.snap51.lv)} 패배R ${JSON.stringify(h)}`; })() : "");
const SHDR = "| 구성 | 판 | 평균 도달 R | 50R 클리어 | 55R 클리어 | 60R 클리어율 | 평균 점수 | 평균 최고 Lv | 55·60 보스 잔여 |\n|---|---|---|---|---|---|---|---|---|";
if (mode === "ab") {
  const a = batch(N, { up: [0.35, 0.008] }), b = batch(N, {});
  console.log(HDR); console.log(row("이전 (0.35lv+0.008lv²)", a)); console.log(row("현재 (0.385lv+0.0088lv²)", b));
} else if (mode === "heroes") {
  const ids = ["bee", "goose", "weasel", "whale", "hedgehog", "chameleon", "frog", "penguin", "fennec", "owlsage"];
  const out = ids.map((h) => [h, batch(N, { hero: h })]);
  const mean = out.reduce((a, [, b]) => a + b.round, 0) / out.length;
  console.log("| 히어로 | 평균 도달 R | 클리어율 | 평균 점수 | 최고 점수 | 평균 최고 Lv | 레전더리 이상 보유 | 평균 대비 |\n|---|---|---|---|---|---|---|---|");
  for (const [h, b] of out) console.log(row(h, b) + ` ${((b.round / mean - 1) * 100).toFixed(1)}% |`);
  console.log(`\n전체 평균 도달 R ${mean.toFixed(2)}`);
} else if (mode === "one") {
  const b = batch(N, { hero: process.argv[3] }); console.log(HDR); console.log(row(process.argv[3], b));
} else if (mode === "comp") { // 자연 구성: 51R 진입 판만 구성별로
  for (const [nm, o] of [["기본 봇", {}], ["수입 +50% 봇", { eco: 0.5 }]]) {
    const all = batch(N, o), got = all.rs.filter((r) => r.snap51);
    const grp = { "레전더리 1+": got.filter((r) => r.snap51.leg >= 1), "에픽 4+ (레전 없음)": got.filter((r) => !r.snap51.leg && r.snap51.epic >= 4), "에픽 3 이하 (레전 없음)": got.filter((r) => !r.snap51.leg && r.snap51.epic < 4) };
    console.log(`\n${nm}: ${N}판 중 51R 진입 ${got.length}판, 전체 평균 R ${all.round}, 60R 클리어 ${all.clear}%`); console.log(SHDR);
    for (const [g, l] of Object.entries(grp)) console.log(srow(g, summ(l)));
  }
} else if (mode === "scen") {
  const list = (process.env.SC || "low3,low3eco,e4,e4eco,leg1,leg1eco").split(",");
  console.log(SHDR);
  for (const f of list) console.log(srow(f, batch(N, { force: f, eco: f.endsWith("eco") ? 0.5 : 0 })));
} else if (mode === "mine") { // 내 영웅 v2: 운빨 리그(시드 영웅) vs 기본 영웅(능력 없음) vs 풀빌드(전투력 상한 = 최악의 경우) 장착 조합별
  const E = await import(pathToFileURL(path.join(root, "supabase/functions/submit-score/engine.js")).href);
  const full = {}; for (const it of E.MY_ITEMS) full[it.id] = it.max;
  const noSk = Object.fromEntries(Object.entries(full).filter(([k]) => !k.startsWith("sk_")));
  const L = [["운빨 리그(시드 영웅)", {}], ["내 영웅 기본(능력 없음)", { mine: { design: "cat", items: {}, equip: [] } }],
    ["풀빌드 스킬 미장착", { mine: { design: "cat", items: noSk, equip: [] } }]];
  for (const eq of (process.env.EQ || "sk_storm+sk_meteor,sk_nova+sk_storm,sk_chain+sk_storm,sk_beam+sk_meteor").split(",")) L.push(["풀빌드 " + eq, { mine: { design: "cat", items: full, equip: eq.split("+") } }]);
  if (process.env.HALF) { const half = {}; for (const it of E.MY_ITEMS) half[it.id] = Math.ceil(it.max / 2); L.push(["절반빌드 sk_storm+sk_meteor", { mine: { design: "cat", items: half, equip: ["sk_storm", "sk_meteor"] } }]); }
  if (process.env.ONE) { L.length = 2; for (const it of E.MY_ITEMS) if (!it.sk && it.id !== "coin") L.push(["단독 " + it.id + " " + it.max, { mine: { design: "cat", items: { [it.id]: it.max }, equip: [] } }]); }
  if (process.env.BUILDS) { L.length = 2; for (const [nm, b] of Object.entries(JSON.parse(process.env.BUILDS))) L.push([nm + " (전투력 " + E.myPower(b.items) + ")", { mine: { design: "cat", equip: [], ...b } }]); } // {"이름":{items,equip}}
  console.log(HDR);
  for (const [nm, o] of L) { const v = o.mine ? E.validateMine(o.mine) : { ok: true }; if (!v.ok) { console.log("invalid", nm, v.err); continue; } console.log(row(nm, batch(N, o))); }
} else if (mode === "table") {
  const e = createEngine(); e.start(1, null);
  console.log("| R | 이름 | 개체 HP(배율 적용) | 수 | 라운드 총 HP | 방어 | 시간 |\n|---|---|---|---|---|---|---|");
  for (let r = 46; r <= R_END; r++) { const i = e.dbg.roundInfo(r), hp = Math.round(i.hp * e.dbg.hpMul(i.r)); console.log(`| ${r} | ${i.name} | ${hp} | ${i.n} | ${hp * i.n} | ${i.armor}% | ${i.boss ? i.time + "s" : "-"} |`); }
}
