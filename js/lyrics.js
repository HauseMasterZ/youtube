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

    let activeLyricIndex = -1;
    let lyricElements = [];

    async function loadLyrics(track) {
        const sequenceId = currentPlaybackSequence; // Track the sequence ID to prevent race conditions

        lyricsContent.innerHTML = '<p class="lyrics-placeholder" style="font-size: 32px; letter-spacing: 4px; font-weight: 800; color: var(--primary-color); opacity: 0.8; margin: auto;">...</p>';
        lyricsContent.style.display = 'flex';
        currentLyrics = [];
        currentLyricsIsUnsynced = false;
        fetchingLyrics = true;
        activeLyricIndex = -1;
        lyricElements = [];
        
        try {
            const parts = track.file_path.split('/');
            const folder = parts[0];
            const lyricsUrl = `${baseUrl}/${encodeURIComponent(folder)}/lyrics/${encodeURIComponent(track.id)}.lrc`;
            
            let res = await fetch(lyricsUrl, { priority: 'low' });
            if (!res.ok) throw new Error();
            let text = await res.text();
            
            // If the cached response was an old dummy placeholder, re-verify with a fresh network request
            if (text.trim() === '[00:00.00] ♪' || text.trim().length <= 25) {
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
            lyricsContent.style.display = 'block';
            
            const lyricsInner = document.createElement('div');
            lyricsInner.id = 'lyrics-inner';
            lyricsInner.className = 'lyrics-inner';
            
            currentLyrics.forEach((line) => {
                const p = document.createElement('p');
                p.textContent = currentLyricsIsUnsynced ? line.text : `[${formatTime(line.time)}] ${line.text}`;
                p.className = 'lyric-line';
                if (!currentLyricsIsUnsynced) {
                    p.addEventListener('click', () => {
                        audioPlayer.currentTime = line.time;
                        updateLyricsUI(line.time);
                    });
                }
                lyricsInner.appendChild(p);
                lyricElements.push(p);
            });
            
            lyricsContent.appendChild(lyricsInner);
            
            if (window.lyricsActive && !currentLyricsIsUnsynced) {
                activeLyricIndex = -1;
                updateLyricsUI(audioPlayer.currentTime);
            }
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

    function updateLyricsUI(currentTime) {
        if (!window.lyricsActive || currentLyrics.length === 0 || currentLyricsIsUnsynced) return;
        
        let newIndex = -1;
        for (let i = currentLyrics.length - 1; i >= 0; i--) {
            if (currentTime >= currentLyrics[i].time) {
                newIndex = i;
                break;
            }
        }
        
        if (newIndex !== activeLyricIndex) {
            if (activeLyricIndex >= 0 && lyricElements[activeLyricIndex]) {
                lyricElements[activeLyricIndex].classList.remove('active');
            }
            activeLyricIndex = newIndex;
            if (activeLyricIndex >= 0 && lyricElements[activeLyricIndex]) {
                lyricElements[activeLyricIndex].classList.add('active');
                lyricElements[activeLyricIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }

    function pushHistoryState(viewName) {
        history.pushState({ view: viewName }, "");
    }

    function closeLyricsUI() {
        window.lyricsActive = false;
        lyricsToggleHint.style.color = 'var(--text-secondary)';
        lyricsContainer.style.display = 'none';
        if (activeLyricIndex >= 0 && lyricElements[activeLyricIndex]) {
            lyricElements[activeLyricIndex].classList.remove('active');
        }
        activeLyricIndex = -1;
    }
