# CLAUDE.md — Frontend PWA Architecture & Technical Memory

This document serves as the comprehensive, authoritative technical memory for AI coding assistants working on the Web Music Player Progressive Web App (PWA). It details the core audio engine, virtual DOM recycling, W3C MediaSession constraints, and undocumented Chromium Android quirks.

---

## 2. Core Audio Engine: Media Source Extensions (MSE) + Web Audio

> **PRIMARY ARCHITECTURAL REASON FOR MSE**:
> Media Source Extensions (MSE) are used **specifically to prevent Android from dismantling the Lock Screen Media Notification / Media Controls UI**. It is **NOT** chosen merely for non-fragmented/continuous buffering. On Android Chromium, reassigning `audio.src = url` sends `OnPlayerDestroyed` IPC to the OS and deallocates the `AudioTrack` when `document.hidden = true`. Binding `audio.src` permanently to a single `MediaSource` object URL is the **only known web standard mechanism that keeps the Android Media Notification continuously alive** across track changes. Continuous buffering is an implementation detail; Media UI retention is the driving requirement.

### The Problem: Android Lock Screen Notification Teardown
On Android Chrome (and Chromium PWAs), changing `audio.src = url` triggers the native `emptied` and `pause` events. While the phone is locked (`document.hidden = true`), this deallocates the native `AudioTrack`, destroys the underlying `player_id`, and causes Android SystemUI to immediately dismiss the lock screen media notification.

### The Production Solution: The 4 Invariants ([`js/dom.js`](js/dom.js))

#### Invariant 1: Permanent MediaSource Object URL
- `<audio id="audio-player-1">.src` is attached **once on startup** to `URL.createObjectURL(mediaSource)`.
- **`audio.src` is NEVER reassigned, deleted, or reloaded.**
- Track switching occurs entirely inside the `SourceBuffer`:
  ```javascript
  await this._clearSourceBuffer(); // removes old buffer
  await this._appendToSourceBuffer(firstChunk); // appends new WebM/Opus track
  ```
- **Zero `emptied` events, zero `AudioTrack` deallocations, and zero player ID resets.**

#### Invariant 2: Web Audio `GainNode` Output Routing
- Audio from `<audio id="audio-player-1">` is routed through:
  `createMediaElementSource(audio) ──► GainNode ──► ctx.destination`
- When Next/Prev is clicked:
  - `gainNode.gain.value = 0` provides **100% true digital silence** (zero audio leak).
  - `<audio>.muted` **remains `false`**, preventing Chromium's `hideNotification()` trigger.
  - When playback begins, `gainNode.gain.value = 1.0` restores volume instantly.

#### Invariant 3: Single Continuous Progressive Ingestion & 0ms Seeking
- Single HTTP GET stream per track: fast-starts playback within **<100ms** on the first chunk (~256KB), while piping remaining chunks into `SourceBuffer` in the background until `endOfStream()`.
- **In-Memory Scrubbing**: Seeking backwards or within already-buffered audio is **100% instant 0ms local playback**.
- **Catch-up Seeking**: When seeking ahead into unbuffered audio, the playhead holds at the target timestamp without snapback and auto-resumes playback as soon as the buffer reaches that position.

#### Invariant 4: Canonical W3C Position Lifecycle ([`js/mediaSession.js`](js/mediaSession.js))
- **During Buffering / Transition**:
  - `navigator.mediaSession.playbackState = "playing"` (keeps background notification alive).
  - **`navigator.mediaSession.setPositionState(null)`** (W3C standard method to clear position tracking during loading).
  - Android SystemUI immediately clears previous seekbar timers without running speculative extrapolation.
- **On Actual Playback (`'playing'` event)**:
  - `navigator.mediaSession.setPositionState({ duration, playbackRate: 1.0, position: 0 })`
  - Android OS initializes seekbar at `0:00` with standard `1.0x` rate, advancing in 1:1 real-time sync with sound.

---

## 3. Frontend Architecture & Performance Constraints

