    const playlistSelect = document.getElementById("playlist-select");
    const searchInput = document.getElementById("search-input");
    const playlistContainer = document.getElementById("playlist-container");
    const playlistMessage = document.getElementById("playlist-message");
    const trackList = document.getElementById("track-list");

    class PingPongAudio extends EventTarget {
        constructor() {
            super();
            this.a = document.getElementById("audio-player");
            this.b = new Audio();
            this.b.preload = "auto";
            this.silent = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==");
            this.silent.loop = true;
            
            this.active = this.a;
            this.inactive = this.b;
            this.isSwapping = false;
            
            const events = ['play', 'pause', 'ended', 'error', 'loadedmetadata', 'timeupdate', 'seeked', 'ratechange'];
            const forwardEvent = (e) => {
                if (this.active === e.target) {
                    // Mask pause events during a seamless gapless track swap to prevent UI and MediaSession flickering
                    if (this.isSwapping && e.type === 'pause') return;
                    this.dispatchEvent(new Event(e.type));
                }
            };
            events.forEach(evt => {
                this.a.addEventListener(evt, forwardEvent);
                this.b.addEventListener(evt, forwardEvent);
            });
        }
    
        get currentTime() { return this.active.currentTime; }
        set currentTime(v) { this.active.currentTime = v; }
        get duration() { return this.active.duration; }
        get paused() { return this.active.paused; }
        get playbackRate() { return this.active.playbackRate; }
        set playbackRate(v) { this.a.playbackRate = v; this.b.playbackRate = v; }
        get src() { return this.active.src; }
        set src(v) { this.active.src = v; }
        get muted() { return this.active.muted; }
        set muted(v) { this.a.muted = v; this.b.muted = v; }
        
        play() { 
            this.active.muted = true;
            return this.active.play().then(() => {
                setTimeout(() => { this.active.muted = false; }, 50);
            }).catch(e => {
                this.active.muted = false;
                console.error("Play error:", e);
            }); 
        }
        pause() { 
            this.active.muted = true;
            setTimeout(() => {
                this.active.pause();
                this.active.muted = false;
            }, 50);
        }
        load() { return this.active.load(); }
        removeAttribute(attr) { if (attr === 'src') { this.active.removeAttribute('src'); } }
        getAttribute(attr) { if (attr === 'src') { return this.active.getAttribute('src'); } return null; }
        fastSeek(t) { if ('fastSeek' in this.active) this.active.fastSeek(t); else this.currentTime = t; }
    
        switchTrack(url, preventAutoplay) {
            if (window.hasMediaSession && !this.active.paused) {
                this.silent.play().catch(e => {});
            }

            this.inactive.src = url;
            let p = null;
            
            this.isSwapping = true;
            if (!preventAutoplay) {
                // Ensure inactive is muted BEFORE it starts fetching/playing to avoid initial pops
                this.inactive.muted = true;
                
                this.active.pause();
                this.active.removeAttribute('src');
                this.active.load();
                
                p = this.inactive.play().then(() => {
                    this.silent.pause();
                    this.inactive.muted = false;
                    this.isSwapping = false;
                }).catch(e => {
                    this.silent.pause();
                    this.inactive.muted = false;
                    this.isSwapping = false;
                    console.error("Autoplay prevented:", e);
                });
            } else {
                this.active.pause();
                this.active.removeAttribute('src');
                this.active.load();
                this.silent.pause();
                this.isSwapping = false;
            }
            
            this.active = this.inactive;
            this.inactive = this.active === this.a ? this.b : this.a;
            return p;
        }
    }
    const audioPlayer = new PingPongAudio();

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
