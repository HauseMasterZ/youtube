# Standing Project Rules & Directives

## 1. Permanent Rule Persistence Directive (Mandatory Meta-Rule)
- Whenever the user specifies any instruction, rule, architectural constraint, invariant, or process workflow, Antigravity MUST immediately record and persist it in `GEMINI.md` across relevant workspaces.
- Antigravity must never rely solely on ephemeral conversation memory, which is subject to context truncation and compression.
- Before executing any task, Antigravity must read, respect, and enforce all rules in `GEMINI.md` unconditionally.

## 2. Mandatory DeepSeek Consultation & Debate (opencode/deepseek-v4.1-flash-free)
- On EVERY prompt involving architectural audits, bug investigations, design choices, root cause analysis, or verification, Antigravity MUST consult and debate with DeepSeek Flash 4.1 Free in opencode first before proposing solutions or writing code.
- Working Directory & Context Preservation:
  - ALWAYS run opencode directly in the project root directory (`C:\Users\HauseMaster\Documents\Code\PiYT\youtube`).
  - ALWAYS pass the `-c` (`--continue`) flag so opencode retains and accumulates conversational context across every single invocation.
  - Model identifier: `opencode/deepseek-v4.1-flash-free`.
- Invocation command pattern:
  ```bash
  python -c "import sys, subprocess; sys.stdout.reconfigure(encoding='utf-8'); cmd = [r'C:\Users\HauseMaster\AppData\Local\Microsoft\WinGet\Packages\SST.opencode_Microsoft.Winget.Source_8wekyb3d8bbwe\opencode.exe', 'run', '-c', '-m', 'opencode/deepseek-v4.1-flash-free', '<prompt>']; p = subprocess.Popen(cmd, cwd=r'C:\Users\HauseMaster\Documents\Code\PiYT\youtube', stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8'); out, err = p.communicate(timeout=180); print(out)"
  ```
  *(Note: Passing `stdin=subprocess.DEVNULL` and `sys.stdout.reconfigure(encoding='utf-8')` ensures non-blocking automated execution and UTF-8 output handling on Windows).*
- Antigravity must apply critical thinking to DeepSeek's responses and debate back and forth if necessary, combining the cognitive throughput of both agents.
- Antigravity must NEVER substitute its own unverified assumptions for a rigorous architectural consultation with DeepSeek.

## 3. 1:1 Exact YouTube Playlist Ordering Invariant
- The track order in `_Playlist_Database.json` and `_Playlist_Order.m3u8` MUST be 1:1 identical to the YouTube playlist order at all times.
- Newly synchronized tracks must NEVER be appended to the end if they are positioned elsewhere on YouTube.
- The system must use authoritative full-vector Compare-And-Swap (CAS), never point-in-time incremental positional mutation.

## 4. Audio Quality & Download Integrity
- Audio streams must be original Opus Format 251 (or 140 AAC if 251 is unavailable). Zero re-encoding.
- Reject formats 18, 599, 600, or low-bitrate fallbacks (<90 kbps).
- Strictly stream from downloaded assets stored in remote asset storage; never stream directly from YouTube or third-party web scrapers during playback.

## 5. Development & Deployment Workflow
- Always develop, commit, and test on the `dev` branch first.
- Push to `origin/dev`, wait for CI/CD GitHub Actions to complete successfully.
- Merge to `main`, push to `origin/main`, and empirically verify live deployment at `https://music.hausemaster.tech`.
- Never commit broken code, skip tests, or merge to main without verification.

## 6. Frontend Audio Engine & Dual Playback Modes
- Desktop: 0.0% GPU load. Native `<audio>.volume` exclusively. Never connect `<audio>` to `AudioContext.createMediaElementSource()`.
- Mobile: Permanent Media Source Extensions (MSE) `<audio>.src` attached once on startup via `URL.createObjectURL(mediaSource)`. Never reassign `audio.src` to avoid `AudioTrack` deallocation and notification destruction.
- Mode 1: Standard battery saver mode. Declares honest `'paused'` state (rate 1.0) when paused.
- Mode 2: Car & Bluetooth keepalive. Uses silent audio anchor oscillator to keep DACs awake and micro-rate `0.00001` with `playbackState = 'playing'` when paused to freeze seekbar while pinning notification.
- Zero Audio Leak: Immediate synchronous pause during Mode 2 -> Mode 1 switch; zero audio frames leaked.

