// 이용 행동 기록 수신 (action "ev"). index.ts 가 점수 경로보다 앞에서 handleEvents 로 위임한다. 설계: docs/행동지표_설계.md
// 원칙: 점수·계정 경로와 섞지 않는다(rate_limit_hit RPC 안 씀, 예외는 전부 삼키고 {ok:true}/{ok:false} 만 돌려준다).
// 기기 식별은 sha256(EV_SALT + device_id) 앞 16자만 저장한다. EV_SALT 시크릿이 없으면 기록을 건너뛴다(로그만 남김).
// 샘플링: 환경변수 EV_SAMPLE_PCT(0~100, 기본 100). 기기 해시 앞 2자리(0~255)가 pct 에 못 미치는 기기만 기록(기기 단위라 퍼널이 깨지지 않는다).
// 본문은 text/plain 으로 와도 된다(index.ts 가 req.text() 후 JSON.parse): sendBeacon 은 사전 요청(OPTIONS)이 없다.
import { deps as pdeps } from "./private.ts";

const ALLOW_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const cors = { "Access-Control-Allow-Origin": ALLOW_ORIGIN };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

export const LIMITS = { body: 4096, events: 30, evBytes: 200, rateMin: 12, ipMin: 60, rateMapMax: 5000 };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SID_RE = /^[A-Za-z0-9]{12}$/, VER_RE = /^\d{1,3}$/, HERO_RE = /^[a-z0-9_]{1,16}$/;

// 화면·버튼 enum (설계 §3.1·§3.2). 모르는 값이 오면 그 이벤트만 버린다.
export const SCREENS = new Set(["home", "nick", "rename", "import", "profile", "ranks_season", "ranks_points", "ranks_mine", "season_closed", "prob", "over",
  "market", "hero_pick", "hero_sheet", "hero_new", "ps_gate", "ps_list", "ps_detail", "ps_join", "ps_wizard", "ps_invite"]);
export const TAPS = new Set(["start_rand", "start_mine", "myhero_btn", "rank_btn", "seasons_btn", "menu", "m_rank", "m_prob", "m_snd", "m_save", "m_home", "spd", "ev_opt"]);
const LG = new Set(["rand", "mine", "ps"]), EX = new Set(["end", "home", "bg"]), SRC = new Set(["launch", "resume"]);
const N_KEYS = ["dr", "mg", "sl", "up", "rg", "tk", "lk", "au", "sp"]; // draw merge sell up rng ticket lock auto spd

const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const isEnum = (v: unknown, set: Set<string>): v is string => typeof v === "string" && set.has(v);

// 이벤트 1건 정리: 허용 키만 다시 만들어 돌려준다. 잘못된 이벤트는 null(폐기).
export function cleanEvent(x: any): Record<string, unknown> | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  if (!isInt(x.t, 0, 172_800_000)) return null;
  const o: Record<string, unknown> = { e: x.e, t: x.t };
  switch (x.e) {
    case "ss": if (!isEnum(x.src, SRC)) return null; o.src = x.src; break;
    case "scr":
      if (!isEnum(x.s, SCREENS)) return null; o.s = x.s;
      if (x.lg != null) { if (!isEnum(x.lg, LG)) return null; o.lg = x.lg; }
      break;
    case "tap": if (!isEnum(x.b, TAPS)) return null; o.b = x.b; break;
    case "rs":
      if (!isEnum(x.lg, LG)) return null; o.lg = x.lg;
      if (x.h != null) { if (typeof x.h !== "string" || !HERO_RE.test(x.h)) return null; o.h = x.h; }
      break;
    case "re": {
      if (!isEnum(x.lg, LG) || !isInt(x.r, 0, 200) || !isInt(x.w, 0, 1) || !isInt(x.sc, 0, 1_000_000) || !isInt(x.dur, 0, 172_800) || !isEnum(x.ex, EX)) return null;
      Object.assign(o, { lg: x.lg, r: x.r, w: x.w, sc: x.sc, dur: x.dur, ex: x.ex });
      if (x.n != null) {
        if (typeof x.n !== "object" || Array.isArray(x.n)) return null;
        const n: Record<string, number> = {};
        for (const k of N_KEYS) if (x.n[k] != null) { if (!isInt(x.n[k], 0, 99_999)) return null; n[k] = x.n[k]; }
        o.n = n;
      }
      break;
    }
    case "hd":
      if (!isInt(x.vis, 0, 172_800) || !isInt(x.play, 0, 172_800) || !isInt(x.act, 0, 172_800)) return null;
      if (x.last != null && x.last !== "none" && !isEnum(x.last, SCREENS)) return null;
      Object.assign(o, { vis: x.vis, play: x.play, act: x.act, last: x.last ?? "none", rec: x.rec === 1 ? 1 : 0 });
      break;
    default: return null;
  }
  if (JSON.stringify(o).length > LIMITS.evBytes) return null;
  return o;
}

