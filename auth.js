// 클라 인증 모듈: Supabase Auth(GoTrue) REST + Kakao OAuth 리다이렉트(implicit). supabase-js 없이 fetch 만 쓴다.
// 세션은 localStorage("malang-auth") 에 저장. 게스트(미로그인)로도 모든 기능이 동작해야 하므로 이 모듈은 실패해도 조용히 넘어간다.
(function () {
  const KEY = "malang-auth", C = () => window.CONFIG || {};
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }, del: (k) => { try { localStorage.removeItem(k); } catch {} } };
  const b64 = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));
  const jwtPayload = (t) => { try { return JSON.parse(b64(String(t).split(".")[1])); } catch { return null; } };
  const hdr = () => ({ apikey: C().SUPABASE_ANON_KEY, "Content-Type": "application/json" });
  let sess = null; try { sess = JSON.parse(ls.get(KEY) || "null"); } catch {}
  const A = { enabled: () => !!(C().KAKAO_ENABLED && C().SUPABASE_URL && C().SUPABASE_ANON_KEY), fresh: false, error: "" };

  function save(s) { // s: {access_token, refresh_token, expires_in|expires_at}
    const p = jwtPayload(s.access_token); if (!p || !p.sub) return false;
    const m = p.user_metadata || {};
    sess = { access_token: s.access_token, refresh_token: s.refresh_token || (sess && sess.refresh_token) || "", exp: s.expires_at ? s.expires_at * 1000 : Date.now() + (+s.expires_in || 3600) * 1000,
      id: p.sub, nick: String(m.name || m.nickname || m.full_name || m.preferred_username || "").slice(0, 20) };
    ls.set(KEY, JSON.stringify(sess)); return true;
  }
  // 로그인 복귀: URL 해시의 #access_token=... 를 읽어 저장하고 주소창에서 지운다
  function parseHash() {
    const h = location.hash || ""; if (!/access_token=|error=/.test(h)) return;
    const q = new URLSearchParams(h.replace(/^#/, ""));
    if (q.get("error")) A.error = q.get("error_description") || q.get("error");
    else if (q.get("access_token") && save({ access_token: q.get("access_token"), refresh_token: q.get("refresh_token"), expires_in: q.get("expires_in") })) A.fresh = true;
    else A.error = "bad_session";
    try { history.replaceState(null, "", location.pathname + location.search); } catch {}
  }
  parseHash();

  A.user = () => (sess ? { id: sess.id, nick: sess.nick } : null);
  A.signedIn = () => !!sess;
  A.login = () => { // 카카오 동의 화면으로 이동 (동의항목: 닉네임/프로필만)
    if (!A.enabled()) return false;
    const to = encodeURIComponent(location.origin + location.pathname);
    location.href = `${C().SUPABASE_URL}/auth/v1/authorize?provider=kakao&redirect_to=${to}`; return true;
  };
  // 유효한 access_token (만료 60초 전이면 갱신). 실패하면 null(세션 만료 시 로그아웃 처리)
  A.token = async () => {
    if (!sess) return null;
    if (sess.exp - Date.now() > 60000) return sess.access_token;
    if (!sess.refresh_token) { A.clear(); return null; }
    try {
      const r = await fetch(`${C().SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: hdr(), body: JSON.stringify({ refresh_token: sess.refresh_token }) });
      if (r.status === 400 || r.status === 401) { A.clear(); return null; } // 리프레시 토큰 무효 = 로그아웃
      const d = await r.json(); if (r.ok && d.access_token && save(d)) return sess.access_token;
    } catch {}
    return sess.exp > Date.now() ? sess.access_token : null; // 네트워크 오류: 아직 안 만료됐으면 그대로
  };
  A.clear = () => { sess = null; ls.del(KEY); };
  A.logout = async () => {
    const t = sess && sess.access_token; A.clear();
    if (t) { try { await fetch(`${C().SUPABASE_URL}/auth/v1/logout`, { method: "POST", headers: { ...hdr(), Authorization: "Bearer " + t } }); } catch {} }
  };
  window.AUTH = A;
})();
