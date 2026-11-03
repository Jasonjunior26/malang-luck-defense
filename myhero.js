"use strict";
// myhero.js - '내 영웅': 등록(최대 3, 이름 직접 정함) / 판 시작 선택 / 시장(영웅별 강화) / 판 끝 코인 정산.
// 규칙·수치(MY_HERO, validateMine, applyMine, coinsFor)는 data.js MYHERO 구간(서버 리플레이와 공유). 설계·서버 연동: docs/내영웅_진행.md
// 저장: localStorage "malang-myhero" = {v:1, coins, heroes:[{id, name, up:{atk,rew,disc,start}}]}, "malang-myhero-pick" = 마지막 선택(랜덤이면 "")
// ui.js 의 modal/closeModal/$/esc/lsGet/lsSet/sfx/checkName/NAME_ERR_MSG/nf 를 쓴다. 최상위 이름은 window.MyHero 하나만 만든다.
window.MyHero = (function () {
  const KEY = "malang-myhero", PICK = "malang-myhero-pick";
  const baseOf = (id) => HEROES.find((h) => h.id === id);
  const zeroUp = () => ({ atk: 0, rew: 0, disc: 0, start: 0 });
  function load() {
    let o = null;
    try { o = JSON.parse(lsGet(KEY, "null")); } catch { o = null; }
    const out = { v: 1, coins: 0, heroes: [] };
    if (!o || typeof o !== "object") return out;
    out.coins = Number.isInteger(o.coins) && o.coins > 0 ? o.coins : 0;
    for (const h of Array.isArray(o.heroes) ? o.heroes : []) { // 손상/조작된 저장값은 검증해서 걸러낸다
      if (out.heroes.length >= MY_HERO.MAX || !h || !baseOf(h.id) || out.heroes.some((x) => x.id === h.id)) continue;
      const nm = checkName(h.name), v = validateMine({ hero: h.id, up: h.up });
      if (nm.ok && v.ok) out.heroes.push({ id: h.id, name: nm.name, up: v.mine.up });
    }
    return out;
  }
  const save = (d) => lsSet(KEY, JSON.stringify(d));
  const list = () => load().heroes;
  const coins = () => load().coins;
  const mineOf = (h) => ({ hero: h.id, up: { ...h.up } }); // GAME.start 에 넘기는 값
  let cur = null; // 이번 판의 내 영웅 {id, name} (랜덤이면 null)
  const lvLine = (h) => MY_HERO.DIRS.map((d) => `${d.ico}${h.up[d.k]}`).join(" ");

  // ---- 판 시작 선택: 등록된 영웅이 없으면 바로 시작(기존 흐름 그대로) ----
  function pick(go) { // go(mine|null)
    const hs = list();
    if (!hs.length) { cur = null; go(null); return; }
    const last = lsGet(PICK, "");
    const rows = hs.map((h) => `<button class="wide ${last === h.id ? "green" : ""}" data-h="${esc(h.id)}">🦸 ${esc(h.name)}<br><small>${esc(baseOf(h.id).name)} · ${lvLine(h)}</small></button>`).join("");
    modal(`<h2>어떤 영웅으로 할까요?</h2><button class="wide ${last === "" ? "green" : ""}" id="mhRand">🎲 랜덤 영웅<br><small>기존 방식 · 판마다 새로 정해져요</small></button>${rows}<button class="wide mini" id="mhNo" ${BTNR}>닫기</button>`);
    $("mhNo").onclick = closeModal;
    $("mhRand").onclick = () => { lsSet(PICK, ""); cur = null; closeModal(); go(null); };
    document.querySelectorAll("#box [data-h]").forEach((b) => (b.onclick = () => {
      const h = list().find((x) => x.id === b.dataset.h); if (!h) return;
      lsSet(PICK, h.id); cur = { id: h.id, name: h.name }; closeModal(); go(mineOf(h));
    }));
  }
  // 다시 하기: 같은 선택으로(강화는 저장된 최신값). 영웅이 지워졌으면 랜덤.
  function again() {
    if (!cur) return null;
    const h = list().find((x) => x.id === cur.id);
    if (!h) { cur = null; return null; }
    return mineOf(h);
  }
  const clear = () => { cur = null; };
  // 화면 표시용 이름: 내 영웅이면 내가 정한 이름(+원래 영웅), 아니면 기존 영웅 이름
  function label(s) { return s && s.mine && cur ? `${cur.name} (${s.hero.name})` : s && s.hero ? s.hero.name : ""; }
  const heroName = () => (cur ? cur.name : "");

  // ---- 판 끝 정산: 한 판에 한 번. 비공개 시즌 판은 호출하지 않는다. 연습은 절반. ----
  function settle(s, P) {
    if (!s || s.mineSettled) return { gain: 0, total: coins() };
    s.mineSettled = true;
    const rew = s.mine ? s.mine.up.rew : 0;
    let gain = coinsFor(P.R, P.kills, !!P.win, rew);
    if (s.mode === "practice") gain = Math.floor(gain / 2);
    const d = load(); d.coins += gain; save(d);
    return { gain, total: d.coins };
  }

  // ---- 내 영웅 관리 화면 ----
  function open(back) {
    const d = load();
    const slots = d.heroes.map((h) => `<li><span class="nm">🦸 ${esc(h.name)}<br><small>${esc(baseOf(h.id).name)} · ${lvLine(h)} (${myUpSum(h.up)}/${MY_HERO.TOTAL_CAP})</small></span><button class="mini" data-m="${esc(h.id)}" style="flex:none;min-width:64px">🛒 강화</button></li>`);
    for (let i = d.heroes.length; i < MY_HERO.MAX; i++) slots.push(`<li><span class="nm" style="opacity:.6">빈 자리</span><button class="mini" data-add="1" style="flex:none;min-width:64px">＋ 등록</button></li>`);
    modal(`<h2>🦸 내 영웅</h2><small>마음에 드는 영웅 ${MY_HERO.MAX}명까지 등록하고 이름을 붙여요. 등록은 무료!<br>판이 끝나면 🪙 코인을 받고, 영웅마다 따로 강화해요.</small><div class="sc2" style="text-align:center">🪙 보유 코인 <b>${nf(d.coins)}</b></div><ul class="rows">${slots.join("")}</ul><button class="wide" id="mhX">${back ? "뒤로" : "닫기"}</button>`);
    $("mhX").onclick = () => (back ? back() : closeModal());
    document.querySelectorAll("#box [data-m]").forEach((b) => (b.onclick = () => market(b.dataset.m, back)));
    document.querySelectorAll("#box [data-add]").forEach((b) => (b.onclick = () => choose(back)));
  }

  // ---- 등록 1단계: 영웅 고르기 ----
  function choose(back) {
    const have = new Set(list().map((h) => h.id));
    const rows = HEROES.filter((h) => !have.has(h.id)).map((h) => `<li><span class="nm">${esc(h.name)}<br><small>${esc(h.rule)}</small></span><button class="mini" data-p="${esc(h.id)}" style="flex:none;min-width:56px">고르기</button></li>`).join("");
    modal(`<h2>어떤 영웅을 등록할까요?</h2><ul class="rows" style="max-height:52vh;overflow:auto">${rows}</ul><button class="wide" id="mhX">뒤로</button>`);
    $("mhX").onclick = () => open(back);
    document.querySelectorAll("#box [data-p]").forEach((b) => (b.onclick = () => nameIt(b.dataset.p, back)));
  }
  // ---- 등록 2단계: 이름 정하기 (닉네임 검증 규칙 재사용: 2~10자, 한글·영문·숫자·공백·_.-) ----
  function nameIt(id, back) {
    const b = baseOf(id); if (!b) return;
    modal(`<h2>이름을 지어 줘요</h2><p style="font-size:13px;margin:4px 0;line-height:1.4">${esc(b.name)}에게 붙일 이름이에요.<br>랭킹에도 이 이름이 보여요. 등록한 뒤에는 바꿀 수 없어요.</p><input id="mhNm" maxlength="10" placeholder="2~10자" autocomplete="off" style="width:100%;box-sizing:border-box;font-size:16px;padding:10px;border-radius:10px;border:2px solid #d9c9b5;text-align:center"><div id="mhMsg" class="sm" style="min-height:18px;color:#c0392b;font-size:12px"></div><button class="wide green" id="mhOk">등록하기</button><button class="wide mini" id="mhX" ${BTNR}>뒤로</button>`);
    $("mhX").onclick = () => choose(back);
    $("mhOk").onclick = () => {
      const c = checkName($("mhNm").value);
      if (!c.ok) { $("mhMsg").textContent = NAME_ERR_MSG[c.err]; sfx("deny"); return; }
      const d = load();
      if (d.heroes.length >= MY_HERO.MAX || d.heroes.some((h) => h.id === id)) { open(back); return; }
      d.heroes.push({ id, name: c.name, up: zeroUp() }); save(d); sfx("ticket"); open(back);
    };
  }

  // ---- 시장: 영웅별 강화 ----
  function market(id, back, msg) {
    const d = load(), h = d.heroes.find((x) => x.id === id); if (!h) { open(back); return; }
    const sum = myUpSum(h.up), full = sum >= MY_HERO.TOTAL_CAP;
    const rows = MY_HERO.DIRS.map((dir) => {
      const lv = h.up[dir.k], maxed = lv >= dir.max, cost = MY_HERO.COST[lv];
      const can = !maxed && !full && d.coins >= cost;
      const btn = maxed ? `<button class="mini" disabled style="flex:none;min-width:84px">최대</button>` : full ? `<button class="mini" disabled style="flex:none;min-width:84px">상한</button>` : `<button class="mini ${can ? "" : "off"}" data-b="${dir.k}" style="flex:none;min-width:84px">🪙 ${cost}</button>`;
      return `<li><span class="nm">${dir.ico} ${dir.name} Lv${lv}/${dir.max}<br><small>${lv ? dir.txt(lv) : "강화 전"}${!maxed ? ` → ${dir.txt(lv + 1)}` : ""}</small></span>${btn}</li>`;
    }).join("");
    modal(`<h2>🛒 ${esc(h.name)}</h2><small>${esc(baseOf(id).name)} · 강화 ${sum}/${MY_HERO.TOTAL_CAP}단계</small><div class="sc2" style="text-align:center">🪙 보유 코인 <b>${nf(d.coins)}</b></div>${msg ? `<small style="color:#c0392b">${esc(msg)}</small>` : ""}<ul class="rows">${rows}</ul><small>강화는 랭킹 도전·연습에서만 적용돼요 (시즌 규칙 판 제외)</small><button class="wide" id="mhX">뒤로</button>`);
    $("mhX").onclick = () => open(back);
    document.querySelectorAll("#box [data-b]").forEach((b) => (b.onclick = () => buy(id, b.dataset.b, back)));
  }
  function buy(id, k, back) {
    const d = load(), h = d.heroes.find((x) => x.id === id), dir = MY_HERO.DIRS.find((x) => x.k === k); if (!h || !dir) return;
    const lv = h.up[k], cost = MY_HERO.COST[lv];
    if (lv >= dir.max || myUpSum(h.up) >= MY_HERO.TOTAL_CAP) { market(id, back); return; }
    if (d.coins < cost) { sfx("deny"); market(id, back, "코인이 모자라요"); return; }
    d.coins -= cost; h.up[k] = lv + 1; save(d); sfx("reso"); market(id, back);
  }

  return { list, coins, pick, again, clear, label, heroName, settle, open, mineOf };
})();
