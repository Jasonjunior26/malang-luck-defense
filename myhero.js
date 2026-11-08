"use strict";
// myhero.js - 내 영웅 v2(GAME_VER 7): 코인 마켓(디자인 20종 등록·이름 / 능력 35종 구매) · 이번 판 장착(전투력 MY_POWER_CAP·스킬 MY_EQUIP_MAX) · 나만의 영웅 리그 시작 · 판 끝 코인 정산.
// 규칙·수치(MY_DESIGNS, MY_CATS, MY_ITEMS, validateMine, applyMine, coinsFor, mineCoinLv, migrateLegacyMine)는 data.js MYHERO 구간(서버 리플레이와 공유). 스펙: docs/내영웅_v2_스펙.md
// 저장: localStorage "malang-myhero2" = {v:2, mig:1, coins, note, heroes:[{design, name, own:{품목:보유 단계}, on:{수치 품목:켠 단계}, equip:[스킬 id]}]}
//   own = 산 기록(서버로 안 감). mineOf 가 on(수치)·보유 스킬 전부·equip 으로 mine 을 만든다. note = 레거시 이전 안내(환불 코인, 1회 표시 후 null)
//   옛 키 "malang-myhero"(v1 {v:1, heroes:[{id,name,up}]}) 는 새 키에 mig 가 없을 때만 읽어 migrateLegacyMine 으로 바꾸고(환불 코인 합산, 디자인 = 옛 영웅 id, 보유 초기화)
//   바로 새 키에 저장한다. 옛 키는 지우지 않는다(옛 v6 탭이 덮어써도 v2 값은 안전, 환불은 1회).
// ui.js 의 modal/closeModal/$/esc/lsGet/lsSet/sfx/checkName/NAME_ERR_MSG/nf 를 쓴다. 최상위 이름은 window.MyHero 하나만 만든다.
window.MyHero = (function () {
  const KEY = "malang-myhero2", OLD = "malang-myhero"; // v2 는 새 키. 옛 키는 v6 탭(v1 형식)이 계속 쓸 수 있어 읽기만 한다
  const DES = (id) => MY_DESIGNS.find((d) => d.id === id) || null;
  const SKL = MY_ITEMS.filter((x) => x.sk), NUM = MY_ITEMS.filter((x) => !x.sk);
  const lvOf = (it, v) => Math.max(0, Math.min(it.max, Number.isInteger(v) ? v : 0));

  // ---- 저장 ----
  function cleanHero(h) { // 손상/조작된 값 정리: 보유 단계 범위, 스킬 선행 조건, 켠 단계 <= 보유, 전투력 상한, 장착 = 보유 스킬
    const so = (h && h.own) || {}, sn = (h && h.on) || {}, own = {}, on = {}, equip = [];
    for (const it of MY_ITEMS) { const l = lvOf(it, so[it.id]); if (l) own[it.id] = l; }
    for (const it of SKL) if (own[it.id] && !myReqOk(it.id, own)) delete own[it.id]; // 카탈로그가 1->2->3단계 순이라 한 번이면 된다
    for (const it of NUM) { const l = Math.min(own[it.id] | 0, lvOf(it, sn[it.id])); if (l) on[it.id] = l; }
    if (myPower(on) > MY_POWER_CAP) for (const k in on) delete on[k];
    for (const id of Array.isArray(h && h.equip) ? h.equip : []) if (typeof id === "string" && own[id] && myItem(id).sk && !equip.includes(id) && equip.length < MY_EQUIP_MAX) equip.push(id);
    return { own, on, equip };
  }
  const parse = (k) => { try { const o = JSON.parse(lsGet(k, "null")); return o && typeof o === "object" ? o : null; } catch { return null; } };
  function load() {
    const out = { v: 2, mig: 1, coins: 0, note: null, heroes: [] };
    let o = parse(KEY), from = false; // 새 키에 변환 완료 표시(mig)가 있으면 옛 키는 보지 않는다
    if (!o || !o.mig) { const p = parse(OLD); if (p) { o = p; from = true; } }
    if (!o) return out;
    out.coins = Number.isInteger(o.coins) && o.coins > 0 ? o.coins : 0;
    const legacy = o.v !== 2;
    let refund = 0;
    for (const h of Array.isArray(o.heroes) ? o.heroes : []) {
      if (!h || typeof h !== "object" || out.heroes.length >= MY_HERO.MAX) continue;
      let design = h.design, rest = h;
      if (legacy) { const g = migrateLegacyMine({ id: h.id, up: h.up }); design = g.design; refund += g.refund; rest = {}; }
      const nm = checkName(h.name);
      if (!nm.ok || !DES(design) || out.heroes.some((x) => x.design === design)) continue;
      out.heroes.push({ design, name: nm.name, ...cleanHero(rest) });
    }
    if (legacy) { // 1회 이전: 환불 합산
      out.coins += refund;
      out.note = Array.isArray(o.heroes) && o.heroes.length ? refund : null;
    } else out.note = Number.isInteger(o.note) && o.note >= 0 ? o.note : null;
    if (legacy || from) save(out); // 즉시 새 키에 mig 와 함께 기록 -> 다음 load 부터 옛 키 무시(환불 중복 없음). 옛 키는 지우지 않는다(옛 탭용)
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
    for (const it of MY_ITEMS) { const l = it.sk ? h.own[it.id] | 0 : Math.min(h.on[it.id] | 0, h.own[it.id] | 0); if (l) items[it.id] = l; }
    const tries = [{ design: h.design, items, equip: h.equip.slice() }, { design: h.design, items: {}, equip: [] }];
    for (const m of tries) { const v = validateMine(m); if (v.ok) return v.mine; }
    return tries[1];
  }
  const powerOf = (h) => myPower(h.on);
  const eqLine = (h) => h.equip.map((id) => myItem(id).name).join(" · ");
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
  const gauge = (p) => `<div class="mhg${p > MY_POWER_CAP ? " over" : ""}"><i style="width:${Math.min(100, (p / MY_POWER_CAP) * 100).toFixed(1)}%"></i><span>전투력 ${p} / ${MY_POWER_CAP}</span></div>`;
  // 레거시 이전 안내(한 번만). 보여 줬으면 true -> 호출자는 확인 뒤 next 로 이어진다
  function noteFirst(next) {
    const d = load(); if (d.note == null) return false;
    const n = d.note; d.note = null; save(d);
    modal(`<p class="mhnote">${n > 0 ? `내 영웅이 새로 바뀌어 옛 강화 코인 🪙 ${nf(n)}을 돌려드렸어요` : "내 영웅이 새로 바뀌었어요"}</p><button class="wide green" id="mhOk">확인</button>`);
    $("mhOk").onclick = next; return true;
  }

  // ---- 나만의 영웅 리그 시작: 등록 영웅 고르기 -> 저장된 장착 세팅으로 시작. 영웅이 없으면 마켓(20종 고르기)으로. ----
  function pickMine(go) { // go(mine)
    if (noteFirst(() => pickMine(go))) return;
    const d = load();
    if (!d.heroes.length) { choose(); return; }
    const rows = d.heroes.map((h) => `<li class="mhpk">${pt(h.design, 56)}<span class="nm"><b>${esc(h.name)}</b><small>${esc(DES(h.design).name)} · 전투력 ${powerOf(h)}/${MY_POWER_CAP}${h.equip.length ? " · " + esc(eqLine(h)) : ""}</small></span><button class="mini" data-eq="${esc(h.design)}">장착</button><button class="green" data-h="${esc(h.design)}">시작</button></li>`).join("");
    modal(`<h2>영웅 선택</h2><ul class="rows mhpks">${rows}</ul><button class="wide mini" id="mhNo" ${BTNR}>닫기</button>`);
    pts();
    $("mhNo").onclick = closeModal;
    document.querySelectorAll("#box [data-eq]").forEach((b) => (b.onclick = () => loadout(b.dataset.eq, () => pickMine(go))));
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
    if (!s || s.mineSettled) return { gain: 0, total: coins() };
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
      d.heroes.push({ design: id, name: c.name, own: {}, on: {}, equip: [] }); save(d); sfx("ticket"); view = id; market(id, back);
    };
  }

  // ---- 시장: 영웅별 보유 단계. 카테고리 탭 + 카드 진열, 확인 없이 즉시 구매 ----
  // 카드 상태: can(살 수 있음) / poor(코인 부족, 부족액 표시) / lock(스킬 선행 조건) / max(최대)
  function card(it, h, coins, fresh) {
    const lv = h.own[it.id] | 0, maxed = lv >= it.max, cost = maxed ? 0 : itemCost(it.id, lv + 1);
    const lock = !maxed && it.tier && !myReqOk(it.id, h.own), st = maxed ? "max" : lock ? "lock" : coins >= cost ? "can" : "poor";
    const dots = it.max > 1 ? `<span class="mkdot" aria-label="${lv}/${it.max}단계">${"<i class=on></i>".repeat(lv)}${"<i></i>".repeat(it.max - lv)}<em>${lv}/${it.max}</em></span>` : "";
    const tag = it.sk ? `<span class="mktag">${it.tier}단계 스킬</span>` : it.pw > 1 ? `<span class="mktag">전투력 ${it.pw}</span>` : "";
    const act = st === "max" ? `<span class="mkst">${it.sk ? "보유" : "최대"}</span>`
      : st === "lock" ? `<span class="mkst">🔒 ${lockTxt(it)}</span>`
      : `<button class="mkbuy${st === "poor" ? " off" : ""}" data-b="${it.id}"${st === "poor" ? ` aria-disabled="true"` : ""}>🪙 ${nf(cost)}</button>${st === "poor" ? `<span class="mkneed">${nf(cost - coins)} 부족</span>` : ""}`;
    return `<div class="mkc ${st}${fresh === it.id ? " got" : ""}"><div class="mkh"><span class="mki">${it.ico}</span><b>${esc(it.name)}</b></div>${dots}<p>${esc(it.txt(maxed ? it.max : lv + 1))}</p>${tag}${act}</div>`;
  }
  const lockTxt = (it) => `${it.tier - 1}단계 스킬 필요`; // 짧은 잠금 문구(전체 조건은 MY_REQ_TXT)
  // 잠긴 스킬은 카드 대신 접힌 한 줄 목록으로(영웅·스킬 탭이 길어지지 않게)
  const lockedBox = (arr) => !arr.length ? "" : `<details class="mklk"><summary>🔒 잠긴 스킬 ${arr.length}개 <small>${esc(MY_REQ_TXT[arr[0].tier])} 시 열려요</small></summary><ul>${arr.map((x) => `<li><span class="mki">${x.ico}</span><b>${esc(x.name)}</b><small>${x.tier}단계 · ${lockTxt(x)}</small></li>`).join("")}</ul></details>`;
  function market(id, back) {
    const d0 = load(); if (!heroOf(d0, id)) { open(back); return; }
    view = id;
    modal(`<div class="mktop"><div class="mkbar"><div class="mkhs" id="mkHs"></div><b class="mkcoin">🪙 <span id="mkCoin"></span></b></div><div class="mkme" id="mkMe"></div><div class="mktabs" id="mkTabs" role="tablist"></div></div><div class="mkgrid" id="mkGrid"></div><div class="mktoast" id="mkToast" role="status" aria-live="polite"></div><button class="wide mini" id="mhX" ${BTNR}>${back ? "뒤로" : "닫기"}</button>`);
    $("mhX").onclick = () => (back ? back() : closeModal());
    const draw = (fresh) => {
      const d = load(), h = heroOf(d, view); if (!h) { open(back); return; }
      $("mkCoin").textContent = nf(d.coins);
      $("mkHs").innerHTML = d.heroes.map((x) => `<button class="mkhc${x.design === view ? " on" : ""}" data-v="${x.design}" aria-label="${esc(x.name)}">${pt(x.design, 40)}</button>`).join("") + (d.heroes.length < MY_HERO.MAX ? `<button class="mkhc add" id="mkAdd" aria-label="영웅 추가">＋</button>` : "");
      $("mkMe").innerHTML = `<span class="nm"><b>${esc(h.name)}</b> · 전투력 ${powerOf(h)}/${MY_POWER_CAP}${h.equip.length ? " · " + esc(eqLine(h)) : ""}</span><button class="mini" id="mkEq">장착</button>`;
      $("mkTabs").innerHTML = MY_CATS.map((c) => `<button role="tab" aria-selected="${c.k === tab}" class="${c.k === tab ? "on" : ""}" data-t="${c.k}">${c.ico} ${esc(c.name)}</button>`).join("");
      const its = MY_ITEMS.filter((x) => x.cat === tab), locked = its.filter((x) => !(h.own[x.id] | 0) && x.tier && !myReqOk(x.id, h.own));
      $("mkGrid").innerHTML = its.filter((x) => !locked.includes(x)).map((x) => card(x, h, d.coins, fresh)).join("") + lockedBox(locked);
      pts();
      document.querySelectorAll("#box [data-v]").forEach((b) => (b.onclick = () => { if (b.dataset.v !== view) { view = b.dataset.v; sfx("tap"); draw(); } }));
      if ($("mkAdd")) $("mkAdd").onclick = () => choose(back);
      $("mkEq").onclick = () => loadout(view, () => market(view, back));
      document.querySelectorAll("#box [data-t]").forEach((b) => (b.onclick = () => { if (b.dataset.t !== tab) { tab = b.dataset.t; sfx("tap"); draw(); } }));
      document.querySelectorAll("#box [data-b]").forEach((b) => (b.onclick = () => {
        const k = b.dataset.b, now = Date.now();
        if (k === lastBuy.k && now - lastBuy.t < 250) return; // 더블탭(다시 그린 같은 버튼 재클릭) 무시 -> 2단계 연속 구매 방지
        lastBuy = { k, t: now };
        const dd = load(), hh = heroOf(dd, view), c = hh ? itemCost(k, (hh.own[k] | 0) + 1) : -1;
        if (c > dd.coins) { sfx("deny"); toast(`코인 ${nf(c - dd.coins)} 부족`); try { b.classList.remove("nope"); void b.offsetWidth; b.classList.add("nope"); } catch { /* 스텁 */ } return; }
        if (buy(view, k)) draw(k);
      }));
    };
    draw();
  }
  // 즉시 구매. 산 단계는 전투력이 남으면 바로 켜고(그 품목이 다 켜져 있을 때만), 스킬은 빈 칸이 있으면 바로 장착. 성공 true
  function buy(id, k) {
    const d = load(), h = heroOf(d, id), it = myItem(k); if (!h || !it) return false;
    const lv = h.own[k] | 0, cost = itemCost(k, lv + 1);
    if (cost < 0 || (it.tier && !myReqOk(k, h.own))) return false;
    if (d.coins < cost) { sfx("deny"); return false; }
    d.coins -= cost; h.own[k] = lv + 1;
    if (it.sk) { if (h.equip.length < MY_EQUIP_MAX && !h.equip.includes(k)) h.equip.push(k); }
    else if ((h.on[k] | 0) === lv && powerOf(h) + it.pw <= MY_POWER_CAP) h.on[k] = lv + 1;
    save(d); sfx("sell"); paint(d.coins); return true;
  }

  // ---- 이번 판 장착: 수치 능력 켜기 단계(±, 전투력 상한), 스킬 2칸. 변경은 무료·즉시 저장 ----
  function loadout(id, back) {
    if (!heroOf(load(), id)) { open(); return; }
    modal(`<h2>이번 판 장착</h2><div id="eqBody"></div><button class="wide green" id="mhX">완료</button>`);
    $("mhX").onclick = () => (back ? back() : closeModal());
    const draw = (msg) => {
      const d = load(), h = heroOf(d, id); if (!h) { open(); return; }
      const p = powerOf(h), skills = SKL.filter((x) => h.own[x.id]), nums = NUM.filter((x) => h.own[x.id]);
      const slot = (i) => { const s = h.equip[i] && myItem(h.equip[i]); return `<button class="eqs${s ? " on" : ""}" ${s ? `data-u="${s.id}"` : "disabled"}><small>${i ? "필살" : "기본 공격"}</small>${s ? `${s.ico} ${esc(s.name)}` : "비어 있음"}</button>`; };
      const spare = skills.filter((x) => !h.equip.includes(x.id)); // 칸에 든 스킬은 칸에만 보인다(칸을 누르면 빠짐), 아래는 남은 보유 스킬
      const skl = !skills.length ? `<small class="mhsub">시장의 영웅·스킬에서 스킬을 사요</small>`
        : spare.length ? `<small class="mhsub">눌러서 빈 칸에 장착 · 칸을 누르면 빠져요</small><div class="eqsk">${spare.map((x) => `<button data-s="${x.id}">${x.ico} ${esc(x.name)}</button>`).join("")}</div>`
        : `<small class="mhsub">칸을 누르면 빠져요</small>`;
      const rows = nums.length ? `<ul class="rows eqn">${nums.map((x) => { const o = h.on[x.id] | 0, n = h.own[x.id]; return `<li class="${o ? "" : "off"}"><span class="mki">${x.ico}</span><span class="nm">${esc(x.name)}<small>${o ? esc(x.txt(o)) : "꺼짐"}${x.pw > 1 ? ` · 단계당 ${x.pw}` : ""}</small></span><button class="mini" data-m="${x.id}" aria-label="줄이기">−</button><b class="eqv">${o}/${n}</b><button class="mini" data-p="${x.id}" aria-label="늘리기">＋</button></li>`; }).join("")}</ul>` : `<small class="mhsub">시장에서 산 능력이 여기에 보여요</small>`;
      $("eqBody").innerHTML = `<div class="eqhd">${pt(h.design, 44)}<b>${esc(h.name)}</b></div>${gauge(p)}<div class="mhmsg" id="mhMsg">${msg ? esc(msg) : ""}</div><h3>스킬</h3><div class="eqslots">${slot(0)}${slot(1)}</div>${skl}<h3>능력</h3>${rows}`;
      pts();
      const edit = (fn) => { const dd = load(), hh = heroOf(dd, id); const r = fn(hh); if (r) { sfx("deny"); draw(r); return; } save(dd); sfx("tap"); draw(); };
      document.querySelectorAll("#eqBody [data-p]").forEach((b) => (b.onclick = () => edit((hh) => { const x = myItem(b.dataset.p), o = hh.on[x.id] | 0;
        if (o >= (hh.own[x.id] | 0)) return "산 단계까지만 켤 수 있어요";
        if (powerOf(hh) + x.pw > MY_POWER_CAP) return `전투력 ${MY_POWER_CAP}을 넘어요. 다른 능력을 줄여 주세요`;
        hh.on[x.id] = o + 1; })));
      document.querySelectorAll("#eqBody [data-m]").forEach((b) => (b.onclick = () => edit((hh) => { const o = hh.on[b.dataset.m] | 0; if (o <= 0) return "이미 꺼져 있어요"; if (o === 1) delete hh.on[b.dataset.m]; else hh.on[b.dataset.m] = o - 1; })));
      document.querySelectorAll("#eqBody [data-s]").forEach((b) => (b.onclick = () => edit((hh) => { const k = b.dataset.s, i = hh.equip.indexOf(k);
        if (i >= 0) { hh.equip.splice(i, 1); return; }
        if (hh.equip.length >= MY_EQUIP_MAX) return `스킬은 ${MY_EQUIP_MAX}개까지 장착해요. 하나를 먼저 빼 주세요`;
        hh.equip.push(k); })));
      document.querySelectorAll("#eqBody [data-u]").forEach((b) => (b.onclick = () => edit((hh) => { const i = hh.equip.indexOf(b.dataset.u); if (i >= 0) hh.equip.splice(i, 1); })));
    };
    draw();
  }

  paint();
  return { list, coins, pickMine, again, clear, label, heroName, settle, luck, open, mineOf, loadout, buy, paint };
})();
