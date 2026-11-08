# iOS 발열·배터리 잔존 원인 분석 (29bbff2 이후, 읽기 전용 분석)

작성 기준: 커밋 29bbff2 시점의 game.js, graphics.js, ui.js, index.html. 코드는 수정하지 않았다.
줄 번호는 이 시점 기준이다. 다른 에이전트가 동시에 수정 중이므로 수정 전에 다시 grep 해야 한다.

## 계측 요약 (node + 가짜 2D 컨텍스트로 호출 수만 셈. iOS 실측이 아니다)
스크립트: 스크래치패드의 meas.js. data.js, graphics.js, game.js 를 vm 으로 올리고 ui 함수는 스텁으로 바꿨다. 유닛 12기와 몹 81기(종류 1, id 변형 4)를 넣고 DPR 2 기준(cv 780x866)으로 쟀다.
- 캐시만 쓰는 프레임은 2D 호출 약 2,380회다. 20fps 굽기 버킷이 바뀌는 프레임(3프레임마다 1회)은 약 5,940회다.
- 굽기는 초당 약 1,060회 일어난다. 오프스크린 캔버스마다 clear 후 다시 그리며, 그 안의 벡터 호출은 초당 약 7.2만 회다.
  - 내역: 유닛 몸통(b) 3.9만/220회, 스택(s) 1.0만/80회, 뒷면(p) 0.9만/220회, 몹(m) 0.8만/84회, **칸 타일(t) 0.45만/240회(정적인데도 다시 구움)**, 앞면(f) 0.14만/220회.
- 60fps 목표일 때 초당 2D 호출 합계는 약 60 x 2,380 + 7.2만 ≈ **21만 회/s**다. 30fps로 낮추면 약 14만 회/s(-33%)다. 굽기를 버킷 대신 "애니메이션이 바뀔 때만" 하게 바꾸면 추가로 -7만 회/s를 줄일 수 있다.
- 시뮬 1틱 비용은 0.02~0.05ms(데스크톱 node, 몹이 적을 때)로 작다. 발열의 주원인은 시뮬이 아니라 렌더, 오디오, DOM이다.

## 원인 후보 (영향 큰 순)

