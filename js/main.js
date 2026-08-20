document.addEventListener("DOMContentLoaded", () => {
    searchInput.addEventListener("input", (e) => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            selectedSearchIndex = -1;
            const query = e.target.value.toLowerCase().trim();
            const currentPl = playlistSelect.value;
            
            if (!query) {
                filteredIndices = currentPlaylistData.map((_, i) => ({ playlist: currentPl, index: i }));
            } else {
                filteredIndices = [];
                const addedIds = new Set();
                
                // 1. Current playlist matches
                if (currentPlaylistData) {
                    for (let i = 0; i < currentPlaylistData.length; i++) {
                        const track = currentPlaylistData[i];
                        if (getSearchString(track).includes(query)) {
                            filteredIndices.push({ playlist: currentPl, index: i });
                            addedIds.add(track.id || track.file_path);
                        }
                    }
                }
                
                // 2. Global matches (other playlists)
                for (const pl of ALL_PLAYLISTS) {
                    if (pl !== currentPl && allDatabases[pl]) {
                        const data = allDatabases[pl];
                        for (let i = 0; i < data.length; i++) {
                            const track = data[i];
                            if (getSearchString(track).includes(query)) {
                                if (!addedIds.has(track.id || track.file_path)) {
                                    filteredIndices.push({ playlist: pl, index: i });
                                    addedIds.add(track.id || track.file_path);
                                }
                            }
                        }
                    }
                }
            }
            
            if (filteredIndices.length > 0) {
                trackList.style.height = `${filteredIndices.length * ITEM_HEIGHT}px`;
                trackList.style.display = 'block';
                playlistMessage.style.display = 'none';
            } else {
                trackList.style.display = 'none';
                playlistMessage.style.display = 'block';
                playlistMessage.textContent = 'No results found.';
                playlistMessage.style.color = 'var(--text-secondary)';
            }
            
            playlistContainer.scrollTop = 0;
            
            lastStartIndex = -1;
            renderVirtualTracks();
        }, 150);
    });

    searchInput.addEventListener("keydown", (e) => {
        if (filteredIndices.length === 0) return;
        
        if (e.key === "ArrowDown") {
            e.preventDefault();
            selectedSearchIndex = Math.min(filteredIndices.length - 1, selectedSearchIndex + 1);
            playlistContainer.scrollTop = Math.max(0, (selectedSearchIndex * ITEM_HEIGHT) - (playlistContainer.clientHeight / 2) + (ITEM_HEIGHT / 2));
            lastStartIndex = -1; // force render
            renderVirtualTracks();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            selectedSearchIndex = Math.max(0, selectedSearchIndex - 1);
            playlistContainer.scrollTop = Math.max(0, (selectedSearchIndex * ITEM_HEIGHT) - (playlistContainer.clientHeight / 2) + (ITEM_HEIGHT / 2));
            lastStartIndex = -1; // force render
            renderVirtualTracks();
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (selectedSearchIndex >= 0 && selectedSearchIndex < filteredIndices.length) {
                const item = filteredIndices[selectedSearchIndex];
                playTrackSelection(item.playlist, item.index);
                searchInput.blur();
            }
        }
    });

    playlistContainer.addEventListener("scroll", () => {
        isScrollingFast = true;
        clearTimeout(scrollSettleTimer);
        scrollSettleTimer = setTimeout(() => {
            isScrollingFast = false;
            lastStartIndex = -1;
            renderVirtualTracks();
        }, 120);

        if (!isRendering) {
            window.requestAnimationFrame(renderVirtualTracks);
        }
    });

    let holdTimer = null;
    let holdStartX = 0;
    let holdStartY = 0;
    let suppressNextClick = false;

    trackList.addEventListener("pointerdown", (e) => {
        const li = e.target.closest("li");
        if (!li || !li.dataset.index || !li.dataset.playlist) return;
        if (e.target.closest(".yt-link-icon")) return;

        holdStartX = e.clientX;
        holdStartY = e.clientY;
        suppressNextClick = false;
        clearTimeout(holdTimer);

        holdTimer = setTimeout(() => {
            suppressNextClick = true;
            queuePlayNext(li.dataset.playlist, parseInt(li.dataset.index));
            if (navigator.vibrate) navigator.vibrate(40);
            li.classList.add("enqueued-flash");
            setTimeout(() => li.classList.remove("enqueued-flash"), 250);
        }, 500);
    });

    trackList.addEventListener("pointermove", (e) => {
        if (!holdTimer) return;
        const dx = Math.abs(e.clientX - holdStartX);
        const dy = Math.abs(e.clientY - holdStartY);
        if (dx > 10 || dy > 10) {
            clearTimeout(holdTimer);
            holdTimer = null;
        }
    });

    trackList.addEventListener("pointerup", () => {
        clearTimeout(holdTimer);
        holdTimer = null;
    });

    trackList.addEventListener("pointercancel", () => {
        clearTimeout(holdTimer);
        holdTimer = null;
    });

    trackList.addEventListener("click", (e) => {
        if (suppressNextClick) {
            suppressNextClick = false;
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        const li = e.target.closest("li");
        if (!li || !li.dataset.index || !li.dataset.playlist) return;
        
        playTrackSelection(li.dataset.playlist, parseInt(li.dataset.index));
    });

    trackList.addEventListener("contextmenu", (e) => {
        const li = e.target.closest("li");
        if (!li || !li.dataset.index || !li.dataset.playlist) return;
        
        e.preventDefault();
        queuePlayNext(li.dataset.playlist, parseInt(li.dataset.index));
        li.classList.add("enqueued-flash");
        setTimeout(() => li.classList.remove("enqueued-flash"), 250);
    });

    window.addEventListener("popstate", (e) => {
        const view = e.state ? e.state.view : null;
        if (view !== 'lyrics' && window.lyricsActive) {
            closeLyricsUI();
        }
        if (view !== 'player' && view !== 'lyrics' && nowPlaying.classList.contains("expanded")) {
            nowPlaying.classList.remove("expanded");
        }
    });

    lyricsToggleHint.addEventListener('click', () => {
        if (!window.lyricsActive) {
            window.lyricsActive = true;
            pushHistoryState('lyrics');
            lyricsToggleHint.style.color = 'var(--primary-color)';
            lyricsContainer.style.display = 'flex';
            if (queueIndex >= 0 && queueIndex < playQueue.length) {
                loadLyrics(currentPlaylistData[playQueue[queueIndex]]);
            }
            if (!audioPlayer.paused && !lyricsRafId && !currentLyricsIsUnsynced) {
                lyricsRafId = requestAnimationFrame(lyricsLoop);
            }
        } else {
            history.back();
        }
    });

    document.getElementById('btn-close-lyrics').addEventListener('click', () => {
        if (window.lyricsActive) history.back();
    });

    let lyricsTouchStartY = 0;
    lyricsContainer.addEventListener("touchstart", (e) => {
        lyricsTouchStartY = e.changedTouches[0].screenY;
    }, {passive: true});

    lyricsContainer.addEventListener("touchend", (e) => {
        if (window.innerWidth > 800) return;
        let touchEndY = e.changedTouches[0].screenY;
        const lyricsContent = document.getElementById('lyrics-content');
        
        // Only allow swipe down to dismiss if we are at the top of the scrollable lyrics
        if (window.lyricsActive && touchEndY > lyricsTouchStartY + 50 && lyricsContent.scrollTop <= 0) {
            history.back();
        }
    }, {passive: true});

    btnPlayPause.addEventListener("click", () => {
        if (!audioPlayer.src) {
            if (playQueue.length > 0 && queueIndex !== -1) {
                executePlayback(false);
            } else if (playQueue.length > 0) {
                queueIndex = 0;
                executePlayback(false);
            }
            return;
        }
        if (audioPlayer.paused) {
            audioPlayer.play().catch(e => {
                console.warn("Play blocked:", e);
            });
        } else {
            audioPlayer.pause();
        }
    });

    btnNext.addEventListener("click", playNext);
    btnPrev.addEventListener("click", playPrev);

    btnShuffle.addEventListener("click", () => {
        shuffleMode = (shuffleMode + 1) % 3;
        applyShuffleUI();

        if (shuffleMode === 1) {
            // Shuffle all: cross-playlist random
            generateQueue(false); // un-shuffle current playlist queue
            crossShuffleHistory = [];
            crossShufflePos = -1; // Reset position so rebuildCrossShuffleDeck shuffles the entire deck
            
            if (typeof window.rebuildCrossShuffleDeck === 'function') {
                window.rebuildCrossShuffleDeck();
            }
            
            if (queueIndex >= 0 && queueIndex < playQueue.length) {
                const currentOriginalIndex = playQueue[queueIndex];
                const curPl = playlistSelect.value;
                const newIdx = crossShuffleHistory.findIndex(t => t.playlist === curPl && t.index === currentOriginalIndex);
                if (newIdx !== -1) {
                    // Swap it to the front so we don't throw away any tracks before it
                    const temp = crossShuffleHistory[0];
                    crossShuffleHistory[0] = crossShuffleHistory[newIdx];
                    crossShuffleHistory[newIdx] = temp;
                    crossShufflePos = 0;
                } else {
                    crossShufflePos = 0;
                }
            } else {
                crossShufflePos = 0;
            }
        } else if (shuffleMode === 2) {
            // Shuffle once: current playlist only
            generateQueue(false);
        } else {
            // Off
            crossShuffleHistory = [];
            crossShufflePos = -1;
            generateQueue(false);
        }
    });

    btnRepeat.addEventListener("click", () => {
        repeatMode = (repeatMode + 1) % 3;
        applyRepeatUI();
    });
    function syncDuration() {
        const dur = audioPlayer.duration;
        if (!isNaN(dur) && dur > 0 && dur !== Infinity) {
            const roundedDur = Math.floor(dur);
            if (parseFloat(seekBar.max) !== roundedDur) {
                seekBar.max = roundedDur;
                totalTimeDisplay.textContent = formatTime(roundedDur);
                if (typeof updateSeekBarProgress === 'function') updateSeekBarProgress();
                if (typeof updateBufferProgress === 'function') updateBufferProgress();
                updateMediaSessionPosition();
            }
        }
    }
    audioPlayer.addEventListener("durationchange", syncDuration);
    audioPlayer.addEventListener("loadedmetadata", syncDuration);
    audioPlayer.addEventListener("canplay", syncDuration);

    audioPlayer.addEventListener("seeked", () => {
        updateMediaSessionPosition();
        if (typeof updateSeekBarProgress === 'function') updateSeekBarProgress();
    });
    audioPlayer.addEventListener("ratechange", updateMediaSessionPosition);
    
    audioPlayer.addEventListener("progress", () => {
        if (typeof updateBufferProgress === 'function') updateBufferProgress();
        if (!audioPlayer.duration || audioPlayer.duration === Infinity) return;
        const buffered = audioPlayer.buffered;
        if (buffered.length > 0 && buffered.end(buffered.length - 1) >= audioPlayer.duration - 0.5) {
            if (typeof triggerPreloads === 'function') triggerPreloads();
        }
    });
    
    let focusResumeCheckInterval = null;
    function startInterruptionWatchdog() {
        if (focusResumeCheckInterval) clearInterval(focusResumeCheckInterval);
        let attempts = 0;
        focusResumeCheckInterval = setInterval(() => {
            attempts++;
            if (!window.wasInterrupted || window.wasPausedByUser || !audioPlayer.paused || attempts > 45) {
                clearInterval(focusResumeCheckInterval);
                focusResumeCheckInterval = null;
                return;
            }
            audioPlayer.play().then(() => {
                window.wasInterrupted = false;
                clearInterval(focusResumeCheckInterval);
                focusResumeCheckInterval = null;
            }).catch(() => {
                // Still blocked by external audio session
            });
        }, 2000);
    }

    audioPlayer.addEventListener("play", () => {
        window.wasPausedByUser = false;
        window.wasInterrupted = false;
        if (focusResumeCheckInterval) {
            clearInterval(focusResumeCheckInterval);
            focusResumeCheckInterval = null;
        }
        setPlayUI(true);
        updateMediaSessionPosition();
        if (hasMediaSession) {
            navigator.mediaSession.playbackState = 'playing';
            const track = currentPlaylistData[playQueue[queueIndex]] 
                       || currentPlaylistData[globalActiveOriginalIndex];
            if (track && navigator.mediaSession.metadata) {
                navigator.mediaSession.metadata.title = track.title;
                navigator.mediaSession.metadata.artist = track.channel;
                const squareArt = artworkSquareCache.get(track.id);
                const rawArt = getThumbUrl(track);
                const artworkSrc = squareArt || rawArt;
                const fallbackIcon = typeof getPurpleNoteArtwork === 'function' 
                    ? getPurpleNoteArtwork() 
                    : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%238c73ff'%3E%3Cpath d='M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z'/%3E%3C/svg%3E";
                const artworkList = (!thumbsDisabled && artworkSrc) 
                    ? [{ src: artworkSrc, sizes: '512x512', type: 'image/jpeg' }] 
                    : [{ src: fallbackIcon, sizes: '512x512', type: 'image/png' }];
                navigator.mediaSession.metadata.artwork = artworkList;
            }
        }
        if (window.lyricsActive && !lyricsRafId && !currentLyricsIsUnsynced) {
            lyricsRafId = requestAnimationFrame(lyricsLoop);
        }
    });

    audioPlayer.addEventListener("pause", () => {
        setPlayUI(false);
        updateMediaSessionPosition();
        if (hasMediaSession && window.wasPausedByUser) {
            navigator.mediaSession.playbackState = 'paused';
        }
        if (!window.wasPausedByUser && !audioPlayer.switching && audioPlayer.src) {
            window.wasInterrupted = true;
            startInterruptionWatchdog();
        }
    });

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            if (!audioPlayer.paused) {
                updateTimeUI(Math.floor(audioPlayer.currentTime));
            } else if (window.wasPausedByUser === false && (window.wasInterrupted || audioPlayer.src)) {
                window.wasInterrupted = false;
                audioPlayer.play().catch(e => console.warn("Auto-resume failed:", e));
            }
        }
    });

    window.addEventListener("focus", () => {
        if (window.wasPausedByUser === false && window.wasInterrupted && audioPlayer.src && audioPlayer.paused) {
            window.wasInterrupted = false;
            audioPlayer.play().catch(e => console.warn("Focus auto-resume failed:", e));
        }
    });

    // --- Mobile Mini Player Expand/Collapse Logic ---
    nowPlaying.addEventListener("click", (e) => {
        if (window.innerWidth <= 800 && !nowPlaying.classList.contains("expanded")) {
            if (e.target.closest('.control-btn')) return;
            nowPlaying.classList.add("expanded");
            pushHistoryState('player');
        }
    });

    btnCollapse.addEventListener("click", (e) => {
        e.stopPropagation();
        if (nowPlaying.classList.contains("expanded")) {
            history.back();
        }
    });

    if (hasTouch) {
        let touchStartY = 0;
        nowPlaying.addEventListener("touchstart", (e) => {
            touchStartY = e.changedTouches[0].screenY;
        }, {passive: true});
        
        nowPlaying.addEventListener("touchend", (e) => {
            if (window.innerWidth > 800) return;
            let touchEndY = e.changedTouches[0].screenY;
            if (nowPlaying.classList.contains("expanded") && touchEndY > touchStartY + 50) {
                history.back();
            } else if (!nowPlaying.classList.contains("expanded") && touchEndY < touchStartY - 20) {
                nowPlaying.classList.add("expanded");
                pushHistoryState('player');
            }
        }, {passive: true});
    }
    // --------------------------------------------
    let wasPlayingBeforeSeek = false;
    seekBar.addEventListener("pointerdown", () => {
        if (!isSeeking) {
            wasPlayingBeforeSeek = !audioPlayer.paused;
            isSeeking = true;
            audioPlayer.instantPause();
        }
    });

    seekBar.addEventListener("input", (e) => {
        if (!isSeeking) {
            wasPlayingBeforeSeek = !audioPlayer.paused;
            isSeeking = true;
            audioPlayer.instantPause();
        }
        const val = Number(e.target.value);
        currentTimeDisplay.textContent = formatTime(Math.floor(val));
        if (typeof updateSeekBarProgress === 'function') updateSeekBarProgress();
    });

    const endSeek = (e) => {
        if (!isSeeking) return;
        isSeeking = false;
        const targetTime = Number(e.target.value);
        try {
            audioPlayer.currentTime = targetTime;
        } catch (err) {
            console.warn("Seek error:", err);
        }
        updateTimeUI(targetTime);
        if (window.lyricsActive) updateLyricsUI(targetTime);
        updateMediaSessionPosition();
        if (wasPlayingBeforeSeek) {
            audioPlayer.play().catch(console.warn);
        }
    };

    seekBar.addEventListener("change", endSeek);
    seekBar.addEventListener("pointerup", endSeek);
    seekBar.addEventListener("pointercancel", endSeek);

    audioPlayer.addEventListener("timeupdate", () => {
        if (!isSeeking && audioPlayer.duration > 0 && audioPlayer.duration !== Infinity) {
            const ct = audioPlayer.currentTime;
            const roundedSec = Math.floor(ct);
            if (roundedSec !== lastRenderTime) {
                updateTimeUI(ct);
                updateMediaSessionPosition(ct, audioPlayer.duration, audioPlayer.playbackRate || 1);
            }
        }
    });

    let lastEndedTime = 0;
    audioPlayer.addEventListener("ended", () => {
        if (audioPlayer.switching) return;
        const now = Date.now();
        if (now - lastEndedTime < 1000) return; // Debounce multiple rapid native ended events
        lastEndedTime = now;

        if (repeatMode === 2) { 
            audioPlayer.currentTime = 0;
            updateTimeUI(0);
            if (window.lyricsActive && typeof updateLyricsUI === 'function') {
                updateLyricsUI(0);
            }
            audioPlayer.play().catch(e => console.warn("Repeat play error:", e));
        } else {
            playNext();
        }
    });

    audioPlayer.addEventListener("error", () => {
        if (audioPlayer.switching) return;
        const activeEl = audioPlayer.active || audioPlayer;
        const err = activeEl.error;
        // Ignore MEDIA_ERR_ABORTED (1) from in-flight aborted stream / track change
        if (err && err.code === 1) return;
        if (!audioPlayer.getAttribute('src') || errorSkipTimer) return;
          
          // Android Power Management / Network drop: Try to recover ONCE before skipping.
          const ct = audioPlayer.currentTime > 0 ? audioPlayer.currentTime : (audioPlayer.lastKnownTime || 0);
          if (ct > 0 && !isRecovering && audioPlayer.readyState > 0) {
              isRecovering = true;
              const savedTime = ct;
              const track = currentPlaylistData[playQueue[queueIndex]] || 
currentPlaylistData[globalActiveOriginalIndex];
              if (!track) { isRecovering = false; return; }
  
              const onMeta = () => {
                  audioPlayer.removeEventListener('loadedmetadata', onMeta);
                  audioPlayer.currentTime = savedTime;
                  isRecovering = false;
              };
            audioPlayer.addEventListener('loadedmetadata', onMeta);
            
            const cacheKey = `${baseUrl}/_cache/${track.id}`;
            let recoveryUrl = getAudioUrl(track);
            audioPlayer.recoverTrack(recoveryUrl);
            return;
        }

        currentTitle.textContent = "Error loading file... skipping";
        currentTitle.style.color = "#ff5555";
        setPlayUI(false);
        
        if (hasMediaSession) {
            navigator.mediaSession.playbackState = "paused";
        }
        
        errorSkipTimer = setTimeout(() => {
            errorSkipTimer = null;
            isRecovering = false;
            if (window.lastPlaybackDirection === -1) {
                playPrev();
            } else {
                playNext();
            }
        }, 3000);
    });
    // Initialize thumb toggle hint visibility
    if (thumbsDisabled) {
        thumbToggleHint.style.display = 'flex';
    }

    let lastArtClickTime = 0;
    
    albumArtContainer.addEventListener("click", (e) => {
        e.stopPropagation();
        
        const rect = albumArtContainer.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        
        // Prevent NaN logic from defaulting to isMiddle
        if (isNaN(clickX) || width === 0) return;

        const isLeft = clickX < width * 0.33;
        const isRight = clickX > width * 0.66;
        const isMiddle = !isLeft && !isRight;

        if (isMiddle) {
            thumbsDisabled = !thumbsDisabled;
            if (thumbsDisabled) {
                albumArt.style.display = 'none';
                thumbToggleHint.style.display = 'flex';
                document.documentElement.style.setProperty('--primary-color', '#8c73ff');
            } else {
                thumbToggleHint.style.display = 'none';
                if (queueIndex >= 0 && queueIndex < playQueue.length) {
                    const track = currentPlaylistData[playQueue[queueIndex]];
                    if (track && getThumbUrl(track)) {
                        const rawThumbUrl = getThumbUrl(track);
                        const cached = (typeof thumbCache !== 'undefined') ? thumbCache.get(rawThumbUrl) : null;
                        const initialThumb = (cached && cached.status === 'loaded' && cached.resolvedUrl) ? cached.resolvedUrl : rawThumbUrl;

                        albumArt.style.display = 'block';
                        albumArt.onerror = function() {
                            if (track.id && !this.src.includes('ytimg.com')) {
                                this.src = `https://i.ytimg.com/vi/${track.id}/hqdefault.jpg`;
                                this.style.display = 'block';
                            } else {
                                this.removeAttribute('src');
                                this.style.display = 'none';
                            }
                        };
                        albumArt.src = initialThumb;
                        
                        if (dominantColorCache.has(track.id)) {
                            document.documentElement.style.setProperty('--primary-color', dominantColorCache.get(track.id));
                        } else {
                            const tempImg = new Image();
                            if (!initialThumb.includes('ytimg.com')) {
                                tempImg.crossOrigin = "Anonymous";
                            }
                            tempImg.onload = () => {
                                const color = getDominantColor(tempImg, track.id);
                                document.documentElement.style.setProperty('--primary-color', color);
                            };
                            tempImg.src = initialThumb;
                        }
                    } else {
                        albumArt.style.display = 'none';
                    }
                }
            }
            lastStartIndex = -1;
            renderVirtualTracks();
            return;
        }

        const now = Date.now();
        const isDoubleClick = (now - lastArtClickTime) < 300;
        lastArtClickTime = now;
        if (isDoubleClick) {
            if (isLeft) {
                audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 5);
                updateTimeUI(audioPlayer.currentTime);
                if (window.lyricsActive) updateLyricsUI(audioPlayer.currentTime);
                updateMediaSessionPosition();
            } else if (isRight) {
                let dur = audioPlayer.duration;
                if (!dur || isNaN(dur) || dur === Infinity) dur = parseInt(seekBar.max) || 0;
                audioPlayer.currentTime = Math.min(dur || 0, audioPlayer.currentTime + 5);
                updateTimeUI(audioPlayer.currentTime);
                if (window.lyricsActive) updateLyricsUI(audioPlayer.currentTime);
                updateMediaSessionPosition();
            }
        }
    });

    let lastValidPlaylist = playlistSelect.value;
    playlistSelect.addEventListener("change", async (e) => {
        if (e.target.value === "INSTALL_APP") {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                deferredPrompt = null;
            } else {
                alert("App is already installed or your browser doesn't support PWA installation!");
            }
            playlistSelect.value = lastValidPlaylist;
            return;
        }
        
        lastValidPlaylist = e.target.value;
        if (shuffleMode !== 1) {
            crossShuffleHistory = [];
            crossShufflePos = -1;
        }
        loadPlaylist(e.target.value);
    });

    // --- On-Demand YouTube Playlist Sync Button & Autonomous Poller ---
    const btnSync = document.getElementById("btn-sync");
    let isSyncPolling = false;

    async function refreshUpdatedPlaylists() {
        const currentPl = playlistSelect.value;
        const ts = Date.now();
        
        for (const pl of ALL_PLAYLISTS) {
            if (allDatabases[pl]) {
                try {
                    const res = await fetch(`${baseUrl}/${pl}/_Playlist_Database.json?v=${ts}`);
                    if (res.ok) {
                        let freshData = await res.json();
                        if (freshData.length > 0 && Array.isArray(freshData[0])) {
                            freshData = freshData.filter(item => {
                                const title = String(item[1]);
                                return !title.includes('Deleted/Private Video') && !title.includes('Deleted video') && !title.includes('Private video');
                            }).map(item => ({
                                id: item[0],
                                title: item[1],
                                channel: item[2],
                                duration: item[3],
                                file_path: `${pl}/${item[4]}.webm`,
                                thumbnail_path: `${pl}/thumbnails/${item[4]}.webp`
                            }));
                        }
                        
                        const oldLength = allDatabases[pl].length;
                        if (freshData.length !== oldLength || freshData[0]?.id !== allDatabases[pl][0]?.id) {
                            allDatabases[pl] = freshData;
                            if (pl === currentPl) {
                                currentPlaylistData = freshData;
                                filteredIndices = currentPlaylistData.map((_, i) => ({ playlist: currentPl, index: i }));
                                trackList.style.height = `${filteredIndices.length * ITEM_HEIGHT}px`;
                                lastStartIndex = -1;
                                renderVirtualTracks();
                            }
                        }
                    }
                } catch (err) {
                    console.warn("Failed to check playlist updates for", pl, err);
                }
            }
        }
    }

    if (btnSync) {
        btnSync.addEventListener("click", async () => {
            if (isSyncPolling) return;
            const syncEndpoint = `${baseUrl}/sync`;
            const statusEndpoint = `${baseUrl}/status`;

            btnSync.classList.add("spinning");
            isSyncPolling = true;

            try {
                await fetch(syncEndpoint, { method: "POST" });
            } catch (err) {
                console.warn("Sync trigger:", err);
            }

            // Poll /status every 3 seconds until idle
            let pollAttempts = 0;
            const maxAttempts = 40; // 2 minutes max
            
            const pollInterval = setInterval(async () => {
                pollAttempts++;
                try {
                    const statusRes = await fetch(statusEndpoint);
                    if (statusRes.ok) {
                        const data = await statusRes.json();
                        if (data.status === "idle" || pollAttempts >= maxAttempts) {
                            clearInterval(pollInterval);
                            isSyncPolling = false;
                            btnSync.classList.remove("spinning");
                            await refreshUpdatedPlaylists();
                        }
                    }
                } catch (e) {
                    if (pollAttempts >= maxAttempts) {
                        clearInterval(pollInterval);
                        isSyncPolling = false;
                        btnSync.classList.remove("spinning");
                        await refreshUpdatedPlaylists();
                    }
                }
            }, 3000);
        });
    }

    // --- Register Service Worker for PWA Installability ---
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch((error) => {
            console.error('ServiceWorker registration failed: ', error);
        });
    }

    // --- Startup Strategy: Desktop loads all 3 in parallel; Mobile loads 1 on-demand ---
    if (!isMobileDevice) {
        // Desktop: Parallel fetch all 3 playlists for 0ms instant global search and switching
        Promise.all(ALL_PLAYLISTS.map(pl => {
            if (pl === playlistSelect.value) {
                return loadPlaylist(pl);
            } else {
                return fetch(`${baseUrl}/${pl}/_Playlist_Database.json`)
                    .then(r => r.ok ? r.json() : [])
                    .then(data => {
                        if (data.length > 0 && Array.isArray(data[0])) {
                            data = data.filter(item => {
                                const title = String(item[1]);
                                return !title.includes('Deleted/Private Video') && !title.includes('Deleted video') && !title.includes('Private video');
                            }).map(item => ({
                                id: item[0],
                                title: item[1],
                                channel: item[2],
                                duration: item[3],
                                file_path: `${pl}/${item[4]}.webm`,
                                thumbnail_path: `${pl}/thumbnails/${item[4]}.webp`
                            }));
                        }
                        allDatabases[pl] = data;
                        if (typeof window.rebuildCrossShuffleDeck === 'function') {
                            window.rebuildCrossShuffleDeck();
                        }
                    })
                    .catch(() => {});
            }
        }));
    } else {
        // Mobile: Load only active playlist to conserve cellular bandwidth & RAM
        loadPlaylist(playlistSelect.value);
    }
    
    // Keyboard Shortcuts (Desktop Only)
    if (!isMobileDevice) {
        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'TEXTAREA' || (e.target.tagName === 'INPUT' && e.target.type !== 'range')) return;
            
            if (e.key === ':' || (e.key === ';' && e.shiftKey)) {
                btnPrev.click();
            } else if (e.key === '"' || (e.key === "'" && e.shiftKey)) {
                btnNext.click();
            } else if (e.key === 'ArrowLeft') {
                audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 5);
            } else if (e.key === 'ArrowRight') {
                let dur = audioPlayer.duration;
                if (!dur || isNaN(dur) || dur === Infinity) dur = parseInt(seekBar.max) || 0;
                audioPlayer.currentTime = Math.min(dur || 0, audioPlayer.currentTime + 5);
            } else if (e.key === ' ') {
                if (e.repeat) {
                    e.preventDefault();
                    return;
                }
                btnPlayPause.click();
                e.preventDefault();
            } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                searchInput.focus();
            }
        });
    }

    // PWA Install Button Logic
    let deferredPrompt;

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
    });
});
