class SmartBuffer {
    constructor(audioUrl, cacheKey, trackDurationStr, sequenceId, audioElement, uiCallback, preventAutoplay = false) {
        this.audioUrl = audioUrl;
        this.preventAutoplay = preventAutoplay;
        console.log("SmartBuffer created with audioUrl:", this.audioUrl);
        this.cacheKey = cacheKey;
        this.sequenceId = sequenceId;
        this.totalDuration = typeof trackDurationStr === 'string' ? parseISODuration(trackDurationStr) : (trackDurationStr || 180);
        this.audioElement = audioElement;
        this.uiCallback = uiCallback; // (isBuffering, secondsLeft)
        
        this.abortController = new AbortController();
        this.useMSE = !!window.MediaSource;
        
        // INSTANTLY trigger the buffering UI (3 dots) before the fetch even begins
        if (!this.preventAutoplay) {
            this.uiCallback(true, -1);
        }
        
        if (this.useMSE) {
            this.mediaSource = new MediaSource();
            this.objectUrl = URL.createObjectURL(this.mediaSource);
            this.audioElement.src = this.objectUrl;
            this.mediaSource.addEventListener('sourceopen', () => this.onSourceOpen());
        } else {
            this.objectUrl = null; 
            this.startFallback();
        }
    }
    async onSourceOpen() {
        console.log("onSourceOpen triggered for: ", this.audioUrl);
        if (this.abortController.signal.aborted) return;
        
        try {
            const response = await fetch(this.audioUrl, { signal: this.abortController.signal });
            if (!response.ok) throw new Error("HTTP " + response.status);
            
            const totalBytes = parseInt(response.headers.get('Content-Length') || '0', 10);
            
            // Tee stream for caching
            const [streamForMSE, streamForCache] = response.body.tee();
            
            const cacheResponse = new Response(streamForCache, { headers: response.headers });
            caches.open('yt-player-media').then(cache => {
                cache.put(this.cacheKey, cacheResponse);
            });
            
            const reader = streamForMSE.getReader();
            let bytesDownloaded = 0;
            this.startTime = performance.now();
            let hasStartedPlayback = false;
            
            let isFirstChunk = true;
            
            const processChunk = async () => {
                try {
                    const { done, value } = await reader.read();
                    
                    if (this.abortController.signal.aborted) return;
                    
                    if (done) {
                        if (this.mediaSource.readyState === 'open') {
                            this.mediaSource.endOfStream();
                        }
                        if (!hasStartedPlayback && currentPlaybackSequence === this.sequenceId) {
                            if (!this.preventAutoplay) {
                                this.uiCallback(false, 0);
                                this.audioElement.play().catch(e => console.error(e));
                            }
                        }
                        return;
                    }
                    
                    if (isFirstChunk) {
                        isFirstChunk = false;
                        let codec = 'opus';
                        // Convert first 2000 bytes to string to sniff codec
                        const chunkStr = String.fromCharCode.apply(null, value.slice(0, 2000));
                        if (chunkStr.includes('A_VORBIS')) {
                            codec = 'vorbis';
                        } else if (chunkStr.includes('A_OPUS')) {
                            codec = 'opus';
                        }
                        
                        const mimeType = this.audioUrl.toLowerCase().includes('.mp4') ? 'audio/mp4; codecs="mp4a.40.2"' : `audio/webm; codecs="${codec}"`;
                        console.log("Detected codec, using mimeType:", mimeType);
                        
                        try {
                            this.sourceBuffer = this.mediaSource.addSourceBuffer(mimeType);
                            this.sourceBuffer.addEventListener('error', (e) => {
                                console.error("SourceBuffer error", e);
                                this.useMSE = false;
                                this.startFallback();
                            });
                        } catch (e) {
                            console.error("MSE addSourceBuffer failed", e);
                            this.useMSE = false;
                            this.startFallback();
                            return;
                        }
                    }
                    
                    bytesDownloaded += value.length;
                    
                    if (this.mediaSource.readyState === 'open' && !this.sourceBuffer.updating) {
                        await new Promise((resolve) => {
                            this.sourceBuffer.addEventListener('updateend', resolve, { once: true });
                            try {
                                this.sourceBuffer.appendBuffer(value);
                            } catch (err) {
                                resolve();
                            }
                        });
                    }

                    if (!hasStartedPlayback && currentPlaybackSequence === this.sequenceId) {
                        const elapsedSecs = (performance.now() - this.startTime) / 1000;
                        if (elapsedSecs >= 0.5) {
                            const bandwidth = bytesDownloaded / elapsedSecs;
                            // Calculate exact bitrate using known duration
                            let BYTES_PER_AUDIO_SECOND = 16000;
                            if (this.totalDuration > 0 && totalBytes > 0) {
                                BYTES_PER_AUDIO_SECOND = totalBytes / this.totalDuration;
                            }
                            
                            // Audio downloaded so far in seconds
                            const audioSecsDownloaded = bytesDownloaded / BYTES_PER_AUDIO_SECOND;
                            
                            // Remaining bytes to download the FULL file
                            const remainingTotalBytes = Math.max(0, totalBytes - bytesDownloaded);
                            
                            // Time it will take to download the FULL file at current bandwidth
                            const timeToDownloadRest = remainingTotalBytes / bandwidth;
                            
                            // Playback safety criteria:
                            const MIN_BUFFER_SECONDS = 15;
                            const readyToPlay = audioSecsDownloaded >= MIN_BUFFER_SECONDS || (timeToDownloadRest < audioSecsDownloaded);
                            
                            if (readyToPlay || bytesDownloaded >= totalBytes) {
                                hasStartedPlayback = true;
                                if (!this.preventAutoplay) {
                                    this.uiCallback(false, 0);
                                    this.audioElement.play().catch(e => console.error(e));
                                }
                            } else {
                                const targetBytesForMinBuffer = MIN_BUFFER_SECONDS * BYTES_PER_AUDIO_SECOND;
                                const bytesNeeded = Math.max(0, targetBytesForMinBuffer - bytesDownloaded);
                                const timeToMinBuffer = bytesNeeded / bandwidth;
                                
                                const uiWaitTime = Math.min(timeToMinBuffer, timeToDownloadRest);
                                if (!this.preventAutoplay) this.uiCallback(true, Math.ceil(uiWaitTime));
                            }
                        } else {
                            if (!this.preventAutoplay) this.uiCallback(true, -1);
                        }
                    }
                    
                    processChunk();
                } catch(e) {
                    if (e.name !== 'AbortError') console.error("Stream read error", e);
                }
            };
            
            processChunk();
            
        } catch (e) {
            if (e.name !== 'AbortError') {
                console.error("MSE fetch error", e);
                this.audioElement.dispatchEvent(new Event("error"));
            }
        }
    }
    
