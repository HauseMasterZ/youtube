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
                    executePlayback(false); // Play the uiOnly track
                } else if (playQueue.length > 0) {
                    queueIndex = 0;
                    executePlayback(false);
                }
                return;
            }
            audioPlayer.muted = true;
            audioPlayer.play().catch(e => {
                // Audio Element Revival: If Android suspended the decoder during a pause, reload the stream.
                const savedTime = audioPlayer.currentTime;
                
                audioPlayer.removeAttribute("src");
                audioPlayer.load();
                
                const onMeta = () => {
                    audioPlayer.currentTime = savedTime;
                    audioPlayer.play().catch(e => {});
                    audioPlayer.removeEventListener("loadedmetadata", onMeta);
                };
                audioPlayer.addEventListener("loadedmetadata", onMeta);
                
                audioPlayer.src = getAudioUrl(currentPlaylistData[playQueue[queueIndex]]);
            });
            setTimeout(() => { audioPlayer.muted = false; }, 150);
            if (hasMediaSession) navigator.mediaSession.playbackState = 'playing';
        });
        navigator.mediaSession.setActionHandler('pause', () => {
            audioPlayer.muted = true;
            setTimeout(() => { audioPlayer.pause(); }, 50);
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



