    const baseUrl = "__API_GATEWAY_URL__";
    const artworkSquareCache = new Map();
    const MAX_SQUARE_CACHE = 30;

    function setCachedSquareArtwork(trackId, url) {
        if (artworkSquareCache.size >= MAX_SQUARE_CACHE) {
            const oldestKey = artworkSquareCache.keys().next().value;
            const oldestUrl = artworkSquareCache.get(oldestKey);
            if (oldestUrl && typeof oldestUrl === 'string' && oldestUrl.startsWith('blob:')) {
                try { URL.revokeObjectURL(oldestUrl); } catch (e) {}
            }
            artworkSquareCache.delete(oldestKey);
        }
        artworkSquareCache.set(trackId, url);
    }

    function getSearchString(track) { return (track.title + " " + track.channel).toLowerCase(); }

    function damerauLevenshtein(s1, s2) {
        const m = s1.length, n = s2.length;
        if (Math.abs(m - n) > 2) return 99;
        const dp = Array.from({ length: m + 1 }, () => new Uint8Array(n + 1));
        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                const cost = s1.charCodeAt(i - 1) === s2.charCodeAt(j - 1) ? 0 : 1;
                let d = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
                if (i > 1 && j > 1 && s1.charCodeAt(i - 1) === s2.charCodeAt(j - 2) && s1.charCodeAt(i - 2) === s2.charCodeAt(j - 1)) {
                    d = Math.min(d, dp[i - 2][j - 2] + cost);
                }
                dp[i][j] = d;
            }
        }
        return dp[m][n];
    }

    function calculateFuzzyScore(query, titleRaw, channelRaw) {
        if (!query) return 0;
        const title = (titleRaw || "").toLowerCase();
        const channel = (channelRaw || "").toLowerCase();
        const combined = `${title} ${channel}`;

        // 1. Exact full match
        if (title === query) return 10000;
        if (combined === query) return 9000;

        // 2. Exact phrase substring
        const titleIdx = title.indexOf(query);
        if (titleIdx !== -1) {
            const isWordStart = (titleIdx === 0 || " -_([/{".includes(title[titleIdx - 1]));
            return 7000 + (isWordStart ? 1000 : 0) - titleIdx * 2;
        }
        const combIdx = combined.indexOf(query);
        if (combIdx !== -1) {
            return 5000 - combIdx * 2;
        }

        // 3. Acronym match (e.g. 'mtbmb' -> 'Music To Be Murdered By')
        const titleWords = title.match(/[a-z0-9]+/g) || [];
        const channelWords = channel.match(/[a-z0-9]+/g) || [];
        const allWords = titleWords.concat(channelWords);

        if (titleWords.length > 1) {
            const acronym = titleWords.map(w => w[0]).join("");
            if (query === acronym || (query.length >= 3 && acronym.includes(query))) {
                return 4500;
            }
        }

        // 4. Multi-token fuzzy match
        const tokens = query.split(/\s+/).filter(Boolean);
        if (tokens.length === 0) return 0;

        let totalTokenScore = 0;
        for (let t = 0; t < tokens.length; t++) {
            const token = tokens[t];
            const tLen = token.length;
            const maxDist = tLen <= 4 ? 1 : 2;
            let bestWordScore = 0;

            for (let w = 0; w < allWords.length; w++) {
                const word = allWords[w];
                if (word === token) {
                    bestWordScore = Math.max(bestWordScore, 1000);
                    break;
                } else if (word.startsWith(token)) {
                    bestWordScore = Math.max(bestWordScore, 800);
                } else if (word.includes(token)) {
                    bestWordScore = Math.max(bestWordScore, 600);
                } else if (tLen >= 3) {
                    const subW = word.slice(0, tLen);
                    const dist = damerauLevenshtein(token, subW);
                    if (dist <= maxDist) {
                        bestWordScore = Math.max(bestWordScore, 500 - dist * 100);
                    } else {
                        const distFull = damerauLevenshtein(token, word);
                        if (distFull <= maxDist) {
                            bestWordScore = Math.max(bestWordScore, 400 - distFull * 100);
                        }
                    }
                }
            }

            if (bestWordScore === 0 && tLen >= 3) {
                // Sequential subsequence match (e.g. 'gdzla' in 'godzilla')
                let ti = 0;
                for (let i = 0; i < combined.length; i++) {
                    if (combined[i] === token[ti]) {
                        ti++;
                        if (ti === tLen) break;
                    }
                }
                if (ti === tLen) {
                    bestWordScore = 300;
                }
            }

            if (bestWordScore > 0) {
                totalTokenScore += bestWordScore;
            } else {
                return 0; // All tokens must match
            }
        }

        return 2000 + totalTokenScore;
    }
    function getThumbUrl(track) { return track.thumbnail_path ? `${baseUrl}/${track.thumbnail_path.split('/').map(encodeURIComponent).join('/')}` : null; }
    async function getSquareArtwork(url, trackId, callback) {
        if (!url) return;
        if (artworkSquareCache.has(trackId)) {
            callback(artworkSquareCache.get(trackId));
            return;
        }
        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error('Fetch failed');
            const blob = await resp.blob();
            const bitmap = await createImageBitmap(blob);
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 512;
            const ctx = canvas.getContext('2d');
            const size = Math.min(bitmap.width, bitmap.height);
            const sx = (bitmap.width - size) / 2;
            const sy = (bitmap.height - size) / 2;
            ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, 512, 512);
            canvas.toBlob((squareBlob) => {
                if (squareBlob) {
                    const blobUrl = URL.createObjectURL(squareBlob);
                    setCachedSquareArtwork(trackId, blobUrl);
                    callback(blobUrl);
                } else {
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
                    setCachedSquareArtwork(trackId, dataUrl);
                    callback(dataUrl);
                }
            }, 'image/jpeg', 0.92);
        } catch (err) {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = function() {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = 512;
                    canvas.height = 512;
                    const ctx = canvas.getContext('2d');
                    const size = Math.min(img.naturalWidth, img.naturalHeight);
                    const sx = (img.naturalWidth - size) / 2;
                    const sy = (img.naturalHeight - size) / 2;
                    ctx.drawImage(img, sx, sy, size, size, 0, 0, 512, 512);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
                    setCachedSquareArtwork(trackId, dataUrl);
                    callback(dataUrl);
                } catch(e) {
                    callback(url);
                }
            };
            img.onerror = () => callback(url);
            img.src = url;
        }
    }
    function getAudioUrl(track) { return `${baseUrl}/${track.file_path.split('/').map(encodeURIComponent).join('/')}`; }
    function formatTime(seconds) {
        if (isNaN(seconds) || seconds === Infinity) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    function parseISODuration(pt) {
        if (!pt) return 0;
        // If it's already a number or a numeric string, just return it
        if (!isNaN(pt)) return parseInt(pt, 10);
        
        const match = String(pt).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (!match) return 0;
        const h = parseInt(match[1] || 0, 10);
        const m = parseInt(match[2] || 0, 10);
        const s = parseInt(match[3] || 0, 10);
        return h * 3600 + m * 60 + s;
    }
    function normalizeTrackItem(item, folderName) {
        if (!item) return null;
        let normalized;
        if (Array.isArray(item)) {
            normalized = {
                id: item[0],
                title: item[1],
                channel: item[2],
                duration: item[3],
                file_path: `${folderName}/${item[0]}.webm`,
                thumbnail_path: `${folderName}/thumbnails/${item[0]}.webp`,
                color: (item[5] && item[5] !== '#000000') ? item[5] : '#8c73ff'
            };
        } else {
            normalized = {
                ...item,
                file_path: `${folderName}/${item.id}.webm`,
                thumbnail_path: `${folderName}/thumbnails/${item.id}.webp`,
                color: (item.color && item.color !== '#000000') ? item.color : '#8c73ff'
            };
        }
        if (normalized.id && normalized.color) {
            dominantColorCache.set(normalized.id, normalized.color);
        }
        return normalized;
    }

    function isValidTrackItem(item) {
        if (!item) return false;
        const title = String(Array.isArray(item) ? item[1] : (item.title || ''));
        return !title.includes('Deleted/Private Video') && !title.includes('Deleted video') && !title.includes('Private video');
    }

    function normalizePlaylistData(data, folderName) {
        if (!Array.isArray(data)) return [];
        
        const result = [];
        let i = 0;
        
        // Immediate pass: Normalize the first 30 valid tracks for instant 0ms mount
        for (; i < data.length && result.length < 30; i++) {
            const item = data[i];
            if (isValidTrackItem(item)) {
                result.push(normalizeTrackItem(item, folderName));
            }
        }

        // Background idle slice: Normalize the rest without blocking the main thread
        if (i < data.length) {
            const scheduleIdle = (cb) => {
                if ('requestIdleCallback' in window) {
                    window.requestIdleCallback(cb, { timeout: 2000 });
                } else {
                    setTimeout(() => cb({ timeRemaining: () => 15, didTimeout: true }), 16);
                }
            };

            const processRemaining = (deadline) => {
                while (i < data.length && (deadline.timeRemaining() > 1 || deadline.didTimeout)) {
                    const chunkLimit = Math.min(i + 50, data.length);
                    for (; i < chunkLimit; i++) {
                        const item = data[i];
                        if (isValidTrackItem(item)) {
                            result.push(normalizeTrackItem(item, folderName));
                        }
                    }
                }

                if (i < data.length) {
                    scheduleIdle(processRemaining);
                } else {
                    // Full playlist normalized: sync UI list bounds & cross-shuffle deck
                    if (typeof playlistSelect !== 'undefined' && playlistSelect.value === folderName && typeof searchInput !== 'undefined' && searchInput.value.trim() === '') {
                        filteredIndices = result.map((_, idx) => ({ playlist: folderName, index: idx }));
                        if (typeof trackList !== 'undefined') {
                            trackList.style.height = `${filteredIndices.length * ITEM_HEIGHT}px`;
                        }
                        if (typeof generateQueue === 'function' && (!globalActivePlaylist || queueIndex === -1)) {
                            generateQueue(false, folderName);
                        }
                    }
                    if (typeof window.rebuildCrossShuffleDeck === 'function') {
                        window.rebuildCrossShuffleDeck();
                    }
                }
            };

            scheduleIdle(processRemaining);
        }

        return result;
    }
