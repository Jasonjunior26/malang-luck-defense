// 랭킹용 build(무리별 유닛수·Lv, 최고 등급) 검증: node tools/test_build.mjs [판수=25]
// 1) 봇 한 판의 build 모양/범위  2) 서버 재생 결과 build == 클라 결과 build, 점수·라운드 동일(추적 코드가 시뮬을 바꾸지 않음)  3) cleanBuild 검증
import fs from "node:fs"; import vm from "node:vm"; import path from "node:path"; import { fileURLToPath } from "node:url";
import { replay, cleanBuild } from "../supabase/functions/submit-score/replay.js";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(root, "tools/test_replay.mjs"), "utf8");
const a = src.indexOf("function clientRun"), b = src.indexOf("let pass = 0");
const clientRun = new Function("fs", "vm", "path", "root", src.slice(a, b) + "; return clientRun;")(fs, vm, path, root);
const N = Number(process.argv[2] || 25);
let pass = 0, fail = 0;
const check = (n, c, x = "") => { (c ? pass++ : fail++); if (!c || process.env.V) console.log((c ? "PASS " : "FAIL ") + n + " " + x); };
let topSeen = new Set();
for (let i = 0; i < N; i++) {
  const g = clientRun(2000 + i, { mode: i % 3 === 2 ? "practice" : "daily", up: i % 2 ? 8 : 99 });
  const v = replay(g.seed, g.inputs), bd = g.r.build;
  const shapeOk = !!bd && cleanBuild(bd) !== null && bd.clans.length === 4;
  check(`run${i} build 모양/범위`, shapeOk, JSON.stringify(bd));
  const units = shapeOk ? bd.clans.reduce((s, c) => s + c.n, 0) : -1;
  check(`run${i} 유닛 합 <= 19칸x12`, units >= 0 && units <= 19 * 12, String(units));
  check(`run${i} 서버 재생과 일치(점수·라운드·build)`, v.ok && v.result.score === g.r.score && v.result.round === g.r.round && JSON.stringify(v.result.build) === JSON.stringify(bd), v.ok ? "" : v.error);
  if (shapeOk) topSeen.add(bd.top);
}
check("최고 등급이 판마다 다양(>=2종)", topSeen.size >= 2, [...topSeen].join(","));
check("cleanBuild: 정상", cleanBuild({ clans: [{ n: 1, lv: 2 }, { n: 0, lv: 0 }, { n: 3, lv: 4 }, { n: 5, lv: 6 }], top: 3 }) !== null);
check("cleanBuild: top 범위 밖 -> null", cleanBuild({ clans: Array(4).fill({ n: 1, lv: 1 }), top: 8 }) === null);
check("cleanBuild: clans 3개 -> null", cleanBuild({ clans: Array(3).fill({ n: 1, lv: 1 }), top: 1 }) === null);
check("cleanBuild: 비정수/음수 -> null", cleanBuild({ clans: [{ n: 1.5, lv: 1 }, ...Array(3).fill({ n: 1, lv: 1 })], top: 1 }) === null && cleanBuild({ clans: [{ n: -1, lv: 1 }, ...Array(3).fill({ n: 1, lv: 1 })], top: 1 }) === null);
check("cleanBuild: null/문자열 -> null", cleanBuild(null) === null && cleanBuild("x") === null && cleanBuild({ clans: [null, 1, 2, 3], top: 0 }) === null);
console.log(`\nbuild: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
