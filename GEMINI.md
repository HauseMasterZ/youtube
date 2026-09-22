# Standing Project Rules & Directives

## 1. Permanent Rule Persistence Directive (Mandatory Meta-Rule)
- Whenever the user specifies any instruction, rule, architectural constraint, invariant, or process workflow, Antigravity MUST immediately record and persist it in `GEMINI.md` across relevant workspaces.
- Antigravity must never rely solely on ephemeral conversation memory, which is subject to context truncation and compression.
- Before executing any task, Antigravity must read, respect, and enforce all rules in `GEMINI.md` unconditionally.

## 2. Mandatory Muse Consultation & Debate
- On EVERY prompt involving architectural audits, bug investigations, design choices, root cause analysis, or verification, Antigravity MUST consult and debate with Muse first before proposing solutions or writing code.
- Working Directory & Context Preservation:
  - ALWAYS run Muse directly in the **project root directory** (e.g., `c:\Users\Hause\Documents\Code\youtube_frontend` or `c:\Users\Hause\Documents\Code\alwaysdata-pi-setup`).
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
- Strictly stream from downloaded assets stored in dataset storage (`magical-bear/main-model-llm`); never stream directly from YouTube or third-party web scrapers during playback.

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
- Rule 7b (Catalogue Self-Healing Protocol): Autonomous daily downtime self-healing (02:00 to 09:00 IST / 22:00 UTC) on the Raspberry Pi is authorized to detect and repair broken audio, playlist order divergence, missing synchronized .lrc lyrics, missing square .webp thumbnails, and default dominant colors, preserving 1:1 catalogue fidelity without altering playlist membership.

## 8. Empirical Verification Before Completion
- Be empirical, tenacious, and verify actual changes before claiming fixes.
- Run automated tests (`python -m unittest discover -s tests -p "test_*.py"`).
- Run syntax checks (`node --check ...`).
- Empirically verify live production endpoints and headers.

## 9. Strict Zero-Emoji Policy
- Strictly ZERO emojis in code, comments, commit messages, tests, documentation, and assistant responses.

## 10. Android SystemUI & HyperOS Wave Animation Resilience
- In Android 13+ and Xiaomi HyperOS (`SquigglyProgress.kt`), `heightAnimator` is canceled when the screen turns off, leaving `field = true`.
- Direct fingerprint unlock to the launcher homescreen (`com.miui.home`) reuses the media view without rebinding. Because `field` remains `true`, any subsequent update with `playbackState = 'playing'` hits `if (field == value) return`, leaving the squiggly wave permanently frozen.
- To unfreeze the wave, SystemUI must receive a false edge (`STATE_PAUSED`) clearing `field = false`, followed by a true edge (`STATE_PLAYING`) restarting `heightAnimator`.
- Transient Unlock Pulse Protocol:
  - Trigger strictly while `document.hidden` and actively playing (`!audioPlayer.paused && !window.wasPausedByUser && !audioPlayer.switching && !isCallOrQuarantine && !isRecentBtDisconnect`).
  - Detect unlock jank via `eventDelta > 380` (with 5000ms cooldown) or `staleGap > 2500` (with 3000ms cooldown).
  - Leg 1: Declare `playbackState = 'paused'` (state only, no redundant `setPositionState` IPC).
  - Leg 2: After 75ms `setTimeout`, declare `playbackState = 'playing'` and push fresh forced `setPositionState`.
  - 75ms duration is strictly inside the 60-100ms window: passes Chromium Mojo as discrete IPCs to clear `field`, but coalesces under Android's 150ms icon fade and >200ms BlueDroid AVRCP debounce, producing zero visual glyph flicker and zero Bluetooth head-unit glitch.
  - Omit `republishMediaMetadata()` to avoid album art reloads and view recreation.

