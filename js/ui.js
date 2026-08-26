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

    const GRAY_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Crect width='1' height='1' fill='%23222226'/%3E%3C/svg%3E";
    const thumbCache = new Map();
    let isScrollingFast = false;
    let scrollSettleTimer = null;

    // Static Track Template for Instant DOM Node Cloning (< 1ms vs ~30ms innerHTML parsing)
    const trackTemplate = document.createElement("li");
    trackTemplate.className = "track-item";
    const tThumb = document.createElement("div");
    tThumb.className = "track-thumb";
    const tSpan = document.createElement("span");
    tSpan.style.flex = "1";
    tSpan.style.whiteSpace = "nowrap";
    tSpan.style.overflow = "hidden";
    tSpan.style.textOverflow = "ellipsis";
    const tLink = document.createElement("a");
    tLink.target = "_blank";
    tLink.className = "yt-link-icon";
    tLink.title = "Open on YouTube";
    tLink.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>';
    trackTemplate.appendChild(tThumb);
    trackTemplate.appendChild(tSpan);
    trackTemplate.appendChild(tLink);

    applyShuffleUI();
    applyRepeatUI();
    function renderVirtualTracks() {
        if (!currentPlaylistData || currentPlaylistData.length === 0) return;
        
        if (filteredIndices.length === 0) {
            isRendering = false;
            return;
        }

        const scrollTop = playlistContainer.scrollTop;
        const containerHeight = playlistContainer.clientHeight || 400;

        // Render buffer (3 items above and below viewport for smooth scrolling without over-fetching)
        const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - 3);
        const endIndex = Math.min(filteredIndices.length - 1, Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + 3);

        // Only redraw DOM if the index window actually shifted
        if (lastStartIndex === startIndex && lastEndIndex === endIndex) {
            isRendering = false;
            return; 
        }

        lastStartIndex = startIndex;
        lastEndIndex = endIndex;
        isRendering = true;

        const requiredNodes = Math.max(0, endIndex - startIndex + 1);
        const currentPl = playlistSelect.value;
        
        // Fast Template Cloned DOM Object Pooling
        while (trackList.children.length < requiredNodes) {
            const li = trackTemplate.cloneNode(true);
            li.lastElementChild.addEventListener("click", (e) => e.stopPropagation());
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
            const plData = allDatabases[item.playlist];
            if (!plData || !plData[item.index]) continue;
            const track = plData[item.index];
            const li = trackList.children[childIdx++];
            const thumbDiv = li.childNodes[0];
            const textSpan = li.childNodes[1];
            const linkA = li.childNodes[2];
            
            li.style.display = "flex";
            li.dataset.playlist = item.playlist;
            li.dataset.index = item.index;
            li.style.transform = `translate3d(0, ${i * ITEM_HEIGHT}px, 0)`;
            
            const isCurrentPlaylist = (item.playlist === currentPl);
            
            li.classList.remove("active", "search-highlight");
            if (i === selectedSearchIndex) {
                li.classList.add("search-highlight");
            } else if (item.playlist === globalActivePlaylist && item.index === globalActiveOriginalIndex) {
                li.classList.add('active');
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
                const thumbUrl = getThumbUrl(track);
                thumbDiv.dataset.targetSrc = thumbUrl;
                
                const cached = thumbCache.get(thumbUrl);
                if (cached && cached.status === 'loaded') {
                    thumbDiv.style.backgroundImage = `url("${cached.resolvedUrl}")`;
                } else if (cached && cached.status === 'failed') {
                    thumbDiv.style.backgroundImage = 'none';
                } else {
                    thumbDiv.style.backgroundImage = 'none';

                    if (!cached) {
                        thumbCache.set(thumbUrl, { status: 'loading' });
                        
                        const loader = new Image();
                        loader.fetchPriority = "low";
                        loader.src = thumbUrl;

                        if (typeof loader.decode === 'function') {
                            loader.decode()
                                .then(() => {
                                    thumbCache.set(thumbUrl, { status: 'loaded', resolvedUrl: thumbUrl });
                                    if (thumbDiv.dataset.targetSrc === thumbUrl) {
                                        thumbDiv.style.backgroundImage = `url("${thumbUrl}")`;
                                    }
                                })
                                .catch(() => {
                                    thumbCache.set(thumbUrl, { status: 'failed' });
                                    if (thumbDiv.dataset.targetSrc === thumbUrl) {
                                        thumbDiv.style.backgroundImage = 'none';
                                    }
                                });
                        } else {
                            loader.onload = () => {
                                thumbCache.set(thumbUrl, { status: 'loaded', resolvedUrl: thumbUrl });
                                if (thumbDiv.dataset.targetSrc === thumbUrl) {
                                    thumbDiv.style.backgroundImage = `url("${thumbUrl}")`;
                                }
                            };
                            loader.onerror = () => {
                                thumbCache.set(thumbUrl, { status: 'failed' });
                                if (thumbDiv.dataset.targetSrc === thumbUrl) {
                                    thumbDiv.style.backgroundImage = 'none';
                                }
                            };
                        }
                    }
                }
                thumbDiv.style.display = "block";
            } else {
                thumbDiv.style.display = "none";
                thumbDiv.style.backgroundImage = 'none';
                delete thumbDiv.dataset.targetSrc;
            }
            
            textSpan.textContent = text;
            li.title = `${item.index + 1}. ${text}`; // Tooltip for full visibility of long names
            linkA.href = track.url || `https://www.youtube.com/watch?v=${track.id}`;
        }
        
        isRendering = false;
    }
    function scrollToTrack(originalIndex, forceScroll = false) {
        const currentPl = playlistSelect.value;
        const virtualIndex = filteredIndices.findIndex(item => item.playlist === currentPl && item.index === originalIndex);
        
        if (virtualIndex === -1) {
            // Track is currently filtered out of view, silently update active class state
            lastStartIndex = -1;
            renderVirtualTracks();
            return; 
        }
        
        const isUserActiveScrolling = (Date.now() - lastUserScrollTime < 1500) || isScrollingFast;
        if (forceScroll || !isUserActiveScrolling) {
            const scrollPos = virtualIndex * ITEM_HEIGHT;
            const containerHeight = playlistContainer.clientHeight || 400;
            playlistContainer.scrollTo({ 
                top: scrollPos - (containerHeight / 2) + (ITEM_HEIGHT / 2), 
                behavior: "instant" 
            });
        }
        
        // Force highlight update immediately even during scroll
        lastStartIndex = -1;
        renderVirtualTracks();
    }
    function setPlayUI(isPlaying) {
        if (isPlaying) {
            iconPlay.style.display = 'none';
            iconPause.style.display = 'block';
        } else {
            iconPlay.style.display = 'block';
            iconPause.style.display = 'none';
        }
    }
    function updateSeekBarProgress() {
        // Trailing played seek bar region removed to expose the full buffer track behind the thumb
    }
    window.updateSeekBarProgress = updateSeekBarProgress;

    let lastBufferSignature = '';
    function updateBufferProgress() {
        const container = document.getElementById("buffer-container") || document.getElementById("seek-track");
        if (!container) return;
        if (audioPlayer && audioPlayer.switching) {
            if (lastBufferSignature !== 'empty') {
                container.innerHTML = '';
                lastBufferSignature = 'empty';
            }
            return;
        }
        const max = parseFloat(seekBar.max) || 0;
        if (max <= 0) {
            if (lastBufferSignature !== 'empty') {
                container.innerHTML = '';
                lastBufferSignature = 'empty';
            }
            return;
        }
        const buffered = audioPlayer ? audioPlayer.buffered : null;
        if (!buffered || buffered.length === 0) {
            if (lastBufferSignature !== 'empty') {
                container.innerHTML = '';
                lastBufferSignature = 'empty';
            }
            return;
        }

        let sig = `${max.toFixed(0)}_`;
        for (let i = 0; i < buffered.length; i++) {
            sig += `${buffered.start(i).toFixed(1)}-${buffered.end(i).toFixed(1)}_`;
        }
        if (sig === lastBufferSignature) return;
        lastBufferSignature = sig;

        let html = '';
        for (let i = 0; i < buffered.length; i++) {
            const start = buffered.start(i);
            const end = buffered.end(i);
            if (end <= start) continue;
            const leftPct = Math.min(100, Math.max(0, (start / max) * 100));
            const widthPct = Math.min(100 - leftPct, Math.max(0, ((end - start) / max) * 100));
            if (widthPct > 0) {
                html += `<div class="buffer-segment" style="left:${leftPct.toFixed(2)}%;width:${widthPct.toFixed(2)}%;"></div>`;
            }
        }
        container.innerHTML = html;
    }
    window.updateBufferProgress = updateBufferProgress;

    function updateTimeUI(seconds) {
        const max = parseFloat(seekBar.max) || 0;
        if (seconds > max && audioPlayer && audioPlayer.duration && !isNaN(audioPlayer.duration) && audioPlayer.duration !== Infinity) {
            const trueDur = Math.floor(audioPlayer.duration);
            if (trueDur > max) {
                seekBar.max = trueDur;
                totalTimeDisplay.textContent = formatTime(trueDur);
            }
        }
        seekBar.value = seconds;
        const roundedSec = Math.floor(seconds);
        if (roundedSec !== lastRenderTime) {
            currentTimeDisplay.textContent = formatTime(roundedSec);
            lastRenderTime = roundedSec;
        }
        updateSeekBarProgress();
    }

    const PURPLE_NOTE_SVG_DATA_URI = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%238c73ff'%3E%3Cpath d='M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z'/%3E%3C/svg%3E";
    let purpleNoteDataUrl = null;
    function getPurpleNoteArtwork() {
        if (purpleNoteDataUrl) return purpleNoteDataUrl;
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 512;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = '#121212';
                ctx.fillRect(0, 0, 512, 512);
                const p = new Path2D("M256 64v225.07c-12.59-7.25-27.1-11.73-42.67-11.73-47.15 0-85.33 38.18-85.33 85.33s38.18 85.33 85.33 85.33 85.33-38.18 85.33-85.33V149.33h85.34V64H256z");
                ctx.fillStyle = '#8c73ff';
                ctx.fill(p);
                purpleNoteDataUrl = canvas.toDataURL('image/png');
                return purpleNoteDataUrl;
            }
        } catch (e) {}
        return PURPLE_NOTE_SVG_DATA_URI;
    }
