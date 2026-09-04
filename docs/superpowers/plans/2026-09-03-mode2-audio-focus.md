# Mode 2 Audio Focus Interruption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Mode 2 call-interrupt pausing to be synchronous and add a native silent-WAV focus probe so external-video steals become resumable in one tap while keepalive is preserved otherwise.

**Architecture:** Keep the existing anchor plus watchdog design. Make the devicechange path unconditionally paused with rate 1.0 during calls, guard both delayed re-assert timers with isCallActive, and add a separate looping probe audio element whose native pause event is the only reliable external-steal signal on Android Chromium.

**Tech Stack:** Vanilla JavaScript PWA with no build step, W3C MediaSession API, WebAudio silent anchor, Python unittest structural regex tests.

**Spec:** `docs/superpowers/specs/2026-09-03-mode2-audio-focus-design.md`

## Global Constraints

- Strictly zero emojis in any JS, CSS, HTML, or Python test file.
- Do not run git add, git commit, or git push; leave all changes in the working tree for manual review.
- `python -m unittest discover -s tests -p "test_*.py"` must pass with all 123 tests.
- Reuse the existing `SILENT_WAV_DATA_URI` const in `js/mediaSession.js:25`; do not duplicate the base64 string.
- Keep `anchorStartTimer = setTimeout` shapes with `800` in `js/mediaSession.js` and `setTimeout` with `100` in `js/main.js` so timer-presence tests keep passing; add guards inside.
- Never add `window.addEventListener("focus"` in `js/main.js` and never add `capture: true` there.
- Keep hardware combo window `2500` and `togglePlaybackMode()` calls in nexttrack, previoustrack, seekforward, seekbackward handlers.

---

### Task 1: Update existing call-behavior tests to paused plus 1.0

**Files:**
- Modify: `tests/test_media_session_engine.py:129-134`
- Modify: `tests/test_media_session_engine.py:389-394`
- Modify: `tests/test_media_session_engine.py:270-286`
- Modify: `tests/test_media_session_engine.py:402-412`

**Interfaces:**
- Consumes: current regex expectations for 100 ms re-assert, 800 ms anchor schedule, devicechange playing ternary, micro-rate devicechange position.
- Produces: new failing expectations that Tasks 2 and 3 must satisfy: paused in call path, rate 1.0 in call path, guarded timers.

- [ ] **Step 1: Write the failing test for guarded 100 ms re-assert**

Replace the body of `test_pause_listener_mode2_delayed_reassertion` with a version that still requires the 100 ms timer shape but also requires an isCallActive guard in the same pause listener:

```python
def test_pause_listener_mode2_delayed_reassertion(self):
    """audioPlayer pause event listener re-asserts playing state after 100ms in Mode 2"""
    self.assertRegex(
        self.main_content,
        r'audioPlayer\.addEventListener\(\s*[\'"]pause[\'"][\s\S]*?setTimeout\(\s*\(\)\s*=>\s*\{[\s\S]*?window\.playbackMode\s*===\s*[\'"]mode2[\'"][\s\S]*?playbackState\s*=\s*[\'"]playing[\'"][\s\S]*?100\s*\);'
    )
    self.assertRegex(
        self.main_content,
        r'audioPlayer\.addEventListener\(\s*[\'"]pause[\'"][\s\S]*?!\s*window\.isCallActive[\s\S]*?100\s*\)'
    )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest tests.test_media_session_engine.TestMediaSessionEngine.test_pause_listener_mode2_delayed_reassertion -v`
Expected: FAIL because `!window.isCallActive` is not yet in the main.js pause listener.

- [ ] **Step 3: Write the failing test for guarded 800 ms anchor schedule**

Replace the body of `test_mode2_anchor_scheduling_on_pause` with a version that keeps the 800 shape and requires the isCallActive plus isRecentBtDisconnect guard:

