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

            this.events = ['play', 'playing', 'pause', 'ended', 'error', 'loadedmetadata', 'timeupdate', 'seeked', 'ratechange'];
            this.forwardEvent = (e) => {
                if (this.isSwapping && e.type === 'pause') return;
                this.dispatchEvent(new Event(e.type));
            };
            this.events.forEach(evt => {
                this.active.addEventListener(evt, this.forwardEvent);
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
            // Start the silent loop on first play and NEVER pause it. 
            // This guarantees the Android audio session stays alive permanently,
            // preventing the MediaSession controls from disappearing during pauses!
            if (hasMediaSession && !this.silentPlaying) {
                this.silent.play().then(() => { this.silentPlaying = true; }).catch(e => {});
            }
            return this.active.play().catch(e => {
                console.error("Play error:", e);
                throw e; // Must throw so mediaSession revive logic catches it
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
                        this.active.volume = 1.0; // Reset volume for next time
                        resolve();
                    }
                }, 10);
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
            
            const oldAudio = this.active;
            const newAudio = document.createElement("audio");
            newAudio.id = "audio-player";
            newAudio.preload = "auto";
            
            // Append to DOM to ensure MediaSession stability and prevent GC
            if (oldAudio.parentNode) {
                oldAudio.parentNode.appendChild(newAudio);
            } else {
                document.body.appendChild(newAudio);
            }
            
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
                    if (oldAudio.parentNode) oldAudio.parentNode.removeChild(oldAudio);
                }
            }, 10);
            
            this.events.forEach(evt => {
                oldAudio.removeEventListener(evt, this.forwardEvent);
                newAudio.addEventListener(evt, this.forwardEvent);
            });
            
            oldAudio.parentNode.replaceChild(newAudio, oldAudio);
            
            this.active = newAudio;
            this.active.src = url;
            this.active.load(); // Fresh decoder buffer
            
            if (!preventAutoplay) {
                // Wait for the new audio to buffer before playing so it doesn't skip the first second
                p = new Promise((resolve) => {
                    const onCanPlay = () => {
                        // If this audio is no longer the active one (user clicked next again rapidly), abort
                        if (this.active !== newAudio) {
                            resolve();
                            return;
                        }
                        
                        newAudio.play().then(() => {
                            this.isSwapping = false;
                            resolve();
                        }).catch(e => {
                            this.isSwapping = false;
                            console.error("Autoplay prevented:", e);
                            resolve(); 
                        });
                    };
                    
                    if (newAudio.readyState >= 3) { // HAVE_FUTURE_DATA
                        onCanPlay();
                    } else {
                        newAudio.addEventListener('canplay', onCanPlay, { once: true });
                        newAudio.addEventListener('error', onCanPlay, { once: true });
                    }
                });
            } else {
                this.isSwapping = false;
                p = Promise.resolve();
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
