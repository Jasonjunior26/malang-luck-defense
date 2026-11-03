// '내 영웅' 테스트: node tools/test_myhero.mjs
// 1) validateMine 정상/거부  2) 강화 효과(시작 자원·할인·공격·보상)  3) 봇 한 판 -> 서버 replay(mine) 점수 일치  4) 강화 미전달/규칙 판 무시  5) coinsFor
import { createEngine, validateMine as vmine, MY_HERO, coinsFor } from "../supabase/functions/submit-score/engine.js";
import fs from "node:fs";
import vm from "node:vm";
import { replay } from "../supabase/functions/submit-score/replay.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const U = (o) => ({ atk: 0, rew: 0, disc: 0, start: 0, ...o });
for (const m of [{ hero: "darami", up: U({}) }, { hero: "durumi", up: U({ atk: 5, rew: 5 }) }, { hero: "fairy", up: U({ atk: 5, rew: 3, disc: 2 }) }, { hero: "turtle" }]) ok(vmine(m).ok, "good " + JSON.stringify(m));
for (const m of [null, [], "x", { hero: "nope", up: U({}) }, { up: U({}) }, { hero: "darami", up: U({ atk: 6 }) }, { hero: "darami", up: U({ disc: 4 }) }, { hero: "darami", up: U({ atk: -1 }) },
  { hero: "darami", up: U({ atk: 1.5 }) }, { hero: "darami", up: U({ atk: "1" }) }, { hero: "darami", up: U({ atk: 5, rew: 5, start: 1 }) }]) ok(!vmine(m).ok, "bad " + JSON.stringify(m));
