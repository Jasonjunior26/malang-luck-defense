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
const AUD = { master: 0.9, sfx: 0.9, bgm: 0.85, maxVoices: 14, bpmBase: 0, bpmRoundMax: 24, bpmDangerMax: 14 }; // bpmBase: 곡별 BGM.*.bpm 에 더하는 보정값(기본 0)
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
// 히든 이상 등장 팡파르(짧은 BGM 스팅어): 등급이 높을수록 음이 늘고 길어진다
for (let g = 4; g < 8; g++) SFX["jingle" + g] = () => { // 음 수는 동시 발음 제한(maxVoices 14) 안에 맞춘다
  const up = [72, 76, 79, 84, 88, 91].slice(0, g), n = up.length;
  arp(up, 0.1, "triangle", 0.075, 0.28, 0.12);
  chord([72, 79], 0.9 + g * 0.12, 0.04, 0.12 + n * 0.1, "triangle"); spark(g - 1, 2200, 0.12 + n * 0.1);
  if (g >= 6) swell(0.9, 0.03, 0.1);
};
for (let c = 0; c < 5; c++) SFX["atk" + c] = () => _atk[c](1 + Math.random() * 0.08);

// 이름별/그룹별 최소 간격(ms). 같은 그룹은 서로 공유.
const _sfxT = {}, _gap = { atk: 70, hit: 70, kill: 45, tick: 400, tap: 40, warn: 900, round: 600, boss: 800, modal: 150, upgrade: 90, draw: 40, merge: 60, deny: 120, sell: 50, over: 1500, win: 1500, jingle: 1500, reso: 300, bossKill: 800 };
const _grp = { atk0: "atk", atk1: "atk", atk2: "atk", atk3: "atk", atk4: "atk", warn2: "warn", wave: "round", drawHi: "draw", ticket: "ticket", jingle4: "jingle", jingle5: "jingle", jingle6: "jingle", jingle7: "jingle" };
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
let TITLE_ON = true, MODAL_Q = [], MODAL_ON = false, CONFIRM_ON = false, _modalAt = 0;
function modal(html) { _modalAt = Date.now(); $("box").innerHTML = html; $("modal").classList.add("on"); MODAL_ON = true; sfx("modal"); if (typeof S !== "undefined" && S && !S.over && !TITLE_ON) S.paused = true; }
function queueModal(fn) { if (MODAL_ON) MODAL_Q.push(fn); else fn(); }
function closeModal() {
  _modalAt = Date.now();
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
  const c = CHARS[idx], g = c.grade, p = gradeProbs(S && S.hero, S && S.rules)[g];
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
function setHtml(id, v) { if (_txt[id] !== v) { _txt[id] = v; $(id).innerHTML = v; return true; } return false; }
function setCls(id, cls, on) { const k = id + "." + cls; if (_txt[k] !== on) { _txt[k] = on; $(id).classList.toggle(cls, on); } }
let _S = null, _hudFrame = 0, _lastRound = 0, _mobLv = 0, _lastSec = -1;
// 공명 상태 추적(표시 전용): 발동/해제 순간 배너, 종류 수 증가 시 칩 강조, 단계 1종 전 힌트
let _resoPrev = null, _resoPulse = [0, 0, 0, 0], _resoSeen = [0, 0, 0, 0]; // _resoSeen: 첫 발동음은 uiLog("공명!")가 담당
function trackReso() {
  const cur = CLANS.map((_, i) => [resonanceCount(S.slots, i), resonanceBonus(S.slots, i)]);
  const prev = _resoPrev; _resoPrev = cur;
  if (!prev) return;
  cur.forEach(([n, b], i) => {
    const [pn, pb] = prev[i], c = CLANS[i];
    if (n > pn) { _resoPulse[i] = 1; setTimeout(() => { _resoPulse[i] = 0; delete _txt.clanRows; }, 1900); delete _txt.clanRows; }
    if (b > pb) { uiBanner(`${c.ico} ${c.name} 공명 +${b}Lv!`, "epic"); vib(60); if (_resoSeen[i]) sfx("reso"); _resoSeen[i] = 1; }
    else if (b < pb) uiBanner(`${c.ico} ${c.name} 공명 해제 (${n}종)`, "warn");
    else if (n > pn && (n === 3 || n === 5)) uiLog(`${c.ico} ${c.name} ${n === 3 ? 4 : 6}종까지 1종 남음`, c.color);
  });
}
function uiReset() { _resoPrev = null; _resoPulse = [0, 0, 0, 0]; _resoSeen = [0, 0, 0, 0]; _lastRound = 0; _mobLv = 0; _lastSec = -1; $("logBox").innerHTML = ""; for (const k in _txt) delete _txt[k]; $("vig").classList.remove("on"); }
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
    setText("hWave", `⚠보스 ${S.round}/${CONST.ROUNDS}`);
    setCls("cWave", "urgent", urgent);
    if (urgent && sec !== _lastSec) { sfx("tick"); }
    _lastSec = sec;
    $("hWaveBar").style.width = Math.max(0, Math.min(100, (left / info.time) * 100)) + "%";
  } else {
    setCls("cWave", "urgent", false);
    setText("hWave", `라운드 ${S.round}/${CONST.ROUNDS}`);
    $("hWaveBar").style.width = Math.min(100, ((S.roundT || 0) / CONST.ROUND_SEC) * 100) + "%";
  }
  const tl = boss ? left : Math.max(0, info.time - (S.roundT || 0)), ts = Math.ceil(tl);
  setText("hCh", `⏱ ${Math.floor(ts / 60)}:${String(ts % 60).padStart(2, "0")}${boss ? " 보스" : ""}`);
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
  // 몹 수: 상한의 80% 이상이면 점수 칸이 👾 N/상한 경고로 바뀐다 (130/145 배너·소리는 그대로)
  const n = S.mobs.length, W80 = CONST.MOB_WARN[0], W90 = CONST.MOB_WARN[1];
  const alarm = n >= Math.ceil(CONST.MOB_LOSE * 0.8) && !S.over;
  setCls("cScore", "alarm", alarm);
  setText("sIco", alarm ? "👾" : "🏆");
  setText("hScore", alarm ? `${n}/${CONST.MOB_LOSE}` : String(S.score()));
  setText("hScoreLbl", alarm ? "몬스터!" : "점수");
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
  const sellable = !!uc && GRADES[uc.grade].sell > 0 && !S.rules.noSell;
  setCls("sell", "on", !!uc);
  $("sell").disabled = !sellable || S.over;
  setHtml("sell", sellable ? `판매 <small>💎${GRADES[uc.grade].sell}</small>` : "판매 불가");
  const mg = u && !S.over ? GAME.canMerge(S.sel) : { ok: false };
  $("merge").disabled = !mg.ok; setCls("merge", "ready", !!mg.ok);
  setHtml("merge", `🔀<small>${mg.ok ? "합성" : u && !u.hero && uc && uc.grade >= 6 ? "불가" : "합성"}</small>`);
  setHtml("spd", `⏩<small>x${S.speed}</small>`);
  setHtml("info", infoText(u));
  const pk = uc ? uc.idx : S.hero ? S.hero.id : "";
  if (_txt.infoPt !== pk) { _txt.infoPt = pk; try { if (pk !== "" && typeof drawPortrait === "function") drawPortrait($("infoPt"), pk, 84); else $("infoPt").getContext("2d").clearRect(0, 0, 84, 84); } catch {} }
  // 무리 4줄 (공업 Lv · 공명 슬롯 · 강화 칩)
  if (setHtml("clanRows", clanRowsHtml())) paintPortraits($("clanRows"), 44);
  trackReso();
}
// 보드 아래 무리 줄: [아이콘 Lv(+공명)] [서로 다른 등급 유닛 슬롯 4칸, 4종 달성 후 6칸] [⬆💎비용(🎫N)]
function clanRowsHtml() {
  return CLANS.map((c, i) => {
    const have = []; for (let g = 0; g < GRADES.length; g++) if (S.slots.some((s) => s && !s.hero && s.ch === g * 4 + i)) have.push(g);
    const n = have.length, rb = resonanceBonus(S.slots, i), cap = n >= 4 ? 6 : 4, shown = have.slice(-cap);
    const slots = []; for (let k = 0; k < cap; k++) {
      if (k < shown.length) { const ci = shown[k] * 4 + i; slots.push(`<i class="sl on"><canvas data-i="${ci}" width="44" height="44" title="${esc(gname(shown[k]) + " " + CHARS[ci].name)}"></canvas></i>`); }
      else slots.push(k === shown.length && (n === 3 || n === 5) ? `<i class="sl nx">?</i>` : `<i class="sl"></i>`);
    }
    const up = S.up[i], maxed = up.bought >= CONST.UP_MAX, cost = upgradeCost(up.bought), ok = !maxed && S.minerals >= cost && !S.over;
    const lv = S.lv && S.lv[i] != null ? S.lv[i] : clanLevel(S, i);
    return `<div class="cr${rb ? " rz" : ""}${_resoPulse[i] > 0 ? " pulse" : ""}" data-c="${i}" style="--cc:${c.color}"><span class="ci">${c.ico}</span><span class="lv"><b>Lv${lv}</b>${rb ? `<em class="pill">+${rb}</em>` : ""}</span><span class="sls">${slots.join("")}</span><span class="uc${ok ? " ok" : ""}" data-up="${i}">${maxed ? "MAX" : "⬆💎" + cost}${S.upTickets > 0 ? `<u>🎫${S.upTickets}</u>` : ""}</span></div>`;
  }).join("");
}
// 정보 패널: 기본/히어로 선택 = 히어로 규칙 + 진행도(+보관 선택권), 유닛 선택 = 상세
function infoText(u) {
  if (!u || u.hero) {
    if (!S.hero) return "";
    const hs = S.heroState && S.heroState.progress;
    return `<div class="ln">👑 <b>${esc(S.hero.name)}</b> (히어로)${hs ? ` · <small>${esc(hs)}</small>` : ""}</div><div class="ln sm">${esc(S.hero.rule)}</div><div class="ln sm">${u ? "이동·판매·합성 불가" : ""}</div>`;
  }
  const c = CHARS[u.ch], g = c.grade, cl = CLANS[c.clan], lv = S.lv && S.lv[c.clan] != null ? S.lv[c.clan] : clanLevel(S, c.clan), mul = dmgMul(lv);
  const dps = (c.atk / c.cd) * mul * u.n;
  const fxn = FX_NAME[c.fx] || c.fx;
  return `<div class="ln">${gbadge(g)} <b>${esc(c.name)}</b> ${cl.ico} x${u.n}</div><div class="ln sm">공격 ${fmt(c.atk * mul)} · DPS ${fmt(dps)} · ${fxn}</div><div class="ln sm">${cl.ico}${cl.name} 공업 Lv${lv} (x${mul.toFixed(2)}) · 사거리 ${c.range}${u.lock ? " · 🔒" : ""}</div>`;
}
const FX_NAME = { shot: "투척", tongue: "혀 공격", slash: "할퀴기", wave: "음파", roar: "포효(광역)", beam: "광선(관통)", breath: "숨결(광역)", chain: "연쇄", lob: "포물선 폭탄", nova: "전체 파동", meteor: "유성", storm: "폭풍" };

