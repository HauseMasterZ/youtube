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
            // Overlap starting the main track with pausing the silent track by 50ms
            // to ensure Android NEVER sees 0 active streams, preventing MediaSession drop.
            const p = this.active.play().catch(e => console.error("Play error:", e)); 
            
            if (this.silentPlaying) {
                this.silentPlaying = false;
                setTimeout(() => {
                    this.silent.pause();
                }, 50);
            }
            
            return p;
        }
        
        pause() { 
            // Start the silent loop BEFORE pausing the main track to ensure the Android
            // audio session never drops to 0 active streams, preventing WebView suspension.
            if (hasMediaSession && !this.silentPlaying) {
                this.silentPlaying = true;
                this.silent.play().catch(e => {});
                
                return new Promise(resolve => {
                    setTimeout(() => {
                        if (!this.active.paused) this.active.pause();
                        resolve();
                    }, 50);
                });
            }
            if (!this.active.paused) this.active.pause();
            return Promise.resolve();
        }
        
        load() { return this.active.load(); }
        removeAttribute(attr) { if (attr === 'src') { this.active.removeAttribute('src'); } }
        getAttribute(attr) { if (attr === 'src') { return this.active.getAttribute('src'); } return null; }
        fastSeek(t) { if ('fastSeek' in this.active) this.active.fastSeek(t); else this.currentTime = t; }
    
        switchTrack(url, preventAutoplay) {
            let p = null;
            this.isSwapping = true;
            
            // To completely eliminate hardware decoder pops and prevent the first 1-2 seconds
            // of the song from being skipped, we completely swap the audio element in the DOM!
            const oldAudio = this.active;
            const newAudio = document.createElement("audio");
            newAudio.id = "audio-player";
            newAudio.preload = "auto";
            
            this.events.forEach(evt => {
                oldAudio.removeEventListener(evt, this.forwardEvent);
                newAudio.addEventListener(evt, this.forwardEvent);
            });
            
            oldAudio.parentNode.replaceChild(newAudio, oldAudio);
            
            // Gracefully pause old audio
            oldAudio.pause();
            oldAudio.removeAttribute('src'); 
            oldAudio.load();
            
            this.active = newAudio;
            this.active.src = url;
            this.active.load(); // Fresh decoder buffer, immediately parses new track!
            
            if (!preventAutoplay) {
                p = this.active.play().then(() => {
                    this.isSwapping = false;
                }).catch(e => {
                    this.isSwapping = false;
                    console.error("Autoplay prevented:", e);
                });
                
                if (this.silentPlaying) {
                    this.silentPlaying = false;
                    setTimeout(() => {
                        this.silent.pause();
                    }, 50);
                }
            } else {
                if (hasMediaSession && !this.silentPlaying) {
                    this.silentPlaying = true;
                    this.silent.play().catch(e => {});
                }
                this.isSwapping = false;
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
