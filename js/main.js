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
            } else if (typeof updateLyricsUI === 'function') {
                updateLyricsUI(audioPlayer.currentTime);
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
        if (window.innerWidth > 1110) return;
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
            const currentMax = parseFloat(seekBar.max) || 0;
            const isSettled = !audioPlayer._mediaSource || audioPlayer._mediaSource.readyState === 'ended';
            if (currentMax === 0 || isSettled || Math.abs(currentMax - roundedDur) <= 2) {
                if (currentMax !== roundedDur) {
                    seekBar.max = roundedDur;
                    totalTimeDisplay.textContent = formatTime(roundedDur);
                    if (typeof updateSeekBarProgress === 'function') updateSeekBarProgress();
                    if (typeof updateBufferProgress === 'function') updateBufferProgress();
                    updateMediaSessionPosition();
                }
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
    
    audioPlayer.addEventListener("play", () => {
        window.wasPausedByUser = false;
        window.wasInterrupted = false;
        setPlayUI(true);
        updateMediaSessionPosition();
        if (hasMediaSession) {
            navigator.mediaSession.playbackState = 'playing';
            const track = currentPlaylistData[playQueue[queueIndex]] 
                       || currentPlaylistData[globalActiveOriginalIndex];
            if (track && navigator.mediaSession.metadata) {
                navigator.mediaSession.metadata.title = track.title;
                navigator.mediaSession.metadata.artist = track.channel;
                if (!thumbsDisabled) {
                    const squareArt = artworkSquareCache.get(track.id);
                    const rawArt = typeof getThumbUrl === 'function' ? getThumbUrl(track) : null;
                    const art = squareArt || rawArt;
                    if (art) {
                        navigator.mediaSession.metadata.artwork = [{ src: art, sizes: '512x512', type: 'image/jpeg' }];
                    }
                }
            }
        }
        if (window.lyricsActive && typeof updateLyricsUI === 'function') {
            updateLyricsUI(audioPlayer.currentTime);
        }
    });

    audioPlayer.addEventListener("pause", () => {
        if (audioPlayer.switching) return;
        setPlayUI(false);
        updateMediaSessionPosition();
        if (hasMediaSession) {
            navigator.mediaSession.playbackState = 'paused';
        }
    });

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden && !audioPlayer.paused) {
            updateTimeUI(Math.floor(audioPlayer.currentTime));
        }
    });

    // --- Mobile Mini Player Expand/Collapse Logic ---
    nowPlaying.addEventListener("click", (e) => {
        if (window.innerWidth <= 750 && !nowPlaying.classList.contains("expanded")) {
            if (e.target.closest('.control-btn, #thumb-toggle-hint')) return;
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
            if (window.innerWidth > 750) return;
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
        if (window.lyricsActive && typeof updateLyricsUI === 'function') {
            updateLyricsUI(audioPlayer.currentTime);
        }
        if (typeof updateBufferProgress === 'function') updateBufferProgress();
    });

    audioPlayer.addEventListener("progress", () => {
        if (typeof updateBufferProgress === 'function') updateBufferProgress();
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
    const eyeIconSvg = '<svg viewBox="0 0 24 24"><path d="M12 4.5C7.3 4.5 3.2 7.4 1.5 11.5c1.7 4.1 5.8 7 10.5 7s8.8-2.9 10.5-7C20.8 7.4 16.7 4.5 12 4.5zm0 11.5c-2.5 0-4.5-2-4.5-4.5S9.5 7 12 7s4.5 2 4.5 4.5-2 4.5-4.5 4.5zm0-7c-1.4 0-2.5 1.1-2.5 2.5S10.6 14 12 14s2.5-1.1 2.5-2.5S13.4 9 12 9z"/></svg>';

    function updateThumbToggleUI() {
        const isPlaying = queueIndex >= 0 && queueIndex < playQueue.length && Boolean(audioPlayer.src);
        if (thumbsDisabled) {
            albumArt.style.display = 'none';
            if (albumArtContainer) albumArtContainer.classList.add('no-art');
            if (thumbToggleHint) {
                thumbToggleHint.style.display = 'flex';
                thumbToggleHint.innerHTML = `${eyeIconSvg}Show thumbnails`;
            }
            document.documentElement.style.setProperty('--primary-color', '#8c73ff');
        } else {
            if (isPlaying) {
                if (albumArtContainer) albumArtContainer.classList.remove('no-art');
                if (thumbToggleHint) thumbToggleHint.style.display = 'none';
                const track = currentPlaylistData[playQueue[queueIndex]];
                if (track && getThumbUrl(track)) {
                    const thumbUrl = getThumbUrl(track);
                    albumArt.style.display = 'block';
                    albumArt.src = thumbUrl;
                    if (dominantColorCache.has(track.id)) {
                        document.documentElement.style.setProperty('--primary-color', dominantColorCache.get(track.id));
                    } else if (typeof window.fetchVisuals === 'function') {
                        window.fetchVisuals(track.id, thumbUrl, currentPlaybackSequence, track);
                    }
                }
            } else {
                albumArt.style.display = 'none';
                if (albumArtContainer) albumArtContainer.classList.add('no-art');
                if (thumbToggleHint) {
                    thumbToggleHint.style.display = 'flex';
                    thumbToggleHint.innerHTML = `${eyeIconSvg}Hide thumbnails`;
                }
            }
        }
    }

    // Initialize thumb toggle hint visibility
    updateThumbToggleUI();

    function performSeekDelta(delta) {
        if (!audioPlayer.src) return;
        let dur = audioPlayer.duration;
        if (!dur || isNaN(dur) || dur === Infinity) dur = parseInt(seekBar.max) || 0;
        let targetTime = Math.max(0, Math.min(dur || 0, audioPlayer.currentTime + delta));
        audioPlayer.currentTime = targetTime;
        updateTimeUI(audioPlayer.currentTime);
        if (window.lyricsActive) updateLyricsUI(audioPlayer.currentTime);
        updateMediaSessionPosition();
    }

    let lastArtClickTime = 0;
    
    albumArtContainer.addEventListener("click", (e) => {
        const isThumbHint = Boolean(e.target.closest('#thumb-toggle-hint'));
        const isPlaying = queueIndex >= 0 && queueIndex < playQueue.length && Boolean(audioPlayer.src);

        // In mobile mini mode, unexpanded clicks:
        // If clicking album art while playing and thumbnails enabled, let it bubble to expand the player
        if (window.innerWidth <= 750 && !nowPlaying.classList.contains("expanded") && !isThumbHint && isPlaying && !thumbsDisabled) {
            return;
        }

        e.stopPropagation();
        
        if (isThumbHint || !isPlaying || thumbsDisabled) {
            thumbsDisabled = !thumbsDisabled;
            updateThumbToggleUI();
            if (!thumbsDisabled && isPlaying) {
                const track = currentPlaylistData[playQueue[queueIndex]];
                if (track && getThumbUrl(track)) {
                    const thumbUrl = getThumbUrl(track);
                    albumArt.style.display = 'block';
                    albumArt.src = thumbUrl;
                    if (dominantColorCache.has(track.id)) {
                        document.documentElement.style.setProperty('--primary-color', dominantColorCache.get(track.id));
                    } else if (typeof window.fetchVisuals === 'function') {
                        window.fetchVisuals(track.id, thumbUrl, currentPlaybackSequence, track);
                    }
                    if (hasMediaSession && navigator.mediaSession.metadata) {
                        const squareArt = artworkSquareCache.get(track.id);
                        navigator.mediaSession.metadata.artwork = [{ src: squareArt || thumbUrl, sizes: '512x512', type: 'image/jpeg' }];
                    }
                }
            }
            lastStartIndex = -1;
            renderVirtualTracks();
            return;
        }

        const rect = albumArtContainer.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        if (isNaN(clickX) || width === 0) return;

        const isLeft = clickX < width * 0.35;
        const isRight = clickX > width * 0.65;
        const isMiddle = !isLeft && !isRight;

        const now = Date.now();
        const isDoubleClick = (now - lastArtClickTime) < 300;
        lastArtClickTime = now;

        if (isDoubleClick && (isLeft || isRight)) {
            if (isLeft) performSeekDelta(-5);
            else if (isRight) performSeekDelta(5);
        } else if (isMiddle && !thumbsDisabled) {
            thumbsDisabled = true;
            updateThumbToggleUI();
            lastStartIndex = -1;
            renderVirtualTracks();
        }
    });

    let lastPlayerDblTime = 0;
    let lastPlayerTapX = 0;
    nowPlaying.addEventListener("click", (e) => {
        // If in mobile mini mode and unexpanded, do not trigger seek gestures
        if (window.innerWidth <= 750 && !nowPlaying.classList.contains("expanded")) return;
        if (e.target.closest('button, input, select, a, #thumb-toggle-hint, #btn-lyrics-toggle, .playback-controls, .progress-container, #album-art-container')) return;
        const isPlaying = queueIndex >= 0 && queueIndex < playQueue.length && Boolean(audioPlayer.src);
        if (!isPlaying) return;

        const now = Date.now();
        if (now - lastPlayerDblTime < 300) {
            const rect = nowPlaying.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const width = rect.width;
            if (clickX < width * 0.4) {
                performSeekDelta(-5);
            } else if (clickX > width * 0.6) {
                performSeekDelta(5);
            }
            lastPlayerDblTime = 0;
        } else {
            lastPlayerDblTime = now;
        }
    });

    if (hasTouch) {
        let touchStartSeekY = 0;
        nowPlaying.addEventListener("touchstart", (e) => {
            if (e.touches && e.touches.length > 0) {
                touchStartSeekY = e.touches[0].screenY;
            }
        }, {passive: true});

        nowPlaying.addEventListener("touchend", (e) => {
            // If in mobile mini mode and unexpanded, do not trigger seek gestures
            if (window.innerWidth <= 750 && !nowPlaying.classList.contains("expanded")) return;
            if (e.target.closest('button, input, select, a, #thumb-toggle-hint, #btn-lyrics-toggle, .playback-controls, .progress-container, #album-art-container')) return;
            const isPlaying = queueIndex >= 0 && queueIndex < playQueue.length && Boolean(audioPlayer.src);
            if (!isPlaying) return;

            const touch = e.changedTouches && e.changedTouches[0];
            if (!touch || Math.abs(touch.screenY - touchStartSeekY) > 30) return;

            const now = Date.now();
            if (now - lastPlayerDblTime < 300 && Math.abs(touch.clientX - lastPlayerTapX) < 60) {
                const rect = nowPlaying.getBoundingClientRect();
                const clickX = touch.clientX - rect.left;
                const width = rect.width;
                if (clickX < width * 0.4) {
                    performSeekDelta(-5);
                } else if (clickX > width * 0.6) {
                    performSeekDelta(5);
                }
                lastPlayerDblTime = 0;
            } else {
                lastPlayerDblTime = now;
                lastPlayerTapX = touch.clientX;
            }
        }, {passive: true});
    }

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

        if (e.target.value === "HARD_RELOAD") {
            playlistSelect.value = lastValidPlaylist;
            
            // 1. Clear all Service Worker / Cache API caches
            if ('caches' in window) {
                try {
                    const keys = await caches.keys();
                    await Promise.all(keys.map(k => caches.delete(k)));
                } catch (err) {
                    console.warn("Error clearing cache:", err);
                }
            }
            
            // 2. Unregister any active service workers
            if ('serviceWorker' in navigator) {
                try {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    await Promise.all(registrations.map(r => r.unregister()));
                } catch (err) {
                    console.warn("Error unregistering SW:", err);
                }
            }
            
            // 3. Clear session storage
            try { sessionStorage.clear(); } catch(err) {}

            // 4. Force hard reload with timestamp cache-busting
            const cleanUrl = window.location.origin + window.location.pathname + '?reload=' + Date.now();
            window.location.replace(cleanUrl);
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
                        const rawData = await res.json();
                        const freshData = normalizePlaylistData(rawData, pl);
                        
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

            // Poll /status every 10 seconds until idle
            let pollAttempts = 0;
            const maxAttempts = 30; // 5 minutes max
            
            const pollInterval = setInterval(async () => {
                pollAttempts++;
                try {
                    const statusRes = await fetch(`${statusEndpoint}?ts=${Date.now()}`);
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
            }, 10000);
        });
    }



    // --- Startup Strategy: Desktop loads all 3 in parallel; Mobile loads 1 on-demand ---
    requestAnimationFrame(() => {
        if (!isMobileDevice) {
            // Desktop: Parallel fetch all 3 playlists for 0ms instant global search and switching
            Promise.all(ALL_PLAYLISTS.map(pl => {
                if (pl === playlistSelect.value) {
                    return loadPlaylist(pl);
                } else {
                    return fetch(`${baseUrl}/${pl}/_Playlist_Database.json`)
                        .then(r => r.ok ? r.json() : [])
                        .then(rawData => {
                            allDatabases[pl] = normalizePlaylistData(rawData, pl);
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
    });
    
    // Keyboard Shortcuts (Universal)
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

    // PWA Install Button Logic
    let deferredPrompt;

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
    });
});
