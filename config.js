// Supabase 설정. 비워두면 이 기기(localStorage)에만 랭킹이 저장된다. 설정법은 README.md 참고.
// anon key 는 공개되어도 되는 키다. 쓰기 권한은 DB 의 RLS 정책으로 제한한다.
window.CONFIG = {
  SUPABASE_URL: "https://oktgigevvwlczqavbyuq.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_2Q2xW8R76GPlIoVmXJUzzA_LvBpEp8B",
  MYHERO_RANKED: true,  // 서버(007 마이그레이션 + 내 영웅 지원 submit-score)를 배포한 뒤 true. false 면 내 영웅 판은 랭킹에 안 올리고 코인만 받는다 (docs/내영웅_진행.md)
  REWARDS_ENABLED: true, // 주간 랭킹 보상 팝업(서버 rewards 액션이 없거나 실패하면 조용히 무시). false 면 호출·팝업 없음 (docs/주간보상_클라.md)
  ANALYTICS: true,      // 이용 행동 기록(docs/행동지표_설계.md). 2026-11-12 켬(마이그레이션 013 + submit-score ev + EV_SALT 배포 완료). false 로 바꾸면 네트워크 호출을 전혀 하지 않는다
  KAKAO_ENABLED: false, // 카카오 앱 등록 + Supabase Auth 설정을 마친 뒤 true (docs/카카오_로그인_설정.md)
};