// ---------- 확률표 ----------
function paintPortraits(root, px) {
  root.querySelectorAll("canvas[data-i]").forEach((cv) => {
    const i = +cv.dataset.i;
    try { if (typeof drawPortrait === "function") { cv.width = cv.height = px; drawPortrait(cv, i, px); } } catch {}
  });
}
function showProb() {
  const probs = gradeProbs(S && S.hero, S && S.rules), lucky = S && S.hero && S.hero.fx.probMod === "lucky";
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
function renderMenuTk() {
  const tk = {}; (S && S.tickets || []).forEach((g) => (tk[g] = (tk[g] || 0) + 1));
  $("menuTk").innerHTML = Object.keys(tk).map((g) => `<button class="mini tk" data-g="${g}" style="color:${GCOL(+g)}">🎫<small>${gname(+g)} 선택권${tk[g] > 1 ? " x" + tk[g] : ""}</small></button>`).join("");
}
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
// 보스 처치 공업권: 모달 없이 알리고 보관(무리 줄의 ⬆ 칩 🎫 뱃지로 사용). game.js 가 S.paused=true 로 부르므로 여기서 푼다.
function uiUpTicket() {
  queueModal(() => {
    if (S && !S.over && !TITLE_ON && !MODAL_ON && !CONFIRM_ON) S.paused = false;
    if (S && S.upTickets > 0) { uiBanner(`⬆ 무료 공업권 +1! (무리 줄 ⬆칩 🎫${S.upTickets})`, "info"); sfx("ticket"); }
  });
}

// ---------- 무리 줄 말풍선 (공업 구매 선택 / 공명 설명) ----------
function hidePop() { const p = $("pop"); if (p) p.classList.remove("on"); clearTimeout(hidePop._t); }
function showPop(html, row, x, ms) {
  const p = $("pop"); p.innerHTML = html; p.classList.add("on");
  const r = row.getBoundingClientRect(), W = window.innerWidth, pw = p.offsetWidth;
  const right = Math.max(6, W - r.right);
  p.style.right = right + "px"; p.style.left = "auto";
  p.style.bottom = (window.innerHeight - r.top + 9) + "px"; p.style.top = "auto";
  const popRight = W - right, ax = Math.max(10, Math.min(pw - 22, popRight - x - 6));
  p.style.setProperty("--ax", ax + "px");
  clearTimeout(hidePop._t); if (ms) hidePop._t = setTimeout(hidePop, ms);
}
function resoHint(c, row, x) {
  const R = CONST.RESONANCE, n = resonanceCount(S.slots, c), cl = CLANS[c];
  showPop(`<div>다른 등급 4종 → 공업 <b>+${R[4]}Lv</b>, 6종 → <b>+${R[6]}Lv</b></div><small>${cl.ico} ${cl.name} 지금 ${n}종 · 히어로 제외</small>`, row, x, 3200);
}
function upChoice(c, row, x) {
  const cl = CLANS[c], up = S.up[c], maxed = up.bought >= CONST.UP_MAX, cost = upgradeCost(up.bought), lv = S.lv[c];
  showPop(`<div><b>${cl.ico} ${cl.name}</b> Lv${lv} → Lv${Math.min(CONST.UP_LV_CAP, lv + 1)}</div><button class="free" data-pick="t">🎫 무료 · ${S.upTickets}장</button><button class="paid" data-pick="m" ${!maxed && S.minerals >= cost ? "" : "disabled"}>${maxed ? "구매 MAX" : "💎 " + cost}</button>`, row, x, 6000);
  $("pop").onclick = (e) => {
    const b = e.target.closest("button[data-pick]"); if (!b || b.disabled) return;
    hidePop();
    if (b.dataset.pick === "t") { if (GAME.useUpTicket(c) === false) sfx("deny"); }
    else if (GAME.upgrade(c) === false) sfx("deny");
  };
}

// ---------- 랭킹 ----------
const LS_KEY = "malang-ranks2";
const remote = () => CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY;
const hdr = () => { const k = CONFIG.SUPABASE_ANON_KEY, h = { apikey: k, "Content-Type": "application/json" }; if (String(k).startsWith("eyJ")) h.Authorization = "Bearer " + k; return h; }; // sb_publishable_ 키는 JWT 가 아니므로 Bearer 로 보내지 않는다
const GAME_VER = "4";
let LAST = null; // 방금 등록한 내 기록 (강조용)
const ymd = (d) => { const p = (n) => (n < 10 ? "0" : "") + n; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); };
function scoreParts(res) {
  const R = res.round != null ? res.round : S.round, kills = res.kills != null ? res.kills : S.kills;
  const win = res.win != null ? !!res.win : !!S.win;
  const left = res.bossLeft != null ? res.bossLeft : Math.max(0, S.bossT || 0);
  const U = res.unitPts != null ? res.unitPts : unitPoints(S.slots);
  const score = res.score != null ? res.score : calcScore(R, kills, U, win, left);
  return { R, kills, win, left, U, score, uPts: Math.floor(Math.min(U, CONST.SCORE.UNIT_CAP) * CONST.SCORE.UNIT_MUL) };
}
// ---- 닉네임 / 서버 통신: 닉네임은 처음에 한 번 정하면 기기(device_id)에 붙어 계속 쓰인다. 서버가 중복·변경 횟수를 강제한다 ----
const DEV_KEY = "malang-device", QUEUE_KEY = "malang-queue", QUEUE_MAX = 20;
const NAME_KEY = "malang-name", NAME_OK = "malang-name-ok", CHG_KEY = "malang-name-chg"; // NAME_OK="1": 서버 등록 확인됨, CHG_KEY: 오프라인 모드에서 마지막으로 바꾼 KST 날짜
const BTNR = 'style="flex-direction:row;padding:9px"';
const nf = (n) => Number(n).toLocaleString("en-US");
const myName = () => lsGet(NAME_KEY, "");
const NAME_ERR_MSG = { len: "2~10자로 정해 주세요", chars: "한글·영문·숫자·공백(_ . - 포함)만 쓸 수 있어요", bad: "쓸 수 없는 단어가 들어 있어요" };
const SRV_ERR_MSG = { name_taken: "이미 쓰는 사람이 있는 닉네임이에요 😢", bad_name_len: NAME_ERR_MSG.len, bad_name_chars: NAME_ERR_MSG.chars, bad_name: NAME_ERR_MSG.bad,
  unauthorized: "로그인이 만료됐어요. 다시 로그인해 주세요", device_linked_other: "이 기기의 기록은 이미 다른 카카오 계정에 연결돼 있어요", no_player: "먼저 닉네임을 정하고 한 판 해 주세요",
  rate_limited: "너무 빨라요! 잠시 뒤에 다시 해 주세요", server_error: "서버가 잠깐 아파요. 다시 해 주세요", rename_cooldown: "오늘은 이미 바꿨어요. 내일 0시(한국 시간) 이후에 바꿀 수 있어요" };
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
// Edge Function 호출. 반환 {st: HTTP 상태(네트워크 실패=0), d: 응답 JSON}
async function api(action, body = {}) {
  try {
    const headers = { "Content-Type": "application/json" };
    if (action === "link" || action === "me" || action.startsWith("ps")) { const t = window.AUTH && await AUTH.token(); if (!t) return { st: 401, d: { error: "unauthorized" } }; headers.Authorization = "Bearer " + t; } // 계정 액션만 JWT 를 보낸다
    const r = await fetch(CONFIG.SUPABASE_URL + "/functions/v1/submit-score", { method: "POST", headers, body: JSON.stringify({ action, device_id: deviceId(), ...body }) });
    let d = {}; try { d = await r.json(); } catch {}
    return { st: r.status, d };
  } catch { return { st: 0, d: {} }; }
}
// 서버에 닉네임 등록(이미 있으면 서버 값으로 동기화). 반환: ok | taken | bad | offline | noname
async function ensureRegistered() {
  const n = myName(); if (!n) return "noname";
  const r = await api("register", { name: n });
  if (r.st === 200) { lsSet(NAME_OK, "1"); if (r.d.name && r.d.name !== n) lsSet(NAME_KEY, r.d.name); return "ok"; }
  if (r.st === 409) return "taken";
  if (r.st === 400) return "bad";
  return "offline";
}
// ---- 카카오 계정 연결 (게스트 우선: 로그인은 선택). 흐름은 docs/소셜_기획안.md §2 ①② ----
const LINK_NO = "malang-link-no"; // "1": 연결 제안을 거절함(프로필에서 직접 연결 가능)
const kakaoOn = () => !!(window.AUTH && AUTH.enabled());
const kakaoNick = () => (window.AUTH && AUTH.user() ? AUTH.user().nick : "");
const okModal = (h, p) => { modal(`<h2>${h}</h2><p style="font-size:13px;line-height:1.45">${p}</p><button class="wide" id="lkOk">확인</button>`); $("lkOk").onclick = closeModal; };
function adoptPlayer(p) { // 계정에 연결된 player 를 이 기기에서 쓴다 (기기 로컬 player 는 병합하지 않는다)
  lsSet(DEV_KEY, p.device_id); lsSet(NAME_KEY, p.name); lsSet(NAME_OK, "1"); qSet([]);
}
async function doLink(back) { // 현재 기기 player 를 계정에 연결
  const r = await api("link");
  if (r.st === 200 && r.d.ok) {
    const ap = r.d.account_player;
    if (ap && ap.device_id !== deviceId()) { adoptPlayer(ap); refreshTitle(); okModal("💛 계정 연결됨", `이미 계정에 있던 <b>${esc(ap.name)}</b> 기록을 불러왔어요.<br>이 기기의 예전 기록은 합치지 않고 그대로 두었어요.`); return; }
    lsSet(LINK_NO, ""); refreshTitle(); if (back) back(); else closeModal(); return;
  }
  sfx("deny");
  okModal("💛 연결하지 못했어요", esc(r.st === 0 ? "연결이 안 돼요. 인터넷을 확인해 주세요" : SRV_ERR_MSG[r.d.error] || "잠시 뒤에 다시 해 주세요"));
}
async function offerLink(back) { // "이 기기의 기록 N건을 계정에 연결할까요?"
  const pr = await api("profile"), n = pr.st === 200 && pr.d.profile && pr.d.profile.exists ? pr.d.profile.plays || 0 : 0;
  modal(`<h2>💛 기록을 계정에 연결할까요?</h2><p style="font-size:13px;line-height:1.45">이 기기의 기록 <b>${n}건</b>(<b>${esc(myName())}</b>)을 카카오 계정${kakaoNick() ? " <b>" + esc(kakaoNick()) + "</b>" : ""}에 연결해요.<br>기기를 바꿔도 로그인하면 기록을 이어 쓸 수 있어요.</p><button class="wide" id="lkYes">연결하기</button><button class="wide mini" id="lkNo" ${BTNR}>나중에</button>`);
  $("lkYes").onclick = () => { $("lkYes").disabled = true; doLink(back); };
  $("lkNo").onclick = () => { lsSet(LINK_NO, "1"); if (back) back(); else closeModal(); };
}
// 로그인 상태에서 계정과 이 기기를 맞춘다. 앱 시작 시 한 번(로그인 복귀 직후 포함).
async function syncAccount() {
  if (!remote() || !window.AUTH) return;
  if (AUTH.error) { const e = AUTH.error; AUTH.error = ""; okModal("로그인하지 못했어요", `카카오 로그인이 취소되었거나 실패했어요.<br>계정 없이도 그대로 플레이할 수 있어요.<br><small>${esc(e).slice(0, 80)}</small>`); return; }
  if (!AUTH.signedIn()) return;
  const r = await api("me");
  if (r.st === 401) { AUTH.clear(); refreshTitle(); return; }
  if (r.st !== 200) return;
  const ap = r.d.account_player;
  if (ap) {
    if (ap.device_id === deviceId()) return;
    const had = !!myName();
    adoptPlayer(ap); refreshTitle();
    okModal("💛 계정 불러옴", `카카오 계정의 <b>${esc(ap.name)}</b> 기록을 이 기기에서 쓰도록 바꿨어요.${had ? "<br>이 기기에 있던 예전 닉네임·기록은 합치지 않고 그대로 남겨 두었어요." : ""}`);
    return;
  }
  if (lsGet(NAME_OK, "") === "1" && (AUTH.fresh || lsGet(LINK_NO, "") !== "1")) offerLink();
}
let FLUSHING = false;
// 반환 st: "ok"(저장/이미 더 높은 기록) | "drop"(서버가 거부: 재전송해도 소용없음) | "retry"(네트워크/서버 오류, 큐 유지)
async function postScore(payload) {
  const r = await api("submit", payload);
  if (r.st === 0 || r.st === 429 || r.st === 408 || r.st >= 500) return { st: "retry", d: r.d };
  return { st: r.st === 200 ? "ok" : "drop", d: r.d };
}
async function flushQueue() {
  if (FLUSHING || !remote() || !qGet().length) return;
  FLUSHING = true;
  try {
    for (const item of qGet()) {
      let r = await postScore(item);
      if (r.st === "drop" && r.d.error === "no_player" && (await ensureRegistered()) === "ok") r = await postScore(item);
      if (r.st === "retry") break;
      qSet(qGet().filter((x) => x.qid !== item.qid));
    }
  } finally { FLUSHING = false; }
}
if (typeof window !== "undefined") { window.addEventListener("online", flushQueue); setTimeout(flushQueue, 2500); }

