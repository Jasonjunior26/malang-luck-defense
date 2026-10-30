// 전역 이름 충돌 점검: index.html 이 로드하는 스크립트의 최상위 선언(const/let/var/function/class) 이름과
// window.X / root.X / globalThis.X 대입 이름의 교집합, 그리고 파일 간 최상위 선언 중복을 찾는다.
// (최상위 const/let 은 window.X 를 가려 `X.method()` 가 엉뚱한 값을 호출한다 -> TypeError. 2026-10-30 시작 멈춤 사고)
// 실행: node tools/check_globals.mjs   (충돌이 있으면 종료코드 1)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const files = [...html.matchAll(/<script[^>]*\ssrc="([^"?]+)[^"]*"/g)].map((m) => m[1]).filter((f) => !/^https?:/.test(f));
const decl = {}, assign = {}; // 이름 -> [파일:줄]
const add = (o, k, v) => (o[k] ||= []).push(v);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/^\s*\/\/.*$/gm, "");
for (const f of files) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) continue;
  strip(fs.readFileSync(p, "utf8")).split("\n").forEach((line, i) => {
    let m;
    if ((m = line.match(/^(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/))) add(decl, m[1], `${f}:${i + 1}`);
    else if ((m = line.match(/^(?:const|let|var)\s*[\[{]([^\]}]*)[\]}]\s*=/))) m[1].split(",").forEach((n) => { n = n.split(":").pop().trim(); if (/^[A-Za-z_$][\w$]*$/.test(n)) add(decl, n, `${f}:${i + 1}`); });
    for (const a of line.matchAll(/\b(?:window|root|globalThis|self)\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) add(assign, a[1], `${f}:${i + 1}`);
  });
}
let bad = 0;
console.log(`스크립트: ${files.join(", ")}`);
for (const n of Object.keys(assign).filter((n) => decl[n])) { bad++; console.log(`[충돌] window.${n} 대입 ${assign[n].join(",")}  <->  최상위 선언 ${decl[n].join(",")}  (bare ${n} 는 선언값을 가리킴)`); }
for (const [n, w] of Object.entries(decl).filter(([, w]) => new Set(w.map((x) => x.split(":")[0])).size > 1 && w.length > 1)) { bad++; console.log(`[중복] 최상위 ${n} 가 여러 파일에 선언: ${w.join(", ")}`); }
console.log(bad ? `FAIL ${bad}건` : "OK 충돌 없음");
process.exit(bad ? 1 : 0);
