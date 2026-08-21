// Service Worker for PWA
const CACHE_NAME = 'yt-player-cache-v105';

const CORE_ASSETS = [
    './index.html',
    './js/dom.js',
    './js/utils.js',
    './js/state.js',
    './js/ui.js',
    './js/mediaSession.js',
    './js/lyrics.js',
    './js/playback.js',
    './js/main.js',
    './css/style.css',
    './manifest.json',
    './assets/icon-192.png',
    './assets/icon-512.png',
    './assets/purple-note.svg',
    './assets/fonts/GoogleSansFlex-Latin.woff2'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(CORE_ASSETS);
        })
    );
    self.skipWaiting();
});

const THUMBS_CACHE = 'yt-player-thumbs';

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME && cacheName !== 'yt-player-media' && cacheName !== THUMBS_CACHE) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    
    // 1. Audio Media Caching
    if (event.request.url.includes('.webm') || event.request.url.includes('.mp4')) {
        if (event.request.url.includes('bypass=true')) return;

        event.respondWith(
            caches.open('yt-player-media').then(cache => {
                const cacheKeyUrl = new URL(event.request.url);
                cacheKeyUrl.searchParams.delete('bypass');

                return cache.match(cacheKeyUrl.href).then(cachedResponse => {
                    if (cachedResponse) {
                        // CACHED: serve with Range support
                        const rangeHeader = event.request.headers.get('range');
                        if (!rangeHeader) return cachedResponse;

                        return cachedResponse.arrayBuffer().then(buffer => {
                            const total = buffer.byteLength;
                            const parts = rangeHeader.replace(/bytes=/, "").split("-");
                            const start = parseInt(parts[0], 10);
                            const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
                            const sliced = buffer.slice(start, end + 1);
                            return new Response(sliced, {
                                status: 206,
                                statusText: 'Partial Content',
                                headers: {
                                    'Content-Range': `bytes ${start}-${end}/${total}`,
                                    'Accept-Ranges': 'bytes',
                                    'Content-Length': sliced.byteLength,
                                    'Content-Type': cachedResponse.headers.get('Content-Type') || 'audio/webm'
                                }
                            });
                        });
                    }

                    // NOT CACHED: forward original headers (for Origin/CORS), strip only Range
                    const headers = new Headers(event.request.headers);
                    headers.delete('Range');
                    const fullRequest = new Request(cacheKeyUrl.href, {
                        headers: headers,
                        mode: event.request.mode
                    });
                    return fetch(fullRequest).then(response => {
                        if (!response.ok) return response;
                        cache.put(cacheKeyUrl.href, response.clone());
                        return response;
                    });
                });
            })
        );
        return;
    }

    // 2. Persistent Thumbnail Caching (Supports CORS & Opaque responses)
    if (event.request.url.includes('/thumbnails/') || event.request.url.includes('.webp')) {
        event.respondWith(
            caches.open(THUMBS_CACHE).then(async (cache) => {
                const cached = await cache.match(event.request.url);
                if (cached) return cached;
                try {
                    const response = await fetch(event.request);
                    if (response.ok || response.type === 'opaque') {
                        cache.put(event.request.url, response.clone());
                    }
                    return response;
                } catch (err) {
                    return cached || fetch(event.request);
                }
            })
        );
        return;
    }

    if (event.request.url.startsWith('blob:')) return;

    // 3. For JSON/CSS/JS: Cache-first, no background revalidation
    event.respondWith(
        caches.match(event.request).then(cached => {
            return cached || fetch(event.request).then(response => {
                if (response.ok && !event.request.url.includes('/sync') && !event.request.url.includes('/status')) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            }).catch(() => {
                return new Response('Network error occurred', { status: 408, headers: { 'Content-Type': 'text/plain' } });
            });
        })
    );
});












