// Edge Function 핸들러 통합 테스트 (Deno 없이 Node 에서 Deno.serve/fetch 를 모킹): node tools/test_function.mjs
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let handler; const rpcCalls = []; let rateOk = true;
globalThis.Deno = { env: { get: (k) => ({ SUPABASE_URL: "http://x", SUPABASE_SERVICE_ROLE_KEY: "svc" })[k] }, serve: (h) => (handler = h) };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith("http://x/rest/v1/rpc/")) { const fn = String(url).split("/").pop(); rpcCalls.push([fn, JSON.parse(init.body)]);
    return new Response(JSON.stringify(fn === "rate_limit_hit" ? rateOk : [{ o_saved: true, o_best: 1 }]), { status: 200 }); }
  return realFetch(url, init);
};
await import(pathToFileURL(path.join(root, "supabase/functions/submit-score/index.ts")).href);
const { replay, ENGINE_VER } = await import(pathToFileURL(path.join(root, "supabase/functions/submit-score/replay.js")).href);
const d = new Date(), p = (n) => String(n).padStart(2, "0"), seed = +(d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()));
const inputs = [[0, "draw", 0], [0, "draw", 0], [0, "draw", 0]];
const v = replay(seed, inputs).result;
const dev = "123e4567-e89b-12d3-a456-426614174000";
const base = { name: "테스터", mode: "daily", seed, ver: ENGINE_VER, inputs, claimedScore: v.score, claimedRound: v.round, win: v.win, device_id: dev };
const post = async (o) => { const r = await handler(new Request("http://f/", { method: "POST", body: JSON.stringify(o) })); return [r.status, (await r.json()).error || "ok"]; };
let fail = 0; const t = (n, got, want) => { const ok = got[0] === want[0] && got[1] === want[1]; if (!ok) fail++; console.log(ok ? "PASS" : "FAIL", n, got.join(" ")); };
t("정상", await post(base), [200, "ok"]);
t("점수 부풀리기", await post({ ...base, claimedScore: v.score + 1 }), [422, "score_mismatch"]);
t("로그 변조(미네랄 부족한 draw 추가)", await post({ ...base, inputs: [...inputs, [0, "draw", 0]] }), [422, "replay_failed"]);
t("재현불가 입력(sell 빈 슬롯)", await post({ ...base, inputs: [[0, "sell", 5]] }), [422, "replay_failed"]);
t("연습 모드", await post({ ...base, mode: "practice" }), [400, "practice_not_ranked"]);
t("ver 불일치", await post({ ...base, ver: "0" }), [409, "ver_mismatch"]);
t("오래된 seed", await post({ ...base, seed: seed - 5 }), [400, "bad_seed"]);
t("닉네임 금칙", await post({ ...base, name: "씨 발" }), [400, "bad_name"]);
t("device 형식", await post({ ...base, device_id: "abc" }), [400, "bad_device"]);
t("op 오류", await post({ ...base, inputs: [[0, "x", 0]] }), [400, "bad_inputs"]);
rateOk = false; t("rate limit", await post(base), [429, "rate_limited"]); rateOk = true;
const o = await handler(new Request("http://f/", { method: "OPTIONS" })); t("CORS preflight", [o.status, o.headers.get("access-control-allow-origin")], [204, "*"]);
const big = await handler(new Request("http://f/", { method: "POST", body: "x".repeat(400000) })); t("요청 크기", [big.status, "x"], [413, "x"]);
console.log("rpc saved calls:", rpcCalls.filter((c) => c[0] === "submit_score_best").length, "(정상 1건이어야 함)");
process.exit(fail ? 1 : 0);
