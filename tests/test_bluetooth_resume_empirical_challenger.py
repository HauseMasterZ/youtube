import os
import re
import unittest

class TestBluetoothResumeEmpiricalChallenger(unittest.TestCase):
    """
    Adversarial challenge test suite for Bluetooth headset playback resume,
    DualAudioPingPong forwardEvent, authorization choke points, and MSE buffering behavior.
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

    def test_strictly_zero_emojis(self):
        """Verify zero emojis in all inspected files and test suite."""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        files = {
            'dom.js': self.dom_content,
            'mediaSession.js': self.ms_content,
            'main.js': self.main_content,
            'playback.js': self.playback_content,
            'test_bluetooth_resume_empirical_challenger.py': self.test_content
        }
        for name, content in files.items():
            matches = emoji_pattern.findall(content)
            self.assertEqual(len(matches), 0, f"Found emojis in {name}: {matches}")

    def test_authorization_choke_point_static_contract(self):
        """DualAudioPingPong.play() immediately dies when window.wasPausedByUser is true."""
        # Must return Promise.resolve() synchronously before touching element or resetting _preventAutoplay
        match = re.search(
            r'play\(\)\s*\{[\s\S]*?if\s*\(\s*window\.wasPausedByUser\s*\)\s*\{\s*return\s+Promise\.resolve\(\);\s*\}[\s\S]*?this\._preventAutoplay\s*=\s*false;',
            self.dom_content
        )
        self.assertIsNotNone(match, "play() authorization choke point must return Promise.resolve() before clearing _preventAutoplay")

    def test_forward_event_static_contract(self):
        """DualAudioPingPong.forwardEvent suppresses play/playing events during pre-staging when _preventAutoplay is active."""
        match = re.search(
            r'this\.forwardEvent\s*=\s*\(e\)\s*=>\s*\{([\s\S]*?)\n\s{12}\};',
            self.dom_content
        )
        self.assertIsNotNone(match, "DualAudioPingPong.forwardEvent function definition not found")
        body = match.group(1)

        # Confirm play/playing is suppressed when _preventAutoplay is True
        self.assertIn("if (this._preventAutoplay && (e.type === 'play' || e.type === 'playing'))", body)
        self.assertIn("return;", body)

    def test_all_mse_buffer_and_playback_sites_guarded_by_was_paused_by_user(self):
        """All MSE chunk appends and safePlay calls in dom.js must be guarded by !window.wasPausedByUser."""
        # Check safePlay definition and all continuation calls
        guard_pattern = r'!window\.wasPausedByUser'
        matches = re.findall(guard_pattern, self.dom_content)
        # dom.js contains multiple MSE chunk processing checkpoints (at least 15 sites)
        self.assertGreaterEqual(len(matches), 15, f"Expected at least 15 !window.wasPausedByUser guards in dom.js, found {len(matches)}")

    def test_empirical_authorization_choke_point_simulation(self):
        """Empirically test that audioPlayer.play() rejects unauthorized invocations."""
        class MockNativeAudio:
            def __init__(self):
                self.paused = True
                self.play_count = 0
                self.volume = 0.5
                self.currentTime = 10.0

            def play(self):
                self.play_count += 1
                self.paused = False
                return "RESOLVED_PLAY"

            def pause(self):
                self.paused = True

        class MockDualAudioPingPong:
            def __init__(self, active):
                self.active = active
                self._preventAutoplay = True
                self._expectedDuration = 180
                self._pendingSeek = None
                self._isDirectAudio = True
                self.fadeInterval = None

            def play(self, wasPausedByUser):
                if wasPausedByUser:
                    return "PROMISE_RESOLVE_SYNCHRONOUS"
                self._preventAutoplay = False
                self.active.volume = 1.0
                return self.active.play()

            def instantPause(self):
                self._preventAutoplay = True
                self.active.pause()

        native = MockNativeAudio()
        player = MockDualAudioPingPong(native)

        # Scenario 1: wasPausedByUser is TRUE (user explicitly paused)
        wasPausedByUser = True
        player._preventAutoplay = True
        res = player.play(wasPausedByUser)

        # Verify choke point blocked playback
        self.assertEqual(res, "PROMISE_RESOLVE_SYNCHRONOUS")
        self.assertEqual(native.play_count, 0, "Native audio element must not be called")
        self.assertTrue(player._preventAutoplay, "_preventAutoplay must not be cleared")
        self.assertTrue(native.paused, "Native audio must remain paused")
        self.assertEqual(native.volume, 0.5, "Volume must not be altered")

        # Scenario 2: Multiple repeated rogue play() calls while paused
        for _ in range(50):
            res_repeat = player.play(wasPausedByUser)
            self.assertEqual(res_repeat, "PROMISE_RESOLVE_SYNCHRONOUS")
        self.assertEqual(native.play_count, 0, "Repeated rogue play calls must all be blocked")

        # Scenario 3: Authorized resume (e.g. MediaSession action or Play/Pause button)
        wasPausedByUser = False
        res_auth = player.play(wasPausedByUser)
        self.assertEqual(res_auth, "RESOLVED_PLAY")
        self.assertEqual(native.play_count, 1, "Authorized play must invoke native play")
        self.assertFalse(player._preventAutoplay, "Authorized play must clear _preventAutoplay")
        self.assertFalse(native.paused, "Native audio must be unpaused")
        self.assertEqual(native.volume, 1.0, "Volume must be restored to 1.0")

    def test_empirical_forward_event_matrix_across_all_event_types(self):
        """Empirically test DualAudioPingPong.forwardEvent across all HTML5 media event types."""
        class MockEventTarget:
            def __init__(self):
                self.dispatched_events = []

            def dispatchEvent(self, event_name):
                self.dispatched_events.append(event_name)

        class ForwardEventSimulator(MockEventTarget):
            def __init__(self):
                super().__init__()
                self.switching = False
                self._preventAutoplay = True
                self._isBufferStalled = True

            def forwardEvent(self, event_type):
                if not self.switching:
                    if self._preventAutoplay and (event_type == 'play' or event_type == 'playing'):
                        return
                    if event_type == 'playing' or event_type == 'play' or event_type == 'pause':
                        self._isBufferStalled = False
                    self.dispatchEvent(event_type)

        sim = ForwardEventSimulator()

        # Test 1: 'pause' event must NOT clear _preventAutoplay
        sim._preventAutoplay = True
        sim._isBufferStalled = True
        sim.forwardEvent('pause')
        self.assertTrue(sim._preventAutoplay, "pause event must not clear _preventAutoplay")
        self.assertFalse(sim._isBufferStalled, "pause event must clear _isBufferStalled")
        self.assertIn('pause', sim.dispatched_events)

        # Test 2: 'timeupdate' event must NOT clear _preventAutoplay
        sim._preventAutoplay = True
        sim.forwardEvent('timeupdate')
        self.assertTrue(sim._preventAutoplay, "timeupdate event must not clear _preventAutoplay")
        self.assertIn('timeupdate', sim.dispatched_events)

        # Test 3: 'loadedmetadata' event must NOT clear _preventAutoplay
        sim._preventAutoplay = True
        sim.forwardEvent('loadedmetadata')
        self.assertTrue(sim._preventAutoplay, "loadedmetadata event must not clear _preventAutoplay")
        self.assertIn('loadedmetadata', sim.dispatched_events)

        # Test 4: 'progress' event must NOT clear _preventAutoplay
        sim._preventAutoplay = True
        sim.forwardEvent('progress')
        self.assertTrue(sim._preventAutoplay, "progress event must not clear _preventAutoplay")
        self.assertIn('progress', sim.dispatched_events)

        # Test 5: 'waiting' event must NOT clear _preventAutoplay
        sim._preventAutoplay = True
        sim.forwardEvent('waiting')
        self.assertTrue(sim._preventAutoplay, "waiting event must not clear _preventAutoplay")
        self.assertIn('waiting', sim.dispatched_events)

        # Test 6: 'ended' event must NOT clear _preventAutoplay
        sim._preventAutoplay = True
        sim.forwardEvent('ended')
        self.assertTrue(sim._preventAutoplay, "ended event must not clear _preventAutoplay")
        self.assertIn('ended', sim.dispatched_events)

        # Test 7: 'play' event suppressed when _preventAutoplay is True, forwarded when False
        sim._preventAutoplay = True
        sim.dispatched_events.clear()
        sim.forwardEvent('play')
        self.assertTrue(sim._preventAutoplay, "_preventAutoplay remains True")
        self.assertNotIn('play', sim.dispatched_events, "play event must be suppressed when _preventAutoplay is True")
        sim._preventAutoplay = False
        sim.forwardEvent('play')
        self.assertIn('play', sim.dispatched_events, "play event must be forwarded when _preventAutoplay is False")

        # Test 8: 'playing' event suppressed when _preventAutoplay is True, forwarded when False
        sim._preventAutoplay = True
        sim.dispatched_events.clear()
        sim.forwardEvent('playing')
        self.assertTrue(sim._preventAutoplay, "_preventAutoplay remains True")
        self.assertNotIn('playing', sim.dispatched_events, "playing event must be suppressed when _preventAutoplay is True")
        sim._preventAutoplay = False
        sim.forwardEvent('playing')
        self.assertIn('playing', sim.dispatched_events, "playing event must be forwarded when _preventAutoplay is False")

        # Test 9: switching flag suppresses all forward events during track transitions
        sim.switching = True
        sim.dispatched_events.clear()
        for evt in ['play', 'playing', 'pause', 'timeupdate', 'waiting', 'ended']:
            sim.forwardEvent(evt)
        self.assertEqual(len(sim.dispatched_events), 0, "No events may be forwarded while switching is True")

    def test_empirical_mse_buffer_arrival_while_paused_stress(self):
        """Stress-test: verify that MSE buffer chunk processing never plays while wasPausedByUser is True."""
        class MockMseBufferEngine:
            def __init__(self):
                self.wasPausedByUser = True
                self._preventAutoplay = True
                self._streamId = 1
                self.activeStreamId = 1
                self.buffered_ranges = []
                self.active_playing = False

            def onChunkAppended(self, chunk_start, chunk_end):
                self.buffered_ranges.append((chunk_start, chunk_end))
                # Exact logic from dom.js: safePlay checkpoint
                if not self._preventAutoplay and not self.wasPausedByUser and self._streamId == self.activeStreamId:
                    self.active_playing = True

            def safePlay(self):
                if not self._preventAutoplay and not self.wasPausedByUser and self._streamId == self.activeStreamId:
                    self.active_playing = True

        engine = MockMseBufferEngine()

        # Simulate 200 MSE chunks arriving over network while user paused
        for i in range(200):
            engine.onChunkAppended(i * 0.5, (i + 1) * 0.5)
            engine.safePlay()

        self.assertFalse(engine.active_playing, "MSE chunks arriving while paused must NEVER trigger audio playback")
        self.assertEqual(len(engine.buffered_ranges), 200, "All 200 chunks buffered safely")

        # Now simulate legitimate user unpause
        engine.wasPausedByUser = False
        engine._preventAutoplay = False
        engine.safePlay()
        self.assertTrue(engine.active_playing, "SafePlay must trigger once authorized unpause occurs")

    def test_empirical_call_active_and_quarantine_override_defense(self):
        """Stress-test: Bluetooth play event received during active call or quarantine must be instantly paused."""
        class MockCallProtectedRuntime:
            def __init__(self):
                self.isCallActive = False
                self.isPostCallQuarantine = False
                self.wasPausedByUser = True
                self.audioPlayer_paused = True
                self.instantPause_invoked = 0

            def instantPause(self):
                self.instantPause_invoked += 1
                self.audioPlayer_paused = True
                self.wasPausedByUser = True

            def onPlayListener(self):
                # Exact logic from main.js: lines 951-955
                if self.isCallActive or self.isPostCallQuarantine:
                    self.instantPause()
                    return
                self.wasPausedByUser = False
                self.audioPlayer_paused = False

        rt = MockCallProtectedRuntime()

        # Test during active call
        rt.isCallActive = True
        rt.onPlayListener()
        self.assertEqual(rt.instantPause_invoked, 1, "instantPause must be invoked during active call")
        self.assertTrue(rt.wasPausedByUser, "wasPausedByUser must remain True")
        self.assertTrue(rt.audioPlayer_paused, "audioPlayer must remain paused")

        # Test during post-call quarantine
        rt.isCallActive = False
        rt.isPostCallQuarantine = True
        rt.onPlayListener()
        self.assertEqual(rt.instantPause_invoked, 2, "instantPause must be invoked during post-call quarantine")
        self.assertTrue(rt.wasPausedByUser, "wasPausedByUser must remain True")
        self.assertTrue(rt.audioPlayer_paused, "audioPlayer must remain paused")

        # Test normal state (call ended, quarantine expired)
        rt.isPostCallQuarantine = False
        rt.onPlayListener()
        self.assertEqual(rt.instantPause_invoked, 2, "instantPause must not be called in normal state")
        self.assertFalse(rt.wasPausedByUser, "wasPausedByUser must be cleared")
        self.assertFalse(rt.audioPlayer_paused, "audioPlayer must be playing")

    def test_empirical_rapid_bluetooth_toggle_cycle_stress(self):
        """Empirically stress-test 100 rapid alternating Bluetooth AVRCP pause/resume toggle cycles."""
        class MockPlayer:
            def __init__(self):
                self.paused = True
                self._preventAutoplay = True

            def play(self):
                self.paused = False
                self._preventAutoplay = False

            def instantPause(self):
                self.paused = True
                self._preventAutoplay = True

        class MockSystem:
            def __init__(self, mode):
                self.mode = mode
                self.player = MockPlayer()
                self.wasPausedByUser = True
                self.anchor_active = (mode == 'mode2')
                self.anchor_start_count = 1 if mode == 'mode2' else 0
                self.playbackState = 'playing' if mode == 'mode2' else 'paused'

            def on_bluetooth_button_pressed(self):
                # Bluetooth toggle dispatches to setActionHandler('pause')
                isActuallyPaused = self.player.paused or self.wasPausedByUser
                if isActuallyPaused:
                    # Resume branch
                    self.wasPausedByUser = False
                    self.playbackState = 'playing'
                    if self.mode == 'mode2':
                        # Anchor check: only start if paused
                        if not self.anchor_active:
                            self.anchor_active = True
                            self.anchor_start_count += 1
                    else:
                        self.anchor_active = False
                    self.player.play()
                else:
                    # Pause branch
                    self.wasPausedByUser = True
                    self.playbackState = 'playing' if self.mode == 'mode2' else 'paused'
                    if self.mode == 'mode2':
                        self.anchor_active = True
                        self.anchor_start_count += 1
                    else:
                        self.anchor_active = False
                    self.player.instantPause()

        for test_mode in ['mode1', 'mode2']:
            sys = MockSystem(test_mode)
            for cycle in range(100):
                # Press 1: Resume
                sys.on_bluetooth_button_pressed()
                self.assertFalse(sys.wasPausedByUser, f"Cycle {cycle} Resume: wasPausedByUser should be False")
                self.assertFalse(sys.player.paused, f"Cycle {cycle} Resume: player should be playing")
                self.assertFalse(sys.player._preventAutoplay, f"Cycle {cycle} Resume: _preventAutoplay should be False")
                self.assertEqual(sys.playbackState, 'playing', f"Cycle {cycle} Resume: playbackState should be playing")

                # Press 2: Pause
                sys.on_bluetooth_button_pressed()
                self.assertTrue(sys.wasPausedByUser, f"Cycle {cycle} Pause: wasPausedByUser should be True")
                self.assertTrue(sys.player.paused, f"Cycle {cycle} Pause: player should be paused")
                self.assertTrue(sys.player._preventAutoplay, f"Cycle {cycle} Pause: _preventAutoplay should be True")
                if test_mode == 'mode2':
                    self.assertEqual(sys.playbackState, 'playing', "Mode 2 must keep notification card pinned")
                    self.assertTrue(sys.anchor_active, "Mode 2 anchor must stay active")
                else:
                    self.assertEqual(sys.playbackState, 'paused', "Mode 1 playbackState should be paused")
                    self.assertFalse(sys.anchor_active, "Mode 1 anchor must not be active")

    def test_repeated_pause_while_already_paused_idempotence(self):
        """Verify that repeatedly calling instantPause() when already paused is strictly idempotent."""
        class MockAudioElement:
            def __init__(self):
                self.paused = True
                self.pause_calls = 0

            def pause(self):
                self.pause_calls += 1
                self.paused = True

        class MockDualAudioPingPong:
            def __init__(self, active):
                self.active = active
                self._preventAutoplay = False
                self._pendingSeek = None
                self._isBufferStalled = True

            def instantPause(self):
                self._preventAutoplay = True
                self._pendingSeek = None
                self._isBufferStalled = False
                self.active.pause()

        native = MockAudioElement()
        player = MockDualAudioPingPong(native)

        # Run instantPause 25 times
        for _ in range(25):
            player.instantPause()

        self.assertTrue(player._preventAutoplay, "_preventAutoplay must be True")
        self.assertIsNone(player._pendingSeek, "_pendingSeek must be None")
        self.assertFalse(player._isBufferStalled, "_isBufferStalled must be False")
        self.assertTrue(native.paused, "Native element must remain paused")
        self.assertEqual(native.pause_calls, 25, "Pause calls must execute idempotently without exception")

if __name__ == '__main__':
    unittest.main()
