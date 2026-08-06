// Service Worker for PWA
const CACHE_NAME = 'yt-player-cache-v34';

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
    
    // Handle Media (WebM/MP4) with Range Request Support
    if (event.request.url.includes('.webm') || event.request.url.includes('.mp4')) {
        // If the browser was redirected here to bypass the SW, let it handle the request natively
        if (event.request.url.includes('bypass=true')) return;

        event.respondWith(
            caches.open('yt-player-media').then(cache => {
                // Remove bypass query param if checking cache just in case
                const cacheKeyUrl = new URL(event.request.url);
                cacheKeyUrl.searchParams.delete('bypass');
                
                return cache.match(cacheKeyUrl.href).then(cachedResponse => {
                    if (cachedResponse) {
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
                    
                    // If it's the background prefetcher (empty destination), let it fetch and cache normally
                    if (event.request.destination !== 'audio' && event.request.destination !== 'video') {
                        return fetch(event.request).then(response => {
                            if (response.status === 200 && !event.request.headers.has('range')) {
                                cache.put(cacheKeyUrl.href, response.clone());
                            }
                            return response;
                        });
                    }
                    
                    // If it IS the audio tag, REDIRECT to a bypass URL.
                    // This forces Chrome's native media stack to handle the network request directly.
                    // If we proxy it through fetch(event.request), Chrome loses native seeking/buffering
                    // and will dump the entire TCP buffer every time the user pauses and resumes!
                    const ua = event.request.headers.get('User-Agent') || '';
                    const isSafari = ua.includes('Safari') && !ua.includes('Chrome') && !ua.includes('Chromium');
                    if (isSafari) {
                        // Safari/iOS rejects 302 redirects for media byte-range requests, throwing an abort error.
                        // It also handles SW proxying perfectly natively without the Chrome TCP dump issue, so proxy it.
                        return fetch(event.request);
                    }
                    
                    const bypassUrl = new URL(event.request.url);
                    bypassUrl.searchParams.append('bypass', 'true');
                    return Response.redirect(bypassUrl.href, 302);
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












