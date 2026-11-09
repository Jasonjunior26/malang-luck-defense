"use strict";
// myhero.js - 내 영웅 v2(GAME_VER 9): 코인 마켓(디자인 20종 등록·이름 / 능력 24종(영웅당 2종만)·기본공격 8종·필살 7종 구매) · 스킬 장착(기본공격 1칸·필살 1칸) · 나만의 영웅 리그 시작 · 판 끝 코인 정산.
// 규칙·수치(MY_DESIGNS, MY_CATS, MY_ITEMS, validateMine, applyMine, coinsFor, mineCoinLv, migrateLegacyMine)는 data.js MYHERO 구간(서버 리플레이와 공유). 스펙: docs/내영웅_v2_스펙.md
// 저장: localStorage "malang-myhero2" = {v:2, mig:2, rs:1, coins, note, mnote, heroes:[{design, name, own:{품목:보유 단계}, equip:{basic:"sk_*"|null, ult:"ul_*"|null}}]}
//   mig 2 = 마켓 개편(GAME_VER 9): mig 1 저장값은 load 에서 1회 migrateMarketHero(능력 3종 이상 환불·초기화, 스킬 칸 분리)로 바꾸고 mnote {refund, n}(안내 1회)에 기록
//   own = 산 기록(서버로 안 감). mineOf 가 own 전부(수치 단계·보유 스킬)·equip 으로 mine 을 만든다(전투력 상한·켜기/끄기 없음, 옛 on 필드는 읽어도 무시). note = 레거시 이전 안내(환불 코인, 1회 표시 후 null)
//   옛 키 "malang-myhero"(v1 {v:1, heroes:[{id,name,up}]}) 는 새 키에 mig 가 없을 때만 읽어 migrateLegacyMine 으로 바꾸고(환불 코인 합산, 디자인 = 옛 영웅 id, 보유 초기화)
//   바로 새 키에 저장한다. 옛 키는 지우지 않는다(옛 v6 탭이 덮어써도 v2 값은 안전, 환불은 1회).
// ui.js 의 modal/closeModal/$/esc/lsGet/lsSet/sfx/checkName/NAME_ERR_MSG/nf 를 쓴다. 최상위 이름은 window.MyHero 하나만 만든다.
window.MyHero = (function () {
  const KEY = "malang-myhero2", OLD = "malang-myhero"; // v2 는 새 키. 옛 키는 v6 탭(v1 형식)이 계속 쓸 수 있어 읽기만 한다
  const DES = (id) => MY_DESIGNS.find((d) => d.id === id) || null;
  const SKL = MY_ITEMS.filter((x) => x.sk), NUM = MY_ITEMS.filter((x) => !x.sk);
  const lvOf = (it, v) => Math.max(0, Math.min(it.max, Number.isInteger(v) ? v : 0));

  // ---- 저장 ----
  function cleanHero(h) { // 손상/조작된 값 정리: 보유 단계 범위, 능력 2종 이하(넘으면 카탈로그 순 앞 2종만), 스킬 선행 조건, 장착 = 칸에 맞는 보유 스킬
    const so = (h && h.own) || {}, own = {}, equip = { basic: null, ult: null };
    let na = 0;
    for (const it of MY_ITEMS) { const l = lvOf(it, so[it.id]); if (!l) continue; if (!it.sk && ++na > MY_ABILITY_MAX) continue; own[it.id] = l; }
    for (const it of SKL) if (own[it.id] && !myReqOk(it.id, own)) delete own[it.id]; // 카탈로그가 단계 순이라 한 번이면 된다
    const eq = h && h.equip && typeof h.equip === "object" && !Array.isArray(h.equip) ? h.equip : {};
    for (const sl of MY_SLOTS) { const id = eq[sl], it = typeof id === "string" ? myItem(id) : null; if (it && it.sk && it.slot === sl && own[id]) equip[sl] = id; }
    return { own, equip };
  }
  const parse = (k) => { try { const o = JSON.parse(lsGet(k, "null")); return o && typeof o === "object" ? o : null; } catch { return null; } };
  function load() {
    const out = { v: 2, mig: 2, rs: 1, coins: 0, note: null, mnote: null, heroes: [] }; // rs = 코인 리셋 완료 표시, mig 2 = 마켓 개편 이전 완료
    let reset = false;
    let o = parse(KEY), from = false; // 새 키에 변환 완료 표시(mig)가 있으면 옛 키는 보지 않는다
    if (!o || !o.mig) { const p = parse(OLD); if (p) { o = p; from = true; } }
    if (!o) return out;
    out.coins = Number.isInteger(o.coins) && o.coins > 0 ? o.coins : 0;
    const legacy = o.v !== 2, doReset = !(o.rs >= 1); // rs = 일괄 리셋 완료 표시(없으면 이번 로드에서 1회 리셋)
    const needMig = !legacy && !from && !doReset && !(o.mig >= 2); // 마켓 개편 이전(mig 1 -> 2): 이미 비워진 저장값(레거시·리셋)은 옮길 게 없다
    let refund = 0, mref = 0, mn = 0;
    for (const h of Array.isArray(o.heroes) ? o.heroes : []) {
      if (!h || typeof h !== "object" || out.heroes.length >= MY_HERO.MAX) continue;
      let design = h.design, rest = h;
      if (legacy) { const g = migrateLegacyMine({ id: h.id, up: h.up }); design = g.design; refund += g.refund; rest = {}; }
      if (needMig) { const g = migrateMarketHero(h); rest = { own: g.own, equip: g.equip }; if (g.reset) { mref += g.refund; mn++; } }
      if (doReset) rest = {}; // 일괄 리셋: 산 능력·장착도 모두 비워 모든 영웅이 같은 출발선(능력 0, 코인 0)에서 시작
      const nm = checkName(h.name);
      if (!nm.ok || !DES(design) || out.heroes.some((x) => x.design === design)) continue;
      out.heroes.push({ design, name: nm.name, ...cleanHero(rest) });
    }
    if (legacy) { // 1회 이전: 환불 합산
      out.coins += refund;
      out.note = Array.isArray(o.heroes) && o.heroes.length ? refund : null;
    } else out.note = Number.isInteger(o.note) && o.note >= 0 ? o.note : null;
    if (doReset) { out.coins = 0; out.note = null; reset = true; } // 일괄 리셋(1회): 쌓인 코인·옛 이전 환불·운빨 판 코인 0 + 산 능력·장착 초기화. 영웅 등록(디자인·이름)만 유지
    if (needMig) { out.coins += mref; out.mnote = mn ? { refund: mref, n: mn } : null; } else out.mnote = o.mnote && Number.isInteger(o.mnote.refund) && o.mnote.refund >= 0 && Number.isInteger(o.mnote.n) && o.mnote.n > 0 ? { refund: o.mnote.refund, n: o.mnote.n } : null;
    if (doReset) out.mnote = null;
    if (legacy || from || reset || needMig) save(out); // 즉시 새 키에 mig 와 함께 기록 -> 다음 load 부터 옛 키 무시(환불 중복 없음). 옛 키는 지우지 않는다(옛 탭용)
    return out;
  }
  const save = (d) => lsSet(KEY, JSON.stringify(d));
  const list = () => load().heroes;
  const coins = () => load().coins;
  const heroOf = (d, design) => d.heroes.find((x) => x.design === design) || null;
  function paint(n) { // 홈 '코인 마켓' 버튼의 보유 코인
    try { const el = document.getElementById && document.getElementById("myCoins"); if (el) el.textContent = nf(n == null ? coins() : n); } catch { /* 테스트 스텁 */ }
  }

  // ---- mine(서버·GAME.start 로 가는 값): 켠 수치 + 보유 스킬 전부(pw 0, 선행 조건 검증용) + 장착 ----
  function mineOf(h) {
    const items = {};
    for (const it of MY_ITEMS) { const l = h.own[it.id] | 0; if (l) items[it.id] = l; }
    const tries = [{ design: h.design, items, equip: { basic: h.equip.basic, ult: h.equip.ult } }, { design: h.design, items: {}, equip: { basic: null, ult: null } }];
    for (const m of tries) { const v = validateMine(m); if (v.ok) return v.mine; }
    return tries[1];
  }
  const eqLine = (h) => MY_SLOTS.filter((s) => h.equip[s]).map((s) => myItem(h.equip[s]).name).join(" · ");
  let cur = null; // 이번 판의 내 영웅 {id: 디자인, name} (운빨 리그면 null)
  let view = "", tab = MY_CATS[0].k; // 마켓에서 마지막으로 본 영웅·탭
  let lastBuy = { k: "", t: 0 }, toastT = 0; // 구매 더블탭 방지, 시장 한 줄 토스트
  function toast(t) {
    const el = $("mkToast"); if (!el) return;
    el.textContent = t; try { el.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("on"), 1400); } catch { /* 스텁 */ }
  }

  // ---- 공통 조각 ----
  const pts = () => { if (typeof drawDesignPortrait !== "function") return; document.querySelectorAll("#box canvas[data-pt]").forEach((c) => drawDesignPortrait(c, c.dataset.pt, +c.dataset.px || 64)); };
  const pt = (id, px, cls) => `<canvas class="${cls || "mhpt"}" data-pt="${esc(id)}" data-px="${px}" width="${px}" height="${px}"></canvas>`;
  const SLOT = { basic: "기본 공격", ult: "필살" }; // equip.basic = 기본 공격 대체 스킬(sk_*), equip.ult = 필살 대체 스킬(ul_*). 칸이 비면 그 공격은 일반 공격(data.js applyMine)
  // 삭제 확인: 공용 uiConfirm 의 버튼 글자(게임 계속/홈으로)를 이 확인에만 바꿔 쓰고 되돌린다
  function ask(msg, okTxt, noTxt, onOk) {
    uiConfirm(msg, onOk);
    try {
      const ok = $("cok"), no = $("cno"), o0 = ok.textContent, n0 = no.textContent, ho = ok.onclick, hn = no.onclick;
      ok.textContent = okTxt; no.textContent = noTxt;
      const undo = () => { ok.textContent = o0; no.textContent = n0; };
      ok.onclick = () => { undo(); ho(); }; no.onclick = () => { undo(); hn(); };
    } catch { /* 스텁 */ }
  }
  const spentOn = (h) => { let t = 0; for (const it of MY_ITEMS) for (let l = 1; l <= (h.own[it.id] | 0); l++) t += Math.max(0, itemCost(it.id, l)); return t; };
  // 영웅 삭제: 환불 없음, 보유 코인은 그대로. 삭제 후 after() 로 이어진다. 삭제 불가 사유는 없다(진행 중인 판은 mine 사본으로 계속된다)
  function remove(id, after) {
    const h = heroOf(load(), id); if (!h) { after(); return; }
    const t = spentOn(h);
    ask(`'${h.name}'을(를) 삭제할까요?
${t > 0 ? `이 영웅에 쓴 코인 {coin} ${nf(t)}은 돌려받지 못하고, 산 능력과 장착도 모두 사라져요.` : "산 능력과 장착이 모두 사라져요."}
보유 코인은 그대로예요. 같은 디자인으로 다시 등록할 수 있어요(능력은 처음부터).`, "삭제", "취소", () => {
      const d = load(); d.heroes = d.heroes.filter((x) => x.design !== id); save(d);
      if (view === id) view = "";
      sfx("deny"); after();
    });
  }
  // 레거시 이전 안내(한 번만). 보여 줬으면 true -> 호출자는 확인 뒤 next 로 이어진다
  function noteFirst(next) {
    const d = load(); if (d.note == null && d.mnote == null) return false;
    const n = d.note, m = d.mnote; d.note = null; d.mnote = null; save(d);
    const t1 = n == null ? "" : n > 0 ? `내 영웅이 새로 바뀌어 옛 강화 코인 <i class="coin">C</i> ${nf(n)}을 돌려드렸어요` : "내 영웅이 새로 바뀌었어요";
    const t2 = m ? `능력은 영웅마다 ${MY_ABILITY_MAX}가지만 고를 수 있게 바뀌었어요. 능력이 ${MY_ABILITY_MAX + 1}개 이상이던 영웅 ${m.n}명의 능력을 모두 환불해 <i class="coin">C</i> ${nf(m.refund)}을 돌려드렸어요. 다시 골라 주세요(한 번 고르면 바꿀 수 없어요)` : "";
    modal(`<p class="mhnote">${[t1, t2].filter(Boolean).join("<br>")}</p><button class="wide green" id="mhOk">확인</button>`);
    $("mhOk").onclick = next; return true;
  }

  // ---- 나만의 영웅 리그 시작: 등록 영웅 고르기 -> 저장된 장착 세팅으로 시작. 영웅이 없으면 마켓(20종 고르기)으로. ----
  function pickMine(go) { // go(mine)
    if (noteFirst(() => pickMine(go))) return;
    const d = load();
    if (!d.heroes.length) { choose(); return; }
    const rows = d.heroes.map((h) => `<li class="mhpk">${pt(h.design, 56)}<span class="nm"><b>${esc(h.name)}</b><small>${esc(DES(h.design).name)}${eqLine(h) ? " · " + esc(eqLine(h)) : ""}</small></span><button class="mini" data-eq="${esc(h.design)}">장착</button><button class="mini del" data-d="${esc(h.design)}" aria-label="${esc(h.name)} 삭제">🗑</button><button class="green" data-h="${esc(h.design)}">시작</button></li>`).join("");
    modal(`<h2>영웅 선택</h2><ul class="rows mhpks">${rows}</ul><button class="wide mini" id="mhNo" ${BTNR}>닫기</button>`);
    pts();
    $("mhNo").onclick = closeModal;
    document.querySelectorAll("#box [data-eq]").forEach((b) => (b.onclick = () => loadout(b.dataset.eq, () => pickMine(go))));
    document.querySelectorAll("#box [data-d]").forEach((b) => (b.onclick = () => remove(b.dataset.d, () => pickMine(go))));
    document.querySelectorAll("#box [data-h]").forEach((b) => (b.onclick = () => {
      const h = heroOf(load(), b.dataset.h); if (!h) return;
      cur = { id: h.design, name: h.name }; closeModal(); go(mineOf(h));
    }));
  }
  // 다시 하기: 같은 리그 유지(내 영웅이면 같은 영웅, 장착은 저장된 최신값). 영웅이 지워졌으면 운빨 리그.
  function again() {
    if (!cur) return null;
    const h = heroOf(load(), cur.id);
    if (!h) { cur = null; return null; }
    return mineOf(h);
  }
  const clear = () => { cur = null; };
  // 화면 표시용 이름: 내 영웅이면 내가 정한 이름(+디자인 이름), 아니면 기존 영웅 이름
  function label(s) { return s && s.mine && cur ? `${cur.name} (${s.hero.name})` : s && s.hero ? s.hero.name : ""; }
  const heroName = () => (cur ? cur.name : "");

  // ---- 판 끝 정산: 한 판에 한 번. 비공개 시즌 판은 호출하지 않는다. ----
  // 운 층(docs/코인마켓_설계.md 5.2): 게임 시뮬 난수와 무관한 별도 스트림(seed 파생)을 정산 단계에서만 굴린다 -> 점수·재생 검증 불변.
  // 보스 코인 주머니(5라운드마다 1기), 황금 몹(라운드마다 1.5%), 첫 등급 보너스(히든/에픽/레전더리 이상 도달 시).
  const BAG = [[0.72, 1], [0.92, 3], [0.99, 8], [1.01, 25]];
  function luck(seed, R, win, top) {
    const rnd = mulberry32(((seed | 0) ^ 0xC01DC01D ^ Math.imul(R | 0, 2654435761)) >>> 0);
    const bosses = Math.max(0, Math.floor((R - 1) / 5)) + (win ? 1 : 0);
    let boss = 0, gold = 0, grade = 0;
    for (let i = 0; i < bosses; i++) { const x = rnd(); boss += BAG.find((e) => x < e[0])[1]; }
    for (let r = 1; r <= R; r++) if (rnd() < 0.015) gold += 2 + Math.floor(rnd() * 5);
    if (top >= 4) grade += 2; if (top >= 5) grade += 5; if (top >= 6) grade += 15;
    return { boss, gold, grade };
  }
  const KEY_REC = "malang-myhero-rec", KEY_DAY = "malang-myhero-day", COIN_MAX = 250;
  // 결과 {gain,total,parts}
  function settle(s, P) {
    if (!s || !s.mine || s.mineSettled) return { gain: 0, total: coins() }; // 코인은 내 영웅 판에서만 번다(운빨 리그 판은 코인 없음)
    s.mineSettled = true;
    const base = coinsFor(P.R, P.kills, !!P.win, mineCoinLv(s.mine)); // 코인 행운 = 이번 판에 켠 단계
    const lk = luck(s.seed, P.R, !!P.win, s.topGrade | 0);
    const hero = s.mine ? Math.floor(base * 0.05) : 0;
    let rec = 0; // 신기록: 영웅별 최고 라운드 갱신분 x2 (최대 20, 첫 판은 0)
    const hid = s.hero ? s.hero.id : "";
    let rc = {}; try { rc = JSON.parse(lsGet(KEY_REC, "{}")) || {}; } catch { rc = {}; }
    if (hid) { const old = Number(rc[hid]) || 0; if (old > 0 && P.R > old) rec = Math.min(20, (P.R - old) * 2); if (P.R > old) { rc[hid] = P.R; lsSet(KEY_REC, JSON.stringify(rc)); } }
    const sub = base + lk.boss + lk.gold + lk.grade + hero + rec;
    const today = todayKey();
    const daily = lsGet(KEY_DAY, "") !== today ? Math.min(15, Math.floor(sub * 0.2)) : 0;
    lsSet(KEY_DAY, today);
    let gain = Math.min(COIN_MAX, sub + daily);
    const d = load(); d.coins += gain; save(d); paint(d.coins);
    return { gain, total: d.coins, parts: { base, boss: lk.boss, gold: lk.gold, grade: lk.grade, hero, rec, daily } };
  }

  // ---- 코인 마켓 진입: 영웅이 없으면 곧바로 20종 고르기, 있으면 마지막에 본 영웅의 시장 ----
  function open(back) {
    if (noteFirst(() => open(back))) return;
    const d = load();
    if (!d.heroes.length) { choose(back); return; }
    market(heroOf(d, view) ? view : d.heroes[0].design, back);
  }

  // ---- 등록 1단계: 디자인 20종 그리드 ----
  function choose(back, msg) {
    const d = load(), have = new Set(d.heroes.map((h) => h.design)), full = d.heroes.length >= MY_HERO.MAX;
    const cells = MY_DESIGNS.map((x) => `<button class="mhdc${have.has(x.id) ? " got" : ""}" data-p="${x.id}">${pt(x.id, 72)}<span>${esc(x.name)}</span>${have.has(x.id) ? "<em>등록</em>" : ""}</button>`).join("");
    modal(`<h2>영웅 고르기</h2><small class="mhsub">${d.heroes.length}/${MY_HERO.MAX}명 등록 · 능력은 모두 같아요</small><div class="mhmsg" id="mhMsg">${msg ? esc(msg) : ""}</div><div class="mhdg">${cells}</div><button class="wide mini" id="mhX" ${BTNR}>${d.heroes.length ? "뒤로" : "닫기"}</button>`);
    pts();
    $("mhX").onclick = () => (d.heroes.length ? market(heroOf(d, view) ? view : d.heroes[0].design, back) : back ? back() : closeModal());
    document.querySelectorAll("#box [data-p]").forEach((b) => (b.onclick = () => {
      const id = b.dataset.p;
      if (have.has(id)) { view = id; market(id, back); return; }
      if (full) { sfx("deny"); $("mhMsg").textContent = `영웅은 ${MY_HERO.MAX}명까지 등록해요`; return; }
      nameIt(id, back);
    }));
  }
  // ---- 등록 2단계: 이름 정하기 (닉네임 검증 규칙 재사용: 2~10자, 한글·영문·숫자·공백·_.-) ----
  function nameIt(id, back) {
    const x = DES(id); if (!x) return;
    modal(`${pt(id, 96, "mhbig")}<h2>${esc(x.name)}</h2><input id="mhNm" maxlength="10" placeholder="이름 2~10자" autocomplete="off"><div class="mhmsg" id="mhMsg"></div><small class="mhsub">랭킹에 보이는 이름 · 등록 후 못 바꿔요</small><button class="wide green" id="mhOk">등록</button><button class="wide mini" id="mhX" ${BTNR}>뒤로</button>`);
    pts();
    $("mhX").onclick = () => choose(back);
    $("mhOk").onclick = () => {
      const c = checkName($("mhNm").value);
      if (!c.ok) { $("mhMsg").textContent = NAME_ERR_MSG[c.err]; sfx("deny"); return; }
      const d = load();
      if (d.heroes.length >= MY_HERO.MAX || heroOf(d, id)) { choose(back); return; }
      d.heroes.push({ design: id, name: c.name, own: {}, equip: { basic: null, ult: null } }); save(d); sfx("ticket"); view = id; market(id, back);
    };
  }

  // ---- 시장: 영웅별 보유 단계. 분류 탭(능력/기본공격/필살) + 카드 진열, 확인 없이 즉시 구매 ----
  // 카드 상태(규칙 canBuy 의 code 와 같다): can(살 수 있음) / poor(코인 부족, 부족액 표시) / lock(스킬 선행 조건) / full(능력 2종 가득) / max(최대)
  // 구매 가능 판정은 data.js canBuy(own, item, coins) 하나만 쓴다(4b UI 도 같은 함수)
  function card(it, h, coins, fresh) {
    const lv = h.own[it.id] | 0, cb = canBuy(h.own, it, coins), maxed = cb.code === "max";
    const st = maxed ? "max" : cb.code === "req" ? "lock" : cb.code === "slots" ? "full" : cb.code === "coin" ? "poor" : "can", cost = cb.cost;
    const dots = it.max > 1 ? `<span class="mkdot" aria-label="${lv}/${it.max}단계">${"<i class=on></i>".repeat(lv)}${"<i></i>".repeat(it.max - lv)}<em>${lv}/${it.max}</em></span>` : "";
    const tag = it.sk ? `<span class="mktag">${it.tier}단계 ${it.slot === "ult" ? "필살" : "기본공격"}</span>` : "";
    const act = st === "max" ? `<span class="mkst">${it.sk ? "보유" : "최대"}</span>`
      : st === "lock" || st === "full" ? `<span class="mkst">🔒 ${esc(cb.reason)}</span>`
      : `<button class="mkbuy${st === "poor" ? " off" : ""}" data-b="${it.id}"${st === "poor" ? ` aria-disabled="true"` : ""}><i class="coin">C</i> ${nf(cost)}</button>${st === "poor" ? `<span class="mkneed">${nf(cost - coins)} 부족</span>` : ""}`;
    return `<div class="mkc ${st}${fresh === it.id ? " got" : ""}"><div class="mkh"><span class="mki">${it.ico}</span><b>${esc(it.name)}</b></div>${dots}<p>${esc(it.txt(maxed ? it.max : lv + 1))}</p>${tag}${it.sk && st !== "lock" ? slotLine(it, h) : ""}${act}</div>`;
  }
  // 스킬 카드의 칸 안내: 장착 중 / 보유(안 끼움) / 사면 들어갈 칸
  function slotLine(it, h) {
    const cur = h.equip[it.slot], nm = (k) => esc(myItem(k).name);
    if (cur === it.id) return `<span class="mksl on">${SLOT[it.slot]} 칸에 장착 중</span>`;
    if (h.own[it.id]) return `<span class="mksl">보유 · 칸에 안 넣음 (장착 화면에서 교체)</span>`;
    if (!cur) return `<span class="mksl">사면 ${SLOT[it.slot]} 칸에 자동 장착</span>`;
    return `<span class="mksl full">${SLOT[it.slot]} 칸: ${nm(cur)} 장착 중 — 사도 자동 장착은 안 돼요. 쓰려면 장착 화면에서 바꿔요</span>`;
  }
  const slotPanel = (h) => `<div class="mkslots">${MY_SLOTS.map((k) => { const s = h.equip[k] && myItem(h.equip[k]); return `<span class="${s ? "on" : ""}"><small>${SLOT[k]} 칸</small>${s ? s.ico + " " + esc(s.name) : "비어 있음"}</span>`; }).join("")}</div><p class="mkrule">기본공격 스킬은 기본공격 칸에, 필살 스킬은 필살 칸에만 들어가요. 칸이 비면 그 공격은 일반 공격이에요. 기본 공격 칸 = 평소 공격 방식, 필살 칸 = 4번째마다 나가는 3배 피해 공격 방식.</p>`;
  const abilityPanel = (h) => { const a = myAbilities(h.own); return `<p class="mkrule">내 능력 ${a.length}/${MY_ABILITY_MAX}: ${a.length ? a.map((k) => `${myItem(k).name} ${h.own[k]}단계`).map(esc).join(" · ") : "아직 없어요"} · 한 번 고르면 바꾸거나 환불할 수 없어요</p>`; };
  // 잠긴 스킬은 카드 대신 접힌 한 줄 목록으로(탭이 길어지지 않게)
  const lockedBox = (arr) => !arr.length ? "" : `<details class="mklk"><summary>🔒 잠긴 스킬 ${arr.length}개 <small>${esc(myReqTxt(arr[0]))} 시 열려요</small></summary><ul>${arr.map((x) => `<li><span class="mki">${x.ico}</span><b>${esc(x.name)}</b><small>${x.tier}단계 · ${esc(canBuy({}, x).reason)}</small></li>`).join("")}</ul></details>`;
  function market(id, back) {
    const d0 = load(); if (!heroOf(d0, id)) { open(back); return; }
    view = id;
    modal(`<div class="mktop"><div class="mkbar"><div class="mkhs" id="mkHs"></div><b class="mkcoin"><i class="coin">C</i> <span id="mkCoin"></span></b></div><div class="mkme" id="mkMe"></div><div class="mktabs" id="mkTabs" role="tablist"></div></div><div class="mkgrid" id="mkGrid"></div><div class="mktoast" id="mkToast" role="status" aria-live="polite"></div><button class="wide mini" id="mhX" ${BTNR}>${back ? "뒤로" : "닫기"}</button>`);
    $("mhX").onclick = () => (back ? back() : closeModal());
    const draw = (fresh) => {
      const d = load(), h = heroOf(d, view); if (!h) { open(back); return; }
      $("mkCoin").textContent = nf(d.coins);
      $("mkHs").innerHTML = d.heroes.map((x) => `<button class="mkhc${x.design === view ? " on" : ""}" data-v="${x.design}" aria-label="${esc(x.name)}">${pt(x.design, 40)}</button>`).join("") + (d.heroes.length < MY_HERO.MAX ? `<button class="mkhc add" id="mkAdd" aria-label="영웅 추가">＋</button>` : "");
      $("mkMe").innerHTML = `<span class="nm"><b>${esc(h.name)}</b>${eqLine(h) ? " · " + esc(eqLine(h)) : ""}</span><button class="mini" id="mkEq">장착</button><button class="mini del" id="mkDel" aria-label="영웅 삭제">🗑</button>`;
      $("mkTabs").innerHTML = MY_CATS.map((c) => `<button role="tab" aria-selected="${c.k === tab}" class="${c.k === tab ? "on" : ""}" data-t="${c.k}">${c.ico} ${esc(c.name)}</button>`).join("");
      const its = MY_ITEMS.filter((x) => x.cat === tab), locked = its.filter((x) => !(h.own[x.id] | 0) && x.sk && !myReqOk(x.id, h.own));
      const shown = its.filter((x) => !locked.includes(x)), cd = (x) => card(x, h, d.coins, fresh);
      $("mkGrid").innerHTML = tab === "ability" // 능력 탭: 칸 안내 + 효과 종류별 구역
        ? abilityPanel(h) + MY_GRPS.map((g) => `<h3 class="mkh">${g.ico} ${esc(g.name)}</h3>${shown.filter((x) => x.grp === g.k).map(cd).join("")}`).join("")
        : slotPanel(h) + shown.map(cd).join("") + lockedBox(locked);
      pts();
      document.querySelectorAll("#box [data-v]").forEach((b) => (b.onclick = () => { if (b.dataset.v !== view) { view = b.dataset.v; sfx("tap"); draw(); } }));
      if ($("mkAdd")) $("mkAdd").onclick = () => choose(back);
      $("mkEq").onclick = () => loadout(view, () => market(view, back));
      $("mkDel").onclick = () => remove(view, () => { const r = load(); if (r.heroes.length) market(r.heroes[0].design, back); else choose(back); });
      document.querySelectorAll("#box [data-t]").forEach((b) => (b.onclick = () => { if (b.dataset.t !== tab) { tab = b.dataset.t; sfx("tap"); draw(); } }));
      document.querySelectorAll("#box [data-b]").forEach((b) => (b.onclick = () => {
        const k = b.dataset.b, now = Date.now();
        if (k === lastBuy.k && now - lastBuy.t < 250) return; // 더블탭(다시 그린 같은 버튼 재클릭) 무시 -> 2단계 연속 구매 방지
        lastBuy = { k, t: now };
        const r = buyCheck(view, k);
        if (!r.ok) { sfx("deny"); toast(r.reason); try { b.classList.remove("nope"); void b.offsetWidth; b.classList.add("nope"); } catch { /* 스텁 */ } return; }
        if (buy(view, k)) draw(k);
      }));
    };
    draw();
  }
  // 이 영웅이 이 품목을 지금 살 수 있는지(코인 포함). UI 훅: canBuy 와 같은 반환 {ok, code, reason, cost}
  function buyCheck(id, k) {
    const d = load(), h = heroOf(d, id);
    return h ? canBuy(h.own, k, d.coins) : { ok: false, code: "none", reason: "영웅이 없어요", cost: -1 };
  }
  // 즉시 구매. 산 수치 단계는 바로 적용되고, 스킬은 해당 칸이 비어 있으면 바로 장착. 성공 true
  function buy(id, k) {
    const d = load(), h = heroOf(d, id), it = myItem(k); if (!h || !it) return false;
    const r = canBuy(h.own, it, d.coins);
    if (!r.ok) { if (r.code === "coin") sfx("deny"); return false; }
    d.coins -= r.cost; h.own[k] = (h.own[k] | 0) + 1;
    if (it.sk && !h.equip[it.slot]) h.equip[it.slot] = k;
    save(d); sfx("sell"); paint(d.coins); return true;
  }
  // 칸 장착/해제(무료·즉시 저장). skillId null = 비우기. 반환 {ok, reason}
  function equipSlot(id, slot, skillId) {
    const d = load(), h = heroOf(d, id); if (!h) return { ok: false, reason: "영웅이 없어요" };
    if (!MY_SLOTS.includes(slot)) return { ok: false, reason: "없는 칸이에요" };
    if (skillId != null) { const it = myItem(skillId); if (!it || it.slot !== slot) return { ok: false, reason: "이 칸에는 못 넣어요" }; if (!h.own[skillId]) return { ok: false, reason: "아직 없는 스킬이에요" }; }
    h.equip[slot] = skillId == null ? null : skillId; save(d); return { ok: true, reason: "" };
  }

  // ---- 스킬 장착(기본공격 1칸·필살 1칸). 수치 능력은 산 만큼 항상 적용(보기만). 변경은 무료·즉시 저장 ----
  function loadout(id, back) {
    if (!heroOf(load(), id)) { open(); return; }
    modal(`<h2>이번 판 장착</h2><div id="eqBody"></div><button class="wide green" id="mhX">확인</button>`);
    $("mhX").onclick = () => (back ? back() : closeModal());
    const draw = (msg) => {
      const d = load(), h = heroOf(d, id); if (!h) { open(); return; }
      const nums = NUM.filter((x) => h.own[x.id]);
      const slot = (k) => { const s = h.equip[k] && myItem(h.equip[k]); return `<button class="eqs${s ? " on" : ""}" ${s ? `data-u="${k}"` : "disabled"}><small>${SLOT[k]}</small>${s ? `${s.ico} ${esc(s.name)}` : "비어 있음"}</button>`; };
      const spare = SKL.filter((x) => h.own[x.id] && h.equip[x.slot] !== x.id); // 칸에 든 스킬은 칸에만 보인다(칸을 누르면 빠짐), 아래는 남은 보유 스킬
      const skl = !SKL.some((x) => h.own[x.id]) ? `<small class="mhsub">시장의 기본공격·필살에서 스킬을 사요</small>`
        : spare.length ? `<small class="mhsub">눌러서 해당 칸에 장착 · 칸을 누르면 빠져요</small><div class="eqsk">${spare.map((x) => `<button data-s="${x.id}">${x.ico} ${esc(x.name)} <small>${x.slot === "ult" ? "필살" : "기본"}</small></button>`).join("")}</div>`
        : `<small class="mhsub">칸을 누르면 빠져요</small>`;
      const rows = nums.length ? `<ul class="rows eqn">${nums.map((x) => `<li><span class="mki">${x.ico}</span><span class="nm">${esc(x.name)}<small>${esc(x.txt(h.own[x.id]))}</small></span><b class="eqv">${h.own[x.id]}/${x.max}</b></li>`).join("")}</ul>` : `<small class="mhsub">시장에서 산 능력이 여기에 보여요</small>`;
      $("eqBody").innerHTML = `<div class="eqhd">${pt(h.design, 44)}<b>${esc(h.name)}</b></div><div class="mhmsg" id="mhMsg">${msg ? esc(msg) : ""}</div><h3>스킬 <small class="mhsub">기본공격 1칸 · 필살 1칸</small></h3><div class="eqslots">${slot("basic")}${slot("ult")}</div><small class="mhsub">기본 공격 칸 = 평소 공격, 필살 칸 = 4번째마다 3배 피해. 칸이 비면 그 공격은 일반 공격이에요</small>${skl}<h3>능력 <small class="mhsub">${MY_ABILITY_MAX}가지까지 · 산 만큼 항상 적용돼요</small></h3>${rows}`;
      pts();
      const edit = (slotK, sid) => { const r = equipSlot(id, slotK, sid); if (!r.ok) { sfx("deny"); draw(r.reason); return; } sfx("tap"); draw(); };
      document.querySelectorAll("#eqBody [data-s]").forEach((b) => (b.onclick = () => edit(myItem(b.dataset.s).slot, b.dataset.s)));
      document.querySelectorAll("#eqBody [data-u]").forEach((b) => (b.onclick = () => edit(b.dataset.u, null)));
    };
    draw();
  }

  paint();
  return { list, coins, pickMine, again, clear, label, heroName, settle, luck, open, mineOf, loadout, buy, buyCheck, equipSlot, paint };
})();
