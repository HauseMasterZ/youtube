    const playlistSelect = document.getElementById("playlist-select");
    const searchInput = document.getElementById("search-input");
    const playlistContainer = document.getElementById("playlist-container");
    const playlistMessage = document.getElementById("playlist-message");
    const trackList = document.getElementById("track-list");

    class NativeAudioPlayer extends EventTarget {
        constructor() {
            super();
            // We only need one audio element now
            this.active = document.getElementById("audio-player-1");
            this.blessed = false;

            // Forward relevant events so main.js/playback.js listeners still work
            this.events = ['play', 'playing', 'pause', 'ended', 'error', 'loadedmetadata', 'timeupdate', 'seeked', 'ratechange', 'progress', 'waiting', 'canplay'];
            this.forwardEvent = (e) => {
                if (e.type === 'timeupdate' && this.active.currentTime > 0) {
                    this.lastKnownTime = this.active.currentTime;
                }
                this.dispatchEvent(new Event(e.type));
            };
            this.events.forEach(evt => {
                this.active.addEventListener(evt, this.forwardEvent);
            });
        }
    
        bless() {
            if (this.blessed) return;
            this.blessed = true;
            
            // To ensure the audio element is permanently blessed by Android, it must successfully resolve a play() call.
            // We use a silent base64 string to guarantee instant resolution without waiting for network.
            const silentSrc = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==";
            
            const oldSrc = this.active.src;
            this.active.src = silentSrc;
            this.active.play().then(() => {
                this.active.pause();
                if (oldSrc && !oldSrc.includes('data:audio/wav;base64')) {
                    this.active.src = oldSrc; 
                } else {
                    this.active.removeAttribute('src');
                }
            }).catch(()=>{});
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
            
            const p = this.active.play().catch(e => {
                console.error("Play error:", e);
                throw e;
            }); 
            this.bless();
            return p;
        }
        
        pause() { 
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

        switchTrack(url, preventAutoplay) {
            this.bless();
            this.active.volume = 1.0;
            
            if (url) {
                this.active.src = url;
            }
            
            if (!preventAutoplay) {
                return this.active.play().catch(e => {
                    console.error("Autoplay failed on switch", e);
                    throw e;
                });
            } else {
                return Promise.resolve();
            }
        }
    }
    const audioPlayer = new NativeAudioPlayer();

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