// 요청 본문 검증. 형식 오류면 {err}, 아니면 정리된 {sid,ver,env,events}(이벤트 중 잘못된 것만 빠짐).
export function cleanBatch(b: any): { err: string } | { sid: string; ver: string; env: Record<string, unknown>; events: Record<string, unknown>[]; dropped: number } {
  if (typeof b.sid !== "string" || !SID_RE.test(b.sid)) return { err: "bad_sid" };
  if (typeof b.ver !== "string" || !VER_RE.test(b.ver)) return { err: "bad_ver" };
  if (!Array.isArray(b.ev) || b.ev.length < 1 || b.ev.length > LIMITS.events) return { err: "bad_events" };
  const e = b.env && typeof b.env === "object" ? b.env : {};
  const env = {
    pf: ["ios", "android", "desktop", "other"].includes(e.pf) ? e.pf : "other",
    sa: e.sa === 1 ? 1 : 0, vw: ["s", "m", "l"].includes(e.vw) ? e.vw : "l", new: e.new === 1 ? 1 : 0,
  };
  const events: Record<string, unknown>[] = [];
  for (const x of b.ev) { const c = cleanEvent(x); if (c) events.push(c); }
  return { sid: b.sid, ver: b.ver, env, events, dropped: b.ev.length - events.length };
}

// 기기 해시당 분당 상한(함수 인스턴스 메모리, 콜드스타트 시 초기화되는 느슨한 제한).
const hits = new Map<string, { m: number; c: number }>();
export function rateAllow(dev: string, nowMs: number, max = LIMITS.rateMin): boolean {
  const m = Math.floor(nowMs / 60_000), h = hits.get(dev);
  if (!h || h.m !== m) {
    if (hits.size >= LIMITS.rateMapMax) for (const [k, v] of hits) if (v.m !== m) hits.delete(k);
    if (hits.size >= LIMITS.rateMapMax) hits.clear();
    hits.set(dev, { m, c: 1 }); return true;
  }
  return ++h.c <= max;
}
// IP 당 분당 상한: device_id 는 클라이언트가 마음대로 바꿀 수 있어 기기 제한만으로는 DB 를 채우는 요청을 못 막는다. 공유 망(학교·회사)을 감안해 넉넉하게 둔다.
const ipHits = new Map<string, { m: number; c: number }>();
export function ipAllow(ip: string, nowMs: number, max = LIMITS.ipMin): boolean {
  const m = Math.floor(nowMs / 60_000), h = ipHits.get(ip);
  if (!h || h.m !== m) {
    if (ipHits.size >= LIMITS.rateMapMax) for (const [k, v] of ipHits) if (v.m !== m) ipHits.delete(k);
    if (ipHits.size >= LIMITS.rateMapMax) ipHits.clear();
    ipHits.set(ip, { m, c: 1 }); return true;
  }
  return ++h.c <= max;
}
export const _resetRate = () => { hits.clear(); ipHits.clear(); };

export const deps: any = {
  rpc: (fn: string, args: Record<string, unknown>) => pdeps.rpc(fn, args),
  nowMs: () => (globalThis as any).__NOW__ ?? Date.now(),
  env: (k: string) => Deno.env.get(k),
};

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function samplePct(raw: string | undefined): number {
  const n = raw == null || raw === "" ? 100 : Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 100;
}

// 응답: {ok:true, keep:0|1, sample:pct}. keep=0 이면 클라이언트는 한동안 보내지 않는다(샘플링 제외·솔트 없음).
export async function handleEvents(b: any, textLen: number, ip = "?"): Promise<Response> {
  try {
    if (textLen > LIMITS.body) return json(413, { ok: false, error: "too_large" });
    if (!ipAllow(ip, deps.nowMs())) return json(429, { ok: false, error: "rate_limited" });
    if (typeof b.device_id !== "string" || !UUID_RE.test(b.device_id)) return json(400, { ok: false, error: "bad_device" });
    const c = cleanBatch(b);
    if ("err" in c) return json(400, { ok: false, error: c.err });
    const salt = deps.env("EV_SALT"), pct = samplePct(deps.env("EV_SAMPLE_PCT"));
    if (!salt) { console.error("ev: EV_SALT 없음 - 기록 건너뜀"); return json(200, { ok: true, keep: 0, sample: pct }); }
    const dev = (await sha256Hex(salt + b.device_id.toLowerCase())).slice(0, 16);
    if (parseInt(dev.slice(0, 2), 16) * 100 >= pct * 256) return json(200, { ok: true, keep: 0, sample: pct });
    if (!rateAllow(dev, deps.nowMs())) return json(429, { ok: false, error: "rate_limited" });
    if (c.events.length) {
      try { await deps.rpc("ev_ingest", { p_dev: dev, p_sid: c.sid, p_ver: c.ver, p_env: c.env, p_events: c.events }); }
      catch (e) { console.error("ev_ingest", e); return json(500, { ok: false, error: "server_error" }); }
    }
    return json(200, { ok: true, keep: 1, sample: pct });
  } catch (e) { console.error("ev", e); return json(500, { ok: false, error: "server_error" }); }
}
