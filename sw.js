// Service Worker for PWA
const CACHE_NAME = 'yt-player-cache-v19.7';

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

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME && cacheName !== 'yt-player-media-v19.7') {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    
    // Bypass service worker entirely for blob URLs
    if (event.request.url.startsWith('blob:')) {
        return; 
    }

    if (event.request.url.includes('.webm') || event.request.url.includes('.mp4')) {
        event.respondWith(
            caches.open('yt-player-media-v19.7').then(cache =>
                cache.match(event.request).then(cached => {
                    if (cached) return cached;
                    return fetch(event.request).then(response => {
                        if (response.ok) cache.put(event.request, response.clone());
                        return response;
                    });
                })
            )
        );
        return;
    }

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












