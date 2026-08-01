    function updateMediaSessionPosition() {
        if (hasMediaSession && !isNaN(audioPlayer.duration) && audioPlayer.duration > 0) {
            navigator.mediaSession.setPositionState({
                duration: audioPlayer.duration,
                playbackRate: audioPlayer.playbackRate || 1,
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
                console.warn("MediaSession play error, attempting sync revival:", e);
                // Synchronous revival to prevent losing the MediaSession user gesture token
                const track = currentPlaylistData[playQueue[queueIndex]];
                if (track) {
                    const savedTime = audioPlayer.currentTime;
                    audioPlayer.src = getAudioUrl(track);
                    
                    audioPlayer.play().catch(err => {
                        console.error("Revival failed:", err);
                        if (hasMediaSession) navigator.mediaSession.playbackState = 'paused';
                    });
                    
                    if (savedTime > 0) {
                        const onMeta = () => {
                            audioPlayer.removeEventListener('loadedmetadata', onMeta);
                            audioPlayer.currentTime = savedTime;
                        };
                        audioPlayer.addEventListener('loadedmetadata', onMeta);
                    }
                }
            });
        });
        navigator.mediaSession.setActionHandler('pause', () => {
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



