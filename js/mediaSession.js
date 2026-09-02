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
        if (liveAudioContext) {
            if (liveAudioContext.state === 'suspended') {
                liveAudioContext.resume().catch(() => {});
            }
            const anchorEl = document.getElementById("live-stream-anchor");
            if (anchorEl && liveAudioDestination && liveAudioDestination.stream && !anchorEl.srcObject) {
                anchorEl.srcObject = liveAudioDestination.stream;
            }
            if (anchorEl && anchorEl.paused) {
                anchorEl.play().then(() => {
                    if (window.playbackMode !== 'mode2' || (typeof audioPlayer !== 'undefined' && audioPlayer && !audioPlayer.paused)) {
                        anchorEl.pause();
                    }
                }).catch(() => {});
            }
            return liveAudioContext;
        }
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
            if (anchorEl && liveAudioDestination && liveAudioDestination.stream) {
                anchorEl.srcObject = liveAudioDestination.stream;
                if (anchorEl.paused) {
                    anchorEl.play().then(() => {
                        if (window.playbackMode !== 'mode2' || (typeof audioPlayer !== 'undefined' && audioPlayer && !audioPlayer.paused)) {
                            anchorEl.pause();
                        }
                    }).catch(() => {});
                }
            }
        } catch (e) {
            console.warn("Live audio anchor init error:", e);
        }
        return liveAudioContext;
    }

    function startLiveAudioAnchor() {
        if (typeof isMobileDevice !== 'undefined' && !isMobileDevice) return;
        if (window.playbackMode !== 'mode2') return;
        if (window.isCallActive) return;
        initLiveAudioAnchor();
        const anchorEl = document.getElementById("live-stream-anchor");
        if (anchorEl) {
            if (!anchorEl.srcObject && liveAudioDestination && liveAudioDestination.stream) {
                anchorEl.srcObject = liveAudioDestination.stream;
            }
            anchorEl.play().then(() => {
                if (window.playbackMode === 'mode2' && typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                    navigator.mediaSession.playbackState = 'playing';
                    const dur = (typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.duration) || (typeof seekBar !== 'undefined' && parseFloat(seekBar.max)) || 0;
                    const pos = (typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.currentTime) || 0;
                    if (typeof updateMediaSessionPosition === 'function') {
                        updateMediaSessionPosition(pos, dur, 0.00001);
                    }
                }
            }).catch(e => console.warn("Live anchor play error:", e));
        }
    }

    function stopLiveAudioAnchor() {
        const anchorEl = document.getElementById("live-stream-anchor");
        if (anchorEl && !anchorEl.paused) {
            try {
                anchorEl.pause();
            } catch (e) {}
        }
    }

    function teardownLiveAudioAnchor() {
        const anchorEl = document.getElementById("live-stream-anchor");
        if (anchorEl) {
            try {
                anchorEl.pause();
                anchorEl.srcObject = null;
                anchorEl.removeAttribute('src');
                if (typeof anchorEl.load === 'function') anchorEl.load();
            } catch (e) {}
        }
        if (liveAudioOscillator) {
            try {
                liveAudioOscillator.stop();
                liveAudioOscillator.disconnect();
            } catch (e) {}
            liveAudioOscillator = null;
        }
        if (liveAudioGain) {
            try {
                liveAudioGain.disconnect();
            } catch (e) {}
            liveAudioGain = null;
        }
        if (liveAudioContext) {
            try {
                liveAudioContext.close().catch(() => {});
            } catch (e) {}
            liveAudioContext = null;
        }
        liveAudioDestination = null;
    }

    window.initLiveAudioAnchor = initLiveAudioAnchor;
    window.startLiveAudioAnchor = startLiveAudioAnchor;
    window.stopLiveAudioAnchor = stopLiveAudioAnchor;
    window.teardownLiveAudioAnchor = teardownLiveAudioAnchor;

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
            : '5';

        if (rawTimeout === 'never') return;

        const mins = parseFloat(rawTimeout);
        if (isNaN(mins) || mins <= 0) return;

        const ms = mins * 60 * 1000;
        window.btSleepTimer = setTimeout(() => {
            teardownLiveAudioAnchor();
            stopLiveAudioAnchor();
            if (typeof hasMediaSession !== 'undefined' && hasMediaSession && navigator.mediaSession) {
                try {
                    navigator.mediaSession.playbackState = 'none';
                    navigator.mediaSession.metadata = null;
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
        lastAudioPlayerPauseTime = Date.now() - 1000;
        if (anchorStartTimer) {
            clearTimeout(anchorStartTimer);
            anchorStartTimer = null;
        }

        if (newMode === 'mode2' && typeof initLiveAudioAnchor === 'function') {
            initLiveAudioAnchor();
        }

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

        const isPaused = (typeof audioPlayer !== 'undefined' && audioPlayer && (audioPlayer.paused || window.wasPausedByUser));

        if (newMode === 'mode2') {
            if (isPaused) {
                if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                    navigator.mediaSession.playbackState = 'playing';
                }
                startLiveAudioAnchor();
                armAutoKillWatchdog();
            }
        } else {
            teardownLiveAudioAnchor();
            cancelAutoKillWatchdog();
            if (isPaused) {
                window.wasPausedByUser = true;
                if (typeof setPlayUI === 'function') setPlayUI(false);
                if (typeof audioPlayer !== 'undefined' && audioPlayer) {
                    if (typeof audioPlayer.instantPause === 'function') {
                        audioPlayer.instantPause();
                    } else {
                        audioPlayer.pause();
                    }
                    if (audioPlayer.active && audioPlayer.active.paused) {
                        try {
                            const p = audioPlayer.active.play();
                            if (p && p.then) {
                                p.then(() => {
                                    audioPlayer.active.pause();
                                }).catch(() => {});
                            }
                        } catch (e) {}
                    }
                }
                if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                    navigator.mediaSession.playbackState = 'paused';
                }
            }
        }

        if (typeof updateMediaSessionPosition === 'function') {
            const dur = (typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.duration) || (typeof seekBar !== 'undefined' && parseFloat(seekBar.max)) || 0;
            const pos = (typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.currentTime) || 0;
            if (isPaused) {
                updateMediaSessionPosition(pos, dur, newMode === 'mode2' ? 0.00001 : 1.0);
                if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                    navigator.mediaSession.playbackState = (newMode === 'mode2') ? 'playing' : 'paused';
                    if (navigator.mediaSession.metadata) {
                        try {
                            navigator.mediaSession.metadata = new MediaMetadata({
                                title: navigator.mediaSession.metadata.title,
                                artist: navigator.mediaSession.metadata.artist,
                                album: navigator.mediaSession.metadata.album,
                                artwork: navigator.mediaSession.metadata.artwork
                            });
                        } catch (e) {}
                    }
                }
            } else {
                updateMediaSessionPosition(pos, dur, (typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.playbackRate) || 1.0);
            }
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
                if (isForcedRateValid && forcedRate > 0) {
                    rate = forcedRate;
                } else if (navigator.mediaSession.playbackState === 'paused' || isPaused) {
                    rate = (window.playbackMode === 'mode2' && typeof isMobileDevice !== 'undefined' && isMobileDevice) ? 0.00001 : 1.0;
                } else {
                    rate = (typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.playbackRate) || 1.0;
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

    // BT disconnect detection: track device changes to prevent speaker bleed
    let anchorStartTimer = null;
    window.lastBtDisconnectTime = 0;
    let knownOutputCount = 0;

    if (typeof navigator.mediaDevices !== 'undefined' && navigator.mediaDevices.enumerateDevices) {
        navigator.mediaDevices.enumerateDevices().then(d => {
            knownOutputCount = d.filter(x => x.kind === 'audiooutput').length;
        }).catch(() => {});

        if (navigator.mediaDevices.addEventListener) {
            navigator.mediaDevices.addEventListener('devicechange', () => {
                navigator.mediaDevices.enumerateDevices().then(devices => {
                    const newCount = devices.filter(d => d.kind === 'audiooutput').length;
                    if (newCount < knownOutputCount) {
                        window.isCallActive = true;
                        window.lastCallStartTime = Date.now();
                        const wasAlreadyExternallyPaused = (typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.paused && !window.wasPausedByUser);
                        if (anchorStartTimer) {
                            clearTimeout(anchorStartTimer);
                            anchorStartTimer = null;
                        }
                        if (!wasAlreadyExternallyPaused) {
                            window.lastBtDisconnectTime = Date.now();
                            window.wasPausedByUser = true;
                            window.wasPlayingBeforeCall = false;
                        }
                        if (typeof audioPlayer !== 'undefined' && audioPlayer) {
                            if (typeof audioPlayer.instantPause === 'function') {
                                audioPlayer.instantPause();
                            } else {
                                audioPlayer.pause();
                            }
                        }
                        if (wasAlreadyExternallyPaused) {
                            window.wasPausedByUser = false;
                        }
                        stopLiveAudioAnchor();
                        cancelAutoKillWatchdog();
                        if (typeof setPlayUI === 'function') setPlayUI(false);
                        if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                            navigator.mediaSession.playbackState = (window.playbackMode === 'mode2') ? 'playing' : 'paused';
                            if (navigator.mediaSession.metadata) {
                                try {
                                    navigator.mediaSession.metadata = new MediaMetadata({
                                        title: navigator.mediaSession.metadata.title,
                                        artist: navigator.mediaSession.metadata.artist,
                                        album: navigator.mediaSession.metadata.album,
                                        artwork: navigator.mediaSession.metadata.artwork
                                    });
                                } catch (e) {}
                            }
                            const dur = (typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.duration) || (typeof seekBar !== 'undefined' && parseFloat(seekBar.max)) || 0;
                            const pos = (typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.currentTime) || 0;
                            if (typeof updateMediaSessionPosition === 'function') {
                                updateMediaSessionPosition(pos, dur, (window.playbackMode === 'mode2' && typeof isMobileDevice !== 'undefined' && isMobileDevice) ? 0.00001 : 1.0);
                            }
                        }
                    } else if (newCount > knownOutputCount || window.isCallActive) {
                        window.isCallActive = false;
                        window.lastCallEndTime = Date.now();
                        if (window.wasPlayingBeforeCall && !window.wasPausedByUser && typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.paused && !audioPlayer.switching) {
                            audioPlayer.play().catch(() => {});
                        }
                    }
                    knownOutputCount = newCount;
                }).catch(() => {});
            });
        }
    }

    // Connect audioPlayer play/pause events to anchor and watchdog
    let lastAudioPlayerPauseTime = 0;
    if (typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.addEventListener) {
        audioPlayer.addEventListener('play', () => {
            if (anchorStartTimer) {
                clearTimeout(anchorStartTimer);
                anchorStartTimer = null;
            }
            stopLiveAudioAnchor();
            cancelAutoKillWatchdog();
        });
        audioPlayer.addEventListener('pause', () => {
            lastAudioPlayerPauseTime = Date.now();
            if (anchorStartTimer) {
                clearTimeout(anchorStartTimer);
                anchorStartTimer = null;
            }
            const isRecentBtDisconnect = (typeof window.lastBtDisconnectTime === 'number' && Date.now() - window.lastBtDisconnectTime < 2500);

            if (window.playbackMode === 'mode2' && window.wasPausedByUser && !isRecentBtDisconnect) {
                // Mode 2 user pause: start anchor to maintain DAC awake
                anchorStartTimer = setTimeout(() => {
                    const isStillBtDisconnect = (typeof window.lastBtDisconnectTime === 'number' && Date.now() - window.lastBtDisconnectTime < 2500);
                    if (window.playbackMode === 'mode2' && audioPlayer.paused && window.wasPausedByUser && !isStillBtDisconnect) {
                        startLiveAudioAnchor();
                        armAutoKillWatchdog();
                    }
                }, 800);
            } else {
                stopLiveAudioAnchor();
                cancelAutoKillWatchdog();
            }
        });
    }

    // Media Session Global Action Handlers (Bound exactly once to prevent CPU overhead on track change)
    if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
        navigator.mediaSession.setActionHandler('play', () => {
            const isAutoResumeAfterCall = (typeof window.lastCallEndTime === 'number' && Date.now() - window.lastCallEndTime < 2500 && window.wasPlayingBeforeCall === false);
            if (isAutoResumeAfterCall) {
                return;
            }
            window.wasPausedByUser = false;
            window.wasPlayingBeforeCall = true;
            window.lastBtDisconnectTime = 0;
            if (typeof setPlayUI === 'function') setPlayUI(true);
            if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                navigator.mediaSession.playbackState = 'playing';
            }
            if (!audioPlayer.src) {
                if (typeof playQueue !== 'undefined' && playQueue.length > 0 && typeof queueIndex !== 'undefined' && queueIndex !== -1) {
                    executePlayback(false);
                } else if (typeof playQueue !== 'undefined' && playQueue.length > 0) {
                    queueIndex = 0;
                    executePlayback(false);
                }
                return;
            }
            const dur = (audioPlayer && audioPlayer.duration) || (typeof seekBar !== 'undefined' && parseFloat(seekBar.max)) || 0;
            if (dur > 0 && audioPlayer.currentTime >= dur - 0.5) {
                audioPlayer.currentTime = 0;
                if (typeof updateTimeUI === 'function') updateTimeUI(0);
                if (typeof lyricsActive !== 'undefined' && lyricsActive && typeof updateLyricsUI === 'function') updateLyricsUI(0);
            }
            stopLiveAudioAnchor();
            cancelAutoKillWatchdog();
            const playPromise = audioPlayer.play();
            if (playPromise && playPromise.then) {
                playPromise.catch(e => {
                    console.warn("MediaSession play error:", e);
                    Promise.resolve().then(() => {
                        if (audioPlayer && (audioPlayer.paused || window.wasPausedByUser)) {
                            audioPlayer.play().catch(() => {});
                        }
                    });
                });
            }
        });

        navigator.mediaSession.setActionHandler('pause', () => {
            const isActuallyPaused = (typeof audioPlayer !== 'undefined' && audioPlayer && (audioPlayer.paused || window.wasPausedByUser));
            if (window.playbackMode === 'mode2') {
                if (isActuallyPaused) {
                    const isAutoResumeAfterCall = (typeof window.lastCallEndTime === 'number' && Date.now() - window.lastCallEndTime < 2500 && window.wasPlayingBeforeCall === false);
                    if (isAutoResumeAfterCall) {
                        return;
                    }
                    // User intentionally resuming from paused state in Mode 2
                    window.wasPausedByUser = false;
                    window.wasPlayingBeforeCall = true;
                    window.lastBtDisconnectTime = 0;
                    if (typeof setPlayUI === 'function') setPlayUI(true);
                    if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                        navigator.mediaSession.playbackState = 'playing';
                    }
                    const dur = (audioPlayer && audioPlayer.duration) || (typeof seekBar !== 'undefined' && parseFloat(seekBar.max)) || 0;
                    if (dur > 0 && audioPlayer.currentTime >= dur - 0.5) {
                        audioPlayer.currentTime = 0;
                        if (typeof updateTimeUI === 'function') updateTimeUI(0);
                        if (typeof lyricsActive !== 'undefined' && lyricsActive && typeof updateLyricsUI === 'function') updateLyricsUI(0);
                    }
                    stopLiveAudioAnchor();
                    cancelAutoKillWatchdog();
                    const playPromise = audioPlayer.play();
                    if (playPromise && playPromise.then) {
                        playPromise.catch(e => {
                            console.warn("MediaSession play error:", e);
                            Promise.resolve().then(() => {
                                if (audioPlayer && (audioPlayer.paused || window.wasPausedByUser)) {
                                    audioPlayer.play().catch(() => {});
                                }
                            });
                        });
                    }
                } else {
                    // User intentionally pausing in Mode 2
                    window.wasPausedByUser = true;
                    window.wasPlayingBeforeCall = false;
                    if (typeof setPlayUI === 'function') setPlayUI(false);
                    if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                        navigator.mediaSession.playbackState = 'playing';
                    }
                    if (audioPlayer && typeof audioPlayer.instantPause === 'function') {
                        audioPlayer.instantPause();
                    } else if (audioPlayer) {
                        audioPlayer.pause();
                    }
                    startLiveAudioAnchor();
                    armAutoKillWatchdog();
                }
            } else {
                // Mode 1: If audio is paused (or was paused by user), play; if playing, pause
                const isActuallyPaused = (typeof audioPlayer !== 'undefined' && audioPlayer && (audioPlayer.paused || window.wasPausedByUser));
                if (isActuallyPaused) {
                    const isAutoResumeAfterCall = (typeof window.lastCallEndTime === 'number' && Date.now() - window.lastCallEndTime < 2500 && window.wasPlayingBeforeCall === false);
                    if (isAutoResumeAfterCall) {
                        return;
                    }
                    window.wasPausedByUser = false;
                    window.wasPlayingBeforeCall = true;
                    window.lastBtDisconnectTime = 0;
                    if (typeof setPlayUI === 'function') setPlayUI(true);
                    if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                        navigator.mediaSession.playbackState = 'playing';
                    }
                    const dur = (audioPlayer && audioPlayer.duration) || (typeof seekBar !== 'undefined' && parseFloat(seekBar.max)) || 0;
                    if (dur > 0 && audioPlayer.currentTime >= dur - 0.5) {
                        audioPlayer.currentTime = 0;
                        if (typeof updateTimeUI === 'function') updateTimeUI(0);
                        if (typeof lyricsActive !== 'undefined' && lyricsActive && typeof updateLyricsUI === 'function') updateLyricsUI(0);
                    }
                    audioPlayer.play().catch(e => {
                        console.warn("MediaSession play error:", e);
                        Promise.resolve().then(() => {
                            if (audioPlayer && audioPlayer.paused && !window.wasPausedByUser) {
                                audioPlayer.play().catch(() => {});
                            }
                        });
                    });
                } else {
                    window.wasPausedByUser = true;
                    window.wasPlayingBeforeCall = false;
                    if (typeof setPlayUI === 'function') setPlayUI(false);
                    if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                        navigator.mediaSession.playbackState = 'paused';
                    }
                    if (audioPlayer && typeof audioPlayer.instantPause === 'function') {
                        audioPlayer.instantPause();
                    } else if (audioPlayer) {
                        audioPlayer.pause();
                    }
                    stopLiveAudioAnchor();
                    cancelAutoKillWatchdog();
                }
            }
        });

        try {
            navigator.mediaSession.setActionHandler('playpause', () => {
                const isActuallyPaused = (typeof audioPlayer !== 'undefined' && audioPlayer && (audioPlayer.paused || window.wasPausedByUser));
                if (isActuallyPaused) {
                    const isAutoResumeAfterCall = (typeof window.lastCallEndTime === 'number' && Date.now() - window.lastCallEndTime < 2500 && window.wasPlayingBeforeCall === false);
                    if (isAutoResumeAfterCall) {
                        return;
                    }
                    window.wasPausedByUser = false;
                    window.wasPlayingBeforeCall = true;
                    window.lastBtDisconnectTime = 0;
                    if (typeof setPlayUI === 'function') setPlayUI(true);
                    if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                        navigator.mediaSession.playbackState = 'playing';
                    }
                    if (!audioPlayer.src) {
                        if (typeof playQueue !== 'undefined' && playQueue.length > 0 && typeof queueIndex !== 'undefined' && queueIndex !== -1) {
                            executePlayback(false);
                        } else if (typeof playQueue !== 'undefined' && playQueue.length > 0) {
                            queueIndex = 0;
                            executePlayback(false);
                        }
                        return;
                    }
                    const dur = (audioPlayer && audioPlayer.duration) || (typeof seekBar !== 'undefined' && parseFloat(seekBar.max)) || 0;
                    if (dur > 0 && audioPlayer.currentTime >= dur - 0.5) {
                        audioPlayer.currentTime = 0;
                        if (typeof updateTimeUI === 'function') updateTimeUI(0);
                        if (typeof lyricsActive !== 'undefined' && lyricsActive && typeof updateLyricsUI === 'function') {
                            updateLyricsUI(0);
                        }
                    }
                    stopLiveAudioAnchor();
                    cancelAutoKillWatchdog();
                    const playPromise = audioPlayer.play();
                    if (playPromise && playPromise.then) {
                        playPromise.catch(e => {
                            console.warn("MediaSession playpause error:", e);
                            Promise.resolve().then(() => {
                                if (audioPlayer && (audioPlayer.paused || window.wasPausedByUser)) {
                                    audioPlayer.play().catch(() => {});
                                }
                            });
                        });
                    }
                } else {
                    window.wasPausedByUser = true;
                    window.wasPlayingBeforeCall = false;
                    if (typeof setPlayUI === 'function') setPlayUI(false);
                    if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                        navigator.mediaSession.playbackState = (window.playbackMode === 'mode2') ? 'playing' : 'paused';
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
        } catch (e) {
            // playpause action not supported in all browsers
        }

        if (!window.lastPlaybackModeTransitions || typeof window.lastPlaybackModeTransitions !== 'object') {
            window.lastPlaybackModeTransitions = { time: 0, action: null };
        }

        navigator.mediaSession.setActionHandler('previoustrack', () => {
            const now = Date.now();
            const isMobile = (typeof isMobileDevice !== 'undefined' && isMobileDevice);
            if (isMobile && window.lastPlaybackModeTransitions.action === 'next' && (now - window.lastPlaybackModeTransitions.time) <= 2500) {
                window.lastPlaybackModeTransitions.action = null;
                window.lastPlaybackModeTransitions.time = 0;
                togglePlaybackMode();
            } else {
                window.lastPlaybackModeTransitions.action = 'prev';
                window.lastPlaybackModeTransitions.time = now;
            }
            playPrev();
        });

        navigator.mediaSession.setActionHandler('nexttrack', () => {
            const now = Date.now();
            const isMobile = (typeof isMobileDevice !== 'undefined' && isMobileDevice);
            if (isMobile && window.lastPlaybackModeTransitions.action === 'prev' && (now - window.lastPlaybackModeTransitions.time) <= 2500) {
                window.lastPlaybackModeTransitions.action = null;
                window.lastPlaybackModeTransitions.time = 0;
                togglePlaybackMode();
            } else {
                window.lastPlaybackModeTransitions.action = 'next';
                window.lastPlaybackModeTransitions.time = now;
            }
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
            const now = Date.now();
            const isMobile = (typeof isMobileDevice !== 'undefined' && isMobileDevice);
            if (isMobile && window.lastPlaybackModeTransitions.action === 'seekfwd' && (now - window.lastPlaybackModeTransitions.time) <= 2500) {
                window.lastPlaybackModeTransitions.action = null;
                window.lastPlaybackModeTransitions.time = 0;
                togglePlaybackMode();
            } else {
                window.lastPlaybackModeTransitions.action = 'seekback';
                window.lastPlaybackModeTransitions.time = now;
            }

            const skipTime = details.seekOffset || 10;
            const newTime = Math.max(0, (audioPlayer.currentTime || 0) - skipTime);
            audioPlayer.currentTime = newTime;
            updateTimeUI(newTime);
            if (typeof lyricsActive !== 'undefined' && lyricsActive && typeof updateLyricsUI === 'function') updateLyricsUI(newTime);
            const dur = audioPlayer.duration || parseFloat(seekBar.max) || 0;
            updateMediaSessionPosition(newTime, dur);
        });
        navigator.mediaSession.setActionHandler('seekforward', (details) => {
            const now = Date.now();
            const isMobile = (typeof isMobileDevice !== 'undefined' && isMobileDevice);
            if (isMobile && window.lastPlaybackModeTransitions.action === 'seekback' && (now - window.lastPlaybackModeTransitions.time) <= 2500) {
                window.lastPlaybackModeTransitions.action = null;
                window.lastPlaybackModeTransitions.time = 0;
                togglePlaybackMode();
            } else {
                window.lastPlaybackModeTransitions.action = 'seekfwd';
                window.lastPlaybackModeTransitions.time = now;
            }

            const skipTime = details.seekOffset || 10;
            const dur = audioPlayer.duration || parseFloat(seekBar.max) || 0;
            const newTime = Math.min(dur, (audioPlayer.currentTime || 0) + skipTime);
            audioPlayer.currentTime = newTime;
            updateTimeUI(newTime);
            if (typeof lyricsActive !== 'undefined' && lyricsActive && typeof updateLyricsUI === 'function') updateLyricsUI(newTime);
            updateMediaSessionPosition(newTime, dur);
        });
    }
