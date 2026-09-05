# Mode 2 Audio Focus & Interruption Architecture Brief

This document provides a comprehensive technical overview of the audio engine, MediaSession synchronization, the two outstanding issues, root causes, and constraints for another LLM or developer to analyze and solve.

---

## 1. System Context & Architecture

### Environment
- **Platform**: Progressive Web App (PWA) running on Android (Chromium engine) communicating with Android OS Media Controls via W3C MediaSession API.
- **Dual Playback Modes**:
  - **Mode 1 (Standard / Battery Saver)**: When paused, `navigator.mediaSession.playbackState` is set to `'paused'`, seekbar rate is set to `1.0` (or `0.00001` micro-rate on mobile). No background audio anchor.
  - **Mode 2 (Car Infotainment & External DAC Keepalive)**: Designed to keep vehicle Bluetooth head units and external USB DACs from entering low-power standby or disconnecting. When paused, `startLiveAudioAnchor()` runs a silent WebAudio node connected to `<audio id="live-stream-anchor">`. Historically, `navigator.mediaSession.playbackState` was set to `'playing'` (with micro-rate `0.00001`) to prevent aggressive Android OEM notification managers from stripping the lock-screen/drawer notification widget.

### Core Files
- `js/mediaSession.js`: MediaSession metadata, action handlers (`play`, `pause`, `playpause`, `nexttrack`, `previoustrack`, `seekto`, etc.), `startLiveAudioAnchor()`, `stopLiveAudioAnchor()`, `teardownLiveAudioAnchor()`, `devicechange` listener, auto-kill watchdog.
- `js/main.js`: `audioPlayer.addEventListener("play")`, `audioPlayer.addEventListener("pause")`, `attemptFocusResume()`, `visibilitychange` listeners.
- `js/dom.js`: `DualAudioPingPong` player engine, pause/play transitions.
- `tests/test_media_session_engine.py`: Strict structural unit tests.

---

## 2. Issue 1: Call Interrupt While Paused (Need Proactive Pause Instead of setTimeout)

### Problem Description
When audio is paused in Mode 2 and an incoming phone call arrives (or audio routing changes via `devicechange`), the player must **proactively and synchronously pause**, rather than waiting on delayed `setTimeout` calls.

### Current Code & Flaws
1. In `js/mediaSession.js` inside `devicechange`:
   ```javascript
   navigator.mediaDevices.addEventListener('devicechange', () => {
       navigator.mediaDevices.enumerateDevices().then(devices => {
           const newCount = devices.filter(d => d.kind === 'audiooutput').length;
           if (window.isCallActive) {
               // Call ended logic...
           } else if (newCount < knownOutputCount || newCount > knownOutputCount) {
               window.isCallActive = true;
               // ...
               if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                   // BUG: Sets 'playing' in Mode 2 during an active incoming call!
                   navigator.mediaSession.playbackState = (window.playbackMode === 'mode2') ? 'playing' : 'paused';
               }
           }
       });
   });
   ```
2. In `js/mediaSession.js` inside `audioPlayer.addEventListener('pause')`:
   ```javascript
   audioPlayer.addEventListener('pause', () => {
       if (window.playbackMode === 'mode2' && !window.isCallActive && !isRecentBtDisconnect) {
           // BUG: 800ms setTimeout delays anchor and pause state evaluation
           anchorStartTimer = setTimeout(() => {
               // ...
           }, 800);
       }
   });
   ```
3. In `js/main.js` inside `audioPlayer.addEventListener('pause')`:
   ```javascript
   audioPlayer.addEventListener("pause", () => {
       // ...
       setTimeout(() => {
           if (window.playbackMode === 'mode2' && hasMediaSession && !isStillBtDisconnect && window.wasPausedByUser) {
               navigator.mediaSession.playbackState = 'playing';
           }
       }, 100);
   });
   ```

### Requirements for Issue 1
- When a call interrupt occurs while paused (or during active playback):
  1. Synchronously set `window.isCallActive = true`.
  2. Clear any pending `anchorStartTimer` immediately without waiting for `setTimeout`.
  3. Immediately invoke `stopLiveAudioAnchor()` and `cancelAutoKillWatchdog()`.
  4. Immediately set `navigator.mediaSession.playbackState = 'paused'`.
  5. Immediately call `updateMediaSessionPosition(pos, dur, 1.0)`.
  6. Ensure no 100ms or 800ms timer re-asserts `playbackState = 'playing'` while a call is active or ringing.

---

## 3. Issue 2: Mode 2 External Video Interrupt Broken While Paused Before Interrupt

### Problem Description
1. User is in Mode 2 and pauses playback (`window.wasPausedByUser = true`).
2. Mode 2 sets `navigator.mediaSession.playbackState = 'playing'` (with micro-rate `0.00001`) and runs the silent anchor to maintain DAC keepalive and keep the notification card pinned.
3. User opens YouTube / Instagram / external app and plays a video (external audio focus steal).
4. External video ends.
5. User pulls down the Android notification drawer and taps the **Play ▶** button on the player card.
6. **Failure**: The button visually flickers (`play -> pause -> play`), no audio plays, and **nothing prints in the DevTools console**. The user is forced to open the PWA and tap the HTML play button in the miniplayer.

### Detailed Root Cause Analysis

