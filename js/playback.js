
    async function loadPlaylist(folderName) {
        trackList.style.display = 'none';
        playlistMessage.style.display = 'block';
        playlistMessage.textContent = 'Loading...';
        playlistMessage.style.color = 'var(--text-secondary)';
        
        try {
            if (!allDatabases[folderName]) {
                const res = await fetch(`${baseUrl}/${folderName}/_Playlist_Database.json`);
                if (!res.ok) throw new Error();
                let data = await res.json();
                
                if (data.length > 0 && Array.isArray(data[0])) {
                    data = data.map(item => ({
                        id: item[0],
                        title: item[1],
                        channel: item[2],
                        duration: item[3],
                        file_path: `${folderName}/${item[4]}.webm`,
                        thumbnail_path: `${folderName}/thumbnails/${item[4]}.webp`
                    }));
                }
                
                allDatabases[folderName] = data;
            }
            
            currentPlaylistData = allDatabases[folderName];
            
            searchInput.value = '';
            filteredIndices = currentPlaylistData.map((_, i) => ({ playlist: folderName, index: i }));
            
            trackList.style.height = `${filteredIndices.length * ITEM_HEIGHT}px`;
            poolInitialized = false;
            
            generateQueue(true); 
            
            trackList.style.display = 'block';
            playlistMessage.style.display = 'none';
            // Force first render
            lastStartIndex = -1;
            
            if (globalActivePlaylist === folderName && globalActiveOriginalIndex !== -1) {
                // Must render virtual tracks first so the elements exist in DOM before scrolling
                renderVirtualTracks();
                scrollToTrack(globalActiveOriginalIndex);
            } else {
                playlistContainer.scrollTop = 0;
                renderVirtualTracks();
            }
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
        // Cross-playlist shuffle (mode 1)
        if (shuffleMode === 1) {
            if (crossShufflePos < crossShuffleHistory.length - 1) {
                // Navigating forward through existing history/deck
                crossShufflePos++;
            } else {
                // Reached the end of the global deck, reshuffle!
                for (let i = crossShuffleHistory.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [crossShuffleHistory[i], crossShuffleHistory[j]] = [crossShuffleHistory[j], crossShuffleHistory[i]];
                }
                crossShufflePos = 0;
            }

            const target = crossShuffleHistory[crossShufflePos];
            playFromPlaylist(target.playlist, target.index);
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
        globalActivePlaylist = playlistSelect.value;
        
        const track = currentPlaylistData[originalIndex];

        if (track.is_dead) {
            currentTitle.textContent = "Skipping Dead Video...";
            currentTitle.style.color = "#ff5555";
            currentChannel.textContent = track.channel;
            scrollToTrack(originalIndex);
            
            // Mark the visual list item immediately
            Array.from(trackList.children).forEach(li => li.classList.remove('active'));
            const activeLi = Array.from(trackList.children).find(li => li.dataset.originalIndex == originalIndex);
            if (activeLi) {
                activeLi.classList.add('active');
            }

            if (!uiOnly) {
                // Instantly auto-skip to the next track if we are actively playing
                errorSkipTimer = setTimeout(() => {
                    playNext();
                }, 1000);
            }
            return;
        }

        currentTitle.textContent = track.title;
        currentTitle.style.color = "#ffffff"; // Reset color in case it was red from an error
        currentChannel.textContent = track.channel;

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

        let audioUrl = getAudioUrl(track);
        const cacheKey = `${baseUrl}/_cache/${track.id}`;
        

        if (preloadedFetches.has(cacheKey)) {
            const controller = preloadedFetches.get(cacheKey);
            if (controller && controller.abort) controller.abort();
            preloadedFetches.delete(cacheKey);
        }
        
        if (hasMediaSession) {
            if (!navigator.mediaSession.metadata) {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: track.title,
                    artist: track.channel,
                    artwork: []
                });
            } else {
                navigator.mediaSession.metadata.title = track.title;
                navigator.mediaSession.metadata.artist = track.channel;
                navigator.mediaSession.metadata.artwork = [];
            }
            navigator.mediaSession.playbackState = preventAutoplay ? "paused" : "playing";
        }

        if (!thumbsDisabled && getThumbUrl(track)) {
            const thumbUrl = getThumbUrl(track);
            albumArt.src = thumbUrl;
            albumArt.style.display = 'block';
            fetchVisuals(track.id, thumbUrl, sequenceId, track);
        } else {
            albumArt.removeAttribute('src');
            albumArt.style.display = 'none';
            document.documentElement.style.setProperty('--primary-color', '#8c73ff');
        }

        audioPlayer.switchTrack(audioUrl, preventAutoplay || uiOnly);

        function fetchVisuals(trackId, thumbUrl, sequenceId, track) {
            const hasCachedColor = dominantColorCache.has(trackId);
            
            if (hasCachedColor) {
                document.documentElement.style.setProperty('--primary-color', dominantColorCache.get(trackId));
            }

            // If both color and square artwork are cached, apply artwork and skip the image load entirely
            if (hasCachedColor && squareArtCache.has(trackId)) {
                setMediaSessionArtwork(squareArtCache.get(trackId), track, sequenceId);
                return;
            }

            const tempImg = new Image();
            tempImg.fetchPriority = "low";
            tempImg.crossOrigin = "Anonymous";
            tempImg.onload = () => {
                if (currentPlaybackSequence !== sequenceId) return;
                try {
                    if (!hasCachedColor) {
                        const color = getDominantColor(tempImg, trackId);
                        document.documentElement.style.setProperty('--primary-color', color);
                    }
                    // Center-crop to 1:1 square for MediaSession artwork
                    if (!squareArtCache.has(trackId)) {
                        const size = Math.min(tempImg.naturalWidth, tempImg.naturalHeight);
                        if (size > 0) {
                            const canvas = document.createElement('canvas');
                            canvas.width = size;
                            canvas.height = size;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(
                                tempImg,
                                (tempImg.naturalWidth - size) / 2, (tempImg.naturalHeight - size) / 2,
                                size, size,
                                0, 0, size, size
                            );
                            canvas.toBlob(blob => {
                                if (!blob || currentPlaybackSequence !== sequenceId) return;
                                const blobUrl = URL.createObjectURL(blob);
                                // Revoke any previously cached blob for a different track
                                if (squareArtCache.has(trackId)) URL.revokeObjectURL(squareArtCache.get(trackId));
                                squareArtCache.set(trackId, blobUrl);
                                setMediaSessionArtwork(blobUrl, track, sequenceId);
                            }, 'image/jpeg', 0.85);
                        }
                    }
                } catch(e) { }
            };
            tempImg.onerror = () => {
                if (currentPlaybackSequence === sequenceId && !hasCachedColor) {
                    document.documentElement.style.setProperty('--primary-color', '#8c73ff');
                }
            };
            tempImg.src = thumbUrl;
        }

        function setMediaSessionArtwork(srcUrl, track, sequenceId) {
            if (currentPlaybackSequence !== sequenceId || !hasMediaSession) return;
            const meta = navigator.mediaSession.metadata;
            if (meta) {
                meta.artwork = [{ src: srcUrl, sizes: '512x512', type: 'image/jpeg' }];
            }
        }

        // MediaSession metadata already updated at the top of executePlayback
        
        if (window.lyricsActive) {
            loadLyrics(track);
        }
    }

    // Removed old Blob preloadTrack, SmartBuffer handles it natively

    function triggerPreloads() {
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
        
        const nextCacheKey = nextTrack ? `${baseUrl}/_cache/${nextTrack.id}` : null;
        const prevCacheKey = prevTrack ? `${baseUrl}/_cache/${prevTrack.id}` : null;
        
        const currentTrack = currentPlaylistData[playQueue[queueIndex]] || currentPlaylistData[globalActiveOriginalIndex];
        const currentCacheKey = currentTrack ? `${baseUrl}/_cache/${currentTrack.id}` : null;
        
        for (const url of preloadedFetches.keys()) {
            if (url !== nextCacheKey && url !== prevCacheKey && url !== currentCacheKey) {
                preloadedFetches.delete(url);
            }
        }
        
        if (nextTrack) {
            const audioUrl = getAudioUrl(nextTrack);
            const cacheKey = `${baseUrl}/_cache/${nextTrack.id}`;
            if (!preloadedFetches.has(cacheKey)) {
                const controller = new AbortController();
                const fetchPromise = caches.match(cacheKey).then(cachedResponse => {
                    if (cachedResponse) return cachedResponse.blob();
                    return fetch(audioUrl, { priority: 'low', signal: controller.signal }).then(response => {
                        if (!response.ok) throw new Error();
                        const cloned = response.clone();
                        caches.open('yt-player-media').then(cache => cache.put(cacheKey, cloned)).catch(e => {});
                        return response.blob();
                    });
                });
                fetchPromise.catch(e => {});
                preloadedFetches.set(cacheKey, controller);
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
