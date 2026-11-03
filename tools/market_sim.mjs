// 코인 마켓 확률 시뮬레이션 (게임 코드 import 없음, 독립 실행). 설계: docs/코인마켓_설계.md
// 실행: node tools/market_sim.mjs [--quick]   (기본 N=20000, --quick 은 N=3000)
// 출력: (a) 진열 분포 vs 표, (b) 희귀 등장 방문수 분위수, (c) 풀 강화까지 방문/판 수
let COINMUL = 1;
const QUICK = process.argv.includes("--quick");
const N = QUICK ? 3000 : 20000;

// ---------- 설계 상수 (문서 표와 동일하게 유지) ----------
export const CFG = {
  tierNames: ["커먼", "레어", "유니크", "히든", "에픽"],
  tierP: [55, 28, 12, 4, 1],                 // 칸당 희귀도 확률(%)
  baseSlots: 5,
  events: [["평범", 79], ["특가", 10], ["보너스칸", 6], ["수상한상인", 3], ["대박세일", 2]], // 방문당 이벤트(%)
  mysteryTierP: [0, 30, 40, 22, 8], mysterySlots: 3, mysteryPriceMul: 0.85,
  stampEvery: 10,                            // 단골 도장: 10번째 방문마다 6번째 칸(레어+ 보장)
  pity: { U: 3, H: 10, E: 30 },              // 연속 방문 N회 못 봤으면 다음 방문에 해당 등급 이상 1칸 보장
  catW: { 강화권: 14, 조각: 24, 각인: 14, 부스터: 18, 도박: 12, 환급: 6, 꾸미기: 12 },
  refresh: [0, 20, 40, 80, 160],             // 새로고침 비용(방문당 n번째, 5번째부터 160 고정). 0 은 일일 무료
  freeEvery: 3,                              // 시뮬 가정: 하루 3판 -> 3방문마다 무료 1회
  stepCost: [60, 100, 160, 240, 340], stepMax: [5, 5, 3, 5], stepCap: 10, // 기존 MY_HERO 와 동일
  pieceCap: { atk: 6, rew: 6, disc: 4, start: 6, coin: 6 },
};
// 품목: [id, 이름, 카테고리, 등급(0~4), 가격하한, 상한, 대상(h=영웅한정), 구분]
export const ITEMS = [
  ["cheer", "말랑 응원권", "강화권", 0, 35, 50, "h", "1회"],
  ["pc_atk", "도토리 조각", "조각", 0, 20, 30, "h", "영구"],
  ["pc_rew", "금빛 조각", "조각", 0, 20, 30, "h", "영구"],
  ["pc_disc", "알뜰 조각", "조각", 0, 20, 30, "h", "영구"],
  ["pc_start", "주머니 조각", "조각", 0, 20, 30, "h", "영구"],
  ["lunch", "든든 도시락", "부스터", 0, 25, 35, "c", "1회"],
  ["drawcp", "뽑기 할인권", "부스터", 0, 25, 35, "c", "1회"],
  ["lotto", "말랑 복권", "도박", 0, 25, 25, "c", "1회"],
  ["coupon", "에누리 쿠폰", "환급", 0, 20, 30, "c", "1회"],
  ["namecol", "이름 물들이기", "꾸미기", 0, 40, 60, "h", "영구"],
  ["spark", "반짝 강화권", "강화권", 1, 120, 180, "h", "1회"],
  ["pc_coin", "코인 조각", "조각", 1, 50, 70, "h", "영구"],
  ["flip", "뒤집기 카드", "도박", 1, 45, 60, "h", "1회"],
  ["ribbon", "코인 리본", "부스터", 1, 45, 65, "c", "1회"],
  ["freeref", "새로고침 무료권", "환급", 1, 45, 70, "c", "1회"],
  ["eng_slow", "느릿 각인", "각인", 1, 110, 160, "h", "영구"],
  ["title", "이름표 칭호", "꾸미기", 1, 90, 130, "h", "영구"],
  ["eng_money", "두둑 각인", "각인", 2, 300, 420, "h", "영구"],
  ["eng_frost", "서리 각인", "각인", 2, 320, 440, "h", "영구"],
  ["eng_hawk", "사냥꾼 각인", "각인", 2, 320, 440, "h", "영구"],
  ["eng_twin", "쌍둥이 각인", "각인", 2, 360, 480, "h", "영구"],
  ["egg", "수상한 알", "도박", 2, 280, 320, "c", "지연"],
  ["namefx", "반짝 이름", "꾸미기", 2, 220, 300, "h", "영구"],
  ["eng_luck", "행운 각인", "각인", 3, 700, 900, "h", "영구"],
  ["eng_star", "별똥 각인", "각인", 3, 750, 950, "h", "영구"],
  ["charm", "행운 부적", "부스터", 3, 250, 350, "c", "1회"],
  ["pick", "방향 지정권", "강화권", 3, 700, 900, "h", "1회"],
  ["eng_glow", "별빛 각인", "각인", 4, 1800, 2200, "h", "영구"],
  ["crown", "무지개 왕관 이름", "꾸미기", 4, 1200, 1500, "h", "영구"],
  ["jackpot", "황금 복권", "도박", 4, 250, 300, "c", "1회"],
].map(([id, name, cat, tier, lo, hi, scope, kind]) => ({ id, name, cat, tier, lo, hi, scope, kind }));