```python
def test_mode2_anchor_scheduling_on_pause(self):
    """Mode 2 schedules live audio anchor after 800ms on audioPlayer pause"""
    self.assertRegex(
        self.ms_content,
        r'audioPlayer\.addEventListener\(\s*[\'"]pause[\'"][\s\S]*?anchorStartTimer\s*=\s*setTimeout\(\s*\(\)\s*=>\s*\{[\s\S]*?startLiveAudioAnchor\(\);[\s\S]*?800\s*\)'
    )
    self.assertRegex(
        self.ms_content,
        r'audioPlayer\.addEventListener\(\s*[\'"]pause[\'"][\s\S]*?window\.playbackMode\s*===\s*[\'"]mode2[\'"]\s*&&\s*!window\.isCallActive\s*&&\s*!isRecentBtDisconnect'
    )
```

- [ ] **Step 4: Run test to verify it fails**

Run: `python -m unittest tests.test_media_session_engine.TestMediaSessionEngine.test_mode2_anchor_scheduling_on_pause -v`
Expected: FAIL because the pause listener condition does not yet include `!window.isCallActive`.

- [ ] **Step 5: Write the failing test for synchronous call pause**

Replace the bodies of `test_bt_disconnect_stops_anchor_and_watchdog` playbackState assertion and `test_phone_call_accepted_mode2_preserves_playing_state` so the devicechange count-change path expects paused plus rate 1.0:

```python
self.assertRegex(
    self.ms_content,
    r'newCount\s*<\s*knownOutputCount[\s\S]*?navigator\.mediaSession\.playbackState\s*=\s*[\'"]paused[\'"];'
)
self.assertRegex(
    self.ms_content,
    r'newCount\s*<\s*knownOutputCount[\s\S]*?updateMediaSessionPosition\(\s*pos\s*,\s*dur\s*,\s*1\.0\s*\)'
)
```

Keep the surrounding assertions in those two tests for `stopLiveAudioAnchor();`, `window.isCallActive = true;`, `knownOutputCount`, and `devicechange` unchanged. Delete the old mode2 ternary playbackState assertion and the old micro-rate ternary assertion from the devicechange scope only; do not touch the steady-state micro-rate test at `test_micro_rate_scoped_to_mobile` or the toggle-mode micro-rate test.

- [ ] **Step 6: Run tests to verify they fail**

Run: `python -m unittest tests.test_media_session_engine.TestMediaSessionEngine.test_bt_disconnect_stops_anchor_and_watchdog tests.test_media_session_engine.TestMediaSessionEngine.test_phone_call_accepted_mode2_preserves_playing_state -v`
Expected: FAIL because `js/mediaSession.js:474` still sets the mode2 ternary to playing with micro-rate.

- [ ] **Step 7: Verify working tree only**

Run: `git status --short`
Expected: only `tests/test_media_session_engine.py` modified; no commits created.

### Task 2: Make devicechange call path synchronously paused

**Files:**
- Modify: `js/mediaSession.js:446-490`
- Test: `tests/test_media_session_engine.py`

**Interfaces:**
- Consumes: `window.isCallActive`, `anchorStartTimer`, `audioPlayer.instantPause`, `stopLiveAudioAnchor`, `cancelAutoKillWatchdog`, `setPlayUI`, `updateMediaSessionPosition`.
- Produces: synchronous paused call entry that Task 3 timer guards and Task 5 probe handler rely on.

- [ ] **Step 1: Write the minimal implementation**

In `js/mediaSession.js`, inside the `newCount < knownOutputCount || newCount > knownOutputCount` branch, replace this block:

```javascript
if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
    navigator.mediaSession.playbackState = (window.playbackMode === 'mode2') ? 'playing' : 'paused';
```

with this block:

```javascript
if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
    navigator.mediaSession.playbackState = 'paused';
```

In the same branch, replace this block:

```javascript
if (typeof updateMediaSessionPosition === 'function') {
    updateMediaSessionPosition(pos, dur, (window.playbackMode === 'mode2' && typeof isMobileDevice !== 'undefined' && isMobileDevice) ? 0.00001 : 1.0);
}
```

with this block:

```javascript
if (typeof updateMediaSessionPosition === 'function') {
    updateMediaSessionPosition(pos, dur, 1.0);
}
```

Do not change the earlier lines in the same branch that clear `anchorStartTimer`, call `instantPause`, set `wasPausedByUser` and `wasPlayingBeforeCall`, call `stopLiveAudioAnchor`, `cancelAutoKillWatchdog`, or `setPlayUI(false)`. Do not change the steady-state micro-rate logic in `updateMediaSessionPosition` itself.

