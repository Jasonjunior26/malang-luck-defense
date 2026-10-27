"use strict";
// UI: DOM 도우미, 효과음, HUD, 모달(확률표/선택권/강화/랭킹/게임오버), 토스트/배너, 버튼 바인딩, 타이틀
// 의존: data.js(GRADES/CLANS/CHARS/HEROES/CONST/헬퍼), graphics.js(drawHero/drawPortrait 등, 없으면 이모지로 대체), game.js(S, GAME.*)
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const lsGet = (k, d = null) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const GCOL = (g) => (g === 7 ? "#ff6ad5" : GRADES[g].color);
const gname = (g) => GRADES[g].name;
const pct = (p) => String(+Number(p).toFixed(3));
const fmt = (n) => (n >= 100000 ? Math.round(n / 1000) + "k" : n >= 10000 ? (n / 1000).toFixed(1) + "k" : String(Math.round(n)));
const gbadge = (g) => `<span class="gb" style="background:${g === 7 ? "linear-gradient(90deg,#ff6ad5,#6ad5ff,#ffe27a)" : GCOL(g)}">${gname(g)}</span>`;

// ---------- 효과음 + BGM (WebAudio 합성, 파일 없음) ----------
// [튜닝 위치] 이 섹션 맨 위의 AUD 상수(볼륨/동시발음/템포), _gap(스로틀 ms), SFX 표(이벤트별 소리), BGM 패턴(BG_*) 을 고치면 됩니다.
// 구조: 발음 -> sfxBus/bgmBus -> master(Gain) -> DynamicsCompressor -> destination
const AUD = { master: 0.9, sfx: 0.9, bgm: 0.55, maxVoices: 14, bpmBase: 0, bpmRoundMax: 24, bpmDangerMax: 14 }; // bpmBase: 곡별 BGM.*.bpm 에 더하는 보정값(기본 0)
let AC = null, MUTED = false, SND_MODE = 0; // SND_MODE: 0=효과음+BGM 1=효과음만 2=끔 (MUTED 는 모드 2 일 때 true)
{ const m = lsGet("malang-snd"); SND_MODE = m === "1" ? 1 : m === "2" ? 2 : m === "0" ? 0 : (lsGet("malang-mute") === "1" ? 2 : 0); MUTED = SND_MODE === 2; }
let MB = null, SB = null, BB = null, _noiseBuf = null, _vo = [];
const N = (m) => 440 * Math.pow(2, (m - 69) / 12);
const PENT = [0, 2, 4, 7, 9], pn = (i) => 60 + PENT[((i % 5) + 5) % 5] + 12 * Math.floor(i / 5); // C 펜타토닉 인덱스 -> MIDI
function initAudio() {
  if (!AC) {
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      MB = AC.createGain(); MB.gain.value = AUD.master;
      const cp = AC.createDynamicsCompressor();
      try { cp.threshold.value = -16; cp.knee.value = 14; cp.ratio.value = 6; cp.attack.value = 0.004; cp.release.value = 0.2; } catch {}
      MB.connect(cp); cp.connect(AC.destination);
      SB = AC.createGain(); SB.gain.value = AUD.sfx; SB.connect(MB);
      BB = AC.createGain(); BB.gain.value = AUD.bgm; BB.connect(MB);
      _bgFx();
      // iOS 잠금 해제용 무음 1샘플
      try { const b = AC.createBuffer(1, 1, 22050), s = AC.createBufferSource(); s.buffer = b; s.connect(AC.destination); s.start(0); } catch {}
    } catch { AC = null; }
  }
  if (AC && AC.state === "suspended" && !(typeof document !== "undefined" && document.hidden)) { try { AC.resume(); } catch {} }
  if (AC) bgmApply();
}
// 첫 터치에서 AudioContext 해제 + UI 탭 틱 + 백그라운드 일시정지
try {
  for (const ev of ["pointerdown", "touchend", "keydown"]) document.addEventListener(ev, () => { if (!AC || AC.state !== "running") initAudio(); }, { capture: true, passive: true });
  document.addEventListener("pointerdown", (e) => { const t = e.target; if (t && t.closest && t.closest("button") && !t.closest("#draw")) sfx("tap"); }, { capture: true, passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!AC) return;
    if (document.hidden) { try { AC.suspend(); } catch {} } else if (!MUTED) { try { AC.resume(); } catch {} _bgNext = 0; }
  });
} catch {}

// ----- 발음 도구 -----
function tone(f, d, type = "sine", v = 0.06, slide = 0, delay = 0, o) {
  if (!AC || !SB) return;
  const now = AC.currentTime, bg = o && o.bgm;
  if (!bg) { _vo = _vo.filter((e) => e > now); if (_vo.length >= AUD.maxVoices) return; _vo.push(now + delay + d + 0.03); }
  const t0 = now + delay + 0.002, att = Math.min((o && o.att) || 0.006, d * 0.5);
  const os = AC.createOscillator(), g = AC.createGain();
  os.type = type; os.frequency.setValueAtTime(f, t0);
  if (slide) os.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t0 + d);
  g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(v, t0 + att);
  if (o && o.hold) g.gain.setValueAtTime(v, t0 + Math.max(att, d * o.hold)); // 패드: 일정 시간 유지 후 감쇠
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  os.connect(g);
  let out = g;
  if (o && o.lp) { const fl = AC.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = o.lp; g.connect(fl); out = fl; }
  out = _bgPan(out, o);
  out.connect(bg ? (o.bus || BB) : SB); os.start(t0); os.stop(t0 + d + 0.03);
}
function noise(d, v, ftype = "bandpass", f0 = 1500, f1 = 1500, delay = 0, o) {
  if (!AC || !SB) return;
  const now = AC.currentTime, bg = o && o.bgm;
  if (!bg) { _vo = _vo.filter((e) => e > now); if (_vo.length >= AUD.maxVoices) return; _vo.push(now + delay + d + 0.03); }
  if (!_noiseBuf) {
    const sr = +AC.sampleRate || 44100, n = Math.floor(sr * 0.6);
    _noiseBuf = AC.createBuffer(1, n, sr); const a = _noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) a[i] = Math.random() * 2 - 1;
  }
  const t0 = now + delay + 0.002, att = Math.min((o && o.att) || 0.004, d * 0.7);
  const s = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = _noiseBuf; s.loop = true;
  fl.type = ftype; fl.frequency.setValueAtTime(f0, t0); if (f1 !== f0) fl.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + d);
  if (o && o.q) fl.Q.value = o.q;
  g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(v, t0 + att); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  s.connect(fl); fl.connect(g); _bgPan(g, o).connect(bg ? (o.bus || BB) : SB); s.start(t0); s.stop(t0 + d + 0.03);
}
const arp = (ms, step, type, v, dur, d0 = 0) => ms.forEach((m, i) => tone(N(m), dur, type, v, 0, d0 + i * step));
const chord = (ms, dur, v, d0 = 0, type = "sine") => ms.forEach((m) => tone(N(m), dur, type, v, 0, d0, { att: 0.03 }));
const spark = (n, base, d0 = 0) => { for (let i = 0; i < n; i++) tone(base * (1 + (i % 4) * 0.22) * (i > 3 ? 1.5 : 1), 0.12, "sine", 0.022, 0, d0 + i * 0.055); };
const swell = (d, v, d0 = 0) => noise(d, v, "bandpass", 400, 3800, d0, { att: d * 0.85, q: 1.2 });