    async startFallback() {
        try {
            const response = await fetch(this.audioUrl, { signal: this.abortController.signal });
            if (!response.ok) throw new Error("HTTP " + response.status);
            
            const totalBytes = parseInt(response.headers.get('Content-Length') || '0', 10);
            const [streamForBlob, streamForCache] = response.body.tee();
            
            const cacheResponse = new Response(streamForCache, { headers: response.headers });
            caches.open('yt-player-media').then(cache => cache.put(this.cacheKey, cacheResponse));
            
            const reader = streamForBlob.getReader();
            let bytesDownloaded = 0;
            this.startTime = performance.now();
            const chunks = [];
            
            const readLoop = async () => {
                if (this.abortController.signal.aborted) return;
                const { done, value } = await reader.read();
                
                if (done) {
                    const blob = new Blob(chunks, { type: response.headers.get('Content-Type') || 'audio/webm' });
                    this.objectUrl = URL.createObjectURL(blob);
                    
                    if (currentPlaybackSequence === this.sequenceId) {
                        this.audioElement.src = this.objectUrl;
                        if (!this.preventAutoplay) {
                            this.uiCallback(false, 0);
                            this.audioElement.play().catch(e => console.error(e));
                        }
                    }
                    return;
                }
                
                chunks.push(value);
                bytesDownloaded += value.length;
                
                if (currentPlaybackSequence === this.sequenceId) {
                    const elapsedSecs = (performance.now() - this.startTime) / 1000;
                    if (elapsedSecs >= 0.5) {
                        const bandwidth = bytesDownloaded / elapsedSecs; 
                        const downloadTime = totalBytes > 0 ? (totalBytes / bandwidth) : 10000;
                        const waitTime = downloadTime; // Fallback must wait for whole file
                        if (!this.preventAutoplay) this.uiCallback(true, Math.ceil(waitTime - elapsedSecs));
                    } else {
                        if (!this.preventAutoplay) this.uiCallback(true, -1);
                    }
                }
                
                readLoop();
            };
            
            readLoop();
        } catch (e) {
            if (e.name !== 'AbortError') {
                console.error("Fallback fetch error", e);
                this.audioElement.dispatchEvent(new Event("error"));
            }
        }
    }
    
    abort() {
        this.abortController.abort();
    }
}
