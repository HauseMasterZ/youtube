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
    const SILENT_WAV_DATA_URI = "data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";
    let liveAudioDestination = null;
    let liveAudioOscillator = null;
    let liveAudioGain = null;
    let anchorStartTimer = null;
    let _isInternalAnchorStart = false;
    let _isInternalAnchorStop = false;

    function _setupAnchorAutoResume(anchorEl) {
        if (!anchorEl || anchorEl._boundAutoResume) return;
        anchorEl._boundAutoResume = true;
        anchorEl.addEventListener("play", () => {
            console.log("[ANCHOR-PLAY] anchor played! _isInternalAnchorStart:", _isInternalAnchorStart, "wasPausedByUser:", window.wasPausedByUser, "wasPlayingBeforeCall:", window.wasPlayingBeforeCall);
            if (!_isInternalAnchorStart && !window.wasPausedByUser && window.wasPlayingBeforeCall && typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.paused && !audioPlayer.switching) {
                console.log("[ANCHOR-PLAY] Native OS focus regain detected after call! Auto-resuming audioPlayer!");
                stopLiveAudioAnchor();
                cancelAutoKillWatchdog();
                audioPlayer.play().catch(e => console.warn("Anchor auto-resume error:", e));
            }
        });
        anchorEl.addEventListener("pause", () => {
            console.log("[ANCHOR-PAUSE] anchorEl paused! _isInternalAnchorStop:", _isInternalAnchorStop, "mode:", window.playbackMode, "audioPaused:", (typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.paused));
            if (!_isInternalAnchorStop && window.playbackMode === 'mode2' && typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.paused) {
                if (anchorStartTimer) {
                    clearTimeout(anchorStartTimer);
                    anchorStartTimer = null;
                }
                if (!window.isCallActive && typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                    navigator.mediaSession.playbackState = (typeof window.declaredPausedState === 'function')
                        ? window.declaredPausedState() : 'playing';
                    const dur = (typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.duration) || (typeof seekBar !== 'undefined' && parseFloat(seekBar.max)) || 0;
                    const pos = (typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.currentTime) || 0;
                    updateMediaSessionPosition(pos, dur, 1.0);
                }
                stopLiveAudioAnchor();
                cancelAutoKillWatchdog();
            }
        });
    }

    function initLiveAudioAnchor() {
        if (liveAudioContext) {
            if (liveAudioContext.state === 'suspended') {
                liveAudioContext.resume().catch(() => {});
            }
            const anchorEl = document.getElementById("live-stream-anchor");
            if (anchorEl) {
                _setupAnchorAutoResume(anchorEl);
                anchorEl.loop = true;
                if (!anchorEl.src || !anchorEl.src.startsWith("data:")) {
                    anchorEl.src = SILENT_WAV_DATA_URI;
                }
                if (liveAudioDestination && liveAudioDestination.stream && !anchorEl.srcObject) {
                    anchorEl.srcObject = liveAudioDestination.stream;
                }
                if (anchorEl.paused) {
                    _isInternalAnchorStart = true;
                    anchorEl.play().then(() => {
                        setTimeout(() => { _isInternalAnchorStart = false; }, 200);
                        if (window.playbackMode !== 'mode2' || (typeof audioPlayer !== 'undefined' && audioPlayer && !audioPlayer.paused)) {
                            _isInternalAnchorStop = true;
                            anchorEl.pause();
                            _isInternalAnchorStop = false;
                        }
                    }).catch(() => { _isInternalAnchorStart = false; });
                }
            }
            return liveAudioContext;
        }
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;

        try {
            liveAudioContext = new AudioCtx();
            if (liveAudioContext.state === 'suspended') {
                liveAudioContext.resume().catch(() => {});
            }
            liveAudioContext.onstatechange = () => {
                if (window.playbackMode === 'mode2' && typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.paused) {
                    if (liveAudioContext && (liveAudioContext.state === 'suspended' || liveAudioContext.state === 'interrupted')) {
                        if (!window.isCallActive && typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                            navigator.mediaSession.playbackState = (typeof window.declaredPausedState === 'function')
                                ? window.declaredPausedState() : 'playing';
                            const dur = (typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.duration) || (typeof seekBar !== 'undefined' && parseFloat(seekBar.max)) || 0;
                            const pos = (typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.currentTime) || 0;
                            updateMediaSessionPosition(pos, dur, 1.0);
                            stopLiveAudioAnchor();
                            cancelAutoKillWatchdog();
                        }
                    }
                }
            };
            liveAudioDestination = liveAudioContext.createMediaStreamDestination();
            liveAudioOscillator = liveAudioContext.createOscillator();
            liveAudioGain = liveAudioContext.createGain();

            liveAudioGain.gain.value = 0;
            liveAudioOscillator.connect(liveAudioGain);
            liveAudioGain.connect(liveAudioDestination);
            liveAudioOscillator.start();

            const anchorEl = document.getElementById("live-stream-anchor");
            if (anchorEl && liveAudioDestination && liveAudioDestination.stream) {
                anchorEl.loop = true;
                if (!anchorEl.src || !anchorEl.src.startsWith("data:")) {
                    anchorEl.src = SILENT_WAV_DATA_URI;
                }
                anchorEl.srcObject = liveAudioDestination.stream;
                if (anchorEl.paused) {
                    _isInternalAnchorStart = true;
                    anchorEl.play().then(() => {
                        setTimeout(() => { _isInternalAnchorStart = false; }, 200);
                        if (window.playbackMode !== 'mode2' || (typeof audioPlayer !== 'undefined' && audioPlayer && !audioPlayer.paused)) {
                            _isInternalAnchorStop = true;
                            anchorEl.pause();
                            _isInternalAnchorStop = false;
                        }
                    }).catch(() => { _isInternalAnchorStart = false; });
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
        if (window.mediaSessionDestroyed) return;
        initLiveAudioAnchor();
        if (liveAudioContext && liveAudioContext.state === 'suspended') {
            liveAudioContext.resume().catch(() => {});
        }
        const anchorEl = document.getElementById("live-stream-anchor");
        if (anchorEl) {
            _setupAnchorAutoResume(anchorEl);
            anchorEl.loop = true;
            if (!anchorEl.src || !anchorEl.src.startsWith("data:")) {
                anchorEl.src = SILENT_WAV_DATA_URI;
            }
            if (!anchorEl.srcObject && liveAudioDestination && liveAudioDestination.stream) {
                anchorEl.srcObject = liveAudioDestination.stream;
            }
            // Idempotent: never re-enter play() on a running anchor (resets the
            // detector guard window and risks focus churn).
            if (anchorEl.paused) {
                _isInternalAnchorStart = true;
                anchorEl.play().then(() => {
                    setTimeout(() => { _isInternalAnchorStart = false; }, 200);
                }).catch(e => {
                    _isInternalAnchorStart = false;
                    console.warn("Live anchor play error:", e);
                });
            }
        }
    }

    function stopLiveAudioAnchor() {
        if (anchorStartTimer) {
            clearTimeout(anchorStartTimer);
            anchorStartTimer = null;
        }
        const anchorEl = document.getElementById("live-stream-anchor");
        if (anchorEl && !anchorEl.paused) {
            try {
                _isInternalAnchorStop = true;
                anchorEl.pause();
            } catch (e) {} finally {
                _isInternalAnchorStop = false;
            }
        }
    }

    function teardownLiveAudioAnchor() {
        const anchorEl = document.getElementById("live-stream-anchor");
        if (anchorEl) {
            try {
                _isInternalAnchorStop = true;
                anchorEl.pause();
                anchorEl.srcObject = null;
                anchorEl.removeAttribute('src');
            } catch (e) {} finally {
                _isInternalAnchorStop = false;
            }
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

    // Focus Probe: silent WAV loop that the OS power manager suspends on
    // audio-focus steals (YouTube) AND on idle battery-saving. A suspend
    // while music-paused in Mode 2 is our only steal signal for the
    // already-paused case (occasion 4), which fires zero other events.
    // PIN ABSOLUTISM: this handler must NEVER write playbackState. Any
    // honest drop strips the card on this device, no exceptions. It only
    // logs (field diagnostics) and arms the watchdog if idle, so an
    // abandoned session still auto-cleans.
    let focusProbePrimed = false;
    let _isProbeInternal = false;

    function primeFocusProbe() {
        const probeEl = document.getElementById("focus-probe");
        if (!probeEl || focusProbePrimed) return;
        if (!probeEl.src) {
            probeEl.src = SILENT_WAV_DATA_URI;
        }
        probeEl.loop = true;
        _isProbeInternal = true;
        probeEl.play().then(() => {
            try { probeEl.pause(); } catch (e) {}
            focusProbePrimed = true;
            setTimeout(() => { _isProbeInternal = false; }, 200);
        }).catch(() => { _isProbeInternal = false; });
    }

    function startFocusProbe() {
        if (typeof isMobileDevice !== 'undefined' && !isMobileDevice) return;
        if (window.playbackMode !== 'mode2') return;
        if (window.isCallActive) return;
        const probeEl = document.getElementById("focus-probe");
        if (!probeEl) return;
        if (!probeEl.src) {
            probeEl.src = SILENT_WAV_DATA_URI;
        }
        probeEl.loop = true;
        if (probeEl.paused) {
            _isProbeInternal = true;
            probeEl.play().then(() => {
                setTimeout(() => { _isProbeInternal = false; }, 200);
            }).catch(() => { _isProbeInternal = false; });
        }
    }

    function stopFocusProbe() {
        const probeEl = document.getElementById("focus-probe");
        if (probeEl && !probeEl.paused) {
            try {
                _isProbeInternal = true;
                probeEl.pause();
            } catch (e) {} finally {
                setTimeout(() => { _isProbeInternal = false; }, 200);
            }
        }
    }

    window.primeFocusProbe = primeFocusProbe;
    window.startFocusProbe = startFocusProbe;
    window.stopFocusProbe = stopFocusProbe;

    (function bindFocusProbeHandler() {
        const probeEl = document.getElementById("focus-probe");
        if (!probeEl || probeEl._boundFocusProbe) return;
        probeEl._boundFocusProbe = true;
        probeEl.addEventListener("pause", () => {
            const isRecentBtDisconnect = (typeof window.lastBtDisconnectTime === 'number' && Date.now() - window.lastBtDisconnectTime < 2500);
            if (!_isProbeInternal && window.playbackMode === 'mode2' && typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.paused && !window.isCallActive && !isRecentBtDisconnect) {
                // Steal-or-idle suspend observed. Deliberately NO state write:
                // Mode 2 declares 'playing' unconditionally (pin absolutism).
                // Log only, so field diagnostics can see steal moments.
                console.log("[PROBE-SUSPEND] focus probe suspended while paused in Mode 2 (steal or idle)");
                if (window.btSleepTimer === null && typeof armAutoKillWatchdog === 'function') {
                    armAutoKillWatchdog();
                }
            }
        });
    })();

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
            window.mediaSessionDestroyed = true;
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
        window.mediaSessionDestroyed = false;
        lastAudioPlayerPauseTime = Date.now() - 1000;
        if (anchorStartTimer) {
            clearTimeout(anchorStartTimer);
            anchorStartTimer = null;
        }

        if (newMode === 'mode2' && typeof initLiveAudioAnchor === 'function') {
            initLiveAudioAnchor();
            if (liveAudioContext && liveAudioContext.state === 'suspended') {
                liveAudioContext.resume().catch(() => {});
            }
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
            // Always-on anchor: start whether playing or paused (we hold focus
            // either way, so no yank possible); paused additionally primes the
            // probe, spoofs state, and arms the watchdog.
            startLiveAudioAnchor();
            if (isPaused) {
                if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                    // Doctrine: spoof on entry (helper reads the just-set mode)
                    navigator.mediaSession.playbackState = (typeof window.declaredPausedState === 'function')
                        ? window.declaredPausedState() : 'playing';
                }
                    startLiveAudioAnchor();
                    if (typeof primeFocusProbe === 'function') primeFocusProbe();
                    if (typeof startFocusProbe === 'function') startFocusProbe();
                    armAutoKillWatchdog();
            }
        } else {
            teardownLiveAudioAnchor();
            cancelAutoKillWatchdog();
            if (typeof stopFocusProbe === 'function') stopFocusProbe();
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
                updateMediaSessionPosition(pos, dur, 1.0);
                if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                    navigator.mediaSession.playbackState = (typeof window.declaredPausedState === 'function')
                        ? window.declaredPausedState() : 'paused';
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
                if (isPaused && (typeof window.playbackMode !== 'undefined' && window.playbackMode === 'mode2')) {
                    // Spoofed pause: OS advances the card seekbar by rate while
                    // state reads 'playing', so freeze it with a near-zero rate
                    // (0 is rejected by setPositionState; hence the micro-rate).
                    // Scoped strictly to mode2-paused; all other paths below.
                    rate = 0.00001;
                } else if (isForcedRateValid && forcedRate > 0) {
                    rate = forcedRate;
                } else if (navigator.mediaSession.playbackState === 'paused' || isPaused) {
                    rate = 1.0;
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

    // Re-publish the stored song info as a fresh object so the notification
    // card returns even if the browser dismissed the previous session
    // (e.g. long call with a frozen page: first code that runs re-announces).
    function republishMediaMetadata() {
        if (typeof hasMediaSession !== 'undefined' && hasMediaSession && navigator.mediaSession) {
            try {
                const current = navigator.mediaSession.metadata;
                if (current) {
                    navigator.mediaSession.metadata = new MediaMetadata({
                        title: current.title,
                        artist: current.artist,
                        album: current.album,
                        artwork: current.artwork
                    });
                }
            } catch (e) {}
        }
    }
    window.republishMediaMetadata = republishMediaMetadata;

    // BT disconnect detection: track device changes to prevent speaker bleed
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
                    console.log("[DEVICECHANGE] isCallActive:", window.isCallActive, "newCount:", newCount, "known:", knownOutputCount, "paused:", (audioPlayer && audioPlayer.paused), "wasPausedByUser:", window.wasPausedByUser, "wasPlayingBeforeCall:", window.wasPlayingBeforeCall);
                    if (window.isCallActive) {
                        window.isCallActive = false;
                        window.lastCallEndTime = Date.now();
                        if (window.wasPlayingBeforeCall && !window.wasPausedByUser && typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.paused && !audioPlayer.switching) {
                            // Single deferred resume: let telecom -> media routing settle before opening the stream (no dual-fire pop)
                            setTimeout(() => {
                                if (!window.isCallActive && window.wasPlayingBeforeCall && !window.wasPausedByUser && audioPlayer && audioPlayer.paused) {
                                    audioPlayer.play().catch(() => {});
                                }
                            }, 150);
                            if (typeof republishMediaMetadata === 'function') republishMediaMetadata();
                        } else if (typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.paused && !audioPlayer.switching) {
                            // Staying paused after hangup (occasion 2): the call-start
                            // path stopped the anchor, so re-arm keepalive here or
                            // Mode 2 silently loses its pin. Zero leak risk: the
                            // anchor is mathematical silence (gain 0). Re-spoof too:
                            // a probe suspend during the call may have honestly
                            // dropped the state mid-call.
                            if (typeof startLiveAudioAnchor === 'function') startLiveAudioAnchor();
                            if (typeof startFocusProbe === 'function') startFocusProbe();
                            if (typeof armAutoKillWatchdog === 'function') armAutoKillWatchdog();
                            if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                                navigator.mediaSession.playbackState = (typeof window.declaredPausedState === 'function')
                                    ? window.declaredPausedState() : 'playing';
                            }
                            if (typeof republishMediaMetadata === 'function') republishMediaMetadata();
                        }
                    } else if (newCount < knownOutputCount || newCount > knownOutputCount) {
                        window.isCallActive = true;
                        window.lastCallStartTime = Date.now();
                        const wasAlreadyExternallyPaused = (typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.paused && !window.wasPausedByUser);
                        const wasPlaying = (typeof audioPlayer !== 'undefined' && audioPlayer && !audioPlayer.paused);
                        if (anchorStartTimer) {
                            clearTimeout(anchorStartTimer);
                            anchorStartTimer = null;
                        }
                        if (typeof audioPlayer !== 'undefined' && audioPlayer) {
                            if (typeof audioPlayer.instantPause === 'function') {
                                audioPlayer.instantPause();
                            } else {
                                audioPlayer.pause();
                            }
                        }
                        if (wasAlreadyExternallyPaused || wasPlaying) {
                            window.wasPausedByUser = false;
                            window.wasPlayingBeforeCall = true;
                        } else {
                            window.lastBtDisconnectTime = Date.now();
                            window.wasPausedByUser = true;
                            window.wasPlayingBeforeCall = false;
                        }
                        stopLiveAudioAnchor();
                        cancelAutoKillWatchdog();
                        if (typeof stopFocusProbe === 'function') stopFocusProbe();
                        if (typeof setPlayUI === 'function') setPlayUI(false);
                        if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                            // Mode 2 doctrine: ALWAYS 'playing' (helper); the spoof
                            // is what pins the card through the call.
                            navigator.mediaSession.playbackState = (typeof window.declaredPausedState === 'function')
                                ? window.declaredPausedState() : 'paused';
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
                                updateMediaSessionPosition(pos, dur, 1.0);
                            }
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
            // Always-on anchor in Mode 2 (idempotent start); Mode 1 stops.
            if (window.playbackMode === 'mode2') {
                if (typeof startLiveAudioAnchor === 'function') startLiveAudioAnchor();
            } else if (typeof stopLiveAudioAnchor === 'function') {
                stopLiveAudioAnchor();
            }
            cancelAutoKillWatchdog();
            if (typeof stopFocusProbe === 'function') stopFocusProbe();
            if (typeof republishMediaMetadata === 'function') republishMediaMetadata();
        });
        audioPlayer.addEventListener('pause', () => {
            lastAudioPlayerPauseTime = Date.now();
            if (anchorStartTimer) {
                clearTimeout(anchorStartTimer);
                anchorStartTimer = null;
            }
            const isRecentBtDisconnect = (typeof window.lastBtDisconnectTime === 'number' && Date.now() - window.lastBtDisconnectTime < 2500);

            if (window.playbackMode === 'mode2' && !window.isCallActive && !isRecentBtDisconnect) {
                if (!window.wasPausedByUser) {
                    // External interruption (video steal while playing): state
                    // STAYS spoofed per doctrine (the pin must survive the
                    // steal). Anchor KEEPS RUNNING ducked (never request focus
                    // mid-steal; starting audio now would yank their video) so
                    // the session retains a live track like the paused case.
                    // Watchdog arms so an abandoned session still auto-cleans.
                    if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                        navigator.mediaSession.playbackState = (typeof window.declaredPausedState === 'function')
                            ? window.declaredPausedState() : 'playing';
                        const dur = (typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.duration) || 0;
                        const pos = (typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.currentTime) || 0;
                        updateMediaSessionPosition(pos, dur, 1.0);
                    }
                    // NOTE: anchor intentionally NOT stopped here. It keeps running
                    // ducked (proven harmless to the stealer in the paused
                    // case); killing it at this exact moment is what evicted
                    // playing-steal cards. Never *start* audio here either.
                    armAutoKillWatchdog();
                    if (typeof startFocusProbe === 'function') startFocusProbe();
                    return;
                }
                // Mode 2 pause: start anchor synchronously to maintain DAC awake.
                // No delayed scheduling: any gap without audio focus lets the
                // browser reclaim the session and strip the notification.
                const isStillBtDisconnect = (typeof window.lastBtDisconnectTime === 'number' && Date.now() - window.lastBtDisconnectTime < 2500);
                if (window.playbackMode === 'mode2' && audioPlayer.paused && !window.isCallActive && !isStillBtDisconnect) {
                    window.mediaSessionDestroyed = false;
                    startLiveAudioAnchor();
                    if (typeof startFocusProbe === 'function') startFocusProbe();
                    armAutoKillWatchdog();
                }
            } else {
                stopLiveAudioAnchor();
                cancelAutoKillWatchdog();
            }
        });
    }

    // Media Session Global Action Handlers (Bound exactly once to prevent CPU overhead on track change)
    // handlePlayAction extracted for testability; registered unconditionally
    // (withdrawing it did not change the post-steal glyph, so it stays).
    function handlePlayAction() {
            console.log("[MS-ACTION] 'play' triggered. isCallActive:", window.isCallActive, "paused:", (audioPlayer && audioPlayer.paused), "wasPausedByUser:", window.wasPausedByUser);
            if (window.isCallActive) return;
            window.mediaSessionDestroyed = false;
            if (typeof window.isPostCallQuarantine === 'function' && window.isPostCallQuarantine()) {
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
            if (typeof updateMediaSessionPosition === 'function') {
                updateMediaSessionPosition(audioPlayer.currentTime, dur, 1.0);
            }
            stopLiveAudioAnchor();
            cancelAutoKillWatchdog();
            const playPromise = audioPlayer.play();
            if (playPromise && playPromise.then) {
                playPromise.then(() => {
                    console.log("[MS-ACTION] 'play' playPromise RESOLVED.");
                }).catch(e => {
                    console.warn("MediaSession play error:", e);
                });
            }
    }
    window.handlePlayAction = handlePlayAction;

    if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
        // m2 66 experiment reverted: withdrawing 'play' did not change the
        // post-steal glyph (SystemUI renders the triangle from session
        // inactivity, not handler presence), and an unhandled triangle risks
        // breaking discrete BT PLAY keys. Triangle taps under spoof stay
        // dropped by Chromium; documented limitation.
        navigator.mediaSession.setActionHandler('play', handlePlayAction);

        navigator.mediaSession.setActionHandler('pause', () => {
            const isActuallyPaused = (typeof audioPlayer !== 'undefined' && audioPlayer && (audioPlayer.paused || window.wasPausedByUser));
            console.log("[MS-ACTION] 'pause' triggered. isCallActive:", window.isCallActive, "isActuallyPaused:", isActuallyPaused, "audioPlayer.paused:", (audioPlayer && audioPlayer.paused), "wasPausedByUser:", window.wasPausedByUser, "mode:", window.playbackMode);
            if (window.isCallActive) return;
            window.mediaSessionDestroyed = false;
            if (window.playbackMode === 'mode2') {
                if (isActuallyPaused) {
                    if (typeof window.isPostCallQuarantine === 'function' && window.isPostCallQuarantine()) {
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
                    if (typeof updateMediaSessionPosition === 'function') {
                        updateMediaSessionPosition(audioPlayer.currentTime, dur, 1.0);
                    }
                    stopLiveAudioAnchor();
                    cancelAutoKillWatchdog();
                    const playPromise = audioPlayer.play();
                    if (playPromise && playPromise.then) {
                        playPromise.then(() => {
                            console.log("[MS-ACTION] 'pause' playPromise RESOLVED.");
                        }).catch(e => {
                            console.warn("MediaSession play error:", e);
                        });
                    }
                } else {
                    window.wasPausedByUser = true;
                    window.wasPlayingBeforeCall = false;
                    if (typeof setPlayUI === 'function') setPlayUI(false);
                    if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                        navigator.mediaSession.playbackState = (typeof window.declaredPausedState === 'function')
                            ? window.declaredPausedState() : 'playing';
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
                    if (typeof window.isPostCallQuarantine === 'function' && window.isPostCallQuarantine()) {
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
                console.log("[MS-ACTION] 'playpause' triggered. isCallActive:", window.isCallActive, "isActuallyPaused:", isActuallyPaused, "audioPlayer.paused:", (audioPlayer && audioPlayer.paused), "wasPausedByUser:", window.wasPausedByUser, "mode:", window.playbackMode);
                if (window.isCallActive) return;
                window.mediaSessionDestroyed = false;
                if (isActuallyPaused) {
                    if (typeof window.isPostCallQuarantine === 'function' && window.isPostCallQuarantine()) {
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
                    if (typeof updateMediaSessionPosition === 'function') {
                        updateMediaSessionPosition(audioPlayer.currentTime, dur, 1.0);
                    }
                    stopLiveAudioAnchor();
                    cancelAutoKillWatchdog();
                    const playPromise = audioPlayer.play();
                    if (playPromise && playPromise.then) {
                        playPromise.then(() => {
                            console.log("[MS-ACTION] 'playpause' playPromise RESOLVED.");
                        }).catch(e => {
                            console.warn("MediaSession playpause error:", e);
                        });
                    }
                } else {
                    window.wasPausedByUser = true;
                    window.wasPlayingBeforeCall = false;
                    if (typeof setPlayUI === 'function') setPlayUI(false);
                    if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                        navigator.mediaSession.playbackState = (typeof window.declaredPausedState === 'function')
                            ? window.declaredPausedState() : 'paused';
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
            // Mode 2 seek-resume: center Play is swallowed by C++ under spoof,
            // so discrete seek buttons double as the guaranteed resume gesture
            // after video steals (both paused/playing occasions). Seekbar
            // scrub (seekto) stays positioning-only by design. No quarantine
            // gate: head-unit blasts emit play/pause keys, never seek keys.
            if (window.playbackMode === 'mode2' && !window.isCallActive && typeof audioPlayer !== 'undefined' && audioPlayer && (audioPlayer.paused || window.wasPausedByUser)) {
                window.mediaSessionDestroyed = false;
                window.wasPausedByUser = false;
                window.wasPlayingBeforeCall = true;
                window.lastBtDisconnectTime = 0;
                if (typeof setPlayUI === 'function') setPlayUI(true);
                if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                    navigator.mediaSession.playbackState = 'playing';
                }
                if (typeof updateMediaSessionPosition === 'function') {
                    updateMediaSessionPosition(newTime, dur, 1.0);
                }
                stopLiveAudioAnchor();
                cancelAutoKillWatchdog();
                audioPlayer.play().catch(e => console.warn("MediaSession seekbackward resume error:", e));
            }
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
            // Mode 2 seek-resume (mirror of seekbackward): guaranteed resume
            // gesture after video steals; seekto stays positioning-only.
            if (window.playbackMode === 'mode2' && !window.isCallActive && typeof audioPlayer !== 'undefined' && audioPlayer && (audioPlayer.paused || window.wasPausedByUser)) {
                window.mediaSessionDestroyed = false;
                window.wasPausedByUser = false;
                window.wasPlayingBeforeCall = true;
                window.lastBtDisconnectTime = 0;
                if (typeof setPlayUI === 'function') setPlayUI(true);
                if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                    navigator.mediaSession.playbackState = 'playing';
                }
                if (typeof updateMediaSessionPosition === 'function') {
                    updateMediaSessionPosition(newTime, dur, 1.0);
                }
                stopLiveAudioAnchor();
                cancelAutoKillWatchdog();
                audioPlayer.play().catch(e => console.warn("MediaSession seekforward resume error:", e));
            }
        });
    }
