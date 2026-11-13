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
- Push to `origin/dev`: GitHub Actions automatically builds and deploys the staging distribution directly to `https://music.hausemaster.tech/dev/` and GitHub Pages `/dev/`.
- Verify the staged release live at `https://music.hausemaster.tech/dev/`.
- Merge to `main`, push to `origin/main`, and empirically verify live production deployment at `https://music.hausemaster.tech`.
- Never commit broken code, skip tests, or merge to main without verification.

## 6. Frontend Audio Engine & Dual Playback Modes
- Desktop: 0.0% GPU load. Native `<audio>.volume` exclusively. Never connect `<audio>` to `AudioContext.createMediaElementSource()`.
- Mobile: Permanent Media Source Extensions (MSE) `<audio>.src` attached once on startup via `URL.createObjectURL(mediaSource)`. Never reassign `audio.src` to avoid `AudioTrack` deallocation and notification destruction.
- Mode 1: Standard battery saver mode. Declares honest `'paused'` state (rate 1.0) when paused.
- Mode 2: Car & Bluetooth keepalive. Uses silent audio anchor oscillator to keep DACs awake and micro-rate `0.00001` with `playbackState = 'playing'` when paused to freeze seekbar while pinning notification.
- Anchor Handover & Background Notification Persistence Invariant: When pausing playback in Mode 2, `startLiveAudioAnchor()` must be synchronously invoked before pausing `<audio>` across all pause call sites (`instantPause`, `pause`, event listeners) to eliminate any transient zero-player gap. On `visibilitychange` transitioning to hidden, `startLiveAudioAnchor()`, `startFocusProbe()`, and `armAutoKillWatchdog()` must be enforced. In Mode 1 (honest paused state), Android OS / Chromium terminates the non-foreground service on `Activity.onStop()` by platform design (`shouldBeForeground() == false`); notification persistence while paused across backgrounding is exclusively guaranteed via Mode 2 keepalive.
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

## 9. Strict Zero-Emoji Policy & Minimalist Targeted Output Directive
- Strictly ZERO emojis in code, comments, commit messages, tests, documentation, and assistant responses.
- Output text must be strictly limited to the minimum: strip out all preamble, pleasantries, meta-commentary, and conversational filler. Focus strictly and exclusively on targeted, actionable output text.

## 10. Android SystemUI & HyperOS Media Session Stability & Non-Stripping Protocol
- Permanent Baseline Lock: The media session engine is permanently locked against artificial state flapping and synthetic pulses.
- Absolute Prohibition of Synthetic Pause Pulses:
  - Rapid pulses (<150ms) are coalesced/dropped by Android system_server (MediaSessionRecord via Handler.removeMessages) during lockscreen/Keyguard exit contention, leaving SquigglyProgress permanently frozen while causing an audible/visual brief pause stutter.
  - Strictly FORBIDDEN to introduce artificial playbackState pulses (such as `hiddenPlayingPulse`, 75ms timeouts, or synthetic pause/play toggles).
  - Forensic commit archaeology across `9a084a6`, `90d4ae5`, `631485d`, and `ee1acea` proved that rapid 75ms pulses are coalesced/dropped by Android `system_server` (`MediaSessionRecord` via `Handler.removeMessages`) during lockscreen/Keyguard exit contention, leaving `SquigglyProgress` permanently frozen while causing an audible/visual brief pause stutter.
  - Background playback strictly maintains honest unthrottled position state (`playbackState = 'playing'`) at the natural 1Hz cadence.
- Lock-Gap Self-Healing Protocol:
  - When unlocking directly to the launcher homescreen (`com.miui.home`), `document.hidden` remains `true` (no `visibilitychange`).
  - Background `timeupdate` detects `staleGap` (`Date.now() - window.getLastPositionTimestamp() > 3000ms`).
  - On wake tick, `main.js` sets `window._forceNextPosition = true` and pushes `updateMediaSessionPosition(ct, audioPlayer.duration, audioPlayer.playbackRate || 1)` without metadata rebind and without state flapping.
- Zero Metadata Churn Invariant:
  - `republishMediaMetadata()` MUST strictly be gated behind `shouldRepublishMetadata()`.
  - When track metadata is already fresh and identical, `navigator.mediaSession.metadata` must NEVER be re-assigned on foreground, on screen wake, or inside `timeupdate`.
- External Media Interruption Non-Stripping Protocol:
  - In Mode 1 (and during Bluetooth disconnects or telephone calls): When an external app takes audio focus (`audioPlayer.paused && !window.wasPausedByUser`), state is set honestly to `'paused'` with rate `1.0`. Strictly FORBIDDEN to call `startLiveAudioAnchor()` or schedule `reassertSpoofBurst()` / `startAnchorHeartbeat()` in Mode 1. Android SystemUI retains the media card with an honest Play button in the notification shade, enabling 1-tap playback resumption via `handlePlayAction()`.
  - In Mode 2: MediaSession strictly applies Rule 33 keepalive defense until explicit user stop. Chromium Android tears down media notifications immediately if all audio streams pause and `playbackState = 'paused'` is declared. The silent live audio anchor and `playbackState = 'playing'` (at micro-rate `0.00001`) must be retained to defend against native OS card eviction.
  - Across all modes, `republishMediaMetadata()` MUST strictly remain gated behind `shouldRepublishMetadata()` to prevent metadata churn and notification animation blinks.