// ----- 효과음 정의 -----
const _drawSfx = [
  () => tone(520, 0.08, "sine", 0.07, 260),
  () => { tone(600, 0.09, "triangle", 0.07, 300); tone(900, 0.07, "sine", 0.04, 0, 0.05); },
  () => arp([76, 81], 0.07, "triangle", 0.07, 0.14),
  () => { arp([72, 76, 79, 84], 0.06, "triangle", 0.07, 0.16); spark(2, 2400, 0.2); },
  () => { arp([72, 76, 79, 84, 88], 0.065, "triangle", 0.075, 0.2); spark(4, 2200, 0.25); swell(0.4, 0.025); },
  () => { arp([67, 72, 76, 79, 84, 88, 91], 0.06, "triangle", 0.075, 0.22); chord([72, 79, 84], 0.6, 0.04, 0.4); spark(6, 2000, 0.3); swell(0.5, 0.03); },
  () => { arp([72, 72, 72, 76, 79], 0.09, "triangle", 0.08, 0.2); chord([72, 76, 79, 84], 0.9, 0.045, 0.45, "triangle"); spark(8, 2000, 0.45); swell(0.6, 0.03); tone(N(36), 0.6, "sine", 0.07, 0, 0.45); },
  () => { arp([72, 76, 79, 84, 88, 91, 96], 0.07, "triangle", 0.08, 0.22); chord([72, 76, 79, 84, 88], 1.4, 0.04, 0.5, "triangle"); chord([84, 91, 96], 1.2, 0.03, 0.55); spark(12, 1900, 0.5); swell(0.9, 0.035); tone(N(36), 0.9, "sine", 0.08, 0, 0.5); },
];
function _mergeSfx(g) { // g = 결과 등급: 올라갈수록 상승감 + 화려함
  const n = 2 + (g >> 1), b = 3 + g, ms = [];
  for (let k = 0; k <= n; k++) ms.push(pn(b + k));
  arp(ms, 0.065, "triangle", 0.075, 0.16);
  if (g >= 2) tone(N(ms[0] - 12), 0.18, "sine", 0.05, 0);
  if (g >= 3) spark(3 + g, 2200, 0.15 + n * 0.04);
  if (g >= 4) { chord([ms[1], ms[3] || ms[2]], 0.6, 0.04, 0.2 + n * 0.04); swell(0.4, 0.025); }
  if (g >= 6) { arp([72, 76, 79, 84], 0.08, "triangle", 0.075, 0.25, 0.3); chord([60, 67, 72], 0.9, 0.05, 0.5); }
}
const _atk = [ // 무리별 공격음 (숲=나무 타격 / 불꽃=퍽 터지는 소리 / 물결=방울 / 별빛=맑은 종)
  (r) => { tone(190 * r, 0.07, "triangle", 0.035, -70); noise(0.035, 0.02, "bandpass", 1800, 1200); },
  (r) => { noise(0.14, 0.03, "lowpass", 1800 * r, 300); tone(120 * r, 0.1, "sine", 0.03, -40); },
  (r) => { tone(420 * r, 0.1, "sine", 0.035, 320, 0, { att: 0.01 }); tone(630 * r, 0.06, "sine", 0.018, 200, 0.05); },
  (r) => { tone(1320 * r, 0.22, "sine", 0.026); tone(1980 * r, 0.16, "sine", 0.014, 0, 0.02); },
  (r) => { tone(300 * r, 0.09, "triangle", 0.04, 200); tone(600 * r, 0.1, "sine", 0.025, 0, 0.04); }, // 히어로
];
let _combo = 0, _lastKill = 0, _upC = 0, _lastUp = 0;
const SFX = {
  tap:    () => tone(1500, 0.03, "sine", 0.025),
  modal:  () => { noise(0.18, 0.02, "bandpass", 500, 2500, 0, { att: 0.08 }); tone(N(79), 0.1, "sine", 0.03, 0, 0.05); },
  draw:   () => _drawSfx[1](),
  drawHi: () => _drawSfx[4](),
  merge:  () => _mergeSfx(1),
  hit:    () => _atk[0](1),
  kill:   () => {
    const now = performance.now();
    _combo = now - _lastKill < 1000 ? Math.min(_combo + 1, 14) : 0; _lastKill = now;
    const m = pn(5 + _combo); // 콤보 시 펜타토닉 음계로 한 칸씩 상승
    tone(N(m), 0.09, "sine", 0.04, N(m) * 0.08);
    if (_combo >= 5) tone(N(m + 12), 0.07, "triangle", 0.015, 0, 0.02);
  },
  bossKill: () => {
    noise(0.5, 0.05, "lowpass", 2500, 200); tone(N(36), 0.5, "sine", 0.09, -20);
    arp([60, 64, 67, 72, 76, 79, 84], 0.07, "triangle", 0.075, 0.22, 0.1); chord([72, 76, 79, 84], 1.0, 0.045, 0.6, "triangle");
    for (let i = 0; i < 6; i++) tone(1568, 0.07, "square", 0.02, 0, 0.7 + i * 0.06); // 코인 우르르
    spark(8, 2000, 0.6);
  },
  round:  () => { tone(N(67), 0.14, "triangle", 0.06); tone(N(72), 0.22, "triangle", 0.06, 0, 0.11); },
  wave:   () => { if (performance.now() - (_sfxT.round || 0) > 500 && performance.now() - (_sfxT.boss || 0) > 800) SFX.round(); },
  boss:   () => {
    tone(N(33), 0.7, "sawtooth", 0.07, -8, 0, { lp: 400 }); tone(N(32), 0.7, "sawtooth", 0.07, -8, 0.4, { lp: 400 });
    tone(N(45), 0.5, "square", 0.04, 0, 0.9, { lp: 700 }); noise(1.0, 0.035, "lowpass", 300, 120, 0);
  },
  sell:   () => { tone(1319, 0.07, "triangle", 0.06); tone(1760, 0.16, "triangle", 0.06, 0, 0.07); },
  deny:   () => { tone(330, 0.1, "triangle", 0.05, -40); tone(262, 0.16, "triangle", 0.05, -30, 0.09); },
  upgrade: () => {
    const now = performance.now(); _upC = now - _lastUp < 2500 ? Math.min(_upC + 1, 6) : 0; _lastUp = now;
    arp([pn(3 + _upC), pn(5 + _upC), pn(7 + _upC)], 0.07, "square", 0.04, 0.12); tone(N(pn(8 + _upC)), 0.25, "triangle", 0.05, 0, 0.21); spark(2, 2600, 0.28);
  },
  reso:   () => { arp([67, 72, 76, 79, 84], 0.07, "sine", 0.06, 0.4); chord([72, 79], 0.8, 0.03, 0.35); spark(5, 2400, 0.3); },
  ticket: () => { tone(N(79), 0.12, "triangle", 0.065); tone(N(86), 0.3, "triangle", 0.065, 0, 0.1); tone(N(91), 0.3, "sine", 0.03, 0, 0.12); },
  warn:   () => { for (let i = 0; i < 2; i++) tone(440, 0.12, "square", 0.04, 0, i * 0.2, { lp: 1800 }); },
  warn2:  () => { for (let i = 0; i < 4; i++) tone(i % 2 ? 660 : 880, 0.1, "square", 0.045, 0, i * 0.13, { lp: 2400 }); },
  tick:   () => tone(1000, 0.04, "square", 0.035, 0, 0, { lp: 3000 }),
  over:   () => {
    [N(67), N(64), N(60), N(55)].forEach((f, i) => tone(f, 0.4, "triangle", 0.075, -f * 0.1, i * 0.3));
    tone(N(36), 1.2, "sine", 0.07, -10, 0.9); noise(0.7, 0.025, "lowpass", 1200, 150, 0.9);
  },
  win:    () => {
    arp([72, 72, 72, 76, 79, 84, 79, 84, 88], 0.12, "triangle", 0.08, 0.26);
    chord([72, 76, 79, 84], 1.6, 0.045, 1.1, "triangle"); chord([60, 67], 1.6, 0.05, 1.1); spark(14, 1900, 1.1); swell(1.0, 0.03, 0.9);
  },
};
for (let g = 0; g < 8; g++) { SFX["draw" + g] = _drawSfx[g]; SFX["merge" + g] = () => _mergeSfx(g); }
for (let c = 0; c < 5; c++) SFX["atk" + c] = () => _atk[c](1 + Math.random() * 0.08);

// 이름별/그룹별 최소 간격(ms). 같은 그룹은 서로 공유.
const _sfxT = {}, _gap = { atk: 70, hit: 70, kill: 45, tick: 400, tap: 40, warn: 900, round: 600, boss: 800, modal: 150, upgrade: 90, draw: 40, merge: 60, deny: 120, sell: 50, over: 1500, win: 1500, reso: 300, bossKill: 800 };
const _grp = { atk0: "atk", atk1: "atk", atk2: "atk", atk3: "atk", atk4: "atk", warn2: "warn", wave: "round", drawHi: "draw", ticket: "ticket" };
let _atkAny = 0;
function sfx(n) {
  if (MUTED || !AC || !SB) return;
  const f = SFX[n]; if (!f) return;
  const now = performance.now();
  const k = _grp[n] || (/^draw\d/.test(n) ? "draw" : /^merge\d/.test(n) ? "merge" : n);
  if (now - (_sfxT[k] || 0) < (_gap[k] || 0)) return;
  if (k === "atk") { if (now - _atkAny < 35) return; _atkAny = now; } // 동시 다발 공격음 압축
  _sfxT[k] = now; _sfxT[n] = now;
  try { f(); } catch {}
}
function vib(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch {} }

