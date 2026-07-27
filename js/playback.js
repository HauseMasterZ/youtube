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
            const base64Artwork = [{ src: 'data:image/png;base64,' + "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", sizes: '512x512', type: 'image/png' }];
            if (!navigator.mediaSession.metadata) {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: track.title,
                    artist: track.channel,
                    artwork: base64Artwork
                });
            } else {
                navigator.mediaSession.metadata.title = track.title;
                navigator.mediaSession.metadata.artist = track.channel;
                navigator.mediaSession.metadata.artwork = base64Artwork;
            }
            navigator.mediaSession.playbackState = preventAutoplay ? "paused" : "playing";
        }

        if (!thumbsDisabled && getThumbUrl(track)) {
            const thumbUrl = getThumbUrl(track);
            albumArt.removeAttribute('src'); // Instantly clear the old image src
            albumArt.style.display = 'none'; // Instantly hide the old thumbnail
            
            // Wait for audio to successfully start playing before downloading art
            // This strictly reserves 100% bandwidth for the music stream
            const onPlayStart = () => {
                if (currentPlaybackSequence === sequenceId) {
                    albumArt.src = thumbUrl;
                    albumArt.style.display = 'block';
                    fetchDominantColor(track.id, thumbUrl, sequenceId, track);
                }
                audioPlayer.removeEventListener('playing', onPlayStart);
            };
            audioPlayer.addEventListener('playing', onPlayStart);
            
            // If the track is intentionally paused (uiOnly), load art immediately
            if (uiOnly || preventAutoplay) {
                onPlayStart();
            }
        } else {
            albumArt.style.display = 'none';
            document.documentElement.style.setProperty('--primary-color', '#8c73ff');
        }

        // Mobile & Desktop natively stream the audioUrl for instant playback
        audioPlayer.switchTrack(audioUrl, preventAutoplay || uiOnly);
        
        triggerPreloads();

        function fetchDominantColor(trackId, thumbUrl, sequenceId, track) {
            if (dominantColorCache.has(trackId)) {
                document.documentElement.style.setProperty('--primary-color', dominantColorCache.get(trackId));
            } else {
                const tempImg = new Image();
                tempImg.fetchPriority = "low";
                tempImg.crossOrigin = "Anonymous";
                tempImg.onload = () => {
                    if (currentPlaybackSequence === sequenceId) {
                        try {
                            const color = getDominantColor(tempImg, trackId);
                            document.documentElement.style.setProperty('--primary-color', color);
                        } catch(e) {}
                    }
                };
                tempImg.onerror = () => {
                    if (currentPlaybackSequence === sequenceId) {
                        document.documentElement.style.setProperty('--primary-color', '#8c73ff');
                    }
                };
                if (currentPlaybackSequence === sequenceId) {
                    tempImg.src = thumbUrl;
                }
            }

            // Generate Square thumbnail for MediaSession to prevent pillarboxing
            if (hasMediaSession) {
                // Instantly set metadata with 16:9 so lockscreen isn't blank while downloading
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: track.title,
                    artist: track.channel,
                    artwork: [
                        { src: thumbUrl, sizes: '1280x720', type: 'image/jpeg' }
                    ]
                });

                const squareImg = new Image();
                squareImg.crossOrigin = "Anonymous";
                squareImg.onload = () => {
                    if (currentPlaybackSequence !== sequenceId) return;
                    try {
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        canvas.width = 512;
                        canvas.height = 512;
                        const size = Math.min(squareImg.width, squareImg.height);
                        const startX = (squareImg.width - size) / 2;
                        const startY = (squareImg.height - size) / 2;
                        ctx.drawImage(squareImg, startX, startY, size, size, 0, 0, 512, 512);
                        
                        // Update with square crop
                        navigator.mediaSession.metadata = new MediaMetadata({
                            title: track.title,
                            artist: track.channel,
                            artwork: [
                                { src: canvas.toDataURL('image/jpeg', 0.9), sizes: '512x512', type: 'image/jpeg' }
                            ]
                        });
                    } catch(e) {}
                };
                if (currentPlaybackSequence === sequenceId) {
                    squareImg.src = thumbUrl;
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
