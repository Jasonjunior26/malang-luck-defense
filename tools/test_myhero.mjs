// '내 영웅' v2 테스트: node tools/build_engine.js 후 node tools/test_myhero.mjs
// 1) 카탈로그 계약(디자인 20·품목 24+·비용 배열)  2) validateMine 정상/거부  3) applyMine 효과  4) 봇 한 판 -> 서버 replay(mine) 점수 일치
// 5) 규칙 판 무시·운빨 리그 불변  6) 비용 헬퍼·coinsFor·레거시 변환  7) myhero.js(v2 화면, 단계 C) 스모크 - v2 가 아니면 건너뜀
import * as E from "../supabase/functions/submit-score/engine.js";
import fs from "node:fs";
import vm from "node:vm";
import { replay } from "../supabase/functions/submit-score/replay.js";
const { createEngine, validateMine: vmine, applyMine, coinsFor, MY_DESIGNS, MY_ITEMS, MY_CATS, MY_GRPS, MY_ABILITY_MAX, MY_SLOTS, MY_EQUIP_MAX, MY_FULL_COST, MY_OLD_COST, itemCost, mineTotalCost, mineCoinLv, migrateLegacyMine, migrateMarketHero, canBuy, myAbilities, myReqOk } = E;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const M = (items = {}, equip = {}, design = "cat") => ({ design, items, equip });

// ---- 1. 카탈로그 계약 ----
const IDS = "bee goose weasel whale hedgehog chameleon frog penguin fennec owlsage fox cat bunny bear panda dragon unicorn octopus turtle raccoon".split(" ");
ok(MY_DESIGNS.length === 20 && MY_DESIGNS.every((d, i) => d.id === IDS[i] && typeof d.name === "string" && d.name), "디자인 20종 id 고정");
ok(MY_ITEMS.length >= 24 && new Set(MY_ITEMS.map((x) => x.id)).size === MY_ITEMS.length, "품목 24종 이상, id 중복 없음: " + MY_ITEMS.length);
ok(MY_CATS.map((c) => c.k).join() === "ability,basic,ultimate" && MY_ITEMS.every((x) => MY_CATS.some((c) => c.k === x.cat)), "분류 3개(능력·기본공격·필살), 모두 MY_CATS 에 있음");
ok(MY_ITEMS.filter((x) => x.cat === "ability").length === 24 && MY_ITEMS.filter((x) => x.cat === "basic").length === 8 && MY_ITEMS.filter((x) => x.cat === "ultimate").length === 7 && MY_ITEMS.filter((x) => x.cat === "ability").every((x) => !x.sk && MY_GRPS.some((g) => g.k === x.grp)) && MY_ITEMS.filter((x) => x.sk).every((x) => x.slot === (x.cat === "basic" ? "basic" : "ult") && x.id.startsWith(x.slot === "basic" ? "sk_" : "ul_")), "능력 24·기본공격 8(1·2단계)·필살 7(2·3단계)");
for (const x of MY_ITEMS) {
  ok(Array.isArray(x.cost) && x.cost.length === x.max && x.cost.every((c, i) => Number.isInteger(c) && c > 0 && (i === 0 || c >= x.cost[i - 1])), "비용 배열 " + x.id);
  ok(typeof x.name === "string" && typeof x.ico === "string" && typeof x.txt(x.max) === "string" && !/undefined|NaN/.test(x.txt(x.max)) && !/undefined|NaN/.test(x.txt(1)), "문구 " + x.id + " " + x.txt(x.max));
  ok(x.pw === undefined && (x.sk ? x.max === 1 && x.tier >= 1 : typeof x.ap === "function"), "스킬/수치 형식·전투력(pw) 없음 " + x.id);
}
const kinds = new Set(MY_ITEMS.filter((x) => x.sk).map((x) => x.sk.fx));
ok(["tongue", "slash", "wave", "lob", "chain", "breath", "roar", "beam", "nova", "meteor", "storm"].every((k) => kinds.has(k)), "스킬 = game.js launch 종류 11개");
ok(MY_EQUIP_MAX === 2 && MY_ABILITY_MAX === 2 && MY_SLOTS.join() === "basic,ult" && typeof MY_POWER_CAP === "undefined" && typeof E.myPower === "undefined" && typeof E.MY_POWER_ALL === "undefined", "전투력 상한 개념 없음(MY_POWER_CAP·myPower 삭제)");
ok(MY_FULL_COST === MY_ITEMS.reduce((a, x) => a + x.cost.reduce((s, c) => s + c, 0), 0) && MY_FULL_COST > 15000, "전 품목 비용 " + MY_FULL_COST);

// ---- 2. validateMine ----
const SPEC = { trophy: 1, reso: 1, merge: 5, drawc: 1, lucky: 3, income: 3, kill: 6, btime: 5 };
const SKALL = Object.fromEntries(MY_ITEMS.filter((x) => x.sk).map((x) => [x.id, 1]));
const goods = [M(), { design: "bee" }, M({ atk: 3, start: 2 }), M({ trophy: 1, reso: 1 }), M({ atk: 10, hpow: 10 }), M({ merge: 5, lucky: 3, ...SKALL }, { basic: "sk_chain", ult: "ul_storm" }), M({ sk_lob: 1, sk_chain: 1, ul_chain: 1, ul_storm: 1 }, { basic: "sk_chain", ult: "ul_storm" }), M({ sk_tongue: 1 }, { basic: "sk_tongue" }), M({ ul_beam: 1 }, { ult: "ul_beam" }), M({ atk: 0 }), M({}, {}, "raccoon"), M({ atk: 1, spd: 5 }, { basic: null, ult: null }), M({ hpow: 10, hlv: 5, sk_lob: 1 }, { basic: "sk_lob" })];
for (const m of goods) ok(vmine(m).ok, "good " + JSON.stringify(m));
const bads = [null, [], "x", { design: "nope" }, { items: {} }, M({ nope: 1 }), M({ atk: 11 }), M({ atk: -1 }), M({ atk: 1.5 }), M({ atk: "1" }), M({ reso: 2 }),
  M({ sk_chain: 1 }), M({ ul_storm: 1 }), M({ sk_lob: 1, sk_storm: 1 }), M({ sk_lob: 1 }, { basic: "sk_chain" }), M({ sk_lob: 1 }, { ult: "sk_lob" }), M({ ul_chain: 1 }, { basic: "ul_chain" }), M({ sk_lob: 1 }, { basic: "sk_lob", extra: "x" }),
  M({ sk_lob: 1 }, ["sk_lob"]), M({ sk_lob: 1, sk_chain: 1 }, ["sk_lob", "sk_chain"]), M({ atk: 1 }, { basic: "atk" }), M([]), { design: "cat", items: [], equip: {} }, M({}, "sk_lob"), M({}, { basic: 5 }), M({}, [null]),
  M({ atk: 1, spd: 1, range: 1 }), M({ hpow: 1, hlv: 1, kill: 1 }), M({ reso: 1, trophy: 1, drawc: 1 }), M({ atk: 10, spd: 5, sk_lob: 1, hpow: 1 }), M({ sk_lob: 1, ul_chain: 1 }, { basic: "ul_chain" })];