// ----- BGM: 곡 3개(타이틀/일반 x3 변주/보스) + lookahead 스케줄러 -----
// [곡 데이터 작성법] 아래 BGM 표만 고치면 됩니다.
//  chords: 마디별 [베이스 근음 MIDI, "M"(메이저)|"m"(마이너)]. 곡 길이는 mel 마디 수, chords 는 마디 수보다 짧으면 반복.
//  mel: 마디당 16칸(16분음표). 글자 = scale 인덱스(0~9, a~z; 5칸마다 한 옥타브 위), '.'=쉼, '-'=앞 음 이어서 늘림.
//  scale: 음계(반음, 5음 펜타토닉), base: 인덱스 0 의 MIDI. bass/arp/kick/snare/hat: 16칸 패턴 문자열.
//    bass: r=근음 f=5도 o=옥타브 / arp: 0~3=코드음(근음,3도,5도,옥타브) / kick,snare: x / hat: x(약) X(강)
//  bpm: 기본 템포(일반곡은 라운드·몹 수로 가속), swing: 홀수 16분음표를 뒤로 미는 비율(0~0.3), vm/vb/vp/va: 멜로디/베이스/패드/아르페지오 볼륨.
const _M5 = [0, 2, 4, 7, 9], _m5 = [0, 3, 5, 7, 10]; // 메이저/마이너 펜타토닉
const BGM = {
  // 타이틀: C장조, I-V-I-V-vi-IV-I-V = AABA (A 2마디, A' 2마디, B 2마디, A 2마디), 밝고 설레는 느낌
  title: { bpm: 112, swing: 0.14, scale: _M5, base: 60, wave: "triangle", vm: 0.05, vb: 0.07, vp: 0.016, va: 0.02,
    chords: [[48, "M"], [43, "M"], [48, "M"], [43, "M"], [45, "m"], [41, "M"], [48, "M"], [43, "M"]],
    mel: ["5-.7-.8-7.5.7.8.", "7-.5-.3-5.7.5-..", "5-.7-.8-9.a.8.7.", "8-.7-.5-3.5.7-..",
          "4-.5-.7-8.7.5.4.", "3-.4-.5-7.5.4.3-", "5-.7-.8-7.5.7.8.", "7-.8-.7-5.3.5-7."],
    bass: "r..r..f.r..r.of.", arp: "0.1.2.3.2.1.0.1.", kick: "x.....x.x.......", snare: "....x.......x...", hat: "x.X.x.X.x.X.x.X." },
  // 일반: 챕터 id 에 따라 (id-1)%3 번 변주. 마디 앞 4개는 A, 뒤 4개는 옥타브 도약/리듬 변형 A'
  play: [
    { bpm: 100, swing: 0.18, scale: _M5, base: 60, wave: "triangle", vm: 0.045, vb: 0.07, vp: 0.015, va: 0.016, // 0: C장조 I-V-vi-IV (C G Am F)
      chords: [[48, "M"], [43, "M"], [45, "m"], [41, "M"]],
      mel: ["5-.7.8-.7.5-.3.5", "7-.8.7-.5.3-.5.7", "8-.7.5-.4.5-.7.8", "7-.5.4-.3.4-.5.7",
            "5.7.8.9.a-.9.8.7", "8-.7.8-.9.8.7.5.", "9-.8.7-.5.7.8.9.", "8-.7.5-.4.5.7.8-"],
      bass: "r...r.f.r...r.of", arp: "0.2.1.3.0.2.1.3.", kick: "x.......x.......", snare: "....x.......x...", hat: "x.X.x.X.x.X.x.X." },
    { bpm: 104, swing: 0.12, scale: _M5, base: 67, wave: "triangle", vm: 0.045, vb: 0.07, vp: 0.015, va: 0.016, // 1: G장조 I-vi-IV-V (G Em C D), 통통 튀는 느낌
      chords: [[43, "M"], [40, "m"], [48, "M"], [50, "M"]],
      mel: ["5-.3.2-.3.5-.7.5", "4-.2.3-.4.5.4.2-", "5-.7.8-.7.5.3.5-", "4-.3.2-.0.2.3.4.",
            "5.7.8.7.5-.3.5-.", "7-.5.4-.5.7.8.7-", "8-.7.5-.7.8.9.8-", "7-.5.3-.5.7.8.7."],
      bass: "r..r..f.r..r..o.", arp: "0.1.2.1.0.1.2.3.", kick: "x.....x.x.......", snare: "....x.......x...", hat: "x.x.X.x.x.x.X.x." },
    { bpm: 98, swing: 0.2, scale: _m5, base: 69, wave: "triangle", vm: 0.046, vb: 0.07, vp: 0.016, va: 0.016, // 2: A마이너 팝 vi-IV-I-V (Am F C G), 살짝 아련
      chords: [[45, "m"], [41, "M"], [48, "M"], [43, "M"]],
      mel: ["3-.1.0-.1.3-.5.3", "2-.0.1-.2.5-.3.2", "3-.5.6-.5.3.1.3-", "2-.3.4-.3.2-.0.1",
            "5.6.5.3.5-.6.8-.", "6-.5.3-.5.6.5.3-", "6-.8.9-.8.6.5.6-", "5-.3.2-.3.5.3.2-"],
      bass: "r..r..f.r...r.f.", arp: "0.2.3.2.1.2.3.2.", kick: "x.......x.....x.", snare: "....x.......x...", hat: "..x...x...x...x." },
  ],
  // 보스: A마이너 Am F Dm E, 통통한 8분 베이스 + 16분 하이햇, 둥근 사각파(로우패스)로 귀엽지만 급하게
  boss: { bpm: 132, swing: 0.08, scale: _m5, base: 69, wave: "square", lp: 1500, vm: 0.024, vb: 0.075, vp: 0.014, va: 0.015,
    chords: [[45, "m"], [41, "M"], [50, "m"], [40, "M"]],
    mel: ["5.5.6.5.3.1.3.5.", "6.6.8.6.5.3.5.6.", "5.5.3.2.3.5.6.5.", "3.5.6.8.9.8.6.5-",
          "5-.8-.6.5.3.5.6-", "6-.9-.8.6.5.6.8-", "8-.6.5-.3.5.6.5.", "3.5.6.8.a-.9.8.6"],
    bass: "r.o.r.o.r.o.r.of", arp: "0.12.30.12.30.12", kick: "x...x...x...x.x.", snare: "....x.......x..x", hat: "x.XxX.xxx.XxX.xx" },
};
// 엔딩 스팅어: [시작초, MIDI, 길이초, 파형, 볼륨] (게임오버: 잔잔한 하강 + Am7 여운 / 승리: 밝은 C장조 상승 + 화음)
const BGM_END = {
  over: [[0, 76, 1.1, "sine", 0.05], [0.4, 72, 1.1, "sine", 0.05], [0.8, 69, 1.2, "sine", 0.05], [1.3, 64, 2.2, "sine", 0.05],
    [1.3, 57, 2.6, "triangle", 0.03], [1.3, 60, 2.6, "triangle", 0.025], [1.3, 67, 2.6, "triangle", 0.02]],
  win: [[0, 72, 0.5, "triangle", 0.06], [0.12, 76, 0.5, "triangle", 0.06], [0.24, 79, 0.5, "triangle", 0.06], [0.36, 84, 0.6, "triangle", 0.06],
    [0.5, 88, 0.5, "sine", 0.04], [0.62, 91, 1.2, "sine", 0.04], [0.62, 60, 2.4, "triangle", 0.045], [0.62, 64, 2.4, "triangle", 0.035],
    [0.62, 67, 2.4, "triangle", 0.035], [0.62, 72, 2.4, "triangle", 0.03], [0.62, 79, 2.4, "sine", 0.03]],
};
const BGM_XFADE = 1.0; // 곡 전환 크로스페이드(초)
let _bgTimer = null, _bgNext = 0, _bgStep = 0, _bgOn = false, _bgCur = "", _bgEnded = false, _bgBus = {}, DS = null, DL = null;
function _bgFx() { // 가벼운 피드백 딜레이 (곡 버스 -> DS -> DL -> 로우패스 -> BB), StereoPanner 미지원 환경은 _bgPan 이 무시
  try {
    DS = AC.createGain(); DS.gain.value = 0.28; DL = AC.createDelay(1); DL.delayTime.value = 0.27;
    const fb = AC.createGain(), lp = AC.createBiquadFilter(), wet = AC.createGain(); fb.gain.value = 0.3; wet.gain.value = 0.8;
    lp.type = "lowpass"; lp.frequency.value = 2200;
    DS.connect(DL); DL.connect(lp); lp.connect(fb); fb.connect(DL); lp.connect(wet); wet.connect(BB);
  } catch { DS = null; DL = null; }
}
function _bgPan(node, o) {
  if (!o || !o.pan || !AC.createStereoPanner) return node;
  try { const p = AC.createStereoPanner(); p.pan.value = o.pan; node.connect(p); return p; } catch { return node; }
}
function _bgGetBus(key) {
  if (!_bgBus[key]) { const g = AC.createGain(); g.gain.value = 0.0001; g.connect(BB); if (DS) g.connect(DS); _bgBus[key] = g; }
  return _bgBus[key];
}
function _bgFade(key, to, sec) {
  const g = _bgBus[key]; if (!g) return;
  const t = AC.currentTime;
  try { const c = Math.max(0.0001, g.gain.value); g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(c, t); g.gain.linearRampToValueAtTime(Math.max(0.0001, to), t + sec); } catch {}
}
function _bgVariant(r) { // 라운드 -> 챕터 -> 일반곡 변주 번호
  let id = 1; try { for (const c of CHAPTERS) if (r >= c.from && r <= c.to) { id = c.id; break; } } catch {}
  return (id - 1) % BGM.play.length;
}
function _bgState() { // 화면/라운드/위험도 -> 곡, 템포, 강도
  let r = 1, mob = 0, boss = false, lose = 100, title = false;
  try { title = typeof TITLE_ON !== "undefined" && TITLE_ON; } catch {}
  try { if (typeof S !== "undefined" && S) { r = S.round || 1; mob = S.mobs ? S.mobs.length : 0; boss = !!roundInfo(r).boss; lose = CONST.MOB_LOSE || 100; } } catch {}
  const dg = Math.min(1, mob / lose);
  if (title) return { key: "title", song: BGM.title, bpm: BGM.title.bpm + AUD.bpmBase, lvl: 2 };
  if (boss) return { key: "boss", song: BGM.boss, bpm: BGM.boss.bpm + AUD.bpmBase + AUD.bpmDangerMax * dg * 0.5, lvl: 2 };
  const v = _bgVariant(r), song = BGM.play[v];
  const bpm = song.bpm + AUD.bpmBase + Math.min(AUD.bpmRoundMax, r * 0.5) + AUD.bpmDangerMax * dg;
  const lvl = (r >= 15 || dg >= 0.5) ? 2 : (r >= 5 || dg >= 0.25) ? 1 : 0; // 0 멜로디+베이스, 1 +패드+하이햇, 2 +킥/스네어/아르페지오
  return { key: "play" + v, song, bpm, lvl };
}
// 한 스텝(16분음표)의 음 이벤트 목록 (순수 함수: 오프라인 렌더 스크립트도 사용). off=스윙(스텝 단위), ds=길이(스텝 단위), d=길이(초)
function _bgEv(song, lvl, step) {
  const bars = song.mel.length, bar = Math.floor(step / 16) % bars, s = step & 15, ev = [];
  const ch = song.chords[bar % song.chords.length], root = ch[0], ct = ch[1] === "m" ? [0, 3, 7, 12] : [0, 4, 7, 12];
  const off = (s & 1) ? song.swing : 0, lp = song.lp || 3000;
  const m = (song.mel[bar] + "................").slice(0, 16), c = m[s];
  if (c !== "." && c !== "-") {
    let n = 1; while (s + n < 16 && m[s + n] === "-") n++;
    const i = parseInt(c, 36), L = song.scale.length, mi = song.base + song.scale[i % L] + 12 * Math.floor(i / L), v = song.vm * (s % 4 === 0 ? 1 : 0.86);
    ev.push({ m: mi, ds: n * 0.95, w: song.wave, v, lp, pan: 0.2, att: 0.012, off });
    ev.push({ m: mi + 12, ds: Math.min(n, 3) * 0.6, w: "sine", v: v * 0.3, pan: 0.35, off }); // 귀여운 종소리 겹침
  }
  const b = (song.bass + "................")[s];
  if (b === "r" || b === "f" || b === "o") ev.push({ m: root + (b === "f" ? 7 : b === "o" ? 12 : 0), ds: b === "r" ? 1.8 : 1.2, w: "triangle", v: song.vb * (b === "r" ? 1 : 0.7), lp: 700, off });
  if (lvl >= 1) {
    if (s === 0) for (let k = 0; k < 3; k++) ev.push({ m: root + 12 + ct[k], ds: 16, w: "sine", v: song.vp, lp: 1400, att: 0.3, hold: 0.55, pan: k === 1 ? 0 : (k ? 0.25 : -0.25) });
    const h = (song.hat + "................")[s];
    if (h === "x" || h === "X") ev.push({ k: "n", d: 0.04, v: h === "X" ? 0.024 : 0.013, ft: "highpass", f0: 7000, f1: 7000, pan: (s & 2) ? 0.3 : -0.3, off });
  }
  if (lvl >= 2) {
    if ((song.kick + "................")[s] === "x") ev.push({ f: 130, sl: -95, d: 0.14, w: "sine", v: 0.07 });
    if ((song.snare + "................")[s] === "x") ev.push({ k: "n", d: 0.09, v: 0.028, ft: "bandpass", f0: 1800, f1: 1800, pan: 0.1 });
    const a = (song.arp + "................")[s];
    if (a >= "0" && a <= "3") ev.push({ m: root + 24 + ct[+a], ds: 1.2, w: "triangle", v: song.va, lp: 2600, pan: -0.3, off });
  }
  return ev;
}
function _bgPlay(e, t, dur, bus) {
  const dl = Math.max(0, t - AC.currentTime + (e.off || 0) * dur), o = { bgm: 1, bus, pan: e.pan, lp: e.lp, att: e.att, hold: e.hold };
  if (e.k === "n") noise(e.d, e.v, e.ft, e.f0, e.f1, dl, o);
  else tone(e.f || N(e.m), e.d || e.ds * dur, e.w, e.v, e.sl || 0, dl, o);
}
function _bgEnding(win) { // 엔딩 스팅어: 효과음(over/win) 이 지나간 뒤 약 1.3초 후 시작
  const bus = _bgGetBus("end"); _bgFade("end", 1, 0.05);
  for (const [at, mi, d, w, v] of BGM_END[win ? "win" : "over"]) tone(N(mi), d, w, v, 0, 1.3 + at, { bgm: 1, bus, att: d > 2 ? 0.25 : 0.01, pan: 0, hold: d > 2 ? 0.5 : 0 });
}
function _bgTick() {
  if (!AC || !_bgOn) return;
  let over = false, paused = false, win = false;
  try { over = !!(typeof S !== "undefined" && S && S.over) && !(typeof TITLE_ON !== "undefined" && TITLE_ON); paused = !!(typeof S !== "undefined" && S && S.paused); win = !!(typeof S !== "undefined" && S && S.win); } catch {}
  try { BB.gain.setTargetAtTime(Math.max(0.0001, paused ? AUD.bgm * 0.45 : AUD.bgm), AC.currentTime, 0.25); } catch {}
  if (AC.state !== "running") { _bgNext = 0; return; }
  if (over) { // 게임 종료: 현재 곡 페이드아웃 후 짧은 엔딩 1회
    if (_bgCur) { _bgFade(_bgCur, 0, 1.0); _bgCur = ""; }
    if (!_bgEnded) { _bgEnded = true; _bgEnding(win); }
    _bgNext = 0; return;
  }
  _bgEnded = false;
  const now = AC.currentTime, st = _bgState();
  if (st.key !== _bgCur) { // 곡 전환: 이전 곡 1초 페이드아웃 + 새 곡 1초 페이드인(처음부터 재생)
    if (_bgCur) _bgFade(_bgCur, 0, BGM_XFADE);
    _bgGetBus(st.key); _bgFade(st.key, 1, _bgCur ? BGM_XFADE : 0.4);
    _bgCur = st.key; _bgStep = 0; _bgNext = now + 0.06;
  }
  if (!_bgNext || _bgNext < now - 0.1) _bgNext = now + 0.06;
  if (DL) try { DL.delayTime.setTargetAtTime(60 / st.bpm * 0.75, now, 0.6); } catch {} // 점8분음표 딜레이
  const dur = 60 / st.bpm / 4, bus = _bgGetBus(st.key), total = st.song.mel.length * 16;
  while (_bgNext < now + 0.3) {
    for (const e of _bgEv(st.song, st.lvl, _bgStep)) _bgPlay(e, _bgNext, dur, bus);
    _bgNext += dur; _bgStep = (_bgStep + 1) % total;
  }
}
function bgmApply() {
  const want = !!AC && SND_MODE === 0;
  if (want && !_bgOn) { _bgOn = true; _bgNext = 0; _bgStep = 0; _bgCur = ""; if (!_bgTimer) _bgTimer = setInterval(_bgTick, 90); }
  else if (!want && _bgOn) { _bgOn = false; if (_bgTimer) { clearInterval(_bgTimer); _bgTimer = null; } for (const k in _bgBus) { try { _bgBus[k].gain.cancelScheduledValues(0); _bgBus[k].gain.value = 0.0001; } catch {} } _bgCur = ""; }
}
// 소리 모드 순환: 0 효과음+BGM -> 1 효과음만 -> 2 끔 (index.html #snd 버튼)
function sndLabel() {
  const b = typeof $ === "function" ? $("snd") : null; if (!b) return;
  if (b.firstChild) b.firstChild.textContent = ["🔊", "🔉", "🔇"][SND_MODE];
  const sm = b.querySelector && b.querySelector("small"); if (sm) sm.textContent = ["소리", "효과음", "끔"][SND_MODE];
}
function sndCycle() {
  SND_MODE = (SND_MODE + 1) % 3; MUTED = SND_MODE === 2;
  lsSet("malang-snd", String(SND_MODE)); lsSet("malang-mute", MUTED ? "1" : "0");
  initAudio(); bgmApply(); sndLabel(); if (!MUTED) sfx("tap");
}

