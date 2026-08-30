# Web Music Player (PWA) — User & Developer Guide

> A high-performance, offline-capable Progressive Web App for streaming music playlists with lock screen media controls and seamless background playback.
>
> **Live:** [https://hausemasterz.github.io/youtube/](https://hausemasterz.github.io/youtube/)

---

## Features

- **Playlist Management**: Load and switch between multiple playlists (`Gym`, `Driving`, `Songs`) seamlessly.
- **Playback Controls**: Play, pause, skip forward/backward, and seek within tracks.
- **Dual Playback Engines**: Switch between Standard Battery Saver (Mode 1) and Car & Bluetooth Mode (Mode 2) with auto-kill inactivity watchdog.
- **Full Offline Downloads**: One-click download of full playlists (audio tracks, thumbnails, and lyrics) with automated retry and verification.
- **Shuffle & Repeat**: Single-playlist and global cross-playlist shuffle modes; repeat one, repeat all, or linear playback.
- **Lock Screen Integration**: Native media controls on mobile lock screens with artwork, title, artist, and seekbar sync.
- **Lyrics Display**: Synchronized `.lrc` lyrics with auto-scroll during playback.
- **Virtual Scrolling**: Fast, smooth rendering of playlists with thousands of tracks using a recycled DOM pool.
- **Zero-GPU Architecture**: 0.0% GPU load on desktop, flat opaque mobile overlays with zero compositor blur overhead.
- **Theme Colors**: Dynamic accent colors extracted from album artwork.

---

## User Interface

### Main Layout
- **Header**: Album artwork, track title, artist name, and duration.
- **Playback Controls**: Play/pause button, skip buttons, and seek bar.
- **Playlist View**: Virtual scrolling list of tracks with duration and current play position indicator.
- **Lyrics Drawer**: Synchronized lyrics that auto-scroll during playback; toggle via button or swipe gestures.
- **Settings Modal**: Audio engine selection (Mode 1 vs Mode 2), inactivity auto-kill timeout configuration, and app install/reload actions.
- **Download Overlay**: Real-time progress tracker (`Gym - 14 / 213`) with verification and retry status.

### Keyboard Shortcuts (Desktop)
- **Space**: Play/pause
- **→ / ←**: Seek forward / backward ($\pm 5\text{s}$)
- **: / ;**: Previous track
- **" / '**: Next track
- **r / R**: Cycle repeat mode (Off -> All -> One)
- **s / S**: Cycle shuffle mode (Off -> Global -> Playlist)
- **L**: Toggle lyrics panel
- **Escape**: Close settings modal
- **A-Z / 0-9**: Automatically focus search input

---

## Playback Modes & Audio Engines

### Playback Engines (Settings)
- **Standard (Battery Saver / Mode 1)**: Minimal battery consumption. When paused, media session is marked paused and lock screen controls are preserved using mobile micro-rate spoofing (`0.00001`).
- **Car & Bluetooth Mode (Mode 2)**: Prevents vehicle infotainment and Bluetooth headphone disconnects when paused by maintaining an active media session state and running a silent audio anchor loop on mobile.
- **Inactivity Auto-Kill Watchdog**: Configurable sleep timer (15m, 30m, 1h, 2h, custom 1-1440m, or never) that automatically disarms Mode 2 and pauses all playback after sustained pause inactivity.
- **Hardware Button Combo**: Rapid double-tap of Next ↔ Prev within 1200ms on Bluetooth earbud/steering wheel controls toggles between Mode 1 and Mode 2.

### Shuffle & Repeat
- **Shuffle Off**: Play tracks in playlist order.
- **Global Shuffle (Mode 1)**: Randomize across all loaded playlists with persistent history navigation.
- **Playlist Shuffle (Mode 2)**: Randomize within the current playlist only.
- **Repeat Off / All / One**: Standard repeat cycle modes.

---

## Offline Download Architecture

- **Bypass Service Worker (`?bypass=true`)**: Direct streaming to page memory and `CacheStorage` (`yt-player-media`), eliminating duplicate buffering and out-of-memory crashes in `sw.js`.
- **Complete Asset Ingestion**: Downloads audio (`.webm`), album thumbnails (`.webp` into `yt-player-thumbs`), and lyrics (`.lrc` into `yt-player-media`) unconditionally.
- **Exponential Backoff Retries**: Up to 3 retries per asset (300ms, 600ms, 1200ms) to resolve network glitches and CDN rate limits.
- **Post-Download Verification**: Automatically verifies cache contents and performs a targeted recovery pass for missing tracks before finalizing status.
- **Zero-GPU Progress Toast**: High-contrast, flat notification with `contain: layout paint` (0% GPU compositor cost, no `backdrop-filter`).

---

## Browser Support

- **Chrome/Edge**: 80+
- **Firefox**: 78+
- **Safari**: 14+
- **Mobile**: iOS Safari 14+, Android Chrome 80+

The app works completely offline after downloading playlists.

---

## Audio Engine & Performance Architecture

### Zero-GPU Desktop Playback
Desktop playback uses native `<audio>.volume` control to maintain **0.0% GPU load**. The `AudioContext` and Web Audio graphs are disabled on desktop to prevent Chromium's Direct3D compositor process from staying active.

Mobile uses **Media Source Extensions (MSE)** with a permanent `<audio>.src` bound to `URL.createObjectURL(mediaSource)`. This approach keeps the Android lock screen notification pinned during track switches and prevents audio drops when changing tracks.

### Performance Targets (Lighthouse Mobile Slow 4G)
Every release is audited against simulated mobile slow 4G (1.6 Mbps / 150ms RTT):

| Metric | Target | Status |
|--------|--------|--------|
| **Performance Score** | 95–100 | Passed |
| **First Contentful Paint (FCP)** | < 1.2s | Passed |
| **Largest Contentful Paint (LCP)** | < 2.3s | Passed |
| **Total Blocking Time (TBT)** | < 150ms | Passed |
| **Cumulative Layout Shift (CLS)** | 0.00 | Passed |

---

## Project Structure

```
.
├── index.html                  # Main HTML layout and modal containers
├── manifest.json               # PWA manifest
├── robots.txt                  # Crawler directives
├── sw.js                       # Service Worker caching & whitelist rules
├── css/
│   └── style.css               # Application styles, zero-GPU rules, media queries
├── js/
│   ├── main.js                 # App entry point, gesture wiring, keyboard shortcuts
│   ├── playback.js             # Playback queue, shuffle logic, offline download manager
│   ├── dom.js                  # DualAudioPingPong MSE player, audio engine
│   ├── mediaSession.js         # MediaSession, live audio anchor, auto-kill watchdog
│   ├── ui.js                   # Virtual scroller (48px DOM recycling)
│   ├── lyrics.js               # Synchronized LRC lyrics parser and auto-scroll
│   ├── state.js                # State registry and settings persistence
│   └── utils.js                # Fuzzy search, duration parser, URL generators
└── tests/
    ├── test_download_engine.py      # Offline download & zero-GPU overlay tests
    ├── test_media_session_engine.py # Audio engine, rate spoofing, and watchdog tests
    ├── test_settings_state.py       # State and persistence tests
    ├── test_settings_ui.py          # UI wiring and shortcut tests
    ├── test_settings_markup.py      # HTML validation and accessibility tests
    └── test_settings_css.py         # CSS rules and touch target tests
```

---

## Running Locally

No build step is required. Open `index.html` in a modern browser (Chrome 80+, Safari 14+, Firefox 78+).

To run unit tests:
```bash
python -m unittest discover -s tests -p "test_*.py"
```

---

## License

See repository for license information.