## 7. Security, Secrets & Dataset Write Invariants
- Never hardcode API keys, tokens, or credentials in client-side code or public repositories.
- Upstream storage details and backend infrastructure must remain unexposed to client-side HTML/JS.
- Rule 7a (Playlist Membership Invariant): External write triggers for new track additions or membership mutations strictly require verified YouTube playlist changes.
- Rule 7b (Catalogue Self-Healing Protocol): Autonomous daily downtime self-healing (02:00 to 09:00 IST / 22:00 UTC) by backend synchronization is authorized to detect and repair broken audio, playlist order divergence, missing synchronized .lrc lyrics, missing square .webp thumbnails, and default dominant colors, preserving 1:1 catalogue fidelity without altering playlist membership.

## 8. Empirical Verification Before Completion
- Be empirical, tenacious, and verify actual changes before claiming fixes.
- Run automated tests (`python -m unittest discover -s tests -p "test_*.py"`).
- Run syntax checks (`node --check ...`).
- Empirically verify live production endpoints and headers.

## 9. Strict Zero-Emoji Policy
- Strictly ZERO emojis in code, comments, commit messages, tests, documentation, and assistant responses.

## 10. Android SystemUI & HyperOS Media Session Stability Baseline (Commit 05eae74)
- Permanent Baseline Lock: The media session engine is permanently locked to verified baseline commit `05eae74` (`fix(mediasession): guard metadata rebind on unlock and mode switch to prevent wave freeze and animation leaks`).
- Root Cause of Permanent Wave Freeze:
  - In Android 13+ and Xiaomi HyperOS (`SquigglyProgress.kt`), re-assigning `navigator.mediaSession.metadata` triggers `MediaDataManager` and `MediaControlPanel.bindPlayer()`.
  - This completely destroys the `SquigglyProgress` view and launches an 860ms `heightAnimator` expansion (`0.0f -> 1.0f`).
  - Re-triggering metadata rebinds on screen unlock or inside periodic timers cancels `heightAnimator` repeatedly, permanently locking `heightFraction = 0.0f` (flat frozen line).
- The Zero Metadata Churn Invariant:
  - `republishMediaMetadata()` MUST strictly be gated behind `shouldRepublishMetadata()`.
  - When track metadata is already fresh and identical, `navigator.mediaSession.metadata` must NEVER be re-assigned on foreground, on screen wake, or inside `timeupdate`.
  - Only genuine track ID changes or recovered destroyed sessions may set metadata.
- Homescreen ~1.1s Self-Healing Latency:
  - Direct fingerprint unlock to the launcher homescreen (`com.miui.home`) leaves `document.hidden = true` (visibilitychange does not fire).
  - The background `timeupdate` handler detects `staleGap` (`Date.now() - getLastPositionTimestamp() > 3000ms`).
  - On the first post-wake tick (~1.0s to 1.1s), `main.js` sets `window._forceNextPosition = true` and dispatches `updateMediaSessionPosition(ct, audioPlayer.duration, audioPlayer.playbackRate || 1)`.
  - Android SystemUI receives the fresh anchor, updates its interpolator, and resumes wave animation cleanly within ~1.1s.
- Prohibition of Synthetic State Flapping:
  - Strictly FORBIDDEN to introduce artificial playbackState pulses (such as `hiddenPlayingPulse`), synthetic pause/play toggles, or fake lock-gap metadata rebinds.
  - Previous churn cycles proved that synthetic pulsing risks audio pops, Bluetooth AVRCP hiccups, and state desync. The ~1.1s natural clock tick recovery is the intentional, verified, permanent design.
- Documented Nuances of Baseline 05eae74:
  1. ~1.1s Initial Homescreen Freeze: Normal, expected, self-healing behavior before first background clock tick.
  2. Mode 1 Paused Settle Ripple: On specific aggressive OEM skins (e.g. OneUI/ColorOS), `settleMode1Paused` passes (200ms, 700ms, 1500ms) with `rate: 1.0` can cause a brief ~0.5s ripple before resting flat. Does not affect active playback.
  3. Rapid Unlock Cycling: Rapid repeated power button pressing within <1000ms triggers resync passes without cooldown throttling.

## 11. Dual Unlock Recovery & Monotonic Position Guards
- In-App Instant Wave Resume: When unlocked directly into the app, `visibilitychange` fires and `resyncMediaSessionOnForeground` executes immediately:
  1. Synchronously dispatches `updateMediaSessionPosition(..., force=true)` with `window._forceNextPosition = true`.
  2. Schedules a 250ms follower pass to guarantee SystemUI receives the position post wake-up jitter.
  3. Resumes wave animation instantly.
