// 랭킹 제출 대기열 회귀 테스트: 보내기 전에 대기열에 저장 -> 확정 응답이면 삭제, 재시도 응답이면 유지, 전송 중 항목은 flushQueue 가 건너뜀.
// ui.js 발췌(qGet~flushQueue, submitScore)를 vm 에서 실행. 실행: node tools/test_queue.mjs
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ui = fs.readFileSync(path.join(root, "ui.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const cut = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error("slice " + a); return src.slice(i, j); };

const store = new Map(), sent = [];
let resp = () => ({ st: 200, d: { ok: true, saved: true, season_best: 100, season: { id: 2 } } }), gate = null;
const ctx = vm.createContext({
  console, JSON, Promise, Date, Math, Array, setTimeout, performance, window: { crypto: { randomUUID: () => "dev-x" } }, crypto: { randomUUID: () => "dev-x" },
  lsGet: (k, d = null) => (store.has(k) ? store.get(k) : d), lsSet: (k, v) => store.set(k, v),
  remote: () => true, myName: () => "나나", NAME_OK: "ok", GAME_VER: "8", deviceId: () => "dev",
  CONFIG: { MYHERO_RANKED: true }, S: { mine: null, seed: 1, inputs: [[1, 2]] },
  MyHero: { heroName: () => "영웅" },
  phaseNow: () => ({ season: { id: 2 } }), sbestGet: () => null, sbestSet() {}, rcDrop() {},
  ensureRegistered: async () => "ok", LAST: null,
  __api: async (action, body) => { sent.push(body.qid); if (gate) await gate; return resp(body); },
});
vm.runInContext("let FLUSHING = false; const QUEUE_MAX_ = 20;", ctx);
vm.runInContext(cut(ui, "const DEV_KEY", "const qGet").replace(/^const DEV_KEY.*$/m, 'const DEV_KEY = "malang-device", QUEUE_KEY = "malang-queue", QUEUE_MAX = 20;'), ctx);
vm.runInContext(cut(ui, "const qGet", "// 서버에 닉네임 등록") .replace(/const lsSet.*\n/, ""), ctx);
vm.runInContext(cut(ui, "async function postScore", "if (typeof window !== \"undefined\") { window.addEventListener(\"online\""), ctx);
vm.runInContext(cut(ui, "async function submitScore(P)", "// 게임오버 화면의 순위 변동"), ctx);
const run = (c) => vm.runInContext(c, ctx);
run("api = (a, b) => __api(a, b);"); // 발췌에 들어온 실제 api()를 가짜로 교체

const q = () => JSON.parse(store.get("malang-queue") || "[]");
const P = { score: 500, R: 30, win: false };

// 1) 전송 중에는 대기열에 있고, 성공(200)하면 지워진다
store.clear(); sent.length = 0;
let release; gate = new Promise((r) => (release = r));
const p1 = run("submitScore(" + JSON.stringify(P) + ")");
await new Promise((r) => setTimeout(r, 5));
ok(q().length === 1 && q()[0].claimedScore === 500, "보내는 동안 이미 대기열에 저장돼 있다(앱이 닫혀도 남음)");
// 2) 그 사이 flushQueue 가 돌아도 같은 판을 다시 보내지 않는다
await run("flushQueue()");
ok(sent.length === 1, "전송 중 항목은 flushQueue 가 건너뛴다(이중 전송 없음)");
release(); gate = null;
const r1 = await p1;
ok(r1.st === "ok" && q().length === 0, "확정 응답(200)을 받으면 대기열에서 지운다");

// 3) 서버 5xx/네트워크 오류 -> 대기열 유지 + queued
store.clear(); sent.length = 0; resp = () => ({ st: 500, d: {} });
const r2 = await run("submitScore(" + JSON.stringify(P) + ")");
ok(r2.st === "queued" && q().length === 1, "5xx 는 대기열에 남기고 queued 로 알린다");
resp = () => ({ st: 0, d: {} });
store.clear(); const r2b = await run("submitScore(" + JSON.stringify(P) + ")");
ok(r2b.st === "queued" && q().length === 1, "네트워크 실패도 대기열 유지");

// 4) 다음 접속의 flushQueue 가 이어서 보내고 성공하면 비운다
resp = () => ({ st: 200, d: { ok: true, saved: true } }); sent.length = 0;
await run("flushQueue()");
ok(sent.length === 1 && q().length === 0, "다음 flushQueue 가 남은 판을 보내고 대기열을 비운다");

// 5) 확정 거부(409 ver_mismatch 등)도 지운다(무한 재시도 방지)
store.clear(); resp = () => ({ st: 409, d: { ok: false, error: "ver_mismatch" } });
const r5 = await run("submitScore(" + JSON.stringify(P) + ")");
ok(r5.st === "drop" && q().length === 0, "거부 응답은 대기열에서 지운다");


// 6) 랭킹 등록 중 이동 확인(rankGuard): 끝났으면 바로 이동, 진행 중이면 확인(기다리기/그래도 나가기), 라벨 복원
{
  const el = { cno: { textContent: "게임 계속", onclick: null }, cok: { textContent: "홈으로", onclick: null } };
  let msg = null, went = 0;
  const g = vm.createContext({ $: (id) => el[id], uiConfirm: (m, ok) => { msg = m; el.cno.onclick = () => {}; el.cok.onclick = () => ok(); } });
  vm.runInContext(cut(ui, "let RANK_N = 0;", "async function finishRank(P)"), g);
  vm.runInContext("rankGuard(() => { globalThis.went = 1; })", g); ok(g.went === 1 && msg === null, "등록이 끝났으면 확인 없이 바로 이동");
  g.went = 0; vm.runInContext("RANK_N = 1; rankGuard(() => { globalThis.went = 1; })", g);
  ok(msg && /랭킹 등록 중/.test(msg) && g.went === 0 && el.cno.textContent === "기다리기" && el.cok.textContent === "그래도 나가기", "등록 중이면 이동 전에 확인(기다리기 / 그래도 나가기)");
  el.cno.onclick(); ok(g.went === 0 && el.cno.textContent === "게임 계속" && el.cok.textContent === "홈으로", "기다리기: 이동 안 함, 확인창 글자 원래대로");
  msg = null; vm.runInContext("rankGuard(() => { globalThis.went = 1; })", g); el.cok.onclick();
  ok(g.went === 1 && el.cok.textContent === "홈으로", "그래도 나가기: 이동, 글자 원래대로");
}

console.log(`PASS ${pass} FAIL ${fail}`);
process.exit(fail ? 1 : 0);