### Virtual Scroller ([`js/ui.js`](js/ui.js) & [`js/main.js`](js/main.js))
- Handles playlists with thousands of tracks using a DOM recycling virtual scroller.
- **Strict Invariant**: Track rows are fixed at `48px` (`ITEM_HEIGHT`). Do not alter vertical margins/padding without updating `ITEM_HEIGHT`.

### Dynamic Canvas Color Extraction ([`js/playback.js`](js/playback.js) & [`js/utils.js`](js/utils.js))
- Extracts the dominant color from album artwork via an off-screen `<canvas>` and injects it into `--primary-color`.
- Results are stored in an in-memory `dominantColorCache` and `artworkSquareCache` (LRU) to eliminate redundant Canvas processing.

### Throttled Lyrics Engine ([`js/lyrics.js`](js/lyrics.js))
- Parses synchronized timestamped `.lrc` files (including romanized Indic transliterations).
- Driven by a throttled `requestAnimationFrame` loop running at **~15fps (66ms)** to achieve smooth scrolling without GPU/CPU thermal drain.

### Global Touch & Keyboard Handling
- Global keyboard shortcuts (`Q` Prev, `E` Next, `S` Shuffle, `R` Repeat, `Arrows` Seek) are **explicitly disabled on mobile devices** to prevent interference with software keyboards.
- Focus rings (`outline: none !important`) and webkit tap highlights (`-webkit-tap-highlight-color: transparent`) are disabled across all buttons.

### Visual Assets & Iconography
- **Strict Rule**: ALWAYS use the circular YouTube Music logo (circle with inner play triangle) for all icons, manifests, and MediaSession assets.
- **NEVER** use the standard rectangular YouTube logo.
- All core icons are inline SVGs to ensure offline resilience without network round-trips.

---

## 4. Service Worker & Caching Strategy ([`sw.js`](sw.js))

### Dual-Cache Architecture
1. **App Shell Cache (`yt-player-cache-vXX`)**:
   - Stores `index.html`, CSS, modular JS scripts, and SVG assets.
   - Updated by incrementing `CACHE_NAME` in `sw.js` and query strings in `index.html` (`?v=20.XX`).
2. **Media Chunk Cache (`yt-player-media`)**:
   - Dedicated persistent cache for audio streams (`.webm`) and album artwork (`.webp`).
   - `sw.js` strips HTTP `Range` headers from origin fetches to store full `200` responses (not partial `206` slices).
   - **Strict Invariant**: The `activate` handler in `sw.js` must NEVER delete `yt-player-media` during app shell cache updates.

---

## 5. Codebase File Map

| File | Subsystem | Responsibility |
|---|---|---|
| [`index.html`](index.html) | Shell | HTML structure, circular YT logo, audio element, versioned script imports. |
| [`js/dom.js`](js/dom.js) | Audio Engine | `DualAudioPingPong` MSE engine, `SourceBuffer` pipeline, Web Audio `GainNode` graph. |
| [`js/mediaSession.js`](js/mediaSession.js) | OS Integration | Native `MediaMetadata`, W3C `setPositionState(null)` lifecycle, lock screen action handlers. |
| [`js/playback.js`](js/playback.js) | Playback Logic | Queue management, shuffle (local & cross-playlist), repeat modes, dominant color extraction. |
| [`js/main.js`](js/main.js) | App Controller | Event bus, search indexing, virtual track rendering, VPS sync polling. |
| [`js/ui.js`](js/ui.js) | Presentation | Virtual scrolling engine, theme injection, mini-player touch drawer. |
| [`js/lyrics.js`](js/lyrics.js) | Lyrics | Synchronized `.lrc` timestamp parser, auto-scroll animation loop. |
| [`js/state.js`](js/state.js) | State Store | Global state registry (`allDatabases`, `playQueue`, `queueIndex`, `repeatMode`, `shuffleMode`). |
| [`js/utils.js`](js/utils.js) | Utilities | ISO-8601 duration parser, color quantization, time formatters. |
| [`sw.js`](sw.js) | Service Worker | App shell cache manager (`yt-player-cache-vXX`) and media cache (`yt-player-media`). |