- Bluetooth Route Addition vs Audio Interruption Separation:
  - `navigator.mediaDevices.addEventListener('devicechange')` fires on audio output additions and removals. Web APIs have no Telecom or In-Call API.
  - Device additions (`newCount > knownOutputCount`) strictly represent audio route expansion (e.g. connecting Bluetooth headphones or earbuds).
  - Strictly FORBIDDEN to set `window.isCallActive = true` or pause playback on `newCount > knownOutputCount`. Latching call state blocks all subsequent MediaSession action handlers (`play`, `pause`, `playpause`). Route additions must only update `knownOutputCount = newCount`.
  - True phone call interruptions or external audio steals are signaled when the `<audio>` element fires `pause` with `!window.wasPausedByUser`.
  - Route loss (`newCount < knownOutputCount`, e.g. turning off Bluetooth) pauses honestly with rate 1.0, sets `window.wasPausedByUser = true`, and marks `lastBtDisconnectTime`.

## 11. Dual Unlock Recovery & Monotonic Position Guards
- In-App Instant Wave Resume: When unlocked directly into the app, `visibilitychange` fires and `resyncMediaSessionOnForeground` executes immediately:
  1. Synchronously dispatches `updateMediaSessionPosition(..., force=true)` with `window._forceNextPosition = true`.
  2. Schedules a 600ms follower pass (post Keyguard dismiss window) to guarantee SystemUI receives the position post wake-up jitter.
  3. Resumes wave animation instantly.
- Monotonic Position Guards:
  1. Live playback drops backwards jumps (>0.5s within 3000ms) and identical rewrites (<0.25s within 1500ms). Natural forward playback is unconditionally dispatched without forward jump clamping.
  2. Minimum Inter-Anchor Cadence: Live playback enforces an 850ms minimum interval (`elapsed < 850`) to prevent premature secondary position updates on wake/unlock ticks, eliminating double-resume and wave snapping artifacts.
  3. Monotonic Forward Clamping: Live playback clamps position so that any forced or asynchronous position update arriving within 1000ms cannot jump backwards from `_lastSentPosition` due to OS timer jitter, ensuring SystemUI's `computePosition` interpolator never experiences backward discontinuity.
  4. Bypassed strictly when `force === true` or `window._forceNextPosition === true` for genuine seeks, unlocks, and mode transitions.
  5. Continuous Projected Cadence: During continuous 1.0x live playback, position updates arriving within 1500ms that fall within normal timer / buffer jitter (+/-250ms) of SystemUI's projected position (`_lastSentPosition + elapsed * 0.001 * validRate`) are smoothly aligned to `projected`, eliminating wave phase snapping and seekbar thumb jumps.
  6. Foreground Resync Deduplication & Zero Churn: `resyncMediaSessionOnForeground` debounces wake/foreground triggers within 1500ms and cancels pending follower timeouts, preventing duplicate IPC bursts across `visibilitychange` and `pageshow`. Rebinding metadata (`republishMediaMetadata`) is strictly prohibited on unlock when metadata is healthy and unchanged, ensuring `navigator.mediaSession.metadata = null` is never dispatched to Android SystemUI and preventing double-resume wave reset artifacts.
- Mode 2 Paused Micro-Rate Spoof:
  1. Mode 2 paused strictly uses micro-rate `0.00001` with `playbackState = 'playing'` to freeze notification seekbar while keeping the card pinned on mobile.
  2. Mode 1 paused strictly uses rate `1.0` with `playbackState = 'paused'`.
  3. Mode 2 Pause Eviction Elimination: Pausing via media card action handlers (`pause`, `playpause`) or in-app UI synchronously freezes position at micro-rate 0.00001, republishes metadata, and invokes `startAnchorHeartbeat(0)` with zero delay while guarding `startFocusProbe()` with `!window.wasPausedByUser` and guarding active `anchorEl` against destructive pause cycling, preventing Chromium `normal_players_` drop to 0 and eliminating transient notification card eviction in Android SystemUI.
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
- Resilient Network Timeout Race (12000ms):
  - Spotty cellular networks, dead zones, captive portals, or smartwatch Bluetooth companion proxies can cause fetch requests to hang or experience high latency.
  - Network requests for `_Playlist_Database.json` in both `sw.js` and `playback.js` race against an `AbortController` / Promise timeout with 12000ms headroom for wearable/high-latency proxies.
  - Network retrieval in `playback.js` is never gated on `navigator.onLine !== false`, ensuring devices reporting false-negative connectivity flags still attempt network fetch before fallback.
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

