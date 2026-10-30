// Supabase 설정. 비워두면 이 기기(localStorage)에만 랭킹이 저장된다. 설정법은 README.md 참고.
// anon key 는 공개되어도 되는 키다. 쓰기 권한은 DB 의 RLS 정책으로 제한한다.
window.CONFIG = {
  SUPABASE_URL: "https://oktgigevvwlczqavbyuq.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_2Q2xW8R76GPlIoVmXJUzzA_LvBpEp8B",
  KAKAO_ENABLED: false, // 카카오 앱 등록 + Supabase Auth 설정을 마친 뒤 true (docs/카카오_로그인_설정.md)
};
