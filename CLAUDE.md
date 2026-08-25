# CLAUDE.md — Frontend PWA Architecture & Technical Memory

This document serves as the comprehensive, authoritative technical memory for AI coding assistants working on the Web Music Player Progressive Web App (PWA). It details the core audio engine, virtual DOM recycling, W3C MediaSession constraints, and zero GPU desktop architecture.

---

## 1. Zero-GPU Desktop & Core Audio Engine ([`js/dom.js`](js/dom.js))

> **CRITICAL ARCHITECTURAL CONSTRAINTS**:
> 1. **Zero Desktop GPU Overhead**: `AudioContext` and Web Audio graphs are **strictly disabled on Desktop**. Connecting `<audio>` to `createMediaElementSource` forces Chromium's Direct3D compositor process to stay active (~1% GPU usage). Desktop playback relies exclusively on native `<audio>.volume` to guarantee continuous **0.0% GPU load**.
> 2. **MSE on Mobile for Notification Survival**: Media Source Extensions (MSE) are used on Android to keep `<audio>.src` permanently bound to `URL.createObjectURL(mediaSource)`. Changing `audio.src` directly triggers native `emptied` events which deallocate Android's `AudioTrack` and kill the lock screen notification widget when the device is locked.

### The 4 Invariants ([`js/dom.js`](js/dom.js))

#### Invariant 1: Permanent MediaSource Object URL (Mobile)
- `<audio id="audio-player-1">.src` is attached **once on startup** to `URL.createObjectURL(mediaSource)`.
- **`audio.src` is NEVER reassigned, deleted, or reloaded on mobile.**
- Track switching occurs entirely inside the `SourceBuffer`:
  ```javascript
  await this._clearSourceBuffer(); // removes old buffer
  await this._appendToSourceBuffer(firstChunk); // appends new WebM/Opus track
  ```

#### Invariant 2: Progressive Fragmented MSE Ingestion & Catch-Up Seeking
- **Initial Safety Cushion**: Ingests ~768KB (~40s of Opus audio) upfront as a combined contiguous buffer before `this.active.play()` begins to prevent mid-stream decoder packet dropouts.
- **Progressive Background Ingestion**: Remaining chunks stream continuously in the background, firing `'progress'` events with signature caching to avoid layout thrashing.
- **Start-to-Target Catch-Up Seeking**: When seeking into unbuffered audio (`target > buffEnd`), `this._pendingSeek` holds physical playback while the thumb sits at the target timestamp. Playback auto-resumes smoothly as soon as ingestion reaches the target.
- **In-Memory Scrubbing**: Seeking within already-buffered ranges is **100% instant 0ms local playback**.

#### Invariant 3: Canonical W3C Position Lifecycle & Zero-Bleed Rules ([`js/mediaSession.js`](js/mediaSession.js))
- **Position Bleed Prevention**: In `executePlayback()`, immediately invoke **`navigator.mediaSession.setPositionState(null)`** when `new MediaMetadata` is created to stop speculative OS seekbar timers from previous tracks.
- **Mandatory `<audio>` Playhead Pause**: Inside `switchTrack()`, **`this.active.pause()` and `this.active.currentTime = 0` MUST be called** to prevent Chromium's hardware clock from advancing during network fetches.
- **Auto-Advance Watchdog**: In `forwardEvent`, near-end watchdog (`ct >= dur - 0.25`) must ALWAYS read physical **`this.active.currentTime`**, never virtual `this.currentTime`.
- **Non-User Pause Instant Auto-Resume**: In `main.js` `pause` handler, if `window.wasPausedByUser === false`, immediately call `audioPlayer.play()`.

---

## 2. Frontend Architecture & Performance Constraints

### Virtual Scroller & Buffer DOM Caching ([`js/ui.js`](js/ui.js))
- Handles playlists with thousands of tracks using a fixed `48px` (`ITEM_HEIGHT`) DOM recycling virtual scroller.
- **Signature-Cached Buffer Updates**: `updateBufferProgress()` computes a buffer signature (`start-end|...`) and skips DOM mutations when buffered ranges are unchanged, eliminating layout thrashing during playback.

