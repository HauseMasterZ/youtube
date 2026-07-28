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
            this.isSwapping = false;
            this.silentPlaying = false;
            this.blessed = false;
            this.lastPauseTime = 0;

            this.events = ['play', 'playing', 'pause', 'ended', 'error', 'loadedmetadata', 'timeupdate', 'seeked', 'ratechange'];
            this.forwardEvent = (e) => {
                if (this.isSwapping && e.type === 'pause') return;
                this.dispatchEvent(new Event(e.type));
            };
            this.events.forEach(evt => {
                this.audio1.addEventListener(evt, this.forwardEvent);
                this.audio2.addEventListener(evt, this.forwardEvent);
            });
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
        
        play() { 
            this.bless();
            if (hasMediaSession && !this.silentPlaying) {
                this.silent.play().then(() => { this.silentPlaying = true; }).catch(e => {});
            }
            
            // If the audio was paused for more than 10 seconds, the OS or Cloudflare likely killed the TCP connection.
            // We must synchronously recreate the audio stream BEFORE calling play() so the Android gesture token isn't lost during async error recovery.
            if (this.lastPauseTime > 0 && Date.now() - this.lastPauseTime > 10000 && this.active.src && this.active.currentTime > 0) {
                const savedTime = this.active.currentTime;
                const src = this.active.src;
                this.active.removeAttribute('src');
                this.active.load();
                this.active.src = src;
                this.active.currentTime = savedTime;
                this.lastPauseTime = 0;
            }
            
            return this.active.play().catch(e => {
                console.error("Play error:", e);
                throw e;
            }); 
        }
        
        pause() { 
            this.lastPauseTime = Date.now();
            if (this.active.paused) return Promise.resolve();
            return new Promise(resolve => {
                let currentVol = this.active.volume;
                const step = currentVol / 10;
                const interval = setInterval(() => {
                    currentVol -= step;
                    if (currentVol > 0) {
                        this.active.volume = currentVol;
                    } else {
                        clearInterval(interval);
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
    
        switchTrack(url, preventAutoplay) {
            this.bless();
            if (hasMediaSession && !this.silentPlaying && !preventAutoplay) {
                this.silent.play().then(() => { this.silentPlaying = true; }).catch(e => {});
            }

            let p = null;
            this.isSwapping = true;
            
            const oldAudio = this.active;
            const newAudio = this.inactive;
            
            // Fade out then pause old audio to prevent abrupt cutoff
            let oldVol = oldAudio.volume;
            const step = oldVol / 10;
            const fadeInterval = setInterval(() => {
                oldVol -= step;
                if (oldVol > 0) {
                    oldAudio.volume = oldVol;
                } else {
                    clearInterval(fadeInterval);
                    oldAudio.pause();
                    oldAudio.volume = 1.0;
                }
            }, 10);
            
            // Swap active pointer
            this.active = newAudio;
            this.inactive = oldAudio;
            
            if (!preventAutoplay) {
                this.active.src = url;
                this.active.load();
                p = this.active.play().then(() => {
                    this.isSwapping = false;
                }).catch(e => {
                    this.isSwapping = false;
                    console.error("Autoplay prevented:", e);
                });
            } else {
                this.active.src = url;
                this.active.load();
                this.isSwapping = false;
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