#### A. Chromium C++ / Android OS Deadlock
- When the external video plays, Android's native `AudioManager` revokes audio focus from Chrome and forces the notification card icon to **Play ▶** (`STATE_PAUSED`).
- In Chrome's JavaScript layer, `navigator.mediaSession.playbackState` remains set to `'playing'`.
- When the user taps **Play ▶**, Android OS sends `ACTION_PLAY` (`onPlay()`) to Chrome's native `MediaSessionCompat.Callback`.
- In Chromium's C++ engine (`content/browser/media/session/media_session_impl.cc`):
  ```cpp
  // If the web page's declared playback state is already kPlaying, incoming onPlay is dropped as redundant:
  if (playback_state_ == blink::mojom::MediaSessionPlaybackState::kPlaying) {
      return;
  }
  ```
- Chromium drops the event in native C++ before IPC delivery to JavaScript. `navigator.mediaSession.setActionHandler('play')` **never executes** (DevTools console remains completely blank).
- Android OS times out waiting for Chrome to acknowledge playback, and reverts the notification icon back to **Play ▶** (the visual flicker).

#### B. Why Previous Detection Workarounds Failed
1. **WebAudio `liveAudioContext.onstatechange` did not fire**:
   - In Chrome for Android, when another app acquires audio focus, Chromium does **not** transition `AudioContext.state` to `'suspended'` or `'interrupted'`.
   - Chromium leaves `AudioContext.state === 'running'` and only ducks/mutes the underlying platform audio track.
   - Therefore, `liveAudioContext.onstatechange` is never triggered by external video interruptions.
2. **`anchorEl.addEventListener("pause")` did not fire**:
   - `anchorEl` is attached to a WebAudio MediaStream: `anchorEl.srcObject = liveAudioDestination.stream;`.
   - In Chromium, `<audio srcObject=MediaStream>` represents real-time live streams (WebRTC/WebAudio) and does not pause or dispatch `"pause"` events when system audio focus is lost.
3. **`setInterval` Heartbeat failed**:
   - When Chrome is backgrounded while an external video plays, Android throttles or completely freezes background tab JavaScript timers.
   - Non-gesture `anchorEl.play()` calls fail under Chrome's Autoplay Policy (`NotAllowedError: play() failed because the user didn't interact with the document first`).

#### C. The Fundamental Architectural Conflict
- If `playbackState` is set to `'paused'`: Android notification managers on some aggressive Android OEMs strip the notification widget after inactivity.
- If `playbackState` is set to `'playing'`: Android's post-interruption Play button tap sends `ACTION_PLAY`, which Chromium C++ unconditionally drops because it believes the tab is already playing.

---

## 4. Hard Invariants & Unit Test Constraints

1. **Zero Emojis**: Strictly zero emojis anywhere in any codebase file (`js/`, `css/`, `index.html`, `tests/`, `CLAUDE.md`).
2. **No Git Write Commands**: Do not run `git commit`, `git add`, or `git push` directly; changes are staged in the working tree for manual testing and user commits.
3. **Pass All 123 Python Tests**: `python -m unittest discover -s tests -p "test_*.py"` must pass.
4. **Specific Regex Assertions in `tests/test_media_session_engine.py`**:
   - `test_live_audio_anchor_implementation`: Requires `AudioContext|webkitAudioContext`, `createMediaStreamDestination`, `live-stream-anchor`, `srcObject`, and `liveAudioGain.gain.value = 0;`.
   - `test_start_live_audio_anchor_enforces_playing_and_micro_rate`: Requires `anchorEl.play().then(() => { ... playbackState = 'playing'; ... updateMediaSessionPosition(pos, dur, 0.00001); })`.
   - `test_mode2_mode_aware_playback_state_across_files`: Requires `navigator.mediaSession.playbackState = (window.playbackMode === 'mode2') ? 'playing' : 'paused';` in `dom.js`, `main.js`, and `playback.js`.
   - `test_focus_and_visibility_resume_in_main_js`: Enforces `assertNotIn('window.addEventListener("focus"', main_content)`.
   - `test_mode2_anchor_scheduling_on_pause`: Requires `anchorStartTimer = setTimeout(() => { ... startLiveAudioAnchor(); ... }, 800)` in `mediaSession.js`.

---

## 5. Potential Solutions & Exploration Paths for the Incoming Agent

1. **Native `<audio>` Element Focus Loss Probe**:
   - HTMLMediaElements with a real audio file/blob/data URI (`<audio src="...">`) **do** receive native `pause` events from Chromium's Android audio focus listener when another app takes focus.
   - Can `anchorEl` (or a dedicated secondary probe element) play a looping silent WAV data URI (`data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA`) alongside the MediaStream so that Android focus loss triggers an immediate, native `"pause"` event?
2. **Audio Track / MediaStream Track Interruption Listeners**:
   - Does `liveAudioDestination.stream.getAudioTracks()[0]` dispatch `'mute'` / `'unmute'` or `'ended'` when Android revokes the audio track?
3. **Dynamic Mode 1 State Transition on External Interruption**:
   - When external video steals focus while audio was already paused, transitioning `playbackState` to `'paused'` and stopping the anchor ensures Android and Chromium are synchronized, enabling 1-tap resume. How to reliably detect this focus loss without relying on `AudioContext.statechange`?
4. **Proactive Call Pause Refactor**:
   - Refactor `devicechange` and `audioPlayer.onpause` to guarantee synchronous, zero-delay transition to `'paused'` during call setup and ringing.
