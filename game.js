"use strict";
// 말랑 운빨 디펜스 - 코어 (스운디 이식). 규칙 데이터/순수 헬퍼는 data.js, 렌더는 graphics.js, DOM/모달은 ui.js.
const cv = $("cv"), ctx = cv.getContext("2d");
const W = CONST.W, H = CONST.H;
const HEADLESS = typeof window === "undefined"; // 시뮬 검증 모드에서 FX 호출 생략용
var GFX_SC = 1; // 렌더 배율(cv.width / W). graphics.js 가 typeof 검사 후 읽음
var GFX_LOW = false; // 저사양 모드. graphics.js 가 읽음
var GFX_AUTO = false;
var GFX_IOS = false; // iPhone/iPad(iPadOS 의 MacIntel+터치 포함)
var GFX_SAVE = false; // 절전: 게임 렌더 30fps. iOS 기본 켬, ☰ 메뉴 "절전" 토글(malrang_gfx low=켬·저사양 / high=끔)
var GFX_RFPS = 60; // 게임 중 렌더 목표 fps(30/60). graphics.js 가 굽기 fps 를 여기에 맞춤
(function () {
  let pref = null;
  if (typeof window === "undefined") return;
  try { pref = localStorage.getItem("malrang_gfx"); } catch (e) {}
  const nv = typeof navigator !== "undefined" ? navigator : {};
  GFX_IOS = /iP(hone|ad|od)/.test(nv.userAgent || "") || (nv.platform === "MacIntel" && nv.maxTouchPoints > 1);
  if (pref === "low") { GFX_LOW = true; GFX_SAVE = true; }
  else if (pref === "high") GFX_LOW = false;
  else {
    if ((nv.hardwareConcurrency && nv.hardwareConcurrency <= 4) || (nv.deviceMemory && nv.deviceMemory <= 2)) GFX_LOW = true;
    if (GFX_IOS) GFX_SAVE = true;
  }
  GFX_AUTO = pref !== "low" && pref !== "high"; // 런타임 자동 하향 허용 여부
  GFX_RFPS = GFX_SAVE || GFX_LOW ? 30 : 60;
  try { document.documentElement.classList.toggle("save", GFX_SAVE); } catch (e) {}
})();
// ☰ 메뉴 절전 토글(ui.js). 켬 = 30fps + 저사양, 끔 = 60fps(자동 하향 없음)
function gfxSetSave(on) {
  GFX_SAVE = !!on; GFX_LOW = !!on; GFX_AUTO = false;
  try { localStorage.setItem("malrang_gfx", on ? "low" : "high"); } catch (e) {}
  try { document.documentElement.classList.toggle("save", GFX_SAVE); } catch (e) {}
  if (typeof requestRenderNow === "function") requestRenderNow();
}
const SLOT_COLS = CONST.COLS, SLOT_ROWS = CONST.ROWS;

// ---------- 지형 ----------
const slotPos = (i) => ({ x: 180 + ((i % SLOT_COLS) - 1.5) * 64, y: 200 + (Math.floor(i / SLOT_COLS) - 2) * 58 });
const TRACK = { x0: 24, y0: 24, x1: 336, y1: 376 };
const TW = TRACK.x1 - TRACK.x0, TH = TRACK.y1 - TRACK.y0, PERI = 2 * (TW + TH);
function trackPoint(d) {
  d = ((d % PERI) + PERI) % PERI;
  if (d < TW) return { x: TRACK.x0 + d, y: TRACK.y0 };
  d -= TW; if (d < TH) return { x: TRACK.x1, y: TRACK.y0 + d };
  d -= TH; if (d < TW) return { x: TRACK.x1 - d, y: TRACK.y1 };
  d -= TW; return { x: TRACK.x0, y: TRACK.y1 - d };
}

// 히어로 유닛 고정 수치 (설계 B1)
const HERO_UNIT = { atk: 66, cd: 1.1, range: 170, splash: 34, supSplash: 65 };
// 공격 모션 매핑 (graphics.motionOf 의 style)
const MOT = { shot: "peck", tongue: "rear", slash: "lunge", wave: "rear", roar: "rear", beam: "rear", breath: "peck", chain: "hop", lob: "hop", nova: "spin", meteor: "rear", storm: "spin" };

let S;
const sqr = (x) => x * x;

// ---------- 상태 ----------
function newGame(mode, forceSeed, rules, mine) {
  let R = {}; // 규칙(모디파이어). 없으면 {} -> 아래 분기는 전부 기본 동작
  if (rules) { const v = validateRules(rules); if (!v.ok) throw new Error(v.err); R = v.rules; }
  CONST.ROUNDS = R.rounds || CONST.ROUNDS_BASE;
  const seed = forceSeed || Math.floor(Math.random() * 2147483646) + 1; // 매 판 새 시드 (랭킹 판도 서버가 이 시드로 재현 검증)
  const rng = makeRngs(seed);
  let hero = pickHero(rng.hero, R.heroPool); // 내 영웅이어도 난수는 똑같이 소비한다(이후 시드 흐름 동일)
  let M = null;
  if (mine && !rules) { const v = validateMine(mine); if (!v.ok) throw new Error(v.err); M = v.mine; hero = applyMine(M); } // 규칙(시즌/프라이빗) 판에는 내 영웅 미적용. 내 영웅 = 기본 영웅(일반 공격) + 시장 능력(data.js MYHERO)
  const hx = hero.fx || {};
  UP_MUL = hx.upCost || 1; // 히어로가 바꾸는 상수는 매 판 기준값에서 다시 계산 (판매가·뽑기 비용)
  if (CONST.DRAW_COST0 == null) CONST.DRAW_COST0 = CONST.DRAW_COST;
  CONST.DRAW_COST = (R.drawCost != null ? R.drawCost : CONST.DRAW_COST0) - (hx.drawCost || 0);
  for (const g of GRADES) { if (g.sell0 == null) g.sell0 = g.sell; g.sell = g.sell0 > 0 ? Math.round(g.sell0 * (hx.sellMul || 1)) : 0; }
  S = {
    mode, seed, rng, hero, mine: M, rules: R, minerals: (R.startMin != null ? R.startMin : CONST.START_MIN) + (hx.startMin || 0), dispMin: 0, draws: 0,
    round: 0, roundT: 0, bossT: 0, nextT: -1, over: false, win: false, paused: true, speed: 1, time: 0, frame: 0, tick: 0, inAuto: false,
    slots: Array(CONST.SLOTS).fill(null), sel: -1,
    up: [0, 1, 2, 3].map((c) => ({ bought: 0, bonus: (hx.lv && hx.lv[c]) || 0 })),
    rangeUp: [0, 0, 0, 0], // 무리별 사거리 강화 단계 (CONST.RANGE_UP)
    upTickets: 0, tickets: [], autoMerge: false, heroState: { progress: "", flags: {} },
    resonance: [0, 0, 0, 0], reso: [0, 0, 0, 0], lv: [0, 0, 0, 0], heroLv: 0, resoGot: [false, false, false, false],
    mobs: [], mobId: 0, queue: 0, spawnT: 0, info: null,
    fx: [], efx: [], parts: [], projs: [], pend: [], shake: 0, flash: 0, slowmo: 0, banner: null, log: [], inputs: [],
    kills: 0, topGrade: 0, warnLvl: 0, modalQ: [], autoT: 0, progT: 0, bossLeft: 0, resultSent: false, hot: 0,
    score() { return calcScore(S.round, S.kills, unitPoints(S.slots), S.win, S.bossLeft); },
  };
  S.dispMin = S.minerals;
  const hp = Math.floor(rng.hero() * CONST.SLOTS);
  S.slots[hp] = { hero: true, ch: -1, n: 1, cd: 0, lock: true, anim: null, fire: null, shots: 0 };
  refreshLevels();
  startRound();
  return S;
}
function inp(op, arg) { S.inputs.push([S.tick, op, arg === undefined ? 0 : arg]); }

