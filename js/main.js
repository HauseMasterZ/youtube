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
        if (!isRendering) {
            window.requestAnimationFrame(renderVirtualTracks);
        }
    });
    trackList.addEventListener("click", (e) => {
        const li = e.target.closest("li");
        if (!li || !li.dataset.index || !li.dataset.playlist) return;
        
        playTrackSelection(li.dataset.playlist, parseInt(li.dataset.index));
    });

    trackList.addEventListener("contextmenu", (e) => {
        const li = e.target.closest("li");
        if (!li || !li.dataset.index || !li.dataset.playlist) return;
        
        e.preventDefault();
        
        queuePlayNext(li.dataset.playlist, parseInt(li.dataset.index));
        
        // Visual flash feedback
        const originalBg = li.style.backgroundColor;
        li.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
        setTimeout(() => { li.style.backgroundColor = originalBg; }, 200);
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
    const bufferingIndicator = document.getElementById("buffering-indicator");
    window.currentBufferingSeconds = -1;
    let bufferingTimeout = null;
    
    if (bufferingIndicator) {
        bufferingIndicator.addEventListener("click", () => {
            if (window.currentBufferingSeconds > 0) {
                bufferingIndicator.textContent = `${window.currentBufferingSeconds}s left`;
                bufferingIndicator.style.letterSpacing = "normal";
                if (bufferingTimeout) clearTimeout(bufferingTimeout);
                bufferingTimeout = setTimeout(() => {
                    bufferingIndicator.textContent = "...";
                    bufferingIndicator.style.letterSpacing = "2px";
                }, 1500);
            }
        });
    }

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

    document.addEventListener("keydown", (e) => {
        if (e.repeat) return;
        if (e.code === "Space" && document.activeElement !== searchInput) {
            e.preventDefault();
            btnPlayPause.click();
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
            
            // Build a global deck of all tracks
            for (const pl of ALL_PLAYLISTS) {
                if (allDatabases[pl]) {
                    for (let i = 0; i < allDatabases[pl].length; i++) {
                        crossShuffleHistory.push({ playlist: pl, index: i });
                    }
                }
            }
            
            // Fisher-Yates shuffle the global deck
            for (let i = crossShuffleHistory.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [crossShuffleHistory[i], crossShuffleHistory[j]] = [crossShuffleHistory[j], crossShuffleHistory[i]];
            }
            
            // Do not move current track to front, just update position marker
            if (queueIndex >= 0 && queueIndex < playQueue.length) {
                const currentOriginalIndex = playQueue[queueIndex];
                const curPl = playlistSelect.value;
                const newIdx = crossShuffleHistory.findIndex(t => t.playlist === curPl && t.index === currentOriginalIndex);
                if (newIdx !== -1) {
                    crossShufflePos = newIdx;
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
    audioPlayer.addEventListener("loadedmetadata", () => {
        const duration = Math.floor(audioPlayer.duration);
        if (!isNaN(duration) && duration !== Infinity) {
            seekBar.max = duration;
            totalTimeDisplay.textContent = formatTime(duration);
            updateMediaSessionPosition();
        } else if (seekBar.max > 0) {
            updateMediaSessionPosition();
        }
    });

    audioPlayer.addEventListener("seeked", updateMediaSessionPosition);
    audioPlayer.addEventListener("ratechange", updateMediaSessionPosition);
    
    audioPlayer.addEventListener("progress", () => {
        if (!audioPlayer.duration || audioPlayer.duration === Infinity) return;
        const buffered = audioPlayer.buffered;
        if (buffered.length > 0 && buffered.end(buffered.length - 1) >= audioPlayer.duration - 0.5) {
            // Current track fully buffered — safe to preload
            if (typeof triggerPreloads === 'function') triggerPreloads();
        }
    });

    audioPlayer.addEventListener("waiting", () => {
        const bufferingIndicator = document.getElementById("buffering-indicator");
        if (bufferingIndicator) {
            bufferingIndicator.style.display = "block";
            window.currentBufferingSeconds = -1; 
        }
    });

    audioPlayer.addEventListener("progress", () => {
        if (audioPlayer.buffered.length > 0) {
            const bufferedEnd = audioPlayer.buffered.end(audioPlayer.buffered.length - 1);
            const duration = audioPlayer.duration || 0;
            const current = audioPlayer.currentTime;
            
            if (duration > 0) {
                window.currentBufferingSeconds = Math.max(0, Math.floor(duration - bufferedEnd));
            }
        }
    });

    audioPlayer.addEventListener("playing", () => {
        const bufferingIndicator = document.getElementById("buffering-indicator");
        if (bufferingIndicator) {
            bufferingIndicator.style.display = "none";
            bufferingIndicator.textContent = "...";
            bufferingIndicator.style.letterSpacing = "2px";
            window.currentBufferingSeconds = -1;
        }
        // No setPlayUI(true) here because "play" event handles it
    });
    
    audioPlayer.addEventListener("play", () => {
        setPlayUI(true);
        startSync();
        updateMediaSessionPosition();
        if (hasMediaSession) {
            navigator.mediaSession.playbackState = 'playing';
        }
        if (window.lyricsActive && !lyricsRafId && !currentLyricsIsUnsynced) {
            lyricsRafId = requestAnimationFrame(lyricsLoop);
        }
    });
    audioPlayer.addEventListener("pause", () => {
        setPlayUI(false);
        stopSync();
        updateMediaSessionPosition();
        if (hasMediaSession) {
            navigator.mediaSession.playbackState = 'paused';
        }
        // Flush position to localStorage immediately on pause
    });

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            stopSync();
        } else {
            if (!audioPlayer.paused) {
                updateTimeUI(Math.floor(audioPlayer.currentTime));
                startSync();
            }
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
                // Swipe down to close
                history.back();
            } else if (!nowPlaying.classList.contains("expanded") && touchEndY < touchStartY - 20) {
                // Swipe up to expand
                nowPlaying.classList.add("expanded");
                pushHistoryState('player');
            }
        }, {passive: true});
    }
    // ----------------------------------------

    let wasPlayingBeforeSeek = false;
    seekBar.addEventListener("input", () => {
        if (!isSeeking) {
            wasPlayingBeforeSeek = !audioPlayer.paused;
            audioPlayer.instantPause();
        }
        isSeeking = true;
        currentTimeDisplay.textContent = formatTime(seekBar.value);
    });

    seekBar.addEventListener("change", (e) => {
        audioPlayer.currentTime = Number(e.target.value);
        isSeeking = false;
        updateTimeUI(Number(e.target.value));
        if (window.lyricsActive) updateLyricsUI(audioPlayer.currentTime);
        updateMediaSessionPosition();
        if (wasPlayingBeforeSeek) {
            audioPlayer.play().catch(console.warn);
        }
    });

      audioPlayer.addEventListener("timeupdate", () => {
          if (!isSeeking && audioPlayer.duration > 0 && audioPlayer.duration !== Infinity) {
              const ct = Math.floor(audioPlayer.currentTime);
              updateTimeUI(ct);
          }
      });

      audioPlayer.addEventListener("ended", () => {
        if (repeatMode === 2) { 
            audioPlayer.currentTime = 0;
            updateTimeUI(0);
            audioPlayer.play();
        } else {
            playNext();
        }
    });

      audioPlayer.addEventListener("error", () => {
          if (!audioPlayer.getAttribute('src') || errorSkipTimer) return;
          
          // Android Power Management / Network drop: Try to recover ONCE before skipping.
          const ct = audioPlayer.currentTime > 0 ? audioPlayer.currentTime : (audioPlayer.lastKnownTime || 0);
          if (ct > 0 && !isRecovering) {
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
            audioPlayer.switchTrack(recoveryUrl, false);
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
            playNext();
        }, 3000);
    });
    // Initialize thumb toggle hint visibility
    if (thumbsDisabled) {
        thumbToggleHint.style.display = 'block';
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
                thumbToggleHint.style.display = 'block';
                document.documentElement.style.setProperty('--primary-color', '#8c73ff');
            } else {
                thumbToggleHint.style.display = 'none';
                if (queueIndex >= 0 && queueIndex < playQueue.length) {
                    const track = currentPlaylistData[playQueue[queueIndex]];
                    if (track && getThumbUrl(track)) {
                        albumArt.src = getThumbUrl(track);
                        albumArt.style.display = 'block';
                        
                        if (dominantColorCache.has(track.id)) {
                            document.documentElement.style.setProperty('--primary-color', dominantColorCache.get(track.id));
                        } else {
                            const tempImg = new Image();
                            tempImg.crossOrigin = "Anonymous";
                            tempImg.onload = () => {
                                const color = getDominantColor(tempImg, track.id);
                                document.documentElement.style.setProperty('--primary-color', color);
                            };
                            tempImg.src = getThumbUrl(track);
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

    // --- Register Service Worker for PWA Installability ---
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch((error) => {
            console.error('ServiceWorker registration failed: ', error);
        });
    }
    // Load the active playlist instantaneously
    loadPlaylist(playlistSelect.value);
    
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