// ---------- 유틸 ----------
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pickW = (r, w) => { const s = w.reduce((a, b) => a + b, 0); let x = r() * s; for (let i = 0; i < w.length; i++) { x -= w[i]; if (x < 0) return i; } return w.length - 1; };
const q = (arr, p) => { const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const f = (x, d = 1) => x.toFixed(d);
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const nrm = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

// ---------- 진열 생성 ----------
// st: {missU, missH, missE, visits}  heroes: [{eng, pc:{}}] | null(전부 유효)  opts:{pity:true}
function eligible(it, heroes) {
  if (!heroes || it.scope === "c") return true;
  return heroes.some((h) => canUse(it, h));
}
function canUse(it, h) {
  if (it.cat === "조각") { const k = it.id.slice(3); return (h.pc[k] || 0) < CFG.pieceCap[k]; }
  if (it.cat === "각인") return h.engTier < it.tier;       // 같거나 높은 각인이 있으면 걸러냄
  if (it.cat === "강화권") return h.stepsDone < CFG.stepCap || it.id === "pick";
  return true; // 꾸미기 등: 시뮬에서는 항상 유효
}
function drawItem(r, tier, heroes, used) {
  for (let t = tier; t >= 0; t--) {
    const pool = ITEMS.filter((i) => i.tier === t && !used.has(i.id) && eligible(i, heroes));
    if (!pool.length) continue;
    const cnt = {}; pool.forEach((i) => (cnt[i.cat] = (cnt[i.cat] || 0) + 1));
    return pool[pickW(r, pool.map((i) => CFG.catW[i.cat] / cnt[i.cat]))];
  }
  return null;
}
function price(r, it) { return Math.round((it.lo + r() * (it.hi - it.lo)) / 5) * 5; }

export function rollShelf(r, st, heroes, opts = {}) {
  const usePity = opts.pity !== false;
  st.visits++;
  const ev = CFG.events[pickW(r, CFG.events.map((e) => e[1]))][0];
  const mystery = ev === "수상한상인";
  let n = mystery ? CFG.mysterySlots : CFG.baseSlots + (ev === "보너스칸" ? 1 : 0);
  const stamp = !mystery && st.visits % CFG.stampEvery === 0;
  const tierP = mystery ? CFG.mysteryTierP : CFG.tierP;
  const used = new Set(), shelf = [];
  const add = (tier, extra = {}) => { const it = drawItem(r, tier, heroes, used); if (!it) return; used.add(it.id); shelf.push({ it, tier: it.tier, price: price(r, it) * (mystery ? CFG.mysteryPriceMul : 1), ...extra }); };
  for (let i = 0; i < n; i++) add(pickW(r, tierP));
  if (stamp) add(1 + pickW(r, [28, 12, 4, 1]), { stamp: 1 });
  // 피티: 못 본 방문 수가 임계 이상이면 한 칸을 해당 등급 이상으로 교체
  const has = (t) => shelf.some((s) => s.tier >= t);
  const force = (minTier, w) => { if (has(minTier)) return; const idx = shelf.findIndex((s) => !s.stamp); if (idx < 0) return; const save = shelf[idx]; if (save) used.delete(save.it.id); const t = minTier + pickW(r, w); shelf.splice(idx, 1); add(t, { pity: 1 }); };
  if (usePity) {
    if (st.missE >= CFG.pity.E) force(4, [1]);
    if (st.missH >= CFG.pity.H) force(3, [4, 1]);
    if (st.missU >= CFG.pity.U) force(2, [12, 4, 1]);
  }
  if (ev === "특가") { const c = shelf.filter((s) => !s.stamp); const s = c[Math.floor(r() * c.length)]; if (s) { s.price = Math.round(s.price * 0.6 / 5) * 5; s.sale = 1; } }
  if (ev === "대박세일") shelf.forEach((s) => (s.price = Math.round(s.price * 0.8 / 5) * 5));
  st.missU = has(2) ? 0 : st.missU + 1; st.missH = has(3) ? 0 : st.missH + 1; st.missE = has(4) ? 0 : st.missE + 1;
  return { ev, shelf };
}
const newSt = () => ({ visits: 0, missU: 0, missH: 0, missE: 0 });

// ---------- (a) 분포 검증 ----------
function simA() {
  const r = rng(1), st = newSt();
  const cnt = [0, 0, 0, 0, 0]; let slots = 0, visits = 200000; const evc = {}; let nslots = 0;
  for (let v = 0; v < visits; v++) {
    const { ev, shelf } = rollShelf(r, st, null, { pity: false });
    evc[ev] = (evc[ev] || 0) + 1;
    if (ev !== "수상한상인") for (const s of shelf) if (!s.stamp) { cnt[s.tier]++; slots++; }
    nslots += shelf.length;
  }
  // 피티 포함 분포
  const r2 = rng(2), st2 = newSt(), cnt2 = [0, 0, 0, 0, 0]; let sl2 = 0;
  for (let v = 0; v < visits; v++) { const { ev, shelf } = rollShelf(r2, st2, null, { pity: true }); if (ev !== "수상한상인") for (const s of shelf) if (!s.stamp) { cnt2[s.tier]++; sl2++; } }
  const catc = {}; let ct = 0; const r3 = rng(3), st3 = newSt();
  for (let v = 0; v < visits; v++) for (const s of rollShelf(r3, st3, null, { pity: false }).shelf) { catc[s.it.cat] = (catc[s.it.cat] || 0) + 1; ct++; }
  return { cnt, slots, cnt2, sl2, evc, visits, avgSlots: nslots / visits, catc, ct };
}

// ---------- (b) 희귀 등장 방문수 ----------
function simB(pity, minTier) {
  const out = [];
  for (let i = 0; i < N; i++) {
    const r = rng(1000 + i), st = newSt(); let v = 0;
    for (;;) { v++; const { shelf } = rollShelf(r, st, null, { pity }); if (shelf.some((s) => s.tier >= minTier)) break; if (v > 5000) break; }
    out.push(v);
  }
  return out;
}

// ---------- (c) 풀 강화 ----------
const newHero = () => ({ pc: { atk: 0, rew: 0, disc: 0, start: 0, coin: 0 }, st: [0, 0, 0, 0], stepsDone: 0, engTier: -1, coupon: 0 });
const heroDone = (h, needEng) => h.stepsDone >= CFG.stepCap && Object.keys(CFG.pieceCap).every((k) => h.pc[k] >= CFG.pieceCap[k]) && (!needEng || h.engTier >= 2);
const nextStepCosts = (h) => h.st.map((n, d) => (n < CFG.stepMax[d] ? CFG.stepCost[n] : Infinity));
function buyStep(h, coins, free = false, dir = -1) { // 가장 싼 단계 구매(쿠폰 있으면 가장 비싼 단계에 적용하지 않고 다음 단계에 30% 할인)
  const c = nextStepCosts(h); const d = dir >= 0 ? dir : c.indexOf(Math.min(...c));
  if (h.stepsDone >= CFG.stepCap || c[d] === Infinity) return coins;
  let cost = c[d]; if (h.coupon && !free) { cost = Math.round(cost * 0.7); }
  if (!free && coins < cost) return coins;
  if (h.coupon && !free) h.coupon = 0;
  h.st[d]++; h.stepsDone++; return free ? coins : coins - cost;
}
function income(r, level) {
  const mu = level === "casual" ? 26 : 38, sd = level === "casual" ? 8 : 8;
  const rd = Math.max(6, Math.min(50, Math.round(mu + sd * nrm(r))));
  const win = rd >= 50 && r() < (level === "casual" ? 0.15 : 0.3);
  // 현행 data.js coinsFor: max(0,R-9) + floor(kills/50) + 클리어 30. kills 는 라운드당 약 42기(봇 R40 약 1700)로 가정. COINMUL 은 제안 배율
  return Math.floor((Math.max(0, rd - 9) + Math.floor((rd * 42) / 50) + (win ? 30 : 0)) * COINMUL);
}
// k: 등록 영웅 수, policy: "spender" | "saver", fun: 재미 소비 비율(풀 강화와 무관한 구매)
function simC(k, level, policy, needEng, fun = 0.2, seedBase = 5000) {
  const games = [], gamesBase = [];
  let ok = 0;
  for (let i = 0; i < N; i++) {
    const r = rng(seedBase + i), st = newSt(), heroes = Array.from({ length: k }, newHero);
    let coins = 0, g = 0, firstDone = -1, baseDone = -1; const hist = [];
    for (; g < 400; g++) {
      const h = heroes[Math.floor(r() * k)];
      const boost = 1 + 0.05 * h.st[1] + 0.01 * h.pc.coin; // rew 단계 +5%/단, 코인 조각 +1%/개
      coins += Math.floor(income(r, level) * boost * (1 - fun));
      const free = (g + 1) % CFG.freeEvery === 0;
      let { shelf } = rollShelf(r, st, heroes);
      const useful = () => shelf.some((s) => s.it.scope === "c" ? false : heroes.some((h2) => canUse(s.it, h2)) && s.it.cat !== "꾸미기");
      if (free && !useful()) shelf = rollShelf(r, st, heroes).shelf;
      // 구매 우선순위: 각인(유니크+) > 조각/강화권(저렴한 순)
      const needEngNow = heroes.some((h2) => h2.engTier < 2);
      const reserve = policy === "saver" && needEng && needEngNow ? 500 : 0;
      shelf.sort((a, b) => (b.it.cat === "각인") - (a.it.cat === "각인") || a.price - b.price);
      for (const s of shelf) {
        const it = s.it;
        if (it.cat === "각인") {
          if (it.tier < 2 || s.price > coins) continue;
          const hh = heroes.filter((h2) => h2.engTier < it.tier).sort((a, b) => a.engTier - b.engTier)[0]; if (!hh) continue;
          coins -= s.price; hh.engTier = it.tier;
        } else if (it.cat === "조각") {
          if (coins - s.price < reserve) continue; const key = it.id.slice(3);
          const hh = heroes.find((h2) => h2.pc[key] < CFG.pieceCap[key]); if (!hh || s.price > coins) continue;
          coins -= s.price; hh.pc[key]++;
        } else if (it.id === "cheer") {
          const hh = heroes.find((h2) => h2.stepsDone < CFG.stepCap && !h2.coupon); const mx = hh && Math.max(...nextStepCosts(hh).filter(isFinite));
          if (hh && mx >= 160 && coins - s.price >= reserve && s.price <= coins) { coins -= s.price; hh.coupon = 1; }
        } else if (it.id === "spark") {
          const hh = heroes.find((h2) => h2.stepsDone < CFG.stepCap); if (!hh || coins - s.price < reserve || s.price > coins) continue;
          const cs = nextStepCosts(hh), cand = cs.map((c, d) => (isFinite(c) ? d : -1)).filter((d) => d >= 0);
          const d = cand[Math.floor(r() * cand.length)]; if (cs[d] < s.price * 1.2) continue;
          coins -= s.price; buyStep(hh, 0, true, d);
        }
      }
      // 남은 코인으로 직접 단계 구매(싼 순)
      if (!reserve) for (const h2 of heroes) { let before; do { before = coins; coins = buyStep(h2, coins); } while (coins !== before); }
      if (firstDone < 0 && heroes.some((h2) => heroDone(h2, needEng))) firstDone = g + 1;
      if (heroes.every((h2) => heroDone(h2, needEng))) { baseDone = g + 1; break; }
    }
    if (baseDone > 0) ok++;
    games.push(firstDone > 0 ? firstDone : 401); gamesBase.push(baseDone > 0 ? baseDone : 401);
  }
  return { first: games, all: gamesBase };
}


// ---------- (e) 코인 획득 경로 + 수입/지출 곡선 ----------
// 현행 정산식(data.js coinsFor: max(0,R-9) + floor(kills/50) + 클리어 30)은 그대로 두고 그 위에 '운 층'을 얹는 제안을 모델링한다.
export const INC = {
  bossDrop: [[72, 1], [20, 3], [7, 8], [1, 25]],     // 보스 처치 코인 주머니 [확률%, 코인]
  goldPerRound: 0.015, goldRange: [2, 6],             // 황금 몹: 라운드당 출현 확률, 처치 시 코인
  firstGrade: { lam: [0.04, 0.008, 0.0017], coin: [2, 5, 15] }, // 라운드당 히든/에픽/레전더리 첫 획득 기대 횟수(근사), 코인(판당 등급별 1회)
  mineMul: 1.05,                                       // 내 영웅 출전 +5%
  recordPer: 2, recordCap: 20,                        // 영웅별 최고 라운드 갱신 1라운드당 +2 (최대 20)
  dailyFirstMul: 1.2, dailyFirstCap: 15,             // 하루 첫 판 +20% (최대 +15)
  weekly: [[5, 10], [12, 20]],                        // 주간 도장: 주 5판 +10, 12판 +20 (한 번씩)
  gamesPerDay: { casual: 3, regular: 4 }, daysPerWeek: { casual: 4, regular: 5 },
  ach: { round: [[10, 20], [20, 30], [30, 50], [40, 80], [50, 150]], clear: 150, heroGames: [[10, 20], [30, 40], [100, 100]], grade: [30, 60, 120] },
};
const poisson = (r, l) => { let k = 0, p = Math.exp(-l), c = p, u = r(); while (u > c && k < 50) { k++; p *= l / k; c += p; } return k; };
function oneGame(r, level, st, hero, flags) { // st: 플레이어 누적 상태
  const mu = level === "casual" ? 26 : 38;
  const R = Math.max(6, Math.min(50, Math.round(mu + 8 * nrm(r)))), win = R >= 50 && r() < (level === "casual" ? 0.15 : 0.3);
  const kills = Math.round(R * 42 * (0.9 + 0.2 * r()));
  const part = { base: Math.max(0, R - 9) + Math.floor(kills / 50) + (win ? 30 : 0), boss: 0, gold: 0, grade: 0 };
  for (let b = 0; b < Math.floor(R / 5); b++) part.boss += INC.bossDrop[pickW(r, INC.bossDrop.map((x) => x[0]))][1];
  for (let i = 0; i < R; i++) if (r() < INC.goldPerRound) part.gold += INC.goldRange[0] + Math.floor(r() * (INC.goldRange[1] - INC.goldRange[0] + 1));
  INC.firstGrade.lam.forEach((l, i) => { if (poisson(r, l * R) > 0) { part.grade += INC.firstGrade.coin[i]; if (!st.grades.has(i)) { st.grades.add(i); st.ach += INC.ach.grade[i]; } } });
  let sub = part.base + part.boss + part.gold + part.grade;
  const mineB = flags.mine ? sub * (INC.mineMul - 1) : 0;
  const delta = Math.max(0, R - (st.best[hero] || 0)); const rec = st.best[hero] ? Math.min(INC.recordCap, delta * INC.recordPer) : 0; st.best[hero] = Math.max(st.best[hero] || 0, R);
  let tot = sub + mineB + rec;
  const dail = flags.first ? Math.min(INC.dailyFirstCap, tot * (INC.dailyFirstMul - 1)) : 0; tot += dail;
  for (const [t, c] of INC.ach.round) if (R >= t && !st.rd.has(t)) { st.rd.add(t); st.ach += c; }
  if (win && !st.clear) { st.clear = 1; st.ach += INC.ach.clear; }
  st.hg[hero] = (st.hg[hero] || 0) + 1; for (const [t, c] of INC.ach.heroGames) if (st.hg[hero] === t) st.ach += c;
  return { tot, parts: { ...part, mine: mineB, rec, dail }, R, win };
}
function simE(level, mineOn) {
  const checkpoints = [10, 25, 50, 100, 200, 400], cum = checkpoints.map(() => []); const sh = {}; const per = []; let shareN = 0;
  for (let i = 0; i < Math.min(N, 3000); i++) {
    const r = rng(9000 + i), st = { grades: new Set(), rd: new Set(), best: {}, hg: {}, ach: 0, clear: 0 };
    let c = 0, g = 0, wk = 0, wkGames = 0, wkHit = new Set(); const gpd = INC.gamesPerDay[level], dpw = INC.daysPerWeek[level];
    for (let day = 0; g < 400; day++) {
      if (day % 7 === 0) { wkGames = 0; wkHit = new Set(); }
      if (day % 7 >= dpw) continue;
      for (let j = 0; j < gpd && g < 400; j++, g++) {
        const hero = Math.floor(r() * 3), o = oneGame(r, level, st, hero, { mine: mineOn, first: j === 0 });
        c += o.tot; per.push(o.tot); wkGames++;
        for (const [n, bonus] of INC.weekly) if (wkGames >= n && !wkHit.has(n)) { wkHit.add(n); c += bonus; sh.weekly = (sh.weekly || 0) + bonus; }
        if (g < 100) { for (const [k, v] of Object.entries(o.parts)) sh[k] = (sh[k] || 0) + v; shareN++; }
        const ci = checkpoints.indexOf(g + 1); if (ci >= 0) cum[ci].push(c + st.ach);
      }
    }
  }
  return { cum: cum.map((a, i) => [checkpoints[i], mean(a)]), per, share: Object.fromEntries(Object.entries(sh).map(([k, v]) => [k, v / shareN])) };
}
function reportE() {
  console.log("\n## (e) 코인 획득 경로 (현행 정산식 + 운 층 제안)");
  for (const level of ["casual", "regular"]) {
    const e = simE(level, true), per = e.per;
    const med = q(per, 0.5);
    console.log(`[${level === "casual" ? "캐주얼" : "보통"}] 판당(주간/업적 제외) 평균 ${f(mean(per))}, p10 ${q(per, 0.1).toFixed(0)}, p50 ${med.toFixed(0)}, p90 ${q(per, 0.9).toFixed(0)}, p99 ${q(per, 0.99).toFixed(0)} | 중앙값 2배 이상 ${f(per.filter((x) => x >= 2 * med).length / per.length * 100)}%`);
    console.log("  구성(첫 100판 판당 평균):", Object.entries(e.share).map(([k, v]) => `${k} ${f(v)}`).join(" "));
    console.log("  누적 수입(업적·주간·일일 포함) 판수:코인 =", e.cum.map(([g, v]) => `${g}:${f(v, 0)}`).join("  "));
  }
  // 싱크: 영웅 3종 풀(단계 960 + 조각 약 700 + 각인 약 400 = 약 2,060/영웅) 필수 + 반복 소비 가능액
  const r = rng(31), st = newSt(); let rep = 0, cosm = 0; const V = 60000;
  for (let v = 0; v < V; v++) for (const x of rollShelf(r, st, null).shelf) { if (["부스터", "도박", "환급"].includes(x.it.cat)) rep += x.price; if (x.it.cat === "꾸미기") cosm += x.price; }
  console.log(`\n싱크: 필수(3영웅 풀) 약 6,200 | 꾸미기 전부(영웅당 약 1,770 x3) 약 5,300 | 방문당 진열의 반복 소비 품목(부스터·도박·환급) 합계 평균 ${f(rep / V, 0)}, 꾸미기 ${f(cosm / V, 0)}`);
  console.log("새로고침: 20/40/80/160 (방문당, 판 수입의 0.3~3배) | 복권·알·부스터는 반복 싱크, 꾸미기는 유한 싱크");
}

if (process.argv.includes("--e")) { reportE(); process.exit(0); }
// ---------- 실행 ----------
const pct = (c, t) => c.map((x) => f((x / t) * 100, 2));
const A = simA();
console.log(`## (a) 진열 분포 (방문 ${A.visits}, 평균 칸수 ${f(A.avgSlots, 2)})`);
console.log("등급     표(%)   실측 피티OFF  실측 피티ON");
const a0 = pct(A.cnt, A.slots), a1 = pct(A.cnt2, A.sl2);
CFG.tierNames.forEach((n, i) => console.log(`${n.padEnd(6)} ${String(CFG.tierP[i]).padStart(6)} ${a0[i].padStart(10)} ${a1[i].padStart(12)}`));
console.log("이벤트(%):", Object.entries(A.evc).map(([k, v]) => `${k} ${f((v / A.visits) * 100, 2)}`).join(" | "));
console.log("카테고리(%):", Object.entries(A.catc).map(([k, v]) => `${k} ${f((v / A.ct) * 100, 1)}`).join(" | "));

console.log(`\n## (b) 희귀 등장까지 방문 수 (N=${N}, 모든 품목 유효 가정)`);
console.log("조건            피티  평균   p50  p90  p99  최대");
for (const [nm, mt] of [["유니크 이상", 2], ["히든 이상", 3], ["에픽", 4]]) for (const pity of [false, true]) {
  const v = simB(pity, mt);
  console.log(`${nm.padEnd(12)} ${pity ? " ON " : " OFF"} ${f(mean(v)).padStart(6)} ${String(q(v, 0.5)).padStart(5)} ${String(q(v, 0.9)).padStart(4)} ${String(q(v, 0.99)).padStart(4)} ${String(Math.max(...v)).padStart(5)}`);
}

const inc = (lv) => { const r = rng(9); const a = Array.from({ length: 20000 }, () => income(r, lv)); return `평균 ${f(mean(a), 0)}, p10 ${q(a, 0.1)}, p50 ${q(a, 0.5)}, p90 ${q(a, 0.9)}`; };
for (const cm of [1, 1.5]) {
COINMUL = cm;
console.log(`\n## (c) 풀 강화까지 판 수 [코인 배율 x${cm}] (방문=판 1:1, 재미 소비 20% 제외, N=${N})`);
console.log(`판당 코인: 캐주얼 ${inc("casual")} | 보통 ${inc("regular")}`);
console.log("풀 = 단계 10 + 조각 전부(28개) [+ 유니크 이상 각인]");
console.log("플레이어  영웅수 정책     목표        평균  p10  p50  p90");
for (const level of ["casual", "regular"]) for (const k of [1, 3]) for (const [policy, needEng] of [["spender", false], ["saver", true], ["spender", true]]) {
  const res = simC(k, level, policy, needEng);
  const show = (arr, lab) => { const a = arr.map((x) => Math.min(x, 400)); console.log(`${(level === "casual" ? "캐주얼" : "보통").padEnd(6)} ${String(k).padStart(5)}  ${policy.padEnd(8)} ${lab.padEnd(11)} ${f(mean(a), 0).padStart(5)} ${String(q(a, 0.1)).padStart(4)} ${String(q(a, 0.5)).padStart(4)} ${String(q(a, 0.9)).padStart(4)}`); };
  const tag = needEng ? "각인포함" : "각인없음";
  show(res.first, `첫영웅 ${tag}`.slice(0, 11)); if (k === 3) show(res.all, `3종모두 ${tag}`.slice(0, 11));
}
}
COINMUL = 1;
console.log("\n## (d) 한 방문 진열에서 예산별 평균 (피티 ON, 영웅 1종 등록·새 계정 기준 전부 유효)");
console.log("예산  가격 이하 칸수  예산 내 최대 구매 수(싼 순)");
{ const r = rng(77), st = newSt(); const rows = Array.from({ length: 60000 }, () => rollShelf(r, st, null).shelf.map((x) => x.price).sort((a, b) => a - b));
  for (const B of [30, 60, 90, 150, 300, 600]) { let c1 = 0, c2 = 0; for (const p of rows) { c1 += p.filter((x) => x <= B).length; let b = B, n = 0; for (const x of p) { if (x <= b) { b -= x; n++; } } c2 += n; } console.log(String(B).padStart(4), f(c1 / rows.length, 2).padStart(10), f(c2 / rows.length, 2).padStart(16)); } }
reportE();