- Monotonic Position Guards:
  1. Live playback drops backwards jumps (>0.5s within 3000ms), identical rewrites (<0.25s within 1500ms), and wild forward jumps (>3.0s within 1500ms).
  2. Bypassed strictly when `force === true` or `window._forceNextPosition === true` for genuine seeks, unlocks, and mode transitions.
- Mode 2 Paused Micro-Rate Spoof:
  1. Mode 2 paused strictly uses micro-rate `0.00001` with `playbackState = 'playing'` to freeze notification seekbar while keeping the card pinned on mobile.
  2. Mode 1 paused strictly uses rate `1.0` with `playbackState = 'paused'`.
- Post-Call Media Card Resurrection Invariant:
  1. When an active call ends (in Mode 1 or Mode 2), Android SystemUI may have evicted or stripped the inactive notification card during the call.
  2. Because Chromium C++ deduplicates identical metadata (`if (metadata_ == metadata) return;`), calling `republishMediaMetadata()` with identical fields sends zero Mojo IPC to Android.
  3. The post-call resume branch explicitly calls `republishMediaMetadata(true)`, which resets `navigator.mediaSession.metadata = null` before re-publishing.
  4. This busts Chromium's dedup cache, forces `OnMediaSessionMetadataChanged` Mojo IPC, and reliably resurrects the MediaNotification card in Android SystemUI without causing continuous churn during normal playback.

## 12. Absolute Prohibition of Git Write Operations
- Under NO circumstances may Antigravity execute any Git write operation (including git commit, git push, git checkout -b, git branch, git merge, git rebase, git tag, or git reset against remote).
- Git operations are strictly read-only (status, diff, log).

## 13. Frontend Codebase Architectural Decoupling Invariant
- The entire codebase of the frontend repository must strictly NOT contain any architectural information, implementation details, credentials, or explicit naming regarding backend infrastructure, cloud servers, storage repositories, edge devices, or third-party backend instances anywhere.
- All client-side communication must operate through generic API gateway and asset abstractions.

## 14. Real-Time End-to-End Latency Contract (< 38s)
- The overall ingestion pipeline from YouTube playlist track addition to frontend reflection is engineered and verified to complete in under 38.0 seconds (empirically achieved ~23.4s - 24.8s).
- Frontend database loading supports atomic chunked streaming and cache-busted revalidation (`_Playlist_Database.json?t=...`), picking up new additions without requiring a hard PWA reload.

## 15. Resilient Multi-Tier Database Offline Caching Architecture
- Dedicated Persistent Cache Storage (`DB_CACHE = 'yt-player-databases'`):
  - Service worker `activate` cache cleanup explicitly preserves `DB_CACHE` alongside `CACHE_NAME`, `yt-player-media`, and `THUMBS_CACHE`.
  - Service worker cache version bumps (`CACHE_NAME = 'yt-player-cache-v...'`) must never purge or invalidate cached playlist databases.
- Dual-Tier Persistent Client Storage:
  - Client employs Cache API (`yt-player-databases`) coupled with an IndexedDB mirror (`yt-player-offline-db`, object store `playlists`).
  - If Cache API is evicted or unavailable, IndexedDB serves as an independent persistent backstop.
  - All database writes are committed to both storage layers in lockstep (`storePlaylistDatabaseInAllCaches`).
- Strict Network Timeout Race (6.0s - 6.5s):
  - Spotty cellular networks, dead zones, or captive portals can cause fetch requests to hang indefinitely.
  - Network requests for `_Playlist_Database.json` in both `sw.js` and `playback.js` race against an `AbortController` / Promise timeout (6000ms - 6500ms).
  - On timeout or network failure, playback and SW instantly fall back to cached data without user-facing hang or blank screen.
- Startup Pre-Seeding (`seedOfflineDatabases`):
  - During application boot, `seedOfflineDatabases()` queries IndexedDB and Cache API to pre-populate in-memory `allDatabases`.
  - Ensures instant playlist switching, global search filtering, and cross-shuffle queue generation function immediately offline before any network interaction.
- Actionable Offline Empty State:
  - If an uncached playlist is loaded in offline conditions or upon network timeout, the UI displays an actionable empty state (`showOfflinePlaylistEmptyState`) with a retry button instead of hanging on an indefinite loading screen.
