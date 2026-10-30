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
 {"id":"darami","name":"도토리 대장 다람이","prob":9.6,"rule":"시작 미네랄 +30, 숲무리 강화 Lv +3","fx":{"startMin":30,"lv":[3,0,0,0]},"look":{"shape":[1,0.95],"c1":"#d9a066","c2":"#fbeedd","c3":"#8b5a2b","base":[["ear","round","#f2a7a7"],["mark","stripes","#8b5a2b"],["tail","fluffy","#d9a066"]],"face":["dot","smile"],"parts":[["hat","acorncap","#9b6a3c"],["acc","scarf","#58c26a"]]}},
 {"id":"hwarang","name":"불꽃 대장 화랑이","prob":8.4,"rule":"불꽃무리 강화 Lv +5 (시작 보너스 없음)","fx":{"lv":[0,5,0,0]},"look":{"shape":[1,0.95],"c1":"#d9663a","c2":"#fff0dc","c3":"#ffd24d","base":[["ear","round","#fff0dc"],["mark","cheek","#fff0dc"],["tail","flame","#ff9f43"]],"face":["dot","smile"],"parts":[["hat","headband","#e8442e"],["acc","scarf","#ffd24d"]]}},
 {"id":"duduk","name":"두더지 상인 두둑이","prob":7.8,"rule":"매 라운드 시작 +8 미네랄","fx":{"roundMin":8},"look":{"shape":[1.05,0.92],"c1":"#8a6a58","c2":"#d9c0ae","c3":"#ffd54f","base":[["ear","nub","#d9c0ae"],["nose","pink","#ffb3c6"]],"face":["sleepy","smile"],"parts":[["hat","minerhelmet","#ffd54f"],["acc","coinbag","#ffd54f"]]}},
 {"id":"banjjak","name":"수집가 까치 반짝이","prob":6.6,"rule":"한 등급의 4종을 모두 동시 보유할 때마다 +70 (등급당 1회, 최대 8회)","fx":{"collect":{"bonus":70}},"look":{"shape":[1,0.95],"c1":"#4a5a7a","c2":"#ffffff","c3":"#3b9dff","base":[["ear","tuft","#3b9dff"],["beak","#ffd54f"]],"face":["big","beak"],"parts":[["hat","monocle","#ffd54f"],["acc","gem","#ff4f81"]]}},
 {"id":"bongbong","name":"저금통 토끼 봉봉이","prob":6.6,"rule":"노멀 [솜토끼] 10기를 동시 보유하면 +200 (1회)","fx":{"hold":{"ch":4,"n":10,"bonus":200}},"look":{"shape":[1.05,1],"c1":"#ffd9e6","c2":"#ffffff","c3":"#ff9ec0","base":[["ear","long","#ff9ec0"],["tail","puff","#ffffff"]],"face":["dot","smile"],"parts":[["hat","piggybank","#ff9ec0"],["acc","coin","#ffd54f"]]}},
 {"id":"buung","name":"부엉박사","prob":6,"rule":"노멀 [달부엉]이 뽑기로 나올 때마다 +20 (합성/선택권 제외)","fx":{"drawBonus":{"ch":7,"bonus":20}},"look":{"shape":[1.05,0.98],"c1":"#c9b6f2","c2":"#f1eaff","c3":"#ffd54f","base":[["ear","tuft","#a58be0"],["beak","#ffd54f"]],"face":["big","beak"],"parts":[["hat","gradcap","#3a3a5a"],["acc","glasses","#3a3a5a"]]}},
 {"id":"lucky","name":"행운 고양이 럭키","prob":4.8,"rule":"유니크 확률 -1.5%p(5.5→4.0), 히든 이상 확률 2배 (부족분은 커먼에서 차감 없이 합계 100 유지: 표 참조)","fx":{"probMod":"lucky"},"look":{"shape":[1.02,0.95],"c1":"#fffaf0","c2":"#ffffff","c3":"#ffd54f","base":[["ear","point","#ffb3c6"],["whisker"],["tail","puff","#ffffff"]],"face":["dot","cat"],"parts":[["acc","bell","#ffd54f"],["acc","coinpaw","#ffd54f"]]}},
 {"id":"nulgul","name":"도박꾼 너구리 너굴","prob":4.2,"rule":"처치 시 7% 확률로 처치 보상 3배, 보스 처치 시 +100 추가","fx":{"killLuck":{"p":0.07,"mul":3},"bossBonus":100},"look":{"shape":[1.08,0.95],"c1":"#8a7a6a","c2":"#e9dccb","c3":"#3a3030","base":[["ear","round","#3a3030"],["mark","mask","#3a3030"],["tail","striped","#5a4a40"]],"face":["sharp","smile"],"parts":[["hat","tophat","#3a3a5a"],["acc","dice","#ffffff"]]}},
 {"id":"moonseer","name":"달토끼 점쟁이","prob":3.6,"rule":"매 라운드 시작 시 8% 확률로 히든 등급 유닛 1기 획득","fx":{"roundHidden":0.08},"look":{"shape":[1,1],"c1":"#e8e0ff","c2":"#ffffff","c3":"#8a7bff","base":[["ear","long","#c9b6f2"],["tail","puff","#ffffff"]],"face":["sleepy","smile"],"parts":[["hat","moonhat","#8a7bff"],["acc","crystalball","#bfe6ff"]]}},
 {"id":"firstmalang","name":"첫 말랑","prob":2.4,"rule":"시작 미네랄 +50, 모든 무리 강화 Lv +2","fx":{"startMin":50,"lv":[2,2,2,2]},"look":{"shape":[1,0.98],"c1":"#ffffff","c2":"#fff6d6","c3":"#ffd54f","base":[["ear","none"]],"face":["star","smile"],"parts":[["halo","ring","#ffef9a"],["acc","gem","#ff9ec0"]]}},
 {"id":"durumi","name":"대장장이 두루미","prob":4,"rule":"모든 강화 비용 -15%","fx":{"upCost":0.85},"look":{"shape":[1,1],"c1":"#f4f4f8","c2":"#ffffff","c3":"#e8442e","base":[["ear","tuft","#e8442e"],["beak","#ffb347"]],"face":["big","beak"],"parts":[["hat","headband","#e8442e"],["acc","armor","#8a97a8"]]}},
 {"id":"oduck","name":"에누리 오리","prob":4,"rule":"유닛 판매가 +50%","fx":{"sellMul":1.5},"look":{"shape":[1.08,0.95],"c1":"#ffe066","c2":"#fff6c2","c3":"#ff9f1c","base":[["ear","none"],["beak","#ff9f1c"],["tail","puff","#ffe066"]],"face":["dot","beak"],"parts":[["hat","tophat","#c0392b"],["acc","coinbag","#ffd54f"]]}},
 {"id":"fairy","name":"반딧 요정","prob":4,"rule":"뽑기 비용 -2 (15→13)","fx":{"drawCost":2},"look":{"shape":[0.95,1],"c1":"#b8f27a","c2":"#f4ffd6","c3":"#fff59d","base":[["ear","leaf","#7ed957"],["tail","ember","#fff59d"]],"face":["star","smile"],"parts":[["hat","sprout","#58c26a"],["acc","wand","#fff59d"]]}},
 {"id":"compound","name":"복리 햄스터","prob":4,"rule":"라운드 시작 시 보유 미네랄 100당 +2 (최대 +20)","fx":{"interest":{"per":100,"gain":2,"max":20}},"look":{"shape":[1.1,0.95],"c1":"#ffcf9e","c2":"#fff1e0","c3":"#ffd54f","base":[["ear","round","#ff9ec0"],["mark","cheek","#ff9ec0"]],"face":["dot","smile"],"parts":[["hat","ring","#ffd54f"],["acc","coin","#ffd54f"]]}},
 {"id":"turtle","name":"느릿 거북","prob":5,"rule":"모든 몹 이동 속도 -10%","fx":{"mobSlow":0.1},"look":{"shape":[1.1,0.92],"c1":"#7fc48a","c2":"#d9f2dc","c3":"#4e8f5a","base":[["ear","nub","#7fc48a"],["mark","spots","#4e8f5a"]],"face":["sleepy","smile"],"parts":[["acc","shell","#a0724a"],["acc","bamboo","#58c26a"]]}},
 {"id":"hawk","name":"사냥꾼 매","prob":4,"rule":"보스에게 주는 피해 +20%","fx":{"bossDmg":1.2},"look":{"shape":[1,0.98],"c1":"#8b6b4a","c2":"#f0e0c8","c3":"#3a4a6a","base":[["ear","tuft","#5a4632"],["beak","#ffd54f"]],"face":["sharp","beak"],"parts":[["hat","headband","#3a4a6a"],["acc","cape","#3a4a6a"]]}},
 {"id":"twinsq","name":"쌍둥이 다람쥐","prob":3,"rule":"합성 시 8% 확률로 결과 유닛 1기 추가 (자리 없으면 무효)","fx":{"mergeTwin":0.08},"look":{"shape":[1,0.95],"c1":"#c98a52","c2":"#fbeedd","c3":"#58c26a","base":[["ear","point","#8b5a2b"],["tail","fluffy","#c98a52"]],"face":["dot","smile"],"parts":[["hat","flowerpair","#ffb3c6"],["acc","clover","#58c26a"]]}},
 {"id":"frostfox","name":"서리 여우","prob":4,"rule":"모든 공격에 둔화 +15%p 추가 (최대 75%)","fx":{"slowPlus":0.15},"look":{"shape":[1,0.95],"c1":"#bfe8ff","c2":"#ffffff","c3":"#4aa8ff","base":[["ear","point","#ffffff"],["tail","fluffy","#ffffff"],["mark","cheek","#9fd8ff"]],"face":["dot","smile"],"parts":[["hat","star","#9fd8ff"],["acc","scarf","#4aa8ff"]]}},
 {"id":"ember","name":"불씨 도깨비","prob":4,"rule":"보스 제한시간 +10초, 화상 지속 +30%","fx":{"bossTime":10,"burnDur":1.3},"look":{"shape":[1.05,0.98],"c1":"#ff7043","c2":"#ffe0b2","c3":"#ffb300","base":[["ear","bump","#ff7043"],["tail","ember","#ffb300"]],"face":["sharp","fang"],"parts":[["hat","crown","#ffb300"],["acc","lavadrip","#ff5722"]]}},
 {"id":"moleart","name":"합성 장인 두더쥐","prob":4,"rule":"합성에 성공할 때마다 미네랄 +3","fx":{"mergeMin":3},"look":{"shape":[1.05,0.92],"c1":"#6d5b6a","c2":"#d9c8d6","c3":"#7ad0c8","base":[["ear","nub","#d9c8d6"],["nose","pink","#ffb3c6"],["mark","belly","#d9c8d6"]],"face":["sleepy","smile"],"parts":[["hat","headband","#ffd54f"],["acc","gem","#7ad0c8"]]}},
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
 [50,10,"어둠의 말랑신","demon",275,286440,71,1,0,25,75,1],
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
];

