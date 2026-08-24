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
            this._pendingSeek = null;
            this._expectedDuration = 0;
            this._streamAbortController = null;
            this._streamId = 0;

            this._pausedAtTime = null;
            this._pauseHoldTimeout = null;
            this._isHoldPaused = false;
            this._audioCtx = null;
            this._sourceNode = null;
            this._gainNode = null;

            this.events = ['play', 'playing', 'pause', 'error', 'loadedmetadata',
                           'timeupdate', 'seeked', 'ratechange', 'progress',
                           'waiting', 'canplay', 'ended', 'durationchange'];

            this.forwardEvent = (e) => {
                if (!this.switching) {
                    if (this._isHoldPaused) {
                        if (e.type === 'timeupdate' || e.type === 'ended') {
                            return;
                        }
                    }
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

        _initAudioContext() {
            if (this._gainNode) return;
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                if (!this._audioCtx) {
                    this._audioCtx = new AudioCtx();
                }
                if (!this._sourceNode) {
                    this._sourceNode = this._audioCtx.createMediaElementSource(this.active);
                    this._gainNode = this._audioCtx.createGain();
                    this._sourceNode.connect(this._gainNode);
                    this._gainNode.connect(this._audioCtx.destination);
                }
            } catch (e) {
                console.warn("WebAudio GainNode init failed:", e);
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
            try {
                this._sourceBuffer.abort();
            } catch (e) {}
            if (this._sourceBuffer.buffered.length > 0) {
                try {
                    const end = this._sourceBuffer.buffered.end(this._sourceBuffer.buffered.length - 1);
                    this._sourceBuffer.remove(0, end + 10);
                    await this._waitForUpdate();
                } catch (e) {
                    console.warn("MSE clear error:", e);
                }
            }
            try {
                this._sourceBuffer.abort();
            } catch (e) {}
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
            if (this._isHoldPaused && this._pausedAtTime !== null) return this._pausedAtTime;
            if (this._pendingSeek !== null) return this._pendingSeek;
            return this.active.currentTime;
        }

        set currentTime(v) {
            try {
                this.lastKnownTime = v;
                if (this._isHoldPaused) {
                    this._pausedAtTime = v;
                }
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
            if (this._isHoldPaused) return true;
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
            this._initAudioContext();
            if (this._audioCtx && this._audioCtx.state === 'suspended') {
                this._audioCtx.resume().catch(() => {});
            }

            if (this._pauseHoldTimeout) {
                clearTimeout(this._pauseHoldTimeout);
                this._pauseHoldTimeout = null;
            }

            if (this._isHoldPaused) {
                this._isHoldPaused = false;
                if (this._pausedAtTime !== null) {
                    try { this.active.currentTime = this._pausedAtTime; } catch (e) {}
                    this._pausedAtTime = null;
                }
            }

            if (this._gainNode) {
                this._gainNode.gain.value = 1.0;
            }

            if (this.active.currentTime < (this.active.duration || Infinity) - 0.5) {
                this._endedFired = false;
            }
            if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                navigator.mediaSession.playbackState = 'playing';
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
            this.instantPause();
            return Promise.resolve();
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

            this._isHoldPaused = true;
            this._pausedAtTime = this.active.currentTime;

            if (this._pauseHoldTimeout) {
                clearTimeout(this._pauseHoldTimeout);
                this._pauseHoldTimeout = null;
            }

            if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                navigator.mediaSession.playbackState = 'paused';
                if (typeof updateMediaSessionPosition === 'function') {
                    updateMediaSessionPosition(this._pausedAtTime, this.duration, 1.0);
                }
            }

            if (this._gainNode) {
                this._gainNode.gain.value = 0;
            }

            // Schedule true teardown / hard pause after 60 seconds of inactivity
            this._pauseHoldTimeout = setTimeout(() => {
                if (this._isHoldPaused) {
                    this._isHoldPaused = false;
                    this.active.pause();
                    if (this._gainNode) {
                        this._gainNode.gain.value = 1.0;
                    }
                    if (this._pausedAtTime !== null) {
                        try { this.active.currentTime = this._pausedAtTime; } catch (e) {}
                    }
                }
            }, 60000);

            this.dispatchEvent(new Event('pause'));
        }

        async switchTrack(url, preventAutoplay, expectedDuration = 0) {
            if (this._pauseHoldTimeout) {
                clearTimeout(this._pauseHoldTimeout);
                this._pauseHoldTimeout = null;
            }
            this._isHoldPaused = false;
            this._pausedAtTime = null;
            if (this._gainNode) {
                this._gainNode.gain.value = 1.0;
            }

            this.switching = true;
            this._endedFired = false;
            this.lastKnownTime = 0;
            this._currentUrl = url || '';
            this._expectedDuration = expectedDuration || 0;

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

                // 1. FAST PATH: If full track is already cached in CacheStorage, load instantly (0ms)
                try {
                    if (window.caches) {
                        const mediaCache = await caches.open('yt-player-media');
                        const cachedRes = await mediaCache.match(url);
                        if (cachedRes && (this._currentUrl === url && this._streamId === activeStreamId)) {
                            const fullBuffer = await cachedRes.arrayBuffer();
                            if (this._currentUrl !== url || this._streamId !== activeStreamId) return Promise.resolve();

                            await this._clearSourceBuffer();
                            if (this._currentUrl !== url || this._streamId !== activeStreamId) return Promise.resolve();

                            try {
                                this._sourceBuffer.abort();
                                this._sourceBuffer.timestampOffset = 0;
                            } catch (e) {}

                            await this._appendToSourceBuffer(fullBuffer);
                            if (this._currentUrl !== url || this._streamId !== activeStreamId) return Promise.resolve();

                            if (this._mediaSource && this._mediaSource.readyState === 'open') {
                                try { this._mediaSource.endOfStream(); } catch (e) {}
                            }


                            if (this._pendingSeek !== null) {
                                const target = this._pendingSeek;
                                this._pendingSeek = null;
                                this.active.currentTime = target;
                            } else {
                                this.active.currentTime = 0;
                            }

                            if (!preventAutoplay) {
                                this.active.play().catch(e => console.warn("Cached play error:", e));
                            }

                            this.switching = false;
                            this.dispatchEvent(new Event('loadedmetadata'));
                            this.dispatchEvent(new Event('canplay'));
                            this.dispatchEvent(new Event('play'));
                            this.dispatchEvent(new Event('playing'));
                            this.dispatchEvent(new Event('progress'));
                            return Promise.resolve();
                        }
                    }
                } catch (e) {
                    console.warn("Cache fast-path fallback:", e);
                }

                // 2. NETWORK PATH: Stream uncached audio with optimized ~192KB safety cushion (~12s audio) & resilient auto-recovery
                try {
                    let totalBytesAppended = 0;
                    let streamDone = false;

                    const response = await fetch(url, { signal: currentAbortSignal });
                    if (!response.ok) throw new Error(`Fetch status: ${response.status}`);
                    if (!response.body) throw new Error("ReadableStream not supported");

                    const reader = response.body.getReader();

                    const initialChunks = [];
                    let initialBytes = 0;
                    const INITIAL_TARGET_BYTES = 196608; // 192KB (~12s Opus, ultra fast initial start)

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

                    try {
                        this._sourceBuffer.abort();
                        this._sourceBuffer.timestampOffset = 0;
                    } catch (e) {}
                    await this._appendToSourceBuffer(initialCombined.buffer);
                    totalBytesAppended += initialCombined.byteLength;

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

                    // Resilient background ingestion stream with network-switch / Range auto-recovery
                    (async () => {
                        const readStream = async (activeReader) => {
                            try {
                                while (true) {
                                    if (this._currentUrl !== url || this._streamId !== activeStreamId || currentAbortSignal.aborted) {
                                        try { activeReader.cancel(); } catch (e) {}
                                        break;
                                    }

                                    const { value: nextChunk, done } = await activeReader.read();

                                    if (this._currentUrl !== url || this._streamId !== activeStreamId || currentAbortSignal.aborted) {
                                        try { activeReader.cancel(); } catch (e) {}
                                        break;
                                    }

                                    if (done) {
                                        streamDone = true;
                                        if (this._mediaSource && this._mediaSource.readyState === 'open') {
                                            try { this._mediaSource.endOfStream(); } catch (e) {}
                                        }
                                        break;
                                    }

                                    if (nextChunk && nextChunk.length > 0) {
                                        totalBytesAppended += nextChunk.length;
                                        await this._appendToSourceBuffer(nextChunk);
                                        this.dispatchEvent(new Event('progress'));

                                        // Auto-resume playback if paused/stalled due to buffer exhaustion
                                        if (!window.wasPausedByUser && this.active.paused && this._pendingSeek === null) {
                                            this.active.play().catch(() => {});
                                        }

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
                                if (!currentAbortSignal.aborted && this._streamId === activeStreamId && !streamDone) {
                                    console.warn("Background MSE stream interrupted (network switch). Triggering recovery...");
                                    attemptRecovery();
                                }
                            }
                        };

                        let isRecovering = false;
                        const attemptRecovery = async () => {
                            if (isRecovering || streamDone || currentAbortSignal.aborted || this._currentUrl !== url || this._streamId !== activeStreamId) return;
                            isRecovering = true;

                            let backoff = 300;
                            while (!streamDone && !currentAbortSignal.aborted && this._currentUrl === url && this._streamId === activeStreamId) {
                                try {
                                    const resumeUrl = url.includes('?') ? `${url}&bypass=true` : `${url}?bypass=true`;
                                    const resumeRes = await fetch(resumeUrl, {
                                        headers: { 'Range': `bytes=${totalBytesAppended}-` },
                                        signal: currentAbortSignal
                                    });

                                    if (this._currentUrl !== url || this._streamId !== activeStreamId || currentAbortSignal.aborted) return;

                                    if (resumeRes.ok || resumeRes.status === 206) {
                                        const isPartial = resumeRes.status === 206;
                                        const newReader = resumeRes.body.getReader();

                                        if (isPartial) {
                                            isRecovering = false;
                                            await readStream(newReader);
                                            return;
                                        } else {
                                            // Fallback if CDN/server ignored Range header: discard leading totalBytesAppended bytes
                                            let skipped = 0;
                                            let skipFailed = false;
                                            while (skipped < totalBytesAppended) {
                                                const { value: sChunk, done: sDone } = await newReader.read();
                                                if (sDone || this._currentUrl !== url || this._streamId !== activeStreamId || currentAbortSignal.aborted) {
                                                    try { newReader.cancel(); } catch (e) {}
                                                    skipFailed = true;
                                                    break;
                                                }
                                                if (sChunk) skipped += sChunk.length;
                                            }
                                            if (!skipFailed) {
                                                isRecovering = false;
                                                await readStream(newReader);
                                                return;
                                            }
                                        }
                                    }
                                } catch (recErr) {
                                    // Connection still transitioning, wait and retry
                                }

                                await new Promise(r => setTimeout(r, backoff));
                                backoff = Math.min(backoff * 1.5, 3000);
                            }
                            isRecovering = false;
                        };

                        const onOnlineResume = () => {
                            if (!streamDone && !currentAbortSignal.aborted && this._currentUrl === url && this._streamId === activeStreamId) {
                                attemptRecovery();
                            }
                        };

                        window.addEventListener('online', onOnlineResume);
                        currentAbortSignal.addEventListener('abort', () => {
                            window.removeEventListener('online', onOnlineResume);
                        });

                        if (streamDone) {
                            if (this._mediaSource && this._mediaSource.readyState === 'open') {
                                try { this._mediaSource.endOfStream(); } catch (e) {}
                            }
                        } else {
                            readStream(reader);
                        }
                    })();
                } catch (e) {
                    if (!currentAbortSignal.aborted && this._streamId === activeStreamId) {
                        console.warn("MSE switchTrack error:", e);
                        this.switching = false;
                        this.dispatchEvent(new Event('error'));
                    }
                }
            } else {
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
    const thumbToggleHint = document.getElementById("thumb-toggle-hint");
    
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
