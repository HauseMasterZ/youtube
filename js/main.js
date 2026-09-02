document.addEventListener("DOMContentLoaded", () => {
    searchInput.addEventListener("input", (e) => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            selectedSearchIndex = -1;
            const query = e.target.value.toLowerCase().trim();
            const currentPl = playlistSelect.value;
            
            if (!query) {
                filteredIndices = currentPlaylistData ? currentPlaylistData.map((_, i) => ({ playlist: currentPl, index: i })) : [];
            } else {
                const scoredResults = [];
                const addedIds = new Set();
                
                // 1. Current playlist matches (with a slight current playlist bias of +50)
                if (currentPlaylistData) {
                    for (let i = 0; i < currentPlaylistData.length; i++) {
                        const track = currentPlaylistData[i];
                        const score = calculateFuzzyScore(query, track.title, track.channel);
                        if (score > 0) {
                            scoredResults.push({ playlist: currentPl, index: i, score: score + 50 });
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
                            const trackKey = track.id || track.file_path;
                            if (!addedIds.has(trackKey)) {
                                const score = calculateFuzzyScore(query, track.title, track.channel);
                                if (score > 0) {
                                    scoredResults.push({ playlist: pl, index: i, score: score });
                                    addedIds.add(trackKey);
                                }
                            }
                        }
                    }
                }

                // Rank by highest relevance score
                scoredResults.sort((a, b) => b.score - a.score);
                filteredIndices = scoredResults.map(item => ({ playlist: item.playlist, index: item.index }));
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
            const targetIdx = selectedSearchIndex >= 0 ? selectedSearchIndex : (filteredIndices.length > 0 ? 0 : -1);
            if (targetIdx >= 0 && targetIdx < filteredIndices.length) {
                if (searchDebounceTimer) {
                    clearTimeout(searchDebounceTimer);
                    searchDebounceTimer = null;
                }
                const item = filteredIndices[targetIdx];
                playTrackSelection(item.playlist, item.index);
                searchInput.blur();
            }
        } else if (e.key === "Escape") {
            e.preventDefault();
            searchInput.value = "";
            selectedSearchIndex = -1;
            const currentPl = playlistSelect.value;
            filteredIndices = currentPlaylistData ? currentPlaylistData.map((_, i) => ({ playlist: currentPl, index: i })) : [];
            if (filteredIndices.length > 0) {
                trackList.style.height = `${filteredIndices.length * ITEM_HEIGHT}px`;
                trackList.style.display = 'block';
                playlistMessage.style.display = 'none';
            }
            lastStartIndex = -1;
            renderVirtualTracks();
            searchInput.blur();
        }
    });

    let scrollRafId = null;
    function scheduleVirtualRender() {
        if (scrollRafId !== null) return;
        scrollRafId = window.requestAnimationFrame(() => {
            scrollRafId = null;
            renderVirtualTracks();
        });
    }

    playlistContainer.addEventListener("scroll", () => {
        lastUserScrollTime = Date.now();
        isScrollingFast = true;
        clearTimeout(scrollSettleTimer);
        scrollSettleTimer = setTimeout(() => {
            isScrollingFast = false;
            lastStartIndex = -1;
            renderVirtualTracks();
        }, 120);

        scheduleVirtualRender();
    }, { passive: true });

    ['touchstart', 'touchmove', 'wheel'].forEach(evt => {
        playlistContainer.addEventListener(evt, () => {
            lastUserScrollTime = Date.now();
        }, { passive: true });
    });

    function triggerEnqueuedFlash(li) {
        if (!li || !li.dataset.index || !li.dataset.playlist) return;
        const pl = li.dataset.playlist;
        const idx = parseInt(li.dataset.index);
        const targetTrack = (allDatabases[pl] && allDatabases[pl][idx]) || currentPlaylistData[idx];
        const songColor = targetTrack ? ((targetTrack.color && targetTrack.color !== '#000000') ? targetTrack.color : (dominantColorCache.get(targetTrack.id) || '#8c73ff')) : '#8c73ff';
        li.style.setProperty('--enqueued-color', songColor);
        li.classList.add("enqueued-flash");
        setTimeout(() => {
            li.classList.remove("enqueued-flash");
            li.style.removeProperty('--enqueued-color');
        }, 250);
    }

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
            triggerEnqueuedFlash(li);
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
        triggerEnqueuedFlash(li);
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
        if (typeof isMobileDevice !== 'undefined' && isMobileDevice && typeof initLiveAudioAnchor === 'function') {
            initLiveAudioAnchor();
        }
        if (!audioPlayer.src) {
            if (playQueue.length > 0 && queueIndex !== -1) {
                executePlayback(false);
            } else if (playQueue.length > 0) {
                queueIndex = 0;
                executePlayback(false);
            }
            return;
        }
        
        // Toggle based on user playback intent to prevent ghost state during initial buffering
        if (window.wasPausedByUser || audioPlayer.paused) {
            window.wasPausedByUser = false;
            if (typeof stopLiveAudioAnchor === 'function') stopLiveAudioAnchor();
            if (typeof cancelAutoKillWatchdog === 'function') cancelAutoKillWatchdog();
            setPlayUI(true);
            if (hasMediaSession) navigator.mediaSession.playbackState = 'playing';
            const dur = audioPlayer.duration || parseFloat(seekBar.max) || 0;
            if (dur > 0 && audioPlayer.currentTime >= dur - 0.5) {
                audioPlayer.currentTime = 0;
                updateTimeUI(0);
                if (window.lyricsActive && typeof updateLyricsUI === 'function') {
                    updateLyricsUI(0);
                }
            }
            audioPlayer.play().catch(e => console.warn("Play blocked:", e));
        } else {
            window.wasPausedByUser = true;
            setPlayUI(false);
            if (hasMediaSession) navigator.mediaSession.playbackState = (window.playbackMode === 'mode2') ? 'playing' : 'paused';
            audioPlayer.instantPause();
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

    const currentChannelEl = document.getElementById("current-channel");
    if (currentChannelEl) {
        currentChannelEl.addEventListener("click", () => {
            autoplayEnabled = !autoplayEnabled;
            applyAutoplayUI();
        });
    }
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
    });
    audioPlayer.addEventListener("ratechange", updateMediaSessionPosition);
    
    audioPlayer.addEventListener("progress", () => {
        if (typeof updateBufferProgress === 'function') updateBufferProgress();
        if (!audioPlayer.duration || audioPlayer.duration === Infinity) return;
        const buffered = audioPlayer.buffered;
        if (buffered.length > 0) {
            const buffEnd = buffered.end(buffered.length - 1);
            if (buffEnd >= audioPlayer.duration * 0.85 || audioPlayer._streamDone || buffEnd >= audioPlayer.duration - 2) {
                if (typeof triggerPreloads === 'function') triggerPreloads();
            }
        }
    });
    
    audioPlayer.addEventListener("play", () => {
        console.log("[AUDIO-PLAY] event fired! wasPausedByUser:", window.wasPausedByUser, "wasPlayingBeforeCall:", window.wasPlayingBeforeCall, "isCallActive:", window.isCallActive);
        if (window.wasPausedByUser) {
            console.log("[AUDIO-PLAY] Intercepted and blocked unwanted rogue autoplay while wasPausedByUser is true!");
            audioPlayer.instantPause();
            return;
        }
        window.wasPausedByUser = false;
        window.wasPlayingBeforeCall = true;
        if (typeof stopLiveAudioAnchor === 'function') stopLiveAudioAnchor();
        if (typeof cancelAutoKillWatchdog === 'function') cancelAutoKillWatchdog();
        setPlayUI(true);
        lastRenderTime = -1;

        if (hasMediaSession) {
            navigator.mediaSession.playbackState = 'playing';
            const dur = audioPlayer.duration || parseFloat(seekBar.max) || 0;
            updateMediaSessionPosition(audioPlayer.currentTime, dur, audioPlayer.playbackRate || 1.0);
        }

        if (window.lyricsActive && typeof updateLyricsUI === 'function') {
            updateLyricsUI(audioPlayer.currentTime);
        }
    });

    audioPlayer.addEventListener("playing", () => {
        if (typeof stopLiveAudioAnchor === 'function') stopLiveAudioAnchor();
        if (typeof cancelAutoKillWatchdog === 'function') cancelAutoKillWatchdog();
        setPlayUI(true);
        if (hasMediaSession) {
            navigator.mediaSession.playbackState = 'playing';
        }
    });

    audioPlayer.addEventListener("pause", () => {
        console.log("[AUDIO-PAUSE] wasPausedByUser:", window.wasPausedByUser, "wasPlayingBeforeCall:", window.wasPlayingBeforeCall, "isCallActive:", window.isCallActive);
        if (audioPlayer.switching || (audioPlayer._pendingSeek !== null && !window.wasPausedByUser)) return;

        setPlayUI(false);
        if (hasMediaSession) {
            const dur = audioPlayer.duration || parseFloat(seekBar.max) || 0;
            const isRecentBtDisconnect = (typeof window.lastBtDisconnectTime === 'number' && Date.now() - window.lastBtDisconnectTime < 2500);

            if (window.playbackMode === 'mode2' && !isRecentBtDisconnect) {
                // Mode 2 pause: keep 'playing' for head unit keepalive
                updateMediaSessionPosition(audioPlayer.currentTime, dur, 0.00001);
                navigator.mediaSession.playbackState = 'playing';
                setTimeout(() => {
                    const isStillBtDisconnect = (typeof window.lastBtDisconnectTime === 'number' && Date.now() - window.lastBtDisconnectTime < 2500);
                    if (window.playbackMode === 'mode2' && hasMediaSession && !isStillBtDisconnect) {
                        navigator.mediaSession.playbackState = 'playing';
                    }
                }, 100);
            } else {
                // Mode 1 or BT disconnect: set 'paused' so Android native focus resume works
                updateMediaSessionPosition(audioPlayer.currentTime, dur, 1.0);
                navigator.mediaSession.playbackState = 'paused';
            }
        }
    });

    let _focusResumeTimer = null;
    function attemptFocusResume() {
        console.log("[VISIBILITYCHANGE] hidden:", document.hidden, "paused:", (typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.paused), "wasPausedByUser:", window.wasPausedByUser, "wasPlayingBeforeCall:", window.wasPlayingBeforeCall);
        if (!window.wasPausedByUser && (window.wasPlayingBeforeCall !== false) && typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.paused && !audioPlayer.switching) {
            clearTimeout(_focusResumeTimer);
            _focusResumeTimer = setTimeout(() => {
                if (!window.wasPausedByUser && (window.wasPlayingBeforeCall !== false) && audioPlayer && audioPlayer.paused) {
                    audioPlayer.play().catch(() => {});
                }
            }, 100);
        }
    }
    document.addEventListener("visibilitychange", attemptFocusResume);



    document.addEventListener("visibilitychange", () => {
        if (!document.hidden && !audioPlayer.paused) {
            updateTimeUI(Math.floor(audioPlayer.currentTime));

            // Re-sync MediaSession state when PWA is foregrounded
            if (hasMediaSession) {
                navigator.mediaSession.playbackState = 'playing';
                const dur = audioPlayer.duration || parseFloat(seekBar.max) || 0;
                updateMediaSessionPosition(audioPlayer.currentTime, dur, audioPlayer.playbackRate || 1.0);
            }
        }
    });

    // --- Mobile Mini Player Expand/Collapse Logic ---
    nowPlaying.addEventListener("click", (e) => {
        if (window.innerWidth <= 750 && !nowPlaying.classList.contains("expanded")) {
            if (e.target.closest('.control-btn, #thumb-toggle-hint, #album-art-container, #current-channel')) return;
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
            const touchEndY = e.changedTouches[0].screenY;
            const deltaY = touchEndY - touchStartY;
            const minimizeThreshold = Math.max(80, window.innerHeight * 0.12);

            if (nowPlaying.classList.contains("expanded") && deltaY >= minimizeThreshold) {
                history.back();
            } else if (!nowPlaying.classList.contains("expanded") && deltaY <= -20) {
                nowPlaying.classList.add("expanded");
                pushHistoryState('player');
            }
        }, {passive: true});
    }
    // --------------------------------------------
    let wasPlayingBeforeSeek = false;
    seekBar.addEventListener("pointerdown", () => {
        if (!isSeeking) {
            wasPlayingBeforeSeek = !window.wasPausedByUser;
            isSeeking = true;
        }
    });

    seekBar.addEventListener("input", (e) => {
        if (!isSeeking) {
            wasPlayingBeforeSeek = !window.wasPausedByUser;
            isSeeking = true;
        }
        const val = Number(e.target.value);
        currentTimeDisplay.textContent = formatTime(Math.floor(val));
    });

    const endSeek = (e) => {
        if (!isSeeking) return;
        isSeeking = false;
        const targetTime = Number(e.target.value);
        
        if (wasPlayingBeforeSeek) {
            window.wasPausedByUser = false;
        }

        try {
            audioPlayer.currentTime = targetTime;
        } catch (err) {
            console.warn("Seek error:", err);
        }
        updateTimeUI(targetTime);
        if (window.lyricsActive) updateLyricsUI(targetTime);
        
        // Explicitly pass target time and total duration
        const totalDur = audioPlayer.duration || parseFloat(seekBar.max) || 0;
        updateMediaSessionPosition(targetTime, totalDur);
        
        if (wasPlayingBeforeSeek) {
            audioPlayer.play().catch(console.warn);
            setPlayUI(true);
        }
    };

    seekBar.addEventListener("change", endSeek);
    seekBar.addEventListener("pointerup", endSeek);
    seekBar.addEventListener("pointercancel", endSeek);

    audioPlayer.addEventListener("timeupdate", () => {
        if (!isSeeking && audioPlayer.duration > 0 && audioPlayer.duration !== Infinity && audioPlayer._pendingSeek === null && !audioPlayer.switching) {
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

        // If autoplay is disabled, strictly stop and retain end position
        if (!autoplayEnabled) {
            window.wasPausedByUser = true;
            setPlayUI(false);
            if (hasMediaSession) {
                navigator.mediaSession.playbackState = (window.playbackMode === 'mode2') ? 'playing' : 'paused';
            }
            return;
        }

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

    let isRecoveringAudio = false;
    let recoveryAttempts = 0;

    audioPlayer.addEventListener("playing", () => {
        isRecoveringAudio = false;
        recoveryAttempts = 0;
    });

    audioPlayer.addEventListener("error", () => {
        if (audioPlayer.switching) return;
        const activeEl = audioPlayer.active || audioPlayer;
        const err = activeEl.error;
        // Ignore MEDIA_ERR_ABORTED (1) from in-flight aborted stream / track change
        if (err && err.code === 1) return;
        if (!audioPlayer.getAttribute('src') || errorSkipTimer) return;
          
        // Android Power Management / Network drop: Try to recover before skipping (both buffering & mid-playback)
        if (recoveryAttempts < 3 && !isRecoveringAudio) {
            isRecoveringAudio = true;
            recoveryAttempts++;
            const ct = audioPlayer.currentTime > 0 ? audioPlayer.currentTime : (audioPlayer.lastKnownTime || 0);
            const savedTime = ct;
            const track = (currentPlaylistData && currentPlaylistData[playQueue[queueIndex]]) || 
                          (currentPlaylistData && currentPlaylistData[globalActiveOriginalIndex]);
            if (!track) { isRecoveringAudio = false; return; }

            const onMeta = () => {
                audioPlayer.removeEventListener('loadedmetadata', onMeta);
                if (savedTime > 0) {
                    audioPlayer.currentTime = savedTime;
                }
                isRecoveringAudio = false;
                recoveryAttempts = 0;
            };
            audioPlayer.addEventListener('loadedmetadata', onMeta);
            
            let recoveryUrl = getAudioUrl(track);
            audioPlayer.recoverTrack(recoveryUrl);
            return;
        }

        recoveryAttempts = 0;
        isRecoveringAudio = false;

        currentTitle.textContent = "Error loading file... skipping";
        currentTitle.style.color = "#ff5555";
        setPlayUI(false);
        
        if (hasMediaSession) {
            navigator.mediaSession.playbackState = (window.playbackMode === 'mode2') ? 'playing' : 'paused';
        }
        
        errorSkipTimer = setTimeout(() => {
            errorSkipTimer = null;
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
        const track = isPlaying ? (currentPlaylistData[playQueue[queueIndex]] || currentPlaylistData[globalActiveOriginalIndex]) : null;
        if (track) {
            const activeColor = (track.color && track.color !== '#000000') ? track.color : (dominantColorCache.get(track.id) || '#8c73ff');
            document.documentElement.style.setProperty('--primary-color', activeColor);
        }

        if (thumbsDisabled) {
            albumArt.style.display = 'none';
            if (albumArtContainer) albumArtContainer.classList.add('no-art');
            if (thumbToggleHint) {
                thumbToggleHint.style.display = 'flex';
                thumbToggleHint.innerHTML = `${eyeIconSvg}Show thumbnails`;
            }
        } else {
            if (isPlaying && track && getThumbUrl(track)) {
                if (albumArtContainer) albumArtContainer.classList.remove('no-art');
                if (thumbToggleHint) thumbToggleHint.style.display = 'none';
                albumArt.style.display = 'block';
                albumArt.src = getThumbUrl(track);
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
        e.stopPropagation();
        
        const isPlaying = queueIndex >= 0 && queueIndex < playQueue.length && Boolean(audioPlayer.src);
        
        // If in collapsed miniplayer, clicking the 44px thumbnail circle directly toggles thumbnails
        if (window.innerWidth <= 750 && !nowPlaying.classList.contains("expanded")) {
            thumbsDisabled = !thumbsDisabled;
            updateThumbToggleUI();
            if (!thumbsDisabled && isPlaying) {
                const track = currentPlaylistData[playQueue[queueIndex]];
                if (track && getThumbUrl(track)) {
                    const thumbUrl = getThumbUrl(track);
                    albumArt.style.display = 'block';
                    albumArt.src = thumbUrl;
                    const activeColor = (track.color && track.color !== '#000000') ? track.color : (dominantColorCache.get(track.id) || '#8c73ff');
                    document.documentElement.style.setProperty('--primary-color', activeColor);
                    if (hasMediaSession && navigator.mediaSession.metadata) {
                        const sqCached = artworkSquareCache.has(track.id) ? artworkSquareCache.get(track.id) : null;
                        if (sqCached) {
                            navigator.mediaSession.metadata.artwork = [{ src: sqCached, sizes: '512x512', type: 'image/jpeg' }];
                        } else {
                            getSquareArtwork(thumbUrl, track.id, (sqUrl) => {
                                if (hasMediaSession && navigator.mediaSession.metadata) {
                                    navigator.mediaSession.metadata = new MediaMetadata({
                                        title: track.title,
                                        artist: track.channel,
                                        artwork: [{ src: sqUrl, sizes: '512x512', type: 'image/jpeg' }]
                                    });
                                }
                            });
                        }
                    }
                }
            }
            lastStartIndex = -1;
            renderVirtualTracks();
            return;
        }

        const targetEl = (albumArt && albumArt.style.display !== 'none' && !albumArtContainer.classList.contains('no-art')) 
            ? albumArt 
            : albumArtContainer;
        const rect = targetEl.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;

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
        } else if (isMiddle || e.target.closest('#thumb-toggle-hint')) {
            thumbsDisabled = !thumbsDisabled;
            updateThumbToggleUI();
            if (!thumbsDisabled && isPlaying) {
                const track = currentPlaylistData[playQueue[queueIndex]];
                if (track && getThumbUrl(track)) {
                    const thumbUrl = getThumbUrl(track);
                    albumArt.style.display = 'block';
                    albumArt.src = thumbUrl;
                    const activeColor = (track.color && track.color !== '#000000') ? track.color : (dominantColorCache.get(track.id) || '#8c73ff');
                    document.documentElement.style.setProperty('--primary-color', activeColor);
                    if (hasMediaSession && navigator.mediaSession.metadata) {
                        const sqCached = artworkSquareCache.has(track.id) ? artworkSquareCache.get(track.id) : null;
                        if (sqCached) {
                            navigator.mediaSession.metadata.artwork = [{ src: sqCached, sizes: '512x512', type: 'image/jpeg' }];
                        } else {
                            getSquareArtwork(thumbUrl, track.id, (sqUrl) => {
                                if (hasMediaSession && navigator.mediaSession.metadata) {
                                    navigator.mediaSession.metadata = new MediaMetadata({
                                        title: track.title,
                                        artist: track.channel,
                                        artwork: [{ src: sqUrl, sizes: '512x512', type: 'image/jpeg' }]
                                    });
                                }
                            });
                        }
                    }
                }
            }
            lastStartIndex = -1;
            renderVirtualTracks();
        }
    });



    let deferredPrompt;

    async function reloadPlaylistDatabases() {
        const currentPl = playlistSelect.value;
        const ts = Date.now();

        if (btnSync) btnSync.classList.add("spinning");

        try {
            // 1. Fetch fresh JSON for all playlists concurrently with cache-busting timestamp
            await Promise.all(ALL_PLAYLISTS.map(async (pl) => {
                const dbUrl = `${baseUrl}/${pl}/_Playlist_Database.json`;
                const res = await fetch(`${dbUrl}?t=${ts}`);
                if (res.ok) {
                    const rawData = await res.json();
                    const freshData = normalizePlaylistData(rawData, pl);
                    allDatabases[pl] = freshData;
                }
            }));

            // 3. Re-apply the active playlist in place (0ms re-render)
            if (allDatabases[currentPl]) {
                currentPlaylistData = allDatabases[currentPl];
                applyPlaylistData(currentPl, currentPlaylistData, false);
            }

            if (typeof window.rebuildCrossShuffleDeck === 'function') {
                window.rebuildCrossShuffleDeck();
            }
        } catch (err) {
            console.warn("Failed to reload playlist databases:", err);
        } finally {
            if (btnSync) btnSync.classList.remove("spinning");
        }
    }

    async function installPwaApp() {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            deferredPrompt = null;
        } else {
            alert("App is already installed or your browser doesn't support PWA installation!");
        }
    }

    function updatePlaylistSelectOptions() {
        if (!playlistSelect) return;
        const currentVal = playlistSelect.value || (typeof ALL_PLAYLISTS !== 'undefined' && ALL_PLAYLISTS[0]) || "Gym";
        const playlistOptions = (typeof ALL_PLAYLISTS !== 'undefined' ? ALL_PLAYLISTS : ["Gym", "Driving", "Songs"]).map(pl => `<option value="${pl}">${pl}</option>`).join('');
        if (typeof isMobileDevice !== 'undefined' && isMobileDevice) {
            playlistSelect.innerHTML = `${playlistOptions}<option value="__settings__">Settings</option>`;
        } else {
            playlistSelect.innerHTML = `${playlistOptions}<option value="HARD_RELOAD">Reload Playlists</option><option value="INSTALL_APP">Install App</option>`;
        }
        if (typeof ALL_PLAYLISTS !== 'undefined' && ALL_PLAYLISTS.includes(currentVal)) {
            playlistSelect.value = currentVal;
        }
    }

    updatePlaylistSelectOptions();

    let lastValidPlaylist = playlistSelect.value;
    playlistSelect.addEventListener("change", async (e) => {
        if (e.target.value === "INSTALL_APP") {
            playlistSelect.value = lastValidPlaylist;
            await installPwaApp();
            return;
        }

        if (e.target.value === "__settings__") {
            playlistSelect.value = lastValidPlaylist;
            openSettingsModal();
            return;
        }

        if (e.target.value === "HARD_RELOAD" || e.target.value === "RELOAD_DATABASES") {
            playlistSelect.value = lastValidPlaylist;
            await reloadPlaylistDatabases();
            return;
        }
        
        lastValidPlaylist = e.target.value;
        if (shuffleMode !== 1) {
            crossShuffleHistory = [];
            crossShufflePos = -1;
        }
        loadPlaylist(e.target.value);
    });

    // --- Mobile Horizontal Swipe on Playlist Panel to Switch Playlists ---
    const playlistPanel = document.querySelector('.playlist-panel');
    if (hasTouch && playlistPanel) {
        let plTouchStartX = 0;
        let plTouchStartY = 0;
        let plTouchStartTime = 0;

        playlistPanel.addEventListener("touchstart", (e) => {
            if (e.target.closest('input, #fast-scroller, #fast-scroll-thumb')) return;
            plTouchStartX = e.changedTouches[0].clientX;
            plTouchStartY = e.changedTouches[0].clientY;
            plTouchStartTime = Date.now();
        }, { passive: true });

        playlistPanel.addEventListener("touchend", (e) => {
            if (window.innerWidth > 800) return;
            if (document.activeElement === searchInput) return;
            if (!ALL_PLAYLISTS || ALL_PLAYLISTS.length <= 1) return;

            const deltaX = e.changedTouches[0].clientX - plTouchStartX;
            const deltaY = e.changedTouches[0].clientY - plTouchStartY;
            const elapsed = Date.now() - plTouchStartTime;

            if (Math.abs(deltaX) >= 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2 && elapsed < 600) {
                let curIndex = ALL_PLAYLISTS.indexOf(playlistSelect.value);
                if (curIndex === -1) curIndex = 0;

                const targetIndex = deltaX < 0 
                    ? (curIndex + 1) % ALL_PLAYLISTS.length 
                    : (curIndex - 1 + ALL_PLAYLISTS.length) % ALL_PLAYLISTS.length;

                const nextPl = ALL_PLAYLISTS[targetIndex];
                if (nextPl && nextPl !== playlistSelect.value) {
                    playlistSelect.value = nextPl;
                    playlistSelect.dispatchEvent(new Event('change'));
                }
            }
        }, { passive: true });
    }

    // --- On-Demand YouTube Playlist Sync Button & Autonomous Poller ---
    const btnSync = document.getElementById("btn-sync");
    let isSyncPolling = false;

    async function refreshUpdatedPlaylists() {
        const currentPl = playlistSelect.value;
        const ts = Date.now();
        
        for (const pl of ALL_PLAYLISTS) {
            if (allDatabases[pl]) {
                try {
                    const res = await fetch(`${baseUrl}/${pl}/_Playlist_Database.json?t=${ts}`);
                    if (res.ok) {
                        const rawData = await res.json();
                        const freshData = normalizePlaylistData(rawData, pl);
                        if (typeof applyPlaylistData === 'function') {
                            applyPlaylistData(pl, freshData, true);
                        } else {
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
        const activeTrack = currentPlaylistData ? (currentPlaylistData[playQueue[queueIndex]] || currentPlaylistData[globalActiveOriginalIndex]) : null;
        if (activeTrack && activeTrack.color && activeTrack.color !== '#000000') {
            document.documentElement.style.setProperty('--primary-color', activeTrack.color);
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

    const btnDownloadPlaylist = document.getElementById("btn-download-playlist");
    if (btnDownloadPlaylist) {
        btnDownloadPlaylist.addEventListener("click", () => {
            if (typeof downloadActivePlaylist === 'function') downloadActivePlaylist();
        });
    }



    // --- Startup Strategy: Direct Unblocked Initial Fetch + Background Warming ---
    const initialPl = playlistSelect.value;
    loadPlaylist(initialPl);

    // Desktop only: Background warm other playlists for instant tab switching & global search
    if (!isMobileDevice) {
        if ('requestIdleCallback' in window) {
            requestIdleCallback(() => warmRemainingPlaylists(initialPl), { timeout: 4000 });
        } else {
            setTimeout(() => warmRemainingPlaylists(initialPl), 1500);
        }
    }

    function warmRemainingPlaylists(activePl) {
        const otherPlaylists = ALL_PLAYLISTS.filter(pl => pl !== activePl);
        for (const pl of otherPlaylists) {
            if (allDatabases[pl]) continue;
            fetch(`${baseUrl}/${pl}/_Playlist_Database.json`)
                .then(r => r.ok ? r.json() : [])
                .then(rawData => {
                    allDatabases[pl] = normalizePlaylistData(rawData, pl);
                    if (typeof window.rebuildCrossShuffleDeck === 'function') {
                        window.rebuildCrossShuffleDeck();
                    }
                })
                .catch(() => {});
        }
    }

    function syncArtWidth() {
        if (!albumArt || !nowPlaying) return;
        if (window.innerWidth <= 750 && !nowPlaying.classList.contains('expanded')) {
            nowPlaying.style.removeProperty('--art-width');
            return;
        }
        if (albumArt.style.display !== 'none' && !albumArtContainer.classList.contains('no-art') && albumArt.src) {
            const rect = albumArt.getBoundingClientRect();
            let w = rect.width;
            if (albumArt.naturalWidth && albumArt.naturalHeight) {
                const ratio = albumArt.naturalWidth / albumArt.naturalHeight;
                w = Math.min(rect.width, rect.height * ratio);
            }
            w = Math.max(Math.round(w), 280);
            nowPlaying.style.setProperty('--art-width', `${w}px`);
            return;
        }
        nowPlaying.style.removeProperty('--art-width');
    }

    if (albumArt) {
        albumArt.addEventListener('load', () => requestAnimationFrame(syncArtWidth));
        if (window.ResizeObserver) {
            const ro = new ResizeObserver(() => requestAnimationFrame(syncArtWidth));
            ro.observe(albumArt);
        }
    }
    if (window.ResizeObserver && playlistContainer) {
        const playlistRo = new ResizeObserver(() => {
            lastStartIndex = -1;
            lastEndIndex = -1;
            if (typeof renderVirtualTracks === 'function') {
                renderVirtualTracks();
            }
        });
        playlistRo.observe(playlistContainer);
    }
    window.addEventListener('resize', () => {
        requestAnimationFrame(() => {
            syncArtWidth();
            lastStartIndex = -1;
            lastEndIndex = -1;
            if (typeof renderVirtualTracks === 'function') {
                renderVirtualTracks();
            }
        });
    });
    
    // Keyboard Shortcuts (Universal)
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && settingsModal && settingsModal.style.display !== 'none') {
            closeSettingsModal();
            return;
        }

        if (e.target.tagName === 'TEXTAREA' || (e.target.tagName === 'INPUT' && e.target.type !== 'range') || e.target.tagName === 'SELECT' || e.target.isContentEditable) return;
        
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
        } else if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.altKey && !e.metaKey) {
            btnRepeat.click();
            e.preventDefault();
        } else if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.altKey && !e.metaKey) {
            btnShuffle.click();
            e.preventDefault();
        } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
            searchInput.focus();
        }
    });

    // --- Settings Modal & Playback Engine Controls ---
    const settingsModal = document.getElementById("settings-modal");
    const settingsBackdrop = document.getElementById("settings-backdrop");
    const btnCloseSettings = document.getElementById("btn-close-settings");
    const mode1Radio = document.getElementById("mode-1-radio");
    const mode2Radio = document.getElementById("mode-2-radio");
    const btTimeoutContainer = document.getElementById("bt-timeout-container");
    const btTimeoutSelect = document.getElementById("bt-timeout-select");
    const btTimeoutCustom = document.getElementById("bt-timeout-custom");
    const btnModalReload = document.getElementById("btn-modal-reload");
    const btnModalInstall = document.getElementById("btn-modal-install");

    function openSettingsModal() {
        const currentMode = window.playbackMode || 'mode1';
        if (currentMode === 'mode2') {
            if (mode2Radio) mode2Radio.checked = true;
            if (btTimeoutContainer) btTimeoutContainer.style.display = 'block';
        } else {
            if (mode1Radio) mode1Radio.checked = true;
            if (btTimeoutContainer) btTimeoutContainer.style.display = 'none';
        }

        const standardTimeouts = ['5', '15', '30', '60', '120', 'never'];
        const currentTimeout = (typeof window.btTimeoutMins !== 'undefined' && window.btTimeoutMins !== null)
            ? String(window.btTimeoutMins).trim()
            : '5';

        if (standardTimeouts.includes(currentTimeout)) {
            if (btTimeoutSelect) btTimeoutSelect.value = currentTimeout;
            if (btTimeoutCustom) btTimeoutCustom.style.display = 'none';
        } else {
            if (btTimeoutSelect) btTimeoutSelect.value = 'custom';
            if (btTimeoutCustom) {
                btTimeoutCustom.style.display = 'block';
                btTimeoutCustom.value = currentTimeout;
            }
        }

        if (settingsModal) settingsModal.style.display = 'block';
        if (settingsBackdrop) settingsBackdrop.style.display = 'block';
    }

    function closeSettingsModal() {
        if (settingsModal) settingsModal.style.display = 'none';
        if (settingsBackdrop) settingsBackdrop.style.display = 'none';
    }

    window.openSettingsModal = openSettingsModal;
    window.closeSettingsModal = closeSettingsModal;

    if (btnCloseSettings) {
        btnCloseSettings.addEventListener("click", closeSettingsModal);
    }

    if (settingsBackdrop) {
        settingsBackdrop.addEventListener("click", closeSettingsModal);
    }

    const modeRadios = document.querySelectorAll('input[name="playback-mode"]');
    modeRadios.forEach(radio => {
        radio.addEventListener("change", () => {
            const checkedRadio = document.querySelector('input[name="playback-mode"]:checked');
            const newMode = checkedRadio ? checkedRadio.value : 'mode1';
            if (newMode === 'mode2' && typeof initLiveAudioAnchor === 'function') {
                initLiveAudioAnchor();
            }
            if (typeof togglePlaybackMode === 'function') {
                togglePlaybackMode(newMode);
            }
        });
    });

    const storedPlaybackMode = (typeof window.getStoredSetting === 'function')
        ? window.getStoredSetting('yt_playback_mode', 'mode1')
        : ((typeof localStorage !== 'undefined' && localStorage.getItem('yt_playback_mode')) || 'mode1');
    if (storedPlaybackMode === 'mode2' && typeof togglePlaybackMode === 'function') {
        togglePlaybackMode('mode2');
    }

    if (btTimeoutSelect) {
        btTimeoutSelect.addEventListener("change", (e) => {
            if (e.target.value === 'custom') {
                if (btTimeoutCustom) {
                    btTimeoutCustom.style.display = 'block';
                    btTimeoutCustom.focus();
                    const M = parseInt(btTimeoutCustom.value, 10);
                    if (!isNaN(M) && M >= 1 && M <= 1440) {
                        window.btTimeoutMins = String(M);
                        if (typeof window.setStoredSetting === 'function') {
                            window.setStoredSetting('yt_bt_timeout_mins', String(M));
                        } else if (typeof setStoredSetting === 'function') {
                            setStoredSetting('yt_bt_timeout_mins', String(M));
                        }
                        if (window.playbackMode === 'mode2' && typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.paused) {
                            if (typeof armAutoKillWatchdog === 'function') armAutoKillWatchdog();
                        }
                    }
                }
            } else {
                if (btTimeoutCustom) btTimeoutCustom.style.display = 'none';
                window.btTimeoutMins = e.target.value;
                if (typeof window.setStoredSetting === 'function') {
                    window.setStoredSetting('yt_bt_timeout_mins', e.target.value);
                } else if (typeof setStoredSetting === 'function') {
                    setStoredSetting('yt_bt_timeout_mins', e.target.value);
                }
                if (window.playbackMode === 'mode2' && typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.paused) {
                    if (typeof armAutoKillWatchdog === 'function') armAutoKillWatchdog();
                }
            }
        });
    }

    if (btTimeoutCustom) {
        const handleCustomTimeoutInput = (e) => {
            const M = parseInt(e.target.value, 10);
            if (!isNaN(M) && M >= 1 && M <= 1440) {
                window.btTimeoutMins = String(M);
                if (typeof window.setStoredSetting === 'function') {
                    window.setStoredSetting('yt_bt_timeout_mins', String(M));
                } else if (typeof setStoredSetting === 'function') {
                    setStoredSetting('yt_bt_timeout_mins', String(M));
                }
                if (window.playbackMode === 'mode2' && typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.paused) {
                    if (typeof armAutoKillWatchdog === 'function') armAutoKillWatchdog();
                }
            }
        };
        btTimeoutCustom.addEventListener("input", handleCustomTimeoutInput);
        btTimeoutCustom.addEventListener("change", handleCustomTimeoutInput);
    }

    if (btnModalReload) {
        btnModalReload.addEventListener("click", () => {
            reloadPlaylistDatabases();
            closeSettingsModal();
        });
    }

    if (btnModalInstall) {
        btnModalInstall.addEventListener("click", () => {
            installPwaApp();
            closeSettingsModal();
        });
    }

    // --- Universal 20px Edge-Triggered Fast Scroller Engine ---
    const fastScroller = document.getElementById("fast-scroller");
    const fastThumb = document.getElementById("fast-scroll-thumb");
    const fastBubble = document.getElementById("fast-scroll-bubble");
    const fastBadge = document.getElementById("fast-scroll-badge");
    const fastTitle = document.getElementById("fast-scroll-title");

    let isFastScrolling = false;
    let lastHapticTrack = -1;

    function updateFastScrollPosition(clientY) {
        if (!playlistContainer || !filteredIndices || filteredIndices.length === 0) return;
        const rect = playlistContainer.getBoundingClientRect();
        const relativeY = Math.max(0, Math.min(clientY - rect.top, rect.height));
        const ratio = rect.height > 0 ? relativeY / rect.height : 0;

        // 1. Instant Virtual Scroll Dispatch
        const maxScroll = playlistContainer.scrollHeight - playlistContainer.clientHeight;
        playlistContainer.scrollTop = ratio * maxScroll;

        // 2. Track & Title Resolution (Topmost track currently in view)
        const topTrackIndex = Math.min(filteredIndices.length - 1, Math.max(0, Math.floor(playlistContainer.scrollTop / ITEM_HEIGHT)));
        const targetItem = filteredIndices[topTrackIndex];
        const track = currentPlaylistData ? currentPlaylistData[targetItem.index] : null;

        if (track) {
            const isFilterActive = searchInput && searchInput.value.trim().length > 0;
            fastBadge.textContent = isFilterActive 
                ? `MATCH #${topTrackIndex + 1} OF ${filteredIndices.length}`
                : `#${topTrackIndex + 1} / ${filteredIndices.length}`;
            fastTitle.textContent = track.title || "Unknown Title";

            // Micro-haptic pulse on track step (mobile only)
            if (topTrackIndex !== lastHapticTrack) {
                lastHapticTrack = topTrackIndex;
                if (typeof navigator.vibrate === 'function') navigator.vibrate(3);
            }
        }

        // 3. Thumb & Bubble Alignment (with safety padding so bubble never clips viewport edges)
        const parentRect = playlistContainer.offsetParent ? playlistContainer.offsetParent.getBoundingClientRect() : rect;
        const topOffset = rect.top - parentRect.top;
        const thumbHeight = 36;
        const thumbTop = topOffset + Math.max(0, Math.min(relativeY - (thumbHeight / 2), rect.height - thumbHeight));
        fastThumb.style.top = `${thumbTop}px`;

        const bubbleClampY = topOffset + Math.max(30, Math.min(relativeY, rect.height - 30));
        fastBubble.style.top = `${bubbleClampY}px`;
    }

    if (fastScroller) {
        fastScroller.addEventListener("pointerdown", (e) => {
            const rect = playlistContainer.getBoundingClientRect();
            // Strict 20px edge hit-test gate
            if (e.clientX >= rect.right - 20 && e.clientX <= rect.right + 2) {
                isFastScrolling = true;
                fastScroller.classList.add("active");
                fastBubble.classList.add("active");
                fastScroller.setPointerCapture(e.pointerId);
                updateFastScrollPosition(e.clientY);
                e.preventDefault();
            }
        });

        fastScroller.addEventListener("pointermove", (e) => {
            if (isFastScrolling) {
                updateFastScrollPosition(e.clientY);
                e.preventDefault();
            }
        });

        const stopFastScroll = (e) => {
            if (isFastScrolling) {
                isFastScrolling = false;
                fastScroller.classList.remove("active");
                fastBubble.classList.remove("active");
                try { fastScroller.releasePointerCapture(e.pointerId); } catch (err) {}
                lastHapticTrack = -1;
            }
        };

        fastScroller.addEventListener("pointerup", stopFastScroll);
        fastScroller.addEventListener("pointercancel", stopFastScroll);
    }

    // PWA Install Prompt Listener
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
    });
});
