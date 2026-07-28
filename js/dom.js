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
            // Instantly play and pause to grab the Android user gesture token for both elements
            this.audio1.play().catch(()=>{}); this.audio1.pause();
            this.audio2.play().catch(()=>{}); this.audio2.pause();
            this.silent.play().catch(()=>{}); this.silent.pause();
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
            return this.active.play().catch(e => {
                console.error("Play error:", e);
                throw e;
            }); 
        }
        
        pause() { 
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
                // Wait for the new audio to buffer before playing so it doesn't skip the first second
                p = new Promise((resolve) => {
                    const onCanPlay = () => {
                        this.active.play().then(() => {
                            this.isSwapping = false;
                            resolve();
                        }).catch(e => {
                            this.isSwapping = false;
                            console.error("Autoplay prevented:", e);
                            resolve(); 
                        });
                    };
                    
                    if (this.active.readyState >= 3) { // HAVE_FUTURE_DATA
                        onCanPlay();
                    } else {
                        this.active.addEventListener('canplay', onCanPlay, { once: true });
                        this.active.addEventListener('error', onCanPlay, { once: true });
                    }
                    this.active.src = url; // SET SRC AFTER ADDING LISTENER
                });
            } else {
                this.active.src = url;
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
