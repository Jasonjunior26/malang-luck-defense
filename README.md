# 말랑 운빨 디펜스

스타 운빨 디펜스(유즈맵)를 모바일용으로 옮긴 귀여운 웹 게임. 정적 파일만으로 동작한다.

## 실행
`index.html`을 브라우저로 열면 된다. 서버가 필요 없다. (config.js가 비어 있으면 랭킹은 기기 안에만 저장)

## 규칙
- 🎲 뽑기(50💎)로 랜덤 유닛을 배치, 같은 등급 두 마리를 탭해서 합성 → 한 단계 위 랜덤 유닛.
- 시작 시 **히어로 1명이 랜덤 칸에 배치**되고 패시브가 붙는다 (행운/상인/번개/얼음).
- **미네랄 수입 규칙도 랜덤** (처치/월급/웨이브/도박).
- 히어로와 규칙은 **날짜 시드**로 정해져서 그날 모두가 같은 조건에서 경쟁한다.
- 몬스터가 40마리 쌓이면 끝. 점수 = 웨이브×100 + 처치×2.

## 랭킹 서버 (Supabase + Edge Function + GitHub Pages)

구조: 클라이언트는 점수가 아니라 **입력 로그**(뽑기/합성/판매/강화/선택권 등 + 시뮬 틱)를 함께 보낸다. Edge Function `submit-score` 가 같은 게임 엔진(`data.js`+`game.js`)을 헤드리스로 다시 돌려 점수를 재계산하고, 보낸 점수와 **정확히 같을 때만** DB 에 저장한다. 공개 키(anon)로는 DB 에 직접 쓸 수 없다. 키를 `config.js` 에 비워 두면 예전처럼 이 기기(localStorage)에만 저장되고 랭킹 화면에 "서버 미설정"이 표시된다.

**시즌제 + 닉네임**: 닉네임은 처음에 한 번 정하면 기기(`device_id`)에 붙고 서버에서 대소문자 무시 중복 불가, 변경은 KST 날짜 기준 1일 1회다. 랭킹은 시즌 내 플레이어별 **최고점 1건**(동점이면 먼저 달성한 사람 우선). 시즌 밖(전/후)에는 서버가 등록을 거부하고 클라이언트는 연습 모드만 연다. 시즌 기간은 `data.js` 의 `SEASONS` 한 곳에만 있고(`build_engine` 이 서버 번들에 복사) 서버가 KST 서버 시간으로 시즌을 정한다. 함수 action: `submit`(기본)/`register`/`rename`/`profile`/`import`.

파일: `supabase/migrations/002_players_seasons.sql`(**이미 schema.sql 을 실행한 DB 의 적용 경로, 추가형·재실행 안전**), `supabase/schema.sql`(처음부터 만드는 새 프로젝트용 최종 상태 사본 = 최초 스키마 + 002), `supabase/functions/submit-score/{index.ts, replay.js, engine.js}`, `tools/build_engine.js`(engine.js 생성), `tools/test_replay.mjs`·`tools/test_function.mjs`(테스트).

### 사용자가 직접 해야 하는 단계
1. **Supabase 계정/프로젝트 만들기**: supabase.com 가입 → New project (리전은 가까운 곳, DB 비밀번호는 안전하게 보관).
2. **스키마 적용**: Dashboard → SQL Editor 에 `supabase/schema.sql` 전체를 붙여넣고 Run. (여러 번 실행해도 안전) — **이미 예전 schema.sql 을 실행했다면 아래 "시즌제 업데이트 적용"의 마이그레이션만 실행**한다.
3. **Supabase CLI 로 함수 배포** (Node 필요, 처음 한 번 로그인/연결):
   ```bash
   npm i -g supabase            # 또는 npx supabase ...
   supabase login
   supabase link --project-ref <프로젝트 ref>   # Dashboard URL 의 https://<ref>.supabase.co
   node tools/build_engine.js                    # data.js/game.js 를 서버용 engine.js 로 변환 (코드 바꿀 때마다)
   supabase functions deploy submit-score --no-verify-jwt
   ```
   - `--no-verify-jwt` 가 필요한 이유: 익명 플레이어는 로그인하지 않고, 브라우저 CORS preflight(OPTIONS)에는 토큰이 없다. 대신 함수 안에서 서버 재생 검증 + rate limit 으로 보호한다.
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 는 Supabase 가 함수 런타임에 자동 주입한다. 직접 넣거나 저장소에 커밋하지 말 것(service_role 키는 절대 `config.js` 에 쓰지 않는다).
   - (선택) `supabase secrets set ALLOWED_ORIGIN=https://<사용자명>.github.io IP_SALT=<아무 문자열> BAD_WORDS=단어1,단어2` — CORS 를 내 Pages 주소로 제한, IP 해시 솔트, 닉네임 금칙어 추가.
