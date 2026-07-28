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
            if (!audioPlayer.src) {
                if (playQueue.length > 0 && queueIndex !== -1) {
                    executePlayback(false);
                } else if (playQueue.length > 0) {
                    queueIndex = 0;
                    executePlayback(false);
                }
                return;
            }
            if (hasMediaSession) navigator.mediaSession.playbackState = 'playing';
            audioPlayer.play().catch(e => {
                const savedTime = audioPlayer.currentTime;
                const track = currentPlaylistData[playQueue[queueIndex]];
                if (!track) return;
                
                audioPlayer.removeAttribute('src');
                audioPlayer.load();
                audioPlayer.src = getAudioUrl(track);
                audioPlayer.currentTime = savedTime;
                audioPlayer.play().then(() => {
                    if (hasMediaSession) navigator.mediaSession.playbackState = 'playing';
                }).catch(() => {
                    if (hasMediaSession) navigator.mediaSession.playbackState = 'paused';
                });
            });
        });
        navigator.mediaSession.setActionHandler('pause', () => {
            if (hasMediaSession) navigator.mediaSession.playbackState = 'paused';
            audioPlayer.pause();
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => playPrev());
        navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
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



