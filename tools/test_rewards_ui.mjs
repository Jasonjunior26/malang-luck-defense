// 주간 랭킹 보상 클라이언트 점검(DOM 스텁): MyHero.grantReward(이중 지급 방지·rw 보존·손상값) + rewards.js(팝업 구성·받기 연타·ack 실패·서버 미지원·?rwdemo).
// 실행: node tools/test_rewards_ui.mjs
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const KEY = "malang-myhero2";

// 새 페이지 로드 흉내. st = localStorage 대신 쓰는 객체(재사용하면 같은 기기), apiFn(action, body) -> {st, d}
function boot(st, apiFn, search = "") {
  const c = vm.createContext({ console, Date, Math, JSON, Number, Set, Map, Array, String, RegExp, Object, URLSearchParams, Promise });
  c.window = c; c.location = { search };
  const box = { html: "", n: 0 }, els = {}, calls = [], listeners = {};
  c.lsGet = (k, d = null) => (k in st ? st[k] : d); c.lsSet = (k, v) => { st[k] = String(v); };
  c.esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[m]);
  c.nf = (n) => String(n); c.sfx = () => {}; c.NAME_ERR_MSG = {}; c.BTNR = "";
  c.modal = (h) => { box.html = h; box.n++; for (const k in els) delete els[k]; };
  c.closeModal = () => { box.html = ""; };
  c.$ = (id) => (els[id] ||= { innerHTML: "", textContent: "", value: "", onclick: null, disabled: false, focus() {} });
  c.document = { querySelectorAll: () => [], activeElement: null, addEventListener: (t, f) => { listeners[t] = f; }, removeEventListener: (t) => { delete listeners[t]; } };
  c.CONFIG = { SUPABASE_URL: "x", SUPABASE_ANON_KEY: "y", REWARDS_ENABLED: true };
  c.remote = () => true; c.myName = () => "말랑이"; c.NAME_OK = "malang-name-ok"; c.TITLE_ON = true;
  c.phaseNow = () => ({ season: { id: 3 } }); c.seasonById = (id) => ({ id, name: `시즌 ${id}`, start: "2026-11-08", end: "2026-11-14" }); c.md = (d) => d.slice(5).replace("-", "/");
  c.api = async (a, b) => { calls.push([a, b]); return apiFn ? apiFn(a, b) : { st: 404, d: {} }; };
  vm.runInContext(read("data.js") + "\n" + read("myhero.js") + "\n" + read("rewards.js"), c);
  const api = { c, box, els, calls, MH: c.MyHero, R: c.Rewards, key: (e) => listeners.keydown && listeners.keydown(e) };
  api.save = () => JSON.parse(st[KEY]);
  return api;
}
const tops = (k, names) => names.map((n, i) => ({ rank: i + 1, name: n, total: [400, 250, 210][i] }));
const resp = (over = {}) => ({ ok: true, cur: 3, last: { season: 2, leagues: { luck: { n: 34, k: 11, top: tops(11, ["말랑이", "구름빵", "하늘별"]) }, mine: { n: 12, k: 10, top: [{ rank: 1, name: "고양이왕", hero: "냥냥이", total: 400 }] } } }, pending: [{ season: 2, league: "luck", rank: 1, base: 200, bonus: 200, total: 400 }, { season: 2, league: "mine", rank: 3, base: 160, bonus: 50, total: 210 }], tbl: { top: 200, last: 10, b1: 100, b2: 70, b3: 50, extra1: 100, ratio: 30 }, ...over });
const tick = () => new Promise((r) => setTimeout(r, 5));