// ---------- 모달 (큐 + 일시정지) ----------
let TITLE_ON = true, MODAL_Q = [], MODAL_ON = false, CONFIRM_ON = false;
function modal(html) { $("box").innerHTML = html; $("modal").classList.add("on"); MODAL_ON = true; sfx("modal"); if (typeof S !== "undefined" && S && !S.over && !TITLE_ON) S.paused = true; }
function queueModal(fn) { if (MODAL_ON) MODAL_Q.push(fn); else fn(); }
function closeModal() {
  $("modal").classList.remove("on"); MODAL_ON = false;
  const nx = MODAL_Q.shift();
  if (nx) { nx(); return; }
  if (!TITLE_ON && S && !S.over && !CONFIRM_ON) S.paused = false;
}
function uiConfirm(msg, onOk) {
  const prev = S ? S.paused : false;
  CONFIRM_ON = true; if (S) S.paused = true;
  $("cmsg").innerHTML = esc(msg).replace(/\n/g, "<br>"); $("confirm").classList.add("on");
  const done = (ok) => { $("confirm").classList.remove("on"); CONFIRM_ON = false; if (S && !S.over) S.paused = MODAL_ON ? true : prev; if (ok && onOk) onOk(); };
  $("cok").onclick = () => done(true); $("cno").onclick = () => done(false);
}

