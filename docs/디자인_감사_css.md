# 디자인 감사 — index.html `<style>` (줄 18~313, 2026-11-09, 읽기 전용)
기준: docs/디자인_원칙.md. 줄 번호는 index.html 실제 줄. (코드지도의 "가로모드 grid"·"#heroCard 계열" 기술은 현 CSS와 다름 → 코드지도 갱신 필요)

## 1. 색
| 항목 | 현황 |
|---|---|
| 하드코딩 hex | **268개** (rgba/rgb 0개, 알파는 `#0002/#0003/#0004/#0001` 8자리 축약 18개) |
| 최다 | `#fff` 57, `#0002` 9, `#e0558a` 6, `#fffaf0` 5, `#fff0a8` 5, `#f0cf8a` 5, `#c9a56a` 5, `#d4182e` 4, `#3b9dff` 4 |
| :root 변수 | 줄 21 근처 `--ink:#5b3a1e --card:#fffaf0 --pink/#ff7fa8 --pink2/#e0558a --green/#6fd48a --green2/#3fa95f --gold/#ffb703 --blue/#7cc4ff --blue2/#4a9be0`, 줄 155 `--rowh:46px`. 변수는 9색뿐이고 `--bg --danger --accent` 없음 |
| 다크모드 | **없음** (`prefers-color-scheme` 0건). theme-color 도 `#ffd98a` 단일(줄 6) |
| 그라데이션 | `linear-gradient(...)` 다수(단추·칩·HUD 경보) — 상·하 2색을 변수 쌍(`--x-hi/--x`)으로 묶어야 함 |

토큰화 후보(라이트 값 기준)
| 토큰 | 후보 값(통합 대상) |
|---|---|
| --bg | 배경 그라데이션 계열(`#ffd98a` 등 따뜻한 노랑, theme-color 와 동일 값) |
| --card / --card2 | `#fffaf0` `#fffdf5` `#fff7d6` `#fff1cf` `#fff3c4` / 선 `#f0cf8a` `#e2c58a` `#e3cfa6` `#ead7b0` |
| --ink / --ink2 / --ink3 | `#5b3a1e` / `#7a6750` `#8a6a45` / `#b3a48c` `#cfcac0` `#c9a56a`(보조·테두리) |
| --accent(Primary) | pink `#ff7fa8`(hi `#ff9bbb`, lo `#e0558a`) |
| --danger | `#d4182e` `#c0392b` `#ff3d5e` (경보 `#ff8a8a` 계열 별도) |
| --info(blue) | `#3b9dff` `#7cc4ff` `#a5e8ff` `#4a9be0` |
| --ok(green) | `#6fd48a` `#9be8ad` `#3fa95f` |
| --gold/--warn | `#ffb703` `#ffd25a` `#ffcf4a` `#ffd77a` `#fff0a8` `#c98a00` `#b06a00` `#e08a00` `#a55a00` |
| 등급색(일반~전설) | CSS가 아니라 data.js/graphics.js 쪽(§7). CSS엔 `.tk`·`.cc` 일부만 |
| 그림자 | `#0001~#0004` 4단 → `--sh1..3` |
유사색 난립: 노랑·갈색 계열이 약 25종 → 8~10 토큰으로 수렴 가능.

## 2. 크기
**font-size** (총 약 150회)
| 값 | 횟수 | 비고 |
|---|---|---|
| 12px | 27 | 허용 최소 |
| 14px / 13px | 20 / 18 | 13은 토큰 밖 |
| **11px** | 19 | 위반 |
| 18/15/17/16/20/22 | 10/9/8/6/6/5 | 15·17 은 토큰 밖 |
| **10px / 10.5px / 9px** | 8 / 2 / 1 | 위반 |
| clamp(9~11px…) 7종 | 7 | 하한이 9~10.5 → 위반 |
| 26/30/40/50/54 | 1~3 | 배너·로고·점수 |
12px 미만 줄: 54 67 80 80 99 127 144 156 157 162 188 190 197 207 208 211 213 233 252 276 278 279 285 288 290 291 292 294 297 304 (clamp 하한 포함 여부는 줄 233·211 확인). font-weight: bold 6 / 700 5 / 800 5 / 400 2 / 900 2 / 600 1 (원칙 400·600·800 3종 → 700·900·bold 정리). `tabular-nums` 는 줄 99 등 일부만.

