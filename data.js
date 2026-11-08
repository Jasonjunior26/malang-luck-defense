"use strict";
// data.js - 순수 데이터/헬퍼 (DOM, Math.random 금지). 출처: docs/이식설계_데이터.md, 스운디_이식설계.md H2/J8
const GRADES = [
 {"id":0,"key":"common","name":"커먼","prob":45,"each":11.25,"luckyProb":45,"color":"#aab6c4","sell":3,"pts":1,"baseDps":5,"range":130,"cdMul":1,"style":{"scale":0.85,"outlineW":2,"sat":0.55,"shine":"flat","plate":"none","aura":"none","decor":0,"sparkPerSec":0,"fxScale":0.8,"tile":["#fffdf3","#f6e8c3","#ecd9a6"],"tileBorderW":2,"badge":["dot",1,"#aab6c4"]}},
 {"id":1,"key":"normal","name":"노멀","prob":30,"each":7.5,"luckyProb":30,"color":"#5fcf7a","sell":6,"pts":3,"baseDps":17,"range":140,"cdMul":1,"style":{"scale":0.95,"outlineW":2,"sat":0.7,"shine":"gloss","plate":"disc","aura":"none","decor":1,"sparkPerSec":0,"fxScale":0.9,"tile":["#f4fff0","#d9f5d0","#9fdc95"],"tileBorderW":2,"badge":["dot",2,"#5fcf7a"]}},
 {"id":2,"key":"rare","name":"레어","prob":18,"each":4.5,"luckyProb":18,"color":"#3b9dff","sell":15,"pts":9,"baseDps":60,"range":150,"cdMul":0.97,"style":{"scale":1.05,"outlineW":2.3,"sat":0.85,"shine":"gloss","plate":"ring","aura":"none","decor":2,"sparkPerSec":0,"fxScale":1,"tile":["#eef7ff","#cfe6ff","#7fb8f5"],"tileBorderW":2.5,"badge":["star",1,"#3b9dff"]}},
 {"id":3,"key":"unique","name":"유니크","prob":5.5,"each":1.375,"luckyProb":4,"color":"#a75bff","sell":40,"pts":27,"baseDps":210,"range":165,"cdMul":0.94,"style":{"scale":1.17,"outlineW":2.6,"sat":1,"shine":"belly","plate":"ring2","aura":"glow","decor":3,"sparkPerSec":1,"fxScale":1.2,"tile":["#f6edff","#e0ccff","#b58cf5"],"tileBorderW":3,"badge":["star",2,"#a75bff"]}},
 {"id":4,"key":"hidden","name":"히든","prob":1.2,"each":0.3,"luckyProb":2.4,"color":"#ff8a1f","sell":100,"pts":81,"baseDps":760,"range":180,"cdMul":0.9,"style":{"scale":1.3,"outlineW":3,"sat":1.1,"shine":"metal","plate":"hex","aura":"glow+arc","decor":4,"sparkPerSec":3,"fxScale":1.4,"tile":["#fff4e3","#ffddb0","#ffa94d"],"tileBorderW":3.5,"badge":["star",3,"#ff8a1f"]}},
 {"id":5,"key":"epic","name":"에픽","prob":0.24,"each":0.06,"luckyProb":0.48,"color":"#ff3d7f","sell":250,"pts":243,"baseDps":2700,"range":195,"cdMul":0.86,"style":{"scale":1.45,"outlineW":3.4,"sat":1.15,"shine":"glitter","plate":"rune","aura":"glow+orbs","decor":5,"sparkPerSec":6,"fxScale":1.7,"tile":["#ffeaf2","#ffc2d9","#ff6f9f"],"tileBorderW":4,"badge":["gem",1,"#ff3d7f"]}},
 {"id":6,"key":"legendary","name":"레전더리","prob":0.052,"each":0.013,"luckyProb":0.104,"color":"#ffc400","sell":600,"pts":729,"baseDps":9500,"range":215,"cdMul":0.82,"style":{"scale":1.62,"outlineW":3.8,"sat":1.2,"shine":"gold","plate":"rune+pillars","aura":"glow+rays","decor":6,"sparkPerSec":10,"fxScale":2.1,"tile":["#fffbe0","#ffeb99","#ffc400"],"tileBorderW":4.5,"badge":["crown",1,"#ffc400"]}},
 {"id":7,"key":"parents","name":"패런츠","prob":0.008,"each":0.002,"luckyProb":0.016,"color":"#ff6ad5","sell":0,"pts":2187,"baseDps":40000,"range":240,"cdMul":0.78,"style":{"scale":1.8,"outlineW":4.2,"sat":1.25,"shine":"holo","plate":"rainbow+column","aura":"rainbow+rays+sparkle","decor":7,"sparkPerSec":16,"fxScale":2.6,"tile":["#fff0fb","#ffe6f7","rainbow"],"tileBorderW":5,"badge":["crown",3,"rainbow"]}},
];
const CLANS = [{"id":0,"key":"forest","emblem":"leaf","role":"단일 고화력","name":"숲무리","ico":"🌿","color":"#58c26a","mul":1.1},
 {"id":1,"key":"fire","emblem":"flame","role":"광역+화상","name":"불꽃무리","ico":"🔥","color":"#ff6b2e","mul":1},
 {"id":2,"key":"tide","emblem":"drop","role":"둔화+연쇄","name":"물결무리","ico":"🌊","color":"#3b9dff","mul":0.9},
 {"id":3,"key":"star","emblem":"star","role":"방어 무시","name":"별빛무리","ico":"✨","color":"#a98bff","mul":0.95}];
const FX_TABLE = {"shot":{"mul":1,"cd":0.9,"ra":0},
 "tongue":{"mul":1.1,"cd":0.8,"ra":-20},
 "slash":{"mul":1.25,"cd":0.6,"ra":-30},
 "wave":{"mul":1,"cd":1,"ra":0},
 "roar":{"mul":0.85,"cd":1.4,"ra":-10,"R":55,"sp":0.5},
 "beam":{"mul":0.9,"cd":1.2,"ra":10,"line":16,"sp":0.6},
 "breath":{"mul":0.9,"cd":1.1,"ra":-10,"R":42,"sp":0.4},
 "chain":{"mul":0.8,"cd":1,"ra":0,"jumps":3,"R":70,"fall":0.7},
 "lob":{"mul":0.85,"cd":1.3,"ra":10,"R":50,"sp":0.6},
 "nova":{"mul":0.5,"cd":1.5,"ra":0},
 "meteor":{"mul":0.75,"cd":2,"ra":20,"R":70,"sp":1,"delay":0.6},
 "storm":{"mul":0.6,"cd":1.2,"ra":20}};

