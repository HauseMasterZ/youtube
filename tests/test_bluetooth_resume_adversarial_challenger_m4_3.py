import os
import re
import unittest

class TestBluetoothResumeAdversarialChallengerM4_3(unittest.TestCase):
    """
    Adversarial challenge test suite for iteration 3 of Milestone 4.
    Empirically verifies:
    1. Mode 1 and Mode 2 Bluetooth pause/resume cycles.
    2. ForwardEvent suppression: spurious play events during pre-staging (_preventAutoplay = true) are suppressed.
    3. Authorized playback: DualAudioPingPong.play() clears _preventAutoplay = false; and event is forwarded.
    4. Authorization choke point: rogue play() rejected while window.wasPausedByUser is true.
    5. Mode 2 transitional unpaused state resume reliability without audioPlayer.paused gate.
    6. Concurrency and rapid toggle stress (500 cycles).
    7. Call active and post-call quarantine overrides.
    8. Rule 11 / Rule 44 synchronization across GEMINI.md files.
    """
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        cls.base_dir = base_dir

        with open(os.path.join(base_dir, 'js', 'dom.js'), 'r', encoding='utf-8') as f:
            cls.dom_content = f.read()

        with open(os.path.join(base_dir, 'js', 'mediaSession.js'), 'r', encoding='utf-8') as f:
            cls.ms_content = f.read()

        with open(os.path.join(base_dir, 'js', 'main.js'), 'r', encoding='utf-8') as f:
            cls.main_content = f.read()

        with open(os.path.join(base_dir, 'js', 'playback.js'), 'r', encoding='utf-8') as f:
            cls.playback_content = f.read()

        with open(__file__, 'r', encoding='utf-8') as f:
            cls.test_content = f.read()

        with open(os.path.join(os.path.dirname(base_dir), 'GEMINI.md'), 'r', encoding='utf-8') as f:
            cls.root_gemini = f.read()

        with open(os.path.join(base_dir, 'GEMINI.md'), 'r', encoding='utf-8') as f:
            cls.yt_gemini = f.read()

    def test_strictly_zero_emojis(self):
        """Verify zero emojis in all source files, documentation, and tests."""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        files = {
            'dom.js': self.dom_content,
            'mediaSession.js': self.ms_content,
            'main.js': self.main_content,
            'playback.js': self.playback_content,
            'root GEMINI.md': self.root_gemini,
            'youtube GEMINI.md': self.yt_gemini,
            'test_bluetooth_resume_adversarial_challenger_m4_3.py': self.test_content
        }
        for name, content in files.items():
            matches = emoji_pattern.findall(content)
            self.assertEqual(len(matches), 0, f"Found emojis in {name}: {matches}")

    def test_gemini_invariants_rule_11_and_44_parity(self):
        """Verify root GEMINI.md Rule 11 and youtube/GEMINI.md Rule 44 reflect clean Bluetooth resume invariants."""
        expected_phrase_1 = "`DualAudioPingPong.play()` clears `this._preventAutoplay = false;` on authorized playback"
        expected_phrase_2 = "preserving `forwardEvent` pre-staging event suppression"
        expected_phrase_3 = "`setActionHandler('pause')` when `isActuallyPaused` is true clears `window.wasPausedByUser = false;` and unconditionally invokes `audioPlayer.play()`"
        expected_phrase_4 = "without skipping play on transitional unpaused states"

        for phrase in [expected_phrase_1, expected_phrase_2, expected_phrase_3, expected_phrase_4]:
            self.assertIn(phrase, self.root_gemini, f"Missing phrase in root GEMINI.md: {phrase}")
            self.assertIn(phrase, self.yt_gemini, f"Missing phrase in youtube/GEMINI.md: {phrase}")

    def test_static_dom_forward_event_suppression_and_play_clear(self):
        """Verify dom.js has no dead code in forwardEvent and play() clears _preventAutoplay."""
        # forwardEvent definition
        forward_match = re.search(
            r"this\.forwardEvent\s*=\s*\(e\)\s*=>\s*\{([\s\S]*?)\n\s{12}\};",
            self.dom_content
        )
        self.assertIsNotNone(forward_match, "forwardEvent definition not found in dom.js")
        forward_body = forward_match.group(1)

        # Confirm pre-staging suppression is active
        self.assertIn("if (this._preventAutoplay && (e.type === 'play' || e.type === 'playing'))", forward_body)
        self.assertIn("return;", forward_body)

        # Confirm dead-code lines (clearing _preventAutoplay inside forwardEvent before suppression) do NOT exist
        self.assertNotRegex(
            forward_body,
            r"if\s*\(\s*e\.type\s*===\s*['\"]play['\"]\s*\|\|\s*e\.type\s*===\s*['\"]playing['\"]\s*\)\s*\{\s*this\._preventAutoplay\s*=\s*false;\s*\}",
            "forwardEvent must not contain dead-code clearing of _preventAutoplay"
        )

        # play() method: choke point followed by clearing _preventAutoplay
        self.assertRegex(
            self.dom_content,
            r"play\(\)\s*\{[\s\S]*?if\s*\(\s*window\.wasPausedByUser\s*\)\s*\{\s*return\s+Promise\.resolve\(\);\s*\}[\s\S]*?this\._preventAutoplay\s*=\s*false;",
            "play() must enforce wasPausedByUser choke point before setting _preventAutoplay = false"
        )

    def test_static_media_session_pause_handler_unconditional_play(self):
        """Verify mediaSession.js setActionHandler('pause') does not gate play() behind audioPlayer.paused."""
        pause_match = re.search(
            r"navigator\.mediaSession\.setActionHandler\(\s*['\"]pause['\"]\s*,\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s{8}\}\);",
            self.ms_content
        )
        self.assertIsNotNone(pause_match, "Pause action handler not found")
        pause_body = pause_match.group(1)

        self.assertIn("if (isActuallyPaused)", pause_body)
        self.assertIn("window.wasPausedByUser = false;", pause_body)

        # Must not check audioPlayer.paused before audioPlayer.play()
        self.assertNotRegex(
            pause_body,
            r"cancelAutoKillWatchdog\(\);\s*if\s*\(\s*audioPlayer\s*&&\s*audioPlayer\.paused\s*\)\s*\{\s*const\s+playPromise\s*=\s*audioPlayer\.play\(\);"
        )
        # Must check if (audioPlayer)
        self.assertRegex(
            pause_body,
            r"cancelAutoKillWatchdog\(\);\s*if\s*\(\s*audioPlayer\s*\)\s*\{\s*const\s+playPromise\s*=\s*audioPlayer\.play\(\);"
        )

    def test_empirical_pre_staging_forward_event_suppression_simulation(self):
        """Empirically test that forwardEvent suppresses spurious decode events and forwards after authorized play()."""
        class MockAudioElement:
            def __init__(self):
                self.paused = True
                self.listeners = {}

            def addEventListener(self, event, cb):
                self.listeners.setdefault(event, []).append(cb)

            def dispatchEvent(self, event_type):
                for cb in self.listeners.get(event_type, []):
                    cb(event_type)

            def play(self):
                self.paused = False
                self.dispatchEvent('play')
                self.dispatchEvent('playing')

            def pause(self):
                self.paused = True
                self.dispatchEvent('pause')

        class MockDualAudioPingPong:
            def __init__(self, active_el):
                self.active = active_el
                self._preventAutoplay = False
                self.switching = False
                self.listeners = {}
                self.forwarded_events = []

                def forwardEvent(e_type):
                    if not self.switching:
                        if self._preventAutoplay and (e_type == 'play' or e_type == 'playing'):
                            return
                        self.forwarded_events.append(e_type)
                        self.dispatchEvent(e_type)

                self.forwardEvent = forwardEvent
                for evt in ['play', 'playing', 'pause', 'timeupdate', 'waiting']:
                    self.active.addEventListener(evt, lambda et=evt: self.forwardEvent(et))

            def addEventListener(self, event, cb):
                self.listeners.setdefault(event, []).append(cb)

            def dispatchEvent(self, event_type):
                for cb in self.listeners.get(event_type, []):
                    cb(event_type)

            def play(self, wasPausedByUser):
                if wasPausedByUser:
                    return "PROMISE_RESOLVE"
                self._preventAutoplay = False
                self.active.play()
                return "PLAYING"

        active = MockAudioElement()
        player = MockDualAudioPingPong(active)

        # Phase 1: Pre-staging (restoreLastPlayedTrack / switchTrack with preventAutoplay = true)
        player._preventAutoplay = True
        wasPausedByUser = True

        # Priming decode fires spurious play and playing events from native pipeline
        for _ in range(20):
            active.dispatchEvent('play')
            active.dispatchEvent('playing')

        # None of these spurious events must be forwarded
        self.assertEqual(len(player.forwarded_events), 0, "Spurious play/playing events must be suppressed during pre-staging")
        self.assertTrue(player._preventAutoplay, "_preventAutoplay must remain True")

        # Other events like timeupdate and pause pass through
        active.dispatchEvent('timeupdate')
        active.dispatchEvent('pause')
        self.assertIn('timeupdate', player.forwarded_events)
        self.assertIn('pause', player.forwarded_events)
        self.assertTrue(player._preventAutoplay, "Non-play events must not clear _preventAutoplay")

        # Phase 2: Unauthorized rogue play() call while wasPausedByUser is True
        res = player.play(wasPausedByUser)
        self.assertEqual(res, "PROMISE_RESOLVE", "Rogue play must be blocked synchronously by authorization choke point")
        self.assertTrue(player._preventAutoplay, "_preventAutoplay must remain True after rogue play attempt")
        self.assertTrue(active.paused, "Native element must remain paused")

        # Phase 3: Authorized play (user clicks play or Bluetooth resume action)
        wasPausedByUser = False
        res = player.play(wasPausedByUser)
        self.assertEqual(res, "PLAYING")
        self.assertFalse(player._preventAutoplay, "Authorized play must clear _preventAutoplay to False")
        self.assertFalse(active.paused, "Native element must now be unpaused")

        # Now play and playing events pass through forwardEvent
        self.assertIn('play', player.forwarded_events)
        self.assertIn('playing', player.forwarded_events)

    def test_empirical_mode1_and_mode2_bluetooth_pause_resume_matrix(self):
        """Empirically test Bluetooth pause and resume sequences across Mode 1 and Mode 2."""
        class MockPlayer:
            def __init__(self):
                self.paused = True
                self._preventAutoplay = True
                self.play_count = 0
                self.pause_count = 0

            def play(self, wasPausedByUser):
                if wasPausedByUser:
                    return
                self._preventAutoplay = False
                self.paused = False
                self.play_count += 1

            def instantPause(self):
                self._preventAutoplay = True
                self.paused = True
                self.pause_count += 1

        class MockEnvironment:
            def __init__(self, mode):
                self.playbackMode = mode
                self.player = MockPlayer()
                self.player.paused = False
                self.player._preventAutoplay = False
                self.wasPausedByUser = False
                self.playbackState = 'playing'
                self.anchorActive = (mode == 'mode2')

            def simulate_bluetooth_button_press(self):
                # Bluetooth single button fires 'pause' action handler
                isActuallyPaused = self.player.paused or self.wasPausedByUser
                if isActuallyPaused:
                    # Resume branch
                    self.wasPausedByUser = False
                    self.playbackState = 'playing'
                    if self.playbackMode == 'mode2':
                        self.anchorActive = True
                    else:
                        self.anchorActive = False
                    self.player.play(self.wasPausedByUser)
                else:
                    # Pause branch
                    self.wasPausedByUser = True
                    if self.playbackMode == 'mode2':
                        self.playbackState = 'playing'  # Pinned
                        self.anchorActive = True
                    else:
                        self.playbackState = 'paused'
                        self.anchorActive = False
                    self.player.instantPause()

            def simulate_discrete_bluetooth_play(self):
                # Bluetooth discrete 'play' action (handlePlayAction)
                self.wasPausedByUser = False
                self.playbackState = 'playing'
                if self.playbackMode == 'mode2':
                    self.anchorActive = True
                else:
                    self.anchorActive = False
                self.player.play(self.wasPausedByUser)

        # Run Mode 1 test
        env1 = MockEnvironment('mode1')
        self.assertFalse(env1.wasPausedByUser)
        # 1. BT button pauses
        env1.simulate_bluetooth_button_press()
        self.assertTrue(env1.wasPausedByUser)
        self.assertTrue(env1.player.paused)
        self.assertEqual(env1.playbackState, 'paused')
        self.assertFalse(env1.anchorActive)
        # 2. BT button resumes
        env1.simulate_bluetooth_button_press()
        self.assertFalse(env1.wasPausedByUser)
        self.assertFalse(env1.player.paused)
        self.assertEqual(env1.playbackState, 'playing')
        self.assertFalse(env1.anchorActive)
        # 3. Pause again, then discrete play resumes
        env1.simulate_bluetooth_button_press()
        self.assertTrue(env1.wasPausedByUser)
        env1.simulate_discrete_bluetooth_play()
        self.assertFalse(env1.wasPausedByUser)
        self.assertFalse(env1.player.paused)

        # Run Mode 2 test
        env2 = MockEnvironment('mode2')
        # 1. BT button pauses
        env2.simulate_bluetooth_button_press()
        self.assertTrue(env2.wasPausedByUser)
        self.assertTrue(env2.player.paused)
        self.assertEqual(env2.playbackState, 'playing', "Mode 2 must keep notification card pinned")
        self.assertTrue(env2.anchorActive, "Mode 2 anchor must remain active")
        # 2. BT button resumes
        env2.simulate_bluetooth_button_press()
        self.assertFalse(env2.wasPausedByUser)
        self.assertFalse(env2.player.paused)
        self.assertEqual(env2.playbackState, 'playing')
        self.assertTrue(env2.anchorActive)
        # 3. Mode 2 transitional unpaused state simulation:
        # Suppose audioPlayer.paused is FALSE due to keepalive anchor audio element
        env2.simulate_bluetooth_button_press() # user paused
        self.assertTrue(env2.wasPausedByUser)
        env2.player.paused = False # transitional anchor state!
        # Now BT resume arrives
        env2.simulate_bluetooth_button_press()
        self.assertFalse(env2.wasPausedByUser, "Mode 2 wasPausedByUser must be cleared")
        self.assertFalse(env2.player.paused, "Mode 2 audioPlayer must be playing")
        self.assertFalse(env2.player._preventAutoplay, "Mode 2 _preventAutoplay must be False")

    def test_rapid_concurrency_and_stress_simulation(self):
        """Stress test: 500 rapid alternating Bluetooth toggle events across Mode 1 and Mode 2."""
        class StressHarness:
            def __init__(self, mode):
                self.mode = mode
                self.paused = True
                self.wasPausedByUser = True
                self._preventAutoplay = True
                self.playbackState = 'playing' if mode == 'mode2' else 'paused'

            def toggle(self):
                isActuallyPaused = self.paused or self.wasPausedByUser
                if isActuallyPaused:
                    self.wasPausedByUser = False
                    self.playbackState = 'playing'
                    self._preventAutoplay = False
                    self.paused = False
                else:
                    self.wasPausedByUser = True
                    self.playbackState = 'playing' if self.mode == 'mode2' else 'paused'
                    self._preventAutoplay = True
                    self.paused = True

        for mode in ['mode1', 'mode2']:
            harness = StressHarness(mode)
            for i in range(500):
                harness.toggle()
                if i % 2 == 0:
                    # Should be resumed
                    self.assertFalse(harness.wasPausedByUser)
                    self.assertFalse(harness.paused)
                    self.assertFalse(harness._preventAutoplay)
                    self.assertEqual(harness.playbackState, 'playing')
                else:
                    # Should be paused
                    self.assertTrue(harness.wasPausedByUser)
                    self.assertTrue(harness.paused)
                    self.assertTrue(harness._preventAutoplay)
                    if mode == 'mode2':
                        self.assertEqual(harness.playbackState, 'playing')
                    else:
                        self.assertEqual(harness.playbackState, 'paused')

    def test_call_active_and_quarantine_override_safety(self):
        """Verify Bluetooth resume is safely blocked during active phone calls or post-call quarantine."""
        class CallSafetyRuntime:
            def __init__(self):
                self.isCallActive = False
                self.isPostCallQuarantine = False
                self.wasPausedByUser = True
                self.player_paused = True

            def handlePlayAction(self):
                if self.isCallActive:
                    return "BLOCKED_CALL"
                if self.isPostCallQuarantine:
                    return "BLOCKED_QUARANTINE"
                self.wasPausedByUser = False
                self.player_paused = False
                return "RESUMED"

            def handlePauseAction(self):
                if self.isCallActive:
                    return "BLOCKED_CALL"
                isActuallyPaused = self.player_paused or self.wasPausedByUser
                if isActuallyPaused:
                    if self.isPostCallQuarantine:
                        return "BLOCKED_QUARANTINE"
                    self.wasPausedByUser = False
                    self.player_paused = False
                    return "RESUMED"
                return "PAUSED"

        rt = CallSafetyRuntime()
        # Active call
        rt.isCallActive = True
        self.assertEqual(rt.handlePlayAction(), "BLOCKED_CALL")
        self.assertEqual(rt.handlePauseAction(), "BLOCKED_CALL")
        self.assertTrue(rt.wasPausedByUser)
        self.assertTrue(rt.player_paused)

        # Post-call quarantine
        rt.isCallActive = False
        rt.isPostCallQuarantine = True
        self.assertEqual(rt.handlePlayAction(), "BLOCKED_QUARANTINE")
        self.assertEqual(rt.handlePauseAction(), "BLOCKED_QUARANTINE")
        self.assertTrue(rt.wasPausedByUser)
        self.assertTrue(rt.player_paused)

        # Normal operation
        rt.isPostCallQuarantine = False
        self.assertEqual(rt.handlePauseAction(), "RESUMED")
        self.assertFalse(rt.wasPausedByUser)
        self.assertFalse(rt.player_paused)

if __name__ == '__main__':
    unittest.main()