### Fast $12\times 12$ Chroma-Saturation Color Quantization ([`js/ui.js`](js/ui.js))
- Reuses a persistent $12\times 12$ offscreen canvas context to sample the center 70% of artwork.
- Directly evaluates chroma ($\Delta = \max(r,g,b) - \min(r,g,b)$) and brightness to score vibrant accent colors with high contrast on dark themes in **$<0.02\text{ms}$** (zero HSL conversion loops).
- Stores extracted colors in `dominantColorCache` and `artworkSquareCache`.

### Unified Playlist Normalization ([`js/utils.js`](js/utils.js))
- All playlist ingestion across initial load, desktop parallel preloading, and sync updates routes through `normalizePlaylistData(data, folderName)`.
- Automatically strips `Deleted/Private Video` tracks and transforms array schemas into unified track objects.

### Clean CSS Layering ([`css/style.css`](css/style.css))
- Zero GPU layer forcing (`will-change: transform` and `transform: translateZ(0)` are removed from non-animated layers).
- Purged all legacy `.ai-lyrics-badge` keyframe animations to eliminate compositor memory leaks.

---

## 3. Search Engine & Crawler Policy ([`robots.txt`](robots.txt))
- **Allowed**: `Googlebot`, `Bingbot`, `DuckDuckBot` for full web search indexing.
- **Blocked**: All major LLM training scrapers (`GPTBot`, `ClaudeBot`, `Google-Extended`, `Applebot-Extended`, `CCBot`, `Meta-ExternalAgent`, `Diffbot`, `PerplexityBot`).
- **Page Metadata**: `<meta name="robots" content="index, follow">` in [`index.html`](index.html).

---

## 4. Service Worker & Caching Strategy ([`sw.js`](sw.js))

### Dual-Cache Architecture
1. **App Shell Cache (`yt-player-cache-v118`)**:
   - Stores `index.html`, CSS, modular JS scripts, and SVG assets.
   - Updated by incrementing `CACHE_NAME` in `sw.js` and query strings in `index.html` (`?v=24.95`).
2. **Media Chunk Cache (`yt-player-media`)**:
   - Dedicated persistent cache for audio streams (`.webm`) and album artwork (`.webp`).
   - Strips HTTP `Range` headers from origin fetches to store full `200` responses.
   - **Strict Invariant**: `activate` handler in `sw.js` must NEVER delete `yt-player-media` during app shell cache updates.

---

## 5. Codebase File Map

| File | Subsystem | Responsibility |
|---|---|---|
| [`index.html`](index.html) | Shell | HTML layout, circular YT logo, audio element, versioned script imports (`v24.95`), robots meta. |
| [`robots.txt`](robots.txt) | SEO / Security | Crawler policy allowing search engines and disallowing AI scrapers. |
| [`js/dom.js`](js/dom.js) | Audio Engine | `DualAudioPingPong` MSE engine, `SourceBuffer` pipeline, 0% GPU desktop volume routing. |
| [`js/mediaSession.js`](js/mediaSession.js) | OS Integration | Native `MediaMetadata`, W3C `setPositionState(null)` lifecycle, lock screen action handlers. |
| [`js/playback.js`](js/playback.js) | Playback Logic | Queue orchestration, cross-playlist/single-playlist shuffle, repeat modes, visual preloading. |
| [`js/main.js`](js/main.js) | App Controller | Event bus, search indexing, virtual track rendering, VPS sync polling. |
| [`js/ui.js`](js/ui.js) | Presentation | Virtual scroller, $12\times 12$ fast chroma color extractor, signature-cached buffer bar. |
| [`js/lyrics.js`](js/lyrics.js) | Lyrics | Synchronized `.lrc` timestamp parser, auto-scroll animation loop. |
| [`js/state.js`](js/state.js) | State Store | Global state registry (`allDatabases`, `playQueue`, `queueIndex`, `repeatMode`, `shuffleMode`). |
| [`js/utils.js`](js/utils.js) | Utilities | ISO duration parser, time formatter, unified `normalizePlaylistData()`. |
| [`sw.js`](sw.js) | Service Worker | App shell cache manager (`yt-player-cache-v118`) and persistent media cache (`yt-player-media`). |

