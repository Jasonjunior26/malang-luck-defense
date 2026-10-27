// 말랑 운빨 디펜스 - 점수 제출 Edge Function (Deno).
// 배포: supabase functions deploy submit-score --no-verify-jwt
// action: submit(기본) | register | rename | profile | import. 모든 쓰기는 이 함수(service_role)만 한다.
// submit 흐름: 요청 검증 -> 시즌(서버 KST 시간) 확인 -> rate limit -> 입력 로그를 서버 엔진(engine.js)으로 재생 -> 점수 일치 시 submit_score_season() 로 저장.
// engine.js 는 `node tools/build_engine.js` 로 생성한다(data.js + game.js). 규칙/ver 를 바꾸면 다시 생성 후 재배포.
import { replay, validateInputs, ENGINE_VER } from "./replay.js";
import { seasonPhase, kstDate, checkName } from "./engine.js"; // SEASONS/닉네임 규칙은 data.js 가 단일 출처

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

// 현재 시각(ms). 테스트에서만 globalThis.__NOW__ 로 고정한다(원격에서는 설정할 방법이 없다).
const nowMs = (): number => (globalThis as any).__NOW__ ?? Date.now();

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

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME_ERR: Record<string, string> = { len: "bad_name_len", chars: "bad_name_chars", bad: "bad_name" };
const firstRow = (r: any) => (Array.isArray(r) ? r[0] : r);

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

  const action = b.action ?? "submit";
  if (!["submit", "register", "rename", "profile", "import"].includes(action)) return fail(400, "bad_action");
  const { device_id } = b;
  if (typeof device_id !== "string" || !UUID_RE.test(device_id)) return fail(400, "bad_device");
  const dev = device_id.toLowerCase();
  const now = nowMs();
  const today = kstDate(now);
  const ph = seasonPhase(today);
  const seasonInfo = ph.season ? { id: ph.season.id, name: ph.season.name, start: ph.season.start, end: ph.season.end } : null;

  // 2) 입력 검증 (rate limit 보다 먼저: 쓸데없는 호출은 DB 를 건드리지 않게)
  let name = "";
  if (action === "register" || action === "rename") {
    const c: any = checkName(b.name, EXTRA_BAD);
    if (!c.ok) return fail(400, NAME_ERR[c.err] ?? "bad_name");
    name = c.name;
  }
  let importId = "";
  if (action === "import") {
    if (typeof b.code !== "string" || !UUID_RE.test(b.code.trim())) return fail(400, "bad_code");
    importId = b.code.trim().toLowerCase();
  }
  let inputs: any, seed: any, claimedScore: any, claimedRound: any, win: any;
  if (action === "submit") {
    ({ inputs, seed, claimedScore, claimedRound, win } = b);
    if (b.mode !== "daily") return fail(400, "practice_not_ranked");          // 연습 모드는 랭킹 제외
    if (b.ver !== ENGINE_VER) return fail(409, "ver_mismatch", { server_ver: ENGINE_VER }); // 클라이언트 새로고침 유도
    // 시즌 밖이면 거부 (서버 KST 시간 기준, 클라이언트 값은 신뢰하지 않는다)
    if (ph.phase === "before") return fail(403, "season_not_started", { season: seasonInfo });
    if (ph.phase !== "live") return fail(403, "season_closed", { season: seasonInfo });
    if (!isInt(seed) || !allowedSeeds(now).has(seed)) return fail(400, "bad_seed");
    if (!isInt(claimedScore) || claimedScore < 0 || claimedScore > 30000) return fail(400, "bad_score");
    if (!isInt(claimedRound) || claimedRound < 1 || claimedRound > 50) return fail(400, "bad_round");
    if (typeof win !== "boolean") return fail(400, "bad_win");
    const bad = validateInputs(inputs);
    if (bad) return fail(400, "bad_inputs", { detail: bad });
  }

  // 3) rate limit (재생은 CPU 를 쓰므로 그 전에 검사). 닉네임 등록/변경/이전 코드는 더 촘촘하게.
  const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "?").split(",")[0].trim();
  const lim = action === "submit" ? { p_kind: "submit" }
    : action === "profile" ? { p_kind: "read", p_ip_max: 40, p_dev_max: 20 }
    : action === "import" ? { p_kind: "import", p_ip_max: 6, p_dev_max: 6 }
    : { p_kind: "name", p_ip_max: 6, p_dev_max: 4 };
  try {
    const okRate = await rpc("rate_limit_hit", { p_ip: await sha256Hex(IP_SALT + ip), p_device: dev, ...lim });
    if (okRate === false) return fail(429, "rate_limited");
  } catch (e) { console.error("rate", e); return fail(500, "server_error"); }

  try {
    if (action === "register") {
      const row = firstRow(await rpc("player_register", { p_device: dev, p_name: name }));
      if (row?.o_status === "name_taken") return fail(409, "name_taken");
      return json(200, { ok: true, name: row?.o_name ?? name, existed: row?.o_status === "exists" });
    }
    if (action === "rename") {
      const row = firstRow(await rpc("player_rename", { p_device: dev, p_name: name, p_now: new Date(now).toISOString() }));
      const st = row?.o_status;
      if (st === "no_player") return fail(404, "no_player");
      if (st === "name_taken") return fail(409, "name_taken");
      if (st === "cooldown") return fail(429, "rename_cooldown", { name: row.o_name, next_change_at: row.o_next });
      return json(200, { ok: true, name: row.o_name, next_change_at: row.o_next ?? null, same: st === "same" });
    }
    if (action === "import") {
      const row = firstRow(await rpc("player_get", { p_device: importId }));
      if (!row?.o_name) return fail(404, "no_such_code");
      return json(200, { ok: true, name: row.o_name });
    }
    if (action === "profile") {
      const p = await rpc("player_profile", { p_device: dev, p_season: seasonInfo?.id ?? 0, p_now: new Date(now).toISOString() });
      return json(200, { ok: true, phase: ph.phase, season: seasonInfo, today, profile: p });
    }

    // submit: 4) 리플레이 재계산
    const v = replay(seed, inputs);
    if (!v.ok) return fail(422, "replay_failed", { detail: v.error });
    const r = v.result;
    if (r.score !== claimedScore || r.round !== claimedRound || r.win !== win) {
      console.warn("mismatch", { device_id, claimed: [claimedScore, claimedRound, win], server: [r.score, r.round, r.win] });
      return fail(422, "score_mismatch");
    }
    // 5) 저장 (같은 기기·같은 날은 최고점만 유지, 시즌 랭킹은 시즌 내 최고점 1건). 닉네임은 서버의 players 값을 쓴다.
    const inputsHash = await sha256Hex(JSON.stringify(inputs));
    const row = firstRow(await rpc("submit_score_season", {
      p_season: seasonInfo!.id, p_score: r.score, p_round: r.round, p_win: r.win, p_mode: "daily", p_seed: seed, p_hero: r.hero,
      p_units: { count: r.units, pts: r.unitPts, kills: r.kills, draws: r.draws },
      p_ver: b.ver, p_inputs_hash: inputsHash, p_device_id: dev,
    }));
    if (row?.o_status === "no_player") return fail(409, "no_player");
    return json(200, {
      ok: true, saved: !!row?.o_saved, best: row?.o_best ?? r.score, score: r.score, name: row?.o_name,
      season: seasonInfo, season_best: row?.o_season_best, prev_best: row?.o_prev_best ?? null,
      rank_before: row?.o_rank_before ?? null, rank_after: row?.o_rank_after ?? null,
      next_score: row?.o_next_score ?? null, top_score: row?.o_top_score ?? null, total: row?.o_total ?? null,
    });
  } catch (e) { console.error(action, e); return fail(500, "server_error"); }
});
