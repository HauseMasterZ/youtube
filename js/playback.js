
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
                    data = data.filter(item => {
                        const title = String(item[1]);
                        return !title.includes('Deleted/Private Video') && !title.includes('Deleted video') && !title.includes('Private video');
                    }).map(item => ({
                        id: item[0],
                        title: item[1],
                        channel: item[2],
                        duration: item[3],
                        file_path: `${folderName}/${item[4]}.webm`,
                        thumbnail_path: `${folderName}/thumbnails/${item[0]}.webp`
                    }));
                }
                
                allDatabases[folderName] = data;

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
        globalActivePlaylist = playlist;
        globalActiveOriginalIndex = trackIndex;
        queueIndex = trackIndex;
        executePlayback();
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
            const curPl = globalActivePlaylist || playlistSelect.value;
            const itemToQueue = (playlist === curPl) ? originalIndex : { playlist, index: originalIndex };
            playQueue.splice(insertPos, 0, itemToQueue);
        }
    };

    function playTrackSelection(targetPlaylist, targetOriginalIndex) {
        // Add to cross-shuffle history if in mode 1
        if (shuffleMode === 1) {
            // Remove the track from anywhere else in the history to prevent duplicates
            const existingIdx = crossShuffleHistory.findIndex(t => t.playlist === targetPlaylist && t.index === targetOriginalIndex);
            if (existingIdx !== -1) {
                crossShuffleHistory.splice(existingIdx, 1);
                if (existingIdx <= crossShufflePos) crossShufflePos--;
            }
            crossShuffleHistory.splice(crossShufflePos + 1, 0, { playlist: targetPlaylist, index: targetOriginalIndex });
            crossShufflePos++;
        }

        globalActivePlaylist = targetPlaylist;
        globalActiveOriginalIndex = targetOriginalIndex;
        
        // If we are playing from a search, clear the search instantly
        if (searchInput.value.trim() !== "") {
            searchInput.value = "";
            if (currentPlaylistData) {
                filteredIndices = currentPlaylistData.map((_, i) => ({ playlist: playlistSelect.value, index: i }));
                trackList.style.height = `${filteredIndices.length * ITEM_HEIGHT}px`;
            }
        }

        const data = allDatabases[targetPlaylist] || currentPlaylistData;
        const totalTracks = data ? data.length : 0;

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
        window.lastPlaybackDirection = -1;
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
            targetPlaylist = globalActivePlaylist || playlistSelect.value;
            track = (allDatabases[targetPlaylist] && allDatabases[targetPlaylist][originalIndex]) 
                 || (currentPlaylistData ? currentPlaylistData[originalIndex] : null);
        }

        if (!track) return;

        globalActiveOriginalIndex = originalIndex;
        globalActivePlaylist = targetPlaylist;

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
        const cacheKey = `${baseUrl}/_cache/${track.id}`;
        

        if (preloadedFetches.has(cacheKey)) {
            const controller = preloadedFetches.get(cacheKey);
            if (controller && controller.abort) controller.abort();
            preloadedFetches.delete(cacheKey);
        }
        
        if (hasMediaSession) {
            const rawArt = getThumbUrl(track);
            const cached = (typeof thumbCache !== 'undefined') ? thumbCache.get(rawArt) : null;
            const isFailed = cached && cached.status === 'failed';
            const squareArt = artworkSquareCache.get(track.id);
            const artworkSrc = squareArt || (!isFailed ? rawArt : null);
            const fallbackIcon = typeof getPurpleNoteArtwork === 'function' 
                ? getPurpleNoteArtwork() 
                : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%238c73ff'%3E%3Cpath d='M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z'/%3E%3C/svg%3E";
            const artworkList = (!thumbsDisabled && artworkSrc) 
                ? [{ src: artworkSrc, sizes: '512x512', type: 'image/jpeg' }] 
                : [{ src: fallbackIcon, sizes: '512x512', type: 'image/png' }];

            navigator.mediaSession.metadata = new MediaMetadata({
                title: track.title,
                artist: track.channel,
                artwork: artworkList
            });
            navigator.mediaSession.playbackState = preventAutoplay ? "paused" : "playing";
            // Clear position state during buffering (W3C standard method)
            updateMediaSessionPosition();
        }

        if (!thumbsDisabled && getThumbUrl(track)) {
            const thumbUrl = getThumbUrl(track);
            albumArt.style.display = 'block';
            albumArt.onerror = function() {
                this.removeAttribute('src');
                this.style.display = 'none';
                document.documentElement.style.setProperty('--primary-color', '#8c73ff');
            };
            albumArt.src = thumbUrl;
            fetchVisuals(track.id, thumbUrl, sequenceId, track);
        } else {
            albumArt.removeAttribute('src');
            albumArt.style.display = 'none';
            document.documentElement.style.setProperty('--primary-color', '#8c73ff');
        }

        audioPlayer.switchTrack(audioUrl, preventAutoplay || uiOnly);

        function fetchVisuals(trackId, thumbUrl, sequenceId, track) {
            const hasCachedColor = dominantColorCache.has(trackId);
            const hasCachedSquare = artworkSquareCache.has(trackId);
            
            if (hasCachedColor) {
                document.documentElement.style.setProperty('--primary-color', dominantColorCache.get(trackId));
            }

            if (hasCachedColor && hasCachedSquare) {
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
                    if (!hasCachedSquare && typeof getSquareCroppedArtwork === 'function') {
                        const squareData = getSquareCroppedArtwork(tempImg, trackId);
                        if (squareData && hasMediaSession && navigator.mediaSession.metadata && !thumbsDisabled) {
                            navigator.mediaSession.metadata.artwork = [{ src: squareData, sizes: '512x512', type: 'image/jpeg' }];
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

        // MediaSession metadata already updated at the top of executePlayback
        
        if (window.lyricsActive) {
            loadLyrics(track);
        }
    }

    // Removed old Blob preloadTrack, SmartBuffer handles it natively

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
                if (nIdx < playQueue.length) nextTrack = currentPlaylistData[playQueue[nIdx]];
            }
        }
        
        const nextCacheKey = nextTrack ? getAudioUrl(nextTrack) : null;
        const currentTrack = currentPlaylistData[playQueue[queueIndex]] || currentPlaylistData[globalActiveOriginalIndex];
        const currentCacheKey = currentTrack ? getAudioUrl(currentTrack) : null;
        
        for (const url of preloadedFetches.keys()) {
            if (url !== nextCacheKey && url !== currentCacheKey) {
                const controller = preloadedFetches.get(url);
                if (controller && controller.abort) controller.abort();
                preloadedFetches.delete(url);
            }
        }
        
        if (nextTrack) {
            const audioUrl = getAudioUrl(nextTrack);
            if (!preloadedFetches.has(audioUrl)) {
                const controller = new AbortController();
                const fetchPromise = caches.match(audioUrl).then(cachedResponse => {
                    if (cachedResponse) return cachedResponse.blob();
                    return fetch(audioUrl, { priority: 'low', signal: controller.signal }).then(response => {
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