// ---- 시즌 ----
const phaseNow = () => seasonPhase(kstDate());
const dailyOpen = () => phaseNow().phase === "live";
const seasonLeft = (s) => dayDiff(kstDate(), s.end); // 종료일까지 남은 날 (마지막 날 = 0)
const md = (d) => d.slice(5).replace("-", "/");
function localRows() { try { const l = JSON.parse(lsGet(LS_KEY, "[]")); return Array.isArray(l) ? l : []; } catch { return []; } }
function localBoard(s) { // 서버 미설정/오프라인: 시즌 내 이름별 최고점 1건, 동점은 먼저 달성한 사람 우선
  if (!s) return [];
  const by = {};
  for (const r of localRows()) { const d = kstDate(Date.parse(r.played_at)); if (d < s.start || d > s.end) continue; const o = by[r.name]; if (!o || r.score > o.score) by[r.name] = r; }
  return Object.values(by).sort((a, b) => b.score - a.score || (a.played_at < b.played_at ? -1 : 1)).map((r, i) => ({ ...r, rank: i + 1 }));
}
async function getJSON(url) {
  const r = await fetch(url, { headers: hdr() });
  if (!r.ok) throw new Error("bad");
  const j = await r.json(); if (!Array.isArray(j)) throw new Error("bad");
  return j;
}

