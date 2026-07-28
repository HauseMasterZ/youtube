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
            if (!audioPlayer.paused && !lyricsRafId && !currentLyricsIsAi) {
                lyricsRafId = requestAnimationFrame(lyricsLoop);
            }
        } else {
            history.back();
        }
    });

    document.getElementById('btn-close-lyrics').addEventListener('click', () => {
        if (window.lyricsActive) history.back();
    });
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
            setPlayUI(true);
            audioPlayer.play().catch(e => {
                // Only revive if Android actually suspended the decoder/prevented autoplay
                if (e.name !== 'NotAllowedError') {
                    setPlayUI(false);
                    return;
                }
                
                const savedTime = audioPlayer.currentTime;
                const track = currentPlaylistData[playQueue[queueIndex]];
                if (!track) return;
                
                // Mute briefly to mask buffer clip during revival
                audioPlayer.muted = true;
                
                const onMeta = () => {
                    audioPlayer.currentTime = savedTime;
                    audioPlayer.play().catch(() => { setPlayUI(false); });
                    setTimeout(() => audioPlayer.muted = false, 150);
                    audioPlayer.removeEventListener("loadedmetadata", onMeta);
                };
                audioPlayer.addEventListener("loadedmetadata", onMeta);
                audioPlayer.src = getAudioUrl(track);
            });
        } else {
            setPlayUI(false);
            audioPlayer.pause();
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.code === "Space" && document.activeElement !== searchInput) {
            e.preventDefault();
            btnPlayPause.click();
        }
    });

    btnNext.addEventListener("click", playNext);
    btnPrev.addEventListener("click", playPrev);

    btnShuffle.addEventListener("click", () => {
        shuffleMode = (shuffleMode + 1) % 3;
        localStorage.setItem('shuffleMode', shuffleMode);
        applyShuffleUI();

        if (shuffleMode === 1) {
            // Shuffle all: cross-playlist random
            generateQueue(false); // un-shuffle current playlist queue
            crossShuffleHistory = [];
            crossShufflePos = -1;
            // Seed history with current track if one is playing
            if (queueIndex >= 0 && queueIndex < playQueue.length) {
                crossShuffleHistory.push({ playlist: playlistSelect.value, index: playQueue[queueIndex] });
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
        localStorage.setItem('repeatMode', repeatMode);
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
    audioPlayer.addEventListener("play", () => {
        setPlayUI(true);
        startSync();
        updateMediaSessionPosition();
        if (hasMediaSession) {
            navigator.mediaSession.playbackState = 'playing';
        }
        if (window.lyricsActive && !lyricsRafId && !currentLyricsIsAi) {
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
        if (audioPlayer.currentTime > 0) {
            localStorage.setItem("lastTime", audioPlayer.currentTime);
        }
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

    seekBar.addEventListener("input", () => {
        isSeeking = true;
        currentTimeDisplay.textContent = formatTime(seekBar.value);
    });

    seekBar.addEventListener("change", (e) => {
        audioPlayer.currentTime = Number(e.target.value);
        isSeeking = false;
        updateTimeUI(Number(e.target.value));
        if (window.lyricsActive) updateLyricsUI(audioPlayer.currentTime);
        updateMediaSessionPosition();
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
        if (audioPlayer.currentTime > 0 && !audioPlayer.isRecovering) {
            audioPlayer.isRecovering = true;
            const savedTime = audioPlayer.currentTime;
            const currentSrc = audioPlayer.getAttribute('src');
            audioPlayer.removeAttribute('src');
            audioPlayer.load();
            audioPlayer.src = currentSrc;
            audioPlayer.currentTime = savedTime;
            audioPlayer.play().then(() => {
                audioPlayer.isRecovering = false;
            }).catch(() => {
                audioPlayer.isRecovering = false;
            });
            return;
        }

        currentTitle.textContent = "Error loading file... skipping";
        currentTitle.style.color = "#ff5555";
        setPlayUI(false);
        
        // Keep MediaSession notification alive — do NOT clear src or call load()
        if (hasMediaSession) {
            navigator.mediaSession.playbackState = "paused";
        }
        
        errorSkipTimer = setTimeout(() => {
            errorSkipTimer = null;
            audioPlayer.isRecovering = false;
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
    // Initialize Fast-Boot
    const lastPlaylist = localStorage.getItem("lastPlaylist") || playlistSelect.value;
    if (ALL_PLAYLISTS.includes(lastPlaylist)) {
        playlistSelect.value = lastPlaylist;
    }
    
    // Load the active playlist instantaneously, defer others to the background
    loadPlaylist(playlistSelect.value).then(() => {
        preloadAllPlaylists(playlistSelect.value); // Non-blocking background preload
        
        const lastTrackId = localStorage.getItem("lastTrackId");
        if (lastTrackId) {
            const targetOriginalIndex = currentPlaylistData.findIndex(t => t.id === lastTrackId);
            if (targetOriginalIndex !== -1) {
                queueIndex = playQueue.indexOf(targetOriginalIndex);
                executePlayback(true); // true = preventAutoplay
            }
        }
    });
    
    // Keyboard Shortcuts (Desktop Only)
    if (!isMobileDevice) {
        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'TEXTAREA' || (e.target.tagName === 'INPUT' && e.target.type !== 'range')) return;
            
            const key = e.key.toLowerCase();
            if (key === 's') {
                btnShuffle.click();
            } else if (key === 'r') {
                btnRepeat.click();
            } else if (key === 'q') {
                btnPrev.click();
            } else if (key === 'e') {
                btnNext.click();
            } else if (e.key === 'ArrowLeft' || key === 'a') {
                audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 5);
            } else if (e.key === 'ArrowRight' || key === 'd') {
                let dur = audioPlayer.duration;
                if (!dur || isNaN(dur) || dur === Infinity) dur = parseInt(seekBar.max) || 0;
                audioPlayer.currentTime = Math.min(dur || 0, audioPlayer.currentTime + 5);
            }
        });
    }

    // PWA Install Button Logic
    let deferredPrompt;
    

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
    });



