# CLAUDE.md — Frontend Development Guidelines

This document contains frontend-only coding guidelines for the Web Music Player Progressive Web App (PWA). It focuses on user interface, interaction patterns, performance optimization, and frontend best practices. Backend infrastructure (GCP, Hugging Face, ngrok, Cloudflare) and deployment logic are not documented here.

---

## 1. Audio Engine & Zero-GPU Desktop Constraint

### Desktop vs. Mobile Audio Routing
- **Desktop**: Use native `<audio>.volume` exclusively. **Never** connect `<audio>` to `AudioContext.createMediaElementSource()` as this forces Chromium's GPU compositor to stay active (~1% GPU overhead). Maintain **0.0% GPU load** on desktop by avoiding Web Audio graphs.
- **Mobile (Android)**: Use **Media Source Extensions (MSE)** with a permanent `<audio>.src` bound to `URL.createObjectURL(mediaSource)`. Changing `audio.src` directly triggers Android's `AudioTrack` deallocation, which kills the lock screen media notification when the device is locked. **`audio.src` must never be reassigned after initialization.**

### Track Switching on Mobile (MSE)
- `<audio id="audio-player-1">.src` is attached **once on startup** to `URL.createObjectURL(mediaSource)`.
- Track switches occur entirely inside the `SourceBuffer`:
  1. `await _clearSourceBuffer()` removes old audio frames.
  2. `await _appendToSourceBuffer(arrayBuffer)` appends new WebM/Opus track data.
  3. `mediaSource.endOfStream()` signals track completion.
- **Result**: Zero `emptied` events, zero `AudioTrack` deallocations, and lock screen notification remains pinned.

### W3C MediaSession Lifecycle
- **On track transition**: Set `navigator.mediaSession.metadata`, then **immediately call `setPositionState(null)`** to clear old seekbar timers.
- **On playback start**: Call `setPositionState({ duration, position, playbackRate: 1.0 })` to sync the OS lock screen seekbar.
- **Critical**: Always read physical `audioElement.currentTime` from the DOM, never cache virtual positions.

---

## 2. Lighthouse CI & 95+ Performance Architecture Protocols

> **STRICT FRONTEND INVARIANT**:
> Every commit is audited by Lighthouse CI under **Simulated Mobile Slow 4G (1.6 Mbps, 750 Kbps up, 150ms RTT)** on emulated Moto G Power. The production build MUST achieve **95–100 Performance Score**:
> - **First Contentful Paint (FCP)**: < 1.2s
> - **Largest Contentful Paint (LCP)**: < 2.3s (Target ≤ 1.3s)
> - **Total Blocking Time (TBT)**: < 150ms
> - **Cumulative Layout Shift (CLS)**: 0.00

### Critical Path Performance Rules

#### Rule 1: Synchronous Playlist Fetch
- `loadPlaylist()` must fire `fetch(dbUrl)` immediately at t=0, **not** wrapped in `requestAnimationFrame`.
- Never block behind `await caches.open()` on initial load.
- Synchronous `normalizePlaylistData()` must complete in < 1ms across 1,000 tracks.

#### Rule 2: Zero LCP Bounding Box Resets
- Never insert temporary skeleton placeholder rows that get replaced by real track titles later.
- Replacing small 20px skeleton boxes with 78-character titles causes Chromium to reset LCP candidate timestamp.
- Either render directly in single paint or use fixed-height background blocks.

#### Rule 3: Total Blocking Time (TBT < 150ms)
- **Lazy MSE Initialization**: `DualAudioPingPong` must NOT call `_initMSE()` or `createMediaSource()` at module top-level or constructor. Initialize strictly on first `play()` or `switchTrack()`.
- **Zero Top-Level DOM**: Never create DOM nodes, SVG elements, or run `innerHTML` at module scope. `trackTemplate` must be initialized lazily via `getTrackTemplate()` on first render.
- **Flat CSS Specificity**: Avoid deep `:not()` chains or `!important` in `css/style.css`; deep CSS rules stall Blink's parser during inlined document parse.

#### Rule 4: GPU Layer Discipline
- **Never** use `will-change: transform` or `transform: translateZ(0)` on static elements; only animate/scroll layers get promotion.
- Avoid `transform: translate3d()` on elements that don't animate; use `margin` or `position` instead.
- Remove `will-change` from static content after animation completes to prevent compositor memory leaks.

