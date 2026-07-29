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
    let globalActiveOriginalIndex = -1; 
    let globalActivePlaylist = null;
    
    let shuffleMode = parseInt(localStorage.getItem('shuffleMode')) || 0;
    let repeatMode = parseInt(localStorage.getItem('repeatMode')) || 0; 
    
    const dominantColorCache = new Map();
    let isSeeking = false;
    let crossShuffleHistory = [];
    let crossShufflePos = -1;
    let isRecovering = false;
    
    // Lyrics State
    window.lyricsActive = false;
    let currentLyrics = []; // Array of { time: float, text: string }
    let currentLyricsIsAi = false;
    let fetchingLyrics = false;
    
    // UI Throttling
    let lastRenderTime = -1;
    let syncRAFId = null;
    let searchDebounceTimer = null;
    let errorSkipTimer = null;
    // Enforce hidden thumbnails on page load to save inrush bandwidth
    let thumbsDisabled = true;
    let currentPlaybackSequence = 0;
    const preloadedFetches = new Map(); // audioUrl -> Promise
    const preloadedBlobs = new Map(); // audioUrl -> blobUrl

    
    // Android Chrome Lock-Screen Notification Teardown Bypass

    // Virtual Scroller state
    const ITEM_HEIGHT = 48;
    let lastStartIndex = -1;
    let lastEndIndex = -1;
    let isRendering = false;
    let poolInitialized = false;
    let localStorageCounter = 0;
