"use strict";
// graphics.js - 말랑 운빨 디펜스 그리기 전부 (설계서 C/E/F/H 장). 의존: data.js(GRADES CLANS CHARS HEROES ROUNDS). 번들러 없음.
// 구성: [색/도형 헬퍼] [PART_LIB 부위] [캐릭터 코어] [받침/오라/파티클/뱃지/타일] [몹] [발사체/이펙트] [보드]

// ---------- 색 헬퍼 (hex 입력/hex 출력, 캐시) ----------
const _cc = new Map();
function _h2r(h) { if (!h || h[0] !== "#") return [128, 128, 128]; if (h.length === 4) h = "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3]; const n = parseInt(h.slice(1, 7), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function _r2h(r, g, b) { const f = (v) => Math.max(0, Math.min(255, Math.round(v))); return "#" + ((1 << 24) + (f(r) << 16) + (f(g) << 8) + f(b)).toString(16).slice(1); }
function shade(hex, a) { const k = hex + "|s" + a; let v = _cc.get(k); if (v) return v; const [r, g, b] = _h2r(hex), f = (x) => (a >= 0 ? x + (255 - x) * a : x * (1 + a)); v = _r2h(f(r), f(g), f(b)); _cc.set(k, v); return v; }
function mixHex(a, b, t) { const k = a + b + "|m" + t; let v = _cc.get(k); if (v) return v; const x = _h2r(a), y = _h2r(b); v = _r2h(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); _cc.set(k, v); return v; }
function satHex(hex, s) { if (s === 1) return hex; const k = hex + "|v" + s; let v = _cc.get(k); if (v) return v; const [r, g, b] = _h2r(hex), l = 0.3 * r + 0.59 * g + 0.11 * b; v = _r2h(l + (r - l) * s, l + (g - l) * s, l + (b - l) * s); _cc.set(k, v); return v; }
const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
const _rb = (t, off, s = 90, l = 62, a = 1) => `hsla(${Math.floor((t * 90 + off) % 360)},${s}%,${l}%,${a})`;

// ---------- 도형 헬퍼 ----------
function _ellipse(c, x, y, rx, ry, fill, stroke, lw) {
  c.beginPath(); c.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, Math.PI * 2);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 2; c.stroke(); }
}
function _fs(c, fill, stroke, lw) { if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.lineJoin = "round"; c.stroke(); } }
function _poly(c, R, p, fill, stroke, lw) { c.beginPath(); for (let i = 0; i < p.length; i += 2) c[i ? "lineTo" : "moveTo"](p[i] * R, p[i + 1] * R); c.closePath(); _fs(c, fill, stroke, lw); }
function _star(c, s, pts = 4, inner = 0.45) { c.beginPath(); for (let i = 0; i < pts * 2; i++) { const a = (i * Math.PI) / pts - Math.PI / 2, rr = i % 2 ? s * inner : s; c[i ? "lineTo" : "moveTo"](Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); }
function _heart(c, s) { c.beginPath(); c.moveTo(0, s * 0.9); c.bezierCurveTo(-s * 1.6, -s * 0.2, -s * 0.7, -s * 1.3, 0, -s * 0.5); c.bezierCurveTo(s * 0.7, -s * 1.3, s * 1.6, -s * 0.2, 0, s * 0.9); c.closePath(); }
function _sym(c, fn) { for (const s of [-1, 1]) { c.save(); c.scale(s, 1); fn(s); c.restore(); } }
function _line(c, x0, y0, x1, y1, col, w) { c.strokeStyle = col; c.lineWidth = w; c.lineCap = "round"; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
function _spark(c, x, y, s, col) { c.save(); c.translate(x, y); c.fillStyle = col; _star(c, s, 4, 0.3); c.fill(); c.restore(); }
const _LOW = () => typeof GFX_LOW !== "undefined" && GFX_LOW;

// ---------- PART_LIB (설계 C2) : fn(c, style, col, k) ----------
// k = {R, ry, t, lw, out, s(hex)->채도적용색, seed, hasHat, g}
const EARS = {
  round(c, col, k) { const R = k.R; _sym(c, () => { _ellipse(c, R * 0.62, -k.ry * 0.82, R * 0.34, R * 0.34, col, k.out, k.lw * 0.8); _ellipse(c, R * 0.62, -k.ry * 0.82, R * 0.17, R * 0.17, shade(col, 0.4)); }); },
  point(c, col, k) { const R = k.R; _sym(c, () => { _poly(c, R, [0.2, -0.8, 0.8, -1.35, 0.98, -0.4], col, k.out, k.lw * 0.8); _poly(c, R, [0.42, -0.82, 0.78, -1.1, 0.85, -0.55], shade(col, 0.45)); }); },
  long(c, col, k) { const R = k.R; _sym(c, () => { c.save(); c.translate(R * 0.42, -k.ry * 0.9); c.rotate(0.12 + Math.sin(k.t * 2 + k.seed) * 0.05); _ellipse(c, 0, -R * 0.55, R * 0.22, R * 0.62, col, k.out, k.lw * 0.8); _ellipse(c, 0, -R * 0.5, R * 0.1, R * 0.42, shade(col, 0.45)); c.restore(); }); },
  floppy(c, col, k) { const R = k.R; _sym(c, () => { c.save(); c.translate(R * 0.85, -R * 0.45); c.rotate(0.35); _ellipse(c, R * 0.1, R * 0.4, R * 0.3, R * 0.55, col, k.out, k.lw * 0.8); c.restore(); }); },
  big(c, col, k) { const R = k.R; _sym(c, () => { _ellipse(c, R * 0.9, -R * 0.55, R * 0.46, R * 0.46, col, k.out, k.lw * 0.8); _ellipse(c, R * 0.9, -R * 0.55, R * 0.26, R * 0.26, shade(col, 0.45)); }); },
  fin(c, col, k) { const R = k.R; _sym(c, () => _poly(c, R, [0.8, -0.35, 1.45, -0.85, 1.3, 0.05], col, k.out, k.lw * 0.8)); },
  bump(c, col, k) { const R = k.R; _sym(c, () => _ellipse(c, R * 0.5, -k.ry * 0.8, R * 0.3, R * 0.3, col, k.out, k.lw * 0.8)); },
  nub(c, col, k) { const R = k.R; _sym(c, () => _ellipse(c, R * 0.74, -R * 0.62, R * 0.2, R * 0.2, col, k.out, k.lw * 0.8)); },
  antenna(c, col, k) { const R = k.R; _sym(c, () => { const sw = Math.sin(k.t * 3 + k.seed) * R * 0.08; _line(c, R * 0.2, -k.ry * 0.9, R * 0.55 + sw, -R * 1.5, k.out, k.lw * 0.9); _ellipse(c, R * 0.55 + sw, -R * 1.5, R * 0.12, R * 0.12, col, k.out, 1.2); }); },
  leaf(c, col, k) { const R = k.R; _sym(c, () => { c.save(); c.translate(R * 0.35, -k.ry * 0.85); c.rotate(0.5); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(R * 0.4, -R * 0.5, 0, -R * 1.0); c.quadraticCurveTo(-R * 0.4, -R * 0.5, 0, 0); _fs(c, col, k.out, k.lw * 0.8); c.restore(); }); },
  tuft(c, col, k) { const R = k.R; c.strokeStyle = col; c.lineWidth = Math.max(2, k.lw); c.lineCap = "round"; c.beginPath(); c.moveTo(0, -k.ry * 0.92); c.quadraticCurveTo(-R * 0.2, -R * 1.4, -R * 0.38, -R * 1.2); c.moveTo(0, -k.ry * 0.92); c.quadraticCurveTo(R * 0.12, -R * 1.5, R * 0.3, -R * 1.3); c.stroke(); },
};
const EAR_FRONT = { tuft: 1 };

const HORNS = {
  single(c, col, k) { const R = k.R; _poly(c, R, [-0.13, -k.ry / R * 0.9, 0, -1.75, 0.13, -k.ry / R * 0.9], col, k.out, k.lw * 0.8); c.strokeStyle = shade(col, -0.3); c.lineWidth = 1; c.beginPath(); for (let i = 1; i < 4; i++) { const y = -k.ry * 0.9 - i * R * 0.2, w = R * 0.13 * (1 - i * 0.22); c.moveTo(-w, y); c.lineTo(w, y - R * 0.06); } c.stroke(); },
  pair(c, col, k) { const R = k.R; _sym(c, () => _poly(c, R, [0.28, -0.88, 0.55, -1.5, 0.68, -0.8], col, k.out, k.lw * 0.8)); },
  antler(c, col, k) { const R = k.R; _sym(c, () => { for (const [w, cc] of [[R * 0.22, k.out], [R * 0.13, col]]) { c.strokeStyle = cc; c.lineWidth = w; c.lineCap = "round"; c.beginPath(); c.moveTo(R * 0.35, -k.ry * 0.85); c.lineTo(R * 0.7, -R * 1.65); c.moveTo(R * 0.52, -R * 1.2); c.lineTo(R * 1.0, -R * 1.3); c.moveTo(R * 0.62, -R * 1.5); c.lineTo(R * 0.35, -R * 1.85); c.stroke(); } }); },
  crest(c, col, k) { const R = k.R, fl = Math.sin(k.t * 8 + k.seed) * 0.08; _poly(c, R, [-0.3, -0.88, -0.38, -1.4 + fl, -0.1, -1.0], col, k.out, k.lw * 0.7); _poly(c, R, [0.3, -0.88, 0.38, -1.4 - fl, 0.1, -1.0], col, k.out, k.lw * 0.7); _poly(c, R, [-0.2, -0.88, 0, -1.7 + fl, 0.2, -0.88], col, k.out, k.lw * 0.7); },
  moon(c, col, k) { const R = k.R; c.beginPath(); c.moveTo(-R * 0.32, -R * 0.95); c.quadraticCurveTo(0, -R * 1.9, R * 0.32, -R * 0.95); c.quadraticCurveTo(0, -R * 1.45, -R * 0.32, -R * 0.95); _fs(c, col, k.out, k.lw * 0.7); },
};

function _wingBase(c, k, fn, mul = 1) { const R = k.R, fl = Math.sin(k.t * 6 + k.seed) * 0.17; _sym(c, () => { c.save(); c.translate(R * 0.72, -R * 0.05); c.rotate(-0.4 - fl * mul); fn(R, fl); c.restore(); }); }
const WINGS = {
  nub(c, col, k) { _wingBase(c, k, (R) => _ellipse(c, R * 0.3, 0, R * 0.38, R * 0.2, col, k.out, k.lw * 0.7)); },
  leaf(c, col, k) { _wingBase(c, k, (R) => { c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(R * 0.7, -R * 0.95, R * 1.5, -R * 0.35); c.quadraticCurveTo(R * 0.8, R * 0.15, 0, 0); _fs(c, col, k.out, k.lw * 0.8); _line(c, 0, 0, R * 1.2, -R * 0.35, shade(col, -0.3), 1.2); }); },
  feather(c, col, k) { _wingBase(c, k, (R) => { for (let i = 0; i < 3; i++) { c.save(); c.rotate(-0.65 + i * 0.35); _ellipse(c, R * 0.75, 0, R * 0.8, R * 0.19, col, k.out, k.lw * 0.6); c.restore(); } }); },
  bat(c, col, k) { _wingBase(c, k, (R) => _poly(c, R, [0, 0, 1.5, -1.0, 1.2, -0.4, 1.65, 0.05, 1.0, 0.15, 1.15, 0.65, 0, 0.3], col, k.out, k.lw * 0.8)); },
  angel(c, col, k) { _wingBase(c, k, (R) => { for (let i = 0; i < 4; i++) { c.save(); c.rotate(-0.95 + i * 0.3); _ellipse(c, R * (0.85 + 0.12 * (3 - i)), 0, R * (0.95 + 0.12 * (3 - i)), R * 0.2, col, k.out, k.lw * 0.6); c.restore(); } }, 1.2); },
  flame(c, col, k) { _wingBase(c, k, (R) => { for (let i = 0; i < 3; i++) { c.save(); c.rotate(-0.8 + i * 0.4 + Math.sin(k.t * 9 + i) * 0.06); c.beginPath(); c.moveTo(0, -R * 0.1); c.quadraticCurveTo(R * 0.8, -R * 0.55, R * 1.55, 0); c.quadraticCurveTo(R * 0.8, R * 0.2, 0, R * 0.1); _fs(c, i === 1 ? shade(col, 0.35) : col, k.out, k.lw * 0.6); c.restore(); } }); },
  crystal(c, col, k) { _wingBase(c, k, (R) => { for (let i = 0; i < 3; i++) { c.save(); c.rotate(-0.8 + i * 0.4); c.globalAlpha = 0.9; _poly(c, R, [0, -0.1, 1.3 - i * 0.15, -0.12, 1.55 - i * 0.15, 0, 1.3 - i * 0.15, 0.12, 0, 0.1], col, "#fff", 1.4); c.restore(); } }); },
};

function _tailBase(c, k, fn) { const R = k.R; c.save(); c.translate(R * 0.82, k.ry * 0.45); c.rotate(-0.7 + Math.sin(k.t * 4 + k.seed) * 0.18); fn(R); c.restore(); }
const TAILS = {
  thin(c, col, k) { _tailBase(c, k, (R) => { c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(R * 0.6, -R * 0.5, R * 1.0, -R * 0.1); c.strokeStyle = k.out; c.lineWidth = k.lw + 2; c.lineCap = "round"; c.stroke(); c.strokeStyle = col; c.lineWidth = 3; c.stroke(); }); },
  puff(c, col, k) { _tailBase(c, k, (R) => _ellipse(c, R * 0.4, 0, R * 0.36, R * 0.36, col, k.out, k.lw * 0.8)); },
  fluffy(c, col, k) { _tailBase(c, k, (R) => { _ellipse(c, R * 0.62, 0, R * 0.7, R * 0.4, col, k.out, k.lw * 0.8); _ellipse(c, R * 0.95, -R * 0.05, R * 0.32, R * 0.22, shade(col, 0.4)); }); },
  flame(c, col, k) { _tailBase(c, k, (R) => { const f = Math.sin(k.t * 10 + k.seed) * 0.15; for (const [sc, cc] of [[1, col], [0.55, shade(col, 0.55)]]) { c.beginPath(); c.moveTo(0, R * 0.25 * sc); c.quadraticCurveTo(R * 0.7 * sc, -R * (0.6 + f) * sc, R * 1.45 * sc, -R * (0.5 + f) * sc); c.quadraticCurveTo(R * 0.8 * sc, R * 0.1, 0, -R * 0.25 * sc); c.closePath(); _fs(c, cc, sc === 1 ? k.out : 0, k.lw * 0.7); } }); },
  lizard(c, col, k) { _tailBase(c, k, (R) => { c.beginPath(); c.moveTo(0, -R * 0.25); c.quadraticCurveTo(R * 1.0, -R * 0.15, R * 1.7, -R * 0.9); c.quadraticCurveTo(R * 1.1, R * 0.25, 0, R * 0.25); c.closePath(); _fs(c, col, k.out, k.lw * 0.8); }); },
  fin(c, col, k) { _tailBase(c, k, (R) => _poly(c, R, [0, 0, 0.9, -0.4, 1.4, -0.85, 1.25, 0, 1.4, 0.7, 0.9, 0.4], col, k.out, k.lw * 0.8)); },
  ember(c, col, k) { _tailBase(c, k, (R) => { c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(R * 0.6, -R * 0.5, R * 1.0, -R * 0.1); c.strokeStyle = k.out; c.lineWidth = 3.5; c.lineCap = "round"; c.stroke(); const g = c.createRadialGradient(R, -R * 0.1, 0, R, -R * 0.1, R * 0.35); g.addColorStop(0, "#fff7c2"); g.addColorStop(0.5, col); g.addColorStop(1, "rgba(255,90,40,0)"); c.fillStyle = g; c.beginPath(); c.arc(R, -R * 0.1, R * 0.35, 0, 7); c.fill(); }); },
  star(c, col, k) { _tailBase(c, k, (R) => { _line(c, 0, 0, R * 0.7, -R * 0.2, k.out, 3); c.save(); c.translate(R * 0.95, -R * 0.25); c.rotate(k.t * 2); _star(c, R * 0.42, 5, 0.5); _fs(c, col, k.out, k.lw * 0.6); c.restore(); }); },
  comet(c, col, k) { _tailBase(c, k, (R) => { c.globalAlpha = 0.5; for (let i = 0; i < 3; i++) _line(c, R * 0.3, (i - 1) * R * 0.15, R * (1.3 + i * 0.1), (i - 1) * R * 0.32 - R * 0.1, col, 4 - i); c.globalAlpha = 1; _ellipse(c, R * 0.35, 0, R * 0.3, R * 0.3, col, k.out, k.lw * 0.7); }); },
  striped(c, col, k) { _tailBase(c, k, (R) => { _ellipse(c, R * 0.6, 0, R * 0.7, R * 0.3, col, k.out, k.lw * 0.8); for (let i = 0; i < 3; i++) _line(c, R * (0.4 + i * 0.3), -R * 0.25, R * (0.4 + i * 0.3), R * 0.25, k.out, 2.5); }); },
};

const MANES = {
  ruff(c, col, k) { const R = k.R, n = 11; for (let i = 0; i < n; i++) { const a = (i / n) * 6.283; _ellipse(c, Math.cos(a) * R * 0.95, Math.sin(a) * k.ry * 0.95, R * 0.34, R * 0.34, col, k.out, k.lw * 0.6); } },
  flame(c, col, k) { const R = k.R, n = 10; for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + Math.sin(k.t * 3) * 0.05, fl = 1 + Math.sin(k.t * 9 + i * 1.7) * 0.12; c.save(); c.rotate(a); _poly(c, R, [0.7, -0.3, 1.55 * fl, 0, 0.7, 0.3], i % 2 ? col : shade(col, 0.3), k.out, k.lw * 0.6); c.restore(); } },
  needle(c, col, k) { const R = k.R, n = 14; for (let i = 0; i < n; i++) { c.save(); c.rotate((i / n) * 6.283); _poly(c, R, [0.75, -0.12, 1.45, 0, 0.75, 0.12], col, k.out, 1.2); c.restore(); } },
  galaxy(c, col, k) { const R = k.R; const g = c.createRadialGradient(0, 0, R * 0.7, 0, 0, R * 1.6); g.addColorStop(0, col); g.addColorStop(1, "rgba(138,123,255,0)"); c.fillStyle = g; c.beginPath(); c.arc(0, 0, R * 1.6, 0, 7); c.fill(); for (let i = 0; i < 7; i++) { const a = i * 0.9 + k.t * 0.3, tw = 0.5 + 0.5 * Math.sin(k.t * 4 + i * 2); _spark(c, Math.cos(a) * R * 1.2, Math.sin(a) * R * 1.1, R * 0.12 * (0.6 + tw), "#fff"); } },
};

const BACKS = {
  moss(c, col, k) { const R = k.R; _ellipse(c, -R * 0.5, -k.ry * 0.82, R * 0.5, R * 0.36, col, k.out, k.lw * 0.7); _ellipse(c, R * 0.15, -k.ry * 1.0, R * 0.62, R * 0.4, shade(col, 0.15), k.out, k.lw * 0.7); _ellipse(c, R * 0.65, -k.ry * 0.78, R * 0.4, R * 0.3, col, k.out, k.lw * 0.7); },
  vine(c, col, k) { const R = k.R; c.strokeStyle = col; c.lineWidth = R * 0.12; c.lineCap = "round"; c.beginPath(); c.moveTo(-R * 0.95, R * 0.7); c.bezierCurveTo(-R * 1.4, -R * 0.2, -R * 0.6, -R * 0.8, R * 0.3, -R * 1.15); c.stroke(); for (let i = 0; i < 4; i++) { const p = i / 3; c.save(); c.translate(-R * (1.05 - p * 0.5), R * (0.5 - p * 1.4)); c.rotate(-0.5 + i); _ellipse(c, R * 0.2, 0, R * 0.22, R * 0.1, shade(col, 0.2), k.out, 1.2); c.restore(); } },
  spikes(c, col, k) { const R = k.R; for (let i = -3; i <= 3; i++) { const a = -Math.PI / 2 + i * 0.4; c.save(); c.rotate(a + Math.PI / 2); _poly(c, R, [-0.15, -0.92, 0, -1.48, 0.15, -0.92], col, k.out, k.lw * 0.6); c.restore(); } },
  rockplates(c, col, k) { const R = k.R; for (let i = -2; i <= 2; i++) { const a = -Math.PI / 2 + i * 0.5; c.save(); c.translate(Math.cos(a) * R * 0.98, Math.sin(a) * R * 0.98); c.rotate(a + Math.PI / 2); _ellipse(c, 0, -R * 0.1, R * 0.28, R * 0.2, col, k.out, k.lw * 0.6); c.restore(); } },
  roots(c, col, k) { const R = k.R; c.strokeStyle = col; c.lineCap = "round"; for (let i = -3; i <= 3; i++) { c.lineWidth = R * 0.14 * (1 - Math.abs(i) * 0.1); c.beginPath(); const x0 = i * R * 0.3, w = Math.sin(k.t * 2 + i) * R * 0.1; c.moveTo(x0, k.ry * 0.6); c.quadraticCurveTo(x0 + w + i * R * 0.1, k.ry * 1.2, x0 * 1.6 + w, k.ry * 1.5); c.stroke(); } },
  worldtree(c, col, k) { const R = k.R; _poly(c, R, [-0.12, -0.6, -0.1, -1.4, 0.1, -1.4, 0.12, -0.6], "#8a5a2a", k.out, k.lw * 0.6); for (const [x, y, s] of [[-0.55, -1.55, 0.55], [0.55, -1.55, 0.55], [0, -1.85, 0.62], [-0.25, -1.4, 0.5], [0.3, -1.4, 0.5]]) _ellipse(c, x * R, y * R, s * R * 0.7, s * R * 0.6, col, k.out, k.lw * 0.6); for (let i = 0; i < 3; i++) _ellipse(c, (i - 1) * R * 0.5, -R * (1.7 + (i % 2) * 0.15), R * 0.1, R * 0.1, "#ff9ec0"); },
  fin(c, col, k) { const R = k.R; _poly(c, R, [-0.25, -0.85, 0.15, -1.75, 0.65, -0.8], col, k.out, k.lw * 0.8); },
  icespikes(c, col, k) { const R = k.R; for (let i = -2; i <= 2; i++) { c.save(); c.translate(i * R * 0.38, -k.ry * (0.95 - Math.abs(i) * 0.1)); c.rotate(i * 0.22); const h = R * (0.85 - Math.abs(i) * 0.14); _poly(c, 1, [-R * 0.14, 0, 0, -h, R * 0.14, 0, 0, R * 0.12], col, "#5aa8e8", 1.6); _line(c, 0, -h * 0.2, 0, -h * 0.8, "rgba(255,255,255,.8)", 1.3); c.restore(); } },
  cloudwool(c, col, k) { const R = k.R; for (let i = 0; i < 7; i++) { const a = Math.PI + (i / 6) * Math.PI; _ellipse(c, Math.cos(a) * R * 0.92, Math.sin(a) * k.ry * 0.92, R * 0.38, R * 0.38, col, k.out, k.lw * 0.6); } },
  trident(c, col, k) { const R = k.R; _line(c, R * 1.0, R * 0.9, R * 1.12, -R * 1.5, k.out, R * 0.17); _line(c, R * 1.0, R * 0.9, R * 1.12, -R * 1.5, col, R * 0.09); c.save(); c.translate(R * 1.12, -R * 1.5); _line(c, 0, 0, 0, -R * 0.5, col, R * 0.09); _line(c, -R * 0.28, -R * 0.15, -R * 0.28, -R * 0.55, col, R * 0.08); _line(c, R * 0.28, -R * 0.15, R * 0.28, -R * 0.55, col, R * 0.08); _line(c, -R * 0.28, -R * 0.15, R * 0.28, -R * 0.15, col, R * 0.08); c.restore(); },
  tidering(c, col, k) { const R = k.R; c.strokeStyle = col; c.lineWidth = R * 0.14; c.lineCap = "round"; c.setLineDash([R * 0.5, R * 0.3]); c.lineDashOffset = -k.t * R; c.beginPath(); c.ellipse(0, 0, R * 1.45, k.ry * 1.25, 0, 0, 7); c.stroke(); c.setLineDash([]); for (let i = 0; i < 4; i++) { const a = k.t * 1.2 + i * 1.57; _ellipse(c, Math.cos(a) * R * 1.45, Math.sin(a) * k.ry * 1.25, R * 0.11, R * 0.14, "#fff"); } },
  flamering(c, col, k) { const R = k.R; c.strokeStyle = col; c.lineWidth = R * 0.14; c.beginPath(); c.arc(0, 0, R * 1.4, 0, 7); c.stroke(); for (let i = 0; i < 9; i++) { c.save(); c.rotate(k.t * 0.8 + (i / 9) * 6.283); const f = 1 + Math.sin(k.t * 9 + i * 2) * 0.2; _poly(c, R, [1.3, -0.18, 1.8 * f, 0, 1.3, 0.18], i % 2 ? col : "#ffe27a"); c.restore(); } },
  constellation(c, col, k) { const R = k.R, pts = [[-1.2, -0.3], [-0.7, -1.3], [0, -1.0], [0.7, -1.45], [1.25, -0.5]]; c.strokeStyle = "rgba(255,226,122,.7)"; c.lineWidth = 1.3; c.beginPath(); pts.forEach(([x, y], i) => c[i ? "lineTo" : "moveTo"](x * R, y * R)); c.stroke(); pts.forEach(([x, y], i) => _spark(c, x * R, y * R, R * (0.17 + 0.07 * Math.sin(k.t * 4 + i * 1.7)), col)); },
};
const SHELLS = {
  coral(c, col, k) { const R = k.R; _ellipse(c, 0, -R * 0.25, R * 1.15, R * 0.95, mixHex(col, "#8a5a3a", 0.55), k.out, k.lw * 0.8); c.strokeStyle = col; c.lineWidth = R * 0.12; c.lineCap = "round"; c.beginPath(); for (const [x, a] of [[-0.55, -0.4], [0, 0], [0.55, 0.4]]) { c.moveTo(x * R, -R * 1.0); c.lineTo(x * R + a * R * 0.5, -R * 1.5); c.moveTo(x * R + a * R * 0.25, -R * 1.25); c.lineTo(x * R + a * R * 0.25 + R * 0.25, -R * 1.45); } c.stroke(); },
};
const TENTACLES = {
  wave(c, col, k) { const R = k.R; c.strokeStyle = col; c.lineCap = "round"; for (let i = -2; i <= 2; i++) { c.lineWidth = R * 0.2; const x0 = i * R * 0.38, w = Math.sin(k.t * 3 + i) * R * 0.18; c.beginPath(); c.moveTo(x0, k.ry * 0.6); c.bezierCurveTo(x0 + w, k.ry * 1.0, x0 - w, k.ry * 1.25, x0 + w * 1.3, k.ry * 1.55); c.stroke(); } },
};
const BACK_PARTS = { wing: WINGS, tail: TAILS, mane: MANES, back: BACKS, shell: SHELLS, tentacle: TENTACLES };

const MARKS = {
  eyepatch(c, col, k) { const R = k.R; _sym(c, () => { c.save(); c.translate(R * 0.4, -R * 0.08); c.rotate(0.45); _ellipse(c, 0, 0, R * 0.24, R * 0.32, col); c.restore(); }); },
  spots(c, col, k) { const R = k.R; c.globalAlpha = 0.75; for (const [x, y, s] of [[-0.5, -0.5, 0.11], [0.55, -0.1, 0.13], [-0.1, 0.62, 0.1], [0.3, -0.62, 0.08]]) _ellipse(c, x * R, y * R, s * R, s * R, col); c.globalAlpha = 1; },
  stripes(c, col, k) { const R = k.R; c.strokeStyle = col; c.lineWidth = Math.max(2, R * 0.12); c.lineCap = "round"; _sym(c, () => { for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(R * 0.96 - i * R * 0.12, -R * 0.4 + i * R * 0.3); c.lineTo(R * 0.6 - i * R * 0.1, -R * 0.35 + i * R * 0.3); c.stroke(); } }); },
  cheek(c, col, k) { const R = k.R; _sym(c, () => _ellipse(c, R * 0.55, R * 0.3, R * 0.34, R * 0.26, col)); },
  belly(c, col, k) { _ellipse(c, 0, k.R * 0.4, k.R * 0.68, k.ry * 0.52, col); },
  mask(c, col, k) { const R = k.R; _ellipse(c, 0, -R * 0.08, R * 0.9, R * 0.26, col); },
};