// ---------- 로그 / 배너 / 알림 ----------
function uiLog(txt, col = "#5b3a1e") {
  if (typeof txt === "string") { if (txt.includes("공명!")) sfx("reso"); else if (txt.includes("처치! 미네랄")) sfx("bossKill"); }
  const box = $("logBox"), d = document.createElement("div");
  d.className = "lg"; d.textContent = txt; d.style.color = col;
  box.appendChild(d);
  while (box.children.length > 3) box.removeChild(box.firstChild);
  setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 4100);
}
const BANNER_COL = { info: "#e0558a", warn: "#ff9a00", boss: "#d4182e", hi: "#ff8a1f", epic: "#ff3d7f", legend: "#ffc400", parents: "#ff6ad5", win: "#3fa95f" };
function uiBanner(txt, kind = "info") {
  const b = $("banner");
  b.textContent = txt; b.style.setProperty("--bc", BANNER_COL[kind] || BANNER_COL.info);
  b.classList.toggle("big", kind === "legend" || kind === "parents" || kind === "win");
  b.classList.remove("on"); void b.offsetWidth; b.classList.add("on");
  if (kind === "epic" || kind === "legend" || kind === "parents" || kind === "win") { const f = $("flash"); f.classList.remove("on"); void f.offsetWidth; f.classList.add("on"); }
}
// 뽑기 직후 호출(선택): game.js 가 uiDrew(idx) 를 부르면 형식 로그 + 등급 연출
function uiDrew(idx) {
  const c = CHARS[idx], g = c.grade, p = gradeProbs(S && S.hero)[g];
  const lv = S ? clanLevel(S, c.clan) : 0;
  uiLog(`${pct(p)}%의 확률로 [${gname(g)}] ${c.name}이(가) 나왔어요! ${CLANS[c.clan].ico}Lv${lv}`, GCOL(g));
  if (g >= 4) { sfx("drawHi"); vib(g >= 6 ? [80, 40, 80, 40, 200] : 80); }
  if (g === 4) uiBanner(`히든! [${c.name}]`, "hi");
  else if (g === 5) uiBanner(`에픽! [${c.name}]`, "epic");
  else if (g >= 6) uiBanner("경축! 아니 이걸 뽑다니!\n" + c.name, g === 7 ? "parents" : "legend");
}
// 합성 직후 호출(선택): "[커먼] 등급 유닛을 조합하여 [노멀] 등급 유닛을 랜덤으로 얻었습니다!"
function uiMerged(fromGrade, toIdx) {
  const c = CHARS[toIdx];
  uiLog(`[${gname(fromGrade)}] 등급 유닛을 조합하여 [${gname(c.grade)}] 등급 유닛을 랜덤으로 얻었습니다! (${CLANS[c.clan].ico}${c.name})`, GCOL(c.grade));
  sfx("merge");
}

// ---------- HUD ----------
const _txt = {};
function setText(id, v) { if (_txt[id] !== v) { _txt[id] = v; $(id).textContent = v; } }
function setHtml(id, v) { if (_txt[id] !== v) { _txt[id] = v; $(id).innerHTML = v; } }
function setCls(id, cls, on) { const k = id + "." + cls; if (_txt[k] !== on) { _txt[k] = on; $(id).classList.toggle(cls, on); } }
let _S = null, _hudFrame = 0, _lastRound = 0, _mobLv = 0, _lastSec = -1;
function uiReset() { _lastRound = 0; _mobLv = 0; _lastSec = -1; $("logBox").innerHTML = ""; for (const k in _txt) delete _txt[k]; $("vig").classList.remove("on"); }
const hasRoom = (ch) => S.slots.some((s) => !s) || S.slots.some((s) => s && !s.hero && s.ch === ch && s.n < CONST.STACK_MAX);