- [ ] **Step 2: Run the call-path tests to verify they pass**

Run: `python -m unittest tests.test_media_session_engine.TestMediaSessionEngine.test_bt_disconnect_stops_anchor_and_watchdog tests.test_media_session_engine.TestMediaSessionEngine.test_phone_call_accepted_mode2_preserves_playing_state -v`
Expected: PASS.

- [ ] **Step 3: Verify working tree only**

Run: `git status --short`
Expected: `js/mediaSession.js` and `tests/test_media_session_engine.py` modified; no commits created.

### Task 3: Guard both delayed re-assert timers with isCallActive

**Files:**
- Modify: `js/mediaSession.js:530-537`
- Modify: `js/main.js:448-453`
- Test: `tests/test_media_session_engine.py`

**Interfaces:**
- Consumes: Task 2 paused call entry, `window.lastBtDisconnectTime`, `window.wasPausedByUser`.
- Produces: timers that cannot re-assert playing during a call.

- [ ] **Step 1: Write the minimal implementation in mediaSession.js**

In `js/mediaSession.js`, replace this block:

```javascript
anchorStartTimer = setTimeout(() => {
    const isStillBtDisconnect = (typeof window.lastBtDisconnectTime === 'number' && Date.now() - window.lastBtDisconnectTime < 2500);
    if (window.playbackMode === 'mode2' && audioPlayer.paused && !window.isCallActive && !isStillBtDisconnect) {
        startLiveAudioAnchor();
        armAutoKillWatchdog();
    }
}, 800);
```

with this block:

```javascript
anchorStartTimer = setTimeout(() => {
    if (window.isCallActive) return;
    const isStillBtDisconnect = (typeof window.lastBtDisconnectTime === 'number' && Date.now() - window.lastBtDisconnectTime < 2500);
    if (window.playbackMode === 'mode2' && audioPlayer.paused && !window.isCallActive && !isStillBtDisconnect) {
        startLiveAudioAnchor();
        armAutoKillWatchdog();
    }
}, 800);
```

The outer `if (window.playbackMode === 'mode2' && !window.isCallActive && !isRecentBtDisconnect)` above this timer stays unchanged.

- [ ] **Step 2: Write the minimal implementation in main.js**

In `js/main.js`, replace this block:

```javascript
setTimeout(() => {
    const isStillBtDisconnect = (typeof window.lastBtDisconnectTime === 'number' && Date.now() - window.lastBtDisconnectTime < 2500);
    if (window.playbackMode === 'mode2' && hasMediaSession && !isStillBtDisconnect && window.wasPausedByUser) {
        navigator.mediaSession.playbackState = 'playing';
    }
}, 100);
```

with this block:

```javascript
setTimeout(() => {
    if (window.isCallActive) return;
    const isStillBtDisconnect = (typeof window.lastBtDisconnectTime === 'number' && Date.now() - window.lastBtDisconnectTime < 2500);
    if (window.playbackMode === 'mode2' && hasMediaSession && !window.isCallActive && !isStillBtDisconnect && window.wasPausedByUser) {
        navigator.mediaSession.playbackState = 'playing';
    }
}, 100);
```

- [ ] **Step 3: Run timer tests to verify they pass**

Run: `python -m unittest tests.test_media_session_engine.TestMediaSessionEngine.test_pause_listener_mode2_delayed_reassertion tests.test_media_session_engine.TestMediaSessionEngine.test_mode2_anchor_scheduling_on_pause tests.test_media_session_engine.TestMediaSessionEngine.test_mode2_pause_arms_anchor_and_watchdog -v`
Expected: PASS.

- [ ] **Step 4: Verify working tree only**

Run: `git status --short`
Expected: `js/mediaSession.js`, `js/main.js`, and `tests/test_media_session_engine.py` modified; no commits created.

### Task 4: Add focus-probe element and lifecycle functions

**Files:**
- Modify: `index.html:208`
- Modify: `js/mediaSession.js:23-30`
- Test: `tests/test_settings_markup.py:178-184`

