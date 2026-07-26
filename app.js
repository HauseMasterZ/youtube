document.addEventListener("DOMContentLoaded", () => {
    const playlistSelect = document.getElementById("playlist-select");
    const searchInput = document.getElementById("search-input");
    const playlistContainer = document.getElementById("playlist-container");
    const playlistMessage = document.getElementById("playlist-message");
    const trackList = document.getElementById("track-list");
    const audioPlayer = document.getElementById("audio-player");
    const currentTitle = document.getElementById("current-title");
    const currentChannel = document.getElementById("current-channel");
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

    const baseUrl = "https://media-proxy.system-cache-node.workers.dev";
    function getSearchString(track) { return (track.title + " " + track.channel).toLowerCase(); }
    function getThumbUrl(track) { return track.thumbnail_path ? `${baseUrl}/${track.thumbnail_path.split('/').map(encodeURIComponent).join('/')}` : null; }
    function getAudioUrl(track) { return `${baseUrl}/${track.file_path.split('/').map(encodeURIComponent).join('/')}`; }

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

    function applyShuffleUI() {
        btnShuffle.classList.remove("active-state");
        iconShuffle.style.display = "block";
        iconShuffleOne.style.display = "none";
        if (shuffleMode === 1) {
            btnShuffle.classList.add("active-state");
        } else if (shuffleMode === 2) {
            btnShuffle.classList.add("active-state");
            iconShuffle.style.display = "none";
            iconShuffleOne.style.display = "block";
        }
    }
    
    function applyRepeatUI() {
        btnRepeat.classList.remove("active-state");
        iconRepeat.style.display = "block";
        iconRepeatOne.style.display = "none";
        if (repeatMode === 1) { 
            btnRepeat.classList.add("active-state");
        } else if (repeatMode === 2) { 
            btnRepeat.classList.add("active-state");
            iconRepeat.style.display = "none";
            iconRepeatOne.style.display = "block";
        }
    }

    applyShuffleUI();
    applyRepeatUI();
    let isSeeking = false;
    let crossShuffleHistory = [];
    let crossShufflePos = -1;
    
    // Lyrics State
    let lyricsActive = false;
    let currentLyrics = []; // Array of { time: float, text: string }
    let fetchingLyrics = false;
    
    // UI Throttling
    let lastRenderTime = -1;
    let syncRAFId = null;
    let searchDebounceTimer = null;
    let errorSkipTimer = null;
    let storedThumbsDisabled = localStorage.getItem('thumbsDisabled');
    let thumbsDisabled = storedThumbsDisabled === null ? true : storedThumbsDisabled === 'true';
    
    let activeObjectURL = null;
    let currentPlaybackSequence = 0;
    const preloadedBlobs = new Map(); // audioUrl -> blobUrl
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
    
    // Environment Feature Checks
    const hasMediaSession = 'mediaSession' in navigator;
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // --- Network Bootstrapping Optimization ---
    function preloadAllPlaylists(excludePl) {
        ALL_PLAYLISTS.forEach(pl => {
            if (pl !== excludePl && !allDatabases[pl]) {
                fetch(`${baseUrl}/${pl}/_Playlist_Database.json`)
                    .then(res => res.json())
                    .then(data => {
                        allDatabases[pl] = data;
                    }).catch(e => {});
            }
        });
    }

    async function loadPlaylist(folderName) {
        trackList.style.display = 'none';
        playlistMessage.style.display = 'block';
        playlistMessage.textContent = 'Loading...';
        playlistMessage.style.color = 'var(--text-secondary)';
        
        try {
            if (!allDatabases[folderName]) {
                const res = await fetch(`${baseUrl}/${folderName}/_Playlist_Database.json`);
                if (!res.ok) throw new Error();
                const data = await res.json();
                
                allDatabases[folderName] = data;
            }
            
            currentPlaylistData = allDatabases[folderName];
            
            searchInput.value = '';
            filteredIndices = currentPlaylistData.map((_, i) => ({ playlist: folderName, index: i }));
            
            trackList.style.height = `${filteredIndices.length * ITEM_HEIGHT}px`;
            globalActiveOriginalIndex = -1;
            poolInitialized = false;
            prefetchedUrls.clear();
            
            generateQueue(true); 
            
            trackList.style.display = 'block';
            playlistMessage.style.display = 'none';
            // Force first render
            lastStartIndex = -1;
            renderVirtualTracks();
        } catch (error) {
            trackList.style.display = 'none';
            playlistMessage.style.display = 'block';
            playlistMessage.textContent = 'Failed to load playlist database.';
            playlistMessage.style.color = '#ff5555';
        }
    }

    searchInput.addEventListener("input", (e) => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            selectedSearchIndex = -1;
            const query = e.target.value.toLowerCase().trim();
            const currentPl = playlistSelect.value;
            
            if (!query) {
                filteredIndices = currentPlaylistData.map((_, i) => ({ playlist: currentPl, index: i }));
            } else {
                filteredIndices = [];
                const addedIds = new Set();
                
                // 1. Current playlist matches
                if (currentPlaylistData) {
                    for (let i = 0; i < currentPlaylistData.length; i++) {
                        const track = currentPlaylistData[i];
                        if (getSearchString(track).includes(query)) {
                            filteredIndices.push({ playlist: currentPl, index: i });
                            addedIds.add(track.id || track.file_path);
                        }
                    }
                }
                
                // 2. Global matches (other playlists)
                for (const pl of ALL_PLAYLISTS) {
                    if (pl !== currentPl && allDatabases[pl]) {
                        const data = allDatabases[pl];
                        for (let i = 0; i < data.length; i++) {
                            const track = data[i];
                            if (getSearchString(track).includes(query)) {
                                if (!addedIds.has(track.id || track.file_path)) {
                                    filteredIndices.push({ playlist: pl, index: i });
                                    addedIds.add(track.id || track.file_path);
                                }
                            }
                        }
                    }
                }
            }
            
            if (filteredIndices.length > 0) {
                trackList.style.height = `${filteredIndices.length * ITEM_HEIGHT}px`;
                trackList.style.display = 'block';
                playlistMessage.style.display = 'none';
            } else {
                trackList.style.display = 'none';
                playlistMessage.style.display = 'block';
                playlistMessage.textContent = 'No results found.';
                playlistMessage.style.color = 'var(--text-secondary)';
            }
            
            playlistContainer.scrollTop = 0;
            
            lastStartIndex = -1;
            renderVirtualTracks();
        }, 150);
    });

    searchInput.addEventListener("keydown", (e) => {
        if (filteredIndices.length === 0) return;
        
        if (e.key === "ArrowDown") {
            e.preventDefault();
            selectedSearchIndex = Math.min(filteredIndices.length - 1, selectedSearchIndex + 1);
            playlistContainer.scrollTop = Math.max(0, (selectedSearchIndex * ITEM_HEIGHT) - (playlistContainer.clientHeight / 2) + (ITEM_HEIGHT / 2));
            lastStartIndex = -1; // force render
            renderVirtualTracks();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            selectedSearchIndex = Math.max(0, selectedSearchIndex - 1);
            playlistContainer.scrollTop = Math.max(0, (selectedSearchIndex * ITEM_HEIGHT) - (playlistContainer.clientHeight / 2) + (ITEM_HEIGHT / 2));
            lastStartIndex = -1; // force render
            renderVirtualTracks();
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (selectedSearchIndex >= 0 && selectedSearchIndex < filteredIndices.length) {
                const item = filteredIndices[selectedSearchIndex];
                playTrackSelection(item.playlist, item.index);
                searchInput.blur();
            }
        }
    });

    function renderVirtualTracks() {
        if (!currentPlaylistData || currentPlaylistData.length === 0) return;
        
        if (filteredIndices.length === 0) {
            isRendering = false;
            return;
        }

        const scrollTop = playlistContainer.scrollTop;
        const containerHeight = playlistContainer.clientHeight || 400;

        // Render buffer (10 items above and below viewport for thumbnail pre-loading)
        const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - 10);
        const endIndex = Math.min(filteredIndices.length - 1, Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + 10);

        // Only redraw DOM if the index window actually shifted
        if (lastStartIndex === startIndex && lastEndIndex === endIndex) {
            return; 
        }

        lastStartIndex = startIndex;
        lastEndIndex = endIndex;
        isRendering = true;

        const requiredNodes = Math.max(0, endIndex - startIndex + 1);
        const currentPl = playlistSelect.value;
        
        // DOM Object Pooling: Only create elements if we don't have enough in the pool
        while (trackList.children.length < requiredNodes) {
            const li = document.createElement("li");
            li.style.display = "flex";
            li.style.alignItems = "center";
            
            const thumbImg = document.createElement("img");
            thumbImg.className = "track-thumb";
            thumbImg.decoding = "async";
            thumbImg.fetchPriority = "low";
            thumbImg.alt = "";
            
            const textSpan = document.createElement("span");
            textSpan.style.flex = "1";
            textSpan.style.whiteSpace = "nowrap";
            textSpan.style.overflow = "hidden";
            textSpan.style.textOverflow = "ellipsis";
            textSpan.style.paddingRight = "40px";
            
            const linkA = document.createElement("a");
            linkA.target = "_blank";
            linkA.className = "yt-link-icon";
            linkA.title = "Open on YouTube";
            linkA.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>';
            linkA.addEventListener("click", (e) => e.stopPropagation());
            
            li.appendChild(thumbImg);
            li.appendChild(textSpan);
            li.appendChild(linkA);
            trackList.appendChild(li);
        }
        poolInitialized = true;
        
        // Hide any excess pooled nodes
        for (let i = requiredNodes; i < trackList.children.length; i++) {
            trackList.children[i].style.display = "none";
        }

        let childIdx = 0;
        for (let i = startIndex; i <= endIndex; i++) {
            const item = filteredIndices[i];
            const track = allDatabases[item.playlist][item.index];
            const li = trackList.children[childIdx++];
            const thumbImg = li.childNodes[0];
            const textSpan = li.childNodes[1];
            const linkA = li.childNodes[2];
            
            li.style.display = "flex";
            li.dataset.playlist = item.playlist;
            li.dataset.index = item.index;
            li.style.top = `${i * ITEM_HEIGHT}px`;
            
            const isCurrentPlaylist = (item.playlist === currentPl);
            
            li.classList.remove("active", "search-highlight");
            if (i === selectedSearchIndex) {
                li.classList.add("search-highlight");
            } else if (isCurrentPlaylist && item.index === globalActiveOriginalIndex) {
                li.classList.add("active");
            }
            
            let text = `${track.title} - ${track.channel}`;
            
            if (!isCurrentPlaylist) {
                text = `[In ${item.playlist}] ` + text;
                li.style.color = 'var(--text-secondary)';
            } else {
                li.style.color = ''; // reset to CSS default
            }
            
            if (track.is_dead) {
                li.style.color = '#ff5555';
                text += ' [DEAD]';
            }
            
            if (!thumbsDisabled && getThumbUrl(track)) {
                if (thumbImg.dataset.targetSrc !== getThumbUrl(track)) {
                    thumbImg.dataset.targetSrc = getThumbUrl(track);
                    
                    if (requestedThumbs.has(getThumbUrl(track))) {
                        thumbImg.src = getThumbUrl(track);
                    } else {
                        thumbImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                        
                        // Strictly delay thumbnail fetch to guarantee audio gets first network hit and debounce fast scrolling
                        setTimeout(() => {
                            if (thumbImg.dataset.targetSrc === getThumbUrl(track)) {
                                const url = getThumbUrl(track);
                                const temp = new Image();
                                temp.onload = () => {
                                    requestedThumbs.add(url);
                                    if (thumbImg.dataset.targetSrc === url) {
                                        thumbImg.src = url;
                                    }
                                };
                                temp.src = url;
                            }
                        }, 250);
                    }
                }
                thumbImg.style.display = "block";
            } else {
                thumbImg.style.display = "none";
                thumbImg.removeAttribute("src");
                thumbImg.removeAttribute("data-target-src");
            }
            
            textSpan.textContent = text;
            li.title = `${item.index + 1}. ${text}`; // Tooltip for full visibility of long names
            linkA.href = track.url || `https://www.youtube.com/watch?v=${track.id}`;
        }
        
        isRendering = false;
    }

    playlistContainer.addEventListener("scroll", () => {
        if (!isRendering) {
            window.requestAnimationFrame(renderVirtualTracks);
        }
    });

    function scrollToTrack(originalIndex) {
        const currentPl = playlistSelect.value;
        const virtualIndex = filteredIndices.findIndex(item => item.playlist === currentPl && item.index === originalIndex);
        
        if (virtualIndex === -1) {
            // Track is currently filtered out of view, silently update active class state
            lastStartIndex = -1;
            renderVirtualTracks();
            return; 
        }
        
        const scrollPos = virtualIndex * ITEM_HEIGHT;
        const containerHeight = playlistContainer.clientHeight || 400;
        playlistContainer.scrollTo({ 
            top: scrollPos - (containerHeight / 2) + (ITEM_HEIGHT / 2), 
            behavior: "instant" 
        });
        
        // Force highlight update immediately even during scroll
        lastStartIndex = -1;
        renderVirtualTracks();
    }
    // -----------------------------

    function generateQueue(resetPlayback = false) {
        let indices = Array.from({length: currentPlaylistData.length}, (_, i) => i);
        
        if (shuffleMode === 2) {
            const randomBuffer = new Uint32Array(1);
            for (let i = indices.length - 1; i > 0; i--) {
                window.crypto.getRandomValues(randomBuffer);
                const j = randomBuffer[0] % (i + 1);
                [indices[i], indices[j]] = [indices[j], indices[i]];
            }
            if (!resetPlayback && queueIndex !== -1) {
                const currentOriginalIndex = playQueue[queueIndex];
                indices = indices.filter(i => i !== currentOriginalIndex);
                indices.unshift(currentOriginalIndex);
                queueIndex = 0;
            }
        } else if (!resetPlayback && queueIndex !== -1) {
            const currentOriginalIndex = playQueue[queueIndex];
            queueIndex = currentOriginalIndex;
        }
        
        playQueue = indices;
        if (resetPlayback) queueIndex = -1;
    }

    // Helper for cross-playlist shuffle: switch playlist context and play a specific track
    function playFromPlaylist(playlist, trackIndex) {
        if (playlist !== playlistSelect.value) {
            playlistSelect.value = playlist;
            currentPlaylistData = allDatabases[playlist];
            searchInput.value = '';
            filteredIndices = currentPlaylistData.map((_, i) => ({ playlist: playlist, index: i }));
            trackList.style.height = `${filteredIndices.length * ITEM_HEIGHT}px`;
            poolInitialized = false;
            prefetchedUrls.clear();
            playQueue = Array.from({length: currentPlaylistData.length}, (_, i) => i);
        }
        queueIndex = trackIndex;
        executePlayback();
    }

    function playTrackSelection(targetPlaylist, targetOriginalIndex) {
        // Add to cross-shuffle history if in mode 2
        if (shuffleMode === 1) {
            crossShuffleHistory.length = crossShufflePos + 1;
            crossShuffleHistory.push({ playlist: targetPlaylist, index: targetOriginalIndex });
            crossShufflePos++;
        }
        
        if (targetPlaylist !== playlistSelect.value) {
            if (shuffleMode === 1) {
                // In shuffle-all mode, use lightweight playlist switch
                playFromPlaylist(targetPlaylist, targetOriginalIndex);
            } else {
                // Cross-playlist jump with full reload
                playlistSelect.value = targetPlaylist;
                
                // Clear search before loading new playlist so filteredIndices syncs properly
                if (searchInput.value.trim() !== "") {
                    searchInput.value = "";
                }
                
                loadPlaylist(targetPlaylist).then(() => {
                    queueIndex = playQueue.indexOf(targetOriginalIndex);
                    executePlayback();
                });
            }
        } else {
            // If we are playing from a search, clear the search instantly
            if (searchInput.value.trim() !== "") {
                searchInput.value = "";
                filteredIndices = currentPlaylistData.map((_, i) => ({ playlist: playlistSelect.value, index: i }));
                trackList.style.height = `${filteredIndices.length * ITEM_HEIGHT}px`;
            }
            queueIndex = playQueue.indexOf(targetOriginalIndex);
            executePlayback();
        }
    }

    trackList.addEventListener("click", (e) => {
        const li = e.target.closest("li");
        if (!li || !li.dataset.index || !li.dataset.playlist) return;
        
        playTrackSelection(li.dataset.playlist, parseInt(li.dataset.index));
    });

    function playNext() {
        // Cross-playlist shuffle (mode 2)
        if (shuffleMode === 1) {
            if (crossShufflePos < crossShuffleHistory.length - 1) {
                // Navigating forward through existing history
                crossShufflePos++;
            } else {
                // Pick random track from any loaded playlist uniformly
                const loadedPls = ALL_PLAYLISTS.filter(pl => allDatabases[pl]);
                if (loadedPls.length === 0) return;
                
                let totalTracks = 0;
                const plOffsets = [];
                for (const pl of loadedPls) {
                    plOffsets.push({ playlist: pl, start: totalTracks, count: allDatabases[pl].length });
                    totalTracks += allDatabases[pl].length;
                }
                
                const randomBuffer = new Uint32Array(1);
                window.crypto.getRandomValues(randomBuffer);
                const randomGlobalIdx = randomBuffer[0] % totalTracks;
                
                let randomPl = loadedPls[0];
                let randomIdx = 0;
                for (const offset of plOffsets) {
                    if (randomGlobalIdx >= offset.start && randomGlobalIdx < offset.start + offset.count) {
                        randomPl = offset.playlist;
                        randomIdx = randomGlobalIdx - offset.start;
                        break;
                    }
                }
                crossShuffleHistory.length = crossShufflePos + 1;
                crossShuffleHistory.push({ playlist: randomPl, index: randomIdx });
                crossShufflePos++;
            }
            const entry = crossShuffleHistory[crossShufflePos];
            playFromPlaylist(entry.playlist, entry.index);
            return;
        }
        
        if (playQueue.length === 0) return;
        
        if (queueIndex + 1 < playQueue.length) {
            queueIndex++;
            executePlayback();
        } else if (repeatMode === 1) { 
            queueIndex = 0;
            executePlayback();
        } else {
            setPlayUI(false);
        }
    }

    function playPrev() {
        // Cross-playlist shuffle (mode 2)
        if (shuffleMode === 1) {
            if (crossShufflePos > 0) {
                crossShufflePos--;
                const entry = crossShuffleHistory[crossShufflePos];
                playFromPlaylist(entry.playlist, entry.index);
            } else {
                audioPlayer.currentTime = 0;
                updateTimeUI(0);
                audioPlayer.play();
            }
            return;
        }
        
        if (playQueue.length === 0) return;

        if (queueIndex > 0) {
            queueIndex--;
            executePlayback();
        } else if (repeatMode === 1) {
            queueIndex = playQueue.length - 1;
            executePlayback();
        } else {
            audioPlayer.currentTime = 0;
            updateTimeUI(0);
            audioPlayer.play();
        }
    }
    

    function executePlayback(preventAutoplay = false) {
        // Cancel any pending error auto-skip when user manually selects a track
        if (errorSkipTimer) {
            clearTimeout(errorSkipTimer);
            errorSkipTimer = null;
        }
        if (queueIndex < 0 || queueIndex >= playQueue.length) return;
        
        currentPlaybackSequence++;
        const sequenceId = currentPlaybackSequence;
        
        const originalIndex = playQueue[queueIndex];
        globalActiveOriginalIndex = originalIndex;
        
        const track = currentPlaylistData[originalIndex];

        currentTitle.textContent = track.title;
        currentTitle.style.color = "#ffffff"; // Reset color in case it was red from an error
        currentChannel.textContent = track.channel;
        
        localStorage.setItem("lastPlaylist", playlistSelect.value);
        localStorage.setItem("lastTrackId", track.id);

        scrollToTrack(originalIndex);

        updateTimeUI(0);
        totalTimeDisplay.textContent = "0:00";

        // Halt current audio buffer to prevent 100ms jar clipping on skip
        audioPlayer.pause();
        
        // Android Lock-Screen Bypass: Play a silent WAV track before clearing `.src`
        // This tricks the OS into keeping the MediaSession bound and active during the gap!
        if (isMobileDevice && !preventAutoplay) {
            silentKeepAliveAudio.play().catch(e => {});
            if (silentKeepAliveTimer) clearTimeout(silentKeepAliveTimer);
            silentKeepAliveTimer = setTimeout(() => silentKeepAliveAudio.pause(), 10000);
        }
        
        audioPlayer.currentTime = 0;
        
        if (hasMediaSession) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: track.title,
                artist: track.channel,
                artwork: (!thumbsDisabled && getThumbUrl(track)) ? [{ src: getThumbUrl(track), sizes: '1280x720', type: 'image/jpeg' }] : []
            });
            navigator.mediaSession.playbackState = preventAutoplay ? "none" : "playing";
        }
        const audioUrl = getAudioUrl(track);
        
        // Fast-path: Revoke old object URL if any
        if (activeObjectURL) {
            URL.revokeObjectURL(activeObjectURL);
            activeObjectURL = null;
        }
        
        const cacheKey = `${baseUrl}/_cache/${track.id}`;
        
        // Mobile & Desktop natively stream the audioUrl for instant playback
        // If it was already preloaded into memory blob, use it
        if (preloadedBlobs.has(cacheKey)) {
            activeObjectURL = preloadedBlobs.get(cacheKey);
            audioPlayer.src = activeObjectURL;
        } else {
            audioPlayer.src = audioUrl;
            
            // 5-second Delayed Background Offline Caching
            // If user listens for 5s, we trigger a silent background fetch to cache the entire song offline
            if (isMobileDevice) {
                setTimeout(() => {
                    if (currentPlaybackSequence === sequenceId && !audioPlayer.paused) {
                        caches.match(cacheKey).then(cachedResponse => {
                            if (!cachedResponse) {
                                fetch(audioUrl, { priority: 'low' }).then(response => {
                                    if (response.ok) {
                                        caches.open('yt-player-media').then(cache => cache.put(cacheKey, response.clone()));
                                    }
                                }).catch(() => {});
                            }
                        });
                    }
                }, 5000);
            }
        }
        
        // Force the media engine to synchronously drop the old buffer and parse the new src
        // This prevents Chrome from playing a 100ms jar-clip of the old song if play() executes before the async load begins
        audioPlayer.load();
        
        currentTitle.textContent = track.title;
        if (!preventAutoplay) {
            audioPlayer.play().catch(e => {});
        }
        triggerPreloads();

        if (!thumbsDisabled && getThumbUrl(track)) {
            const thumbUrl = getThumbUrl(track);
            if (dominantColorCache.has(track.id)) {
                // Instantly apply cached assets without any blocking or flicker
                document.documentElement.style.setProperty('--primary-color', dominantColorCache.get(track.id));
                albumArt.src = thumbUrl;
                albumArt.style.display = 'block';
            } else {
                // Seamlessly preload new thumbnail in the background while keeping the old one visible
                const tempImg = new Image();
                tempImg.crossOrigin = "Anonymous";
                tempImg.onload = () => {
                    // Only apply if the user hasn't frantically skipped to another track while it was loading
                    if (currentPlaybackSequence === sequenceId) {
                        const color = getDominantColor(tempImg, track.id);
                        document.documentElement.style.setProperty('--primary-color', color);
                        albumArt.src = thumbUrl;
                        albumArt.style.display = 'block';
                    }
                };
                // Delay network fetch by 50ms to ensure the audio stream gets initial network priority
                setTimeout(() => {
                    if (currentPlaybackSequence === sequenceId) {
                        tempImg.src = thumbUrl;
                    }
                }, 50);
            }
        } else {
            albumArt.style.display = 'none';
        }

        // MediaSession metadata already updated at the top of executePlayback
        
        if (lyricsActive) {
            loadLyrics(track);
        }
    }

    function preloadTrack(track) {
        if (isMobileDevice || !track) return;
        const audioUrl = getAudioUrl(track);
        const cacheKey = `${baseUrl}/_cache/${track.id}`;
        
        if (preloadedBlobs.has(cacheKey) || preloadedFetches.has(cacheKey)) return;
        
        const fetchPromise = caches.match(cacheKey).then(cachedResponse => {
            if (cachedResponse) return cachedResponse.blob();
            return fetch(audioUrl, { priority: 'low' }).then(response => {
                if (!response.ok) throw new Error();
                const cloned = response.clone();
                caches.open('yt-player-media').then(cache => cache.put(cacheKey, cloned));
                return response.blob();
            });
        }).then(blob => {
            if (!preloadedBlobs.has(cacheKey)) {
                preloadedBlobs.set(cacheKey, URL.createObjectURL(blob));
            }
            return blob;
        });
        
        fetchPromise.catch(e => {});
        preloadedFetches.set(cacheKey, fetchPromise);
    }

    function triggerPreloads() {
        if (isMobileDevice) return;
        
        let nextTrack = null;
        let prevTrack = null;
        
        if (shuffleMode === 1) {
            if (crossShufflePos < crossShuffleHistory.length - 1) {
                const entry = crossShuffleHistory[crossShufflePos + 1];
                if (allDatabases[entry.playlist]) nextTrack = allDatabases[entry.playlist][entry.index];
            } else {
                const loadedPls = ALL_PLAYLISTS.filter(pl => allDatabases[pl]);
                if (loadedPls.length > 0) {
                    let totalTracks = 0;
                    const plOffsets = [];
                    for (const pl of loadedPls) {
                        plOffsets.push({ playlist: pl, start: totalTracks, count: allDatabases[pl].length });
                        totalTracks += allDatabases[pl].length;
                    }
                    const randomBuffer = new Uint32Array(1);
                    window.crypto.getRandomValues(randomBuffer);
                    const randomGlobalIdx = randomBuffer[0] % totalTracks;
                    
                    let randomPl = loadedPls[0];
                    let randomIdx = 0;
                    for (const offset of plOffsets) {
                        if (randomGlobalIdx >= offset.start && randomGlobalIdx < offset.start + offset.count) {
                            randomPl = offset.playlist;
                            randomIdx = randomGlobalIdx - offset.start;
                            break;
                        }
                    }
                    // Generate ahead of time
                    crossShuffleHistory.push({ playlist: randomPl, index: randomIdx });
                    nextTrack = allDatabases[randomPl][randomIdx];
                }
            }
            if (crossShufflePos > 0) {
                const prevEntry = crossShuffleHistory[crossShufflePos - 1];
                if (allDatabases[prevEntry.playlist]) prevTrack = allDatabases[prevEntry.playlist][prevEntry.index];
            }
        } else {
            if (playQueue.length > 0) {
                let nIdx = queueIndex + 1;
                if (nIdx >= playQueue.length && repeatMode === 1) nIdx = 0;
                if (nIdx < playQueue.length) nextTrack = currentPlaylistData[playQueue[nIdx]];
                
                let pIdx = queueIndex - 1;
                if (pIdx < 0 && repeatMode === 1) pIdx = playQueue.length - 1;
                if (pIdx >= 0) prevTrack = currentPlaylistData[playQueue[pIdx]];
            }
        }
        
        const nextUrl = nextTrack ? getAudioUrl(nextTrack) : null;
        const prevUrl = prevTrack ? getAudioUrl(prevTrack) : null;
        const currentTrack = currentPlaylistData[playQueue[queueIndex]] || currentPlaylistData[globalActiveOriginalIndex];
        const currentUrl = currentTrack ? getAudioUrl(currentTrack) : null;
        
        for (const [url, blobUrl] of preloadedBlobs.entries()) {
            if (url !== nextUrl && url !== prevUrl && url !== currentUrl) {
                URL.revokeObjectURL(blobUrl);
                preloadedBlobs.delete(url);
                preloadedFetches.delete(url);
            }
        }
    }
    
    function parseLRC(text) {
        const lines = text.split(/\r?\n/);
        const lyrics = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // Matches [mm:ss.xx] or [mm:ss.xxx]
            const match = line.match(/^\[(\d{2,}):(\d{2})(?:\.(\d{2,3}))?\](.*)/);
            if (match) {
                const mins = parseInt(match[1]);
                const secs = parseInt(match[2]);
                const msStr = match[3] || '0';
                const ms = parseInt(msStr.padEnd(3, '0'));
                const seconds = mins * 60 + secs + ms / 1000;
                
                const textLine = match[4].trim();
                if (textLine) {
                    lyrics.push({ time: seconds, text: textLine });
                }
            }
        }
        return lyrics;
    }

    async function loadLyrics(track) {
        lyricsContent.innerHTML = '<p class="lyrics-placeholder" style="font-size: 32px; letter-spacing: 4px; font-weight: 800; color: var(--primary-color); opacity: 0.8; margin: auto;">...</p>';
        lyricsContent.style.display = 'flex';
        currentLyrics = [];
        fetchingLyrics = true;
        
        try {
            const parts = track.file_path.split('/');
            const folder = parts[0];
            const lyricsUrl = `${baseUrl}/${encodeURIComponent(folder)}/lyrics/${encodeURIComponent(track.id)}.lrc`;
            
            const res = await fetch(lyricsUrl, { priority: 'low' });
            if (!res.ok) throw new Error();
            const text = await res.text();
            currentLyrics = parseLRC(text);
            
            if (currentLyrics.length === 0) throw new Error();
            
            if (currentLyrics[0].time > 0) {
                currentLyrics.unshift({ time: 0, text: "..." });
            }
            
            lyricsContent.innerHTML = '';
            lyricsContent.style.display = 'block'; // Remove inline flex styles
            
            const lyricsInner = document.createElement('div');
            lyricsInner.id = 'lyrics-inner';
            lyricsInner.className = 'lyrics-inner';
            
            const highlightLayer = document.createElement('div');
            highlightLayer.id = 'lyrics-highlight-layer';
            highlightLayer.className = 'lyrics-highlight-layer';
            
            lyricsInner.appendChild(highlightLayer);
            
            currentLyrics.forEach((line) => {
                const p = document.createElement('p');
                p.textContent = `[${formatTime(line.time)}] ${line.text}`;
                p.className = 'lyric-line';
                p.addEventListener('click', () => {
                    audioPlayer.currentTime = line.time;
                });
                lyricsInner.appendChild(p);
            });
            
            lyricsContent.appendChild(lyricsInner);
            
            // Build layout cache to prevent DOM layout thrashing
            requestAnimationFrame(() => {
                buildLyricsCache();
                if (lyricsActive) {
                    activeLyricIndex = -1;
                    updateLyricsUI(audioPlayer.currentTime);
                }
            });
        } catch (e) {
            lyricsContent.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:var(--text-secondary); opacity:0.6; margin:auto;">
                    <svg viewBox="0 0 24 24" style="width:48px; height:48px; fill:currentColor; margin-bottom:12px;">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
                    </svg>
                    <p style="font-size:1.1em; font-weight:500;">Lyrics not found</p>
                </div>
            `;
            lyricsContent.style.display = 'flex';
        }
        fetchingLyrics = false;
    }
    
    let activeLyricIndex = -1;
    let lyricsLayoutCache = [];
    let cachedLyricsClientHeight = 0;

    function buildLyricsCache() {
        lyricsLayoutCache = [];
        const lyricsInner = document.getElementById('lyrics-inner');
        if (!lyricsInner) return;
        
        cachedLyricsClientHeight = lyricsContent.clientHeight;
        
        for (let i = 1; i < lyricsInner.children.length; i++) {
            const p = lyricsInner.children[i];
            lyricsLayoutCache.push({
                top: p.offsetTop,
                height: p.offsetHeight,
                text: p.textContent
            });
        }
    }

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (lyricsActive) {
                buildLyricsCache();
                if (activeLyricIndex >= 0 && activeLyricIndex < lyricsLayoutCache.length) {
                    const cache = lyricsLayoutCache[activeLyricIndex];
                    const highlightLayer = document.getElementById('lyrics-highlight-layer');
                    if (highlightLayer) {
                        highlightLayer.style.height = `${cache.height}px`;
                        highlightLayer.style.transform = `translateY(${cache.top}px)`;
                    }
                }
            }
        }, 200);
    });

    function updateLyricsUI(currentTime) {
        if (!lyricsActive || currentLyrics.length === 0) return;
        
        let newIndex = -1;
        for (let i = currentLyrics.length - 1; i >= 0; i--) {
            if (currentTime >= currentLyrics[i].time) {
                newIndex = i;
                break;
            }
        }
        
        if (newIndex !== activeLyricIndex && newIndex !== -1) {
            activeLyricIndex = newIndex;
            
            if (activeLyricIndex >= 0 && activeLyricIndex < lyricsLayoutCache.length) {
                const cache = lyricsLayoutCache[activeLyricIndex];
                const highlightLayer = document.getElementById('lyrics-highlight-layer');
                
                if (highlightLayer) {
                    highlightLayer.style.display = 'block';
                    highlightLayer.textContent = cache.text;
                    highlightLayer.style.height = `${cache.height}px`;
                    highlightLayer.style.transform = `translateY(${cache.top}px)`;
                    highlightLayer.style.color = 'var(--primary-color)';
                }
            }
        }
    }

    let lyricsRafId = null;
    let lastLyricsRender = 0;
    
    function lyricsLoop(timestamp) {
        if (!lyricsActive || audioPlayer.paused) {
            lyricsRafId = null;
            return;
        }
        
        // Throttle to ~15fps (66ms per frame)
        if (timestamp - lastLyricsRender >= 66) {
            lastLyricsRender = timestamp;
            updateLyricsUI(audioPlayer.currentTime);
        }
        
        lyricsRafId = requestAnimationFrame(lyricsLoop);
    }


    function pushHistoryState(viewName) {
        history.pushState({ view: viewName }, "");
    }

    function closeLyricsUI() {
        lyricsActive = false;
        lyricsToggleHint.style.color = 'var(--text-secondary)';
        lyricsContainer.style.display = 'none';
        if (lyricsRafId) {
            cancelAnimationFrame(lyricsRafId);
            lyricsRafId = null;
        }
    }

    window.addEventListener("popstate", (e) => {
        const view = e.state ? e.state.view : null;
        if (view !== 'lyrics' && lyricsActive) {
            closeLyricsUI();
        }
        if (view !== 'player' && view !== 'lyrics' && nowPlaying.classList.contains("expanded")) {
            nowPlaying.classList.remove("expanded");
        }
    });

    lyricsToggleHint.addEventListener('click', () => {
        if (!lyricsActive) {
            lyricsActive = true;
            pushHistoryState('lyrics');
            lyricsToggleHint.style.color = 'var(--primary-color)';
            lyricsContainer.style.display = 'flex';
            if (queueIndex >= 0 && queueIndex < playQueue.length) {
                loadLyrics(currentPlaylistData[playQueue[queueIndex]]);
            }
            if (!audioPlayer.paused && !lyricsRafId) {
                lyricsRafId = requestAnimationFrame(lyricsLoop);
            }
        } else {
            history.back();
        }
    });

    document.getElementById('btn-close-lyrics').addEventListener('click', () => {
        if (lyricsActive) history.back();
    });

    function setPlayUI(isPlaying) {
        if (isPlaying) {
            iconPlay.style.display = 'none';
            iconPause.style.display = 'block';
        } else {
            iconPlay.style.display = 'block';
            iconPause.style.display = 'none';
        }
    }

    function formatTime(seconds) {
        if (isNaN(seconds)) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    function updateTimeUI(seconds) {
        if (seconds === lastRenderTime) return;
        seekBar.value = seconds;
        currentTimeDisplay.textContent = formatTime(seconds);
        lastRenderTime = seconds;
    }

    btnPlayPause.addEventListener("click", () => {
        if (!audioPlayer.src) return; 
        if (audioPlayer.paused) {
            audioPlayer.play().catch(e => {
                // Audio Element Revival: If Android suspended the decoder during a pause, reload the stream.
                const savedTime = audioPlayer.currentTime;
                const currentSrc = audioPlayer.src;
                
                // Do not set src = '' as it triggers MEDIA_ERR_SRC_NOT_SUPPORTED on remote streams
                audioPlayer.removeAttribute("src");
                audioPlayer.load();
                audioPlayer.src = currentSrc;
                
                // For remote streams, we must wait until metadata is parsed before seeking
                const onMeta = () => {
                    audioPlayer.currentTime = savedTime;
                    audioPlayer.play().catch(err => console.error("Revival failed:", err));
                    audioPlayer.removeEventListener('loadedmetadata', onMeta);
                };
                audioPlayer.addEventListener('loadedmetadata', onMeta);
            });
        } else {
            audioPlayer.pause();
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.code === "Space" && document.activeElement !== searchInput) {
            e.preventDefault();
            btnPlayPause.click();
        }
    });

    btnNext.addEventListener("click", playNext);
    btnPrev.addEventListener("click", playPrev);

    btnShuffle.addEventListener("click", () => {
        shuffleMode = (shuffleMode + 1) % 3;
        localStorage.setItem('shuffleMode', shuffleMode);
        applyShuffleUI();

        if (shuffleMode === 1) {
            // Shuffle all: cross-playlist random
            generateQueue(false); // un-shuffle current playlist queue
            crossShuffleHistory = [];
            crossShufflePos = -1;
            // Seed history with current track if one is playing
            if (queueIndex >= 0 && queueIndex < playQueue.length) {
                crossShuffleHistory.push({ playlist: playlistSelect.value, index: playQueue[queueIndex] });
                crossShufflePos = 0;
            }
        } else if (shuffleMode === 2) {
            // Shuffle once: current playlist only
            generateQueue(false);
        } else {
            // Off
            crossShuffleHistory = [];
            crossShufflePos = -1;
            generateQueue(false);
        }
    });

    btnRepeat.addEventListener("click", () => {
        repeatMode = (repeatMode + 1) % 3;
        localStorage.setItem('repeatMode', repeatMode);
        applyRepeatUI();
    });

    function updateMediaSessionPosition() {
        if (hasMediaSession && !isNaN(audioPlayer.duration) && audioPlayer.duration > 0) {
            navigator.mediaSession.setPositionState({
                duration: audioPlayer.duration,
                playbackRate: audioPlayer.playbackRate,
                position: audioPlayer.currentTime
            });
        }
    }

    audioPlayer.addEventListener("loadedmetadata", () => {
        const duration = Math.floor(audioPlayer.duration);
        seekBar.max = duration;
        totalTimeDisplay.textContent = formatTime(duration);
        updateMediaSessionPosition();
    });

    // --- Deep Sleep JS Engine Integration (1Hz timer) ---
    function syncLoop() {
        syncRAFId = null;
        if (audioPlayer.paused || document.hidden) return;
        if (!isSeeking && audioPlayer.duration) {
            const ct = Math.floor(audioPlayer.currentTime);
            if (ct !== lastRenderTime) {
                updateTimeUI(ct);
                if (++localStorageCounter >= 5) {
                    localStorageCounter = 0;
                    localStorage.setItem("lastTime", audioPlayer.currentTime);
                }
            }
        }
        syncRAFId = setTimeout(syncLoop, 1000);
    }

    function startSync() {
        if (!syncRAFId && !audioPlayer.paused && !document.hidden) {
            syncRAFId = setTimeout(syncLoop, 1000);
        }
    }

    function stopSync() {
        if (syncRAFId) {
            clearTimeout(syncRAFId);
            syncRAFId = null;
        }
    }

    audioPlayer.addEventListener("play", () => {
        setPlayUI(true);
        startSync();
        updateMediaSessionPosition();
        if (hasMediaSession) {
            navigator.mediaSession.playbackState = 'playing';
        }
        if (lyricsActive && !lyricsRafId) {
            lyricsRafId = requestAnimationFrame(lyricsLoop);
        }
        if (isMobileDevice) {
            silentKeepAliveAudio.pause();
            if (silentKeepAliveTimer) clearTimeout(silentKeepAliveTimer);
        }
    });
    audioPlayer.addEventListener("pause", () => {
        setPlayUI(false);
        stopSync();
        updateMediaSessionPosition();
        if (hasMediaSession) {
            navigator.mediaSession.playbackState = 'paused';
        }
        // Flush position to localStorage immediately on pause
        if (audioPlayer.currentTime > 0) {
            localStorage.setItem("lastTime", audioPlayer.currentTime);
        }
    });

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            stopSync();
        } else {
            if (!audioPlayer.paused) {
                updateTimeUI(Math.floor(audioPlayer.currentTime));
                startSync();
            }
        }
    });

    // --- Mobile Mini Player Expand/Collapse Logic ---
    nowPlaying.addEventListener("click", (e) => {
        if (window.innerWidth <= 800 && !nowPlaying.classList.contains("expanded")) {
            if (e.target.closest('.control-btn')) return;
            nowPlaying.classList.add("expanded");
            pushHistoryState('player');
        }
    });

    btnCollapse.addEventListener("click", (e) => {
        e.stopPropagation();
        if (nowPlaying.classList.contains("expanded")) {
            history.back();
        }
    });

    if (hasTouch) {
        let touchStartY = 0;
        nowPlaying.addEventListener("touchstart", (e) => {
            touchStartY = e.changedTouches[0].screenY;
        }, {passive: true});
        
        nowPlaying.addEventListener("touchend", (e) => {
            if (window.innerWidth > 800) return;
            let touchEndY = e.changedTouches[0].screenY;
            if (nowPlaying.classList.contains("expanded") && touchEndY > touchStartY + 50) {
                // Swipe down to close
                history.back();
            } else if (!nowPlaying.classList.contains("expanded") && touchEndY < touchStartY - 20) {
                // Swipe up to expand
                nowPlaying.classList.add("expanded");
                pushHistoryState('player');
            }
        }, {passive: true});
    }
    // ----------------------------------------

    seekBar.addEventListener("input", () => {
        isSeeking = true;
        currentTimeDisplay.textContent = formatTime(seekBar.value);
    });

    seekBar.addEventListener("change", (e) => {
        audioPlayer.currentTime = Number(e.target.value);
        isSeeking = false;
        updateTimeUI(Number(e.target.value));
        if (lyricsActive) updateLyricsUI(audioPlayer.currentTime);
        updateMediaSessionPosition();
    });

    audioPlayer.addEventListener("ended", () => {
        if (repeatMode === 2) { 
            audioPlayer.currentTime = 0;
            updateTimeUI(0);
            audioPlayer.play();
        } else {
            playNext();
        }
    });

    audioPlayer.addEventListener("error", () => {
        currentTitle.textContent = "Error loading file... skipping";
        currentTitle.style.color = "#ff5555";
        setPlayUI(false);
        
        // Clearing src prevents the OS from tearing down the MediaSession due to a broken media state
        audioPlayer.removeAttribute("src");
        audioPlayer.load();
        if (hasMediaSession) {
            navigator.mediaSession.playbackState = "playing";
        }
        
        errorSkipTimer = setTimeout(() => {
            errorSkipTimer = null;
            playNext();
        }, 3000);
    });

    const albumArtContainer = document.getElementById('album-art-container');
    const thumbToggleHint = document.getElementById('thumb-toggle-hint');

    albumArt.addEventListener("error", () => {
        albumArt.style.display = 'none';
    });
    
    function getDominantColor(imgEl, trackId) {
        if (trackId && dominantColorCache.has(trackId)) return dominantColorCache.get(trackId);
        if (imgEl.dataset && imgEl.dataset.precomputedColor) return imgEl.dataset.precomputedColor;
        let canvas = document.createElement('canvas');
        let ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return '#8c73ff';
        canvas.width = 10; canvas.height = 10;
        try {
            ctx.drawImage(imgEl, 0, 0, 10, 10);
            let data = ctx.getImageData(0, 0, 10, 10).data;
            let r=0, g=0, b=0, count=0;
            for (let i = 0; i < data.length; i += 4) {
                let pr = data[i], pg = data[i+1], pb = data[i+2];
                let max = Math.max(pr, pg, pb), min = Math.min(pr, pg, pb);
                if (max > 40 && max < 250 && (max - min) > 15) { 
                    r += pr; g += pg; b += pb; count++;
                }
            }
            if (count === 0) { 
                for (let i = 0; i < data.length; i += 4) {
                    r += data[i]; g += data[i+1]; b += data[i+2]; count++;
                }
            }
            if (count === 0) return '#8c73ff';
            r = Math.floor(r/count); g = Math.floor(g/count); b = Math.floor(b/count);
            let brightness = (r * 299 + g * 587 + b * 114) / 1000;
            if (brightness < 120) {
                let factor = 120 / Math.max(brightness, 1);
                r = Math.min(255, Math.floor(r * factor));
                g = Math.min(255, Math.floor(g * factor));
                b = Math.min(255, Math.floor(b * factor));
            }
            const finalColor = `rgb(${r}, ${g}, ${b})`;
            if (trackId) dominantColorCache.set(trackId, finalColor);
            return finalColor;
        } catch(e) { return '#8c73ff'; }
    }

    // Initialize thumb toggle hint visibility
    if (thumbsDisabled) {
        thumbToggleHint.style.display = 'block';
    }

    let lastArtClickTime = 0;
    
    albumArtContainer.addEventListener("click", (e) => {
        e.stopPropagation();
        
        const rect = albumArtContainer.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        
        const isLeft = clickX < width * 0.33;
        const isRight = clickX > width * 0.66;
        const isMiddle = !isLeft && !isRight;

        const now = Date.now();
        const isDoubleClick = (now - lastArtClickTime) < 300;
        lastArtClickTime = now;

        if (isDoubleClick) {
            if (isLeft) {
                audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 5);
                updateTimeUI(audioPlayer.currentTime);
                if (lyricsActive) updateLyricsUI(audioPlayer.currentTime);
                updateMediaSessionPosition();
            } else if (isRight) {
                audioPlayer.currentTime = Math.min(audioPlayer.duration || 0, audioPlayer.currentTime + 5);
                updateTimeUI(audioPlayer.currentTime);
                if (lyricsActive) updateLyricsUI(audioPlayer.currentTime);
                updateMediaSessionPosition();
            }
            return;
        }

        if (isMiddle) {
            thumbsDisabled = !thumbsDisabled;
            localStorage.setItem('thumbsDisabled', thumbsDisabled);
            
            if (thumbsDisabled) {
                albumArt.style.display = 'none';
                thumbToggleHint.style.display = 'block';
                document.documentElement.style.setProperty('--primary-color', '#8c73ff');
            } else {
                thumbToggleHint.style.display = 'none';
                if (queueIndex >= 0 && queueIndex < playQueue.length) {
                    const track = currentPlaylistData[playQueue[queueIndex]];
                    if (track && getThumbUrl(track)) {
                        albumArt.src = getThumbUrl(track);
                        albumArt.style.display = 'block';
                    }
                }
            }
            
            // Re-render track list to show/hide track thumbs
            lastStartIndex = -1;
            renderVirtualTracks();
        }
    });

    let lastValidPlaylist = playlistSelect.value;
    playlistSelect.addEventListener("change", async (e) => {
        if (e.target.value === "INSTALL_APP") {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                deferredPrompt = null;
            } else {
                alert("App is already installed or your browser doesn't support PWA installation!");
            }
            playlistSelect.value = lastValidPlaylist;
            return;
        }
        
        lastValidPlaylist = e.target.value;
        if (shuffleMode !== 1) {
            crossShuffleHistory = [];
            crossShufflePos = -1;
        }
        loadPlaylist(e.target.value);
    });

    // Media Session Global Action Handlers (Bound exactly once to prevent CPU overhead on track change)
    if (hasMediaSession) {
        navigator.mediaSession.setActionHandler('play', () => {
            audioPlayer.play().catch(e => {
                // Audio Element Revival: If Android suspended the decoder during a pause, re-assigning the blob revives it.
                const savedTime = audioPlayer.currentTime;
                const currentSrc = audioPlayer.src;
                audioPlayer.src = '';
                audioPlayer.src = currentSrc;
                audioPlayer.currentTime = savedTime;
                audioPlayer.play().catch(err => console.error("Revival failed:", err));
            });
            if (hasMediaSession) navigator.mediaSession.playbackState = 'playing';
        });
        navigator.mediaSession.setActionHandler('pause', () => {
            audioPlayer.pause();
            if (hasMediaSession) navigator.mediaSession.playbackState = 'paused';
        });
        navigator.mediaSession.setActionHandler('previoustrack', playPrev);
        navigator.mediaSession.setActionHandler('nexttrack', playNext);
        navigator.mediaSession.setActionHandler('seekto', (details) => {
            if (details.fastSeek && 'fastSeek' in audioPlayer) {
                audioPlayer.fastSeek(details.seekTime);
            } else {
                audioPlayer.currentTime = details.seekTime;
            }
            updateTimeUI(details.seekTime);
            if (lyricsActive) updateLyricsUI(details.seekTime);
            updateMediaSessionPosition();
        });
    }

    // Initialize Fast-Boot
    const lastPlaylist = localStorage.getItem("lastPlaylist") || playlistSelect.value;
    if (ALL_PLAYLISTS.includes(lastPlaylist)) {
        playlistSelect.value = lastPlaylist;
    }
    
    // Load the active playlist instantaneously, defer others to the background
    loadPlaylist(playlistSelect.value).then(() => {
        preloadAllPlaylists(playlistSelect.value); // Non-blocking background preload
        
        const lastTrackId = localStorage.getItem("lastTrackId");
        if (lastTrackId) {
            const targetOriginalIndex = currentPlaylistData.findIndex(t => t.id === lastTrackId);
            if (targetOriginalIndex !== -1) {
                queueIndex = playQueue.indexOf(targetOriginalIndex);
                executePlayback(true); // true = preventAutoplay
                
                const savedTime = localStorage.getItem("lastTime");
                if (savedTime) {
                    localStorage.removeItem("lastTime"); // Clear immediately so it only applies once
                    const restoreTime = () => {
                        audioPlayer.removeEventListener("loadedmetadata", restoreTime);
                        if (localStorage.getItem("lastTrackId") === lastTrackId) {
                            audioPlayer.currentTime = parseFloat(savedTime);
                            updateTimeUI(parseFloat(savedTime));
                        }
                    };
                    audioPlayer.addEventListener("loadedmetadata", restoreTime);
                }
            }
        }
    });
    
    // Keyboard Shortcuts (Desktop Only)
    if (!isMobileDevice) {
        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'TEXTAREA' || (e.target.tagName === 'INPUT' && e.target.type !== 'range')) return;
            
            const key = e.key.toLowerCase();
            if (key === 's') {
                btnShuffle.click();
            } else if (key === 'r') {
                btnRepeat.click();
            } else if (key === 'q') {
                btnPrev.click();
            } else if (key === 'e') {
                btnNext.click();
            } else if (e.key === 'ArrowLeft') {
                audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 5);
            } else if (e.key === 'ArrowRight') {
                audioPlayer.currentTime = Math.min(audioPlayer.duration || 0, audioPlayer.currentTime + 5);
            }
        });
    }

});

    // --- Register Service Worker for PWA Installability ---
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').catch((error) => {
                console.error('ServiceWorker registration failed: ', error);
            });
        });
    }

    // PWA Install Button Logic
    let deferredPrompt;
    

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
    });
