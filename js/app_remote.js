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
    
    let playQueue = [];     
    let queueIndex = -1;    
    let globalActiveOriginalIndex = -1; 
    
    
    let shuffleMode = 0;
    let repeatMode = 0; 

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
    let thumbsDisabled = true;
    
    let activeObjectURL = null;
    let requestedThumbs = new Set();

    // Virtual Scroller state
    const ITEM_HEIGHT = 48;
    let lastStartIndex = -1;
    let lastEndIndex = -1;
    let isRendering = false;
    let poolInitialized = false;
    const prefetchedUrls = new Set();


    // --- Network Bootstrapping Optimization ---
    function preloadAllPlaylists(excludePl) {
        ALL_PLAYLISTS.forEach(pl => {
            if (pl !== excludePl && !allDatabases[pl]) {
                fetch(`${baseUrl}/${pl}/_Playlist_Database.json`)
                    .then(res => res.json())
                    .then(data => {
                        if (data.length > 0 && Array.isArray(data[0])) {
                            allDatabases[pl] = data.filter(item => {
                                const title = String(item[1]);
                                return !title.includes('Deleted/Private Video') && !title.includes('Deleted video') && !title.includes('Private video');
                            }).map(item => ({
                                id: item[0],
                                title: item[1],
                                channel: item[2],
                                duration: item[3],
                                file_path: `${pl}/${item[4]}.webm`,
                                thumbnail_path: `${pl}/thumbnails/${item[4]}.webp`
                            }));
                        } else {
                            allDatabases[pl] = data;
                        }
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
                let data = await res.json();
                
                if (data.length > 0 && Array.isArray(data[0])) {
                    data = data.filter(item => {
                        const title = String(item[1]);
                        return !title.includes('Deleted/Private Video') && !title.includes('Deleted video') && !title.includes('Private video');
                    }).map(item => ({
                        id: item[0],
                        title: item[1],
                        channel: item[2],
                        duration: item[3],
                        file_path: `${folderName}/${item[4]}.webm`,
                        thumbnail_path: `${folderName}/thumbnails/${item[4]}.webp`
                    }));
                }
                
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
            
            if (isCurrentPlaylist && item.index === globalActiveOriginalIndex) {
                li.classList.add("active");
            } else {
                li.classList.remove("active");
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
                                requestedThumbs.add(getThumbUrl(track));
                                thumbImg.src = getThumbUrl(track);
                            }
                        }, 400);
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

    trackList.addEventListener("click", (e) => {
        const li = e.target.closest("li");
        if (!li || !li.dataset.index || !li.dataset.playlist) return;
        
        const targetPlaylist = li.dataset.playlist;
        const targetOriginalIndex = parseInt(li.dataset.index);
        
        // Add to cross-shuffle history if in mode 1
        if (shuffleMode === 1) {
            const existingIdx = crossShuffleHistory.findIndex(t => t.playlist === targetPlaylist && t.index === targetOriginalIndex);
            if (existingIdx !== -1) {
                crossShuffleHistory.splice(existingIdx, 1);
                if (existingIdx <= crossShufflePos) crossShufflePos--;
            }
            crossShuffleHistory.splice(crossShufflePos + 1, 0, { playlist: targetPlaylist, index: targetOriginalIndex });
            crossShufflePos++;
        }
        
        if (targetPlaylist !== playlistSelect.value) {
            if (shuffleMode === 1) {
                // In shuffle-all mode, use lightweight playlist switch
                playFromPlaylist(targetPlaylist, targetOriginalIndex);
            } else {
                // Cross-playlist jump with full reload
                playlistSelect.value = targetPlaylist;
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
        
        const originalIndex = playQueue[queueIndex];
        globalActiveOriginalIndex = originalIndex;
        
        const track = currentPlaylistData[originalIndex];

        currentTitle.textContent = track.title;
        currentTitle.style.color = "#ffffff"; // Reset color in case it was red from an error
        currentChannel.textContent = track.channel;

        scrollToTrack(originalIndex);

        updateTimeUI(0);
        totalTimeDisplay.textContent = "0:00";

        // Do NOT halt here, let PingPongAudio handle gapless transition
        
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: track.title,
                artist: track.channel,
                artwork: getThumbUrl(track) && !thumbsDisabled ? [{ src: getThumbUrl(track), sizes: '512x512', type: 'image/jpeg' }] : [{ src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', sizes: '512x512', type: 'image/png' }]
            });
            navigator.mediaSession.playbackState = preventAutoplay ? "none" : "playing";
        }
        
        if (window.previousObjectURL) {
            URL.revokeObjectURL(window.previousObjectURL);
            window.previousObjectURL = null;
        }
        window.previousObjectURL = activeObjectURL;

        const isMobile = window.innerWidth <= 800;

        if (isMobile) {
            currentTitle.textContent = "Loading... " + track.title;
            const audioUrl = getAudioUrl(track);
            caches.match(audioUrl).then(cachedResponse => {
                if (cachedResponse) return cachedResponse.blob();
                return fetch(audioUrl, { priority: 'high' }).then(response => {
                    if (!response.ok) throw new Error("Network error");
                    const cloned = response.clone();
                    caches.open('yt-player-media').then(cache => cache.put(audioUrl, cloned));
                    return response.blob();
                });
            })
            .then(blob => {
                activeObjectURL = URL.createObjectURL(blob);
                audioPlayer.switchTrack(activeObjectURL, preventAutoplay);
                currentTitle.textContent = track.title;
            })
            .catch(err => {
                audioPlayer.switchTrack(audioUrl, preventAutoplay);
                currentTitle.textContent = track.title;
            });
        } else {
            audioPlayer.switchTrack(getAudioUrl(track), preventAutoplay);
            currentTitle.textContent = track.title;
        }

        if (!thumbsDisabled && getThumbUrl(track)) {
            const thumbUrl = getThumbUrl(track);
            const onPlayStart = () => {
                albumArt.src = thumbUrl;
                albumArt.style.display = 'block';
                audioPlayer.removeEventListener('play', onPlayStart);
            };
            audioPlayer.addEventListener('play', onPlayStart);
        } else {
            albumArt.style.display = 'none';
        }

        // MediaSession metadata already updated at the top of executePlayback
        
        if (lyricsActive) {
            loadLyrics(track);
        }
    }
    
    function parseLRC(text) {
        const lines = text.split(/\r?\n/);
        const lyrics = [];
        let isUnsynced = false;
        
        let hasTimestamps = lines.some(line => /^\[\d{2,}:\d{2}(?:\.\d{2,3})?\]/.test(line));
        if (!hasTimestamps) {
            isUnsynced = true;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line) lyrics.push({ time: 0, text: line });
            }
            return { lyrics, isUnsynced };
        }
        
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
        return { lyrics, isUnsynced };
    }

    async function loadLyrics(track) {
        const existingBadge = lyricsContainer.querySelector('.ai-lyrics-badge');
        if (existingBadge) existingBadge.remove();

        lyricsContent.innerHTML = '<p class="lyrics-placeholder">Loading lyrics...</p>';
        currentLyrics = [];
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
            let currentLyricsIsUnsynced = parsed.isUnsynced;
            
            if (currentLyrics.length === 0) throw new Error();
            
            if (!currentLyricsIsUnsynced && currentLyrics[0].time > 0) {
                currentLyrics.unshift({ time: 0, text: "..." });
            }
            
            lyricsContent.innerHTML = '';
            lyricsContent.style.display = 'block'; 
            
            const lyricsInner = document.createElement('div');
            lyricsInner.id = 'lyrics-inner';
            lyricsInner.className = 'lyrics-inner';
            
            const highlightLayer = document.createElement('div');
            highlightLayer.id = 'lyrics-highlight-layer';
            highlightLayer.className = 'lyrics-highlight-layer';
            
            lyricsInner.appendChild(highlightLayer);
            
            currentLyrics.forEach((line) => {
                const p = document.createElement('p');
                p.textContent = currentLyricsIsUnsynced ? line.text : `[${formatTime(line.time)}] ${line.text}`;
                p.className = 'lyric-line';
                if (!currentLyricsIsUnsynced) {
                    p.addEventListener('click', () => {
                        audioPlayer.currentTime = line.time;
                    });
                }
                lyricsInner.appendChild(p);
            });
            
            lyricsContent.appendChild(lyricsInner);
            
            // Build layout cache to prevent DOM layout thrashing
            requestAnimationFrame(() => buildLyricsCache());
        } catch (e) {
            lyricsContent.innerHTML = '<p class="lyrics-placeholder">Lyrics not available for this track.</p>';
        }
        fetchingLyrics = false;
        activeLyricIndex = -1;
        if (lyricsActive) {
            updateLyricsUI(audioPlayer.currentTime);
            if (!audioPlayer.paused && !lyricsRafId) {
                lyricsRafId = requestAnimationFrame(lyricsLoop);
            }
        }
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
        if (!lyricsActive || currentLyrics.length === 0 || typeof currentLyricsIsUnsynced !== 'undefined' && currentLyricsIsUnsynced) return;
        
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
    function lyricsLoop() {} // No-op for backward compatibility

    audioPlayer.addEventListener("timeupdate", () => {
        if (lyricsActive && !audioPlayer.paused) {
            updateLyricsUI(audioPlayer.currentTime);
        }
    });


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
            setPlayUI(true);
            audioPlayer.play();
        } else {
            setPlayUI(false);
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
        applyRepeatUI();
    });

    function updateMediaSessionPosition() {
        if (hasMediaSession && !isNaN(audioPlayer.duration) && audioPlayer.duration > 0) {
            navigator.mediaSession.setPositionState({
                duration: audioPlayer.duration,
                playbackRate: audioPlayer.playbackRate || 1,
                position: audioPlayer.currentTime
            });
        }
    }

    audioPlayer.addEventListener("loadedmetadata", () => {
        const duration = Math.floor(audioPlayer.duration);
        if (!isNaN(duration) && duration !== Infinity) {
            seekBar.max = duration;
            totalTimeDisplay.textContent = formatTime(duration);
            updateMediaSessionPosition();
        } else if (seekBar.max > 0) {
            updateMediaSessionPosition();
        }
    });

    // --- Deep Sleep JS Engine Integration (1Hz timer) ---
    function syncLoop() {
        syncRAFId = null;
        if (audioPlayer.paused || document.hidden) return;
        let dur = audioPlayer.duration;
        if (!dur || isNaN(dur) || dur === Infinity) {
            dur = parseInt(seekBar.max) || 0;
        }
        if (!isSeeking && dur > 0) {
            const ct = Math.floor(audioPlayer.currentTime);
            if (ct !== lastRenderTime) {
                updateTimeUI(ct);
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
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'playing';
        }
    });
    
    audioPlayer.addEventListener("pause", () => {
        setPlayUI(false);
        stopSync();
        updateMediaSessionPosition();
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused';
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

    let lastEndedTime = 0;
    audioPlayer.addEventListener("ended", () => {
        const now = Date.now();
        if (now - lastEndedTime < 1000) return;
        lastEndedTime = now;
        
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
        if ('mediaSession' in navigator) {
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
    
    function getDominantColor(imgEl) {
        if (imgEl.dataset.precomputedColor) return imgEl.dataset.precomputedColor;
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
            return `rgb(${r}, ${g}, ${b})`;
        } catch(e) { return '#8c73ff'; }
    }

    albumArt.addEventListener("load", () => {
        if (!thumbsDisabled && albumArt.src && !albumArt.src.startsWith('data:')) {
            document.documentElement.style.setProperty('--primary-color', getDominantColor(albumArt));
        }
    });

    // Initialize thumb toggle hint visibility
    if (thumbsDisabled) {
        thumbToggleHint.style.display = 'flex';
    }

    let artClickTimer = null;
    
    albumArtContainer.addEventListener("pointerup", (e) => {
        // In mobile mini-player mode, let click bubble up to expand player
        if (window.innerWidth <= 800 && !nowPlaying.classList.contains("expanded")) return;
        e.stopPropagation();
        
        const rect = albumArtContainer.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        
        if (artClickTimer) {
            // Second click within 300ms — double click for seek
            clearTimeout(artClickTimer);
            artClickTimer = null;
            const isLeft = clickX < width * 0.33;
            const isRight = clickX > width * 0.66;
            if (isLeft) {
                audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 5);
                updateTimeUI(audioPlayer.currentTime);
                if (window.lyricsActive) updateLyricsUI(audioPlayer.currentTime);
                updateMediaSessionPosition();
            } else if (isRight) {
                let dur = audioPlayer.duration;
                if (!dur || isNaN(dur) || dur === Infinity) dur = parseInt(seekBar.max) || 0;
                audioPlayer.currentTime = Math.min(dur || 0, audioPlayer.currentTime + 5);
                updateTimeUI(audioPlayer.currentTime);
                if (window.lyricsActive) updateLyricsUI(audioPlayer.currentTime);
                updateMediaSessionPosition();
            }
        } else {
            // First click — wait 300ms to disambiguate single vs double click
            const capturedX = clickX;
            artClickTimer = setTimeout(() => {
                artClickTimer = null;
                const isMiddle = capturedX >= width * 0.33 && capturedX <= width * 0.66;
                if (isMiddle) {
            thumbsDisabled = !thumbsDisabled;
            
            if (thumbsDisabled) {
                albumArt.style.display = 'none';
                thumbToggleHint.style.display = 'flex';
                document.documentElement.style.setProperty('--primary-color', '#8c73ff');
            } else {
                thumbToggleHint.style.display = 'none';
                if (queueIndex >= 0 && queueIndex < playQueue.length) {
                    const track = currentPlaylistData[playQueue[queueIndex]];
                    if (track && getThumbUrl(track)) {
                        albumArt.src = getThumbUrl(track);
                        albumArt.style.display = 'block';
                        if (albumArt.complete && !albumArt.src.startsWith('data:')) {
                            document.documentElement.style.setProperty('--primary-color', getDominantColor(albumArt));
                        }
                    }
                }
            }
            
            // Re-render track list to show/hide track thumbs
            lastStartIndex = -1;
            renderVirtualTracks();
                }
            }, 300);
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
    if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', () => audioPlayer.play());
        navigator.mediaSession.setActionHandler('pause', () => audioPlayer.pause());
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

    // Load the active playlist instantaneously, defer others to the background
    loadPlaylist(playlistSelect.value).then(() => {
        preloadAllPlaylists(playlistSelect.value); // Non-blocking background preload
    });
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