- Staged Last Played Track Offline Invariant:
  - Cold-booting or restarting in full offline state cleanly restores the last played track in paused standby via dual-tier storage (localStorage + IndexedDB mirror) and reconciles against offline cached databases without reset.
- Safe Queue Bounds & Chunked Reconciliation:
  - `generateQueue` bounds-checks `playQueue[queueIndex]` and resolves against `window._stagedLastPlayedTrack.trackId` or `globalActiveOriginalIndex`, guaranteeing staged tracks beyond chunk boundaries (e.g. index > 60) do not reset `queueIndex` to 0.
  - `applyNormalizedDataInChunks` re-reconciles by track ID upon full normalization completion.
- Eager Local Paint & Cache/IDB Mirror Sync:
  - `loadPlaylist` renders local cached data immediately while network fetch revalidates in the background without blocking UI.
  - If Cache API experiences a miss or eviction, IndexedDB hits asynchronously re-seed `DB_CACHE` (`yt-player-databases`) to maintain multi-tier cache coherence.

## 16. Scoped Mobile Playlist Swipe Gesture Invariant
- Scoped Touch Target: Mobile horizontal swipe gesture for switching playlists (`Gym` <-> `Driving` <-> `Songs`) is strictly scoped to `playlistSelectContainer` (`#playlist-select-container` / `#playlist-select`).
- Track List Isolation: The track list container (`#playlist-container`, `#track-list`, `li`), fast-scroller, and search input must NEVER listen to or trigger playlist swipe switching. Diagonal or horizontal drift during vertical playlist track browsing must never switch playlists.
- Defense-in-Depth Event Filtering: Listeners are bound directly to `playlistSelectContainer` with guards filtering out `#btn-download-playlist`, `input`, and track elements.
- Interaction Invariants:
  - Thresholds: $|\Delta x| \ge 40\text{px}$, $|\Delta x| > |\Delta y| \times 1.2$, elapsed time $< 600\text{ms}$, and viewport width $\le 800\text{px}$.
  - Passive event listeners (`passive: true`) without `preventDefault` to preserve instant native `<select>` dropdown picker opening on tap.
  - Clears and unfocuses search input (`searchInput.blur()`) on playlist switch.

## 17. Mobile Mode 1 Bluetooth AVRCP Pause Invariant
- Honest State Separation: Unlike Mode 2 which deliberately spoofs `playbackState = 'playing'` to pin notification cards, Mode 1 declares honest `playbackState = 'paused'` (rate 1.0) when paused.
- Unconditional Pause on `pause` Action: In `navigator.mediaSession.setActionHandler('pause')`, the Mode 1 branch must strictly and unconditionally pause (`window.wasPausedByUser = true`, `setPlayUI(false)`, `playbackState = 'paused'`, `instantPause()`).
- Prohibition of Toggle Play in Pause Handler: It is strictly forbidden to evaluate `isActuallyPaused` and call `audioPlayer.play()` within the Mode 1 `pause` action handler. When mobile Chromium or Android AudioManager pre-pauses the `<audio>` element on receiving AVRCP PAUSE, treating `audio.paused === true` as a signal to resume defeats the pause action.
- Idempotent Bounce Safety: Duplicate AVRCP pause events (press/release bounces) safely remain paused. Resuming from Bluetooth in Mode 1 is handled exclusively by `setActionHandler('play', handlePlayAction)`.
- Playpause Debounce: `setActionHandler('playpause')` enforces a 300ms cooldown timestamp to eliminate single-button headset toggle flutters.

## 18. Hold-to-Queue Selection Suppression Invariant (Zero CSS Changes)
- Zero CSS Selection Tampering: Text selection must never be disabled via CSS stylesheets (`user-select: none` / `-webkit-user-select: none` on `#track-list` or `li` is strictly forbidden). Desktop users must retain full native mouse selection and clipboard copying of song titles and artists.
- Dynamic `selectstart` Interception: While a pointer hold is active (`holdTimer` or `suppressNextClick`), `trackList.addEventListener("selectstart")` cancels the event via `e.preventDefault()`, stopping mobile browser selection handles and floating copy toolbars before they can spawn.
- Selection Range Purging: When `holdTimer` fires (450ms) and on `pointerup`, `window.getSelection()?.removeAllRanges()` purges any residual selection ranges.
- Event Deduplication: `contextmenu` only enqueues if `!suppressNextClick`, preventing double-queuing when long-press fires both the timer and native `contextmenu`. Non-primary mouse buttons (`e.button !== 0`) are ignored on `pointerdown` so desktop right-click passes directly to `contextmenu`.