// ---------- 공업 레벨 / 공명 ----------
function refreshLevels() {
  let mx = 0;
  const hx = S.hero.fx || {};
  for (let c = 0; c < 4; c++) {
    S.reso[c] = resonanceCount(S.slots, c); // 서로 다른 등급 종류 수
    const rb = resonanceBonus(S.slots, c, hx.resoEase);
    S.resonance[c] = S.reso[c];
    S.lv[c] = Math.min(CONST.UP_LV_CAP, clanLevel(S, c) + rb);
    if (S.lv[c] > mx) mx = S.lv[c];
    if (rb > 0 && !S.resoGot[c]) { S.resoGot[c] = true; S.minerals += CONST.RESONANCE_FIRST; log(`${CLANS[c].name} 공명! +${CONST.RESONANCE_FIRST}`, CLANS[c].color); }
  }
  S.heroLv = Math.floor(mx * (hx.heroLvK || 0.5)); // 히어로 유닛 Lv = 최고 무리 Lv x 50% (부엉이 군사 100%)
}
// 피해 배율 = 공업 배율 x 히어로 라운드 누적(고래 장로)
const unitMul = (u) => dmgMul(u.hero ? S.heroLv : S.lv[u.ch % 4]) * (S.hero.fx.atkMul || 1) * (S.hero.fx.roundDmg ? 1 + S.hero.fx.roundDmg * (S.round - 1) : 1);
// 사거리 배율 = 1 + 무리 사거리 강화 x STEP + 히어로(사막여우). 히어로 유닛은 히어로 보정만
const rangeMul = (u) => 1 + (u.hero ? 0 : S.rangeUp[u.ch % 4] * CONST.RANGE_UP.STEP) + (S.hero.fx.rangeMul || 0);
const rangeCost = (c) => S.rangeUp[c] >= CONST.RANGE_UP.MAX ? -1 : CONST.RANGE_UP.COST[S.rangeUp[c]];
// 이번 뽑기 비용 (황금 거위: freeDraw 번째마다 0)
const drawCostNow = () => { const f = S.hero.fx.freeDraw; return f && (S.draws + 1) % f === 0 ? 0 : CONST.DRAW_COST; };

// ---------- 로그 / 이펙트 ----------
function log(txt, col) {
  S.log.push({ txt, col: col || "#fff", t: 4 }); if (S.log.length > 6) S.log.shift();
  uiLog(txt, col);
}
function pop(x, y, txt, t = 0.7, col = "#e0558a", size = 15) { if (HEADLESS || S.fx.length > 60) return; S.fx.push({ t, max: t, x, y, txt, col, size }); }
function burst(x, y, col, n, spd, size, life, g = 200) {
  if (HEADLESS || S.parts.length > 400) return;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, v = spd * (0.4 + Math.random() * 0.8);
    S.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - spd * 0.3, l: life, m: life, col, s: size * (0.6 + Math.random() * 0.7), g });
  }
}
function ring(x, y, col, rad, life) { if (HEADLESS || S.parts.length > 420) return; S.parts.push({ ring: 1, x, y, col, rad, l: life, m: life }); }
function efx(e) { if (HEADLESS) return; e.max = e.t; S.efx.push(e); }
const gstyle = (g) => GRADES[g].style;

