    const baseUrl = "__API_GATEWAY_URL__";
    const artworkSquareCache = new Map();
    function getSearchString(track) { return (track.title + " " + track.channel).toLowerCase(); }
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
                    artworkSquareCache.set(trackId, blobUrl);
                    callback(blobUrl);
                } else {
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
                    artworkSquareCache.set(trackId, dataUrl);
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
                    artworkSquareCache.set(trackId, dataUrl);
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
