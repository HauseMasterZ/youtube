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
            audioPlayer.play().catch(e => {
                // Only revive if Android actually suspended the decoder/prevented autoplay
                if (e.name !== 'NotAllowedError') return;
                
                const savedTime = audioPlayer.currentTime;
                const track = currentPlaylistData[playQueue[queueIndex]];
                if (!track) return;
                
                audioPlayer.muted = true;
                
                const onMeta = () => {
                    audioPlayer.currentTime = savedTime;
                    audioPlayer.play().catch(() => {});
                    setTimeout(() => audioPlayer.muted = false, 150);
                    audioPlayer.removeEventListener("loadedmetadata", onMeta);
                };
                audioPlayer.addEventListener("loadedmetadata", onMeta);
                audioPlayer.src = getAudioUrl(track);
            });
            if (hasMediaSession) navigator.mediaSession.playbackState = 'playing';
        });
        navigator.mediaSession.setActionHandler('pause', () => {
            audioPlayer.pause();
            if (hasMediaSession) navigator.mediaSession.playbackState = 'paused';
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