| # | 원인 | 근거 (파일:줄) | 영향 | 구체 수정안 | 위험 |
|---|---|---|---|---|---|
| 1 | **iOS에서 저사양 모드가 사실상 켜지지 않아 평상시 60fps로 렌더한다.** 자동 판정은 `hardwareConcurrency<=4 \|\| deviceMemory<=2`다. Safari는 deviceMemory를 지원하지 않고, 최신 iPhone은 코어 수 조건에 걸리지 않는다. 런타임 하향은 "2초 평균 fps < 40"일 때만 일어나는데, iPhone은 뜨거워진 상태에서도 60fps를 유지하므로 발동하지 않는다(저전력 모드의 30Hz rAF에서만 발동). 사용자가 끌 UI도 없다(`malrang_gfx` 는 game.js:12 에서만 읽힌다). | game.js:9-20, 665, 670-673 | 상 | ① iOS/iPadOS 감지(`/iP(hone\|ad\|od)/` 또는 `Macintosh && maxTouchPoints>1`) 시 기본 렌더 목표를 30fps로 둔다(GFX_LOW와 별도로 `GFX_FPS=30`). ② ☰ 메뉴에 "절전 모드(30fps)" 토글을 추가해 `malrang_gfx` 에 저장한다. ③ 런타임 하향 기준을 fps 대신 "render() 실제 소요 ms 평균 > 8ms"로 바꾼다(`performance.now()` 로 render 앞뒤 측정). | 하(디펜스 게임이라 30fps 체감이 작다. 투사체가 약간 끊겨 보일 수 있음) |
| 2 | **비트맵 캐시가 20fps로 전부 다시 굽는다.** `_bake` 는 시간 버킷(`floor(t*20)`)이 바뀔 때마다 세대 전체를 버리고 새로 그린다. 그래서 유닛·몹·타일을 초당 약 1,060번 오프스크린 캔버스에 다시 그린다(벡터 호출 약 7.2만/s). Safari의 GPU 캔버스에서는 캔버스마다 렌더 타깃 전환과 flush가 일어난다. 특히 정적인 칸 타일(`t|`)까지 버킷마다 다시 굽는다. | graphics.js:178, 196-211(버킷 199-200), 953(타일 키), 489-499(유닛), 625(몹) | 상 | ① 시간에 의존하지 않는 레이어(타일 `t|`, 그림자, 스택)는 시간 버킷을 무시하는 영구 캐시(Map, sc 변경 시만 초기화)로 옮긴다. 타일은 `_boardCache` 에 함께 구워도 된다(slots, sel 변경 시만 다시 굽기). ② 유닛 몸통은 공격 모션(`anim`) 중일 때만 버킷 굽기를 하고, 대기 상태는 위상(0~N 프레임)을 키에 넣은 순환 스프라이트(예: 8프레임)로 한 번만 굽는다. ③ GFX_BAKE_FPS 20을 12로 낮추거나, 렌더 fps가 30이면 굽기 fps를 15로 맞춰 매 2프레임마다 재사용되게 한다. | 중(키 설계를 잘못하면 모션이 굳거나 메모리가 늘어난다. BK_POOL_PX=14e6 픽셀은 약 56MB이므로 영구 캐시는 별도 상한 필요) |
| 3 | **AudioContext가 소리를 끄거나(모드 2) 효과음만 켠 모드(1)에서도 항상 running이다.** 마스터에 DynamicsCompressor가 있고, 피드백 딜레이 루프(DS→DL→lp→fb→DL)가 늘 연결돼 있어 오디오 스레드가 약 2.7ms마다 깨어난다. 그래서 iOS가 오디오 하드웨어와 CPU를 저전력 상태로 내리지 못한다. `initAudio` 는 MUTED여도 resume하고, suspend는 visibilitychange(hidden)에서만 한다. 일시정지·모달·타이틀·게임오버에서도 BGM은 계속 합성된다(일시정지는 볼륨만 45%). | ui.js:24-39(38 resume 무조건), 45-48, 241-247(_bgFx 피드백), 318(paused 볼륨만), 340-344(bgmApply) | 상 | ① `SND_MODE===2` 이면 `AC.suspend()` 하고 initAudio의 resume을 막는다(38줄에 `!MUTED` 조건). ② 모드 1은 sfx 호출 후 1.5초 동안 발음이 없으면 suspend하고, 다음 sfx 직전에 resume한다(첫 음이 약 50ms 늦어질 수 있음). ③ 게임오버나 타이틀 대기가 20초를 넘으면 BGM을 페이드한 뒤 suspend한다. 일시정지/모달에서는 BGM을 멈추거나 suspend하는 옵션을 둔다. ④ 피드백 딜레이는 BGM이 꺼지면 DS 입력을 끊는다(`DS.disconnect()`). | 하~중(iOS는 suspend 후 resume에 사용자 제스처가 필요할 수 있으니 resume은 터치 핸들러 안에서 호출) |
| 4 | **BGM 합성이 음표마다 노드를 새로 만든다.** 90ms setInterval로 16분음표마다 여러 성부(멜로디·화음·아르페지오·노이즈 드럼)를 Oscillator+Gain+Biquad+StereoPanner로 생성한다. 초당 수십 개 음표, 노드로는 초당 100개 이상이 생겨 오디오 스레드 부하와 GC를 키운다. | ui.js:279-309(_bgEv/_bgPlay), 314-338(_bgTick), 342(setInterval 90), 52-80(tone/noise 노드 생성) | 중 | ① 저사양/iOS에서는 아르페지오·패드 성부를 뺀 "라이트 BGM"을 쓴다. ② 패너는 BGM 버스 단위로 하나만 둔다(음표마다 만들지 않음). ③ 장기적으로는 짧은 루프를 OfflineAudioContext로 한 번 렌더해 AudioBuffer 루프로 재생한다(CPU 거의 0). | 중(음색이 바뀜) |
| 5 | **타이틀 화면에서 보이지 않는 게임 보드를 30fps로 계속 그린다.** `#title` 은 불투명 전체 화면 레이어인데도 loop가 `render()`(보드·유닛·몹 + updateHud DOM 갱신)를 매번 호출한다. 퍼레이드도 DPR 3(1020x450)에서 유닛 8기를 굽지 않고 라이브로 그린다(오라·그라디언트 포함). `.logo` 는 무한 float 애니메이션이다. | game.js:665(title 30), 675-679, index.html:102(#title 불투명 배경), 103(.logo animation infinite), graphics.js:888-905(drawParade, dpr 3) | 중~상(타이틀에 머무는 시간이 길면 상) | ① `title` 일 때는 `render()` 를 건너뛰고(전환 시 1회만) 퍼레이드만 그린다. ② 퍼레이드는 DPR을 2로 제한하고, 유닛을 `bake:true` 로 그리고, 20fps로 그린다. ③ `.logo` float는 `prefers-reduced-motion` 이거나 iOS 절전 모드일 때 끈다. | 하 |
| 6 | **rAF 루프가 일시정지·모달·게임오버·타이틀에서도 60Hz로 계속 깨어난다.** fps 제한은 그리기만 거르고 콜백은 계속 돈다. idle 상태에서도 15fps로 render()를 하고 update()를 초당 60회 호출한다(fx/efx/parts/log 배열 filter 할당). 화면이 정지해 있어도 메인 스레드와 디스플레이 링크가 계속 활성이다. | game.js:653-684(loop), 660-661(idle 판정), 665(idle 15) | 중 | idle(paused/over/modal/confirm)이면 rAF를 멈추고 `setTimeout(loop, 250)` 으로 상태만 확인하며, 표시가 바뀔 때(requestRenderNow) 1회만 그린다. 모달 뒤 보드는 정지 화면이므로 다시 그릴 필요가 없다. 게임 중 30fps 목표라면 `setTimeout(…,33)` 뒤 rAF를 호출하는 하이브리드 방식으로 콜백 자체를 반으로 줄인다. | 중(재개 시 `last` 를 리셋해 dt 폭주를 막아야 함. dt는 이미 0.1로 상한이 걸려 있음) |
| 7 | **매 프레임 강제 동기 레이아웃.** `render()` 맨 앞의 `fit()` 이 `getBoundingClientRect()` 를 호출한다. 그런데 직전 프레임 끝의 `updateHud()` 가 `hWaveBar.style.width` 를 매 프레임 바꾸고(roundT가 계속 변해서 항상 다른 값), innerHTML도 갱신하므로 매번 레이아웃 flush가 일어난다. | game.js:586-590, 645, ui.js:462, 466 | 중 | ① 캔버스 크기는 `ResizeObserver` 와 resize 이벤트로만 다시 계산해 캐시하고, render 안에서는 읽지 않는다. ② 진행 바는 `style.width` 대신 `transform:scaleX()` 로 바꿔 합성만 일어나게 하고, 값은 1% 단위로 반올림해 변경 시에만 쓴다. ③ updateHud는 render마다가 아니라 최대 10Hz로 호출한다(미네랄 카운트업만 예외). | 하 |
| 8 | **updateHud가 매 프레임 큰 문자열을 만든다.** `clanRowsHtml()`(4무리 x 8등급 x 슬롯 탐색 + HTML 조립), `infoText()`, `S.score()`(calcScore+unitPoints), `trackReso()`(resonanceCount/Bonus 4회)를 비교하기 전에 매번 계산한다. 결과는 setHtml이 비교하지만 생성 비용과 GC는 매 프레임 든다. 변경 시 `paintPortraits` 로 캔버스도 다시 그린다. | ui.js:433-511(특히 505, 509, 486 S.score, 511 trackReso) | 중 | slots/sel/minerals/round/over에 "더티 버전"을 두고(GAME API에서 증가), 바뀐 프레임에만 clanRows/info/trackReso를 다시 계산한다. 시간 의존 표시(타이머·바)만 매 프레임(또는 10Hz) 갱신한다. | 하 |
| 9 | **텍스트·폰트 설정 비용.** 떠다니는 대미지 텍스트(최대 60개)마다 `ctx.font=` 를 다시 설정하고 strokeText+fillText를 한다. 방어 20% 이상 몹마다 `ctx.font` 를 설정하고 이모지 fillText를 한다. Safari는 font 문자열 파싱과 이모지(컬러 글리프) 래스터가 느리다. | game.js:621-627, 616 | 중 | 크기별로 font를 한 번만 설정한다(같은 size끼리 묶기). 저사양/iOS에서는 pop 상한을 60에서 20으로 줄이고 strokeText를 생략한다(그림자 대신). 🛡 이모지는 미리 구운 아이콘 drawImage로 바꾼다. | 하 |
| 10 | **파티클과 등급 이펙트를 라이브로 그린다.** 상위 등급 유닛이 sparkPerSec 1~16으로 상시 방출하고(상한 360~420), 개당 arc/star/heart 경로를 그리고 globalAlpha를 설정한다. 무지개(rb) 파티클은 프레임마다 `hsl()` 문자열을 생성·파싱한다. 유닛마다 drawPlate/drawAura(라이브 그라디언트 생성, rainbow·pillars는 프레임마다 createLinearGradient)를 그린다. 빨리감기 x3이면 방출량도 3배가 돼 금방 상한에 붙는다. | game.js:99-105, 500-507, 620, graphics.js:335-362(오라 그라디언트), 372-375(GFX_MAX_PARTS, LOW 0.5배), 802-809(drawPart, 805 hsl) | 중 | ① iOS/저사양에서 파티클 상한을 150으로, sparkPerSec를 0.3배로 낮춘다. ② 원형 파티클은 색별 점 스프라이트(_glowImg처럼) drawImage로 바꾼다. ③ rb 색은 12단계 팔레트 배열에서 고른다. ④ 오라/플레이트도 `_bake` 대상으로 넣는다(시간 의존이므로 #2의 순환 스프라이트 방식). | 하 |
| 11 | **몹 HP 바를 몹마다 roundRect 3회로 그린다.** 81기면 프레임당 roundRect 250회, beginPath 250회 이상이다(캐시 프레임 호출 2,380회 중 큰 몫). | game.js:611-617 | 중~하 | 일반 몹은 `fillRect` 2회(배경, 체력)로 단순화하고 테두리는 생략한다. 보스만 roundRect를 쓴다. | 하 |
| 12 | **경고 비네트를 두 번 그린다.** 몹 90기 이상이면 캔버스에서 매 프레임 createRadialGradient로 전체 fillRect를 하고, 동시에 DOM `#vig`(전체 화면 fixed, radial-gradient, opacity 무한 애니메이션)도 켜진다. 후반 고부하 구간과 겹친다. | game.js:629-635, index.html:124(#vig.on infinite), ui.js:487 setCls("vig") | 중~하(후반 한정) | 둘 중 하나만 쓴다. 캔버스 쪽을 빼고 DOM #vig만 남기되, 애니메이션은 opacity 2단계 정적 전환으로 바꾼다. 캔버스 쪽을 남긴다면 그라디언트를 1회 구워 캐시한다. | 하 |
| 13 | **무한 CSS 애니메이션.** `#cWave.boss.urgent` pulse(transform scale), `#cScore.alarm::after` alarm, `#vig.on` vig, `.logo` float가 무한이다. 각각 합성 레이어를 60Hz로 갱신한다. | index.html:103, 123, 124, 184 | 하 | 반복 횟수를 유한(예: 6)으로 두거나 iOS 절전 모드일 때 `animation:none` 을 준다. | 하 |
| 14 | **시뮬 틱에서 배열을 새로 할당한다.** update마다 `filter` 5회(fx/efx/parts/log + 처치 시 mobs)로 새 배열을 만든다. x3 배속이면 초당 180틱이라 GC가 잦다. 프레임당 최대 12틱까지 돈다. | game.js:470-474, 552-553, 656-658 | 하 | 제자리 압축(write index 방식)으로 바꾼다. 다만 headless 리플레이와 같은 순서를 유지해야 한다(시뮬 결과에 영향 없음, FX 배열만 해당). | 하 |
| 15 | **BGM setInterval(90ms)이 백그라운드에서도 계속 돈다.** AC가 suspend되면 바로 return하지만 타이머는 깨어난다. | ui.js:342, 314-319 | 하 | visibilitychange hidden에서 clearInterval하고 visible에서 다시 시작한다. | 하 |
| 16 | 120Hz ProMotion | iOS Safari는 기본적으로 rAF를 60Hz로 제한한다("Prefer Page Rendering Updates near 60fps" 기본 on). 현재 fps 제한 로직(`gap >= 1000/slow - 1.5`)은 120Hz에서도 동작한다. | game.js:666-668 | 하 | 별도 조치 불필요. #6의 setTimeout 하이브리드를 쓰면 자연히 해결된다. | - |

해당 없음(확인 결과):
- shadowBlur, ctx.filter, globalCompositeOperation은 graphics.js와 game.js에서 쓰지 않는다.
- 랭킹이나 서버 폴링 setInterval은 없다. fetch는 제출, 조회, 토큰 갱신 때만 한다.
- 백그라운드 탭에서는 Safari가 rAF를 멈추고, ui.js:47 이 AC를 suspend한다.
- 보조 캔버스(#infoPt, clanRows 초상화, #heroMini)는 변경 시에만 그리고 자체 rAF가 없다. 퍼레이드는 메인 loop 안에서 그린다.

## 바로 적용 권장 수정 목록 (작고 안전한 순)
1. **iOS 기본 30fps와 절전 토글** (#1). game.js:665 의 `slow` 를 `title ? 20 : idle ? 0(정지) : (GFX_LOW||IOS) ? 30 : 60` 으로 바꾸고, ☰ 메뉴에 `malrang_gfx` low/high 토글을 둔다. 예상 효과는 렌더 비용 약 -33~50%.
2. **오디오 suspend** (#3). 모드 2는 즉시 suspend하고 initAudio에서 `MUTED` 이면 resume하지 않는다. 모드 1은 1.5초 무음이면 suspend한다. 게임오버나 타이틀 대기가 길면 BGM을 페이드한 뒤 suspend한다. 오디오 스레드 상시 기상이 사라진다.
3. **타이틀에서 render() 생략, 퍼레이드 DPR 2와 bake** (#5).
4. **idle 상태에서 rAF 정지**, setTimeout으로 상태만 확인하고 변경 시 1회 그리기 (#6).
5. **정적 타일을 영구 캐시로 이동**하고 GFX_BAKE_FPS를 렌더 fps의 절반으로 맞춘다 (#2-①③). 굽기 초당 1,060회가 약 600회 이하로 준다.
6. **fit()을 ResizeObserver 캐시로 바꾸고 진행 바를 transform scaleX로**, updateHud는 10Hz와 더티 플래그로 (#7, #8).
7. 몹 HP 바 fillRect화, 비네트 중복 제거, pop 상한 축소와 font 묶기 (#9, #11, #12).

검증 방법 제안: iPhone Safari의 원격 Web Inspector(Timelines > CPU, Rendering Frames)에서 수정 전후 30초씩 CPU 평균을 비교한다. 페이지 안에서는 `performance.now()` 로 render() 평균 ms를 HUD 디버그(?perf=1)에 표시한다.

## 적용 결과 (GAME_VER 5 그대로, sw.js CACHE_VERSION v20-ios-power)
렌더·오디오·DOM 만 바꿨다. 시뮬 로직(update, GAME API, 결정성)은 손대지 않았다.

적용한 항목
- #1 iOS 30fps와 절전 토글: `GFX_IOS`(UA iPhone/iPad/iPod 또는 MacIntel+maxTouchPoints>1)이면 `GFX_SAVE` 기본 켬이다. 게임 렌더 목표는 `GFX_RFPS = (GFX_SAVE||GFX_LOW) ? 30 : 60` 이다. iOS 기본 상태는 30fps만 낮추고 저사양(GFX_LOW)은 기존 자동 판정을 따른다. ☰ 메뉴 `#save` 버튼(🔋 절전 켬/끔)이 `gfxSetSave()` 를 호출한다. 켬은 `malrang_gfx=low`(30fps+저사양), 끔은 `high`(60fps, 자동 하향 없음)로 저장한다. 비 iOS 기본값은 기존과 같다. 절전이면 `html.save` 클래스로 `.logo` float와 `#vig` 점멸 애니메이션도 끈다.
- #2 굽기 축소: 칸 타일 중 무지개(7등급)와 선택 칸이 아닌 것은 영구 캐시(`_bakeStatic`, 배율 변경 시만 초기화, 상한 160개)로 옮겼다. 굽기 fps는 렌더 fps에 연동한다(60fps 20, 30fps 15, 저사양 12). fps만 바뀔 때는 풀을 유지하고 세대만 비운다.
- #3 오디오 suspend(`_acSync`/`_acKick`, ui.js 오디오 섹션 앞부분): 끔(2)은 항상 suspend하고 터치로도 resume하지 않는다. 효과음만(1)은 효과음 뒤 1.5초 무음이면 suspend하고(0.3초 여유), 다음 효과음 직전에 resume한다. 효과음+BGM(0)은 일시정지/타이틀/게임오버에서 입력 없이 20초가 지나면 BGM 버스를 페이드한 뒤 suspend(`_bgSleep`)한다. 입력이나 상태 변화가 있으면 재개한다. 백그라운드로 가면 BGM setInterval도 멈춘다(#15).
- #5 타이틀: 보드 render/HUD는 상태 전환 때 1회만 그리고, 퍼레이드만 20fps로 그린다. 퍼레이드는 DPR 2 상한이고 유닛을 `bake:true` 로 그린다(퍼레이드 배율로 굽기 위해 `_bkScOv` 사용).
- #6 정지 상태에서 rAF 정지: 시뮬이 멈춘 상태(S.paused 또는 S.over)에서 남은 연출(fx/efx/parts/banner/flash/shake/미네랄 카운트업)이 끝나면 rAF를 멈춘다. 이후 250ms setTimeout으로 상태 서명(키·미네랄·선택·속도·입력 수·선택권·슬롯)만 확인한다. 상태가 바뀌거나 pointerdown/pointerup/keydown, resize가 오면 `requestRenderNow()` 로 깨워 1회 그린다. 모달이 떠 있어도 시뮬이 도는 경우(타이틀에서 연 모달이 남은 채 시작 등)는 기존처럼 15fps로 계속 돈다. `window.requestRenderNow` 대입을 없애 check_globals 충돌을 해소했다.
- 중간 항목: fit()은 resize/orientationchange/ResizeObserver 때만 getBoundingClientRect를 호출한다. updateHud의 진행 바, 보스 바 폭, disabled, menuBtn dot은 값이 바뀔 때만 DOM에 쓴다(`setW`/`setDis`/`setCls`). 대미지 텍스트는 lineWidth/strokeStyle을 한 번만 설정하고, font와 fillStyle은 값이 바뀔 때만 설정한다.

검증
- tools/test_{replay,function,private,rules,friends,seasons_ui,home_flow,build}.mjs 전부 PASS, check_globals OK.
- 시뮬 틱은 rAF dt 누적으로만 진행하므로 렌더 fps와 무관하다. headless Chrome 실측: 60fps에서 렌더 61/s·틱 61/s, x3에서 틱 180/s, 절전 30fps에서 렌더 31/s·x3 틱 183/s였다. 모달(일시정지) 1.5초 동안 render 0회, 틱 0이었고(sleeping), 닫으면 즉시 재개됐다. 타이틀 1초 동안 render 0회, 퍼레이드 20회였다. 콘솔 에러는 없었다. iPhone UA에서는 GFX_SAVE=true, RFPS 30이었다.
- engine.js: build_engine.js 는 game.js 전체를 그대로 넣으므로, 다시 생성하면 GFX 헤더·fit·render·loop 구간(헤드리스에서 실행되지 않는 코드)만 달라진다. HEAD의 engine.js 와 재생성본으로 같은 시드·입력 봇 4판을 돌려 결과(라운드·처치·미네랄·틱·슬롯)가 같음을 확인했다. 커밋에는 engine.js 를 바꾸지 않았다(배포 불필요).

미적용 항목과 이유
- #2-② 유닛 몸통 순환 스프라이트, 그림자·스택 영구 캐시: 그림자는 플레이트·오라(시간 의존)와 같은 레이어(`p|`)에 묶여 있고, 스택은 bob·깜빡임·shine 이 시간에 의존한다. 분리하면 키 설계를 바꿔야 하고 겉모습이 달라질 수 있어 보류했다.
- #1-③ render ms 기준 자동 하향: 실기기 측정 없이 임계값을 정하기 어려워 보류했다.
- #4 라이트 BGM, 패너 공유, OfflineAudioContext: 음색이 바뀌므로 보류했다.
- #7-② 진행 바 transform scaleX, #7-③·#8 updateHud 10Hz/더티 플래그: CSS 구조 변경과 HUD 지연이 생기고, updateHud 가 공명 배너·효과음 같은 부수효과를 가지므로 보류했다. 대신 쓰기 가드만 적용했다.
- #9 pop 상한 축소·🛡 이모지 스프라이트, #10 파티클 축소, #11 HP 바 fillRect, #12 캔버스 비네트 제거, #14 제자리 압축: 겉모습이 바뀌거나(#9~#12) 시뮬 함수 update 를 건드려야 해서(#14) 이번 범위에서 뺐다.
- 남은 위험: iOS에서 suspend 뒤 제스처 없이 resume 이 막히면 효과음만 모드의 첫 공격음이 다음 터치까지 빠질 수 있다(터치 핸들러에서 다시 resume 한다). 실기기 확인이 필요하다.