const CHARS = [
 {"idx":0,"key":"acorn","name":"도토리쥐","clan":0,"grade":0,"fx":"shot","shot":["acorn","#c98f4a"],"atk":5,"cd":0.9,"range":130,"aoe":null,"pierce":0,"st":null,"perk":null,"desc":"도토리 모자를 쓴 꼬마 쥐. 도토리를 톡 던진다","look":{"shape":[1,0.95],"c1":"#d9b48a","c2":"#fbeedd","c3":"#9b6a3c","base":[["ear","round","#f2a7a7"],["hat","acorncap","#9b6a3c"],["tail","thin"]],"face":["dot","smile"],"parts":[]}},
 {"idx":1,"key":"chick","name":"불꽃병아리","clan":1,"grade":0,"fx":"shot","shot":["fire","#ff7a3d"],"atk":5,"cd":0.9,"range":130,"aoe":null,"pierce":0,"st":{"burn":0.4,"dur":2},"perk":null,"desc":"머리에 작은 불씨가 달린 병아리","look":{"shape":[1,0.95],"c1":"#ffd24d","c2":"#fff1b8","c3":"#ff7a2e","base":[["ear","tuft","#ff7a2e"],["beak","#ffa726"]],"face":["dot","beak"],"parts":[]}},
 {"idx":2,"key":"dewfrog","name":"방울개구리","clan":2,"grade":0,"fx":"tongue","shot":["tongue","#ff6f9c"],"atk":4,"cd":0.8,"range":110,"aoe":null,"pierce":0,"st":{"slow":0.15,"dur":1.5},"perk":null,"desc":"이슬방울을 단 개구리. 혀로 찰싹","look":{"shape":[1,0.95],"c1":"#7ed4ff","c2":"#e0f6ff","c3":"#3a9ad9","base":[["ear","bump","#7ed4ff"]],"face":["dot","smile"],"parts":[]}},
 {"idx":3,"key":"firefly","name":"반딧이","clan":3,"grade":0,"fx":"shot","shot":["spark","#c8f060"],"atk":4,"cd":0.9,"range":130,"aoe":null,"pierce":0,"st":null,"perk":null,"desc":"엉덩이가 반짝이는 반딧불이","look":{"shape":[1,0.95],"c1":"#ffe98a","c2":"#fffbd6","c3":"#b6e86a","base":[["ear","antenna","#b6e86a"],["wing","nub","#ffffff"]],"face":["dot","smile"],"parts":[]}},
 {"idx":4,"key":"cotton","name":"솜토끼","clan":0,"grade":1,"fx":"shot","shot":["carrot","#ff9a3d"],"atk":17,"cd":0.9,"range":140,"aoe":null,"pierce":0,"st":null,"perk":null,"desc":"솜사탕 같은 토끼. 당근을 던지고 네잎클로버를 단다","look":{"shape":[1,0.95],"c1":"#fffaf0","c2":"#ffe3ec","c3":"#9be39b","base":[["ear","long","#ffb3c6"],["tail","puff","#ffffff"]],"face":["dot","smile"],"parts":[["acc","clover","#6fcf7f"]]}},
 {"idx":5,"key":"soot","name":"숯고양이","clan":1,"grade":1,"fx":"slash","shot":["claw","#ff7a2e"],"atk":13,"cd":0.6,"range":110,"aoe":null,"pierce":0,"st":{"burn":0.4,"dur":2},"perk":null,"desc":"숯검댕이 고양이. 꼬리 끝 불씨로 할퀸다","look":{"shape":[1,0.95],"c1":"#7a6a6a","c2":"#c9b7b0","c3":"#ff7a2e","base":[["ear","point","#ff9eb5"],["whisker"]],"face":["dot","cat"],"parts":[["tail","ember","#ff7a2e"]]}},
 {"idx":6,"key":"seal","name":"물범이","clan":2,"grade":1,"fx":"wave","shot":["bubblewave","#7fc4ff"],"atk":15,"cd":1,"range":140,"aoe":null,"pierce":0,"st":{"slow":0.2,"dur":1.5},"perk":null,"desc":"목도리 두른 아기 물범. 물결 음파를 쏜다","look":{"shape":[1.08,0.93],"c1":"#b8c8dc","c2":"#f1f6fb","c3":"#5b7a9a","base":[["ear","nub","#b8c8dc"],["whisker"]],"face":["dot","smile"],"parts":[["acc","scarf","#ff7aa2"]]}},
 {"idx":7,"key":"owl","name":"달부엉","clan":3,"grade":1,"fx":"shot","shot":["feather","#c9b6f2"],"atk":15,"cd":0.9,"range":140,"aoe":null,"pierce":0,"st":null,"perk":null,"desc":"달 목걸이를 건 올빼미. 깃털 표창","look":{"shape":[1.05,0.95],"c1":"#c9b6f2","c2":"#f1eaff","c3":"#ffd54f","base":[["ear","tuft","#a58be0"],["beak","#ffd54f"]],"face":["big","beak"],"parts":[["acc","moon","#ffe27a"]]}},
 {"idx":8,"key":"bamboo","name":"죽순판다","clan":0,"grade":2,"fx":"lob","shot":["bamboo","#6fcf7f"],"atk":71,"cd":1.26,"range":160,"aoe":{"R":50,"sp":0.6,"delay":0},"pierce":0,"st":null,"perk":null,"desc":"머리에 죽순이 자란 판다. 대나무 폭탄을 포물선으로 던진다","look":{"shape":[1.05,0.92],"c1":"#ffffff","c2":"#ffffff","c3":"#3a3a3a","base":[["ear","round","#3a3a3a"],["mark","eyepatch","#3a3a3a"]],"face":["dot","smile"],"parts":[["hat","sprout","#7ed67e"],["acc","bamboo","#6fcf7f"]]}},
 {"idx":9,"key":"flarefox","name":"불꽃여우","clan":1,"grade":2,"fx":"breath","shot":["flame","#ff8f4d"],"atk":58,"cd":1.07,"range":140,"aoe":{"R":42,"sp":0.4,"delay":0},"pierce":0,"st":{"burn":0.4,"dur":2},"perk":null,"desc":"꼬리가 활활 타는 여우. 불꽃을 뿜는다","look":{"shape":[0.98,1],"c1":"#ff8f4d","c2":"#fff0dc","c3":"#ffd24d","base":[["ear","point","#5b3a1e"],["mark","cheek","#fff0dc"]],"face":["dot","smile"],"parts":[["tail","flame","#ffb347"],["acc","scarf","#e8442e"]]}},
 {"idx":10,"key":"otter","name":"조개수달","clan":2,"grade":2,"fx":"chain","shot":["shell","#ffb3c6"],"atk":42,"cd":0.97,"range":150,"aoe":{"jumps":3,"R":70,"fall":0.7},"pierce":0,"st":{"slow":0.25,"dur":1.5},"perk":null,"desc":"배 위에서 조개를 깨는 수달. 조개가 튕겨 연쇄 타격","look":{"shape":[1.05,0.95],"c1":"#b98c6a","c2":"#f0dcc4","c3":"#ffb3c6","base":[["ear","round","#f0dcc4"],["whisker"]],"face":["dot","smile"],"parts":[["acc","shell","#ffb3c6"],["tail","fin","#b98c6a"]]}},
 {"idx":11,"key":"cloudsheep","name":"구름양","clan":3,"grade":2,"fx":"chain","shot":["lightning","#ffd54f"],"atk":44,"cd":0.97,"range":150,"aoe":{"jumps":3,"R":70,"fall":0.7},"pierce":0.05,"st":null,"perk":null,"desc":"구름 털 양. 번개가 연쇄로 튄다","look":{"shape":[1.1,0.95],"c1":"#ffffff","c2":"#e8f0ff","c3":"#ffb3d1","base":[["ear","floppy","#ffb3d1"]],"face":["sleepy","smile"],"parts":[["back","cloudwool","#ffffff"],["acc","lightning","#ffd54f"]]}},
 {"idx":12,"key":"moss","name":"이끼곰","clan":0,"grade":3,"fx":"roar","shot":["quake","#8fb27a"],"atk":259,"cd":1.32,"range":155,"aoe":{"R":55,"sp":0.5,"delay":0},"pierce":0,"st":null,"perk":null,"desc":"등에 이끼 정원이 자란 듬직한 곰. 포효하면 땅이 울린다","look":{"shape":[1.1,0.95],"c1":"#8fb27a","c2":"#d9e7c4","c3":"#5d8b4e","base":[["ear","round","#d9e7c4"]],"face":["dot","smile"],"parts":[["back","moss","#6fae5c"],["hat","flowerpair","#ff9ec0"],["acc","scarf","#e6b34d"]]}},
 {"idx":13,"key":"lavamander","name":"용암도롱뇽","clan":1,"grade":3,"fx":"lob","shot":["lava","#d9533a"],"atk":218,"cd":1.22,"range":175,"aoe":{"R":50,"sp":0.6,"delay":0},"pierce":0,"st":{"burn":0.4,"dur":2},"perk":null,"desc":"등에 식은 용암 판이 박힌 도롱뇽. 용암덩이를 던진다","look":{"shape":[1.15,0.9],"c1":"#d9533a","c2":"#ffb36b","c3":"#3a2a2a","base":[["ear","fin","#ffb36b"],["mark","spots","#ffb347"]],"face":["dot","smile"],"parts":[["back","rockplates","#4a3a3a"],["tail","lizard","#d9533a"],["acc","lavadrip","#ffb347"]]}},
 {"idx":14,"key":"dolphin","name":"파랑돌고래","clan":2,"grade":3,"fx":"lob","shot":["bubblebomb","#4aa8ff"],"atk":196,"cd":1.22,"range":175,"aoe":{"R":50,"sp":0.6,"delay":0},"pierce":0,"st":{"slow":0.3,"dur":1.5},"perk":null,"desc":"물 위로 솟구치는 돌고래. 거품 폭탄 투척","look":{"shape":[1.15,0.9],"c1":"#4aa8ff","c2":"#e6f5ff","c3":"#1f6fd1","base":[["mark","belly","#e6f5ff"]],"face":["dot","smile"],"parts":[["back","fin","#1f6fd1"],["tail","fin","#4aa8ff"],["acc","bubble","#bfe6ff"]]}},
 {"idx":15,"key":"meteorhog","name":"유성고슴도치","clan":3,"grade":3,"fx":"meteor","shot":["meteor","#ffd54f"],"atk":281,"cd":1.88,"range":185,"aoe":{"R":70,"sp":1,"delay":0.6},"pierce":0.1,"st":null,"perk":null,"desc":"별똥별 가시의 고슴도치. 작은 유성을 떨어뜨린다","look":{"shape":[1,0.95],"c1":"#8e7bd8","c2":"#efe8ff","c3":"#ffd54f","base":[["ear","round","#efe8ff"]],"face":["dot","smile"],"parts":[["back","spikes","#ffd54f"],["tail","comet","#ffe27a"],["hat","star","#ffd54f"]]}},
 {"idx":16,"key":"antler","name":"푸른뿔사슴","clan":0,"grade":4,"fx":"chain","shot":["vine","#58c26a"],"atk":602,"cd":0.9,"range":180,"aoe":{"jumps":3,"R":70,"fall":0.7},"pierce":0,"st":null,"perk":null,"desc":"푸른 뿔에서 덩굴이 뻗어 여러 마리를 휘감는다","look":{"shape":[0.95,1.05],"c1":"#9fd8b0","c2":"#f1ffe9","c3":"#3f9a6a","base":[["ear","point","#f1ffe9"],["mark","spots","#ffffff"]],"face":["dot","smile"],"parts":[["horn","antler","#7a5a3a"],["tail","puff","#f1ffe9"],["acc","leafcollar","#58c26a"],["back","vine","#58c26a"]]}},
 {"idx":17,"key":"phoenixling","name":"불새","clan":1,"grade":4,"fx":"nova","shot":["firering","#ff7a5c"],"atk":513,"cd":1.35,"range":178,"aoe":{"R":138,"sp":1,"all":1},"pierce":0,"st":{"burn":0.4,"dur":2},"perk":null,"desc":"아기 불사조. 날개짓마다 불꽃 고리가 퍼진다","look":{"shape":[0.95,1.05],"c1":"#ff7a5c","c2":"#ffe3a0","c3":"#ffd24d","base":[["beak","#ffb347"],["ear","tuft","#ffd24d"]],"face":["sharp","beak"],"parts":[["wing","flame","#ff9f43"],["tail","flame","#ff6b2e"],["horn","crest","#ffd24d"],["acc","gem","#ff4f81"]]}},
 {"idx":18,"key":"coralturtle","name":"산호거북","clan":2,"grade":4,"fx":"nova","shot":["coralring","#ff8fa3"],"atk":462,"cd":1.35,"range":178,"aoe":{"R":138,"sp":1,"all":1},"pierce":0,"st":{"slow":0.35,"dur":1.5},"perk":null,"desc":"등껍질에 산호숲이 핀 거북. 산호 파동이 퍼진다","look":{"shape":[1.1,0.95],"c1":"#5fd4b0","c2":"#e3fff4","c3":"#ff8fa3","base":[["ear","none"]],"face":["sleepy","smile"],"parts":[["shell","coral","#ff8fa3"],["horn","crest","#ff8fa3"],["tail","puff","#5fd4b0"],["acc","pearl","#ffffff"]]}},
 {"idx":19,"key":"moonwolf","name":"달늑대","clan":3,"grade":4,"fx":"beam","shot":["moonbeam","#b9c4e6"],"atk":702,"cd":1.08,"range":190,"aoe":{"line":16,"sp":0.6},"pierce":0.4,"st":null,"perk":null,"desc":"초승달 뿔의 늑대. 달빛 광선으로 관통","look":{"shape":[0.95,1.05],"c1":"#b9c4e6","c2":"#f4f7ff","c3":"#7a8cc6","base":[["ear","point","#7a8cc6"]],"face":["sharp","fang"],"parts":[["horn","moon","#ffe27a"],["tail","fluffy","#b9c4e6"],["mane","ruff","#f4f7ff"],["acc","gem","#ffe27a"]]}},
 {"idx":20,"key":"pine","name":"솔잎용","clan":0,"grade":5,"fx":"breath","shot":["needle","#4fb883"],"atk":2539,"cd":0.95,"range":185,"aoe":{"R":42,"sp":0.4,"delay":0},"pierce":0,"st":null,"perk":null,"desc":"솔잎 비늘의 아기 용. 솔잎 폭풍을 뿜는다","look":{"shape":[1,1],"c1":"#4fb883","c2":"#d8f5c9","c3":"#2f7d44","base":[["ear","fin","#2f7d44"]],"face":["sharp","fang"],"parts":[["horn","pair","#ffd54f"],["wing","leaf","#3f9a6a"],["tail","lizard","#4fb883"],["back","spikes","#2f7d44"],["mane","needle","#2f7d44"]]}},
 {"idx":21,"key":"flamelion","name":"화염사자","clan":1,"grade":5,"fx":"roar","shot":["firequake","#ffb347"],"atk":2754,"cd":1.2,"range":185,"aoe":{"R":55,"sp":0.5,"delay":0},"pierce":0,"st":{"burn":0.4,"dur":2},"perk":null,"desc":"갈기가 불꽃인 사자. 포효가 폭발한다","look":{"shape":[1.1,1],"c1":"#ffb347","c2":"#fff0cf","c3":"#e8442e","base":[["ear","round","#ffa94d"]],"face":["sharp","fang"],"parts":[["mane","flame","#ff6b2e"],["horn","pair","#ffd54f"],["tail","flame","#ff6b2e"],["wing","flame","#ff9f43"],["acc","armor","#d4a017"]]}},
 {"idx":22,"key":"glacierwhale","name":"빙하고래","clan":2,"grade":5,"fx":"breath","shot":["frost","#9fd8ff"],"atk":2078,"cd":0.95,"range":185,"aoe":{"R":42,"sp":0.4,"delay":0},"pierce":0,"st":{"slow":0.4,"dur":1.5},"perk":null,"desc":"빙산을 이고 다니는 고래. 얼음 숨결로 얼린다","look":{"shape":[1.15,1],"c1":"#9fd8ff","c2":"#f4fbff","c3":"#5aa8e8","base":[["ear","none"]],"face":["big","smile"],"parts":[["back","icespikes","#d8f3ff"],["tail","fin","#5aa8e8"],["horn","single","#d8f3ff"],["wing","crystal","#bfe6ff"],["acc","spout","#bfe6ff"]]}},
 {"idx":23,"key":"galaxycorn","name":"은하유니콘","clan":3,"grade":5,"fx":"chain","shot":["rainbowchain","#d28bff"],"atk":1765,"cd":0.86,"range":195,"aoe":{"jumps":5,"R":70,"fall":0.7},"pierce":0.3,"st":null,"perk":null,"desc":"갈기가 은하수인 유니콘. 무지개 번개가 5번 튄다","look":{"shape":[0.97,1.05],"c1":"#f5d0ff","c2":"#ffffff","c3":"#8a7bff","base":[["ear","point","#ffd1ea"]],"face":["big","smile"],"parts":[["horn","single","#ffd54f"],["wing","angel","#ffffff"],["mane","galaxy","#8a7bff"],["tail","star","#ff9ee8"],["halo","ring","#ffe27a"]]}},
 {"idx":24,"key":"elder","name":"세계수 정령왕","clan":0,"grade":6,"fx":"nova","shot":["roots","#6b4a2a"],"atk":6427,"cd":1.23,"range":202,"aoe":{"R":162,"sp":1,"all":1},"pierce":0,"st":null,"perk":null,"desc":"세계수에서 태어난 정령의 왕. 뿌리가 사방으로 솟는다","look":{"shape":[1,1.1],"c1":"#8bd17c","c2":"#eaffd0","c3":"#6b4a2a","base":[["ear","leaf","#7ed67e"]],"face":["big","smile"],"parts":[["horn","antler","#a07a4a"],["wing","leaf","#7ed67e"],["hat","crown","#ffd54f"],["back","roots","#6b4a2a"],["acc","cape","#2f9a5a"],["acc","gem","#ffef6b"]]}},
 {"idx":25,"key":"sunbird","name":"태양불사조","clan":1,"grade":6,"fx":"meteor","shot":["sunfall","#ffd24d"],"atk":11685,"cd":1.64,"range":235,"aoe":{"R":70,"sp":1,"delay":0.6},"pierce":0,"st":{"burn":0.4,"dur":2},"perk":null,"desc":"태양을 등진 불사조. 하늘에서 불덩이를 떨어뜨린다","look":{"shape":[1,1.08],"c1":"#ffd24d","c2":"#fff6c9","c3":"#ff5a2e","base":[["beak","#ff8a3d"]],"face":["sharp","beak"],"parts":[["horn","crest","#ff5a2e"],["wing","flame","#ff8a3d"],["tail","flame","#ff4f2e"],["hat","crown","#ffd54f"],["halo","sun","#ffe27a"],["acc","gem","#ff4f81"]]}},
 {"idx":26,"key":"kraken","name":"심해왕 크라쿠","clan":2,"grade":6,"fx":"meteor","shot":["tsunami","#6b5bd1"],"atk":10517,"cd":1.64,"range":235,"aoe":{"R":70,"sp":1,"delay":0.6},"pierce":0,"st":{"slow":0.45,"dur":1.5},"perk":null,"desc":"심해의 왕. 해일을 떨어뜨린다","look":{"shape":[1,1.05],"c1":"#6b5bd1","c2":"#cfc8ff","c3":"#2fd4c0","base":[["ear","none"],["tentacle","wave","#6b5bd1"]],"face":["sharp","smile"],"parts":[["hat","crown","#ffd54f"],["wing","crystal","#2fd4c0"],["halo","ring","#2fd4c0"],["acc","gem","#2fd4c0"],["acc","cape","#2a2a7a"],["back","trident","#ffd54f"]]}},
 {"idx":27,"key":"moonqueen","name":"월광여왕","clan":3,"grade":6,"fx":"beam","shot":["moonray","#8a7bff"],"atk":7960,"cd":0.98,"range":225,"aoe":{"line":16,"sp":0.6},"pierce":0.7,"st":null,"perk":null,"desc":"달빛 드레스의 여왕. 달빛 대광선","look":{"shape":[0.95,1.1],"c1":"#fff4fb","c2":"#ffffff","c3":"#8a7bff","base":[["ear","long","#e8e0ff"]],"face":["sleepy","smile"],"parts":[["hat","crown","#ffd54f"],["wing","angel","#e8e0ff"],["halo","moon","#ffe27a"],["tail","puff","#ffffff"],["acc","cape","#6b5bd1"],["acc","wand","#ffd54f"]]}},
 {"idx":28,"key":"forestgod","name":"§숲신 말랑§","clan":0,"grade":7,"fx":"storm","shot":["leafstorm","#7ed67e"],"atk":24816,"cd":0.94,"range":260,"aoe":{"all":1,"sp":1},"pierce":0,"st":null,"perk":{"killBonus":1},"desc":"숲을 만든 첫 말랑. 화면 가득 잎사귀 폭풍. 패시브: 처치 보상 +1","look":{"shape":[1,1],"c1":"#b6f5a8","c2":"#ffffff","c3":"#ffd54f","base":[["ear","round","#ffffff"]],"face":["star","smile"],"parts":[["hat","grandcrown","#ffd54f"],["wing","angel","#ffffff"],["halo","ring","#ffef9a"],["tail","star","#ffd54f"],["acc","cape","#7ed67e"],["acc","gem","#ff9ec0"],["back","worldtree","#58c26a"]]}},
 {"idx":29,"key":"firegod","name":"§불신 말랑§","clan":1,"grade":7,"fx":"storm","shot":["flamestorm","#ff8a5c"],"atk":22560,"cd":0.94,"range":260,"aoe":{"all":1,"sp":1},"pierce":0,"st":{"burn":1,"dur":2},"perk":null,"desc":"불을 낳은 첫 말랑. 불꽃 폭풍이 전 지역을 태운다. 패시브: 화상 100%","look":{"shape":[1,1],"c1":"#ff8a5c","c2":"#fff0d6","c3":"#ffd54f","base":[["ear","round","#ffd54f"]],"face":["star","smile"],"parts":[["hat","grandcrown","#ffd54f"],["wing","flame","#ff9f43"],["halo","sun","#ffe27a"],["tail","flame","#ff6b2e"],["acc","cape","#d63a2e"],["acc","gem","#ffef6b"],["back","flamering","#ff9f43"]]}},
 {"idx":30,"key":"watergod","name":"§물신 말랑§","clan":2,"grade":7,"fx":"storm","shot":["waterstorm","#7fd8ff"],"atk":20304,"cd":0.94,"range":260,"aoe":{"all":1,"sp":1},"pierce":0,"st":{"slow":0.5,"dur":1.5},"perk":null,"desc":"바다를 낳은 첫 말랑. 물폭풍. 패시브: 둔화 50%","look":{"shape":[1,1],"c1":"#7fd8ff","c2":"#ffffff","c3":"#ffd54f","base":[["ear","round","#ffffff"]],"face":["star","smile"],"parts":[["hat","grandcrown","#ffd54f"],["wing","angel","#ffffff"],["halo","ring","#bfe6ff"],["tail","fin","#7fd8ff"],["acc","cape","#3b9dff"],["acc","gem","#ffffff"],["back","tidering","#7fd8ff"]]}},
 {"idx":31,"key":"stargod","name":"§별신 말랑§","clan":3,"grade":7,"fx":"storm","shot":["starstorm","#ffe27a"],"atk":21432,"cd":0.94,"range":260,"aoe":{"all":1,"sp":1},"pierce":1,"st":null,"perk":null,"desc":"별을 낳은 첫 말랑. 별똥별 폭풍. 패시브: 방어 무시 100%","look":{"shape":[1,1],"c1":"#d9c8ff","c2":"#ffffff","c3":"#ffd54f","base":[["ear","round","#ffffff"]],"face":["star","smile"],"parts":[["hat","grandcrown","#ffd54f"],["wing","angel","#ffffff"],["halo","star","#ffe27a"],["tail","comet","#ffd54f"],["acc","cape","#8a7bff"],["acc","gem","#ffffff"],["back","constellation","#ffe27a"]]}},
];

