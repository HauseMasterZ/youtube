# CLAUDE.md — Frontend Development Guidelines

This document contains frontend-only coding guidelines for the Web Music Player Progressive Web App (PWA). It focuses on user interface, interaction patterns, audio routing, performance optimization, and frontend architectural best practices. Backend infrastructure and deployment logic are not documented here.

---

## 1. Audio Engine & Dual Playback Modes

### Desktop vs. Mobile Audio Routing
- **Desktop**: Use native `<audio>.volume` exclusively. **Never** connect `<audio>` to `AudioContext.createMediaElementSource()` as this forces Chromium's GPU compositor to stay active (~1% GPU overhead). Maintain **0.0% GPU load** on desktop by avoiding Web Audio graphs.
- **Mobile (Android/iOS)**: Use **Media Source Extensions (MSE)** with a permanent `<audio>.src` bound to `URL.createObjectURL(mediaSource)`. Changing `audio.src` directly triggers Android's `AudioTrack` deallocation, which kills the lock screen media notification when the device is locked. **`audio.src` must never be reassigned after initialization.**

### Track Switching on Mobile (MSE)
- `<audio id="audio-player-1">.src` is attached **once on startup** to `URL.createObjectURL(mediaSource)`.
- Track switches occur entirely inside the `SourceBuffer`:
  1. `await _clearSourceBuffer()` removes old audio frames.
  2. `await _appendToSourceBuffer(arrayBuffer)` appends new WebM/Opus track data.
  3. `mediaSource.endOfStream()` signals track completion.
- **Result**: Zero `emptied` events, zero `AudioTrack` deallocations, and lock screen notification remains pinned.

### Playback Engines: Mode 1 vs. Mode 2
The player supports two switchable audio engine modes persisted in `localStorage` (`yt_playback_mode`):
1. **Mode 1 (Standard / Battery Saver)**:
   - When paused, `navigator.mediaSession.playbackState` is set to `'paused'` (if paused by user) and seekbar rate is spoofed to `0.00001` on mobile to prevent Android lock-screen controls from unmounting.
   - Minimal battery consumption; zero background oscillator loops.
2. **Mode 2 (Car & Bluetooth Mode)**:
   - When paused, `navigator.mediaSession.playbackState` remains set to `'playing'`.
   - On mobile, `startLiveAudioAnchor()` runs a silent 0-gain `AudioContext` oscillator connected to `<audio id="live-stream-anchor">` to prevent vehicle infotainment systems and Bluetooth earbuds from entering standby or disconnecting.
   - **Inactivity Auto-Kill Watchdog**: When paused in Mode 2, `armAutoKillWatchdog()` starts a timer (default 30m, configurable to 15m, 30m, 1h, 2h, custom 1-1440m, or never) that automatically disarms and pauses all playback after sustained inactivity.
   - **Hardware Button Combo**: Rapid double-tap of Next ↔ Prev within 1200ms on Bluetooth earbud/steering wheel controls toggles between Mode 1 and Mode 2 (`togglePlaybackMode()`).

---

## 2. Offline Playlist Download Architecture

### Service Worker Bypass (`?bypass=true`)
- When downloading a playlist for offline playback via `downloadActivePlaylist()` in `js/playback.js`, all audio URLs **must** append `?bypass=true` (or `&bypass=true`).
- **Why**: Prevents `sw.js` fetch handlers from intercepting and double-buffering 5-10MB audio streams into memory concurrently with the page thread's `mediaCache.put()`, eliminating mobile browser out-of-memory (OOM) tab crashes and IndexedDB lock contention.

### Multi-Asset Cache Ingestion & Verification
1. **Unconditional Asset Ingestion**: Offline downloads fetch all three asset types for every track in the playlist:
   - **Audio** (`.webm` Opus) stored in `yt-player-media` with `'X-Partial-Cached': 'false'`.
   - **Thumbnails** (`.webp`) stored in `yt-player-thumbs` (unconditionally, ignoring `thumbsDisabled` mobile UI state).
   - **Lyrics** (`.lrc`) stored in `yt-player-media`.
