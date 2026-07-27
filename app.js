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
    let currentLyricsIsAi = false;
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
        audioPlayer.muted = true; // Mute the player temporarily to hide hardware buffer clipping
        
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
                artwork: (!thumbsDisabled && getThumbUrl(track)) ? 
                    [{ src: getThumbUrl(track), sizes: '1280x720', type: 'image/jpeg' }] : 
                    [{ src: 'data:image/png;base64,' + "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", sizes: '512x512', type: 'image/png' }]
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
                        // Enabled for Desktop too to handle out-of-order track caching
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
        
        currentTitle.textContent = track.title;
        if (!preventAutoplay) {
            audioPlayer.play().catch(e => {});
            // Unmute after 150ms to completely mask the Android buffer clipping glitch
            setTimeout(() => {
                audioPlayer.muted = false;
            }, 150);
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
                tempImg.fetchPriority = "high";
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
                if (currentPlaybackSequence === sequenceId) {
                    tempImg.src = thumbUrl;
                }
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
        let isAiGenerated = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            if (line.includes('[au:AI_GENERATED]')) {
                isAiGenerated = true;
                continue;
            }
            
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
        return { lyrics, isAiGenerated };
    }

    async function loadLyrics(track) {
        const existingBadge = lyricsContainer.querySelector('.ai-lyrics-badge');
        if (existingBadge) existingBadge.remove();

        lyricsContent.innerHTML = '<p class="lyrics-placeholder" style="font-size: 32px; letter-spacing: 4px; font-weight: 800; color: var(--primary-color); opacity: 0.8; margin: auto;">...</p>';
        lyricsContent.style.display = 'flex';
        currentLyrics = [];
        currentLyricsIsAi = false;
        fetchingLyrics = true;
        
        try {
            const parts = track.file_path.split('/');
            const folder = parts[0];
            const lyricsUrl = `${baseUrl}/${encodeURIComponent(folder)}/lyrics/${encodeURIComponent(track.id)}.lrc`;
            
            const res = await fetch(lyricsUrl, { priority: 'low' });
            if (!res.ok) throw new Error();
            const text = await res.text();
            const parsed = parseLRC(text);
            currentLyrics = parsed.lyrics;
            currentLyricsIsAi = parsed.isAiGenerated;
            
            if (currentLyrics.length === 0) throw new Error();
            
            if (currentLyrics[0].time > 0) {
                currentLyrics.unshift({ time: 0, text: "..." });
            }
            
            lyricsContent.innerHTML = '';
            lyricsContent.style.display = 'block'; // Remove inline flex styles
            
            if (parsed.isAiGenerated) {
                const badge = document.createElement('div');
                badge.className = 'ai-lyrics-badge';
                badge.innerHTML = '<span>✨ AI Generated</span>';
                lyricsContainer.appendChild(badge);
            }
            
            const lyricsInner = document.createElement('div');
            lyricsInner.id = 'lyrics-inner';
            lyricsInner.className = 'lyrics-inner';
            
            const highlightLayer = document.createElement('div');
            highlightLayer.id = 'lyrics-highlight-layer';
            highlightLayer.className = 'lyrics-highlight-layer';
            
            lyricsInner.appendChild(highlightLayer);
            
            currentLyrics.forEach((line) => {
                const p = document.createElement('p');
                p.textContent = currentLyricsIsAi ? line.text : `[${formatTime(line.time)}] ${line.text}`;
                p.className = 'lyric-line';
                if (!currentLyricsIsAi) {
                    p.addEventListener('click', () => {
                        audioPlayer.currentTime = line.time;
                    });
                }
                lyricsInner.appendChild(p);
            });
            
            lyricsContent.appendChild(lyricsInner);
            
            // Build layout cache to prevent DOM layout thrashing
            requestAnimationFrame(() => {
                buildLyricsCache();
                if (lyricsActive && !currentLyricsIsAi) {
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
        if (!lyricsActive || currentLyrics.length === 0 || currentLyricsIsAi) return;
        
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
        if (!lyricsActive || audioPlayer.paused || currentLyricsIsAi) {
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
            if (!audioPlayer.paused && !lyricsRafId && !currentLyricsIsAi) {
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
            audioPlayer.muted = false; // Unmute if the track was loaded with preventAutoplay
            audioPlayer.play().catch(e => {
                // Audio Element Revival: If Android suspended the decoder during a pause, reload the stream.
                const savedTime = audioPlayer.currentTime;
                const currentSrc = audioPlayer.src;
                
                // Do not set src = '' as it triggers MEDIA_ERR_SRC_NOT_SUPPORTED on remote streams
                audioPlayer.removeAttribute("src");
                audioPlayer.load();
                
                // For remote streams, we must wait until metadata is parsed before seeking
                // Attach the event BEFORE setting src to prevent missing synchronous metadata events
                const onMeta = () => {
                    audioPlayer.currentTime = savedTime;
                    audioPlayer.play().catch(err => console.error("Revival failed:", err));
                    audioPlayer.removeEventListener('loadedmetadata', onMeta);
                };
                audioPlayer.addEventListener('loadedmetadata', onMeta);
                
                audioPlayer.src = currentSrc;
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

    audioPlayer.addEventListener("seeked", updateMediaSessionPosition);
    audioPlayer.addEventListener("ratechange", updateMediaSessionPosition);

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
        if (lyricsActive && !lyricsRafId && !currentLyricsIsAi) {
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
            audioPlayer.muted = false; // Unmute if the track was loaded with preventAutoplay
            audioPlayer.play().catch(e => {
                // Audio Element Revival: If Android suspended the decoder during a pause, re-assigning the blob revives it.
                const savedTime = audioPlayer.currentTime;
                const currentSrc = audioPlayer.src;
                
                // Do not set src = '' as it triggers MEDIA_ERR_SRC_NOT_SUPPORTED on remote streams
                audioPlayer.removeAttribute("src");
                audioPlayer.load();
                
                // For remote streams, we must wait until metadata is parsed before seeking
                // Attach the event BEFORE setting src to prevent missing synchronous metadata events
                const onMeta = () => {
                    audioPlayer.currentTime = savedTime;
                    audioPlayer.play().catch(err => console.error("Revival failed:", err));
                    audioPlayer.removeEventListener('loadedmetadata', onMeta);
                };
                audioPlayer.addEventListener('loadedmetadata', onMeta);
                
                audioPlayer.src = currentSrc;
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
                    const parsedTime = parseFloat(savedTime);
                    if (!isNaN(parsedTime)) {
                        const restoreTime = () => {
                            audioPlayer.removeEventListener("loadedmetadata", restoreTime);
                            if (localStorage.getItem("lastTrackId") === lastTrackId && !isNaN(audioPlayer.duration)) {
                                const targetTime = Math.min(parsedTime, audioPlayer.duration - 1);
                                if (targetTime > 0) {
                                    audioPlayer.currentTime = targetTime;
                                    updateTimeUI(targetTime);
                                }
                            }
                        };
                        audioPlayer.addEventListener("loadedmetadata", restoreTime);
                    }
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
            } else if (e.key === 'ArrowLeft' || key === 'a') {
                audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 5);
            } else if (e.key === 'ArrowRight' || key === 'd') {
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
