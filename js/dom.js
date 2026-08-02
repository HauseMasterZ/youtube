    const playlistSelect = document.getElementById("playlist-select");
    const searchInput = document.getElementById("search-input");
    const playlistContainer = document.getElementById("playlist-container");
    const playlistMessage = document.getElementById("playlist-message");
    const trackList = document.getElementById("track-list");

    class DualAudioPingPong extends EventTarget {
        constructor() {
            super();
            this.audio1 = document.getElementById("audio-player-1");
            this.audio2 = document.getElementById("audio-player-2");
            this.active = this.audio1;
            this.inactive = this.audio2;
            
            this.blessed = false;

            this.events = ['play', 'playing', 'pause', 'ended', 'error', 'loadedmetadata', 'timeupdate', 'seeked', 'ratechange', 'progress', 'waiting', 'canplay'];
            this.forwardEvent = (e) => {
                if (e.target === this.active) {
                    if (e.type === 'timeupdate' && this.active.currentTime > 0) {
                        this.lastKnownTime = this.active.currentTime;
                    }
                    this.dispatchEvent(new Event(e.type));
                }
            };
            this.events.forEach(evt => {
                this.audio1.addEventListener(evt, this.forwardEvent);
                this.audio2.addEventListener(evt, this.forwardEvent);
            });

            const onFirstInteraction = () => {
                document.removeEventListener('click', onFirstInteraction, true);
                this.bless();
            };
            document.addEventListener('click', onFirstInteraction, true);
        }
    
        bless() {
            if (this.blessed) return;
            this.blessed = true;
            
            // To ensure BOTH audio elements are permanently blessed by Android, they must successfully resolve a play() call.
            // We use a silent base64 string to guarantee instant resolution without waiting for network.
            const silentSrc = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==";
            
            const blessAud = (aud) => {
                const oldSrc = aud.src;
                aud.src = silentSrc;
                aud.play().then(() => {
                    aud.pause();
                    if (oldSrc && !oldSrc.includes('data:audio/wav;base64')) {
                        aud.src = oldSrc; 
                    } else {
                        aud.removeAttribute('src');
                    }
                }).catch(()=>{});
            };
            
            blessAud(this.audio1);
            blessAud(this.audio2);
        }



        get currentTime() { return this.active.currentTime; }
        set currentTime(v) { this.active.currentTime = v; }
        get duration() { return this.active.duration; }
        get paused() { return this.active.paused; }
        get playbackRate() { return this.active.playbackRate; }
        set playbackRate(v) { this.active.playbackRate = v; }
        get src() { return this.active.src; }
        set src(v) { this.active.src = v; }
        get muted() { return this.active.muted; }
        set muted(v) { this.active.muted = v; }
        get buffered() { return this.active.buffered; }
        
        play() { 
            // Cancel any pending fade-out from a recent pause() call
            if (this.fadeInterval) {
                clearInterval(this.fadeInterval);
                this.fadeInterval = null;
                this.active.volume = 1.0;
            }
            this.active.muted = false;
            
            const p = this.active.play().catch(e => {
                console.error("Play error:", e);
                throw e;
            }); 
            return p;
        }
        
        pause() { 
            if (this.active.paused || this.fadeInterval) return Promise.resolve();
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
        removeAttribute(attr) { if (attr === 'src') { this.active.removeAttribute('src'); } }
        getAttribute(attr) { if (attr === 'src') { return this.active.getAttribute('src'); } return null; }
        fastSeek(t) { if ('fastSeek' in this.active) this.active.fastSeek(t); else this.currentTime = t; }
        addEventListener(type, listener) { super.addEventListener(type, listener); }
        removeEventListener(type, listener) { super.removeEventListener(type, listener);        }
        
        instantPause() {
            if (this.fadeInterval) {
                clearInterval(this.fadeInterval);
                this.fadeInterval = null;
            }
            this.active.muted = true;
            this.active.pause();
        }

        cleanupInactive() {
            this.inactive.pause();
            this.inactive.removeAttribute('src');
            this.inactive.load();
            this.inactive.volume = 1.0;
        }

        switchTrack(url, preventAutoplay) {
            // Cancel any pending canplay listener from a previous rapid skip
            if (this.active._pendingCanPlay) {
                this.active.removeEventListener('canplay', this.active._pendingCanPlay);
                this.active._pendingCanPlay = null;
            }
            if (this.inactive._pendingCanPlay) {
                this.inactive.removeEventListener('canplay', this.inactive._pendingCanPlay);
                this.inactive._pendingCanPlay = null;
            }

            const oldActive = this.active;
            this.active = this.inactive;
            this.inactive = oldActive;
            this.inactive.volume = 0.000001;
            this.active.volume = 1.0;
            
            if (this.inactive.paused && this.inactive.getAttribute('src')) {
                this.inactive.play().catch(() => {});
            }

            if (!preventAutoplay) {
                if (url) {
                    this.active.src = url;
                    this.active.load(); // Force the browser to start fetching
                }

                const onCanPlay = () => {
                    this.active.removeEventListener('canplay', onCanPlay);
                    this.active._pendingCanPlay = null;
                    this.active.play().then(() => {
                        this.cleanupInactive();
                    }).catch(e => {
                        this.cleanupInactive();
                    });
                };
                this.active._pendingCanPlay = onCanPlay;
                this.active.addEventListener('canplay', onCanPlay);

                return Promise.resolve(); // don't block on the play promise
            } else {
                this.cleanupInactive();
                if (url) this.active.src = url;
                return Promise.resolve();
            }
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
    const currentTimeDisplay = document.getElementById("current-time");
    const totalTimeDisplay = document.getElementById("total-time");
    
    const lyricsToggleHint = document.getElementById("lyrics-toggle-hint");
    const lyricsContainer = document.getElementById("lyrics-container");
    const lyricsContent = document.getElementById("lyrics-content");
