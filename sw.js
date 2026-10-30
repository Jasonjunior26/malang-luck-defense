// 서비스워커: 앱 셸 프리캐시 + stale-while-revalidate. 배포할 때마다 CACHE_VERSION 을 올린다.
const CACHE_VERSION = 'v7-kakao-auth';
const SHELL_CACHE = 'malang-shell-' + CACHE_VERSION;
const FONT_CACHE = 'malang-fonts-' + CACHE_VERSION;

const SHELL = [
  './', 'index.html', 'manifest.json',
  'config.js', 'auth.js', 'data.js', 'graphics.js', 'ui.js', 'game.js',
  'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/icon-maskable-512.png',
  'assets/icons/apple-touch-icon-180.png', 'assets/icons/favicon-32.png', 'assets/icons/icon.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      // 개별 실패가 설치 전체를 막지 않도록 하나씩 담는다 (index.html 은 필수)
      .then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(err => { if (u === 'index.html' || u === './') throw err; }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('malang-') && k !== SHELL_CACHE && k !== FONT_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

function swr(req, cacheName, fallbackUrl) {
  return caches.open(cacheName).then(cache =>
    cache.match(req, { ignoreSearch: true }).then(hit => {
      const net = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      if (hit) { net.catch(() => {}); return hit; }
      return net.then(res => res || (fallbackUrl ? cache.match(fallbackUrl) : null) || Response.error());
    })
  );
}

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // Google Fonts: 런타임 캐시 (GET 만)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    if (req.method === 'GET') e.respondWith(swr(req, FONT_CACHE));
    return;
  }
  // 그 외 다른 origin(Supabase 등) 과 비-GET 은 건드리지 않고 그대로 통과
  if (url.origin !== self.location.origin || req.method !== 'GET') return;

  // 네비게이션: 네트워크 실패 시 index.html 폴백
  if (req.mode === 'navigate') {
    e.respondWith(swr(new Request('index.html'), SHELL_CACHE, 'index.html'));
    return;
  }
  e.respondWith(swr(req, SHELL_CACHE));
});