4. **`config.js` 입력**: Project Settings → API 에서 `Project URL` 과 `anon`(publishable) key 를 복사해 `SUPABASE_URL`, `SUPABASE_ANON_KEY` 에 넣는다. anon key 는 공개돼도 안전하다(읽기만 가능).
5. **GitHub Pages 배포**: repo → Settings → Pages → 브랜치 `main` 루트. 나온 URL 을 폰에서 열고 "홈 화면에 추가".

### 시즌제 업데이트 적용 (이미 schema.sql + 함수 배포를 마친 경우 — 사용자가 직접 할 일)
1. **SQL Editor 에서 `supabase/migrations/002_players_seasons.sql` 전체를 붙여넣고 Run.** 기존 `scores` 는 지워지지 않는다(시즌 1 기간에 해당하는 기존 기록만 `season=1` 로 표시). 여러 번 실행해도 안전.
2. **함수 재배포**: `node tools/build_engine.js` 실행 후 `supabase functions deploy submit-score --no-verify-jwt`. (1 → 2 순서. 배포 전에 클라이언트(GitHub Pages)를 먼저 올리면 닉네임 등록이 실패하니 함수를 먼저 배포한다.)
3. 그다음 GitHub Pages 에 이번 변경(index.html, ui.js, data.js, sw.js 등)을 push. 기존 이용자는 첫 실행 때 닉네임을 정하게 된다(예전에 입력한 닉네임이 있으면 자동 등록 시도, 중복이면 새로 정하기).

### 시즌 운영
- **다음 시즌 추가**: `data.js` 의 `SEASONS` 배열 끝에 `{ id: 2, name: "시즌 2", start: "2026-11-16", end: "2026-12-06" }` 처럼 추가(KST 날짜, 양끝 포함, 겹치지 않게, id 는 증가). 그다음 `node tools/build_engine.js` → `supabase functions deploy submit-score --no-verify-jwt` → 페이지 배포 + `sw.js` 의 `CACHE_VERSION` 올리기. DB 변경은 필요 없다(`scores.season` 이 시즌 번호를 기억).
- **종료 후**: 시즌이 끝나면 서버가 등록을 거부하고 앱은 "시즌 종료/준비 중" + 연습 모드만 연다. 최종 순위는 `leaderboard_season?season=eq.1` 로 계속 조회된다(앱 UI 는 현재/마지막 시즌 중심, 이전 시즌 선택 UI 는 아직 없음). 시즌 사이 공백 기간에는 일일 챌린지가 닫힌다.
- **닉네임/계정 이전**: 프로필 화면의 "이전 코드"는 `device_id`(UUID) 그대로다. 아는 사람은 그 계정을 쓸 수 있으니 노출 주의. 운영자가 부적절한 닉네임을 바꾸려면 SQL Editor 에서 `update players set name=... where lower(name)=lower(...)`.

### 동작 확인 체크리스트
- [ ] 로컬: `node tools/test_replay.mjs 6` → 마지막 줄 `PASS 14 FAIL 0` 류, `node tools/test_function.mjs` → FAIL 없음
- [ ] 첫 실행에 닉네임 정하기 모달이 뜨고, 다른 기기/시크릿 창에서 같은 닉네임(대소문자만 달라도)은 거부된다
- [ ] 게임 한 판(일일 챌린지)을 끝내면 결과 화면에 자동 등록되어 "12위 → 7위" 같은 순위 변동이 뜨고, 랭킹 "시즌 TOP 50"/"오늘"/"내 기록" 탭에 보인다
- [ ] 프로필에서 닉네임 변경은 하루 1번만 되고(두 번째는 비활성), 바꾸면 과거 기록도 새 이름으로 보인다
- [ ] 프로필의 이전 코드를 다른 기기의 "계정 불러오기"에 넣으면 같은 닉네임/기록으로 이어진다
- [ ] Dashboard → Table Editor → `scores` 에 행이 생기고 `inputs_hash`, `device_id` 가 채워져 있다
- [ ] 같은 기기에서 같은 날 더 낮은 점수를 올려도 기존 기록이 유지된다(더 높을 때만 갱신)
- [ ] 비행기 모드(오프라인)로 등록 → 이후 온라인에서 앱을 열면 자동 재전송된다(`localStorage` 의 `malang-queue`)
- [ ] 연습 모드는 서버에 가지 않는다(네트워크 탭에 submit-score 요청 없음)
- [ ] 브라우저 콘솔에서 anon 키로 `POST /rest/v1/scores` 를 보내면 401/403 으로 거부된다(직접 쓰기 금지 확인)
- [ ] Dashboard → Edge Functions → submit-score → Logs 에 `mismatch`/오류가 없다