## 18. Mobile Swipe Gestures & Text Selection Context Menu Invariant
- Zero CSS Selection Tampering: Text selection must never be disabled via CSS stylesheets (`user-select: none` / `-webkit-user-select: none` on `#track-list` or `li` is strictly forbidden). Users retain full native text selection and clipboard copying of song titles and artists on both mobile and desktop.
- Mobile Native Action Mode Preservation: On mobile devices (`isMobileDevice`), hold-to-queue is replaced by horizontal swipe gestures (swipe right to enqueue, swipe left to download single track). The `trackList` `contextmenu` handler returns immediately WITHOUT calling `e.preventDefault()`, ensuring mobile Chromium/WebKit `FloatingActionMode` overlay ("Copy", "Share", "Select All") appears reliably upon highlighting text.
- Desktop Selection Copy Preservation: On desktop right-click, if `window.getSelection().toString().trim().length > 0`, `trackList` returns immediately WITHOUT calling `e.preventDefault()`, preserving the native desktop context menu for copying text. Right-clicking without an active text selection continues to invoke `queuePlayNext()` and trigger enqueued flash.
- Selection Click Protection: `trackList` `click` handler checks `if (window.getSelection && window.getSelection().toString().trim().length > 0) return;`, ensuring highlighting text (by mouse drag or touch selection) does not accidentally trigger `playTrackSelection()` on click.


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
  - Preserves active build caches (`-main-`, `-dev-`) and permanent shell cache (`yt-player-shell-v1`) during purge, preventing blank or rate-limited error screens.
  - Service Worker defines and persists immutable `SHELL_CACHE` (`yt-player-shell-v1`) populated during install and activate, whitelisted from cache rotation.
  - Multi-tier navigation fallback in Service Worker intercepts all document requests, prioritizing versioned cache and `SHELL_CACHE` before network, and strictly quarantining Cloudflare Error 1015 (429 rate limit) with cached App Shell or synthetic 200 HTML fallback to guarantee zero error screen exposure.
  - Database retrieval and proxy network timeouts are set to 12000ms to ensure wearable companion devices (smartwatches over Bluetooth) reliably complete synchronization.
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
- Unswallowed Play Invariant: `audioPlayer.play()` must honor buffered availability when `_pendingSeek` exists. If `_pendingSeek` is within buffered bounds (`bEnd >= target - 0.5`), `play()` resolves the seek and begins playback immediately. If `_pendingSeek` is ahead of buffered bounds or buffer is empty, `play()` must never preemptively resume stale audio or start from 0:00; it must hold the element paused and preserve `_pendingSeek` until the ingestion stream buffers the target position.

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

## 24. Self-Learning Deterministic Protocol: Zero-Regression Anti-Churn Doctrine
- Rule 24a (Mandatory Pre-Fix Git Forensic Archaeology):
  - On EVERY bug report, regression investigation, or RCA request, Antigravity MUST execute git forensic tracing (`git log -S`, `git log -L`, `git show`) to pinpoint the EXACT commit hash, commit message, commit author, commit timestamp, and exact diff lines that introduced the defect.
  - Antigravity must explicitly present these commit IDs in the RCA before proposing or writing code. Hand-wavy, unanchored, or speculative RCAs are strictly prohibited.
- Rule 24b (Downstream Asynchronous Event Cascade & Timer Audit):
  - When modifying any audio engine or MediaSession state variable (`playbackState`, `_pendingSeek`, `wasPausedByUser`, `switching`, `isSeeking`), Antigravity MUST grep and audit ALL asynchronous timers (`setTimeout`, `setInterval`), event listeners (`pause`, `playing`, `ended`, `devicechange`, `statechange`), and helper routines that read or write that variable.
  - Setting a state variable synchronously without auditing and neutralizing conflicting delayed timers (e.g. `reassertSpoofBurst`, `startAnchorHeartbeat`, `settleMode1Paused`) is a catastrophic protocol violation.
- Rule 24c (Invariant Anchor Test Immunity):
  - Every architectural fix, platform quirk workaround, and state-machine transition MUST be permanently locked by an automated unit test with strict regex or structural assertions in `tests/test_*.py`.
  - Strictly FORBIDDEN to delete, weaken, comment out, or relax any existing test in `tests/test_*.py` during refactoring or churn. If code changes break a test, the code is wrong, not the test.
- Rule 24d (Amnesia Gutting Prevention & Non-Destructive Scoped Surgery):
  - Antigravity must NEVER perform wholesale function rewrites, blind simplification, or mass deletions of complex logic when resolving a bug.
  - Edits must be surgical, minimally invasive, and preserve all surrounding invariants, docstrings, and edge-case guards.
- Rule 24e (Immediate GEMINI.md Rule Synchronization):
  - When user directives, discovered failure modes, or verified platform baselines evolve, Antigravity MUST immediately synchronize `GEMINI.md` to reconcile any obsolete or conflicting rules, preserving an authoritative single source of truth across all sessions.
- Rule 24f (Zombie Test Audit & Obsolete Assertion Resolution):
  - When a bug fix or architectural correction breaks an existing unit test in `tests/test_*.py`, Antigravity MUST NOT automatically treat the test as authoritative if the test was asserting an obsolete or flawed platform workaround.
  - Antigravity MUST run git archaeology (`git log -S`, `git log -L`) to trace when and why the assertion was written.
  - If the test was asserting deprecated behavior that directly causes regressions (e.g. asserting `republishMediaMetadata()` on external focus loss, or asserting the presence of synthetic 75ms pulses), the test must be updated to lock the corrected invariant, rather than bending application code to preserve a known failure mode.

## 25. Android SystemUI SquigglyProgress & MediaControlPanel Invariants
- Immutable View Reuse Invariant:
  - On Android 13+ and Xiaomi HyperOS, unlocking directly to the launcher (`com.miui.home`) reuses the existing `MediaControlPanel` view without rebinding.
  - Screen-off cancels `SquigglyProgress.heightAnimator`, leaving `heightFraction = 0.0f` while `field = true`.
  - Calling `navigator.mediaSession.setPositionState()` updates seekbar duration and position progress, but does NOT trigger `PlaybackState` listeners and does NOT clear `field` or restart `heightAnimator`.
  - The squiggly wave resumes animating dynamically upon attended foreground (`visibilitychange`), notification shade expansion, or track transition.
  - Sub-second synthetic state flapping (`paused` -> 75ms -> `playing`) is strictly prohibited as it is coalesced by `system_server` and causes audio glitches.

## 26. Minimalist Targeted Output Directive (Zero Preamble)
- Assistant responses must strictly be kept to the absolute minimum.
- Strip out all conversational preamble, pleasantries, filler phrases, and boilerplate transitions.
- Focus exclusively and strictly on targeted output text and direct technical answers.

