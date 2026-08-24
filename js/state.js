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
    
    const dominantColorCache = new Map();

    let isSeeking = false;
    let crossShuffleHistory = [];
    let crossShufflePos = -1;
    
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
    window.wasPausedByUser = false;
    const preloadedFetches = new Map(); // audioUrl -> Promise


    
    // Android Chrome Lock-Screen Notification Teardown Bypass

    // Virtual Scroller state
    const ITEM_HEIGHT = 48;
    let lastStartIndex = -1;
    let lastEndIndex = -1;
    let isRendering = false;
    let poolInitialized = false;

    window.wasPausedByUser = true;

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

