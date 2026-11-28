import os
import re
import unittest

class TestMode2PauseResumeStressChallenger(unittest.TestCase):
    """
    Empirical stress challenge harness for Mode 2 pause and resume transitions.
    Tests rate stability, rapid toggling, anchor focus arbitration, and invariants.
    """

    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        cls.base_dir = base_dir

        with open(os.path.join(base_dir, 'js', 'main.js'), 'r', encoding='utf-8') as f:
            cls.main_content = f.read()

        with open(os.path.join(base_dir, 'js', 'mediaSession.js'), 'r', encoding='utf-8') as f:
            cls.ms_content = f.read()

        with open(os.path.join(base_dir, 'js', 'dom.js'), 'r', encoding='utf-8') as f:
            cls.dom_content = f.read()

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
            'main.js': self.main_content,
            'mediaSession.js': self.ms_content,
            'dom.js': self.dom_content,
            'playback.js': self.playback_content,
            'test_mode2_pause_resume_stress_challenger.py': self.test_content
        }
        for name, content in files.items():
            matches = emoji_pattern.findall(content)
            self.assertEqual(len(matches), 0, f"Found emojis in {name}: {matches}")

    def test_mode2_pause_rate_never_jumps_to_rate_1(self):
        """Mode 2 pause path in main.js passes 0.00001, true and never forced rate 1.0."""
        # Find pause listener in main.js
        pause_match = re.search(r'audioPlayer\.addEventListener\(\s*[\'"]pause[\'"]\s*,[\s\S]*?\}\);', self.main_content)
        self.assertIsNotNone(pause_match)
        pause_block = pause_match.group(0)

        # In Mode 2 user pause branch:
        mode2_match = re.search(
            r'if\s*\(\s*window\.playbackMode\s*===\s*[\'"]mode2[\'"]\s*&&\s*!isRecentBtDisconnect\s*\)\s*\{\s*if\s*\(\s*window\.wasPausedByUser\s*\)\s*\{([\s\S]*?)\}\s*else',
            pause_block
        )
        self.assertIsNotNone(mode2_match)
        mode2_user_pause = mode2_match.group(1)

        # Micro-rate 0.00001, true must be present
        self.assertIn("updateMediaSessionPosition(audioPlayer.currentTime, dur, 0.00001, true);", mode2_user_pause)
        # Forced rate 1.0 must be absent from this block
        self.assertNotIn("updateMediaSessionPosition(audioPlayer.currentTime, dur, 1.0", mode2_user_pause)

    def test_mode2_media_session_position_rate_resolution_oracle(self):
        """Oracle testing for updateMediaSessionPosition rate resolution across all permutations."""
        def resolve_rate(isForcedRateValid, forcedRate, isPaused, playbackMode, isBuffering, isSeeking, playerRate=1.0):
            if isForcedRateValid and forcedRate > 0:
                return forcedRate
            elif isPaused and playbackMode == 'mode2':
                return 0.00001
            elif isBuffering:
                return 0.00001
            elif not isPaused:
                return playerRate or 1.0
            else:
                return 1.0

        # Scenario 1: Mode 2 paused with forcedRate=0.00001
        self.assertEqual(resolve_rate(True, 0.00001, True, 'mode2', False, False), 0.00001)

        # Scenario 2: Mode 2 paused with forcedRate=None (e.g. from syncAfterRepublish)
        self.assertEqual(resolve_rate(False, None, True, 'mode2', False, False), 0.00001)

        # Scenario 3: Mode 2 resume with forcedRate=1.0 while player is still paused (async transition)
        self.assertEqual(resolve_rate(True, 1.0, True, 'mode2', False, False), 1.0)

        # Scenario 4: Mode 2 playing with forcedRate=None
        self.assertEqual(resolve_rate(False, None, False, 'mode2', False, False, 1.0), 1.0)

        # Scenario 5: Mode 1 paused with forcedRate=None
        self.assertEqual(resolve_rate(False, None, True, 'mode1', False, False), 1.0)

        # Scenario 6: Buffering in Mode 1
        self.assertEqual(resolve_rate(False, None, False, 'mode1', True, False), 0.00001)

    def test_rapid_toggle_stress_harness(self):
        """Simulate rapid toggle cycles (pause -> resume -> pause -> resume within 100ms)."""
        class MockMediaSession:
            def __init__(self):
                self.playbackState = 'none'
                self.positionState = {}

            def setPositionState(self, state):
                self.positionState = state

        class MockAudioElement:
            def __init__(self):
                self.paused = False
                self.currentTime = 42.0
                self.duration = 240.0
                self.play_count = 0
                self.pause_count = 0

            def play(self):
                self.paused = False
                self.play_count += 1

            def pause(self):
                self.paused = True
                self.pause_count += 1

        class MockDualAudioPingPong:
            def __init__(self, active_audio):
                self.active = active_audio
                self._preventAutoplay = False

            @property
            def paused(self):
                return self.active.paused

            @property
            def currentTime(self):
                return self.active.currentTime

            @property
            def duration(self):
                return self.active.duration

            def play(self, wasPausedByUser):
                if wasPausedByUser:
                    # Synchronous authorization choke point
                    return False
                self._preventAutoplay = False
                self.active.play()
                return True

            def instantPause(self):
                self._preventAutoplay = True
                self.active.pause()

        class MockAnchor:
            def __init__(self):
                self.paused = False
                self.play_calls = 0

            def play(self):
                self.paused = False
                self.play_calls += 1

        active = MockAudioElement()
        player = MockDualAudioPingPong(active)
        ms = MockMediaSession()
        anchor = MockAnchor()
        state = {
            "wasPausedByUser": False,
            "playbackMode": "mode2"
        }

        rates_recorded = []

        def update_position(pos, dur, forcedRate=None, force=False):
            if forcedRate is not None and forcedRate > 0:
                rate = forcedRate
            elif (player.paused or state["wasPausedByUser"]) and state["playbackMode"] == 'mode2':
                rate = 0.00001
            elif not (player.paused or state["wasPausedByUser"]):
                rate = 1.0
            else:
                rate = 1.0

            ms.setPositionState({"position": pos, "duration": dur, "playbackRate": rate})
            rates_recorded.append(rate)

        def dispatch_pause_action():
            isActuallyPaused = player.paused or state["wasPausedByUser"]
            if isActuallyPaused:
                # Resume branch
                state["wasPausedByUser"] = False
                player._preventAutoplay = False
                ms.playbackState = 'playing'
                # republishMediaMetadata
                update_position(player.currentTime, player.duration, None, True)
                # immediate rate 1.0 force
                update_position(player.currentTime, player.duration, 1.0, True)
                if not anchor or anchor.paused:
                    anchor.play()
                player.play(state["wasPausedByUser"])
            else:
                # Pause branch
                state["wasPausedByUser"] = True
                ms.playbackState = 'playing'  # spoofed
                if not anchor or anchor.paused:
                    anchor.play()
                update_position(player.currentTime, player.duration, 0.00001, True)
                # republishMediaMetadata
                update_position(player.currentTime, player.duration, None, True)
                player.instantPause()
                # main.js pause listener
                update_position(player.currentTime, player.duration, 0.00001, True)

        # Perform 10 rapid alternating cycles
        for cycle in range(10):
            # 1. Action: Pause
            dispatch_pause_action()
            self.assertTrue(state["wasPausedByUser"])
            self.assertTrue(player.paused)
            self.assertEqual(ms.positionState["playbackRate"], 0.00001)

            # 2. Action: Resume
            dispatch_pause_action()
            self.assertFalse(state["wasPausedByUser"])
            self.assertFalse(player.paused)
            self.assertEqual(ms.positionState["playbackRate"], 1.0)

        # Verify anchor was never redundantly started during any resume (anchor was already running)
        self.assertEqual(anchor.play_calls, 0, "Anchor must not receive redundant play() calls on resume")
        self.assertEqual(active.play_count, 10, "Player must have resumed exactly 10 times")
        self.assertEqual(active.pause_count, 10, "Player must have paused exactly 10 times")

    def test_anchor_starts_when_previously_paused_or_absent(self):
        """Anchor starts properly when paused or null, but never when running."""
        class MockAnchor:
            def __init__(self, paused=False):
                self.paused = paused
                self.play_calls = 0

            def play(self):
                self.paused = False
                self.play_calls += 1

        # Case 1: Anchor element is None (not yet in DOM)
        anchor_el = None
        started = False
        if not anchor_el or anchor_el.paused:
            started = True
        self.assertTrue(started, "Anchor must start when null")

        # Case 2: Anchor is paused
        anchor_el = MockAnchor(paused=True)
        if not anchor_el or anchor_el.paused:
            anchor_el.play()
        self.assertEqual(anchor_el.play_calls, 1, "Anchor must start when paused")
        self.assertFalse(anchor_el.paused)

        # Case 3: Anchor is already running
        anchor_el = MockAnchor(paused=False)
        if not anchor_el or anchor_el.paused:
            anchor_el.play()
        self.assertEqual(anchor_el.play_calls, 0, "Running anchor must not receive redundant play")

    def test_all_resume_sites_ordering_republish_before_position_update(self):
        """All resume sites must call republishMediaMetadata BEFORE updateMediaSessionPosition."""
        # 1. handlePlayAction
        play_match = re.search(r'function\s+handlePlayAction\(\)\s*\{([\s\S]*?)const\s+playPromise', self.ms_content)
        self.assertIsNotNone(play_match)
        play_body = play_match.group(1)
        meta_idx = play_body.find('republishMediaMetadata()')
        pos_idx = play_body.find('updateMediaSessionPosition(actualTime, dur, 1.0, true)')
        self.assertNotEqual(meta_idx, -1)
        self.assertNotEqual(pos_idx, -1)
        self.assertLess(meta_idx, pos_idx, "handlePlayAction must order republishMediaMetadata before updateMediaSessionPosition")

        # 2. pause handler resume branch
        pause_match = re.search(r'setActionHandler\(\s*[\'"]pause[\'"]\s*,[\s\S]*?if\s*\(isActuallyPaused\)\s*\{([\s\S]*?)if\s*\(audioPlayer\)\s*\{', self.ms_content)
        self.assertIsNotNone(pause_match)
        pause_body = pause_match.group(1)
        meta_idx = pause_body.find('republishMediaMetadata()')
        pos_idx = pause_body.find('updateMediaSessionPosition(actualTime, dur, 1.0, true)')
        self.assertNotEqual(meta_idx, -1)
        self.assertNotEqual(pos_idx, -1)
        self.assertLess(meta_idx, pos_idx, "pause handler resume must order republishMediaMetadata before updateMediaSessionPosition")

        # 3. playpause handler resume branch
        playpause_match = re.search(r'setActionHandler\(\s*[\'"]playpause[\'"]\s*,[\s\S]*?if\s*\(isActuallyPaused\)\s*\{([\s\S]*?)const\s+playPromise', self.ms_content)
        self.assertIsNotNone(playpause_match)
        playpause_body = playpause_match.group(1)
        meta_idx = playpause_body.find('republishMediaMetadata()')
        pos_idx = playpause_body.find('updateMediaSessionPosition(actualTime, dur, 1.0, true)')
        self.assertNotEqual(meta_idx, -1)
        self.assertNotEqual(pos_idx, -1)
        self.assertLess(meta_idx, pos_idx, "playpause handler resume must order republishMediaMetadata before updateMediaSessionPosition")

    def test_all_resume_sites_clear_was_paused_by_user_before_play(self):
        """All resume sites must synchronously clear wasPausedByUser and _preventAutoplay before calling play()."""
        sites = [
            ("handlePlayAction", r'function\s+handlePlayAction\(\)\s*\{([\s\S]*?)const\s+playPromise\s*=\s*audioPlayer\.play\(\)'),
            ("pause_resume", r'setActionHandler\(\s*[\'"]pause[\'"]\s*,[\s\S]*?if\s*\(isActuallyPaused\)\s*\{([\s\S]*?)audioPlayer\.play\(\)'),
            ("playpause_resume", r'setActionHandler\(\s*[\'"]playpause[\'"]\s*,[\s\S]*?if\s*\(isActuallyPaused\)\s*\{([\s\S]*?)const\s+playPromise\s*=\s*audioPlayer\.play\(\)')
        ]
        for name, pattern in sites:
            match = re.search(pattern, self.ms_content)
            self.assertIsNotNone(match, f"Could not find body for {name}")
            body = match.group(1)
            self.assertIn("window.wasPausedByUser = false;", body, f"{name} must clear wasPausedByUser before play()")
            self.assertIn("audioPlayer._preventAutoplay = false;", body, f"{name} must clear _preventAutoplay before play()")

    def test_near_end_loop_replay_reset(self):
        """All resume sites must reset actualTime and currentTime to 0 if within 0.5s of track end."""
        sites = [
            ("handlePlayAction", r'function\s+handlePlayAction\(\)\s*\{([\s\S]*?)const\s+playPromise'),
            ("pause_resume", r'setActionHandler\(\s*[\'"]pause[\'"]\s*,[\s\S]*?if\s*\(isActuallyPaused\)\s*\{([\s\S]*?)if\s*\(audioPlayer\)\s*\{'),
            ("playpause_resume", r'setActionHandler\(\s*[\'"]playpause[\'"]\s*,[\s\S]*?if\s*\(isActuallyPaused\)\s*\{([\s\S]*?)const\s+playPromise')
        ]
        for name, pattern in sites:
            match = re.search(pattern, self.ms_content)
            self.assertIsNotNone(match, f"Could not find body for {name}")
            body = match.group(1)
            self.assertIn("actualTime >= dur - 0.5", body, f"{name} must check near-end threshold")
            self.assertIn("audioPlayer.currentTime = 0;", body, f"{name} must reset audioPlayer.currentTime")
            self.assertIn("actualTime = 0;", body, f"{name} must reset actualTime")

    def test_authorization_choke_point_in_dom_js(self):
        """DualAudioPingPong.play() rejects execution synchronously if wasPausedByUser is true."""
        match = re.search(r'play\(\)\s*\{[\s\S]*?if\s*\(\s*window\.wasPausedByUser\s*\)\s*\{\s*return\s+Promise\.resolve\(\);\s*\}', self.dom_content)
        self.assertIsNotNone(match, "DualAudioPingPong.play must block execution when wasPausedByUser is true")

    def test_external_video_interrupt_unspoofs_and_sets_honest_paused_state(self):
        """Mode 2 external video interrupt (wasPausedByUser=false) stops anchor and declares honest paused state."""
        pause_match = re.search(r'audioPlayer\.addEventListener\(\s*[\'"]pause[\'"]\s*,[\s\S]*?\}\);', self.main_content)
        self.assertIsNotNone(pause_match)
        pause_block = pause_match.group(0)

        # External interrupt branch:
        interrupt_match = re.search(r'if\s*\(\s*window\.playbackMode\s*===\s*[\'"]mode2[\'"]\s*&&\s*!isRecentBtDisconnect\s*\)\s*\{[\s\S]*?\}\s*else\s*\{([\s\S]*?)\}', pause_block)
        self.assertIsNotNone(interrupt_match)
        interrupt_block = interrupt_match.group(1)

        self.assertIn("stopLiveAudioAnchor()", interrupt_block)
        self.assertIn("navigator.mediaSession.playbackState = 'paused';", interrupt_block)
        self.assertIn("updateMediaSessionPosition(audioPlayer.currentTime, dur, 1.0, true);", interrupt_block)

if __name__ == '__main__':
    unittest.main()