// ---- 1. MyHero.grantReward / 저장 호환 ----
{
  const st = {}; const P = boot(st);
  ok(P.MH.coins() === 0 && JSON.stringify(P.MH.rewarded()) === "[]", "빈 저장: rw []");
  const r = P.MH.grantReward([{ season: 2, total: 460 }]);
  ok(r.granted === 460 && P.MH.coins() === 460 && P.save().rw.join() === "2", "첫 지급: 코인 가산 + rw 기록 " + JSON.stringify(r));
  const r2 = P.MH.grantReward([{ season: 2, total: 460 }]);
  ok(r2.granted === 0 && P.MH.coins() === 460 && r2.already.join() === "2", "같은 시즌 두 번째는 0 지급");
  const r3 = P.MH.grantReward([{ season: 2, total: 460 }, { season: 3, total: 100 }]);
  ok(r3.granted === 100 && P.MH.coins() === 560 && P.save().rw.join() === "2,3", "이미 있는 시즌은 0, 새 시즌만 지급");
  const b = P.MH.grantReward([4, 5], 300); ok(b.granted === 300 && P.MH.rewarded().join() === "2,3,4,5", "묶음 형식(시즌 목록+금액)");
  const b2 = P.MH.grantReward([5, 6], 300); ok(b2.granted === 0 && P.MH.rewarded().join() === "2,3,4,5" && P.MH.coins() === 860, "묶음에 이미 있는 시즌이 있으면 전체 0, 기록 변경 없음");
  // rw 보존: 다른 저장(영웅 등록·판 정산·산 코인)을 거쳐도 유지
  P.MH.settle({ mode: "daily", mine: { design: "cat", items: {}, equip: {} }, seed: 9, topGrade: 0, hero: { id: "cat" } }, { R: 40, kills: 1600 });
  const d = P.save(); d.heroes = [{ design: "cat", name: "냥이", own: {}, equip: {} }]; st[KEY] = JSON.stringify(d);
  ok(P.MH.rewarded().join() === "2,3,4,5" && P.MH.list().length === 1, "settle/저장을 거쳐도 rw 보존");
  const P2 = boot(st); ok(P2.MH.rewarded().join() === "2,3,4,5" && P2.MH.coins() === P.MH.coins(), "새 페이지 로드 후에도 유지");
  // 손상값/조작
  const bad = {}; bad[KEY] = JSON.stringify({ v: 2, mig: 2, rs: 1, coins: 5, rw: [3, 3, "x", -1, 0, 1.5, null, 2, 9e9, {}], heroes: [] });
  ok(boot(bad).MH.rewarded().join() === "2,3", "손상 rw 정리(정수·양수·중복 제거·정렬): " + boot(bad).MH.rewarded().join());
  for (const v of ["abc", 7, { a: 1 }, null]) { const s = {}; s[KEY] = JSON.stringify({ v: 2, mig: 2, rs: 1, coins: 5, rw: v, heroes: [] }); ok(boot(s).MH.rewarded().length === 0, "rw 가 배열이 아니면 []: " + JSON.stringify(v)); }
  const old = {}; old[KEY] = JSON.stringify({ v: 2, mig: 2, rs: 1, coins: 77, heroes: [] }); const P3 = boot(old); ok(P3.MH.rewarded().length === 0 && P3.MH.coins() === 77, "rw 없는 옛 저장값 호환");
  // 금액 방어
  const z = boot({}); ok(z.MH.grantReward([{ season: 1, total: -50 }]).granted === 0 && z.MH.coins() === 0, "음수 0 처리");
  ok(z.MH.grantReward([{ season: 2, total: 12.7 }]).granted === 0, "소수 0 처리");
  ok(z.MH.grantReward([{ season: 3, total: "99" }]).granted === 0 && z.MH.grantReward([{ season: 4, total: 1e12 }]).granted === 100000, "문자열 0 / 시즌당 상한 100000");
  ok(z.MH.grantReward([{ season: "a", total: 5 }, { season: -1, total: 5 }, null]).granted === 0 && z.MH.rewarded().join() === "1,2,3,4", "잘못된 시즌 id 무시");
  const cap = {}; cap[KEY] = JSON.stringify({ v: 2, mig: 2, rs: 1, coins: 99999990, rw: [], heroes: [] }); const Pc = boot(cap); ok(Pc.MH.grantReward([{ season: 2, total: 400 }]).granted === 9 && Pc.MH.coins() === 99999999, "코인 총량 상한");
  ok(z.MH.grantReward(null).granted === 0 && z.MH.grantReward([]).granted === 0, "빈 입력");
}

