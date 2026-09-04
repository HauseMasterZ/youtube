# Mode 2 Audio Focus and Interruption Design — 2026-09-03

Status: Approved in chat (Sections 1-3). No implementation started.
Constraints: zero emojis, no git add/commit/push, 123 Python tests must pass.

## 1. Context

PWA on Android Chromium. Mode 1 sets paused + rate 1.0 (0.00001 micro-rate on mobile).
Mode 2 keeps vehicle BT head units and external DACs awake via silent
WebAudio anchor (`live-stream-anchor`) and historically keeps
`playbackState = playing` with micro-rate 0.00001.

Core files:
- `js/mediaSession.js`: action handlers, anchor lifecycle, devicechange, watchdog
- `js/main.js`: audioPlayer play/pause listeners, attemptFocusResume, visibilitychange
- `js/dom.js`: DualAudioPingPong engine
- `tests/test_media_session_engine.py`: structural regex tests

## 2. Section 1 — Issue 1 synchronous call-pause (Approved)

Problem: devicechange set playing in Mode 2 during active call; 800 ms and
100 ms timers re-asserted playing while call active or ringing.

Change:
- `js/mediaSession.js` devicechange count-change path:
  synchronously set `window.isCallActive = true`, clear `anchorStartTimer`,
  `instantPause`, `stopLiveAudioAnchor`, `cancelAutoKillWatchdog`,
  `setPlayUI(false)`, `playbackState = paused` in both modes,
  `updateMediaSessionPosition(pos, dur, 1.0)`.
- `js/mediaSession.js` audioPlayer pause listener: keep 800 ms scheduler
  shape for test compatibility but guard entry and callback with
  `!window.isCallActive && !isRecentBtDisconnect`, re-check inside callback.
- `js/main.js` pause listener: keep 100 ms re-assert shape but guard with
  `!window.isCallActive` and require `window.wasPausedByUser`; never
  re-assert playing during call.
- External pause with `!wasPausedByUser` keeps existing proactive paused
  path at `js/mediaSession.js:518-527`.

## 3. Section 2 — Native focus probe for Issue 2 (Approved)

Root cause: external video steals Android focus; Chromium C++ drops drawer
Play as redundant because JS `playbackState` is still playing; AudioContext
statechange, MediaStream anchor pause, and throttled timers do not fire.

Change (keepalive priority):
- Add `<audio id="focus-probe" loop preload="auto">` in `index.html`.
- Add `SILENT_WAV_DATA_URI` const in `js/mediaSession.js`.
- Prime probe on Mode-2 enter and btnPlayPause gesture via
  `play().then(pause())`, swallow `NotAllowedError`.
- While Mode-2 paused with anchor running, loop probe at volume 0.
- On probe native `pause` with Mode-2 + audioPlayer.paused +
  `wasPausedByUser` + `!isCallActive` + `!isRecentBtDisconnect`:
  `stopLiveAudioAnchor`, `cancelAutoKillWatchdog`,
  `playbackState = paused`, `updateMediaSessionPosition(pos, dur, 1.0)`.
- Otherwise remain playing + anchor. Track mute/unmute only logs.

## 4. Section 3 — Testing and rollout (Approved)

- Update 4 existing regex tests to new paused + 1.0 behavior with
  `isCallActive` guards; keep timer shapes (100 ms, 800 ms) present.
- Add 3 assertions: focus-probe element, silent WAV URI, probe pause
  handler sets paused + stops anchor.
- Preserve: zero emojis, brace balance, no window focus listener,
  no capture true, mode-aware ternary in dom/main/playback steady paths,
  hardware combo 2500 ms mobile scope.
- Verify: `python -m unittest discover -s tests -p "test_*.py"`.
- Manual: Mode-2 paused + call stays paused with no leak; Mode-2 paused +
  YouTube steal transitions to paused for 1-tap drawer resume; no-steal
  stays pinned.

## 5. Spec self-review

- No TBD or TODO placeholders.
- No contradictions: default keepalive retained; paused transition only on
  confirmed call or probe-detected steal.
- Scope is single spec: Mode 2 focus paths + tests + probe element.
- Rate semantics explicit: 0.00001 only for un-stolen Mode-2 paused;
  1.0 for call, steal, Mode 1, BT disconnect.

## 6. Next step

User reviews this file. On approval, invoke writing-plans skill. Do not
commit per user no-git-write constraint; leave file in working tree.
