// Service Worker for PWA
const CACHE_NAME = 'yt-player-cache-v35';

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

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    
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

                    // NOT CACHED: fetch FULL file from origin (strip Range header so CDN returns 200)
                    const fullRequest = new Request(cacheKeyUrl.href, { mode: 'cors' });
                    return fetch(fullRequest).then(response => {
                        if (!response.ok) return response;
                        // Cache the full 200 response
                        cache.put(cacheKeyUrl.href, response.clone());

                        // If Chrome asked for a range, serve it from the full response
                        const rangeHeader = event.request.headers.get('range');
                        if (rangeHeader) {
                            return response.arrayBuffer().then(buffer => {
                                const total = buffer.byteLength;
                                const parts = rangeHeader.replace(/bytes=/, "").split("-");
                                const start = parseInt(parts[0], 10);
                                const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
                                return new Response(buffer.slice(start, end + 1), {
                                    status: 206,
                                    statusText: 'Partial Content',
                                    headers: {
                                        'Content-Range': `bytes ${start}-${end}/${total}`,
                                        'Accept-Ranges': 'bytes',
                                        'Content-Length': end - start + 1,
                                        'Content-Type': response.headers.get('Content-Type') || 'audio/webm'
                                    }
                                });
                            });
                        }
                        return response;
                    });
                });
            })
        );
        return;
    }

    if (event.request.url.startsWith('blob:')) return;

    // For JSON/CSS/JS: Cache-first, no background revalidation
    event.respondWith(
        caches.match(event.request).then(cached => {
            return cached || fetch(event.request).then(response => {
                if (response.ok) {
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












