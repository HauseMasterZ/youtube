// Service Worker for PWA
const CACHE_NAME = 'yt-player-cache-v11';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    // We just act as a network-first proxy to satisfy the PWA install requirement.
    // The browser will handle caching naturally.
    event.respondWith(fetch(event.request).catch(() => {
        return new Response('Network error occurred', { status: 408, headers: { 'Content-Type': 'text/plain' } });
    }));
});