## 19. Desktop Playlist Middle-Click Autoscroll Invariant
- Native Autoscroll Integrity: On desktop operating systems and browsers (Windows Chromium, Firefox, Edge), middle-clicking (`e.button === 1` / mouse wheel click) within the playlist container (`#playlist-container`) must reliably initiate the browser's native vertical autoscroll engine without being intercepted or canceled.
- Non-Primary Button Filtering on Fast Scroller: `fastScroller.addEventListener("pointerdown")` must strictly ignore non-primary mouse buttons (`if (e.button !== 0) return;`). Middle-clicks and right-clicks must NEVER trigger `preventDefault()`, pointer capture, or fast-scrolling activation.
- Desktop Pointer Pass-Through for Fast Scroller: Under desktop media queries (`@media (hover: hover) and (pointer: fine)`), `.fast-scroller` must be assigned `pointer-events: none;` so that mouse clicks near the right boundary pass directly to `#playlist-container`, while mobile touch devices retain touch edge scrolling.
- Focus Shift Quarantine during PointerDown: Event handlers listening for `pointerdown` on `#playlist-container` (such as `blurPlaylistSelectIfActive`) must ignore non-primary mouse buttons (`if (e && e.button !== 0) return;`) to prevent focus shifting during middle-click, which cancels Chromium's pending autoscroll gesture.
- Strict Vertical Axis Lock: `#playlist-container` must specify `overflow-x: hidden;` alongside `overflow-y: auto;` to lock browser autoscroll strictly to the vertical axis, preventing 4-way omnidirectional autoscroll drift.

## 20. Resilient Update Site Engine & Cloudflare Invalidation Invariant
- Universal Availability & Unified Refresh: An "Update Site" button (`#btn-modal-update`) is accessible in the mobile settings modal under "App Actions", as well as via desktop playlist dropdown (`UPDATE_SITE`). This action unifies both site updates and playlist database revalidation: it concurrently refreshes all playlist databases and fetches the latest Cloudflare origin updates, retiring the redundant separate "Reload Playlists" button.
- Clean Text Presentation: `#btn-modal-update` uses clean text presentation (`#text-modal-update`) without circular sync icons, maintaining visual parity with other action buttons while utilizing CSS state classes (`.updating`, `.success`, `.error`) for user feedback.
- Standalone PWA Resiliency: In installed mobile PWAs (where browser URL bars and reload controls are absent), clicking "Update Site" reliably pulls the latest Cloudflare release and refreshes the application shell without requiring app uninstallation or device restart.
- Unconditional Latest Version Fetch: The update site logic strictly avoids checking or diffing current version tags or HTML probes. It unconditionally fetches and applies the latest version from Cloudflare irrespective of whether the current client is latest or not.
- Cache-Busted Navigation & Origin Invalidation:
  - Updates Service Worker via `swRegistration.update()`.
  - Sends `{ type: 'SKIP_WAITING' }` to waiting/installing workers.
  - Purges static app shell caches (`key.startsWith('yt-player-cache')`) while strictly preserving user assets: `yt-player-media` (downloaded audio), `yt-player-thumbs` (cached album art), and `yt-player-databases` (playlist databases).
  - Posts `{ type: 'PURGE_STATIC_CACHE' }` to the active Service Worker controller to re-fetch `CORE_ASSETS` with `cache: 'reload'`.
  - Triggers cache-busted reload with URL parameter `?v=${Date.now()}` via `window.location.replace()`.
  - Service Worker navigation fallback detects `?v=` to bypass cache and execute network-first document fetch from Cloudflare.
  - `DOMContentLoaded` automatically cleanses the `v` parameter from the address bar via `window.history.replaceState`.
- Playback & State Integrity: Synchronously flushes `flushLastPlayedState()` / `saveLastPlayedState()` to IndexedDB and localStorage before triggering reload, guaranteeing current song playback position and active queue survive reload seamlessly.
- Offline Defense & State Feedback:
  - If triggered while offline (`navigator.onLine === false`), gracefully halts and displays "Offline - cannot update" without crashing, clearing caches, or reloading.
  - Button transitions through explicit visual states: "Updating site..." -> "Applying update..." -> "Reloading...".
  - Debounce guards and 10-second safety fallback timer guarantee the UI never deadlocks or hangs.