#### Rule 5: Font Loading
- Use WOFF2 format only; micro-subset to **Latin characters only** (< 50KB per file).
- Load fonts asynchronously via `@font-face` with `font-display: swap` to avoid render-blocking delays.

---

## 3. Frontend Architecture Overview

### Core Modules

| Module | File | Responsibility |
|--------|------|---|
| **UI Engine** | `js/ui.js` | Virtual scroller, layout rendering, theme injection, touch handlers |
| **Playback Logic** | `js/playback.js` | Queue management, shuffle/repeat modes, track transitions |
| **Audio Control** | `js/dom.js` | Audio playback, buffering, volume control |
| **Media Controls** | `js/mediaSession.js` | Lock screen metadata, OS media button integration |
| **Lyrics** | `js/lyrics.js` | LRC parser, synchronized timestamp display |
| **State** | `js/state.js` | Global app state, playlist registry |
| **Utilities** | `js/utils.js` | Time formatting, color extraction, helpers |
| **Entry Point** | `js/main.js` | App initialization, event wiring, keyboard shortcuts |

---

## 4. Frontend Design Patterns

### Virtual Scroller Pattern (`js/ui.js`)
- Use fixed `48px` item height for consistent DOM recycling.
- Never create/destroy DOM nodes dynamically during scroll; reuse a fixed pool.
- Keep scroll position in sync with playback state; update UI only when playlist changes.
- **Why**: Prevents layout thrashing and jank on large playlists (1000+ tracks).

### Playback State Management (`js/state.js`)
- Maintain single source of truth for:
  - `allDatabases`: All loaded playlists
  - `playQueue`: Current play order (possibly shuffled)
  - `queueIndex`: Current track index
  - `repeatMode`: "none" | "all" | "one"
  - `shuffleMode`: "off" | "playlist" | "global"
- Always update state before dispatching UI updates; UI is derived from state, never the inverse.

### Lock Screen Integration (`js/mediaSession.js`)
- Set `navigator.mediaSession.metadata` with artwork, title, and artist whenever a track changes.
- Always call `setPositionState(null)` when transitioning between tracks to clear old seekbar timers.
- Update `setPositionState({ duration, position, playbackRate: 1.0 })` once playback starts.
- Handle media button actions (play, pause, skip) via `mediaSession.setActionHandler()`.

### Audio Playback Flow (`js/dom.js`)
- Fetch and buffer audio chunks progressively.
- Pause playback before switching tracks to prevent audio overlap.
- Reset `currentTime = 0` on every track switch.
- Emit custom events (`'playing'`, `'ended'`) to signal playback state to the UI and media session.

---

## 5. UI Component Guidelines

### Accessibility
- All clickable elements must be keyboard-accessible.
- Use semantic HTML5 elements (`<button>`, `<input>`, `<nav>`).
- Provide `aria-label` for icon-only buttons.
- Ensure color contrast meets WCAG AA standards (4.5:1 for text, 3:1 for graphics).

### Responsive Design
- Test layouts on:
  - **Mobile**: 375px (iPhone 12 mini), 812px (iPhone 12), 360px (Android small)
  - **Tablet**: 768px (iPad), 1024px (iPad Pro)
  - **Desktop**: 1920px (full HD), 2560px (4K)
- Use `@media (max-width: ...)` breakpoints, not device detection.
- Font sizes scale with viewport; no fixed pixel sizes on mobile.

### Touch Gestures
- **Swipe Left/Right**: Skip to next/previous track.
- **Swipe Up/Down**: Open/close lyrics panel.
- **Long Press**: Show track menu (e.g., delete from queue).
- **Double Tap**: Play/pause.
- Ensure touch targets are at least 44px × 44px for accessibility.

