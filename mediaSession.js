    function updateMediaSessionPosition() {
        if (hasMediaSession && !isNaN(audioPlayer.duration) && audioPlayer.duration > 0) {
            navigator.mediaSession.setPositionState({
                duration: audioPlayer.duration,
                playbackRate: audioPlayer.playbackRate,
                position: audioPlayer.currentTime
            });
        }
    }
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
