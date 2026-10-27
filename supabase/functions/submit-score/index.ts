// 말랑 운빨 디펜스 - 점수 제출 Edge Function (Deno).
// 배포: supabase functions deploy submit-score --no-verify-jwt
// 흐름: 요청 검증 -> rate limit -> 입력 로그를 서버 엔진(engine.js)으로 재생 -> 점수 일치 시 submit_score_best() 로 저장.
// engine.js 는 `node tools/build_engine.js` 로 생성한다(data.js + game.js). 규칙/ver 를 바꾸면 다시 생성 후 재배포.
import { replay, validateInputs, ENGINE_VER } from "./replay.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!; // 함수 런타임이 자동 주입. 클라이언트/저장소에 절대 넣지 않는다.
const ALLOW_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";     // 예: https://사용자명.github.io
const IP_SALT = Deno.env.get("IP_SALT") ?? "malang";
const MAX_BODY = 300_000;                                        // 바이트(입력 로그 8000개 상한이면 약 150KB)
const EXTRA_BAD = (Deno.env.get("BAD_WORDS") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const BAD = ["fuck", "shit", "씨발", "시발", "병신", "좆", ...EXTRA_BAD];

const cors = {
  "Access-Control-Allow-Origin": ALLOW_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => json(status, { ok: false, error, ...extra });

// 클라이언트 todayKey() 는 "기기 로컬 날짜"의 YYYYMMDD. 로컬 날짜 = now + (UTC-12 ~ UTC+14) 의 UTC 날짜.
// 오래 플레이하고 자정을 넘겨 제출하는 경우를 위해 1시간 여유(-13h)를 둔다.
function allowedSeeds(now = Date.now()): Set<number> {
  const s = new Set<number>();
  for (let h = -13; h <= 14; h++) {
    const d = new Date(now + h * 3600_000);
    s.add(d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate());
  }
  return s;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`${fn} ${r.status} ${await r.text()}`);
  return r.json();
}

function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = [...raw.replace(/[\u0000-\u001f\u007f<>]/g, "").trim()].slice(0, 10).join("");
  if (!name) return "익명";
  const flat = name.toLowerCase().replace(/[\s._\-*~!@#$%^&+=|\\/0-9]/g, "");
  if (BAD.some((w) => flat.includes(w))) return null;
  return name;
}

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return fail(405, "method_not_allowed");

  // 1) 크기/형식
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY) return fail(413, "too_large");
  const text = await req.text();
  if (text.length > MAX_BODY) return fail(413, "too_large");
  let b: any;
  try { b = JSON.parse(text); } catch { return fail(400, "bad_json"); }
  if (!b || typeof b !== "object") return fail(400, "bad_body");

  const { mode, seed, ver, inputs, claimedScore, claimedRound, win, device_id } = b;
  if (mode !== "daily") return fail(400, "practice_not_ranked");           // 연습 모드는 랭킹 제외
  if (ver !== ENGINE_VER) return fail(409, "ver_mismatch", { server_ver: ENGINE_VER }); // 클라이언트 새로고침 유도
  if (!isInt(seed) || !allowedSeeds().has(seed)) return fail(400, "bad_seed");
  if (!isInt(claimedScore) || claimedScore < 0 || claimedScore > 30000) return fail(400, "bad_score");
  if (!isInt(claimedRound) || claimedRound < 1 || claimedRound > 50) return fail(400, "bad_round");
  if (typeof win !== "boolean") return fail(400, "bad_win");
  if (typeof device_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(device_id)) return fail(400, "bad_device");
  const name = cleanName(b.name);
  if (name === null) return fail(400, "bad_name");
  const bad = validateInputs(inputs);
  if (bad) return fail(400, "bad_inputs", { detail: bad });

  // 2) rate limit (재생은 CPU 를 쓰므로 그 전에 검사)
  const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "?").split(",")[0].trim();
  try {
    const okRate = await rpc("rate_limit_hit", { p_ip: await sha256Hex(IP_SALT + ip), p_device: device_id.toLowerCase() });
    if (okRate === false) return fail(429, "rate_limited");
  } catch (e) { console.error("rate", e); return fail(500, "server_error"); }

  // 3) 리플레이 재계산
  const v = replay(seed, inputs);
  if (!v.ok) return fail(422, "replay_failed", { detail: v.error });
  const r = v.result;
  if (r.score !== claimedScore || r.round !== claimedRound || r.win !== win) {
    console.warn("mismatch", { device_id, claimed: [claimedScore, claimedRound, win], server: [r.score, r.round, r.win] });
    return fail(422, "score_mismatch");
  }

  // 4) 저장 (같은 기기·같은 날은 최고점만 유지)
  try {
    const inputsHash = await sha256Hex(JSON.stringify(inputs));
    const rows = await rpc("submit_score_best", {
      p_name: name, p_score: r.score, p_round: r.round, p_win: r.win, p_mode: "daily", p_seed: seed, p_hero: r.hero,
      p_units: { count: r.units, pts: r.unitPts, kills: r.kills, draws: r.draws },
      p_ver: ver, p_inputs_hash: inputsHash, p_device_id: device_id.toLowerCase(),
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    return json(200, { ok: true, saved: !!row?.o_saved, best: row?.o_best ?? r.score, score: r.score });
  } catch (e) { console.error("save", e); return fail(500, "server_error"); }
});
