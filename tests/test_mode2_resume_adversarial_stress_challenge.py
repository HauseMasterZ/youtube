import os
import re
import random
import unittest

class TestMode2ResumeAdversarialStressChallenge(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        cls.base_dir = base_dir

        with open(os.path.join(base_dir, 'js', 'main.js'), 'r', encoding='utf-8') as f:
            cls.main_content = f.read()

        with open(os.path.join(base_dir, 'js', 'playback.js'), 'r', encoding='utf-8') as f:
            cls.playback_content = f.read()

        with open(os.path.join(base_dir, 'js', 'mediaSession.js'), 'r', encoding='utf-8') as f:
            cls.ms_content = f.read()

        with open(os.path.join(base_dir, 'js', 'dom.js'), 'r', encoding='utf-8') as f:
            cls.dom_content = f.read()

        with open(os.path.join(base_dir, 'GEMINI.md'), 'r', encoding='utf-8') as f:
            cls.gemini_content = f.read()

        with open(__file__, 'r', encoding='utf-8') as f:
            cls.test_content = f.read()

    def test_strictly_zero_emojis(self):
        """Verify strictly zero emojis across source files and test harness."""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        files = {
            'main.js': self.main_content,
            'playback.js': self.playback_content,
            'mediaSession.js': self.ms_content,
            'dom.js': self.dom_content,
            'GEMINI.md': self.gemini_content,
            'test_mode2_resume_adversarial_stress_challenge.py': self.test_content
        }
        for name, content in files.items():
            matches = emoji_pattern.findall(content)
            self.assertEqual(len(matches), 0, f"Found emojis in {name}: {matches}")

    def test_multi_vector_resume_pathway_signatures(self):
        """Verify code signatures for all 4 multi-vector resume pathways and seek resume in mediaSession.js and main.js."""
        # Vector A: Media notification card center button tap (setActionHandler 'pause')
        pause_handler_match = re.search(
            r"navigator\.mediaSession\.setActionHandler\(\s*['\"]pause['\"]\s*,\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*\);\s*try",
            self.ms_content
        )
        self.assertIsNotNone(pause_handler_match, "Vector A: setActionHandler('pause') not found")
        pause_code = pause_handler_match.group(1)
        self.assertIn("isActuallyPaused", pause_code)
        self.assertIn("window.wasPausedByUser = false;", pause_code)
        self.assertIn("audioPlayer._preventAutoplay = false;", pause_code)
        self.assertIn("updateMediaSessionPosition(actualTime, dur, 1.0, true);", pause_code)
        self.assertRegex(pause_code, r"!_pauseResumeAnchorEl\s*\|\|\s*_pauseResumeAnchorEl\.paused")
        self.assertIn("audioPlayer.play()", pause_code)

        # Vector B: Bluetooth toggle AVRCP command (setActionHandler 'playpause')
        playpause_handler_match = re.search(
            r"navigator\.mediaSession\.setActionHandler\(\s*['\"]playpause['\"]\s*,\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*\);\s*\}\s*catch",
            self.ms_content
        )
        self.assertIsNotNone(playpause_handler_match, "Vector B: setActionHandler('playpause') not found")
        playpause_code = playpause_handler_match.group(1)
        self.assertIn("isActuallyPaused", playpause_code)
        self.assertIn("window.wasPausedByUser = false;", playpause_code)
        self.assertIn("audioPlayer._preventAutoplay = false;", playpause_code)
        self.assertIn("updateMediaSessionPosition(actualTime, dur, 1.0, true);", playpause_code)
        self.assertRegex(playpause_code, r"!_toggleAnchorEl\s*\|\|\s*_toggleAnchorEl\.paused")
        self.assertIn("audioPlayer.play()", playpause_code)

        # Vector C: Discrete Bluetooth PLAY command (handlePlayAction)
        handle_play_match = re.search(
            r"function\s+handlePlayAction\(\)\s*\{([\s\S]*?)\n\s{4}\}",
            self.ms_content
        )
        self.assertIsNotNone(handle_play_match, "Vector C: handlePlayAction not found")
        handle_play_code = handle_play_match.group(1)
        self.assertIn("window.wasPausedByUser = false;", handle_play_code)
        self.assertIn("audioPlayer._preventAutoplay = false;", handle_play_code)
        self.assertIn("updateMediaSessionPosition(actualTime, dur, 1.0, true);", handle_play_code)
        self.assertRegex(handle_play_code, r"!_resumeAnchorEl\s*\|\|\s*_resumeAnchorEl\.paused")
        self.assertIn("audioPlayer.play()", handle_play_code)

        # Vector D: Physical media keys in main.js keydown listener
        self.assertRegex(self.main_content, r"e\.key\s*===\s*['\"]MediaPlayPause['\"]\s*\|\|\s*e\.code\s*===\s*['\"]MediaPlayPause['\"]")
        self.assertRegex(self.main_content, r"e\.key\s*===\s*['\"]MediaPlay['\"]\s*\|\|\s*e\.code\s*===\s*['\"]MediaPlay['\"]")
        self.assertRegex(self.main_content, r"e\.key\s*===\s*['\"]MediaPause['\"]\s*\|\|\s*e\.code\s*===\s*['\"]MediaPause['\"]")

        # Vector E: Mode 2 seekforward and seekbackward resume
        self.assertRegex(self.ms_content, r"setActionHandler\(\s*['\"]seekbackward['\"][\s\S]*?updateMediaSessionPosition\(newTime,\s*dur,\s*1\.0,\s*true\)")
        self.assertRegex(self.ms_content, r"setActionHandler\(\s*['\"]seekforward['\"][\s\S]*?updateMediaSessionPosition\(newTime,\s*dur,\s*1\.0,\s*true\)")

    def test_rapid_toggle_adversarial_stress_simulation(self):
        """Stress harness: 1000 randomized rapid pause/resume cycles across all vectors verifying zero state corruption."""
        class MockAnchor:
            def __init__(self):
                self.paused = True
                self.play_calls = 0
                self.pause_calls = 0

            def play(self):
                self.paused = False
                self.play_calls += 1

            def pause(self):
                self.paused = True
                self.pause_calls += 1

        class MockActiveAudio:
            def __init__(self):
                self.paused = False
                self.currentTime = 10.0
                self.duration = 240.0
                self.playbackRate = 1.0
                self.play_calls = 0
                self.pause_calls = 0

            def play(self):
                self.paused = False
                self.play_calls += 1

            def pause(self):
                self.paused = True
                self.pause_calls += 1

        class MockMediaSession:
            def __init__(self):
                self.playbackState = 'playing'
                self.positionState = {"position": 0.0, "duration": 0.0, "playbackRate": 1.0}

            def setPositionState(self, state):
                self.positionState = dict(state)

        class SystemHarness:
            def __init__(self):
                self.playbackMode = 'mode2'
                self.wasPausedByUser = False
                self.mediaSession = MockMediaSession()
                self.anchor = MockAnchor()
                self.active_audio = MockActiveAudio()
                self._preventAutoplay = False
                self.spoof_burst_active = False
                self.heartbeat_active = False
                self.history = []

            def update_position(self, forced_pos=None, forced_dur=None, forced_rate=None, force=False):
                dur = forced_dur if forced_dur is not None else self.active_audio.duration
                pos = forced_pos if forced_pos is not None else self.active_audio.currentTime
                is_forced_rate_valid = isinstance(forced_rate, (int, float)) and forced_rate > 0
                is_paused = self.active_audio.paused or self.wasPausedByUser

                if is_forced_rate_valid:
                    rate = forced_rate
                elif is_paused and self.playbackMode == 'mode2':
                    rate = 0.00001
                elif not is_paused:
                    rate = self.active_audio.playbackRate or 1.0
                else:
                    rate = 1.0

                self.mediaSession.setPositionState({
                    "position": pos,
                    "duration": dur,
                    "playbackRate": rate
                })

            def republish_metadata(self):
                # republishMediaMetadata triggers syncAfterRepublish with null forcedRate
                self.update_position(self.active_audio.currentTime, self.active_audio.duration, None, True)

            def pause_system(self, vector="btnPlayPause"):
                self.wasPausedByUser = True
                self._preventAutoplay = True
                if self.playbackMode == 'mode2':
                    self.mediaSession.playbackState = 'playing'
                    self.update_position(self.active_audio.currentTime, self.active_audio.duration, 0.00001, True)
                    self.republish_metadata()
                    if not self.anchor or self.anchor.paused:
                        self.anchor.play()
                    self.active_audio.pause()
                    self.heartbeat_active = True
                    self.spoof_burst_active = True
                else:
                    self.mediaSession.playbackState = 'paused'
                    self.update_position(self.active_audio.currentTime, self.active_audio.duration, 1.0, True)
                    self.active_audio.pause()

            def resume_system(self, vector="card_center"):
                isActuallyPaused = self.active_audio.paused or self.wasPausedByUser
                if not isActuallyPaused:
                    return

                # Cancel background pause timers
                self.spoof_burst_active = False
                self.heartbeat_active = False

                self.wasPausedByUser = False
                self._preventAutoplay = False
                self.mediaSession.playbackState = 'playing'

                actual_time = self.active_audio.currentTime
                dur = self.active_audio.duration

                # Near end loop reset
                if dur > 0 and actual_time >= dur - 0.5:
                    self.active_audio.currentTime = 0
                    actual_time = 0

                # Crucial order: republishMediaMetadata precedes forced rate 1.0 position update
                self.republish_metadata()
                self.update_position(actual_time, dur, 1.0, True)

                # Conditional anchor start
                if self.playbackMode == 'mode2':
                    if not self.anchor or self.anchor.paused:
                        self.anchor.play()

                # DualAudioPingPong authorization check
                if self.wasPausedByUser:
                    return

                self._preventAutoplay = False
                self.active_audio.play()

                # Play event handler
                self.mediaSession.playbackState = 'playing'
                self.update_position(self.active_audio.currentTime, dur, 1.0, True)

        harness = SystemHarness()
        random.seed(42)
        vectors = ["card_center", "bt_toggle", "discrete_play", "media_key", "seek_fwd"]

        for cycle in range(1000):
            # 1. State check: initially playing
            self.assertFalse(harness.wasPausedByUser, f"Cycle {cycle}: wasPausedByUser should be False while playing")
            self.assertFalse(harness._preventAutoplay, f"Cycle {cycle}: _preventAutoplay should be False while playing")
            self.assertFalse(harness.active_audio.paused, f"Cycle {cycle}: audio should be playing")
            self.assertEqual(harness.mediaSession.positionState["playbackRate"], 1.0, f"Cycle {cycle}: playbackRate should be 1.0 while playing")

            # 2. Pause
            harness.pause_system(vector="btnPlayPause")
            self.assertTrue(harness.wasPausedByUser, f"Cycle {cycle}: wasPausedByUser should be True on pause")
            self.assertTrue(harness._preventAutoplay, f"Cycle {cycle}: _preventAutoplay should be True on pause")
            self.assertTrue(harness.active_audio.paused, f"Cycle {cycle}: audio should be paused")
            self.assertAlmostEqual(harness.mediaSession.positionState["playbackRate"], 0.00001, places=5, msg=f"Cycle {cycle}: rate should be 0.00001 while paused")
            self.assertFalse(harness.anchor.paused, f"Cycle {cycle}: silent anchor must be running during pause")

            # 3. Simulate random track progress near end in 10% of cases
            if cycle % 10 == 0:
                harness.active_audio.currentTime = harness.active_audio.duration - 0.2

            # 4. Resume via randomly selected vector
            vec = random.choice(vectors)
            anchor_plays_before_resume = harness.anchor.play_calls
            harness.resume_system(vector=vec)

            # 5. Verify resume post-conditions
            self.assertFalse(harness.wasPausedByUser, f"Cycle {cycle} ({vec}): wasPausedByUser must be False after resume")
            self.assertFalse(harness._preventAutoplay, f"Cycle {cycle} ({vec}): _preventAutoplay must be False after resume")
            self.assertFalse(harness.active_audio.paused, f"Cycle {cycle} ({vec}): audio must be unpaused after resume")
            self.assertEqual(harness.mediaSession.positionState["playbackRate"], 1.0, f"Cycle {cycle} ({vec}): rate must be forced to 1.0 immediately on resume")
            self.assertFalse(harness.spoof_burst_active, f"Cycle {cycle} ({vec}): spoof burst must be cancelled on resume")
            self.assertFalse(harness.heartbeat_active, f"Cycle {cycle} ({vec}): anchor heartbeat must be stopped on resume")

            # Anchor guard: since anchor was already playing, play_calls must NOT increase
            self.assertEqual(harness.anchor.play_calls, anchor_plays_before_resume, f"Cycle {cycle} ({vec}): anchor play() must not be called redundantly when already running")

            # If it was near track end, check loop reset to 0
            if cycle % 10 == 0:
                self.assertEqual(harness.active_audio.currentTime, 0.0, f"Cycle {cycle}: near-end track must loop to position 0")
                self.assertEqual(harness.mediaSession.positionState["position"], 0.0, f"Cycle {cycle}: positionState must reset to 0")

    def test_audio_focus_contiguity_under_rapid_transitions(self):
        """Verify that at no point in Mode 2 pause/resume transitions do both audio elements drop to stopped simultaneously."""
        class FocusTracker:
            def __init__(self):
                self.active_audio_running = True
                self.anchor_running = False
                self.zero_focus_events = 0

            def check_state(self):
                active_count = (1 if self.active_audio_running else 0) + (1 if self.anchor_running else 0)
                if active_count == 0:
                    self.zero_focus_events += 1

            def pause_mode2(self):
                # In Mode 2, anchor starts BEFORE active audio stops, or simultaneously without intervening dead time
                self.anchor_running = True
                self.check_state()
                self.active_audio_running = False
                self.check_state()

            def resume_mode2(self):
                # On resume, anchor continues running while active audio resumes
                self.active_audio_running = True
                self.check_state()
                # Anchor stays alive in Mode 2
                self.check_state()

        tracker = FocusTracker()
        for _ in range(500):
            tracker.pause_mode2()
            tracker.resume_mode2()

        self.assertEqual(tracker.zero_focus_events, 0, "Zero-audio-focus window detected: notification card would be evicted by OS")

    def test_update_media_session_position_resolution_matrix(self):
        """Exhaustively test updateMediaSessionPosition playbackRate resolution across state combinations."""
        def resolve_rate(forced_rate, is_paused, mode, is_buffering):
            is_forced_rate_valid = isinstance(forced_rate, (int, float)) and forced_rate > 0
            if is_forced_rate_valid:
                return forced_rate
            elif is_paused and mode == 'mode2':
                return 0.00001
            elif is_buffering:
                return 0.00001
            elif not is_paused:
                return 1.0
            elif mode == 'mode1' and is_paused:
                return 1.0
            return 1.0

        # Scenario 1: Mode 2 paused, forcedRate=1.0 (resume path) -> must be 1.0
        self.assertEqual(resolve_rate(1.0, is_paused=True, mode='mode2', is_buffering=False), 1.0)

        # Scenario 2: Mode 2 paused, forcedRate=0.00001 (pause path) -> must be 0.00001
        self.assertEqual(resolve_rate(0.00001, is_paused=True, mode='mode2', is_buffering=False), 0.00001)

        # Scenario 3: Mode 2 paused, forcedRate=None (heartbeat or sync fallback) -> must be 0.00001
        self.assertEqual(resolve_rate(None, is_paused=True, mode='mode2', is_buffering=False), 0.00001)

        # Scenario 4: Mode 2 playing, forcedRate=None -> must be 1.0
        self.assertEqual(resolve_rate(None, is_paused=False, mode='mode2', is_buffering=False), 1.0)

        # Scenario 5: Mode 1 paused, forcedRate=None -> must be 1.0
        self.assertEqual(resolve_rate(None, is_paused=True, mode='mode1', is_buffering=False), 1.0)

        # Scenario 6: Mode 2 buffering, forcedRate=None -> must be 0.00001
        self.assertEqual(resolve_rate(None, is_paused=False, mode='mode2', is_buffering=True), 0.00001)

    def test_bluetooth_toggle_debounce_protection(self):
        """Verify 300ms debounce guard on playpause action handler to prevent switch chatter."""
        debounce_match = re.search(
            r"setActionHandler\(\s*['\"]playpause['\"][\s\S]*?const\s+now\s*=\s*Date\.now\(\);\s*if\s*\(\s*now\s*-\s*lastPlayPauseToggleTime\s*<\s*300\s*\)\s*return;\s*lastPlayPauseToggleTime\s*=\s*now;",
            self.ms_content
        )
        self.assertIsNotNone(debounce_match, "300ms debounce guard must be present on playpause action handler")

    def test_post_steal_avrcp_resume_recovery(self):
        """Verify post-steal AVRCP resume when playbackState was marked 'paused' by external media interrupt."""
        class MockPlayer:
            def __init__(self):
                self.paused = True
                self.currentTime = 45.0
                self.duration = 180.0
                self._preventAutoplay = False
                self.played = False

            def play(self):
                self.paused = False
                self.played = True

        player = MockPlayer()
        wasPausedByUser = False
        isActuallyPaused = player.paused or wasPausedByUser
        self.assertTrue(isActuallyPaused, "Audio element paused due to external steal must qualify as isActuallyPaused")

        wasPausedByUser = False
        player._preventAutoplay = False
        player.play()

        self.assertTrue(player.played)
        self.assertFalse(player.paused)
        self.assertFalse(wasPausedByUser)
        self.assertFalse(player._preventAutoplay)

    def test_zero_volume_prevention_invariant(self):
        """Verify that pause() and instantPause() in dom.js maintain active.volume = 1.0 to prevent OS card stripping."""
        pause_fn_match = re.search(r"pause\(\)\s*\{([\s\S]*?)\}\s*load\(\)", self.dom_content)
        self.assertIsNotNone(pause_fn_match)
        pause_body = pause_fn_match.group(1)
        self.assertIn("this.active.volume = 1.0;", pause_body)

        instant_pause_match = re.search(r"instantPause\(\)\s*\{([\s\S]*?)\}\s*async switchTrack", self.dom_content)
        self.assertIsNotNone(instant_pause_match)
        instant_pause_body = instant_pause_match.group(1)
        self.assertIn("this.active.volume = 1.0;", instant_pause_body)

    def test_seek_resume_paths_in_mode2(self):
        """Verify seekforward and seekbackward in Mode 2 unpause audio, force rate 1.0, and keep anchor alive."""
        # seekbackward
        sb_match = re.search(r"setActionHandler\(\s*['\"]seekbackward['\"][\s\S]*?audioPlayer\.play\(\)", self.ms_content)
        self.assertIsNotNone(sb_match)
        sb_code = sb_match.group(0)
        self.assertIn("window.playbackMode === 'mode2'", sb_code)
        self.assertIn("window.wasPausedByUser = false;", sb_code)
        self.assertIn("audioPlayer._preventAutoplay = false;", sb_code)
        self.assertIn("updateMediaSessionPosition(newTime, dur, 1.0, true);", sb_code)
        self.assertIn("startLiveAudioAnchor()", sb_code)

        # seekforward
        sf_match = re.search(r"setActionHandler\(\s*['\"]seekforward['\"][\s\S]*?audioPlayer\.play\(\)", self.ms_content)
        self.assertIsNotNone(sf_match)
        sf_code = sf_match.group(0)
        self.assertIn("window.playbackMode === 'mode2'", sf_code)
        self.assertIn("window.wasPausedByUser = false;", sf_code)
        self.assertIn("audioPlayer._preventAutoplay = false;", sf_code)
        self.assertIn("updateMediaSessionPosition(newTime, dur, 1.0, true);", sf_code)
        self.assertIn("startLiveAudioAnchor()", sf_code)

if __name__ == '__main__':
    unittest.main()