// ---------- 피해 ----------
function hitMob(m, d, pierce, st, hero, noPop) {
  if (m.hp <= 0) return 0;
  d *= armorFactor(m.armor, pierce);
  const hx = S.hero.fx;
  if (m.boss && hx.bossDmg) d *= hx.bossDmg;
  m.hp -= d; m.flash = 0.1;
  if (st) {
    if (st.burn) { const b = (st.burn * d) / st.dur; if (b > m.burn) m.burn = b; m.burnT = st.dur * (hx.burnDur || 1); }
    if (st.slow || hx.slowPlus) { const sl = Math.min(0.75, (st.slow || 0) + (hx.slowPlus || 0)); if (sl > m.slow) m.slow = sl; m.slowT = st.dur; }
  } else if (hx.slowPlus) { if (hx.slowPlus > m.slow) m.slow = hx.slowPlus; m.slowT = 1.5; }
  if (!noPop && !HEADLESS) { const q = trackPoint(m.d); pop(q.x + Math.random() * 12 - 6, q.y - 20, Math.round(d), 0.6, hero ? "#ff7a00" : "#ff5c8a", hero ? 14 : 11); }
  return d;
}
function mobsIn(q, R, skip) {
  const out = [], R2 = R * R;
  for (const m of S.mobs) {
    if (m === skip || m.hp <= 0) continue;
    const p = trackPoint(m.d);
    if (sqr(p.x - q.x) + sqr(p.y - q.y) <= R2) out.push(m);
  }
  return out;
}
function splash(q, R, d, skip, pierce, st, hero) { for (const m of mobsIn(q, R, skip)) hitMob(m, d, pierce, st, hero, true); }
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// ---------- 발사 ----------
// 유닛 정의 (일반 유닛은 CHARS, 히어로는 고정 수치)
function defOf(u, sup) {
  const rm = rangeMul(u), hx = S.hero.fx, sp = hx.atkSpd || 1; // 사거리 강화·히어로 보정, 공격 속도(번개 족제비)
  if (u.hero) { // 내 영웅: heroAtk(영웅 근력), hsk/hsk2(장착 스킬 = 기본/필살 공격 방식). 운빨 리그 영웅은 셋 다 없음
    const ha = HERO_UNIT.atk * (hx.heroAtk || 1), k = sup ? hx.hsk2 : hx.hsk; // 칸별: 필살 칸이 비면 필살도 일반 공격(기본공격 스킬이 대신하지 않는다, GAME_VER 9)
    if (!k) return { fx: "shot", atk: ha, cd: HERO_UNIT.cd / sp, range: HERO_UNIT.range * rm, aoe: null, pierce: 0, st: null, shot: [null, null], grade: 3 };
    return { fx: k.fx, atk: ha * k.k, cd: (HERO_UNIT.cd * k.cd) / sp, range: HERO_UNIT.range * rm, aoe: k.aoe, pierce: k.pierce || 0, st: k.st, shot: k.shot, grade: 3 };
  }
  const c = CHARS[u.ch]; return { fx: c.fx, atk: c.atk, cd: c.cd / sp, range: c.range * rm, aoe: c.aoe, pierce: c.pierce || 0, st: c.st, shot: c.shot, grade: c.grade };
}
function launch(u, i, f) {
  const p = slotPos(i), d = defOf(u, f.sup);
  let m = f.m;
  if (!m || m.hp <= 0) { m = nearest(p, d.range + 30); if (!m) return; }
  sfx(u.hero ? "atk4" : "atk" + (u.ch & 3));
  const dmg = d.atk * u.n * unitMul(u) * (f.sup ? 3 : 1);
  const q = trackPoint(m.d), ang = Math.atan2(q.y - p.y, q.x - p.x);
  const gs = gstyle(d.grade), sc = u.hero ? 1.2 : gs.fxScale, col = d.shot[1], a = d.aoe || {};
  const heavy = d.grade >= 5;
  const shk = (v) => { S.shake = Math.max(S.shake, v); };
  switch (d.fx) {
    case "shot":
      S.projs.push({ x: p.x, y: p.y - 8, tgt: m, tier: d.grade, grade: d.grade, dmg, pierce: d.pierce, st: d.st, hero: !!u.hero, sup: f.sup, spd: u.hero ? 330 : 400, trail: [], tx: q.x, ty: q.y, rot: 0, ang: 0, shape: u.hero ? null : d.shot[0], col: u.hero ? null : col, scale: sc, splash: u.hero ? (f.sup ? HERO_UNIT.supSplash : HERO_UNIT.splash) : 0 });
      break;
    case "lob": {
      const dist = Math.hypot(q.x - p.x, q.y - p.y), dur = Math.max(0.35, dist / 260);
      S.projs.push({ lob: 1, x: p.x, y: p.y - 8, sx: p.x, sy: p.y - 8, tgt: m, tier: d.grade, grade: d.grade, dmg, pierce: d.pierce, st: d.st, aoeR: a.R, aoeSp: a.sp, shape: d.shot[0], col, scale: sc, trail: [], tx: q.x, ty: q.y, k: 0, dur, z: 0, rot: 0, ang: 0 });
      break; }
    case "tongue":
      hitMob(m, dmg, d.pierce, d.st); efx({ type: "tongue", x: p.x, y: p.y - 6, tx: q.x, ty: q.y, t: 0.32, col, scale: sc }); burst(q.x, q.y, col, 6, 60, 2.5, 0.4); break;
    case "slash":
      hitMob(m, dmg, d.pierce, d.st); efx({ type: "slash", x: q.x, y: q.y, t: 0.32, col, scale: sc }); burst(q.x, q.y, "#fff", 7, 90, 2.6, 0.35); break;
    case "wave":
      hitMob(m, dmg, d.pierce, d.st); efx({ type: "wave", x: p.x, y: p.y, ang, dist: Math.hypot(q.x - p.x, q.y - p.y), t: 0.45, col, thick: 3, scale: sc }); break;
    case "roar":
      hitMob(m, dmg, d.pierce, d.st); splash(q, a.R, dmg * a.sp, m, d.pierce, d.st); ring(q.x, q.y, col, a.R, 0.4); shk(2.5 + (heavy ? 2 : 0));
      efx({ type: "wave", x: p.x, y: p.y, ang, dist: Math.hypot(q.x - p.x, q.y - p.y), t: 0.45, col, thick: 5, scale: sc }); break;
    case "breath":
      hitMob(m, dmg, d.pierce, d.st); splash(q, a.R, dmg * a.sp, m, d.pierce, d.st);
      efx({ type: "breath", x: p.x, y: p.y - 6, tx: q.x, ty: q.y, ang, R: a.R, t: 0.35, col, scale: sc });
      if (!HEADLESS && S.parts.length < 380) for (let k = 0; k < 18; k++) { const aa = ang + (Math.random() - 0.5) * 0.5, v = 130 + Math.random() * 110; S.parts.push({ x: p.x, y: p.y - 6, vx: Math.cos(aa) * v, vy: Math.sin(aa) * v, l: 0.35, m: 0.35, col: k % 2 ? "#ffb347" : col, s: 4 + Math.random() * 3, g: 0 }); }
      if (heavy) shk(3);
      break;
    case "beam": {
      const ex = p.x + Math.cos(ang) * d.range, ey = p.y + Math.sin(ang) * d.range;
      for (const mm of S.mobs) {
        if (mm.hp <= 0) continue; const mp = trackPoint(mm.d);
        if (mm === m) hitMob(mm, dmg, d.pierce, d.st); else if (segDist(mp.x, mp.y, p.x, p.y, ex, ey) < a.line) hitMob(mm, dmg * a.sp, d.pierce, d.st);
      }
      efx({ type: "beam", x: p.x, y: p.y - 6, tx: ex, ty: ey, t: 0.3, col, scale: sc }); burst(q.x, q.y, "#fff", 8, 90, 2.6, 0.4); if (heavy) shk(3); break; }
    case "chain": {
      const pts = [{ x: p.x, y: p.y - 6 }, q], hit = new Set([m]); let cur = m, cq = q, dd = dmg;
      hitMob(m, dd, d.pierce, d.st);
      for (let j = 0; j < a.jumps; j++) {
        let best = null, bd = a.R * a.R;
        for (const mm of S.mobs) { if (mm.hp <= 0 || hit.has(mm)) continue; const mp = trackPoint(mm.d), dq = sqr(mp.x - cq.x) + sqr(mp.y - cq.y); if (dq < bd) { bd = dq; best = mm; } }
        if (!best) break;
        dd *= a.fall; hit.add(best); cur = best; cq = trackPoint(best.d); pts.push(cq);
        hitMob(best, dd, d.pierce, d.st);
      }
      efx({ type: "chain", x: p.x, y: p.y - 6, pts, t: 0.35, col, scale: sc }); if (heavy) shk(3); break; }
    case "nova": {
      const R = a.R; let any = 0;
      for (const mm of mobsIn(p, R)) { hitMob(mm, dmg * a.sp, d.pierce, d.st, false, true); any++; }
      efx({ type: "nova", x: p.x, y: p.y, R, t: 0.5, col, scale: sc }); if (heavy) shk(4); break; }
    case "meteor": {
      const lead = m.speed * (1 - m.slow) * a.delay, qq = trackPoint(m.d + lead);
      S.pend.push({ t: a.delay, kind: "meteor", x: qq.x, y: qq.y, R: a.R, dmg, sp: a.sp, pierce: d.pierce, st: d.st, col, grade: d.grade });
      efx({ type: "meteor", x: qq.x, y: qq.y, R: a.R, delay: a.delay, t: a.delay + 0.45, col, scale: sc }); break; }
    case "storm": {
      for (const mm of S.mobs) { if (mm.hp <= 0) continue; const mp = trackPoint(mm.d); if (sqr(mp.x - p.x) + sqr(mp.y - p.y) <= d.range * d.range) hitMob(mm, dmg, d.pierce, d.st, false, true); }
      efx({ type: "storm", x: p.x, y: p.y, R: d.range, t: 0.6, col, scale: sc }); shk(5); S.flash = Math.max(S.flash, 0.12); break; }
  }
}
function nearest(p, range) {
  let best = null, bd = range * range;
  for (const m of S.mobs) {
    if (m.hp <= 0) continue;
    const q = m.pt || (m.pt = trackPoint(m.d)), dd = sqr(q.x - p.x) + sqr(q.y - p.y);
    if (dd < bd) { bd = dd; best = m; }
  }
  return best;
}
function impact(pr) {
  const col = pr.col || (GRADES[pr.grade] || GRADES[0]).color;
  if (pr.lob) {
    const q = { x: pr.tx, y: pr.ty };
    if (pr.tgt && pr.tgt.hp > 0) hitMob(pr.tgt, pr.dmg, pr.pierce, pr.st);
    splash(q, pr.aoeR, pr.dmg * pr.aoeSp, pr.tgt, pr.pierce, pr.st);
    burst(q.x, q.y, col, 9, 80, 3, 0.45); ring(q.x, q.y, col, pr.aoeR, 0.4); return;
  }
  if (pr.tgt && pr.tgt.hp > 0) hitMob(pr.tgt, pr.dmg, pr.pierce, pr.st, pr.hero);
  if (pr.splash) { splash({ x: pr.tx, y: pr.ty }, pr.splash, pr.dmg * 0.5, pr.tgt, pr.pierce, pr.st, pr.hero); ring(pr.tx, pr.ty, col, pr.splash, 0.4); }
  burst(pr.tx, pr.ty, pr.hero ? "#ffd54f" : col, pr.hero ? 14 : 7, pr.hero ? 110 : 70, pr.hero ? 4 : 2.6, 0.45);
  if (pr.sup) S.shake = Math.max(S.shake, 5);
}

