# CLAUDE.md - Architecture & Prompt Cache

This document serves as a memory state for AI models assisting with this project. It contains deep architectural context, explicit user preferences, and undocumented edge-cases.

## Project Structure
This project is split across two main workspaces:
1. **Frontend UI**: `~\youtube` (HTML/JS/CSS Web App)
2. **Backend Scripts**: `~\youtube_playlist_tracker_downloader` (Python GitHub Actions CI/CD)

---

## 1. Explicit User Choices & Preferences

*   **Aesthetics vs. Performance**: The user prioritizes a premium, sleek UI. While performance is highly valued (especially for mobile), the user explicitly chose to **KEEP** the dynamic Canvas-based album-art color extraction (which sets `--primary-color`) because the aesthetic is non-negotiable.
*   **Music Preferences**: The user primarily listens to English, Telugu, and Hindi songs. 
*   **Lyrics & Transliteration**: The user expects all Indian regional lyrics to be perfectly romanized to English. The backend relies on a custom pipeline to achieve this.
*   **Mobile Optimizations**: 
    *   **Upfront Audio Blob Fetching**: To prevent iOS/Android background networking suspensions (where the OS cuts off network streams on screen-lock), audio tracks are strictly `fetch`ed fully into a Blob URL on mobile devices before playback begins, ensuring gapless offline playback while locked.
    *   **Gapless Track Swapping Bypass**: During a lock-screen track change, assigning a new `Blob URL` to the active audio element kills Chromium's MediaSession. This is bypassed using the "Silent Audio Hack" (playing a silent looping WAV file exactly during the swap) to maintain OS focus.
    *   **Race Condition Nullifier**: Since mobile `fetch` commands are completely asynchronous, rapid track-skipping on a slow connection causes out-of-order execution. A strict `currentPlaybackSequence` integer lock aborts all stale network promises instantly, preventing the player from wildly bouncing between tracks.
    *   **Predictive Background Preloading**: The silent `triggerPreloads` engine runs the exact millisecond a track starts. It proactively fetches the `nextTrack` and `prevTrack`. If Shuffle Mode is active, it actually pre-rolls the `crossShuffleHistory` RNG math ahead of time to fetch the correct random track in the background.
    *   **Hard Paused-State Limitation**: We DO NOT use the silent audio hack to keep the notification alive when playback is paused. If a song is paused for >30s in the background, Android Chrome will aggressively kill the lock-screen notification. Faking a persistent paused state with silent audio causes Chromium to hijack the `MediaSession` focus, trigger fake playing equalizer animations, and break the Play/Resume lock-screen button. This is a fundamental limitation of PWAs vs native Android Foreground Services.
    *   No expensive GPU CSS filters (e.g., `box-shadow`, `filter: brightness`) on interactive elements to prevent mobile thermal throttling.
    *   No layout-thrashing animations (`transition: all` is avoided where possible).
    *   Global keyboard shortcuts are **explicitly disabled** on mobile devices to prevent software keyboard interference.
*   **Button Outlines**: The default browser focus ring (`outline: none !important`) and webkit tap highlights (`-webkit-tap-highlight-color: transparent`) are globally disabled for all buttons on the frontend.

---

## 2. Frontend Architecture (`youtube`)

*   **Virtual Scroller (`app.js`)**: Handles massive playlists using DOM recycling. Track rows are fixed at `48px` (`ITEM_HEIGHT`). Do not break this logic when modifying CSS padding/margins.
*   **Event Listener Optimization**: Environment checks (`hasMediaSession`, `hasTouch`, `isMobileDevice`) are evaluated exactly once at the top of the file. Event listeners are conditionally attached (e.g., `touchstart` is only attached if `hasTouch` is true) to prevent CPU overhead on every keystroke/interaction.
*   **Lyrics Engine**: 
    *   Uses a DOM-caching architecture where lines are pre-measured and shifted via `transform: translateY`.
    *   Driven by a custom, throttled `requestAnimationFrame` loop running at exactly **~15fps (66ms)** to perfectly balance scrolling smoothness with CPU sleep time (avoiding the 120fps RAF drain and the 4fps `timeupdate` chop).
*   **Keyboard Navigation**:
    *   Global: `Q` (Prev), `E` (Next), `S` (Shuffle), `R` (Repeat), `ArrowLeft/Right` (Seek 5s).
    *   Search: ArrowDown/Up highlights results via `selectedSearchIndex`. Pressing `Enter` executes `playTrackSelection()`, exactly mimicking a mouse click by loading the playlist and instantly clearing the search box.
*   **Service Worker (`sw.js`)**: Acts strictly as a network-first proxy to satisfy the browser's PWA install requirement. Do not add complex offline caching to `sw.js` as the browser natively handles caching the audio Blobs.

---

## 3. Backend Architecture (`youtube_playlist_tracker_downloader`)

*   **Lyrics Scraper (`youtube_playlist.py`)**: 
    *   Indian record labels use messy titles. The script runs aggressive Regex sanitization (stripping `[4K]`, `(Lyrical)`, etc.) before querying the `syncedlyrics` package.
    *   **The Holy Grail Fallback**: If `syncedlyrics` fails, the script uses `youtube-transcript-api` to pull official YouTube Closed Captions (prioritizing `en`, `hi`, `te`). These are natively synced by the labels and perfectly accurate.
*   **Transliteration Pipeline**:
    *   Step 1: `aksharamukha` converts native Indic scripts (Hindi/Telugu) into perfectly accurate IAST romanization.
    *   Step 2: `anyascii` strips the IAST diacritics into plain ASCII.
*   **GitHub Actions CI/CD (`tracker.yaml`)**:
    *   Requires `youtube-transcript-api`, `aksharamukha`, `anyascii`, and `syncedlyrics`.
    *   Uses a sparse-checkout methodology for speed. 
    *   Missing/Broken lyrics are fixed by simply deleting the `.lrc` file and letting the cron job re-download them using the advanced fallbacks.
    *   Uses `yt-dlp` to fetch the raw `webm/opus` audio.