for (const m of bads) ok(!vmine(m).ok, "bad " + JSON.stringify(m));
ok(vmine({ hero: "bee", up: { atk: 1 } }).err === "mine_legacy", "레거시 {hero,up} -> mine_legacy");
{ const v = vmine(M({ start: 2, atk: 0, kill: 1, sk_lob: 1 }, { basic: "sk_lob" })); ok(v.ok && JSON.stringify(v.mine.items) === JSON.stringify({ kill: 1, start: 2, sk_lob: 1 }) && JSON.stringify(v.mine.equip) === JSON.stringify({ basic: "sk_lob", ult: null }) && v.mine.design === "cat", "정리: 0 단계 제거·카탈로그 순서·equip 객체 " + JSON.stringify(v.mine)); }
ok(myReqOk("sk_tongue", {}) && !myReqOk("sk_beam", {}) && myReqOk("sk_beam", { sk_wave: 1 }) && myReqOk("ul_beam", {}) && !myReqOk("ul_nova", {}) && !myReqOk("ul_nova", { sk_roar: 1 }) && myReqOk("ul_nova", { ul_roar: 1 }) && !myReqOk("sk_beam", { ul_roar: 1 }) && myReqOk("atk", {}), "선행 조건(칸별)");

// ---- 3. applyMine / 게임 적용 ----
const st = (mine, seed = 777, rules = null) => { const e = createEngine(); return { e, S: e.start(seed, rules, mine) }; };
{
  const h0 = applyMine(vmine(M({}, {}, "dragon")).mine);
  ok(h0.id === "dragon" && h0.name === "아기 용" && h0.rule === "일반 공격" && Object.keys(h0.fx).length === 0, "기본 영웅: 일반 공격만, fx 없음");
  const h = applyMine(M({ atk: 10, start: 3, upc: 5, kill: 6, trophy: 1, lucky: 3, hpow: 5, sk_lob: 1, ul_chain: 1 }, { basic: "sk_lob", ult: "ul_chain" })); // 능력 개수 검증은 validateMine 몫, applyMine 은 효과 수식만 확인
  ok(Math.abs(h.fx.atkMul - 1.05) < 1e-9 && h.fx.startMin === 12 && Math.abs(h.fx.upCost - 0.95) < 1e-9 && Math.abs(h.fx.killMul - 1.075) < 1e-9 && h.fx.bossUp === 2 && h.fx.bossUpEvery === 4 && h.fx.freeDraw === 5 && Math.abs(h.fx.heroAtk - 2) < 1e-9, "fx 값 " + JSON.stringify(h.fx));
  ok(h.fx.hsk.fx === "lob" && h.fx.hsk2.fx === "chain" && h.rule === "기본: 대나무 투척 · 필살: 연쇄 번개", "장착 스킬 hsk/hsk2·rule " + h.rule);
  { const u = applyMine(M({ ul_beam: 1 }, { ult: "ul_beam" })), b = applyMine(M({ sk_wave: 1 }, { basic: "sk_wave" })); ok(!u.fx.hsk && u.fx.hsk2.fx === "beam" && u.rule === "필살: 달빛 광선" && b.fx.hsk.fx === "wave" && !b.fx.hsk2 && b.rule === "기본: 물결 파동", "칸이 비면 그 공격은 일반 공격(서로 대신하지 않음)"); }
  ok(applyMine({ design: "bee" }, vmine(M({}, {}, "frog")).mine).id === "frog", "옛 2인자 호출 호환");
  const base = st(null).S, a = st(M({ start: 3, drawc: 1 })).S;
  ok(a.hero.id === "cat" && a.mine && a.mine.items.start === 3, "내 영웅 지정");
  ok(a.minerals === base.minerals - (base.hero.fx.startMin || 0) + 12, "시작 자원 +12: " + a.minerals);
  ok(a.hero.fx.drawCost === 1 && e2DrawCost(a) === 14, "뽑기 비용 15 -> 14");
  ok(!("heroAtk" in base.hero.fx) && !("hsk" in base.hero.fx), "운빨 리그 영웅 fx 불변");
}
function e2DrawCost(S) { const e = createEngine(); const S2 = e.start(S.seed, null, S.mine); return e.GAME.drawCost(); }
// 같은 시드면 mine 이 있어도 난수 흐름 동일
{ const x = st(null).S, y = st(M()).S; ok(x.queue === y.queue && x.slots.findIndex((s) => s && s.hero) === y.slots.findIndex((s) => s && s.hero), "난수 흐름 동일"); }
// 규칙 판에서는 무시
{ const S = st(M({ atk: 10 }), 5, { hpMul: 1.1 }).S; ok(!S.mine && !S.hero.fx.atkMul, "규칙 판 무시"); }