### Theme & Colors
- Extract dominant color from album artwork using `js/ui.js` color quantization.
- Use CSS custom properties (CSS variables) to apply accent colors dynamically.
- Dark theme only; light backgrounds should have high contrast.
- Avoid pure black (#000000); use #1a1a1a or similar for reduced eye strain.

---

## 6. Performance Best Practices

### Scroll Performance
- **Never** force synchronous DOM layout during scroll events; batch updates with `requestAnimationFrame`.
- Use `transform: translate3d()` for smooth 60fps scrolling, never top/left.
- Limit DOM nodes to ~50 visible + 20 off-screen buffered (100 total max).

### Render Optimization
- Avoid repainting the entire DOM during track transitions.
- Use signature caching (`updateBufferProgress()`) to skip unnecessary DOM mutations.
- Example signature: `"0-500|500-1000|1500-2000"` only updates if buffer ranges change.

### Font Loading
- Use WOFF2 format only; micro-subset to Latin characters only.
- Font file size must stay under 50KB.
- Load fonts asynchronously via `@font-face` with `font-display: swap`.

### Color Extraction
- Reuse a persistent 12×12 offscreen canvas to sample artwork.
- Compute chroma (Δ = max(r,g,b) - min(r,g,b)) and brightness in under 0.02ms.
- Cache results in `dominantColorCache` and `artworkSquareCache` to avoid re-processing.

---

## 7. Input Handling

### Keyboard Shortcuts
- **Space**: Toggle play/pause
- **→ (Right Arrow)**: Skip to next track
- **← (Left Arrow)**: Skip to previous track
- **L**: Toggle lyrics panel
- All shortcuts must have visual indicator (e.g., key hint in tooltips)

### Seek Bar Interaction
- Allow scrubbing (dragging) on the seek bar.
- Show tooltip with timestamp on hover (e.g., "1:23").
- Clamp seek position to buffered ranges on mobile; allow seeking into unbuffered ranges on desktop.

### Volume Control
- Expose volume slider for desktop only.
- On mobile, volume is controlled by hardware buttons; do not override system volume.
- Always sync `<audio>.volume` with UI slider state after user interaction.

---

## 8. Lyrics Display (`js/lyrics.js`)

### LRC Format Support
- Parse timestamps in format: `[MM:SS.ms] Lyric text`
- Handle edge cases:
  - Empty lines (treat as blank lyric)
  - Duplicate timestamps (show all in same frame)
  - Out-of-order timestamps (sort internally)
- Display current + next 2-3 lines to preview upcoming lyrics.

### Auto-Scroll Behavior
- Scroll to center the current lyric on screen during playback.
- Use `requestAnimationFrame` for smooth 60fps scroll animation.
- Stop scrolling if user manually scrolls the lyrics panel (pause auto-scroll).
- Resume auto-scroll 3 seconds after user releases the panel.

---

## 9. Error Handling & User Feedback

### Network Errors
- Show toast notification: "⚠️ Failed to load track. Retrying..."
- Auto-retry with exponential backoff (100ms, 300ms, 1s).
- After 3 retries, show: "⚠️ Track unavailable. Skipping..."

### Playback Errors
- If audio codec is unsupported, show: "❌ Audio format not supported"
- Log error to console with timestamp and track ID.
- Skip to next track automatically after 2 seconds.

### UI State Feedback
- **Loading**: Pulse/fade animation on album artwork.
- **Buffering**: Show buffered progress as fade overlay on seek bar.
- **Error**: Red tint on current track in playlist; strikethrough text.

---

## 10. CSS Guidelines (`css/style.css`)

### Specificity
- Avoid deep nested selectors (max 3 levels: `.class > .child > .grandchild`).
- Never use `!important` unless absolutely unavoidable.
- Use BEM naming convention: `.player__track`, `.player__track--playing`.

### GPU Performance
- Do NOT use `will-change: transform` or `transform: translateZ(0)` on non-animated elements.
- Only promote layers that animate or scroll: virtual scroller and lyrics drawer.
- Remove `will-change` from static content to prevent compositor memory waste.

### Layout Shift Prevention
- All major sections must have fixed or constrained dimensions.
- Skeleton loaders should match final content dimensions exactly.
- Never replace small placeholder text with larger real content; use fixed-height boxes.

---

## 11. Mobile-Specific Considerations

### Lock Screen on Android
- Track metadata, artwork, and playback state updates must happen before playback starts.
- Ensure media session is properly configured or lock screen controls won't appear.
- Test on actual device or emulator; Chrome DevTools simulation is incomplete.

### Battery & Thermal
- Minimize wake locks; avoid `requestAnimationFrame` loops when app is hidden (`document.hidden = true`).
- Stop animation loops and clear `setInterval`/`setTimeout` when app is backgrounded.
- Use `visibilitychange` event to pause animations and defer heavy work.

### Touch & Gestures
- Avoid hover states on mobile; use active (`:active`) and focus (`:focus`) states.
- Ensure buttons have clear visual feedback (color change, scale).
- Use `touch-action: manipulation` on interactive elements to prevent double-tap delays.

---

## 12. Testing Checklist

### Before Committing
- [ ] Keyboard shortcuts work on desktop (Space, ↑/↓, L, etc.)
- [ ] Virtual scroller scrolls smoothly at 60fps (use DevTools Rendering > FPS meter)
- [ ] Lyrics auto-scroll and stay centered during playback
- [ ] Lock screen shows correct track metadata (test on mobile device)
- [ ] Seek bar works; clicking/dragging updates playback position
- [ ] Volume slider responds to input (desktop)
- [ ] Shuffle/repeat buttons toggle states visually
- [ ] Playlists switch without audio glitches
- [ ] Offline mode works; cached tracks play without network
- [ ] No console errors in DevTools

### Mobile Testing
- [ ] Layout is responsive at 375px, 768px, and 1920px
- [ ] Touch targets are at least 44px × 44px
- [ ] Swipe gestures (next/prev, open lyrics) work smoothly
- [ ] No unwanted zoom-on-tap or double-tap delays
- [ ] Lock screen shows media controls with correct artwork
- [ ] App works with device orientation changes (portrait ↔ landscape)

---

## 13. Common Pitfalls & Solutions

### Problem: Seek Bar Jumps Erratically
**Cause**: Reading virtual `this.currentTime` instead of physical `this.active.currentTime`.  
**Fix**: Always read `audioElement.currentTime` directly from the DOM; never cache it.

### Problem: Audio Leaks When Skipping
**Cause**: Not pausing or resetting playback before switching tracks.  
**Fix**: Call `audio.pause()` and `audio.currentTime = 0` before starting a new track fetch.

### Problem: Lyrics Don't Sync
**Cause**: Timestamp parsing is off, or requestAnimationFrame is not being called continuously.  
**Fix**: Debug by logging parsed timestamps; ensure `updateLyrics()` runs on every playback tick.

### Problem: Virtual Scroller Stutters on Scroll
**Cause**: DOM mutations or layout calculations inside scroll event handler.  
**Fix**: Batch all DOM updates inside a single `requestAnimationFrame` call after scroll ends.

### Problem: Lock Screen Notification Disappears
**Cause**: Calling `audio.pause()` or setting `muted = true` on mobile.  
**Fix**: Use Web Audio `GainNode` for silence instead; keep `<audio>` playing and `muted = false`.

---

## 14. Frontend Code Example: Track Switching

```javascript
// BAD: Direct mutation causes audio leaks and state thrashing
function switchTrack(newTrack) {
  audio.src = newTrack.url;  // ❌ Triggers emptied event on mobile
  audio.play();
}

// GOOD: Proper state reset before buffering
async function switchTrack(newTrack) {
  // 1. Silence the old track immediately
  gainNode.gain.value = 0;
  
  // 2. Pause and reset playback position
  audio.pause();
  audio.currentTime = 0;
  
  // 3. Update UI state
  updatePlaylistHighlight(newTrack.id);
  
  // 4. Update lock screen metadata
  updateMediaSessionMetadata(newTrack);
  clearMediaSessionPosition(); // setPositionState(null)
  
  // 5. Fetch and buffer audio
  const buffer = await fetchAudioBuffer(newTrack.url);
  await appendToSourceBuffer(buffer);
  
  // 6. Resume playback
  gainNode.gain.value = 1.0;
  audio.play();
}
```

---

## 15. Frontend Coding Standards

### Variable Naming
- Use camelCase for variables and functions: `currentTrackId`, `fetchPlaylist()`
- Use UPPER_CASE for constants: `ITEM_HEIGHT = 48`, `MAX_QUEUE_SIZE = 5000`
- Use prefixes for private methods: `_updateBuffer()`, `_syncScrollPosition()`

### Comments
- Comment the *why*, not the *what*. The code already shows what it does.
- Example good comment: `// Reset currentTime before SourceBuffer append to prevent decoder artifact`
- Example bad comment: `// Set the current time to 0` (obvious from code)

### Error Messages
- Make error messages actionable and user-friendly.
- Include context: `"Failed to load 'Song Title' (Network timeout)"`
- Avoid internal jargon: ❌ `MSE appendError`, ✅ `Couldn't load this track`

---

## 16. Documentation & Comments

- **Frontend-only docs**: This file covers user features, UI, and frontend code patterns only.
- **No backend infrastructure here**: GCP, Hugging Face, ngrok, Cloudflare, and deployment logic belong in separate backend documentation.
- **Update docs when**: Adding new keyboard shortcuts, changing UI components, or introducing new playback modes.