function updateHud() {
  if (typeof S === "undefined" || !S) return;
  if (_S !== S) { _S = S; uiReset(); S.dispMin = S.minerals; }
  const info = roundInfo(S.round || 1);
  // 미네랄
  const lastMin = S.dispMin;
  S.dispMin += (S.minerals - S.dispMin) * 0.25;
  if (Math.abs(S.minerals - S.dispMin) < 1) S.dispMin = S.minerals;
  setText("hMin", String(Math.round(S.dispMin)));
  if (S.minerals - lastMin >= 20 && !S._bump) { S._bump = true; $("cMin").classList.add("bump"); setTimeout(() => { $("cMin").classList.remove("bump"); S._bump = false; }, 260); }
  // 라운드 / 보스 카운트다운
  const boss = info.boss;
  if (S.round !== _lastRound) {
    if (_lastRound && S.round > _lastRound && !S.over) {
      sfx(boss ? "boss" : "wave");
      if (boss) uiBanner(S.round === CONST.ROUNDS ? "최후의 보스: " + info.name : "보스 출현! " + info.name, "boss");
    }
    _lastRound = S.round; _lastSec = -1;
  }
  setCls("cWave", "boss", boss);
  let left = 0;
  if (boss) {
    left = S.bossT > 0 ? S.bossT : Math.max(0, info.time - (S.roundT || 0));
    const sec = Math.ceil(left), urgent = left <= 10 && !S.over;
    setText("hWave", `⚠ 보스 ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`);
    setCls("cWave", "urgent", urgent);
    if (urgent && sec !== _lastSec) { sfx("tick"); }
    _lastSec = sec;
    $("hWaveBar").style.width = Math.max(0, Math.min(100, (left / info.time) * 100)) + "%";
  } else {
    setCls("cWave", "urgent", false);
    setText("hWave", `라운드 ${S.round}/${CONST.ROUNDS}`);
    $("hWaveBar").style.width = Math.min(100, ((S.roundT || 0) / CONST.ROUND_SEC) * 100) + "%";
  }
  setText("hCh", CHAPTERS[info.ch - 1].name + (boss ? " - 보스" : ""));
  setText("wIco", boss ? "👹" : "🌊");
  // 보스 바
  const bm = boss ? S.mobs.find((m) => m.boss) : null;
  setCls("bossBar", "on", !!bm);
  if (bm) {
    const extra = S.round === CONST.ROUNDS ? ` · 남은 적 ${S.mobs.length}기 (보스와 모든 적을 처치!)` : "";
    setText("bossName", info.name + extra);
    setText("bossHp", Math.ceil(Math.max(0, bm.hp)) + "/" + Math.ceil(bm.max));
    $("bossFill").style.width = Math.max(0, (bm.hp / bm.max) * 100) + "%";
  }
  // 몹 수 게이지 (80/90 경고)
  const n = S.mobs.length, W80 = CONST.MOB_WARN[0], W90 = CONST.MOB_WARN[1];
  setText("hMob", `${n}/${CONST.MOB_LOSE}`);
  $("hMobBar").style.width = Math.min(100, (n / CONST.MOB_LOSE) * 100) + "%";
  setCls("cMob", "warn80", n >= W80 && n < W90); setCls("cMob", "warn90", n >= W90);
  setCls("hMobWrap", "hot", n >= W80);
  setCls("vig", "on", n >= W90 && !S.over);
  const lv = n >= W90 ? 2 : n >= W80 ? 1 : 0;
  if (lv > _mobLv) { uiBanner(`적 유닛 수가 ${lv === 2 ? W90 : W80}기 이상입니다!`, "warn"); uiLog(`적 유닛 수가 ${lv === 2 ? W90 : W80}기 이상입니다!`, lv === 2 ? "#d4182e" : "#c98a00"); sfx(lv === 2 ? "warn2" : "warn"); vib(60); }
  _mobLv = lv;
  // 버튼
  const free = S.slots.some((s) => !s), can = S.minerals >= CONST.DRAW_COST && free && !S.over;
  $("draw").disabled = !can; setCls("draw", "ready", can);
  setHtml("drawLbl", free ? "🎲 뽑기" : "자리가 없어요");
  setText("drawCost", "💎 " + CONST.DRAW_COST);
  const u = S.slots[S.sel], uc = u && !u.hero ? CHARS[u.ch] : null;
  const sellable = !!uc && uc.grade < 7;
  $("sell").disabled = !sellable || S.over;
  setHtml("sell", `🪙<small>${sellable ? "판매 " + GRADES[uc.grade].sell : "판매"}</small>`);
  const mg = u && !S.over ? GAME.canMerge(S.sel) : { ok: false };
  $("merge").disabled = !mg.ok; setCls("merge", "ready", !!mg.ok);
  setHtml("merge", `🔀<small>${mg.ok ? "합성" : u && !u.hero && uc && uc.grade >= 6 ? "불가" : "합성"}</small>`);
  setHtml("spd", `⏩<small>x${S.speed}</small>`);
  setCls("auto", "on", !!S.autoMerge); setCls("lock", "on", !!(u && u.lock));
  setHtml("info", infoText(u, mg));
  // 칩들 (공업 / 선택권 / 히어로 진행)
  const hs = S.heroState && S.heroState.progress;
  setText("heroChip", hs || "");
  setHtml("clanChips", CLANS.map((c, i) => {
    const up = S.up[i], can = up.bought < CONST.UP_MAX && S.minerals >= upgradeCost(up.bought);
    return `<div class="cc${can ? " buy" : ""}${S.upTickets > 0 ? " ut" : ""}" data-c="${i}" style="--cc:${c.color}">${c.ico}<b>${clanLevel(S, i)}</b></div>`;
  }).join(""));
  const tk = {}; (S.tickets || []).forEach((g) => (tk[g] = (tk[g] || 0) + 1));
  setHtml("tickets", Object.keys(tk).map((g) => `<span class="tk" data-g="${g}" style="--tc:${GCOL(+g)}">🎫${gname(+g)}${tk[g] > 1 ? " x" + tk[g] : ""}</span>`).join("") + (S.upTickets > 0 ? `<span class="tk" data-up="1" style="--tc:#ffb703">⬆공업 x${S.upTickets}</span>` : ""));
  if (_hudFrame++ % 20 === 0) drawHeroCard();
}
function infoText(u, mg) {
  if (!u) return "칸을 탭하면 사거리가 보여요 · 같은 유닛 <b>3기</b>가 모이면 [🔀 합성]!";
  if (u.hero) return `<div class="ln">👑 <b>${esc(S.hero.name)}</b> (히어로)</div><div class="ln sm">${esc(S.hero.rule)} · 이동/판매/합성 불가</div>`;
  const c = CHARS[u.ch], g = c.grade, cl = CLANS[c.clan], lv = clanLevel(S, c.clan), mul = dmgMul(lv);
  const dps = (c.atk / c.cd) * mul * u.n;
  let nx = "";
  if (g >= 6) nx = "레전더리부터는 합성할 수 없어요";
  else {
    const cands = [0, 1, 2, 3].map((k) => `${CLANS[k].ico}${CHARS[(g + 1) * 4 + k].name}`).join(" ");
    nx = (u.n >= 3 ? `<b>합성 가능!</b> ` : `3기 필요 (${u.n}/3) · `) + `다음 [${gname(g + 1)}]: ${cands}`;
  }
  const fxn = FX_NAME[c.fx] || c.fx;
  return `<div class="ln">${gbadge(g)} <b>${esc(c.name)}</b> ${cl.ico}${cl.name} x${u.n} · 공격 ${fmt(c.atk * mul)} · DPS ${fmt(dps)}</div><div class="ln sm">${cl.ico}공업 Lv${lv} (x${mul.toFixed(2)}) · ${fxn} · 사거리 ${c.range}${u.lock ? " · 🔒" : ""} · 판매 💎${GRADES[g].sell}</div><div class="ln sm">${nx}</div>`;
}
const FX_NAME = { shot: "투척", tongue: "혀 공격", slash: "할퀴기", wave: "음파", roar: "포효(광역)", beam: "광선(관통)", breath: "숨결(광역)", chain: "연쇄", lob: "포물선 폭탄", nova: "전체 파동", meteor: "유성", storm: "폭풍" };
function drawHeroCard() {
  if (typeof drawHero !== "function" || !S || !S.hero) return;
  const hc = $("heroIco").getContext("2d");
  hc.setTransform(2, 0, 0, 2, 0, 0); hc.clearRect(0, 0, 38, 38);
  try { hc.save(); hc.translate(19, 21); hc.scale(0.85, 0.85); drawHero(hc, S.hero.id, 0, 0, S.time || 0, {}); hc.restore(); } catch {}
  setText("heroName", S.hero.name); setText("heroDesc", S.hero.rule);
}
function setCards() { for (const k of ["heroName", "heroDesc"]) delete _txt[k]; drawHeroCard(); }

// ---------- 확률표 ----------
function paintPortraits(root, px) {
  root.querySelectorAll("canvas[data-i]").forEach((cv) => {
    const i = +cv.dataset.i;
    try { if (typeof drawPortrait === "function") { cv.width = cv.height = px; drawPortrait(cv, i, px); } } catch {}
  });
}
function showProb() {
  const probs = gradeProbs(S && S.hero), lucky = S && S.hero && S.hero.fx.probMod === "lucky";
  const rows = GRADES.map((g, i) => {
    const mod = lucky && g.luckyProb !== g.prob ? ` <small>(기본 ${pct(g.prob)})</small>` : "";
    const ports = [0, 1, 2, 3].map((k) => `<canvas data-i="${i * 4 + k}" width="52" height="52" title="${esc(CHARS[i * 4 + k].name)}"></canvas>`).join("");
    return `<tr><td>${gbadge(i)}</td><td><b>${pct(probs[i])}%</b>${mod}</td><td>${pct(probs[i] / 4)}%</td><td>${ports}</td><td>${i >= 6 ? "합성 불가" : "합성 가능"}<br>${g.sell ? "판매 " + g.sell : "판매 불가"}</td></tr>`;
  }).join("");
  modal(`<h2>ℹ 등급 확률표</h2><table class="pt"><tr><td>등급</td><td>확률</td><td>개별</td><td>유닛 4종 (🌿🔥🌊✨)</td><td>합성/판매</td></tr>${rows}</table>
    <p class="tiny">등급이 정해지면 4무리(🌿숲 🔥불꽃 🌊물결 ✨별빛)가 <b>각 25%</b>씩! 같은 유닛 3기 = 다음 등급 랜덤 1기${lucky ? "<br>행운 고양이 럭키: 유니크 확률 감소, 히든 이상 2배" : ""}</p><button class="wide" id="close">닫기</button>`);
  $("close").onclick = closeModal; paintPortraits($("box"), 52);
}

// ---------- 선택권 ----------
function dpsOf(c) { return fmt(c.atk / c.cd); }
function uiTicket(grade) {
  queueModal(() => {
    if (!S || !(S.tickets || []).includes(grade)) { closeModal(); return; }
    sfx("ticket");
    const opts = [0, 1, 2, 3].map((k) => {
      const c = CHARS[grade * 4 + k], ok = hasRoom(c.idx);
      return `<div class="opt${ok ? "" : " dim"}" data-i="${c.idx}" style="--gc:${GCOL(grade)}"><canvas data-i="${c.idx}" width="112" height="112"></canvas><b>${esc(c.name)}</b><br>${CLANS[k].ico}${CLANS[k].name} · DPS ${dpsOf(c)}</div>`;
    }).join("");
    modal(`<h2>🎫 ${gbadge(grade)} 선택권</h2><p>원하는 유닛을 하나 골라요!</p><div class="pk">${opts}</div><small id="tkmsg"></small><button class="wide mini" id="later" style="flex-direction:row;padding:9px">나중에 쓸게요 (보관)</button>`);
    paintPortraits($("box"), 112);
    $("later").onclick = closeModal;
    $("box").querySelectorAll(".opt").forEach((el) => (el.onclick = () => {
      const idx = +el.dataset.i;
      if (!hasRoom(idx)) { $("tkmsg").textContent = "자리가 없어요! 유닛을 팔아 자리를 만든 뒤 칩을 눌러 다시 써요"; vib(40); return; }
      closeModal(); GAME.useTicket(idx); sfx("ticket");
    }));
  });
}
function uiUpTicket() {
  queueModal(() => {
    if (!S || !(S.upTickets > 0)) { closeModal(); return; }
    sfx("ticket");
    const opts = CLANS.map((c, i) => `<div class="opt" data-c="${i}" style="--gc:${c.color}"><div style="font-size:34px">${c.ico}</div><b>${c.name}</b><br>Lv ${clanLevel(S, i)} -> ${Math.min(CONST.UP_LV_CAP, clanLevel(S, i) + 1)}<br><small>${c.role || ""}</small></div>`).join("");
    modal(`<h2>⬆ 공업 선택권</h2><p>공격력을 올릴 무리를 고르세요 (+1 Lv, 무료)</p><div class="pk">${opts}</div><button class="wide mini" id="later" style="flex-direction:row;padding:9px">나중에 쓸게요 (보관)</button>`);
    $("later").onclick = closeModal;
    $("box").querySelectorAll(".opt").forEach((el) => (el.onclick = () => { closeModal(); GAME.useUpTicket(+el.dataset.c); sfx("ticket"); }));
  });
}