**Interfaces:**
- Consumes: existing `SILENT_WAV_DATA_URI` at `js/mediaSession.js:25`.
- Produces: `focus-probe` DOM node plus `startFocusProbe`, `stopFocusProbe`, and `primeFocusProbe` globals used by Task 5.

- [ ] **Step 1: Write the failing markup test**

Append this test after `test_live_stream_anchor` in `tests/test_settings_markup.py`:

```python
def test_focus_probe_element(self):
    """Hidden focus probe audio element for external-steal detection"""
    probe_match = re.search(r'<audio[^>]*id=["\']focus-probe["\'][^>]*>', self.html_content)
    self.assertIsNotNone(probe_match, "Could not find #focus-probe")
    probe_tag = probe_match.group(0)
    self.assertIn('loop', probe_tag)
    self.assertIn('display:none', probe_tag.replace(' ', ''))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest tests.test_settings_markup.TestSettingsMarkup.test_focus_probe_element -v`
Expected: FAIL with "Could not find #focus-probe". Use the exact test class name from `tests/test_settings_markup.py`; if the runner reports no such test, list tests with `python -m unittest discover -s tests -p "test_settings_markup.py" -v` and run the discovered class name instead.

- [ ] **Step 3: Write the minimal markup implementation**

In `index.html`, replace this line:

```html
<audio id="live-stream-anchor" preload="none" style="display:none;"></audio>
```

with these lines:

```html
<audio id="live-stream-anchor" preload="none" style="display:none;"></audio>
<audio id="focus-probe" loop preload="auto" style="display:none;"></audio>
```

- [ ] **Step 4: Write the minimal probe lifecycle implementation**

In `js/mediaSession.js`, immediately after the `window.teardownLiveAudioAnchor = teardownLiveAudioAnchor;` line near `js/mediaSession.js:220-223`, insert this block with no emojis:

```javascript
let focusProbePrimed = false;

function primeFocusProbe() {
    const probeEl = document.getElementById("focus-probe");
    if (!probeEl || focusProbePrimed) return;
    if (!probeEl.src) {
        probeEl.src = SILENT_WAV_DATA_URI;
    }
    probeEl.volume = 0;
    probeEl.loop = true;
    probeEl.play().then(() => {
        probeEl.pause();
        focusProbePrimed = true;
    }).catch(() => {});
}

function startFocusProbe() {
    if (typeof isMobileDevice !== 'undefined' && !isMobileDevice) return;
    if (window.playbackMode !== 'mode2') return;
    if (window.isCallActive) return;
    const probeEl = document.getElementById("focus-probe");
    if (!probeEl) return;
    if (!probeEl.src) {
        probeEl.src = SILENT_WAV_DATA_URI;
    }
    probeEl.volume = 0;
    probeEl.loop = true;
    probeEl.play().catch(() => {});
}

function stopFocusProbe() {
    const probeEl = document.getElementById("focus-probe");
    if (probeEl && !probeEl.paused) {
        try {
            probeEl.pause();
        } catch (e) {}
    }
}

window.primeFocusProbe = primeFocusProbe;
window.startFocusProbe = startFocusProbe;
window.stopFocusProbe = stopFocusProbe;
```

Reuse `SILENT_WAV_DATA_URI`; do not paste a second base64 string. Keep the audio element visually hidden so zero-GPU CSS behavior is unchanged.

- [ ] **Step 5: Run markup test to verify it passes**

Run: `python -m unittest tests.test_settings_markup.TestSettingsMarkup.test_focus_probe_element -v`
Expected: PASS.

- [ ] **Step 6: Verify working tree only**

Run: `git status --short`
Expected: `index.html`, `js/mediaSession.js`, and `tests/test_settings_markup.py` modified; no commits created.

### Task 5: Wire probe priming and external-steal transition

**Files:**
- Modify: `js/mediaSession.js:264-310`
- Modify: `js/mediaSession.js:498-543`
- Modify: `js/main.js:265-301`

**Interfaces:**
- Consumes: Task 4 `primeFocusProbe`, `startFocusProbe`, `stopFocusProbe`; existing `togglePlaybackMode`, audioPlayer play and pause listeners, btnPlayPause handler.
- Produces: keepalive by default with a confirmed-steal transition to paused plus 1.0.

