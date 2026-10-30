// 프라이빗 시즌 클라이언트 (docs/소셜_기획안.md §2 ①③⑤ §3 §4 §5). ui.js 뒤에 로드한다 ($, esc, modal, api, nf, lsGet/lsSet, startRun 등 ui.js 전역을 호출 시점에 사용).
// 순수 로직(초대 링크·rules 조립/검증·오류 문구·참가 미리보기)은 SEASONS._t 로 내보내 tools/test_seasons_ui.mjs 가 DOM 없이 점검한다.
(function (root) {
  const CODE_RE = /^[A-Za-z0-9]{8}$/, JOIN_KEY = "malang-join";
  const LIM = { MAX_DAYS: 60, DEF_PLAYERS: 10, MAX_PLAYERS: 30, DAILY: [3, 5, 10, null] };
  const g = (n) => { try { return root[n] !== undefined ? root[n] : (0, eval)(n); } catch { return undefined; } }; // ui.js/data.js 의 top-level const/function 도 읽는다

  // ---------- 순수 로직 ----------
  const inviteUrl = (loc, code) => loc.origin + loc.pathname + "?join=" + code;
  function parseJoin(search) { // "?join=ABCD2345" -> "ABCD2345" | null
    try { const c = new URLSearchParams(search || "").get("join"); return c && CODE_RE.test(c.trim()) ? c.trim().toUpperCase() : null; } catch { return null; }
  }
  const r1 = (v) => Math.round(v * 10) / 10;
  // 모디파이어 편집 정의: t=num(스텝퍼) / bool / noGrade / clans / hero
  const MODS = [
    { k: "hpMul", n: "체력", t: "num", min: 0.7, max: 2.5, st: 0.1, def: 1.5, f: (v) => "×" + v },
    { k: "mobSpeed", n: "속도", t: "num", min: 0.8, max: 1.5, st: 0.1, def: 1.2, f: (v) => "×" + v },
    { k: "mobCount", n: "몹 수", t: "num", min: 0.8, max: 1.6, st: 0.1, def: 1.2, f: (v) => "×" + v },
    { k: "bossTime", n: "보스 시간", t: "num", min: -10, max: 15, st: 1, def: -5, f: (v) => (v > 0 ? "+" : "") + v + "초" },
    { k: "noGrade", n: "하위 등급 제외", t: "num", min: 1, max: 2, st: 1, def: 1, f: (v) => (v === 1 ? "커먼" : "커먼·노멀") },
    { k: "gradeCap", n: "합성 상한", t: "num", min: 4, max: 6, st: 1, def: 5, f: (v) => v + "등급" },
    { k: "drawLimit", n: "뽑기 횟수", t: "num", min: 60, max: 300, st: 10, def: 150, f: (v) => v + "회" },
    { k: "noSell", n: "판매 금지", t: "bool" },
    { k: "clanBan", n: "무리 제외", t: "clans" },
    { k: "heroPool", n: "히어로 고정", t: "hero" },
    { k: "startMin", n: "시작 미네랄", t: "num", min: 0, max: 200, st: 10, def: 0, f: (v) => v },
    { k: "killReward", n: "처치 보상", t: "num", min: 0.5, max: 2, st: 0.1, def: 1.5, f: (v) => "×" + v },
    { k: "drawCost", n: "뽑기 비용", t: "num", min: 10, max: 25, st: 1, def: 20, f: (v) => v },
    { k: "luckyWeek", n: "상위 확률 ×2", t: "bool" },
  ];
  const MOD = Object.fromEntries(MODS.map((m) => [m.k, m]));
  const ROUND_OPTS = [[50, "50"], [70, "70"], [100, "100"], [200, "엔드리스"]];
  const PRESETS = [
    { n: "맨몸 서바이벌", r: { noGrade: 1, startMin: 0, noSell: true } },
    { n: "하드코어", r: { hpMul: 1.8, mobSpeed: 1.2, bossTime: -5 } },
    { n: "운빨 파티", r: { luckyWeek: true, drawCost: 20, killReward: 1.5 } },
    { n: "마라톤", r: { rounds: 100, hpMul: 0.9 } },
    { n: "한 우물", r: { clanBan: [1, 2], heroPool: ["buung"] } },
    { n: "엔드리스", r: { rounds: 200 } },
  ];
  function ruleChips(rules) { // 규칙 -> 짧은 칩 문구 배열
    const R = rules || {}, out = [], hs = g("HEROES") || [], cl = g("CLANS") || [];
    if (R.rounds === 200) out.push("엔드리스"); else if (R.rounds && R.rounds !== 50) out.push(R.rounds + "라운드");
    for (const m of MODS) {
      const v = R[m.k]; if (v === undefined || v === false) continue;
      if (m.t === "num") out.push(m.k === "noGrade" ? m.f(v) + " 제외" : m.k === "startMin" ? "시작 💎" + v : m.k === "drawCost" ? "뽑기 " + v : m.n + " " + m.f(v));
      else if (m.t === "bool") out.push(m.n);
      else if (m.t === "clans") out.push((v || []).map((c) => (cl[c] ? cl[c].name : c)).join("·") + " 제외");
      else if (m.t === "hero") { const h = hs.find((x) => x.id === v[0]); out.push(v.length === 1 ? (h ? h.name : v[0]) + " 고정" : "히어로 " + v.length + "종"); }
    }
    return out;
  }
  const RULE_ERR = { "모디파이어는 최대 3개": "모디파이어는 최대 3개예요" };
  function checkRules(rules) { // data.js validateRules 결과를 짧은 사유로
    const vf = g("validateRules"); if (!vf) return { ok: false, err: "규칙 검증을 쓸 수 없어요" };
    const r = vf(rules); if (r.ok) return r;
    const m = /^범위 오류: (\w+)$/.exec(r.err || "");
    return { ok: false, err: RULE_ERR[r.err] || (m ? (MOD[m[1]] ? MOD[m[1]].n : m[1]) + " 값이 범위 밖이에요" : "규칙이 올바르지 않아요") };
  }
  // 마법사 상태 -> rules (rounds 50 은 생략)
  function buildRules(W) {
    const R = {}; for (const k of Object.keys(W.mods || {})) R[k] = W.mods[k];
    if (W.rounds && W.rounds !== 50) R.rounds = W.rounds;
    return R;
  }
  const modCount = (W) => Object.keys(W.mods || {}).length;
  function presetState(p) { const r = { ...p.r }, rounds = r.rounds || 50; delete r.rounds; return { mods: r, rounds }; }
  const stepVal = (m, v, d) => Math.max(m.min, Math.min(m.max, r1(v + d * m.st)));

  function validateCreate(F, today) { // F: {name,start,end,max,daily,rules} -> {ok,body}|{ok:false,err}
    const cn = g("checkName"), c = cn ? cn(F.name) : { ok: true, name: String(F.name || "").trim() };
    if (!c.ok) return { ok: false, err: { len: "이름은 2~20자예요", chars: "이름에 쓸 수 없는 글자가 있어요", bad: "쓸 수 없는 이름이에요" }[c.err] || "이름을 확인해 주세요" };
    if (c.name.length < 2 || c.name.length > 20) return { ok: false, err: "이름은 2~20자예요" };
    const D = /^\d{4}-\d{2}-\d{2}$/;
    if (!D.test(F.start || "") || !D.test(F.end || "")) return { ok: false, err: "날짜를 골라 주세요" };
    if (F.start < today) return { ok: false, err: "시작일이 지났어요" };
    if (F.end < F.start) return { ok: false, err: "종료일이 시작일보다 빨라요" };
    if (days(F.start, F.end) > LIM.MAX_DAYS) return { ok: false, err: "기간은 최대 60일이에요" };
    if (!Number.isInteger(F.max) || F.max < 2 || F.max > LIM.MAX_PLAYERS) return { ok: false, err: "인원은 2~30명이에요" };
    if (!LIM.DAILY.includes(F.daily)) return { ok: false, err: "하루 판수를 확인해 주세요" };
    const v = checkRules(F.rules); if (!v.ok) return v;
    return { ok: true, body: { name: c.name, start: F.start, end: F.end, rules: v.rules, maxPlayers: F.max, dailyRunLimit: F.daily } };
  }
  function days(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5) + 1; } // 양 끝 포함
  function addDays(d, n) { return new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10); }
  function phase(s, today) { // before / live / after / cancelled
    if (!s) return "after";
    if (s.status === "cancelled") return "cancelled";
    if (s.ended || today > s.end) return "after";
    return today < s.start ? "before" : "live";
  }
  const ERR = {
    login_required: "로그인이 필요해요", no_such_season: "시즌을 찾을 수 없어요", season_cancelled: "취소된 시즌이에요", season_closed: "이미 끝난 시즌이에요",
    season_not_started: "아직 시작 전이에요", kicked: "참가할 수 없는 시즌이에요", season_full: "자리가 다 찼어요", not_owner: "호스트만 할 수 있어요", not_member: "참가한 시즌이 아니에요",
    host_limit: "내가 연 시즌은 동시에 2개까지예요", join_limit: "참가 중인 시즌은 3개까지예요", daily_limit: "오늘 판수를 다 썼어요", duplicate_run: "이미 등록된 기록이에요",
    rate_limited: "잠시 후 다시 해 주세요", bad_name_len: "이름은 2~20자예요", bad_name_chars: "이름에 쓸 수 없는 글자가 있어요", bad_name: "쓸 수 없는 이름이에요",
    bad_dates: "날짜를 확인해 주세요", start_in_past: "시작일이 지났어요", too_long: "기간은 최대 60일이에요", bad_max_players: "인원은 2~30명이에요", bad_daily_limit: "하루 판수를 확인해 주세요",
    bad_rules: "규칙이 올바르지 않아요", bad_code: "초대 코드가 올바르지 않아요", bad_id: "시즌 정보가 올바르지 않아요", ver_mismatch: "새 버전이 나왔어요. 새로고침해 주세요",
    score_mismatch: "검증에 실패해서 등록되지 않았어요", replay_failed: "검증에 실패해서 등록되지 않았어요", no_player: "닉네임 연결이 필요해요", already_done: "이미 처리됐어요",
  };
  function errKind(r) { // login / offline / unavailable / error
    if (r.st === 0) return "offline";
    if (r.st === 401) return "login";
    const e = r.d && r.d.error;
    if (r.st === 501 || (r.st === 404 && !e) || e === "bad_action" || (r.st >= 500 && !e)) return "unavailable";
    return "error";
  }
  function errText(r) {
    const k = errKind(r);
    if (k === "offline") return "인터넷 연결을 확인해 주세요";
    if (k === "login") return "로그인이 필요해요";
    if (k === "unavailable") return "시즌 서버가 아직 준비되지 않았어요";
    return ERR[r.d && r.d.error] || "잠시 후 다시 해 주세요";
  }
  // 초대 코드 -> 참가 미리보기 판정. 반환 {kind: login|offline|unavailable|error|notfound|joined|kicked|cancelled|over|full|ok, season?, text?}
  async function joinPreview(code, apiFn) {
    const r = await apiFn("psGet", { code });
    const k = errKind(r);
    if (k !== "error" && r.st !== 200) return { kind: k, text: errText(r) };
    if (r.st !== 200 || !r.d.ok) return r.st === 404 || (r.d && r.d.error === "no_such_season") ? { kind: "notfound", text: ERR.no_such_season } : { kind: "error", text: errText(r) };
    const s = r.d.season, today = r.d.today;
    if (s.kicked) return { kind: "kicked", season: s, text: ERR.kicked };
    if (s.is_member) return { kind: "joined", season: s, today, text: "이미 참가 중이에요" };
    const ph = phase(s, today);
    if (ph === "cancelled") return { kind: "cancelled", season: s, text: ERR.season_cancelled };
    if (ph === "after") return { kind: "over", season: s, today, text: ERR.season_closed };
    if (s.member_count >= s.max_players) return { kind: "full", season: s, today, text: ERR.season_full };
    return { kind: "ok", season: s, today };
  }

  // ---------- 상태 ----------
  let RUN = null; // 진행 중인 시즌 판 {id, name, rules, used, limit}
  let W = null; // 만들기 마법사 상태
  const ui = () => ({ $: g("$"), esc: g("esc"), nf: g("nf"), modal: g("modal"), close: g("closeModal"), api: g("api"), ls: { get: g("lsGet"), set: g("lsSet") } });
  const signed = () => !!(root.AUTH && AUTH.signedIn());
  const kakaoReady = () => !!(root.AUTH && AUTH.enabled());
  const today = (d) => (d && d.today) || (g("kstDate") ? g("kstDate")() : new Date().toISOString().slice(0, 10));
  const md = (d) => d.slice(5).replace("-", "/");
  const chipHtml = (rules) => { const { esc } = ui(), c = ruleChips(rules); return `<div class="pschips">${c.length ? c.map((x) => `<span class="pschip">${esc(x)}</span>`).join("") : '<span class="pschip">기본 규칙</span>'}</div>`; };
  const dailyTxt = (s) => (s.daily_run_limit == null ? "무제한" : s.daily_run_limit + "판");
  const loading = (t) => { ui().modal(`<div class="ps"><h2>시즌</h2><p class="pstxt">${t || "불러오는 중…"}</p></div>`); };
  const shell = (title, body) => ui().modal(`<div class="ps"><h2>${title}</h2>${body}</div>`);
  const wireClose = (id) => { const e = ui().$(id || "psX"); if (e) e.onclick = ui().close; };
  const toast = (t) => { const e = ui().$("psMsg"); if (e) e.textContent = t || ""; };

  // 로그인/서버 상태 안내 한 곳. 반환 true 면 안내를 띄웠음.
  function gate(pendingCode) {
    const { $, modal, close } = ui();
    if (signed()) return false;
    const ready = kakaoReady();
    modal(`<div class="ps"><h2>👥 시즌</h2><p class="pstxt">${pendingCode ? "초대 받은 시즌이 있어요.<br>" : ""}${ready ? "카카오로 로그인하면<br>친구와 시즌을 열 수 있어요" : "카카오 로그인은 준비 중이에요"}</p>${ready ? '<button class="psb" id="psLogin">💛 카카오로 로그인</button>' : ""}<button class="psb g" id="psX">닫기</button></div>`);
    $("psX").onclick = () => { if (pendingCode) ui().ls.set(JOIN_KEY, ""); close(); }; // 닫으면 보관한 초대도 버린다 (로그인으로 가면 유지)
    if (pendingCode && !ready) ui().ls.set(JOIN_KEY, "");
    if ($("psLogin")) $("psLogin").onclick = () => AUTH.login();
    return true;
  }
  function failView(r, retry) { // 서버 호출 실패 화면
    const { $, close } = ui(), k = errKind(r);
    shell("👥 시즌", `<p class="pstxt">${errText(r)}</p>${k === "offline" || k === "error" ? '<button class="psb" id="psRetry">다시 시도</button>' : ""}<button class="psb g" id="psX">닫기</button>`);
    wireClose(); if ($("psRetry")) $("psRetry").onclick = retry;
  }

  // ---------- 목록 ----------
  async function openList() {
    const { $, esc, modal } = ui();
    if (gate(ui().ls.get(JOIN_KEY))) return;
    loading();
    const r = await ui().api("psList");
    if (r.st !== 200 || !r.d.ok) { failView(r, openList); return; }
    const t = today(r.d), L = r.d.seasons || [];
    const grp = { live: [], before: [], after: [] };
    for (const s of L) { const p = phase(s, t); (grp[p === "cancelled" ? "after" : p] || grp.after).push([s, p]); }
    const sec = (title, a) => a.length ? `<div class="psh">${title}</div>` + a.map(([s, p]) => `<button class="psrow" data-id="${s.id}"><span class="psn">${esc(s.name)}${p === "cancelled" ? " (취소)" : ""}</span><span class="psm"><span class="psr" id="psr${s.id}"></span>${s.member_count}/${s.max_players}명</span>${chipHtml(s.rules)}</button>`).join("") : "";
    const body = sec("진행 중", grp.live) + sec("예정", grp.before) + sec("종료", grp.after);
    shell("👥 시즌", `${body || '<p class="pstxt">참가 중인 시즌이 없어요</p>'}<button class="psb" id="psNew">＋ 시즌 만들기</button><button class="psb g" id="psCode">초대 코드로 참가</button><button class="psb g" id="psX">닫기</button>`);
    wireClose(); $("psNew").onclick = () => startWizard();
    $("psCode").onclick = askCode;
    document.querySelectorAll("#box .psrow").forEach((b) => { b.onclick = () => openDetail(b.dataset.id); });
    for (const [s] of grp.live) ui().api("psBoard", { id: s.id }).then((b) => { // 내 순위는 진행 중인 시즌만 (최대 3개)
      const e = $("psr" + s.id), me = b.st === 200 && b.d.rows && b.d.rows.find((x) => x.me); if (e && me) e.textContent = me.rank + "위 · ";
    });
  }
  function askCode() {
    const { $, modal } = ui();
    shell("초대 코드", `<input id="psCodeIn" maxlength="8" placeholder="8자리 코드" autocomplete="off" autocapitalize="characters"><p class="pstxt" id="psMsg"></p><button class="psb" id="psGo">확인</button><button class="psb g" id="psX">뒤로</button>`);
    $("psX").onclick = openList;
    $("psGo").onclick = () => { const c = $("psCodeIn").value.trim().toUpperCase(); if (!CODE_RE.test(c)) { toast(ERR.bad_code); return; } showJoin(c); };
  }

  // ---------- 상세 ----------
  async function openDetail(id, note) {
    const { $, esc, nf, modal } = ui();
    if (gate()) return;
    loading();
    const [gr, br] = await Promise.all([ui().api("psGet", { id }), ui().api("psBoard", { id })]);
    if (gr.st !== 200 || !gr.d.ok) { failView(gr, () => openDetail(id, note)); return; }
    const s = gr.d.season, t = today(gr.d), ph = phase(s, t), rows = br.st === 200 && br.d.rows ? br.d.rows : [], me = rows.find((x) => x.me);
    const left = ph === "live" ? (() => { const n = Math.round((Date.parse(s.end + "T00:00:00Z") - Date.parse(t + "T00:00:00Z")) / 864e5); return n === 0 ? "오늘이 마지막 날" : "종료까지 " + n + "일"; })()
      : ph === "before" ? md(s.start) + " 시작" : ph === "cancelled" ? "취소됨" : "종료";
    const used = s.daily_run_limit == null ? "" : ` · 오늘 ${s.runs_today || 0}/${s.daily_run_limit}판`;
    const li = rows.map((x) => `<li class="${x.me ? "me" : ""}"><span class="no">${x.rank}</span><span class="nm">${esc(x.name)}${x.owner ? " 👑" : ""}</span><span class="sc">${nf(x.score)}</span><small>R${x.round}${x.win ? "🎉" : ""}${heroTag(x.hero)}</small>${buildTag(x.build)}</li>`).join("");
    const limitHit = s.daily_run_limit != null && (s.runs_today || 0) >= s.daily_run_limit;
    const canPlay = ph === "live" && !limitHit && s.is_member;
    const why = ph === "before" ? md(s.start) + " 부터 할 수 있어요" : ph !== "live" ? "끝난 시즌이에요" : limitHit ? ERR.daily_limit : "";
    const host = s.is_owner && (ph === "live" || ph === "before");
    shell(esc(s.name), `${chipHtml(s.rules)}<div class="psinfo"><span>${left}</span><span>${s.member_count}/${s.max_players}명</span><span>하루 ${dailyTxt(s)}${used}</span></div>
      <ul class="rows psbd">${li || "<li>아직 기록이 없어요</li>"}</ul>
      ${me ? `<div class="psme">내 ${me.rank}위 · ${nf(me.score)}점 · R${me.round}</div>` : ""}
      <p class="pstxt" id="psMsg">${esc(note || why)}</p>
      <button class="psb" id="psPlay" ${canPlay ? "" : "disabled"}>▶ 플레이</button>
      ${s.is_owner && s.invite_code && ph !== "after" && ph !== "cancelled" ? '<button class="psb g" id="psInv">🔗 초대</button>' : ""}
      ${host ? `<button class="psb g" id="psCancel">${ph === "before" ? "시즌 취소" : "조기 종료"}</button>` : ""}
      <button class="psb g" id="psX">뒤로</button>`);
    $("psX").onclick = openList;
    if (canPlay) $("psPlay").onclick = () => play(s);
    if ($("psInv")) $("psInv").onclick = () => showInvite(s, () => openDetail(id));
    if ($("psCancel")) $("psCancel").onclick = () => {
      shell(ph === "before" ? "시즌 취소" : "조기 종료", `<p class="pstxt">${esc(s.name)}<br>${ph === "before" ? "취소하면 되돌릴 수 없어요" : "지금 순위로 끝나요"}</p><p class="pstxt" id="psMsg"></p><button class="psb" id="psOk">${ph === "before" ? "취소할래요" : "끝낼래요"}</button><button class="psb g" id="psX">아니요</button>`);
      $("psX").onclick = () => openDetail(id);
      $("psOk").onclick = async () => { $("psOk").disabled = true; const r = await ui().api("psCancel", { id }); if (r.st === 200 && r.d.ok) openList(); else { $("psOk").disabled = false; toast(errText(r)); } };
    };
  }

  // ---------- 초대 ----------
  async function copyText(txt) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(txt); return true; } } catch {}
    try { const a = document.createElement("textarea"); a.value = txt; a.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(a); a.select(); const ok = document.execCommand("copy"); a.remove(); return !!ok; } catch { return false; }
  }
  // 공유 한 곳. 나중에 카카오 SDK(Kakao.Share.sendDefault)를 여기에 끼운다. 반환: "shared" | "copied" | "fail" | "cancel"
  async function shareInvite(season) {
    const url = inviteUrl(root.location, season.invite_code), text = `말랑 디펜스 '${season.name}' 시즌에 초대할게요`;
    if (navigator.share) { try { await navigator.share({ title: "말랑 디펜스", text, url }); return "shared"; } catch (e) { if (e && e.name === "AbortError") return "cancel"; } }
    return (await copyText(url)) ? "copied" : "fail";
  }
  function showInvite(s, back) {
    const { $, esc } = ui(), url = inviteUrl(root.location, s.invite_code);
    shell("🔗 초대", `<p class="pstxt"><b>${esc(s.name)}</b></p><div class="pscode">${s.invite_code}</div><div class="psurl">${esc(url)}</div><p class="pstxt" id="psMsg"></p>
      <button class="psb" id="psCopy">링크 복사</button>${navigator.share ? '<button class="psb" id="psShare">공유</button>' : ""}<button class="psb g" id="psX">${back ? "뒤로" : "닫기"}</button>`);
    $("psX").onclick = back || ui().close;
    $("psCopy").onclick = async () => toast((await copyText(url)) ? "복사했어요" : "복사하지 못했어요");
    if ($("psShare")) $("psShare").onclick = async () => { const r = await shareInvite(s); if (r === "copied") toast("복사했어요"); else if (r === "fail") toast("공유하지 못했어요"); };
  }

  // ---------- 초대 수락 ----------
  async function showJoin(code) {
    const { $, esc } = ui();
    if (gate(code)) return;
    loading();
    const p = await joinPreview(code, ui().api);
    const done = () => { ui().ls.set(JOIN_KEY, ""); };
    if (p.kind === "joined") { done(); openDetail(p.season.id, "이미 참가 중이에요"); return; }
    if (p.kind === "login") { gate(code); return; }
    if (p.kind !== "ok") {
      if (!["offline", "unavailable", "error"].includes(p.kind)) done();
      const extra = p.season && p.kind !== "kicked" ? `<p class="pstxt"><b>${esc(p.season.name)}</b></p>${chipHtml(p.season.rules)}` : "";
      shell("👥 초대", `${extra}<p class="pstxt">${p.text}</p>${p.kind === "offline" || p.kind === "error" ? '<button class="psb" id="psRetry">다시 시도</button>' : ""}<button class="psb g" id="psX">닫기</button>`);
      wireClose(); if ($("psRetry")) $("psRetry").onclick = () => showJoin(code);
      return;
    }
    const s = p.season;
    shell("👥 시즌 초대", `<p class="pstxt"><b>${esc(s.name)}</b></p>${chipHtml(s.rules)}<div class="psinfo"><span>${md(s.start)}~${md(s.end)}</span><span>${s.member_count}/${s.max_players}명</span><span>하루 ${dailyTxt(s)}</span></div><p class="pstxt" id="psMsg"></p>
      <button class="psb" id="psJoin">참가하기</button><button class="psb g" id="psX">나중에</button>`);
    $("psX").onclick = () => { done(); ui().close(); };
    $("psJoin").onclick = () => doJoin(code, s, false);
  }
  async function doJoin(code, s, retried) {
    const { $ } = ui(); $("psJoin").disabled = true;
    const r = await ui().api("psJoin", { code });
    if (r.st === 409 && r.d.error === "no_player" && !retried) { // 계정에 닉네임이 없으면 기기 닉네임을 계정에 연결한 뒤 한 번 더
      const nm = g("myName") && g("myName")();
      if (!nm) { toast("닉네임을 먼저 정해 주세요"); g("showNick")(); return; }
      await ui().api("link"); return doJoin(code, s, true);
    }
    if (r.st === 200 && r.d.ok) { ui().ls.set(JOIN_KEY, ""); openDetail(r.d.season.id, r.d.already ? "이미 참가 중이에요" : "참가했어요"); return; }
    $("psJoin").disabled = false;
    if (r.d && ["season_full", "season_closed", "season_cancelled", "kicked", "no_such_season"].includes(r.d.error)) ui().ls.set(JOIN_KEY, "");
    toast(r.d && r.d.error === "no_player" ? ERR.no_player : errText(r));
  }

  // ---------- 만들기 (4단계) ----------
  function startWizard() {
    const t = today();
    W = { step: 1, preset: -1, mods: {}, rounds: 50, name: "", start: t, end: addDays(t, 13), max: LIM.DEF_PLAYERS, daily: null };
    wizard();
  }
  function wizard() {
    if (W.step === 1) return step1(); if (W.step === 2) return step2(); if (W.step === 3) return step3(); return step4();
  }
  const dots = (n) => `<div class="psdots">${[1, 2, 3, 4].map((i) => `<i class="${i === n ? "on" : ""}"></i>`).join("")}</div>`;
  function step1() {
    const { $, esc } = ui();
    const cards = PRESETS.map((p, i) => `<button class="psrow ${W.preset === i ? "sel" : ""}" data-i="${i}"><span class="psn">${p.n}</span>${chipHtml(p.r)}</button>`).join("") + `<button class="psrow ${W.preset === 99 ? "sel" : ""}" data-i="99"><span class="psn">직접 구성</span></button>`;
    shell("시즌 만들기", `${dots(1)}${cards}<button class="psb g" id="psX">취소</button>`);
    document.querySelectorAll("#box .psrow").forEach((b) => { b.onclick = () => {
      const i = +b.dataset.i; W.preset = i; const st = i === 99 ? { mods: {}, rounds: 50 } : presetState(PRESETS[i]); W.mods = st.mods; W.rounds = st.rounds; W.step = 2; wizard(); }; });
    $("psX").onclick = openList;
  }
  function modEditor(m) {
    const { esc } = ui(), v = W.mods[m.k], hs = g("HEROES") || [], cl = g("CLANS") || [];
    if (m.t === "num") return `<div class="psmod"><span class="psn">${m.n}</span><button class="psst" data-k="${m.k}" data-d="-1" aria-label="줄이기">−</button><b>${m.k === "noGrade" ? m.f(v) : m.f(v)}</b><button class="psst" data-k="${m.k}" data-d="1" aria-label="늘리기">＋</button></div>`;
    if (m.t === "clans") return `<div class="psmod"><span class="psn">${m.n}</span>${cl.map((c) => `<button class="psst cl ${v.includes(c.id) ? "on" : ""}" data-clan="${c.id}">${c.ico}</button>`).join("")}</div>`;
    if (m.t === "hero") return `<div class="psmod"><span class="psn">${m.n}</span><select id="psHero">${hs.map((h) => `<option value="${esc(h.id)}" ${v[0] === h.id ? "selected" : ""}>${esc(h.name)}</option>`).join("")}</select></div>`;
    return "";
  }
  function toggleMod(k) {
    if (k in W.mods) { delete W.mods[k]; return ""; }
    if (modCount(W) >= 3) return "모디파이어는 최대 3개예요";
    const m = MOD[k], hs = g("HEROES") || [];
    W.mods[k] = m.t === "bool" ? true : m.t === "clans" ? [1] : m.t === "hero" ? [hs[0] ? hs[0].id : "buung"] : m.def;
    return "";
  }
  function step2(msg) {
    const { $ } = ui(), R = buildRules(W), v = checkRules(R);
    const chips = MODS.map((m) => `<button class="pstog ${m.k in W.mods ? "on" : ""}" data-k="${m.k}">${m.n}</button>`).join("");
    const eds = MODS.filter((m) => m.k in W.mods && m.t !== "bool").map(modEditor).join("");
    const rd = ROUND_OPTS.map(([n, l]) => `<button class="pstog ${W.rounds === n ? "on" : ""}" data-r="${n}">${l}</button>`).join("");
    shell("시즌 규칙", `${dots(2)}<div class="psh">모디파이어 ${modCount(W)}/3</div><div class="pstogs">${chips}</div>${eds}<div class="psh">라운드</div><div class="pstogs">${rd}</div>${chipHtml(R)}<p class="pstxt psbad" id="psMsg">${msg || (v.ok ? "" : v.err)}</p>
      <button class="psb" id="psNext" ${v.ok ? "" : "disabled"}>다음</button><button class="psb g" id="psX">뒤로</button>`);
    document.querySelectorAll("#box .pstog[data-k]").forEach((b) => { b.onclick = () => step2(toggleMod(b.dataset.k)); });
    document.querySelectorAll("#box .pstog[data-r]").forEach((b) => { b.onclick = () => { W.rounds = +b.dataset.r; step2(); }; });
    document.querySelectorAll("#box .psst[data-k]").forEach((b) => { b.onclick = () => { const m = MOD[b.dataset.k]; W.mods[m.k] = stepVal(m, W.mods[m.k], +b.dataset.d); step2(); }; });
    document.querySelectorAll("#box .psst[data-clan]").forEach((b) => { b.onclick = () => {
      const c = +b.dataset.clan, a = W.mods.clanBan, i = a.indexOf(c);
      if (i >= 0) { if (a.length > 1) a.splice(i, 1); } else if (a.length < 2) a.push(c); else { step2("무리는 최대 2개까지 제외해요"); return; }
      a.sort(); step2(); }; });
    if ($("psHero")) $("psHero").onchange = (e) => { W.mods.heroPool = [e.target.value]; step2(); };
    $("psX").onclick = () => { W.step = 1; wizard(); };
    $("psNext").onclick = () => { W.step = 3; wizard(); };
  }
  function formOf() { return { name: W.name, start: W.start, end: W.end, max: W.max, daily: W.daily, rules: buildRules(W) }; }
  function step3() {
    const { $, esc } = ui(), t = today(), dly = LIM.DAILY.map((d) => `<button class="pstog ${W.daily === d ? "on" : ""}" data-d="${d}">${d == null ? "무제한" : d + "판"}</button>`).join("");
    shell("시즌 정보", `${dots(3)}<input id="psName" maxlength="20" placeholder="시즌 이름 (2~20자)" value="${esc(W.name)}" autocomplete="off">
      <div class="psmod"><span class="psn">시작</span><input type="date" id="psS" min="${t}" value="${W.start}"></div><div class="psmod"><span class="psn">종료</span><input type="date" id="psE" min="${t}" value="${W.end}"></div>
      <div class="psmod"><span class="psn">인원</span><button class="psst" id="psM" aria-label="줄이기">−</button><b id="psMv">${W.max}</b><button class="psst" id="psP" aria-label="늘리기">＋</button></div>
      <div class="psh">하루 판수</div><div class="pstogs">${dly}</div><p class="pstxt psbad" id="psMsg"></p><button class="psb" id="psNext">다음</button><button class="psb g" id="psX">뒤로</button>`);
    const sync = () => { W.name = $("psName").value; W.start = $("psS").value; W.end = $("psE").value; };
    const chk = () => { sync(); const v = validateCreate(formOf(), today()); $("psMsg").textContent = v.ok ? `${days(W.start, W.end)}일간` : v.err; return v; };
    $("psName").oninput = chk; $("psS").onchange = chk; $("psE").onchange = chk;
    $("psM").onclick = () => { sync(); W.max = Math.max(2, W.max - 1); $("psMv").textContent = W.max; chk(); };
    $("psP").onclick = () => { sync(); W.max = Math.min(LIM.MAX_PLAYERS, W.max + 1); $("psMv").textContent = W.max; chk(); };
    document.querySelectorAll("#box .pstog[data-d]").forEach((b) => { b.onclick = () => { sync(); W.daily = b.dataset.d === "null" ? null : +b.dataset.d; step3(); }; });
    $("psX").onclick = () => { sync(); W.step = 2; wizard(); };
    $("psNext").onclick = () => { const v = chk(); if (v.ok) { W.step = 4; wizard(); } };
  }
  function step4() {
    const { $, esc } = ui(), v = validateCreate(formOf(), today());
    if (!v.ok) { W.step = 3; step3(); return; }
    const b = v.body;
    shell("확인", `${dots(4)}<p class="pstxt"><b>${esc(b.name)}</b></p>${chipHtml(b.rules)}<div class="psinfo"><span>${md(b.start)}~${md(b.end)} (${days(b.start, b.end)}일)</span><span>최대 ${b.maxPlayers}명</span><span>하루 ${b.dailyRunLimit == null ? "무제한" : b.dailyRunLimit + "판"}</span></div><p class="pstxt psbad" id="psMsg"></p>
      <button class="psb" id="psMake">만들기</button><button class="psb g" id="psX">뒤로</button>`);
    $("psX").onclick = () => { W.step = 3; wizard(); };
    $("psMake").onclick = () => make(b, false);
  }
  async function make(b, retried) {
    const { $ } = ui(); $("psMake").disabled = true;
    const r = await ui().api("psCreate", b);
    if (r.st === 409 && r.d.error === "no_player" && !retried) {
      const nm = g("myName") && g("myName")();
      if (!nm) { $("psMake").disabled = false; toast("닉네임을 먼저 정해 주세요"); g("showNick")(); return; }
      await ui().api("link"); return make(b, true);
    }
    if (r.st === 200 && r.d.ok) { W = null; showInvite(r.d.season, openList); return; }
    $("psMake").disabled = false; toast(r.d && r.d.error === "bad_rules" && r.d.detail ? "규칙이 올바르지 않아요" : errText(r));
  }

  // ---------- 플레이 / 제출 ----------
  const hideModal = () => { ui().$("modal").classList.remove("on"); (0, eval)("MODAL_ON=false;MODAL_Q=[]"); };
  const randSeed = () => Math.floor(Math.random() * 2147483646) + 1;
  function play(s) {
    ui().ls.set(JOIN_KEY, "");
    RUN = { id: s.id, name: s.name, rules: s.rules || {}, used: s.runs_today || 0, limit: s.daily_run_limit };
    hideModal();
    g("startRun")("daily", randSeed(), RUN.rules);
  }
  function restart() { // 게임오버의 [다시 하기]
    if (!RUN) return;
    if (RUN.limit != null && RUN.used >= RUN.limit) { const id = RUN.id; openDetail(id, ERR.daily_limit); return; }
    hideModal();
    g("GAME").start("daily", randSeed(), RUN.rules); g("uiReset")();
  }
  async function finish(P) { // uiGameOver 가 부름. #rk 에 결과 표시
    const S = g("S"), run = RUN, box = ui().$("rk"); if (!box || !run) return;
    const item = { id: run.id, ver: g("GAME_VER"), seed: S.seed, log: S.inputs, claimedScore: P.score, claimedRound: P.R, win: !!P.win };
    const send = async () => {
      const r = await ui().api("psSubmit", item), b = ui().$("rk"); if (!b || RUN !== run) return;
      if (r.st === 200 && r.d.ok) { run.used++; const o = g("rankResultHtml")({ st: "ok", d: r.d }, P); b.innerHTML = o.html; if (o.cheer) { b.classList.add("cheer"); g("sfx")("reso"); g("vib")([60, 40, 120]); } return; }
      const retry = errKind(r) === "offline" || r.st === 429 && r.d.error === "rate_limited" || (r.st >= 500);
      if (r.d && r.d.error === "daily_limit") run.used = run.limit;
      b.innerHTML = `${errText(r)}${retry ? '<button class="wide mini" id="psRe" ' + g("BTNR") + '>다시 보내기</button>' : ""}`;
      if (retry) ui().$("psRe").onclick = () => { b.textContent = "등록하는 중… ⏳"; send(); };
    };
    send();
  }

  // ---------- 진입점 ----------
  function boot() { // 앱 로드 시 ?join=코드 감지 -> 보관 -> (로그인돼 있으면) 바로 이어서
    const c = parseJoin(root.location.search);
    if (c) {
      ui().ls.set(JOIN_KEY, c);
      try { const u = new URL(root.location.href); u.searchParams.delete("join"); history.replaceState(null, "", u.pathname + u.search + u.hash); } catch {}
    }
    const p = ui().ls.get(JOIN_KEY);
    if (p && CODE_RE.test(p)) showJoin(p);
  }
  root.SEASONS = { open: openList, boot, run: () => RUN, clear: () => { RUN = null; }, restart, finish, shareInvite, openDetail,
    _t: { inviteUrl, parseJoin, buildRules, checkRules, ruleChips, validateCreate, phase, errText, errKind, joinPreview, presetState, toggleMod: (w, k) => { const o = W; W = w; const r = toggleMod(k); W = o; return r; }, stepVal, PRESETS, MODS, days, addDays } };
})(typeof window !== "undefined" ? window : globalThis);