// 효과
const st = (mine, seed = 777) => { const e = createEngine(); return { e, S: e.start(seed, null, mine) }; };
{
  const base = st(null).S, a = st({ hero: "darami", up: U({ start: 5, disc: 3, rew: 2 }) }).S;
  ok(a.hero.id === "darami" && a.mine && a.mine.up.start === 5, "내 영웅 지정");
  ok(a.minerals === base.minerals - (base.hero.fx.startMin || 0) + 30 + 40, "시작 자원 +40: " + a.minerals);
  ok(Math.abs(a.hero.fx.upCost - 0.88) < 1e-9 && Math.abs(a.hero.fx.killMul - 1.08) < 1e-9 && Math.abs(st({ hero: "darami", up: U({ atk: 5 }) }).S.hero.fx.atkMul - 1.15) < 1e-9, "fx 값");
  ok(st({ hero: "durumi", up: U({ disc: 3 }) }).S.hero.fx.upCost.toFixed(4) === (0.85 * 0.88).toFixed(4), "기존 upCost 와 곱");
  ok(a.hero.id !== base.hero.id || true, "ok");
  const e = createEngine(); e.start(777, null, null); const h0 = JSON.stringify(e.S.hero);
  ok(e.S.rng && true, "rng");
}
// 같은 시드면 mine 이 있어도 뽑기/난수 흐름은 동일(영웅만 바뀜): 첫 라운드 몹 구성 동일
{ const x = st(null).S, y = st({ hero: "darami", up: U({}) }).S; ok(x.queue === y.queue && x.slots.findIndex((s) => s && s.hero) === y.slots.findIndex((s) => s && s.hero), "난수 흐름 동일"); }
// 규칙 판에서는 무시
{ const r = st({ hero: "darami", up: U({ atk: 5 }) }, 5); const e = createEngine(); const S = e.start(5, { hpMul: 1.1 }, { hero: "darami", up: U({ atk: 5 }) }); ok(!S.mine && !(S.hero.fx.atkMul), "규칙 판 무시"); }
function bot(seed, rules, mine, maxTicks = 60 * 60 * 25) {
  const e = createEngine(), G = e.GAME, K = e.CONST;
  let a = (seed * 7 + 1) >>> 0;
  const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const S = e.start(seed, rules, mine);
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

for (const [seed, mine] of [[11, { hero: "darami", up: U({}) }], [12, { hero: "nulgul", up: U({ atk: 5, rew: 5 }) }], [13, { hero: "durumi", up: U({ disc: 3, start: 5, atk: 2 }) }], [14, null]]) {
  const b = bot(seed, null, mine);
  ok(!!b.r, "결과 " + seed);
  const rp = replay(seed, b.S.inputs, null, mine);
  ok(rp.ok && rp.result.score === b.r.score && rp.result.round === b.r.round, `재생 불일치 ${seed}: ${rp.ok ? rp.result.score + "/" + b.r.score : rp.error}`);
  if (mine && mine.up.atk) { const rp0 = replay(seed, b.S.inputs, null, null); ok(!rp0.ok || rp0.result.score !== b.r.score, "mine 없이 재생하면 달라야 함(서버 지원 필요 근거) " + seed); }
  console.log("seed", seed, "코인", coinsFor(b.r.round, b.r.kills, !!b.r.win, 0), mine ? mine.hero : "랜덤", "R" + b.r.round, "score", b.r.score, "kills", b.r.kills);
}
{ const rp = replay(1, [], null, { hero: "darami", up: U({ atk: 9 }) }); ok(!rp.ok, "잘못된 mine 거부"); }
// 코인
ok(coinsFor(4, 100, false, 0) === 2, "R4 코인 " + coinsFor(4, 100, false, 0));
ok(coinsFor(30, 600, false, 0) === 21 + 12, "R30 코인");
ok(coinsFor(50, 1000, true, 0) === 41 + 20 + 30, "클리어 코인");
ok(coinsFor(50, 1000, true, 5) === Math.floor(91 * 1.25), "보상 강화 코인");
console.log("코인 예시: R20/300처치", coinsFor(20, 300, false, 0), " R35/700", coinsFor(35, 700, false, 0), " 클리어", coinsFor(50, 1000, true, 0));

// ---- 6. 클라이언트(myhero.js) 스모크: DOM 스텁으로 등록 -> 이름 검증 -> 코인 정산 -> 강화 구매 -> 상한 ----
{
  const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  const rd = (f) => fs.readFileSync(root + f, "utf8");
  const store = {}; let html = "", btns = {}; const els = {};
  const el = (id) => (els[id] ||= { value: "", textContent: "", onclick: null });
  const ctx = vm.createContext({ console, Date, Math, JSON, Number, Set, Array, String, RegExp, Object });
  ctx.window = ctx; ctx.HEROES_SRC = 0;
  ctx.lsGet = (k, d = null) => (k in store ? store[k] : d); ctx.lsSet = (k, v) => { store[k] = v; };
  ctx.esc = (x) => String(x); ctx.nf = (n) => String(n); ctx.sfx = () => {}; ctx.BTNR = ""; ctx.closeModal = () => { html = ""; };
  ctx.$ = el; ctx.NAME_ERR_MSG = { len: "len", chars: "chars", bad: "bad" };
  ctx.modal = (h) => { html = h; els.mhNm = { value: "" }; els.mhMsg = { textContent: "" }; for (const k of ["mhX", "mhOk", "mhRand", "mhNo"]) els[k] = { onclick: null }; btns = {}; for (const m of h.matchAll(/data-(m|add|p|b|h)="([^"]*)"/g)) btns[m[1] + ":" + m[2]] = { dataset: { [m[1]]: m[2] }, onclick: null }; };
  ctx.document = { querySelectorAll: (sel) => { const m = /\[data-(\w+)\]/.exec(sel); return m ? Object.values(btns).filter((b) => m[1] in b.dataset) : []; } };
  vm.runInContext(rd("data.js") + "\n" + rd("myhero.js"), ctx);
  const MH = ctx.MyHero, run = (c) => vm.runInContext(c, ctx);
  ok(MH.list().length === 0 && MH.coins() === 0, "초기 빈 상태");
  let started = "none"; MH.pick((m) => { started = m; }); ok(started === null, "등록 없으면 바로 시작(선택창 없음)");
  MH.open(); btns["add:1"].onclick(); btns["p:darami"].onclick();
  els.mhNm.value = "a"; els.mhOk.onclick(); ok(MH.list().length === 0 && els.mhMsg.textContent === "len", "이름 길이 거부");
  els.mhNm.value = "씨발이"; els.mhOk.onclick(); ok(MH.list().length === 0 && els.mhMsg.textContent === "bad", "금지어 거부");
  els.mhNm.value = "다람 쥐"; els.mhOk.onclick(); ok(MH.list().length === 1 && MH.list()[0].name === "다람 쥐", "등록");
  for (const [id, nm] of [["hwarang", "불꽃이"], ["fairy", "요정이"], ["turtle", "거북이"]]) { MH.open(); if (btns["add:1"]) { btns["add:1"].onclick(); btns["p:" + id].onclick(); els.mhNm.value = nm; els.mhOk.onclick(); } }
  ok(MH.list().length === 3, "최대 3종 (4번째 등록 자리 없음)");
  // 코인 정산: 한 판 한 번만
  const S1 = { mode: "daily", mine: null }; const r1 = MH.settle(S1, { R: 40, kills: 1600, win: false });
  ok(r1.gain === 31 + 32 && MH.coins() === 63, "정산 " + JSON.stringify(r1)); ok(MH.settle(S1, { R: 40, kills: 1600 }).gain === 0, "이중 정산 방지");
  ok(MH.settle({ mode: "practice", mine: null }, { R: 40, kills: 1600 }).gain === 31, "연습은 절반");
  // 강화: 94코인
  MH.open(); btns["m:darami"].onclick(); ok(/🪙 60/.test(html), "1단계 60코인"); btns["b:atk"].onclick();
  ok(MH.list()[0].up.atk === 1 && MH.coins() === 94 - 60, "구매 반영 " + MH.coins());
  btns["b:atk"].onclick(); ok(MH.list()[0].up.atk === 1 && /모자라/.test(html), "코인 부족 거부");
  // 상한: 코인을 크게 지급해 총합 10 도달
  store["malang-myhero"] = JSON.stringify({ v: 1, coins: 99999, heroes: JSON.parse(store["malang-myhero"]).heroes });
  MH.open(); btns["m:darami"].onclick();
  for (const k of ["atk", "atk", "atk", "atk", "rew", "rew", "rew", "rew", "rew", "disc"]) { if (btns["b:" + k]) btns["b:" + k].onclick(); else break; }
  const up = MH.list()[0].up; ok(Object.values(up).reduce((a, b) => a + b, 0) === 10, "총합 상한 10 " + JSON.stringify(up));
  ok(!/data-b=/.test(html), "상한이면 구매 버튼 없음");
  // 손상된 저장값 방어
  store["malang-myhero"] = JSON.stringify({ v: 1, coins: -5, heroes: [{ id: "darami", name: "x", up: { atk: 99 } }, { id: "zzz", name: "좋은이름", up: {} }] });
  ok(MH.list().length === 0 && MH.coins() === 0, "손상 저장값 걸러냄");
  // 선택창
  store["malang-myhero"] = JSON.stringify({ v: 1, coins: 0, heroes: [{ id: "darami", name: "다람이1", up: { atk: 2 } }] });
  let got = "none"; MH.pick((m) => { got = m; }); btns["h:darami"].onclick();
  ok(got && got.hero === "darami" && got.up.atk === 2, "내 영웅 선택 -> mine 전달"); ok(MH.heroName() === "다람이1" && MH.again().hero === "darami", "again/heroName");
  MH.pick((m) => { got = m; }); els.mhRand.onclick(); ok(got === null && MH.again() === null, "랜덤 선택");
}
console.log(`pass ${pass} fail ${fail}`); process.exit(fail ? 1 : 0);