- [ ] **Step 1: Write the minimal toggle wiring**

In `togglePlaybackMode` in `js/mediaSession.js`, inside the `if (newMode === 'mode2')` paused branch that already calls `startLiveAudioAnchor()` and `armAutoKillWatchdog()`, add probe priming and start calls immediately after `startLiveAudioAnchor();`:

```javascript
if (typeof primeFocusProbe === 'function') primeFocusProbe();
if (typeof startFocusProbe === 'function') startFocusProbe();
```

In the `else` Mode 1 branch that already calls `teardownLiveAudioAnchor()` and `cancelAutoKillWatchdog()`, add immediately after `cancelAutoKillWatchdog();`:

```javascript
if (typeof stopFocusProbe === 'function') stopFocusProbe();
```

- [ ] **Step 2: Write the minimal play and pause listener wiring**

In the `audioPlayer.addEventListener('play', ...)` handler near `js/mediaSession.js:501-508`, add after `cancelAutoKillWatchdog();`:

```javascript
if (typeof stopFocusProbe === 'function') stopFocusProbe();
```

In the Mode 2 pause scheduler near `js/mediaSession.js:531-537`, inside the timeout after `armAutoKillWatchdog();`, add:

```javascript
if (typeof startFocusProbe === 'function') startFocusProbe();
```

In the `else` non-Mode-2 branch near `js/mediaSession.js:538-541` that already calls `stopLiveAudioAnchor()` and `cancelAutoKillWatchdog()`, add:

```javascript
if (typeof stopFocusProbe === 'function') stopFocusProbe();
```

In `js/main.js` `btnPlayPause` click handler, inside the existing mobile `initLiveAudioAnchor` guard near `js/main.js:266-268`, add after `initLiveAudioAnchor();`:

```javascript
if (typeof primeFocusProbe === 'function') primeFocusProbe();
```

- [ ] **Step 3: Write the minimal probe pause transition**

In `js/mediaSession.js`, immediately before the `// Media Session Global Action Handlers` comment near line 545, insert this block:

```javascript
(function bindFocusProbeHandler() {
    const probeEl = document.getElementById("focus-probe");
    if (!probeEl || probeEl._boundFocusProbe) return;
    probeEl._boundFocusProbe = true;
    probeEl.addEventListener("pause", () => {
        const isRecentBtDisconnect = (typeof window.lastBtDisconnectTime === 'number' && Date.now() - window.lastBtDisconnectTime < 2500);
        if (window.playbackMode === 'mode2' && typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.paused && window.wasPausedByUser && !window.isCallActive && !isRecentBtDisconnect) {
            stopLiveAudioAnchor();
            cancelAutoKillWatchdog();
            if (typeof setPlayUI === 'function') setPlayUI(false);
            if (typeof hasMediaSession !== 'undefined' && hasMediaSession) {
                navigator.mediaSession.playbackState = 'paused';
                const dur = (typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.duration) || (typeof seekBar !== 'undefined' && parseFloat(seekBar.max)) || 0;
                const pos = (typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.currentTime) || 0;
                updateMediaSessionPosition(pos, dur, 1.0);
            }
        }
    });
    probeEl.addEventListener("mute", () => {});
    probeEl.addEventListener("unmute", () => {});
})();
```

This handler deliberately does not auto-play anything; it only makes the drawer Play button resumable. The script tags load synchronously at the end of `index.html`, so `getElementById` is valid here; the `_boundFocusProbe` flag keeps rebinding safe.

- [ ] **Step 4: Run the full Python suite**

Run: `python -m unittest discover -s tests -p "test_*.py"`
Expected: PASS. If the markup class name differs, the failure message names the correct class; fix only the run command, not the plan intent.

- [ ] **Step 5: Verify working tree only**

Run: `git status --short`
Expected: `js/mediaSession.js` and `js/main.js` modified; no commits created.

### Task 6: Add probe regression tests and manual verification

**Files:**
- Modify: `tests/test_media_session_engine.py`
- Test: full suite plus manual Android checks