// ---------- 라운드 / 스폰 ----------
function startRound() {
  S.round++; S.roundT = 0; S.nextT = -1;
  const info = S.info = roundInfo(S.round);
  S.queue = info.n; S.spawnT = 0; S.rewK = 1;
  if (S.rules.mobCount && !info.boss) { S.queue = Math.max(1, Math.round(info.n * S.rules.mobCount)); S.rewK = info.n / S.queue; } // 몹 수 가감 시 라운드 총 보상은 유지
  S.bossT = info.boss ? info.time + ((S.hero.fx || {}).bossTime || 0) : 0;
  if (info.boss && S.rules.bossTime) S.bossT = Math.max(10, S.bossT + S.rules.bossTime);
  const ch = CHAPTERS[info.ch - 1];
  S.banner = { txt: info.boss ? `⚠ 보스 ${S.round}` : `라운드 ${S.round}`, sub: info.boss ? info.name : ch.name, t: 1.6, max: 1.6, boss: info.boss };
  if (S.round > 1 || !S.paused) sfx(info.boss ? "boss" : "round");
  if (info.boss) log(`보스 등장! ${info.name}`, "#ff5c8a");
  else if (info.r === ch.from) log(`챕터 ${ch.id}. ${ch.name}`, "#7a5fd0");
  const hx = S.hero.fx || {};
  if (hx.roundMin) { S.minerals += hx.roundMin; }
  if (hx.roundDmg && S.round > 1) updateProgress();
}
function spawn() {
  const info = S.info;
  const hp = Math.round(info.hp * hpMul(info.r) * (S.rules.hpMul || 1) * (info.boss && S.hero.fx.bossHp ? S.hero.fx.bossHp : 1)), boss = info.boss;
  S.mobs.push({ id: S.mobId++, d: 0, hp, max: hp, boss, kind: info.kind, hue: info.hue + (boss ? 0 : Math.random() * 16 - 8), deco: [], armor: info.armor, speed: info.speed * (1 - (S.hero.fx.mobSlow || 0)) * (S.rules.mobSpeed || 1), slow: 0, slowT: 0, burn: 0, burnT: 0, flash: 0, name: info.name, final: info.r === CONST.ROUNDS, rew: info.rew * (S.rewK || 1) });
}

// ---------- 유닛 보관 ----------
function freeSlot() { return S.slots.findIndex((s) => !s); }
// 유닛 1기 추가. pref: 우선 칸. 반환: 칸 번호 | -1 (자리 없음; 자동판매 시 -2)
function placeUnit(ch, pref) {
  let si = -1;
  for (let i = 0; i < S.slots.length; i++) { const s = S.slots[i]; if (s && !s.hero && s.ch === ch && s.n < CONST.STACK_MAX) { si = i; break; } }
  if (si >= 0) { S.topGrade = Math.max(S.topGrade, ch >> 2); S.slots[si].n++; return si; }
  if (S.slots.some((s) => s && !s.hero && s.ch === ch)) { // 꽉 찬 스택 -> 자동 판매
    const price = GRADES[ch >> 2].sell;
    if (price > 0) { S.minerals += price; const full = S.slots.findIndex((s) => s && !s.hero && s.ch === ch); const p = slotPos(full); pop(p.x, p.y, `+${price}`, 0.8, "#e0a000"); S.topGrade = Math.max(S.topGrade, ch >> 2); log(`${CHARS[ch].name} 스택이 가득 차서 자동 판매했어요 (+${price})`, "#a08040"); return -2; }
  }
  if (pref != null && pref >= 0 && !S.slots[pref]) si = pref; else si = freeSlot();
  if (si < 0) return -1;
  S.topGrade = Math.max(S.topGrade, ch >> 2);
  S.slots[si] = { ch, n: 1, cd: 0, lock: false, anim: null, fire: null, shots: 0 };
  return si;
}
function addUnit(ch, silent, pref) {
  const si = placeUnit(ch, pref);
  if (si === -1) return false;
  if (si >= 0) { const p = slotPos(si); if (!silent) { burst(p.x, p.y, GRADES[ch >> 2].color, 10, 80, 3, 0.5); ring(p.x, p.y, "#fff", 32, 0.35); } }
  afterChange();
  return true;
}

// ---------- 히어로 규칙 ----------
function afterChange() {
  refreshLevels();
  updateProgress();
}
// 정보 패널의 히어로 진행 문구 (표시 전용)
function updateProgress() {
  const hx = S.hero.fx || {}, fl = S.heroState.flags;
  let t = "";
  if (hx.freeDraw) { const k = hx.freeDraw - (S.draws % hx.freeDraw); t = k === 1 ? "다음 뽑기 무료!" : `무료 뽑기까지 ${k}회`; }
  else if (hx.roundDmg) t = `피해 +${(hx.roundDmg * (S.round - 1) * 100).toFixed(1)}%`;
  else if (hx.bossUp) t = `보스 보너스 공업 +${fl.bu || 0}`;
  else if (hx.mergeUp) t = `연금 성공 ${fl.mu || 0}회`;
  else if (hx.heroLvK) t = `영웅 Lv${S.heroLv}`;
  else if (hx.roundMin) t = `라운드 수입 +${hx.roundMin}`;
  S.heroState.progress = t;
}

