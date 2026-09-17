// Service Worker for PWA
const CACHE_NAME = 'yt-player-cache-v150';

const CORE_ASSETS = [
    './',
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
    './assets/icon.svg',
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
        }).then(async () => {
            try {
                const thumbCache = await caches.open(THUMBS_CACHE);
                const keys = await thumbCache.keys();
                for (const key of keys) {
                    const res = await thumbCache.match(key);
                    if (res && res.type === 'opaque') {
                        await thumbCache.delete(key);
                    }
                }
            } catch {}
        }).then(() => clients.claim())
    );
});

// LRU Cache Size Limiter to protect browser storage quotas
async function limitCacheSize(cacheName, maxItems) {
    try {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        if (keys.length > maxItems) {
            const deleteCount = keys.length - maxItems;
            for (let i = 0; i < deleteCount; i++) {
                await cache.delete(keys[i]);
            }
        }
    } catch (e) {
        // Ignore cache lock errors
    }
}

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    
    // 1. Audio Media Caching
    if (event.request.url.includes('.webm') || event.request.url.includes('.opus') || event.request.url.includes('.mp4') || event.request.url.includes('.m4a')) {
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
                            const defaultMime = event.request.url.includes('.opus')
                                ? 'audio/ogg; codecs=opus'
                                : (event.request.url.includes('.m4a') ? 'audio/mp4' : 'audio/webm');
                            return new Response(sliced, {
                                status: 206,
                                statusText: 'Partial Content',
                                headers: {
                                    'Content-Range': `bytes ${start}-${end}/${total}`,
                                    'Accept-Ranges': 'bytes',
                                    'Content-Length': sliced.byteLength,
                                    'Content-Type': cachedResponse.headers.get('Content-Type') || defaultMime
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
                        limitCacheSize('yt-player-media', 1000);
                        return response;
                    });
                });
            })
        );
        return;
    }

    // 2. Persistent Thumbnail Caching (URL-normalized)
    if (event.request.url.includes('/thumbnails/') || event.request.url.includes('.webp')) {
        event.respondWith(
            caches.open(THUMBS_CACHE).then(async (cache) => {
                const cached = await cache.match(event.request.url);
                if (cached) {
                    if (cached.type === 'opaque') {
                        // Opaque response cannot be returned to a cors request - purge it immediately
                        cache.delete(event.request.url);
                    } else {
                        return cached;
                    }
                }
                try {
                    const response = await fetch(event.request);
                    // Never cache opaque responses in THUMBS_CACHE
                    if (response.ok && response.type !== 'opaque') {
                        cache.put(event.request.url, response.clone());
                        limitCacheSize(THUMBS_CACHE, 1000);
                    }
                    return response;
                } catch (err) {
                    if (cached && cached.type !== 'opaque') {
                        return cached;
                    }
                    return new Response('', { status: 408, statusText: 'Thumbnail request failed' });
                }
            })
        );
        return;
    }

    if (event.request.url.startsWith('blob:')) return;

    // 3. Database JSON: True Stale-While-Revalidate Strategy
    if (event.request.url.includes('_Playlist_Database.json')) {
        const cleanUrl = event.request.url.split('?')[0];
        // If request explicitly includes timestamp/version bypass (?t= or ?v=), fetch fresh from network and update cache
        if (event.request.url.includes('?t=') || event.request.url.includes('?v=')) {
            event.respondWith(
                fetch(event.request, { cache: 'no-store' }).then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(cleanUrl, clone));
                    }
                    return response;
                }).catch(() => caches.match(cleanUrl))
            );
            return;
        }

        // Standard request: Instant cached response with guaranteed background network revalidation (SWR)
        event.respondWith(
            caches.match(cleanUrl).then(cached => {
                const networkFetch = fetch(event.request, { cache: 'no-store' }).then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(cleanUrl, clone));
                    }
                    return response;
                }).catch(() => null);

                if (cached) {
                    event.waitUntil(networkFetch);
                    return cached;
                }
                return networkFetch.then(res => res || caches.match(cleanUrl));
            })
        );
        return;
    }

    // 4. Lyrics (.lrc): Network-first with cache fallback
    if (event.request.url.includes('/lyrics/') || event.request.url.includes('.lrc')) {
        event.respondWith(
            fetch(event.request).then(response => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            }).catch(() => caches.match(event.request))
        );
        return;
    }

    // 5. Navigation Fallback: Always return cached App Shell for HTML document navigations
    if (event.request.mode === 'navigate') {
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                return caches.match('./').then(cachedRoot => {
                    if (cachedRoot) return cachedRoot;
                    return caches.match('./index.html').then(cachedIndex => {
                        if (cachedIndex) return cachedIndex;
                        return fetch(event.request);
                    });
                });
            }).catch(() => {
                return caches.match('./').then(cachedRoot => {
                    return cachedRoot || caches.match('./index.html');
                });
            })
        );
        return;
    }

    // 6. For JSON/CSS/JS and static assets: Cache-first, no background revalidation
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
