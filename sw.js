// 오프라인 동작용 캐시. 코드를 수정해 배포할 때는 VERSION을 올린다.
const VERSION = 'v2';
const CACHE = `air-drum-${VERSION}`;

const ASSETS = [
  './',
  'index.html',
  'style.css',
  'manifest.json',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/app.js',
  'js/kit.js',
  'js/onset.js',
  'js/onset-worklet.js',
  'js/pose.js',
  'js/store.js',
  'js/synth.js',
  'vendor/mediapipe/vision_bundle.mjs',
  'vendor/mediapipe/wasm/vision_wasm_internal.js',
  'vendor/mediapipe/wasm/vision_wasm_internal.wasm',
  'vendor/mediapipe/pose_landmarker_lite.task',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('air-drum-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 큰 라이브러리(vendor)는 캐시 우선, 앱 코드는 온라인이면 최신 버전 우선 → 수정 사항이 바로 반영된다
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  const fromNetwork = () => fetch(e.request).then(res => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
    }
    return res;
  });
  const fromCache = () => caches.match(e.request, { ignoreSearch: true });

  if (url.pathname.includes('/vendor/')) {
    e.respondWith(fromCache().then(hit => hit || fromNetwork()));
  } else {
    e.respondWith(fromNetwork().catch(() => fromCache()));
  }
});