// ----- 모자 / 후광 / 소품 (얼굴 위) -----
const HATS = {
  acorncap(c, col, k) { const R = k.R, hy = -k.ry; c.beginPath(); c.ellipse(0, hy + R * 0.2, R * 0.78, R * 0.5, 0, Math.PI, 0); c.closePath(); _fs(c, col, k.out, k.lw * 0.8); _poly(c, R, [-0.06, hy / R - 0.28, -0.04, hy / R - 0.5, 0.06, hy / R - 0.5, 0.05, hy / R - 0.28], shade(col, -0.25), k.out, 1.2); c.strokeStyle = shade(col, -0.25); c.lineWidth = 1; c.beginPath(); for (let i = -2; i <= 2; i++) { c.moveTo(i * R * 0.25, hy + R * 0.2); c.lineTo(i * R * 0.18, hy - R * 0.1); } c.stroke(); },
  sprout(c, col, k) { const R = k.R, hy = -k.ry, sw = Math.sin(k.t * 3 + k.seed) * R * 0.08; _line(c, 0, hy + R * 0.05, sw, hy - R * 0.5, shade(col, -0.35), 2.2); for (const s of [-1, 1]) { c.save(); c.translate(sw, hy - R * 0.5); c.rotate(s * 0.7); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(s * R * 0.4, -R * 0.4, s * R * 0.05, -R * 0.55); c.quadraticCurveTo(-s * R * 0.1, -R * 0.2, 0, 0); _fs(c, col, shade(col, -0.4), 1.4); c.restore(); } },
  flowerpair(c, col, k) { const R = k.R, hy = -k.ry; for (const x of [-0.58, 0.58]) { c.save(); c.translate(x * R, hy + R * 0.12); for (let i = 0; i < 5; i++) { c.rotate(1.2566); _ellipse(c, R * 0.15, 0, R * 0.14, R * 0.09, col); } _ellipse(c, 0, 0, R * 0.08, R * 0.08, "#ffd54f"); c.restore(); } },
  crown(c, col, k) { const R = k.R, hy = -k.ry * 0.95; _poly(c, R, [-0.42, hy / R + 0.08, -0.46, hy / R - 0.42, -0.2, hy / R - 0.18, 0, hy / R - 0.5, 0.2, hy / R - 0.18, 0.46, hy / R - 0.42, 0.42, hy / R + 0.08], col, k.out, k.lw * 0.8); _ellipse(c, 0, hy + R * 0.0, R * 0.07, R * 0.07, "#ff4f81"); },
  grandcrown(c, col, k) { const R = k.R, h = -k.ry * 0.95 / R, p = [-0.55, h + 0.1, -0.6, h - 0.6, -0.33, h - 0.25, -0.17, h - 0.75, 0, h - 0.3, 0.17, h - 0.75, 0.33, h - 0.25, 0.6, h - 0.6, 0.55, h + 0.1]; _poly(c, R, p, col, k.out, k.lw * 0.8); _line(c, -0.55 * R, (h - 0.02) * R, 0.55 * R, (h - 0.02) * R, shade(col, -0.3), 2); [[-0.6, h - 0.6, "#ff4f81"], [-0.17, h - 0.75, "#4fc3ff"], [0.17, h - 0.75, "#7bd88f"], [0.6, h - 0.6, "#ff4f81"], [0, h + 0.03, "#fff"]].forEach(([x, y, cc]) => _ellipse(c, x * R, y * R, R * 0.08, R * 0.08, cc, k.out, 1)); },
  star(c, col, k) { const R = k.R; c.save(); c.translate(Math.sin(k.t * 2) * R * 0.1, -k.ry - R * 0.4); c.rotate(Math.sin(k.t * 3) * 0.2); _star(c, R * 0.38, 5, 0.5); _fs(c, col, k.out, k.lw * 0.7); c.restore(); },
  headband(c, col, k) { const R = k.R; c.strokeStyle = col; c.lineWidth = R * 0.2; c.lineCap = "butt"; c.beginPath(); c.arc(0, 0, R * 0.98, -Math.PI * 0.82, -Math.PI * 0.18); c.stroke(); const f = Math.sin(k.t * 6) * 0.15; for (const s of [0, 1]) { c.save(); c.translate(R * 0.86, -R * 0.52); c.rotate(0.6 + s * 0.5 + f); _poly(c, R, [0, -0.08, 0.6, 0, 0, 0.08], col, k.out, 1.2); c.restore(); } },
  minerhelmet(c, col, k) { const R = k.R, hy = -k.ry; c.beginPath(); c.ellipse(0, hy + R * 0.25, R * 0.85, R * 0.6, 0, Math.PI, 0); c.closePath(); _fs(c, col, k.out, k.lw * 0.8); _ellipse(c, 0, hy + R * 0.25, R * 0.95, R * 0.1, shade(col, -0.2), k.out, 1.2); const g = c.createRadialGradient(0, hy - R * 0.1, 0, 0, hy - R * 0.1, R * 0.4); g.addColorStop(0, "#fff"); g.addColorStop(1, "rgba(255,240,150,0)"); c.fillStyle = g; c.beginPath(); c.arc(0, hy - R * 0.1, R * 0.4, 0, 7); c.fill(); _ellipse(c, 0, hy - R * 0.1, R * 0.12, R * 0.12, "#fff", k.out, 1); },
  monocle(c, col, k) { const R = k.R; c.strokeStyle = col; c.lineWidth = Math.max(1.8, R * 0.08); c.beginPath(); c.arc(R * 0.38, -R * 0.08, R * 0.26, 0, 7); c.stroke(); c.lineWidth = 1; c.beginPath(); c.moveTo(R * 0.55, R * 0.12); c.quadraticCurveTo(R * 0.85, R * 0.5, R * 0.6, R * 0.95); c.stroke(); },
  gradcap(c, col, k) { const R = k.R, hy = -k.ry; _ellipse(c, 0, hy + R * 0.12, R * 0.6, R * 0.22, col, k.out, 1.4); _poly(c, R, [-0.95, hy / R - 0.02, 0, hy / R - 0.32, 0.95, hy / R - 0.02, 0, hy / R + 0.18], col, k.out, k.lw * 0.8); _line(c, 0, hy - R * 0.07, R * 0.7, hy + R * 0.0, "#ffd54f", 1.5); _line(c, R * 0.7, hy, R * 0.72, hy + R * 0.45, "#ffd54f", 2); },
  tophat(c, col, k) { const R = k.R, hy = -k.ry; _poly(c, R, [-0.5, hy / R + 0.05, -0.46, hy / R - 0.85, 0.46, hy / R - 0.85, 0.5, hy / R + 0.05], col, k.out, k.lw * 0.8); _poly(c, R, [-0.5, hy / R - 0.12, 0.5, hy / R - 0.12, 0.5, hy / R + 0.05, -0.5, hy / R + 0.05], "#e8442e"); _ellipse(c, 0, hy + R * 0.08, R * 0.85, R * 0.16, col, k.out, k.lw * 0.8); },
  moonhat(c, col, k) { const R = k.R, hy = -k.ry; c.beginPath(); c.moveTo(-R * 0.75, hy + R * 0.12); c.quadraticCurveTo(-R * 0.1, hy - R * 0.4, R * 0.05, hy - R * 1.15); c.quadraticCurveTo(R * 0.35, hy - R * 0.5, R * 0.75, hy + R * 0.12); c.closePath(); _fs(c, col, k.out, k.lw * 0.8); _ellipse(c, 0, hy + R * 0.12, R * 0.9, R * 0.14, shade(col, -0.2), k.out, 1.2); c.beginPath(); c.moveTo(-R * 0.1, hy - R * 0.25); c.quadraticCurveTo(R * 0.2, hy - R * 0.7, R * 0.15, hy - R * 0.25); c.quadraticCurveTo(R * 0.02, hy - R * 0.4, -R * 0.1, hy - R * 0.25); c.fillStyle = "#ffe27a"; c.fill(); _spark(c, R * 0.3, hy - R * 0.1, R * 0.1, "#fff"); },
  piggybank(c, col, k) { const R = k.R, hy = -k.ry - R * 0.3; _poly(c, R, [-0.35, hy / R - 0.25, -0.25, hy / R - 0.5, -0.1, hy / R - 0.25], col, k.out, 1.4); _ellipse(c, 0, hy, R * 0.58, R * 0.38, col, k.out, k.lw * 0.7); _ellipse(c, R * 0.52, hy + R * 0.05, R * 0.14, R * 0.12, shade(col, 0.2), k.out, 1.2); _line(c, -R * 0.1, hy - R * 0.36, R * 0.12, hy - R * 0.36, k.out, 2); _ellipse(c, R * 0.1, hy - R * 0.1, R * 0.05, R * 0.05, k.out); },
};
const HALOS = {
  ring(c, col, k, y) { const R = k.R; c.strokeStyle = "rgba(255,255,255,.55)"; c.lineWidth = R * 0.2; c.beginPath(); c.ellipse(0, y, R * 0.6, R * 0.17, 0, 0, 7); c.stroke(); c.strokeStyle = col; c.lineWidth = R * 0.1; c.stroke(); },
  sun(c, col, k, y) { const R = k.R; c.save(); c.translate(0, y); c.rotate(k.t); for (let i = 0; i < 10; i++) { c.rotate(0.628); _poly(c, R, [0.28, -0.05, 0.55, 0, 0.28, 0.05], col); } _ellipse(c, 0, 0, R * 0.26, R * 0.26, col, shade(col, -0.35), 1.5); c.restore(); },
  moon(c, col, k, y) { const R = k.R; c.beginPath(); c.moveTo(-R * 0.4, y + R * 0.1); c.quadraticCurveTo(0, y - R * 0.95, R * 0.4, y + R * 0.1); c.quadraticCurveTo(0, y - R * 0.45, -R * 0.4, y + R * 0.1); _fs(c, col, shade(col, -0.35), 1.4); },
  star(c, col, k, y) { const R = k.R; c.save(); c.translate(0, y); c.rotate(k.t); _star(c, R * 0.38, 5, 0.45); _fs(c, col, shade(col, -0.35), 1.4); c.restore(); },
};
const ACCS = {
  scarf(c, col, k) { const R = k.R; c.lineCap = "round"; c.beginPath(); c.moveTo(-R * 0.85, R * 0.3); c.quadraticCurveTo(0, R * 0.95, R * 0.85, R * 0.3); c.strokeStyle = k.out; c.lineWidth = R * 0.32 + k.lw * 0.6; c.stroke(); c.strokeStyle = col; c.lineWidth = R * 0.3; c.stroke(); _poly(c, R, [0.3, 0.6, 0.75, 0.7, 0.62, 1.2, 0.3, 1.05], col, k.out, 1.4); },
  cape(c, col, k) { const R = k.R, f = Math.sin(k.t * 3 + k.seed) * R * 0.08; c.beginPath(); c.moveTo(-R * 0.8, -R * 0.05); c.lineTo(-R * 1.3 - f, R * 1.1); c.quadraticCurveTo(0, R * 1.35, R * 1.3 + f, R * 1.1); c.lineTo(R * 0.8, -R * 0.05); c.closePath(); _fs(c, col, k.out, k.lw * 0.8); c.strokeStyle = shade(col, 0.5); c.lineWidth = 2; c.beginPath(); c.moveTo(-R * 1.28 - f, R * 1.08); c.quadraticCurveTo(0, R * 1.32, R * 1.28 + f, R * 1.08); c.stroke(); },
  gem(c, col, k) { const R = k.R; c.save(); c.translate(0, R * 0.62); _poly(c, R, [0, -0.2, 0.18, 0, 0, 0.22, -0.18, 0], col, k.out, 1.4); _poly(c, R, [0, -0.2, 0.18, 0, 0, 0], shade(col, 0.5)); _spark(c, -R * 0.06, -R * 0.06, R * 0.07, "#fff"); c.restore(); },
  clover(c, col, k) { const R = k.R; c.save(); c.translate(-R * 0.6, -R * 0.6); for (let i = 0; i < 4; i++) { c.rotate(1.5708); _ellipse(c, R * 0.1, 0, R * 0.1, R * 0.09, col, shade(col, -0.4), 1); } _line(c, 0, 0, R * 0.1, R * 0.25, shade(col, -0.3), 1.4); c.restore(); },
  bamboo(c, col, k) { const R = k.R; for (const [x, a, h] of [[0.85, 0.1, 1.2], [1.1, 0.25, 0.9]]) { c.save(); c.translate(x * R, R * 0.35); c.rotate(a); _line(c, 0, 0, 0, -h * R, k.out, R * 0.2); _line(c, 0, 0, 0, -h * R, col, R * 0.13); for (let i = 1; i < 3; i++) _line(c, -R * 0.08, -h * R * i / 3, R * 0.08, -h * R * i / 3, shade(col, -0.35), 1.5); c.restore(); } },
  leafcollar(c, col, k) { const R = k.R; for (let i = -3; i <= 3; i++) { const a = Math.PI / 2 + i * 0.3; c.save(); c.translate(Math.cos(a) * R * 0.95, Math.sin(a) * k.ry * 0.62 + R * 0.2); c.rotate(a + Math.PI / 2 - 0.2); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(R * 0.2, -R * 0.2, 0, -R * 0.5); c.quadraticCurveTo(-R * 0.2, -R * 0.2, 0, 0); _fs(c, i % 2 ? col : shade(col, 0.2), shade(col, -0.4), 1.2); c.restore(); } },
  lavadrip(c, col, k) { const R = k.R; for (const [x, l] of [[-0.45, 0.4], [0.05, 0.62], [0.5, 0.35]]) { const y0 = -k.ry * 0.88; _ellipse(c, x * R, y0 + R * 0.1, R * 0.17, R * 0.12, col); c.beginPath(); c.moveTo((x - 0.12) * R, y0 + R * 0.1); c.lineTo((x - 0.08) * R, y0 + l * R); c.arc(x * R, y0 + l * R, R * 0.08, Math.PI, 0, true); c.lineTo((x + 0.12) * R, y0 + R * 0.1); c.closePath(); c.fillStyle = col; c.fill(); } },
  bubble(c, col, k) { const R = k.R; for (const [x, y, s, p] of [[0.95, -0.55, 0.22, 0], [1.1, -0.1, 0.15, 1.5], [-1.0, -0.5, 0.17, 3]]) { const yy = y * R + Math.sin(k.t * 2 + p) * R * 0.08; _ellipse(c, x * R, yy, s * R, s * R, "rgba(200,235,255,.5)", "#fff", 1.4); _ellipse(c, x * R - s * R * 0.3, yy - s * R * 0.3, s * R * 0.25, s * R * 0.25, "#fff"); } },
  shell(c, col, k) { const R = k.R; c.save(); c.translate(0, R * 0.62); c.beginPath(); c.moveTo(0, R * 0.15); c.quadraticCurveTo(-R * 0.5, -R * 0.05, -R * 0.38, -R * 0.35); c.quadraticCurveTo(0, -R * 0.55, R * 0.38, -R * 0.35); c.quadraticCurveTo(R * 0.5, -R * 0.05, 0, R * 0.15); _fs(c, col, k.out, 1.4); c.strokeStyle = shade(col, -0.3); c.lineWidth = 1; c.beginPath(); for (let i = -2; i <= 2; i++) { c.moveTo(0, R * 0.12); c.lineTo(i * R * 0.17, -R * 0.38); } c.stroke(); c.restore(); },
  pearl(c, col, k) { const R = k.R; _ellipse(c, 0, R * 0.62, R * 0.17, R * 0.17, col, "#b9c8e6", 1.4); _ellipse(c, -R * 0.06, R * 0.56, R * 0.05, R * 0.05, "#fff"); },
  spout(c, col, k) { const R = k.R; c.strokeStyle = col; c.lineWidth = Math.max(2, R * 0.1); c.lineCap = "round"; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(R * 0.1, -k.ry * 0.95); c.quadraticCurveTo(R * 0.1 + i * R * 0.3, -R * 1.9, R * 0.1 + i * R * 0.6, -R * 1.3 + Math.sin(k.t * 5 + i) * R * 0.1); c.stroke(); } _ellipse(c, R * 0.1, -k.ry * 0.95, R * 0.14, R * 0.07, col); },
  wand(c, col, k) { const R = k.R; _line(c, R * 0.8, R * 0.55, R * 1.35, -R * 0.55, k.out, R * 0.12); _line(c, R * 0.8, R * 0.55, R * 1.35, -R * 0.55, "#c98f4a", R * 0.07); c.save(); c.translate(R * 1.35, -R * 0.62); c.rotate(k.t); _star(c, R * 0.32, 5, 0.5); _fs(c, col, k.out, 1.4); c.restore(); },
  moon(c, col, k) { const R = k.R; c.strokeStyle = "rgba(120,100,60,.7)"; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-R * 0.55, R * 0.3); c.quadraticCurveTo(0, R * 0.9, R * 0.55, R * 0.3); c.stroke(); c.beginPath(); c.moveTo(-R * 0.17, R * 0.7); c.quadraticCurveTo(R * 0.1, R * 0.45, R * 0.17, R * 0.75); c.quadraticCurveTo(R * 0.02, R * 0.88, -R * 0.17, R * 0.7); _fs(c, col, k.out, 1.2); },
  lightning(c, col, k) { const R = k.R; c.save(); c.translate(0, R * 0.58); _poly(c, R, [0.08, -0.25, -0.15, 0.05, -0.02, 0.05, -0.1, 0.3, 0.17, -0.05, 0.03, -0.05], col, k.out, 1.3); c.restore(); },
  armor(c, col, k) { const R = k.R; _sym(c, () => _ellipse(c, R * 0.82, R * 0.12, R * 0.28, R * 0.2, col, k.out, 1.4)); _poly(c, R, [-0.4, 0.3, 0.4, 0.3, 0.3, 0.85, -0.3, 0.85], col, k.out, 1.4); _line(c, 0, R * 0.33, 0, R * 0.82, shade(col, -0.3), 1.2); },
  bell(c, col, k) { const R = k.R; c.beginPath(); c.moveTo(-R * 0.85, R * 0.3); c.quadraticCurveTo(0, R * 0.9, R * 0.85, R * 0.3); c.strokeStyle = "#e8442e"; c.lineWidth = R * 0.14; c.lineCap = "round"; c.stroke(); _ellipse(c, 0, R * 0.75, R * 0.15, R * 0.15, col, k.out, 1.3); _line(c, -R * 0.1, R * 0.8, R * 0.1, R * 0.8, k.out, 1); },
  coin(c, col, k) { const R = k.R; _ellipse(c, R * 0.7, R * 0.58, R * 0.2, R * 0.2, col, shade(col, -0.45), 1.5); _line(c, R * 0.7, R * 0.5, R * 0.7, R * 0.66, shade(col, -0.4), 1.4); },
  dice(c, col, k) { const R = k.R; c.save(); c.translate(-R * 0.78, R * 0.6); c.rotate(-0.3 + Math.sin(k.t * 2) * 0.05); _poly(c, R, [-0.2, -0.2, 0.2, -0.2, 0.2, 0.2, -0.2, 0.2], "#fff", k.out, 1.4); for (const [x, y] of [[-0.09, -0.09], [0.09, 0.09], [0, 0]]) _ellipse(c, x * R, y * R, R * 0.04, R * 0.04, "#2b1b10"); c.restore(); },
  glasses(c, col, k) { const R = k.R; c.strokeStyle = col; c.lineWidth = Math.max(1.8, R * 0.07); _sym(c, () => { c.beginPath(); c.arc(R * 0.38, -R * 0.08, R * 0.25, 0, 7); c.stroke(); }); _line(c, -R * 0.13, -R * 0.08, R * 0.13, -R * 0.08, col, Math.max(1.6, R * 0.06)); },
  coinbag(c, col, k) { const R = k.R; c.save(); c.translate(-R * 0.85, R * 0.65); _ellipse(c, 0, 0, R * 0.3, R * 0.27, "#b98c4a", k.out, 1.4); _poly(c, R, [-0.1, -0.22, 0.1, -0.22, 0.16, -0.38, -0.16, -0.38], "#b98c4a", k.out, 1.2); _ellipse(c, 0, R * 0.02, R * 0.12, R * 0.12, col, shade(col, -0.45), 1.2); c.restore(); },
  crystalball(c, col, k) { const R = k.R; _ellipse(c, R * 0.85, R * 0.95, R * 0.22, R * 0.07, "#8a6a4a"); const g = c.createRadialGradient(R * 0.8, R * 0.6, 0, R * 0.85, R * 0.72, R * 0.3); g.addColorStop(0, "#fff"); g.addColorStop(1, col); _ellipse(c, R * 0.85, R * 0.72, R * 0.28, R * 0.28, g, k.out, 1.4); _spark(c, R * 0.85, R * 0.7 + Math.sin(k.t * 3) * R * 0.05, R * 0.1, "#fff"); },
  coinpaw(c, col, k) { const R = k.R; _ellipse(c, R * 0.92, R * 0.4, R * 0.22, R * 0.22, col, shade(col, -0.45), 1.5); _spark(c, R * 0.86, R * 0.33, R * 0.08, "#fff"); },
};
const FRONT_PARTS = { horn: HORNS, hat: HATS, acc: ACCS, mark: MARKS };
const PART_LIB = { ear: EARS, horn: HORNS, wing: WINGS, tail: TAILS, mane: MANES, back: BACKS, shell: SHELLS, hat: HATS, halo: HALOS, acc: ACCS, mark: MARKS, tentacle: TENTACLES };