// ---------- 강화(공업) 시트 ----------
function showUpg() {
  const pw = clanPower(S.slots);
  const rows = CLANS.map((c, i) => {
    const up = S.up[i], lv = clanLevel(S, i), maxed = up.bought >= CONST.UP_MAX, cost = upgradeCost(up.bought), can = !maxed && S.minerals >= cost;
    const rc = resonanceCount(S.slots, i), rb = resonanceBonus(S.slots, i);
    return `<div class="up" style="--cc:${c.color}"><div class="e">${c.ico}</div><div class="m"><b>${c.name}</b> Lv ${lv}${up.bonus ? ` <small>(구매${up.bought}+보너스${up.bonus})</small>` : ""} · 공격 x${dmgMul(lv).toFixed(2)}<br><small>${maxed ? "최대 단계" : `다음 💎${cost} · +${Math.round(CONST.UP_STEP * 100)}%`} · 공명 ${rc}종${rb ? " +" + rb : ""}</small><br><small>화력 비중 ${Math.round(pw[i] * 100)}%</small><i><u style="width:${Math.round(pw[i] * 100)}%"></u></i></div>
      <div style="display:flex;flex-direction:column;gap:4px"><button data-c="${i}" class="${can ? "green" : ""}" ${can ? "" : "disabled"}>${maxed ? "MAX" : "강화"}</button>${S.upTickets > 0 ? `<button data-t="${i}" class="mini" style="flex-direction:row;padding:5px">🎫+1</button>` : ""}</div></div>`;
  }).join("");
  modal(`<h2>⬆ 무리 강화</h2><p class="tiny">💎 ${S.minerals} 보유 · 많이 뽑힌 무리에 투자하세요! 무리 공업은 필드의 모든 유닛에 즉시 적용돼요</p>${rows}<button class="wide" id="close">닫기</button>`);
  $("close").onclick = closeModal;
  $("box").querySelectorAll("button[data-c]").forEach((b) => (b.onclick = () => { if (GAME.upgrade(+b.dataset.c) === false) sfx("deny"); const sc = $("box").scrollTop; showUpg(); $("box").scrollTop = sc; }));
  $("box").querySelectorAll("button[data-t]").forEach((b) => (b.onclick = () => { GAME.useUpTicket(+b.dataset.t); sfx("ticket"); const sc = $("box").scrollTop; if (S.upTickets > 0 || true) showUpg(); $("box").scrollTop = sc; }));
}

// ---------- 랭킹 ----------
const LS_KEY = "malang-ranks2";
const remote = () => CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY;
const hdr = () => { const k = CONFIG.SUPABASE_ANON_KEY, h = { apikey: k, "Content-Type": "application/json" }; if (String(k).startsWith("eyJ")) h.Authorization = "Bearer " + k; return h; }; // sb_publishable_ 키는 JWT 가 아니므로 Bearer 로 보내지 않는다
const GAME_VER = "2";
let LAST = null; // 방금 등록한 내 기록 (강조용)
const ymd = (d) => { const p = (n) => (n < 10 ? "0" : "") + n; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); };
function seasonStart(now = new Date()) {
  const base = new Date(2026, 0, 5), t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const k = Math.floor(Math.round((t0 - base) / 864e5) / 28);
  return new Date(2026, 0, 5 + k * 28);
}
function scoreParts(res) {
  const R = res.round != null ? res.round : S.round, kills = res.kills != null ? res.kills : S.kills;
  const win = res.win != null ? !!res.win : !!S.win;
  const left = res.bossLeft != null ? res.bossLeft : Math.max(0, S.bossT || 0);
  const U = res.unitPts != null ? res.unitPts : unitPoints(S.slots);
  const score = res.score != null ? res.score : calcScore(R, kills, U, win, left);
  return { R, kills, win, left, U, score, uPts: Math.floor(Math.min(U, CONST.SCORE.UNIT_CAP) * CONST.SCORE.UNIT_MUL) };
}
// ---- 랭킹 제출: Edge Function(서버가 입력 로그를 재생해 점수 검증). 실패/오프라인이면 큐에 보관했다가 재전송 ----
const DEV_KEY = "malang-device", QUEUE_KEY = "malang-queue", QUEUE_MAX = 20;
function deviceId() {
  let id = lsGet(DEV_KEY, "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 3) | 8).toString(16); });
    lsSet(DEV_KEY, id);
  }
  return id;
}
const qGet = () => { try { const q = JSON.parse(lsGet(QUEUE_KEY, "[]")); return Array.isArray(q) ? q : []; } catch { return []; } };
const qSet = (q) => lsSet(QUEUE_KEY, JSON.stringify(q.slice(-QUEUE_MAX)));
let FLUSHING = false;
// 반환: "ok"(저장/이미 더 높은 기록) | "drop"(서버가 거부: 재전송해도 소용없음) | "retry"(네트워크/서버 오류, 큐 유지)
async function postScore(payload) {
  let r;
  try { r = await fetch(CONFIG.SUPABASE_URL + "/functions/v1/submit-score", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); }
  catch { return "retry"; }
  if (r.ok) return "ok";
  if (r.status === 429 || r.status === 408 || r.status >= 500) return "retry";
  return "drop";
}
async function flushQueue() {
  if (FLUSHING || !remote() || !qGet().length) return;
  FLUSHING = true;
  try {
    for (const item of qGet()) {
      const st = await postScore(item);
      if (st === "retry") break;
      qSet(qGet().filter((x) => x.qid !== item.qid));
    }
  } finally { FLUSHING = false; }
}
if (typeof window !== "undefined") { window.addEventListener("online", flushQueue); setTimeout(flushQueue, 2500); }
async function submitScore(name, P) {
  const row = { name: name.slice(0, 10) || "익명", score: P.score, wave: P.R, hero: S.hero.id, rule: S.mode, mode: S.mode, seed: S.seed, win: P.win, units: P.U, ver: GAME_VER };
  LAST = { name: row.name, score: row.score };
  if (S.mode !== "daily") return "local"; // 연습 모드는 서버에 보내지 않는다 (이 기기 최고점만 uiGameOver 에서 저장)
  if (remote()) {
    const item = { qid: Date.now() + "-" + Math.random().toString(36).slice(2, 8), name: row.name, mode: "daily", seed: S.seed, ver: GAME_VER, inputs: S.inputs, claimedScore: P.score, claimedRound: P.R, win: !!P.win, device_id: deviceId() };
    const st = await postScore(item);
    if (st === "retry") { qSet([...qGet(), item]); return "queued"; }
    flushQueue(); // 이전에 밀린 기록도 이어서 전송
    return st;
  }
  const l = JSON.parse(lsGet(LS_KEY, "[]"));
  l.push({ ...row, played_at: new Date().toISOString() });
  lsSet(LS_KEY, JSON.stringify(l));
  return "local";
}
function seasonBoard(rows) {
  const by = {};
  for (const r of rows) {
    const day = ymd(new Date(r.played_at)), o = by[r.name] || (by[r.name] = { days: {}, wave: 0 });
    o.days[day] = Math.max(o.days[day] || 0, r.score); o.wave = Math.max(o.wave, r.wave || 0);
  }
  return Object.keys(by).map((n) => {
    const v = Object.values(by[n].days).sort((a, b) => b - a).slice(0, 7);
    return { name: n, score: v.reduce((a, b) => a + b, 0), wave: by[n].wave, days: v.length, played_at: "" };
  }).sort((a, b) => b.score - a.score).slice(0, 50);
}
async function fetchRanks(tab) {
  const since = tab === "today" ? new Date(todayKey() + "T00:00:00") : tab === "season" ? seasonStart() : null;
  let rows;
  if (remote()) {
    // 읽기는 leaderboard 뷰만 사용: 오늘=오늘 seed 의 일일 기록, 전체=기기별 최고 기록, 시즌=기간 내 일일 기록(일별 합산은 클라이언트에서)
    const base = `${CONFIG.SUPABASE_URL}/rest/v1/`, sel = "select=name,score,round,win,hero,played_at";
    const url = tab === "today" ? `${base}leaderboard_daily?${sel}&seed=eq.${dailySeed()}&order=score.desc&limit=50`
      : tab === "season" ? `${base}leaderboard_daily?${sel}&played_at=gte.${encodeURIComponent(since.toISOString())}&order=score.desc&limit=1000`
      : `${base}leaderboard_all?${sel}&order=score.desc&limit=50`;
    const r = await fetch(url, { headers: hdr() });
    if (!r.ok) throw new Error("bad");
    rows = await r.json();
    if (!Array.isArray(rows)) throw new Error("bad");
    rows = rows.map((x) => ({ ...x, wave: x.round }));
  } else {
    rows = JSON.parse(lsGet(LS_KEY, "[]"));
    if (since) rows = rows.filter((r) => new Date(r.played_at) >= since);
    rows.sort((a, b) => b.score - a.score);
  }
  return tab === "season" ? seasonBoard(rows) : rows.slice(0, 50);
}
async function showRanks(tab = "today", again = false) {
  const T = [["today", "📅 오늘"], ["season", "🗓 시즌"], ["all", "🏆 전체"]];
  const tabs = `<div class="tabs">${T.map(([k, l]) => `<button data-t="${k}" class="${tab === k ? "on" : ""}">${l}</button>`).join("")}</div>`;
  const foot = again ? `<button class="wide green" id="again">🔁 다시 하기</button>` : `<button class="wide" id="close">닫기</button>`;
  modal(`<h2>🏆 랭킹</h2>${tabs}<p>불러오는 중…</p>`);
  const wireTabs = () => document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => showRanks(b.dataset.t, again)));
  let list = [];
  try { list = await fetchRanks(tab); } catch { modal(`<h2>🏆 랭킹</h2>${tabs}<p>불러오지 못했어요 😢</p>${foot}`); wireRank(again); wireTabs(); return; }
  const medal = ["🥇", "🥈", "🥉"], sea = tab === "season";
  const li = list.map((r, i) => `<li class="${LAST && r.name === LAST.name && r.score === LAST.score ? "me" : ""}"><span class="no">${medal[i] || i + 1}</span><span class="nm">${esc(r.name)}</span><span class="sc">${r.score}점</span><small>R${r.wave}<br>${sea ? r.days + "일 합" : String(r.played_at).slice(5, 10)}</small></li>`).join("");
  const sub = sea ? `<small>시즌 ${ymd(seasonStart()).slice(5)}~ · 일일 최고점 상위 7일 합</small>` : "<small>일일 챌린지 기록</small>";
  modal(`<h2>🏆 랭킹</h2>${remote() ? "" : "<small>(이 기기 기록 — 서버 미설정)</small><br>"}${sub}${tabs}<ul class="rows">${li || "<li>아직 기록이 없어요. 첫 기록을 남겨요!</li>"}</ul>${foot}`);
  wireRank(again); wireTabs();
}
function wireRank(again) {
  if ($("again")) $("again").onclick = () => restartGame();
  if ($("close")) $("close").onclick = closeModal;
}
function restartGame() {
  const mode = S ? S.mode : "daily";
  $("modal").classList.remove("on"); MODAL_ON = false; MODAL_Q = [];
  GAME.start(mode); uiReset();
}