// ---- 4. 봇 한 판 -> 서버 재생 일치 ----
function bot(seed, rules, mine, maxTicks = 60 * 60 * 25) {
  const e = createEngine(), G = e.GAME, K = e.CONST;
  let a = (seed * 7 + 1) >>> 0;
  const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const S = e.start(seed, rules, mine);
  const best = () => { let b = 0, bp = -1; for (let c = 0; c < 4; c++) { let p = 0; for (const s of S.slots) if (s && !s.hero && (s.ch & 3) === c) p += (1 + (s.ch >> 2)) * s.n; if (p > bp) { bp = p; b = c; } } return b; };
  let n = 0;
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
    }
    e.update(K.DT);
  }
  return { e, S, r: e.result() };
}
const SK4 = SKALL;
const CASES = [[11, M({}, {}, "bee")], [12, M({ trophy: 1, reso: 1, ...SK4 }, { basic: "sk_chain", ult: "ul_meteor" }, "dragon")], [13, M({ atk: 10, spd: 5 }, {}, "panda")],
  [15, M({ hpow: 10, hlv: 5, ...SK4 }, { basic: "sk_breath", ult: "ul_nova" })], [16, M({ frost: 4, burn: 4, sk_tongue: 1, sk_slash: 1, sk_wave: 1, sk_beam: 1, sk_roar: 1 }, { basic: "sk_beam" })],
  [17, M({ ul_beam: 1 }, { ult: "ul_beam" })], [14, null]];
for (const [seed, mine] of CASES) {
  const b = bot(seed, null, mine);
  ok(!!b.r, "결과 " + seed);
  const rp = replay(seed, b.S.inputs, null, mine);
  ok(rp.ok && rp.result.score === b.r.score && rp.result.round === b.r.round && rp.result.hero === (mine ? mine.design : rp.result.hero), `재생 불일치 ${seed}: ${rp.ok ? rp.result.score + "/" + b.r.score : rp.error}`);
  if (mine && Object.keys(mine.items).length) { const rp0 = replay(seed, b.S.inputs, null, null); ok(!rp0.ok || rp0.result.score !== b.r.score, "mine 없이 재생하면 달라야 함 " + seed); }
  console.log("seed", seed, mine ? mine.design + " " + ((mine.equip.basic || "-") + "/" + (mine.equip.ult || "-")) : "운빨", "R" + b.r.round, "score", b.r.score);
}
{ const rp = replay(1, [], null, M({ atk: 99 })); ok(!rp.ok, "잘못된 mine 거부"); const rl = replay(1, [], null, { hero: "bee", up: { atk: 1 } }); ok(!rl.ok && /legacy/.test(rl.error), "레거시 mine 재생 거부"); }

// ---- 6. 비용 헬퍼·코인·레거시 ----
ok(itemCost("atk", 1) === MY_ITEMS[0].cost[0] && itemCost("atk", 11) === -1 && itemCost("atk", 0) === -1 && itemCost("nope", 1) === -1 && itemCost("atk", 1.5) === -1, "itemCost");
ok(mineTotalCost(M({ atk: 2, sk_lob: 1 })) === itemCost("atk", 1) + itemCost("atk", 2) + itemCost("sk_lob", 1) && mineTotalCost(null) === 0, "mineTotalCost");
ok(mineCoinLv(M({ coin: 3 })) === 3 && mineCoinLv(null) === 0 && mineCoinLv(M()) === 0, "mineCoinLv");
ok(coinsFor(4, 100, false, 0) === 2 && coinsFor(30, 600, false, 0) === 33 && coinsFor(50, 1000, true, 0) === 91 && coinsFor(50, 1000, true, 5) === Math.floor(91 * 1.25), "coinsFor");
{ const g = migrateLegacyMine({ hero: "weasel", up: { atk: 2, rew: 1, disc: 0, start: 5 } }); ok(g.design === "weasel" && JSON.stringify(g.items) === "{}" && !g.equip.basic && !g.equip.ult && g.refund === 160 + 60 + 900, "레거시 변환·전액 환불 " + JSON.stringify(g));
  ok(vmine(g).ok && migrateLegacyMine({ id: "owlsage", up: {} }).design === "owlsage" && migrateLegacyMine({ hero: "zzz" }).design === "bee" && migrateLegacyMine(null).refund === 0 && migrateLegacyMine({ hero: "bee", up: { atk: 99 } }).refund === 900, "레거시 변환 방어"); }