// ---------- 등급 스타일 조회 ----------
const HERO_STYLE = { scale: 1.3, outlineW: 3, sat: 1.05, shine: "gloss", plate: "disc", aura: "glow", decor: 0, sparkPerSec: 2, fxScale: 1.3, gid: -1, gcol: "#ffd54f", tile: ["#fffbe0", "#ffeb99", "#ffc400"], tileBorderW: 4.5, badge: ["crown", 1, "#ffc400"] };
const _gmap = new WeakMap();
function gradeIdOf(gs) { if (gs.gid != null) return gs.gid; let v = _gmap.get(gs); if (v == null) { v = GRADES.findIndex((G) => G.style === gs); _gmap.set(gs, v); } return v; }
function gradeColorOf(gs) { if (gs.gcol) return gs.gcol; const g = gradeIdOf(gs); return g >= 0 ? GRADES[g].color : "#ffd54f"; }
const EMB_COL = ["#4caf50", "#ff5a36", "#29b6f6", "#ffd54f"];
const CLAN_BODY = EMB_COL;

// ---------- 오프스크린 굽기(bake) 공용 ----------
// 계약: 전역 GFX_SC(렌더 배율), GFX_LOW 는 game.js 가 정의. 시간버킷(기본 20fps, LOW 12fps)마다 세대를 갈아끼우고 캔버스는 풀에서 재사용.
const GFX_BAKE_FPS = 20;
const _MO0 = { ox: 0, oy: 0, tilt: 0, hop: 0, sqa: 1 };
const BK_POOL_PX = 14e6; // 풀 총 픽셀 상한
const _bakeGen = new Map(), _bkPool = new Map();
let _bkB = -1, _bkSC = 0, _bkFps = 0, _bkPoolPx = 0;
const _ba = {}; // 굽기 함수에 넘기는 재사용 파라미터 (동기 호출 전용)
const _gfxSC = () => { const v = typeof GFX_SC !== "undefined" ? GFX_SC : 1; return v > 0 ? v : 1; };
const _canBake = () => typeof document !== "undefined";
function _bkResetAll() { _bakeGen.clear(); _bkPool.clear(); _bkPoolPx = 0; _bkB = -1; _boardCache = null; }
function _bkRelease() {
  for (const e of _bakeGen.values()) {
    const P = e.cv.width, px = P * P; if (px > BK_POOL_PX / 4) continue; // 너무 큰 캔버스는 버림
    while (_bkPoolPx + px > BK_POOL_PX && _bkPool.size) { const k0 = _bkPool.keys().next().value, a0 = _bkPool.get(k0); _bkPoolPx -= a0.length * k0 * k0; _bkPool.delete(k0); }
    let a = _bkPool.get(P); if (!a) { a = []; _bkPool.set(P, a); } a.push(e.cv); _bkPoolPx += px;
  }
  _bakeGen.clear();
}
// key: 문자열, E: 논리 반폭(원점=캔버스 중앙), fn(ctx, bucketTime, A). 반환 {cv,E} 또는 null(굽기 불가)
function _bake(t, key, E, fn, A) {
  if (!_canBake()) return null;
  const sc = _gfxSC(), fps = _LOW() ? 12 : GFX_BAKE_FPS;
  if (sc !== _bkSC || fps !== _bkFps) { _bkResetAll(); _bkSC = sc; _bkFps = fps; }
  const b = Math.floor(t * fps); if (b !== _bkB) { _bkRelease(); _bkB = b; }
  let e = _bakeGen.get(key); if (e) return e;
  const P = Math.max(2, Math.ceil(2 * E * sc)); let cv;
  const pa = _bkPool.get(P);
  if (pa && pa.length) { cv = pa.pop(); _bkPoolPx -= P * P; if (!pa.length) _bkPool.delete(P); }
  else { cv = document.createElement("canvas"); cv.width = cv.height = P; }
  const g = cv.getContext("2d"); e = { cv, E: P / (2 * sc) };
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, P, P); g.save(); g.setTransform(sc, 0, 0, sc, P / 2, P / 2);
  try { fn(g, b / fps, A); } catch (err) { /* 렌더가 죽지 않게 */ }
  try { g.restore(); } catch (err) { /* noop */ }
  _bakeGen.set(key, e); return e;
}
// (x,y) 중심에 구운 레이어를 찍는다. 굽기 불가 시 라이브로 그림.
function _bakeAt(c, t, key, E, x, y, fn, A) {
  const e = _bake(t, key, E, fn, A);
  if (e) c.drawImage(e.cv, x - e.E, y - e.E, 2 * e.E, 2 * e.E);
  else { c.save(); c.translate(x, y); fn(c, t, A); c.restore(); }
}
let _boardCache = null;

// ---------- 캐릭터 코어 ----------
const _layerCache = new WeakMap();
function _layers(look) {
  let L = _layerCache.get(look); if (L) return L;
  L = { back: [], ear: [], mid: [], front: [], post: [], hasHat: false, beak: "#ffb347" };
  for (const p of [...(look.base || []), ...(look.parts || [])]) {
    const [ty, st, col] = p;
    if (ty === "hat") L.hasHat = true;
    if (ty === "beak") { L.beak = st; L.post.push(p); }
    else if (ty === "whisker" || ty === "nose") L.post.push(p);
    else if (ty === "ear") (EAR_FRONT[st] ? L.front : L.ear).push(p);
    else if (BACK_PARTS[ty] || (ty === "acc" && st === "cape")) L.back.push(p);
    else if (ty === "mark") L.mid.push(p);
    else L.front.push(p);
  }
  _layerCache.set(look, L); return L;
}
function _outColor(look, gs, t, sat) {
  const g = gradeIdOf(gs), base = shade(satHex(look.c1, sat), -0.55);
  if (g < 0) return mixHex(base, gradeColorOf(gs), 0.35);
  if (g < 3) return base;
  if (g === 7) return `hsl(${Math.floor(t * 120) % 360},85%,58%)`;
  return mixHex(base, GRADES[g].color, 0.15 + (g - 3) * 0.1125);
}
function drawVectorChar(c, look, gs, x, y, r, t, opt) {
  opt = opt || {};
  const sat = gs.sat, g = gradeIdOf(gs), sh = look.shape || [1, 1], rx = r * sh[0], ry = r * 0.95 * sh[1];
  const seed = opt.seed != null ? opt.seed : (x * 0.37) % 6.28;
  const nb = !!opt.nobob;
  const bob = nb ? 0 : Math.sin(t * 4 + seed) * r * 0.05, sq = nb ? 1 : 1 + Math.sin(t * 4 + seed) * 0.03;
  const { ox, oy, tilt, hop, sqa } = nb ? _MO0 : motionOf(opt.anim, r), sy = sq * sqa;
  const out = _outColor(look, gs, t, sat), lw = gs.outlineW;
  const s = (h) => satHex(h, sat);
  const L = _layers(look), lite = !!opt.lite;
  const k = { R: r, ry, t, lw, out, s, seed, hasHat: L.hasHat, g };
  c.save(); c.translate(x + ox, y + bob + oy - hop); c.rotate(tilt); c.scale(1 / sy, sy);
  if (opt.dim) c.globalAlpha = 0.45;
  if (opt.img) { if (opt.imgK) { const sz = r * opt.imgK; c.drawImage(opt.img, -sz / 2, -sz / 2, sz, sz); } else { const sz = r * 2.7; c.drawImage(opt.img, -sz / 2, -sz * 0.56, sz, sz); } c.restore(); return; }
  const run = (list) => { for (const [ty, st, col] of list) { const fn = PART_LIB[ty] && PART_LIB[ty][st]; if (fn) fn(c, col ? s(col) : "#fff", k); } };
  if (!lite) run(L.back);
  // 귀(몸 뒤)
  run(L.ear);
  // 몸
  const c1 = s(look.c1), c2 = s(look.c2), shine = gs.shine;
  const body = () => { c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, 7); };
  body();
  if (shine === "flat") c.fillStyle = c1;
  else { const bg = c.createRadialGradient(-rx * 0.35, -ry * 0.45, r * 0.1, 0, 0, r * 1.15); bg.addColorStop(0, shade(c1, 0.5)); bg.addColorStop(0.5, c1); bg.addColorStop(1, shade(c1, -0.14)); c.fillStyle = bg; }
  c.fill(); c.strokeStyle = out; c.lineWidth = lw; c.lineJoin = "round"; c.stroke();
  // 광택 규칙
  if (shine !== "flat") {
    if (shine !== "holo" || true) { c.fillStyle = "rgba(255,255,255,.55)"; c.beginPath(); c.ellipse(-rx * 0.5, -ry * 0.62, r * 0.22, r * 0.11, -0.6, 0, 7); c.fill(); }
    if (shine === "metal") { c.strokeStyle = "rgba(255,255,255,.85)"; c.lineWidth = Math.max(1.5, lw * 0.5); c.beginPath(); c.ellipse(0, 0, rx - lw * 0.7, ry - lw * 0.7, 0, Math.PI * 0.95, Math.PI * 1.65); c.stroke(); c.strokeStyle = "rgba(0,0,0,.25)"; c.beginPath(); c.ellipse(0, 0, rx - lw * 0.7, ry - lw * 0.7, 0, Math.PI * 0.05, Math.PI * 0.6); c.stroke(); }
    else if (shine === "gold") { c.save(); body(); c.clip(); const gg = c.createLinearGradient(-rx, -ry, rx, ry); gg.addColorStop(0, "rgba(255,230,120,.5)"); gg.addColorStop(0.5, "rgba(255,196,0,.18)"); gg.addColorStop(1, "rgba(255,160,0,.45)"); c.fillStyle = gg; c.fillRect(-rx, -ry, rx * 2, ry * 2); c.restore(); c.strokeStyle = "#ffd54f"; c.lineWidth = Math.max(1.5, lw * 0.45); c.beginPath(); c.ellipse(0, 0, rx - lw * 0.6, ry - lw * 0.6, 0, Math.PI * 0.9, Math.PI * 1.7); c.stroke(); }
    else if (shine === "holo") { c.save(); body(); c.clip(); const hh = c.createLinearGradient(-rx, -ry, rx, ry), ho = t * 140; for (let i = 0; i <= 4; i++) hh.addColorStop(i / 4, `hsla(${Math.floor(ho + i * 70) % 360},100%,72%,.5)`); c.fillStyle = hh; c.fillRect(-rx, -ry, rx * 2, ry * 2); c.restore(); }
    else if (shine === "glitter" && !_LOW()) { for (let i = 0; i < 4; i++) { const a = t * 1.5 + i * 1.57, tw = 0.5 + 0.5 * Math.sin(t * 6 + i * 2); _spark(c, Math.cos(a) * rx * 0.62, Math.sin(a) * ry * 0.55, r * 0.14 * (0.4 + tw), "#fff"); } }
  }
  // 배: belly 규칙이면 그라데이션
  if (shine === "belly") { const bgg = c.createRadialGradient(0, ry * 0.5, 0, 0, ry * 0.4, r * 0.7); bgg.addColorStop(0, c2); bgg.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = bgg; c.beginPath(); c.ellipse(0, ry * 0.38, rx * 0.72, ry * 0.58, 0, 0, 7); c.fill(); }
  else _ellipse(c, 0, ry * 0.36, rx * 0.62, ry * 0.5, c2);
  run(L.mid);
  // 얼굴
  const face = look.face || ["dot", "smile"], ek = face[0], mk = face[1];
  const ey = -ry * 0.08, ex = rx * 0.38, er = r * 0.17;
  const blink = Math.sin(t * 1.3 + seed * 5) > 0.985 ? 0.15 : 1;
  c.fillStyle = "#2b1b10";
  for (const sg of [-1, 1]) {
    const px = sg * ex;
    if (ek === "sleepy") { c.strokeStyle = "#2b1b10"; c.lineWidth = Math.max(1.8, r * 0.09); c.lineCap = "round"; c.beginPath(); c.arc(px, ey - er * 0.25, er * 1.05, 0.2, Math.PI - 0.2); c.stroke(); }
    else if (ek === "star") { c.save(); c.translate(px, ey); _star(c, er * 1.7, 5, 0.5); c.fillStyle = "#ffd54f"; c.fill(); c.strokeStyle = "#8a5a00"; c.lineWidth = 1.2; c.stroke(); c.restore(); }
    else {
      const m = ek === "big" ? 1.35 : 1;
      _ellipse(c, px, ey, er * m, er * 1.15 * m * blink, "#2b1b10");
      if (blink === 1) { _ellipse(c, px - er * 0.3 * m, ey - er * 0.4 * m, er * 0.42 * m, er * 0.42 * m, "#fff"); _ellipse(c, px + er * 0.3 * m, ey + er * 0.35 * m, er * 0.2 * m, er * 0.2 * m, "rgba(255,255,255,.85)"); }
      if (ek === "sharp") _line(c, sg * (ex + er * 1.5), ey - er * 2.0, sg * (ex - er * 1.0), ey - er * 1.15, "#2b1b10", Math.max(1.6, r * 0.09));
    }
  }
  _ellipse(c, -rx * 0.68, ry * 0.22, r * 0.16, r * 0.1, "rgba(255,120,150,.55)"); _ellipse(c, rx * 0.68, ry * 0.22, r * 0.16, r * 0.1, "rgba(255,120,150,.55)");
  c.strokeStyle = "#2b1b10"; c.lineWidth = Math.max(1.5, r * 0.085); c.lineCap = "round";
  if (mk === "beak") { c.beginPath(); c.moveTo(-r * 0.15, ry * 0.18); c.lineTo(r * 0.15, ry * 0.18); c.lineTo(0, ry * 0.42); c.closePath(); c.fillStyle = s(L.beak); c.fill(); c.lineWidth = 1; c.stroke(); }
  else if (mk === "cat") { c.beginPath(); c.moveTo(-r * 0.07, ry * 0.12); c.lineTo(r * 0.07, ry * 0.12); c.lineTo(0, ry * 0.2); c.closePath(); c.fillStyle = "#ff9eb5"; c.fill(); c.beginPath(); c.moveTo(0, ry * 0.2); c.quadraticCurveTo(-r * 0.06, ry * 0.38, -r * 0.17, ry * 0.3); c.moveTo(0, ry * 0.2); c.quadraticCurveTo(r * 0.06, ry * 0.38, r * 0.17, ry * 0.3); c.stroke(); }
  else {
    _ellipse(c, 0, ry * 0.15, r * 0.07, r * 0.05, "#2b1b10");
    c.beginPath(); c.moveTo(-r * 0.15, ry * 0.3); c.quadraticCurveTo(-r * 0.07, ry * 0.4, 0, ry * 0.3); c.quadraticCurveTo(r * 0.07, ry * 0.4, r * 0.15, ry * 0.3); c.stroke();
    if (mk === "fang") { c.fillStyle = "#fff"; for (const sg of [-1, 1]) { c.beginPath(); c.moveTo(sg * r * 0.08, ry * 0.33); c.lineTo(sg * r * 0.17, ry * 0.33); c.lineTo(sg * r * 0.12, ry * 0.48); c.closePath(); c.fill(); } }
  }
  // 앞쪽 부위 (코/수염/부리 → 뿔/모자/후광/소품)
  for (const [ty, st, col] of L.post) {
    if (ty === "whisker") { c.strokeStyle = out; c.lineWidth = 1.2; c.beginPath(); for (const sg of [-1, 1]) { c.moveTo(sg * rx * 0.75, ry * 0.12); c.lineTo(sg * rx * 1.15, ry * 0.05); c.moveTo(sg * rx * 0.75, ry * 0.25); c.lineTo(sg * rx * 1.15, ry * 0.3); } c.stroke(); }
    else if (ty === "nose") _ellipse(c, 0, ry * 0.2, r * 0.28, r * 0.2, s(st === "pink" ? col : st), out, 1.2);
  }
  if (!lite) {
    run(L.front.filter((p) => p[0] !== "halo"));
    for (const p of L.front) if (p[0] === "halo") { const fn = HALOS[p[1]]; if (fn) fn(c, s(p[2]), k, -ry - r * (L.hasHat ? 1.15 : 0.55) + Math.sin(t * 3 + seed) * r * 0.06); }
    if (opt.crown) { // 히어로 왕관
      const cy = -ry - (L.hasHat ? r * 0.75 : r * 0.02);
      c.save(); c.translate(0, cy); const cr = r * 0.8 / 1; _poly(c, cr, [-0.42, 0.05, -0.46, -0.42, -0.2, -0.2, 0, -0.52, 0.2, -0.2, 0.46, -0.42, 0.42, 0.05], "#ffd54f", "#5b3a1e", 1.8); _ellipse(c, 0, -cr * 0.02, cr * 0.07, cr * 0.07, "#ff4f81"); c.restore();
    }
  }
  c.restore();
}

