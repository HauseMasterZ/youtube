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

## 10. Android SystemUI & HyperOS Wave Animation Invariant
- In Android 13+ and Xiaomi HyperOS (`SquigglyProgress.kt`), `heightAnimator` is canceled when the screen turns off, leaving `heightFraction = 0.0`.
- Direct fingerprint unlock to the launcher homescreen (`com.miui.home`) reuses the existing media view without rebinding. Because `field` remains `true` in `SquigglyProgress.animate`, any subsequent update with `playbackState = 'playing'` hits `if (field == value) return`, leaving the squiggly wave permanently frozen flat if no position anchor is delivered.
- Re-publishing identical `MediaMetadata` fails to unstick the wave because Chromium C++ (`MediaSessionImpl::SetMetadata`) performs `if (metadata_ == metadata) return;`. Re-assigning identical metadata sends zero Mojo IPC to Android, so SystemUI never re-runs `bindPlayer()`.
- Synthetic `playbackState` pulses (`paused` -> `playing`) are strictly prohibited: they cause Bluetooth AVRCP `PAUSED` status flashes on car headunits, audio routing races, and tearing during calls or background transitions.
- The verified self-healing recovery mechanism is the 1000ms background position cadence baseline (`ca28091` / `48630be`):
  1. While the device is in the background (`document.hidden && !isPaused`), position updates are dispatched on an honest 1000ms cadence.
  2. On direct fingerprint unlock to the homescreen, the first tick (within 1000ms) delivers an unthrottled `setPositionState` with fresh position and timestamp to Android SystemUI.
  3. Android's `SeekBarViewModel` receives the fresh position state, causing `onProgress` / `SeekBarObserver` to set `animate = true`, launching `SquigglyProgress.heightAnimator` (800ms expansion ramp from 0.0 to 1.0).
  4. The squiggly wave naturally self-heals after ~1s without audio hiccups, metadata churn, or playbackState spoofing.

## 11. Zero Metadata Churn & Homescreen Unlock Recovery Invariant
- Zero Continuous Metadata Churn Rule: Unthrottled re-assignment of `navigator.mediaSession.metadata` triggers Android `MediaDataManager` and `MediaControlPanel.bindPlayer()` repeatedly. Metadata MUST NEVER be republished in steady-state `timeupdate` or on in-app foreground when track metadata is already fresh.
- Homescreen Self-Healing Baseline (~1s Wave Recovery): Direct in-display fingerprint unlock to launcher homescreen reuses the existing panel with `heightFraction` collapsed to 0.0. The baseline employs `isBackgroundStale = isHiddenPlaying && (lastSent > 0) && (nowWall - lastSent > 1000)` in `main.js` `timeupdate`:
  1. `isBackgroundStale` fires on the first 1-second tick after unlock (max 1000ms delay).
  2. In `main.js`, `isBackgroundStale` sets `window._forceNextPosition = true` and passes `isBackgroundStale` as the `force` parameter to `updateMediaSessionPosition`.
  3. In `mediaSession.js`, `backgroundCeilingMs = 1000` sets `effectiveCeiling = 1000` while `document.hidden && !isPaused`, guaranteeing `effectiveBypass = true`.
  4. This dispatches an unthrottled `setPositionState({ duration, playbackRate: 1.0, position })` to Android SystemUI on the first tick after unlock, reviving `SeekBarViewModel` polling and restarting `heightAnimator`.
- In-App Instant Wave Resume: Foreground resynchronization (`resyncMediaSessionOnForeground`) dispatches a single `requestAnimationFrame` forced position update with `window._forceNextPosition = true`. This delivers the playhead anchor before the first frame, resuming the squiggly wave instantly with 0ms delay.
- Monotonic Stability Guards: Monotonic guards prevent backward jumps (>0.5s within 3000ms), deduplicate identical positions (<0.25s within 1500ms), and drop wild forward jumps (>3.0s within 1500ms). Bypassed exactly once when `force === true` or `window._forceNextPosition === true` for foreground resync or genuine resume.

## 12. Absolute Prohibition of Git Write Operations
- Under NO circumstances may Antigravity execute any Git write operation (including git commit, git push, git checkout -b, git branch, git merge, git rebase, git tag, or git reset against remote).
- Git operations are strictly read-only (status, diff, log).

## 13. Frontend Codebase Architectural Decoupling Invariant
- The entire codebase of the frontend repository must strictly NOT contain any architectural information, implementation details, credentials, or explicit naming regarding backend infrastructure, cloud servers, storage repositories, edge devices, or third-party backend instances anywhere.
- All client-side communication must operate through generic API gateway and asset abstractions.
