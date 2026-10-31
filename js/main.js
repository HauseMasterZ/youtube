document.addEventListener("DOMContentLoaded", () => {
    // Strip the cache-busting update marker from the address bar after a forced site update
    try {
        const updateParams = new URLSearchParams(window.location.search);
        if (updateParams.has('v') && /^\d+$/.test(updateParams.get('v') || '')) {
            updateParams.delete('v');
            const cleanQuery = updateParams.toString();
            window.history.replaceState(null, '', window.location.pathname + (cleanQuery ? '?' + cleanQuery : '') + window.location.hash);
        }
    } catch (e) {}

    // Build version: window.APP_BUILD
    let searchMode = 'local'; // 'local' | 'ephemeral'
    let remoteSearchAbortController = null;
    let lastTimeupdateFire = 0;

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function showEphemeralToast(text, isSuccess = true) {
        const toast = document.getElementById("download-toast");
        const toastText = document.getElementById("download-toast-text");
        if (!toast || !toastText) return;
        toastText.textContent = text;
        if (isSuccess) toast.classList.add("success");
        else toast.classList.remove("success");
        toast.style.display = "flex";
        setTimeout(() => {
            if (toast) toast.style.display = "none";
        }, 2800);
    }

    function exitEphemeralSearch() {
        if (searchMode !== 'ephemeral') return;
        searchMode = 'local';
        if (remoteSearchAbortController) {
            remoteSearchAbortController.abort();
            remoteSearchAbortController = null;
        }
        if (iconSearchGlass) iconSearchGlass.style.display = 'block';
        if (iconSearchSpinner) iconSearchSpinner.style.display = 'none';
        if (ephemeralSearchContainer) {
            ephemeralSearchContainer.style.display = 'none';
            ephemeralSearchContainer.innerHTML = '';
        }
        if (filteredIndices && filteredIndices.length > 0) {
            trackList.style.height = `${filteredIndices.length * ITEM_HEIGHT}px`;
            trackList.style.display = 'block';
            playlistMessage.style.display = 'none';
        } else {
            trackList.style.display = 'none';
            playlistMessage.style.display = 'block';
            playlistMessage.textContent = searchInput && searchInput.value.trim() ? 'No results found.' : '';
            playlistMessage.style.color = 'var(--text-secondary)';
        }
        lastStartIndex = -1;
        renderVirtualTracks();
    }

    function renderEphemeralError(query, message) {
        if (!ephemeralSearchContainer) return;
        ephemeralSearchContainer.innerHTML = `
            <div class="ephemeral-header">
                <span class="ephemeral-title">Search: <strong>${escapeHtml(query)}</strong></span>
                <button class="ephemeral-close-btn" id="btn-ephemeral-close">Back to Playlist</button>
            </div>
            <div class="ephemeral-empty-state">
                <p style="margin-bottom: 12px; color: var(--text-secondary);">${escapeHtml(message)}</p>
                <button class="ephemeral-action-btn" id="btn-ephemeral-retry" style="margin: 0 auto;">Retry</button>
            </div>
        `;
        const closeBtn = document.getElementById('btn-ephemeral-close');
        if (closeBtn) closeBtn.addEventListener('click', () => exitEphemeralSearch());
        const retryBtn = document.getElementById('btn-ephemeral-retry');
        if (retryBtn) retryBtn.addEventListener('click', () => performRemoteSearch(query));
    }

    function renderEphemeralResults(query, results) {
        if (!ephemeralSearchContainer) return;
        if (!results || results.length === 0) {
            ephemeralSearchContainer.innerHTML = `
                <div class="ephemeral-header">
                    <span class="ephemeral-title">Search: <strong>${escapeHtml(query)}</strong></span>
                    <button class="ephemeral-close-btn" id="btn-ephemeral-close">Back to Playlist</button>
                </div>
                <div class="ephemeral-empty-state">
                    <p>No online topic tracks found for "${escapeHtml(query)}".</p>
                </div>
            `;
            const closeBtn = document.getElementById('btn-ephemeral-close');
            if (closeBtn) closeBtn.addEventListener('click', () => exitEphemeralSearch());
            return;
        }

        ephemeralSearchContainer.innerHTML = `
            <div class="ephemeral-header">
                <span class="ephemeral-title">YouTube Results for: <strong>${escapeHtml(query)}</strong> (${results.length})</span>
                <button class="ephemeral-close-btn" id="btn-ephemeral-close">Back to Playlist</button>
            </div>
            <ul class="ephemeral-track-list">
                ${results.map((item) => {
                    const vid = item.video_id;
                    const thumbStyle = item.thumbnail_url ? `background-image: url('${escapeHtml(item.thumbnail_url)}');` : '';
                    const artistsStr = (item.artists && item.artists.length > 0) ? item.artists.join(', ') : (item.channel_name || '');
                    const durStr = item.duration || (item.duration_seconds ? `${Math.floor(item.duration_seconds / 60)}:${String(item.duration_seconds % 60).padStart(2, '0')}` : '');
                    const ytUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(vid)}`;
                    return `
                        <li class="ephemeral-track-item" data-vid="${escapeHtml(vid)}">
                            <div class="ephemeral-thumb" style="${thumbStyle}"></div>
                            <div class="ephemeral-meta">
                                <div class="ephemeral-meta-title">${escapeHtml(item.title)}</div>
                                <div class="ephemeral-meta-sub">
                                    <span>${escapeHtml(artistsStr)}</span>
                                    ${durStr ? `<span>• ${escapeHtml(durStr)}</span>` : ''}
                                    ${item.is_topic ? '<span class="ephemeral-tag-topic">TOPIC</span>' : ''}
                                </div>
                            </div>
                            <div class="ephemeral-actions">
                                <a class="ephemeral-action-btn" href="${escapeHtml(ytUrl)}" target="_blank" rel="noopener noreferrer" title="Open on YouTube" aria-label="Open track on YouTube">
                                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
                                </a>
                            </div>
                        </li>
                    `;
                }).join('')}
            </ul>
        `;

        const closeBtn = document.getElementById('btn-ephemeral-close');
        if (closeBtn) closeBtn.addEventListener('click', () => exitEphemeralSearch());
    }

    async function performRemoteSearch(rawQuery) {
        const query = (rawQuery || '').trim();
        if (!query || query.length < 2) {
            if (searchInput) searchInput.focus();
            return;
        }

        if (remoteSearchAbortController) {
            remoteSearchAbortController.abort();
            remoteSearchAbortController = null;
        }
        remoteSearchAbortController = new AbortController();
        const signal = remoteSearchAbortController.signal;

        searchMode = 'ephemeral';
        trackList.style.display = 'none';
        playlistMessage.style.display = 'none';
        if (iconSearchGlass) iconSearchGlass.style.display = 'none';
        if (iconSearchSpinner) iconSearchSpinner.style.display = 'block';

        if (ephemeralSearchContainer) {
            ephemeralSearchContainer.style.display = 'block';
            ephemeralSearchContainer.innerHTML = `
                <div class="ephemeral-header">
                    <span class="ephemeral-title">Searching YouTube for: <strong>${escapeHtml(query)}</strong></span>
                    <button class="ephemeral-close-btn" id="btn-ephemeral-close">Back to Playlist</button>
                </div>
                <div class="ephemeral-track-list">
                    ${Array.from({ length: 5 }).map(() => `
                        <div class="ephemeral-skeleton-row">
                            <div class="ephemeral-thumb"></div>
                            <div class="ephemeral-meta">
                                <div class="ephemeral-meta-title" style="width: 60%; height: 12px; background: rgba(255,255,255,0.08); border-radius: 3px;"></div>
                                <div class="ephemeral-meta-sub" style="width: 35%; height: 10px; background: rgba(255,255,255,0.05); border-radius: 3px; margin-top: 4px;"></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
            const closeBtn = document.getElementById('btn-ephemeral-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => exitEphemeralSearch());
            }
        }

        try {
            const apiBase = (typeof baseUrl !== 'undefined' && baseUrl) ? baseUrl : '';
            const searchUrl = `${apiBase}/api/search?q=${encodeURIComponent(query)}&limit=5`;
            const res = await fetch(searchUrl, {
                method: 'GET',
                signal: signal,
                headers: { 'Accept': 'application/json' }
            });

            if (signal.aborted) return;

            if (iconSearchGlass) iconSearchGlass.style.display = 'block';
            if (iconSearchSpinner) iconSearchSpinner.style.display = 'none';

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                const errMsg = errData.message || (res.status === 429 ? 'Rate limit reached. Please wait.' : 'Search failed.');
                renderEphemeralError(query, errMsg);
                return;
            }

            const data = await res.json();
            const results = (data && Array.isArray(data.results)) ? data.results : [];
            renderEphemeralResults(query, results);
        } catch (err) {
            if (signal.aborted) return;
            if (iconSearchGlass) iconSearchGlass.style.display = 'block';
            if (iconSearchSpinner) iconSearchSpinner.style.display = 'none';
            const isOffline = !navigator.onLine;
            const msg = isOffline ? 'You are offline. Reconnect to search YouTube.' : (err.message || 'Network error.');
            renderEphemeralError(query, msg);
        }
    }

    if (btnRemoteSearch) {
        btnRemoteSearch.addEventListener('click', () => {
            const q = searchInput ? searchInput.value.trim() : '';
            performRemoteSearch(q);
        });
    }

    function snapToSearch(char) {
        if (!searchInput) return;
        if (document.activeElement !== searchInput) {
            if (document.activeElement && typeof document.activeElement.blur === 'function') {
                document.activeElement.blur();
            }
            searchInput.focus();
        }
        if (char && char.length === 1) {
            const start = searchInput.selectionStart ?? searchInput.value.length;
            const end = searchInput.selectionEnd ?? searchInput.value.length;
            const val = searchInput.value || '';
            searchInput.value = val.slice(0, start) + char + val.slice(end);
            const newPos = start + char.length;
            if (typeof searchInput.setSelectionRange === 'function') {
                searchInput.setSelectionRange(newPos, newPos);
            }
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }
    window.snapToSearch = snapToSearch;

    searchInput.addEventListener("input", (e) => {
        if (searchMode === 'ephemeral') {
            exitEphemeralSearch();
        }
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            selectedSearchIndex = -1;
            const query = e.target.value.toLowerCase().trim();
            const currentPl = playlistSelect.value;
            
            if (!query) {
                filteredIndices = currentPlaylistData ? currentPlaylistData.map((_, i) => ({ playlist: currentPl, index: i })) : [];
            } else {
                const scoredResults = [];
                const addedIds = new Set();
                
                // 1. Current playlist matches (with a slight current playlist bias of +50)
                if (currentPlaylistData) {
                    for (let i = 0; i < currentPlaylistData.length; i++) {
                        const track = currentPlaylistData[i];
                        const score = calculateFuzzyScore(query, track.title, track.channel);
                        if (score > 0) {
                            scoredResults.push({ playlist: currentPl, index: i, score: score + 50 });
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
                            const trackKey = track.id || track.file_path;
                            if (!addedIds.has(trackKey)) {
                                const score = calculateFuzzyScore(query, track.title, track.channel);
                                if (score > 0) {
                                    scoredResults.push({ playlist: pl, index: i, score: score });
                                    addedIds.add(trackKey);
                                }
                            }
                        }
                    }
                }

                // Rank by highest relevance score
                scoredResults.sort((a, b) => b.score - a.score);
                filteredIndices = scoredResults.map(item => ({ playlist: item.playlist, index: item.index }));
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
        if (e.key === "Enter" && (!filteredIndices || filteredIndices.length === 0)) {
            e.preventDefault();
            const q = searchInput ? searchInput.value.trim() : '';
            if (q) performRemoteSearch(q);
            return;
        }

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
            const targetIdx = selectedSearchIndex >= 0 ? selectedSearchIndex : (filteredIndices.length > 0 ? 0 : -1);
            if (targetIdx >= 0 && targetIdx < filteredIndices.length) {
                if (searchDebounceTimer) {
                    clearTimeout(searchDebounceTimer);
                    searchDebounceTimer = null;
                }
                const item = filteredIndices[targetIdx];
                playTrackSelection(item.playlist, item.index);
                searchInput.blur();
            }
        } else if (e.key === "Escape") {
            e.preventDefault();
            exitEphemeralSearch();
            searchInput.value = "";
            selectedSearchIndex = -1;
            const currentPl = playlistSelect.value;
            filteredIndices = currentPlaylistData ? currentPlaylistData.map((_, i) => ({ playlist: currentPl, index: i })) : [];
            if (filteredIndices.length > 0) {
                trackList.style.height = `${filteredIndices.length * ITEM_HEIGHT}px`;
                trackList.style.display = 'block';
                playlistMessage.style.display = 'none';
            }
            lastStartIndex = -1;
            renderVirtualTracks();
            searchInput.blur();
        }
    });

    let scrollRafId = null;
    function scheduleVirtualRender() {
        if (scrollRafId !== null) return;
        scrollRafId = window.requestAnimationFrame(() => {
            scrollRafId = null;
            renderVirtualTracks();
        });
    }

    playlistContainer.addEventListener("scroll", () => {
        lastUserScrollTime = Date.now();
        isScrollingFast = true;
        clearTimeout(scrollSettleTimer);
        scrollSettleTimer = setTimeout(() => {
            isScrollingFast = false;
            lastStartIndex = -1;
            lastEndIndex = -1;
            renderVirtualTracks();
        }, 120);

        scheduleVirtualRender();
    }, { passive: true });

    ['touchstart', 'touchmove', 'wheel'].forEach(evt => {
        playlistContainer.addEventListener(evt, () => {
            lastUserScrollTime = Date.now();
        }, { passive: true });
    });

    function triggerEnqueuedFlash(li) {
        if (!li || !li.dataset.index || !li.dataset.playlist) return;
        const pl = li.dataset.playlist;
        const idx = parseInt(li.dataset.index);
        const targetTrack = (allDatabases[pl] && allDatabases[pl][idx]) || currentPlaylistData[idx];
        const songColor = targetTrack ? ((typeof getTrackColor === 'function') ? getTrackColor(targetTrack) : ((targetTrack.color && targetTrack.color !== '#000000') ? targetTrack.color : (dominantColorCache.get(targetTrack.id) || '#8c73ff'))) : '#8c73ff';
        li.style.setProperty('--enqueued-color', songColor);
        li.classList.add("enqueued-flash");
        setTimeout(() => {
            li.classList.remove("enqueued-flash");
            li.style.removeProperty('--enqueued-color');
        }, 250);
    }

    let suppressNextClick = false;

    if (typeof isMobileDevice !== 'undefined' && isMobileDevice) {
        let touchStartX = 0;
        let touchStartY = 0;
        let lastDx = 0;
        let activeLi = null;
        let currentY = '0px';
        let isHorizontalSwipe = false;
        let isSwipeLocked = false;
        let swipeBackdrop = null;
        let legEnq = null;
        let legDown = null;
        const thresholdRatio = 0.05; // 5% drag width confirms action
        const iconWidth = 22;
        const gap = 0;
        const parkOffset = gap + iconWidth; // 22px total offset

        trackList.addEventListener("touchstart", (e) => {
            if (!e.touches || e.touches.length !== 1) return;
            const li = e.target.closest("li");
            if (!li || !li.dataset.index || !li.dataset.playlist) return;
            if (e.target.closest(".yt-link-icon")) return;

            const pl = li.dataset.playlist;
            const idx = parseInt(li.dataset.index, 10);

            if (li.classList.contains("active") || (idx === globalActiveOriginalIndex && pl === globalActivePlaylist)) {
                return;
            }

            activeLi = li;
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            lastDx = 0;
            isHorizontalSwipe = false;
            isSwipeLocked = false;

            const targetTrack = (allDatabases && allDatabases[pl] && allDatabases[pl][idx]) || (currentPlaylistData && currentPlaylistData[idx]);
            const songColor = targetTrack ? ((typeof getTrackColor === 'function') ? getTrackColor(targetTrack) : ((targetTrack.color && targetTrack.color !== '#000000') ? targetTrack.color : (dominantColorCache.get(targetTrack.id) || '#8c73ff'))) : '#8c73ff';
            activeLi.style.setProperty('--enqueued-color', songColor);

            const match = activeLi.style.transform ? activeLi.style.transform.match(/translate3d\(\s*[^,]+,\s*([^,]+)/) : null;
            currentY = match ? match[1].trim() : '0px';
            activeLi.style.transition = 'none';
            activeLi.classList.remove('snapping');

            swipeBackdrop = document.getElementById("swipe-backdrop");
            if (swipeBackdrop) {
                legEnq = swipeBackdrop.querySelector('.action-enqueue') || swipeBackdrop.querySelector('.swipe-legend-enqueue');
                legDown = swipeBackdrop.querySelector('.action-download') || swipeBackdrop.querySelector('.swipe-legend-download');
                swipeBackdrop.style.transition = 'none';
                swipeBackdrop.style.transform = `translate3d(0, ${currentY}, 0)`;
                swipeBackdrop.style.setProperty('--swipe-color', songColor);
                swipeBackdrop.style.opacity = '0';
                if (legEnq) {
                    legEnq.classList.remove('snapping', 'legend-triggered');
                    legEnq.style.transform = `translateX(-${parkOffset}px)`;
                }
                if (legDown) {
                    legDown.classList.remove('snapping', 'legend-triggered');
                    legDown.style.transform = `translateX(${parkOffset}px)`;
                }
            }
        }, { passive: true });

        trackList.addEventListener("touchmove", (e) => {
            if (!activeLi || !e.touches || e.touches.length !== 1) return;
            const touch = e.touches[0];
            const dx = touch.clientX - touchStartX;
            const dy = touch.clientY - touchStartY;
            lastDx = dx;

            if (!isSwipeLocked) {
                const absX = Math.abs(dx);
                const absY = Math.abs(dy);
                if (absX > 8 || absY > 8) {
                    isSwipeLocked = true;
                    isHorizontalSwipe = absX > absY;
                    if (!isHorizontalSwipe) {
                        if (activeLi) {
                            activeLi.classList.remove('is-swiping', 'slide-enqueue', 'slide-download');
                            activeLi.style.removeProperty('--enqueued-color');
                            activeLi = null;
                        }
                        if (swipeBackdrop) {
                            swipeBackdrop.style.opacity = '0';
                        }
                        return;
                    }
                    activeLi.classList.add('is-swiping');
                } else {
                    return;
                }
            }

            if (isHorizontalSwipe) {
                if (e.cancelable) e.preventDefault();
                const currentX = dx;
                const thresholdPx = (activeLi && activeLi.offsetWidth) ? (activeLi.offsetWidth * thresholdRatio) : 20;
                activeLi.style.setProperty('--swipe-x', `${currentX}px`);
                activeLi.style.transform = `translate3d(${currentX}px, ${currentY}, 0)`;
                if (currentX > 40) {
                    activeLi.classList.add('slide-enqueue');
                    activeLi.classList.remove('slide-download');
                } else if (currentX < -40) {
                    activeLi.classList.add('slide-download');
                    activeLi.classList.remove('slide-enqueue');
                } else {
                    activeLi.classList.remove('slide-enqueue', 'slide-download');
                }

                if (swipeBackdrop) {
                    if (currentX > 0) {
                        // Right Swipe: Logo follows card div till fully revealed (0px), then clamps
                        swipeBackdrop.style.opacity = '1';
                        if (legEnq) {
                            const enqX = Math.min(0, currentX - parkOffset);
                            legEnq.style.transform = `translateX(${enqX}px)`;
                            if (currentX >= 60 || currentX >= thresholdPx) {
                                legEnq.classList.add('legend-triggered');
                            } else {
                                legEnq.classList.remove('legend-triggered', 'enqueue-success');
                            }
                        }
                        if (legDown) {
                            legDown.classList.remove('legend-triggered', 'enqueue-success');
                            legDown.style.transform = `translateX(${parkOffset}px)`;
                        }
                    } else if (currentX < 0) {
                        // Left Swipe: Logo follows card div till fully revealed (0px), then clamps
                        swipeBackdrop.style.opacity = '1';
                        if (legDown) {
                            const downX = Math.max(0, currentX + parkOffset);
                            legDown.style.transform = `translateX(${downX}px)`;
                            if (currentX <= -60 || currentX <= -thresholdPx) {
                                legDown.classList.add('legend-triggered');
                            } else {
                                legDown.classList.remove('legend-triggered');
                            }
                        }
                        if (legEnq) {
                            legEnq.classList.remove('legend-triggered', 'enqueue-success');
                            legEnq.style.transform = `translateX(-${parkOffset}px)`;
                        }
                    } else {
                        swipeBackdrop.style.opacity = '0';
                        if (legEnq) {
                            legEnq.classList.remove('legend-triggered', 'enqueue-success');
                            legEnq.style.transform = `translateX(-${parkOffset}px)`;
                        }
                        if (legDown) {
                            legDown.classList.remove('legend-triggered', 'enqueue-success');
                            legDown.style.transform = `translateX(${parkOffset}px)`;
                        }
                    }
                }
            }
        }, { passive: false });

        const handleTouchEnd = (e) => {
            if (!activeLi) return;
            const targetLi = activeLi;
            const targetY = currentY;
            activeLi = null;

            // Non-swipe tap or vertical scroll: clean up immediately without transform transition to prevent tap animation artifact
            if (!isHorizontalSwipe) {
                targetLi.classList.remove('snapping', 'is-swiping', 'slide-enqueue', 'slide-download');
                targetLi.style.removeProperty('--enqueued-color');
                targetLi.style.removeProperty('--swipe-x');
                targetLi.style.transition = '';
                if (swipeBackdrop) {
                    swipeBackdrop.style.opacity = '0';
                    swipeBackdrop.style.transition = '';
                }
                return;
            }

            const touch = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : null;
            const dx = (touch && typeof touch.clientX === 'number') ? (touch.clientX - touchStartX) : lastDx;
            const thresholdPx = (targetLi && targetLi.offsetWidth) ? (targetLi.offsetWidth * thresholdRatio) : 20;
            const pastThreshold = Math.abs(dx) > thresholdPx;
            let enqueueTriggered = false;

            if (isHorizontalSwipe && e.type !== 'touchcancel') {
                suppressNextClick = true;
                const isPastThresholdRight = isHorizontalSwipe && (dx > 0 && pastThreshold);
                const isPastThresholdLeft = isHorizontalSwipe && (dx < 0 && pastThreshold);
                if (dx >= 60) {
                    const pl = targetLi.dataset.playlist;
                    const idx = parseInt(targetLi.dataset.index, 10);
                    if (typeof queuePlayNext === 'function') queuePlayNext(pl, idx);
                    if (navigator.vibrate) navigator.vibrate(40);
                    if (typeof triggerEnqueuedFlash === 'function') triggerEnqueuedFlash(targetLi);
                    enqueueTriggered = true;
                } else if (dx <= -60) {
                    const pl = targetLi.dataset.playlist;
                    const idx = parseInt(targetLi.dataset.index, 10);
                    if (typeof window.downloadSingleTrack === 'function') window.downloadSingleTrack(pl, idx);
                    if (navigator.vibrate) navigator.vibrate(40);
                } else if (isPastThresholdRight) {
                    const pl = targetLi.dataset.playlist;
                    const idx = parseInt(targetLi.dataset.index, 10);
                    if (typeof queuePlayNext === 'function') queuePlayNext(pl, idx);
                    if (navigator.vibrate) navigator.vibrate(40);
                    if (typeof triggerEnqueuedFlash === 'function') triggerEnqueuedFlash(targetLi);
                    enqueueTriggered = true;
                } else if (isPastThresholdLeft) {
                    const pl = targetLi.dataset.playlist;
                    const idx = parseInt(targetLi.dataset.index, 10);
                    if (typeof window.downloadSingleTrack === 'function') window.downloadSingleTrack(pl, idx);
                    if (navigator.vibrate) navigator.vibrate(40);
                }
            }

            // Snap surface and SVGs back to parked state matching test.html
            targetLi.classList.add('snapping');
            targetLi.style.transition = 'transform 250ms cubic-bezier(0.2, 0, 0, 1), background-color 0.25s ease';
            targetLi.style.setProperty('--swipe-x', '0px');
            targetLi.style.transform = `translate3d(0, ${targetY}, 0)`;
            targetLi.classList.remove('slide-enqueue', 'slide-download');
            if (!targetLi.classList.contains('enqueued-flash')) {
                targetLi.style.removeProperty('--enqueued-color');
            }

            if (swipeBackdrop) {
                if (enqueueTriggered && legEnq) {
                    // Signify enqueue success with minimal green hint/glow while card glides back
                    legEnq.classList.add('enqueue-success');
                    legEnq.style.transform = 'translateX(0px)';
                } else if (legEnq) {
                    legEnq.classList.add('snapping');
                    legEnq.style.transform = `translateX(-${parkOffset}px)`;
                }
                if (legDown) {
                    legDown.classList.add('snapping');
                    legDown.style.transform = `translateX(${parkOffset}px)`;
                }
                swipeBackdrop.style.transition = 'opacity 250ms cubic-bezier(0.2, 0, 0, 1)';
                swipeBackdrop.style.opacity = '0';
                setTimeout(() => {
                    if (swipeBackdrop && swipeBackdrop.style.opacity === '0') {
                        swipeBackdrop.style.transition = '';
                        if (legEnq) {
                            legEnq.classList.remove('snapping', 'legend-triggered', 'enqueue-success');
                            legEnq.style.transform = `translateX(-${parkOffset}px)`;
                        }
                        if (legDown) {
                            legDown.classList.remove('snapping', 'legend-triggered');
                        }
                    }
                }, 250);
            }

            const cleanup = () => {
                targetLi.removeEventListener('transitionend', cleanup);
                targetLi.classList.remove('snapping', 'is-swiping');
                targetLi.style.transition = '';
            };
            targetLi.addEventListener('transitionend', cleanup, { once: true });
            setTimeout(cleanup, 260);

            setTimeout(() => {
                suppressNextClick = false;
            }, 300);
        };

        trackList.addEventListener("touchend", handleTouchEnd, { passive: true });
        trackList.addEventListener("touchcancel", handleTouchEnd, { passive: true });
    }

    trackList.addEventListener("click", (e) => {
        if (suppressNextClick) {
            suppressNextClick = false;
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        if (window.getSelection && window.getSelection().toString().trim().length > 0) {
            return;
        }
        const li = e.target.closest("li");
        if (!li || !li.dataset.index || !li.dataset.playlist) return;
        
        playTrackSelection(li.dataset.playlist, parseInt(li.dataset.index));
    });

    trackList.addEventListener("contextmenu", (e) => {
        if (typeof isMobileDevice !== 'undefined' && isMobileDevice) {
            return;
        }
        const li = e.target.closest("li");
        if (!li || !li.dataset.index || !li.dataset.playlist) return;
        
        if (window.getSelection && window.getSelection().toString().trim().length > 0) {
            return;
        }

        e.preventDefault();
        if (window.getSelection) {
            const sel = window.getSelection();
            if (sel) {
                if (typeof sel.removeAllRanges === 'function') sel.removeAllRanges();
                else if (typeof sel.empty === 'function') sel.empty();
            }
        }
        queuePlayNext(li.dataset.playlist, parseInt(li.dataset.index));
        triggerEnqueuedFlash(li);
    });

    window.addEventListener("popstate", (e) => {
        const view = e.state ? e.state.view : null;
        if (view !== 'lyrics' && window.lyricsActive) {
            closeLyricsUI();
        }
        if (view !== 'player' && view !== 'lyrics' && nowPlaying.classList.contains("expanded")) {
            nowPlaying.classList.remove("expanded");
        }
    });

    lyricsToggleHint.addEventListener('click', () => {
        if (!window.lyricsActive) {
            window.lyricsActive = true;
            pushHistoryState('lyrics');
            lyricsToggleHint.style.color = 'var(--primary-color)';
            lyricsContainer.style.display = 'flex';
            if (queueIndex >= 0 && queueIndex < playQueue.length) {
                loadLyrics(currentPlaylistData[playQueue[queueIndex]]);
            } else if (typeof updateLyricsUI === 'function') {
                updateLyricsUI(audioPlayer.currentTime);
            }
        } else {
            history.back();
        }
    });

    document.getElementById('btn-close-lyrics').addEventListener('click', () => {
        if (window.lyricsActive) history.back();
    });

    let lyricsTouchStartY = 0;
    lyricsContainer.addEventListener("touchstart", (e) => {
        lyricsTouchStartY = e.changedTouches[0].screenY;
    }, {passive: true});

    lyricsContainer.addEventListener("touchend", (e) => {
        if (window.innerWidth > 1110) return;
        let touchEndY = e.changedTouches[0].screenY;
        const lyricsContent = document.getElementById('lyrics-content');
        
        // Only allow swipe down to dismiss if we are at the top of the scrollable lyrics
        if (window.lyricsActive && touchEndY > lyricsTouchStartY + 50 && lyricsContent.scrollTop <= 0) {
            history.back();
        }
    }, {passive: true});

    btnPlayPause.addEventListener("click", () => {
        window.mediaSessionDestroyed = false;
        if (window.playbackMode === 'mode2' && typeof isMobileDevice !== 'undefined' && isMobileDevice && typeof initLiveAudioAnchor === 'function') {
            initLiveAudioAnchor();
        }
        if (window.playbackMode === 'mode2' && typeof isMobileDevice !== 'undefined' && isMobileDevice && typeof primeFocusProbe === 'function') {
            primeFocusProbe();
        }
        if (!audioPlayer.src) {
            if (playQueue.length > 0 && queueIndex !== -1) {
                executePlayback(false);
            } else if (playQueue.length > 0) {
                queueIndex = 0;
                executePlayback(false);
            }
            return;
        }
        
        // Toggle based on user playback intent to prevent ghost state during initial buffering
        if (window.wasPausedByUser || audioPlayer.paused) {
            window.wasPausedByUser = false;
            // Always-on anchor in Mode 2; stop only in Mode 1.
            if (window.playbackMode === 'mode2') {
                if (typeof startLiveAudioAnchor === 'function') startLiveAudioAnchor();
            } else {
                if (typeof stopLiveAudioAnchor === 'function') {
                    stopLiveAudioAnchor();
                }
                if (typeof stopMode1HandoverKeepalive === 'function') {
                    stopMode1HandoverKeepalive();
                }
            }
            if (typeof cancelAutoKillWatchdog === 'function') cancelAutoKillWatchdog();
            setPlayUI(true);
            if (hasMediaSession) navigator.mediaSession.playbackState = 'playing';
            const dur = audioPlayer.duration || parseFloat(seekBar.max) || 0;
            const actualTime = (audioPlayer.active && typeof audioPlayer.active.currentTime === 'number')
                ? audioPlayer.active.currentTime
                : audioPlayer.currentTime;
            if (dur > 0 && actualTime >= dur - 0.5 && audioPlayer._pendingSeek === null) {
                audioPlayer.currentTime = 0;
                updateTimeUI(0);
                if (window.lyricsActive && typeof updateLyricsUI === 'function') {
                    updateLyricsUI(0);
                }
            }
            audioPlayer.play().catch(e => console.warn("Play blocked:", e));
        } else {
            window.wasPausedByUser = true;
            setPlayUI(false);
            if (hasMediaSession) navigator.mediaSession.playbackState = (typeof window.declaredPausedState === 'function')
                ? window.declaredPausedState() : ((window.playbackMode === 'mode2') ? 'playing' : 'paused');
            if (window.playbackMode === 'mode2' && !window.isCallActive && typeof startLiveAudioAnchor === 'function') {
                startLiveAudioAnchor();
            } else if (!window.isCallActive && typeof startMode1HandoverKeepalive === 'function') {
                startMode1HandoverKeepalive();
            }
            audioPlayer.instantPause();
            if (window.playbackMode === 'mode2' && hasMediaSession) {
                const dur = audioPlayer.duration || (typeof seekBar !== 'undefined' && parseFloat(seekBar.max)) || 0;
                updateMediaSessionPosition(audioPlayer.currentTime, dur, null, true);
            } else if (hasMediaSession) {
                const dur = audioPlayer.duration || (typeof seekBar !== 'undefined' && parseFloat(seekBar.max)) || 0;
                updateMediaSessionPosition(audioPlayer.currentTime, dur, 1.0, true);
            }
        }
    });

    btnNext.addEventListener("click", playNext);
    btnPrev.addEventListener("click", playPrev);

    btnShuffle.addEventListener("click", () => {
        shuffleMode = (shuffleMode + 1) % 3;
        applyShuffleUI();
        if (typeof saveLastPlayedState === 'function') {
            saveLastPlayedState();
        }

        if (shuffleMode === 1) {
            // Shuffle all: cross-playlist random
            generateQueue(false); // un-shuffle current playlist queue
            crossShuffleHistory = [];
            crossShufflePos = -1; // Reset position so rebuildCrossShuffleDeck shuffles the entire deck
            
            if (typeof window.rebuildCrossShuffleDeck === 'function') {
                window.rebuildCrossShuffleDeck();
            }
            
            if (queueIndex >= 0 && queueIndex < playQueue.length) {
                const currentOriginalIndex = playQueue[queueIndex];
                const curPl = playlistSelect.value;
                const newIdx = crossShuffleHistory.findIndex(t => t.playlist === curPl && t.index === currentOriginalIndex);
                if (newIdx !== -1) {
                    // Swap it to the front so we don't throw away any tracks before it
                    const temp = crossShuffleHistory[0];
                    crossShuffleHistory[0] = crossShuffleHistory[newIdx];
                    crossShuffleHistory[newIdx] = temp;
                    crossShufflePos = 0;
                } else {
                    crossShufflePos = 0;
                }
            } else {
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
        if (typeof saveLastPlayedState === 'function') {
            saveLastPlayedState();
        }
    });

    const currentChannelEl = document.getElementById("current-channel");
    if (currentChannelEl) {
        currentChannelEl.addEventListener("click", () => {
            autoplayEnabled = !autoplayEnabled;
            applyAutoplayUI();
        });
    }
    function syncDuration() {
        const dur = audioPlayer.duration;
        if (!isNaN(dur) && dur > 0 && dur !== Infinity) {
            const roundedDur = Math.floor(dur);
            const currentMax = parseFloat(seekBar.max) || 0;
            const isSettled = !audioPlayer._mediaSource || audioPlayer._mediaSource.readyState === 'ended';
            if (currentMax === 0 || isSettled || Math.abs(currentMax - roundedDur) <= 2) {
                if (currentMax !== roundedDur) {
                    seekBar.max = roundedDur;
                    totalTimeDisplay.textContent = formatTime(roundedDur);
                    if (typeof updateBufferProgress === 'function') updateBufferProgress();
                    updateMediaSessionPosition();
                }
            }
        }
    }
    audioPlayer.addEventListener("durationchange", syncDuration);
    audioPlayer.addEventListener("loadedmetadata", syncDuration);
    audioPlayer.addEventListener("canplay", syncDuration);

    audioPlayer.addEventListener("seeked", () => {
        updateMediaSessionPosition();
    });
    audioPlayer.addEventListener("ratechange", updateMediaSessionPosition);
    
    audioPlayer.addEventListener("progress", () => {
        if (typeof updateBufferProgress === 'function') updateBufferProgress();
        if (!audioPlayer.duration || audioPlayer.duration === Infinity) return;
        const buffered = audioPlayer.buffered;
        if (buffered.length > 0) {
            const buffEnd = buffered.end(buffered.length - 1);
            if (buffEnd >= audioPlayer.duration * 0.85 || audioPlayer._streamDone || buffEnd >= audioPlayer.duration - 2) {
                if (typeof triggerPreloads === 'function') triggerPreloads();
            }
        }
    });
    
    audioPlayer.addEventListener("play", () => {
        if (window.wasPausedByUser) {
            audioPlayer.instantPause();
            return;
        }
        window.wasPausedByUser = false;
        window.wasPlayingBeforeCall = true;
        // Always-on anchor in Mode 2 (idempotent start); Mode 1 stops.
        if (window.playbackMode === 'mode2') {
            if (typeof startLiveAudioAnchor === 'function') startLiveAudioAnchor();
        } else {
            if (typeof stopLiveAudioAnchor === 'function') {
                stopLiveAudioAnchor();
            }
            if (typeof stopMode1HandoverKeepalive === 'function') {
                stopMode1HandoverKeepalive();
            }
        }
        if (typeof cancelAutoKillWatchdog === 'function') cancelAutoKillWatchdog();
        setPlayUI(true);
        lastRenderTime = -1;

        if (hasMediaSession) {
            navigator.mediaSession.playbackState = 'playing';
            const dur = audioPlayer.duration || parseFloat(seekBar.max) || 0;
            updateMediaSessionPosition(audioPlayer.currentTime, dur, audioPlayer.playbackRate || 1.0);
        }

        if (window.lyricsActive && typeof updateLyricsUI === 'function') {
            updateLyricsUI(audioPlayer.currentTime);
        }
    });

    audioPlayer.addEventListener("playing", () => {
        // Always-on anchor in Mode 2 (idempotent start); Mode 1 stops.
        if (window.playbackMode === 'mode2') {
            if (typeof startLiveAudioAnchor === 'function') startLiveAudioAnchor();
        } else {
            if (typeof stopLiveAudioAnchor === 'function') {
                stopLiveAudioAnchor();
            }
            if (typeof stopMode1HandoverKeepalive === 'function') {
                stopMode1HandoverKeepalive();
            }
        }
        if (typeof cancelAutoKillWatchdog === 'function') cancelAutoKillWatchdog();
        setPlayUI(true);
        if (hasMediaSession) {
            navigator.mediaSession.playbackState = 'playing';
        }
    });

    audioPlayer.addEventListener("pause", () => {
        if ((audioPlayer.switching && !window.wasPausedByUser) || (audioPlayer._pendingSeek !== null && !window.wasPausedByUser)) return;

        lastTimeupdateFire = 0;
        if (typeof window !== 'undefined') window.lastTimeupdateFire = 0;

        if (typeof saveLastPlayedState === 'function') {
            saveLastPlayedState();
        }

        setPlayUI(false);
        if (hasMediaSession) {
            const dur = audioPlayer.duration || parseFloat(seekBar.max) || 0;
            const isRecentBtDisconnect = (typeof window.lastBtDisconnectTime === 'number' && Date.now() - window.lastBtDisconnectTime < 2500);

            if (window.playbackMode === 'mode2' && !isRecentBtDisconnect) {
                if (!window.wasPausedByUser) {
                    window.wasPlayingBeforeCall = true;
                }
                if (typeof startLiveAudioAnchor === 'function') {
                    startLiveAudioAnchor();
                }
                // Mode 2 pause (user or transient interrupt): keep 'playing' spoof to pin the wave animation
                updateMediaSessionPosition(audioPlayer.currentTime, dur, 1.0);
                navigator.mediaSession.playbackState = (typeof window.declaredPausedState === 'function')
                    ? window.declaredPausedState() : 'playing';
            } else {
                // Mode 1 or BT disconnect: set 'paused' so Android native focus resume works
                if (isRecentBtDisconnect) {
                    window.wasPausedByUser = true;
                    window.wasPlayingBeforeCall = false;
                } else if (!window.wasPausedByUser) {
                    window.wasPlayingBeforeCall = true;
                }
                if (!document.hidden && !window.isCallActive && typeof startMode1HandoverKeepalive === 'function') {
                    startMode1HandoverKeepalive();
                }
                updateMediaSessionPosition(audioPlayer.currentTime, dur, 1.0, true);
                navigator.mediaSession.playbackState = 'paused';
            }
        }
    });

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            if (typeof stopMode1HandoverKeepalive === 'function') {
                stopMode1HandoverKeepalive();
            }
            if (!audioPlayer.paused) {
                lastRenderTime = -1;
                updateTimeUI(Math.floor(audioPlayer.currentTime));
                lastRenderTime = -1;

                // Re-sync MediaSession state when PWA is foregrounded
                if (typeof resyncMediaSessionOnForeground === 'function') {
                    resyncMediaSessionOnForeground('unlock-playing');
                } else if (hasMediaSession) {
                    navigator.mediaSession.playbackState = 'playing';
                    const dur = audioPlayer.duration || parseFloat(seekBar.max) || 0;
                    updateMediaSessionPosition(audioPlayer.currentTime, dur);
                }
            } else if (window.playbackMode === 'mode2' && !window.isCallActive && !audioPlayer.switching && !window.mediaSessionDestroyed) {
                const isRecentBtDisconnect = (typeof window.lastBtDisconnectTime === 'number' && Date.now() - window.lastBtDisconnectTime < 2500);
                if (!window.wasPausedByUser && window.wasPlayingBeforeCall !== false && !isRecentBtDisconnect) {
                    // INTERRUPTED (steal killed our native session while music
                    // played): resurrect HONEST so the triangle delivers. This
                    // is the attended moment, so honesty is safe; the next
                    // user-pause re-spoofs via helper. Rebuild metadata fresh
                    // (old binding may be gone), freeze position, re-arm audio.
                    try {
                        const db = (typeof allDatabases !== 'undefined' && globalActivePlaylist) ? allDatabases[globalActivePlaylist] : null;
                        const track = (db && globalActiveOriginalIndex >= 0) ? db[globalActiveOriginalIndex] : null;
                        if (track && typeof window.publishTrackMetadata === 'function' && typeof getAudioUrl === 'function') {
                            window.publishTrackMetadata(track, getThumbUrl(track), globalActiveOriginalIndex);
                        } else if (typeof republishMediaMetadata === 'function') {
                            republishMediaMetadata();
                        }
                    } catch (e) {}
                    if (hasMediaSession) {
                        navigator.mediaSession.playbackState = (typeof window.declaredPausedState === 'function')
                            ? window.declaredPausedState() : 'playing';
                        const dur = audioPlayer.duration || parseFloat(seekBar.max) || 0;
                        if (typeof updateMediaSessionPosition === 'function') {
                            updateMediaSessionPosition(audioPlayer.currentTime, dur, 1.0);
                        }
                    }
                    if (typeof startLiveAudioAnchor === 'function') startLiveAudioAnchor();
                    if (typeof startFocusProbe === 'function') startFocusProbe();
                    if (typeof armAutoKillWatchdog === 'function') armAutoKillWatchdog();
                    if (typeof setPlayUI === 'function') setPlayUI(false);
                } else {
                    // User-paused: re-arm keepalive + probe. Declare state via helper and refresh position timestamp.
                    if (typeof startLiveAudioAnchor === 'function') {
                        startLiveAudioAnchor();
                    }
                    if (typeof startFocusProbe === 'function') {
                        startFocusProbe();
                    }
                    if (typeof resyncMediaSessionOnForeground === 'function') {
                        resyncMediaSessionOnForeground('unlock-mode2-paused');
                    } else if (hasMediaSession) {
                        navigator.mediaSession.playbackState = (typeof window.declaredPausedState === 'function')
                            ? window.declaredPausedState() : 'playing';
                        const dur = audioPlayer.duration || parseFloat(seekBar.max) || 0;
                        if (typeof updateMediaSessionPosition === 'function') {
                            updateMediaSessionPosition(audioPlayer.currentTime, dur);
                        }
                    }
                    if (typeof startAnchorHeartbeat === 'function') {
                        startAnchorHeartbeat(0);
                    }
                }
            }
        } else {
            // Going hidden while paused in Mode 2: declare state via helper (unattended pin).
            if (typeof saveLastPlayedState === 'function') {
                saveLastPlayedState();
            }
            if (window.playbackMode === 'mode2' && !window.isCallActive && typeof audioPlayer !== 'undefined' && audioPlayer && (audioPlayer.paused || window.wasPausedByUser) && !audioPlayer.switching) {
                if (typeof startLiveAudioAnchor === 'function') {
                    startLiveAudioAnchor();
                }
                if (typeof startFocusProbe === 'function') {
                    startFocusProbe();
                }
                if (typeof armAutoKillWatchdog === 'function') {
                    armAutoKillWatchdog();
                }
                if (hasMediaSession) {
                    navigator.mediaSession.playbackState = (typeof window.declaredPausedState === 'function')
                        ? window.declaredPausedState() : 'playing';
                    const dur = audioPlayer.duration || (typeof seekBar !== 'undefined' && parseFloat(seekBar.max)) || 0;
                    updateMediaSessionPosition(audioPlayer.currentTime, dur, null, true);
                }
            } else if (typeof audioPlayer !== 'undefined' && audioPlayer && (audioPlayer.paused || window.wasPausedByUser) && !audioPlayer.switching) {
                if (hasMediaSession) {
                    navigator.mediaSession.playbackState = (typeof window.declaredPausedState === 'function')
                        ? window.declaredPausedState() : 'paused';
                    const dur = audioPlayer.duration || (typeof seekBar !== 'undefined' && parseFloat(seekBar.max)) || 0;
                    updateMediaSessionPosition(audioPlayer.currentTime, dur, 1.0, true);
                }
                if (typeof settleMode1HandoverKeepalive === 'function') {
                    settleMode1HandoverKeepalive();
                }
            }
        }
    });

    const flushLastPlayedState = () => {
        if (typeof saveLastPlayedState === 'function') {
            saveLastPlayedState();
        }
    };
    window.addEventListener("pagehide", flushLastPlayedState);
    window.addEventListener("beforeunload", flushLastPlayedState);
    document.addEventListener("freeze", flushLastPlayedState);

    // pageshow covers bfcache restores and lock-screen foregrounds where
    // visibilitychange ordering is unreliable. Timeupdate self-heal above
    // covers unlock-to-home where hidden stays true.
    window.addEventListener("pageshow", () => {
        if (!document.hidden && !audioPlayer.paused && !audioPlayer.switching) {
            lastRenderTime = -1;
            if (typeof resyncMediaSessionOnForeground === 'function') {
                resyncMediaSessionOnForeground('pageshow-playing');
            }
        }
    });

    // --- Mobile Mini Player Expand/Collapse Logic ---
    nowPlaying.addEventListener("click", (e) => {
        if (window.innerWidth <= 750 && !nowPlaying.classList.contains("expanded")) {
            if (e.target.closest('.control-btn, #thumb-toggle-hint, #album-art-container, #current-channel')) return;
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
            if (window.innerWidth > 750) return;
            const touchEndY = e.changedTouches[0].screenY;
            const deltaY = touchEndY - touchStartY;
            const minimizeThreshold = Math.max(80, window.innerHeight * 0.12);

            if (nowPlaying.classList.contains("expanded") && deltaY >= minimizeThreshold) {
                history.back();
            } else if (!nowPlaying.classList.contains("expanded") && deltaY <= -20) {
                nowPlaying.classList.add("expanded");
                pushHistoryState('player');
            }
        }, {passive: true});
    }
    // --------------------------------------------
    let wasPlayingBeforeSeek = false;
    let pendingSeekTarget = null;

    const getSeekTimeFromEvent = (e) => {
        if (!seekBar) return null;
        const rect = seekBar.getBoundingClientRect();
        if (!rect || rect.width <= 0) return null;
        let clientX = null;
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
        } else if (e.changedTouches && e.changedTouches.length > 0) {
            clientX = e.changedTouches[0].clientX;
        } else if (typeof e.clientX === 'number') {
            clientX = e.clientX;
        }
        if (clientX === null) return null;
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const maxDur = audioPlayer.duration || parseFloat(seekBar.max) || 0;
        return ratio * maxDur;
    };

    seekBar.addEventListener("pointerdown", (e) => {
        if (!isSeeking) {
            wasPlayingBeforeSeek = !window.wasPausedByUser;
            isSeeking = true;
        }
        const calcTime = getSeekTimeFromEvent(e);
        if (calcTime !== null) {
            pendingSeekTarget = calcTime;
            seekBar.value = calcTime;
            currentTimeDisplay.textContent = formatTime(Math.floor(calcTime));
        }
    });

    seekBar.addEventListener("input", (e) => {
        if (!isSeeking) {
            wasPlayingBeforeSeek = !window.wasPausedByUser;
            isSeeking = true;
        }
        const val = Number(e.target.value);
        pendingSeekTarget = val;
        currentTimeDisplay.textContent = formatTime(Math.floor(val));
    });

    const endSeek = (e) => {
        if (!isSeeking) return;
        isSeeking = false;
        lastTimeupdateFire = 0;
        if (typeof window !== 'undefined') window.lastTimeupdateFire = 0;

        let targetTime = pendingSeekTarget;
        if (targetTime === null) {
            const calc = getSeekTimeFromEvent(e);
            targetTime = (calc !== null) ? calc : Number(e.target.value);
        }
        pendingSeekTarget = null;
        
        if (wasPlayingBeforeSeek) {
            window.wasPausedByUser = false;
        }

        try {
            audioPlayer.currentTime = targetTime;
        } catch (err) {
            console.warn("Seek error:", err);
        }
        updateTimeUI(targetTime);
        if (window.lyricsActive) updateLyricsUI(targetTime);
        
        // Explicitly pass target time and total duration
        const totalDur = audioPlayer.duration || parseFloat(seekBar.max) || 0;
        updateMediaSessionPosition(targetTime, totalDur);
        if (typeof saveLastPlayedState === 'function') {
            saveLastPlayedState(targetTime);
        }
        
        if (wasPlayingBeforeSeek) {
            audioPlayer.play().catch(console.warn);
            setPlayUI(true);
        }
    };

    seekBar.addEventListener("change", endSeek);
    seekBar.addEventListener("pointerup", endSeek);
    seekBar.addEventListener("pointercancel", endSeek);

    let lastSaveStateTime = 0;
    audioPlayer.addEventListener("timeupdate", () => {
        if (!isSeeking && audioPlayer.duration > 0 && audioPlayer.duration !== Infinity && audioPlayer._pendingSeek === null && !audioPlayer.switching) {
            const ct = audioPlayer.currentTime;
            const roundedSec = Math.floor(ct);

            // Self-heal for lock/Doze gaps where the JS event loop was suspended.
            // Inter-arrival delta between consecutive timeupdates measures true loop
            // suspension (monotonic clock), avoiding high-frequency IPC-age thrashing.
            const nowMonotonic = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            const effectiveLastFire = Math.max(lastTimeupdateFire, (typeof window !== 'undefined' && window.lastTimeupdateFire) || 0);
            const eventDelta = (effectiveLastFire > 0) ? (nowMonotonic - effectiveLastFire) : 0;
            lastTimeupdateFire = nowMonotonic;
            if (typeof window !== 'undefined') window.lastTimeupdateFire = nowMonotonic;

            // Self-heal for lock gaps without visibilitychange (unlock to home
            // screen leaves document.hidden true, so unlock-playing never runs).
            // If SystemUI interpolator starved over 3s, force one anchor even
            // when the second is unchanged.
            let staleGap = false;
            try {
                if (typeof window.getLastPositionTimestamp === 'function') {
                    staleGap = (Date.now() - window.getLastPositionTimestamp() > 3000);
                }
            } catch (e) {}

            if (roundedSec !== lastRenderTime || (staleGap && !audioPlayer.paused)) {
                if (staleGap && !audioPlayer.paused) {
                    window._forceNextPosition = true;
                }
                updateTimeUI(ct);
                updateMediaSessionPosition(ct, audioPlayer.duration, audioPlayer.playbackRate || 1);
            }
        }
        if (!audioPlayer.paused && typeof saveLastPlayedState === 'function') {
            const now = Date.now();
            if (now - lastSaveStateTime > 2000) {
                lastSaveStateTime = now;
                saveLastPlayedState();
            }
        }
        if (window.lyricsActive && typeof updateLyricsUI === 'function') {
            updateLyricsUI(audioPlayer.currentTime);
        }
        if (typeof updateBufferProgress === 'function') updateBufferProgress();
    });

    audioPlayer.addEventListener("progress", () => {
        if (typeof updateBufferProgress === 'function') updateBufferProgress();
    });

    let lastEndedTime = 0;
    audioPlayer.addEventListener("ended", () => {
        if (audioPlayer.switching) return;
        lastTimeupdateFire = 0;
        if (typeof window !== 'undefined') window.lastTimeupdateFire = 0;
        const now = Date.now();
        if (now - lastEndedTime < 1000) return; // Debounce multiple rapid native ended events
        lastEndedTime = now;

        // If autoplay is disabled, strictly stop and retain end position
        if (!autoplayEnabled) {
            window.wasPausedByUser = true;
            setPlayUI(false);
            if (hasMediaSession) {
                navigator.mediaSession.playbackState = (typeof window.declaredPausedState === 'function')
                    ? window.declaredPausedState() : 'paused';
            }
            return;
        }

        if (repeatMode === 2) { 
            audioPlayer.currentTime = 0;
            updateTimeUI(0);
            if (window.lyricsActive && typeof updateLyricsUI === 'function') {
                updateLyricsUI(0);
            }
            audioPlayer.play().catch(e => console.warn("Repeat play error:", e));
        } else {
            playNext();
        }
    });

    let isRecoveringAudio = false;
    let recoveryAttempts = 0;

    audioPlayer.addEventListener("playing", () => {
        isRecoveringAudio = false;
        recoveryAttempts = 0;
    });

    audioPlayer.addEventListener("error", () => {
        if (audioPlayer.switching) return;
        const activeEl = audioPlayer.active || audioPlayer;
        const err = activeEl.error;
        // Ignore MEDIA_ERR_ABORTED (1) from in-flight aborted stream / track change
        if (err && err.code === 1) return;
        if (!audioPlayer.getAttribute('src') || errorSkipTimer) return;
          
        // Android Power Management / Network drop: Try to recover before skipping (both buffering & mid-playback)
        if (recoveryAttempts < 3 && !isRecoveringAudio) {
            isRecoveringAudio = true;
            recoveryAttempts++;
            const ct = audioPlayer.currentTime > 0 ? audioPlayer.currentTime : (audioPlayer.lastKnownTime || 0);
            const savedTime = ct;
            const track = (currentPlaylistData && currentPlaylistData[playQueue[queueIndex]]) || 
                          (currentPlaylistData && currentPlaylistData[globalActiveOriginalIndex]);
            if (!track) { isRecoveringAudio = false; return; }

            const onMeta = () => {
                audioPlayer.removeEventListener('loadedmetadata', onMeta);
                if (savedTime > 0) {
                    audioPlayer.currentTime = savedTime;
                }
                isRecoveringAudio = false;
                recoveryAttempts = 0;
            };
            audioPlayer.addEventListener('loadedmetadata', onMeta);
            
            let recoveryUrl = getAudioUrl(track);
            audioPlayer.recoverTrack(recoveryUrl);
            return;
        }

        recoveryAttempts = 0;
        isRecoveringAudio = false;

        currentTitle.textContent = "Error loading file... skipping";
        currentTitle.style.color = "#ff5555";
        setPlayUI(false);
        
        if (hasMediaSession) {
            navigator.mediaSession.playbackState = (typeof window.declaredPausedState === 'function')
                ? window.declaredPausedState() : 'paused';
        }
        
        errorSkipTimer = setTimeout(() => {
            errorSkipTimer = null;
            if (window.lastPlaybackDirection === -1) {
                playPrev();
            } else {
                playNext();
            }
        }, 3000);
    });
    const eyeIconSvg = '<svg viewBox="0 0 24 24"><path d="M12 4.5C7.3 4.5 3.2 7.4 1.5 11.5c1.7 4.1 5.8 7 10.5 7s8.8-2.9 10.5-7C20.8 7.4 16.7 4.5 12 4.5zm0 11.5c-2.5 0-4.5-2-4.5-4.5S9.5 7 12 7s4.5 2 4.5 4.5-2 4.5-4.5 4.5zm0-7c-1.4 0-2.5 1.1-2.5 2.5S10.6 14 12 14s2.5-1.1 2.5-2.5S13.4 9 12 9z"/></svg>';

    function updateThumbToggleUI() {
        const isPlaying = queueIndex >= 0 && queueIndex < playQueue.length && Boolean(audioPlayer.src);
        const track = isPlaying ? (currentPlaylistData[playQueue[queueIndex]] || currentPlaylistData[globalActiveOriginalIndex]) : null;
        if (track) {
            const activeColor = (typeof getTrackColor === 'function') ? getTrackColor(track) : ((track.color && track.color !== '#000000') ? track.color : (dominantColorCache.get(track.id) || '#8c73ff'));
            document.documentElement.style.setProperty('--primary-color', activeColor);
        }

        if (thumbsDisabled) {
            albumArt.style.display = 'none';
            if (albumArtContainer) albumArtContainer.classList.add('no-art');
            if (thumbToggleHint) {
                thumbToggleHint.style.display = 'flex';
                thumbToggleHint.innerHTML = `${eyeIconSvg}Show thumbnails`;
            }
        } else {
            if (isPlaying && track && getThumbUrl(track)) {
                if (albumArtContainer) albumArtContainer.classList.remove('no-art');
                if (thumbToggleHint) thumbToggleHint.style.display = 'none';
                albumArt.style.display = 'block';
                albumArt.src = getThumbUrl(track);
            } else {
                albumArt.style.display = 'none';
                if (albumArtContainer) albumArtContainer.classList.add('no-art');
                if (thumbToggleHint) {
                    thumbToggleHint.style.display = 'flex';
                    thumbToggleHint.innerHTML = `${eyeIconSvg}Hide thumbnails`;
                }
            }
        }
    }

    // Initialize thumb toggle hint visibility
    updateThumbToggleUI();

    function performSeekDelta(delta) {
        if (!audioPlayer.src) return;
        let dur = audioPlayer.duration;
        if (!dur || isNaN(dur) || dur === Infinity) dur = parseInt(seekBar.max) || 0;
        let targetTime = Math.max(0, Math.min(dur || 0, audioPlayer.currentTime + delta));
        audioPlayer.currentTime = targetTime;
        updateTimeUI(audioPlayer.currentTime);
        if (window.lyricsActive) updateLyricsUI(audioPlayer.currentTime);
        updateMediaSessionPosition();
    }

    let lastArtClickTime = 0;
    
    albumArtContainer.addEventListener("click", (e) => {
        e.stopPropagation();
        
        const isPlaying = queueIndex >= 0 && queueIndex < playQueue.length && Boolean(audioPlayer.src);
        
        function toggleThumbnailsAndRefresh() {
            thumbsDisabled = !thumbsDisabled;
            updateThumbToggleUI();
            if (!thumbsDisabled && isPlaying) {
                const track = currentPlaylistData[playQueue[queueIndex]];
                if (track && getThumbUrl(track)) {
                    const thumbUrl = getThumbUrl(track);
                    albumArt.style.display = 'block';
                    albumArt.src = thumbUrl;
                    const activeColor = (typeof getTrackColor === 'function') ? getTrackColor(track) : ((track.color && track.color !== '#000000') ? track.color : (dominantColorCache.get(track.id) || '#8c73ff'));
                    document.documentElement.style.setProperty('--primary-color', activeColor);
                    if (hasMediaSession && navigator.mediaSession.metadata) {
                        const sqCached = artworkSquareCache.has(track.id) ? artworkSquareCache.get(track.id) : null;
                        if (sqCached) {
                            navigator.mediaSession.metadata.artwork = [{ src: sqCached, sizes: '512x512', type: 'image/jpeg' }];
                        } else {
                            getSquareArtwork(thumbUrl, track.id, (sqUrl) => {
                                if (hasMediaSession && navigator.mediaSession.metadata) {
                                    navigator.mediaSession.metadata = new MediaMetadata({
                                        title: track.title,
                                        artist: track.channel,
                                        artwork: [{ src: sqUrl, sizes: '512x512', type: 'image/jpeg' }]
                                    });
                                }
                            });
                        }
                    }
                }
            }
            lastStartIndex = -1;
            renderVirtualTracks();
        }

        // If in collapsed miniplayer, clicking the 44px thumbnail circle directly toggles thumbnails
        if (window.innerWidth <= 750 && !nowPlaying.classList.contains("expanded")) {
            toggleThumbnailsAndRefresh();
            return;
        }

        const targetEl = (albumArt && albumArt.style.display !== 'none' && !albumArtContainer.classList.contains('no-art')) 
            ? albumArt 
            : albumArtContainer;
        const rect = targetEl.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;

        const clickX = e.clientX - rect.left;
        const width = rect.width;
        if (isNaN(clickX) || width === 0) return;

        const isLeft = clickX < width * 0.35;
        const isRight = clickX > width * 0.65;
        const isMiddle = !isLeft && !isRight;

        const now = Date.now();
        const isDoubleClick = (now - lastArtClickTime) < 300;
        lastArtClickTime = now;

        if (isDoubleClick && (isLeft || isRight)) {
            if (isLeft) performSeekDelta(-5);
            else if (isRight) performSeekDelta(5);
        } else if (isMiddle || e.target.closest('#thumb-toggle-hint')) {
            toggleThumbnailsAndRefresh();
        }
    });



    let deferredPrompt;

    async function reloadPlaylistDatabases() {
        const currentPl = playlistSelect.value;
        const ts = Date.now();

        try {
            // 1. Fetch fresh JSON for all playlists concurrently with cache-busting timestamp
            await Promise.all(ALL_PLAYLISTS.map(async (pl) => {
                const dbUrl = `${baseUrl}/${pl}/_Playlist_Database.json`;
                try {
                    const res = await fetch(`${dbUrl}?t=${ts}`, { cache: 'no-store' });
                    if (res.ok) {
                        const rawData = await res.json();
                        if (Array.isArray(rawData) && rawData.length > 0) {
                            const freshData = normalizePlaylistData(rawData, pl);
                            allDatabases[pl] = freshData;
                            if (typeof storePlaylistDatabaseInAllCaches === 'function') {
                                storePlaylistDatabaseInAllCaches(pl, rawData);
                            }
                        }
                    }
                } catch (fetchErr) {
                    // Offline fallback: keep existing in-memory database or load from persistent store
                    if (!allDatabases[pl] && typeof getCachedPlaylistDatabase === 'function') {
                        const cached = await getCachedPlaylistDatabase(pl);
                        if (cached) {
                            allDatabases[pl] = normalizePlaylistData(cached, pl);
                        }
                    }
                }
            }));

            // 3. Re-apply the active playlist in place (0ms re-render)
            if (allDatabases[currentPl]) {
                currentPlaylistData = allDatabases[currentPl];
                applyPlaylistData(currentPl, currentPlaylistData, false);
            }

            if (typeof window.rebuildCrossShuffleDeck === 'function') {
                window.rebuildCrossShuffleDeck();
            }
        } catch (err) {
            console.warn("Failed to reload playlist databases:", err);
        }
    }

    async function installPwaApp() {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            deferredPrompt = null;
        } else {
            alert("App is already installed or your browser doesn't support PWA installation!");
        }
    }

    function updatePlaylistSelectOptions() {
        if (!playlistSelect) return;
        const currentVal = playlistSelect.value || (typeof ALL_PLAYLISTS !== 'undefined' && ALL_PLAYLISTS[0]) || "Gym";
        const playlistOptions = (typeof ALL_PLAYLISTS !== 'undefined' ? ALL_PLAYLISTS : ["Gym", "Driving", "Songs"]).map(pl => `<option value="${pl}">${pl}</option>`).join('');
        if (typeof isMobileDevice !== 'undefined' && isMobileDevice) {
            playlistSelect.innerHTML = `${playlistOptions}<option value="__settings__">Settings</option>`;
        } else {
            playlistSelect.innerHTML = `${playlistOptions}<option value="UPDATE_SITE">Update Site</option><option value="INSTALL_APP">Install App</option>`;
        }
        if (typeof ALL_PLAYLISTS !== 'undefined' && ALL_PLAYLISTS.includes(currentVal)) {
            playlistSelect.value = currentVal;
        }
    }

    updatePlaylistSelectOptions();

    let lastValidPlaylist = playlistSelect.value;
    playlistSelect.addEventListener("change", async (e) => {
        if (e.target.value === "UPDATE_SITE") {
            playlistSelect.value = lastValidPlaylist;
            if (typeof updateSiteApp === 'function') {
                await updateSiteApp();
            }
            return;
        }

        if (e.target.value === "HARD_RELOAD" || e.target.value === "RELOAD_DATABASES") {
            playlistSelect.value = lastValidPlaylist;
            await reloadPlaylistDatabases();
            return;
        }

        if (e.target.value === "INSTALL_APP") {
            playlistSelect.value = lastValidPlaylist;
            await installPwaApp();
            return;
        }

        if (e.target.value === "__settings__") {
            playlistSelect.value = lastValidPlaylist;
            openSettingsModal();
            return;
        }
        
        lastValidPlaylist = e.target.value;
        exitEphemeralSearch();
        if (shuffleMode !== 1) {
            crossShuffleHistory = [];
            crossShufflePos = -1;
        }
        if (typeof searchInput !== 'undefined' && searchInput) {
            searchInput.value = '';
            if (typeof searchInput.blur === 'function') searchInput.blur();
        }
        loadPlaylist(e.target.value);
        if (playlistSelect && typeof playlistSelect.blur === 'function') {
            playlistSelect.blur();
        }
    });

    if (playlistSelect) {
        playlistSelect.addEventListener("keydown", (e) => {
            const isMobile = (typeof isMobileDevice !== 'undefined' && isMobileDevice);
            if (isMobile) return;

            if (e.key === 'Escape') {
                playlistSelect.blur();
                return;
            }

            if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                e.preventDefault();
                playlistSelect.blur();
                snapToSearch(e.key);
            }
        });
    }

    function blurPlaylistSelectIfActive(e) {
        if (e && e.button !== 0) return;
        if (playlistSelect && document.activeElement === playlistSelect) {
            playlistSelect.blur();
        }
    }

    if (playlistContainer) {
        playlistContainer.addEventListener("pointerdown", blurPlaylistSelectIfActive);
    }
    if (nowPlaying) {
        nowPlaying.addEventListener("pointerdown", blurPlaylistSelectIfActive);
    }
    if (lyricsContainer) {
        lyricsContainer.addEventListener("pointerdown", blurPlaylistSelectIfActive);
    }
    if (albumArtContainer) {
        albumArtContainer.addEventListener("pointerdown", blurPlaylistSelectIfActive);
    }

    // --- Mobile Horizontal Swipe on Playlist Select Container to Switch Playlists ---
    if (hasTouch && playlistSelectContainer) {
        let plTouchStartX = 0;
        let plTouchStartY = 0;
        let plTouchStartTime = 0;

        playlistSelectContainer.addEventListener("touchstart", (e) => {
            if (e.target.closest('#btn-download-playlist, input, #fast-scroller, #fast-scroll-thumb')) return;
            plTouchStartX = e.changedTouches[0].clientX;
            plTouchStartY = e.changedTouches[0].clientY;
            plTouchStartTime = Date.now();
        }, { passive: true });

        playlistSelectContainer.addEventListener("touchend", (e) => {
            if (window.innerWidth > 800) return;
            if (!ALL_PLAYLISTS || ALL_PLAYLISTS.length <= 1) return;
            if (e.target.closest('#btn-download-playlist, #playlist-container, #track-list, li')) return;

            const deltaX = e.changedTouches[0].clientX - plTouchStartX;
            const deltaY = e.changedTouches[0].clientY - plTouchStartY;
            const elapsed = Date.now() - plTouchStartTime;

            if (Math.abs(deltaX) >= 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2 && elapsed < 600) {
                let curIndex = ALL_PLAYLISTS.indexOf(playlistSelect.value);
                if (curIndex === -1) curIndex = 0;

                const targetIndex = deltaX < 0 
                    ? (curIndex + 1) % ALL_PLAYLISTS.length 
                    : (curIndex - 1 + ALL_PLAYLISTS.length) % ALL_PLAYLISTS.length;

                const nextPl = ALL_PLAYLISTS[targetIndex];
                if (nextPl && nextPl !== playlistSelect.value) {
                    if (typeof searchInput !== 'undefined' && searchInput) {
                        searchInput.value = '';
                        if (typeof searchInput.blur === 'function') searchInput.blur();
                    }
                    playlistSelect.value = nextPl;
                    playlistSelect.dispatchEvent(new Event('change'));
                }
            }
        }, { passive: true });
    }


    const btnDownloadPlaylist = document.getElementById("btn-download-playlist");
    if (btnDownloadPlaylist) {
        btnDownloadPlaylist.addEventListener("click", () => {
            if (typeof downloadActivePlaylist === 'function') downloadActivePlaylist();
        });
    }



    // --- Startup Strategy: Restore Last Played State (0ms Pre-Paint) + Background Fetch ---
    const lastPlayed = (typeof loadLastPlayedState === 'function') ? loadLastPlayedState() : null;
    let initialPl = playlistSelect.value;

    if (lastPlayed && lastPlayed.playlist) {
        if (typeof ALL_PLAYLISTS !== 'undefined' && ALL_PLAYLISTS.includes(lastPlayed.playlist)) {
            playlistSelect.value = lastPlayed.playlist;
            if (typeof lastValidPlaylist !== 'undefined') lastValidPlaylist = lastPlayed.playlist;
            initialPl = lastPlayed.playlist;
        }
        if (typeof lastPlayed.shuffleMode === 'number') {
            shuffleMode = lastPlayed.shuffleMode;
            if (typeof applyShuffleUI === 'function') applyShuffleUI();
        }
        if (typeof lastPlayed.repeatMode === 'number') {
            repeatMode = lastPlayed.repeatMode;
            if (typeof applyRepeatUI === 'function') applyRepeatUI();
        }
        if (typeof restoreLastPlayedTrack === 'function') {
            restoreLastPlayedTrack(lastPlayed);
        }
    } else if (typeof getLastPlayedFromIDB === 'function') {
        getLastPlayedFromIDB().then(idbState => {
            if (idbState && idbState.playlist && !window._stagedLastPlayedTrack && globalActiveOriginalIndex === -1) {
                if (typeof ALL_PLAYLISTS !== 'undefined' && ALL_PLAYLISTS.includes(idbState.playlist)) {
                    playlistSelect.value = idbState.playlist;
                    if (typeof lastValidPlaylist !== 'undefined') lastValidPlaylist = idbState.playlist;
                }
                if (typeof idbState.shuffleMode === 'number') {
                    shuffleMode = idbState.shuffleMode;
                    if (typeof applyShuffleUI === 'function') applyShuffleUI();
                }
                if (typeof idbState.repeatMode === 'number') {
                    repeatMode = idbState.repeatMode;
                    if (typeof applyRepeatUI === 'function') applyRepeatUI();
                }
                if (typeof restoreLastPlayedTrack === 'function') {
                    restoreLastPlayedTrack(idbState);
                }
                if (idbState.playlist && idbState.playlist !== initialPl) {
                    loadPlaylist(idbState.playlist);
                } else if (allDatabases[idbState.playlist]) {
                    applyPlaylistData(idbState.playlist, allDatabases[idbState.playlist], false);
                }
            }
        }).catch(() => {});
    }

    if (typeof seedOfflineDatabases === 'function') {
        seedOfflineDatabases();
    }
    if (typeof refreshCachedAudioUrls === 'function') {
        refreshCachedAudioUrls();
    }
    loadPlaylist(initialPl);

    // Desktop only: Background warm other playlists for instant tab switching & global search
    if (!isMobileDevice) {
        if ('requestIdleCallback' in window) {
            requestIdleCallback(() => warmRemainingPlaylists(initialPl), { timeout: 4000 });
        } else {
            setTimeout(() => warmRemainingPlaylists(initialPl), 1500);
        }
    }

    function warmRemainingPlaylists(activePl) {
        const otherPlaylists = ALL_PLAYLISTS.filter(pl => pl !== activePl);
        for (const pl of otherPlaylists) {
            if (allDatabases[pl]) continue;
            if (typeof getCachedPlaylistDatabase === 'function') {
                getCachedPlaylistDatabase(pl).then(cached => {
                    if (cached && !allDatabases[pl]) {
                        allDatabases[pl] = normalizePlaylistData(cached, pl);
                        if (typeof window.rebuildCrossShuffleDeck === 'function') {
                            window.rebuildCrossShuffleDeck();
                        }
                    }
                }).catch(() => {});
            }
            if (navigator.onLine !== false) {
                fetch(`${baseUrl}/${pl}/_Playlist_Database.json?t=${Date.now()}`, { cache: 'no-store' })
                    .then(r => r.ok ? r.json() : [])
                    .then(rawData => {
                        if (Array.isArray(rawData) && rawData.length > 0) {
                            if (typeof storePlaylistDatabaseInAllCaches === 'function') {
                                storePlaylistDatabaseInAllCaches(pl, rawData);
                            }
                            allDatabases[pl] = normalizePlaylistData(rawData, pl);
                            if (typeof window.rebuildCrossShuffleDeck === 'function') {
                                window.rebuildCrossShuffleDeck();
                            }
                        }
                    })
                    .catch(() => {});
            }
        }
    }

    function syncArtWidth() {
        if (!albumArt || !nowPlaying) return;
        if (window.innerWidth <= 750 && !nowPlaying.classList.contains('expanded')) {
            nowPlaying.style.removeProperty('--art-width');
            return;
        }
        if (albumArt.style.display !== 'none' && !albumArtContainer.classList.contains('no-art') && albumArt.src) {
            const rect = albumArt.getBoundingClientRect();
            let w = rect.width;
            if (albumArt.naturalWidth && albumArt.naturalHeight) {
                const ratio = albumArt.naturalWidth / albumArt.naturalHeight;
                w = Math.min(rect.width, rect.height * ratio);
            }
            w = Math.max(Math.round(w), 280);
            nowPlaying.style.setProperty('--art-width', `${w}px`);
            return;
        }
        nowPlaying.style.removeProperty('--art-width');
    }

    if (albumArt) {
        albumArt.addEventListener('load', () => requestAnimationFrame(syncArtWidth));
        if (window.ResizeObserver) {
            const ro = new ResizeObserver(() => requestAnimationFrame(syncArtWidth));
            ro.observe(albumArt);
        }
    }
    if (window.ResizeObserver && playlistContainer) {
        const playlistRo = new ResizeObserver(() => {
            lastStartIndex = -1;
            lastEndIndex = -1;
            if (typeof renderVirtualTracks === 'function') {
                renderVirtualTracks();
            }
        });
        playlistRo.observe(playlistContainer);
    }
    window.addEventListener('resize', () => {
        requestAnimationFrame(() => {
            syncArtWidth();
            lastStartIndex = -1;
            lastEndIndex = -1;
            if (typeof renderVirtualTracks === 'function') {
                renderVirtualTracks();
            }
        });
    });
    
    // Keyboard Shortcuts (Universal)
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && settingsModal && settingsModal.style.display !== 'none') {
            closeSettingsModal();
            return;
        }
        if (settingsModal && settingsModal.style.display !== 'none') {
            return;
        }

        const isMobile = (typeof isMobileDevice !== 'undefined' && isMobileDevice);

        if (e.target === playlistSelect) {
            if (!isMobile && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                e.preventDefault();
                if (typeof playlistSelect.blur === 'function') playlistSelect.blur();
                snapToSearch(e.key);
            }
            return;
        }

        if (e.target.tagName === 'TEXTAREA' || (e.target.tagName === 'INPUT' && e.target.type !== 'range') || e.target.tagName === 'SELECT' || e.target.isContentEditable) return;
        
        if (e.key === ':' || (e.key === ';' && e.shiftKey)) {
            btnPrev.click();
        } else if (e.key === '"' || (e.key === "'" && e.shiftKey)) {
            btnNext.click();
        } else if (e.key === 'ArrowLeft') {
            audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 5);
        } else if (e.key === 'ArrowRight') {
            let dur = audioPlayer.duration;
            if (!dur || isNaN(dur) || dur === Infinity) dur = parseInt(seekBar.max) || 0;
            audioPlayer.currentTime = Math.min(dur || 0, audioPlayer.currentTime + 5);
        } else if (e.key === ' ') {
            if (e.repeat) {
                e.preventDefault();
                return;
            }
            if (e.target && e.target.tagName === 'BUTTON') return;
            btnPlayPause.click();
            e.preventDefault();
        } else if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.altKey && !e.metaKey) {
            btnRepeat.click();
            e.preventDefault();
        } else if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.altKey && !e.metaKey) {
            btnShuffle.click();
            e.preventDefault();
        } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
            if (!isMobile) {
                e.preventDefault();
                snapToSearch(e.key);
            }
        }
    });

    // --- Settings Modal & Playback Engine Controls ---
    const settingsModal = document.getElementById("settings-modal");
    const settingsBackdrop = document.getElementById("settings-backdrop");
    const btnCloseSettings = document.getElementById("btn-close-settings");
    const mode1Radio = document.getElementById("mode-1-radio");
    const mode2Radio = document.getElementById("mode-2-radio");
    const btTimeoutContainer = document.getElementById("bt-timeout-container");
    const btTimeoutSelect = document.getElementById("bt-timeout-select");
    const btTimeoutCustom = document.getElementById("bt-timeout-custom");
    const btnModalReload = document.getElementById("btn-modal-reload");
    const btnModalInstall = document.getElementById("btn-modal-install");
    const btnModalUpdate = document.getElementById("btn-modal-update");

    function openSettingsModal() {
        const isMobile = (typeof isMobileDevice !== 'undefined' && isMobileDevice);
        const currentMode = isMobile ? (window.playbackMode || 'mode1') : 'mode1';
        if (currentMode === 'mode2') {
            if (mode2Radio) mode2Radio.checked = true;
            if (btTimeoutContainer) btTimeoutContainer.style.display = 'block';
        } else {
            if (mode1Radio) mode1Radio.checked = true;
            if (btTimeoutContainer) btTimeoutContainer.style.display = 'none';
        }

        if (!isMobile) {
            if (mode2Radio) {
                mode2Radio.disabled = true;
                mode2Radio.checked = false;
                const mode2Label = mode2Radio.closest('.settings-radio-label');
                if (mode2Label) {
                    mode2Label.style.opacity = '0.5';
                    mode2Label.style.cursor = 'not-allowed';
                    const subtext = mode2Label.querySelector('.settings-radio-subtext');
                    if (subtext && !subtext.dataset.origText) {
                        subtext.dataset.origText = subtext.textContent;
                        subtext.textContent = 'Optimized for mobile devices only (unavailable on desktop)';
                    }
                }
            }
        }

        const standardTimeouts = ['3'];
        const currentTimeout = (typeof window.btTimeoutMins !== 'undefined' && window.btTimeoutMins !== null)
            ? String(window.btTimeoutMins).trim()
            : '3';

        if (standardTimeouts.includes(currentTimeout)) {
            if (btTimeoutSelect) btTimeoutSelect.value = currentTimeout;
            if (btTimeoutCustom) btTimeoutCustom.style.display = 'none';
        } else {
            if (btTimeoutSelect) btTimeoutSelect.value = 'custom';
            if (btTimeoutCustom) {
                btTimeoutCustom.style.display = 'block';
                btTimeoutCustom.value = currentTimeout;
            }
        }

        const shuffleDownloadedContainer = document.getElementById("shuffle-downloaded-container");
        const toggleShuffleDownloaded = document.getElementById("toggle-shuffle-downloaded");
        if (shuffleDownloadedContainer) {
            shuffleDownloadedContainer.style.display = isMobile ? 'block' : 'none';
        }
        if (toggleShuffleDownloaded) {
            toggleShuffleDownloaded.checked = (typeof isShuffleDownloadedOnly === 'function') && isShuffleDownloadedOnly();
        }

        if (settingsModal) settingsModal.style.display = 'block';
        if (settingsBackdrop) settingsBackdrop.style.display = 'block';
    }

    function closeSettingsModal() {
        if (settingsModal) settingsModal.style.display = 'none';
        if (settingsBackdrop) settingsBackdrop.style.display = 'none';
    }

    window.openSettingsModal = openSettingsModal;
    window.closeSettingsModal = closeSettingsModal;

    if (btnCloseSettings) {
        btnCloseSettings.addEventListener("click", closeSettingsModal);
    }

    if (settingsBackdrop) {
        settingsBackdrop.addEventListener("click", closeSettingsModal);
    }

    const modeRadios = document.querySelectorAll('input[name="playback-mode"]');
    modeRadios.forEach(radio => {
        radio.addEventListener("change", () => {
            const isMobile = (typeof isMobileDevice !== 'undefined' && isMobileDevice);
            const checkedRadio = document.querySelector('input[name="playback-mode"]:checked');
            let newMode = checkedRadio ? checkedRadio.value : 'mode1';
            if (!isMobile) {
                newMode = 'mode1';
                if (mode1Radio) mode1Radio.checked = true;
                if (mode2Radio) mode2Radio.checked = false;
            }
            if (newMode === 'mode2' && typeof initLiveAudioAnchor === 'function') {
                initLiveAudioAnchor();
            }
            if (typeof togglePlaybackMode === 'function') {
                togglePlaybackMode(newMode);
            }
        });
    });

    const isMobileInit = (typeof isMobileDevice !== 'undefined' && isMobileDevice);
    const storedPlaybackMode = isMobileInit
        ? ((typeof window.getStoredSetting === 'function')
            ? window.getStoredSetting('yt_playback_mode', 'mode1')
            : ((typeof localStorage !== 'undefined' && localStorage.getItem('yt_playback_mode')) || 'mode1'))
        : 'mode1';
    if (storedPlaybackMode === 'mode2' && typeof togglePlaybackMode === 'function') {
        togglePlaybackMode('mode2');
    } else if (typeof togglePlaybackMode === 'function') {
        togglePlaybackMode('mode1');
    }

    if (btTimeoutSelect) {
        btTimeoutSelect.addEventListener("change", (e) => {
            if (e.target.value === 'custom') {
                if (btTimeoutCustom) {
                    btTimeoutCustom.style.display = 'block';
                    btTimeoutCustom.focus();
                    const M = parseInt(btTimeoutCustom.value, 10);
                    if (!isNaN(M) && M >= 1 && M <= 1440) {
                        window.btTimeoutMins = String(M);
                        if (typeof window.setStoredSetting === 'function') {
                            window.setStoredSetting('yt_bt_timeout_mins', String(M));
                        } else if (typeof setStoredSetting === 'function') {
                            setStoredSetting('yt_bt_timeout_mins', String(M));
                        }
                        if (window.playbackMode === 'mode2' && typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.paused) {
                            if (typeof armAutoKillWatchdog === 'function') armAutoKillWatchdog();
                        }
                    }
                }
            } else {
                if (btTimeoutCustom) btTimeoutCustom.style.display = 'none';
                window.btTimeoutMins = e.target.value;
                if (typeof window.setStoredSetting === 'function') {
                    window.setStoredSetting('yt_bt_timeout_mins', e.target.value);
                } else if (typeof setStoredSetting === 'function') {
                    setStoredSetting('yt_bt_timeout_mins', e.target.value);
                }
                if (window.playbackMode === 'mode2' && typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.paused) {
                    if (typeof armAutoKillWatchdog === 'function') armAutoKillWatchdog();
                }
            }
        });
    }

    if (btTimeoutCustom) {
        const handleCustomTimeoutInput = (e) => {
            const M = parseInt(e.target.value, 10);
            if (!isNaN(M) && M >= 1 && M <= 1440) {
                window.btTimeoutMins = String(M);
                if (typeof window.setStoredSetting === 'function') {
                    window.setStoredSetting('yt_bt_timeout_mins', String(M));
                } else if (typeof setStoredSetting === 'function') {
                    setStoredSetting('yt_bt_timeout_mins', String(M));
                }
                if (window.playbackMode === 'mode2' && typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.paused) {
                    if (typeof armAutoKillWatchdog === 'function') armAutoKillWatchdog();
                }
            }
        };
        btTimeoutCustom.addEventListener("input", handleCustomTimeoutInput);
        btTimeoutCustom.addEventListener("change", handleCustomTimeoutInput);
    }

    const toggleShuffleDownloaded = document.getElementById("toggle-shuffle-downloaded");
    if (toggleShuffleDownloaded) {
        toggleShuffleDownloaded.addEventListener("change", (e) => {
            const isChecked = e.target.checked;
            if (typeof window.setStoredSetting === 'function') {
                window.setStoredSetting('yt_shuffle_downloaded_only', isChecked ? 'true' : 'false');
            } else if (typeof setStoredSetting === 'function') {
                setStoredSetting('yt_shuffle_downloaded_only', isChecked ? 'true' : 'false');
            }
            if (typeof refreshCachedAudioUrls === 'function') {
                refreshCachedAudioUrls().then(() => {
                    if (shuffleMode === 1 && typeof window.rebuildCrossShuffleDeck === 'function') {
                        crossShuffleHistory = [];
                        crossShufflePos = -1;
                        window.rebuildCrossShuffleDeck();
                    } else if (shuffleMode === 2 && typeof generateQueue === 'function') {
                        generateQueue(false);
                    }
                });
            }
        });
    }

    if (btnModalReload) {
        btnModalReload.addEventListener("click", () => {
            reloadPlaylistDatabases();
            closeSettingsModal();
        });
    }

    if (btnModalInstall) {
        btnModalInstall.addEventListener("click", () => {
            installPwaApp();
            closeSettingsModal();
        });
    }

    let isUpdatingSite = false;

    async function executeSitePurgeAndReload(swRegistration = null) {
        const textUpdate = document.getElementById("text-modal-update");
        if (textUpdate) textUpdate.textContent = "Reloading...";

        // 1. Flush playback and session state to IDB & localStorage
        if (typeof flushLastPlayedState === 'function') {
            flushLastPlayedState();
        } else if (typeof saveLastPlayedState === 'function') {
            saveLastPlayedState();
        }

        // 2. Activate waiting/installing service worker if present
        if (swRegistration) {
            if (swRegistration.waiting) {
                try { swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' }); } catch (e) {}
            } else if (swRegistration.installing) {
                const installingWorker = swRegistration.installing;
                await new Promise((resolve) => {
                    const onState = () => {
                        if (installingWorker.state === 'installed' || installingWorker.state === 'activated') {
                            installingWorker.removeEventListener('statechange', onState);
                            resolve();
                        }
                    };
                    installingWorker.addEventListener('statechange', onState);
                    setTimeout(resolve, 3500);
                });
                try { installingWorker.postMessage({ type: 'SKIP_WAITING' }); } catch (e) {}
            }
        }

        // 3. Purge stale application caches while strictly preserving active cache, media, artwork, databases, and shell cache
        if (window.caches) {
            try {
                const keys = await caches.keys();
                for (const key of keys) {
                    // Only purge older cache versions; preserve active build caches and permanent shell cache
                    if (key.startsWith('yt-player-cache') && key !== 'yt-player-cache-v153' && !key.includes('-main-') && !key.includes('-dev-') && key !== 'yt-player-shell-v1') {
                        await caches.delete(key);
                    }
                }
            } catch (cacheErr) {
                console.warn("Static cache purge error:", cacheErr);
            }
        }

        // 4. Message active controller to purge its in-memory core asset cache
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            try {
                navigator.serviceWorker.controller.postMessage({ type: 'PURGE_STATIC_CACHE' });
            } catch (e) {}
        }

        // 5. Cache-busted reload with controllerchange listener and safety fallback
        let reloaded = false;
        const doReload = () => {
            if (reloaded) return;
            reloaded = true;
            try {
                const updateUrl = new URL(window.location.href);
                updateUrl.searchParams.set('v', Date.now());
                window.location.replace(updateUrl.toString());
            } catch (e) {
                window.location.href = window.location.origin + window.location.pathname;
            }
        };

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('controllerchange', doReload, { once: true });
        }

        setTimeout(doReload, 2000);
    }

    async function updateSiteApp() {
        if (isUpdatingSite) return;

        const btnUpdate = document.getElementById("btn-modal-update");
        const textUpdate = document.getElementById("text-modal-update");

        const setButtonState = (state, message = "") => {
            if (!btnUpdate) return;
            btnUpdate.classList.remove("updating", "success", "error");

            if (state === 'idle') {
                btnUpdate.disabled = false;
                btnUpdate.style.opacity = '1';
                btnUpdate.style.cursor = 'pointer';
                if (textUpdate) textUpdate.textContent = message || "Update Site";
            } else if (state === 'updating') {
                btnUpdate.disabled = true;
                btnUpdate.style.opacity = '0.8';
                btnUpdate.style.cursor = 'wait';
                btnUpdate.classList.add("updating");
                if (textUpdate) textUpdate.textContent = message;
            } else if (state === 'success') {
                btnUpdate.disabled = false;
                btnUpdate.style.opacity = '1';
                btnUpdate.classList.add("success");
                if (textUpdate) textUpdate.textContent = message;
            } else if (state === 'error') {
                btnUpdate.disabled = false;
                btnUpdate.style.opacity = '1';
                btnUpdate.classList.add("error");
                if (textUpdate) textUpdate.textContent = message;
            }
        };

        // Guard against offline state
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            setButtonState('error', "Offline - cannot update");
            setTimeout(() => setButtonState('idle', "Update Site"), 3000);
            return;
        }

        isUpdatingSite = true;
        setButtonState('updating', "Updating site...");

        // Unify playlist reload: trigger background refresh of playlist databases concurrently
        if (typeof reloadPlaylistDatabases === 'function') {
            reloadPlaylistDatabases().catch(e => console.warn("Playlist refresh error during update:", e));
        }

        // Safety timeout to prevent infinite hang
        const safetyTimer = setTimeout(() => {
            if (isUpdatingSite) {
                console.warn("Update timed out; forcing refresh");
                executeSitePurgeAndReload();
            }
        }, 10000);

        try {
            // Save state immediately
            if (typeof flushLastPlayedState === 'function') {
                flushLastPlayedState();
            } else if (typeof saveLastPlayedState === 'function') {
                saveLastPlayedState();
            }

            // Always refresh the service worker from the network, regardless of the current version
            let swRegistration = null;
            if ('serviceWorker' in navigator) {
                try {
                    swRegistration = await navigator.serviceWorker.getRegistration();
                    if (swRegistration) {
                        await swRegistration.update();
                        if (!swRegistration.waiting && !swRegistration.installing) {
                            await new Promise((resolve) => {
                                const onUpdateFound = () => {
                                    swRegistration.removeEventListener('updatefound', onUpdateFound);
                                    resolve();
                                };
                                swRegistration.addEventListener('updatefound', onUpdateFound, { once: true });
                                setTimeout(resolve, 1500);
                            });
                        }
                    }
                } catch (swErr) {
                    console.warn("ServiceWorker update refresh error:", swErr);
                }
            }

            clearTimeout(safetyTimer);

            setButtonState('updating', "Applying update...");
            await executeSitePurgeAndReload(swRegistration);
        } catch (err) {
            clearTimeout(safetyTimer);
            isUpdatingSite = false;
            console.error("Site update error:", err);
            setButtonState('error', "Update failed - retry");
            setTimeout(() => setButtonState('idle', "Update Site"), 3000);
        }
    }

    window.updateSiteApp = updateSiteApp;

    if (btnModalUpdate) {
        btnModalUpdate.addEventListener("click", () => {
            updateSiteApp();
        });
    }

    // --- Universal 20px Edge-Triggered Fast Scroller Engine ---
    const fastScroller = document.getElementById("fast-scroller");
    const fastThumb = document.getElementById("fast-scroll-thumb");
    const fastBubble = document.getElementById("fast-scroll-bubble");
    const fastBadge = document.getElementById("fast-scroll-badge");
    const fastTitle = document.getElementById("fast-scroll-title");

    let isFastScrolling = false;
    let lastHapticTrack = -1;

    function updateFastScrollPosition(clientY) {
        if (!playlistContainer || !filteredIndices || filteredIndices.length === 0) return;
        const rect = playlistContainer.getBoundingClientRect();
        const relativeY = Math.max(0, Math.min(clientY - rect.top, rect.height));
        const ratio = rect.height > 0 ? relativeY / rect.height : 0;

        // 1. Instant Virtual Scroll Dispatch
        const maxScroll = playlistContainer.scrollHeight - playlistContainer.clientHeight;
        playlistContainer.scrollTop = ratio * maxScroll;

        // 2. Track & Title Resolution (Topmost track currently in view)
        const topTrackIndex = Math.min(filteredIndices.length - 1, Math.max(0, Math.floor(playlistContainer.scrollTop / ITEM_HEIGHT)));
        const targetItem = filteredIndices[topTrackIndex];
        const track = currentPlaylistData ? currentPlaylistData[targetItem.index] : null;

        if (track) {
            const isFilterActive = searchInput && searchInput.value.trim().length > 0;
            fastBadge.textContent = isFilterActive 
                ? `MATCH #${topTrackIndex + 1} OF ${filteredIndices.length}`
                : `#${topTrackIndex + 1} / ${filteredIndices.length}`;
            fastTitle.textContent = track.title || "Unknown Title";

            // Micro-haptic pulse on track step (mobile only)
            if (topTrackIndex !== lastHapticTrack) {
                lastHapticTrack = topTrackIndex;
                if (typeof navigator.vibrate === 'function') navigator.vibrate(3);
            }
        }

        // 3. Thumb & Bubble Alignment (with safety padding so bubble never clips viewport edges)
        const parentRect = playlistContainer.offsetParent ? playlistContainer.offsetParent.getBoundingClientRect() : rect;
        const topOffset = rect.top - parentRect.top;
        const thumbHeight = 36;
        const thumbTop = topOffset + Math.max(0, Math.min(relativeY - (thumbHeight / 2), rect.height - thumbHeight));
        fastThumb.style.top = `${thumbTop}px`;

        const bubbleClampY = topOffset + Math.max(30, Math.min(relativeY, rect.height - 30));
        fastBubble.style.top = `${bubbleClampY}px`;
    }

    if (fastScroller) {
        fastScroller.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            const rect = playlistContainer.getBoundingClientRect();
            // Strict 20px edge hit-test gate
            if (e.clientX >= rect.right - 20 && e.clientX <= rect.right + 2) {
                isFastScrolling = true;
                fastScroller.classList.add("active");
                fastBubble.classList.add("active");
                fastScroller.setPointerCapture(e.pointerId);
                updateFastScrollPosition(e.clientY);
                e.preventDefault();
            }
        });

        fastScroller.addEventListener("pointermove", (e) => {
            if (isFastScrolling) {
                updateFastScrollPosition(e.clientY);
                e.preventDefault();
            }
        });

        const stopFastScroll = (e) => {
            if (isFastScrolling) {
                isFastScrolling = false;
                fastScroller.classList.remove("active");
                fastBubble.classList.remove("active");
                try { fastScroller.releasePointerCapture(e.pointerId); } catch (err) {}
                lastHapticTrack = -1;
            }
        };

        fastScroller.addEventListener("pointerup", stopFastScroll);
        fastScroller.addEventListener("pointercancel", stopFastScroll);
    }

    // Simple Playlist Scroll Arrow Engine
    const playlistScrollArrow = document.getElementById("playlist-scroll-arrow");
    const playlistArrowUp = document.getElementById("playlist-arrow-up");
    const playlistArrowDown = document.getElementById("playlist-arrow-down");

    function updatePlaylistScrollArrow() {
        if (!playlistScrollArrow || !playlistContainer) return;
        const isScrolled = playlistContainer.scrollTop > 2;
        if (playlistArrowUp && playlistArrowDown) {
            playlistArrowUp.style.display = isScrolled ? "block" : "none";
            playlistArrowDown.style.display = isScrolled ? "none" : "block";
        }
        playlistScrollArrow.setAttribute("aria-label", isScrolled ? "Scroll to top" : "Scroll to bottom");
    }

    if (playlistScrollArrow && playlistContainer) {
        playlistContainer.addEventListener("scroll", updatePlaylistScrollArrow, { passive: true });
        window.addEventListener("resize", updatePlaylistScrollArrow, { passive: true });
        updatePlaylistScrollArrow();

        playlistScrollArrow.addEventListener("click", (e) => {
            e.stopPropagation();
            if (playlistContainer.scrollTop > 2) {
                playlistContainer.scrollTo({ top: 0, behavior: "instant" });
                playlistContainer.scrollTop = 0;
            } else {
                playlistContainer.scrollTo({ top: playlistContainer.scrollHeight, behavior: "instant" });
                playlistContainer.scrollTop = playlistContainer.scrollHeight;
            }
        });
    }
    window.updatePlaylistScrollArrow = updatePlaylistScrollArrow;

    // PWA Install Prompt Listener
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
    });
});
