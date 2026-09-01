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
            this._seekingTo = null;
            this._expectedDuration = 0;
            this._streamAbortController = null;
            this._streamId = 0;
            this._streamDone = false;
            this._isBufferStalled = false;

            this.events = ['play', 'playing', 'pause', 'error', 'loadedmetadata',
                           'timeupdate', 'seeked', 'ratechange', 'progress',
                           'waiting', 'canplay', 'ended', 'durationchange'];

            this.forwardEvent = (e) => {
                if (!this.switching) {
                    if (e.type === 'waiting') {
                        if (!this.active.paused) {
                            this._isBufferStalled = true;
                        }
                    }

                    if (e.type === 'playing' || e.type === 'play' || e.type === 'pause') {
                        this._isBufferStalled = false;
                    }
                    if (e.type === 'timeupdate') {
                        if (this._pendingSeek !== null) return;
                        const ct = this.active.currentTime;
                        const dur = this.active.duration || this._expectedDuration || 0;
                        if (dur > 0 && ct < dur - 1.0) {
                            this._endedFired = false;
                        }

                        // ONLY use demuxed buffer end once the ENTIRE audio stream has finished downloading
                        let effectiveEnd = dur;
                        if (this._streamDone && this._sourceBuffer && this._sourceBuffer.buffered.length > 0) {
                            const buffEnd = this._sourceBuffer.buffered.end(this._sourceBuffer.buffered.length - 1);
                            if (buffEnd > 0) {
                                effectiveEnd = Math.min(dur, buffEnd);
                            }
                        }

                        // Fire 'ended' ONLY when playback reaches the end of the song
                        if (effectiveEnd > 0 && this.lastKnownTime > 0 && !this.active.seeking) {
                            if (!this._endedFired && ct >= effectiveEnd - 0.6) {
                                this._endedFired = true;
                                this.dispatchEvent(new Event('ended'));
                                return;
                            }
                        }
                        this.lastKnownTime = ct;
                    }

                    if (e.type === 'seeked') {
                        this._seekingTo = null;
                    }

                    if (e.type === 'ended') {
                        if (!this._endedFired) {
                            this._endedFired = true;
                            this.dispatchEvent(new Event('ended'));
                            return;
                        }
                        return;
                    }

                    // Fallback: If browser stalls at the end of a COMPLETED stream, trigger auto-advance
                    if (e.type === 'waiting' && this._streamDone && !this._endedFired) {
                        const ct = this.active.currentTime;
                        const dur = this.active.duration || this._expectedDuration || 0;
                        if (dur > 0 && ct >= dur - 1.5) {
                            this._endedFired = true;
                            this.dispatchEvent(new Event('ended'));
                            return;
                        }
                    }

                    this.dispatchEvent(new Event(e.type));
                }
            };
            this.events.forEach(evt => {
                this.active.addEventListener(evt, this.forwardEvent);
            });
        }

        _initMSE() {
            if (this._mseInitialized) return;
            this._mseInitialized = true;
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
            if (this._seekingTo !== null) return this._seekingTo;
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
            this._initMSE();
            window.wasPausedByUser = false;
            if (this.active.currentTime < (this.active.duration || Infinity) - 0.5) {
                this._endedFired = false;
            }
            if (typeof stopLiveAudioAnchor === 'function') {
                stopLiveAudioAnchor();
            }
            if (typeof cancelAutoKillWatchdog === 'function') {
                cancelAutoKillWatchdog();
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
            this._isBufferStalled = false;
            window.wasPausedByUser = true;
            if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                navigator.mediaSession.playbackState = (window.playbackMode === 'mode2') ? 'playing' : 'paused';
            }
            if (this.active.paused || this.fadeInterval) return Promise.resolve();
            if (document.hidden) {
                this.active.pause();
                this.active.volume = 1.0;
                return Promise.resolve();
            }
            return new Promise(resolve => {
                let currentVol = this.active.volume;
                const step = currentVol / 10;
                this.fadeInterval = setInterval(() => {
                    currentVol -= step;
                    if (currentVol > 0) {
                        this.active.volume = currentVol;
                    } else {
                        clearInterval(this.fadeInterval);
                        this.fadeInterval = null;
                        this.active.pause();
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
            this._pendingSeek = null;
            this._isBufferStalled = false;
            window.wasPausedByUser = true;
            if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                navigator.mediaSession.playbackState = (window.playbackMode === 'mode2') ? 'playing' : 'paused';
            }
            if (this.fadeInterval) {
                clearInterval(this.fadeInterval);
                this.fadeInterval = null;
            }
            this.active.pause();
            this.active.volume = 1.0;
        }

        async switchTrack(url, preventAutoplay, expectedDuration = 0) {
            this._initMSE();
            this.switching = true;
            this._endedFired = false;
            this._streamDone = false;
            this._isBufferStalled = false;
            this.lastKnownTime = 0;
            this._currentUrl = url || '';
            this._expectedDuration = expectedDuration || 0;

            // Stop old playhead immediately before clearing buffer
            this.active.pause();
            try {
                this.active.currentTime = 0;
            } catch (e) {}

            if (typeof updateMediaSessionPosition === 'function') {
                updateMediaSessionPosition(0, expectedDuration || 0);
            }

            const bc = document.getElementById("buffer-container");
            if (bc) bc.innerHTML = '';
            if (typeof lastBufferSignature !== 'undefined') lastBufferSignature = 'empty';
            if (typeof updateBufferProgress === 'function') updateBufferProgress();

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

                if (this._mseEnabled && this._sourceBuffer) {
                    await this._clearSourceBuffer();
                    if (this._currentUrl !== url || this._streamId !== activeStreamId || currentAbortSignal.aborted) {
                        this.switching = false;
                        return Promise.resolve();
                    }
                }

                // 1. FAST PATH / PARTIAL RESUME: If full or partial track is cached in CacheStorage, load instantly (0ms)
                let cachedPartialBytes = 0;
                let cachedArrayBuffer = null;

                try {
                    if (window.caches) {
                        const mediaCache = await caches.open('yt-player-media');
                        const cachedRes = await mediaCache.match(url);
                        if (cachedRes && (this._currentUrl === url && this._streamId === activeStreamId)) {
                            const isPartial = cachedRes.status === 206 || cachedRes.headers.get('X-Partial-Cached') === 'true';
                            cachedArrayBuffer = await cachedRes.arrayBuffer();
                            cachedPartialBytes = cachedArrayBuffer ? cachedArrayBuffer.byteLength : 0;

                            if (this._currentUrl !== url || this._streamId !== activeStreamId) return Promise.resolve();

                            if (cachedPartialBytes > 0) {
                                await this._clearSourceBuffer();
                                if (this._currentUrl !== url || this._streamId !== activeStreamId) return Promise.resolve();

                                try {
                                    this._sourceBuffer.abort();
                                    this._sourceBuffer.timestampOffset = 0;
                                } catch (e) {}

                                await this._appendToSourceBuffer(cachedArrayBuffer);
                                if (this._currentUrl !== url || this._streamId !== activeStreamId) return Promise.resolve();

                                // Unlock switching flag immediately so the buffer bar can render the cached portion in 0ms
                                this.switching = false;
                                this.dispatchEvent(new Event('loadedmetadata'));
                                this.dispatchEvent(new Event('canplay'));
                                this.dispatchEvent(new Event('progress'));

                                if (!isPartial) {
                                    if (this._mediaSource && this._mediaSource.readyState === 'open') {
                                        try { this._mediaSource.endOfStream(); } catch (e) {}
                                    }
                                    this._streamDone = true;

                                    if (this._pendingSeek !== null) {
                                        const target = this._pendingSeek;
                                        this._pendingSeek = null;
                                        this.active.currentTime = target;
                                    } else {
                                        this.active.currentTime = 0;
                                    }

                                    if (!preventAutoplay && !window.wasPausedByUser) {
                                        this.active.play().catch(e => console.warn("Cached play error:", e));
                                        this.dispatchEvent(new Event('play'));
                                        this.dispatchEvent(new Event('playing'));
                                    }
                                    return Promise.resolve();
                                }

                                // If partial, start playing cached portion in 0ms while resuming background download
                                if (!preventAutoplay && !window.wasPausedByUser) {
                                    this.active.play().catch(e => console.warn("Partial play error:", e));
                                    this.dispatchEvent(new Event('play'));
                                    this.dispatchEvent(new Event('playing'));
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.warn("Cache fast-path fallback:", e);
                }

                // 2. NETWORK PATH & RESUMABLE RANGE FETCH
                try {
                    let totalBytesAppended = cachedPartialBytes;
                    let streamDone = false;
                    const accumulatedChunks = cachedArrayBuffer ? [new Uint8Array(cachedArrayBuffer)] : [];

                    const saveProgress = async (isComplete = false) => {
                        if (totalBytesAppended > 0 && window.caches) {
                            try {
                                const mediaCache = await caches.open('yt-player-media');
                                const combined = new Uint8Array(totalBytesAppended);
                                let off = 0;
                                for (const c of accumulatedChunks) {
                                    combined.set(c, off);
                                    off += c.length;
                                }
                                const responseToCache = new Response(combined.buffer, {
                                    status: 200,
                                    headers: {
                                        'Content-Type': 'audio/webm',
                                        'Content-Length': totalBytesAppended.toString(),
                                        'X-Partial-Cached': isComplete ? 'false' : 'true'
                                    }
                                });
                                await mediaCache.put(url, responseToCache);
                            } catch (e) {}
                        }
                    };

                    let reader = null;
                    let response = null;

                    if (cachedPartialBytes > 0) {
                        if (this._pendingSeek !== null) {
                            const buffEnd = (this._sourceBuffer && this._sourceBuffer.buffered.length > 0)
                                ? this._sourceBuffer.buffered.end(this._sourceBuffer.buffered.length - 1)
                                : 0;
                            if (buffEnd >= this._pendingSeek - 0.5) {
                                const seekTarget = Math.min(this._pendingSeek, Math.max(0, buffEnd - 0.1));
                                this._pendingSeek = null;
                                this._seekingTo = seekTarget;
                                this.active.currentTime = seekTarget;
                                if (!preventAutoplay && !window.wasPausedByUser) {
                                    this.active.play().catch(e => console.warn("MSE play error:", e));
                                }
                            } else {
                                this.active.pause();
                            }
                        } else {
                            this.active.currentTime = 0;
                            if (!preventAutoplay && !window.wasPausedByUser) {
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

                        const fetchUrl = url.includes('?') ? `${url}&bypass=true` : `${url}?bypass=true`;
                        const fetchHeaders = { 'Range': `bytes=${cachedPartialBytes}-` };
                        response = await fetch(fetchUrl, { headers: fetchHeaders, signal: currentAbortSignal });
                        if (!response.ok && response.status !== 206) throw new Error(`Fetch status: ${response.status}`);
                        if (!response.body) throw new Error("ReadableStream not supported");
                        reader = response.body.getReader();
                    } else {
                        const initialChunks = [];
                        let initialBytes = 0;
                        const INITIAL_TARGET_BYTES = 196608;
                        let fetchBackoff = 300;

                        while (initialBytes < INITIAL_TARGET_BYTES && !streamDone) {
                            if (this._currentUrl !== url || this._streamId !== activeStreamId || currentAbortSignal.aborted) {
                                this.switching = false;
                                return Promise.resolve();
                            }

                            try {
                                if (!response || !reader) {
                                    const fetchUrl = url.includes('?') ? `${url}&bypass=true` : `${url}?bypass=true`;
                                    const fetchHeaders = initialBytes > 0 ? { 'Range': `bytes=${initialBytes}-` } : {};

                                    response = await fetch(fetchUrl, { headers: fetchHeaders, signal: currentAbortSignal });
                                    if (!response.ok && response.status !== 206) throw new Error(`Fetch status: ${response.status}`);
                                    if (!response.body) throw new Error("ReadableStream not supported");
                                    reader = response.body.getReader();
                                }

                                const { value: chunk, done } = await reader.read();
                                if (this._currentUrl !== url || this._streamId !== activeStreamId || currentAbortSignal.aborted) {
                                    try { reader.cancel(); } catch (e) {}
                                    await saveProgress(false);
                                    this.switching = false;
                                    return Promise.resolve();
                                }
                                if (done) {
                                    streamDone = true;
                                    break;
                                }
                                if (chunk && chunk.length > 0) {
                                    initialChunks.push(chunk);
                                    accumulatedChunks.push(chunk);
                                    initialBytes += chunk.length;
                                }
                            } catch (initErr) {
                                if (currentAbortSignal.aborted || this._currentUrl !== url || this._streamId !== activeStreamId) {
                                    await saveProgress(false);
                                    this.switching = false;
                                    return Promise.resolve();
                                }
                                reader = null;
                                response = null;
                                await new Promise(r => setTimeout(r, fetchBackoff));
                                fetchBackoff = Math.min(fetchBackoff * 1.5, 2000);
                            }
                        }

                        if (initialChunks.length === 0) throw new Error("Empty audio stream");

                        const initialCombined = new Uint8Array(initialBytes);
                        let offset = 0;
                        for (const c of initialChunks) {
                            initialCombined.set(c, offset);
                            offset += c.length;
                        }

                        await this._clearSourceBuffer();
                        if (this._currentUrl !== url || this._streamId !== activeStreamId) {
                            try { reader.cancel(); } catch (e) {}
                            await saveProgress(false);
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
                            await saveProgress(false);
                            this.switching = false;
                            return Promise.resolve();
                        }

                        if (this._pendingSeek !== null) {
                            const buffEnd = (this._sourceBuffer && this._sourceBuffer.buffered.length > 0)
                                ? this._sourceBuffer.buffered.end(this._sourceBuffer.buffered.length - 1)
                                : 0;
                            if (buffEnd >= this._pendingSeek - 0.5) {
                                const seekTarget = Math.min(this._pendingSeek, Math.max(0, buffEnd - 0.1));
                                this._pendingSeek = null;
                                this._seekingTo = seekTarget;
                                this.active.currentTime = seekTarget;
                                if (!preventAutoplay && !window.wasPausedByUser) {
                                    this.active.play().catch(e => console.warn("MSE play error:", e));
                                }
                            } else {
                                this.active.pause();
                            }
                        } else {
                            this.active.currentTime = 0;
                            if (!preventAutoplay && !window.wasPausedByUser) {
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
                    }

                    // Resilient background ingestion stream with network-switch / Range auto-recovery
                    (async () => {
                        const readStream = async (activeReader) => {
                            try {
                                while (true) {
                                    if (this._currentUrl !== url || this._streamId !== activeStreamId || currentAbortSignal.aborted) {
                                        try { activeReader.cancel(); } catch (e) {}
                                        await saveProgress(false);
                                        break;
                                    }

                                    const { value: nextChunk, done } = await activeReader.read();

                                    if (this._currentUrl !== url || this._streamId !== activeStreamId || currentAbortSignal.aborted) {
                                        try { activeReader.cancel(); } catch (e) {}
                                        await saveProgress(false);
                                        break;
                                    }

                                    if (done) {
                                        streamDone = true;
                                        this._streamDone = true;
                                        if (this._mediaSource && this._mediaSource.readyState === 'open') {
                                            try { this._mediaSource.endOfStream(); } catch (e) {}
                                        }
                                        await saveProgress(true);
                                        this.dispatchEvent(new Event('progress'));

                                        // Fulfill any pending seek targeting the end of the song
                                        if (this._pendingSeek !== null && this._sourceBuffer && this._sourceBuffer.buffered.length > 0) {
                                            const buffEnd = this._sourceBuffer.buffered.end(this._sourceBuffer.buffered.length - 1);
                                            const seekTarget = Math.min(this._pendingSeek, Math.max(0, buffEnd - 0.1));
                                            this._pendingSeek = null;
                                            this._seekingTo = seekTarget;
                                            this.active.currentTime = seekTarget;
                                            if (typeof lastRenderTime !== 'undefined') lastRenderTime = -1;
                                            if (typeof updateMediaSessionPosition === 'function') {
                                                const totalDur = this.duration || parseFloat(seekBar.max) || 0;
                                                updateMediaSessionPosition(seekTarget, totalDur, 1.0);
                                            }
                                            if (!preventAutoplay && !window.wasPausedByUser) {
                                                this.active.play().catch(e => console.warn("Catch-up seek play on stream done:", e));
                                                if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                                                    navigator.mediaSession.playbackState = 'playing';
                                                }
                                                this.dispatchEvent(new Event('play'));
                                                this.dispatchEvent(new Event('playing'));
                                            }
                                            this.dispatchEvent(new Event('seeked'));
                                            this.dispatchEvent(new Event('timeupdate'));
                                        }
                                        break;
                                    }

                                    if (nextChunk && nextChunk.length > 0) {
                                        accumulatedChunks.push(nextChunk);
                                        totalBytesAppended += nextChunk.length;
                                        await this._appendToSourceBuffer(nextChunk);
                                        this.dispatchEvent(new Event('progress'));

                                        // Re-anchor lock-screen seekbar on each incoming chunk to keep button as Playing and prevent timer drift
                                        if (typeof updateMediaSessionPosition === 'function') {
                                            const totalDur = this.duration || parseFloat(seekBar.max) || 0;
                                            if (this._pendingSeek !== null) {
                                                updateMediaSessionPosition(this._pendingSeek, totalDur);
                                            } else if (this.switching) {
                                                updateMediaSessionPosition(0, totalDur);
                                            }
                                        }

                                        // Auto-resume playback ONLY if playback stalled due to buffer underrun and player is not paused
                                        if (this._isBufferStalled && !window.wasPausedByUser && !this.active.paused && this._pendingSeek === null && this.active.readyState >= 3) {
                                            this._isBufferStalled = false;
                                        }

                                        // Catch-up seek check: If user requested a seek beyond buffer, fulfill it as soon as target is reached
                                        if (this._pendingSeek !== null && this._sourceBuffer && this._sourceBuffer.buffered.length > 0) {
                                            const buffEnd = this._sourceBuffer.buffered.end(this._sourceBuffer.buffered.length - 1);
                                            if (buffEnd >= this._pendingSeek - 0.5) {
                                                const seekTarget = Math.min(this._pendingSeek, Math.max(0, buffEnd - 0.1));
                                                this._pendingSeek = null;
                                                this._seekingTo = seekTarget;
                                                this.active.currentTime = seekTarget;
                                                if (typeof lastRenderTime !== 'undefined') lastRenderTime = -1;
                                                if (typeof updateMediaSessionPosition === 'function') {
                                                    const totalDur = this.duration || parseFloat(seekBar.max) || 0;
                                                    updateMediaSessionPosition(seekTarget, totalDur, 1.0);
                                                }
                                                if (!preventAutoplay && !window.wasPausedByUser) {
                                                    this.active.play().catch(e => console.warn("Catch-up seek play:", e));
                                                    if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                                                        navigator.mediaSession.playbackState = 'playing';
                                                    }
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
                                if (currentAbortSignal.aborted || this._streamId !== activeStreamId) {
                                    await saveProgress(false);
                                } else if (!streamDone) {
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
                        this._clearSourceBuffer().catch(() => {});
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
