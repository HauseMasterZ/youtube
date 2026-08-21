    const playlistSelect = document.getElementById("playlist-select");
    const searchInput = document.getElementById("search-input");
    const playlistContainer = document.getElementById("playlist-container");
    const playlistMessage = document.getElementById("playlist-message");
    const trackList = document.getElementById("track-list");

    class DualAudioPingPong extends EventTarget {
        constructor() {
            super();
            this.active = document.getElementById("audio-player-1");
            this.switching = false;
            this._endedFired = false;
            this.lastKnownTime = 0;
            this._currentUrl = '';
            this._mseEnabled = false;
            this._audioCtx = null;
            this._gainNode = null;
            this._mediaElementSource = null;
            this._pendingSeek = null;
            this._expectedDuration = 0;
            this._streamAbortController = null;
            this._streamId = 0;

            this.events = ['play', 'playing', 'pause', 'error', 'loadedmetadata',
                           'timeupdate', 'seeked', 'ratechange', 'progress',
                           'waiting', 'canplay', 'ended', 'durationchange'];

            this.forwardEvent = (e) => {
                if (!this.switching) {
                    if (e.type === 'timeupdate') {
                        if (this._pendingSeek !== null) return;
                        const ct = this.active.currentTime;
                        const dur = this.active.duration;
                        if (dur > 0 && ct < dur - 1.0) {
                            this._endedFired = false;
                        }
                        if (dur > 0 && this.lastKnownTime > 0 && !this.active.seeking) {
                            if (!this._endedFired && ct >= dur - 0.25) {
                                this._endedFired = true;
                                this.dispatchEvent(new Event('ended'));
                                return;
                            }
                        }
                        this.lastKnownTime = ct;
                    }
                    if (e.type === 'ended') {
                        if (!this._endedFired) {
                            this._endedFired = true;
                            this.dispatchEvent(new Event('ended'));
                            return;
                        }
                        return;
                    }
                    this.dispatchEvent(new Event(e.type));
                }
            };
            this.events.forEach(evt => {
                this.active.addEventListener(evt, this.forwardEvent);
            });

            this._initMSE();
        }

        _initAudioGraph() {
            if (this._audioCtx || (typeof isMobileDevice !== 'undefined' && isMobileDevice)) return;
            try {
                const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
                if (AudioCtxClass) {
                    this._audioCtx = new AudioCtxClass();
                    this._mediaElementSource = this._audioCtx.createMediaElementSource(this.active);
                    this._gainNode = this._audioCtx.createGain();
                    this._gainNode.gain.value = 1.0;
                    this._mediaElementSource.connect(this._gainNode);
                    this._gainNode.connect(this._audioCtx.destination);
                }
            } catch (e) {
                console.warn("AudioGraph init note:", e);
            }
        }

        _initMSE() {
            const mime = 'audio/webm; codecs="opus"';
            if ('MediaSource' in window && MediaSource.isTypeSupported(mime)) {
                try {
                    this._mediaSource = new MediaSource();
                    this._sourceBuffer = null;
                    this._mseReady = new Promise(resolve => {
                        this._mediaSource.addEventListener('sourceopen', () => {
                            try {
                                if (!this._sourceBuffer) {
                                    this._sourceBuffer = this._mediaSource.addSourceBuffer(mime);
                                    this._sourceBuffer.mode = 'segments';
                                }
                                this._mseEnabled = true;
                                resolve();
                            } catch (e) {
                                console.warn("MSE addSourceBuffer error:", e);
                                this._mseEnabled = false;
                                resolve();
                            }
                        }, { once: true });
                    });
                    this.active.src = URL.createObjectURL(this._mediaSource);
                } catch (e) {
                    console.warn("MSE init failed:", e);
                    this._mseEnabled = false;
                }
            }
        }

        _waitForUpdate() {
            if (!this._sourceBuffer || !this._sourceBuffer.updating) return Promise.resolve();
            return new Promise(resolve => {
                this._sourceBuffer.addEventListener('updateend', resolve, { once: true });
            });
        }

        async _clearSourceBuffer() {
            if (!this._sourceBuffer) return;
            await this._waitForUpdate();
            if (this._sourceBuffer.buffered.length > 0) {
                try {
                    const end = this._sourceBuffer.buffered.end(this._sourceBuffer.buffered.length - 1);
                    this._sourceBuffer.remove(0, end + 10);
                    await this._waitForUpdate();
                } catch (e) {
                    console.warn("MSE clear error:", e);
                }
            }
        }

        async _appendToSourceBuffer(arrayBuffer) {
            if (!this._sourceBuffer) return;
            await this._waitForUpdate();
            return new Promise((resolve, reject) => {
                const onUpdateEnd = () => {
                    this._sourceBuffer.removeEventListener('updateend', onUpdateEnd);
                    this._sourceBuffer.removeEventListener('error', onError);
                    resolve();
                };
                const onError = (e) => {
                    this._sourceBuffer.removeEventListener('updateend', onUpdateEnd);
                    this._sourceBuffer.removeEventListener('error', onError);
                    reject(e);
                };
                this._sourceBuffer.addEventListener('updateend', onUpdateEnd);
                this._sourceBuffer.addEventListener('error', onError);
                try {
                    this._sourceBuffer.appendBuffer(arrayBuffer);
                } catch (e) {
                    onError(e);
                }
            });
        }

        get currentTime() {
            if (this._pendingSeek !== null) return this._pendingSeek;
            return this.active.currentTime;
        }

        set currentTime(v) {
            try {
                this.lastKnownTime = v;
                if (v < (this.active.duration || Infinity) - 0.5) {
                    this._endedFired = false;
                }

                if (this._mseEnabled) {
                    if (this.switching || !this._sourceBuffer || this._sourceBuffer.buffered.length === 0) {
                        this._pendingSeek = v;
                        this.active.pause();
                        this.dispatchEvent(new Event('timeupdate'));
                        return;
                    }

                    const buffEnd = this._sourceBuffer.buffered.end(this._sourceBuffer.buffered.length - 1);
                    if (v > buffEnd + 0.5) {
                        this._pendingSeek = v;
                        this.active.pause();
                        this.dispatchEvent(new Event('timeupdate'));
                        return;
                    }
                }

                this._pendingSeek = null;
                this.active.currentTime = v;
            } catch (e) {
                this._pendingSeek = v;
            }
        }

        get readyState() { return this.active.readyState; }
        get duration() {
            if (this._mseEnabled && this._mediaSource && this._mediaSource.readyState === 'open' && this._expectedDuration > 0) {
                return this._expectedDuration;
            }
            return this.active.duration || this._expectedDuration || 0;
        }
        get paused() {
            if (this._pendingSeek !== null) return false;
            return this.active.paused;
        }
        get playbackRate() { return this.active.playbackRate; }
        set playbackRate(v) { this.active.playbackRate = v; }
        get src() { return this._currentUrl || this.active.src; }
        set src(v) { this._currentUrl = v; }
        get muted() { return this.active.muted; }
        set muted(v) { this.active.muted = v; }
        get buffered() {
            if (this._mseEnabled && this._sourceBuffer) return this._sourceBuffer.buffered;
            return this.active.buffered;
        }

        play() {
            window.wasPausedByUser = false;
            if (this.active.currentTime < (this.active.duration || Infinity) - 0.5) {
                this._endedFired = false;
            }
            this._initAudioGraph();
            if (this._audioCtx && this._audioCtx.state === 'suspended') {
                this._audioCtx.resume();
            }
            if (this._gainNode) {
                this._gainNode.gain.value = 1.0;
            }
            if (this.fadeInterval) {
                clearInterval(this.fadeInterval);
                this.fadeInterval = null;
                this.active.volume = 1.0;
            }
            this.active.muted = false;
            if (this._pendingSeek !== null) {
                return Promise.resolve();
            }
            return this.active.play();
        }

        recoverTrack(url) {
            this.switchTrack(url, false, this._expectedDuration);
        }

        pause() {
            window.wasPausedByUser = true;
            if (this.active.paused || this.fadeInterval) return Promise.resolve();
            if (document.hidden) {
                this.active.pause();
                this.active.volume = 1.0;
                return Promise.resolve();
            }
            return new Promise(resolve => {
                let currentVol = this._gainNode ? this._gainNode.gain.value : this.active.volume;
                const step = currentVol / 10;
                this.fadeInterval = setInterval(() => {
                    currentVol -= step;
                    if (currentVol > 0) {
                        if (this._gainNode) this._gainNode.gain.value = currentVol;
                        else this.active.volume = currentVol;
                    } else {
                        clearInterval(this.fadeInterval);
                        this.fadeInterval = null;
                        this.active.pause();
                        if (this._gainNode) this._gainNode.gain.value = 1.0;
                        this.active.volume = 1.0;
                        resolve();
                    }
                }, 5);
            });
        }

        load() { return this.active.load(); }
        removeAttribute(attr) { if (attr === 'src') { this._currentUrl = ''; } }
        getAttribute(attr) { if (attr === 'src') { return this._currentUrl || null; } return null; }
        fastSeek(t) { if ('fastSeek' in this.active) this.active.fastSeek(t); else this.currentTime = t; }
        addEventListener(type, listener) { super.addEventListener(type, listener); }
        removeEventListener(type, listener) { super.removeEventListener(type, listener); }

        instantPause() {
            window.wasPausedByUser = true;
            if (this.fadeInterval) {
                clearInterval(this.fadeInterval);
                this.fadeInterval = null;
            }
            this.active.pause();
            if (this._gainNode) this._gainNode.gain.value = 1.0;
            this.active.volume = 1.0;
        }

        async switchTrack(url, preventAutoplay, expectedDuration = 0) {
            this.switching = true;
            this._endedFired = false;
            this.lastKnownTime = 0;
            this._currentUrl = url || '';
            this._expectedDuration = expectedDuration || 0;

            this._initAudioGraph();
            if (this._audioCtx && this._audioCtx.state === 'suspended') {
                this._audioCtx.resume();
            }

            if (this._gainNode) {
                this._gainNode.gain.value = 0;
            }

            this.active.pause();

            try {
                this.active.currentTime = 0;
            } catch (e) {}

            if (typeof updateMediaSessionPosition === 'function') {
                updateMediaSessionPosition();
            }

            if (typeof updateBufferProgress === 'function') updateBufferProgress();
            else {
                const bc = document.getElementById("buffer-container");
                if (bc) bc.innerHTML = '';
            }

            if (!url) {
                this.switching = false;
                return Promise.resolve();
            }

            if (this._mseReady) {
                await this._mseReady;
            }

            if (this._mseEnabled && this._sourceBuffer) {
                if (this._mediaSource && this._mediaSource.readyState === 'open' && this._expectedDuration > 0) {
                    try { this._mediaSource.duration = this._expectedDuration; } catch (e) {}
                }

                if (!preventAutoplay && typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                    navigator.mediaSession.playbackState = "playing";
                }

                if (this._streamAbortController) {
                    try { this._streamAbortController.abort(); } catch (e) {}
                }
                this._streamAbortController = new AbortController();
                const currentAbortSignal = this._streamAbortController.signal;

                this._streamId = (this._streamId || 0) + 1;
                const activeStreamId = this._streamId;
                this._pendingSeek = null;

                try {
                    const response = await fetch(url, { signal: currentAbortSignal });
                    if (!response.ok) throw new Error(`Fetch status: ${response.status}`);
                    if (!response.body) throw new Error("ReadableStream not supported");

                    const reader = response.body.getReader();

                    // Accumulate initial safety cushion (~768KB / ~40s of audio)
                    // before playback starts to guarantee 0 audio dropouts.
                    const initialChunks = [];
                    let initialBytes = 0;
                    let streamDone = false;
                    const INITIAL_TARGET_BYTES = 786432; // 768KB (~40s Opus)

                    while (initialBytes < INITIAL_TARGET_BYTES && !streamDone) {
                        const { value: chunk, done } = await reader.read();
                        if (this._currentUrl !== url || this._streamId !== activeStreamId || currentAbortSignal.aborted) {
                            try { reader.cancel(); } catch (e) {}
                            this.switching = false;
                            return Promise.resolve();
                        }
                        if (done) {
                            streamDone = true;
                            break;
                        }
                        if (chunk && chunk.length > 0) {
                            initialChunks.push(chunk);
                            initialBytes += chunk.length;
                        }
                    }

                    if (initialChunks.length === 0) throw new Error("Empty audio stream");

                    // Combine initial chunks into a single contiguous Uint8Array to prevent partial block slicing
                    const initialCombined = new Uint8Array(initialBytes);
                    let offset = 0;
                    for (const c of initialChunks) {
                        initialCombined.set(c, offset);
                        offset += c.length;
                    }

                    await this._clearSourceBuffer();
                    if (this._currentUrl !== url || this._streamId !== activeStreamId) {
                        try { reader.cancel(); } catch (e) {}
                        this.switching = false;
                        return Promise.resolve();
                    }

                    this._sourceBuffer.timestampOffset = 0;
                    await this._appendToSourceBuffer(initialCombined.buffer);
                    if (this._currentUrl !== url || this._streamId !== activeStreamId) {
                        try { reader.cancel(); } catch (e) {}
                        this.switching = false;
                        return Promise.resolve();
                    }

                    if (this._gainNode) {
                        this._gainNode.gain.value = 1.0;
                    }

                    if (this._pendingSeek !== null) {
                        const buffEnd = (this._sourceBuffer && this._sourceBuffer.buffered.length > 0) 
                            ? this._sourceBuffer.buffered.end(this._sourceBuffer.buffered.length - 1) 
                            : 0;
                        if (buffEnd >= this._pendingSeek) {
                            const seekTarget = this._pendingSeek;
                            this._pendingSeek = null;
                            this.active.currentTime = seekTarget;
                            if (!preventAutoplay) {
                                this.active.play().catch(e => console.warn("MSE play error:", e));
                            }
                        } else {
                            this.active.pause();
                        }
                    } else {
                        this.active.currentTime = 0;
                        if (!preventAutoplay) {
                            this.active.play().catch(e => console.warn("MSE play error:", e));
                        }
                    }

                    this.switching = false;
                    this.dispatchEvent(new Event('loadedmetadata'));
                    this.dispatchEvent(new Event('canplay'));
                    if (this._pendingSeek === null) {
                        this.dispatchEvent(new Event('play'));
                        this.dispatchEvent(new Event('playing'));
                    }
                    this.dispatchEvent(new Event('progress'));

                    // Single continuous background ingestion stream for remaining chunks
                    (async () => {
                        try {
                            if (streamDone) {
                                if (this._mediaSource && this._mediaSource.readyState === 'open') {
                                    try { this._mediaSource.endOfStream(); } catch (e) {}
                                }
                                return;
                            }

                            while (true) {
                                if (this._currentUrl !== url || this._streamId !== activeStreamId || currentAbortSignal.aborted) {
                                    try { reader.cancel(); } catch (e) {}
                                    break;
                                }

                                const { value: nextChunk, done } = await reader.read();

                                if (this._currentUrl !== url || this._streamId !== activeStreamId || currentAbortSignal.aborted) {
                                    try { reader.cancel(); } catch (e) {}
                                    break;
                                }

                                if (done) {
                                    if (this._mediaSource && this._mediaSource.readyState === 'open') {
                                        try { this._mediaSource.endOfStream(); } catch (e) {}
                                    }
                                    break;
                                }

                                if (nextChunk && nextChunk.length > 0) {
                                    await this._appendToSourceBuffer(nextChunk);
                                    this.dispatchEvent(new Event('progress'));

                                    // Catch-up seek check: If user requested a seek beyond buffer, fulfill it as soon as target is reached
                                    if (this._pendingSeek !== null && this._sourceBuffer && this._sourceBuffer.buffered.length > 0) {
                                        const buffEnd = this._sourceBuffer.buffered.end(this._sourceBuffer.buffered.length - 1);
                                        if (buffEnd >= this._pendingSeek) {
                                            const seekTarget = this._pendingSeek;
                                            this._pendingSeek = null;
                                            this.active.currentTime = seekTarget;
                                            if (!preventAutoplay) {
                                                this.active.play().catch(e => console.warn("Catch-up seek play:", e));
                                                this.dispatchEvent(new Event('play'));
                                                this.dispatchEvent(new Event('playing'));
                                            }
                                            this.dispatchEvent(new Event('seeked'));
                                            this.dispatchEvent(new Event('timeupdate'));
                                        }
                                    }
                                }
                            }
                        } catch (streamErr) {
                            if (!currentAbortSignal.aborted && this._streamId === activeStreamId) {
                                console.warn("Background MSE stream error:", streamErr);
                            }
                        }
                    })();
                } catch (e) {
                    if (!currentAbortSignal.aborted && this._streamId === activeStreamId) {
                        console.warn("MSE switchTrack error:", e);
                        this.switching = false;
                    }
                }
            } else {
                if (this._gainNode) this._gainNode.gain.value = 1.0;
                if (!preventAutoplay) {
                    if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                        navigator.mediaSession.playbackState = "playing";
                    }
                    this.active.src = url;
                    this.active.play().catch(e => console.warn("switchTrack play:", e));
                } else {
                    this.active.src = url;
                    this.active.load();
                }
                this.switching = false;
            }

            return Promise.resolve();
        }
    }
    const audioPlayer = new DualAudioPingPong();

    const currentTitle = document.getElementById("current-title");
    const currentChannel = document.getElementById("current-channel");
    const albumArtContainer = document.getElementById("album-art-container");
    const albumArt = document.getElementById("album-art-image");
    
    const btnPlayPause = document.getElementById("btn-play-pause");
    const iconPlay = document.getElementById("icon-play");
    const iconPause = document.getElementById("icon-pause");
    
    const btnPrev = document.getElementById("btn-prev");
    const btnNext = document.getElementById("btn-next");
    const btnShuffle = document.getElementById("btn-shuffle");
    const iconShuffle = document.getElementById("icon-shuffle");
    const iconShuffleOne = document.getElementById("icon-shuffle-one");
    const btnRepeat = document.getElementById("btn-repeat");
    const iconRepeat = document.getElementById("icon-repeat");
    const iconRepeatOne = document.getElementById("icon-repeat-one");

    const nowPlaying = document.getElementById("now-playing");
    const btnCollapse = document.getElementById("btn-collapse");

    const seekBar = document.getElementById("seek-bar");
    const seekTrack = document.getElementById("seek-track");
    const bufferContainer = document.getElementById("buffer-container");
    const currentTimeDisplay = document.getElementById("current-time");
    const totalTimeDisplay = document.getElementById("total-time");
    
    const lyricsToggleHint = document.getElementById("lyrics-toggle-hint");
    const lyricsContainer = document.getElementById("lyrics-container");
    const lyricsContent = document.getElementById("lyrics-content");