// ---- 랭킹 제출 ----
async function submitScore(P) {
  const name = myName();
  LAST = { name, score: P.score };
  if (S.mode !== "daily") return { st: "local", d: null }; // 연습 모드는 서버에 보내지 않는다 (이 기기 최고점만 uiGameOver 에서 저장)
  if (remote()) {
    if (lsGet(NAME_OK, "") !== "1") { const rr = await ensureRegistered(); if (rr !== "ok") return { st: "noname", d: { why: rr } }; }
    const item = { qid: Date.now() + "-" + Math.random().toString(36).slice(2, 8), mode: "daily", seed: S.seed, ver: GAME_VER, inputs: S.inputs, claimedScore: P.score, claimedRound: P.R, win: !!P.win, device_id: deviceId() };
    let r = await postScore(item);
    if (r.st === "drop" && r.d.error === "no_player") { lsSet(NAME_OK, ""); if ((await ensureRegistered()) === "ok") r = await postScore(item); }
    if (r.st === "retry") { qSet([...qGet(), item]); return { st: "queued", d: r.d }; }
    flushQueue(); // 이전에 밀린 기록도 이어서 전송
    return r;
  }
  const s = phaseNow().season, before = localBoard(s).find((x) => x.name === name);
  const l = localRows();
  l.push({ name, score: P.score, wave: P.R, win: !!P.win, hero: S.hero.id, seed: S.seed, played_at: new Date().toISOString() });
  lsSet(LS_KEY, JSON.stringify(l));
  const b = localBoard(s), me = b.find((x) => x.name === name);
  return { st: "local", d: { ok: true, name, rank_before: before ? before.rank : null, prev_best: before ? before.score : null, rank_after: me.rank, season_best: me.score,
    next_score: me.rank > 1 ? b[me.rank - 2].score : null, top_score: b[0].score, total: b.length, saved: true, best: P.score } };
}
// 게임오버 화면의 순위 변동 문구: "12위 → 7위 ▲5", 다음 순위까지 필요한 점수
function rankResultHtml(r, P) {
  const d = r.d || {};
  if (r.st === "queued") return { html: "📶 인터넷이 불안해요. 연결되면 자동으로 랭킹에 등록할게요", cheer: false };
  if (r.st === "noname") return { html: "닉네임 등록이 아직이에요. 🏆 랭킹 → 👤 프로필에서 정해 주세요", cheer: false };
  if (r.st === "local" && !d.ok) return { html: "", cheer: false };
  if (r.st === "drop" || !d.ok) {
    const m = { season_closed: "시즌이 끝나서 랭킹에 등록되지 않아요", season_not_started: "시즌이 아직 시작 전이에요", ver_mismatch: "새 버전이 나왔어요! 새로고침해 주세요", score_mismatch: "검증에 실패해서 등록되지 않았어요", replay_failed: "검증에 실패해서 등록되지 않았어요" }[d.error];
    return { html: m || "랭킹 등록에 실패했어요 😢", cheer: false };
  }
  const best = d.season_best, rb = d.rank_before, ra = d.rank_after, newBest = d.prev_best == null || best > d.prev_best;
  let h = r.st === "local" ? "<small>(이 기기 기록 · 서버 미설정)</small>" : "";
  if (newBest) h += rb == null ? `🎉 시즌 첫 기록! <b>${ra}위</b>${d.total ? ` <small>/ ${d.total}명</small>` : ""}`
    : ra < rb ? `✨ 시즌 최고점 갱신!<br><b>${rb}위 → ${ra}위 ▲${rb - ra}</b>` : `✨ 시즌 최고점 갱신! <b>${ra}위</b> 유지`;
  else h += `시즌 최고점(${nf(best)}점)에는 못 미쳤어요<br>현재 <b>${ra}위</b>`;
  if (newBest && d.prev_best != null) h += `<small>${nf(d.prev_best)}점 → ${nf(best)}점</small>`;
  if (ra === 1) h += `<small>👑 지금 1위예요! 지켜내요</small>`;
  else {
    if (d.next_score != null) h += `<small>다음 순위까지 ${nf(d.next_score - best + 1)}점!</small>`;
    if (ra > 2 && d.top_score != null) h += `<small>1위까지 ${nf(d.top_score - best + 1)}점</small>`;
  }
  if (d.saved === false && d.best != null) h += `<small>오늘 최고 기록은 ${nf(d.best)}점이에요</small>`;
  return { html: h, cheer: newBest };
}
async function finishRank(P) {
  const box = $("rk"); if (!box) return;
  const ph = phaseNow();
  if (ph.phase !== "live") { box.textContent = "시즌 기간이 아니라 랭킹에는 등록되지 않아요"; return; }
  let r;
  try { r = await submitScore(P); } catch { r = { st: "drop", d: {} }; }
  const b2 = $("rk"); if (!b2) return; // 그 사이 화면이 바뀜
  const o = rankResultHtml(r, P);
  b2.innerHTML = (o.html || "") + (kakaoOn() && !AUTH.signedIn() && r.st !== "local" ? `<button class="wide mini" id="rkKk" ${BTNR}>💛 카카오로 기록 지키기</button>` : "");
  if ($("rkKk")) $("rkKk").onclick = () => AUTH.login();
  if (o.cheer) { b2.classList.add("cheer"); sfx("reso"); vib([60, 40, 120]); }
  refreshTitle();
}

