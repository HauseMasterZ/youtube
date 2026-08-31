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
        const sequenceId = currentPlaybackSequence; // Track the sequence ID to prevent race conditions

        lyricsContent.innerHTML = '<p class="lyrics-placeholder" style="font-size: 32px; letter-spacing: 4px; font-weight: 800; color: var(--primary-color); opacity: 0.8; margin: auto;">...</p>';
        lyricsContent.style.display = 'flex';
        currentLyrics = [];
        currentLyricsIsUnsynced = false;
        fetchingLyrics = true;
        isAutoScrollActive = true;
        
        try {
            const parts = track.file_path.split('/');
            const folder = parts[0];
            const lyricsUrl = `${baseUrl}/${encodeURIComponent(folder)}/lyrics/${encodeURIComponent(track.id)}.lrc`;
            
            let res = await fetch(lyricsUrl, { priority: 'low' });
            if (!res.ok) throw new Error();
            let text = await res.text();
            
            // If the cached response was an old dummy placeholder, re-verify with a fresh network request
            if (text.trim() === '[00:00.00] \u266a' || text.trim().length <= 25) {
                try {
                    const freshRes = await fetch(`${lyricsUrl}?t=${Date.now()}`, { cache: 'no-cache' });
                    if (freshRes.ok) {
                        const freshText = await freshRes.text();
                        if (freshText && freshText.trim().length > 25) {
                            text = freshText;
                        }
                    }
                } catch (err) {}
            }
            
            // Abort if the user skipped to another track while the fetch was pending
            if (currentPlaybackSequence !== sequenceId) return;
            
            const parsed = parseLRC(text);
            currentLyrics = parsed.lyrics;
            currentLyricsIsUnsynced = parsed.isUnsynced;
            
            if (currentLyrics.length === 0) throw new Error();
            
            if (!currentLyricsIsUnsynced && currentLyrics[0].time > 0) {
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
            requestAnimationFrame(() => {
                buildLyricsCache();
                if (window.lyricsActive && !currentLyricsIsUnsynced) {
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
    let isAutoScrollActive = true;
    let isProgrammaticScroll = false;
    let programmaticScrollTimer = null;
    let scrollStopTimer = null;

    function buildLyricsCache() {
        lyricsLayoutCache = [];
        const lyricsInner = document.getElementById('lyrics-inner');
        if (!lyricsInner) return;
        
        for (let i = 1; i < lyricsInner.children.length; i++) {
            const p = lyricsInner.children[i];
            lyricsLayoutCache.push({
                top: p.offsetTop,
                height: p.offsetHeight,
                text: p.textContent
            });
        }
    }

    function checkAutoScrollTriggerOnStop() {
        if (!lyricsContent || activeLyricIndex < 0 || activeLyricIndex >= lyricsLayoutCache.length) return;
        const cache = lyricsLayoutCache[activeLyricIndex];
        const visibleTop = lyricsContent.scrollTop;
        const visibleBottom = lyricsContent.scrollTop + lyricsContent.clientHeight;
        const lineTop = cache.top;
        const lineBottom = cache.top + cache.height;

        // Active line is visible within viewport (with small tolerance)
        if (lineBottom >= visibleTop && lineTop <= visibleBottom) {
            isAutoScrollActive = true;
        } else {
            isAutoScrollActive = false;
        }
    }

    if (typeof lyricsContent !== 'undefined' && lyricsContent) {
        lyricsContent.addEventListener('scroll', () => {
            if (isProgrammaticScroll) return;
            clearTimeout(scrollStopTimer);
            scrollStopTimer = setTimeout(() => {
                checkAutoScrollTriggerOnStop();
            }, 150);
        }, { passive: true });
    }

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (window.lyricsActive) {
                buildLyricsCache();
                if (activeLyricIndex >= 0 && activeLyricIndex < lyricsLayoutCache.length) {
                    const cache = lyricsLayoutCache[activeLyricIndex];
                    const highlightLayer = document.getElementById('lyrics-highlight-layer');
                    if (highlightLayer) {
                        highlightLayer.style.height = `${cache.height}px`;
                        highlightLayer.style.top = `${cache.top}px`;
                    }
                }
            }
        }, 200);
    });

    function updateLyricsUI(currentTime) {
        if (!window.lyricsActive || currentLyrics.length === 0 || currentLyricsIsUnsynced) return;
        
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
                    if (highlightLayer.textContent !== cache.text) {
                        highlightLayer.textContent = cache.text;
                    }
                    const topPx = `${cache.top}px`;
                    if (highlightLayer.style.top !== topPx) {
                        highlightLayer.style.top = topPx;
                    }
                    const heightPx = `${cache.height}px`;
                    if (highlightLayer.style.height !== heightPx) {
                        highlightLayer.style.height = heightPx;
                    }
                    if (highlightLayer.style.display !== 'block') {
                        highlightLayer.style.display = 'block';
                    }
                }

                // Screen-chunk auto-scroll: only shift page when active line exceeds current visible bounds
                if (isAutoScrollActive && lyricsContent) {
                    const visibleTop = lyricsContent.scrollTop;
                    const visibleBottom = lyricsContent.scrollTop + lyricsContent.clientHeight;
                    const lineTop = cache.top;
                    const lineBottom = cache.top + cache.height;

                    if (lineBottom > visibleBottom || lineTop < visibleTop) {
                        isProgrammaticScroll = true;
                        clearTimeout(programmaticScrollTimer);
                        lyricsContent.scrollTop = Math.max(0, lineTop - 20);
                        programmaticScrollTimer = setTimeout(() => {
                            isProgrammaticScroll = false;
                        }, 50);
                    }
                }
            }
        }
    }

    function pushHistoryState(viewName) {
        history.pushState({ view: viewName }, "");
    }

    function closeLyricsUI() {
        window.lyricsActive = false;
        isAutoScrollActive = true;
        lyricsToggleHint.style.color = 'var(--text-secondary)';
        lyricsContainer.style.display = 'none';
    }
