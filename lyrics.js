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
