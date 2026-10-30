// 친구 액션 (frRequest frAccept frDecline frRemove frBlock frList frBoard frMyCode). index.ts 가 action 이 "fr" 로 시작하면 handleFriends 로 위임한다.
// 전부 JWT 필수(로그인 계정에 연결된 player 만 친구 가능). 친구 식별은 코드(4자) 또는 "닉네임#코드" — 코드만 쓰고 닉네임 부분은 무시한다.
// 의존성은 deps 로 주입(테스트가 덮어쓴다). 기본 rpc/getUser 는 private.ts 의 것을 그대로 쓴다(setUserResolver 도 공유).
import { deps as pdeps } from "./private.ts";
import * as ENG from "./engine.js";

const ALLOW_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const IP_SALT = Deno.env.get("IP_SALT") ?? "malang";

const cors = {
  "Access-Control-Allow-Origin": ALLOW_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => json(status, { ok: false, error, ...extra });

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const deps: any = {
  rpc: (fn: string, args: Record<string, unknown>) => pdeps.rpc(fn, args),
  getUser: (req: Request) => pdeps.getUser(req),
  nowMs: () => (globalThis as any).__NOW__ ?? Date.now(),
  kstDate: (ENG as any).kstDate,
  seasonPhase: (ENG as any).seasonPhase,
};

// 코드: 31자 알파벳(0 O 1 I L 제외) 4자. "닉네임#ABCD" 형태면 마지막 # 뒤만 본다. 대소문자 무시.
const CODE_RE = /^[A-HJKMNP-Z2-9]{4}$/;
export function parseCode(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 40) return null;
  const s = raw.includes("#") ? raw.slice(raw.lastIndexOf("#") + 1) : raw;
  const c = s.trim().toUpperCase();
  return CODE_RE.test(c) ? c : null;
}

// DB status -> HTTP
const STATUS_HTTP: Record<string, [number, string]> = {
  no_player: [409, "no_player"], no_such_code: [404, "no_such_code"], self: [400, "cannot_target_self"],
  already_friends: [409, "already_friends"], already_requested: [409, "already_requested"], you_blocked: [403, "you_blocked"],
  friend_limit: [409, "friend_limit"], request_limit: [429, "request_limit"], no_such_request: [404, "no_such_request"], not_friends: [404, "not_friends"],
};
const dbFail = (r: any) => {
  const m = STATUS_HTTP[r?.status];
  return m ? fail(m[0], m[1]) : fail(500, "server_error");
};

const WRITE = { p_kind: "friend", p_ip_max: 30, p_dev_max: 12 };
const READ = { p_kind: "friend_read", p_ip_max: 60, p_dev_max: 30 };
const RATE: Record<string, any> = {
  frRequest: WRITE, frAccept: WRITE, frDecline: WRITE, frRemove: WRITE, frBlock: WRITE,
  frList: READ, frBoard: READ, frMyCode: READ,
};
const NEEDS_CODE = new Set(["frRequest", "frAccept", "frDecline", "frRemove", "frBlock"]);
const FN: Record<string, string> = {
  frRequest: "friend_request", frAccept: "friend_accept", frDecline: "friend_decline", frRemove: "friend_remove", frBlock: "friend_block",
};

export async function handleFriends(action: string, b: any, req: Request, d: any = deps): Promise<Response> {
  if (!(action in RATE)) return fail(400, "bad_action");
  const user = await d.getUser(req);
  if (!user?.id) return fail(401, "login_required");
  const uid = String(user.id).toLowerCase();

  // 1) 입력 검증 (rate limit/DB 이전)
  let code: string | null = null;
  if (NEEDS_CODE.has(action)) {
    code = parseCode(b.code);
    if (!code) return fail(400, "bad_code");
  }
  let season: number | null = null;
  if (action === "frBoard" && b.season !== undefined && b.season !== null) {
    if (typeof b.season !== "number" || !Number.isInteger(b.season) || b.season < 1 || b.season > 999) return fail(400, "bad_season");
    season = b.season;
  }

  // 2) rate limit
  const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "?").split(",")[0].trim();
  try {
    const ok = await d.rpc("rate_limit_hit", { p_ip: await sha256Hex(IP_SALT + ip), p_device: uid, ...RATE[action] });
    if (ok === false) return fail(429, "rate_limited");
  } catch (e) { console.error("rate", e); return fail(500, "server_error"); }

  try {
    if (NEEDS_CODE.has(action)) {
      const r = await d.rpc(FN[action], { p_user: uid, p_code: code });
      if (r?.status !== "ok") return dbFail(r);
      if (action === "frRequest") return json(200, { ok: true, result: r.result, friend: r.friend }); // result: requested | accepted(상대가 먼저 요청했던 경우 자동 수락)
      if (action === "frAccept") return json(200, { ok: true, friend: r.friend });
      return json(200, { ok: true });
    }
    if (action === "frMyCode") {
      const r = await d.rpc("friend_my_code", { p_user: uid });
      return r?.status === "ok" ? json(200, { ok: true, name: r.name, code: r.code, tag: `${r.name}#${r.code}` }) : dbFail(r);
    }
    if (action === "frList") {
      const r = await d.rpc("friend_list", { p_user: uid });
      return r?.status === "ok" ? json(200, { ok: true, friends: r.friends, incoming: r.incoming, outgoing: r.outgoing, blocked: r.blocked }) : dbFail(r);
    }
    // frBoard: 시즌 미지정이면 진행 중(또는 마지막으로 끝난) 시즌. 시작 전이면 직전 시즌.
    if (season === null) {
      const ph = d.seasonPhase(d.kstDate(d.nowMs()));
      season = ph.season ? (ph.phase === "before" && ph.season.id > 1 ? ph.season.id - 1 : ph.season.id) : 1;
    }
    const r = await d.rpc("friend_board", { p_user: uid, p_season: season });
    return r?.status === "ok" ? json(200, { ok: true, season: r.season, rows: r.rows }) : dbFail(r);
  } catch (e) { console.error(action, e); return fail(500, "server_error"); }
}