// ---- 닉네임 정하기 / 바꾸기 / 계정 이전 ----
function showNick(msg, then) { // 처음 실행(닉네임 없음) 또는 서버 등록 실패 시. 닫을 수 없다.
  modal(`<h2>👋 닉네임을 정해요</h2><p style="font-size:13px;margin:4px 0;line-height:1.4">랭킹에 보이는 이름이에요.<br>한 번 정하면 계속 쓰고, 하루에 한 번만 바꿀 수 있어요.</p><input id="nk" maxlength="10" placeholder="2~10자" value="${esc(myName())}" autocomplete="off"><div class="nkmsg" id="nkMsg">${msg ? esc(msg) : ""}</div><button class="wide green" id="nkOk">이 닉네임으로 시작</button><button class="wide mini" id="nkImp" ${BTNR}>📥 이미 계정이 있어요 (이전 코드)</button>${kakaoOn() ? `<button class="wide mini" id="nkKk" ${BTNR}>💛 카카오로 불러오기</button>` : ""}`);
  const say = (t) => { $("nkMsg").textContent = t; };
  $("nkImp").onclick = () => showImport(() => showNick(msg, then));
  if ($("nkKk")) $("nkKk").onclick = () => AUTH.login();
  $("nkOk").onclick = async () => {
    const c = checkName($("nk").value);
    if (!c.ok) { say(NAME_ERR_MSG[c.err]); sfx("deny"); return; }
    lsSet(NAME_KEY, c.name);
    if (!remote()) { lsSet(NAME_OK, ""); closeModal(); refreshTitle(); if (then) then(); return; }
    $("nkOk").disabled = true; say("확인 중…");
    const rr = await ensureRegistered();
    if (rr === "taken" || rr === "bad") { lsSet(NAME_KEY, ""); lsSet(NAME_OK, ""); $("nkOk").disabled = false; say(rr === "taken" ? SRV_ERR_MSG.name_taken : NAME_ERR_MSG.bad); sfx("deny"); return; }
    closeModal(); refreshTitle(); if (then) then(); // offline 이면 이 기기에만 저장해 두고 나중에 첫 제출 때 다시 등록 시도
  };
}
function showRename(back) {
  modal(`<h2>✏️ 닉네임 바꾸기</h2><p style="font-size:13px;margin:4px 0;line-height:1.4">하루에 한 번만 바꿀 수 있어요.<br>바꾸면 지난 기록도 새 이름으로 보여요.</p><input id="nk" maxlength="10" value="${esc(myName())}" autocomplete="off"><div class="nkmsg" id="nkMsg"></div><button class="wide green" id="nkOk">바꾸기</button><button class="wide mini" id="nkNo" ${BTNR}>취소</button>`);
  const say = (t) => { $("nkMsg").textContent = t; };
  $("nkNo").onclick = () => showProfile(back);
  $("nkOk").onclick = async () => {
    const c = checkName($("nk").value);
    if (!c.ok) { say(NAME_ERR_MSG[c.err]); sfx("deny"); return; }
    if (c.name === myName()) { say("지금 닉네임과 같아요"); return; }
    if (!remote()) {
      if (lsGet(CHG_KEY, "") === kstDate()) { say(SRV_ERR_MSG.rename_cooldown); sfx("deny"); return; }
      lsSet(NAME_KEY, c.name); lsSet(CHG_KEY, kstDate()); refreshTitle(); showProfile(back); return;
    }
    $("nkOk").disabled = true; say("바꾸는 중…");
    if (lsGet(NAME_OK, "") !== "1") { // 아직 서버에 등록 전이면 새 이름으로 바로 등록
      const old = myName(); lsSet(NAME_KEY, c.name); const rr = await ensureRegistered();
      if (rr === "ok") { refreshTitle(); showProfile(back); return; }
      lsSet(NAME_KEY, old); $("nkOk").disabled = false; say(rr === "taken" ? SRV_ERR_MSG.name_taken : "연결이 안 돼요. 인터넷을 확인해 주세요"); return;
    }
    const r = await api("rename", { name: c.name });
    if (r.st === 200) { lsSet(NAME_KEY, r.d.name || c.name); refreshTitle(); showProfile(back); return; }
    $("nkOk").disabled = false; sfx("deny");
    if (r.st === 0) say("연결이 안 돼요. 인터넷을 확인해 주세요");
    else if (r.d.error === "no_player") { lsSet(NAME_OK, ""); say("다시 한 번 눌러 주세요"); }
    else say(SRV_ERR_MSG[r.d.error] || "바꾸지 못했어요 😢");
  };
}
function showImport(back) {
  modal(`<h2>📥 계정 불러오기</h2><p style="font-size:13px;margin:4px 0;line-height:1.4">다른 기기에서 복사한 이전 코드를 붙여넣어요.<br>이 기기의 닉네임과 기록은 불러온 계정으로 바뀌어요.</p><input id="ic" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autocomplete="off" style="font-size:13px;width:92%"><div class="nkmsg" id="nkMsg"></div><button class="wide green" id="icOk">불러오기</button><button class="wide mini" id="icNo" ${BTNR}>취소</button>`);
  const say = (t) => { $("nkMsg").textContent = t; };
  $("icNo").onclick = () => back();
  $("icOk").onclick = async () => {
    const code = $("ic").value.trim().toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(code)) { say("코드 모양이 달라요 (36자)"); sfx("deny"); return; }
    if (!remote()) { say("서버가 설정되지 않아 불러올 수 없어요"); return; }
    $("icOk").disabled = true; say("확인 중…");
    const r = await api("import", { code });
    $("icOk").disabled = false;
    if (r.st === 200 && r.d.name) { lsSet(DEV_KEY, code); lsSet(NAME_KEY, r.d.name); lsSet(NAME_OK, "1"); qSet([]); sfx("ticket"); refreshTitle(); closeModal(); return; }
    sfx("deny");
    say(r.st === 404 ? "그 코드의 계정을 찾지 못했어요" : r.st === 0 ? "연결이 안 돼요. 인터넷을 확인해 주세요" : SRV_ERR_MSG[r.d.error] || "불러오지 못했어요 😢");
  };
}
function kakaoBox() { // 프로필의 카카오 계정 영역 (게스트 우선: 연결은 선택)
  if (!window.AUTH) return "";
  if (AUTH.signedIn()) return `<div class="sc2" style="text-align:center">💛 카카오 연결됨${kakaoNick() ? " · " + esc(kakaoNick()) : ""}</div>${myName() && lsGet(NAME_OK, "") === "1" ? `<button class="wide mini" id="pfLink" ${BTNR}>🔗 이 기기 기록 계정에 연결</button>` : ""}<button class="wide mini" id="pfOut" ${BTNR}>로그아웃</button>`;
  return kakaoOn() ? `<button class="wide mini" id="pfKk" ${BTNR}>💛 카카오로 계정 연결</button>` : `<button class="wide mini" disabled ${BTNR}>💛 카카오 계정 연결 (준비 중)</button>`;
}
async function showProfile(back) {
  const close = back || closeModal;
  modal(`<h2>👤 내 프로필</h2><p>불러오는 중…</p>`);
  const ph = phaseNow(), nm = myName();
  let pf = null;
  if (remote() && nm) { const r = await api("profile"); if (r.st === 200 && r.d.profile && r.d.profile.exists) pf = r.d.profile; }
  let can = true, st;
  if (pf) {
    can = !!pf.can_change;
    st = { best: pf.season_best, rank: pf.season_rank, total: pf.season_total, days: pf.season_days, plays: pf.plays, all: pf.all_best };
  } else {
    can = lsGet(CHG_KEY, "") !== kstDate();
    const b = localBoard(ph.season), me = b.find((x) => x.name === nm), rows = localRows().filter((x) => x.name === nm);
    st = { best: me ? me.score : null, rank: me ? me.rank : null, total: b.length, days: me ? rows.length : 0, plays: rows.length, all: rows.reduce((a, x) => Math.max(a, x.score), 0) };
  }
  const row = (k, v) => `${k}<b>${v}</b><br>`;
  const stats = `<div class="sc2">${row("시즌 최고점", st.best != null ? nf(st.best) + "점" : "-")}${row("시즌 순위", st.rank != null ? `${st.rank}위 / ${st.total}명` : "-")}${row("이번 시즌 기록", (st.days || 0) + "일")}${row("누적 판수", (st.plays || 0) + "판")}${row("전체 최고점", st.all ? nf(st.all) + "점" : "-")}</div>`;
  modal(`<h2>👤 내 프로필</h2><div class="score" style="font-size:30px">${nm ? esc(nm) : "(닉네임 없음)"}</div>${remote() && !pf && nm ? "<small>서버에 연결하지 못해 이 기기 기록만 보여요</small>" : ""}
    <button class="wide mini" id="pfRen" ${can ? "" : "disabled"} ${BTNR}>✏️ 닉네임 바꾸기</button>${can ? "" : `<small>${SRV_ERR_MSG.rename_cooldown}</small>`}
    ${kakaoBox()}${stats}<button class="wide mini" id="pfShow" ${BTNR}>🔑 이전 코드 보기</button>
    <div id="pfCode" style="display:none"><div class="codebox">${deviceId()}</div><small style="color:#d4182e">⚠ 이 코드를 아는 사람은 내 기록과 닉네임을 그대로 쓸 수 있어요.<br>다른 사람에게 보여주거나 올리지 마세요!</small><button class="wide mini" id="pfCopy" ${BTNR}>📋 복사</button></div>
    <button class="wide mini" id="pfImp" ${BTNR}>📥 다른 기기에서 불러오기</button><button class="wide" id="pfClose">닫기</button>`);
  $("pfClose").onclick = close;
  if ($("pfKk")) $("pfKk").onclick = () => AUTH.login();
  if ($("pfLink")) $("pfLink").onclick = () => offerLink(() => showProfile(back));
  if ($("pfOut")) $("pfOut").onclick = async () => { await AUTH.logout(); refreshTitle(); showProfile(back); };
  $("pfRen").onclick = () => { if (can) showRename(back); };
  $("pfImp").onclick = () => showImport(() => showProfile(back));
  $("pfShow").onclick = () => { $("pfCode").style.display = "block"; $("pfShow").style.display = "none"; };
  $("pfCopy").onclick = async () => {
    try { await navigator.clipboard.writeText(deviceId()); $("pfCopy").textContent = "✅ 복사했어요"; }
    catch { try { window.prompt("이 코드를 복사하세요", deviceId()); } catch {} }
  };
}