// ---------- 공개 API ----------
const GAME = {
  draw() {
    if (S.over || S.paused) return false;
    if (S.rules.drawLimit && S.draws >= S.rules.drawLimit) { return false; }
    const cost = drawCostNow();
    if (S.minerals < cost) { return false; }
    if (freeSlot() < 0) { log("자리가 없어요! 판매하거나 합성하세요", "#e0558a"); sfx("deny"); return false; }
    S.minerals -= cost; S.draws++; inp("draw");
    if (cost === 0) log("황금 거위의 무료 뽑기!", "#e0a000");
    const probs = gradeProbs(S.hero, S.rules), g = rollGrade(S.rng.gacha, probs), ci = rollChar(S.rng.gacha, g, S.rules.clanBan), c = CHARS[ci];
    const si = placeUnit(ci);
    afterChange();
    const gr = GRADES[g];
    const pct = +probs[g].toFixed(3);
    if (g >= 3) log(`${pct}%의 확률로 [${gr.name}] ${c.name}${hasBatchim(c.name) ? "이" : "가"} 나왔어요!`, gr.color);
    if (si >= 0) {
      const p = slotPos(si); pop(p.x, p.y, `뿅! ${CLANS[c.clan].name.slice(0, -2)} Lv${S.lv[c.clan]}`, 0.8, gr.color, 13);
      burst(p.x, p.y, gr.color, 10 + g * 3, 80 + g * 12, 3, 0.5); ring(p.x, p.y, "#fff", 32, 0.35);
    }
    sfx("draw" + g); if (g >= 5) sfx("jingle" + g);
    if (g >= 4) { uiBanner(`[${gr.name}] ${c.name}!`, "hi"); vib(60 + g * 20); }
    if (g >= 5) S.flash = Math.max(S.flash, 0.18);
    if (g >= 6) { uiBanner("경축! 아니 이걸 뽑다니!", "big"); S.slowmo = 0.5; S.shake = Math.max(S.shake, 6); }
    return true;
  },
  canMerge(i) {
    const s = S.slots[i];
    if (S.over || S.paused) return { ok: false, reason: "지금은 할 수 없어요" };
    if (!s || s.hero) return { ok: false, reason: "유닛이 아니에요" };
    const g = s.ch >> 2;
    if (g >= (S.rules.gradeCap || 6)) return { ok: false, reason: S.rules.gradeCap ? "이번 시즌은 이 등급부터 조합할 수 없습니다!" : "레전더리 등급부터는 유닛을 조합할 수 없습니다!" };
    if (s.n < 3) return { ok: false, reason: "같은 유닛 3기가 필요해요" };
    if (s.n === 3 || freeSlot() >= 0) return { ok: true, reason: "" };
    return { ok: false, reason: "자리가 없어요" };
  },
  mergeWarning(i) {
    const s = S.slots[i]; // 자동합성 보류 사유(현재 히어로 중 해당 없음, 자리만 유지)
    if (!s || s.hero) return null;
    return null;
  },
  merge(i, all) {
    let done = 0;
    for (let guard = 0; guard < 40; guard++) {
      const s = S.slots[i];
      if (!this.canMerge(i).ok) break;
      const g = s.ch >> 2; let ci = mergeResult(S.rng.merge, g, S.rules.clanBan);
      // 개구리 연금술사: 결과가 합성 상한(레전더리, 시즌 gradeCap) 미만일 때만 misc 난수 1회 -> 한 등급 위(같은 무리)
      const hxm = S.hero.fx;
      if (hxm.mergeUp && (ci >> 2) < (S.rules.gradeCap || 6) && S.rng.misc() < hxm.mergeUp) { ci += 4; S.heroState.flags.mu = (S.heroState.flags.mu || 0) + 1; log(`연금술 성공! 한 등급 위 [${GRADES[ci >> 2].name}]`, GRADES[ci >> 2].color); sfx("drawHi"); }
      s.n -= 3; const p = slotPos(i);
      if (s.n <= 0) S.slots[i] = null;
      const si = placeUnit(ci, i);
      afterChange(); if (!S.inAuto) inp("merge", i); done++;
      const gr = GRADES[ci >> 2], c = CHARS[ci];
      if (!HEADLESS) { burst(p.x, p.y, gr.color, 14 + g * 4, 110, 3.4, 0.6); ring(p.x, p.y, gr.color, 44, 0.45); }
      if (ci >> 2 >= 3) log(`[${GRADES[g].name}] 3기를 조합하여 [${gr.name}] ${c.name}${hasBatchim(c.name) ? "을" : "를"} 얻었어요!`, gr.color);
      sfx("merge" + (ci >> 2)); if (ci >> 2 >= 5) sfx("jingle" + (ci >> 2)); vib(30);
      if (ci >> 2 >= 5) S.flash = Math.max(S.flash, 0.15);
      if (!all) break;
      if (si < 0) break;
      if (!(S.slots[i] && !S.slots[i].hero && S.slots[i].n >= 3)) break;
    }
    return done;
  },
  sell(i) {
    const s = S.slots[i];
    if (S.over || S.paused || !s || s.hero) return false;
    if (S.rules.noSell) { log("이번 시즌은 판매할 수 없어요", "#e0558a"); return false; }
    const price = GRADES[s.ch >> 2].sell;
    if (price <= 0) { log("패런츠는 판매할 수 없어요", "#e0558a"); return false; }
    S.minerals += price; s.n--; inp("sell", i);
    const p = slotPos(i); pop(p.x, p.y, `+${price}`, 0.7, "#e0a000"); burst(p.x, p.y, "#ffd54f", 8, 80, 3, 0.5);
    if (s.n <= 0) { S.slots[i] = null; if (S.sel === i) S.sel = -1; }
    afterChange(); sfx("sell"); return true;
  },
  upgrade(c) {
    if (S.over) return false;
    const u = S.up[c], cost = upgradeCost(u.bought);
    if (u.bought >= CONST.UP_MAX || S.minerals < cost) return false;
    S.minerals -= cost; u.bought++; inp("up", c); refreshLevels(); updateProgress();
    log(`${CLANS[c].name} 공업 Lv${S.lv[c]}!`, CLANS[c].color); sfx("upgrade"); return true;
  },
  rangeUp(c) { // 무리별 사거리 강화 (입력 로그 "rng")
    if (S.over || !(c >= 0 && c < 4)) return false;
    const cost = rangeCost(c);
    if (cost < 0 || S.minerals < cost) return false;
    S.minerals -= cost; S.rangeUp[c]++; inp("rng", c);
    log(`${CLANS[c].name} 사거리 +${Math.round(S.rangeUp[c] * CONST.RANGE_UP.STEP * 100)}%!`, CLANS[c].color); sfx("upgrade"); return true;
  },
  rangeCost(c) { return rangeCost(c); }, // -1 = 최대
  drawCost() { return drawCostNow(); },
  useTicket(chIdx) { // chIdx = 고른 유닛(CHARS 인덱스). 같은 등급 선택권 1장을 소모한다.
    const g = chIdx >> 2, k = S.tickets.indexOf(g);
    if (k < 0 || S.over) return false;
    if (S.rules.clanBan && S.rules.clanBan.includes(chIdx & 3)) return false;
    if (!addUnit(chIdx)) { log("자리가 없어요! 자리를 만든 뒤 다시 골라주세요", "#e0558a"); sfx("deny"); return false; }
    S.tickets.splice(k, 1); inp("ticket", chIdx);
    log(`[${GRADES[g].name}] ${CHARS[chIdx].name} 선택!`, GRADES[g].color); sfx("ticket"); return true;
  },
  useUpTicket(c) {
    if (S.upTickets <= 0 || S.over) return false;
    S.upTickets--; S.up[c].bonus++; inp("upT", c); refreshLevels();
    log(`${CLANS[c].name} 공업 +1 (Lv${S.lv[c]})`, CLANS[c].color); sfx("ticket"); return true;
  },
  toggleAuto() { S.autoMerge = !S.autoMerge; inp("auto", S.autoMerge ? 1 : 0); return S.autoMerge; },
  toggleLock(i) { const s = S.slots[i]; if (s && !s.hero) { s.lock = !s.lock; inp("lock", i); } },
  select(i) { S.sel = i >= 0 && S.slots[i] && S.sel !== i ? i : -1; },
  setSpeed(n) { S.speed = n === 2 || n === 3 ? n : 1; },
  start(mode, seed, rules, mine) {
    newGame("daily", seed, rules, mine); S.paused = false; S.sel = -1; return S; },
};
function hasBatchim(s) { const c = s.charCodeAt(s.length - 1); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0; }

