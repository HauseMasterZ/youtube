    const playlistSelect = document.getElementById("playlist-select");
    const searchInput = document.getElementById("search-input");
    const playlistContainer = document.getElementById("playlist-container");
    const playlistMessage = document.getElementById("playlist-message");
    const trackList = document.getElementById("track-list");

    class SingleAudioWithHold extends EventTarget {
        constructor() {
            super();
            this.active = document.getElementById("audio-player");
            this.silent = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==");
            this.silent.loop = true;
            this.isSwapping = false;
            this.silentPlaying = false;
            this.fadeInterval = null;
            
            const events = ['play', 'playing', 'pause', 'ended', 'error', 'loadedmetadata', 'timeupdate', 'seeked', 'ratechange'];
            const forwardEvent = (e) => {
                if (this.isSwapping && e.type === 'pause') return;
                this.dispatchEvent(new Event(e.type));
            };
            events.forEach(evt => {
                this.active.addEventListener(evt, forwardEvent);
            });
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
            if (hasMediaSession && !this.silentPlaying) {
                this.silent.play().then(() => { this.silentPlaying = true; }).catch(e => {});
            }
            if (this.fadeInterval) clearInterval(this.fadeInterval);
            this.active.volume = 1;
            return this.active.play().catch(e => console.error("Play error:", e)); 
        }
        
        pause() { 
            if (this.silentPlaying) {
                this.silent.pause();
                this.silentPlaying = false;
            }
            if (this.active.paused) return Promise.resolve();
            return this.fadeOutAndPause();
        }

        fadeOutAndPause() {
            return new Promise(resolve => {
                if (this.fadeInterval) clearInterval(this.fadeInterval);
                const step = 0.25;
                this.fadeInterval = setInterval(() => {
                    const nextVol = this.active.volume - step;
                    if (nextVol > 0) {
                        this.active.volume = nextVol;
                    } else {
                        clearInterval(this.fadeInterval);
                        this.fadeInterval = null;
                        this.active.pause();
                        this.active.volume = 1;
                        resolve();
                    }
                }, 10); // 40ms total fade
            });
        }
        
        load() { return this.active.load(); }
        removeAttribute(attr) { if (attr === 'src') { this.active.removeAttribute('src'); } }
        getAttribute(attr) { if (attr === 'src') { return this.active.getAttribute('src'); } return null; }
        fastSeek(t) { if ('fastSeek' in this.active) this.active.fastSeek(t); else this.currentTime = t; }
    
        switchTrack(url, preventAutoplay) {
            if (hasMediaSession && !this.silentPlaying && !preventAutoplay) {
                this.silent.play().then(() => { this.silentPlaying = true; }).catch(e => {});
            }

            let p = null;
            this.isSwapping = true;
            
            const doSwap = () => {
                this.active.removeAttribute('src');
                this.active.load();
                this.active.src = url;
                
                if (!preventAutoplay) {
                    p = this.active.play().then(() => {
                        this.isSwapping = false;
                    }).catch(e => {
                        this.isSwapping = false;
                        console.error("Autoplay prevented:", e);
                    });
                } else {
                    if (this.silentPlaying) {
                        this.silent.pause();
                        this.silentPlaying = false;
                    }
                    this.isSwapping = false;
                }
            };

            if (!this.active.paused) {
                this.fadeOutAndPause().then(doSwap);
            } else {
                doSwap();
            }
            
            return p;
        }
    }
    const audioPlayer = new SingleAudioWithHold();

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
