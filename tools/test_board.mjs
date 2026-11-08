// 랭킹 보드 분리(랜덤/내 영웅) + 판 종료 화면 홈 버튼 회귀 테스트. ui.js 함수 발췌 실행 + 서버 파일 정적 점검.
// 실행: node tools/test_board.mjs
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = (f) => fs.readFileSync(path.join(root, f), "utf8");
const ui = rd("ui.js");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const slice = (a, b) => { const i = ui.indexOf(a), j = ui.indexOf(b, i); if (i < 0 || j < 0) throw new Error("slice " + a); return ui.slice(i, j); };

// ---- 클라이언트: 로컬 보드 분리 ----
let rows = [];
const ctx = vm.createContext({ console, Date, Math, JSON, CONFIG: { SUPABASE_URL: "https://x.supabase.co" }, LS_KEY: "k", lsGet: () => JSON.stringify(rows), kstDate: (t) => new Date((t ?? Date.now()) + 9 * 3600e3).toISOString().slice(0, 10) });
vm.runInContext(slice("function localRows()", "// ---- 랭킹 제출") + ";" + slice("const rankVariants", "// 후보를 시도한다"), ctx);
const T = (d) => new Date(d + "T12:00:00+09:00").toISOString();
rows = [
  { name: "a", score: 100, is_mine: false, played_at: T("2026-11-02") }, { name: "a", score: 900, is_mine: true, played_at: T("2026-11-02") },
  { name: "b", score: 500, played_at: T("2026-11-02") }, { name: "c", score: 700, is_mine: true, played_at: T("2026-11-03") },
];
const S = { start: "2026-11-01", end: "2026-11-30" };
const run = (c) => vm.runInContext(c, ctx);
ctx.S0 = S;
const rand = run("localBoard(S0)"), mine = run("localBoard(S0, 'mine')");
ok(rand.map((r) => r.name + r.score).join() === "b500,a100", "랜덤 보드는 랜덤 판만(구 기록 포함): " + rand.map((r) => r.name + r.score));
ok(mine.map((r) => r.name + r.score).join() === "a900,c700", "내 영웅 보드는 내 영웅 판만");
ok(rand[0].rank === 1 && mine[1].rank === 2, "보드별 순위");
ok(run("localBoard(S0, 'rand')").length === 2 && run("localBoard(null)").length === 0, "기본 보드 rand / 시즌 없음");

// ---- 클라이언트: 조회 주소 후보 ----
const u = (board, ranked, who) => run(`rankUrls(3, ${JSON.stringify(board)}, ${ranked}, 100, ${JSON.stringify(who || null)})`);
let c = u("mine", true);
ok(c.length === 3 && c[0].url.includes("is_mine=eq.true") && c[0].url.includes("hero_name") && c[0].bd, "내 영웅: 필터+hero_name 먼저");
ok(c[1].url.includes("is_mine=eq.true") && !c[1].url.includes("hero_name"), "hero_name 없는 서버 폴백");
ok(!c[2].bd && !c[2].url.includes("is_mine"), "구 서버 폴백(보드 구분 없음)");
c = u("rand", false);
ok(c.length === 2 && c[0].url.includes("is_mine=eq.false") && !c[0].url.includes("hero_name"), "MYHERO_RANKED=false 랜덤: hero_name 없이 is_mine=false");
ok(u("rand", true)[0].url.includes("rank=lte.100") && u("rand", true)[0].url.includes("order=rank.asc") && u("rand", true)[0].url.includes("&season=eq.3"), "시즌 탭 주소: 상위 100만");
ok(u("rand", true, "말 랑")[0].url.includes("name=eq.%EB%A7%90%20%EB%9E%91&limit=1") && !u("rand", true, "x")[0].url.includes("rank=lte"), "내 순위 한 건 조회 주소");
ok(!/leaderboard_daily|kstMidnightISO/.test(ui), "오늘 탭(leaderboard_daily 300행 조회) 제거");

// ---- UI 구조 ----
ok(!/practice|연습/.test(ui + rd("index.html") + rd("game.js") + rd("myhero.js")), "연습 모드 잔재 없음");
ok(/data-b="\$\{k\}"/.test(ui) && ui.includes('showRanks("season", true, S.mine ? "mine" : "rand")'), "보드 토글 + 게임오버에서 해당 보드로 열기");
ok(ui.includes(`async function showRanks(tab = "season", again = false, board = "rand"`), "기본 보드는 랜덤");
const go = slice("function uiGameOver(", "// ---------- 타이틀");
ok((go.match(/\$\{HOMEBTN\}/g) || []).length === 2 && go.includes('$("goHomeBtn").onclick = goHome'), "클리어/게임오버/프라이빗 모두 홈 버튼");
ok(ui.includes('id="rkHome"') && ui.includes('$("rkHome").onclick = goHome'), "결과 후 랭킹 화면에도 홈 버튼");
ok(/\$\("home"\)\.onclick = \(\) => uiConfirm\(/.test(ui), "게임 중 ☰ 메뉴 홈은 확인 대화 유지");

// ---- 서버 파일 ----
const mig = rd("supabase/migrations/009_board_split.sql"), idx = rd("supabase/functions/submit-score/index.ts");
ok(!fs.existsSync(path.join(root, "supabase/migrations/008_board_split.sql")), "008 번호는 예약(내 기록 탭)");
ok(/add column if not exists is_mine boolean not null default false/.test(mig), "scores.is_mine 컬럼(기본 false)");
ok(/partition by t\.season, t\.is_mine/.test(mig) && /distinct on \(s\.season, s\.is_mine, s\.device_id\)/.test(mig), "보드별 순위/이름별 1건");
ok(/leaderboard_season as[\s\S]*?hero_name, is_mine from/.test(mig) && /s\.hero_name, s\.is_mine/.test(mig), "공개 뷰에 is_mine 맨 끝 추가");
ok(/drop function if exists public\.submit_score_season\(/.test(mig) && /p_is_mine boolean default false/.test(mig) && /is_mine = excluded\.is_mine/.test(mig), "rpc p_is_mine 기본 false, 구 시그니처 제거");
ok(/\.\.\.\(mine \? \{ p_is_mine: true \} : \{\}\)/.test(idx), "submit-score: mine 일 때만 p_is_mine 전달(랜덤 판은 구 rpc 와도 호환)");
console.log(`pass ${pass} fail ${fail}`); process.exit(fail ? 1 : 0);