// ---------- 업데이트 ----------
// 랭킹 표시용 빌드 요약(점수와 무관한 읽기 전용). n=무리별 필드 유닛 수(히어로 제외), lv=최종 공업 Lv(구매+보너스+공명, 상한 적용 S.lv), top=판 중 최고 등급 id
function calcBuild() {
  const n = [0, 0, 0, 0];
  for (const s of S.slots) if (s && !s.hero) n[s.ch % 4] += s.n;
  return { clans: n.map((c, i) => ({ n: c, lv: S.lv[i] })), top: S.topGrade };
}
function gameOver(win) {
  if (S.over) return;
  S.over = true; S.win = !!win;
  S.bossLeft = win ? Math.max(0, S.bossT) : 0;
  const result = { win: S.win, round: S.round, kills: S.kills, unitPts: unitPoints(S.slots), units: S.slots.reduce((a, s) => a + (s && !s.hero ? s.n : 0), 0),
    bossLeft: Math.floor(S.bossLeft), build: calcBuild(), score: S.score(), mode: S.mode, seed: S.seed, hero: S.hero.id, draws: S.draws, time: S.time, inputs: S.inputs };
  sfx(win ? "win" : "over"); vib(win ? 120 : 200);
  uiGameOver(result);
}
function killMob(m) {
  S.kills++;
  const hx = S.hero.fx || {};
  let r = CONST.KILL_REWARD * (S.rules.killReward || 1);
  if (S.slots.some((s) => s && !s.hero && s.ch === 28)) r += 1; // 숲신 패시브
  if (hx.killMul) r *= hx.killMul;
  r *= m.rew; // 라운드 몹 수가 늘어난 만큼 개체 보상 비례 감소(라운드 총 보상 유지)
  S.rewAcc = (S.rewAcc || 0) + r; const rg = Math.floor(S.rewAcc + 1e-9); S.rewAcc -= rg; S.minerals += rg; // 소수 보상은 누적 후 정수 지급
  const q = trackPoint(m.d);
  if (!HEADLESS) {
    burst(q.x, q.y, `hsl(${m.hue},80%,65%)`, m.boss ? 30 : 8, m.boss ? 150 : 90, m.boss ? 5 : 3, 0.6);
    burst(q.x, q.y, "#ffd54f", m.boss ? 12 : 2, 70, 2.5, 0.8);
  }
  if (!m.boss) { sfx("kill"); return; }
  ring(q.x, q.y, "#ffd54f", 70, 0.6); S.shake = Math.max(S.shake, 9); vib(60); sfx("kill");
  S.minerals += CONST.BOSS_REWARD + (hx.bossBonus || 0);
  log(`${m.name} 처치! 미네랄 +${CONST.BOSS_REWARD + (hx.bossBonus || 0)}`, "#e0a000");
  if (hx.bossUp && (S.heroState.flags.bk = (S.heroState.flags.bk || 0) + 1) % (hx.bossUpEvery || 1) === 0) { // 고슴도치 대장: 보스 bossUpEvery 마리마다 모든 무리 공업 보너스 (상한 UP_LV_CAP 안에서만)
    for (let c = 0; c < 4; c++) if (clanLevel(S, c) < CONST.UP_LV_CAP) S.up[c].bonus += hx.bossUp;
    S.heroState.flags.bu = (S.heroState.flags.bu || 0) + hx.bossUp; log(`따끔 대장! 모든 무리 공업 +${hx.bossUp}`, "#e8442e");
  }
  const rd = S.round;
  if (rd < CONST.ROUNDS) {
    S.nextT = CONST.BOSS_DELAY; S.bossT = 0;
    const tg = ticketGrade(rd);
    if (tg >= 0) { S.tickets.push(tg); S.modalQ.push(["ticket", tg]); }
    if (CONST.BOSS_UP.includes(rd)) { S.upTickets++; S.modalQ.push(["up"]); }
  }
}
function update(dt) {
  S.time += dt; S.frame++;
  if (S.banner && (S.banner.t -= dt) <= 0) S.banner = null;
  for (const f of S.fx) f.t -= dt; S.fx = S.fx.filter((f) => f.t > 0);
  for (const f of S.efx) f.t -= dt; S.efx = S.efx.filter((f) => f.t > 0);
  for (const p of S.parts) { p.l -= dt; if (!p.ring) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; } }
  S.parts = S.parts.filter((p) => p.l > 0);
  for (const l of S.log) l.t -= dt; S.log = S.log.filter((l) => l.t > 0);
  S.shake = Math.max(0, S.shake - dt * 20); S.flash = Math.max(0, S.flash - dt); S.slowmo = Math.max(0, S.slowmo - dt);
  if (S.over || S.paused) return;
  if (S.modalQ.length) { const q = S.modalQ.shift(); S.paused = true; if (q[0] === "ticket") uiTicket(q[1]); else uiUpTicket(); return; }
  S.tick++; // 입력 로그 기준 시각: 일시정지(모달) 중에는 증가하지 않는 시뮬 틱

  const info = S.info;
  // 라운드 진행
  S.roundT += dt;
  if (info.boss) {
    S.bossT -= dt;
    if (S.nextT >= 0) { if ((S.nextT -= dt) <= 0) startRound(); }
    else if (S.bossT <= 0) { gameOver(false); return; }
    else if (S.bossT <= 10 && Math.floor(S.bossT + dt) !== Math.floor(S.bossT)) sfx("tick");
  } else if (S.roundT >= info.time && S.round < CONST.ROUNDS) startRound();
  if (S.over) return;
  const cur = S.info;
  if (S.queue > 0 && (S.spawnT -= dt) <= 0) { spawn(); S.queue--; S.spawnT += cur.gap; }

  // 몹 이동 / 상태이상
  for (const m of S.mobs) {
    m.d += m.speed * (1 - m.slow) * dt; m.flash -= dt; m.pt = trackPoint(m.d); // 위치 캐시(nearest 용)
    if (m.slowT > 0 && (m.slowT -= dt) <= 0) m.slow = 0;
    if (m.burnT > 0) { m.hp -= m.burn * dt; if ((m.burnT -= dt) <= 0) m.burn = 0; }
  }
  // 유닛
  const sparkOk = S.parts.length < 360;
  for (let i = 0; i < S.slots.length; i++) {
    const u = S.slots[i];
    if (!u) continue;
    const p = slotPos(i);
    if (u.anim && (u.anim.t -= dt) <= 0) u.anim = null;
    if (u.fire && (u.fire.t -= dt) <= 0) { launch(u, i, u.fire); u.fire = null; }
    if (!HEADLESS && sparkOk && !u.hero && GRADES[u.ch >> 2].style.sparkPerSec > 0) gradeParticles(u.ch, p.x, p.y, dt, (pt) => S.parts.push(pt));
    u.cd -= dt;
    if (u.cd > 0) continue;
    // 히어로 4번째 공격 = 필살: 이번 공격이 필살인지 먼저 정해 그 정의(hsk2 의 cd·모션)를 쓴다. hsk/hsk2 없으면 defOf 가 sup 를 무시 -> v6 와 동일
    const sup = !!u.hero && ((u.shots || 0) + 1) % 4 === 0;
    const d = defOf(u, sup);
    const best = nearest(p, d.range);
    if (!best) continue;
    const q = trackPoint(best.d);
    u.cd = d.cd;
    u.shots = (u.shots || 0) + 1;
    u.anim = { t: 0.45, dur: 0.45, ang: Math.atan2(q.y - p.y, q.x - p.x), hero: !!u.hero, style: MOT[d.fx], fx: d.fx };
    u.fire = { t: 0.16, m: best, sup };
    if (u.hero) ring(p.x, p.y + 14, sup ? "#ff9f1c" : "#ffd54f", sup ? 60 : 36, 0.5);
  }
  // 투사체
  for (const pr of S.projs) {
    if (pr.lob) {
      pr.k += dt / pr.dur;
      if (pr.tgt && pr.tgt.hp > 0) { const q = trackPoint(pr.tgt.d); pr.tx = q.x; pr.ty = q.y; }
      const k = Math.min(1, pr.k);
      pr.trail.push({ x: pr.x, y: pr.y }); if (pr.trail.length > 9) pr.trail.shift();
      pr.z = Math.sin(k * Math.PI) * 38; pr.x = pr.sx + (pr.tx - pr.sx) * k; pr.y = pr.sy + (pr.ty - pr.sy) * k - pr.z; pr.rot += dt * 10;
      pr.ang = Math.atan2(pr.ty - pr.sy, pr.tx - pr.sx);
      if (pr.k >= 1) { impact(pr); pr.done = true; }
      continue;
    }
    if (pr.tgt && pr.tgt.hp > 0) { const q = trackPoint(pr.tgt.d); pr.tx = q.x; pr.ty = q.y; }
    const dx = pr.tx - pr.x, dy = pr.ty - pr.y, d = Math.hypot(dx, dy), st = pr.spd * dt;
    pr.ang = Math.atan2(dy, dx);
    pr.trail.push({ x: pr.x, y: pr.y }); if (pr.trail.length > 9) pr.trail.shift();
    pr.rot += dt * 12;
    if (d <= st + 6) { impact(pr); pr.done = true; } else { pr.x += (dx / d) * st; pr.y += (dy / d) * st; }
  }
  S.projs = S.projs.filter((p) => !p.done);
  // 지연 효과(메테오)
  for (const e of S.pend) {
    if ((e.t -= dt) > 0) continue;
    e.done = true;
    for (const m of mobsIn(e, e.R)) hitMob(m, e.dmg * e.sp, e.pierce, e.st, false, true);
    ring(e.x, e.y, e.col, e.R, 0.4); burst(e.x, e.y, e.col, 12, 120, 3.5, 0.5); S.shake = Math.max(S.shake, e.grade >= 5 ? 6 : 3);
  }
  S.pend = S.pend.filter((e) => !e.done);

  // 처치
  let any = false;
  for (const m of S.mobs) if (m.hp <= 0) { killMob(m); any = true; }
  if (any) { S.mobs = S.mobs.filter((m) => m.hp > 0); afterChange(); }

  // 승패
  const n = S.mobs.length;
  if (n >= CONST.MOB_LOSE) { gameOver(false); return; }
  const wl = n >= CONST.MOB_WARN[1] ? 2 : n >= CONST.MOB_WARN[0] ? 1 : 0;
  if (wl > S.warnLvl) { log(`적 유닛 수가 ${CONST.MOB_WARN[wl - 1]}기 이상입니다!`, "#e0301e"); sfx(wl >= 2 ? "warn2" : "warn"); uiBanner(`적 유닛 수가 ${CONST.MOB_WARN[wl - 1]}기 이상입니다!`, "warn"); }
  S.warnLvl = wl;
  if (S.round === CONST.ROUNDS && !S.mobs.some((m) => m.boss) && S.queue === 0 && n === 0) { S.bossLeft = Math.max(0, S.bossT); gameOver(true); return; }

  // 자동 합성
  if (S.autoMerge && (S.autoT -= dt) <= 0) {
    S.autoT = 0.3;
    for (let i = 0; i < S.slots.length; i++) {
      const s = S.slots[i];
      if (s && !s.hero && !s.lock && s.n >= 3 && !GAME.mergeWarning(i) && GAME.canMerge(i).ok) { S.inAuto = true; GAME.merge(i, false); S.inAuto = false; break; }
    }
  }
}

