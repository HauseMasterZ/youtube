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
    
    
    let shuffleMode = parseInt(localStorage.getItem('shuffleMode')) || 0;
    let repeatMode = parseInt(localStorage.getItem('repeatMode')) || 0; 
    
    const dominantColorCache = new Map();
    let isSeeking = false;
    let crossShuffleHistory = [];
    let crossShufflePos = -1;
    
    // Lyrics State
    let lyricsActive = false;
    let currentLyrics = []; // Array of { time: float, text: string }
    let currentLyricsIsAi = false;
    let fetchingLyrics = false;
    
    // UI Throttling
    let lastRenderTime = -1;
    let syncRAFId = null;
    let searchDebounceTimer = null;
    let errorSkipTimer = null;
    let storedThumbsDisabled = localStorage.getItem('thumbsDisabled');
    let thumbsDisabled = storedThumbsDisabled === null ? true : storedThumbsDisabled === 'true';
    let currentPlaybackSequence = 0;
    const preloadedFetches = new Map(); // audioUrl -> Promise
    let requestedThumbs = new Set();
    
    // Android Chrome Lock-Screen Notification Teardown Bypass
    const silentKeepAliveAudio = new Audio('data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAAABmYWN0BAAAAAAAAABkYXRhAAAAAA==');
    silentKeepAliveAudio.loop = true;
    let silentKeepAliveTimer = null;
    // Virtual Scroller state
    const ITEM_HEIGHT = 48;
    let lastStartIndex = -1;
    let lastEndIndex = -1;
    let isRendering = false;
    let poolInitialized = false;
    const prefetchedUrls = new Set();
    let localStorageCounter = 0;
