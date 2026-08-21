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
            li.className = "track-item";
            
            const thumbDiv = document.createElement("div");
            thumbDiv.className = "track-thumb";
            
            const textSpan = document.createElement("span");
            textSpan.style.flex = "1";
            textSpan.style.whiteSpace = "nowrap";
            textSpan.style.overflow = "hidden";
            textSpan.style.textOverflow = "ellipsis";
            
            const linkA = document.createElement("a");
            linkA.target = "_blank";
            linkA.className = "yt-link-icon";
            linkA.title = "Open on YouTube";
            linkA.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>';
            linkA.addEventListener("click", (e) => e.stopPropagation());
            
            li.appendChild(thumbDiv);
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
            const thumbDiv = li.childNodes[0];
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
                        loader.src = thumbUrl;
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
    function updateSeekBarProgress() {
        // Trailing played seek bar region removed to expose the full buffer track behind the thumb
    }
    window.updateSeekBarProgress = updateSeekBarProgress;

    function updateBufferProgress() {
        const container = document.getElementById("buffer-container") || document.getElementById("seek-track");
        if (!container) return;
        if (audioPlayer && audioPlayer.switching) {
            container.innerHTML = '';
            return;
        }
        const max = parseFloat(seekBar.max) || 0;
        if (max <= 0) {
            container.innerHTML = '';
            return;
        }
        const buffered = audioPlayer ? audioPlayer.buffered : null;
        if (!buffered || buffered.length === 0) {
            container.innerHTML = '';
            return;
        }

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
    // Removed duplicate albumArtContainer, already in dom.js
    const thumbToggleHint = document.getElementById('thumb-toggle-hint');

    // albumArt error handling is managed in playback.js
    
    function getDominantColor(imgEl, trackId) {
        if (trackId && dominantColorCache.has(trackId)) return dominantColorCache.get(trackId);
        if (imgEl.dataset && imgEl.dataset.precomputedColor) return imgEl.dataset.precomputedColor;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return '#8c73ff';

        // Downsample to 48x48 for fast, comprehensive color palette analysis
        const sampleSize = 48;
        canvas.width = sampleSize;
        canvas.height = sampleSize;

        try {
            ctx.drawImage(imgEl, 0, 0, sampleSize, sampleSize);
            const imgData = ctx.getImageData(0, 0, sampleSize, sampleSize).data;

            let bestColor = null;
            let maxScore = -1;
            let totalR = 0, totalG = 0, totalB = 0, validPixelCount = 0;

            for (let i = 0; i < imgData.length; i += 4) {
                const r = imgData[i];
                const g = imgData[i + 1];
                const b = imgData[i + 2];
                const a = imgData[i + 3];

                if (a < 128) continue; // Ignore transparent pixels

                const max = Math.max(r, g, b);
                const min = Math.min(r, g, b);
                const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                const saturation = max === 0 ? 0 : (max - min) / max;

                totalR += r;
                totalG += g;
                totalB += b;
                validPixelCount++;

                // Filter out near-black, near-white, and pure washed-out grays
                if (brightness < 30 || brightness > 235 || saturation < 0.18) {
                    continue;
                }

                // Score: prioritize high saturation and moderate-to-vibrant brightness
                const brightnessWeight = 1 - Math.abs(brightness - 140) / 140;
                const score = (saturation * 2.0) + (brightnessWeight * 1.2);

                if (score > maxScore) {
                    maxScore = score;
                    bestColor = { r, g, b, brightness };
                }
            }

            let finalR = 140, finalG = 115, finalB = 255;

            if (bestColor) {
                finalR = bestColor.r;
                finalG = bestColor.g;
                finalB = bestColor.b;

                // Ensure UI text readability: minimum brightness threshold
                if (bestColor.brightness < 110) {
                    const factor = 110 / Math.max(bestColor.brightness, 1);
                    finalR = Math.min(255, Math.floor(finalR * factor));
                    finalG = Math.min(255, Math.floor(finalG * factor));
                    finalB = Math.min(255, Math.floor(finalB * factor));
                }
            } else if (validPixelCount > 0) {
                // Fallback for monochromatic/grayscale album art
                const avgR = Math.floor(totalR / validPixelCount);
                const avgG = Math.floor(totalG / validPixelCount);
                const avgB = Math.floor(totalB / validPixelCount);
                const avgBrightness = (avgR * 299 + avgG * 587 + avgB * 114) / 1000;
                const factor = avgBrightness < 120 ? (120 / Math.max(avgBrightness, 1)) : 1;

                finalR = Math.min(255, Math.floor(avgR * factor));
                finalG = Math.min(255, Math.floor(avgG * factor));
                finalB = Math.min(255, Math.floor(avgB * factor));
            }

            const finalColor = `rgb(${finalR}, ${finalG}, ${finalB})`;
            if (trackId) dominantColorCache.set(trackId, finalColor);
            return finalColor;
        } catch (e) {
            return '#8c73ff';
        }
    }

    function getSquareCroppedArtwork(imgEl, trackId) {
        if (trackId && artworkSquareCache.has(trackId)) return artworkSquareCache.get(trackId);
        try {
            const width = imgEl.naturalWidth || imgEl.width;
            const height = imgEl.naturalHeight || imgEl.height;
            if (!width || !height) return null;
            
            const canvas = document.createElement('canvas');
            const targetSize = 512;
            canvas.width = targetSize;
            canvas.height = targetSize;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return null;

            const minDim = Math.min(width, height);
            const sx = (width - minDim) / 2;
            const sy = (height - minDim) / 2;

            ctx.drawImage(imgEl, sx, sy, minDim, minDim, 0, 0, targetSize, targetSize);
            const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.9);
            if (trackId) artworkSquareCache.set(trackId, croppedDataUrl);
            return croppedDataUrl;
        } catch (e) {
            return null;
        }
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