// ---------- 입력 ----------
cv.addEventListener("pointerdown", (e) => {
  initAudio();
  const r = cv.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
  for (let i = 0; i < S.slots.length; i++) {
    const p = slotPos(i);
    if (Math.abs(x - p.x) < 32 && Math.abs(y - p.y) < 29) { GAME.select(i); return; }
  }
  S.sel = -1;
});

// ---------- 그리기 ----------
// 캔버스 크기는 resize/orientation/ResizeObserver 때만 다시 잰다(매 프레임 getBoundingClientRect 강제 레이아웃 방지)
let fitDirty = true;
function fit(c) {
  const r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  if (w && h && (c.width !== w || c.height !== h)) { c.width = w; c.height = h; }
  return !!(w && h);
}
if (!HEADLESS) {
  const dirty = () => { fitDirty = true; if (typeof requestRenderNow === "function") requestRenderNow(); };
  try { window.addEventListener("resize", dirty); window.addEventListener("orientationchange", dirty); } catch (e) {}
  try { new ResizeObserver(dirty).observe(cv); } catch (e) {}
}
function render() {
  if (fitDirty && fit(cv)) fitDirty = false;
  GFX_SC = cv.width / W;
  ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
  ctx.imageSmoothingQuality = "high";
  ctx.save();
  if (S.shake > 0) ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake);
  drawBoard(ctx, W, H, TRACK, slotPos, S.slots.length, S.sel, S.time, S.slots);
  const su = S.slots[S.sel];
  if (su) { // 사거리 원
    const p = slotPos(S.sel), rg = defOf(su).range;
    ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.fillStyle = "rgba(120,200,255,.12)"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.arc(p.x, p.y, rg, 0, 6.283); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
  }
  S.slots.forEach((u, i) => {
    if (!u) return;
    const p = slotPos(i);
    if (u.hero) drawHero(ctx, S.hero.id, p.x, p.y, S.time, { anim: u.anim, hero: true, selected: S.sel === i, bake: true });
    else drawUnit(ctx, u.ch, p.x, p.y, S.time, { anim: u.anim, count: u.n, selected: S.sel === i, lock: u.lock, bake: true });
  });
  for (const m of S.mobs) {
    const q = trackPoint(m.d), s = m.boss ? (m.final ? 34 : 26) : 12;
    drawMob(ctx, q.x, q.y, s, S.time, m, true);
    const bw = s * 2, bx = q.x - s, by = q.y - s - 12;
    ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.beginPath(); ctx.roundRect(bx, by, bw, 5, 2.5); ctx.fill();
    ctx.fillStyle = m.burn > 0 ? "#ff8a3d" : m.slow > 0 ? "#4aa8ff" : "#ff6b8b"; ctx.beginPath(); ctx.roundRect(bx, by, Math.max(0, (bw * m.hp) / m.max), 5, 2.5); ctx.fill();
    ctx.strokeStyle = "#5b3a1e"; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(bx, by, bw, 5, 2.5); ctx.stroke();
    if (m.armor >= 20) { ctx.fillStyle = "#3a4a6a"; ctx.font = "800 9px Pretendard,system-ui,sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText("🛡" + m.armor + "%", bx, by - 6); }
  }
  for (const e of S.efx) drawEfx(ctx, e);
  for (const pr of S.projs) drawProj(ctx, pr, S.time);
  for (const p of S.parts) drawPart(ctx, p);
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round"; ctx.lineWidth = 3.5; ctx.strokeStyle = "#fff";
  let fSize = -1, fCol = "";
  for (const f of S.fx) { // font/색은 바뀔 때만 설정(Safari 폰트 문자열 파싱 비용)
    const k = 1 - f.t / f.max, y = f.y - 30 - k * 24;
    ctx.globalAlpha = Math.min(1, (f.t / f.max) * 2);
    if (f.size !== fSize) { fSize = f.size; ctx.font = `800 ${f.size}px Pretendard,system-ui,sans-serif`; }
    if (f.col !== fCol) { fCol = f.col; ctx.fillStyle = f.col; }
    ctx.strokeText(f.txt, f.x, y); ctx.fillText(f.txt, f.x, y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  const n = S.mobs.length;
  if (n >= CONST.MOB_WARN[0]) { // 80기 노랑 점멸, 90기 빨강 비네트
    const red = n >= CONST.MOB_WARN[1], a = (red ? 0.4 : 0.25) * (0.7 + Math.sin(S.time * (red ? 10 : 6)) * 0.3);
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75), rgb = red ? "255,40,70" : "255,200,40";
    g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(1, `rgba(${rgb},${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (S.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${Math.min(0.6, S.flash * 4)})`; ctx.fillRect(0, 0, W, H); }
  if (S.banner) {
    const b = S.banner, k = 1 - b.t / b.max, sc = k < 0.15 ? (k / 0.15) * 1.15 : k < 0.25 ? 1.15 - ((k - 0.15) / 0.1) * 0.15 : 1;
    ctx.save(); ctx.translate(W / 2, H * 0.2); ctx.scale(sc, sc); ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
    ctx.font = "800 38px Pretendard,system-ui,sans-serif"; ctx.lineWidth = 8; ctx.strokeStyle = b.boss ? "#7a1f6b" : "#e0558a"; ctx.fillStyle = "#fff";
    ctx.strokeText(b.txt, 0, 0); ctx.fillText(b.txt, 0, 0);
    if (b.sub) { ctx.font = "800 16px Pretendard,system-ui,sans-serif"; ctx.lineWidth = 5; ctx.strokeText(b.sub, 0, 30); ctx.fillText(b.sub, 0, 30); }
    ctx.restore();
  }
  updateHud();
}

// ---------- 메인 루프 (고정 타임스텝 1/60) ----------
// 시뮬 틱은 rAF dt 누적으로만 진행하고 렌더 fps(타이틀 20 / 게임 30·60)는 그리기만 거른다(게임 속도·틱 수는 렌더 fps 와 무관).
// 정지 상태(일시정지·모달·확인창·게임오버)에서는 남은 연출이 끝나면 rAF 를 멈추고 250ms setTimeout 으로 상태만 확인한다.
// 정지 중에는 update 가 paused/over 에서 return 하므로 시뮬 틱(S.tick)·결과는 같다.
let last = performance.now(), acc = 0, parade = null;
let lastR = 0, lastP = 0, forceR = false, stateKey = "", fpsT = 0, fpsN = 0, sleeping = false, sleepT = 0, idleSig = "";
const isTitle = () => typeof TITLE_ON !== "undefined" && TITLE_ON;
const isIdle = () => !!(S.paused || S.over || (typeof MODAL_ON !== "undefined" && MODAL_ON) || (typeof CONFIRM_ON !== "undefined" && CONFIRM_ON));
const curKey = () => (isTitle() ? "t" : "") + (S.paused ? "p" : "") + (S.over ? "o" : "") + (typeof MODAL_ON !== "undefined" && MODAL_ON ? "m" : "") + (typeof CONFIRM_ON !== "undefined" && CONFIRM_ON ? "c" : "");
const curSig = () => curKey() + "|" + S.minerals + "|" + S.sel + "|" + S.speed + "|" + (S.inputs ? S.inputs.length : 0) + "|" + (S.tickets ? S.tickets.length : 0) + "|" + S.slots.reduce((a, u) => a + (u ? 1 + u.n + (u.lock ? 100 : 0) : 0), 0);
const simStopped = () => !!(S.paused || S.over); // 시뮬이 멈춘 상태에서만 잠든다(모달이 떠도 시뮬이 도는 경우는 기존 15fps 유지)
const fxBusy = () => !!(S.fx.length || S.efx.length || S.parts.length || S.banner || S.flash > 0 || S.shake > 0 || S.dispMin !== S.minerals);
function sleepTick() {
  sleepT = 0;
  if (!sleeping) return;
  if (!simStopped() || isTitle() || curSig() !== idleSig) { forceR = true; wakeLoop(); }
  else sleepT = setTimeout(sleepTick, 250);
}
function wakeLoop() {
  if (!sleeping) return;
  sleeping = false; if (sleepT) { clearTimeout(sleepT); sleepT = 0; }
  last = performance.now(); requestAnimationFrame(loop);
}
// 상태 변경/입력 시 한 번 그리기(잠든 루프도 깨운다)
function requestRenderNow() { forceR = true; wakeLoop(); }
if (!HEADLESS) try { for (const ev of ["pointerdown", "pointerup", "keydown"]) document.addEventListener(ev, () => { if (sleeping) setTimeout(requestRenderNow, 0); }, { capture: true, passive: true }); } catch (e) {}
function loop(now) {
  const dt = Math.min(0.1, Math.max(0, now - last) / 1000); last = now;
  acc += dt * S.speed * (S.slowmo > 0 ? 0.35 : 1);
  let steps = 0;
  while (acc >= CONST.DT && steps < 12) { update(CONST.DT); acc -= CONST.DT; steps++; }
  if (steps >= 12) acc = 0;
  const title = isTitle(), idle = isIdle(), key = curKey();
  if (key !== stateKey) { stateKey = key; forceR = true; fpsT = 0; fpsN = 0; }
  GFX_RFPS = GFX_SAVE || GFX_LOW ? 30 : 60;
  if (title) { // 타이틀(전체 덮음): 보드/HUD 는 전환 때 1회만, 퍼레이드만 20fps
    if (forceR) { forceR = false; render(); }
    if (now - lastP >= 1000 / 20 - 1.5) {
      lastP = now;
      if (!parade) parade = $("parade").getContext("2d");
      drawParade(parade, 340, 150, now / 1000);
    }
  } else if (idle) { // 정지: 남은 연출(15fps)이 끝나면 잠든다
    const busy = fxBusy() || !simStopped();
    if (forceR || (busy && now - lastR >= 1000 / 15 - 1.5)) { forceR = false; lastR = now; render(); }
    if (!busy) { sleeping = true; idleSig = curSig(); sleepT = setTimeout(sleepTick, 250); return; }
  } else {
    const gap = now - lastR;
    if (forceR || gap >= 1000 / GFX_RFPS - 1.5) {
      forceR = false; lastR = now;
      // 런타임 자동 하향: 평상시(60fps 목표) 2초 평균 fps < 40 이면 저사양 고정
      if (!GFX_LOW && !GFX_SAVE && GFX_AUTO && !(typeof document !== "undefined" && document.hidden) && gap < 500) {
        fpsT += gap; fpsN++;
        if (fpsT >= 2000) { if (fpsN * 1000 / fpsT < 40) GFX_LOW = true; fpsT = 0; fpsN = 0; }
      } else { fpsT = 0; fpsN = 0; }
      render();
    }
  }
  requestAnimationFrame(loop);
}

newGame("daily");
requestAnimationFrame(loop);