// ---- 6b. 마켓 개편(GAME_VER 9): 능력 2종·칸별 스킬·가격 공식·구매 가능 판정·마이그레이션 ----
{
  const cb = (own, id, coins) => canBuy(own, id, coins);
  ok(cb({}, "atk").ok && cb({ atk: 1, spd: 1 }, "atk").ok && cb({ atk: 1, spd: 1 }, "spd").ok, "능력: 빈 칸이면 구매, 이미 가진 능력의 레벨업은 2종이 차도 허용");
  { const r = cb({ atk: 1, spd: 1 }, "range"); ok(!r.ok && r.code === "slots" && r.reason === "능력은 2가지만 고를 수 있어요" && r.cost === itemCost("range", 1), "능력 3번째 종류 구매 거부 + 짧은 해요체 사유"); }
  ok(cb({ atk: 1, spd: 1 }, "sk_lob").ok && cb({ hpow: 1, hlv: 1 }, "ul_chain").ok, "스킬은 능력 2종 제한과 무관(2종이 차도 구매 가능)");
  ok(cb({ atk: 10 }, "atk").code === "max" && cb({ sk_lob: 1 }, "sk_lob").reason === "이미 가지고 있어요" && cb({}, "nope").code === "none", "최대·보유·없는 품목");
  ok(cb({}, "sk_chain").code === "req" && cb({}, "sk_chain").reason === "기본공격 1단계를 먼저 사야 해요" && cb({ sk_lob: 1 }, "sk_chain").ok && cb({ sk_chain: 1 }, "ul_nova").reason === "필살 2단계를 먼저 사야 해요" && cb({ ul_beam: 1 }, "ul_nova").ok, "스킬 선행 조건은 칸별(기본공격 2단계 ≠ 필살 2단계)");
  { const r = cb({}, "atk", 10); ok(!r.ok && r.code === "coin" && r.reason === "코인이 30 부족해요" && cb({}, "atk", 40).ok, "코인 부족 사유"); }
  ok(myAbilities({ atk: 2, sk_lob: 1, hpow: 1, ul_chain: 1 }).join() === "atk,hpow", "myAbilities = 수치 능력만(영웅 근력·지휘 포함)");
  // 기본공격·필살 분리: 같은 2단계 스킬도 칸마다 따로(둘 다 사야 양쪽 사용)
  ok(vmine(M({ sk_lob: 1, sk_chain: 1 }, { ult: "sk_chain" })).ok === false && vmine(M({ sk_lob: 1, sk_chain: 1, ul_chain: 1 }, { basic: "sk_chain", ult: "ul_chain" })).ok, "같은 스킬을 양 칸에 쓰려면 칸별로 각각 소유");
  // 가격: 공식 50xVxg^(L-1)(5 단위 반올림) 총액이 코인마켓_검토 A-3 표와 일치
  const NEWTOT = { atk: 2055, spd: 725, range: 555, boss: 460, growth: 820, hpow: 3680, hlv: 905, kill: 1255, bounty: 1090, coin: 555, start: 700, income: 860, drawc: 1350, upc: 555, sell: 225, btime: 555, slow: 905, frost: 225, bhp: 460, reso: 1300, merge: 725, trophy: 1800, lucky: 1500, burn: 170 }; // GAME_VER 10: 이전 비용(GAME_VER 9 표) 단계별 x1.5 후 5 단위 반올림한 합
  const tot = (id) => myItem2(id).cost.reduce((a, b) => a + b, 0);
  function myItem2(id) { return MY_ITEMS.find((x) => x.id === id); }
  ok(Object.keys(NEWTOT).every((k) => tot(k) === NEWTOT[k]) && Object.keys(NEWTOT).length === 24, "가격 총액 24종이 검토서 표와 일치: " + Object.keys(NEWTOT).filter((k) => tot(k) !== NEWTOT[k]).join());
  ok(JSON.stringify(myItem2("atk").cost) === "[40,55,70,90,130,165,225,310,415,555]" && JSON.stringify(myItem2("hpow").cost) === "[70,90,120,165,225,300,405,555,745,1005]" && JSON.stringify(myItem2("lucky").cost) === "[300,480,720]" && JSON.stringify(myItem2("bounty").cost) === "[90,130,190,280,400]", "단계별 가격(공격 훈련·영웅 근력·행운 뽑기·보스 현상금)");
  ok(MY_ITEMS.filter((x) => x.slot === "basic").every((x) => x.cost[0] === (x.tier === 1 ? 150 : 300)) && MY_ITEMS.filter((x) => x.slot === "ult").every((x) => x.cost[0] === (x.tier === 2 ? 375 : 600)), "스킬 가격: 기본공격 150/300, 필살 375/600 (GAME_VER 10, 기존 x1.5)");
  const sum = (a) => a.reduce((x, y) => x + y, 0), oldAb = sum(Object.values(MY_OLD_COST).map(sum)), newAb = sum(Object.values(NEWTOT));
  ok(oldAb === 17985 && newAb === 23430 && MY_FULL_COST === 23430 + 4 * 150 + 4 * 300 + 4 * 375 + 3 * 600, "전체: 옛 v1 능력 17,985, 능력 15,960 -> 23,430(reso 1,300 은 x1.5 제외)(GAME_VER 10), 스킬 3,400 -> 5,100, 전 품목 " + MY_FULL_COST);
  // 마이그레이션(migrateMarketHero)
  { const g = migrateMarketHero({ own: { atk: 2, spd: 1, hpow: 3, sk_lob: 1, sk_chain: 1, sk_nova: 1, sk_beam: 1 }, equip: ["sk_chain", "sk_nova"] });
    ok(g.reset && g.refund === 25 + 35 + 40 + 20 + 25 + 35 && !("atk" in g.own) && !("hpow" in g.own) && g.own.sk_lob === 1 && g.own.sk_chain === 1 && g.own.sk_beam === 1 && !("sk_nova" in g.own) && g.own.ul_nova === 1, "능력 3종 -> 전부 환불(옛 가격 " + g.refund + ")·능력 초기화·스킬 유지(3단계는 필살 칸으로)");
    ok(g.own.ul_chain === 1 && g.equip.basic === "sk_chain" && g.equip.ult === "ul_nova" && vmine({ design: "cat", items: g.own, equip: g.equip }).ok, "필살 3단계 선행(2단계 하나 무상 부여)·장착 변환·검증 통과 " + JSON.stringify(g.equip)); }
  { const g = migrateMarketHero({ own: { atk: 4, hpow: 2, sk_slash: 1 }, equip: ["sk_slash", "sk_slash"] });
    ok(!g.reset && g.refund === 0 && g.own.atk === 4 && g.own.hpow === 2 && g.equip.basic === "sk_slash" && g.equip.ult === null, "능력 2종 이하는 그대로·같은 스킬 두 칸 장착은 기본공격 칸 하나로"); }
  { const g = migrateMarketHero({ own: { sk_beam: 1, sk_lob: 1 }, equip: ["sk_lob", "sk_beam"] }); ok(g.equip.basic === "sk_lob" && g.equip.ult === "ul_beam" && g.own.ul_beam === 1 && g.own.sk_beam === 1, "옛 필살 칸의 2단계 스킬은 필살 칸 소유로 옮김"); }
  { const g = migrateMarketHero({ own: { sk_nova: 1 }, equip: ["sk_nova"] }); ok(g.equip.basic === null && g.equip.ult === "ul_nova", "옛 3단계 스킬은 필살 칸 후보(기본공격 칸에는 못 들어감)"); }
  { const g = migrateMarketHero(null); ok(g.refund === 0 && !g.reset && Object.keys(g.own).length === 0, "빈 입력 방어"); }
}

