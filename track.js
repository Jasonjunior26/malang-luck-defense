// 이용 행동 기록(이벤트 수집) 클라이언트. 설계: docs/행동지표_설계.md. window.Track 하나만 노출하고 최상위 선언은 없다(전역 이름 충돌 방지).
// CONFIG.ANALYTICS 가 true 가 아니면 모든 메서드가 아무것도 안 한다(리스너·타이머·네트워크 없음). 옵트아웃(localStorage malang-ev-off=1)이면 이벤트를 만들지 않는다.
// 보내는 것: 화면 이름·버튼 이름·판 시작/종료 요약·세션 누적 시간뿐. 닉네임·입력 텍스트·영웅 이름·UA 원문은 보내지 않는다.
// 모든 전송은 응답을 기다리지 않고, 실패하면 조용히 버린다(재시도 없음. hd 는 누적값이라 다음 전송에 최신값이 실린다).
(function () {
  const SES = "malang-ses", OFF = "malang-ev-off", SKIP = "malang-ev-skip";
  const IDLE_MS = 30 * 60 * 1000, SKIP_MS = 24 * 3600 * 1000, QMAX = 100, FLUSH_N = 20, IDLE_FLUSH = 90 * 1000, RE_DELAY = 200, ACT_CAP = 30000, SAVE_GAP = 10000;
  const TAPMAP = { start: "start_rand", startMine: "start_mine", myhero: "myhero_btn", rank2: "rank_btn", seasons: "seasons_btn", menuBtn: "menu", rank: "m_rank", prob: "m_prob", snd: "m_snd", save: "m_save", home: "m_home", spd: "spd" };
  const OPS = { draw: "dr", merge: "mg", sell: "sl", up: "up", rng: "rg", ticket: "tk", lock: "lk", auto: "au" };
  const cfg = () => window.CONFIG || {};
  const lsG = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsS = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const enabled = () => cfg().ANALYTICS === true && !!cfg().SUPABASE_URL;
  const optOn = () => lsG(OFF) !== "1";
  const on = () => H.ready && enabled() && optOn();
  const now = () => Date.now();
  const H = { ready: false, host: {}, ses: null, q: [], vis: 0, play: 0, act: 0, last: 0, lastPlay: false, lastIn: 0, lastSave: 0, lastScr: "none",
    flushT: null, stopped: false, run: null, runVisMs: 0, stats: { sent: 0, fail: 0 } };

  function newSid() { let s = ""; const c = "abcdefghijklmnopqrstuvwxyz0123456789"; for (let i = 0; i < 12; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }
  function env() {
    const ua = (navigator.userAgent || ""), w = window.innerWidth || 0;
    const pf = /iPhone|iPad|iPod/.test(ua) ? "ios" : /Android/.test(ua) ? "android" : /Windows|Macintosh|Linux|X11|CrOS/.test(ua) ? "desktop" : "other";
    let sa = 0; try { sa = navigator.standalone || (window.matchMedia && matchMedia("(display-mode: standalone)").matches) ? 1 : 0; } catch {}
    return { pf, sa, vw: w < 360 ? "s" : w < 430 ? "m" : "l", new: H.ses && H.ses.n === 1 ? 1 : 0 };
  }
  function save(closed) {
    const s = H.ses; if (!s) return;
    lsS(SES, JSON.stringify({ sid: s.sid, t0: s.t0, n: s.n, last: now(), vis: Math.floor(H.vis / 1000), play: Math.floor(H.play / 1000), act: Math.floor(H.act / 1000), lastScr: H.lastScr, closed: closed ? 1 : 0 }));
    H.lastSave = now();
  }
  // 상태가 바뀔 때만 시간차를 더한다(setInterval 없음). 직전에 잰 상태(보임·게임 중)로 구간을 정산한 뒤 현재 상태를 다시 잰다.
  function acc(wasVisible) { // wasVisible: 숨김 전환 직후(visibilitychange 시점엔 이미 hidden)에는 직전 구간을 보이던 시간으로 정산
    const t = now(), dt = Math.max(0, Math.min(t - (H.last || t), IDLE_MS));
    if (wasVisible === true || !document.hidden) { H.vis += dt; if (H.lastPlay) H.play += dt; if (H.run) H.runVisMs += dt; }
    H.last = t;
    try { H.lastPlay = !document.hidden && !!(H.host.playing && H.host.playing()); } catch { H.lastPlay = false; }
  }
  function startSession(prev, src) {
    const t = now();
    H.ses = { sid: newSid(), t0: t, n: (prev && prev.n ? prev.n : 0) + 1 };
    H.vis = H.play = H.act = 0; H.last = t; H.lastScr = "none";
    push({ e: "ss", src });
  }
  function push(ev) {
    if (!on() || H.stopped) return;
    ev.t = Math.max(0, now() - H.ses.t0);
    H.q.push(ev); if (H.q.length > QMAX) H.q.shift();
    if (H.q.length >= FLUSH_N) flush(false); else arm();
  }
  function arm() { if (H.flushT) clearTimeout(H.flushT); H.flushT = setTimeout(() => { H.flushT = null; flush(false); }, IDLE_FLUSH); }
  function snapshot(rec) { return { e: "hd", vis: Math.floor(H.vis / 1000), play: Math.floor(H.play / 1000), act: Math.floor(H.act / 1000), last: H.lastScr, rec: rec ? 1 : 0 }; }

  // 전송: events 를 30개·약 4KB 이하로 나눠 보낸다. beacon=true 면 sendBeacon(없거나 거절되면 fetch keepalive).
  function post(sid, events, beacon, t0Env) {
    const url = cfg().SUPABASE_URL + "/functions/v1/submit-score";
    let rest = events.slice();
    while (rest.length) {
      let n = Math.min(30, rest.length), body;
      for (;;) { body = JSON.stringify({ action: "ev", device_id: H.host.deviceId(), sid, ver: H.host.ver, env: t0Env || env(), ev: rest.slice(0, n) }); if (body.length <= 3900 || n <= 1) break; n = Math.ceil(n / 2); }
      rest = rest.slice(n); H.stats.sent++;
      try {
        if (beacon && navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: "text/plain" }))) continue;
        fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8" }, body, keepalive: body.length < 60000 })
          .then((r) => { if (r.status === 429) { H.stopped = true; return null; } return r.ok ? r.json() : null; })
          .then((d) => { if (d && d.keep === 0) { lsS(SKIP, String(now())); H.stopped = true; } })
          .catch(() => { H.stats.fail++; });
      } catch { H.stats.fail++; }
    }
  }
  function flush(beacon) {
    if (H.flushT) { clearTimeout(H.flushT); H.flushT = null; }
    if (!on() || H.stopped || !H.q.length || !H.ses) return;
    const ev = H.q; H.q = [];
    try { post(H.ses.sid, ev, beacon); } catch {}
  }
  function hide() {
    if (!on() || !H.ses) return;
    acc(true); push(snapshot(false)); save(true); flush(true);
  }
  function show() {
    if (!on()) return;
    const t = now(), idle = t - (Number((JSON.parse(lsG(SES) || "{}") || {}).last) || t);
    H.last = t;
    if (idle > IDLE_MS) { // 30분 넘게 숨어 있었으면 새 세션. 그 사이 진행 중이던 판은 bg 로 종료 처리
      if (H.run) { const o = H.ses; try { post(o.sid, [Object.assign(runEnd("bg"), { t: Math.max(0, t - o.t0) })], false); } catch {} }
      startSession(H.ses, "resume");
    } else save(false);
    acc();
  }
  function runEnd(ex, res) {
    const r = H.run; H.run = null;
    const o = { e: "re", lg: r ? r.lg : "rand", r: 0, w: 0, sc: 0, dur: Math.floor(H.runVisMs / 1000), ex };
    try {
      const S = H.host.state && H.host.state(), inputs = (res && res.inputs) || (S && S.inputs) || [], n = { sp: r ? r.spd : 0 };
      for (const i of inputs) { const k = OPS[i && i[1]]; if (k) n[k] = (n[k] || 0) + 1; }
      o.n = n;
      if (res && res.round != null) { o.r = res.round | 0; o.w = res.win ? 1 : 0; o.sc = res.score | 0; }
      else if (S) { o.r = (S.round | 0); o.sc = S.score ? S.score() | 0 : 0; }
    } catch {}
    o.r = Math.max(0, Math.min(200, o.r)); o.sc = Math.max(0, Math.min(1000000, o.sc)); H.runVisMs = 0;
    return o;
  }

  const T = {
    // host: {deviceId(), ver, playing(), state()} — ui.js 가 한 번 넘긴다.
    init(host) {
      try {
        if (!enabled() || H.ready) return;
        const skipAt = Number(lsG(SKIP) || 0); if (skipAt && now() - skipAt < SKIP_MS) return; // 서버가 샘플링 제외/솔트 없음으로 응답한 기기: 하루 쉬었다가 다시 확인
        if (host) H.host = host; if (!H.host.deviceId || !optOn()) return; H.ready = true; // 옵트아웃이면 준비하지 않는다(setOpt(true) 때 다시 init)
        let prev = null; try { prev = JSON.parse(lsG(SES) || "null"); } catch {}
        if (prev && prev.sid && !prev.closed && prev.vis > 0) { // 강제 종료로 마지막 구간이 빠진 세션: 저장된 누적값을 한 번 보낸다
          try { post(prev.sid, [{ e: "hd", t: Math.max(0, (prev.last || 0) - (prev.t0 || 0)), vis: prev.vis | 0, play: prev.play | 0, act: prev.act | 0, last: prev.lastScr || "none", rec: 1 }], false); } catch {}
        }
        if (prev && prev.sid && prev.closed && now() - (prev.last || 0) <= IDLE_MS) { // 30분 안에 다시 열면 같은 세션 이어가기
          H.ses = { sid: prev.sid, t0: prev.t0, n: prev.n || 1 }; H.vis = (prev.vis | 0) * 1000; H.play = (prev.play | 0) * 1000; H.act = (prev.act | 0) * 1000; H.last = now(); H.lastScr = prev.lastScr || "none";
          push({ e: "ss", src: "resume" });
        } else startSession(prev, "launch");
        acc(); save(false);
        document.addEventListener("visibilitychange", () => { try { document.hidden ? hide() : show(); } catch {} });
        window.addEventListener("pagehide", () => { try { hide(); } catch {} });
        document.addEventListener("pointerdown", () => { try {
          if (!on()) return; const t = now();
          if (H.lastIn) H.act += Math.min(t - H.lastIn, ACT_CAP); H.lastIn = t;
          if (t - H.lastSave >= SAVE_GAP) { acc(); save(false); }
        } catch {} }, { capture: true, passive: true });
      } catch {}
    },
    scr(s, lg) { try { if (!on()) return; acc(); H.lastScr = s; const e = { e: "scr", s }; if (lg) e.lg = lg; push(e); } catch {} },
    tap(b) { try { if (!on()) return; acc(); if (b === "spd" && H.run) H.run.spd++; push({ e: "tap", b }); } catch {} },
    rs(lg, hero) { try { if (!on()) return; if (H.run) push(runEnd("home")); acc(); H.run = { lg, spd: 0 }; H.runVisMs = 0; const e = { e: "rs", lg }; if (hero) e.h = String(hero).toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 16); push(e); } catch {} },
    re(res) { try { if (!on() || !H.run) return; acc(); push(runEnd("end", res)); setTimeout(() => { try { flush(false); } catch {} }, RE_DELAY); } catch {} },
    home() { try { if (!on() || !H.run) return; acc(); push(runEnd("home")); } catch {} }, // 진행 중이던 판을 버리고 홈으로(판 종료 이벤트만)
    // 버튼 클릭 위임(id -> enum). 개별 뽑기·합성·판매는 보내지 않는다(판당 횟수만 re.n 에).
    click(e) {
      try {
        if (!on()) return; const b = e.target && e.target.closest && e.target.closest("button"); if (!b || !b.id) return;
        const k = TAPMAP[b.id]; if (k) T.tap(k);
      } catch {}
    },
    optOn, setOpt(v) { lsS(OFF, v ? "0" : "1"); if (!v) { H.q = []; if (H.flushT) { clearTimeout(H.flushT); H.flushT = null; } } else if (!H.ready) T.init(H.host); },
    flush: () => flush(false),
    _dbg: H,
  };
  window.Track = T;
})();