## 27. Cloudflare WAF Rate Limiting & Cache Quarantine Invariant
- Rate Limit Ceiling (WAF Rule 60s):
  - Cloudflare enforces rate limiting (>100 non-static requests per 10 seconds per IP, blocked for 10 seconds).
  - Bulk playlist media downloads must run sequentially with `CONCURRENCY = 1` and minimum 150ms delay between consecutive track requests.
- Circuit Breaker on HTTP 429:
  - Upon receiving HTTP 429, client download loops must halt immediately, set `window.cfBlockedUntil = Date.now() + 10000;`, display a rate-limit toast ("Rate limited by Cloudflare - retry in 10s"), and abort remaining queue processing.
- Strict HTTP 429 Cache Quarantine:
  - The Service Worker (`sw.js`) MUST NEVER cache HTTP 429 responses.
  - Quarantined across all cache tiers: `yt-player-media`, `THUMBS_CACHE`, `DB_CACHE` (`yt-player-databases`), and `lyrics/`.
  - Storing a Cloudflare 429 error body into CacheStorage corrupts assets and causes persistent media playback failures.

## 28. User-Pause State Integrity & Underrun Inversion Guard
- Synthetic Event Emission Suppression:
  - Synthetic `play` and `playing` events dispatched during chunk buffering or track loading in `DualAudioPingPong` must be strictly guarded behind `!this._preventAutoplay && !window.wasPausedByUser && !this.active.paused`.
  - Disagreeing synthetic dispatches while the user is paused flip MediaSession `playbackState` back to `'playing'` and corrupt notification card controls.
- Underrun-to-Resume Inversion Prohibition:
  - In Mode 2, `pause` and `playpause` action handlers must evaluate `if (isActuallyPaused && window.wasPausedByUser)` before executing resume.
  - During network stalls and buffer underruns, `audioPlayer.paused` is true while `window.wasPausedByUser` is false. Evaluating `audioPlayer.paused` alone inverts a pause button tap into `audioPlayer.play()`.
- User-Pause Transport Switching Pass-Through:
  - `audioPlayer.addEventListener('pause')` in `main.js` and `mediaSession.js` must NEVER drop user-initiated pauses (`window.wasPausedByUser === true`), even if `audioPlayer.switching` is true.

## 29. Pre-Song Playback Buffer State Transient Recovery
- Bounded Retries with Terminal Error:
  - Initial pre-song buffer retrieval must cap attempts at 5 iterations. Upon reaching 5 failed attempts, it must dispatch an `error` event to allow fallback to trigger rather than looping infinitely and triggering rate limits.
- Single-Trigger Online Resume Hook:
  - During the initial fetch loop, an `online` listener must be registered with `{ once: true }` and bound to the active track's `AbortSignal` for clean unbinding upon abort or track transition.
  - Prevents multi-fire cascade if mobile data oscillates rapidly between towers.

## 30. Tier 4 Server-Side Letterboxing Diagnostic
- Tier 4 Server-Side Letterboxing Diagnostic:
  - Letterboxed thumbnails with top and bottom ambient Gaussian blur are pre-rendered server-side by `fit_image_to_square` during Tier 4 YouTube thumbnail fallback.
  - They are legitimate 720x720 1:1 WebP images. Frontend CSS must not attempt to stretch, crop, or override aspect ratios on `#media-art` or notification thumbnails to "fix" letterboxing; resolution must occur upstream via backend artwork repair.

## 31. Absolute Prohibition of Package Installations & Host Modifications
- Strictly FORBIDDEN to execute package installation, removal, or update commands (`pip`, `npm`, `yarn`, `pnpm`, `winget`, `choco`, `scoop`, `conda`, `poetry`, `pipenv`, etc.) globally or locally without explicit, unambiguous user authorization in that exact prompt turn.
- Strictly FORBIDDEN to alter the host Python environment, site-packages, user profiles, or system-wide software configurations.
- When local tools or parsers (such as `node` or AST libraries) are absent, Antigravity MUST NEVER attempt autonomous package installation. Antigravity must use Python standard library modules or prompt the user.
- Deterministically enforced by workspace `PreToolUse` lifecycle hooks in `.agents/hooks.json`.

## 32. Dev-Only Git Push & Staging Deployment Invariant
- All git commits, pushes, and staging deployments MUST ALWAYS BE SCOPED TO `dev` BY DEFAULT.
- Strictly FORBIDDEN to execute direct pushes to `main` or `master` (`git push origin main`, bare `git push` on `main`, etc.) unless the user explicitly and unambiguously requests a merge/push to `main` in that exact prompt turn.
- All git push commands must explicitly target the `dev` branch (e.g. `git push origin dev`).
- Staging releases automatically deploy to `https://music.hausemaster.tech/dev/` and GitHub Pages `/dev/` upon pushing to `origin/dev`.
- Deterministically enforced by workspace `PreToolUse` lifecycle hooks in `.agents/hooks.json`.


## 33. External Video Interrupt & Mode 2 Media Notification Pin Preservation
- In Mode 2, when external media or video steals audio focus (`AUDIOFOCUS_LOSS_TRANSIENT`), `audioPlayer` pauses while `!window.wasPausedByUser`.
- In Mode 2, MediaSession MUST evaluate `declaredPausedState()` unconditionally without gating on `window.wasPausedByUser`.
- Chromium Android tears down media notifications immediately if all audio streams pause and `playbackState = 'paused'` is declared. The silent live audio anchor and `playbackState = 'playing'` (at micro-rate `0.00001`) must be retained to defend against native OS card eviction until explicit user-initiated stop.

