    function updateMediaSessionPosition(forcedPosition = null, forcedDuration = null, forcedRate = null) {
        if (hasMediaSession && 'setPositionState' in navigator.mediaSession) {
            try {
                // While switching tracks and before any user seek, clear state to suppress speculative timer
                if (audioPlayer && audioPlayer.switching && (audioPlayer._pendingSeek === null && forcedPosition === null)) {
                    navigator.mediaSession.setPositionState(null);
                    return;
                }

                const dur = forcedDuration !== null ? forcedDuration : (audioPlayer.duration || parseFloat(seekBar.max) || 0);
                const pos = forcedPosition !== null ? forcedPosition : (audioPlayer.currentTime || 0);
                const rate = forcedRate !== null ? forcedRate : (audioPlayer.playbackRate || 1.0);
                const validRate = (typeof rate === 'number' && rate > 0) ? rate : 1.0;

                if (!isNaN(dur) && dur > 0 && !isNaN(pos) && pos >= 0) {
                    const validPos = Math.max(0, Math.min(pos, dur));
                    navigator.mediaSession.setPositionState({
                        duration: dur,
                        playbackRate: validRate,
                        position: validPos
                    });
                }
            } catch (e) {
                // Ignore transient errors
            }
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
            window.wasPausedByUser = false;
            audioPlayer.play().catch(e => console.warn("MediaSession play error:", e));
        });
        navigator.mediaSession.setActionHandler('pause', () => {
            window.wasPausedByUser = true;
            audioPlayer.instantPause();
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => playPrev());
        navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
        navigator.mediaSession.setActionHandler('seekto', (details) => {
            const seekTarget = details.seekTime;
            if (details.fastSeek && 'fastSeek' in audioPlayer) {
                audioPlayer.fastSeek(seekTarget);
            } else {
                audioPlayer.currentTime = seekTarget;
            }
            updateTimeUI(seekTarget);
            if (typeof lyricsActive !== 'undefined' && lyricsActive && typeof updateLyricsUI === 'function') updateLyricsUI(seekTarget);
            
            // 🎯 Explicitly pass seek target and total duration to prevent 0:00 dip
            const totalDur = audioPlayer.duration || parseFloat(seekBar.max) || 0;
            updateMediaSessionPosition(seekTarget, totalDur);
        });
        navigator.mediaSession.setActionHandler('seekbackward', (details) => {
            const skipTime = details.seekOffset || 10;
            const newTime = Math.max(0, (audioPlayer.currentTime || 0) - skipTime);
            audioPlayer.currentTime = newTime;
            updateTimeUI(newTime);
            if (typeof lyricsActive !== 'undefined' && lyricsActive && typeof updateLyricsUI === 'function') updateLyricsUI(newTime);
            const dur = audioPlayer.duration || parseFloat(seekBar.max) || 0;
            updateMediaSessionPosition(newTime, dur);
        });
        navigator.mediaSession.setActionHandler('seekforward', (details) => {
            const skipTime = details.seekOffset || 10;
            const dur = audioPlayer.duration || parseFloat(seekBar.max) || 0;
            const newTime = Math.min(dur, (audioPlayer.currentTime || 0) + skipTime);
            audioPlayer.currentTime = newTime;
            updateTimeUI(newTime);
            if (typeof lyricsActive !== 'undefined' && lyricsActive && typeof updateLyricsUI === 'function') updateLyricsUI(newTime);
            updateMediaSessionPosition(newTime, dur);
        });
        navigator.mediaSession.setActionHandler('stop', () => {
            audioPlayer.instantPause();
        });
    }



