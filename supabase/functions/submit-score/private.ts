// 프라이빗 시즌 액션 (psCreate psJoin psGet psList psBoard psKick psCancel psSubmit). index.ts 가 action 이 "ps" 로 시작하면 handlePrivate 로 위임한다.
// 전부 JWT 필수. 시즌 규칙(rules)은 항상 DB 에서 읽어 서버 엔진으로 재생한다(클라이언트가 보낸 rules 는 신뢰하지 않음).
// 엔진 쪽 계약(에이전트 A): engine.js 가 validateRules(rules)->{ok,rules|err}, rulesHash(rules) 를 export 하고 replay.js 가 replay({seed, log, rules}) 를 지원.
// 의존성은 `deps` 객체로 주입 가능(테스트가 덮어쓴다). getUser 는 index.ts(B) 의 JWT 헬퍼가 있으면 setUserResolver 로 연결, 없으면 Supabase Auth /user 로 직접 검증.
import * as ENG from "./engine.js";
import * as RP from "./replay.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOW_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const IP_SALT = Deno.env.get("IP_SALT") ?? "malang";
const EXTRA_BAD = (Deno.env.get("BAD_WORDS") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

const cors = {
  "Access-Control-Allow-Origin": ALLOW_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => json(status, { ok: false, error, ...extra });

export const ALLOWED_DAILY = [3, 5, 10]; // null = 무제한
export const LIMITS = { MAX_DAYS: 60, DEF_PLAYERS: 10, MAX_PLAYERS: 30, MAX_SCORE: 1_000_000, MAX_ROUND: 200 };

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function rpcDefault(fn: string, args: Record<string, unknown>) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`${fn} ${r.status} ${await r.text()}`);
  return r.json();
}