const HEROES = [
 {"id":"bee","name":"꿀벌 일꾼 붕붕","prob":10,"rule":"라운드마다 미네랄 +6, 보스 처치 +40","fx":{"roundMin":6,"bossBonus":40},"look":{"shape":[1.05,0.95],"c1":"#ffd54f","c2":"#fff6c2","c3":"#3a3030","base":[["ear","antenna","#3a3030"],["mark","stripes","#3a3030"],["wing","nub","#ffffff"]],"face":["dot","smile"],"parts":[["acc","coinbag","#ffb300"]]}},
 {"id":"goose","name":"황금 거위 꽥순","prob":10,"rule":"뽑기 6번째마다 무료","fx":{"freeDraw":6},"look":{"shape":[1.05,1],"c1":"#fff3c4","c2":"#ffffff","c3":"#ffb300","base":[["beak","#ff9f1c"],["tail","puff","#fff3c4"]],"face":["dot","beak"],"parts":[["hat","crown","#ffd54f"],["acc","coin","#ffd54f"]]}},
 {"id":"weasel","name":"번개 족제비 찌릿","prob":10,"rule":"모든 유닛 공격 속도 +12%","fx":{"atkSpd":1.12},"look":{"shape":[0.95,1],"c1":"#c98a52","c2":"#fff1e0","c3":"#ffe14d","base":[["ear","round","#fff1e0"],["tail","thin","#c98a52"],["mark","belly","#fff1e0"]],"face":["sharp","smile"],"parts":[["hat","headband","#3b9dff"],["acc","lightning","#ffe14d"]]}},
 {"id":"whale","name":"고래 장로 둥실","prob":10,"rule":"라운드마다 모든 피해 +0.8% 누적","fx":{"roundDmg":0.008},"look":{"shape":[1.12,0.92],"c1":"#6aa8e8","c2":"#e6f4ff","c3":"#2f6db0","base":[["ear","fin","#6aa8e8"],["tail","fin","#6aa8e8"],["mark","belly","#e6f4ff"]],"face":["sleepy","smile"],"parts":[["acc","spout","#bfe6ff"],["acc","glasses","#3a3a5a"]]}},
 {"id":"hedgehog","name":"고슴도치 대장 따끔","prob":10,"rule":"보스 3마리 처치마다 모든 무리 공업 +1","fx":{"bossUp":1,"bossUpEvery":3},"look":{"shape":[1.05,0.95],"c1":"#8a6a58","c2":"#f0dcc8","c3":"#5a4632","base":[["ear","nub","#f0dcc8"],["mane","needle","#5a4632"],["nose","pink","#ffb3c6"]],"face":["sharp","fang"],"parts":[["hat","headband","#e8442e"],["acc","armor","#8a97a8"]]}},
 {"id":"chameleon","name":"카멜레온 알록","prob":10,"rule":"공명에 필요한 종류 1 줄임","fx":{"resoEase":1},"look":{"shape":[1,0.95],"c1":"#7ed957","c2":"#e9ffd6","c3":"#ff9ec0","base":[["ear","none"],["tail","lizard","#58c26a"],["mark","spots","#ff9ec0"]],"face":["big","smile"],"parts":[["hat","flowerpair","#ffb3c6"],["acc","scarf","#3b9dff"]]}},
 {"id":"frog","name":"개구리 연금술사 퐁","prob":10,"rule":"합성 6% 확률로 한 등급 더 위","fx":{"mergeUp":0.06},"look":{"shape":[1.1,0.9],"c1":"#58c26a","c2":"#d9f5c8","c3":"#7a5fd0","base":[["ear","bump","#58c26a"],["mark","cheek","#ff9ec0"]],"face":["big","smile"],"parts":[["hat","moonhat","#7a5fd0"],["acc","crystalball","#bfe6ff"]]}},
 {"id":"penguin","name":"펭귄 얼음술사 뽀득","prob":10,"rule":"보스 체력 -15%","fx":{"bossHp":0.85},"look":{"shape":[1,1],"c1":"#3a4a6a","c2":"#ffffff","c3":"#9fd8ff","base":[["ear","none"],["beak","#ffb347"],["mark","belly","#ffffff"],["back","icespikes","#bfe8ff"]],"face":["dot","beak"],"parts":[["hat","star","#9fd8ff"],["acc","wand","#9fd8ff"]]}},
 {"id":"fennec","name":"사막여우 망원","prob":10,"rule":"모든 유닛 사거리 +15%","fx":{"rangeMul":0.15},"look":{"shape":[1,0.95],"c1":"#f2c98a","c2":"#fff4e0","c3":"#e8442e","base":[["ear","big","#f2c98a"],["tail","fluffy","#f2c98a"]],"face":["sharp","smile"],"parts":[["hat","monocle","#ffd54f"],["acc","scarf","#e8442e"]]}},
 {"id":"owlsage","name":"부엉이 군사 지혜","prob":10,"rule":"히어로 유닛이 최고 공업 레벨 그대로","fx":{"heroLvK":1},"look":{"shape":[1.05,0.98],"c1":"#8b6b4a","c2":"#f0e0c8","c3":"#3a3a5a","base":[["ear","tuft","#5a4632"],["beak","#ffd54f"]],"face":["big","beak"],"parts":[["hat","gradcap","#3a3a5a"],["acc","cape","#7a5fd0"]]}},
];