2. **Cache Name Normalization**: Thumbnail cache **must** be opened as `'yt-player-thumbs'` across both `js/playback.js` and `sw.js`. Never use `'yt-thumbs-cache'`, as `sw.js` activation purges non-whitelisted caches.
3. **Resilient Retry Loop**: `fetchWithRetry(url, options, maxRetries=3)` applies exponential backoff (300ms, 600ms, 1200ms) to withstand transient network rate limits (HTTP 429) or gateway timeouts (HTTP 504).
4. **Accurate Tracking Metrics**: Live progress separately increments `savedCount` and `failedCount`, reporting `Gym - 14 / 213` or `Gym - 14 / 213 (1 failed)`.
5. **Automated Recovery Pass**: If post-download verification finds missing tracks in `mediaCache`, an automatic secondary retry pass retries all 3 assets (audio, thumbnail, lyrics) for the missing items before presenting the final `[OK]` status.

---

## 3. Zero-GPU & Performance Constraints

### Lighthouse CI 95+ Score Protocols
> **STRICT FRONTEND INVARIANT**:
> Every commit is audited by Lighthouse CI under **Simulated Mobile Slow 4G (1.6 Mbps, 750 Kbps up, 150ms RTT)** on emulated Moto G Power:
> - **First Contentful Paint (FCP)**: < 1.2s
> - **Largest Contentful Paint (LCP)**: < 2.3s (Target ≤ 1.3s)
> - **Total Blocking Time (TBT)**: < 150ms
> - **Cumulative Layout Shift (CLS)**: 0.00

### Zero-GPU Overlay Rules (`css/style.css`)
- **No Glassmorphic Blur on Overlays**: `.download-toast` must **never** use `backdrop-filter` or `-webkit-backdrop-filter`. Gaussian blurs force continuous GPU compositor framebuffer readbacks and texture rendering during live text updates.
- **Flat High-Contrast Layout**: Use solid backgrounds (`background: #141418`) and crisp 1px borders (`border: 1px solid var(--primary-color)`).
- **Layout Containment**: Apply `contain: layout paint` (or `contain: strict`) on high-frequency update elements like `.download-toast` and `.fast-scroller` to completely isolate DOM repaints from the viewport.
- **Desktop Idle Warming**: `warmRemainingPlaylists()` uses `requestIdleCallback` to prefetch unselected playlist JSONs only when `!isMobileDevice`, leaving mobile background threads completely unburdened.

---

## 4. Platform Scoping & Responsive Architecture

### Mobile Scoped Logic
- **Default Thumbnails**: `thumbsDisabled = isMobileDevice` initializes thumbnails off on mobile to conserve memory; enabled on desktop.
- **Floating Pill Mini-Player**: `@media (max-width: 750px) and (orientation: portrait)` docks a 60px mini-player at the bottom.
  - Swipe up $\le -20\text{px}$ expands full-screen player modal.
  - Swipe down $\ge 80\text{px}$ or tapping `#btn-collapse` collapses it.
  - Tapping 44px circular thumbnail toggles thumbnails directly.
- **Touch Gestures**:
  - Horizontal swipe on `.playlist-panel` ($\le 800\text{px}$) cycles playlists.
  - Swipe down on `#lyrics-container` ($\le 1110\text{px}$) dismisses lyrics drawer.
  - 500ms long-press on track items triggers `navigator.vibrate(40)` and enqueues track next.
  - Fast scroller edge drag triggers `navigator.vibrate(3)` tick per item.
- **Dropdown Settings Interception**: On mobile, `#playlist-select` includes `<option value="__settings__">Settings</option>`, opening `#settings-modal`.