**단추·반경·간격**
| 항목 | 분포 |
|---|---|
| height | 40×6, 44×3, 32×3, 38×2, 50×2, 26·22×2, 42×2, 34, 56 (3단계 아님) |
| min-height | 44×7, 40×4, 34×2, 48×2, 36, 46, 54 |
| border-radius | 10px×11, 12×10, 50%×7, 14×7, 16×5, 5·11·9·999×3, 18·22×2, 7, 2, 26 → 14종 |
| gap | 6px×19, 8×11, 3×9, 4×8, 7×7, 2×5, 5×3 … |
| padding/margin/gap px 값 | 278개 중 **4배수 위반 183개(66%)**: 6×59, 10×26, 2×24, 3×21, 5×17, 7×15, 9, 11, 13, 14, 18, 22 |

**터치 44px 미만 후보**(줄 · selector · 높이)
184 `.cr`32 · 215 `.cr`29(max-height:700) · 190 `.cr .sl`24 · 215 `.cr .sl`22 · 195 `.cr .uc`26 · 152 `.rkt button`40 · 153 `.rkt.sub button`34 · 155 `.rknav button`34 · 202 `#pop button`40 · 210 `#sell`40 · 256 `#box .mhpks button`40 · 268 `#box .mkme button`32 · 270 `#box .mktabs button`32 · 307 `#box .eqsk button`40 · 311 `#box .eqn button`40 · 160 `.rkw .rows li`36(행). 무리 줄(.cr)은 정보 밀도상 의도된 축소이므로 줄 높이는 두고 탭 영역만 ::after 로 확장하는 방안.

## 3. 정렬
- 기준 `button`(줄 60)은 **flex 아님**: 가운데 정렬은 text-align 의존. 변형 `button.big/.mini`(63·66)는 flex column + `align-items:center` 만 있고 `justify-content` 없음.
- flex 아닌 단추류(줄): `button` 60, `button.green/.wide` 68·69, `.tabs button` 77, `#title .tbtn(.primary/.secondary/.ghost/.trow)` 82·109·110·112·115, `#cbox .row button` 128, `.gor button` 145, `.rkt/.rknav button` 152~155, `#menu button` 181, `.chip` 26~40(.chip 26만 flex), `#hud .chip` 40·168(42의 내부 div만 flex), `.cr` 185(184는 flex), `.cr .pill/.sl.on` 188·192. 일부는 덮어쓰기 규칙이라 기본 규칙에서 flex가 상속될 수 있으나, 이모지+글자 단추(`.tbtn`, `.chip`)는 세로 어긋남 위험.
- 제안: 공통 `.btn-base{display:inline-flex;align-items:center;justify-content:center;gap:4px}` 를 `button,.chip,.tbtn,.cr` 에 일괄 적용.

## 4. 레이아웃
| 항목 | 현황 |
|---|---|
| #app | 줄 23 `max-width:480px`(고정), `height:100vh → 100dvh → calc(var(--vh)*100)` 3중 폴백(ui.js fitVh), padding 에 `env(safe-area-inset-*)` 4방향 적용 |
| viewport | `maximum-scale=1,user-scalable=no,viewport-fit=cover,interactive-widget=resizes-content` (줄 5) |
| 가로모드 | CSS 의 `@media (orientation:landscape)` **0건**(코드지도의 grid 행 기술은 이미 사라짐). `--u` 스케일 없음 |
| 세로고정 | ui.js 1308 `screen.orientation.lock("portrait")` 시도만. **"세로로 돌려주세요" 오버레이 없음** → 원칙 1 미구현 |
| 태블릿 | 480px 밖 여백만 늘어남. 확대 안 됨. 고정 px(`#box` 440px 줄 150, `#pop` max 250, `#menu` 등)와 `--rowh:46px`가 스케일 불가 → `--u` 도입 시 함께 치환 |
| @media | max-width:340/360, max-height:700 위주(줄 37·115·142·215·233). 높이 700 미만 압축 규칙이 `.cr` 29px 등 터치 미달을 만듦 |

