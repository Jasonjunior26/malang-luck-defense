// 운영 서버 스모크: 새 기기로 등록 -> 운빨/내 영웅 제출 1판씩. 운영 DB 에 테스트 행이 남으므로 끝나면 출력된 dev 로 정리한다:
//   delete from scores where device_id=<dev>; delete from players where device_id=<dev>;   (supabase db query --linked)
// 사용: VER=<GAME_VER> node tools/smoke_live.mjs
import { createEngine } from "../supabase/functions/submit-score/engine.js";
function bot(seed, rules, mine, maxTicks = 60 * 60 * 25) {
  const e = createEngine(), G = e.GAME, K = e.CONST;
  let a = (seed * 7 + 1) >>> 0;
  const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const S = e.start(seed, rules, mine);
  const best = () => { let b = 0, bp = -1; for (let c = 0; c < 4; c++) { let p = 0; for (const s of S.slots) if (s && !s.hero && (s.ch & 3) === c) p += (1 + (s.ch >> 2)) * s.n; if (p > bp) { bp = p; b = c; } } return b; };
  let n = 0, banned = 0;
  while (!S.over && n < maxTicks) {
    n++;
    if (S.paused) { if (S.tickets.length) { const g = S.tickets[0]; let used = false; for (let c = 0; c < 4 && !used; c++) used = G.useTicket(g * 4 + (c + best()) % 4); } S.paused = false; }
    if (n % 20 === 0) {
      if (S.upTickets) G.useUpTicket(best());
      if (S.round >= 5) G.upgrade(best());
      for (let k = 0; k < 5; k++) G.draw();
      for (let i = 0; i < 20; i++) { const s = S.slots[i]; if (s && !s.hero && s.n >= 3 && rnd() < 0.7) G.merge(i, rnd() < 0.5); }
      if (S.tickets.length) { const g = S.tickets[0]; for (let c = 0; c < 4; c++) if (G.useTicket(g * 4 + c)) break; }
      if (!S.slots.some((x) => !x)) for (let i = 0; i < 20; i++) { const s = S.slots[i]; if (s && !s.hero && (s.ch >> 2) < 2 && s.n < 3) { G.sell(i); break; } }
      if (rules && rules.clanBan) for (const s of S.slots) if (s && !s.hero && rules.clanBan.includes(s.ch & 3)) banned++;
    }
    e.update(K.DT);
  }
  return { e, S, r: e.result(), banned };
}
const URL_ = "https://oktgigevvwlczqavbyuq.supabase.co/functions/v1/submit-score";
const KEY = "sb_publishable_2Q2xW8R76GPlIoVmXJUzzA_LvBpEp8B";
const dev = crypto.randomUUID();
const post = async (b) => { const r = await fetch(URL_, { method: "POST", headers: { "content-type": "application/json", apikey: KEY, authorization: "Bearer " + KEY }, body: JSON.stringify({ device_id: dev, ...b }) }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
const ver = createEngine; const E = createEngine();
console.log("dev", dev);
console.log("register", JSON.stringify(await post({ action: "register", name: "스모크점검" })));
const mine = { hero: "weasel", up: { atk: 1, rew: 1, disc: 0, start: 0 } };
for (const [label, m] of [["운빨", null], ["나만의", mine]]) {
  const seed = 1000 + Math.floor(Math.random() * 900000);
  const b = bot(seed, null, m); const r = b.r;
  const body = { action: "submit", mode: "daily", ver: process.env.VER, seed, inputs: b.S.inputs, claimedScore: r.score, claimedRound: r.round, win: !!r.win };
  if (m) { body.mine = m; body.hero_name = "스모크영웅"; }
  const res = await post(body);
  console.log(label, "round", r.round, "score", r.score, "=>", res.s, JSON.stringify(res.j).slice(0, 200));
}
