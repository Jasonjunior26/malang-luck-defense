"use strict";
// 말랑 운빨 디펜스 - 코어 (스운디 이식). 규칙 데이터/순수 헬퍼는 data.js, 렌더는 graphics.js, DOM/모달은 ui.js.
const cv = $("cv"), ctx = cv.getContext("2d");
const W = CONST.W, H = CONST.H;
const HEADLESS = typeof window === "undefined"; // 시뮬 검증 모드에서 FX 호출 생략용
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
function newGame(mode, forceSeed, rules) {
  let R = {}; // 규칙(모디파이어). 없으면 {} -> 아래 분기는 전부 기본 동작
  if (rules) { const v = validateRules(rules); if (!v.ok) throw new Error(v.err); R = v.rules; }
  CONST.ROUNDS = R.rounds || CONST.ROUNDS_BASE;
  const seed = forceSeed || Math.floor(Math.random() * 2147483646) + 1; // 매 판 새 시드 (랭킹 판도 서버가 이 시드로 재현 검증)
  const rng = makeRngs(seed);
  const hero = heroOfDay(rng.hero, R.heroPool);
  const hx = hero.fx || {};
  UP_MUL = hx.upCost || 1; // 히어로가 바꾸는 상수는 매 판 기준값에서 다시 계산 (판매가·뽑기 비용)
  if (CONST.DRAW_COST0 == null) CONST.DRAW_COST0 = CONST.DRAW_COST;
  CONST.DRAW_COST = (R.drawCost != null ? R.drawCost : CONST.DRAW_COST0) - (hx.drawCost || 0);
  for (const g of GRADES) { if (g.sell0 == null) g.sell0 = g.sell; g.sell = g.sell0 > 0 ? Math.round(g.sell0 * (hx.sellMul || 1)) : 0; }
  S = {
    mode, seed, rng, hero, rules: R, minerals: (R.startMin != null ? R.startMin : CONST.START_MIN) + (hx.startMin || 0), dispMin: 0, draws: 0,
    round: 0, roundT: 0, bossT: 0, nextT: -1, over: false, win: false, paused: true, speed: 1, time: 0, frame: 0, tick: 0, inAuto: false,
    slots: Array(CONST.SLOTS).fill(null), sel: -1,
    up: [0, 1, 2, 3].map((c) => ({ bought: 0, bonus: (hx.lv && hx.lv[c]) || 0 })),
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
  for (let c = 0; c < 4; c++) {
    S.reso[c] = resonanceCount(S.slots, c); // 서로 다른 등급 종류 수
    const rb = resonanceBonus(S.slots, c);
    S.resonance[c] = S.reso[c];
    S.lv[c] = Math.min(CONST.UP_LV_CAP, clanLevel(S, c) + rb);
    if (S.lv[c] > mx) mx = S.lv[c];
    if (rb > 0 && !S.resoGot[c]) { S.resoGot[c] = true; S.minerals += CONST.RESONANCE_FIRST; log(`${CLANS[c].name} 공명! +${CONST.RESONANCE_FIRST}`, CLANS[c].color); }
  }
  S.heroLv = Math.floor(mx * 0.5);
}
const unitMul = (u) => dmgMul(u.hero ? S.heroLv : S.lv[u.ch % 4]);

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
function defOf(u) {
  if (u.hero) return { fx: "shot", atk: HERO_UNIT.atk, cd: HERO_UNIT.cd, range: HERO_UNIT.range, aoe: null, pierce: 0, st: null, shot: [null, null], grade: 3 };
  const c = CHARS[u.ch]; return { fx: c.fx, atk: c.atk, cd: c.cd, range: c.range, aoe: c.aoe, pierce: c.pierce || 0, st: c.st, shot: c.shot, grade: c.grade };
}
function launch(u, i, f) {
  const p = slotPos(i), d = defOf(u);
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
  if (hx.interest) S.minerals += Math.min(hx.interest.max, Math.floor(S.minerals / hx.interest.per) * hx.interest.gain);
  if (hx.roundMin) { S.minerals += hx.roundMin; }
  if (hx.roundHidden && S.round > 1 && S.rng.misc() < hx.roundHidden) {
    const ci = rollChar(S.rng.misc, 4);
    if (addUnit(ci, true)) log(`달토끼 점쟁이의 선물! [히든] ${CHARS[ci].name}`, GRADES[4].color);
    else { S.tickets.push(4); log("점쟁이의 선물! 히든 선택권을 보관해요", GRADES[4].color); }
    sfx("drawHi");
  }
}
function spawn() {
  const info = S.info;
  const hp = Math.round(info.hp * hpMul(info.r) * (S.rules.hpMul || 1)), boss = info.boss;
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
function countOf(ch) { let n = 0; for (const s of S.slots) if (s && !s.hero && s.ch === ch) n += s.n; return n; }
function afterChange() {
  refreshLevels();
  const hx = S.hero.fx || {}, fl = S.heroState.flags;
  if (hx.collect) {
    for (let g = 0; g < 8; g++) {
      if (fl["c" + g]) continue;
      if ([0, 1, 2, 3].every((c) => countOf(g * 4 + c) > 0)) { fl["c" + g] = 1; fl.cn = (fl.cn || 0) + 1; S.minerals += hx.collect.bonus; log(`컬렉션 완성! ${GRADES[g].name} 4종 +${hx.collect.bonus}`, "#3b9dff"); sfx("ticket"); }
    }
  }
  if (hx.hold && !fl.hold && countOf(hx.hold.ch) >= hx.hold.n) { fl.hold = 1; S.minerals += hx.hold.bonus; log(`${CHARS[hx.hold.ch].name} ${hx.hold.n}기 보유 보너스 +${hx.hold.bonus}!`, "#ff9ec0"); sfx("ticket"); }
  updateProgress();
}
function updateProgress() {
  const hx = S.hero.fx || {}, fl = S.heroState.flags;
  let t = "";
  if (hx.collect) { let best = 0; for (let g = 0; g < 8; g++) { if (fl["c" + g]) continue; const n = [0, 1, 2, 3].filter((c) => countOf(g * 4 + c) > 0).length; if (n > best) best = n; } t = `컬렉션 ${fl.cn || 0}/8 (진행 ${best}/4)`; }
  else if (hx.hold) t = fl.hold ? "달성 완료 +" + hx.hold.bonus : `${CHARS[hx.hold.ch].name} ${Math.min(countOf(hx.hold.ch), hx.hold.n)}/${hx.hold.n}`;
  else if (hx.drawBonus) t = `${CHARS[hx.drawBonus.ch].name} 뽑기 ${fl.db || 0}회 (+${(fl.db || 0) * hx.drawBonus.bonus})`;
  else if (hx.interest) t = `이자 최대 +${hx.interest.max}`;
  else if (hx.mergeMin) t = `합성 +${hx.mergeMin}`;
  else if (hx.mergeTwin) t = "합성 8% 쌍둥이";
  else if (hx.roundMin) t = `라운드 수입 +${hx.roundMin}`;
  else if (hx.killLuck) t = `대박 ${fl.kl || 0}회`;
  else if (hx.roundHidden) t = `히든 선물 ${fl.rh || 0}기`;
  S.heroState.progress = t;
}

// ---------- 공개 API ----------
const GAME = {
  draw() {
    if (S.over || S.paused) return false;
    if (S.rules.drawLimit && S.draws >= S.rules.drawLimit) { return false; }
    if (S.minerals < CONST.DRAW_COST) { return false; }
    if (freeSlot() < 0) { log("자리가 없어요! 판매하거나 합성하세요", "#e0558a"); sfx("deny"); return false; }
    S.minerals -= CONST.DRAW_COST; S.draws++; inp("draw");
    const probs = gradeProbs(S.hero, S.rules), g = rollGrade(S.rng.gacha, probs), ci = rollChar(S.rng.gacha, g, S.rules.clanBan), c = CHARS[ci];
    const hx = S.hero.fx || {};
    if (hx.drawBonus && ci === hx.drawBonus.ch) { S.minerals += hx.drawBonus.bonus; S.heroState.flags.db = (S.heroState.flags.db || 0) + 1; }
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
    const s = S.slots[i], hx = S.hero.fx || {}, fl = S.heroState.flags;
    if (!s || s.hero) return null;
    const left = s.n - 3;
    if (hx.hold && !fl.hold && s.ch === hx.hold.ch && s.n >= 5 && left < hx.hold.n) return `봉봉이 보너스까지 ${hx.hold.n - s.n}기 남았어요. 그래도 합성할까요?`;
    if (hx.collect && left === 0 && !fl["c" + (s.ch >> 2)]) {
      const g = s.ch >> 2, have = [0, 1, 2, 3].filter((c) => countOf(g * 4 + c) > 0).length;
      if (have >= 3) return `${GRADES[g].name} 컬렉션 보너스(+${hx.collect.bonus})가 눈앞이에요. 그래도 합성할까요?`;
    }
    return null;
  },
  merge(i, all) {
    let done = 0;
    for (let guard = 0; guard < 40; guard++) {
      const s = S.slots[i];
      if (!this.canMerge(i).ok) break;
      const g = s.ch >> 2, ci = mergeResult(S.rng.merge, g, S.rules.clanBan);
      s.n -= 3; const p = slotPos(i);
      if (s.n <= 0) S.slots[i] = null;
      const si = placeUnit(ci, i);
      const hxm = S.hero.fx;
      if (hxm.mergeMin) S.minerals += hxm.mergeMin;
      if (hxm.mergeTwin && S.rng.misc() < hxm.mergeTwin && freeSlot() >= 0 && addUnit(ci, true)) { log(`쌍둥이 다람쥐! ${CHARS[ci].name} 한 기 더!`, GRADES[ci >> 2].color); sfx("drawHi"); }
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
    log(`${CLANS[c].name} 강화 Lv${S.lv[c]}!`, CLANS[c].color); sfx("upgrade"); return true;
  },
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
  start(mode, seed, rules) {
    if (!rules && !HEADLESS && mode === "practice") { try { const q = new URLSearchParams(location.search).get("rules"); if (q) rules = JSON.parse(q); } catch (e) { rules = null; } } // 개발용: ?rules={"hpMul":1.5} 연습 모드 전용(랭킹 제외)
    newGame(mode === "practice" ? "practice" : "daily", seed, rules); S.paused = false; S.sel = -1; return S; },
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
  r *= m.rew; // 라운드 몹 수가 늘어난 만큼 개체 보상 비례 감소(라운드 총 보상 유지)
  if (hx.killLuck && S.rng.misc() < hx.killLuck.p) { r *= hx.killLuck.mul; S.heroState.flags.kl = (S.heroState.flags.kl || 0) + 1; const q = trackPoint(m.d); pop(q.x, q.y - 8, `대박 +${Math.max(1, Math.round(r))}`, 0.9, "#e0a000", 14); }
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
    const d = defOf(u);
    const best = nearest(p, d.range);
    if (!best) continue;
    const q = trackPoint(best.d);
    u.cd = d.cd;
    u.shots = (u.shots || 0) + 1;
    const sup = !!u.hero && u.shots % 4 === 0;
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
function fit(c) {
  const r = c.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
  const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  if (w && h && (c.width !== w || c.height !== h)) { c.width = w; c.height = h; }
}
function render() {
  fit(cv);
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
    if (u.hero) drawHero(ctx, S.hero.id, p.x, p.y, S.time, { anim: u.anim, hero: true, selected: S.sel === i });
    else drawUnit(ctx, u.ch, p.x, p.y, S.time, { anim: u.anim, count: u.n, selected: S.sel === i, lock: u.lock });
  });
  for (const m of S.mobs) {
    const q = trackPoint(m.d), s = m.boss ? (m.final ? 34 : 26) : 12;
    drawMob(ctx, q.x, q.y, s, S.time, m);
    const bw = s * 2, bx = q.x - s, by = q.y - s - 12;
    ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.beginPath(); ctx.roundRect(bx, by, bw, 5, 2.5); ctx.fill();
    ctx.fillStyle = m.burn > 0 ? "#ff8a3d" : m.slow > 0 ? "#4aa8ff" : "#ff6b8b"; ctx.beginPath(); ctx.roundRect(bx, by, Math.max(0, (bw * m.hp) / m.max), 5, 2.5); ctx.fill();
    ctx.strokeStyle = "#5b3a1e"; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(bx, by, bw, 5, 2.5); ctx.stroke();
    if (m.armor >= 20) { ctx.fillStyle = "#3a4a6a"; ctx.font = "9px Jua,system-ui,sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText("🛡" + m.armor + "%", bx, by - 6); }
  }
  for (const e of S.efx) drawEfx(ctx, e);
  for (const pr of S.projs) drawProj(ctx, pr, S.time);
  for (const p of S.parts) drawPart(ctx, p);
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
  for (const f of S.fx) {
    const k = 1 - f.t / f.max, y = f.y - 30 - k * 24;
    ctx.globalAlpha = Math.min(1, (f.t / f.max) * 2);
    ctx.font = `${f.size}px Jua,system-ui,sans-serif`; ctx.lineWidth = 3.5; ctx.strokeStyle = "#fff"; ctx.fillStyle = f.col;
    ctx.strokeText(f.txt, f.x, y); ctx.fillText(f.txt, f.x, y); ctx.globalAlpha = 1;
  }
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
    ctx.font = "38px Jua,system-ui,sans-serif"; ctx.lineWidth = 8; ctx.strokeStyle = b.boss ? "#7a1f6b" : "#e0558a"; ctx.fillStyle = "#fff";
    ctx.strokeText(b.txt, 0, 0); ctx.fillText(b.txt, 0, 0);
    if (b.sub) { ctx.font = "16px Jua,system-ui,sans-serif"; ctx.lineWidth = 5; ctx.strokeText(b.sub, 0, 30); ctx.fillText(b.sub, 0, 30); }
    ctx.restore();
  }
  updateHud();
}

// ---------- 메인 루프 (고정 타임스텝 1/60) ----------
let last = performance.now(), acc = 0, parade = null;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  acc += dt * S.speed * (S.slowmo > 0 ? 0.35 : 1);
  let steps = 0;
  while (acc >= CONST.DT && steps < 12) { update(CONST.DT); acc -= CONST.DT; steps++; }
  if (steps >= 12) acc = 0;
  render();
  if (typeof TITLE_ON !== "undefined" && TITLE_ON) { // 타이틀 퍼레이드
    if (!parade) { const c = $("parade"); c.width = 680; c.height = 300; parade = c.getContext("2d"); parade.setTransform(2, 0, 0, 2, 0, 0); }
    drawParade(parade, 340, 150, now / 1000);
  }
  requestAnimationFrame(loop);
}

newGame("daily");
requestAnimationFrame(loop);