## 5. 폰트
| 항목 | 위치 |
|---|---|
| font-family 선언 | 줄 21 `html,body` `"Jua","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif` **단 1곳**; 줄 220 `button,.chip,.cr{font-family:inherit}`; 단추 `font:inherit`(60). 다른 선언 없음 |
| Google Fonts | 줄 15~16 preconnect + `css2?family=Jua&display=block`(FOIT 위험). 줄 219 `font-synthesis:none` |
| sw.js | `FONT_CACHE='malang-fonts-'+CACHE_VERSION`(v31-rank-guard), `fonts.googleapis.com`·`fonts.gstatic.com` GET 을 stale-while-revalidate 런타임 캐시. 프리캐시 아님 → **첫 방문 오프라인이면 폰트 없음**. 버전마다 폰트 캐시도 삭제됨(재다운로드) |
| 줄바꿈 | `word-break:keep-all`(219 body 전역, 166·276·291 등) + `overflow-wrap:anywhere`(219). `text-wrap` **0건**. `word-break:break-all`은 코드박스 148만 |
| 캔버스 글자 | `ctx.font` 4곳(game.js·graphics.js·ui.js; 원칙은 5곳으로 기록) — 폰트 교체 시 재확인 |
Pretendard 전환 시 변경 지점: 줄 15·16·21 + sw.js 프리캐시 목록 + 폰트 캐시 규칙.

## 6. 모션
- 규칙 25개(animation·transition 선언). **prefers-reduced-motion 있음**(줄 227): iteration-count 1, duration .01s 로 일괄 처리(transition 은 미포함).
- 상시 반복(`infinite`) 4개: 줄 103 `float 2.2s`(로고 둥실), 118 `pulse .5s alternate`(#cWave.boss.urgent), 119 `vig .6s alternate`(위기 비네트), 177 `alarm .5s alternate`(#cScore.alarm). 로고 float 만 상시, 나머지는 경보 상태에서만. 절전 `html.save` 규칙(줄 164·235)이 일부 끔.
- 유한 반복(횟수 8~10) 다수: ready 1s×8(65), glow 1s×8(79·146), ready .6s×10(127), pulse .9s×10(137), slpl .9s×8(193) — 사실상 장시간 깜빡임.
- 일회성: bump .25s, pop .35s(cubic-bezier overshoot), lgin .2s/lgout .6s, ban 2.4s, fl .5s, rpulse .9s×2, mknope .3s, mkgot .45s.
- 원칙 대비: 시간 150~250ms 밖 다수(.5s 경보·1s 글로우), ease-out 아닌 alternate·overshoot, `scale(.97)` 눌림 피드백 일괄 적용 확인 안 됨(`button` 은 box-shadow 5px 눌림 방식 → transform+shadow 혼용).

## 7. 우선순위 제안 / 치환 위험
1. (안전·최우선) `:root` 토큰 정의 확장 + 단순 중성색(`#fff`→`--on`, `#0002`→`--sh`, 카드·잉크·테두리 갈색 계열) 치환. 시각 변화 0.
2. (안전) 폰트 크기 11·10·9px → 12px 상향, 13/15/17 → 14/16 로 정렬. 줄 넘침 확인 필요(`.cr`·`.mk*`·`.rk*`, 320/360 폭).
3. (안전) 단추 공통 flex center 클래스, 반경·높이 토큰(S/M/L), 간격 4배수화(6→8·4, 10→8·12, 3·5·7→4·8).
4. (중간) 다크모드 값 교체, 줄 6 theme-color 별도 값(media 속성 meta 2개), 가로 오버레이, `--u` 스케일(고정 px 다수 → 마지막 단계).
5. (중간) Pretendard 자체 포함 + sw 프리캐시.

**치환 금지/주의(캔버스·JS 연동 색)**
- game.js/graphics.js/data.js 의 등급색·캐릭터색·`ctx.fillStyle` 은 JS 상수. CSS 토큰으로 바꿔도 캔버스는 안 바뀜 → 다크 전환 시 **CSS와 JS 색이 갈라짐**. 토큰을 JS가 `getComputedStyle` 로 읽도록 하거나 캔버스 영역 배경은 다크에서도 고정.
- ui.js 404 `d.style.color = col`(로그 글자색 JS 주입) — 원칙 7(L 로그 어두운 캡슐+흰 글씨)과 연동해 함께 교체.
- `#cvWrap` 캔버스 배경·`#vig`·`#cScore.alarm` 경보색, `.cr .sl canvas`(초상화 캔버스 배경)는 캔버스 그림과 맞물려 있어 따로 처리.
- `#fff` 57곳은 의미가 섞임(글자 on 컬러 단추 / 카드 배경 / 캔버스 위 하이라이트). 일괄 치환 금지, 문맥별(`--on-accent`, `--surface`) 분리.
- 단추 box-shadow 의 `--pink2` 등 하단 3D 그림자는 색 쌍으로 같이 바꿔야 함. 그라데이션 `#ff9bbb` 같은 hi 값은 변수 미존재.
- GAME_VER·규칙(data.js/game.js) 은 CSS 작업과 무관하게 건드리지 않음.