**Interfaces:**
- Consumes: Tasks 1 through 5 behavior.
- Produces: locked regression coverage and a manual pass checklist.

- [ ] **Step 1: Write the failing probe tests**

Append these three tests to the `TestMediaSessionEngine` class in `tests/test_media_session_engine.py`:

```python
def test_focus_probe_lifecycle_defined(self):
    """focus probe prime/start/stop helpers are defined and exposed"""
    self.assertRegex(self.ms_content, r'function\s+primeFocusProbe\s*\(\s*\)')
    self.assertRegex(self.ms_content, r'function\s+startFocusProbe\s*\(\s*\)')
    self.assertRegex(self.ms_content, r'function\s+stopFocusProbe\s*\(\s*\)')
    self.assertIn('window.primeFocusProbe = primeFocusProbe;', self.ms_content)
    self.assertIn('window.startFocusProbe = startFocusProbe;', self.ms_content)
    self.assertIn('window.stopFocusProbe = stopFocusProbe;', self.ms_content)

def test_focus_probe_uses_silent_wav_and_hidden_element(self):
    """focus probe reuses silent WAV URI and binds native pause"""
    self.assertIn('getElementById("focus-probe")', self.ms_content)
    self.assertIn('SILENT_WAV_DATA_URI', self.ms_content)
    self.assertRegex(self.ms_content, r'probeEl\.addEventListener\(\s*[\'"]pause[\'"]')

def test_focus_probe_pause_transitions_to_paused(self):
    """probe pause while Mode-2 paused stops anchor and sets paused plus 1.0"""
    self.assertRegex(
        self.ms_content,
        r'probeEl\.addEventListener\(\s*[\'"]pause[\'"][\s\S]*?stopLiveAudioAnchor\(\);[\s\S]*?playbackState\s*=\s*[\'"]paused[\'"];[\s\S]*?updateMediaSessionPosition\(\s*pos\s*,\s*dur\s*,\s*1\.0\s*\)'
    )
```

- [ ] **Step 2: Run new tests to verify they pass**

Run: `python -m unittest tests.test_media_session_engine.TestMediaSessionEngine.test_focus_probe_lifecycle_defined tests.test_media_session_engine.TestMediaSessionEngine.test_focus_probe_uses_silent_wav_and_hidden_element tests.test_media_session_engine.TestMediaSessionEngine.test_focus_probe_pause_transitions_to_paused -v`
Expected: PASS because Task 4 and Task 5 already added the code; if any test was added before its code in a reordered execution, expect FAIL first, then implement the missing helper and rerun.

- [ ] **Step 3: Run the full suite**

Run: `python -m unittest discover -s tests -p "test_*.py"`
Expected: all tests PASS, including the 123-test total. If the count differs, report the actual count and the failing test names without changing unrelated tests.

- [ ] **Step 4: Run manual Android verification and record results**

Check each item on a real Android Chromium device; do not mark this step complete from emulator reasoning alone:
1. Mode 2 paused plus incoming call stays paused with no anchor sound leak and no 100 ms or 800 ms flip back to playing.
2. Mode 2 paused plus YouTube video steal transitions the drawer card to a working Play button that resumes in one tap.
3. Mode 2 paused with no steal keeps the drawer widget pinned with anchor running.
4. Mode 1 behavior is unchanged.

- [ ] **Step 5: Verify working tree only**

Run: `git status --short`
Expected: `index.html`, `js/main.js`, `js/mediaSession.js`, `tests/test_media_session_engine.py`, `tests/test_settings_markup.py`, and plan plus spec docs modified or untracked; no commits created.

## Self-Review

- Spec coverage: Section 1 maps to Tasks 1 through 3; Section 2 maps to Tasks 4 and 5; Section 3 maps to Task 6. No spec requirement lacks a task.
- Placeholder scan: no TBD, TODO, or fill-in-later language; every code step has exact old and new snippets; every test step has an exact run command and expected outcome.
- Type consistency: `primeFocusProbe`, `startFocusProbe`, and `stopFocusProbe` take no parameters and return undefined across Tasks 4 through 6; `pos` and `dur` remain numbers passed to `updateMediaSessionPosition(pos, dur, 1.0)`; `focus-probe` is the single new DOM id.