// [r, chapter, name, kind, hue, hp, armor%, count, gap, speed, timeLimit, rewMul]  (개체 HP·보상은 구 표 대비 총량 유지: 수 N배 → 개체 1/N)
const ROUNDS = [
 [1,1,"젤리 슬라임","blob",130,7,0,49,0.4,90,20,0.245],
 [2,1,"꼬마 버섯","shroom",0,18,0,49,0.4,90,20,0.245],
 [3,1,"방울 벌레","worm",95,45,0,49,0.4,90,20,0.265],
 [4,1,"솔방울 가시","spiky",120,76,0,49,0.393,90,20,0.265],
 [5,1,"슬라임 대왕 젤리킹","king",45,420,2,1,0,30,63,1],
 [6,2,"늪 슬라임","blob",175,114,2,49,0.393,90,20,0.286],
 [7,2,"독버섯","shroom",285,123,2,49,0.393,90,20,0.286],
 [8,2,"늪 귀신","ghost",160,136,2,49,0.393,90,20,0.286],
 [9,2,"가시 두꺼비","spiky",85,172,2,50,0.387,90,20,0.3],
 [10,2,"두꺼비 대장 우걱이","toad",95,1080,7,1,0,32,60,1],
 [11,3,"조약돌","golem",30,225,5,50,0.387,90,20,0.3],
 [12,3,"모래게","crab",35,234,7,50,0.387,90,20,0.32],
 [13,3,"뿔 도깨비","imp",15,285,7,51,0.38,90,20,0.314],
 [14,3,"돌 눈알","cyclops",40,285,9,51,0.38,90,20,0.314],
 [15,3,"바위 문지기 돌문이","gate",30,1820,11,1,0,33,58,1],
 [16,4,"태엽 병정","robo",10,350,11,51,0.38,90,20,0.333],
 [17,4,"깡통 로봇","robo",200,457,13,51,0.38,90,20,0.333],
 [18,4,"풍선 폭탄","cloud",350,536,17,52,0.373,90,20,0.346],
 [19,4,"톱니 가시","spiky",45,516,18,52,0.373,90,20,0.346],
 [20,4,"대장 째깍이","robo",10,3360,20,1,0,34,55,1],
 [21,5,"아기 박쥐","bat",250,793,20,52,0.373,90,20,0.365],
 [22,5,"먹구름","cloud",220,957,27,52,0.373,90,20,0.365],
 [23,5,"번개 박쥐(돌진 x1.7)","bat",55,688,23,53,0.367,155,20,0.359],
 [24,5,"풍선 해파리","ghost",190,958,29,53,0.367,90,20,0.377],
 [25,5,"폭풍구름왕 우르릉","cloud",230,6070,33,1,0,36,53,1],
 [26,6,"수정 게","crab",190,905,33,53,0.367,90,20,0.377],
 [27,6,"달빛 눈알","cyclops",260,1038,33,53,0.367,90,20,0.396],
 [28,6,"수정 골렘","golem",280,1334,38,54,0.36,90,20,0.389],
 [29,6,"동굴 유령","ghost",270,1474,38,54,0.36,90,20,0.389],
 [30,6,"수정눈 대왕","mega",280,10790,43,1,0,38,50,1],
 [31,7,"해적 박쥐","bat",25,1955,38,54,0.36,90,20,0.407],
 [32,7,"앵무 도깨비","imp",340,1955,41,54,0.36,90,20,0.407],
 [33,7,"대포 게","crab",5,2007,43,55,0.353,90,20,0.418],
 [34,7,"비행선 UFO","ufo",205,2622,43,55,0.353,90,20,0.418],
 [35,7,"구름고래호 선장 뽀빠","ufo",205,18940,43,1,0,40,48,1],
 [36,8,"알 도깨비","egg",50,2858,44,55,0.353,90,20,0.437],
 [37,8,"둥지 새끼","blob",20,2915,46,55,0.353,90,20,0.437],
 [38,8,"큰 알(느림 x0.7)","egg",340,2863,47,56,0.347,65,20,0.429],
 [39,8,"부화 애벌레","worm",70,3388,47,56,0.347,90,20,0.447],
 [40,8,"어미알 태초","egg",50,21950,56,1,0,42,45,1],
 [41,9,"사탕 UFO","ufo",330,3924,50,56,0.347,90,20,0.447],
 [42,9,"쿠키 병정","robo",30,5009,50,57,0.34,90,20,0.456],
 [43,9,"별 눈알","cyclops",50,5009,51,57,0.34,90,20,0.456],
 [44,9,"젤리 해파리","ghost",310,5469,53,57,0.34,90,20,0.456],
 [45,9,"황금 모선 쿠키마더","ufo",50,34680,60,1,0,42,45,1],
 [46,10,"그림자 슬라임","blob",270,6579,56,57,0.34,90,20,0.474],
 [47,10,"그림자 도깨비","imp",285,7294,56,58,0.333,90,20,0.465],
 [48,10,"그림자 버섯","shroom",300,7976,57,58,0.333,90,20,0.483],
 [49,10,"그림자 눈알","cyclops",255,8762,56,58,0.333,90,20,0.483],
 [50,10,"어둠의 말랑신","demon",275,150000,71,1,0,25,75,1],
 [51,11,"서리 슬라임","blob",195,9600,57,58,0.333,90,20,0.49],
 [52,11,"얼음 게","crab",200,10500,58,58,0.333,90,20,0.49],
 [53,11,"눈보라 유령","ghost",205,11500,58,59,0.327,90,20,0.5],
 [54,11,"서리 골렘","golem",190,12600,59,59,0.327,90,20,0.5],
 [55,11,"빙결 성문 서리문","gate",200,190000,72,1,0,25,75,1],
 [56,12,"별똥 박쥐","bat",290,14000,60,59,0.327,90,20,0.51],
 [57,12,"혼돈 도깨비","imp",320,15400,60,60,0.32,90,20,0.51],
 [58,12,"우주 해파리","ghost",300,16900,61,60,0.32,90,20,0.52],
 [59,12,"블랙홀 눈알","cyclops",280,18500,61,60,0.32,90,20,0.52],
 [60,12,"태초의 혼돈 말랑신","demon",320,235000,73,1,0,25,80,1],
];