## 34. Playlist Scroll Edge Navigation
- `#playlist-scroll-arrow` provides an unstyled edge navigation button positioned at the bottom-right of the playlist panel, offset to clear `#fast-scroller` (`right: 28px`, `z-index: 91`) and dynamic mobile bottom floating UI (`calc(84px + env(safe-area-inset-bottom, 0px))`).
- Dynamically toggles between up arrow (`scrollTop > 2`, scrolling to 0) and down arrow (`scrollTop <= 2`, scrolling to `scrollHeight`).
- Scrolling is instant jump snap (`behavior: "instant"` / `scrollTop`) without smooth scrolling animation.
- Synchronized across container scroll, window resize, and virtual track list re-renders.
- Automatically hidden when the miniplayer is expanded into full player view (`.now-playing.expanded`), restoring visibility seamlessly when collapsed back to miniplayer or default mode. Deterministically enforced across CSS `:has(.now-playing.expanded)` and JavaScript `updatePlaylistScrollArrow()` coupled to class mutation observation, navigation/popstate, click, and swipe expand/collapse transitions.

## 35. Mobile Playlist Swipe Gestures: Zero-Gap Clamped Underlay & Tap Artifact Prevention
- Underlay background: `#000000` (`.swipe-underlay`, `.swipe-backdrop`) with `border-radius: 8px`.
- Action icons: Stroke-based icons for enqueue (list with plus) and download (arrow to tray), sized 22px x 22px with `color: #ffffff`, `stroke-width: 2.2`, `stroke: currentColor`, `fill: none`, `stroke-linecap: round`, `stroke-linejoin: round`.
- Surface card: `#1e1e1e` with `1px solid rgba(255, 255, 255, 0.08)` and `border-radius: 8px`. Applied seamlessly during `.is-swiping`, `.slide-enqueue`, `.slide-download`, and `.snapping` states so the row card never flashes or reverts prematurely during dragging or snap back.
- Zero-gap tracking & clamp upon full reveal: `gap = 0`, `iconWidth = 22`, `parkOffset = 22px`. The legend icon follows the card div until fully revealed (`0px`), and clamps thereafter without moving further inwards (`Math.min(0, currentX - parkOffset)` for right swipe, `Math.max(0, currentX + parkOffset)` for left swipe).
- Minimal green hint/glow: On enqueue threshold and successful release, `.enqueue-success` illuminates with `#00ff88`, `drop-shadow(0 0 6px rgba(0, 255, 136, 0.75))`, and a 5px glowing indicator dot while the card smoothly glides back.
- Tap artifact jumping prevention: On non-horizontal swipe interactions (`!isHorizontalSwipe`), `handleTouchEnd` immediately resets and exits without attaching `transform` transition or `.snapping` classes. In `renderVirtualTracks()`, pooled virtual nodes are sanitized of lingering transitions and swiping/snapping classes so recycling never animates or jumps across the viewport.

## 36. Mobile Seekbar Instant Seek & Tap Transfer Invariant
- Direct Coordinate Calculation on Pointerdown: `seekBar` tap interactions must never rely on deferred native `<input type="range">` tap gesture recognition or delayed `change` events. `pointerdown` computes the seek target timestamp directly from `e.clientX` / touch coordinates relative to `seekBar.getBoundingClientRect()`, sets `seekBar.value`, and pre-arms `pendingSeekTarget`.
- Zero-Delay Touch Action: `.seek-wrap` and `input[type="range"]#seek-bar` must specify `touch-action: none;` to eliminate the 300ms mobile browser gesture disambiguation delay for touch gestures.
- Single-Fired Deterministic Seek: `endSeek` resolves `pendingSeekTarget` immediately on `pointerup` (or touch release) without waiting for subsequent synthetic `change` events, ensuring 0ms audio transfer latency on mobile taps.

## 37. Mode 1 Media Notification Retention & Single-Player Isolation Invariant
- Single-Player Isolation: In Mode 1 (honest HTML5 playback), `audioPlayer` must remain the single registered player in Chromium's `MediaSessionImpl` (`normal_players_`). Auxiliary audio elements (`focus-probe`, `live-stream-anchor`) must strictly NEVER be primed or played when `window.playbackMode !== 'mode2'`. In Chromium Android (`media_session_impl.cc`), when multiple normal players exist, pausing any player while an anchor plays triggers `RemovePlayer` eviction of `audioPlayer`. When players reach zero, audio focus is abandoned, causing `MediaSessionHelper` to clear the notification card. Single-player isolation ensures `audioPlayer` is the sole session player.
- Instant Paused State Declaration & Atomic Position Synchronization: On pause in Mode 1 (`btnPlayPause`, `audioPlayer.instantPause()`, `audioPlayer` `pause` listener), `navigator.mediaSession.playbackState = 'paused'` and `updateMediaSessionPosition(audioPlayer.currentTime, dur, 1.0, true)` are executed immediately and synchronously. This ensures the Android media notification card instantly shows the Play triangle button without animation flicker or delay and reports the updated seekbar and duration.
- Forced Position State Synchronization on Pause: On UI pause (`btnPlayPause`), `audioPlayer` `pause` event, and `visibilitychange` (when hidden while paused), MediaSession position must be updated with `forceBypass = true` to bypass the `< 0.25s` delta throttle and synchronize the stopped state to Android SystemUI.
- Background Hidden State Transition: When `document.hidden === true` fires while `(audioPlayer.paused || window.wasPausedByUser)` in Mode 1, `navigator.mediaSession.playbackState = 'paused'` and `updateMediaSessionPosition(pos, dur, 1.0, true)` are executed now that the Activity has stopped and the process is backgrounded.
- Foreground Return State Reaffirmation: When returning to the foreground (`!document.hidden`), if `audioPlayer.paused`, `navigator.mediaSession.playbackState = 'paused'` and `setPlayUI(false)` are reaffirmed.
- Finite Duration Sanitization & Position Cache Invalidation: MediaSession duration reporting must strictly guard against non-finite (Infinity / NaN) durations across MSE and streaming audio, falling back to _expectedDuration and seekBar.max. On fresh track execution, invalidatePositionCache() must be executed to prevent prior track positions from discarding new track position updates.