// ---------- 받침 / 오라 / 파티클 ----------
function drawPlate(c, x, y, r, gs, t) {
  const pl = gs.plate; if (!pl || pl === "none") return;
  const col = gradeColorOf(gs), py = y + r * 0.88, rx = r * 1.05, ry = rx * 0.3, pale = mixHex(col, "#ffffff", 0.45);
  c.save(); c.translate(x, py); c.lineWidth = 2.2;
  const rainbow = pl.indexOf("rainbow") >= 0;
  if (pl === "disc") { _ellipse(c, 0, 0, rx * 0.9, ry * 0.9, pale, col, 2); }
  else if (pl === "ring" || pl === "ring2") { c.globalAlpha = 0.35; _ellipse(c, 0, 0, rx * 0.95, ry * 0.95, col); c.globalAlpha = 1; c.strokeStyle = col; c.lineWidth = 2.5; c.beginPath(); c.ellipse(0, 0, rx * 0.95, ry * 0.95, 0, 0, 7); c.stroke(); if (pl === "ring2") { c.lineWidth = 1.8; c.beginPath(); c.ellipse(0, 0, rx * 1.3, ry * 1.3, 0, 0, 7); c.stroke(); } }
  else if (pl === "hex") {
    const pulse = 0.5 + 0.5 * Math.sin(t * 3); c.globalAlpha = 0.25 + pulse * 0.15; c.fillStyle = col; c.beginPath(); for (let i = 0; i < 6; i++) { const a = i * 1.0472; c[i ? "lineTo" : "moveTo"](Math.cos(a) * rx * 1.15, Math.sin(a) * ry * 1.15); } c.closePath(); c.fill(); c.globalAlpha = 1; c.strokeStyle = col; c.lineWidth = 2.6; c.stroke();
    c.strokeStyle = "rgba(255,255,255,.8)"; c.lineWidth = 1.2; c.beginPath(); for (let i = 0; i < 6; i++) { const a = i * 1.0472; c[i ? "lineTo" : "moveTo"](Math.cos(a) * rx * 0.8, Math.sin(a) * ry * 0.8); } c.closePath(); c.stroke();
  } else { // rune 계열
    const base = rainbow ? null : col;
    if (rainbow) { const g = c.createLinearGradient(-rx, 0, rx, 0); for (let i = 0; i <= 5; i++) g.addColorStop(i / 5, `hsl(${Math.floor(t * 90 + i * 60) % 360},95%,62%)`); c.strokeStyle = g; c.fillStyle = "rgba(255,255,255,.4)"; } else { c.strokeStyle = base; c.fillStyle = col + "40"; }
    c.lineWidth = 2.6; c.beginPath(); c.ellipse(0, 0, rx * 1.25, ry * 1.25, 0, 0, 7); c.fill(); c.stroke(); c.lineWidth = 1.6; c.beginPath(); c.ellipse(0, 0, rx * 0.85, ry * 0.85, 0, 0, 7); c.stroke();
    c.lineWidth = 2; const n = 8, rot = t * 0.9;
    for (let i = 0; i < n; i++) { const a = rot + (i / n) * 6.283, ca = Math.cos(a), sa = Math.sin(a); c.beginPath(); c.moveTo(ca * rx * 0.85, sa * ry * 0.85); c.lineTo(ca * rx * 1.25, sa * ry * 1.25); c.stroke(); }
    c.beginPath(); for (let i = 0; i < 3; i++) { const a = -rot * 0.7 + i * 2.094, a2 = a + 2.094 * 2; c.moveTo(Math.cos(a) * rx * 0.85, Math.sin(a) * ry * 0.85); c.lineTo(Math.cos(a2) * rx * 0.85, Math.sin(a2) * ry * 0.85); } c.stroke();
    if (pl.indexOf("pillars") >= 0) { for (const sx of [-1, 1]) { const px = sx * rx * 1.05, g = c.createLinearGradient(0, 0, 0, -r * 2.6); g.addColorStop(0, col + "aa"); g.addColorStop(1, col + "00"); c.fillStyle = g; c.fillRect(px - r * 0.12, -r * 2.6, r * 0.24, r * 2.6); } }
    if (rainbow) { // 상승 빛기둥 + 파문
      const g = c.createLinearGradient(0, 0, 0, -r * 3.2); g.addColorStop(0, `hsla(${Math.floor(t * 120) % 360},100%,75%,.55)`); g.addColorStop(1, `hsla(${Math.floor(t * 120 + 120) % 360},100%,75%,0)`); c.fillStyle = g; c.beginPath(); c.moveTo(-rx * 0.7, 0); c.lineTo(-rx * 0.35, -r * 3.2); c.lineTo(rx * 0.35, -r * 3.2); c.lineTo(rx * 0.7, 0); c.closePath(); c.fill();
      for (let i = 0; i < 2; i++) { const p = ((t * 0.7 + i * 0.5) % 1); c.globalAlpha = 1 - p; c.strokeStyle = "#fff"; c.lineWidth = 1.5; c.beginPath(); c.ellipse(0, 0, rx * (0.4 + p * 1.0), ry * (0.4 + p * 1.0), 0, 0, 7); c.stroke(); } c.globalAlpha = 1;
    }
  }
  c.restore();
}
const _glowCv = new Map();
function _glowImg(col, rad) {
  if (typeof document === "undefined") return null;
  const key = col + Math.round(rad); let cv = _glowCv.get(key); if (cv) return cv;
  const s = Math.ceil(rad * 2); cv = document.createElement("canvas"); cv.width = cv.height = s; const g = cv.getContext("2d");
  const gr = g.createRadialGradient(rad, rad, rad * 0.25, rad, rad, rad); gr.addColorStop(0, col + "99"); gr.addColorStop(0.55, col + "33"); gr.addColorStop(1, col + "00");
  g.fillStyle = gr; g.fillRect(0, 0, s, s); _glowCv.set(key, cv); return cv;
}
function drawAura(c, x, y, r, gs, t, layer) {
  const a = gs.aura; if (!a || a === "none") return;
  const col = gradeColorOf(gs), rainbow = a.indexOf("rainbow") >= 0, low = _LOW();
  const gr = a.indexOf("rays") >= 0 ? (rainbow ? 2.4 : 2.0) : a.indexOf("orbs") >= 0 ? 1.7 : a.indexOf("arc") >= 0 ? 1.6 : 1.4, rad = r * gr;
  if (layer === "back") {
    if (rainbow) { const g = c.createRadialGradient(x, y, r * 0.4, x, y, rad); g.addColorStop(0, `hsla(${Math.floor(t * 100) % 360},100%,75%,.55)`); g.addColorStop(0.5, `hsla(${Math.floor(t * 100 + 120) % 360},100%,70%,.28)`); g.addColorStop(1, `hsla(${Math.floor(t * 100 + 240) % 360},100%,70%,0)`); c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill(); }
    else { const im = _glowImg(col, rad); if (im) c.drawImage(im, x - rad, y - rad); else { const g = c.createRadialGradient(x, y, r * 0.4, x, y, rad); g.addColorStop(0, col + "88"); g.addColorStop(1, col + "00"); c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill(); } }
    if (a.indexOf("arc") >= 0) { c.strokeStyle = col; c.lineWidth = 3; c.lineCap = "round"; for (let i = 0; i < 2; i++) { const s0 = t * 1.8 + i * Math.PI; c.beginPath(); c.arc(x, y, r * 1.3, s0, s0 + 1.5); c.stroke(); } }
    if (a.indexOf("rays") >= 0 && !low) { const n = rainbow ? 8 : 5; for (let i = 0; i < n; i++) { const an = t * 0.5 + (i / n) * 6.283, w = 0.09; c.fillStyle = rainbow ? `hsla(${Math.floor(i * 45 + t * 80) % 360},100%,70%,.4)` : col + "55"; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(an - w) * rad * 1.05, y + Math.sin(an - w) * rad * 1.05); c.lineTo(x + Math.cos(an + w) * rad * 1.05, y + Math.sin(an + w) * rad * 1.05); c.closePath(); c.fill(); } }
  } else {
    if (a.indexOf("orbs") >= 0 && !low) for (let i = 0; i < 3; i++) { const an = t * 1.6 + i * 2.094, ox = Math.cos(an) * r * 1.35, oy = Math.sin(an) * r * 0.55 - r * 0.1; c.fillStyle = col; c.strokeStyle = "#fff"; c.lineWidth = 1.5; c.beginPath(); c.arc(x + ox, y + oy, 3.4, 0, 7); c.fill(); c.stroke(); }
    if (a.indexOf("sparkle") >= 0 && !low) for (let i = 0; i < 5; i++) { const an = t * 0.8 + i * 1.257, rr = r * (1.1 + 0.3 * Math.sin(t * 2 + i)), tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 5 + i * 3)); _spark(c, x + Math.cos(an) * rr, y + Math.sin(an) * rr * 0.9, 3 + tw * 3, `hsl(${Math.floor(i * 70 + t * 100) % 360},100%,80%)`); }
  }
}
const _pacc = {};
// game.js 가 호출. emit(p) 의 p = {x,y,vx,vy,l,m,col,s,g,shape,rb}. 동시 파티클 상한(GFX_MAX_PARTS=400)은 호출 측에서 건다.
const GFX_MAX_PARTS = 400;
function gradeParticles(idx, x, y, dt, emit) {
  const gs = idx >= 0 ? GRADES[CHARS[idx].grade].style : HERO_STYLE, g = gradeIdOf(gs);
  let rate = gs.sparkPerSec * (_LOW() ? 0.5 : 1); if (rate <= 0) return;
  const key = idx + "@" + Math.round(x) + "," + Math.round(y); let a = (_pacc[key] || 0) + rate * dt;
  const r = 13 * gs.scale, col = gradeColorOf(gs);
  while (a >= 1) {
    a -= 1; const rn = Math.random;
    const p = { x: x + (rn() - 0.5) * r * 1.8, y: y + r * 0.5 - rn() * r * 1.4, vx: (rn() - 0.5) * 10, vy: -14 - rn() * 18, l: 0.9 + rn() * 0.5, col, s: 2.2, g, shape: "dot" };
    if (g === 3) { p.s = 2; p.vy = -12; }
    else if (g === 4) { p.shape = "star"; p.s = 3; p.col = rn() < 0.5 ? col : "#fff3d6"; }
    else if (g === 5) { p.shape = rn() < 0.3 ? "heart" : "star"; p.s = 3.4; p.col = rn() < 0.5 ? col : "#ffd1e3"; }
    else if (g === 6) { p.shape = "star"; p.s = 4; p.vy = -26 - rn() * 16; p.col = rn() < 0.5 ? "#ffd54f" : "#fff6b0"; }
    else if (g === 7) { p.shape = "star"; p.s = 4.6; p.rb = (rn() * 360) | 0; p.vy = -30 - rn() * 20; p.vx = (rn() - 0.5) * 24; p.x = x + (rn() - 0.5) * r * 2.4; }
    else if (g < 0) { p.shape = "star"; p.s = 3; p.col = "#ffe27a"; }
    p.m = p.l; emit(p);
  }
  _pacc[key] = a;
}

// ---------- 뱃지 / 엠블렘 ----------
function badgeWidth(grade, size) { const [sh, n] = GRADES[grade].style.badge; return (sh === "crown" ? 1.0 : sh === "dot" ? 0.6 : 0.85) * size * n; }
function _crownPath(c, s) { c.beginPath(); c.moveTo(-s * 0.5, s * 0.3); c.lineTo(-s * 0.55, -s * 0.3); c.lineTo(-s * 0.22, -s * 0.05); c.lineTo(0, -s * 0.42); c.lineTo(s * 0.22, -s * 0.05); c.lineTo(s * 0.55, -s * 0.3); c.lineTo(s * 0.5, s * 0.3); c.closePath(); }
function drawBadge(c, x, y, grade, size) {
  size = size || 10; const [sh, n, col] = grade === -2 ? HERO_STYLE.badge : GRADES[grade].style.badge, w = badgeWidth(grade === -2 ? 6 : grade, size) / n;
  const x0 = x - (w * n) / 2 + w / 2; c.save(); c.lineJoin = "round";
  for (let i = 0; i < n; i++) {
    c.save(); c.translate(x0 + i * w, y); const cc = col === "rainbow" ? `hsl(${Math.floor((i * 90 + performance_now() * 0.15) % 360)},95%,60%)` : col;
    if (sh === "dot") { c.beginPath(); c.arc(0, 0, size * 0.27, 0, 7); c.fillStyle = cc; c.fill(); c.strokeStyle = "#fff"; c.lineWidth = 1.6; c.stroke(); }
    else if (sh === "star") { _star(c, size * 0.48, 5, 0.46); c.fillStyle = cc; c.fill(); c.strokeStyle = "#fff"; c.lineWidth = 1.5; c.stroke(); }
    else if (sh === "gem") { _poly(c, size, [0, -0.5, 0.42, -0.1, 0, 0.5, -0.42, -0.1], cc, "#fff", 1.6); _poly(c, size, [0, -0.5, 0.42, -0.1, 0, -0.1], shade(cc, 0.5)); }
    else { _crownPath(c, size * 0.95); c.fillStyle = cc; c.fill(); c.strokeStyle = "#7a5200"; c.lineWidth = 1.4; c.stroke(); c.fillStyle = "#fff"; c.beginPath(); c.arc(0, -size * 0.02, size * 0.07, 0, 7); c.fill(); }
    c.restore();
  }
  c.restore();
}
function performance_now() { return typeof performance !== "undefined" ? performance.now() : Date.now(); }
function drawEmblem(c, clan, x, y, size) {
  const col = EMB_COL[clan], s = size || 12; c.save(); c.translate(x, y); c.lineJoin = "round"; c.lineWidth = 2.6; c.strokeStyle = "#fff"; c.fillStyle = col;
  c.beginPath();
  if (clan === 0) { c.moveTo(-s * 0.45, s * 0.45); c.quadraticCurveTo(-s * 0.6, -s * 0.5, s * 0.5, -s * 0.5); c.quadraticCurveTo(s * 0.55, s * 0.55, -s * 0.45, s * 0.45); }
  else if (clan === 1) { c.moveTo(0, -s * 0.58); c.quadraticCurveTo(s * 0.2, -s * 0.15, s * 0.42, s * 0.1); c.quadraticCurveTo(s * 0.5, s * 0.55, 0, s * 0.55); c.quadraticCurveTo(-s * 0.5, s * 0.55, -s * 0.42, s * 0.05); c.quadraticCurveTo(-s * 0.35, -s * 0.15, -s * 0.12, -s * 0.2); c.quadraticCurveTo(-s * 0.1, -s * 0.4, 0, -s * 0.58); }
  else if (clan === 2) { c.moveTo(0, -s * 0.58); c.bezierCurveTo(s * 0.2, -s * 0.2, s * 0.45, s * 0.05, s * 0.4, s * 0.25); c.arc(0, s * 0.22, s * 0.4, 0, Math.PI, false); c.bezierCurveTo(-s * 0.45, s * 0.05, -s * 0.2, -s * 0.2, 0, -s * 0.58); }
  else { _star(c, s * 0.6, 5, 0.45); }
  c.closePath(); c.stroke(); c.fill();
  c.strokeStyle = "rgba(255,255,255,.75)"; c.lineWidth = 1; c.beginPath();
  if (clan === 0) { c.moveTo(-s * 0.3, s * 0.3); c.lineTo(s * 0.3, -s * 0.3); } else if (clan === 2) { c.arc(-s * 0.12, s * 0.2, s * 0.17, Math.PI * 0.55, Math.PI * 0.95); } else if (clan === 1) { c.moveTo(0, s * 0.45); c.quadraticCurveTo(-s * 0.2, s * 0.2, 0, 0); }
  c.stroke(); c.restore();
}
// 4무리 화력 비중 막대 (ui.js 가 선택적으로 사용): shares = [n0..n3]
function drawClanBar(c, x, y, w, h, shares) {
  const tot = shares.reduce((a, b) => a + b, 0) || 1; let cx = x; c.save();
  c.fillStyle = "rgba(0,0,0,.12)"; c.beginPath(); c.roundRect(x, y, w, h, h / 2); c.fill();
  c.beginPath(); c.roundRect(x, y, w, h, h / 2); c.clip();
  shares.forEach((v, i) => { const ww = (v / tot) * w; c.fillStyle = EMB_COL[i]; c.fillRect(cx, y, ww, h); cx += ww; });
  c.restore();
}