// ---- 7. myhero.js(v2) 스모크: 단계 C 가 myhero.js 를 v2 로 바꾼 뒤에 동작. 아직 v1 이면 건너뜀 ----
{
  const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  const src = fs.readFileSync(root + "myhero.js", "utf8");
  if (!/mineCoinLv|MY_ITEMS/.test(src)) console.log("SKIP myhero.js 스모크: 아직 v1 화면(단계 C 에서 v2 로 교체 후 여기 테스트 추가)");
  else {
    const store = {};
    const ctx = vm.createContext({ console, Date, Math, JSON, Number, Set, Array, String, RegExp, Object });
    ctx.window = ctx; ctx.lsGet = (k, d = null) => (k in store ? store[k] : d); ctx.lsSet = (k, v) => { store[k] = v; };
    for (const k of ["esc", "nf", "sfx", "modal", "closeModal", "$"]) ctx[k] = () => ({});
    ctx.document = { querySelectorAll: () => [] }; ctx.NAME_ERR_MSG = {};
    vm.runInContext(fs.readFileSync(root + "data.js", "utf8") + "\n" + src, ctx);
    const MH = ctx.MyHero;
    ok(MH && typeof MH.settle === "function", "MyHero 로드");
    const r = MH.settle({ mode: "daily", mine: { design: "cat", items: { coin: 2 }, equip: [] }, seed: 9, topGrade: 0, hero: { id: "cat" } }, { R: 40, kills: 1600 });
    ok(r && r.parts && r.parts.base === coinsFor(40, 1600, false, 2), "v2 정산: 코인 행운 단계 반영 " + JSON.stringify(r && r.parts));

    // ---- 7b. 화면 흐름 스모크(DOM 스텁): 레거시 이전 1회 -> 등록 -> 구매 -> 장착 -> 판 시작 mine ----
    const KEY = "malang-myhero2", OLD = "malang-myhero", myItem = (id) => MY_ITEMS.find((x) => x.id === id), NUM_IDS = MY_ITEMS.filter((x) => !x.sk).map((x) => x.id);
    const boot = (st) => { // 새 페이지 로드 흉내(같은 저장소). 모달 html 과 하위 컨테이너 innerHTML 을 모아 data-* 버튼을 찾는다
      const els = {}, box = { html: "" }, hits = {};
      const c = vm.createContext({ console, Date, Math, JSON, Number, Set, Array, String, RegExp, Object });
      c.window = c; c.lsGet = (k, d = null) => (k in st ? st[k] : d); c.lsSet = (k, v) => { st[k] = v; };
      c.esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[m]);
      c.uiConfirm = (m, f) => { c.__cf = { m, ok: f }; }; c.uiConfirm = (m, f) => { c.__cf = { m, ok: f }; }; c.nf = (n) => String(n); c.sfx = () => {}; c.BTNR = ""; c.NAME_ERR_MSG = { len: "len", chars: "chars", bad: "bad" };
      c.modal = (h) => { box.html = h; for (const k in els) delete els[k]; }; c.closeModal = () => { box.html = ""; };
      c.$ = (id) => (els[id] ||= { innerHTML: "", textContent: "", value: "", onclick: null });
      c.document = { querySelectorAll: (sel) => { const a = (sel.match(/\[data-(\w+)\]/) || [])[1]; if (!a) return [];
        const all = box.html + Object.values(els).map((e) => e.innerHTML).join("");
        return [...all.matchAll(new RegExp(`data-${a}="([^"]*)"`, "g"))].map((m) => (hits[a + "=" + m[1]] = { dataset: { [a]: m[1] }, onclick: null })); } };
      vm.runInContext(fs.readFileSync(root + "data.js", "utf8") + "\n" + src, c);
      const tap = (k) => { const h = hits[k]; if (!h || !h.onclick) throw new Error("버튼 없음 " + k); h.onclick(); };
      return { MH: c.MyHero, c, box, els, tap, $: c.$, all: () => box.html + Object.values(els).map((e) => e.innerHTML).join("") };
    };
    const st = { [OLD]: JSON.stringify({ v: 1, coins: 50, heroes: [{ id: "weasel", name: "족제비짱", up: { atk: 2, rew: 1, disc: 0, start: 0 } }] }) };
    let P = boot(st);
    ok(P.MH.coins() === 0 && P.MH.list()[0].design === "weasel" && JSON.parse(st[KEY]).v === 2 && JSON.parse(st[KEY]).mig === 2 && JSON.parse(st[KEY]).rs === 1 && JSON.parse(st[OLD]).v === 1, "레거시 이전: 코인(옛 코인·환불)은 일괄 리셋 0, 영웅 디자인 유지, 옛 키는 그대로 " + P.MH.coins());
    P.MH.open(); ok(!/돌려드렸어요/.test(P.box.html) && /mkGrid/.test(P.box.html), "환불 안내 없이 바로 시장");
    P = boot(st); ok(P.MH.coins() === 0, "다시 로드해도 코인 0(옛 환불 없음)");
    st[OLD] = JSON.stringify({ v: 1, coins: 999, heroes: [{ id: "bee", name: "벌벌", up: { atk: 5 } }] }); // 옛 v6 탭이 옛 키에 덮어씀
    P = boot(st); ok(P.MH.coins() === 0 && P.MH.list().length === 1 && P.MH.list()[0].design === "weasel" && JSON.parse(st[OLD]).coins === 999, "옛 탭이 옛 키에 덮어써도 v2 데이터 유지·코인 0 유지");
    { const o = {}; o[OLD] = JSON.stringify({ v: 1, coins: 0, heroes: [] }); o[KEY] = JSON.stringify({ v: 2, mig: 1, coins: 7, heroes: [] }); ok(boot(o).MH.coins() === 0 && JSON.parse(o[KEY]).rs === 1, "리셋 표시(rs) 없는 새 키의 쌓인 코인(운빨 판 코인 포함)은 1회 0 으로 리셋"); }
    { const o = {}; o[KEY] = JSON.stringify({ v: 2, mig: 1, rs: 1, coins: 7, heroes: [] }); ok(boot(o).MH.coins() === 7, "리셋 표시(rs)가 있으면 코인 유지(다시 리셋하지 않음)"); }
    { const o = {}; o[KEY] = JSON.stringify({ v: 2, mig: 1, coins: 900, heroes: [{ design: "fox", name: "여우왕", own: { atk: 5, sk_lob: 1 }, equip: ["sk_lob"] }] }); const M = boot(o).MH, h0 = M.list()[0];
      ok(M.coins() === 0 && h0 && h0.design === "fox" && h0.name === "여우왕" && Object.keys(h0.own).length === 0 && !h0.equip.basic && !h0.equip.ult, "일괄 리셋: 코인·산 능력·장착 초기화, 영웅 등록(디자인·이름)만 유지"); }
    { const o = {}; o[KEY] = JSON.stringify({ v: 2, mig: 1, rs: 1, coins: 900, heroes: [{ design: "fox", name: "여우왕", own: { atk: 5 }, equip: [] }] }); const h0 = boot(o).MH.list()[0]; ok(h0.own.atk === 5, "리셋 표시(rs)가 있으면 산 능력 유지(다시 리셋 없음)"); }
    { const MH = boot({}).MH; const r = MH.settle({ mode: "daily", mine: null, seed: 3, topGrade: 0, hero: { id: "cat" } }, { R: 50, kills: 2000, win: true }); ok(r.gain === 0 && MH.coins() === 0, "운빨 리그 판은 코인을 주지 않는다"); }
    // 등록(20종 그리드 -> 이름)
    P.MH.open(); ok(!/mhNm/.test(P.box.html) && /mkAdd/.test(P.all()), "영웅 있으면 시장으로 바로");
    P.els.mkAdd.onclick(); ok((P.box.html.match(/data-p="/g) || []).length === 20 && /mhdc got/.test(P.box.html), "영웅 고르기 20종 그리드·등록 표시");
    P.tap("p=cat"); P.$("mhNm").value = "냥이"; P.els.mhOk.onclick();
    ok(P.MH.list().length === 2 && P.MH.list()[1].design === "cat" && /mkGrid/.test(P.box.html), "등록 후 그 영웅 시장");
    // 구매(즉시, 켜기 자동·스킬 자동 장착), 잠김
    { const d = JSON.parse(st[KEY]); d.coins = 20000; st[KEY] = JSON.stringify(d); }
    P.MH.open(); P.tap("b=atk");
    ok(/이 능력으로 정할까요/.test(P.all()) && /한번 고르면 바꿀 수 없어요/.test(P.all()) && P.MH.coins() === 20000 && !P.MH.list().find((x) => x.design === "cat").own.atk, "새 능력은 확인 시트 먼저(취소 기본, 구매 전 코인 그대로)");
    P.tap("yes=atk");
    let h = () => P.MH.list().find((x) => x.design === "cat");
    ok(h().own.atk === 1 && !("on" in h()) && P.MH.coins() === 20000 - itemCost("atk", 1), "구매 즉시 적용(켜기 개념 없음)");
    P.tap("b=atk"); ok(h().own.atk === 1, "같은 버튼 250ms 내 재클릭(더블탭) 무시");
    { const k2 = MY_ITEMS.filter((x) => x.grp === "atk" && x.id !== "atk")[0].id; P.tap("b=" + k2); P.tap("yes=" + k2); ok(h().own[k2] === 1, "다른 버튼은 바로 구매"); P.MH.buy("cat", "atk"); P.MH.buy("cat", k2); }
    ok(P.MH.buy("cat", "sk_chain") === false && P.MH.buyCheck("cat", "sk_chain").code === "req", "선행 조건 잠김(기본공격 2단계는 기본공격 1단계 필요)");
    P.MH.buy("cat", "sk_lob"); P.MH.buy("cat", "sk_chain"); ok(P.MH.buy("cat", "ul_storm") === false, "필살 3단계는 필살 2단계 필요(기본공격 2단계로는 안 열림)"); P.MH.buy("cat", "ul_chain"); P.MH.buy("cat", "ul_storm");
    ok(JSON.stringify(h().equip) === '{"basic":"sk_lob","ult":"ul_chain"}' && h().own.sk_chain === 1 && h().own.ul_chain === 1 && h().own.ul_storm === 1, "스킬은 칸별로 따로 구매·빈 칸에만 자동 장착: " + JSON.stringify(h().equip));
    { const n0 = Object.keys(h().own).length; ok(P.MH.buy("cat", "drawc") === false && P.MH.buyCheck("cat", "drawc").code === "slots" && P.MH.buyCheck("cat", "drawc").reason === "능력은 2가지만 고를 수 있어요" && Object.keys(h().own).length === n0, "능력 3번째 종류 구매 거부(사유 문구)"); }
    const k2x = () => myAbilities(h().own).find((k) => k !== "atk");
    for (let i = 0; i < 12; i++) { P.MH.buy("cat", "atk"); P.MH.buy("cat", k2x()); }
    ok(h().own.atk === 10 && myAbilities(h().own).length === 2 && h().on === undefined, "같은 능력 레벨업은 계속 허용 · 능력 2종 유지 " + Object.keys(h().own).length);
    P.MH.loadout("cat"); ok(!/data-p="|data-m="|data-pw|전투력|mhg/.test(P.all()) && /산 만큼 항상 적용/.test(P.all()), "장착 화면: ± 토글·게이지·전투력 문구 없음, 기본공격·필살 칸");
    ok(P.MH.equipSlot("cat", "basic", "ul_chain").ok === false && P.MH.equipSlot("cat", "ult", "sk_lob").ok === false && P.MH.equipSlot("cat", "basic", "sk_slash").ok === false && JSON.stringify(h().equip) === '{"basic":"sk_lob","ult":"ul_chain"}', "칸에 안 맞는 스킬·안 가진 스킬 장착 거부");
    P.tap("s=sk_chain"); P.tap("s=ul_storm"); ok(JSON.stringify(h().equip) === '{"basic":"sk_chain","ult":"ul_storm"}', "장착 교체(칸별)"); P.tap("u=basic"); ok(h().equip.basic === null && h().equip.ult === "ul_storm", "칸을 누르면 비움"); P.tap("s=sk_chain");
    // 판 시작: 등록 영웅 선택 -> 저장된 세팅 그대로 mine
    let got = null; P.MH.pickMine((m) => (got = m)); ok((P.all().match(/data-h="/g) || []).length === 2, "영웅 선택 목록 2");
    P.tap("h=cat"); ok(got === null && /data-go="cat"/.test(P.all()) && /장착 중|data-eq="cat"/.test(P.all()) && /기본 공격 칸/.test(P.all()), "영웅 카드 탭 = 선택(시트), 시작은 시트의 [게임 시작]"); P.tap("go=cat"); const vv = vmine(got);
    ok(vv.ok && got.design === "cat" && got.items.sk_lob === 1 && got.items.ul_storm === 1 && JSON.stringify(got.equip) === '{"basic":"sk_chain","ult":"ul_storm"}' && got.items.atk === 10 && got.items.btime === h().own.btime && Object.keys(got.items).filter((k) => !k.startsWith("sk_") && !k.startsWith("ul_")).every((k) => got.items[k] === h().own[k]), "시작 mine = 보유 단계 전부 + 보유 스킬 + 장착 " + JSON.stringify(vv.err || ""));
    ok(applyMine(got).rule === "기본: 연쇄 번개 · 필살: 별빛 폭풍" && P.MH.heroName() === "냥이" && JSON.stringify(P.MH.again()) === JSON.stringify(got), "applyMine·이름·다시 하기");
    // 영웅 없음 -> 나만의 영웅 리그 시작은 20종 고르기로
    const st2 = {}; const Q = boot(st2); let g2 = null; Q.MH.pickMine((m) => (g2 = m));
    ok(g2 === null && (Q.box.html.match(/data-p="/g) || []).length === 20, "영웅 없으면 20종 고르기");
    // 조작된 저장값 정리
    st2[KEY] = JSON.stringify({ v: 2, rs: 1, coins: 5, heroes: [{ design: "fox", name: "여우왕", own: { atk: 99, sk_storm: 1, drawc: 1 }, on: { atk: 50, drawc: 1, reso: 1 }, equip: ["sk_storm", "zz"] }] });
    const z = boot(st2).MH.list()[0];
    ok(z && z.own.atk === 10 && !z.own.sk_storm && !z.own.ul_storm && !("on" in z) && z.own.reso === undefined && !z.equip.basic && !z.equip.ult && vmine(boot(st2).MH.mineOf(z)).ok, "저장값 정리 " + JSON.stringify(z));
    { const Z = boot(st2); Z.MH.open(); const c1 = itemCost("atk", 11); ok(/aria-disabled="true"/.test(Z.all()) || c1 < 0, "코인 부족 버튼 aria-disabled");
      const sk = MY_ITEMS.find((x) => x.id === "sk_tongue"); Z.tap("t=basic"); Z.tap("b=" + sk.id); ok(Z.els.mkToast && new RegExp("코인이 " + (itemCost(sk.id, 1) - 5) + " 부족해요").test(Z.els.mkToast.textContent) && !Z.MH.list()[0].own[sk.id], "코인 부족 탭 -> 한 줄 토스트·구매 없음"); }
    { const Z = boot(st2); Z.MH.open(); Z.tap("t=ultimate"); ok(/잠긴 스킬 \d+개/.test(Z.all()) && !/data-b="ul_nova"/.test(Z.all()) && /data-b="ul_chain"/.test(Z.all()), "필살 탭: 3단계는 접힌 잠금 목록, 2단계는 바로 구매"); Z.tap("t=ability"); ok(/내 능력 2\/2/.test(Z.all()) && /능력은 2가지만 고를 수 있어요/.test(Z.all()) && !/data-b="kill"/.test(Z.all()), "능력 탭: 칸 2/2 안내·미보유 능력은 구매 버튼 없이 잠금 사유"); }
    // ---- 7c. 분류(칸 안내)·영웅 삭제·전투력 개념 제거 ----
    { const S2 = { [KEY]: JSON.stringify({ v: 2, mig: 1, rs: 1, coins: 5000, heroes: [{ design: "fox", name: "여우왕", own: { atk: 3 }, on: { atk: 1 }, equip: [] }, { design: "cat", name: "냥이", own: {}, equip: [] }] }) };
      const Z = boot(S2); Z.MH.open();
      ok(!/전투력|mhg|data-pw/.test(Z.all()), "시장: 전투력 게이지·문구 없음");
      ok(!("on" in Z.MH.list()[0]) && Z.MH.mineOf(Z.MH.list()[0]).items.atk === 3, "옛 on 필드는 무시하고 own 단계 전부를 mine 으로");
      Z.tap("t=basic"); const a1 = Z.all();
      ok(/기본 공격 칸 0[/]1/.test(a1) && !/필살 칸/.test(a1) && /기본으로 제공돼요/.test(a1) && !/비어 있음/.test(a1) && /data-b="sk_lob"/.test(a1) && !/data-b="ul_chain"/.test(a1), "기본공격 탭: 칸 1개(빈 칸 = 기본 공격), 기본공격 스킬만 진열");
      ok(/사면 기본 공격 칸에 자동 장착/.test(a1), "빈 칸이면 들어갈 칸 안내");
      Z.tap("b=sk_lob"); ok(/기본 공격 칸에 장착 중/.test(Z.all()), "기본공격 구매 -> 기본 공격 칸 장착");
      Z.tap("b=sk_slash");
      const a2 = Z.all(); ok(/기본 공격 칸: 대나무 투척 장착 중/.test(a2) && /사도 자동 장착은 안 돼요/.test(a2), "기본공격 칸이 차면 구매 전 안내(자동 장착 안 함)");
      Z.tap("t=ultimate"); ok(/사면 필살 칸에 자동 장착/.test(Z.all()), "필살 탭은 필살 칸이 따로 비어 있음"); Z.tap("b=ul_chain");
      ok(JSON.stringify(Z.MH.list().find((x) => x.design === "fox").equip) === '{"basic":"sk_lob","ult":"ul_chain"}' && Z.MH.list().find((x) => x.design === "fox").own.ul_chain === 1 && !Z.MH.list().find((x) => x.design === "fox").own.sk_chain, "칸별 장착: 필살 구매는 기본공격 소유와 별개");
      const delVia = (id) => { Z.els.mkEq.onclick(); Z.tap("del=" + id); }; const coin0 = Z.MH.coins(); delVia("fox");
      ok(Z.c.__cf && /여우왕/.test(Z.c.__cf.m) && /돌려받지 못/.test(Z.c.__cf.m) && Z.MH.list().length === 2, "삭제 확인창(환불 없음 문구), 확인 전엔 그대로");
      Z.c.__cf.ok(); const L = Z.MH.list();
      ok(L.length === 1 && L[0].design === "cat" && Z.MH.coins() === coin0 && JSON.parse(S2[KEY]).heroes.length === 1, "삭제: 저장 제거·코인 유지·환불 없음");
      ok(/data-v="cat"/.test(Z.all()) && !/data-v="fox"/.test(Z.all()), "삭제 후 다른 영웅 시장으로");
      Z.els.mkAdd.onclick(); ok(/data-p="fox"/.test(Z.box.html) && !/data-p="fox"[^>]*>(?:(?!<\/button>)[^])*<em>/.test(Z.box.html), "삭제한 디자인은 '등록' 표시 없음(재등록 가능)");
      Z.tap("p=fox"); Z.$("mhNm").value = "여우2"; Z.els.mhOk.onclick(); ok(Z.MH.list().length === 2 && Z.MH.list().some((x) => x.design === "fox" && !Object.keys(x.own).length), "같은 디자인 재등록(능력은 처음부터)");
      delVia("fox"); Z.c.__cf.ok(); delVia("cat"); Z.c.__cf.ok();
      ok(Z.MH.list().length === 0 && (Z.box.html.match(/data-p="/g) || []).length === 20, "마지막 영웅도 삭제 -> 20종 고르기");
      const S3 = { [KEY]: JSON.stringify({ v: 2, mig: 1, rs: 1, coins: 77, heroes: [{ design: "bee", name: "벌벌", own: { atk: 2 }, equip: [] }, { design: "bear", name: "곰곰", own: {}, equip: [] }] }) };
      const Y = boot(S3); let go = null; Y.MH.pickMine((m) => (go = m));
      ok(!/data-del=/.test(Y.all()) && (Y.all().match(/data-h="/g) || []).length === 2, "영웅 선택 1뎁스: 삭제 단추 없음(카드 + 추가만)");
      Y.tap("h=bee"); ok(/data-del="bee"/.test(Y.all()) && /data-more=/.test(Y.all()), "2뎁스 시트: 삭제는 ⋯ 더보기 안");
      Y.tap("del=bee"); ok(/벌벌/.test(Y.c.__cf.m) && /현재 가격 기준으로 약/.test(Y.c.__cf.m) && Y.c.__cf.m.includes("{coin} " + (itemCost("atk", 1) + itemCost("atk", 2))), "삭제 문구에 쓴 코인(누적 구매액)");
      Y.c.__cf.ok(); ok(Y.MH.list().length === 1 && Y.MH.coins() === 77 && (Y.all().match(/data-h="/g) || []).length === 1, "삭제 후 영웅 선택 목록 갱신");
      Y.tap("h=bear"); Y.tap("go=bear"); ok(go && go.design === "bear", "남은 영웅으로 시작");
      Y.MH.pickMine(() => {}); Y.tap("h=bear"); Y.tap("del=bear"); Y.c.__cf.ok(); ok(Y.MH.list().length === 0 && (Y.box.html.match(/data-p="/g) || []).length === 20, "선택 화면에서 마지막 영웅 삭제 -> 20종");
    // ---- 7d. 마켓 개편 마이그레이션(mig 1 -> 2): 능력 3종 이상 영웅만 환불·초기화, 안내 1회, 중복 환불 없음 ----
    { const A = { atk: 2, spd: 1, hpow: 3, sk_lob: 1, sk_chain: 1, sk_nova: 1 }, B = { atk: 4, hpow: 2, sk_slash: 1 };
      const o = { [KEY]: JSON.stringify({ v: 2, mig: 1, rs: 1, coins: 100, heroes: [{ design: "fox", name: "여우왕", own: A, equip: ["sk_chain", "sk_nova"] }, { design: "cat", name: "냥이", own: B, equip: ["sk_slash"] }] }) };
      const Z = boot(o), L = Z.MH.list(), fx = L.find((x) => x.design === "fox"), ct = L.find((x) => x.design === "cat"), refund = 25 + 35 + 40 + 20 + 25 + 35;
      ok(Z.MH.coins() === 100 + refund && JSON.parse(o[KEY]).mig === 2 && JSON.parse(o[KEY]).mnote.refund === refund && JSON.parse(o[KEY]).mnote.n === 1, "코인 = 기존 + 환불 합산·mig 2·안내 기록 " + Z.MH.coins());
      ok(myAbilities(fx.own).length === 0 && fx.own.sk_lob === 1 && fx.own.sk_chain === 1 && fx.own.ul_nova === 1 && fx.own.ul_chain === 1 && fx.equip.basic === "sk_chain" && fx.equip.ult === "ul_nova" && vmine(Z.MH.mineOf(fx)).ok && Z.MH.mineOf(fx).items.sk_lob === 1, "3종 이상 영웅: 능력 초기화·스킬 유지·장착 변환");
      ok(ct.own.atk === 4 && ct.own.hpow === 2 && ct.own.sk_slash === 1 && ct.equip.basic === "sk_slash" && ct.equip.ult === null, "2종 이하 영웅은 그대로");
      Z.MH.open(); ok(/능력은 영웅마다 2가지만/.test(Z.box.html) && new RegExp("영웅 1명").test(Z.box.html) && Z.box.html.includes(String(refund)) && !/mkGrid/.test(Z.box.html), "환불 안내 모달(영웅 수·환불액)");
      Z.els.mhOk.onclick(); ok(/mkGrid/.test(Z.box.html) && JSON.parse(o[KEY]).mnote === null, "확인 후 시장 · 안내는 1회");
      const Z2 = boot(o); ok(Z2.MH.coins() === 100 + refund && Z2.MH.list().find((x) => x.design === "fox").own.hpow === undefined, "다시 로드해도 중복 환불·재처리 없음");
      Z2.MH.open(); ok(!/능력은 영웅마다 2가지만/.test(Z2.box.html), "안내는 다시 안 뜸");
      const o2 = { [KEY]: JSON.stringify({ v: 2, mig: 1, rs: 1, coins: 3, heroes: [{ design: "fox", name: "여우왕", own: { atk: 1 }, equip: [] }] }) }; const Y = boot(o2); Y.MH.open(); ok(Y.MH.coins() === 3 && JSON.parse(o2[KEY]).mig === 2 && JSON.parse(o2[KEY]).mnote === null && /mkGrid/.test(Y.box.html), "환불 대상이 없으면 안내 없이 mig 만 올림");
    }
      const X = boot({ [KEY]: JSON.stringify({ v: 2, mig: 1, rs: 1, coins: 0, heroes: [{ design: "bee", name: "벌벌", own: { atk: 4 }, equip: [] }] }) }); X.MH.loadout("bee");
      ok(/기본 필살/.test(X.all()) && /4\/10/.test(X.all()) && !/전투력/.test(X.all()), "장착 화면: 필살 칸 설명·보유 능력 보기만");
    }
  }
}
console.log(`pass ${pass} fail ${fail}`); process.exit(fail ? 1 : 0);