const CHAPTERS = [
 {"id":1,"name":"말랑 숲의 꼬마들","from":1,"to":5,"boss":"슬라임 대왕 젤리킹"},
 {"id":2,"name":"끈적 늪지대","from":6,"to":10,"boss":"두꺼비 대장 우걱이"},
 {"id":3,"name":"돌멩이 마을","from":11,"to":15,"boss":"바위 문지기 돌문이"},
 {"id":4,"name":"고장난 장난감 공장","from":16,"to":20,"boss":"대장 째깍이"},
 {"id":5,"name":"먹구름 하늘","from":21,"to":25,"boss":"폭풍구름왕 우르릉"},
 {"id":6,"name":"달빛 수정 동굴","from":26,"to":30,"boss":"수정눈 대왕"},
 {"id":7,"name":"하늘섬 해적단","from":31,"to":35,"boss":"구름고래호 선장 뽀빠"},
 {"id":8,"name":"태초의 알 둥지","from":36,"to":40,"boss":"어미알 태초"},
 {"id":9,"name":"별사탕 함대","from":41,"to":45,"boss":"황금 모선 쿠키마더"},
 {"id":10,"name":"말랑 왕국의 유산","from":46,"to":50,"boss":"어둠의 말랑신"},
 {"id":11,"name":"얼어붙은 별빛 성채","from":51,"to":55,"boss":"빙결 성문 서리문"},
 {"id":12,"name":"말랑 우주의 끝","from":56,"to":60,"boss":"태초의 혼돈 말랑신"},
];

const CONST = {
 W: 360, H: 400, DT: 1 / 60,
 ROUNDS: 60, ROUNDS_BASE: 60, HP_CURVE_R: 50, ROUND_SEC: 20, SPAWN_FRAC: 0.8, BOSS_DELAY: 3,
 DRAW_COST: 15, START_MIN: 50, KILL_REWARD: 2, BOSS_REWARD: 50,
 SLOTS: 20, COLS: 4, ROWS: 5, STACK_MAX: 12,
 MOB_LOSE: 160, MOB_WARN: [130, 145],
 HP_MUL0: 2, HP_MUL1: 8, HP_POW: 1.6, // 몹 체력 배율: 1라운드 HP_MUL0 -> HP_CURVE_R(50)라운드 HP_MUL1 로 거듭제곱 곡선(HP_POW), 그 뒤는 같은 곡선 연장(60R 약 x10.1)
 HP_K: 11, HP_GAMMA: 0.66,
 UP_STEP: 0.385, UP_STEP2: 0.0088, UP_COST0: 25, UP_COSTK: 5, UP_MAX: 25, UP_LV_CAP: 35,
 RANGE_UP: { STEP: 0.08, MAX: 3, COST: [20, 40, 60] }, // 무리별 사거리 강화(단계당 +8%)
 BOSS_UP: [10, 20, 30, 40, 50],
 RESONANCE: { 4: 2, 6: 4 }, RESONANCE_FIRST: 50,
 TICKET_GRADE: { 5: 2, 10: 2, 15: 2, 20: 3, 25: 3, 30: 3, 35: 4, 40: 4, 45: 4, 50: 5, 55: 5, 60: 5 },
 SCORE: { ROUND: 100, KILL_MUL: 0.667, UNIT_CAP: 20000, UNIT_MUL: 0.5, WIN: 3000, WIN_SEC: 20 },
};

// ---------- 시즌 / 닉네임 규칙 (서버 번들 build_engine 이 SEASONS-BEGIN~END 를 그대로 추출해 함수도 같은 정의를 쓴다) ----------
// SEASONS-BEGIN
// 시즌 규칙(단일 출처, 클라/서버/SQL season_current() 가 같은 규칙): 공개 시즌은 일요일 00:00 KST ~ 토요일 24:00 KST 7일 고정 반복.
// 시즌 id 는 날짜에서 계산한다(설정 행 없음). 옛 시즌(SEASONS)은 불변 기록 + 주간 시즌의 앵커 이전 구간.
// 날짜는 KST "YYYY-MM-DD", start/end 양끝 포함.
const SEASONS = [
 { id: 1, name: "시즌 1", start: "2026-10-27", end: "2026-11-07" }, // 옛 시즌(원래 11-15 까지였으나 주간 전환으로 토요일 11-07 에 마감)
];
const WEEK_ANCHOR = "2026-11-08"; // 일요일. 이날부터 주간 시즌: id 2 = 11-08~11-14, id 3 = 11-15~11-21 ...
const WEEK_FIRST_ID = 2;
function kstDate(ms) { // 한국 날짜 "YYYY-MM-DD" (기기 시간대와 무관)
 return new Date((ms == null ? Date.now() : ms) + 9 * 3600e3).toISOString().slice(0, 10);
}
function dayDiff(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5); }
function addDays(d, n) { return new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10); }
function seasonById(id) { // 시즌 id -> {id,name,start,end}. 1 미만/정수 아님은 null (미래 시즌도 계산해 돌려줌)
 if (!Number.isInteger(id) || id < 1) return null;
 const o = SEASONS.find((s) => s.id === id); if (o) return o;
 if (id < WEEK_FIRST_ID) return null;
 const st = addDays(WEEK_ANCHOR, (id - WEEK_FIRST_ID) * 7);
 return { id, name: "시즌 " + id, start: st, end: addDays(st, 6) };
}
function seasonIdOf(date) { // 날짜 -> 시즌 id (옛 시즌 시작 전이면 0)
 const d = date || kstDate();
 if (d >= WEEK_ANCHOR) return WEEK_FIRST_ID + Math.floor(dayDiff(WEEK_ANCHOR, d) / 7);
 for (const s of SEASONS) if (d >= s.start && d <= s.end) return s.id;
 return 0;
}
// 해당 날짜의 시즌 단계: live(진행중) / before(옛 시즌 시작 전, season=첫 시즌) / none. 주간 전환 이후에는 항상 live.
function seasonPhase(date) {
 const d = date || kstDate(), id = seasonIdOf(d);
 if (id) return { phase: "live", season: seasonById(id) };
 if (SEASONS.length && d < SEASONS[0].start) return { phase: "before", season: SEASONS[0] };
 return { phase: "none", season: null };
}
const NAME_BAD = ["fuck", "shit", "씨발", "시발", "병신", "좆"];
// 닉네임 검사: 2~10자, 한글/영문/숫자/공백/_.- , 앞뒤 공백 제거, 연속 공백은 1칸. 반환 {ok, name, err}
function checkName(raw, extraBad) {
 if (typeof raw !== "string") return { ok: false, err: "len" };
 const name = [...raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().replace(/\s+/g, " ")].join("");
 const n = [...name].length;
 if (n < 2 || n > 10) return { ok: false, err: "len" };
 if (!/^[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9 _.\-]+$/.test(name)) return { ok: false, err: "chars" };
 const flat = name.toLowerCase().replace(/[\s._\-0-9]/g, "");
 if (NAME_BAD.concat(extraBad || []).some((w) => flat.includes(w))) return { ok: false, err: "bad" };
 return { ok: true, name };
}
// SEASONS-END

