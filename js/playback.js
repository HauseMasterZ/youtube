
    function applyPlaylistData(folderName, normalizedData, isRevalidation = false) {
        const prevData = allDatabases[folderName];
        
        // Fast O(1) change detection to prevent main thread blocking and unnecessary DOM mutations
        if (isRevalidation && prevData && prevData.length === normalizedData.length && prevData[0]?.id === normalizedData[0]?.id && prevData[prevData.length - 1]?.id === normalizedData[normalizedData.length - 1]?.id) {
            return; // Zero changes, zero DOM churn
        }

        allDatabases[folderName] = normalizedData;

        if (typeof window.rebuildCrossShuffleDeck === 'function') {
            window.rebuildCrossShuffleDeck();
        }

        const isCurrentlyViewing = (playlistSelect.value === folderName);
        if (!isCurrentlyViewing) return;

        // Active playing track ID preservation across background playlist updates
        if (globalActivePlaylist === folderName && globalActiveOriginalIndex >= 0 && prevData && prevData[globalActiveOriginalIndex]) {
            const currentTrackId = prevData[globalActiveOriginalIndex].id;
            const newIndex = normalizedData.findIndex(t => t.id === currentTrackId);
            if (newIndex !== -1) {
                globalActiveOriginalIndex = newIndex;
            }
        }

        currentPlaylistData = normalizedData;
        const filterText = searchInput ? searchInput.value.trim().toLowerCase() : '';

        if (filterText) {
            filteredIndices = [];
            currentPlaylistData.forEach((track, idx) => {
                const titleMatch = track.title && track.title.toLowerCase().includes(filterText);
                const channelMatch = track.channel && track.channel.toLowerCase().includes(filterText);
                if (titleMatch || channelMatch) {
                    filteredIndices.push({ playlist: folderName, index: idx });
                }
            });
        } else {
            const len = currentPlaylistData.length;
            const indices = new Array(len);
            for (let i = 0; i < len; i++) {
                indices[i] = { playlist: folderName, index: i };
            }
            filteredIndices = indices;
        }

        trackList.style.height = `${filteredIndices.length * ITEM_HEIGHT}px`;
        if (!poolInitialized || trackList.querySelector('.track-skeleton')) {
            trackList.innerHTML = '';
            poolInitialized = false;
        }
        lastStartIndex = -1;

        trackList.style.display = 'block';
        playlistMessage.style.display = 'none';

        renderVirtualTracks();

        if (!isRevalidation) {
            if (globalActivePlaylist === folderName && globalActiveOriginalIndex !== -1) {
                scrollToTrack(globalActiveOriginalIndex, true);
            } else {
                playlistContainer.scrollTop = 0;
            }
        }
    }

    function loadPlaylist(folderName) {
        selectedSearchIndex = -1;
        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = null;
        }

        let hasRendered = false;

        // 1. In-Memory Instant Paint (0ms)
        if (allDatabases[folderName]) {
            applyPlaylistData(folderName, allDatabases[folderName], false);
            hasRendered = true;
            return;
        }

        // 2. If not in memory, immediately show loading state
        trackList.style.display = 'none';
        playlistMessage.style.display = 'block';
        playlistMessage.textContent = 'Loading...';
        playlistMessage.style.color = 'var(--text-secondary)';

        // 3. Parallel Offline Cache API Lookup (0ms for repeat/offline PWA visits, non-blocking)
        if ('caches' in window) {
            caches.match(`${baseUrl}/${folderName}/_Playlist_Database.json`).then(cached => {
                if (cached && !hasRendered) {
                    cached.json().then(rawData => {
                        if (!hasRendered) {
                            const normalized = normalizePlaylistData(rawData, folderName);
                            applyPlaylistData(folderName, normalized, false);
                            hasRendered = true;
                            if (!globalActivePlaylist || queueIndex === -1) {
                                generateQueue(true, folderName);
                            }
                        }
                    }).catch(() => {});
                }
            }).catch(() => {});
        }

        // 4. Direct Network Fetch
        if (navigator.onLine !== false) {
            const dbUrl = `${baseUrl}/${folderName}/_Playlist_Database.json`;
            fetch(dbUrl)
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json();
                })
                .then(rawData => {
                    const freshData = normalizePlaylistData(rawData, folderName);
                    applyPlaylistData(folderName, freshData, hasRendered);
                    hasRendered = true;

                    if (!globalActivePlaylist || queueIndex === -1) {
                        generateQueue(true, folderName);
                    }
                })
                .catch(err => {
                    if (!hasRendered) {
                        console.error("Failed to load playlist:", err);
                        trackList.style.display = 'none';
                        playlistMessage.style.display = 'block';
                        playlistMessage.textContent = 'Failed to load playlist database.';
                        playlistMessage.style.color = '#ff5555';
                    }
                });
        }

        // 4. Deferred Service Worker Registration (dedicates 100% network & CPU to LCP paint)
        if (!window._swRegistered && 'serviceWorker' in navigator) {
            window._swRegistered = true;
            const registerSW = () => {
                navigator.serviceWorker.register('sw.js').catch((error) => {
                    console.error('ServiceWorker registration failed: ', error);
                });
            };
            if ('requestIdleCallback' in window) {
                requestIdleCallback(registerSW, { timeout: 5000 });
            } else {
                setTimeout(registerSW, 1000);
            }
        }
    }

    function generateQueue(resetPlayback = false, targetPlaylist = null) {
        const pl = targetPlaylist || globalActivePlaylist || playlistSelect.value;
        const data = allDatabases[pl] || currentPlaylistData;
        if (!data || data.length === 0) return;

        let indices = Array.from({length: data.length}, (_, i) => i);
        
        if (shuffleMode === 2) {
            const randomBuffer = new Uint32Array(1);
            for (let i = indices.length - 1; i > 0; i--) {
                window.crypto.getRandomValues(randomBuffer);
                const j = randomBuffer[0] % (i + 1);
                [indices[i], indices[j]] = [indices[j], indices[i]];
            }
            if (!resetPlayback && queueIndex !== -1) {
                const currentOriginalIndex = typeof playQueue[queueIndex] === 'object' ? playQueue[queueIndex].index : playQueue[queueIndex];
                queueIndex = indices.indexOf(currentOriginalIndex);
            }
        } else if (!resetPlayback && queueIndex !== -1) {
            const currentOriginalIndex = typeof playQueue[queueIndex] === 'object' ? playQueue[queueIndex].index : playQueue[queueIndex];
            queueIndex = currentOriginalIndex;
        }
        
        playQueue = indices;
        if (resetPlayback) queueIndex = -1;
    }

    // Helper for cross-playlist shuffle: switch playlist context and play a specific track
    // Helper for cross-playlist shuffle and history navigation: switch playlist context and play a specific track
    function playFromPlaylist(playlist, trackIndex, isHistoryNav = false) {
        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = null;
        }
        lastUserScrollTime = 0;
        isScrollingFast = false;
        if (playlist !== playlistSelect.value) {
            playlistSelect.value = playlist;
            if (typeof lastValidPlaylist !== 'undefined') lastValidPlaylist = playlist;
            currentPlaylistData = allDatabases[playlist];
            searchInput.value = '';
            filteredIndices = currentPlaylistData ? currentPlaylistData.map((_, i) => ({ playlist: playlist, index: i })) : [];
            trackList.style.height = `${filteredIndices.length * ITEM_HEIGHT}px`;
            poolInitialized = false;
            playQueue = currentPlaylistData ? Array.from({length: currentPlaylistData.length}, (_, i) => i) : [];
        }
        globalActivePlaylist = playlist;
        globalActiveOriginalIndex = trackIndex;
        queueBasePlaylist = playlist;
        queueIndex = trackIndex;
        executePlayback(false, isHistoryNav, true);
    }

    window.playTrackSelection = playTrackSelection;

    window.queuePlayNext = function(playlist, originalIndex) {
        if (shuffleMode === 1) {
            // Cross-playlist shuffle mode
            const existingIdx = crossShuffleHistory.findIndex(t => t.playlist === playlist && t.index === originalIndex);
            if (existingIdx !== -1) {
                crossShuffleHistory.splice(existingIdx, 1);
                if (existingIdx <= crossShufflePos) crossShufflePos--;
            }
            crossShuffleHistory.splice(crossShufflePos + 1, 0, { playlist, index: originalIndex });
        } else {
            // Single playlist mode
            const insertPos = queueIndex >= 0 ? queueIndex + 1 : 0;
            const curPl = queueBasePlaylist || globalActivePlaylist || playlistSelect.value;
            const itemToQueue = (playlist === curPl) ? originalIndex : { playlist, index: originalIndex };
            playQueue.splice(insertPos, 0, itemToQueue);
        }
    };

    async function playTrackSelection(targetPlaylist, targetOriginalIndex) {
        if (typeof isMobileDevice !== 'undefined' && isMobileDevice && typeof initLiveAudioAnchor === 'function') {
            initLiveAudioAnchor();
        }
        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = null;
        }

        lastUserScrollTime = 0;
        isScrollingFast = false;
        globalActivePlaylist = targetPlaylist;
        globalActiveOriginalIndex = targetOriginalIndex;
        queueBasePlaylist = targetPlaylist;

        if (!allDatabases[targetPlaylist] && typeof loadPlaylist === 'function') {
            await loadPlaylist(targetPlaylist);
        }

        currentPlaylistData = allDatabases[targetPlaylist] || currentPlaylistData;

        // Auto-switch playlist dropdown and active dataset to the target playlist
        if (playlistSelect.value !== targetPlaylist) {
            playlistSelect.value = targetPlaylist;
            if (typeof lastValidPlaylist !== 'undefined') lastValidPlaylist = targetPlaylist;
        }

        // If in cross-shuffle mode (mode 1), manage history deck
        if (shuffleMode === 1) {
            const existingIdx = crossShuffleHistory.findIndex(t => t.playlist === targetPlaylist && t.index === targetOriginalIndex);
            if (existingIdx !== -1) {
                crossShuffleHistory.splice(existingIdx, 1);
                if (existingIdx <= crossShufflePos) crossShufflePos--;
            }
            crossShuffleHistory.splice(crossShufflePos + 1, 0, { playlist: targetPlaylist, index: targetOriginalIndex });
            crossShufflePos++;
        }

        selectedSearchIndex = -1;
        // If we are playing from a search, clear search input and reset list view
        if (searchInput.value.trim() !== "") {
            searchInput.value = "";
        }
        
        if (currentPlaylistData) {
            filteredIndices = currentPlaylistData.map((_, i) => ({ playlist: targetPlaylist, index: i }));
            trackList.style.height = `${filteredIndices.length * ITEM_HEIGHT}px`;
            trackList.style.display = 'block';
            playlistMessage.style.display = 'none';
            lastStartIndex = -1;
            renderVirtualTracks();
        }

        const totalTracks = currentPlaylistData ? currentPlaylistData.length : 0;

        if (shuffleMode === 2 && totalTracks > 0) {
            let rest = Array.from({length: totalTracks}, (_, i) => i).filter(i => i !== targetOriginalIndex);
            const randomBuffer = new Uint32Array(1);
            for (let i = rest.length - 1; i > 0; i--) {
                window.crypto.getRandomValues(randomBuffer);
                const j = randomBuffer[0] % (i + 1);
                [rest[i], rest[j]] = [rest[j], rest[i]];
            }
            playQueue = [targetOriginalIndex, ...rest];
            queueIndex = 0;
        } else if (totalTracks > 0) {
            playQueue = Array.from({length: totalTracks}, (_, i) => i);
            queueIndex = targetOriginalIndex;
        }

        executePlayback(false, false, true);
    }
    window.lastPlaybackDirection = 1;

    function playNext() {
        window.lastPlaybackDirection = 1;
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
            playFromPlaylist(target.playlist, target.index, true);
            return;
        }    
        
        // If navigating forward in history (after user clicked prev)
        if (playbackHistoryIndex >= 0 && playbackHistoryIndex < playbackHistory.length - 1) {
            playbackHistoryIndex++;
            const nextEntry = playbackHistory[playbackHistoryIndex];
            playFromPlaylist(nextEntry.playlist, nextEntry.index, true);
            return;
        }

        if (playQueue.length === 0) return;

        if (queueIndex + 1 < playQueue.length) {
            queueIndex++;
            executePlayback();
        } else {
            queueIndex = 0;
            executePlayback();
        }
    }

    function playPrev() {
        window.lastPlaybackDirection = -1;
        // Cross-playlist shuffle (mode 1)
        if (shuffleMode === 1) {
            if (crossShufflePos > 0) {
                crossShufflePos--;
                const entry = crossShuffleHistory[crossShufflePos];
                playFromPlaylist(entry.playlist, entry.index, true);
            } else {
                audioPlayer.currentTime = 0;
                updateTimeUI(0);
                audioPlayer.play();
            }
            return;
        }

        // Reverse chronological playback history across playlists
        if (playbackHistoryIndex > 0) {
            playbackHistoryIndex--;
            const prevEntry = playbackHistory[playbackHistoryIndex];
            playFromPlaylist(prevEntry.playlist, prevEntry.index, true);
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
    function executePlayback(preventAutoplay = false, isHistoryNav = false, forceScroll = false) {
        // preventAutoplay here acts as a uiOnly flag for restoring the last played track
        const uiOnly = preventAutoplay;
        isSeeking = false;
        if (typeof lastRenderTime !== 'undefined') lastRenderTime = -1;
        
        // Set active playing intent on fresh track launch (fixes first-ever song load bug)
        if (!uiOnly) {
            window.wasPausedByUser = false;
            if (typeof stopLiveAudioAnchor === 'function') stopLiveAudioAnchor();
            if (typeof cancelAutoKillWatchdog === 'function') cancelAutoKillWatchdog();
            setPlayUI(true);
            if (typeof isMobileDevice !== 'undefined' && isMobileDevice && typeof initLiveAudioAnchor === 'function') {
                initLiveAudioAnchor();
            }
        }
        
        // Cancel any pending error auto-skip when user manually selects a track
        if (errorSkipTimer) {
            clearTimeout(errorSkipTimer);
            errorSkipTimer = null;
        }
        if (queueIndex < 0 || queueIndex >= playQueue.length) return;
        
        currentPlaybackSequence++;
        const sequenceId = currentPlaybackSequence;
        
        const rawQueueItem = playQueue[queueIndex];
        let originalIndex, targetPlaylist, track;

        if (typeof rawQueueItem === 'object' && rawQueueItem !== null) {
            originalIndex = rawQueueItem.index;
            targetPlaylist = rawQueueItem.playlist;
            track = (allDatabases[targetPlaylist] && allDatabases[targetPlaylist][originalIndex]);
        } else {
            originalIndex = rawQueueItem;
            targetPlaylist = queueBasePlaylist || globalActivePlaylist || playlistSelect.value;
            track = (allDatabases[targetPlaylist] && allDatabases[targetPlaylist][originalIndex]) 
                 || (currentPlaylistData ? currentPlaylistData[originalIndex] : null);
        }

        if (!track) return;

        globalActiveOriginalIndex = originalIndex;
        globalActivePlaylist = targetPlaylist;

        // Record into playback history stack for reverse chronological previous-track navigation
        if (!uiOnly && !isHistoryNav) {
            const currentEntry = playbackHistory[playbackHistoryIndex];
            if (!currentEntry || currentEntry.playlist !== targetPlaylist || currentEntry.index !== originalIndex) {
                if (playbackHistoryIndex >= 0 && playbackHistoryIndex < playbackHistory.length - 1) {
                    playbackHistory.splice(playbackHistoryIndex + 1);
                }
                playbackHistory.push({ playlist: targetPlaylist, index: originalIndex });
                if (playbackHistory.length > 300) {
                    playbackHistory.shift();
                }
                playbackHistoryIndex = playbackHistory.length - 1;
            }
        }

        // Auto-switch view to active playing playlist if user was viewing another playlist
        if (targetPlaylist && playlistSelect.value !== targetPlaylist) {
            playlistSelect.value = targetPlaylist;
            if (typeof lastValidPlaylist !== 'undefined') lastValidPlaylist = targetPlaylist;
            if (allDatabases[targetPlaylist]) {
                currentPlaylistData = allDatabases[targetPlaylist];
                if (searchInput.value.trim() !== "") {
                    searchInput.value = "";
                }
                filteredIndices = currentPlaylistData.map((_, i) => ({ playlist: targetPlaylist, index: i }));
                trackList.style.height = `${filteredIndices.length * ITEM_HEIGHT}px`;
                trackList.style.display = 'block';
                playlistMessage.style.display = 'none';
                lastStartIndex = -1;
                renderVirtualTracks();
            }
        }

        if (track.is_dead) {
            currentTitle.textContent = "err " + track.title + " skipping...";
            currentTitle.style.color = "#ff5555";
            currentChannel.textContent = track.channel;
            scrollToTrack(originalIndex, forceScroll);
            
            // Mark the visual list item immediately
            Array.from(trackList.children).forEach(li => li.classList.remove('active'));
            const activeLi = Array.from(trackList.children).find(li => li.dataset.originalIndex == originalIndex);
            if (activeLi) {
                activeLi.classList.add('active');
            }

            if (hasMediaSession) {
                const fallbackIcon = typeof getPurpleNoteArtwork === 'function' 
                    ? getPurpleNoteArtwork() 
                    : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%238c73ff'%3E%3Cpath d='M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z'/%3E%3C/svg%3E";
                const sqCached = (typeof artworkSquareCache !== 'undefined' && track && artworkSquareCache.has(track.id)) ? artworkSquareCache.get(track.id) : fallbackIcon;

                if (!navigator.mediaSession.metadata) {
                    navigator.mediaSession.metadata = new MediaMetadata({
                        title: "err " + track.title + " skipping...",
                        artist: track.channel,
                        artwork: [{ src: sqCached, sizes: '512x512', type: 'image/jpeg' }]
                    });
                } else {
                    navigator.mediaSession.metadata.title = "err " + track.title + " skipping...";
                    navigator.mediaSession.metadata.artist = track.channel;
                    navigator.mediaSession.metadata.artwork = [{ src: sqCached, sizes: '512x512', type: 'image/jpeg' }];
                }
                navigator.mediaSession.playbackState = "playing";
            }

            if (!uiOnly && autoplayEnabled) {
                // Instantly auto-skip to the next track if we are actively playing and autoplay is enabled
                errorSkipTimer = setTimeout(() => {
                    if (window.lastPlaybackDirection === -1) {
                        playPrev();
                    } else {
                        playNext();
                    }
                }, 1000);
            }
            return;
        }

        currentTitle.textContent = track.title;
        document.title = track.title.length > 20 ? track.title.substring(0, 20) + "..." : track.title;
        currentTitle.style.color = "#ffffff"; // Reset color in case it was red from an error
        currentChannel.textContent = track.channel;

        scrollToTrack(originalIndex, forceScroll);

        updateTimeUI(0);
        let parsedDuration = 0;
        if (track.duration) {
            parsedDuration = parseISODuration(track.duration);
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
        const thumbUrl = getThumbUrl(track);
        const cacheKey = `${baseUrl}/_cache/${track.id}`;
        
        const activeColor = (track.color && track.color !== '#000000') ? track.color : (dominantColorCache.get(track.id) || '#8c73ff');
        document.documentElement.style.setProperty('--primary-color', activeColor);

        if (preloadedFetches.has(cacheKey)) {
            const controller = preloadedFetches.get(cacheKey);
            if (controller && controller.abort) controller.abort();
            preloadedFetches.delete(cacheKey);
        }
        
        if (hasMediaSession) {
            const fallbackIcon = typeof getPurpleNoteArtwork === 'function' 
                ? getPurpleNoteArtwork() 
                : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%238c73ff'%3E%3Cpath d='M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z'/%3E%3C/svg%3E";

            const currentSq = (typeof artworkSquareCache !== 'undefined' && artworkSquareCache.has(track.id)) 
                ? artworkSquareCache.get(track.id) 
                : fallbackIcon;

            navigator.mediaSession.metadata = new MediaMetadata({
                title: track.title,
                artist: track.channel,
                artwork: [{ src: currentSq, sizes: '512x512', type: 'image/jpeg' }]
            });

            if (!thumbsDisabled && thumbUrl) {
                if (!artworkSquareCache.has(track.id)) {
                    getSquareArtwork(thumbUrl, track.id, (sqUrl) => {
                        if (sqUrl && hasMediaSession && globalActiveOriginalIndex === originalIndex) {
                            try {
                                navigator.mediaSession.metadata = new MediaMetadata({
                                    title: track.title,
                                    artist: track.channel,
                                    artwork: [{ src: sqUrl, sizes: '256x256', type: 'image/jpeg' }]
                                });
                            } catch (e) {}
                        }
                    });
                }
            } else if (thumbsDisabled && thumbUrl) {
                getCachedSquareArtwork(track.id, thumbUrl, (sqUrl) => {
                    if (sqUrl && hasMediaSession && globalActiveOriginalIndex === originalIndex) {
                        try {
                            navigator.mediaSession.metadata = new MediaMetadata({
                                title: track.title,
                                artist: track.channel,
                                artwork: [{ src: sqUrl, sizes: '256x256', type: 'image/jpeg' }]
                            });
                        } catch (e) {}
                    }
                });
            }

            // Mode 2 doctrine: paused declaration spoofs 'playing' (pin);
            // Mode 1 declares honestly.
            navigator.mediaSession.playbackState = (preventAutoplay || uiOnly)
                ? ((typeof window.declaredPausedState === 'function') ? window.declaredPausedState() : 'paused')
                : "playing";

            // Initialize lock-screen seekbar with known metadata duration at 0:00 (frozen during buffering)
            if ('setPositionState' in navigator.mediaSession && parsedDuration > 0) {
                try {
                    navigator.mediaSession.setPositionState({
                        duration: parsedDuration,
                        playbackRate: 1.0,
                        position: 0
                    });
                } catch(e) {}
            }
        }

        if (!thumbsDisabled && thumbUrl) {
            if (albumArtContainer) albumArtContainer.classList.remove('no-art');
            if (thumbToggleHint) thumbToggleHint.style.display = 'none';
            albumArt.style.display = 'block';
            albumArt.onerror = function() {
                this.removeAttribute('src');
                this.style.display = 'none';
                if (albumArtContainer) albumArtContainer.classList.add('no-art');
                if (typeof nowPlaying !== 'undefined' && nowPlaying) nowPlaying.style.removeProperty('--art-width');
            };
            albumArt.src = thumbUrl;
        } else {
            albumArt.removeAttribute('src');
            albumArt.style.display = 'none';
            if (albumArtContainer) albumArtContainer.classList.add('no-art');
            if (typeof nowPlaying !== 'undefined' && nowPlaying) nowPlaying.style.removeProperty('--art-width');
            if (thumbsDisabled && thumbToggleHint) {
                thumbToggleHint.style.display = 'inline-flex';
                thumbToggleHint.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 4.5C7.3 4.5 3.2 7.4 1.5 11.5c1.7 4.1 5.8 7 10.5 7s8.8-2.9 10.5-7C20.8 7.4 16.7 4.5 12 4.5zm0 11.5c-2.5 0-4.5-2-4.5-4.5S9.5 7 12 7s4.5 2 4.5 4.5-2 4.5-4.5 4.5zm0-7c-1.4 0-2.5 1.1-2.5 2.5S10.6 14 12 14s2.5-1.1 2.5-2.5S13.4 9 12 9z"/></svg>Show thumbnails';
            }
        }

        audioPlayer.switchTrack(audioUrl, preventAutoplay || uiOnly, parsedDuration);

        if (window.lyricsActive) {
            loadLyrics(track);
        }
    }

    function triggerPreloads() {
        let nextTrack = null;
        
        if (shuffleMode === 1) {
            if (crossShufflePos < crossShuffleHistory.length - 1) {
                const entry = crossShuffleHistory[crossShufflePos + 1];
                if (allDatabases[entry.playlist]) nextTrack = allDatabases[entry.playlist][entry.index];
            }
        } else {
            if (playQueue.length > 0) {
                let nIdx = queueIndex + 1;
                if (nIdx >= playQueue.length && repeatMode === 1) nIdx = 0;
                if (nIdx < playQueue.length) {
                    const nItem = playQueue[nIdx];
                    if (typeof nItem === 'object' && nItem !== null) {
                        nextTrack = allDatabases[nItem.playlist] && allDatabases[nItem.playlist][nItem.index];
                    } else {
                        const basePl = queueBasePlaylist || globalActivePlaylist || playlistSelect.value;
                        nextTrack = (allDatabases[basePl] && allDatabases[basePl][nItem]) || currentPlaylistData[nItem];
                    }
                }
            }
        }
        
        const nextCacheKey = nextTrack ? getAudioUrl(nextTrack) : null;
        let currentTrack = null;
        if (globalActivePlaylist && allDatabases[globalActivePlaylist] && globalActiveOriginalIndex >= 0) {
            currentTrack = allDatabases[globalActivePlaylist][globalActiveOriginalIndex];
        } else if (currentPlaylistData && globalActiveOriginalIndex >= 0) {
            currentTrack = currentPlaylistData[globalActiveOriginalIndex];
        }
        const currentCacheKey = currentTrack ? getAudioUrl(currentTrack) : null;

        // Cleanup stale preloads
        for (const [url, controller] of preloadedFetches.entries()) {
            if (url !== nextCacheKey && url !== currentCacheKey) {
                if (controller && controller.abort) controller.abort();
                preloadedFetches.delete(url);
            }
        }

        if (nextTrack) {
            const audioUrl = getAudioUrl(nextTrack);
            if (!preloadedFetches.has(audioUrl)) {
                const controller = new AbortController();
                const fetchPromise = caches.open('yt-player-media').then(cache => {
                    return cache.match(audioUrl).then(match => {
                        if (match) return; // Already in media cache
                        return fetch(audioUrl, { signal: controller.signal });
                    }).then(response => {
                        if (!response) return;
                        if (!response.ok) throw new Error();
                        const cloned = response.clone();
                        caches.open('yt-player-media').then(cache => cache.put(audioUrl, cloned)).catch(e => {});
                        return response.blob();
                    });
                });
                fetchPromise.catch(e => {});
                preloadedFetches.set(audioUrl, controller);
            }
        }
    }

    let isDownloadingPlaylist = false;
    let playlistDownloadController = null;

    function showDownloadToast(text, isSuccess = false) {
        const toast = document.getElementById("download-toast");
        const toastText = document.getElementById("download-toast-text");
        if (!toast || !toastText) return;

        toastText.textContent = text;
        if (isSuccess) toast.classList.add("success");
        else toast.classList.remove("success");

        toast.style.display = "flex";
    }

    function hideDownloadToast() {
        const toast = document.getElementById("download-toast");
        if (toast) toast.style.display = "none";
    }

    async function downloadActivePlaylist() {
        const btn = document.getElementById("btn-download-playlist");
        const iconIdle = document.getElementById("icon-download-idle");
        const iconActive = document.getElementById("icon-download-active");
        const iconDone = document.getElementById("icon-download-done");

        // Cancel toggle
        if (isDownloadingPlaylist) {
            isDownloadingPlaylist = false;
            if (playlistDownloadController) {
                playlistDownloadController.abort();
                playlistDownloadController = null;
            }
            if (iconIdle) iconIdle.style.display = "block";
            if (iconActive) iconActive.style.display = "none";
            if (iconDone) iconDone.style.display = "none";
            if (btn) btn.title = "Download playlist for offline playback";
            showDownloadToast("Download cancelled");
            setTimeout(hideDownloadToast, 2000);
            return;
        }

        const currentPl = playlistSelect.value;
        const tracks = (allDatabases && allDatabases[currentPl]) || currentPlaylistData || [];
        if (tracks.length === 0) return;

        isDownloadingPlaylist = true;
        playlistDownloadController = new AbortController();
        const signal = playlistDownloadController.signal;

        if (iconIdle) iconIdle.style.display = "none";
        if (iconActive) iconActive.style.display = "block";
        if (iconDone) iconDone.style.display = "none";

        showDownloadToast(`${currentPl} - 0 / ${tracks.length}`);

        try {
            const mediaCache = await caches.open('yt-player-media');
            const thumbsCache = await caches.open('yt-player-thumbs');

            const fetchWithRetry = async (url, options = {}, maxRetries = 3) => {
                let delay = 300;
                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    try {
                        const res = await fetch(url, options);
                        if (res && (res.ok || res.type === 'opaque')) return res;
                        if (attempt === maxRetries) return res;
                    } catch (err) {
                        if (options.signal && options.signal.aborted) throw err;
                        if (attempt === maxRetries) return null;
                    }
                    await new Promise(r => setTimeout(r, delay));
                    delay *= 2;
                }
                return null;
            };

            let savedCount = 0;
            let failedCount = 0;
            const total = tracks.length;
            const CONCURRENCY = 2;
            let trackIndex = 0;

            const updateDownloadProgressUI = () => {
                const titleText = failedCount > 0 
                    ? `${savedCount} / ${total} (${failedCount} failed) - Click to cancel`
                    : `${savedCount} / ${total} - Click to cancel`;
                if (btn) btn.title = titleText;
                const toastText = failedCount > 0 
                    ? `${currentPl} - ${savedCount} / ${total} (${failedCount} failed)`
                    : `${currentPl} - ${savedCount} / ${total}`;
                showDownloadToast(toastText);
            };

            const worker = async () => {
                while (trackIndex < tracks.length && !signal.aborted && isDownloadingPlaylist) {
                    const track = tracks[trackIndex++];
                    if (!track) continue;
                    
                    const audioUrl = getAudioUrl(track);
                    const thumbUrl = getThumbUrl(track);
                    let audioSuccess = false;

                    try {
                        // 1. Audio Cache (Store full response with status 200, bypassing SW double buffering)
                        const existingAudio = await mediaCache.match(audioUrl);
                        const isPartial = existingAudio && (existingAudio.headers.get('X-Partial-Cached') === 'true');
                        if (!existingAudio || isPartial) {
                            const fetchUrl = audioUrl.includes('?') ? `${audioUrl}&bypass=true` : `${audioUrl}?bypass=true`;
                            const res = await fetchWithRetry(fetchUrl, { signal }, 3);
                            if (res && res.ok) {
                                const buf = await res.arrayBuffer();
                                const fullRes = new Response(buf, {
                                    status: 200,
                                    headers: {
                                        'Content-Type': 'audio/webm',
                                        'Content-Length': buf.byteLength.toString(),
                                        'X-Partial-Cached': 'false'
                                    }
                                });
                                await mediaCache.put(audioUrl, fullRes);
                                audioSuccess = true;
                            }
                        } else {
                            audioSuccess = true;
                        }

                        // 2. Thumbnail Cache (unconditionally download for complete offline availability)
                        if (thumbUrl && !(await thumbsCache.match(thumbUrl))) {
                            const res = await fetchWithRetry(thumbUrl, { signal }, 2).catch(() => {});
                            if (res && (res.ok || res.type === 'opaque')) {
                                await thumbsCache.put(thumbUrl, res);
                            }
                        }

                        // 3. Lyrics Cache
                        if (track.file_path && track.id) {
                            const parts = track.file_path.split('/');
                            const lyricsUrl = `${baseUrl}/${encodeURIComponent(parts[0])}/lyrics/${encodeURIComponent(track.id)}.lrc`;
                            if (!(await mediaCache.match(lyricsUrl))) {
                                const res = await fetchWithRetry(lyricsUrl, { signal }, 2).catch(() => {});
                                if (res && res.ok) {
                                    await mediaCache.put(lyricsUrl, res);
                                }
                            }
                        }
                    } catch (err) {
                        // Ignore aborted fetches
                    }

                    if (signal.aborted || !isDownloadingPlaylist) break;

                    if (audioSuccess) {
                        savedCount++;
                    } else {
                        failedCount++;
                    }
                    updateDownloadProgressUI();
                }
            };

            await Promise.all(Array.from({ length: CONCURRENCY }, worker));

            if (!signal.aborted && isDownloadingPlaylist) {
                showDownloadToast(`Verifying ${currentPl} offline storage...`);
                let verifiedCount = 0;
                const missingTracks = [];
                for (const t of tracks) {
                    const aUrl = getAudioUrl(t);
                    const hasA = await mediaCache.match(aUrl);
                    if (hasA && hasA.headers.get('X-Partial-Cached') !== 'true') {
                        verifiedCount++;
                    } else {
                        missingTracks.push(t);
                    }
                }

                // Automatic single retry pass for missing tracks (retries audio, thumbnail, and lyrics)
                if (missingTracks.length > 0 && !signal.aborted && isDownloadingPlaylist) {
                    showDownloadToast(`Retrying ${missingTracks.length} missing tracks...`);
                    for (const track of missingTracks) {
                        if (signal.aborted || !isDownloadingPlaylist) break;
                        const audioUrl = getAudioUrl(track);
                        const thumbUrl = getThumbUrl(track);
                        const fetchUrl = audioUrl.includes('?') ? `${audioUrl}&bypass=true` : `${audioUrl}?bypass=true`;
                        const res = await fetchWithRetry(fetchUrl, { signal }, 2).catch(() => {});
                        if (res && res.ok) {
                            const buf = await res.arrayBuffer();
                            const fullRes = new Response(buf, {
                                status: 200,
                                headers: {
                                    'Content-Type': 'audio/webm',
                                    'Content-Length': buf.byteLength.toString(),
                                    'X-Partial-Cached': 'false'
                                }
                            });
                            await mediaCache.put(audioUrl, fullRes);
                            verifiedCount++;
                        }

                        if (thumbUrl && !(await thumbsCache.match(thumbUrl))) {
                            const tRes = await fetchWithRetry(thumbUrl, { signal }, 2).catch(() => {});
                            if (tRes && (tRes.ok || tRes.type === 'opaque')) {
                                await thumbsCache.put(thumbUrl, tRes);
                            }
                        }

                        if (track.file_path && track.id) {
                            const parts = track.file_path.split('/');
                            const lyricsUrl = `${baseUrl}/${encodeURIComponent(parts[0])}/lyrics/${encodeURIComponent(track.id)}.lrc`;
                            if (!(await mediaCache.match(lyricsUrl))) {
                                const lRes = await fetchWithRetry(lyricsUrl, { signal }, 2).catch(() => {});
                                if (lRes && lRes.ok) {
                                    await mediaCache.put(lyricsUrl, lRes);
                                }
                            }
                        }
                    }
                }

                if (iconActive) iconActive.style.display = "none";
                if (iconDone) iconDone.style.display = "block";
                if (btn) btn.title = "Playlist fully downloaded for offline playback!";

                showDownloadToast(`[OK] ${currentPl} verified (${verifiedCount}/${total} saved offline)`, true);

                setTimeout(() => {
                    if (iconDone) iconDone.style.display = "none";
                    if (iconIdle) iconIdle.style.display = "block";
                    if (btn) btn.title = "Download playlist for offline playback";
                    hideDownloadToast();
                }, 3500);
            }
        } catch (e) {
            hideDownloadToast();
        } finally {
            isDownloadingPlaylist = false;
        }
    }