// ---- 2. 순수 로직: 보상표/정리 ----
{
  const T = boot({}).R._t;
  ok([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((r) => T.baseOf(r, 10)).join() === "200,180,160,140,120,100,80,60,40,10", "K=10 기본표");
  ok(T.baseOf(1, 34) === 200 && T.baseOf(34, 34) === 10 && T.totalOf(1, 10, T.TBL) === 400 && T.totalOf(2, 10, T.TBL) === 250 && T.totalOf(3, 10, T.TBL) === 210, "1위 400 / 2위 250 / 3위 210");
  ok(T.clean({ ok: false }) === null && T.clean(null) === null && T.clean("x") === null, "ok 아닌 응답은 null");
  const m = T.clean(resp({ pending: [{ season: 2, league: "luck", rank: 1, total: 400 }, { season: 2, league: "luck", rank: 1, total: 400 }, { season: "z", league: "luck", rank: 1, total: 4 }, { season: 2, league: "x", rank: 1, total: 4 }, { season: 2, league: "mine", rank: 0, total: 4 }, { season: 2, league: "mine", rank: 3, total: -5 }] }));
  ok(m.pending.length === 1, "pending 중복·잘못된 항목 버림 " + m.pending.length);
  ok(T.clean(resp({ last: null })).last === null && T.clean(resp({ tbl: { ratio: 0, top: "a" } })).tbl.ratio === 30, "last null / tbl 방어");
}

// ---- 2c. 받은 뒤 화면(0 지급 / 일부 / 전액) ----
{
  const T = boot({}).R._t, m = T.clean(resp()), c = m.pending;
  let h = T.html(m, { claim: c, done: true, got: 0 });
  ok(/이미 받았어요/.test(h) && !/class="rwamt"/.test(h) && !/class="rows"><li><span class="nm">운빨 리그 <b>1위/.test(h), "0 지급: 큰 금액·줄별 내역 숨김");
  h = T.html(m, { claim: c, done: true, got: 610 });
  ok(/받았어요!/.test(h) && /class="rwamt"/.test(h) && /운빨 리그 <b>1위/.test(h), "전액 지급: 금액·내역 표시");
  h = T.html(m, { claim: c, done: true, got: 400 });
  ok(/class="rwamt"/.test(h) && !/class="rows"><li><span class="nm">운빨 리그 <b>1위/.test(h.split("rwlg")[0]), "일부 지급: 합계만, 줄별 내역은 숨겨 모순 없음");
  h = T.html(m, { claim: c, err: "오류" });
  ok(/<p class="rwhint" role="alert">오류/.test(h), "오류 안내 유지");
  ok(!/→/.test(T.html(m, { claim: c })) && /리그별로 따로 받아요<\/p>/.test(h) && !/순위가 높을수록/.test(h), "안내 정리·화살표 없음");
}

// ---- 2b. 보상표 숫자 정확성 ----
{
  const T = boot({}).R._t, mk = (kl, km) => T.clean(resp({ last: { season: 2, leagues: { luck: { n: 3, k: kl, top: [] }, mine: { n: 3, k: km, top: [] } } }, pending: [] }));
  for (const K of [10, 15, 34, 100]) {
    const m = mk(K, K), q = T.tableRows(m);
    const base = (r) => Math.ceil((200 * (K - 1) - 190 * (r - 1)) / (10 * (K - 1))) * 10;
    ok(q.cols.length === 1 && q.rows[0].v[0] === 400 && q.rows[1].v[0] === base(2) + 70 && q.rows[2].v[0] === base(3) + 50, `K=${K} 같은 k 는 한 열, 1위 400, 2·3위 ${q.rows[1].v[0]}/${q.rows[2].v[0]}`);
    ok(T.baseOf(4, K) === base(4) && T.baseOf(K, K) === 10, `K=${K} 4위 기본 ${base(4)}, 마지막 10`);
    ok(T.html(m, { claim: [] }).includes(`${base(4)}</span> ~ 10</span>`), `K=${K} 범위 행 표시`);
  }
  const d = T.tableRows(mk(10, 100));
  ok(d.cols.length === 2 && d.rows[1].v[0] === 250 && d.rows[1].v[1] === T.totalOf(2, 100, T.TBL) && d.rows[1].v[1] !== 250, "k 다른 두 리그: 열마다 자기 k");
  const custom = T.clean(resp({ tbl: { top: 200, last: 10, b1: 50, b2: 30, b3: 20, extra1: 10, ratio: 25 }, last: { season: 2, leagues: { luck: { n: 3, k: 10, top: [] } } }, pending: [] }));
  const qc = T.tableRows(custom);
  ok(qc.rows[0].v[0] === 200 + 60 && qc.rows[1].v[0] === 180 + 30 && /상위 25%/.test(T.html(custom, { claim: [] })), "서버 tbl 상수(b1·b2·extra1·ratio) 사용");
  ok(T.tableRows(T.clean(resp({ last: null, pending: [] }))).cols.length === 1, "리그 정보 없으면 k=10 한 열");
}

// ---- 3. 팝업 구성 ----
const btns = (h) => (h.match(/<button/g) || []).length;
{
  const P = boot({}), T = P.R._t, m = T.clean(resp());
  let h = T.html(m, { claim: m.pending });
  ok(btns(h) === 1 && /id="rwOk"[^>]*>받기</.test(h), "보상 있음: 단추 1개(받기)");
  ok(/지난 주 랭킹 보상/.test(h) && /시즌 2/.test(h), "제목·시즌 표기");
  ok(/내 보상/.test(h) && /<i class="coin">C<\/i> 610</.test(h) && /운빨 리그 <b>1위/.test(h) && /내 영웅 리그 <b>3위/.test(h) && /<span class="sc"><span class="rwn"><i class="coin">C<\/i> 400</.test(h) && /<\/i> 210</.test(h), "수령액 합계 610·리그별 순위·내역");
  ok(/말랑이/.test(h) && /고양이왕/.test(h) && /냥냥이/.test(h) && (h.match(/class="rwlg"/g) || []).length === 2, "두 리그 1~3위 + 영웅명");
  ok(/class="me"/.test(h), "내 닉네임 줄 강조");
  ok(/보상표/.test(h) && /<table class="rwt">/.test(h) && !/class="rwtbl"/.test(h) && /다음 주엔 내가 1위/.test(h) && /리그별로 따로/.test(h), "보상표는 표 + 안내 + 도전 문구");
  {
    const q = T.tableRows(m), mk = (x) => m.last.leagues[x].k;
    ok(q.cols.length === 2 && q.cols[0].k === mk("luck") && q.cols[1].k === mk("mine"), "k 가 다르면 리그별 열 " + JSON.stringify(q.cols));
    ok(q.rows.length === 4 && q.rows[0].v.every((v) => v === 400), "1위는 두 열 모두 400");
    ok(q.rows.every((r, i) => i === 3 || q.cols.every((c, j) => r.v[j] === T.totalOf(i + 1, c.k, T.TBL))), "2·3위는 각 열 k 의 totalOf");
    ok(/<th scope="col">운빨/.test(h) && /<th scope="col">내 영웅/.test(h) && /4위~/.test(h) && /~ 10/.test(h), "열 머리·범위 행(~ 최소)");
  }
  ok(!/style=/.test(h) && !/🪙/.test(h) && !/#[0-9a-fA-F]{3,6}\b/.test(h.replace(/&#\d+;/g, "")), "인라인 스타일·🪙·hex 색 없음");
  ok(/role="dialog"/.test(h) && /aria-modal="true"/.test(h) && /aria-labelledby="rwT"/.test(h), "접근성 속성");
  h = T.html(m, { claim: m.pending, done: true });
  ok(btns(h) === 1 && /id="rwOk"[^>]*>확인</.test(h) && /받았어요!/.test(h), "받은 뒤: 확인 1개");
  h = T.html(T.clean(resp({ pending: [] })), { claim: [] });
  ok(btns(h) === 1 && />확인</.test(h) && /이번엔 보상이 없어요/.test(h) && /<span class="rwn">운빨 리그 <b>11위<\/b><\/span> · <span class="rwn">내 영웅 리그 <b>10위<\/b><\/span>까지 받아요/.test(h) && !/\(/.test(h.replace(/<[^>]*>/g,"")) && !/TOP 3/.test(h) && /1~3위/.test(h), "보상 없음: 응원·안내·확인 + 1~3위");
  const one = T.clean(resp({ last: { season: 2, leagues: { luck: { n: 3, k: 10, top: [{ rank: 1, name: "아주아주길고긴닉네임입니다람쥐<b>", hero: "", total: 400 }] } } }, pending: [] }));
  h = T.html(one, { claim: [] });
  ok((h.match(/class="rwlg"/g) || []).length === 1 && /&lt;b&gt;/.test(h) && !/<b>입니다|닉네임입니다람쥐<b>/.test(h) && /class="nm"/.test(h), "한 리그만·긴 이름 이스케이프(말줄임은 .rows .nm CSS)");
  h = T.html(T.clean(resp({ last: null, pending: [{ season: 1, league: "luck", rank: 2, total: 250 }, { season: 2, league: "mine", rank: 1, total: 400 }] })), { claim: [{ season: 1, league: "luck", rank: 2, total: 250 }, { season: 2, league: "mine", rank: 1, total: 400 }] });
  ok(/시즌 1 · /.test(h) && /650/.test(h) && !/class="rwlg"/.test(h), "여러 시즌 pending: 시즌 접두 + 합계, last 없으면 1~3위 생략");
  ok(/rwchip/.test(P.R.chip()) && /1위/.test(P.R.chip()) && /400/.test(P.R.chip()) && /상위 30%까지/.test(P.R.chip()) && !/🪙/.test(P.R.chip()), "랭킹 안내 칩");
}

// ---- 4. 흐름: 받기 연타 1회·ack ----
{
  const st = { "malang-name-ok": "1" }; let ackBody = null;
  const P = boot(st, (a, b) => (a === "rewards" ? { st: 200, d: resp() } : (ackBody = b, { st: 200, d: { ok: true, acked: 2 } })));
  const why = await P.R.boot();
  ok(why === "shown" && /id="rwOk"/.test(P.box.html) && P.calls.length === 1 && P.calls[0][0] === "rewards", "홈 진입: rewards 1회 호출 후 팝업 " + why);
  ok(P.MH.coins() === 0, "받기 전 코인 그대로");
  const b = P.els.rwOk; b.onclick(); b.onclick(); b.onclick();
  ok(P.MH.coins() === 610 && P.save().rw.join() === "2", "받기 연타해도 1회 지급(610)");
  await tick();
  ok(P.calls.filter((x) => x[0] === "rewardAck").length === 1 && ackBody.seasons.join() === "2", "ack 1회·시즌 [2]");
  ok(/받았어요!/.test(P.box.html) && />확인</.test(P.box.html), "받은 뒤 화면 전환");
  P.els.rwOk.onclick(); ok(/받았어요!/.test(P.box.html), "받은 직후 탭은 결과 화면을 건너뛰지 않음(800ms 보호)");
  const t0 = Date.now(); P.c.Date = { now: () => t0 + 1000 }; P.els.rwOk.onclick(); ok(P.box.html === "", "확인으로 닫힘");
  ok(st["malang-rw-seen"] === "2" && st["malang-rw-call"] === "3", "본 시즌·처리 완료 시즌 기록");
  const P2 = boot(st, (a) => ({ st: 200, d: resp({ pending: [] }) })); ok((await P2.R.boot()) === "done" && P2.calls.length === 0, "같은 시즌 재진입: 서버 호출 없음");
}
{ // ack 실패: 재지급 없음, 다음 진입에서 ack 만 재시도
  const st = { "malang-name-ok": "1" }; let ackOk = false;
  const f = (a) => (a === "rewards" ? { st: 200, d: resp() } : { st: ackOk ? 200 : 500, d: ackOk ? { ok: true } : {} });
  const P = boot(st, f); await P.R.boot(); P.els.rwOk.onclick(); await tick(); P.c.Date = { now: () => Date.now() + 5000 }; P.els.rwOk.onclick();
  ok(P.MH.coins() === 610 && !st["malang-rw-call"], "ack 실패여도 코인은 지급됨·처리 완료 표시는 안 함");
  ackOk = true;
  const P2 = boot(st, f); const why = await P2.R.boot(); await tick();
  ok(P2.MH.coins() === 610 && why !== "shown" && P2.calls.filter((x) => x[0] === "rewardAck").length === 1 && P2.box.html === "", "재진입: 재지급 없음·팝업 없음·ack 만 재시도 (" + why + ")");
}
{ // ESC: 받지 않고 닫기 -> 다음에 다시 뜸. Tab 은 팝업에 가둠
  const st = { "malang-name-ok": "1" };
  const f = (a) => ({ st: 200, d: a === "rewards" ? resp() : { ok: true } });
  const P = boot(st, f); await P.R.boot();
  let prevented = 0; P.key({ key: "Tab", preventDefault: () => prevented++ }); ok(prevented === 1, "Tab 포커스 이동 막음");
  P.key({ key: "Escape", preventDefault() {} }); ok(P.box.html === "" && P.MH.coins() === 0, "ESC: 코인 지급 없이 닫힘");
  const P2 = boot(st, f); ok((await P2.R.boot()) === "shown", "받지 않았으면 다음 진입에 다시 뜸");
}
{ // 보상 없음: 처음 1회만 팝업, 본 뒤엔 안 뜸
  const st = { "malang-name-ok": "1" }; const f = (a) => ({ st: 200, d: resp({ pending: [] }) });
  const P = boot(st, f); ok((await P.R.boot()) === "shown" && />확인</.test(P.box.html) && btns(P.box.html) === 1, "보상 없음 팝업(확인)");
  P.els.rwOk.onclick(); ok(P.MH.coins() === 0 && st["malang-rw-seen"] === "2", "코인 변화 없음·본 시즌 기록");
  const st2 = { ...st }; delete st2["malang-rw-call"]; const P2 = boot(st2, f); ok((await P2.R.boot()) === "nothing" && P2.box.html === "", "이미 본 시즌·pending 없음 -> 안 뜸");
}
{ // 이미 지급한 시즌이 서버 pending 에 남음(ack 이전 상태): 재지급 없이 ack 만
  const st = { "malang-name-ok": "1", [KEY]: JSON.stringify({ v: 2, mig: 2, rs: 1, coins: 50, rw: [2], heroes: [] }), "malang-rw-seen": "2" };
  const P = boot(st, (a) => ({ st: 200, d: resp() })); const why = await P.R.boot(); await tick();
  ok(P.MH.coins() === 50 && P.box.html === "" && P.calls.some((x) => x[0] === "rewardAck"), "rw 에 있는 시즌은 팝업·지급 없이 ack (" + why + ")");
}

// ---- 5. 서버 미지원·조건 ----
{
  for (const [nm, r] of [["404", { st: 404, d: {} }], ["bad_action", { st: 400, d: { error: "bad_action" } }], ["오프라인", { st: 0, d: {} }], ["500", { st: 500, d: {} }], ["ok 아님", { st: 200, d: { ok: false } }], ["쓰레기", { st: 200, d: "x" }]]) {
    const P = boot({ "malang-name-ok": "1" }, () => r); const why = await P.R.boot();
    ok(why === "unsupported" && P.box.html === "" && P.MH.coins() === 0 && P.box.n === 0, "미지원/실패 무시: " + nm);
  }
  const t = boot({ "malang-name-ok": "1" }, () => { throw new Error("boom"); }); ok((await t.R.boot()) === "unsupported", "api 예외도 무시");
  const P1 = boot({}, () => ({ st: 200, d: resp() })); ok((await P1.R.boot()) === "nonick" && P1.calls.length === 0, "닉네임 미등록: 호출 안 함");
  const P2 = boot({ "malang-name-ok": "1" }, () => ({ st: 200, d: resp() })); P2.c.CONFIG.REWARDS_ENABLED = false; ok((await P2.R.boot()) === "off" && P2.calls.length === 0, "REWARDS_ENABLED=false: 호출 안 함");
  const P3 = boot({ "malang-name-ok": "1" }, () => ({ st: 200, d: resp() })); P3.c.TITLE_ON = false; ok((await P3.R.boot()) === "ingame" && P3.box.n === 0, "판 진행 중이면 팝업 안 띄움(다음 홈 진입)");
  const P4 = boot({ "malang-name-ok": "1" }, () => ({ st: 200, d: resp({ cur: 2, pending: [], last: null }) })); P4.c.phaseNow = () => ({ season: { id: 2 } }); ok((await P4.R.boot()) === "nothing", "직전 시즌 없음(last null)·pending 없음 -> 아무것도 안 함");
}

// ---- 6. ?rwdemo ----
for (const v of ["1", "2", "3"]) {
  const st = { "malang-name-ok": "1" }; const P = boot(st, () => { throw new Error("서버 호출 금지"); }, "?rwdemo=" + v);
  const why = await P.R.boot();
  ok(why === "demo" && /id="rwOk"/.test(P.box.html) && P.calls.length === 0, "rwdemo=" + v + ": 팝업만, 서버 호출 없음");
  if (P.els.rwOk) { P.els.rwOk.onclick(); P.els.rwOk.onclick && P.els.rwOk.onclick(); }
  if (P.els.rwOk && v !== "2") ok(/받았어요!/.test(P.box.html) && /class="rwamt"/.test(P.box.html), "rwdemo=" + v + ": 데모도 받았어요! 성공 화면(합계 표시)");
  ok(P.MH.coins() === 0 && !(KEY in st) && !("malang-rw-seen" in st) && !("malang-rw-call" in st), "rwdemo=" + v + ": 코인·저장·기록 변화 없음");
}
{ const P = boot({}, null, "?rwdemo=1"); await P.R.boot(); const n = P.box.n; P.els.rwOk.onclick(); P.els.rwOk.onclick(); P.box.html = ""; ok((await P.R.boot()) === "busy", "데모는 페이지당 1회"); }

// ---- 7. ui.js 큐/강제 정리 연동(통합 결함 수정) ----
function withUi(P) { // ui.js 의 modal/queueModal/closeModal/dropRwModals 흉내
  const c = P.c, om = c.modal;
  c.MODAL_ON = false; c.MODAL_Q = [];
  c.queueModal = (f) => { if (c.MODAL_ON) c.MODAL_Q.push(f); else f(); };
  c.modal = (h) => { c.MODAL_ON = true; om(h); };
  c.closeModal = () => { P.box.html = ""; c.MODAL_ON = false; const nx = c.MODAL_Q.shift(); if (nx) nx(); };
  c.dropRwModals = () => { c.MODAL_Q = c.MODAL_Q.filter((f) => !f.rw); };
  c.goHome = () => { c.MODAL_Q = []; c.MODAL_ON = false; P.box.html = ""; c.Rewards.reset(); c.TITLE_ON = true; }; // 원래 ui.js goHome 의 강제 정리 + Rewards.reset
  return P;
}
const rf = (over) => (a) => ({ st: 200, d: a === "rewards" ? resp(over) : { ok: true } });
{ // A: 영웅 선택창이 열린 채 응답 도착 -> 시작(myhero 순서: dropRwModals, closeModal, startRun)
  const st = { "malang-name-ok": "1" }; const P = withUi(boot(st, rf()));
  P.c.modal("<div>영웅 선택</div>"); // MODAL_ON
  ok((await P.R.boot()) === "shown" && P.c.MODAL_Q.length === 1 && P.c.MODAL_Q[0].rw === true, "A: 다른 모달이 열려 있으면 보상 팝업은 큐에 표식(rw)과 함께 대기");
  P.c.dropRwModals(); P.c.closeModal(); P.c.TITLE_ON = false;
  ok(P.box.html === "" && P.c.MODAL_Q.length === 0, "A: 시작 직전 큐의 보상 팝업 제거 -> 판 위에 안 뜸");
  P.c.goHome(); P.calls.length = 0;
  ok((await P.R.boot()) === "shown" && /id="rwOk"/.test(P.box.html), "A: 홈으로 돌아오면 받지 않은 보상이 다시 뜸");
}
{ // A2: 큐에서 꺼내졌는데 이미 판이 시작됨(TITLE_ON false) -> 열지 않음, showing 누수 없음
  const st = { "malang-name-ok": "1" }; const P = withUi(boot(st, rf()));
  P.c.modal("<div>x</div>"); await P.R.boot(); P.c.TITLE_ON = false; P.c.closeModal();
  ok(P.box.html === "" && P.box.n === 1, "A2: 판 중에 꺼내진 보상 팝업은 열리지 않음");
  P.c.TITLE_ON = true; P.c.MODAL_ON = false; ok((await P.R.boot()) === "shown", "A2: 다음 홈 진입에서 정상 표시(누수 없음)");
}
{ // B: 앱 시작 직후 — 응답 대기 중 사용자가 모달을 연 경우도 같은 경로. 판 중 홈 버튼: 팝업 열린 채 강제 정리 -> 상태 복구
  const st = { "malang-name-ok": "1" }; const P = withUi(boot(st, rf()));
  await P.R.boot(); ok(P.key({ key: "Tab", preventDefault() {} }) === undefined && P.c.MODAL_ON, "B: 팝업 열림");
  P.c.goHome(); // reset 포함
  let esc = 0; P.key({ key: "Escape", preventDefault: () => esc++ }); ok(esc === 0, "B: goHome 뒤 ESC 리스너 제거");
  ok((await P.R.boot()) === "shown", "B: goHome 뒤 보상 팝업 다시 가능");
}
{ // C: reset 이 없어도(누수) DOM 상태로 자가 복구
  const st = { "malang-name-ok": "1" }; const P = withUi(boot(st, rf()));
  await P.R.boot(); P.c.MODAL_ON = false; P.box.html = ""; // 누가 모달을 강제로 껐다
  ok((await P.R.boot()) === "shown", "C: showing 누수 자가 복구");
}
{ // D: 저장 실패 -> 지급·ack 없음, 오류 안내, 재시도 가능
  const st = { "malang-name-ok": "1" }; const P = withUi(boot(st, rf()));
  await P.R.boot(); const good = P.c.lsSet; P.c.lsSet = () => {}; // 저장 불가
  P.els.rwOk.onclick(); await tick();
  ok(P.MH.coins() === 0 && !P.calls.some((x) => x[0] === "rewardAck") && /role="alert"/.test(P.box.html) && /id="rwOk"/.test(P.box.html) && !/받았어요!/.test(P.box.html), "D: 저장 실패: 코인 0·ack 없음·오류 안내·받기 다시 가능");
  P.c.lsSet = good; P.els.rwOk.onclick(); await tick();
  ok(P.MH.coins() === 610 && P.calls.filter((x) => x[0] === "rewardAck").length === 1 && /받았어요!/.test(P.box.html), "D: 복구 후 재시도 성공");
}
{ // E: 다른 탭이 먼저 받음 -> 실제 지급액 0 표시
  const st = { "malang-name-ok": "1" }; const P = withUi(boot(st, rf()));
  await P.R.boot(); P.MH.grantReward([{ season: 2, total: 610 }]); P.els.rwOk.onclick(); await tick();
  ok(P.MH.coins() === 610 && /이미 받았어요/.test(P.box.html) && !/받았어요!/.test(P.box.html), "E: 이미 받은 보상 = 안내(실제 지급 0)");
  const P2 = withUi(boot({ "malang-name-ok": "1" }, rf())); await P2.R.boot(); P2.els.rwOk.onclick();
  ok(/받았어요!/.test(P2.box.html) && />\s*<i class="coin">C<\/i>\s*610</.test(P2.box.html), "E: 정상 수령은 실제 지급액 610 표시");
}
{ // F: ack 20개씩
  const pend = []; for (let s = 2; s <= 26; s++) pend.push({ season: s, league: "luck", rank: 1, total: 100 });
  const bodies = []; const P = withUi(boot({ "malang-name-ok": "1" }, (a, b) => { if (a === "rewardAck") { bodies.push(b.seasons.length); return { st: 200, d: { ok: true } }; } return { st: 200, d: resp({ pending: pend, cur: 27 }) }; }));
  P.c.phaseNow = () => ({ season: { id: 27 } }); await P.R.boot(); P.els.rwOk.onclick(); await tick();
  ok(bodies.join() === "20,5" && P.MH.coins() === 2500, "F: ack 20+5 로 분할 " + bodies.join() + " coins " + P.MH.coins());
}
{ // G: 유예(last:null·pending:[]·cur>=3) 응답은 호출 완료로 치지 않음, 5분 간격으로 재시도
  const st = { "malang-name-ok": "1" }; let phase = 0; const f = (a) => ({ st: 200, d: a === "rewards" ? (phase ? resp() : resp({ last: null, pending: [] })) : { ok: true } });
  const P = withUi(boot(st, f)); let t = 1e12; P.c.Date = class extends Date { static now() { return t; } };
  ok((await P.R.boot()) === "grace" && !st["malang-rw-call"] && !st["malang-rw-seen"] && P.box.n === 0, "G: 유예 응답: 팝업·seen·call 기록 없음");
  ok((await P.R.boot()) === "grace" && P.calls.length === 1, "G: 5분 안 재진입은 서버 호출 안 함(폭주 방지)");
  t += 6 * 60 * 1000; phase = 1;
  ok((await P.R.boot()) === "shown" && P.calls.length === 2, "G: 5분 뒤 홈 진입에서 재호출 -> 정산된 보상 팝업");
  { const s4 = { "malang-name-ok": "1", "malang-rw-seen": "2" }; const R4 = withUi(boot(s4, () => ({ st: 200, d: resp({ cur: 4, last: { season: 2, leagues: {} }, pending: [] }) })));
    ok((await R4.R.boot()) === "grace" && !s4["malang-rw-call"] && R4.box.n === 0, "G: 시즌 4 이후 유예(last 가 2주 전 시즌)도 호출 완료로 치지 않음"); }
  const s2 = { "malang-name-ok": "1" }; const Q = withUi(boot(s2, () => ({ st: 200, d: resp({ cur: 2, last: null, pending: [] }) })));
  ok((await Q.R.boot()) === "nothing" && s2["malang-rw-call"] === "2", "G: 시즌 2 에는 원래 last 가 없음 -> 정상 완료 처리");
}
{ // H: 서버 오류 직후 같은 실행에서 재호출 억제, 구버전 MyHero 는 열지 않음
  const P = withUi(boot({ "malang-name-ok": "1" }, () => ({ st: 400, d: { error: "bad_action" } })));
  await P.R.boot(); await P.R.boot(); await P.R.boot(); ok(P.calls.length === 1, "H: 미지원 서버는 이번 실행에서 1회만 호출");
  const Q = withUi(boot({ "malang-name-ok": "1" }, rf())); delete Q.c.MyHero.grantReward;
  ok((await Q.R.boot()) === "nomh" && Q.calls.length === 0, "H: grantReward 없는 MyHero 면 열지 않음");
}

console.log(`rewards ui: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