// RULES-BEGIN
// ---------- 프라이빗 시즌 규칙 (rules): 평탄한 JSON. 서버 번들 build_engine 이 RULES-BEGIN~END 를 그대로 추출 ----------
// 키: rounds(50~200) + 모디파이어 최대 3개: hpMul mobSpeed mobCount bossTime noGrade gradeCap drawLimit noSell clanBan heroPool startMin killReward drawCost luckyWeek
const RULE_SPEC = {
 rounds: ["int", 50, 200], hpMul: ["num", 0.7, 2.5], mobSpeed: ["num", 0.8, 1.5], mobCount: ["num", 0.8, 1.6], bossTime: ["num", -10, 15],
 noGrade: ["int", 0, 2], gradeCap: ["int", 4, 6], drawLimit: ["int", 60, 300], noSell: ["bool"], clanBan: ["clans"], heroPool: ["heroes"],
 startMin: ["int", 0, 200], killReward: ["num", 0.5, 2], drawCost: ["int", 10, 25], luckyWeek: ["bool"],
};
function validateRules(rules) {
 if (rules == null || typeof rules !== "object" || Array.isArray(rules)) return { ok: false, err: "rules 형식 오류" };
 const out = {};
 for (const k of Object.keys(rules).sort()) {
  const sp = RULE_SPEC[k], v = rules[k];
  if (!sp) return { ok: false, err: "알 수 없는 규칙: " + k };
  if (sp[0] === "int" || sp[0] === "num") {
   if (typeof v !== "number" || !isFinite(v) || (sp[0] === "int" && !Number.isInteger(v)) || v < sp[1] || v > sp[2]) return { ok: false, err: "범위 오류: " + k };
   if (k === "noGrade" && v === 0) continue;
   out[k] = v;
  } else if (sp[0] === "bool") {
   if (v !== true && v !== false && v !== 0 && v !== 1) return { ok: false, err: "형식 오류: " + k };
   if (v) out[k] = true;
  } else if (sp[0] === "clans") {
   if (!Array.isArray(v) || v.length > 2 || v.some((c) => !Number.isInteger(c) || c < 0 || c > 3)) return { ok: false, err: "형식 오류: " + k };
   const u = Array.from(new Set(v)).sort((a, b) => a - b);
   if (u.length) out[k] = u;
  } else {
   if (!Array.isArray(v) || v.length > HEROES.length || v.some((h) => typeof h !== "string" || !HEROES.some((x) => x.id === h))) return { ok: false, err: "형식 오류: " + k };
   const u = Array.from(new Set(v)).sort();
   if (u.length) out[k] = u;
  }
 }
 if (Object.keys(out).filter((k) => k !== "rounds").length > 3) return { ok: false, err: "모디파이어는 최대 3개" };
 return { ok: true, rules: out };
}
// 키를 정렬한 JSON 문자열의 안정적 해시(FNV-1a 32비트 x2 -> 16자리 16진수, 순수 JS)
function rulesHash(rules) {
 const norm = (v) => Array.isArray(v) ? v.map(norm) : v && typeof v === "object" ? Object.keys(v).sort().reduce((o, k) => ((o[k] = norm(v[k])), o), {}) : v;
 const str = JSON.stringify(norm(rules || {}));
 let a = 0x811c9dc5, b = 0x9747b28c;
 for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193) >>> 0; b = Math.imul(b ^ c, 0x85ebca6b) >>> 0; b = (b ^ (b >>> 13)) >>> 0; }
 const h = (n) => ("00000000" + n.toString(16)).slice(-8);
 return h(a) + h(b);
}
// RULES-END

