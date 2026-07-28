    function preloadAllPlaylists(excludePl) {
        ALL_PLAYLISTS.forEach(pl => {
            if (pl !== excludePl && !allDatabases[pl]) {
                fetch(`${baseUrl}/${pl}/_Playlist_Database.json`)
                    .then(res => res.json())
                    .then(data => {
                        allDatabases[pl] = data;
                    }).catch(e => {});
            }
        });
    }

    async function loadPlaylist(folderName) {
        trackList.style.display = 'none';
        playlistMessage.style.display = 'block';
        playlistMessage.textContent = 'Loading...';
        playlistMessage.style.color = 'var(--text-secondary)';
        
        try {
            if (!allDatabases[folderName]) {
                const res = await fetch(`${baseUrl}/${folderName}/_Playlist_Database.json`);
                if (!res.ok) throw new Error();
                const data = await res.json();
                
                allDatabases[folderName] = data;
            }
            
            currentPlaylistData = allDatabases[folderName];
            
            searchInput.value = '';
            filteredIndices = currentPlaylistData.map((_, i) => ({ playlist: folderName, index: i }));
            
            trackList.style.height = `${filteredIndices.length * ITEM_HEIGHT}px`;
            globalActiveOriginalIndex = -1;
            poolInitialized = false;
            prefetchedUrls.clear();
            
            generateQueue(true); 
            
            trackList.style.display = 'block';
            playlistMessage.style.display = 'none';
            // Force first render
            lastStartIndex = -1;
            renderVirtualTracks();
        } catch (error) {
            console.error(error);
            trackList.style.display = 'none';
            playlistMessage.style.display = 'block';
            playlistMessage.textContent = 'Failed to load playlist database.';
            playlistMessage.style.color = '#ff5555';
        }
    }
    function generateQueue(resetPlayback = false) {
        let indices = Array.from({length: currentPlaylistData.length}, (_, i) => i);
        
        if (shuffleMode === 2) {
            const randomBuffer = new Uint32Array(1);
            for (let i = indices.length - 1; i > 0; i--) {
                window.crypto.getRandomValues(randomBuffer);
                const j = randomBuffer[0] % (i + 1);
                [indices[i], indices[j]] = [indices[j], indices[i]];
            }
            if (!resetPlayback && queueIndex !== -1) {
                const currentOriginalIndex = playQueue[queueIndex];
                indices = indices.filter(i => i !== currentOriginalIndex);
                indices.unshift(currentOriginalIndex);
                queueIndex = 0;
            }
        } else if (!resetPlayback && queueIndex !== -1) {
            const currentOriginalIndex = playQueue[queueIndex];
            queueIndex = currentOriginalIndex;
        }
        
        playQueue = indices;
        if (resetPlayback) queueIndex = -1;
    }
    // Helper for cross-playlist shuffle: switch playlist context and play a specific track
    function playFromPlaylist(playlist, trackIndex) {
        if (playlist !== playlistSelect.value) {
            playlistSelect.value = playlist;
            currentPlaylistData = allDatabases[playlist];
            searchInput.value = '';
            filteredIndices = currentPlaylistData.map((_, i) => ({ playlist: playlist, index: i }));
            trackList.style.height = `${filteredIndices.length * ITEM_HEIGHT}px`;
            poolInitialized = false;
            prefetchedUrls.clear();
            playQueue = Array.from({length: currentPlaylistData.length}, (_, i) => i);
        }
        queueIndex = trackIndex;
        executePlayback();
    }

    function playTrackSelection(targetPlaylist, targetOriginalIndex) {
        // Add to cross-shuffle history if in mode 2
        if (shuffleMode === 1) {
            crossShuffleHistory.length = crossShufflePos + 1;
            crossShuffleHistory.push({ playlist: targetPlaylist, index: targetOriginalIndex });
            crossShufflePos++;
        }
        
        if (targetPlaylist !== playlistSelect.value) {
            if (shuffleMode === 1) {
                // In shuffle-all mode, use lightweight playlist switch
                playFromPlaylist(targetPlaylist, targetOriginalIndex);
            } else {
                // Cross-playlist jump with full reload
                playlistSelect.value = targetPlaylist;
                
                // Clear search before loading new playlist so filteredIndices syncs properly
                if (searchInput.value.trim() !== "") {
                    searchInput.value = "";
                }
                
                loadPlaylist(targetPlaylist).then(() => {
                    queueIndex = playQueue.indexOf(targetOriginalIndex);
                    executePlayback();
                });
            }
        } else {
            // If we are playing from a search, clear the search instantly
            if (searchInput.value.trim() !== "") {
                searchInput.value = "";
                filteredIndices = currentPlaylistData.map((_, i) => ({ playlist: playlistSelect.value, index: i }));
                trackList.style.height = `${filteredIndices.length * ITEM_HEIGHT}px`;
            }
            queueIndex = playQueue.indexOf(targetOriginalIndex);
            executePlayback();
        }
    }
    function playNext() {
        // Cross-playlist shuffle (mode 2)
        if (shuffleMode === 1) {
            if (crossShufflePos < crossShuffleHistory.length - 1) {
                // Navigating forward through existing history
                crossShufflePos++;
            } else {
                // Pick random track from any loaded playlist uniformly
                const loadedPls = ALL_PLAYLISTS.filter(pl => allDatabases[pl]);
                if (loadedPls.length === 0) return;
                
                let totalTracks = 0;
                const plOffsets = [];
                for (const pl of loadedPls) {
                    plOffsets.push({ playlist: pl, start: totalTracks, count: allDatabases[pl].length });
                    totalTracks += allDatabases[pl].length;
                }
                
                const randomBuffer = new Uint32Array(1);
                window.crypto.getRandomValues(randomBuffer);
                const randomGlobalIdx = randomBuffer[0] % totalTracks;
                
                let randomPl = loadedPls[0];
                let randomIdx = 0;
                for (const offset of plOffsets) {
                    if (randomGlobalIdx >= offset.start && randomGlobalIdx < offset.start + offset.count) {
                        randomPl = offset.playlist;
                        randomIdx = randomGlobalIdx - offset.start;
                        break;
                    }
                }
                crossShuffleHistory.length = crossShufflePos + 1;
                crossShuffleHistory.push({ playlist: randomPl, index: randomIdx });
                crossShufflePos++;
            }
            const entry = crossShuffleHistory[crossShufflePos];
            playFromPlaylist(entry.playlist, entry.index);
            return;
        }
        
        if (playQueue.length === 0) return;
        
        if (queueIndex + 1 < playQueue.length) {
            queueIndex++;
            executePlayback();
        } else if (repeatMode === 1) { 
            queueIndex = 0;
            executePlayback();
        } else {
            setPlayUI(false);
        }
    }

    function playPrev() {
        // Cross-playlist shuffle (mode 2)
        if (shuffleMode === 1) {
            if (crossShufflePos > 0) {
                crossShufflePos--;
                const entry = crossShuffleHistory[crossShufflePos];
                playFromPlaylist(entry.playlist, entry.index);
            } else {
                audioPlayer.currentTime = 0;
                updateTimeUI(0);
                audioPlayer.play();
            }
            return;
        }
        
        if (playQueue.length === 0) return;

        if (queueIndex > 0) {
            queueIndex--;
            executePlayback();
        } else if (repeatMode === 1) {
            queueIndex = playQueue.length - 1;
            executePlayback();
        } else {
            audioPlayer.currentTime = 0;
            updateTimeUI(0);
            audioPlayer.play();
        }
    }
    function executePlayback(preventAutoplay = false) {
        // preventAutoplay here acts as a uiOnly flag for restoring the last played track
        const uiOnly = preventAutoplay;
        
        // Cancel any pending error auto-skip when user manually selects a track
        if (errorSkipTimer) {
            clearTimeout(errorSkipTimer);
            errorSkipTimer = null;
        }
        if (queueIndex < 0 || queueIndex >= playQueue.length) return;
        
        currentPlaybackSequence++;
        const sequenceId = currentPlaybackSequence;
        
        const originalIndex = playQueue[queueIndex];
        globalActiveOriginalIndex = originalIndex;
        
        const track = currentPlaylistData[originalIndex];

        currentTitle.textContent = track.title;
        currentTitle.style.color = "#ffffff"; // Reset color in case it was red from an error
        currentChannel.textContent = track.channel;
        
        localStorage.setItem("lastPlaylist", playlistSelect.value);
        localStorage.setItem("lastTrackId", track.id);

        scrollToTrack(originalIndex);

        updateTimeUI(0);
        if (track.duration) {
            const parsedDuration = parseISODuration(track.duration);
            if (parsedDuration > 0) {
                seekBar.max = parsedDuration;
                totalTimeDisplay.textContent = formatTime(parsedDuration);
            } else {
                seekBar.max = 0;
                totalTimeDisplay.textContent = "0:00";
            }
        } else {
            seekBar.max = 0; // Reset seekbar to prevent seeking before load
            totalTimeDisplay.textContent = "0:00";
        }
        seekBar.value = 0;

        const audioUrl = getAudioUrl(track);
        const cacheKey = `${baseUrl}/_cache/${track.id}`;
        
        if (hasMediaSession) {
            const thumbUrl = getThumbUrl(track);
            const artwork = thumbUrl
                ? [{ src: thumbUrl, sizes: '512x512', type: 'image/jpeg' }]
                : [];
            if (!navigator.mediaSession.metadata) {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: track.title,
                    artist: track.channel,
                    artwork: artwork
                });
            } else {
                navigator.mediaSession.metadata.title = track.title;
                navigator.mediaSession.metadata.artist = track.channel;
                navigator.mediaSession.metadata.artwork = artwork;
            }
            navigator.mediaSession.playbackState = preventAutoplay ? "paused" : "playing";
        }

        if (getThumbUrl(track)) {
            const thumbUrl = getThumbUrl(track);
            if (!thumbsDisabled) {
                albumArt.removeAttribute('src'); // Instantly clear the old image src
                albumArt.style.display = 'none'; // Instantly hide the old thumbnail
                
                albumArt.src = thumbUrl;
                albumArt.style.display = 'block';
            } else {
                albumArt.style.display = 'none';
            }
            fetchDominantColor(track.id, thumbUrl, sequenceId, track);
        } else {
            albumArt.style.display = 'none';
            document.documentElement.style.setProperty('--primary-color', '#8c73ff');
        }

        // Mobile & Desktop natively stream the audioUrl for instant playback
        audioPlayer.switchTrack(audioUrl, preventAutoplay || uiOnly);
        
        triggerPreloads();

        async function fetchDominantColor(trackId, thumbUrl, sequenceId, track) {
            if (dominantColorCache.has(trackId)) {
                document.documentElement.style.setProperty('--primary-color', dominantColorCache.get(trackId));
                if (hasMediaSession && squareArtworkCache.has(trackId)) {
                    navigator.mediaSession.metadata = new MediaMetadata({
                        title: track.title,
                        artist: track.channel,
                        artwork: [{ src: squareArtworkCache.get(trackId), sizes: '512x512', type: 'image/jpeg' }]
                    });
                }
            } else {
                try {
                    const response = await fetch(thumbUrl, { mode: 'cors' });
                    const blob = await response.blob();
                    const imgBmp = await createImageBitmap(blob);
                    
                    const targetSize = 512;
                    const size = Math.min(imgBmp.width, imgBmp.height);
                    const startX = (imgBmp.width - size) / 2;
                    const startY = (imgBmp.height - size) / 2;
                    
                    let sqBlobUrl = null;
                    let r, g, b;
                    
                    if (window.OffscreenCanvas) {
                        const offCanvas = new OffscreenCanvas(targetSize, targetSize);
                        const ctx = offCanvas.getContext('2d');
                        ctx.drawImage(imgBmp, startX, startY, size, size, 0, 0, targetSize, targetSize);
                        const sqBlob = await offCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
                        sqBlobUrl = URL.createObjectURL(sqBlob);
                        
                        const offCanvas1x1 = new OffscreenCanvas(1, 1);
                        const ctx1 = offCanvas1x1.getContext('2d', { willReadFrequently: true });
                        ctx1.drawImage(imgBmp, 0, 0, 1, 1);
                        const data = ctx1.getImageData(0, 0, 1, 1).data;
                        r = data[0]; g = data[1]; b = data[2];
                    } else {
                        const canvas = document.createElement('canvas');
                        canvas.width = targetSize;
                        canvas.height = targetSize;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(imgBmp, startX, startY, size, size, 0, 0, targetSize, targetSize);
                        sqBlobUrl = canvas.toDataURL('image/jpeg', 0.85);
                        
                        const canvas1x1 = document.createElement('canvas');
                        canvas1x1.width = 1; canvas1x1.height = 1;
                        const ctx1 = canvas1x1.getContext('2d');
                        ctx1.drawImage(imgBmp, 0, 0, 1, 1);
                        const data = ctx1.getImageData(0, 0, 1, 1).data;
                        r = data[0]; g = data[1]; b = data[2];
                    }
                    
                    if (trackId && sqBlobUrl) squareArtworkCache.set(trackId, sqBlobUrl);
                    
                    let brightness = (r * 299 + g * 587 + b * 114) / 1000;
                    if (brightness < 120) {
                        let factor = 120 / Math.max(brightness, 1);
                        r = Math.min(255, Math.floor(r * factor));
                        g = Math.min(255, Math.floor(g * factor));
                        b = Math.min(255, Math.floor(b * factor));
                    }
                    const color = `rgb(${r}, ${g}, ${b})`;
                    if (trackId) dominantColorCache.set(trackId, color);

                    if (currentPlaybackSequence === sequenceId) {
                        document.documentElement.style.setProperty('--primary-color', color);
                        if (hasMediaSession && sqBlobUrl) {
                            navigator.mediaSession.metadata = new MediaMetadata({
                                title: track.title,
                                artist: track.channel,
                                artwork: [{ src: sqBlobUrl, sizes: '512x512', type: 'image/jpeg' }]
                            });
                        }
                    }
                } catch(e) {
                    if (currentPlaybackSequence === sequenceId) {
                        document.documentElement.style.setProperty('--primary-color', '#8c73ff');
                        if (hasMediaSession) {
                            navigator.mediaSession.metadata = new MediaMetadata({
                                title: track.title,
                                artist: track.channel,
                                artwork: [{ src: thumbUrl, sizes: '512x512', type: 'image/jpeg' }]
                            });
                        }
                    }
                }
            }
        }

        // MediaSession metadata already updated at the top of executePlayback
        
        if (window.lyricsActive) {
            loadLyrics(track);
        }
    }

    function preloadTrack(track) {
        if (isMobileDevice || !track) return;
        const audioUrl = getAudioUrl(track);
        const cacheKey = `${baseUrl}/_cache/${track.id}`;
        
        if (preloadedBlobs.has(cacheKey) || preloadedFetches.has(cacheKey)) return;
        
        const fetchPromise = caches.match(cacheKey).then(cachedResponse => {
            if (cachedResponse) return cachedResponse.blob();
            return fetch(audioUrl, { priority: 'low' }).then(response => {
                if (!response.ok) throw new Error();
                const cloned = response.clone();
                caches.open('yt-player-media').then(cache => cache.put(cacheKey, cloned));
                return response.blob();
            });
        }).then(blob => {
            if (!preloadedBlobs.has(cacheKey)) {
                preloadedBlobs.set(cacheKey, URL.createObjectURL(blob));
            }
            return blob;
        });
        
        fetchPromise.catch(e => {});
        preloadedFetches.set(cacheKey, fetchPromise);
    }

    function triggerPreloads() {
        if (isMobileDevice) return;
        
        let nextTrack = null;
        let prevTrack = null;
        
        if (shuffleMode === 1) {
            if (crossShufflePos < crossShuffleHistory.length - 1) {
                const entry = crossShuffleHistory[crossShufflePos + 1];
                if (allDatabases[entry.playlist]) nextTrack = allDatabases[entry.playlist][entry.index];
            } else {
                const loadedPls = ALL_PLAYLISTS.filter(pl => allDatabases[pl]);
                if (loadedPls.length > 0) {
                    let totalTracks = 0;
                    const plOffsets = [];
                    for (const pl of loadedPls) {
                        plOffsets.push({ playlist: pl, start: totalTracks, count: allDatabases[pl].length });
                        totalTracks += allDatabases[pl].length;
                    }
                    const randomBuffer = new Uint32Array(1);
                    window.crypto.getRandomValues(randomBuffer);
                    const randomGlobalIdx = randomBuffer[0] % totalTracks;
                    
                    let randomPl = loadedPls[0];
                    let randomIdx = 0;
                    for (const offset of plOffsets) {
                        if (randomGlobalIdx >= offset.start && randomGlobalIdx < offset.start + offset.count) {
                            randomPl = offset.playlist;
                            randomIdx = randomGlobalIdx - offset.start;
                            break;
                        }
                    }
                    // Generate ahead of time
                    crossShuffleHistory.push({ playlist: randomPl, index: randomIdx });
                    nextTrack = allDatabases[randomPl][randomIdx];
                }
            }
            if (crossShufflePos > 0) {
                const prevEntry = crossShuffleHistory[crossShufflePos - 1];
                if (allDatabases[prevEntry.playlist]) prevTrack = allDatabases[prevEntry.playlist][prevEntry.index];
            }
        } else {
            if (playQueue.length > 0) {
                let nIdx = queueIndex + 1;
                if (nIdx >= playQueue.length && repeatMode === 1) nIdx = 0;
                if (nIdx < playQueue.length) nextTrack = currentPlaylistData[playQueue[nIdx]];
                
                let pIdx = queueIndex - 1;
                if (pIdx < 0 && repeatMode === 1) pIdx = playQueue.length - 1;
                if (pIdx >= 0) prevTrack = currentPlaylistData[playQueue[pIdx]];
            }
        }
        
        const nextUrl = nextTrack ? getAudioUrl(nextTrack) : null;
        const prevUrl = prevTrack ? getAudioUrl(prevTrack) : null;
        const currentTrack = currentPlaylistData[playQueue[queueIndex]] || currentPlaylistData[globalActiveOriginalIndex];
        const currentUrl = currentTrack ? getAudioUrl(currentTrack) : null;
        
        for (const [url, blobUrl] of preloadedBlobs.entries()) {
            if (url !== nextUrl && url !== prevUrl && url !== currentUrl) {
                URL.revokeObjectURL(blobUrl);
                preloadedBlobs.delete(url);
                preloadedFetches.delete(url);
            }
        }
    }
    // --- Deep Sleep JS Engine Integration (1Hz timer) ---
    function syncLoop() {
        syncRAFId = null;
        if (audioPlayer.paused || document.hidden) return;
        let dur = audioPlayer.duration;
        if (!dur || isNaN(dur) || dur === Infinity) {
            dur = parseInt(seekBar.max) || 0;
        }
        if (!isSeeking && dur > 0) {
            const ct = Math.floor(audioPlayer.currentTime);
            if (ct !== lastRenderTime) {
                updateTimeUI(ct);
            }
        }
        syncRAFId = setTimeout(syncLoop, 1000);
    }

    function startSync() {
        if (!syncRAFId && !audioPlayer.paused && !document.hidden) {
            syncRAFId = setTimeout(syncLoop, 1000);
        }
    }

    function stopSync() {
        if (syncRAFId) {
            clearTimeout(syncRAFId);
            syncRAFId = null;
        }
    }