const CONST = {
 W: 360, H: 400, DT: 1 / 60,
 ROUNDS: 50, ROUND_SEC: 20, SPAWN_FRAC: 0.8, BOSS_DELAY: 3,
 DRAW_COST: 15, START_MIN: 50, KILL_REWARD: 2, BOSS_REWARD: 50,
 SLOTS: 20, COLS: 4, ROWS: 5, STACK_MAX: 12,
 MOB_LOSE: 160, MOB_WARN: [130, 145],
 HP_MUL0: 2, HP_MUL1: 8, HP_POW: 1.6, // 몹 체력 배율: 1라운드 HP_MUL0 -> 50라운드 HP_MUL1 로 거듭제곱 곡선(HP_POW)으로 상승
 HP_K: 11, HP_GAMMA: 0.66,
 UP_STEP: 0.35, UP_COST0: 25, UP_COSTK: 5, UP_MAX: 25, UP_LV_CAP: 35,
 BOSS_UP: [10, 20, 30, 40],
 RESONANCE: { 4: 2, 6: 4 }, RESONANCE_FIRST: 50,
 TICKET_GRADE: { 5: 2, 10: 2, 15: 2, 20: 3, 25: 3, 30: 3, 35: 4, 40: 4, 45: 4, 50: 5 },
 SCORE: { ROUND: 100, KILL_MUL: 0.667, UNIT_CAP: 20000, UNIT_MUL: 0.5, WIN: 3000, WIN_SEC: 20 },
};

