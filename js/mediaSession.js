    // Toast notification singleton for mode changes and auto-kill events
    let modeToastTimer = null;
    function showModeToast(text) {
        const toast = document.getElementById("mode-toast");
        const toastText = document.getElementById("mode-toast-text");
        if (!toast || !toastText) return;

        if (modeToastTimer) {
            clearTimeout(modeToastTimer);
            modeToastTimer = null;
        }

        toastText.textContent = text;
        toast.style.display = "block";

        modeToastTimer = setTimeout(() => {
            toast.style.display = "none";
            modeToastTimer = null;
        }, 2500);
    }
    window.showModeToast = showModeToast;

    // Live Audio Anchor Singleton for Mode 2 (Hands-Free Bluetooth)
    let liveAudioContext = null;
    let liveAudioDestination = null;
    let liveAudioOscillator = null;
    let liveAudioGain = null;

    function initLiveAudioAnchor() {
        if (liveAudioContext) return liveAudioContext;
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;

        try {
            liveAudioContext = new AudioCtx();
            liveAudioDestination = liveAudioContext.createMediaStreamDestination();
            liveAudioOscillator = liveAudioContext.createOscillator();
            liveAudioGain = liveAudioContext.createGain();

            liveAudioGain.gain.value = 0;
            liveAudioOscillator.connect(liveAudioGain);
            liveAudioGain.connect(liveAudioDestination);
            liveAudioOscillator.start();

            const anchorEl = document.getElementById("live-stream-anchor");
            if (anchorEl && liveAudioDestination.stream) {
                anchorEl.srcObject = liveAudioDestination.stream;
            }
        } catch (e) {
            console.warn("Live audio anchor init error:", e);
        }
        return liveAudioContext;
    }

    function startLiveAudioAnchor() {
        if (window.playbackMode !== 'mode2') return;
        if (!liveAudioContext) {
            initLiveAudioAnchor();
        }
        if (liveAudioContext && liveAudioContext.state === 'suspended') {
            liveAudioContext.resume().catch(() => {});
        }
        const anchorEl = document.getElementById("live-stream-anchor");
        if (anchorEl) {
            if (!anchorEl.srcObject && liveAudioDestination && liveAudioDestination.stream) {
                anchorEl.srcObject = liveAudioDestination.stream;
            }
            anchorEl.play().then(() => {
                if (typeof hasMediaSession !== 'undefined' && hasMediaSession && typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.paused) {
                    navigator.mediaSession.playbackState = 'paused';
                }
            }).catch(e => console.warn("Live anchor play error:", e));
        }
    }

    function stopLiveAudioAnchor() {
        const anchorEl = document.getElementById("live-stream-anchor");
        if (anchorEl) {
            try {
                anchorEl.pause();
            } catch (e) {}
        }
    }

    window.initLiveAudioAnchor = initLiveAudioAnchor;
    window.startLiveAudioAnchor = startLiveAudioAnchor;
    window.stopLiveAudioAnchor = stopLiveAudioAnchor;

    // Auto-Kill Watchdog Lifecycle
    function cancelAutoKillWatchdog() {
        if (window.btSleepTimer !== null) {
            clearTimeout(window.btSleepTimer);
            window.btSleepTimer = null;
        }
    }

    function armAutoKillWatchdog() {
        cancelAutoKillWatchdog();
        if (window.playbackMode !== 'mode2') return;

        const rawTimeout = (typeof window.btTimeoutMins !== 'undefined' && window.btTimeoutMins !== null)
            ? String(window.btTimeoutMins).trim()
            : '30';

        if (rawTimeout === 'never') return;

        const mins = parseFloat(rawTimeout);
        if (isNaN(mins) || mins <= 0) return;

        const ms = mins * 60 * 1000;
        window.btSleepTimer = setTimeout(() => {
            stopLiveAudioAnchor();
            if (typeof hasMediaSession !== 'undefined' && hasMediaSession && navigator.mediaSession) {
                try {
                    navigator.mediaSession.playbackState = 'none';
                } catch (e) {}
            }
            showModeToast("Auto-kill: Inactivity timeout reached");
            window.btSleepTimer = null;
        }, ms);
    }

    window.armAutoKillWatchdog = armAutoKillWatchdog;
    window.cancelAutoKillWatchdog = cancelAutoKillWatchdog;

    // Unified Playback Mode Toggle Engine
    function togglePlaybackMode(targetMode = null) {
        const newMode = targetMode || (window.playbackMode === 'mode1' ? 'mode2' : 'mode1');
        window.playbackMode = newMode;

        if (typeof window.setStoredSetting === 'function') {
            window.setStoredSetting('yt_playback_mode', newMode);
        } else if (typeof setStoredSetting === 'function') {
            setStoredSetting('yt_playback_mode', newMode);
        }

        const mode1Radio = document.getElementById("mode-1-radio");
        const mode2Radio = document.getElementById("mode-2-radio");
        if (mode1Radio && mode2Radio) {
            mode1Radio.checked = (newMode === 'mode1');
            mode2Radio.checked = (newMode === 'mode2');
        }

        const btTimeoutContainer = document.getElementById("bt-timeout-container");
        if (btTimeoutContainer) {
            btTimeoutContainer.style.display = (newMode === 'mode2') ? 'block' : 'none';
        }

        showModeToast(newMode === 'mode2' ? "Mode Switched: Car & Bluetooth Mode" : "Mode Switched: Standard Mode");

        const isPaused = (typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.paused);
        if (newMode === 'mode2') {
            if (isPaused) {
                startLiveAudioAnchor();
                armAutoKillWatchdog();
            }
        } else {
            stopLiveAudioAnchor();
            cancelAutoKillWatchdog();
        }

        if (typeof updateMediaSessionPosition === 'function') {
            updateMediaSessionPosition();
        }
    }
    window.togglePlaybackMode = togglePlaybackMode;
    window.detectPlaybackModeShortcut = togglePlaybackMode; // Backward compatibility alias

    // MediaSession Position State Management
    function updateMediaSessionPosition(forcedPosition = null, forcedDuration = null, forcedRate = null) {
        if (typeof hasMediaSession !== 'undefined' && hasMediaSession && 'setPositionState' in navigator.mediaSession) {
            try {
                const isForcedPosValid = typeof forcedPosition === 'number' && !isNaN(forcedPosition);
                const isForcedDurValid = typeof forcedDuration === 'number' && !isNaN(forcedDuration);
                const isForcedRateValid = typeof forcedRate === 'number' && !isNaN(forcedRate);

                const dur = isForcedDurValid ? forcedDuration : ((typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.duration) || parseFloat(seekBar.max) || 0);
                const pos = isForcedPosValid ? forcedPosition : ((typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.currentTime) || 0);
                
                const isBuffering = (typeof audioPlayer !== 'undefined' && audioPlayer && (audioPlayer._pendingSeek !== null || audioPlayer.switching));
                const isPaused = (typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.paused);

                let rate;
                if (isForcedRateValid) {
                    rate = forcedRate;
                } else {
                    rate = (isBuffering || isPaused) ? 0.00001 : ((typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.playbackRate) || 1.0);
                }

                if (!isNaN(dur) && dur > 0 && !isNaN(pos) && pos >= 0) {
                    const validPos = Math.max(0, Math.min(pos, dur));
                    const validRate = (typeof rate === 'number' && !isNaN(rate) && rate > 0) ? rate : 1.0;
                    navigator.mediaSession.setPositionState({
                        duration: dur,
                        playbackRate: validRate,
                        position: validPos
                    });
                }
            } catch (e) {
                // Ignore transient errors
            }
        }
    }
    window.updateMediaSessionPosition = updateMediaSessionPosition;

    // Connect audioPlayer play/pause events to anchor and watchdog
    if (typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.addEventListener) {
        audioPlayer.addEventListener('play', () => {
            stopLiveAudioAnchor();
            cancelAutoKillWatchdog();
        });
        audioPlayer.addEventListener('pause', () => {
            if (window.playbackMode === 'mode2') {
                startLiveAudioAnchor();
                armAutoKillWatchdog();
            } else {
                stopLiveAudioAnchor();
                cancelAutoKillWatchdog();
            }
        });
    }

    // Media Session Global Action Handlers (Bound exactly once to prevent CPU overhead on track change)
    if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
        navigator.mediaSession.setActionHandler('play', () => {
            stopLiveAudioAnchor();
            cancelAutoKillWatchdog();
            if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                navigator.mediaSession.playbackState = 'playing';
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
            window.wasPausedByUser = false;
            const dur = audioPlayer.duration || parseFloat(seekBar.max) || 0;
            if (dur > 0 && audioPlayer.currentTime >= dur - 0.5) {
                audioPlayer.currentTime = 0;
                updateTimeUI(0);
                if (typeof lyricsActive !== 'undefined' && lyricsActive && typeof updateLyricsUI === 'function') {
                    updateLyricsUI(0);
                }
            }
            audioPlayer.play().catch(e => console.warn("MediaSession play error:", e));
        });

        navigator.mediaSession.setActionHandler('pause', () => {
            if (window.playbackMode === 'mode2' && audioPlayer && audioPlayer.paused) {
                // TWS Single-Button Resume
                window.wasPausedByUser = false;
                stopLiveAudioAnchor();
                cancelAutoKillWatchdog();
                if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                    navigator.mediaSession.playbackState = 'playing';
                }
                const dur = (audioPlayer && audioPlayer.duration) || (typeof seekBar !== 'undefined' && parseFloat(seekBar.max)) || 0;
                if (dur > 0 && audioPlayer.currentTime >= dur - 0.5) {
                    audioPlayer.currentTime = 0;
                    if (typeof updateTimeUI === 'function') updateTimeUI(0);
                    if (typeof lyricsActive !== 'undefined' && lyricsActive && typeof updateLyricsUI === 'function') updateLyricsUI(0);
                }
                audioPlayer.play().catch(e => console.warn("MediaSession play error:", e));
            } else {
                // Standard Pause
                window.wasPausedByUser = true;
                if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                    navigator.mediaSession.playbackState = 'paused';
                }
                if (audioPlayer && typeof audioPlayer.instantPause === 'function') {
                    audioPlayer.instantPause();
                } else if (audioPlayer) {
                    audioPlayer.pause();
                }
                if (window.playbackMode === 'mode2') {
                    startLiveAudioAnchor();
                    armAutoKillWatchdog();
                } else {
                    stopLiveAudioAnchor();
                    cancelAutoKillWatchdog();
                }
            }
        });

        try {
            navigator.mediaSession.setActionHandler('playpause', () => {
                if (audioPlayer && audioPlayer.paused) {
                    if (!audioPlayer.src) {
                        if (typeof playQueue !== 'undefined' && playQueue.length > 0 && typeof queueIndex !== 'undefined' && queueIndex !== -1) {
                            executePlayback(false);
                        } else if (typeof playQueue !== 'undefined' && playQueue.length > 0) {
                            queueIndex = 0;
                            executePlayback(false);
                        }
                        return;
                    }
                    window.wasPausedByUser = false;
                    const dur = (audioPlayer && audioPlayer.duration) || (typeof seekBar !== 'undefined' && parseFloat(seekBar.max)) || 0;
                    if (dur > 0 && audioPlayer.currentTime >= dur - 0.5) {
                        audioPlayer.currentTime = 0;
                        if (typeof updateTimeUI === 'function') updateTimeUI(0);
                        if (typeof lyricsActive !== 'undefined' && lyricsActive && typeof updateLyricsUI === 'function') {
                            updateLyricsUI(0);
                        }
                    }
                    audioPlayer.play().catch(e => console.warn("MediaSession playpause error:", e));
                    stopLiveAudioAnchor();
                    cancelAutoKillWatchdog();
                } else {
                    window.wasPausedByUser = true;
                    if (audioPlayer && typeof audioPlayer.instantPause === 'function') {
                        audioPlayer.instantPause();
                    } else if (audioPlayer) {
                        audioPlayer.pause();
                    }
                    if (window.playbackMode === 'mode2') {
                        startLiveAudioAnchor();
                        armAutoKillWatchdog();
                    } else {
                        stopLiveAudioAnchor();
                        cancelAutoKillWatchdog();
                    }
                }
            });
        } catch (e) {
            // playpause action not supported in all browsers
        }

        let lastTrackActionTime = 0;
        let lastTrackAction = null;

        navigator.mediaSession.setActionHandler('previoustrack', () => {
            const now = Date.now();
            if (lastTrackAction === 'next' && (now - lastTrackActionTime) <= 1200) {
                lastTrackAction = null;
                lastTrackActionTime = 0;
                togglePlaybackMode();
                return;
            }
            lastTrackAction = 'prev';
            lastTrackActionTime = now;
            playPrev();
        });

        navigator.mediaSession.setActionHandler('nexttrack', () => {
            const now = Date.now();
            if (lastTrackAction === 'prev' && (now - lastTrackActionTime) <= 1200) {
                lastTrackAction = null;
                lastTrackActionTime = 0;
                togglePlaybackMode();
                return;
            }
            lastTrackAction = 'next';
            lastTrackActionTime = now;
            playNext();
        });
        navigator.mediaSession.setActionHandler('seekto', (details) => {
            const seekTarget = details.seekTime;
            if (details.fastSeek && 'fastSeek' in audioPlayer) {
                audioPlayer.fastSeek(seekTarget);
            } else {
                audioPlayer.currentTime = seekTarget;
            }
            updateTimeUI(seekTarget);
            if (typeof lyricsActive !== 'undefined' && lyricsActive && typeof updateLyricsUI === 'function') updateLyricsUI(seekTarget);
            
            // Explicitly pass seek target and total duration to prevent 0:00 dip
            const totalDur = audioPlayer.duration || parseFloat(seekBar.max) || 0;
            updateMediaSessionPosition(seekTarget, totalDur);
        });
        navigator.mediaSession.setActionHandler('seekbackward', (details) => {
            const skipTime = details.seekOffset || 10;
            const newTime = Math.max(0, (audioPlayer.currentTime || 0) - skipTime);
            audioPlayer.currentTime = newTime;
            updateTimeUI(newTime);
            if (typeof lyricsActive !== 'undefined' && lyricsActive && typeof updateLyricsUI === 'function') updateLyricsUI(newTime);
            const dur = audioPlayer.duration || parseFloat(seekBar.max) || 0;
            updateMediaSessionPosition(newTime, dur);
        });
        navigator.mediaSession.setActionHandler('seekforward', (details) => {
            const skipTime = details.seekOffset || 10;
            const dur = audioPlayer.duration || parseFloat(seekBar.max) || 0;
            const newTime = Math.min(dur, (audioPlayer.currentTime || 0) + skipTime);
            audioPlayer.currentTime = newTime;
            updateTimeUI(newTime);
            if (typeof lyricsActive !== 'undefined' && lyricsActive && typeof updateLyricsUI === 'function') updateLyricsUI(newTime);
            updateMediaSessionPosition(newTime, dur);
        });
    }
