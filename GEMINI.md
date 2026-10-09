# Standing Project Rules & Directives

## 1. Permanent Rule Persistence Directive (Mandatory Meta-Rule)
- Whenever the user specifies any instruction, rule, architectural constraint, invariant, or process workflow, Antigravity MUST immediately record and persist it in `GEMINI.md` across relevant workspaces.
- Antigravity must never rely solely on ephemeral conversation memory, which is subject to context truncation and compression.
- Before executing any task, Antigravity must read, respect, and enforce all rules in `GEMINI.md` unconditionally.

## 2. Mandatory Muse Consultation & Debate
- On EVERY prompt involving architectural audits, bug investigations, design choices, root cause analysis, or verification, Antigravity MUST consult and debate with Muse first before proposing solutions or writing code.
- Working Directory & Context Preservation:
  - ALWAYS run Muse directly in the **project root directory** (e.g., `c:\Users\Hause\Documents\Code\youtube_frontend`).
  - ALWAYS pass the `-c` (`--continue`) flag so Muse retains and accumulates conversational context across every single invocation.
  - If Muse does not have or loses context, explicitly bootstrap it with existing architectural state, code references, and invariants.
- Invocation command pattern:
  ```bash
  python -c "import subprocess; cmd = [r'C:\Users\Hause\AppData\Local\Microsoft\WinGet\Packages\SST.opencode_Microsoft.Winget.Source_8wekyb3d8bbwe\opencode.exe', 'run', '-c', '-m', 'opencode/muse-spark-1.3-contributor-free', '--variant', 'xhigh', '<prompt>']; p = subprocess.Popen(cmd, cwd=r'<project_root>', stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8'); out, err = p.communicate(timeout=180); print(out)"
  ```
  *(Note: Passing `stdin=subprocess.DEVNULL` ensures non-blocking automated execution on Windows).*
- Antigravity must apply critical thinking to Muse's responses and debate back and forth if necessary, combining the cognitive throughput of both agents.
- Antigravity must NEVER substitute its own unverified assumptions for a rigorous architectural debate with Muse.

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