## 38. Android SystemUI Media Card Seekbar & Continuous Position Synchronization Invariant
- Universal Duration Parsing: `parseISODuration` in `utils.js` must support colon-delimited timestamps (`MM:SS`, `HH:MM:SS`) in addition to numeric durations and ISO 8601 strings (`PT#M#S`). In Android SystemUI (`SeekBarViewModel.kt`), seekbar enabled state, scrubber thumb, elapsed time, and total duration views are hidden if `METADATA_KEY_DURATION <= 0`.
- Continuous Duration Fallback Chaining: In `updateMediaSessionPosition`, `syncAfterRepublish`, and `timeupdate`, if `audioPlayer.duration`, `_expectedDuration`, and `seekBar.max` are unpopulated (0, NaN, or Infinity), duration resolution must fall back to the active playlist/database track metadata (`currentPlaylistData[globalActiveOriginalIndex]`, `allDatabases[globalActivePlaylist]`, `playQueue`, or `_stagedLastPlayedTrack`). `_lastSentPosition` and `_lastSentTimestamp` must never be latched if `setPositionState` was not called.
- Asynchronous Artwork Metadata Re-Assertion: Whenever `navigator.mediaSession.metadata = new MediaMetadata(...)` is assigned—both synchronously on cache hits/initial publish and asynchronously upon offscreen square artwork completion (`getSquareArtwork`, `getCachedSquareArtwork`)—it must immediately dispatch `updateMediaSessionPosition(curPos, totalDur, null, true)`. In Chromium Android (`MediaNotificationController.java`), updating metadata without an accompanying position state drops `METADATA_KEY_DURATION` and defaults Android `PlaybackState` to `PLAYBACK_POSITION_UNKNOWN`, collapsing the seekbar.
- Republish Dedup Bust Synchronization: In `republishMediaMetadata`, clearing metadata (`navigator.mediaSession.metadata = null`) to bust OS dedup must be accompanied by immediate position re-assertion (`syncAfterRepublish()`), preventing Android SystemUI from reading duration as 0 during metadata re-binding.
- Playback Rate Shift Throttle Bypass: `updateMediaSessionPosition` tracks `_lastSentRate`. Whenever the effective playback rate shifts (`Math.abs(validRate - _lastSentRate) > 0.001`), the `< 0.25s` delta throttle is bypassed. This guarantees track start transitions from buffering micro-rate (`0.00001`) to normal playback (`1.0`) reach Android SystemUI immediately even when elapsed playback time is under 0.25 seconds.
- Defensive Action Handler Isolation: All `navigator.mediaSession.setActionHandler` calls (`play`, `pause`, `playpause`, `previoustrack`, `nexttrack`, `seekto`, `seekbackward`, `seekforward`) must be individually enclosed in isolated try-catch blocks so a failure in any optional handler never aborts `seekto` (which Android SystemUI requires to enable the seekbar thumb).
- MediaSource Duration Early Binding: In `dom.js` (`_initMSE`), `this._mediaSource.duration = this._expectedDuration` must be asserted upon the `sourceopen` event listener when `_expectedDuration > 0`, preventing Chromium's audio pipeline from classifying the stream as an unbounded/live stream.
- Unconditional Duration Confirmation Synchronization: In `main.js` (`syncDuration`), `updateMediaSessionPosition(audioPlayer.currentTime, roundedDur, null, true)` must be dispatched whenever audio events (`durationchange`, `loadedmetadata`, `canplay`) confirm a valid finite positive duration, regardless of whether `seekBar.max` already equaled `roundedDur`.
- Defensive SeekTo Action Handling: `setActionHandler('seekto')` must validate and clamp incoming seek targets, update UI, and push the seeked target with confirmed duration to `updateMediaSessionPosition`, ensuring Android SystemUI seekbar scrubbing maintains continuous duration and timestamp display.

## 39. Playlist Track Item Click Scroll Retention Invariant
- Clicking any playlist track item div (`li` in `#track-list`) strictly retains the current `playlistContainer.scrollTop` position without auto-centering or scrolling `#playlist-container`.
- In `main.js`, `trackList` click listener explicitly invokes `playTrackSelection(li.dataset.playlist, parseInt(li.dataset.index), false)` passing `shouldScroll = false`.
- In `playback.js`, `playTrackSelection(targetPlaylist, targetOriginalIndex, shouldScroll = false)` propagates `allowScroll = shouldScroll` to `executePlayback(false, false, shouldScroll, null, shouldScroll)`.
- In `playback.js`, `executePlayback(..., allowScroll = true)` forwards `allowScroll` to `scrollToTrack(originalIndex, forceScroll, allowScroll)`.
- In `ui.js`, `scrollToTrack(originalIndex, forceScroll = false, allowScroll = true)` immediately short-circuits via `if (!allowScroll) { lastStartIndex = -1; renderVirtualTracks(); return; }`, updating the `.active` item styling without invoking `playlistContainer.scrollTo(...)`.
- Natural track auto-advancement (`playNext`, `playPrevious`) maintains `allowScroll = true` default behavior.

