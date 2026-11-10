"use strict";
// rewards.js - 주간 랭킹 보상 팝업(스펙 docs/주간보상_스펙.md '클라이언트 (C)', 구현 요약 docs/주간보상_클라.md).
// ui.js 뒤, myhero.js 앞/뒤 어디든 로드(호출 시점에 $, esc, nf, api, modal, closeModal, myName, MyHero 를 쓴다). 최상위 이름은 window.Rewards 하나.
// 흐름: boot() -> (홈·닉네임 등록·온라인) 서버 rewards 1회 -> pending 있으면 [받기]: MyHero.grantReward(코인+rw 한 번의 save) -> rewardAck(실패해도 재지급 없음, 다음 boot 에서 ack 만 재시도).
//       직전 시즌 팝업을 이미 봤고 pending 도 없으면 띄우지 않는다. 서버 미지원/실패는 조용히 무시. ?rwdemo=1(보상 있음)/2(없음)/3(한 리그·긴 이름)은 가짜 데이터로 팝업만(코인·서버 무관).
(function (root) {
  const g = (n) => { try { return root[n] !== undefined ? root[n] : (0, eval)(n); } catch { return undefined; } };
  const SEEN_KEY = "malang-rw-seen", CALL_KEY = "malang-rw-call"; // 팝업을 본 직전 시즌 id / 마지막으로 모든 처리를 끝낸 현재 시즌 id
  const LG = { luck: "운빨 리그", mine: "내 영웅 리그" }, ORDER = ["luck", "mine"];
  const TBL = { top: 200, last: 10, b1: 100, b2: 70, b3: 50, extra1: 100, ratio: 30 }; // 서버 tbl 이 없을 때의 기본값(스펙 확정값)
  let tbl = { ...TBL }, showing = false, busy = false, demoDone = false, inst = null, failAt = 0;
  const GRACE_KEY = "malang-rw-gr", GRACE_MS = 5 * 60 * 1000, FAIL_MS = 60 * 1000, ACK_MAX = 20; // 유예 응답 재호출 최소 간격 / 서버·네트워크 실패 후 재시도 간격 / rewardAck 1회 최대 시즌 수
  // 팝업 상태 복구: showing 해제 + keydown 리스너 제거(goHome 등 모달 강제 정리 경로에서 호출)
  function reset() { const i = inst; inst = null; showing = false; if (i) { try { document.removeEventListener("keydown", i.key, true); } catch { /* 스텁 */ } } }
  // showing 을 DOM 실제 상태로 재판정: 모달이 꺼졌거나 받기 버튼이 없으면 누수로 보고 자가 복구
  function isShowing() {
    if (!showing) return false;
    const mo = g("MODAL_ON"), $ = g("$");
    if (mo === false || (typeof $ === "function" && !$("rwOk"))) { reset(); return false; }
    return true;
  }

  // ---------- 순수 로직 ----------
  const int = (x, lo, hi) => (Number.isInteger(x) && x >= lo && x <= hi ? x : null);
  // 보상 기본액(스펙 정수식 그대로: 1위 top, K위 last, 10 단위 올림). 표 안내문 계산용(서버가 실제 지급액을 계산한다)
  function baseOf(r, k) {
    if (!Number.isInteger(r) || !Number.isInteger(k) || k < 2 || r < 1 || r > k) return 0;
    const hi = TBL.top, lo = TBL.last, d = 10 * (k - 1), num = hi * (k - 1) - (hi - lo) * (r - 1);
    return Math.floor((num + d - 1) / d) * 10;
  }
  const bonusOf = (r, t) => (r === 1 ? t.b1 + t.extra1 : r === 2 ? t.b2 : r === 3 ? t.b3 : 0);
  const totalOf = (r, k, t) => baseOf(r, k) + bonusOf(r, t);
  function cleanTbl(t) {
    const o = { ...TBL };
    if (t && typeof t === "object") for (const k of Object.keys(TBL)) { const v = int(t[k], 0, 100000); if (v !== null) o[k] = v; }
    if (!(o.ratio >= 1 && o.ratio <= 100)) o.ratio = TBL.ratio;
    return o;
  }
  // 서버 응답 -> 안전한 모델. 잘못된 항목은 버린다. null 이면 사용 불가 응답.
  function clean(d) {
    if (!d || d.ok !== true) return null;
    const cur = int(d.cur, 1, 1e6);
    const m = { cur, last: null, pending: [], tbl: cleanTbl(d.tbl) };
    if (d.last && typeof d.last === "object") {
      const s = int(d.last.season, 1, 1e6), lg = {};
      for (const k of ORDER) {
        const L = d.last.leagues && d.last.leagues[k];
        if (!L || typeof L !== "object") continue;
        const top = (Array.isArray(L.top) ? L.top : []).slice(0, 3).map((x) => ({ rank: x && int(x.rank, 1, 1e6), name: x && typeof x.name === "string" ? x.name.slice(0, 40) : "", hero: x && typeof x.hero === "string" ? x.hero.slice(0, 40) : "", total: x && int(x.total, 0, 1e6) }))
          .filter((x) => x.rank && x.total !== null && x.name);
        lg[k] = { n: int(L.n, 0, 1e7) || 0, k: int(L.k, 0, 1e7) || 0, top };
      }
      if (s) m.last = { season: s, leagues: lg };
    }
    const seen = new Set();
    for (const p of Array.isArray(d.pending) ? d.pending : []) {
      const season = p && int(p.season, 1, 1e6), rank = p && int(p.rank, 1, 1e7), total = p && int(p.total, 0, 1e6);
      if (!season || !rank || total === null || !LG[p.league]) continue;
      const key = season + p.league;
      if (seen.has(key)) continue; seen.add(key);
      m.pending.push({ season, league: p.league, rank, total });
    }
    m.pending.sort((a, b) => a.season - b.season || ORDER.indexOf(a.league) - ORDER.indexOf(b.league));
    return m;
  }
  const bySeason = (list) => { const o = new Map(); for (const p of list) o.set(p.season, (o.get(p.season) || 0) + p.total); return [...o].map(([season, total]) => ({ season, total })); };

  // ---------- 화면 ----------
  const E = (s) => { const f = g("esc"); return f ? f(s) : String(s); };
  const N = (n) => { const f = g("nf"); return f ? f(n) : String(n); };
  const coin = (n) => `<span class="rwn"><i class="coin">C</i> ${N(n)}</span>`; // 아이콘과 숫자가 줄바꿈으로 갈라지지 않게
  const medal = ["🥇", "🥈", "🥉"];
  function seasonLabel(id) {
    const f = g("seasonById"), md = g("md"), s = f ? f(id) : null;
    return s && s.start && md ? `${E(s.name)} · ${md(s.start)}~${md(s.end)}` : `시즌 ${id}`;
  }
  // 보상표: 열 = 리그(운빨 | 마이히어로), 행 = 1·2·3위 + 4위~커트라인. 리그별 k 가 2·3위·범위 행의 기본액을 바꾸므로 그 리그 값으로 계산한다.
  // 두 리그 k 가 같으면 한 열로 합친다. 리그 정보가 없으면 k=10(최소) 기준 한 열.
  function tableCols(m) {
    const cols = ORDER.filter((k) => m.last && m.last.leagues[k] && m.last.leagues[k].k >= 10).map((k) => ({ name: LG[k], k: m.last.leagues[k].k }));
    if (!cols.length) return [{ name: "", k: 10 }];
    return cols.every((c) => c.k === cols[0].k) ? [{ name: cols.length > 1 ? "두 리그 모두" : cols[0].name, k: cols[0].k }] : cols;
  }
  function tableRows(m) {
    const t = m.tbl, cols = tableCols(m);
    const rows = [1, 2, 3].map((r) => ({ cls: "r" + r, label: `${medal[r - 1]} ${r}위`, sub: `보너스 +${N(bonusOf(r, t))}`, v: cols.map((c) => totalOf(r, c.k, t)) }));
    rows.push({ cls: "rr", label: "4위~", sub: `상위 ${t.ratio}%`, v: cols.map((c) => `<span class="rwn">${coin(baseOf(4, c.k))} ~ ${N(t.last)}</span>`), range: true });
    return { cols, rows };
  }
  function tableHtml(m) {
    const { cols, rows } = tableRows(m);
    const head = cols.length > 1 || cols[0].name ? `<thead><tr><td></td>${cols.map((c) => `<th scope="col">${c.name}</th>`).join("")}</tr></thead>` : "";
    const body = rows.map((r) => `<tr class="${r.cls}"><th scope="row">${r.label}<small>${r.sub}</small></th>${r.v.map((v) => `<td>${r.range ? v : coin(v)}</td>`).join("")}</tr>`).join("");
    return `<h3>보상표</h3><p class="rwhint">리그별로 따로 받아요</p><table class="rwt">${head}<tbody>${body}</tbody></table>`;
  }
  // 모델 -> 팝업 html. claimable = 지급 가능한 pending(이미 지급한 시즌 제외), done = 받기 완료 상태
  function html(m, o) {
    o = o || {};
    const claim = o.claim || [], done = !!o.done, got = Number.isInteger(o.got) ? o.got : null, t = m.tbl, me = (g("myName") ? g("myName")() : "") || "";
    const sid = m.last ? m.last.season : claim.length ? claim[claim.length - 1].season : (m.pending[0] && m.pending[0].season) || m.cur - 1;
    const multi = new Set(claim.map((p) => p.season)).size > 1;
    const plan = claim.reduce((a, p) => a + p.total, 0), sum = done && got !== null ? got : plan; // 받은 뒤에는 실제 지급액
    const errp = o.err ? `<p class="rwhint" role="alert">${E(o.err)}</p>` : "";
    const full = !done || got === plan; // 받은 뒤 지급액이 계획과 다르면(0 포함) 줄별 내역은 숨긴다
    const lines = full ? `<ul class="rows">${claim.map((p) => `<li><span class="nm">${multi ? `시즌 ${p.season} · ` : ""}${LG[p.league]} <b>${p.rank}위</b></span><span class="sc">${coin(p.total)}</span></li>`).join("")}</ul>` : "";
    const none0 = done && got === 0;
    const mine = claim.length
      ? `<div class="rwme" aria-live="polite"><small>${done ? (none0 ? "이미 받았어요" : "받았어요!") : "내 보상"}</small>${none0 ? "" : `<b class="rwamt">${coin(sum)}</b>`}${lines}</div>${errp}`
      : `<div class="rwme none"><b>이번엔 보상이 없어요</b>${leagueK(m, t)}<p>다음 주엔 꼭 받아 가요!</p></div>`;
    const lgs = m.last ? ORDER.filter((k) => m.last.leagues[k] && m.last.leagues[k].top.length) : [];
    const tops = lgs.length ? `<h3>${seasonLabelShort(sid)} 1~3위</h3>${lgs.map((k) => `<div class="rwlg"><small>${LG[k]}</small><ul class="rows">${m.last.leagues[k].top.map((x) => `<li${me && x.name.toLowerCase() === me.toLowerCase() ? ' class="me"' : ""}><span class="no">${medal[x.rank - 1] || x.rank}</span><span class="nm">${E(x.name)}${x.hero ? `<small class="rs">${E(x.hero)}</small>` : ""}</span><span class="sc">${coin(x.total)}</span></li>`).join("")}</ul></div>`).join("")}` : "";
    const table = tableHtml(m);
    const go = `<p class="rwgo">다음 주엔 내가 1위! ${coin(totalOf(1, 10, t))}을 노려 봐요</p>`;
    const btn = claim.length && !done ? "받기" : "확인";
    return `<div class="rkw rwp" role="dialog" aria-modal="true" aria-labelledby="rwT"><div class="rkl rwb" id="rwB"><h2 id="rwT">지난 주 랭킹 보상</h2><small class="rwsub">${seasonLabel(sid)}</small>${mine}${tops}${table}${go}</div><div class="stk"><button class="wide btn-primary" id="rwOk" type="button">${btn}</button></div></div>`;
  }
  const seasonLabelShort = (id) => `시즌 ${id}`;
  const leagueK = (m, t) => { // 리그 이름+순위를 한 덩어리(nowrap)로 묶어 줄바꿈 중간에서 끊기지 않게
    const p = ORDER.filter((k) => m.last && m.last.leagues[k] && m.last.leagues[k].k).map((k) => `<span class="rwn">${LG[k]} <b>${m.last.leagues[k].k}위</b></span>`);
    return `<p>${p.length ? `${p.join(" · ")}까지 받아요` : `상위 ${t.ratio}%까지 받아요`}</p>`;
  };
  // 랭킹 모달 안내 칩 html (ui.js showRanks 가 호출)
  const chip = () => `<div class="rwchip">주간 보상 · 1위 ${coin(totalOf(1, 10, tbl))} · 상위 ${tbl.ratio}%까지</div>`;

  // ---------- 팝업 열기/닫기 ----------
  // opts: {claim: 지급 대상 pending 배열, onClaim(): 지급+ack 수행 후 지급액(정수) 반환, onClose()}
  function open(m, opts) {
    const modal = g("modal"), closeModal = g("closeModal"), $ = g("$");
    if (typeof modal !== "function" || isShowing()) return false;
    showing = true;
    const me = { key: null }; inst = me;
    let claim = opts.claim || [], done = false, taken = false, granted = 0, doneAt = 0, err = "";
    const prevFocus = typeof document !== "undefined" ? document.activeElement : null;
    const paint = () => {
      modal(html(m, { claim, done, got: done ? granted : null, err }));
      const b = $("rwOk");
      if (b) { b.onclick = press; try { b.focus({ preventScroll: true }); } catch { /* 스텁 */ } }
    };
    const close = () => {
      if (inst !== me) return; reset();
      closeModal();
      try { if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true }); } catch { /* 스텁 */ }
      if (opts.onClose) opts.onClose(done || !claim.length);
    };
    const press = () => {
      if (done && Date.now() - doneAt < 800) return; // 받기 연타가 곧바로 [확인]을 눌러 결과 화면을 건너뛰지 않게
      if (!claim.length || done) { close(); return; }
      if (taken) return; taken = true; // 연타·더블탭: 1회만
      const b = $("rwOk"); if (b) b.disabled = true;
      let r = 0;
      try { r = opts.onClaim ? opts.onClaim(claim) : 0; } catch { r = -1; }
      if (r < 0) { taken = false; err = "저장 공간이 부족해서 받지 못했어요. 잠시 뒤 다시 눌러 주세요"; paint(); return; } // 지급·기록 저장 실패: ack 안 나감, 다시 시도 가능
      granted = r | 0; done = true; doneAt = Date.now();
      const sfx = g("sfx"); if (sfx) sfx("ticket");
      paint();
    };
    const key = (e) => { // ESC = 닫기(받기 전이면 받지 않고 닫아 다음에 다시 뜬다), Tab 은 팝업 안에 가둔다
      if (inst !== me) return;
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "Tab") { e.preventDefault(); const b = $("rwOk"); if (b && b.focus) b.focus(); }
    };
    me.key = key;
    try { document.addEventListener("keydown", key, true); } catch { /* 스텁 */ }
    paint();
    return { close, press, state: () => ({ done, taken, granted }) };
  }

  // ---------- 서버 ----------
  async function fetchRewards() {
    const api = g("api"); if (typeof api !== "function") return null;
    try { const r = await api("rewards"); return r && r.st === 200 ? clean(r.d) : null; } catch { return null; } // 404/bad_action/오프라인 = 조용히 무시
  }
  async function ack(seasons) {
    const api = g("api"); if (typeof api !== "function" || !seasons.length) return false;
    try { // 서버 한도 20개씩 나눠 보냄
      for (let i = 0; i < seasons.length; i += ACK_MAX) { const r = await api("rewardAck", { seasons: seasons.slice(i, i + ACK_MAX) }); if (!(r && r.st === 200 && r.d && r.d.ok)) return false; }
      return true;
    } catch { return false; }
  }

  // ---------- 진입 ----------
  const demoModel = (v) => {
    const sid = 2, T = { ...TBL };
    const top = (names, k) => names.map((n, i) => ({ rank: i + 1, name: n[0], hero: n[1] || "", total: totalOf(i + 1, k, T) }));
    const luck = { n: 34, k: 11, top: top([["말랑이"], ["구름빵"], ["하늘별"]], 11) };
    const mine = { n: 12, k: 10, top: top([["고양이왕", "냥냥이"], ["별사탕", "곰돌이"], ["도토리", "토끼"]], 10) };
    const long = { n: 12, k: 10, top: top([["아주아주길고긴닉네임입니다람쥐", "아주긴영웅이름이에요"], ["별사탕"], ["도토리"]], 10) };
    if (v === "2") return { m: { cur: 3, last: { season: sid, leagues: { luck, mine } }, pending: [], tbl: T }, claim: [] };
    if (v === "3") return { m: { cur: 3, last: { season: sid, leagues: { luck: long } }, pending: [], tbl: T }, claim: [{ season: sid, league: "luck", rank: 1, total: totalOf(1, 10, T) }] };
    const p = [{ season: sid, league: "luck", rank: 1, total: totalOf(1, 11, T) }, { season: sid, league: "mine", rank: 3, total: totalOf(3, 10, T) }];
    return { m: { cur: 3, last: { season: sid, leagues: { luck, mine } }, pending: p, tbl: T }, claim: p };
  };
  function demoParam() { try { const v = new URLSearchParams(root.location && root.location.search || "").get("rwdemo"); return v ? String(v).slice(0, 1) : null; } catch { return null; } }

  // 홈에 들어온 뒤 호출. 반환: Promise<string> (테스트·로그용 사유)
  async function boot() {
    const C = g("CONFIG") || {};
    const dv = demoParam();
    if (dv) { // 눈으로 확인하는 용도: 가짜 데이터, 코인 지급·서버 호출 없음
      if (isShowing() || demoDone) return "busy";
      demoDone = true; // 한 번만(홈으로 돌아올 때마다 다시 뜨지 않게)
      const d = demoModel(dv), q = g("queueModal");
      const go = () => open(d.m, { claim: d.claim, onClaim: (c) => c.reduce((a, p) => a + p.total, 0) });
      if (typeof q === "function") q(go); else go();
      return "demo";
    }
    if (C.REWARDS_ENABLED === false) return "off";
    if (busy || isShowing()) return "busy";
    const lsGet = g("lsGet"), lsSet = g("lsSet"), remote = g("remote"), name = g("myName");
    if (!remote || !remote() || !name || !name() || lsGet(g("NAME_OK"), "") !== "1") return "nonick";
    if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
    const cs = g("phaseNow") ? g("phaseNow")().season : null;
    if (cs && +lsGet(CALL_KEY, "0") === cs.id) return "done";
    if (failAt && Date.now() - failAt < FAIL_MS) return "unsupported"; // 서버 미지원·오류 직후엔 이번 실행에서 잠시 재호출 안 함
    if (cs && Date.now() - (+lsGet(GRACE_KEY, "0") || 0) < GRACE_MS && +lsGet(GRACE_KEY + "s", "0") === cs.id) return "grace"; // 정산 전(유예) 응답을 받은 직후: 최소 5분 간격
    const MHc = g("MyHero");
    if (!MHc || typeof MHc.grantReward !== "function" || typeof MHc.rewarded !== "function") return "nomh";
    busy = true;
    try {
      const m = await fetchRewards();
      if (!m) { failAt = Date.now(); return "unsupported"; }
      failAt = 0;
      tbl = m.tbl;
      const MH = g("MyHero"), paid = new Set(MH ? MH.rewarded() : []);
      const claim = m.pending.filter((p) => !paid.has(p.season)), stale = m.pending.filter((p) => paid.has(p.season));
      let ackOk = true;
      if (stale.length) ackOk = await ack([...new Set(stale.map((p) => p.season))]); // 이미 지급한 시즌: 재지급 없이 ack 만 재시도
      const seen = +lsGet(SEEN_KEY, "0");
      const needShow = claim.length > 0 || (m.last && m.last.season !== seen);
      const pre = m.cur >= 3 && (!m.last || m.last.season < m.cur - 1); // 시즌 종료 후 10분 유예: 서버가 아직 정산 전이라 직전 시즌(cur-1)이 last 에 없다(첫 경계는 last:null, 이후엔 2주 전 시즌) -> 호출 완료로 치지 않고 5분 뒤 홈 진입에 다시 확인
      const done = () => { if (m.cur && ackOk && !pre) lsSet(CALL_KEY, String(m.cur)); };
      if (pre) { lsSet(GRACE_KEY, String(Date.now())); lsSet(GRACE_KEY + "s", String(m.cur)); if (!needShow) return "grace"; } // 못 받은 보상이 있으면 유예 중에도 보여 준다
      if (!needShow) { done(); return "nothing"; }
      const g2 = g("TITLE_ON");
      if (g2 === false) return "ingame"; // 그 사이 판이 시작됨: 다음 홈 진입에서
      const q = g("queueModal");
      const go = () => {
        if (g("TITLE_ON") === false) return; // 큐에서 늦게 꺼내졌는데 이미 판이 시작됨: 열지 않음(받지 않은 보상은 다음 홈 진입에 다시 뜬다)
        open(m, {
        claim,
        onClaim: (c) => {
          const r = MH.grantReward(bySeason(c)); // 코인 + rw 기록 한 번의 save
          if (r.saved === false) return -1; // 저장 실패(localStorage 불가): ack 하지 않음
          if (m.last) lsSet(SEEN_KEY, String(m.last.season)); // 받은 뒤 확인 전에 앱을 닫아도 '보상 없어요' 팝업이 뜨지 않게
          ack([...new Set(c.map((p) => p.season))]).then((ok) => { if (ok) done(); });
          return r.granted;
        },
        onClose: (ok) => { if (ok && m.last) lsSet(SEEN_KEY, String(m.last.season)); if (ok && !claim.length) done(); },
        });
      };
      go.rw = true; // startRun 이 대기 중인 보상 팝업만 큐에서 걸러내는 표식
      if (typeof q === "function") q(go); else go();
      return "shown";
    } catch { return "error"; } finally { busy = false; }
  }

  root.Rewards = { boot, chip, reset, _t: { tableCols, tableRows, baseOf, totalOf, clean, cleanTbl, html, bySeason, demoModel, open, fetchRewards, ack, TBL, LG } };
})(window);