## 21. Ultra-Resilient Last Played Track Restoration Invariant
- Song ID Only: Last played state strictly persists only the track identifier (`trackId`), playlist (`playlist`), and mode configuration (`shuffleMode`, `repeatMode`). It must NEVER persist or restore seekbar position (`currentTime` is unconditionally clamped/saved as `0`).
- Always Reset to 0:00: Upon restoring the last played track during startup or reload, the playhead, seekbar, time display, and audio element must always reset to `0:00`.
- Zero-PendingSeek Startup Invariant: Restoring the last played track in standby (`uiOnly === true` / `preventAutoplay === true`) must NEVER arm `_pendingSeek` with a non-zero position. `_pendingSeek` must remain `null`, and `audioPlayer.currentTime` must be `0`.
- Authoritative Cache & Anti-Downgrade Invariant: Cached audio in `yt-player-media` with HTTP 200 or `X-Partial-Cached: 'false'` must be treated as complete. Never downgrade a complete cache entry to partial based on bitrate heuristics or duration drift.
- Unswallowed Play Invariant: `audioPlayer.play()` must never silently swallow play intent when `_pendingSeek` exists. If `_pendingSeek` is set, `play()` must resolve or clamp the seek to available buffered bounds and execute `this.active.play()` immediately. `audioPlayer.paused` must honestly reflect `active.paused` and `wasPausedByUser`, never returning false simply because a seek is pending.

## 22. Monotonic Non-Flickering Buffer Progress Invariant
- Monotonic Latching on Completion: `updateBufferProgress()` in `js/ui.js` must evaluate `isComplete = (audioPlayer && audioPlayer._streamDone) || false` at the very beginning of the routine prior to any empty-buffer or switching guards. When `isComplete` is true, it immediately latches to full 100% width and returns without clearing the container.
- Anti-Blink Transient Guard: During MSE `mediaSource.endOfStream()` settlement, demuxer re-evaluation, or `durationchange` / `canplay` events, transient empty buffer ranges (`buffered.length === 0`) or transport switching flags (`audioPlayer.switching === true`) must NEVER wipe previously rendered buffer segments for the active track.
- URL-Scoped Reset Invariant: `updateBufferProgress()` tracks `lastBufferUrl`. Container clearing only occurs when `currentUrl !== lastBufferUrl` (a genuine track change). In `js/dom.js`, `switchTrack()` must strictly guard clearing `buffer-container` and resetting `_streamDone` behind `isDifferentUrl = (this._currentUrl !== (url || ''))` so that same-track recovery or re-entry preserves the rendered buffer bar seamlessly.
- Instant Fast-Path Progress Dispatch: In `js/dom.js`, upon resolving a complete cached track via fast-path (`!isPartial`), `this.dispatchEvent(new Event('progress'))` must be fired immediately when `this._streamDone = true` so the buffer bar latches to 100% in 0ms without waiting for downstream playback events.

## 23. Desktop vs. Mobile Settings & Action Surfaces Invariant
- Settings Modal is Strictly Mobile-Only: The Settings modal (`#settings-modal`, accessed via `<option value="__settings__">Settings</option>`) is strictly mobile-only. Mobile devices require this modal to toggle Playback Engine modes (Mode 1 / Mode 2 Car & Bluetooth mode), Bluetooth inactivity auto-kill timeouts, and offline download shuffling.
- Desktop Strictly Excludes Settings Option: Desktop operating systems and browsers use native HTML5 Audio (0.0% GPU load) and do not use mobile background keep-alive anchors or auto-kill timeouts. `#playlist-select` on desktop must NEVER include `<option value="__settings__">Settings</option>`.
- Desktop Dropdown Direct Actions: On desktop, app actions must be exposed directly as top-level options within `#playlist-select`: `<option value="UPDATE_SITE">Update Site</option>` and `<option value="INSTALL_APP">Install App</option>`. The redundant separate `HARD_RELOAD` option is unified into `UPDATE_SITE` (with `HARD_RELOAD` supported as an alias for backward compatibility).
- Strict Device Branching in updatePlaylistSelectOptions: In `js/main.js`, `updatePlaylistSelectOptions()` must enforce:
  - Mobile: `${playlistOptions}<option value="__settings__">Settings</option>`
  - Desktop: `${playlistOptions}<option value="UPDATE_SITE">Update Site</option><option value="INSTALL_APP">Install App</option>`
  Any modification attempting to inject `__settings__` or `HARD_RELOAD` into the desktop branch is a strict regression.

