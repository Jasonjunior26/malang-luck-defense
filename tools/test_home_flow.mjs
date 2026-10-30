// 게임 중 홈 확인 모달 흐름 회귀 테스트 (DOM 스텁 + ui.js 의 해당 함수만 발췌 실행).
// 점검: [게임 계속] -> 확인창 닫힘 + 일시정지 복원 + 타이틀로 안 감 / [홈 이동] -> 타이틀 ON, 모달·확인창 닫힘, 판 폐기(resultSent) / index.html 라벨 / 히어로 설명 길이.
// 실행: node tools/test_home_flow.mjs
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ui = fs.readFileSync(path.join(root, "ui.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };

const slice = (a, b) => { const i = ui.indexOf(a), j = ui.indexOf(b, i); if (i < 0 || j < 0) throw new Error("slice " + a); return ui.slice(i, j); };
const src = [
  slice("const $ = (id)", "const lsGet"),
  slice("let TITLE_ON = true", "// ---------- 로그"),
  slice("function goHome()", "function startRun("),
  `const _homeClick = ${ui.match(/\$\("home"\)\.onclick = (\(\) => uiConfirm\([^\n]*?goHome\));/)[1]};`,
].join("\n");
const mk = () => { const cls = new Set(); return { innerHTML: "", onclick: null, classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), has: (c) => cls.has(c) } }; };
const els = {}; const ctx = vm.createContext({ console, Date, Math, JSON, document: { getElementById: (id) => (els[id] ||= mk()) } });
ctx.window = ctx; ctx.sfx = () => {}; ctx.refreshTitle = () => {}; ctx.renderSeasonBox = () => {};
let cleared = 0; ctx.SeasonMod = { clear: () => cleared++ };
vm.runInContext("var S = null;\n" + src, ctx);
const run = (c) => vm.runInContext(c, ctx);
const reset = () => { run("S = { paused:false, over:false, modalQ:[1], resultSent:false }; TITLE_ON = false; MODAL_ON = false; CONFIRM_ON = false;"); els.confirm = mk(); els.modal = mk(); els.title = mk(); };

// 1. 게임 계속
reset(); run("_homeClick()");
ok(els.confirm.classList.has("on"), "확인창 열림"); ok(run("S.paused") === true, "확인창 중 일시정지");
els.cno.onclick();
ok(!els.confirm.classList.has("on"), "계속: 확인창 닫힘"); ok(run("S.paused") === false, "계속: 일시정지 해제");
ok(run("TITLE_ON") === false && run("S.resultSent") === false && cleared === 0, "계속: 게임 유지");

// 2. 이미 일시정지였던 판에서 계속 -> 일시정지 유지
reset(); run("S.paused = true"); run("_homeClick()"); els.cno.onclick();
ok(run("S.paused") === true, "계속: 원래 일시정지면 유지");

// 3. 홈 이동
reset(); run("_homeClick()"); els.cok.onclick();
ok(run("TITLE_ON") === true && els.title.classList.has("on"), "홈: 타이틀 ON");
ok(!els.confirm.classList.has("on") && run("CONFIRM_ON") === false, "홈: 확인창 닫힘");
ok(run("S.resultSent") === true && run("S.paused") === true && run("S.modalQ.length") === 0, "홈: 판 폐기(기록 안 함)·정지");
ok(cleared === 1, "홈: SeasonMod.clear 호출");

// 4. SeasonMod 가 없어도(로드 실패) 홈 이동은 예외 없이 동작
reset(); delete ctx.SeasonMod; run("_homeClick()"); els.cok.onclick(); ok(run("TITLE_ON") === true, "홈: SeasonMod 없이도 이동");

// 5. 라벨/문구, 히어로 설명
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
ok(/id="cno"[^>]*>게임 계속</.test(html) && /id="cok"[^>]*>홈 이동</.test(html), "버튼 라벨");
ok(ui.includes('uiConfirm("홈으로 나갈까요?\\n진행 중인 게임은 종료돼요."'), "모달 문구");
const dctx = vm.createContext({}); vm.runInContext(fs.readFileSync(path.join(root, "data.js"), "utf8") + "\n;this.H=HEROES;", dctx);
for (const h of dctx.H) { ok(h.rule.length <= 30, "설명 길이 " + h.id + " " + h.rule.length); ok(!/표 참조|합계|차감|Lv/.test(h.rule), "금지어 " + h.id); }
console.log(fail ? "FAIL" : "PASS", pass + " ok, " + fail + " fail");
process.exit(fail ? 1 : 0);