// JWT -> {id} | null. Supabase Auth 서버가 서명/만료를 검증한다.
async function getUserDefault(req: Request): Promise<{ id: string } | null> {
  const h = req.headers.get("authorization") ?? "";
  const tok = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!tok || tok === SERVICE_KEY) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${tok}` } });
    if (!r.ok) return null;
    const u = await r.json();
    return typeof u?.id === "string" ? { id: u.id.toLowerCase() } : null;
  } catch { return null; }
}

export const deps: any = {
  rpc: rpcDefault,
  getUser: getUserDefault,
  nowMs: () => (globalThis as any).__NOW__ ?? Date.now(),
  validateRules: (ENG as any).validateRules,
  rulesHash: (ENG as any).rulesHash,
  replay: (o: any) => (RP as any).replay(o),
  validateInputs: (RP as any).validateInputs,
  engineVer: (RP as any).ENGINE_VER,
  kstDate: (ENG as any).kstDate,
  checkName: (ENG as any).checkName,
};
export function setUserResolver(fn: (req: Request) => Promise<{ id: string } | null>) { deps.getUser = fn; }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_RE = /^[A-Za-z0-9]{8}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const dayNum = (d: string) => Math.floor(Date.parse(d + "T00:00:00Z") / 86400000);
const validDate = (d: unknown): d is string => typeof d === "string" && DATE_RE.test(d) && !Number.isNaN(Date.parse(d + "T00:00:00Z")) && new Date(d + "T00:00:00Z").toISOString().slice(0, 10) === d;
const NAME_ERR: Record<string, string> = { len: "bad_name_len", chars: "bad_name_chars", bad: "bad_name" };

// DB status -> HTTP
const STATUS_HTTP: Record<string, [number, string]> = {
  host_limit: [409, "host_limit"], join_limit: [409, "join_limit"], no_such_season: [404, "no_such_season"], cancelled: [410, "season_cancelled"],
  season_over: [403, "season_closed"], kicked: [403, "kicked"], full: [409, "season_full"], not_owner: [403, "not_owner"],
  not_member: [403, "not_member"], no_such_member: [404, "no_such_member"], cannot_kick_self: [400, "cannot_kick_self"], already: [409, "already_done"],
  not_started: [403, "season_not_started"], daily_limit: [429, "daily_limit"], duplicate: [409, "duplicate_run"],
};
const dbFail = (r: any) => {
  const m = STATUS_HTTP[r?.status];
  return m ? fail(m[0], m[1], r.season ? { season: r.season } : r.limit ? { limit: r.limit } : {}) : fail(500, "server_error");
};

const RATE: Record<string, any> = {
  psCreate: { p_kind: "ps_create", p_ip_max: 6, p_dev_max: 3 },
  psJoin: { p_kind: "ps_join", p_ip_max: 10, p_dev_max: 6 },
  psSubmit: { p_kind: "ps_submit" },
  psKick: { p_kind: "ps_admin", p_ip_max: 20, p_dev_max: 10 },
  psCancel: { p_kind: "ps_admin", p_ip_max: 20, p_dev_max: 10 },
  psGet: { p_kind: "ps_read", p_ip_max: 40, p_dev_max: 20 },
  psList: { p_kind: "ps_read", p_ip_max: 40, p_dev_max: 20 },
  psBoard: { p_kind: "ps_read", p_ip_max: 40, p_dev_max: 20 },
};

export async function handlePrivate(req: Request, b: any): Promise<Response> {
  const action: string = b.action;
  if (!(action in RATE)) return fail(400, "bad_action");
  const user = await deps.getUser(req);
  if (!user?.id) return fail(401, "login_required");
  const uid = user.id.toLowerCase();
  const now = deps.nowMs();
  const today: string = deps.kstDate(now);

  // 1) 입력 검증 (DB/rate limit 이전)
  let q: any = {};
  if (action === "psCreate") {
    if (!deps.validateRules) return fail(501, "rules_unsupported");
    const c: any = deps.checkName(b.name, EXTRA_BAD);
    if (!c.ok) return fail(400, NAME_ERR[c.err] ?? "bad_name");
    const nm: string = c.name;
    if (nm.length < 2 || nm.length > 20) return fail(400, "bad_name_len");
    if (!validDate(b.start) || !validDate(b.end)) return fail(400, "bad_dates");
    if (b.start < today) return fail(400, "start_in_past");
    if (b.end < b.start) return fail(400, "bad_dates");
    if (dayNum(b.end) - dayNum(b.start) + 1 > LIMITS.MAX_DAYS) return fail(400, "too_long");
    const maxPlayers = b.maxPlayers ?? LIMITS.DEF_PLAYERS;
    if (!isInt(maxPlayers) || maxPlayers < 2 || maxPlayers > LIMITS.MAX_PLAYERS) return fail(400, "bad_max_players");
    const daily = b.dailyRunLimit ?? null;
    if (daily !== null && !ALLOWED_DAILY.includes(daily)) return fail(400, "bad_daily_limit");
    const vr: any = deps.validateRules(b.rules);
    if (!vr?.ok) return fail(400, "bad_rules", { detail: vr?.err ?? null });
    q = { nm, rules: vr.rules, maxPlayers, daily };
  } else if (action === "psJoin") {
    if (typeof b.code !== "string" || !CODE_RE.test(b.code.trim())) return fail(400, "bad_code");
  } else if (action === "psGet") {
    const hasId = b.id !== undefined && b.id !== null;
    if (hasId ? (typeof b.id !== "string" || !UUID_RE.test(b.id)) : (typeof b.code !== "string" || !CODE_RE.test(b.code.trim()))) return fail(400, "bad_id");
  } else if (action === "psBoard" || action === "psCancel" || action === "psKick") {
    if (typeof b.id !== "string" || !UUID_RE.test(b.id)) return fail(400, "bad_id");
    if (action === "psKick" && (typeof b.target !== "string" || !UUID_RE.test(b.target))) return fail(400, "bad_target");
  } else if (action === "psSubmit") {
    if (typeof b.id !== "string" || !UUID_RE.test(b.id)) return fail(400, "bad_id");
    if (b.ver !== deps.engineVer) return fail(409, "ver_mismatch", { server_ver: deps.engineVer });
    if (!isInt(b.seed) || b.seed < 1 || b.seed > 2147483646) return fail(400, "bad_seed");
    if (!isInt(b.claimedScore) || b.claimedScore < 0 || b.claimedScore > LIMITS.MAX_SCORE) return fail(400, "bad_score");
    if (!isInt(b.claimedRound) || b.claimedRound < 1 || b.claimedRound > LIMITS.MAX_ROUND) return fail(400, "bad_round");
    if (typeof b.win !== "boolean") return fail(400, "bad_win");
    const log = b.log ?? b.inputs;
    const bad = deps.validateInputs(log);
    if (bad) return fail(400, "bad_inputs", { detail: bad });
    q = { log };
  }

  // 2) rate limit
  const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "?").split(",")[0].trim();
  try {
    const ok = await deps.rpc("rate_limit_hit", { p_ip: await sha256Hex(IP_SALT + ip), p_device: uid, ...RATE[action] });
    if (ok === false) return fail(429, "rate_limited");
  } catch (e) { console.error("rate", e); return fail(500, "server_error"); }

  try {
    const rpc = deps.rpc;
    if (action === "psCreate") {
      const ownerName = await myName(uid);
      if (!ownerName) return fail(409, "no_player");
      const r = await rpc("private_season_create", {
        p_owner: uid, p_name: q.nm, p_start: b.start, p_end: b.end, p_rules: q.rules, p_hash: deps.rulesHash(q.rules),
        p_max: q.maxPlayers, p_daily: q.daily, p_owner_name: ownerName, p_today: today,
      });
      return r.status === "ok" ? json(200, { ok: true, season: r.season }) : dbFail(r);
    }
    if (action === "psJoin") {
      const nm = await myName(uid);
      if (!nm) return fail(409, "no_player");
      const r = await rpc("private_season_join", { p_user: uid, p_code: b.code.trim(), p_name: nm, p_today: today });
      if (r.status === "already") return json(200, { ok: true, already: true, season: r.season });
      return r.status === "ok" ? json(200, { ok: true, already: false, season: r.season }) : dbFail(r);
    }
    if (action === "psGet") {
      const r = await rpc("private_season_get", { p_user: uid, p_id: b.id ?? null, p_code: b.id ? null : b.code.trim(), p_today: today });
      return r.status === "ok" ? json(200, { ok: true, today, season: r.season }) : dbFail(r);
    }
    if (action === "psList") return json(200, { ok: true, today, seasons: await rpc("private_season_list_mine", { p_user: uid }) });
    if (action === "psBoard") {
      const r = await rpc("private_season_leaderboard", { p_user: uid, p_id: b.id, p_limit: 100 });
      return r.status === "ok" ? json(200, { ok: true, rows: r.rows, total: r.total }) : dbFail(r);
    }
    if (action === "psKick") {
      const r = await rpc("private_season_kick", { p_owner: uid, p_id: b.id, p_target: b.target.toLowerCase() });
      return r.status === "ok" ? json(200, { ok: true }) : dbFail(r);
    }
    if (action === "psCancel") {
      const r = await rpc("private_season_cancel", { p_owner: uid, p_id: b.id, p_today: today });
      return r.status === "ok" ? json(200, { ok: true, result: r.result }) : dbFail(r);
    }

    // psSubmit: 시즌 규칙을 DB 에서 읽어 사전 검사 -> 재생 -> DB 에서 다시 검사하며 저장
    const g = await rpc("private_season_get", { p_user: uid, p_id: b.id, p_code: null, p_today: today });
    if (g.status !== "ok") return dbFail(g);
    const s = g.season;
    if (!s.is_member) return fail(403, "not_member");
    if (s.status === "cancelled") return fail(410, "season_cancelled");
    if (today < s.start) return fail(403, "season_not_started");
    if (s.ended) return fail(403, "season_closed");
    if (s.daily_run_limit != null && s.runs_today >= s.daily_run_limit) return fail(429, "daily_limit", { limit: s.daily_run_limit });
    if (b.claimedRound > (s.rules?.rounds ?? LIMITS.MAX_ROUND)) return fail(400, "bad_round");
    const vr: any = deps.validateRules(s.rules);
    if (!vr?.ok) { console.error("stored rules invalid", b.id); return fail(500, "server_error"); }
    const v = deps.replay({ seed: b.seed, log: q.log, rules: vr.rules });
    if (!v.ok) return fail(422, "replay_failed", { detail: v.error });
    const x = v.result;
    if (x.score !== b.claimedScore || x.round !== b.claimedRound || x.win !== b.win) {
      console.warn("ps mismatch", { uid, claimed: [b.claimedScore, b.claimedRound, b.win], server: [x.score, x.round, x.win] });
      return fail(422, "score_mismatch");
    }
    const nm = await myName(uid);
    const r = await rpc("submit_score_private", {
      p_user: uid, p_season: b.id, p_name: nm ?? "?", p_score: x.score, p_round: x.round, p_win: x.win, p_seed: b.seed, p_hero: x.hero,
      p_units: { count: x.units, pts: x.unitPts, kills: x.kills, draws: x.draws }, p_build: RP.cleanBuild(x.build),
      p_ver: b.ver, p_inputs_hash: await sha256Hex(JSON.stringify(q.log)), p_today: today, p_now: new Date(now).toISOString(),
    });
    if (r.status !== "ok") return dbFail(r);
    return json(200, { ok: true, saved: true, score: x.score, season_best: r.season_best, prev_best: r.prev_best ?? null,
      rank_before: r.rank_before ?? null, rank_after: r.rank_after ?? null, total: r.total ?? null });
  } catch (e) { console.error(action, e); return fail(500, "server_error"); }

  async function myName(id: string): Promise<string | null> {
    const n = await deps.rpc("ps_display_name", { p_user: id });
    return typeof n === "string" && n ? n : null;
  }
}