### Desktop Scoped Logic
- **3-Column Grid**: `@media (min-width: 1111px) and (orientation: landscape)` renders permanent lyrics on left, player in center, playlist on right. Shifting by $1/3$ from center if lyrics are closed.
- **Keyboard Shortcuts**: `Space` (Play/Pause), `←`/`→` ($\pm 5\text{s}$), `:`/`;` (prev), `"`/`'` (next), `r`/`R` (repeat mode), `s`/`S` (shuffle mode), `Escape` (close modals), and alpha key auto-focusing search.
- **Context Menus**: Right-click on track items triggers `queuePlayNext()` with enqueue flash animation.
- **Dropdown Actions**: On desktop, `#playlist-select` exposes `<option value="HARD_RELOAD">Reload Playlists</option>` and `<option value="INSTALL_APP">Install App</option>`.
- **Hover Transitions**: All button glows and row highlights are strictly scoped inside `@media (hover: hover)`.

---

## 5. Core Module Directory Structure

| Module | File | Primary Responsibility |
|---|---|---|
| **Entry & Wiring** | `js/main.js` | App initialization, gesture routing, keyboard shortcuts, modal management |
| **Playback Logic** | `js/playback.js` | Queue generation, single/cross shuffle, offline download manager, track transitions |
| **Audio Engine** | `js/dom.js` | `DualAudioPingPong` MSE player, buffer progress tracking, volume control |
| **Media Controls** | `js/mediaSession.js` | W3C MediaSession metadata, live audio anchor, hardware button combo, auto-kill watchdog |
| **Virtual Scroller** | `js/ui.js` | DOM pool recycling (48px fixed height), track rendering, theme color injection |
| **Lyrics Parser** | `js/lyrics.js` | LRC parser, synchronized timestamp auto-scrolling, highlighting |
| **State Registry** | `js/state.js` | Single source of truth, settings persistence, environment checks |
| **Utilities** | `js/utils.js` | Damerau-Levenshtein fuzzy search, ISO duration parser, URL constructors |
| **Service Worker** | `sw.js` | Offline caching, thumbnail and media cache management, shell versioning |
| **Styles** | `css/style.css` | Responsive styling, zero-GPU rules, mobile drawers, modal styling |

---

## 6. Testing & Quality Invariants

### Python Test Suite (`tests/`)
All tests run natively with `unittest`:
```bash
python -m unittest discover -s tests -p "test_*.py"
```

1. [`test_download_engine.py`](file:///c:/Users/Hause/Documents/Code/youtube_frontend/tests/test_download_engine.py): Verifies `bypass=true` query usage, cache name normalization (`yt-player-thumbs`), unconditional thumb/lyrics downloads, and zero `backdrop-filter`.
2. [`test_media_session_engine.py`](file:///c:/Users/Hause/Documents/Code/youtube_frontend/tests/test_media_session_engine.py): Verifies micro-rate spoofing (`0.00001`), live audio anchor checks, and auto-kill watchdog mechanics.
3. [`test_settings_state.py`](file:///c:/Users/Hause/Documents/Code/youtube_frontend/tests/test_settings_state.py): Tests mode persistence, custom timeout bounds (1–1440m), and storage defaults.
4. [`test_settings_ui.py`](file:///c:/Users/Hause/Documents/Code/youtube_frontend/tests/test_settings_ui.py): Tests dropdown settings interception, modal wiring, and shortcut bounds.
5. [`test_settings_markup.py`](file:///c:/Users/Hause/Documents/Code/youtube_frontend/tests/test_settings_markup.py): Tests HTML tag balance, accessibility attributes, and element markup.
6. [`test_settings_css.py`](file:///c:/Users/Hause/Documents/Code/youtube_frontend/tests/test_settings_css.py): Tests modal styling, zero-blur overlays, and $\ge 44\text{px}$ touch targets.

> **STRICT INVARIANT**:
> Strictly **zero emojis** are permitted anywhere in JavaScript, CSS, HTML, or Python test files.
