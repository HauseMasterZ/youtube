# Web Music Player (PWA) — User & Developer Guide

> A high-performance, offline-capable Progressive Web App for streaming music playlists with lock screen media controls and seamless background playback.
>
> **Live:** [https://hausemasterz.github.io/youtube/](https://hausemasterz.github.io/youtube/)

---

## Features

- **Playlist Management**: Load and switch between multiple playlists seamlessly.
- **Playback Controls**: Play, pause, skip forward/backward, and seek within tracks.
- **Shuffle & Repeat**: Single-playlist and global cross-playlist shuffle modes; repeat one, repeat all, or linear playback.
- **Lock Screen Integration**: Native media controls on mobile lock screens with artwork, title, and artist.
- **Lyrics Display**: Synchronized `.lrc` lyrics with auto-scroll during playback.
- **Virtual Scrolling**: Fast, smooth rendering of playlists with thousands of tracks.
- **Offline Playback**: Cached playlists and audio streams play without network.
- **Theme Colors**: Dynamic accent colors extracted from album artwork.

---

## User Interface

### Main Layout
- **Header**: Album artwork, track title, artist name, and duration.
- **Playback Controls**: Play/pause button, skip buttons, and seek bar.
- **Playlist View**: Virtual scrolling list of tracks with duration and current play position indicator.
- **Lyrics Drawer**: Synchronized lyrics that auto-scroll during playback; toggle via button.
- **Settings**: Repeat and shuffle mode buttons.

### Keyboard Shortcuts
- **Space**: Play/pause
- **→**: Next track (skip forward)
- **←**: Previous track (skip backward)
- **L**: Toggle lyrics panel

---

## Playback Modes

### Shuffle
- **Off**: Play tracks in playlist order.
- **Playlist Shuffle**: Randomize within the current playlist only.
- **Global Shuffle**: Randomize across all loaded playlists.

### Repeat
- **None**: Linear playback; stop at end of playlist.
- **All**: Loop the entire playlist.
- **One**: Loop the current track.

---

## Lyrics Format

Supported `.lrc` file format with synchronized timestamps:

```
[00:00.00] Introduction
[00:15.30] Verse 1
[01:23.45] Chorus
[02:10.00] Verse 2
```

Lyrics auto-scroll and highlight the current line during playback.

---

## Browser Support

- **Chrome/Edge**: 80+
- **Firefox**: 78+
- **Safari**: 14+
- **Mobile**: iOS Safari 14+, Android Chrome 80+

The app works offline after the first load thanks to service worker caching.

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

### Frontend Optimizations
- **Virtual Scroller**: Fixed 48px item height with fixed DOM pool (50 visible + 20 buffered max).
- **Lazy Initialization**: MSE and media engine boot only on first play/track switch, not on page load.
- **Signature-Cached Buffer Updates**: Skip DOM mutations when buffer ranges unchanged (signature: `"0-500|500-1000|..."`).
- **12×12 Color Extraction**: Fast chroma/saturation quantization (<0.02ms) for dynamic theme colors.
- **Synchronous Data Loading**: Immediate unblocked playlist fetch at `t=0`; no `requestAnimationFrame` wrapping.

---

## Development

### Project Structure
```
.
├── index.html          # Main HTML shell
├── manifest.json       # PWA manifest
├── robots.txt          # Crawler directives
├── sw.js               # Service Worker
├── css/
│   └── style.css       # Application styles
├── js/
│   ├── main.js         # App entry point
│   ├── playback.js     # Playback queue and shuffle logic
│   ├── dom.js          # Audio engine (playback)
│   ├── mediaSession.js # Lock screen media controls
│   ├── ui.js           # Virtual scroller and UI components
│   ├── lyrics.js       # Synchronized lyrics parser
│   ├── state.js        # Global app state
│   └── utils.js        # Utility functions
└── assets/
    └── fonts/          # Custom fonts
```

### Running Locally
No build step is required. Open `index.html` in a modern browser (Chrome 80+, Safari 14+, Firefox 78+).

### Frontend Development Guidelines
- **Performance**: Use virtual scrolling (`ui.js`) for large playlists. Avoid layout thrashing during playback updates.
- **Accessibility**: Ensure all controls are keyboard-accessible and properly labeled.
- **Responsive Design**: Test on mobile (iOS Safari, Android Chrome) and desktop browsers.
- **Offline Support**: Changes to `sw.js` and versioned assets are cached; clear browser cache to see updates during development.

---

## Codebase Overview

| File | Purpose |
|---|---|
| [`index.html`](index.html) | Main layout: audio element, header, player, playlist view. |
| [`js/main.js`](js/main.js) | App initialization, event handling, keyboard shortcuts. |
| [`js/playback.js`](js/playback.js) | Playback queue, shuffle and repeat logic. |
| [`js/dom.js`](js/dom.js) | Audio playback control and buffering. |
| [`js/mediaSession.js`](js/mediaSession.js) | Lock screen media controls and metadata. |
| [`js/ui.js`](js/ui.js) | Virtual scroller, interface components. |
| [`js/lyrics.js`](js/lyrics.js) | Lyrics parsing and display synchronization. |
| [`js/state.js`](js/state.js) | Centralized app state management. |
| [`js/utils.js`](js/utils.js) | Time formatting and utility functions. |
| [`css/style.css`](css/style.css) | Application styling. |
| [`sw.js`](sw.js) | Service worker for offline support. |

---

## License

See repository for license information.