// ---------- 순수 헬퍼 ----------
function mulberry32(seed) {
 let a = seed >>> 0;
 return function () {
  a = (a + 0x6D2B79F5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
 };
}
function todayKey() { // 로컬 날짜 "YYYY-MM-DD"
 const d = new Date(), p = (n) => (n < 10 ? "0" : "") + n;
 return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
function dailySeed() { return parseInt(todayKey().replace(/-/g, ""), 10); }
function makeRngs(seed) {
 return {
  hero: mulberry32(seed),
  gacha: mulberry32((seed ^ 0xA5A5A5A5) >>> 0),
  merge: mulberry32((seed ^ 0x5A5A5A5A) >>> 0),
  misc: mulberry32((seed ^ 0x3C3C3C3C) >>> 0),
 };
}
function pickHero(rngHero, pool) {
 if (pool && pool.length) { // 규칙 heroPool: 풀 안에서 확률 비례(원래 확률 가중) 선택, 난수 1회 소비는 동일
  const hs = HEROES.filter((h) => pool.indexOf(h.id) >= 0), tot = hs.reduce((a, h) => a + h.prob, 0);
  let y = rngHero() * tot;
  for (const h of hs) { y -= h.prob; if (y < 0) return h; }
  return hs[hs.length - 1];
 }
 let x = rngHero() * 100;
 for (let i = 0; i < HEROES.length; i++) { x -= HEROES[i].prob; if (x < 0) return HEROES[i]; }
 return HEROES[0];
}
function gradeProbs(hero, rules) {
 const lucky = !!(hero && hero.fx && hero.fx.probMod === "lucky") || !!(rules && rules.luckyWeek);
 const p = GRADES.map(g => lucky ? g.luckyProb : g.prob);
 const ng = rules && rules.noGrade;
 if (ng) { // 가장 낮은 등급 N개 제외, 확률은 남은 등급에 비례 재분배(합 100)
  let t = 0;
  for (let i = 0; i < p.length; i++) { if (i < ng) p[i] = 0; t += p[i]; }
  for (let i = 0; i < p.length; i++) p[i] = p[i] * 100 / t;
 }
 return p;
}
function rollGrade(r, probs) {
 let x = r() * 100;
 for (let g = 0; g < probs.length; g++) { x -= probs[g]; if (x < 0) return g; }
 return 0;
}
function pickClan(r, ban) { // 규칙 clanBan: 금지 무리를 뺀 목록에서 같은 횟수(1회)의 난수로 선택
 if (!ban || !ban.length) return Math.floor(r() * 4);
 const ok = [0, 1, 2, 3].filter((c) => ban.indexOf(c) < 0);
 return ok[Math.floor(r() * ok.length)];
}
function rollChar(r, grade, ban) { return grade * 4 + pickClan(r, ban); }
function mergeResult(r, grade, ban) { return (grade + 1) * 4 + pickClan(r, ban); }
function hpMul(r) { const K = CONST; return K.HP_MUL0 + (K.HP_MUL1 - K.HP_MUL0) * Math.pow((r - 1) / (K.HP_CURVE_R - 1), K.HP_POW); } // 분모는 HP_CURVE_R(50) 고정: 50 초과는 같은 거듭제곱 곡선 연장
let UP_MUL = 1; // 히어로 fx.upCost 의 강화 비용 배율(현재 쓰는 히어로 없음). newGame 이 설정
function upgradeCost(bought) { const c = CONST.UP_COST0 + CONST.UP_COSTK * bought; return UP_MUL === 1 ? c : Math.round(c * UP_MUL); }
function dmgMul(lv) { return 1 + CONST.UP_STEP * lv + CONST.UP_STEP2 * lv * lv; } // 후반 가속(2차항)
function armorFactor(armorPct, pierce) { return 1 - (armorPct / 100) * (1 - (pierce || 0)); }
function charAt(grade, clan) { return CHARS[grade * 4 + clan]; }
function ticketGrade(round) { return CONST.TICKET_GRADE[round] != null ? CONST.TICKET_GRADE[round] : (round > CONST.ROUNDS_BASE && round % 10 === 0 ? CONST.TICKET_GRADE[CONST.ROUNDS_BASE] : -1); } // ROUNDS_BASE(60) 초과 보스(10라운드마다)는 마지막 값 유지
function roundInfo(r) {
 const B = CONST.ROUNDS_BASE;
 let row = ROUNDS[Math.max(1, Math.min(B, r)) - 1], boss = row[0] % 5 === 0;
 if (r > B) { // 확장 라운드(60 초과): 10라운드마다 보스(60/55 행 번갈아), 나머지는 마지막 챕터(56~59) 일반 몹 순환
  boss = r % 10 === 0;
  row = boss ? ROUNDS[[B - 1, B - 6][(r / 10 - B / 10 - 1) % 2]] : ROUNDS[B - 5 + ((r - B - 1) % 4)];
 }
 return { r: r > B ? r : row[0], ch: row[1], name: row[2], kind: row[3], hue: row[4], hp: row[5], armor: row[6],
  n: row[7], gap: row[8], speed: row[9], time: row[10], rew: row[11] == null ? 1 : row[11], boss };
}
// 표시 Lv = 구매 + 보너스 (상한 UP_LV_CAP). 공명 보너스는 포함하지 않음(game.js 가 bonus 에 반영하거나 별도 가산).
function clanLevel(S, c) {
 const u = S.up[c];
 return Math.min(CONST.UP_LV_CAP, u.bought + u.bonus);
}
// 필드에 같은 무리의 서로 다른 등급이 몇 종 있는가 -> 공명 보너스(4종 +2, 6종 +4; ease 만큼 필요 종류 감소)
function resonanceCount(slots, c) {
 const seen = {};
 let n = 0;
 for (const s of slots) if (s && s.ch % 4 === c && !s.hero && !seen[s.ch >> 2]) { seen[s.ch >> 2] = 1; n++; }
 return n;
}
function resonanceNeed(ease) { return [4 - (ease || 0), 6 - (ease || 0)]; } // 공명 단계별 필요 종류 수 (카멜레온 fx.resoEase 만큼 완화)
function resonanceBonus(slots, c, ease) {
 const n = resonanceCount(slots, c) + (ease || 0);
 return n >= 6 ? CONST.RESONANCE[6] : n >= 4 ? CONST.RESONANCE[4] : 0;
}
// 무리별 화력(유닛 점수 x 스택) 비중 [0..1] x4
function clanPower(slots) {
 const p = [0, 0, 0, 0];
 for (const s of slots) if (s && !s.hero) p[s.ch % 4] += GRADES[s.ch >> 2].pts * s.n;
 const t = p[0] + p[1] + p[2] + p[3];
 return t ? p.map(v => v / t) : p;
}
// 점수식 (G장)
function calcScore(round, kills, unitPts, win, bossLeftSec) {
 const K = CONST.SCORE;
 return K.ROUND * round + Math.floor(kills * K.KILL_MUL) + Math.floor(Math.min(unitPts, K.UNIT_CAP) * K.UNIT_MUL)
  + (win ? K.WIN + K.WIN_SEC * Math.max(0, Math.floor(bossLeftSec || 0)) : 0);
}
function unitPoints(slots) {
 let u = 0;
 for (const s of slots) if (s && !s.hero) u += GRADES[s.ch >> 2].pts * s.n;
 return u;
}

// MYHERO-BEGIN
// ---------- '내 영웅' v2 (GAME_VER 7): 디자인 20종 중 하나 + 코인 시장에서 산 능력. 서버 리플레이도 같은 함수를 쓴다(단일 출처). docs/내영웅_v2_스펙.md ----------
// mine = { design:"디자인id", items:{ 품목id: 켠 단계(1..max) }, equip:["스킬 품목id", ...최대 MY_EQUIP_MAX] }
// items 는 이번 판에 "켠" 능력이다(보유 단계 이하, 전투력 합 <= MY_POWER_CAP). 보유 단계(구매 기록)는 클라이언트(myhero.js) 저장값에만 있다.
// 기본 영웅은 모든 디자인이 같다(일반 공격만, 특수 능력 없음). 능력은 전부 items 에서 온다. 운빨 리그(HEROES 10종)는 이 구간과 무관.
// 랜덤 영웅 판·규칙(프라이빗 시즌) 판에는 적용되지 않는다(game.js newGame / replay.js).
const MY_DESIGNS = [
 { id: "bee", name: "꿀벌" }, { id: "goose", name: "거위" }, { id: "weasel", name: "족제비" }, { id: "whale", name: "고래" }, { id: "hedgehog", name: "고슴도치" },
 { id: "chameleon", name: "카멜레온" }, { id: "frog", name: "개구리" }, { id: "penguin", name: "펭귄" }, { id: "fennec", name: "사막여우" }, { id: "owlsage", name: "부엉이" },
 { id: "fox", name: "여우" }, { id: "cat", name: "고양이" }, { id: "bunny", name: "토끼" }, { id: "bear", name: "곰" }, { id: "panda", name: "판다" },
 { id: "dragon", name: "아기 용" }, { id: "unicorn", name: "유니콘" }, { id: "octopus", name: "문어" }, { id: "turtle", name: "거북이" }, { id: "raccoon", name: "너구리" },
];
const MY_CATS = [
 { k: "atk", name: "공격", ico: "⚔️" }, { k: "skill", name: "영웅·스킬", ico: "✨" }, { k: "reward", name: "보상", ico: "🎁" },
 { k: "eco", name: "경제", ico: "💎" }, { k: "guard", name: "방어·생존", ico: "🛡️" }, { k: "special", name: "특수", ico: "🔮" },
];
const MY_EQUIP_MAX = 2; // 장착 스킬 칸: [0] 기본 공격을 대체, [1] 필살(4번째 공격, 피해 x3)을 대체. [1] 이 없으면 필살도 [0] 방식
// 단계별 비용(코인): b 에서 시작해 단계마다 x g, 5 단위 반올림. 근거·판수 표: docs/내영웅_v2_스펙.md, tools/myhero_cost_sim.mjs
const myCost = (b, n, g) => Array.from({ length: n }, (_, i) => Math.round((b * Math.pow(g, i)) / 5) * 5);
const myPct = (x) => +(x * 100).toFixed(2);
// 스킬(영웅 유닛 공격 방식). fx/shot/aoe/st/pierce 는 같은 공격 방식의 CHARS 값을 옮겨 적은 것(그림·이펙트 재사용). k = 히어로 기본 피해 대비 배율, cd = 공격 간격 배율
const SK = (id, name, ico, tier, fx, shot, aoe, st, pierce, k, cd, b, txt) => ({ id, name, ico, cat: "skill", max: 1, pw: 0, cost: [b], tier, sk: { fx, shot, aoe, st, pierce, k, cd }, txt: () => txt });
const MY_ITEMS = [
 // 공격
 { id: "atk", name: "공격 훈련", ico: "⚔️", cat: "atk", max: 10, pw: 1, cost: myCost(25, 10, 1.38), txt: (l) => `모든 유닛 공격력 +${myPct(0.005 * l)}%`, ap: (f, l) => { f.atkMul = 1 + 0.005 * l; } },
 { id: "spd", name: "속사 훈련", ico: "💨", cat: "atk", max: 5, pw: 1, cost: myCost(40, 5, 1.55), txt: (l) => `모든 유닛 공격 속도 +${myPct(0.008 * l)}%`, ap: (f, l) => { f.atkSpd = 1 + 0.008 * l; } },
 { id: "range", name: "매의 눈", ico: "🎯", cat: "atk", max: 5, pw: 1, cost: myCost(40, 5, 1.55), txt: (l) => `모든 유닛 사거리 +${l}%`, ap: (f, l) => { f.rangeMul = 0.01 * l; } },
 { id: "boss", name: "보스 사냥", ico: "🗡️", cat: "atk", max: 5, pw: 1, cost: myCost(40, 5, 1.55), txt: (l) => `보스에게 주는 피해 +${l}%`, ap: (f, l) => { f.bossDmg = 1 + 0.01 * l; } },
 { id: "growth", name: "성장 본능", ico: "📈", cat: "atk", max: 5, pw: 1, cost: myCost(50, 5, 1.55), txt: (l) => `라운드마다 모든 피해 +${myPct(0.0003 * l)}% 누적`, ap: (f, l) => { f.roundDmg = 0.0003 * l; } },
 // 영웅·스킬
 { id: "hpow", name: "영웅 근력", ico: "💪", cat: "skill", max: 10, pw: 1, cost: myCost(20, 10, 1.35), txt: (l) => `영웅 유닛 피해 +${l * 20}%`, ap: (f, l) => { f.heroAtk = 1 + 0.2 * l; } },
 { id: "hlv", name: "영웅 지휘", ico: "🎖️", cat: "skill", max: 5, pw: 1, cost: myCost(45, 5, 1.55), txt: (l) => `영웅 유닛 Lv = 최고 공업 x ${50 + l * 10}%`, ap: (f, l) => { f.heroLvK = 0.5 + 0.1 * l; } },
 SK("sk_tongue", "끈끈 혀", "👅", 1, "tongue", ["tongue", "#ff6f9c"], null, { slow: 0.15, dur: 1.5 }, 0, 1.1, 0.8, 120, "영웅 공격이 혀 채찍으로 바뀜(빠름·둔화 15%)"),
 SK("sk_slash", "불씨 할퀴기", "🐾", 1, "slash", ["claw", "#ff7a2e"], null, { burn: 0.4, dur: 2 }, 0, 1, 0.6, 120, "영웅 공격이 할퀴기로 바뀜(아주 빠름·화상)"),
 SK("sk_wave", "물결 파동", "🌊", 1, "wave", ["bubblewave", "#7fc4ff"], null, { slow: 0.2, dur: 1.5 }, 0, 1.15, 1, 120, "영웅 공격이 물결로 바뀜(둔화 20%)"),
 SK("sk_lob", "대나무 투척", "🎋", 1, "lob", ["bamboo", "#6fcf7f"], { R: 50, sp: 0.6, delay: 0 }, null, 0, 0.9, 1.15, 120, "영웅 공격이 던지기로 바뀜(범위 피해)"),
 SK("sk_chain", "연쇄 번개", "⚡", 2, "chain", ["lightning", "#ffd54f"], { jumps: 3, R: 70, fall: 0.7 }, null, 0.05, 0.85, 1, 300, "영웅 공격이 3번 튀는 번개로 바뀜"),
 SK("sk_breath", "불꽃 숨결", "🔥", 2, "breath", ["flame", "#ff8f4d"], { R: 42, sp: 0.4, delay: 0 }, { burn: 0.4, dur: 2 }, 0, 0.9, 1, 300, "영웅 공격이 불꽃 숨결로 바뀜(범위·화상)"),
 SK("sk_roar", "대지 포효", "🪨", 2, "roar", ["quake", "#8fb27a"], { R: 55, sp: 0.5, delay: 0 }, null, 0, 1, 1.2, 300, "영웅 공격이 포효로 바뀜(범위 피해)"),
 SK("sk_beam", "달빛 광선", "🌙", 2, "beam", ["moonbeam", "#b9c4e6"], { line: 16, sp: 0.6 }, null, 0.4, 0.9, 1.05, 300, "영웅 공격이 관통 광선으로 바뀜(방어 무시 40%)"),
 SK("sk_nova", "불꽃 고리", "💫", 3, "nova", ["firering", "#ff7a5c"], { R: 138, sp: 1, all: 1 }, { burn: 0.4, dur: 2 }, 0, 0.5, 1.3, 600, "영웅 주변 전체를 불꽃 고리로 공격"),
 SK("sk_meteor", "별똥 낙하", "☄️", 3, "meteor", ["meteor", "#ffd54f"], { R: 70, sp: 1, delay: 0.6 }, null, 0.1, 0.9, 1.6, 600, "영웅 공격이 늦게 떨어지는 큰 운석으로 바뀜"),
 SK("sk_storm", "별빛 폭풍", "🌟", 3, "storm", ["starstorm", "#ffe27a"], { all: 1, sp: 1 }, null, 1, 0.3, 1.4, 600, "사거리 안 모든 적을 별빛으로 공격(방어 무시)"),
 // 보상
 { id: "kill", name: "사냥 보상", ico: "🎁", cat: "reward", max: 6, pw: 1, cost: myCost(35, 6, 1.45), txt: (l) => `처치 보상 +${myPct(0.0125 * l)}%`, ap: (f, l) => { f.killMul = 1 + 0.0125 * l; } },
 { id: "bounty", name: "보스 현상금", ico: "💰", cat: "reward", max: 5, pw: 1, cost: myCost(30, 5, 1.5), txt: (l) => `보스 처치 미네랄 +${l * 3}`, ap: (f, l) => { f.bossBonus = 3 * l; } },
 { id: "coin", name: "코인 행운", ico: "🪙", cat: "reward", max: 5, pw: 1, cost: myCost(60, 5, 1.6), txt: (l) => `이 영웅 판의 기본 코인 +${l * 5}%`, ap: () => {} }, // 게임 영향 없음(정산 coinsFor 의 4번째 인자 = mineCoinLv)
 // 경제
 { id: "start", name: "비상금", ico: "💎", cat: "eco", max: 6, pw: 1, cost: myCost(25, 6, 1.45), txt: (l) => `시작 미네랄 +${l * 4}`, ap: (f, l) => { f.startMin = 4 * l; } },
 { id: "income", name: "꼬박꼬박", ico: "📦", cat: "eco", max: 3, pw: 2, cost: myCost(120, 3, 1.7), txt: (l) => `라운드마다 미네랄 +${l}`, ap: (f, l) => { f.roundMin = l; } },
 { id: "drawc", name: "뽑기 할인", ico: "🎟️", cat: "eco", max: 1, pw: 4, cost: [900], txt: (l) => `뽑기 비용 -${l}`, ap: (f, l) => { f.drawCost = l; } },
 { id: "upc", name: "공업 할인", ico: "🏷️", cat: "eco", max: 5, pw: 1, cost: myCost(40, 5, 1.55), txt: (l) => `공업 강화 비용 -${l}%`, ap: (f, l) => { f.upCost = 1 - 0.01 * l; } },
 { id: "sell", name: "되팔기", ico: "♻️", cat: "eco", max: 4, pw: 1, cost: myCost(25, 4, 1.5), txt: (l) => `유닛 판매가 +${l * 5}%`, ap: (f, l) => { f.sellMul = 1 + 0.05 * l; } },
 // 방어·생존
 { id: "btime", name: "버티기", ico: "⏳", cat: "guard", max: 5, pw: 1, cost: myCost(40, 5, 1.55), txt: (l) => `보스 제한시간 +${l}초`, ap: (f, l) => { f.bossTime = l; } },
 { id: "slow", name: "끈적 발판", ico: "🫧", cat: "guard", max: 5, pw: 1, cost: myCost(40, 5, 1.55), txt: (l) => `모든 몹 이동 속도 -${l}%`, ap: (f, l) => { f.mobSlow = 0.01 * l; } },
 { id: "frost", name: "서리 기운", ico: "❄️", cat: "guard", max: 4, pw: 1, cost: myCost(40, 4, 1.55), txt: (l) => `모든 공격 둔화 +${myPct(0.015 * l)}%p`, ap: (f, l) => { f.slowPlus = 0.015 * l; } },
 { id: "bhp", name: "보스 약화", ico: "🩹", cat: "guard", max: 5, pw: 1, cost: myCost(45, 5, 1.55), txt: (l) => `보스 체력 -${l}%`, ap: (f, l) => { f.bossHp = 1 - 0.01 * l; } },
 // 특수
 { id: "reso", name: "공명 감각", ico: "🌈", cat: "special", max: 1, pw: 4, cost: [1300], txt: () => "공명에 필요한 종류 1 줄임", ap: (f) => { f.resoEase = 1; } },
 { id: "merge", name: "연금술", ico: "⚗️", cat: "special", max: 5, pw: 1, cost: myCost(60, 5, 1.55), txt: (l) => `합성 ${myPct(0.006 * l)}% 확률로 한 등급 더 위`, ap: (f, l) => { f.mergeUp = 0.006 * l; } },
 { id: "trophy", name: "전리품 훈장", ico: "🏅", cat: "special", max: 1, pw: 4, cost: [1200], txt: () => "보스 6마리 처치마다 모든 무리 공업 +1", ap: (f) => { f.bossUp = 1; f.bossUpEvery = 6; } },
 { id: "lucky", name: "행운 뽑기", ico: "🍀", cat: "special", max: 3, pw: 2, cost: [250, 500, 900], txt: (l) => `뽑기 ${[0, 16, 13, 10][l]}번째마다 무료`, ap: (f, l) => { f.freeDraw = [0, 16, 13, 10][l]; } },
 { id: "burn", name: "불씨", ico: "🕯️", cat: "special", max: 4, pw: 1, cost: myCost(30, 4, 1.45), txt: (l) => `화상 지속 +${l * 10}%`, ap: (f, l) => { f.burnDur = 1 + 0.1 * l; } },
];
// 선행 조건(스킬만): 2단계 스킬은 1단계 스킬 하나 이상, 3단계 스킬은 2단계 스킬 하나 이상 보유. 스킬은 전투력 0 이라 보유한 스킬은 items 에 늘 같이 보낸다
const MY_REQ_TXT = { 2: "1단계 스킬 하나 보유", 3: "2단계 스킬 하나 보유" };
const myItem = (id) => MY_ITEMS.find((x) => x.id === id) || null;
const myHasTier = (items, t) => MY_ITEMS.some((x) => x.tier === t && items[x.id] >= 1);
function myReqOk(id, items) {
 const it = myItem(id); if (!it || !it.tier || it.tier === 1) return !!it;
 if (it.tier === 2) return myHasTier(items, 1);
 return myHasTier(items, 2);
}
const myPower = (items) => MY_ITEMS.reduce((a, x) => a + ((items && items[x.id]) | 0) * x.pw, 0);
// 전투력 상한: 한 판에 켤 수 있는 능력 단계 x pw 합. 산 능력(보유)은 전부 쓸 수 없고 상한 안에서 골라 켠다(= 개성). 서버는 구매를 확인 못 하므로 상한 조합이 최악의 경우(tools/sim_bot.mjs mine)
const MY_POWER_CAP = 40, MY_POWER_ALL = MY_ITEMS.reduce((a, x) => a + x.max * x.pw, 0);
// 다음 단계(lvNext, 1부터) 비용. 없는 품목·범위 밖이면 -1
function itemCost(id, lvNext) { const it = myItem(id); return it && Number.isInteger(lvNext) && lvNext >= 1 && lvNext <= it.max ? it.cost[lvNext - 1] : -1; }
function mineTotalCost(mine) { let t = 0; const it = (mine && mine.items) || {}; for (const k in it) for (let l = 1; l <= (it[k] | 0); l++) t += Math.max(0, itemCost(k, l)); return t; }
const MY_FULL_COST = MY_ITEMS.reduce((a, x) => a + x.cost.reduce((s, c) => s + c, 0), 0);
const mineCoinLv = (mine) => (mine && mine.items && mine.items.coin) | 0; // coinsFor 4번째 인자
// 검증/정리. 반환 {ok, mine:{design,items,equip}} | {ok:false, err}. 레거시 {hero,up} 는 err "mine_legacy"(클라이언트가 migrateLegacyMine 으로 바꿔야 함)
function validateMine(m) {
 if (m == null || typeof m !== "object" || Array.isArray(m)) return { ok: false, err: "mine 형식 오류" };
 if (m.design === undefined && m.hero !== undefined) return { ok: false, err: "mine_legacy" };
 if (typeof m.design !== "string" || !MY_DESIGNS.some((d) => d.id === m.design)) return { ok: false, err: "mine 디자인 오류" };
 const src = m.items == null ? {} : m.items;
 if (typeof src !== "object" || Array.isArray(src)) return { ok: false, err: "mine items 형식 오류" };
 const keys = Object.keys(src);
 if (keys.length > MY_ITEMS.length) return { ok: false, err: "mine items 개수 초과" };
 const items = {};
 for (const it of MY_ITEMS) { // 카탈로그 순서로 정리(저장·해시 안정)
  if (!(it.id in src)) continue;
  const v = src[it.id];
  if (!Number.isInteger(v) || v < 0 || v > it.max) return { ok: false, err: "mine 단계 범위 오류: " + it.id };
  if (v > 0) items[it.id] = v;
 }
 for (const k of keys) if (!myItem(k)) return { ok: false, err: "mine 품목 오류: " + String(k).slice(0, 20) };
 for (const k in items) if (!myReqOk(k, items)) return { ok: false, err: "mine 선행 조건 오류: " + k };
 if (myPower(items) > MY_POWER_CAP) return { ok: false, err: "mine 전투력 상한 초과" };
 const eq = m.equip == null ? [] : m.equip;
 if (!Array.isArray(eq) || eq.length > MY_EQUIP_MAX) return { ok: false, err: "mine 장착 수 초과" };
 for (let i = 0; i < eq.length; i++) {
  const it = myItem(eq[i]);
  if (!it || !it.sk || items[it.id] !== 1 || eq.indexOf(eq[i]) !== i) return { ok: false, err: "mine 장착 오류" };
 }
 return { ok: true, mine: { design: m.design, items, equip: eq.slice() } };
}
// 기본 영웅(모든 디자인 공통): 일반 공격만, 특수 능력 없음
const MY_BASE = { id: "", name: "", prob: 0, rule: "일반 공격", fx: {} };
// 검증된 mine 으로 기본 영웅 복사본을 만든다. id = 디자인 id(그림 키). fx 키는 game.js 가 이미 읽는 것 + heroAtk/hsk/hsk2(영웅 유닛 공격)
function applyMine(mine) {
 if (arguments.length > 1) mine = arguments[1]; // 옛 호출 applyMine(base, mine) 호환
 const d = MY_DESIGNS.find((x) => x.id === mine.design) || MY_DESIGNS[0], fx = {}, it = mine.items || {};
 for (const x of MY_ITEMS) if (x.ap && it[x.id]) x.ap(fx, it[x.id]);
 const eq = (mine.equip || []).map(myItem).filter((x) => x && x.sk);
 if (eq[0]) fx.hsk = eq[0].sk;
 if (eq[1]) fx.hsk2 = eq[1].sk;
 const rule = eq.length ? `기본: ${eq[0].name}${eq[1] ? ` · 필살: ${eq[1].name}` : ""}` : MY_BASE.rule;
 return Object.assign({}, MY_BASE, { id: d.id, name: d.name, rule, fx, look: null });
}
// 옛 저장 영웅 {hero, up:{atk,rew,disc,start}} -> 새 형식. 옛 강화는 구매액 전액 환불(refund 코인)하고 능력은 비운다(디자인 = 옛 영웅 id)
function migrateLegacyMine(old) {
 const hero = old && typeof old.hero === "string" ? old.hero : old && typeof old.id === "string" ? old.id : "";
 const up = (old && old.up) || {};
 let refund = 0;
 for (const dd of MY_HERO.DIRS) { const lv = Math.max(0, Math.min(dd.max, up[dd.k] | 0)); for (let i = 0; i < lv; i++) refund += MY_HERO.COST[i]; }
 return { design: MY_DESIGNS.some((x) => x.id === hero) ? hero : MY_DESIGNS[0].id, items: {}, equip: [], refund };
}
// 레거시(v1) 상수: 등록 수 MAX 와 환불 계산(migrateLegacyMine)에만 쓴다. 새 규칙은 MY_ITEMS
const MY_HERO = {
 MAX: 3, TOTAL_CAP: 10,
 COST: [60, 100, 160, 240, 340],
 DIRS: [{ k: "atk", max: 5 }, { k: "rew", max: 5 }, { k: "disc", max: 3 }, { k: "start", max: 5 }],
};
const myUpSum = (up) => MY_HERO.DIRS.reduce((a, d) => a + ((up && up[d.k]) | 0), 0);
// 판이 끝났을 때 받는 기본 코인: 10라운드부터 라운드당 1, 처치 50기당 1, 클리어 +30, 코인 행운 단계당 +5% (4번째 인자 = mineCoinLv(mine))
function coinsFor(round, kills, win, coinLv) {
 const base = Math.max(0, round - 9) + Math.floor(kills / 50) + (win ? 30 : 0);
 return Math.floor(base * (1 + 0.05 * (coinLv | 0)));
}
// MYHERO-END