// ---- 랭킹 모달 (시즌 전체 / 오늘 / 내 기록) ----
function kstMidnightISO() { return encodeURIComponent(new Date(Date.parse(kstDate() + "T00:00:00+09:00")).toISOString()); }
async function fetchRanks(tab, ph) {
  const s = ph.season; if (!s) return [];
  if (remote()) {
    const base = `${CONFIG.SUPABASE_URL}/rest/v1/`, sel = "select=name,score,round,win,hero,build,played_at";
    const url = tab === "today" ? `${base}leaderboard_daily?${sel}&season=eq.${s.id}&played_at=gte.${kstMidnightISO()}&order=score.desc&limit=300`
      : `${base}leaderboard_season?${sel},rank&season=eq.${s.id}&order=rank.asc&limit=1000`;
    const rows = (await getJSON(url)).map((x) => ({ ...x, wave: x.round }));
    if (tab !== "today") return rows;
    const seen = new Set(); // 판마다 시드가 달라 한 사람의 기록이 여러 건 -> 오늘 최고 1건만
    return rows.filter((x) => !seen.has(x.name) && seen.add(x.name));
  }
  if (tab === "today") return localRows().filter((r) => kstDate(Date.parse(r.played_at)) === kstDate() && kstDate(Date.parse(r.played_at)) >= s.start && kstDate(Date.parse(r.played_at)) <= s.end).sort((a, b) => b.score - a.score);
  return localBoard(s);
}
// 랭킹 줄 아래 한 줄: 무리별 '유닛수·Lv'(Lv=최종 공업 Lv, 공명 포함) + 판 중 최고 등급. build 가 없으면(구 기록) 빈 문자열.
const buildTag = (b) => {
  if (!b || !Array.isArray(b.clans) || b.clans.length !== 4 || !(b.top >= 0 && b.top <= 7)) return "";
  return `<small class="bd">${b.clans.map((c, i) => `${CLANS[i].ico}${c.n | 0}·Lv${c.lv | 0}`).join(" ")} · 최고 <b style="color:${GRADES[b.top].color}">${GRADES[b.top].name}</b></small>`;
};
const heroTag = (id) => { const h = id && HEROES.find((x) => x.id === id); return h ? ` · ${esc(h.name.split(" ").pop())}` : ""; }; // 랭킹 줄에 쓴 히어로 이름(짧게)
async function showRanks(tab = "season", again = false) {
  const ph = phaseNow(), s = ph.season, nm = myName();
  const T = [["season", "🏆 시즌 랭킹", 2.3], ["today", "📅 오늘", 1], ["mine", "🙋 내 기록", 1.3]];
  const tabs = `<div class="tabs">${T.map(([k, l, f]) => `<button data-t="${k}" style="flex:${f}" class="${tab === k ? "on" : ""}">${l}</button>`).join("")}</div>`;
  const sub = !s ? "<small>시즌 정보가 없어요</small>" : ph.phase === "live" ? `<small>${esc(s.name)} · ${md(s.start)}~${md(s.end)} · ${seasonLeft(s) === 0 ? "오늘이 마지막 날!" : "종료까지 " + seasonLeft(s) + "일"}</small>`
    : ph.phase === "before" ? `<small>${esc(s.name)} 준비 중 · ${md(s.start)} 시작</small>` : `<small>${esc(s.name)} 종료 (${md(s.start)}~${md(s.end)}) · 최종 순위</small>`;
  const head = `<h2>🏆 랭킹</h2>${remote() ? "" : "<small>(이 기기 기록 — 서버 미설정)</small><br>"}${sub}${tabs}`;
  const foot = (me) => `<div class="stk">${me || ""}<button class="wide mini" id="prof" ${BTNR}>👤 내 프로필${nm ? " · " + esc(nm) : ""}</button>${again ? `<button class="wide green" id="again">🔁 다시 하기</button>` : `<button class="wide" id="close">닫기</button>`}</div>`;
  const wire = () => {
    document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => showRanks(b.dataset.t, again)));
    if ($("again")) $("again").onclick = () => restartGame();
    if ($("close")) $("close").onclick = closeModal;
    if ($("prof")) $("prof").onclick = () => showProfile(() => showRanks(tab, again));
  };
  modal(`${head}<p>불러오는 중…</p>`);
  let list = [], pf = null;
  try {
    const jobs = [tab === "mine" ? Promise.resolve([]) : fetchRanks(tab, ph)];
    if (remote() && nm) jobs.push(api("profile"));
    const [l, pr] = await Promise.all(jobs);
    list = l; if (pr && pr.st === 200 && pr.d.profile && pr.d.profile.exists) pf = pr.d.profile;
  } catch { modal(`${head}<p>불러오지 못했어요 😢</p>${foot()}`); wire(); return; }
  const medal = ["🥇", "🥈", "🥉"], isMe = (r) => nm && String(r.name).toLowerCase() === nm.toLowerCase();
  // 내 순위 (TOP 밖이어도 하단에 고정)
  let mine = null;
  if (pf && pf.season_best != null) mine = { rank: pf.season_rank, score: pf.season_best, total: pf.season_total, top: pf.top_score, next: pf.next_score };
  else if (!remote() && nm) { const b = localBoard(s), me = b.find((x) => x.name === nm); if (me) mine = { rank: me.rank, score: me.score, total: b.length, top: b[0].score, next: me.rank > 1 ? b[me.rank - 2].score : null }; }
  let meBar = "";
  if (mine) {
    const gap = mine.rank === 1 ? "👑 지금 1위!" : `다음 순위까지 ${nf(mine.next - mine.score + 1)}점${mine.rank > 2 ? ` · 1위까지 ${nf(mine.top - mine.score + 1)}점` : ""}`;
    meBar = `<ul class="rows" style="margin:6px 0"><li class="me"><span class="no" style="width:auto;min-width:28px">${mine.rank}위</span><span class="nm">${esc(nm)} (나)</span><span class="sc">${nf(mine.score)}점</span><small>${gap}</small></li></ul>`;
  } else if (!nm) meBar = `<small>닉네임을 정하면 내 순위가 여기 고정돼요</small>`;
  else meBar = `<small>이번 시즌 기록이 아직 없어요. 첫 도전을 해봐요!</small>`;
  let body;
  if (tab === "mine") {
    let rows = [];
    if (pf) rows = (pf.mine || []).map((x) => ({ seed: x.seed, score: x.score, wave: x.round, win: x.win, hero: x.hero, build: x.build }));
    else if (!remote() && s) rows = localRows().filter((r) => r.name === nm && kstDate(Date.parse(r.played_at)) >= s.start && kstDate(Date.parse(r.played_at)) <= s.end).map((r) => ({ seed: r.seed, score: r.score, wave: r.wave, win: r.win })).reverse();
    const top = rows.reduce((a, x) => Math.max(a, x.score), 0);
    const sd = (n) => { const t = String(n); return t.length === 8 ? `${+t.slice(4, 6)}/${+t.slice(6)}` : ""; };
    body = `<ul class="rows">${rows.map((x) => `<li class="${x.score === top ? "me" : ""}"><span class="no" style="width:auto;min-width:40px;font-size:14px">${sd(x.seed)}</span><span class="nm">${x.win ? "🎉 클리어" : "R" + x.wave}</span><span class="sc">${nf(x.score)}점</span>${x.score === top ? "<small>⭐ 시즌 최고</small>" : ""}${buildTag(x.build)}</li>`).join("") || "<li>이번 시즌 기록이 아직 없어요. 오늘 첫 도전!</li>"}</ul><small>하루에 한 판(그날 최고점)이 기록돼요</small>`;
  } else {
    const li = list.map((r, i) => `<li class="${isMe(r) ? "me" : ""}"><span class="no">${medal[i] || i + 1}</span><span class="nm">${esc(r.name)}</span><span class="sc">${nf(r.score)}점</span><small>R${r.wave}${r.win ? " 🎉" : ""}${heroTag(r.hero)}</small>${buildTag(r.build)}</li>`).join("");
    body = `<small>총 ${list.length}명 참가</small><ul class="rows">${li || "<li>아직 기록이 없어요. 첫 기록을 남겨요!</li>"}</ul>`;
  }
  modal(`${head}${body}${foot(tab === "mine" ? "" : meBar)}`);
  wire();
}
function restartGame() {
  if (window.SeasonMod && SeasonMod.run()) { SeasonMod.restart(); return; } // 프라이빗 시즌 판
  const mode = S ? S.mode : "daily";
  $("modal").classList.remove("on"); MODAL_ON = false; MODAL_Q = [];
  GAME.start(mode); uiReset();
}

