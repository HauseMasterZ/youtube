    const playlistSelect = document.getElementById("playlist-select");
    const searchInput = document.getElementById("search-input");
    const playlistContainer = document.getElementById("playlist-container");
    const playlistMessage = document.getElementById("playlist-message");
    const trackList = document.getElementById("track-list");

    class DualAudioPingPong extends EventTarget {
        constructor() {
            super();
            this.active = document.getElementById("audio-player-1");
            this.switching = false;
            this._endedFired = false;
            this.lastKnownTime = 0;
            this._currentUrl = '';
            this._audioCtx = null;
            this._gainNode = null;
            this._mediaElementSource = null;

            this.events = ['play', 'playing', 'pause', 'error', 'loadedmetadata',
                           'timeupdate', 'seeked', 'ratechange', 'progress',
                           'waiting', 'canplay', 'ended', 'durationchange'];

            this.forwardEvent = (e) => {
                if (!this.switching) {
                    if (e.type === 'timeupdate') {
                        const ct = this.active.currentTime;
                        const dur = this.active.duration;
                        if (dur > 0 && ct < dur - 1.0) {
                            this._endedFired = false;
                        }
                        if (dur > 0 && this.lastKnownTime > 0 && !this.active.seeking) {
                            if (!this._endedFired && ct >= dur - 0.25) {
                                this._endedFired = true;
                                this.dispatchEvent(new Event('ended'));
                                return;
                            }
                        }
                        this.lastKnownTime = ct;
                    }
                    if (e.type === 'ended') {
                        if (!this._endedFired) {
                            this._endedFired = true;
                            this.dispatchEvent(new Event('ended'));
                            return;
                        }
                        return;
                    }
                    this.dispatchEvent(new Event(e.type));
                }
            };
            this.events.forEach(evt => {
                this.active.addEventListener(evt, this.forwardEvent);
            });
        }

        _initAudioGraph() {
            if (this._audioCtx || (typeof isMobileDevice !== 'undefined' && isMobileDevice)) return;
            try {
                const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
                if (AudioCtxClass) {
                    this._audioCtx = new AudioCtxClass();
                    this._mediaElementSource = this._audioCtx.createMediaElementSource(this.active);
                    this._gainNode = this._audioCtx.createGain();
                    this._gainNode.gain.value = 1.0;
                    this._mediaElementSource.connect(this._gainNode);
                    this._gainNode.connect(this._audioCtx.destination);
                }
            } catch (e) {
                console.warn("AudioGraph init note:", e);
            }
        }

        get currentTime() { return this.active.currentTime; }
        set currentTime(v) {
            try {
                this.lastKnownTime = v;
                if (v < (this.active.duration || Infinity) - 0.5) {
                    this._endedFired = false;
                }
                this.active.currentTime = v;
            } catch (e) {
                console.warn("currentTime set error:", e);
            }
        }

        get readyState() { return this.active.readyState; }
        get duration() { return this.active.duration; }
        get paused() { return this.active.paused; }
        get playbackRate() { return this.active.playbackRate; }
        set playbackRate(v) { this.active.playbackRate = v; }
        get src() { return this._currentUrl || this.active.src; }
        set src(v) { this._currentUrl = v; }
        get muted() { return this.active.muted; }
        set muted(v) { this.active.muted = v; }
        get buffered() { return this.active.buffered; }

        play() {
            window.wasPausedByUser = false;
            if (this.active.currentTime < (this.active.duration || Infinity) - 0.5) {
                this._endedFired = false;
            }
            this._initAudioGraph();
            if (this._audioCtx && this._audioCtx.state === 'suspended') {
                this._audioCtx.resume();
            }
            if (this._gainNode) {
                this._gainNode.gain.value = 1.0;
            }
            if (this.fadeInterval) {
                clearInterval(this.fadeInterval);
                this.fadeInterval = null;
                this.active.volume = 1.0;
            }
            this.active.muted = false;
            return this.active.play();
        }

        recoverTrack(url) {
            this.switchTrack(url, false);
        }

        pause() {
            window.wasPausedByUser = true;
            if (this.active.paused || this.fadeInterval) return Promise.resolve();
            if (document.hidden) {
                this.active.pause();
                this.active.volume = 1.0;
                return Promise.resolve();
            }
            return new Promise(resolve => {
                let currentVol = this._gainNode ? this._gainNode.gain.value : this.active.volume;
                const step = currentVol / 10;
                this.fadeInterval = setInterval(() => {
                    currentVol -= step;
                    if (currentVol > 0) {
                        if (this._gainNode) this._gainNode.gain.value = currentVol;
                        else this.active.volume = currentVol;
                    } else {
                        clearInterval(this.fadeInterval);
                        this.fadeInterval = null;
                        this.active.pause();
                        if (this._gainNode) this._gainNode.gain.value = 1.0;
                        this.active.volume = 1.0;
                        resolve();
                    }
                }, 5);
            });
        }

        load() { return this.active.load(); }
        removeAttribute(attr) { if (attr === 'src') { this._currentUrl = ''; } }
        getAttribute(attr) { if (attr === 'src') { return this._currentUrl || null; } return null; }
        fastSeek(t) { if ('fastSeek' in this.active) this.active.fastSeek(t); else this.currentTime = t; }
        addEventListener(type, listener) { super.addEventListener(type, listener); }
        removeEventListener(type, listener) { super.removeEventListener(type, listener); }

        instantPause() {
            window.wasPausedByUser = true;
            if (this.fadeInterval) {
                clearInterval(this.fadeInterval);
                this.fadeInterval = null;
            }
            this.active.pause();
            if (this._gainNode) this._gainNode.gain.value = 1.0;
            this.active.volume = 1.0;
        }

        async switchTrack(url, preventAutoplay) {
            this.switching = true;
            this._endedFired = false;
            this.lastKnownTime = 0;
            this._currentUrl = url || '';

            this._initAudioGraph();
            if (this._audioCtx && this._audioCtx.state === 'suspended') {
                this._audioCtx.resume();
            }

            if (this._gainNode) {
                this._gainNode.gain.value = 0;
            }

            try {
                this.active.currentTime = 0;
            } catch (e) {}

            if (typeof updateBufferProgress === 'function') updateBufferProgress();
            else {
                const bc = document.getElementById("buffer-container");
                if (bc) bc.innerHTML = '';
            }

            if (!url) {
                this.switching = false;
                return Promise.resolve();
            }

            this.active.src = url;

            if (!preventAutoplay) {
                if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                    navigator.mediaSession.playbackState = "playing";
                }
                const playPromise = this.active.play();
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        if (this._gainNode) this._gainNode.gain.value = 1.0;
                    }).catch(e => {
                        console.warn("switchTrack play error:", e);
                        if (this._gainNode) this._gainNode.gain.value = 1.0;
                    });
                } else {
                    if (this._gainNode) this._gainNode.gain.value = 1.0;
                }
            } else {
                if (this._gainNode) this._gainNode.gain.value = 1.0;
                this.active.load();
            }
            this.switching = false;
            return Promise.resolve();
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
    const seekTrack = document.getElementById("seek-track");
    const bufferContainer = document.getElementById("buffer-container");
    const currentTimeDisplay = document.getElementById("current-time");
    const totalTimeDisplay = document.getElementById("total-time");
    
    const lyricsToggleHint = document.getElementById("lyrics-toggle-hint");
    const lyricsContainer = document.getElementById("lyrics-container");
    const lyricsContent = document.getElementById("lyrics-content");
