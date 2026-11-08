# 말랑 디펜스 작업 규칙
- 먼저 `docs/진행현황_다음할일.md` 를 읽는다(§0 작업 규칙, §1 현재 라이브 상태). 줄 번호는 `docs/코드지도.md`. 소셜(로그인·친구·프라이빗 시즌)은 `docs/소셜_현황.md`.
- 항상 `origin/main` 최신에서 시작한다. 옛 브랜치 위에서 이어 작업하지 않는다(`git fetch` 후 merge/rebase).
- 이미 배포된 기능을 다시 설계·구현하지 않는다. 운영 DB·함수 배포·푸시는 사용자 승인 후, 순서는 마이그레이션 → 함수 → 클라이언트 → 플래그.
- 규칙(data.js/game.js)·GAME_VER 변경 시 `node tools/build_engine.js` → `tools/test_*.mjs`, `tools/check_globals.mjs` → 함수 재배포와 푸시를 같은 시점에.
- 작업을 끝내면 `docs/진행현황_다음할일.md` 의 §1(라이브 상태)을 갱신한다.