function uiGameOver(result) {
  const res = result || {}, P = scoreParts(res), win = P.win, priv = !!(window.SeasonMod && SeasonMod.run()), practice = S.mode === "practice";
  S.over = true; sfx(win ? "win" : "over"); vib(win ? [100, 50, 100, 50, 300] : 200);
  const bk = priv ? "malang-best-ps" : practice ? "malang-best-p" : "malang-best2", best = Number(lsGet(bk, "0")), isBest = P.score > best;
  if (isBest) lsSet(bk, String(P.score));
  const parts = `<div class="sc2">라운드 ${P.R} x ${CONST.SCORE.ROUND}<b>${P.R * CONST.SCORE.ROUND}</b><br>처치 ${P.kills}기<b>${P.kills}</b><br>필드 유닛 점수 ${P.U}<b>${P.uPts}</b>${win ? `<br>클리어 보너스${P.left ? ` (남은 ${Math.floor(P.left)}초)` : ""}<b>${CONST.SCORE.WIN + CONST.SCORE.WIN_SEC * Math.floor(P.left)}</b>` : ""}</div>`;
  const why = res.why ? `<small>${esc(res.why)}</small><br>` : "";
  const reg = priv ? `<div class="rk" id="rk">등록하는 중… ⏳</div><button class="wide green" id="skip">🔁 다시 하기</button><button class="wide mini" id="seeRank" ${BTNR}>🏆 시즌 순위</button>`
    : practice ? `<small>연습 모드는 랭킹에 등록되지 않아요 (이 기기 최고점만 저장)</small><button class="wide" id="skip">🔁 다시 하기</button>`
    : `<div class="rk" id="rk">랭킹에 등록하는 중… ⏳</div><button class="wide green" id="skip">🔁 다시 하기</button><button class="wide mini" id="seeRank" ${BTNR}>🏆 랭킹 보기</button>`;
  modal(`<h2>${win ? "🎉 클리어!" : "😵 게임 오버!"}</h2>${why}<small>${S.hero.name} · ${priv ? esc(SeasonMod.run().name) : practice ? "연습" : "시즌 랭킹"}</small><div class="score">${P.score}</div>${isBest ? '<span class="tag">✨ 내 최고 기록!</span>' : `<small>내 최고 ${best}점</small>`}${parts}${reg}`);
  $("skip").onclick = () => restartGame();
  if (priv) { $("seeRank").onclick = () => SeasonMod.openDetail(SeasonMod.run().id); SeasonMod.finish(P); }
  else if (!practice) { $("seeRank").onclick = () => showRanks("season", true); finishRank(P); }
  if (win) uiBanner("클리어! 말랑 왕국을 지켜냈어요!", "win");
}

// ---------- 타이틀 (시즌 배너 / 닉네임) ----------
const SEA = { top: null, pf: null };
function renderSeasonBox() {
  const el = $("seasonBox"); if (!el) return;
  const ph = phaseNow(), s = ph.season, nm = myName(), live = ph.phase === "live";
  let top = SEA.top, pf = SEA.pf;
  if (!remote() && live) { const b = localBoard(s); top = b[0] || null; const me = b.find((x) => x.name === nm); pf = me ? { season_best: me.score, season_rank: me.rank } : null; }
  const chip = `<span class="pchip" id="profBtn">👤 ${nm ? esc(nm) : "닉네임"}${window.AUTH && AUTH.signedIn() ? " 💛" : ""}</span>`;
  let l1, l2 = "", l3 = "", sprint = false;
  if (live) {
    const left = seasonLeft(s); sprint = left <= 2;
    l1 = sprint ? `🔥 마지막 스퍼트! ${left === 0 ? "오늘이 마지막 날" : "종료까지 " + left + "일"}` : `🏆 ${esc(s.name)} · 종료까지 ${left}일`;
    l2 = top ? `👑 1위 ${esc(top.name)} ${nf(top.score)}점` : "👑 아직 1위가 없어요. 지금 도전하면 1등!";
    if (pf && pf.season_best != null) l3 = `내 ${nf(pf.season_best)}점 · ${pf.season_rank}위` + (top && pf.season_rank > 1 ? ` · 1위까지 ${nf(top.score - pf.season_best + 1)}점!` : pf.season_rank === 1 ? " · 지금 1위!" : "");
    else l3 = "내 기록이 아직 없어요. 첫 도전으로 순위에 올라요!";
  } else if (ph.phase === "before") { l1 = `🌱 ${esc(s.name)} 준비 중 · ${md(s.start)} 시작`; l2 = "시즌이 열리면 랭킹 도전이 시작돼요"; l3 = "지금은 연습 모드로 몸을 풀어요!"; }
  else if (ph.phase === "after") { l1 = `🏁 ${esc(s.name)} 종료`; l2 = "다음 시즌을 기다려 주세요"; l3 = "연습 모드는 계속 즐길 수 있어요!"; }
  else { l1 = "🎲 시즌 정보가 없어요"; }
  el.className = sprint ? "sprint" : "";
  el.innerHTML = `<div class="sb1"><b>${l1}</b>${chip}</div>${l2 ? `<div class="sb2">${l2}</div>` : ""}${l3 ? `<div class="sb2">${l3}</div>` : ""}`;
  const sb = $("start"); if (sb) { sb.classList.toggle("off", !live); sb.textContent = live ? "▶ 랭킹 도전" : "🔒 랭킹 도전 (시즌 밖)"; }
}
async function refreshTitle() {
  renderSeasonBox();
  const ph = phaseNow();
  if (!remote() || ph.phase !== "live") return;
  try {
    const [top, pr] = await Promise.all([getJSON(`${CONFIG.SUPABASE_URL}/rest/v1/leaderboard_season?select=name,score&season=eq.${ph.season.id}&order=rank.asc&limit=1`).catch(() => null), myName() ? api("profile") : null]);
    SEA.top = top && top[0] ? top[0] : null;
    SEA.pf = pr && pr.st === 200 && pr.d.profile && pr.d.profile.exists ? pr.d.profile : null;
  } catch {}
  renderSeasonBox();
}
function showSeasonClosed() {
  const ph = phaseNow(), s = ph.season;
  const msg = ph.phase === "before" ? `${esc(s.name)}은 ${md(s.start)}에 시작해요!<br>그때까지는 연습 모드로 몸을 풀어요 🎲` : ph.phase === "after" ? `${esc(s.name)}이 끝났어요 🏁<br>다음 시즌을 기다려 주세요. 연습 모드는 계속 할 수 있어요!` : "지금은 열린 시즌이 없어요";
  modal(`<h2>🔒 시즌 준비 중</h2><p>${msg}</p><button class="wide green" id="goP">🎲 연습 모드 하기</button><button class="wide mini" id="clo" ${BTNR}>닫기</button>`);
  $("goP").onclick = () => { closeModal(); startRun("practice"); };
  $("clo").onclick = closeModal;
}
async function initPlayer() { // 첫 실행이면 닉네임 정하기, 예전에 쓰던 닉네임이면 조용히 서버 등록
  const nm = myName();
  if (!nm || !checkName(nm).ok) { showNick(); return; }
  if (remote() && lsGet(NAME_OK, "") !== "1") {
    const rr = await ensureRegistered();
    if (rr === "taken" || rr === "bad") showNick(rr === "taken" ? "예전 닉네임을 다른 사람이 먼저 썼어요. 새로 정해 주세요" : NAME_ERR_MSG.bad);
  }
}

// ---------- 타이틀 ----------
function setupTitle() {
  // 시드가 매 판 새로 뽑히므로 영웅도 시작할 때 정해진다 (오늘의 히어로 없음)
  $("todayTxt").innerHTML = `<div class="tt-sub">${todayKey()}</div><div class="tt-name">🎲 매 판 새로운 운명!</div><div class="tt-rule">영웅도, 뽑기 운도 판마다 완전히 달라져요.</div>`;
  try {
    const cv = $("heroMini"), dpr = Math.min(3, window.devicePixelRatio || 1), L = 96; cv.width = cv.height = Math.round(L * dpr);
    const c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, L, L);
    c.font = "56px serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("🎲", L / 2, L / 2);
  } catch {}
}
function goHome() { // 게임 중 홈 버튼: 진행 중인 판 폐기(기록 안 함) -> 타이틀. 다시 시작하면 startRun 이 새 판을 만든다.
  if (window.SeasonMod) SeasonMod.clear();
  if (S) { S.paused = true; S.modalQ = []; S.over = false; S.resultSent = true; }
  MODAL_Q = []; MODAL_ON = false; $("modal").classList.remove("on"); $("confirm").classList.remove("on"); CONFIRM_ON = false;
  TITLE_ON = true; $("title").classList.add("on");
  try { refreshTitle(); renderSeasonBox(); } catch {}
}
function startRun(mode, seed, rules) { // seed/rules: 프라이빗 시즌 판(seasons.js)만 넘긴다
  initAudio(); TITLE_ON = false; $("title").classList.remove("on");
  if (!rules && window.SeasonMod) SeasonMod.clear();
  GAME.start(mode, seed, rules); uiReset(); sfx("wave"); setTimeout(fitCanvas, 60);
  if (S && S.hero) setTimeout(() => { if (!TITLE_ON && S && S.hero) uiBanner(`👑 ${S.hero.name}\n${S.hero.rule}`, "hi"); }, 400);
  if (!lsGet("malrang_tut1")) { lsSet("malrang_tut1", "1"); setTimeout(() => uiBanner("같은 유닛 3기가 모이면 [합성]으로 다음 등급이 돼요!", "info"), 3000);
    setTimeout(() => uiBanner("같은 무리 다른 등급 4종이면 공명 보너스! (무리 줄을 눌러요)", "info"), 6200); }
}

