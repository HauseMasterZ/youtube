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
    function setPlayUI(isPlaying) {
        if (isPlaying) {
            iconPlay.style.display = 'none';
            iconPause.style.display = 'block';
        } else {
            iconPlay.style.display = 'block';
            iconPause.style.display = 'none';
        }
    }
    function updateTimeUI(seconds) {
        if (seconds === lastRenderTime) return;
        seekBar.value = seconds;
        currentTimeDisplay.textContent = formatTime(seconds);
        lastRenderTime = seconds;
    }
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