function uiGameOver(result) {
  const res = result || {}, P = scoreParts(res), win = P.win, practice = S.mode === "practice";
  S.over = true; sfx(win ? "win" : "over"); vib(win ? [100, 50, 100, 50, 300] : 200);
  const bk = practice ? "malang-best-p" : "malang-best2", best = Number(lsGet(bk, "0")), isBest = P.score > best;
  if (isBest) lsSet(bk, String(P.score));
  const parts = `<div class="sc2">라운드 ${P.R} x ${CONST.SCORE.ROUND}<b>${P.R * CONST.SCORE.ROUND}</b><br>처치 ${P.kills}기<b>${P.kills}</b><br>필드 유닛 점수 ${P.U}<b>${P.uPts}</b>${win ? `<br>클리어 보너스${P.left ? ` (남은 ${Math.floor(P.left)}초)` : ""}<b>${CONST.SCORE.WIN + CONST.SCORE.WIN_SEC * Math.floor(P.left)}</b>` : ""}</div>`;
  const why = res.why ? `<small>${esc(res.why)}</small><br>` : "";
  const reg = practice ? `<small>연습 모드는 랭킹에 등록되지 않아요 (이 기기 최고점만 저장)</small><button class="wide" id="skip">🔁 다시 하기</button>`
    : `<input id="nm" maxlength="10" placeholder="닉네임" value="${esc(lsGet("malang-name", ""))}"><button class="wide" id="sub">랭킹에 등록</button><button class="wide mini" id="skip" style="flex-direction:row;padding:9px">그냥 다시 하기</button>`;
  modal(`<h2>${win ? "🎉 클리어!" : "😵 게임 오버!"}</h2>${why}<small>${S.hero.name} · ${practice ? "연습" : "일일 챌린지 " + todayKey()}</small><div class="score">${P.score}</div>${isBest ? '<span class="tag">✨ 내 최고 기록!</span>' : `<small>내 최고 ${best}점</small>`}${parts}${reg}`);
  $("skip").onclick = () => restartGame();
  if ($("sub")) $("sub").onclick = async () => {
    const n = $("nm").value.trim(); lsSet("malang-name", n);
    $("sub").disabled = true; $("sub").textContent = "등록 중…";
    try { await submitScore(n, P); } catch {}
    await showRanks("today", true);
  };
  if (win) uiBanner("클리어! 말랑 왕국을 지켜냈어요!", "win");
}

// ---------- 타이틀 ----------
function setupTitle() {
  const h = heroOfDay(makeRngs(dailySeed()).hero);
  $("todayTxt").innerHTML = `<div class="tt-sub">${todayKey()} 오늘의 히어로</div><div class="tt-name">👑 ${esc(h.name)}</div><div class="tt-rule">${esc(h.rule)}</div>`;
  try {
    if (typeof drawHero === "function") {
      const cv = $("heroMini"), dpr = Math.min(3, window.devicePixelRatio || 1), L = 96; cv.width = cv.height = Math.round(L * dpr);
      const c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, L, L);
      c.save(); c.translate(L / 2, L * 0.54); c.scale(1.05, 1.05); drawHero(c, h.id, 0, 0, 0, {}); c.restore();
    }
  } catch {}
}
function startRun(mode) {
  initAudio(); TITLE_ON = false; $("title").classList.remove("on");
  GAME.start(mode); uiReset(); sfx("wave");
}

// ---------- 버튼 바인딩 ----------
let _bound = false;
function bindUi() {
  if (_bound) return; _bound = true;
  $("draw").onclick = () => { initAudio(); if (GAME.draw() === false && S && !S.over && S.minerals < CONST.DRAW_COST) sfx("deny"); };
  // 합성: 탭 = 선택 칸 합성(경고 시 확인), 길게 = 가능한 만큼 일괄
  const doMerge = (all) => {
    const i = S.sel; if (i < 0) return;
    const run = () => { if (!GAME.canMerge(i).ok) { sfx("deny"); return; } GAME.merge(i, all); };
    const w = GAME.mergeWarning(i);
    const lvs = CLANS.map((c, k) => c.name.replace("무리", "") + clanLevel(S, k)).join(" ");
    if (w) uiConfirm(`${w}\n(무리는 랜덤 · 현재 공업 Lv: ${lvs})`, run); else run();
  };
  let _lp = null, _lpDone = false;
  const mg = $("merge");
  mg.addEventListener("pointerdown", () => { _lpDone = false; clearTimeout(_lp); _lp = setTimeout(() => { _lpDone = true; if (!mg.disabled) { initAudio(); doMerge(true); } }, 550); });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) mg.addEventListener(ev, () => clearTimeout(_lp));
  mg.onclick = () => { if (_lpDone) { _lpDone = false; return; } initAudio(); doMerge(false); };
  $("sell").onclick = () => { if (S.sel >= 0) GAME.sell(S.sel); };
  $("spd").onclick = () => GAME.setSpeed(S.speed >= 3 ? 1 : S.speed + 1);
  $("auto").onclick = () => GAME.toggleAuto();
  $("lock").onclick = () => { if (S.sel >= 0) GAME.toggleLock(S.sel); };
  $("upg").onclick = () => { initAudio(); showUpg(); };
  $("prob").onclick = () => showProb();
  $("rank").onclick = () => showRanks("today");
  $("snd").onclick = () => sndCycle();
  sndLabel();
  $("start").onclick = () => startRun("daily");
  $("startP").onclick = () => startRun("practice");
  $("rank2").onclick = () => showRanks("today");
  $("tickets").onclick = (e) => {
    const t = e.target.closest(".tk"); if (!t) return;
    if (t.dataset.up) uiUpTicket(); else uiTicket(+t.dataset.g);
  };
  $("clanChips").onclick = (e) => { if (e.target.closest(".cc")) { if (S.upTickets > 0) uiUpTicket(); else showUpg(); } };
  setupTitle();
}
if (document.readyState === "complete") bindUi(); else window.addEventListener("load", bindUi);