// ---------- 버튼 바인딩 ----------
let _bound = false;
function fitCanvas() { // 캔버스 외 영역의 실제 높이를 재서 남는 높이에 캔버스를 맞춘다 (카드 글이 길어져도 하단 버튼이 밀리지 않게)
  try {
    const app = $("app"), wrap = $("cvWrap"); if (!app || !wrap) return;
    const cs = getComputedStyle(app), gap = parseFloat(cs.rowGap || cs.gap) || 0;
    if (cs.display === "grid") { // 가로 모드: 높이 기준으로 캔버스, 남는 폭은 오른쪽 조작부
      const h = app.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 8;
      wrap.style.width = Math.max(150, Math.min(h * 0.9, app.clientWidth * 0.58)) + "px"; return;
    }
    let used = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom), n = 0;
    for (const c of app.children) { if (c === wrap || getComputedStyle(c).position === "fixed" || getComputedStyle(c).display === "none") continue; used += c.getBoundingClientRect().height; n++; }
    used += gap * n;
    const avail = app.clientHeight - used - 8; // 캔버스 테두리(4px*2) 여유
    wrap.style.width = Math.max(150, Math.min(app.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), avail * 0.9)) + "px";
  } catch {}
}
function fitVh() { try { const h = (window.visualViewport ? window.visualViewport.height : window.innerHeight); document.documentElement.style.setProperty("--vh", h / 100 + "px"); } catch {} fitCanvas(); }
function isStandalone() { try { return matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches || !!navigator.standalone; } catch { return false; } }
function tryFullscreen() { // 안드로이드 크롬 일반 탭에서만 동작(아이폰 사파리는 미지원 → 홈 화면에 추가해야 전체화면). 실패해도 무시, 다음 터치에 재시도
  try {
    if (isStandalone() || document.fullscreenElement) return;
    const el = document.documentElement, rf = el.requestFullscreen || el.webkitRequestFullscreen; if (!rf) return;
    const r = rf.call(el, { navigationUI: "hide" }); if (r && r.catch) r.catch(() => {});
    try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock("portrait").catch(() => {}); } catch {}
  } catch {}
}
let _installEv = null;
function setupA2hs() { // 홈 화면 추가 안내 (설치/전체화면 상태면 숨김, 닫으면 다시 안 보임)
  const box = $("a2hs"); if (!box || isStandalone() || lsGet("malrang_a2hs")) return;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const show = () => { setText("a2hsTxt", ios ? "공유(⬆) → 홈 화면에 추가하면 전체화면으로 즐겨요" : _installEv ? "탭해서 앱으로 설치하면 전체화면!" : "메뉴(⋮) → 홈 화면에 추가하면 전체화면으로 즐겨요"); box.classList.add("on"); };
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); _installEv = e; show(); });
  window.addEventListener("appinstalled", () => box.classList.remove("on"));
  show();
  $("a2hsX").onclick = (e) => { e.stopPropagation(); lsSet("malrang_a2hs", "1"); box.classList.remove("on"); };
  $("a2hsTxt").onclick = () => { if (_installEv) { _installEv.prompt(); _installEv = null; } };
}
function bindUi() {
  fitVh(); window.addEventListener("resize", fitVh); window.addEventListener("orientationchange", fitVh); if (window.visualViewport) window.visualViewport.addEventListener("resize", fitVh);
  for (const ev of ["click", "touchend"]) document.addEventListener(ev, () => { if (!document.fullscreenElement) tryFullscreen(); }, { passive: true });
  document.addEventListener("fullscreenchange", () => setTimeout(fitVh, 100));
  setupA2hs();
  if (_bound) return; _bound = true;
  $("draw").onclick = () => { initAudio(); if (GAME.draw() === false && S && !S.over && S.minerals < CONST.DRAW_COST) sfx("deny"); };
  // 합성: 탭 = 선택 칸 합성(확인창 없음), 길게 = 가능한 만큼 일괄
  const doMerge = (all) => {
    const i = S.sel; if (i < 0) return;
    const run = () => { if (!GAME.canMerge(i).ok) { sfx("deny"); return; } GAME.merge(i, all); };
    run();
  };
  let _lp = null, _lpDone = false;
  const mg = $("merge");
  mg.addEventListener("pointerdown", () => { _lpDone = false; clearTimeout(_lp); _lp = setTimeout(() => { _lpDone = true; if (!mg.disabled) { initAudio(); doMerge(true); } }, 550); });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) mg.addEventListener(ev, () => clearTimeout(_lp));
  mg.onclick = () => { if (_lpDone) { _lpDone = false; return; } initAudio(); doMerge(false); };
  $("sell").onclick = () => { if (S.sel >= 0) GAME.sell(S.sel); };
  $("spd").onclick = () => GAME.setSpeed(S.speed >= 3 ? 1 : S.speed + 1);
  // ☰ 메뉴: 랭킹·소리·확률표·홈 (바깥을 누르면 닫힘)
  const menu = $("menu"), menuOff = () => { menu.classList.remove("on"); $("menuBtn").classList.remove("on"); };
  $("menuBtn").onclick = (e) => { e.stopPropagation(); hidePop(); renderMenuTk(); const on = !menu.classList.contains("on"); menu.classList.toggle("on", on); $("menuBtn").classList.toggle("on", on); };
  menu.addEventListener("click", (e) => { if (e.target.closest("button") && !e.target.closest("#snd")) menuOff(); }); // 소리 외 항목은 누르면 메뉴 닫힘
  $("rank").onclick = () => { initAudio(); showRanks("season"); }; // 모달이 열리면 modal() 이 S.paused 를 켜고 닫으면 풀림(시뮬 틱 불변)
  $("home").onclick = () => uiConfirm("홈으로 나갈까요?\n진행 중인 게임은 종료돼요.", goHome);
  $("prob").onclick = () => showProb();
  $("snd").onclick = () => sndCycle();
  sndLabel();
  document.addEventListener("click", (e) => {
    if (menu.classList.contains("on") && !e.target.closest("#menu") && !e.target.closest("#menuBtn")) menuOff();
    if ($("pop").classList.contains("on") && !e.target.closest("#pop") && !e.target.closest("#clanRows")) hidePop();
  }, true);
  // 타이틀 버튼: 모달이 열려 있거나 방금 열리고 닫힌 직후(유령 클릭/이중 탭)에는 시작 계열 버튼을 무시한다.
  const guard = (fn) => (e) => { if (e) e.stopPropagation(); if (MODAL_ON || CONFIRM_ON || Date.now() - _modalAt < 600) return; fn(); };
  $("start").onclick = guard(() => { if (!dailyOpen()) { showSeasonClosed(); return; } if (!myName()) { showNick("", () => startRun("daily")); return; } startRun("daily"); });
  $("startP").onclick = guard(() => startRun("practice"));
  $("rank2").onclick = (e) => { e.stopPropagation(); e.preventDefault(); if (!MODAL_ON) showRanks("season"); };
  $("seasons").onclick = (e) => { e.stopPropagation(); e.preventDefault(); if (!MODAL_ON) SeasonMod.open(); };
  // 무리 줄: ⬆칩 = 공업 구매(공업권 있으면 말풍선에서 무료/💎 선택, 자동 소비 없음), 나머지 = 공명 한 줄 설명
  $("clanRows").onclick = (e) => {
    const row = e.target.closest(".cr"); if (!row || !S || S.over) return;
    const c = +row.dataset.c; initAudio();
    if (e.target.closest(".uc")) {
      if (S.upTickets > 0) upChoice(c, row, e.clientX);
      else { hidePop(); if (GAME.upgrade(c) === false) sfx("deny"); }
    } else resoHint(c, row, e.clientX);
  };
  $("menuTk").onclick = (e) => { const t = e.target.closest(".tk"); if (t && S && !S.over) { menuOff(); uiTicket(+t.dataset.g); } };
  $("seasonBox").onclick = (e) => { if (e.target.closest("#profBtn")) showProfile(); else showRanks("season"); };
  setupTitle(); renderSeasonBox(); refreshTitle(); syncAccount().catch(() => {}).then(initPlayer).then(() => window.SeasonMod && SeasonMod.boot());
}
if (document.readyState === "complete") bindUi(); else window.addEventListener("load", bindUi);