## 40. Main PWA Default Focus & Spacebar Play/Pause Invariant
- Default focus strictly persists on the main PWA site (`document.body`).
- Pointer clicks (`e.detail > 0`) on buttons (`button, [role="button"]`) outside modal dialogs immediately invoke `btn.blur()`, returning `document.activeElement` to `document.body` and preventing button focus retention.
- In `main.js`, the global keydown listener for Spacebar (`e.key === ' ' || e.code === 'Space'`) unconditionally blurs active buttons, dispatches `e.preventDefault()`, and triggers `btnPlayPause.click()`.
- Buttons never retain focus after pointer interaction, and Spacebar keypresses never repeat or activate the most recently clicked button (such as Next Track `#btn-next`).
- Editable text inputs (`input[type!="range"]`, `textarea`, `select`, `isContentEditable`) and active modal dialogs (`#settings-modal`) remain isolated from global Spacebar playback interception.

## 41. Playback Mode 1 Default Startup Invariant
- Every page reload, browser refresh, or PWA restart strictly defaults to Mode 1 (`window.playbackMode = 'mode1'`) without restoring Mode 2 from persistent storage.

## 42. Gesture Double-Swipe De-Performance Invariant
- Swiping right to enqueue a track that is already in `playQueue` removes/unqueues it and clears enqueued visual cues without displaying an unqueue toast icon.
- Swiping left to download a track that is already fully cached offline does nothing (no deletion, no cache removal, no toast).
- Swiping left to download a track that is currently in-flight downloading cancels/aborts the in-flight download and displays a "Cancelled download" toast.

## 43. Minimum Swipe Gesture Threshold Invariant
- Track list horizontal swipe actions require at least a 0.20 drag width ratio with an absolute minimum floor of 64px (`Math.max(64, offsetWidth * thresholdRatio)`) before activating enqueue or download actions.

## 44. Bluetooth AVRCP Playback Resume & Media Key Invariant
- Bluetooth headset resume commands (`onPlay`, `onPause` while paused, or `MediaPlayPause` / `MediaPlay` key events) must resume audio playback unconditionally without being blocked by `wasPausedByUser`.
- In `dom.js`, `DualAudioPingPong.play()` clears `this._preventAutoplay = false;` on authorized playback, ensuring genuine events propagate to audioPlayer listeners while preserving `forwardEvent` pre-staging event suppression (`this._preventAutoplay && (e.type === 'play' || e.type === 'playing')`), alongside the `if (window.wasPausedByUser) { return Promise.resolve(); }` authorization choke point in `play()`.
- In `mediaSession.js`, `setActionHandler('pause')` when `isActuallyPaused` is true clears `window.wasPausedByUser = false;` and unconditionally invokes `audioPlayer.play()`, ensuring single-button and toggle Bluetooth headsets immediately resume playback across both Mode 1 and Mode 2 without skipping play on transitional unpaused states.
- In `main.js`, `audioPlayer.addEventListener("play")` treats native and AVRCP play events as authorized user playback, clearing `window.wasPausedByUser = false;` and `audioPlayer._preventAutoplay = false;` without invoking `instantPause()` (blocking rogue play strictly on `isCallActive` or `isPostCallQuarantine`).
- In `mediaSession.js`, `updateMediaSessionPosition` strictly prioritizes explicit `forcedRate > 0` over the `isPaused && window.playbackMode === 'mode2'` micro-rate throttle fallback, ensuring that resuming playback immediately updates Android SystemUI's `PlaybackState` with rate `1.0` (even while `audioPlayer.paused` is still `true` before async play start).
- In `mediaSession.js`, `handlePlayAction`, `setActionHandler('pause')` resume branch, `setActionHandler('playpause')` resume branch, and `seekforward` / `seekbackward` Mode 2 resume paths explicitly clear `audioPlayer._preventAutoplay = false` before invoking `audioPlayer.play()`, invoke `republishMediaMetadata()` prior to `updateMediaSessionPosition(actualTime, dur, 1.0, true)` with forced rate 1.0 and `force = true` (preventing `syncAfterRepublish` from overwriting rate 1.0 back to micro-rate 0.00001), and reset `actualTime = 0` on near-track-end loop replay (`actualTime >= dur - 0.5`).
- In `main.js`, `audioPlayer.addEventListener("pause")` in Mode 2 passes micro-rate `0.00001` with `force = true` (`updateMediaSessionPosition(audioPlayer.currentTime, dur, 0.00001, true)`), preventing rate flapping to `1.0` while paused, keeping the card pinned, and freezing the seekbar so Android SystemUI correctly accepts media card and AVRCP resume actions.
- In `dom.js` (`DualAudioPingPong.prototype.play()`), `main.js` (`btnPlayPause` click, `play`, and `playing` listeners), and `mediaSession.js` (`handlePlayAction`, `pause`, `playpause`, `seekbackward`, `seekforward`, and `audioPlayer.addEventListener('play')`), `startLiveAudioAnchor()` in Mode 2 is strictly conditional on `(!_anchor || _anchor.paused)`, avoiding redundant re-invocation of `anchorEl.play()` when the anchor is already running and preventing audio focus arbitration conflicts against `audioPlayer.play()`.
- On fresh site visits in Mode 2, the live audio anchor (`<audio id="live-stream-anchor">`) is initialized, primed, and running on the initial user play gesture prior to pause, ensuring active audio remains present when the main audio player pauses, preventing Chromium from reaching zero active audio elements and stripping the media notification card on first song pause.
- Universal `keydown` listener intercepts `MediaPlayPause`, `MediaPlay`, `MediaPause`, `MediaTrackNext`, and `MediaTrackPrevious` to support physical headset and hardware media keys.