// ---------- 칸 / 오버레이 ----------
function _rrect(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
// grade: 0..7, -1=빈 칸, -2=히어로. clan: 0..3 (생략 가능)
function drawSlotTile(c, x, y, grade, sel, locked, t, clan) {
  const gs = grade >= 0 ? GRADES[grade].style : grade === -2 ? HERO_STYLE : null;
  _rrect(c, x - 28, y - 24, 56, 56, 16); c.fillStyle = "rgba(60,90,40,.25)"; c.fill();
  let top = "#fffdf3", bot = "#f6e8c3", bd = "#ecd9a6", bw = 2;
  if (gs) { top = gs.tile[0]; bot = gs.tile[1]; bd = gs.tile[2]; bw = gs.tileBorderW; }
  if (grade === 7) { top = `hsl(${Math.floor(t * 60) % 360},100%,96%)`; bot = `hsl(${Math.floor(t * 60 + 120) % 360},100%,90%)`; }
  const tg = c.createLinearGradient(0, y - 28, 0, y + 28); tg.addColorStop(0, sel ? shade(top.charAt(0) === "#" ? top : "#fffbd0", 0) : top); tg.addColorStop(1, bot);
  _rrect(c, x - 28, y - 28, 56, 56, 16); c.fillStyle = tg; c.fill();
  if (clan != null && clan >= 0 && grade !== -1) { c.globalAlpha = 0.28; c.fillStyle = EMB_COL[clan]; c.fill(); c.globalAlpha = 1; c.save(); c.clip(); c.fillStyle = EMB_COL[clan]; c.globalAlpha = 0.9; c.fillRect(x - 28, y + 25, 56, 3); c.restore(); }
  if (grade === 7) { const g = c.createLinearGradient(x - 28, y - 28, x + 28, y + 28); for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${Math.floor(t * 120 + i * 60) % 360},100%,62%)`); c.strokeStyle = g; }
  else c.strokeStyle = bd;
  c.lineWidth = bw; _rrect(c, x - 28, y - 28, 56, 56, 16); c.stroke();
  if (grade >= 4 && grade !== 7) { c.strokeStyle = "rgba(255,255,255,.6)"; c.lineWidth = 1; _rrect(c, x - 25, y - 25, 50, 50, 13); c.stroke(); }
  c.fillStyle = "rgba(255,255,255,.7)"; _rrect(c, x - 22, y - 24, 24, 5, 3); c.fill();
  if (sel) { c.strokeStyle = "#ffb703"; c.lineWidth = 3.5; _rrect(c, x - 29.5, y - 29.5, 59, 59, 17); c.stroke(); c.globalAlpha = 0.35 + 0.2 * Math.sin(t * 6); c.strokeStyle = "#fff3a0"; c.lineWidth = 6; _rrect(c, x - 31, y - 31, 62, 62, 19); c.stroke(); c.globalAlpha = 1; }
  if (locked) _lock(c, x - 21, y - 17);
}
function _lock(c, x, y) { c.save(); c.translate(x, y); c.fillStyle = "#6b7a8f"; c.strokeStyle = "#fff"; c.lineWidth = 1.2; c.beginPath(); c.roundRect(-5, -2, 10, 8, 2); c.fill(); c.stroke(); c.strokeStyle = "#6b7a8f"; c.lineWidth = 2; c.beginPath(); c.arc(0, -2, 3.2, Math.PI, 0); c.stroke(); c.restore(); }
// 슬롯 하나의 코너 표시: 우상단 등급 뱃지, 좌하단 엠블렘, 우하단 x n, 합성 가능 화살표. slot = {ch,n,lock,hero}
function drawSlotOverlay(c, x, y, slot, t) {
  if (!slot) return;
  const hero = !!slot.hero, grade = hero ? -2 : CHARS[slot.ch].grade, clan = hero ? -1 : CHARS[slot.ch].clan, n = slot.n || 1;
  const bs = 9, bwid = badgeWidth(hero ? 6 : grade, bs);
  drawBadge(c, x + 24 - bwid / 2, y - 21, grade, bs);
  if (clan >= 0) drawEmblem(c, clan, x - 19, y + 19, 17);
  if (n >= 2) { const s = n >= 12 ? "MAX" : "x" + n, w = s.length * 6.9 + 9.2; c.save(); c.fillStyle = n >= 12 ? "#e8442e" : "rgba(60,40,20,.85)"; _rrect(c, x + 26 - w, y + 12.2, w, 13.8, 7); c.fill(); c.fillStyle = "#fff"; c.font = "bold 10.4px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(s, x + 26 - w / 2, y + 19.2); c.restore(); }
  if (!hero && n >= 3 && grade < 6) { // 합성 가능 화살표 맥동
    const p = 0.5 + 0.5 * Math.sin(t * 6); c.save(); c.translate(x - 20, y - 17 - p * 2); c.fillStyle = "#35c759"; c.strokeStyle = "#fff"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, -6); c.lineTo(6, 1); c.lineTo(2.2, 1); c.lineTo(2.2, 6); c.lineTo(-2.2, 6); c.lineTo(-2.2, 1); c.lineTo(-6, 1); c.closePath(); c.stroke(); c.fill(); c.restore();
  }
  if (slot.lock) _lock(c, x + 0, y - 22 + 0);
}

// ---------- 유닛 / 히어로 ----------
const SPRITES = {};
function loadSprites() {
  if (typeof Image === "undefined") return;
  const keys = []; if (typeof CHARS !== "undefined") CHARS.forEach((ch) => keys.push(ch.key)); if (typeof HEROES !== "undefined") HEROES.forEach((h) => keys.push(h.id));
  for (const k of keys) { const im = new Image(); im.onload = () => { SPRITES[k] = im; }; im.onerror = () => {}; im.src = `assets/sprites/${k}.png`; }
}
// ----- 구운 유닛/히어로 -----
function _bkBack(g, bt, A) { if (!A.lite) { drawPlate(g, 0, 0, A.r, A.gs, bt); drawAura(g, 0, 0, A.r, A.gs, bt, "back"); } _ellipse(g, 0, A.r * 0.95, A.r * 0.8, A.r * 0.18, "rgba(0,0,0,.15)"); }
function _bkFront(g, bt, A) { drawAura(g, 0, 0, A.r, A.gs, bt, "front"); }
function _bkBody(g, bt, A) { drawVectorChar(g, A.look, A.gs, 0, 0, A.r, bt, { lite: A.lite, seed: A.seed, dim: A.dim, crown: A.crown, nobob: true }); }
function _bkStack(g, bt, A) {
  const r = A.r, rr = r * 0.78;
  drawVectorChar(g, A.look, A.gs, -r * 0.62, -r * 0.1, rr, bt, { lite: true, seed: A.idx + 1, dim: A.dim });
  if (A.n >= 3) drawVectorChar(g, A.look, A.gs, r * 0.62, -r * 0.1, rr, bt, { lite: true, seed: A.idx + 2, dim: A.dim });
}
// 몸통: 구운 이미지에 라이브 bob/스쿼시/공격모션 변환만 적용
function _blitBody(c, e, x, y, t, r, seed, anim) {
  const bob = Math.sin(t * 4 + seed) * r * 0.05, sq = 1 + Math.sin(t * 4 + seed) * 0.03, mo = motionOf(anim, r), sy = sq * mo.sqa;
  c.save(); c.translate(x + mo.ox, y + bob + mo.oy - mo.hop); c.rotate(mo.tilt); c.scale(1 / sy, sy);
  c.drawImage(e.cv, -e.E, -e.E, 2 * e.E, 2 * e.E); c.restore();
}
function _unitBaked(c, kid, look, gs, r, n, x, y, t, opt, idx, seed, img, crown) {
  const lite = !!opt.lite, E = r * 3.2, dim = opt.dim ? 1 : 0, A = _ba; A.r = r; A.gs = gs; A.look = look; A.lite = lite; A.dim = opt.dim; A.crown = crown; A.idx = idx; A.n = n;
  if (lite) _ellipse(c, x, y + r * 0.95, r * 0.8, r * 0.18, "rgba(0,0,0,.15)"); else _bakeAt(c, t, "p|" + kid, E, x, y, _bkBack, A);
  if (opt.preBody) opt.preBody(c); // 히어로 발밑 표시 등 (뒤 레이어 위, 몸 아래)
  if (n >= 2 && !img && !crown) _bakeAt(c, t, "s|" + kid + "|" + (n >= 3 ? 3 : 2) + "|" + dim, E, x, y, _bkStack, A);
  if (img) drawVectorChar(c, look, gs, x, y, r, t, { anim: opt.anim, dim: opt.dim, img, seed });
  else {
    A.seed = crown ? 3.3 : idx * 1.7; // 굽기용 시드(phase 무시: 같은 종은 캐시 공유)
    const e = _bake(t, "b|" + kid + "|" + (lite ? 1 : 0) + "|" + dim, r * 3.5, _bkBody, A);
    if (e) _blitBody(c, e, x, y, t, r, seed, opt.anim);
    else drawVectorChar(c, look, gs, x, y, r, t, { anim: opt.anim, dim: opt.dim, seed, crown });
  }
  if (!lite) _bakeAt(c, t, "f|" + kid, E, x, y, _bkFront, A);
}
function drawUnit(c, idx, x, y, t, opt) {
  opt = opt || {}; const ch = CHARS[idx], gs = GRADES[ch.grade].style, r = 13 * gs.scale, n = opt.count || 1;
  if (opt.bake && _canBake()) {
    const img = SPRITES[ch.key];
    _unitBaked(c, "u" + idx, ch.look, gs, r, n, x, y, t, opt, idx, idx * 1.7 + (opt.phase || 0), img, false);
    if (opt.selected) { c.strokeStyle = `rgba(255,255,255,${0.6 + 0.3 * Math.sin(t * 6)})`; c.lineWidth = 2; c.beginPath(); c.ellipse(x, y + r * 0.9, r * 1.2, r * 0.36, 0, 0, 7); c.stroke(); }
    return;
  }
  if (!opt.lite) { drawPlate(c, x, y, r, gs, t); drawAura(c, x, y, r, gs, t, "back"); }
  _ellipse(c, x, y + r * 0.95, r * 0.8, r * 0.18, "rgba(0,0,0,.15)");
  const img = SPRITES[ch.key];
  if (n >= 2 && !img) { // 스택 복제 (뒤쪽 작은 몸)
    const rr = r * 0.78; drawVectorChar(c, ch.look, gs, x - r * 0.62, y - r * 0.1, rr, t, { lite: true, seed: idx + 1, dim: opt.dim });
    if (n >= 3) drawVectorChar(c, ch.look, gs, x + r * 0.62, y - r * 0.1, rr, t, { lite: true, seed: idx + 2, dim: opt.dim });
  }
  drawVectorChar(c, ch.look, gs, x, y, r, t, { anim: opt.anim, dim: opt.dim, img, seed: idx * 1.7 + (opt.phase || 0) });
  if (!opt.lite) drawAura(c, x, y, r, gs, t, "front");
  if (opt.selected) { c.strokeStyle = `rgba(255,255,255,${0.6 + 0.3 * Math.sin(t * 6)})`; c.lineWidth = 2; c.beginPath(); c.ellipse(x, y + r * 0.9, r * 1.2, r * 0.36, 0, 0, 7); c.stroke(); }
}
function _heroOf(id) { if (typeof id === "object" && id) return id; if (typeof id === "number") return HEROES[id]; return HEROES.find((h) => h.id === id) || HEROES[0]; }
function _heroShots(c, x, y, r, t, sh) {
  for (let i = 0; i < 4; i++) { const on = i < sh, last = i === 3, px = x + (i - 1.5) * 7, py = y + r * 1.22; c.beginPath(); c.arc(px, py, last ? 3.2 + (sh === 3 ? Math.sin(t * 10) : 0) : 2.2, 0, 7); c.fillStyle = on ? "#ff7a2e" : "rgba(255,255,255,.7)"; c.fill(); c.strokeStyle = last ? "#ffb703" : "#8a6a3a"; c.lineWidth = 1.2; c.stroke(); }
}
function drawHero(c, heroId, x, y, t, opt) {
  opt = opt || {}; const h = _heroOf(heroId), gs = HERO_STYLE, r = 13 * gs.scale;
  if (opt.bake && _canBake()) {
    const sh = opt.shots != null ? opt.shots % 4 : -1;
    const o2 = { lite: false, anim: opt.anim, dim: opt.dim, preBody: sh >= 0 ? (g) => _heroShots(g, x, y, r, t, sh) : null };
    _unitBaked(c, "h" + h.id, h.look, gs, r, 1, x, y, t, o2, 0, 3.3, SPRITES[h.id], true);
    if (sh === 3) { c.strokeStyle = `rgba(255,120,40,${0.5 + 0.4 * Math.sin(t * 10)})`; c.lineWidth = 3; c.beginPath(); c.arc(x, y, r * 1.15, 0, 7); c.stroke(); }
    return;
  }
  drawPlate(c, x, y, r, gs, t); drawAura(c, x, y, r, gs, t, "back");
  _ellipse(c, x, y + r * 0.95, r * 0.8, r * 0.18, "rgba(0,0,0,.15)");
  // 4번째 공격 강조: 발밑 4칸 표시, 3번 쌓이면 4번째가 맥동
  const sh = opt.shots != null ? opt.shots % 4 : -1;
  if (sh >= 0) for (let i = 0; i < 4; i++) { const on = i < sh, last = i === 3, px = x + (i - 1.5) * 7, py = y + r * 1.22; c.beginPath(); c.arc(px, py, last ? 3.2 + (sh === 3 ? Math.sin(t * 10) : 0) : 2.2, 0, 7); c.fillStyle = on ? "#ff7a2e" : "rgba(255,255,255,.7)"; c.fill(); c.strokeStyle = last ? "#ffb703" : "#8a6a3a"; c.lineWidth = 1.2; c.stroke(); }
  drawVectorChar(c, h.look, gs, x, y, r, t, { anim: opt.anim, dim: opt.dim, crown: true, img: SPRITES[h.id], seed: 3.3 });
  drawAura(c, x, y, r, gs, t, "front");
  if (sh === 3) { c.strokeStyle = `rgba(255,120,40,${0.5 + 0.4 * Math.sin(t * 10)})`; c.lineWidth = 3; c.beginPath(); c.arc(x, y, r * 1.15, 0, 7); c.stroke(); }
}
// 모달/확률표/선택 카드용 정적 초상. idxOrHero: 숫자(CHARS idx) 또는 {hero:id} 또는 hero id 문자열. px: 한 변 픽셀
function drawPortrait(canvas, idxOrHero, px) {
  px = px || 64; if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
  const c = canvas.getContext("2d"); c.clearRect(0, 0, px, px); c.save(); const k = px / 62; c.scale(k, k);
  const cx = 31, cy = 34, t = 0.5;
  if (typeof idxOrHero === "number") {
    const ch = CHARS[idxOrHero], gs = GRADES[ch.grade].style, r = 13 * gs.scale * (ch.grade >= 6 ? 0.85 : 1);
    drawAura(c, cx, cy, r, gs, t, "back"); drawVectorChar(c, ch.look, gs, cx, cy, r, t, { img: SPRITES[ch.key] }); drawAura(c, cx, cy, r, gs, t, "front");
    drawBadge(c, 31, 6, ch.grade, 8); drawEmblem(c, ch.clan, 8, 54, 11);
  } else { const h = _heroOf(typeof idxOrHero === "object" ? idxOrHero.hero : idxOrHero); drawVectorChar(c, h.look, HERO_STYLE, cx, cy + 2, 17, t, { crown: true, img: SPRITES[h.id] }); }
  c.restore();
}

// ---------- 공격 모션 / 테이블 (ATK[key], NAMES[key] : key = CHARS[].key 또는 HEROES[].id) ----------
const ATK = {}, NAMES = {};
const MOT_OF = { shot: "peck", tongue: "rear", slash: "lunge", wave: "rear", roar: "rear", beam: "rear", breath: "peck", chain: "spin", lob: "hop", nova: "rear", meteor: "hop", storm: "rear" };
(function () {
  if (typeof CHARS !== "undefined") CHARS.forEach((ch) => { ATK[ch.key] = { mot: ch.fx === "shot" && ch.idx % 2 ? "hop" : MOT_OF[ch.fx], fx: ch.fx, shape: ch.shot[0], col: ch.shot[1], desc: ch.desc }; NAMES[ch.key] = ch.name; });
  if (typeof HEROES !== "undefined") HEROES.forEach((h) => { ATK[h.id] = { mot: "hop", fx: "shot", shape: "star", col: "#ffd54f", desc: h.rule }; NAMES[h.id] = h.name; });
})();
function motionOf(anim, r) {
  const m = { ox: 0, oy: 0, tilt: 0, hop: 0, sqa: 1 };
  if (!anim || anim.t <= 0) return m;
  const ph = 1 - anim.t / anim.dur, ca = Math.cos(anim.ang), sa = Math.sin(anim.ang);
  const ease = (x) => x * x * (3 - 2 * x);
  switch (anim.style) {
    case "peck": { const k = ph < 0.3 ? -(ph / 0.3) * 0.6 : ph < 0.45 ? -0.6 + ((ph - 0.3) / 0.15) * 2.4 : 1.8 * (1 - (ph - 0.45) / 0.55);
      m.ox = ca * k * r * 0.5; m.oy = sa * k * r * 0.5; m.tilt = ca * k * 0.35; m.sqa = ph < 0.3 ? 1 - 0.1 * (ph / 0.3) : 1 + 0.1 * Math.max(0, k) / 1.8; break; }
    case "hop": m.hop = ph > 0.25 && ph < 0.75 ? Math.sin(((ph - 0.25) / 0.5) * Math.PI) * r * 0.9 : 0;
      m.sqa = ph < 0.25 ? 1 - 0.2 * (ph / 0.25) : ph > 0.75 ? 1 - 0.18 * Math.sin(((ph - 0.75) / 0.25) * Math.PI) : 1.1; break;
    case "spin": m.tilt = ph > 0.15 && ph < 0.7 ? ease((ph - 0.15) / 0.55) * Math.PI * 2 : 0; m.hop = Math.sin(ph * Math.PI) * r * 0.25; m.sqa = ph < 0.15 ? 1 - 0.12 * (ph / 0.15) : 1; break;
    case "rear": { const up = ph < 0.35 ? ease(ph / 0.35) : ph < 0.6 ? 1 : 1 - ease((ph - 0.6) / 0.4);
      m.sqa = 1 + 0.22 * up; m.tilt = -ca * 0.3 * up; m.oy = -r * 0.1 * up; if (ph > 0.35 && ph < 0.6) m.ox = ca * r * 0.3; break; }
    default: { const k = ph < 0.3 ? -(ph / 0.3) * 0.5 : ph < 0.5 ? -0.5 + ((ph - 0.3) / 0.2) * 1.7 : 1.2 * (1 - (ph - 0.5) / 0.5);
      m.ox = ca * k * r * 0.5; m.oy = sa * k * r * 0.5; m.tilt = ca * k * 0.2; m.sqa = ph < 0.3 ? 1 - 0.16 * (ph / 0.3) : 1 + 0.12 * Math.max(0, k); }
  }
  if (anim.hero) m.hop = Math.max(m.hop, Math.sin(ph * Math.PI) * r * 0.55);
  return m;
}

// ---------- 몬스터 (E장: 14 kind + 보스 10종) ----------
function _domePath(c, r) {
  c.beginPath(); c.moveTo(-r * 1.05, r * 0.8);
  c.bezierCurveTo(-r * 1.25, -r * 0.5, -r * 0.6, -r * 1.15, 0, -r * 1.15);
  c.bezierCurveTo(r * 0.6, -r * 1.15, r * 1.25, -r * 0.5, r * 1.05, r * 0.8);
  c.quadraticCurveTo(0, r * 1.1, -r * 1.05, r * 0.8); c.closePath();
}
function _ghostPath(c, r) {
  c.beginPath(); c.moveTo(-r * 1.0, r * 0.75);
  c.bezierCurveTo(-r * 1.2, -r * 0.6, -r * 0.6, -r * 1.2, 0, -r * 1.2);
  c.bezierCurveTo(r * 0.6, -r * 1.2, r * 1.2, -r * 0.6, r * 1.0, r * 0.75);
  c.quadraticCurveTo(r * 0.67, r * 1.15, r * 0.33, r * 0.8); c.quadraticCurveTo(0, r * 1.15, -r * 0.33, r * 0.8);
  c.quadraticCurveTo(-r * 0.67, r * 1.15, -r * 1.0, r * 0.75); c.closePath();
}
function _eye(c, x, y, rx, ry, look) {
  _ellipse(c, x, y, rx, ry, "#2b1b10");
  _ellipse(c, x - rx * 0.3 + look, y - ry * 0.35, rx * 0.42, ry * 0.42, "#fff");
  _ellipse(c, x + rx * 0.3 + look, y + ry * 0.3, rx * 0.2, ry * 0.2, "rgba(255,255,255,.8)");
}
function _fill(c, hue, s, l, r, flash, stroke, lw) {
  const g = c.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, hsl(hue, s, Math.min(96, l + 16))); g.addColorStop(0.55, hsl(hue, s, l)); g.addColorStop(1, hsl(hue, s + 5, l - 14));
  c.fillStyle = g; c.fill();
  if (flash) { c.fillStyle = "rgba(255,255,255,.65)"; c.fill(); }
  c.strokeStyle = stroke; c.lineWidth = lw || 2; c.lineJoin = "round"; c.stroke();
}
function _gloss(c, r) {
  c.fillStyle = "rgba(255,255,255,.6)"; c.beginPath(); c.ellipse(-r * 0.5, -r * 0.62, r * 0.24, r * 0.13, -0.55, 0, 7); c.fill();
  c.fillStyle = "rgba(255,255,255,.35)"; c.beginPath(); c.arc(-r * 0.2, -r * 0.88, r * 0.06, 0, 7); c.fill();
}
const MOB_BASE = { king: "blob", toad: "blob", demon: "imp", mega: "cyclops", gate: "golem" };
const MOB_KINDS = ["blob", "cyclops", "imp", "ghost", "shroom", "spiky", "worm", "crab", "golem", "bat", "cloud", "ufo", "robo", "egg", "king", "toad", "gate", "mega", "demon"];
function _bolt(c, x, y, s, col) { c.fillStyle = col; c.strokeStyle = "#a8741a"; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x + s * 0.2, y - s); c.lineTo(x - s * 0.5, y + s * 0.1); c.lineTo(x - s * 0.05, y + s * 0.1); c.lineTo(x - s * 0.25, y + s); c.lineTo(x + s * 0.5, y - s * 0.2); c.lineTo(x + s * 0.05, y - s * 0.2); c.closePath(); c.fill(); c.stroke(); }
function _crownMob(c, r, y, big) { c.beginPath(); c.moveTo(-r * 0.55, y); c.lineTo(-r * 0.6, y - r * 0.55); c.lineTo(-r * 0.25, y - r * 0.25); c.lineTo(0, y - r * 0.7); c.lineTo(r * 0.25, y - r * 0.25); c.lineTo(r * 0.6, y - r * 0.55); c.lineTo(r * 0.55, y); c.closePath(); c.fillStyle = "#ffd54f"; c.fill(); c.strokeStyle = "#a8741a"; c.lineWidth = 2; c.stroke(); _ellipse(c, 0, y - r * 0.2, r * 0.09, r * 0.09, "#ff6b8b"); }

// m: {kind, hue, boss, id, flash, deco[], slow, burn, name}
function _mobFy(base, r, t, id) { return base === "ghost" ? Math.sin(t * 3 + id) * r * 0.12 - r * 0.2 : base === "bat" || base === "ufo" || base === "cloud" ? Math.sin(t * 4 + id) * r * 0.12 - r * 0.25 : 0; }
function _bkMob(g, bt, A) { _mobDraw(g, 0, 0, A.r, bt, A.m, A.h, A.id); }
function drawMob(c, x, y, r, t, m, bake) {
  const id0 = m.id || 0, base = MOB_BASE[m.kind] || m.kind;
  if (bake && _canBake()) {
    const h = Math.round(m.hue), id = id0 % 4, rr = Math.round(r * 2) / 2, A = _ba; A.r = rr; A.m = m; A.h = h; A.id = id;
    const key = "m|" + m.kind + "|" + h + "|" + (m.flash > 0 ? 1 : 0) + "|" + (m.boss ? 1 : 0) + "|" + rr + "|" + (m.deco ? m.deco.join(",") : "") + "|" + id;
    const e = _bake(t, key, rr * 2.9, _bkMob, A);
    if (e) { c.drawImage(e.cv, x - e.E, y - e.E, 2 * e.E, 2 * e.E); if (m.slow > 0 || m.burn > 0) _mobStatus(c, x, y, r, t, m, _mobFy(base, r, t, id)); return; }
  }
  _mobDraw(c, x, y, r, t, m, m.hue, id0);
  _mobStatus(c, x, y, r, t, m, _mobFy(base, r, t, id0));
}
// 몸 본체(상태이상 오버레이 제외). h/id 는 호출자가 정함(굽기 시 정수 hue, id%4)
function _mobDraw(c, x, y, r, t, m, h, id) {
  const kind = m.kind, fl = m.flash > 0, boss = !!m.boss;
  const w = Math.sin(t * 6 + id * 1.7) * 0.07, base = MOB_BASE[kind] || kind, ghost = base === "ghost";
  const edge = hsl(h, 55, 28), dark = base === "golem" || base === "robo";
  c.save();
  const fy = _mobFy(base, r, t, id);
  _ellipse(c, x, y + r * 0.95, r * 0.8, r * 0.17, "rgba(0,0,0,.16)");
  if (boss) { // 보스 바닥 오라
    const bg = c.createRadialGradient(x, y + r * 0.2, r * 0.5, x, y + r * 0.2, r * 1.9); const bc = kind === "demon" ? "160,40,200" : "255,90,60"; bg.addColorStop(0, `rgba(${bc},${0.28 + 0.1 * Math.sin(t * 4)})`); bg.addColorStop(1, `rgba(${bc},0)`); c.fillStyle = bg; c.beginPath(); c.arc(x, y + r * 0.2, r * 1.9, 0, 7); c.fill();
  }
  c.translate(x, y + fy); c.scale(1 + w, 1 - w);
  if (ghost) c.globalAlpha = 0.9;
  const f = { fr: r, dx: 0, dy: 0, ey: -r * 0.1, eye: "two", mouth: "smile" };
  const fillMain = (s, l, flash) => _fill(c, h, s, l, r, fl, edge);

  if (kind === "demon") { const fw = Math.sin(t * 9 + id) * 0.25; [-1, 1].forEach((s) => { c.save(); c.scale(s, 1); c.rotate(-0.2 + fw); c.beginPath(); c.moveTo(r * 0.8, -r * 0.2); c.quadraticCurveTo(r * 2.0, -r * 1.3, r * 1.9, r * 0.2); c.quadraticCurveTo(r * 1.5, -r * 0.1, r * 1.3, r * 0.5); c.quadraticCurveTo(r * 1.0, 0.1, r * 0.8, r * 0.4); c.closePath(); c.fillStyle = hsl(h, 50, 25); c.fill(); c.strokeStyle = edge; c.lineWidth = 2; c.stroke(); c.restore(); }); }
  if (base === "bat") { const fw = Math.sin(t * 14 + id) * 0.4; [-1, 1].forEach((s) => { c.save(); c.scale(s, 1); c.rotate(-0.15 - fw); c.beginPath(); c.moveTo(r * 0.5, -r * 0.1); c.lineTo(r * 1.7, -r * 0.9); c.quadraticCurveTo(r * 1.5, -r * 0.35, r * 1.8, 0); c.quadraticCurveTo(r * 1.4, 0, r * 1.45, r * 0.5); c.quadraticCurveTo(r * 1.0, r * 0.2, r * 0.5, r * 0.5); c.closePath(); c.fillStyle = hsl(h, 45, 32); c.fill(); c.strokeStyle = edge; c.lineWidth = 2; c.stroke(); c.restore(); }); }
  if (base === "spiky") { c.fillStyle = hsl(h, 55, 45); for (let i = -3; i <= 3; i++) { const a = -Math.PI / 2 + i * 0.42, bx = Math.cos(a) * r * 0.95, by = Math.sin(a) * r * 0.95; c.beginPath(); c.moveTo(bx - Math.sin(a) * r * 0.16, by + Math.cos(a) * r * 0.16); c.lineTo(Math.cos(a) * r * 1.45, Math.sin(a) * r * 1.45); c.lineTo(bx + Math.sin(a) * r * 0.16, by - Math.cos(a) * r * 0.16); c.closePath(); c.fill(); c.strokeStyle = edge; c.lineWidth = 1.5; c.stroke(); } }
  if (base === "imp") { [-1, 1].forEach((s) => { c.beginPath(); c.moveTo(s * r * 0.35, -r * 0.95); c.quadraticCurveTo(s * r * 0.9, -r * 1.2, s * r * 0.75, -r * 1.55); c.quadraticCurveTo(s * r * 0.55, -r * 1.15, s * r * 0.1, -r * 0.9); c.closePath(); c.fillStyle = "#ffe08a"; c.fill(); c.strokeStyle = edge; c.lineWidth = 1.8; c.stroke(); }); c.strokeStyle = edge; c.lineWidth = 2.5; c.lineCap = "round"; c.beginPath(); c.moveTo(r * 0.9, r * 0.6); c.quadraticCurveTo(r * 1.5, r * 0.5, r * 1.35, r * 0.05); c.stroke(); f.mouth = "imp"; }

  if (base === "shroom") {
    c.beginPath(); c.ellipse(0, r * 0.25, r * 0.72, r * 0.8, 0, 0, 7); _fill(c, 38, 60, 88, r, fl, "#a07a50");
    c.beginPath(); c.ellipse(0, -r * 0.25, r * 1.2, r * 0.9, 0, Math.PI, 0); c.quadraticCurveTo(0, r * 0.1, -r * 1.2, -r * 0.25); c.closePath(); _fill(c, boss ? h : 4, 80, 62, r, fl, hsl(4, 55, 30));
    c.fillStyle = "#fff"; [[-0.6, -0.55, 0.2], [0.1, -0.85, 0.24], [0.65, -0.5, 0.17]].forEach(([dx, dy, rr]) => { c.beginPath(); c.arc(dx * r, dy * r, rr * r, 0, 7); c.fill(); });
    f.ey = r * 0.2;
  } else if (base === "worm") {
    for (let i = 3; i >= 1; i--) { const bx = -i * r * 0.66, by = Math.sin(t * 7 - i * 1.2 + id) * r * 0.22 + r * 0.25, rr = r * (0.72 - i * 0.07); c.save(); c.translate(bx, by); c.beginPath(); c.ellipse(0, 0, rr, rr * 0.9, 0, 0, 7); _fill(c, h + i * 8, 70, 66 - i * 3, rr, fl, edge); c.restore(); }
    c.translate(r * 0.3, 0); f.fr = r * 0.85; _domePath(c, r * 0.85); _fill(c, h, 75, 70, r, fl, edge); _gloss(c, r * 0.85);
    _line(c, -r * 0.2, -r * 0.9, -r * 0.35, -r * 1.35, edge, 2); _line(c, r * 0.2, -r * 0.9, r * 0.35, -r * 1.35, edge, 2); _ellipse(c, -r * 0.35, -r * 1.38, r * 0.1, r * 0.1, "#ffd54f"); _ellipse(c, r * 0.35, -r * 1.38, r * 0.1, r * 0.1, "#ffd54f");
    f.fr = r * 0.85;
  } else if (base === "crab") {
    [-1, 1].forEach((s) => { c.save(); c.scale(s, 1); _line(c, r * 0.8, r * 0.15, r * 1.1, -r * 0.1, edge, 3); c.beginPath(); c.arc(r * 1.2, -r * 0.35, r * 0.4, 0, 7); _fill(c, h, 75, 58, r, fl, edge); c.beginPath(); c.moveTo(r * 1.2, -r * 0.35); c.lineTo(r * 1.55, -r * 0.62); c.lineTo(r * 1.45, -r * 0.2); c.closePath(); c.fillStyle = hsl(h, 55, 28); c.fill(); for (let i = 0; i < 3; i++) _line(c, r * 0.7, r * (0.4 + i * 0.12), r * (1.0 + i * 0.1), r * (0.65 + i * 0.22), edge, 2); c.restore(); });
    c.beginPath(); c.ellipse(0, r * 0.2, r * 1.0, r * 0.68, 0, 0, 7); _fill(c, h, 75, 62, r, fl, edge); _gloss(c, r);
    f.ey = -r * 0.62; f.eye = "stalk"; f.mouth = "smile"; f.my = r * 0.35;
    _line(c, -r * 0.35, -r * 0.2, -r * 0.38, -r * 0.62, edge, 2.5); _line(c, r * 0.35, -r * 0.2, r * 0.38, -r * 0.62, edge, 2.5);
  } else if (base === "golem") {
    const gate = kind === "gate";
    c.beginPath(); c.roundRect(-r * 0.98, -r * 0.95, r * 1.96, r * 1.9, r * 0.3); _fill(c, h, 25, 62, r, fl, edge, 2.5);
    _line(c, -r * 0.5, -r * 0.95, -r * 0.2, -r * 0.5, hsl(h, 30, 38), 2); _line(c, r * 0.6, r * 0.9, r * 0.35, r * 0.4, hsl(h, 30, 38), 2); c.fillStyle = hsl(h, 22, 48); c.beginPath(); c.arc(-r * 0.7, r * 0.55, r * 0.14, 0, 7); c.fill(); c.beginPath(); c.arc(r * 0.72, -r * 0.6, r * 0.1, 0, 7); c.fill();
    if (gate) { c.beginPath(); c.moveTo(-r * 0.6, r * 0.95); c.lineTo(-r * 0.6, -r * 0.2); c.arc(0, -r * 0.2, r * 0.6, Math.PI, 0); c.lineTo(r * 0.6, r * 0.95); c.closePath(); c.fillStyle = hsl(h, 40, 14); c.fill(); c.strokeStyle = edge; c.lineWidth = 2; c.stroke(); f.eye = "one"; f.ey = -r * 0.1; f.mouth = "none"; }
    else { f.eye = "two"; f.ey = -r * 0.12; }
  } else if (base === "cloud") {
    const cc = kind === "cloud" && boss ? [hsl(h, 20, 42), hsl(h, 20, 30)] : [hsl(h, 25, 92), hsl(h, 25, 70)];
    const circ = [[-0.62, 0.15, 0.55], [0.62, 0.15, 0.55], [-0.3, -0.35, 0.62], [0.35, -0.38, 0.58], [0, 0.3, 0.62]];
    c.fillStyle = cc[1]; for (const [dx, dy, rr] of circ) { c.beginPath(); c.arc(dx * r, dy * r, (rr + 0.08) * r, 0, 7); c.fill(); }
    const g = c.createLinearGradient(0, -r, 0, r); g.addColorStop(0, cc[0]); g.addColorStop(1, shade(cc[0].charAt(0) === "#" ? cc[0] : "#dddddd", -0.12)); c.fillStyle = cc[0]; for (const [dx, dy, rr] of circ) { c.beginPath(); c.arc(dx * r, dy * r, rr * r, 0, 7); c.fill(); }
    if (fl) { c.fillStyle = "rgba(255,255,255,.65)"; for (const [dx, dy, rr] of circ) { c.beginPath(); c.arc(dx * r, dy * r, rr * r, 0, 7); c.fill(); } }
    f.ey = r * 0.05;
  } else if (base === "ufo") {
    const gold = boss && h < 100;
    if (boss && !gold) { _line(c, 0, -r * 0.5, 0, -r * 1.9, "#7a5a2a", 3); c.beginPath(); c.moveTo(r * 0.05, -r * 1.85); c.lineTo(r * 0.95, -r * 0.9); c.lineTo(r * 0.05, -r * 0.9); c.closePath(); c.fillStyle = "#fff"; c.fill(); c.strokeStyle = edge; c.lineWidth = 2; c.stroke(); }
    c.beginPath(); c.ellipse(0, -r * 0.2, r * 0.62, r * 0.62, 0, Math.PI, 0); c.closePath(); c.fillStyle = gold ? "rgba(255,230,140,.85)" : "rgba(170,230,255,.8)"; c.fill(); c.strokeStyle = edge; c.lineWidth = 2; c.stroke();
    _ellipse(c, 0, -r * 0.35, r * 0.34, r * 0.28, hsl(110, 55, 62), edge, 1.6); _eye(c, -r * 0.13, -r * 0.37, r * 0.07, r * 0.1, 0); _eye(c, r * 0.13, -r * 0.37, r * 0.07, r * 0.1, 0);
    c.beginPath(); c.ellipse(0, r * 0.3, r * 1.35, r * 0.42, 0, 0, 7); _fill(c, h, gold ? 85 : 40, gold ? 58 : 72, r, fl, edge);
    for (let i = -2; i <= 2; i++) _ellipse(c, i * r * 0.5, r * 0.34 + Math.abs(i) * 0.02 * r, r * 0.09, r * 0.09, Math.sin(t * 6 + i + id) > 0 ? "#fff6a0" : "#ff9ec0");
    f.eye = "none"; f.mouth = "none";
  } else if (base === "robo") {
    const kk = r * (boss ? 0.6 : 0.4), kx = -r * 1.0;
    c.save(); c.translate(kx, -r * 0.1); c.rotate(t * (boss ? 1.5 : 3) + id); _line(c, 0, 0, -r * 0.2, 0, edge, 3); c.fillStyle = "#ffd54f"; c.strokeStyle = "#a8741a"; c.lineWidth = 1.5; c.beginPath(); c.arc(-r * 0.2 - kk * 0.4, -kk * 0.35, kk * 0.4, 0, 7); c.arc(-r * 0.2 - kk * 0.4, kk * 0.35, kk * 0.4, 0, 7); c.fill(); c.stroke(); c.restore();
    _line(c, 0, -r * 0.9, 0, -r * 1.3, edge, 2.5); _ellipse(c, 0, -r * 1.35, r * 0.13, r * 0.13, Math.sin(t * 8 + id) > 0 ? "#ff5a5a" : "#ffd54f", edge, 1.4);
    c.beginPath(); c.roundRect(-r * 0.88, -r * 0.88, r * 1.76, r * 1.76, r * 0.22); _fill(c, h, 35, 68, r, fl, edge, 2.4);
    c.fillStyle = "#223"; c.beginPath(); c.roundRect(-r * 0.62, -r * 0.6, r * 1.24, r * 0.8, r * 0.14); c.fill();
    const eg = Math.sin(t * 3 + id) > 0.9 ? 0.2 : 1; c.fillStyle = "#7df9ff"; c.fillRect(-r * 0.42, -r * 0.4, r * 0.28, r * 0.36 * eg); c.fillRect(r * 0.14, -r * 0.4, r * 0.28, r * 0.36 * eg);
    c.strokeStyle = edge; c.lineWidth = 1.6; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-r * 0.42 + i * r * 0.28, r * 0.42); c.lineTo(-r * 0.42 + i * r * 0.28, r * 0.72); c.stroke(); }
    for (const [bx, by] of [[-0.74, -0.74], [0.74, -0.74], [-0.74, 0.74], [0.74, 0.74]]) _ellipse(c, bx * r, by * r, r * 0.06, r * 0.06, "#cfd8e3");
    f.eye = "none"; f.mouth = "none";
  } else if (base === "egg") {
    const gold = boss;
    c.beginPath(); c.moveTo(0, -r * 1.2); c.bezierCurveTo(r * 0.95, -r * 0.9, r * 1.15, r * 0.4, r * 0.55, r * 0.9); c.quadraticCurveTo(0, r * 1.15, -r * 0.55, r * 0.9); c.bezierCurveTo(-r * 1.15, r * 0.4, -r * 0.95, -r * 0.9, 0, -r * 1.2); c.closePath(); _fill(c, h, gold ? 85 : 60, gold ? 66 : 86, r, fl, edge, 2.2);
    c.fillStyle = hsl(h, 55, gold ? 50 : 70, 0.7); for (const [dx, dy, rr] of [[-0.55, 0.5, 0.15], [0.6, 0.15, 0.12], [0.3, 0.75, 0.1]]) { c.beginPath(); c.arc(dx * r, dy * r, rr * r, 0, 7); c.fill(); }
    c.strokeStyle = edge; c.lineWidth = 2; c.lineJoin = "round"; c.beginPath(); c.moveTo(-r * 0.5, -r * 0.7); c.lineTo(-r * 0.25, -r * 0.5); c.lineTo(-r * 0.05, -r * 0.75); c.lineTo(r * 0.2, -r * 0.5); c.lineTo(r * 0.45, -r * 0.72); c.stroke();
    f.ey = r * 0.05;
  } else if (kind === "toad") {
    c.save(); c.scale(1.22, 0.92); _domePath(c, r); _fill(c, h, 70, 55, r, fl, edge); c.restore(); _gloss(c, r);
    _ellipse(c, -r * 0.6, -r * 0.95, r * 0.28, r * 0.28, "#fff", edge, 2); _ellipse(c, r * 0.6, -r * 0.95, r * 0.28, r * 0.28, "#fff", edge, 2); _ellipse(c, -r * 0.6, -r * 0.93, r * 0.12, r * 0.14, "#2b1b10"); _ellipse(c, r * 0.6, -r * 0.93, r * 0.12, r * 0.14, "#2b1b10");
    f.mouth = "wide"; f.ey = -r * 0.05;
  } else if (ghost) { _ghostPath(c, r); _fill(c, h, 40, 90, r, fl, edge); c.fillStyle = "rgba(255,255,255,.25)"; c.fill(); _gloss(c, r); f.ey = -r * 0.2; f.mouth = "o"; }
  else if (base !== "shroom") { _domePath(c, r); _fill(c, h, 75, boss ? 58 : 70, r, fl, edge); _gloss(c, r); if (base === "cyclops") f.eye = "one"; if (base === "spiky" || base === "blob" || base === "imp") f.ey = -r * 0.1; if (base === "bat") { f.ey = -r * 0.1; f.mouth = "fang"; } }

  // 얼굴
  c.save(); c.translate(f.dx, f.dy); const fr = f.fr, ey = f.ey, look = Math.sin(t * 1.7 + id) * fr * 0.03;
  if (f.eye === "one") { _ellipse(c, 0, ey, fr * 0.46, fr * 0.5, "#fff", edge, 2); _ellipse(c, look * 3, ey + fr * 0.03, fr * 0.26, fr * 0.3, "#2b1b10"); _ellipse(c, look * 3 - fr * 0.08, ey - fr * 0.08, fr * 0.1, fr * 0.1, "#fff"); }
  else if (f.eye === "stalk") { _eye(c, -fr * 0.38, ey, fr * 0.2, fr * 0.24, look); _eye(c, fr * 0.38, ey, fr * 0.2, fr * 0.24, look); }
  else if (f.eye === "two") { _eye(c, -fr * 0.36, ey, fr * 0.17, fr * 0.21, look); _eye(c, fr * 0.36, ey, fr * 0.17, fr * 0.21, look); }
  if (f.eye !== "none" && f.eye !== "stalk") { _ellipse(c, -fr * 0.68, ey + fr * 0.32, fr * 0.15, fr * 0.09, "rgba(255,110,140,.5)"); _ellipse(c, fr * 0.68, ey + fr * 0.32, fr * 0.15, fr * 0.09, "rgba(255,110,140,.5)"); }
  c.strokeStyle = "#2b1b10"; c.lineWidth = 1.7; c.lineCap = "round"; const my = f.my != null ? f.my : ey + fr * 0.32;
  if (f.mouth === "o") _ellipse(c, 0, ey + fr * 0.45, fr * 0.1, fr * 0.13, "#2b1b10");
  else if (f.mouth === "imp") { c.beginPath(); c.moveTo(-fr * 0.2, ey + fr * 0.4); c.quadraticCurveTo(0, ey + fr * 0.6, fr * 0.2, ey + fr * 0.4); c.stroke(); c.fillStyle = "#fff"; [-1, 1].forEach((s) => { c.beginPath(); c.moveTo(s * fr * 0.17, ey + fr * 0.45); c.lineTo(s * fr * 0.08, ey + fr * 0.62); c.lineTo(s * fr * 0.02, ey + fr * 0.5); c.fill(); }); }
  else if (f.mouth === "fang") { c.beginPath(); c.arc(0, my, fr * 0.14, 0.15, Math.PI - 0.15); c.stroke(); c.fillStyle = "#fff"; [-1, 1].forEach((s) => { c.beginPath(); c.moveTo(s * fr * 0.07, my + fr * 0.1); c.lineTo(s * fr * 0.14, my + fr * 0.1); c.lineTo(s * fr * 0.1, my + fr * 0.28); c.fill(); }); }
  else if (f.mouth === "wide") { c.beginPath(); c.moveTo(-fr * 0.85, ey + fr * 0.25); c.quadraticCurveTo(0, ey + fr * 0.95, fr * 0.85, ey + fr * 0.25); c.closePath(); c.fillStyle = "#7a1f33"; c.fill(); c.stroke(); c.fillStyle = "#ff8fab"; c.beginPath(); c.ellipse(0, ey + fr * 0.62, fr * 0.3, fr * 0.14, 0, 0, 7); c.fill(); }
  else if (f.mouth === "smile") { c.beginPath(); c.arc(0, my, fr * 0.14, 0.15, Math.PI - 0.15); c.stroke(); }
  if (boss && f.eye !== "none") { c.lineWidth = 2.6; c.beginPath(); c.moveTo(-fr * 0.62, ey - fr * 0.38); c.lineTo(-fr * 0.12, ey - fr * 0.2); c.moveTo(fr * 0.62, ey - fr * 0.38); c.lineTo(fr * 0.12, ey - fr * 0.2); c.stroke(); }
  c.restore();

  // 보스 소품
  if (kind === "king") _crownMob(c, r, -r * 1.0);
  else if (kind === "demon") { _crownMob(c, r * 0.8, -r * 1.05); for (let i = 0; i < 3; i++) { const a = t * 1.5 + i * 2.09; _spark(c, Math.cos(a) * r * 1.5, Math.sin(a) * r * 0.9 - r * 0.2, r * 0.18, "#e9a8ff"); } }
  else if (kind === "mega") { for (const s of [-1, 1]) _poly(c, r, [s * 0.4, -1.0, s * 0.85, -1.55, s * 0.9, -0.8], "#ffe08a", edge, 2); _poly(c, r, [0, -1.0, 0.1, -1.3, 0, -1.55, -0.1, -1.3], "#7df9ff", edge, 1.5); }
  else if (kind === "toad") { _poly(c, r, [-0.3, -1.05, 0, -1.3, 0.3, -1.05], "#7a9a3a", edge, 1.5); }
  else if (kind === "gate") { c.fillStyle = hsl(h, 22, 48); for (const dx of [-0.6, 0, 0.6]) { c.beginPath(); c.roundRect((dx - 0.2) * r, -r * 1.2, r * 0.4, r * 0.3, 3); c.fill(); c.strokeStyle = edge; c.lineWidth = 1.6; c.stroke(); } }
  else if (boss && base === "cloud") { for (let i = 0; i < 2; i++) { const p = (t * 2.5 + i * 0.5) % 1; c.globalAlpha = Math.sin(p * Math.PI); _bolt(c, (i ? 1 : -1) * r * 0.9, r * 0.75 + p * r * 0.2, r * 0.45, "#ffe14d"); } c.globalAlpha = 1; }
  else if (boss && base === "egg") { _crownMob(c, r, -r * 1.0); _spark(c, r * 0.8, -r * 0.5 + Math.sin(t * 4) * 2, r * 0.2, "#fff"); }
  else if (boss && base === "ufo") { if (h < 100) _crownMob(c, r * 0.7, -r * 0.8); }
  else if (boss && base === "robo") { _line(c, -r * 0.3, -r * 1.0, r * 0.3, -r * 1.0, "#ffd54f", 3); }
  if (m.deco) for (const d of m.deco) { // 모르는 deco 는 무시
    if (d === "hat") { c.beginPath(); c.ellipse(0, -r * 1.0, r * 0.6, r * 0.34, 0, Math.PI, 0); c.closePath(); c.fillStyle = "#e8442e"; c.fill(); c.strokeStyle = edge; c.lineWidth = 1.6; c.stroke(); }
    else if (d === "horn") _sym(c, () => _poly(c, r, [0.3, -0.95, 0.55, -1.5, 0.65, -0.85], "#ffe08a", edge, 1.4));
    else if (d === "wing") _sym(c, () => _poly(c, r, [0.85, -0.2, 1.6, -0.8, 1.4, 0.1], "rgba(255,255,255,.8)", edge, 1.4));
    else if (d === "ice") for (let i = -1; i <= 1; i++) _poly(c, r, [i * 0.3 - 0.1, -0.95, i * 0.3, -1.4 + Math.abs(i) * 0.2, i * 0.3 + 0.1, -0.95], "#bfe9ff", "#5aa8e8", 1.2);
    else if (d === "crown") _crownMob(c, r * 0.8, -r * 1.0);
  }
  c.restore();
}
// 상태이상: 둔화(얼음), 화상(불꽃) — 항상 라이브. fy = 몸 부유 오프셋(_mobFy)
function _mobStatus(c, x, y, r, t, m, fy) {
  const id = m.id || 0;
  if (m.slow > 0) {
    c.save(); c.globalAlpha = 0.9; c.fillStyle = "rgba(150,220,255,.32)"; c.beginPath(); c.arc(x, y + fy * 0.5, r * 1.08, 0, 7); c.fill(); c.strokeStyle = "rgba(255,255,255,.9)"; c.lineWidth = 1.6; c.stroke();
    c.fillStyle = "#bfe9ff"; c.strokeStyle = "#5aa8e8"; c.lineWidth = 1.2; for (let i = 0; i < 3; i++) { const a = -0.5 + i * 0.55 + Math.PI * 0.75; c.save(); c.translate(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.9 + r * 0.1); c.rotate(a + Math.PI / 2); _poly(c, r, [-0.1, 0, 0, -0.36, 0.1, 0], "#bfe9ff", "#5aa8e8", 1.2); c.restore(); }
    c.restore();
  }
  if (m.burn > 0) {
    c.save(); for (let i = 0; i < 3; i++) { const fx = x + (i - 1) * r * 0.45, ff = 0.75 + 0.25 * Math.sin(t * 14 + i * 2 + id), fh = r * (0.55 + 0.2 * (i === 1)) * ff, by = y - r * 0.8 + fy; c.beginPath(); c.moveTo(fx - r * 0.2, by + r * 0.1); c.quadraticCurveTo(fx - r * 0.25, by - fh * 0.4, fx, by - fh); c.quadraticCurveTo(fx + r * 0.25, by - fh * 0.4, fx + r * 0.2, by + r * 0.1); c.closePath(); c.fillStyle = "#ff7a2e"; c.fill(); c.beginPath(); c.moveTo(fx - r * 0.1, by + r * 0.08); c.quadraticCurveTo(fx, by - fh * 0.7, fx + r * 0.1, by + r * 0.08); c.closePath(); c.fillStyle = "#ffe27a"; c.fill(); }
    c.restore();
  }
}
// HP바 + 방어율 방패 + 보스 이름표 (선택 사용: game.js 가 호출). m.armor = 방어율%
function drawMobBar(c, x, y, r, m) {
  const bw = Math.max(r * 2, 24), bx = x - bw / 2, by = y - r - 13, hp = Math.max(0, m.hp / m.max);
  c.fillStyle = "rgba(255,255,255,.9)"; c.beginPath(); c.roundRect(bx, by, bw, 5, 2.5); c.fill();
  c.fillStyle = m.boss ? "#ff4d6d" : "#ff6b8b"; c.beginPath(); c.roundRect(bx, by, bw * hp, 5, 2.5); c.fill();
  c.strokeStyle = "#5b3a1e"; c.lineWidth = 1; c.beginPath(); c.roundRect(bx, by, bw, 5, 2.5); c.stroke();
  if (m.armor >= 20) { c.save(); c.translate(bx - 6, by + 2.5); c.fillStyle = "#5aa8e8"; c.strokeStyle = "#fff"; c.lineWidth = 1; c.beginPath(); c.moveTo(-4, -4); c.lineTo(4, -4); c.lineTo(4, 1); c.quadraticCurveTo(0, 6, 0, 6); c.quadraticCurveTo(0, 6, -4, 1); c.closePath(); c.fill(); c.stroke(); c.restore(); c.fillStyle = "#2c4a7a"; c.font = "bold 8px sans-serif"; c.textAlign = "right"; c.textBaseline = "middle"; c.fillText(m.armor + "%", bx - 11, by + 2.5); }
  if (m.boss && m.name) { c.font = "bold 10px sans-serif"; c.textAlign = "center"; c.textBaseline = "bottom"; c.lineWidth = 3; c.strokeStyle = "#fff"; c.strokeText(m.name, x, by - 2); c.fillStyle = "#7a1f33"; c.fillText(m.name, x, by - 2); }
}

// ---------- 발사체 ----------
// p: {x,y,trail[],col,shape,rot,ang,hero,sup,g(등급 0~7),z(포물선 높이),scale}
function drawProj(c, p, t) {
  const g = p.g != null ? p.g : p.tier != null ? p.tier : 0, sc = p.scale || (GRADES[Math.min(7, g)] ? GRADES[Math.min(7, g)].style.fxScale : 1), col = p.col || "#8fd3ff", big = (p.hero ? (p.sup ? 2.2 : 1.5) : 1) * sc;
  const tr = p.trail || [];
  tr.forEach((q, i) => { const k = (i + 1) / tr.length; c.fillStyle = p.hero ? `hsla(${(t * 400 + i * 30) % 360},90%,70%,${k * 0.5})` : col + Math.round(k * 90).toString(16).padStart(2, "0"); c.beginPath(); c.arc(q.x, q.y - (q.z || 0), (1.6 + g * 0.4) * big * k, 0, 7); c.fill(); });
  const z = p.z || 0;
  if (z > 0) _ellipse(c, p.x, p.y, 5 * big, 2.2 * big, "rgba(0,0,0,.18)"); // 포물선 그림자
  c.save(); c.translate(p.x, p.y - z);
  const gr = (6 + g * 1.4) * big; c.globalAlpha = 0.25; c.fillStyle = col; c.beginPath(); c.arc(0, 0, gr, 0, 7); c.fill(); c.globalAlpha = 0.45; c.beginPath(); c.arc(0, 0, gr * 0.6, 0, 7); c.fill(); c.globalAlpha = 1;
  c.scale(big > 1.2 ? Math.min(big, 1.6) : 1, big > 1.2 ? Math.min(big, 1.6) : 1);
  c.rotate(p.shape ? p.ang || 0 : p.rot || 0); c.fillStyle = "#fff"; c.strokeStyle = col; c.lineWidth = 2;
  if (p.shape) _shape(c, p, col);
  else if (p.hero) { _star(c, 7 * (p.sup ? 2.2 : 1.5), 5); c.fillStyle = "#fff7c2"; c.fill(); c.stroke(); }
  else { _star(c, 5.5, 4); c.fillStyle = "#fff6b0"; c.fill(); c.stroke(); }
  c.restore();
}
function _shape(c, p, col) {
  const rot = p.rot || 0, out = "#5b3a1e";
  switch (p.shape) {
    case "seed": c.fillStyle = col; c.beginPath(); c.ellipse(0, 0, 6, 3.6, 0, 0, 7); c.fill(); c.strokeStyle = out; c.lineWidth = 1.4; c.stroke(); break;
    case "acorn": c.rotate(rot); c.fillStyle = col; c.beginPath(); c.ellipse(0, 1, 4.5, 5.2, 0, 0, 7); c.fill(); c.strokeStyle = out; c.lineWidth = 1.3; c.stroke(); c.fillStyle = "#7a4e22"; c.beginPath(); c.ellipse(0, -2.5, 5, 3, 0, Math.PI, 0); c.fill(); c.stroke(); break;
    case "carrot": c.fillStyle = col; c.beginPath(); c.moveTo(8, 0); c.lineTo(-5, -4); c.lineTo(-5, 4); c.closePath(); c.fill(); c.strokeStyle = out; c.lineWidth = 1.4; c.stroke(); c.fillStyle = "#58c26a"; c.beginPath(); c.moveTo(-5, 0); c.lineTo(-10, -4); c.lineTo(-8, 0); c.lineTo(-10, 4); c.closePath(); c.fill(); break;
    case "fire": case "flame": case "spark": { const gg = c.createRadialGradient(0, 0, 1, 0, 0, 9); gg.addColorStop(0, "#fff7c2"); gg.addColorStop(0.5, col); gg.addColorStop(1, p.shape === "spark" ? "#7bd88f" : "#ff3d2e"); c.fillStyle = gg; c.beginPath(); c.moveTo(10, 0); c.quadraticCurveTo(0, -9, -10, 0); c.quadraticCurveTo(0, 9, 10, 0); c.fill(); break; }
    case "feather": c.fillStyle = col; c.beginPath(); c.moveTo(9, 0); c.quadraticCurveTo(0, -6, -8, 0); c.quadraticCurveTo(0, 5, 9, 0); c.fill(); c.strokeStyle = "#6b5bd1"; c.lineWidth = 1.2; c.stroke(); c.beginPath(); c.moveTo(-8, 0); c.lineTo(8, 0); c.stroke(); break;
    case "bamboo": c.rotate(rot); c.fillStyle = col; c.beginPath(); c.roundRect(-9, -3, 18, 6, 3); c.fill(); c.strokeStyle = "#2f7d44"; c.lineWidth = 1.4; c.stroke(); c.beginPath(); c.moveTo(-3, -3); c.lineTo(-3, 3); c.moveTo(3, -3); c.lineTo(3, 3); c.stroke(); break;
    case "leaf": c.rotate(rot); c.fillStyle = col; c.beginPath(); c.moveTo(-8, 0); c.quadraticCurveTo(0, -9, 8, 0); c.quadraticCurveTo(0, 9, -8, 0); c.fill(); c.strokeStyle = "#2f7d44"; c.lineWidth = 1.4; c.stroke(); break;
    case "lava": c.rotate(rot); c.fillStyle = col; c.beginPath(); c.arc(0, 0, 6, 0, 7); c.fill(); c.strokeStyle = "#3a2a2a"; c.lineWidth = 1.6; c.stroke(); c.fillStyle = "#ffb347"; c.beginPath(); c.arc(-1.5, -1, 2.4, 0, 7); c.arc(2, 2, 1.6, 0, 7); c.fill(); break;
    case "bubblebomb": c.fillStyle = "rgba(190,230,255,.7)"; c.beginPath(); c.arc(0, 0, 6.5, 0, 7); c.fill(); c.strokeStyle = col; c.lineWidth = 2; c.stroke(); c.fillStyle = "#fff"; c.beginPath(); c.arc(-2, -2, 1.8, 0, 7); c.fill(); break;
    case "shell": c.rotate(rot); c.fillStyle = col; c.beginPath(); c.moveTo(0, 5); c.quadraticCurveTo(-8, 1, -5, -5); c.quadraticCurveTo(0, -8, 5, -5); c.quadraticCurveTo(8, 1, 0, 5); c.fill(); c.strokeStyle = "#c06a86"; c.lineWidth = 1.2; c.stroke(); break;
    default: c.fillStyle = "#fff"; c.beginPath(); c.arc(0, 0, 3.6, 0, 7); c.fill(); c.strokeStyle = col; c.stroke();
  }
}
// 파티클 p: {x,y,l,m,col,s,ring,rad,shape,rb}. shape: dot(기본) star heart
function drawPart(c, p) {
  const m = p.m || p.l0 || 0.8, k = Math.max(0, p.l / m);
  if (p.ring) { c.strokeStyle = p.col; c.globalAlpha = k; c.lineWidth = 3 * k + 1; c.beginPath(); c.arc(p.x, p.y, p.rad * (1 - k * 0.8), 0, 7); c.stroke(); c.globalAlpha = 1; return; }
  c.globalAlpha = Math.min(1, k * 1.5); const col = p.rb != null ? `hsl(${(p.rb + performance_now() * 0.2) % 360},100%,70%)` : p.col, s = p.s * (0.4 + k * 0.6);
  if (p.shape === "star") { c.save(); c.translate(p.x, p.y); c.fillStyle = col; _star(c, s * 1.5, 4, 0.3); c.fill(); c.restore(); }
  else if (p.shape === "heart") { c.save(); c.translate(p.x, p.y); c.fillStyle = col; _heart(c, s * 0.9); c.fill(); c.restore(); }
  else { c.fillStyle = col; c.beginPath(); c.arc(p.x, p.y, s, 0, 7); c.fill(); }
  c.globalAlpha = 1;
}

// ---------- 즉발 이펙트 ----------
// e: {type,x,y,tx,ty,t,max,col,scale,...}. chain: pts[{x,y}] 또는 x,y→tx,ty. nova/meteor/burst: x,y,R. storm: shape. flash: col
function _jag(c, a, b, seed, amp) { // a→b 지그재그
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, n = Math.max(2, Math.round(len / 14));
  for (let i = 1; i <= n; i++) { const f = i / n, j = i === n ? 0 : Math.sin(seed * 12.9898 + i * 78.233 + a.x * 0.37) * amp; c.lineTo(a.x + dx * f + nx * j, a.y + dy * f + ny * j); }
}
function drawEfx(c, e) {
  const k = 1 - e.t / e.max, sc = e.scale || 1, col = e.col || "#fff";
  c.save(); c.lineCap = "round"; c.lineJoin = "round";
  if (e.type === "tongue") {
    const len = k < 0.4 ? k / 0.4 : 1 - (k - 0.4) / 0.6, x = e.x + (e.tx - e.x) * len, y = e.y + (e.ty - e.y) * len;
    c.strokeStyle = "#c93b6a"; c.lineWidth = 7 * sc; c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(x, y); c.stroke();
    c.strokeStyle = col; c.lineWidth = 4.5 * sc; c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(x, y); c.stroke();
    c.fillStyle = col; c.strokeStyle = "#c93b6a"; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, 5.5 * sc, 0, 7); c.fill(); c.stroke();
  } else if (e.type === "slash") {
    c.translate(e.x, e.y); c.rotate(-0.7); c.scale(sc, sc); c.globalAlpha = 1 - Math.max(0, (k - 0.5) * 2);
    for (let i = -1; i <= 1; i++) { const grow = Math.min(1, k * 3.2), y0 = i * 9; c.strokeStyle = "#ff5c8a55"; c.lineWidth = 9; c.beginPath(); c.moveTo(-16, y0 - 14); c.lineTo(-16 + 32 * grow, y0 - 14 + 28 * grow); c.stroke(); c.strokeStyle = col; c.lineWidth = 4; c.beginPath(); c.moveTo(-16, y0 - 14); c.lineTo(-16 + 32 * grow, y0 - 14 + 28 * grow); c.stroke(); }
  } else if (e.type === "wave") {
    c.globalAlpha = 1 - k * 0.7;
    for (let j = 0; j < 3; j++) { const d = k * e.dist - j * 16; if (d < 8) continue; c.strokeStyle = col; c.lineWidth = (e.thick || 4) * sc * (1 - j * 0.2); c.beginPath(); c.arc(e.x, e.y, d, e.ang - 0.5, e.ang + 0.5); c.stroke(); }
  } else if (e.type === "beam") {
    const g = c.createLinearGradient(e.x, e.y, e.tx, e.ty);
    (e.rainbow !== false && !e.col ? ["#ff6b6b", "#ffd24d", "#7bd88f", "#7cc4ff", "#d28bff"] : [col, "#fff", col]).forEach((cc, i, a) => g.addColorStop(i / (a.length - 1), cc));
    c.globalAlpha = 1 - k; c.strokeStyle = g; c.lineWidth = 12 * sc * (1 - k * 0.5); c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(e.tx, e.ty); c.stroke();
    c.strokeStyle = "#fff"; c.lineWidth = 4 * sc * (1 - k); c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(e.tx, e.ty); c.stroke();
  } else if (e.type === "chain") {
    const pts = e.pts && e.pts.length > 1 ? e.pts : [{ x: e.x, y: e.y }, { x: e.tx, y: e.ty }], segs = pts.length - 1;
    const rev = Math.min(1, k / 0.35) * segs, fade = k < 0.35 ? 1 : 1 - (k - 0.35) / 0.65, sd = e.seed || (e.x * 0.13 + e.max);
    c.globalAlpha = fade;
    for (const [w, cc] of [[7 * sc, col + "55"], [3.4 * sc, col], [1.4 * sc, "#fff"]]) {
      c.strokeStyle = cc; c.lineWidth = w; c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
      for (let i = 0; i < segs; i++) { if (rev <= i) break; const b = rev >= i + 1 ? pts[i + 1] : { x: pts[i].x + (pts[i + 1].x - pts[i].x) * (rev - i), y: pts[i].y + (pts[i + 1].y - pts[i].y) * (rev - i) }; _jag(c, pts[i], b, sd + Math.floor(k * 6), 5 * sc); }
      c.stroke();
    }
    for (let i = 1; i < pts.length; i++) if (rev >= i) { c.fillStyle = "#fff"; c.beginPath(); c.arc(pts[i].x, pts[i].y, 3.5 * sc * (1 - k * 0.5), 0, 7); c.fill(); c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.arc(pts[i].x, pts[i].y, 6 * sc * (0.5 + k), 0, 7); c.stroke(); }
  } else if (e.type === "nova") {
    const R = (e.R || 100), rr = R * (1 - (1 - k) * (1 - k)), a = 1 - k;
    const g = c.createRadialGradient(e.x, e.y, rr * 0.3, e.x, e.y, rr); g.addColorStop(0, col + "00"); g.addColorStop(1, col + "88");
    c.globalAlpha = a; c.fillStyle = g; c.beginPath(); c.arc(e.x, e.y, rr, 0, 7); c.fill();
    c.strokeStyle = col; c.lineWidth = 6 * sc * a + 1; c.beginPath(); c.arc(e.x, e.y, rr, 0, 7); c.stroke(); c.strokeStyle = "#fff"; c.lineWidth = 2.5 * sc * a; c.beginPath(); c.arc(e.x, e.y, rr * 0.96, 0, 7); c.stroke();
    if (sc >= 1.2) { c.strokeStyle = col; c.lineWidth = 3 * a; c.beginPath(); c.arc(e.x, e.y, rr * 0.62, 0, 7); c.stroke(); }
    const n = sc >= 1.6 ? 12 : 8; if (sc >= 1.2) for (let i = 0; i < n; i++) { const an = (i / n) * 6.283 + k; _spark(c, e.x + Math.cos(an) * rr, e.y + Math.sin(an) * rr, 4 * sc * a + 1, "#fff"); }
  } else if (e.type === "meteor") {
    const R = (e.R || 70), df = Math.min(0.85, (e.delay != null ? e.delay : 0.6) / e.max || 0.5), tx = e.x, ty = e.y;
    if (k < df) {
      const p = k / df; c.globalAlpha = 0.35 + 0.25 * Math.sin(k * 40); c.strokeStyle = col; c.fillStyle = col + "33"; c.lineWidth = 2.5; c.setLineDash([6, 5]); c.beginPath(); c.arc(tx, ty, R * (0.6 + p * 0.4), 0, 7); c.fill(); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
      const q = p * p, mx = tx + (1 - q) * 70, my = ty - (1 - q) * 230;
      for (let i = 0; i < 6; i++) { const f = i / 6; c.globalAlpha = (1 - f) * 0.5; c.fillStyle = col; c.beginPath(); c.arc(mx + f * 38, my - f * 70 * 0.9 - f * 60, (9 - f * 6) * sc, 0, 7); c.fill(); }
      c.globalAlpha = 1; const g = c.createRadialGradient(mx, my, 1, mx, my, 12 * sc); g.addColorStop(0, "#fff"); g.addColorStop(0.5, col); g.addColorStop(1, col + "00"); c.fillStyle = g; c.beginPath(); c.arc(mx, my, 12 * sc, 0, 7); c.fill();
    } else {
      const p = (k - df) / (1 - df), a = 1 - p, rr = R * (0.3 + 0.7 * Math.sqrt(p));
      const g = c.createRadialGradient(tx, ty, 0, tx, ty, rr); g.addColorStop(0, "#fff"); g.addColorStop(0.4, col); g.addColorStop(1, col + "00"); c.globalAlpha = a; c.fillStyle = g; c.beginPath(); c.arc(tx, ty, rr, 0, 7); c.fill();
      c.strokeStyle = "#fff"; c.lineWidth = 4 * a * sc; c.beginPath(); c.arc(tx, ty, rr, 0, 7); c.stroke();
    }
  } else if (e.type === "burst") { // 범위 착탄 (lob/roar/breath)
    const R = e.R || 50, p = k, a = 1 - p, rr = R * (0.35 + 0.65 * Math.sqrt(p));
    c.globalAlpha = a * 0.6; c.fillStyle = col; c.beginPath(); c.arc(e.x, e.y, rr, 0, 7); c.fill(); c.globalAlpha = a; c.strokeStyle = "#fff"; c.lineWidth = 3 * sc * a + 1; c.beginPath(); c.arc(e.x, e.y, rr, 0, 7); c.stroke();
  } else if (e.type === "storm") {
    const Wd = typeof W !== "undefined" ? W : 360, Hd = typeof H !== "undefined" ? H : 400, a = Math.sin(Math.min(1, k) * Math.PI);
    c.globalAlpha = 0.16 * a; c.fillStyle = col; c.fillRect(0, 0, Wd, Hd); c.globalAlpha = Math.min(1, a * 1.4);
    const n = _LOW() ? 24 : 44, sp = e.shape || e.shot || "leafstorm";
    for (let i = 0; i < n; i++) {
      const hx = (Math.sin(i * 91.7) * 0.5 + 0.5), hy = (Math.sin(i * 47.3 + 5) * 0.5 + 0.5), x = hx * Wd + Math.sin(k * 8 + i) * 12, y = ((hy + k * 1.6 + i * 0.07) % 1) * Hd, s = 3 + (i % 4);
      c.save(); c.translate(x, y);
      if (/flame/.test(sp)) { c.fillStyle = i % 2 ? col : "#ffe27a"; c.beginPath(); c.moveTo(0, -s * 2); c.quadraticCurveTo(s, 0, 0, s); c.quadraticCurveTo(-s, 0, 0, -s * 2); c.fill(); }
      else if (/water/.test(sp)) { c.strokeStyle = i % 2 ? col : "#fff"; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -s * 2.5); c.lineTo(-s * 0.3, s); c.stroke(); }
      else if (/star/.test(sp)) { c.rotate(k * 6 + i); _spark(c, 0, 0, s * 1.6, i % 2 ? col : "#fff"); }
      else { c.rotate(k * 5 + i); c.fillStyle = i % 2 ? col : "#b6f5a8"; c.beginPath(); c.ellipse(0, 0, s * 1.5, s * 0.8, 0, 0, 7); c.fill(); }
      c.restore();
    }
  } else if (e.type === "flash") { c.globalAlpha = (1 - k) * 0.55; c.fillStyle = col; c.fillRect(-10, -10, 400, 440); }
  c.restore();
}

// ---------- 타이틀 퍼레이드 (8등급 전부, 렌더 폭에 비례한 간격 배분) ----------
const PARADE_W = 340, PARADE_H = 150;
function drawParade(c, w, h, t) {
  const cv = c.canvas, dpr = Math.min(3, (typeof window !== "undefined" && window.devicePixelRatio) || 1), W = PARADE_W, H = PARADE_H;
  if (cv && (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr))) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  c.setTransform(cv ? cv.width / W : 1, 0, 0, cv ? cv.height / H : 1, 0, 0); c.clearRect(0, 0, W, H);
  const base = H * 0.76, g = c.createLinearGradient(0, base - 6, 0, H); g.addColorStop(0, "#c9f2b6"); g.addColorStop(1, "#9bdc8a");
  c.fillStyle = g; c.beginPath(); c.roundRect(0, base - 6, W, H - base + 6, 18); c.fill();
  const n = 8, pad = 10, ws = [], rs = [];
  for (let gi = 0; gi < n; gi++) { const r = 13 * GRADES[gi].style.scale; rs.push(r); ws.push(r * (gi === 7 ? 4.1 : gi === 6 ? 2.9 : gi >= 4 ? 2.4 : 2.0)); }
  const sum = ws.reduce((a, b) => a + b, 0), minGap = 2, k = Math.min(1, (W - pad * 2 - minGap * (n - 1)) / sum);
  const gap = (W - pad * 2 - sum * k) / (n - 1); let x = pad;
  for (let gi = 0; gi < n; gi++) {
    const wi = ws[gi] * k, cx = x + (gi === 7 ? 1.55 * rs[gi] * k : wi / 2), idx = gi * 4 + (gi % 4), ch = CHARS[idx], ph = t * 3 + gi * 1.1, r = rs[gi] * k;
    const anim = Math.sin(ph) > 0.92 ? { t: 0.3, dur: 0.42, ang: 0.3, style: ATK[ch.key].mot } : null;
    c.save(); c.translate(cx, base - r * 0.95 - Math.abs(Math.sin(ph)) * 6); c.scale(k, k);
    drawUnit(c, idx, 0, 0, t, { anim, lite: ch.grade < 2 }); c.restore();
    x += wi + gap;
  }
}
// 갤러리 (?gallery=1 / 개발 검증용): 8등급(행) x 4무리(열)
function drawGallery(c, w, h, t) {
  c.fillStyle = "#e9f5dd"; c.fillRect(0, 0, w, h); const cw = w / 4, rh = h / 8;
  for (let g = 0; g < 8; g++) for (let cl = 0; cl < 4; cl++) { const x = cw * (cl + 0.5), y = rh * (g + 0.5) + 4; drawSlotTile(c, x, y, g, false, false, t, cl); drawUnit(c, g * 4 + cl, x, y, t, {}); drawSlotOverlay(c, x, y, { ch: g * 4 + cl, n: 1 }, t); }
}

// ---------- 배경 / 보드 ----------
const CH_BG = [["#c5f0ae", "#a6e195"], ["#b9dca0", "#8fc17a"], ["#ddd5c0", "#c2b79c"], ["#d3dce0", "#b2c0c8"], ["#cfe8ff", "#a9d2f5"], ["#ddd3f7", "#bba9ea"], ["#c8f0f0", "#9edcdc"], ["#f7e6bd", "#e8cb8c"], ["#ffdcee", "#ffb9db"], ["#a59bcb", "#7a6fa3"]];
// slots[i] = {ch,n,lock,hero} | null.  S 전역(읽기 전용)에서 round/resonance 를 참고한다.
function _bkTile(g, bt, A) { const k = _ba; drawSlotTile(g, 0, 0, k.grade, k.sel, k.lock, bt, k.clan); }
function _boardStatic(c, W, H, T, bgc) {
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, bgc[0]); g.addColorStop(1, bgc[1]);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.fillStyle = "rgba(255,255,255,.12)"; for (let i = 0; i < 8; i += 2) c.fillRect(0, (i * H) / 8, W, H / 8);
  c.strokeStyle = "rgba(60,150,70,.35)"; c.lineWidth = 1.6; c.lineCap = "round";
  for (let i = 0; i < 46; i++) { const px = (i * 97 + 13) % W, py = (i * 53 + 7) % H; c.beginPath(); c.moveTo(px, py); c.lineTo(px - 2, py - 5); c.moveTo(px, py); c.lineTo(px + 2, py - 6); c.stroke(); }
  const tw = T.x1 - T.x0, th = T.y1 - T.y0;
  c.lineJoin = "round";
  c.strokeStyle = "#bf9a5e"; c.lineWidth = 34; c.strokeRect(T.x0, T.y0 + 2, tw, th);
  c.strokeStyle = "#e6c88a"; c.lineWidth = 30; c.strokeRect(T.x0, T.y0, tw, th);
  c.strokeStyle = "#f7e5b8"; c.lineWidth = 22; c.strokeRect(T.x0, T.y0, tw, th);
  c.fillStyle = "rgba(170,130,80,.45)";
  for (let i = 0; i < 70; i++) { const d = (i * 47.3) % (2 * (tw + th)); let px, py; if (d < tw) { px = T.x0 + d; py = T.y0; } else if (d < tw + th) { px = T.x1; py = T.y0 + d - tw; } else if (d < 2 * tw + th) { px = T.x1 - (d - tw - th); py = T.y1; } else { px = T.x0; py = T.y1 - (d - 2 * tw - th); } c.beginPath(); c.arc(px + ((i * 7) % 9) - 4, py + ((i * 11) % 9) - 4, 1.5 + (i % 3) * 0.5, 0, 7); c.fill(); }
  const flowers = [[48, 62, "#ff9ec0"], [300, 340, "#fff"], [90, 350, "#ffe27a"], [320, 80, "#ff9ec0"], [180, 62, "#fff"], [180, 345, "#ffe27a"], [50, 210, "#fff"], [312, 215, "#ffe27a"], [100, 62, "#ffe27a"], [262, 62, "#ff9ec0"]];
  flowers.forEach(([fx, fy, col]) => { c.fillStyle = col; for (let k = 0; k < 5; k++) { const a = (k * Math.PI * 2) / 5; c.beginPath(); c.arc(fx + Math.cos(a) * 3, fy + Math.sin(a) * 3, 2.2, 0, 7); c.fill(); } c.fillStyle = "#ffb703"; c.beginPath(); c.arc(fx, fy, 1.6, 0, 7); c.fill(); });
}
function drawBoard(c, W, H, T, slotPos, slotCount, sel, t, slots) {
  const Sx = typeof S !== "undefined" ? S : null, ci = Sx && Sx.round ? Math.min(9, Math.floor((Sx.round - 1) / 5)) : 0, bgc = CH_BG[ci];
  // 정적 배경은 챕터/크기/배율이 같으면 오프스크린 1장으로 재사용 (S, t 에 의존하지 않음)
  const sc = _gfxSC(), bk = ci + "|" + W + "|" + H + "|" + T.x0 + "," + T.y0 + "," + T.x1 + "," + T.y1 + "|" + sc;
  if (_canBake() && !(_boardCache && _boardCache.k === bk)) {
    try {
      const cw = Math.ceil(W * sc), ch = Math.ceil(H * sc), cv = _boardCache && _boardCache.cv.width === cw && _boardCache.cv.height === ch ? _boardCache.cv : document.createElement("canvas");
      cv.width = cw; cv.height = ch; const g = cv.getContext("2d"); g.setTransform(cw / W, 0, 0, ch / H, 0, 0); _boardStatic(g, W, H, T, bgc); _boardCache = { k: bk, cv };
    } catch (err) { _boardCache = null; }
  }
  if (_boardCache && _boardCache.k === bk) { c.drawImage(_boardCache.cv, 0, 0, W, H); c.lineCap = "round"; c.lineJoin = "round"; }
  else _boardStatic(c, W, H, T, bgc);
  const px = T.x0, py = T.y0, sp = t * 2;
  const pg = c.createRadialGradient(px, py, 2, px, py, 22); pg.addColorStop(0, "#fff"); pg.addColorStop(0.4, "#d28bff"); pg.addColorStop(1, "rgba(150,80,220,0)");
  c.fillStyle = pg; c.beginPath(); c.arc(px, py, 22, 0, 7); c.fill();
  c.strokeStyle = "#fff"; c.lineWidth = 2; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(px, py, 6 + i * 4, sp + i, sp + i + 3.6); c.stroke(); }
  // 칸: 등급별 타일 + 코너 표시
  const res = Sx && Sx.resonance;
  for (let i = 0; i < slotCount; i++) {
    const p = slotPos(i), s = slots ? slots[i] : null, grade = s ? (s.hero ? -2 : CHARS[s.ch].grade) : -1, clan = s && !s.hero ? CHARS[s.ch].clan : -1;
    _ba.grade = grade; _ba.sel = sel === i; _ba.lock = !!(s && s.lock); _ba.clan = clan;
    _bakeAt(c, t, "t|" + grade + "|" + (sel === i ? 1 : 0) + "|" + (s && s.lock ? 1 : 0) + "|" + clan, 36, p.x, p.y, _bkTile, _ba);
    if (res && clan >= 0 && res[clan] >= 4) { // 무리 공명: 같은 무리 칸에 맥동하는 무리색 테두리 (6종 이상은 이중)
      const pu = 0.5 + 0.5 * Math.sin(t * 4); c.save(); c.strokeStyle = EMB_COL[clan]; c.globalAlpha = 0.45 + pu * 0.35; c.lineWidth = 2; c.setLineDash([5, 4]); c.lineDashOffset = -t * 14; _rrect(c, p.x - 31, p.y - 31, 62, 62, 19); c.stroke(); if (res[clan] >= 6) { _rrect(c, p.x - 34, p.y - 34, 68, 68, 22); c.stroke(); } c.restore();
    }
    if (s) drawSlotOverlay(c, p.x, p.y, s, t);
  }
  if (sel >= 0 && slots && slots[sel]) { // 사거리 표시
    const s = slots[sel], rg = s.hero ? 170 : CHARS[s.ch].range, p = slotPos(sel), gc = s.hero ? "#ffc400" : GRADES[CHARS[s.ch].grade].color;
    c.save(); c.strokeStyle = `rgba(255,140,60,${0.55 + Math.sin(t * 6) * 0.2})`; c.lineWidth = 2.5; c.setLineDash([8, 7]); c.lineDashOffset = -t * 20;
    c.fillStyle = "rgba(255,200,80,.12)"; c.beginPath(); c.arc(p.x, p.y, rg, 0, 7); c.fill(); c.stroke(); c.restore();
  } else if (sel >= 0) { const p = slotPos(sel); c.save(); c.strokeStyle = "rgba(255,140,60,.5)"; c.lineWidth = 2.5; c.setLineDash([8, 7]); c.beginPath(); c.arc(p.x, p.y, 150, 0, 7); c.stroke(); c.restore(); }
}

loadSprites();
if (typeof window !== "undefined") window.GFX = { drawGallery, drawMobBar, drawClanBar, drawEmblem, drawBadge, drawSlotOverlay, badgeWidth, GFX_MAX_PARTS };
