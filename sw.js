// Service Worker for PWA
const CACHE_NAME = 'yt-player-cache-v66';

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

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME && cacheName !== 'yt-player-media') {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => clients.claim())
    );
});

// HMAC-SHA256 Token Generator in Service Worker
const _SW_ENC_SEED = "__ENC_HMAC_SEED__";

function _sw_d(s, k = 0x5A) {
    try {
        const r = atob(s);
        let o = "";
        for (let i = 0; i < r.length; i++) o += String.fromCharCode(r.charCodeAt(i) ^ k);
        return o;
    } catch (e) { return ""; }
}

async function _sw_getHMACToken() {
    try {
        const seed = _sw_d(_SW_ENC_SEED);
        if (!seed) return "";
        const slot = String(Math.floor(Date.now() / 30000));
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey("raw", enc.encode(seed), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        const sig = await crypto.subtle.sign("HMAC", key, enc.encode(slot));
        const bytes = new Uint8Array(sig);
        let bin = "";
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
    } catch (e) { return ""; }
}

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    
    if (event.request.url.includes('.webm') || event.request.url.includes('.mp4')) {
        if (event.request.url.includes('bypass=true')) return;

        event.respondWith(
            caches.open('yt-player-media').then(async (cache) => {
                const cacheKeyUrl = new URL(event.request.url);
                cacheKeyUrl.searchParams.delete('bypass');

                const cachedResponse = await cache.match(cacheKeyUrl.href);
                if (cachedResponse) {
                    // CACHED: serve with Range support
                    const rangeHeader = event.request.headers.get('range');
                    if (!rangeHeader) return cachedResponse;

                    const buffer = await cachedResponse.arrayBuffer();
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
                }

                // NOT CACHED: attach rolling HMAC token & forward headers
                const headers = new Headers(event.request.headers);
                headers.delete('Range');
                const token = await _sw_getHMACToken();
                if (token) headers.set('X-App-Token', token);

                const fullRequest = new Request(cacheKeyUrl.href, {
                    headers: headers,
                    mode: event.request.mode
                });
                const response = await fetch(fullRequest);
                if (response.ok) {
                    cache.put(cacheKeyUrl.href, response.clone());
                }
                return response;
            })
        );
        return;
    }

    if (event.request.url.startsWith('blob:')) return;

    // For JSON/CSS/JS: Cache-first with HMAC auth for API endpoints
    event.respondWith(
        caches.match(event.request).then(async (cached) => {
            if (cached) return cached;
            try {
                let fetchReq = event.request;
                if (event.request.url.includes('Database.json') || event.request.url.includes('/lyrics/') || event.request.url.includes('/sync') || event.request.url.includes('/status')) {
                    const token = await _sw_getHMACToken();
                    if (token) {
                        const headers = new Headers(event.request.headers);
                        headers.set('X-App-Token', token);
                        fetchReq = new Request(event.request, { headers });
                    }
                }
                const response = await fetch(fetchReq);
                if (response.ok && !event.request.url.includes('/sync') && !event.request.url.includes('/status')) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            } catch (err) {
                return new Response('Network error occurred', { status: 408, headers: { 'Content-Type': 'text/plain' } });
            }
        })
    );
});