// ---------- 시즌 / 닉네임 규칙 (서버 번들 build_engine 이 SEASONS-BEGIN~END 를 그대로 추출해 함수도 같은 정의를 쓴다) ----------
// SEASONS-BEGIN
// 시즌 정의의 단일 출처. 날짜는 KST(한국 시간) "YYYY-MM-DD", start/end 양끝 포함. 다음 시즌은 배열 끝에 추가한다(겹치지 않게).
const SEASONS = [
 { id: 1, name: "시즌 1", start: "2026-10-27", end: "2026-11-15" },
];
function kstDate(ms) { // 한국 날짜 "YYYY-MM-DD" (기기 시간대와 무관)
 return new Date((ms == null ? Date.now() : ms) + 9 * 3600e3).toISOString().slice(0, 10);
}
function dayDiff(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5); }
// 해당 날짜의 시즌 단계: live(진행중) / before(시작 전, season=다음 시즌) / after(마지막 시즌 종료) / none
function seasonPhase(date) {
 const d = date || kstDate();
 for (const s of SEASONS) if (d >= s.start && d <= s.end) return { phase: "live", season: s };
 for (const s of SEASONS) if (d < s.start) return { phase: "before", season: s };
 if (SEASONS.length) return { phase: "after", season: SEASONS[SEASONS.length - 1] };
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
function heroOfDay(rngHero) {
 let x = rngHero() * 100;
 for (let i = 0; i < HEROES.length; i++) { x -= HEROES[i].prob; if (x < 0) return HEROES[i]; }
 return HEROES[0];
}
function gradeProbs(hero) {
 const lucky = !!(hero && hero.fx && hero.fx.probMod === "lucky");
 return GRADES.map(g => lucky ? g.luckyProb : g.prob);
}
function rollGrade(r, probs) {
 let x = r() * 100;
 for (let g = 0; g < probs.length; g++) { x -= probs[g]; if (x < 0) return g; }
 return 0;
}
function rollChar(r, grade) { return grade * 4 + Math.floor(r() * 4); }
function mergeResult(r, grade) { return (grade + 1) * 4 + Math.floor(r() * 4); }
function hpMul(r) { const K = CONST; return K.HP_MUL0 + (K.HP_MUL1 - K.HP_MUL0) * Math.pow((Math.min(r, K.ROUNDS) - 1) / (K.ROUNDS - 1), K.HP_POW); }
let UP_MUL = 1; // 히어로(대장장이 두루미)의 강화 비용 배율. newGame 이 설정
function upgradeCost(bought) { const c = CONST.UP_COST0 + CONST.UP_COSTK * bought; return UP_MUL === 1 ? c : Math.round(c * UP_MUL); }
function dmgMul(lv) { return 1 + CONST.UP_STEP * lv; }
function armorFactor(armorPct, pierce) { return 1 - (armorPct / 100) * (1 - (pierce || 0)); }
function charAt(grade, clan) { return CHARS[grade * 4 + clan]; }
function ticketGrade(round) { return CONST.TICKET_GRADE[round] != null ? CONST.TICKET_GRADE[round] : -1; }
function roundInfo(r) {
 const row = ROUNDS[Math.max(1, Math.min(CONST.ROUNDS, r)) - 1];
 return { r: row[0], ch: row[1], name: row[2], kind: row[3], hue: row[4], hp: row[5], armor: row[6],
  n: row[7], gap: row[8], speed: row[9], time: row[10], rew: row[11] == null ? 1 : row[11], boss: row[0] % 5 === 0 };
}
// 표시 Lv = 구매 + 보너스 (상한 UP_LV_CAP). 공명 보너스는 포함하지 않음(game.js 가 bonus 에 반영하거나 별도 가산).
function clanLevel(S, c) {
 const u = S.up[c];
 return Math.min(CONST.UP_LV_CAP, u.bought + u.bonus);
}
// 필드에 같은 무리의 서로 다른 등급이 몇 종 있는가 -> 공명 보너스(4종 +2, 6종 +4)
function resonanceCount(slots, c) {
 const seen = {};
 let n = 0;
 for (const s of slots) if (s && s.ch % 4 === c && !s.hero && !seen[s.ch >> 2]) { seen[s.ch >> 2] = 1; n++; }
 return n;
}
function resonanceBonus(slots, c) {
 const n = resonanceCount(slots, c);
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
