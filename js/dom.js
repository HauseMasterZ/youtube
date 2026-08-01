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
            
            this.silent = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==");
            this.silent.loop = true;
            this.silentPlaying = false;
            this.blessed = false;

            this.events = ['play', 'playing', 'pause', 'ended', 'error', 'loadedmetadata', 'timeupdate', 'seeked', 'ratechange'];
            this.forwardEvent = (e) => {
                if (e.target === this.active) {
                    this.dispatchEvent(new Event(e.type));
                }
            };
            this.events.forEach(evt => {
                this.audio1.addEventListener(evt, this.forwardEvent);
                this.audio2.addEventListener(evt, this.forwardEvent);
            });
        }
    
        bless() {
            if (this.blessed) return;
            this.blessed = true;
            
            if (hasMediaSession && !this.silentPlaying) {
                this.silent.play().then(() => { this.silentPlaying = true; }).catch(e => {});
            }
            
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
        
        play() { 
            this.bless();

            // Cancel any pending fade-out from a recent pause() call
            if (this.fadeInterval) {
                clearInterval(this.fadeInterval);
                this.fadeInterval = null;
                this.active.volume = 1.0;
            }
            
            if (window.activeSmartBuffer) window.activeSmartBuffer.preventAutoplay = false;

            return this.active.play().catch(e => {
                console.error("Play error:", e);
                throw e;
            }); 
        }
        
        pause() { 
            if (window.activeSmartBuffer) window.activeSmartBuffer.preventAutoplay = true;
            if (this.active.paused) return Promise.resolve();
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
                }, 10);
            });
        }
        
        load() { return this.active.load(); }
        removeAttribute(attr) { if (attr === 'src') { this.active.removeAttribute('src'); } }
        getAttribute(attr) { if (attr === 'src') { return this.active.getAttribute('src'); } return null; }
        fastSeek(t) { if ('fastSeek' in this.active) this.active.fastSeek(t); else this.currentTime = t; }
        addEventListener(type, listener) { super.addEventListener(type, listener); }
        removeEventListener(type, listener) { super.removeEventListener(type, listener); }
    
        prepareSwap() {
            this.bless();
            const oldActive = this.active;
            this.active = this.inactive;
            this.inactive = oldActive;
            
            this.inactive.pause();
            this.inactive.src = "";
            this.inactive.removeAttribute('src');
            this.inactive.load();
        }

        switchTrack(url, preventAutoplay) {
            this.bless();
            const oldActive = this.active;
            this.active = this.inactive;
            this.inactive = oldActive;
            
            this.inactive.pause();
            this.inactive.src = "";
            this.inactive.removeAttribute('src');
            this.inactive.load();
            
            let p;
            if (!preventAutoplay) {
                if (url) this.active.src = url;
                p = this.active.play().catch(e => {
                    console.error("Autoplay failed on switch", e);
                    throw e;
                });
            } else {
                if (url) this.active.src = url;
                p = Promise.resolve();
            }
            
            return p;
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