## 45. CI/CD Automated Cache Invalidation Invariant
- GitHub Actions (`.github/workflows/deploy.yaml`) automatically computes `buildVer` and replaces `const CACHE_NAME` in `sw.js` with `yt-player-cache-${branchPrefix}-${buildVer}`, inlining and cache-busting bundles (`bundle.min.js?v=${buildVer}`).
- Manual bumping of `CACHE_NAME` in `sw.js` is completely redundant and strictly prohibited. Unit tests must use regex pattern matching (`yt-player-cache-.*`) instead of hardcoded version numbers.

## 46. Mobile Screen Unlock Media Card Animation Resync Invariant
- Direct device unlock or foregrounding must immediately restore active sound wave and seekbar animations on the media card.
- In `mediaSession.js`, projection coercion in `updateMediaSessionPosition` honors `!forceBypass`, ensuring that waking or unlocking the mobile device forces rate `1.0` and uncoerced position timestamps directly into Android SystemUI `PlaybackState` without suppression.

## 47. Mobile Lyrics (LRC) Multi-Candidate Resolution & Caching Invariant
- In `utils.js`, `getLyricsCandidates(track)` generates normalized candidate paths across exact path, title variants, lowercase conversions, and track IDs.
- In `lyrics.js`, the lyrics fetch pipeline sequentially evaluates candidate URLs with `priority: 'low'`, caching successful hits and preventing missing lyrics due to case sensitivity, backslash/slash discrepancies, or mobile path resolution differences.
- In `sw.js`, `.lrc` file requests are routed through `yt-player-media` cache using `ignoreSearch: true`.

## 48. Truncated Audio Cache Detection & Recovery Invariant
- In `dom.js`, `isExplicitlyComplete` strictly validates that `cachedPartialBytes >= (this._expectedDuration * 4000)` before accepting `X-Partial-Cached: 'false'`. If cached bytes fall below expected duration bitrate or if `buffEnd < this._expectedDuration - 15`, `isExplicitlyPartial` and `isDurationIncomplete` treat the entry as partial, self-heal CacheStorage with `X-Partial-Cached: 'true'`, and trigger background Range ingestion without invoking `endOfStream()` or marking `this._streamDone = true`.
- In `dom.js`, `timeupdate` only clamps `effectiveEnd = Math.min(dur, buffEnd)` when `buffEnd >= dur - 15` (or `dur <= 0`), preventing truncated buffers from prematurely firing `ended` and auto-skipping tracks.
- In `sw.js` and `playback.js` (`preloadNextTrack`), fetched audio responses verify that `buf.byteLength >= reportedLen` before tagging responses with `'X-Partial-Cached': 'false'`. Truncated or aborted network streams are tagged with `'X-Partial-Cached': 'true'`.
- In `dom.js`, Range fetch HTTP 416 responses occurring on premature buffers (`demuxedBuffEnd < this._expectedDuration - 15`) clear the invalid buffer and restart fetch from byte 0 instead of prematurely concluding the stream.

## 49. Last Played Playlist Active Element Scroll & Position Invariant
- In `playback.js`, `restoreLastPlayedTrack` parses `originalIndex` and `queueIndex` via `parseInt(..., 10)` and sets `window._stagedLastPlayedTrackScrolled = false;`.
- In `playback.js`, `applyNormalizedDataInChunks` detects `targetIndexInRaw` in `validRawData` for the staged or active track ID, and expands `initialSlice` beyond `INITIAL_CHUNK` (60) up to `Math.min(totalCount, Math.max(INITIAL_CHUNK, targetIndexInRaw + 25))` so that the active track is immediately present in memory during initial 0ms render.
- In `playback.js`, `applyPlaylistData` initializes `filteredIndices` with `totalCount` when `!filterText` and `totalCount > 0`, ensuring all tracks are indexed for lookup.
- In `playback.js`, `shouldInitialScroll = !isRevalidation || (window._stagedLastPlayedTrack && !window._stagedLastPlayedTrackScrolled);` permits scrolling to the active track on initial load even if data arrives via network revalidation or cache resolution, marking `window._stagedLastPlayedTrackScrolled = true;`.
- In `playback.js`, `processNextChunk` reconciles `globalActiveOriginalIndex = newIndex` before rendering virtual tracks and invokes `scrollToTrack(globalActiveOriginalIndex, true)` upon completing all chunks.
- In `ui.js`, `scrollToTrack` uses loose equality `item.index == originalIndex`, clamps target offset to `Math.max(0, ...)`, sets `playlistContainer.scrollTop = targetTop`, calls `playlistContainer.scrollTo`, and schedules `requestAnimationFrame` when `forceScroll` is true for post-layout centering.
- In `ui.js`, `renderVirtualTracks` sets both `li.dataset.index` and `li.dataset.originalIndex`, and applies `.active` when `item.playlist === globalActivePlaylist && item.index == globalActiveOriginalIndex`.
- Rule 6 scroll retention on user clicks is strictly preserved (`allowScroll = false` in `scrollToTrack` returns early without modifying scroll position).