### 검증 규칙과 한계 (솔직하게)
- **막는 것**: 점수/라운드 값 조작, 로그 변조·삭제·추가, 불가능한 행동(돈 없이 뽑기 등), 다른 날 seed 재사용(허용 범위: 기기 로컬 날짜 = UTC-12~+14 와 1시간 여유), 직접 DB 쓰기, 연타 도배(IP 분당 20회·기기 분당 5회), 요청 크기/입력 수 상한(8000개), 구버전 클라이언트(`ver` 불일치 시 409).
- **못 막는 것**: 입력 로그를 만들어 내는 **봇/매크로/자동화 도구**(규칙을 지키는 완벽한 플레이는 로그로 구분할 수 없음), 서버 엔진 소스를 이용한 최적 해 탐색(일일 seed 가 공개 규칙이라 가능), 닉네임 사칭, 기기 ID 를 지우고 재등록(같은 날 여러 기록 가능), 수동 ID 대량 생성(IP rate limit 으로만 완화).
- **동기화**: 클라이언트 규칙(`data.js`/`game.js`)과 서버 엔진은 반드시 같아야 한다. 규칙·밸런스를 바꾸면 ① `ui.js` 의 `GAME_VER` 를 올리고 ② `node tools/build_engine.js` ③ `supabase functions deploy submit-score --no-verify-jwt` ④ 웹 배포 순으로 한다. `ver` 가 다르면 서버가 거부하므로 배포 순서가 어긋나면 그 사이 제출은 큐에 쌓이지 않고 버려질 수 있다(ver 불일치는 영구 거부로 취급).
- **서버 비용**: 한 판 재생은 Node 기준 약 0.2~1.5초(PC 부하에 따라 다름). Supabase Edge Function 의 CPU 제한(무료 플랜 약 2초 내외) 안이지만 여유가 크지 않다. 배포 후 로그에서 시간 초과(`CPU time limit`)가 보이면 유료 플랜이나 Cloudflare Workers 등으로 `replay.js` 를 옮겨야 한다.
- **일일 랭킹 기준**: "오늘" 탭은 기기의 로컬 날짜 seed 기준이므로 시간대가 다른 플레이어는 다른 날의 판이 보일 수 있다(한국 사용자만 쓰면 문제 없음).
- 시즌 랭킹은 서버 뷰 `leaderboard_season`(플레이어별 시즌 최고점 1건, 동점은 먼저 달성한 사람 우선)을 그대로 읽는다. 일일 챌린지 seed 는 기기 로컬 날짜 기준 그대로(시즌 판정만 KST).

## 알려진 한계 / 다음 단계
- 점수 조작 방지: 서버 리플레이 검증 적용(위 "랭킹 서버" 섹션). 봇/매크로는 못 막음.
- 캐릭터: 기본은 코드로 그린 벡터. `assets/sprites/` 에 PNG를 넣으면 자동 교체 (docs/캐릭터_생성가이드.md).

## 홈 화면에 추가 / 오프라인 / 업데이트 (PWA)
- **홈 화면에 추가**: Android Chrome 은 메뉴 > "홈 화면에 추가"(또는 설치), iOS Safari 는 공유 버튼 > "홈 화면에 추가". 아이콘은 `assets/icons/`, 설정은 `manifest.json` (모든 경로가 상대경로라 GitHub Pages `/<repo>/` 하위 경로에서도 동작).
- **오프라인**: `sw.js` 가 앱 셸(index.html, js, 아이콘)을 프리캐시하고 Jua 폰트는 런타임 캐시한다. 한 번 접속한 뒤에는 오프라인에서도 실행된다. Supabase 등 다른 도메인 요청과 POST 는 캐시하지 않고 그대로 통과한다(랭킹은 온라인에서만).
- **업데이트 방법**: 배포 전에 `sw.js` 맨 위 `CACHE_VERSION` 을 올린다(`'v1'` → `'v2'`). 새 서비스워커가 설치되면 구버전 캐시를 지우고, 기존 탭에는 `window` 의 `sw-update` 이벤트가 발생한다(다음 실행/새로고침 때 적용). 서비스워커는 https 또는 localhost 에서만 등록된다.
- **아이콘 재생성**: `npm i @napi-rs/canvas` 후 `node tools/make_icons.js`.
