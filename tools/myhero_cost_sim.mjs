// 내 영웅 v2 비용표 -> '몇 판' 계산: node tools/build_engine.js 후 node tools/myhero_cost_sim.mjs [캐주얼 판당 코인] [보통 판당 코인]
// 판당 코인 기본값은 tools/coin_income_sim.mjs 결과(운 층 포함, 2026-11-08: 캐주얼 56.8 / 보통 88.5)에 내 영웅 판 +5%(기본 코인 몫 38.7/62.2 의 5%)를 더한 값.
// '코인 행운 5' 열은 coin 5단계를 켜고 모은 경우(기본 코인 +25%). 결과 표는 docs/내영웅_v2_스펙.md 4절.
import { MY_ITEMS, MY_FULL_COST, itemCost, validateMine } from "../supabase/functions/submit-score/engine.js";
const CAS = Number(process.argv[2]) || 56.8 + 38.7 * 0.05, NOR = Number(process.argv[3]) || 88.5 + 62.2 * 0.05;
const CAS_C = CAS + 38.7 * 0.25, NOR_C = NOR + 62.2 * 0.25;
const cost = (items) => Object.entries(items).reduce((a, [k, lv]) => { for (let l = 1; l <= lv; l++) a += itemCost(k, l); return a; }, 0);
const SK = { sk_lob: 1, sk_chain: 1, sk_storm: 1, sk_meteor: 1 };
const B = {
  "첫 목표(공격 3·비상금 3·대나무 투척)": { atk: 3, start: 3, sk_lob: 1 },
  "중간(공격 5·사냥 보상 4·버티기 3·성장 3·매의 눈 3 + 스킬 2개)": { atk: 5, kill: 4, btime: 3, growth: 3, range: 3, sk_lob: 1, sk_chain: 1 },
  "공격형 atk40(공격10·속사5·사거리5·보스5·성장5·보스약화5·버티기5)": { atk: 10, spd: 5, range: 5, boss: 5, growth: 5, bhp: 5, btime: 5 },
  "균형형 g40(훈장·연금5·꼬박3·버티기5·사냥6·성장5·사거리5·공격4)": { trophy: 1, merge: 5, income: 3, btime: 5, kill: 6, growth: 5, range: 5, atk: 4 },
  "특수형 spec40(훈장·공명·연금5·뽑기할인·행운3·꼬박3·사냥6·버티기5) = 봇 최강": { trophy: 1, reso: 1, merge: 5, drawc: 1, lucky: 3, income: 3, kill: 6, btime: 5 },
  "spec40 + 스킬 4개(대나무·번개·폭풍·운석)": { trophy: 1, reso: 1, merge: 5, drawc: 1, lucky: 3, income: 3, kill: 6, btime: 5, ...SK },
  "스킬 11종 전부": Object.fromEntries(MY_ITEMS.filter((x) => x.sk).map((x) => [x.id, 1])),
};
const g = (c, inc) => Math.ceil(c / inc);
console.log(`판당 코인: 캐주얼 ${CAS.toFixed(1)} (코인 행운 5: ${CAS_C.toFixed(1)}) / 보통 ${NOR.toFixed(1)} (${NOR_C.toFixed(1)})\n`);
console.log("| 목표 | 코인 | 캐주얼 판 | 보통 판 | 캐주얼(코인 행운 5) |\n|---|---|---|---|---|");
for (const [nm, it] of Object.entries(B)) {
  const v = validateMine({ design: "cat", items: it, equip: [] }), c = cost(it);
  console.log(`| ${nm}${v.ok ? "" : " (켜기 불가: " + v.err + ")"} | ${c} | ${g(c, CAS)} | ${g(c, NOR)} | ${g(c, CAS_C)} |`);
}
const coinCost = cost({ coin: 5 });
console.log(`| 영웅 1종 전 품목 보유(35종 최대) | ${MY_FULL_COST} | ${g(MY_FULL_COST, CAS)} | ${g(MY_FULL_COST, NOR)} | ${g(MY_FULL_COST - coinCost, CAS_C) + g(coinCost, CAS)} |`);
console.log(`| 영웅 3종 전 품목 보유 | ${MY_FULL_COST * 3} | ${g(MY_FULL_COST * 3, CAS)} | ${g(MY_FULL_COST * 3, NOR)} | ${g(MY_FULL_COST * 3 - coinCost * 3, CAS_C) + g(coinCost * 3, CAS)} |`);
console.log("\n| 품목 | 최대 | 단계별 비용 | 합 |\n|---|---|---|---|");
for (const x of MY_ITEMS) console.log(`| ${x.id} ${x.name} | ${x.max} | ${x.cost.join(" / ")} | ${x.cost.reduce((a, b) => a + b, 0)} |`);
