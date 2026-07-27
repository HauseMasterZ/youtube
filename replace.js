const fs = require('fs');
const file = 'c:/Users/Hause/Documents/Code/youtube/app.js';
let content = fs.readFileSync(file, 'utf8');

const target = `            if (isMobileDevice) {
                setTimeout(() => {
                    if (currentPlaybackSequence === sequenceId && !audioPlayer.paused) {
                        caches.match(cacheKey).then(cachedResponse => {
                            if (!cachedResponse) {
                                fetch(audioUrl, { priority: 'low' }).then(response => {
                                    if (response.ok) {
                                        caches.open('yt-player-media').then(cache => cache.put(cacheKey, response.clone()));
                                    }
                                }).catch(() => {});
                            }
                        });
                    }
                }, 5000);
            }`;

const replacement = `            // Enabled for Desktop too to handle out-of-order track caching
            setTimeout(() => {
                if (currentPlaybackSequence === sequenceId && !audioPlayer.paused) {
                    caches.match(cacheKey).then(cachedResponse => {
                        if (!cachedResponse) {
                            fetch(audioUrl, { priority: 'low' }).then(response => {
                                if (response.ok) {
                                    caches.open('yt-player-media').then(cache => cache.put(cacheKey, response.clone()));
                                }
                            }).catch(() => {});
                        }
                    });
                }
            }, 5000);`;

content = content.replace(target, replacement);
fs.writeFileSync(file, content, 'utf8');
