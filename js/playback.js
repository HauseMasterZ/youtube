
    async function loadPlaylist(folderName) {
        trackList.style.display = 'none';
        playlistMessage.style.display = 'block';
        playlistMessage.textContent = 'Loading...';
        playlistMessage.style.color = 'var(--text-secondary)';
        
        try {
            if (!allDatabases[folderName]) {
                const res = await fetch(`${baseUrl}/${folderName}/_Playlist_Database.json`);
                if (!res.ok) throw new Error();
                const rawData = await res.json();
                allDatabases[folderName] = normalizePlaylistData(rawData, folderName);

                if (typeof window.rebuildCrossShuffleDeck === 'function') {
                    window.rebuildCrossShuffleDeck();
                }
            }
            
            currentPlaylistData = allDatabases[folderName];
            
            searchInput.value = '';
            filteredIndices = currentPlaylistData.map((_, i) => ({ playlist: folderName, index: i }));
            
            trackList.style.height = `${filteredIndices.length * ITEM_HEIGHT}px`;
            poolInitialized = false;
            
            // Only generate a new queue if there is no active playback in progress
            if (!globalActivePlaylist || queueIndex === -1) {
                generateQueue(true, folderName);
            }
            
            trackList.style.display = 'block';
            playlistMessage.style.display = 'none';
            // Force first render
            lastStartIndex = -1;
            
            requestAnimationFrame(() => {
                if (globalActivePlaylist === folderName && globalActiveOriginalIndex !== -1) {
                    // Must render virtual tracks first so the elements exist in DOM before scrolling
                    renderVirtualTracks();
                    scrollToTrack(globalActiveOriginalIndex);
                } else {
                    playlistContainer.scrollTop = 0;
                    renderVirtualTracks();
                }

                // Once initial playlist is loaded and rendered, register SW in background
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
                        setTimeout(registerSW, 500);
                    }
                }
            });
        } catch (error) {
            console.error(error);
            trackList.style.display = 'none';
            playlistMessage.style.display = 'block';
            playlistMessage.textContent = 'Failed to load playlist database.';
            playlistMessage.style.color = '#ff5555';
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
        executePlayback(false, isHistoryNav);
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
        if (!allDatabases[targetPlaylist] && typeof loadPlaylist === 'function') {
            await loadPlaylist(targetPlaylist);
        }

        globalActivePlaylist = targetPlaylist;
        globalActiveOriginalIndex = targetOriginalIndex;
        queueBasePlaylist = targetPlaylist;
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

        executePlayback();
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
        } else if (repeatMode === 1) { 
            queueIndex = 0;
            executePlayback();
        } else {
            setPlayUI(false);
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
    function executePlayback(preventAutoplay = false, isHistoryNav = false) {
        // preventAutoplay here acts as a uiOnly flag for restoring the last played track
        const uiOnly = preventAutoplay;
        isSeeking = false;
        
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
            scrollToTrack(originalIndex);
            
            // Mark the visual list item immediately
            Array.from(trackList.children).forEach(li => li.classList.remove('active'));
            const activeLi = Array.from(trackList.children).find(li => li.dataset.originalIndex == originalIndex);
            if (activeLi) {
                activeLi.classList.add('active');
            }

            if (hasMediaSession) {
                if (!navigator.mediaSession.metadata) {
                    navigator.mediaSession.metadata = new MediaMetadata({
                        title: "err " + track.title + " skipping...",
                        artist: track.channel,
                        artwork: (!thumbsDisabled && getThumbUrl(track)) ? [{ src: getThumbUrl(track), sizes: '512x512', type: 'image/jpeg' }] : [{ src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', sizes: '512x512', type: 'image/png' }]
                    });
                } else {
                    navigator.mediaSession.metadata.title = "err " + track.title + " skipping...";
                    navigator.mediaSession.metadata.artist = track.channel;
                    navigator.mediaSession.metadata.artwork = (!thumbsDisabled && getThumbUrl(track)) ? [{ src: getThumbUrl(track), sizes: '512x512', type: 'image/jpeg' }] : [{ src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', sizes: '512x512', type: 'image/png' }];
                }
                navigator.mediaSession.playbackState = "playing";
            }

            if (!uiOnly) {
                // Instantly auto-skip to the next track if we are actively playing
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

        scrollToTrack(originalIndex);

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
        if (typeof updateSeekBarProgress === 'function') updateSeekBarProgress();
        if (typeof bufferBar !== 'undefined' && bufferBar) bufferBar.style.width = '0%';

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
            
            const squareCached = (thumbUrl && artworkSquareCache.has(track.id)) ? artworkSquareCache.get(track.id) : null;
            const artworkSrc = (!thumbsDisabled && (squareCached || thumbUrl)) ? (squareCached || thumbUrl) : fallbackIcon;
            const artworkList = [{ src: artworkSrc, sizes: '512x512', type: 'image/jpeg' }];

            navigator.mediaSession.metadata = new MediaMetadata({
                title: track.title,
                artist: track.channel,
                artwork: artworkList
            });

            if (!thumbsDisabled && thumbUrl && !squareCached) {
                getSquareArtwork(thumbUrl, track.id, (sqUrl) => {
                    if (hasMediaSession && navigator.mediaSession.metadata && globalActiveOriginalIndex === originalIndex) {
                        navigator.mediaSession.metadata.artwork = [{ src: sqUrl, sizes: '512x512', type: 'image/jpeg' }];
                    }
                });
            }

            // Clear position state during buffering (W3C standard method)
            if ('setPositionState' in navigator.mediaSession) {
                try {
                    navigator.mediaSession.setPositionState(null);
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
            };
            albumArt.src = thumbUrl;
        } else {
            albumArt.removeAttribute('src');
            albumArt.style.display = 'none';
            if (albumArtContainer) albumArtContainer.classList.add('no-art');
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
        const currentTrack = track;
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
