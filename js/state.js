    // Environment Feature Checks
    var hasMediaSession = 'mediaSession' in navigator;
    var hasTouch = 'ontouchstart' in window || (navigator.maxTouchPoints > 0);
    var isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    const ALL_PLAYLISTS = ["Gym", "Driving", "Songs"];
    let allDatabases = {
        Gym: null,
        Driving: null,
        Songs: null
    };
    let currentPlaylistData = [];
    let filteredIndices = []; // Stores objects { playlist, index }
    let selectedSearchIndex = -1;
    
    let playQueue = [];     
    let queueIndex = -1;    
    let queueBasePlaylist = null;
    let globalActiveOriginalIndex = -1; 
    let globalActivePlaylist = null;
    let lastUserScrollTime = 0;
    
    let shuffleMode = 0;
    let repeatMode = 0; 
    let autoplayEnabled = true; 
    
    const dominantColorCache = new Map();

    let isSeeking = false;
    let crossShuffleHistory = [];
    let crossShufflePos = -1;
    let playbackHistory = [];
    let playbackHistoryIndex = -1;
    
    // Lyrics State
    window.lyricsActive = false;
    let currentLyrics = []; // Array of { time: float, text: string }
    let currentLyricsIsUnsynced = false;
    let fetchingLyrics = false;
    
    // UI Throttling & Queue Management
    let lastRenderTime = -1;
    let searchDebounceTimer = null;
    let errorSkipTimer = null;
    let thumbsDisabled = isMobileDevice;
    let currentPlaybackSequence = 0;
    window.wasPausedByUser = true;
    window.wasPlayingBeforeCall = false;
    window.lastCallEndTime = 0;
    window.isCallActive = false;
    window.mediaSessionDestroyed = false;
    const preloadedFetches = new Map(); // audioUrl -> Promise

    // Virtual Scroller state
    const ITEM_HEIGHT = 48;
    let lastStartIndex = -1;
    let lastEndIndex = -1;
    let isRendering = false;
    let poolInitialized = false;

    // Settings State & Persistence
    function getStoredSetting(key, defaultValue) {
        try {
            if (typeof localStorage !== 'undefined' && localStorage !== null) {
                const val = localStorage.getItem(key);
                return (val !== null && val !== '') ? val : defaultValue;
            }
        } catch (e) {
            // Fallback if localStorage is restricted or throws
        }
        return defaultValue;
    }

    function setStoredSetting(key, value) {
        try {
            if (typeof localStorage !== 'undefined' && localStorage !== null) {
                localStorage.setItem(key, value);
            }
        } catch (e) {
            // Silently fail if localStorage is restricted
        }
    }

    window.getStoredSetting = getStoredSetting;
    window.setStoredSetting = setStoredSetting;

    // Build self-identification: bump every commit, logged once at startup so
    // field tests can prove which build is under test from the console.
    window.APP_BUILD = 'm2-70';

    // Post-call quarantine: car BT head units blast rogue AVRCP PLAY within
    // ~2.5s of hangup even if paused before the call. Single helper so the
    // window lives in one place (rogue-vs-drawer-tap are identical bare
    // ACTION_PLAY, so wall-clock gating is unavoidable).
    window.isPostCallQuarantine = function() {
        return (typeof window.lastCallEndTime === 'number' && Date.now() - window.lastCallEndTime < 2500 && window.wasPlayingBeforeCall === false);
    };

    // Mode 2 doctrine: playbackState is ALWAYS 'playing' while paused so the
    // OS never strips the card (pin comes from declared state + live anchor).
    // Mode 1 declares honestly. Single choke-point for all pause paths.
    window.declaredPausedState = function() {
        return (window.playbackMode === 'mode2') ? 'playing' : 'paused';
    };

    window.playbackMode = 'mode1';
    window.btTimeoutMins = getStoredSetting('yt_bt_timeout_mins', '5');
    window.btSleepTimer = null;
    window.lastPlaybackModeTransitions = [];

    window.rebuildCrossShuffleDeck = function() {
        if (shuffleMode !== 1) return;
        
        const existingMap = new Set();
        for (const item of crossShuffleHistory) {
            existingMap.add(item.playlist + ":" + item.index);
        }
        
        const newTracks = [];
        for (const pl of ALL_PLAYLISTS) {
            if (allDatabases[pl]) {
                for (let i = 0; i < allDatabases[pl].length; i++) {
                    if (!existingMap.has(pl + ":" + i)) {
                        newTracks.push({ playlist: pl, index: i });
                    }
                }
            }
        }
        
        if (newTracks.length > 0) {
            crossShuffleHistory.push(...newTracks);
            // Reshuffle the unplayed portion of the deck
            for (let i = crossShuffleHistory.length - 1; i > crossShufflePos + 1; i--) {
                const remaining = i - (crossShufflePos + 1) + 1;
                const j = (crossShufflePos + 1) + Math.floor(Math.random() * remaining);
                [crossShuffleHistory[i], crossShuffleHistory[j]] = [crossShuffleHistory[j], crossShuffleHistory[i]];
            }
        }
    };

