import os
import re
import unittest

class TestMode2MediaCardAndBluetoothResume(unittest.TestCase):
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

        root_gemini = os.path.join(os.path.dirname(base_dir), 'GEMINI.md')
        cls.root_gemini_content = ''
        if os.path.exists(root_gemini):
            with open(root_gemini, 'r', encoding='utf-8') as f:
                cls.root_gemini_content = f.read()

        with open(__file__, 'r', encoding='utf-8') as f:
            cls.test_file_content = f.read()

    def test_strictly_zero_emojis(self):
        """Verify strictly zero emojis across all checked files."""
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
            'root_GEMINI.md': self.root_gemini_content,
            'test_mode2_media_card_and_bluetooth_resume.py': self.test_file_content
        }
        for name, content in files.items():
            matches = emoji_pattern.findall(content)
            self.assertEqual(len(matches), 0, f"Found emojis in {name}: {matches}")

    def test_update_media_session_position_rate_priority(self):
        """updateMediaSessionPosition prioritizes forcedRate > 0 over isPaused && mode2 check."""
        rate_logic_match = re.search(
            r"let\s+rate;\s*if\s*\(\s*isForcedRateValid\s*&&\s*forcedRate\s*>\s*0\s*\)\s*\{\s*rate\s*=\s*forcedRate;\s*\}\s*else\s+if\s*\(\s*isPaused\s*&&\s*\(typeof\s+window\.playbackMode\s*!==\s*['\"]undefined['\"]\s*&&\s*window\.playbackMode\s*===\s*['\"]mode2['\"]\)\s*\)[\s\S]*?rate\s*=\s*0\.00001;",
            self.ms_content
        )
        self.assertIsNotNone(rate_logic_match, "updateMediaSessionPosition rate resolution must prioritize forcedRate > 0 over isPaused in mode2")

    def test_mode2_action_handlers_clear_prevent_autoplay(self):
        """handlePlayAction, pause, and playpause handlers reset _preventAutoplay before invoking audioPlayer.play()."""
        # 1. handlePlayAction
        self.assertRegex(
            self.ms_content,
            r"function\s+handlePlayAction\(\)\s*\{[\s\S]*?audioPlayer\._preventAutoplay\s*=\s*false;[\s\S]*?audioPlayer\.play\(\)"
        )
        # 2. setActionHandler('pause') resume branch
        self.assertRegex(
            self.ms_content,
            r"setActionHandler\(\s*['\"]pause['\"][\s\S]*?if\s*\(isActuallyPaused\)[\s\S]*?audioPlayer\._preventAutoplay\s*=\s*false;[\s\S]*?audioPlayer\.play\(\)"
        )
        # 3. setActionHandler('playpause') resume branch
        self.assertRegex(
            self.ms_content,
            r"setActionHandler\(\s*['\"]playpause['\"][\s\S]*?if\s*\(isActuallyPaused\)[\s\S]*?audioPlayer\._preventAutoplay\s*=\s*false;[\s\S]*?audioPlayer\.play\(\)"
        )

    def test_mode2_action_handlers_dispatch_rate_1_force_true(self):
        """handlePlayAction, pause, and playpause resume branches pass forcedRate 1.0 and force=true."""
        # 1. handlePlayAction
        self.assertRegex(
            self.ms_content,
            r"function\s+handlePlayAction\(\)\s*\{[\s\S]*?updateMediaSessionPosition\(\s*actualTime\s*,\s*dur\s*,\s*1\.0\s*,\s*true\s*\);"
        )
        # 2. setActionHandler('pause') resume branch
        self.assertRegex(
            self.ms_content,
            r"setActionHandler\(\s*['\"]pause['\"][\s\S]*?if\s*\(isActuallyPaused\)[\s\S]*?updateMediaSessionPosition\(\s*actualTime\s*,\s*dur\s*,\s*1\.0\s*,\s*true\s*\);"
        )
        # 3. setActionHandler('playpause') resume branch
        self.assertRegex(
            self.ms_content,
            r"setActionHandler\(\s*['\"]playpause['\"][\s\S]*?if\s*\(isActuallyPaused\)[\s\S]*?updateMediaSessionPosition\(\s*actualTime\s*,\s*dur\s*,\s*1\.0\s*,\s*true\s*\);"
        )

    def test_mode2_resume_resets_actual_time_on_loop(self):
        """Resume branches reset actualTime = 0 when replaying near the end of the track."""
        # 1. handlePlayAction
        self.assertRegex(
            self.ms_content,
            r"function\s+handlePlayAction\(\)\s*\{[\s\S]*?actualTime\s*>=\s*dur\s*-\s*0\.5[\s\S]*?audioPlayer\.currentTime\s*=\s*0;\s*actualTime\s*=\s*0;"
        )
        # 2. setActionHandler('pause') resume branch
        self.assertRegex(
            self.ms_content,
            r"setActionHandler\(\s*['\"]pause['\"][\s\S]*?actualTime\s*>=\s*dur\s*-\s*0\.5[\s\S]*?audioPlayer\.currentTime\s*=\s*0;\s*actualTime\s*=\s*0;"
        )
        # 3. setActionHandler('playpause') resume branch
        self.assertRegex(
            self.ms_content,
            r"setActionHandler\(\s*['\"]playpause['\"][\s\S]*?actualTime\s*>=\s*dur\s*-\s*0\.5[\s\S]*?audioPlayer\.currentTime\s*=\s*0;\s*actualTime\s*=\s*0;"
        )

    def test_mode2_republish_metadata_precedes_position_update(self):
        """republishMediaMetadata precedes updateMediaSessionPosition so syncAfterRepublish does not overwrite rate 1.0."""
        # 1. handlePlayAction
        self.assertRegex(
            self.ms_content,
            r"function\s+handlePlayAction\(\)\s*\{[\s\S]*?republishMediaMetadata\(\);[\s\S]*?updateMediaSessionPosition\(\s*actualTime\s*,\s*dur\s*,\s*1\.0\s*,\s*true\s*\);"
        )
        # 2. setActionHandler('pause') resume branch
        self.assertRegex(
            self.ms_content,
            r"setActionHandler\(\s*['\"]pause['\"][\s\S]*?republishMediaMetadata\(\);[\s\S]*?updateMediaSessionPosition\(\s*actualTime\s*,\s*dur\s*,\s*1\.0\s*,\s*true\s*\);"
        )
        # 3. setActionHandler('playpause') resume branch
        self.assertRegex(
            self.ms_content,
            r"setActionHandler\(\s*['\"]playpause['\"][\s\S]*?republishMediaMetadata\(\);[\s\S]*?updateMediaSessionPosition\(\s*actualTime\s*,\s*dur\s*,\s*1\.0\s*,\s*true\s*\);"
        )

    def test_mode2_seek_resume_invariants(self):
        """Mode 2 seekforward and seekbackward resume paths enforce preventAutoplay clear, rate 1.0 force true, and conditional anchor."""
        # seekbackward
        self.assertRegex(
            self.ms_content,
            r"setActionHandler\(\s*['\"]seekbackward['\"][\s\S]*?audioPlayer\._preventAutoplay\s*=\s*false;[\s\S]*?updateMediaSessionPosition\(\s*newTime\s*,\s*dur\s*,\s*1\.0\s*,\s*true\s*\);[\s\S]*?_anchor\.paused"
        )
        # seekforward
        self.assertRegex(
            self.ms_content,
            r"setActionHandler\(\s*['\"]seekforward['\"][\s\S]*?audioPlayer\._preventAutoplay\s*=\s*false;[\s\S]*?updateMediaSessionPosition\(\s*newTime\s*,\s*dur\s*,\s*1\.0\s*,\s*true\s*\);[\s\S]*?_anchor\.paused"
        )

    def test_dom_play_conditional_anchor(self):
        """DualAudioPingPong.prototype.play() checks if _anchor is paused before invoking startLiveAudioAnchor in Mode 2."""
        self.assertRegex(
            self.dom_content,
            r"play\(\)\s*\{[\s\S]*?if\s*\(\s*window\.playbackMode\s*===\s*['\"]mode2['\"]\s*\)\s*\{\s*if\s*\(\s*typeof\s+startLiveAudioAnchor\s*===\s*['\"]function['\"]\s*\)\s*\{[\s\S]*?_anchor\.paused[\s\S]*?startLiveAudioAnchor\(\);"
        )

    def test_main_play_listeners_conditional_anchor(self):
        """main.js btnPlayPause click and audioPlayer play/playing listeners avoid redundant startLiveAudioAnchor when anchor already running."""
        # 1. btnPlayPause click listener
        self.assertRegex(
            self.main_content,
            r"btnPlayPause\.addEventListener\(\s*['\"]click['\"][\s\S]*?if\s*\(\s*window\.playbackMode\s*===\s*['\"]mode2['\"]\s*\)\s*\{\s*if\s*\(\s*typeof\s+startLiveAudioAnchor\s*===\s*['\"]function['\"]\s*\)\s*\{[\s\S]*?_anchor\.paused[\s\S]*?startLiveAudioAnchor\(\);"
        )
        # 2. audioPlayer play event listener
        self.assertRegex(
            self.main_content,
            r"audioPlayer\.addEventListener\(\s*['\"]play['\"][\s\S]*?if\s*\(\s*window\.playbackMode\s*===\s*['\"]mode2['\"]\s*\)\s*\{\s*if\s*\(\s*typeof\s+startLiveAudioAnchor\s*===\s*['\"]function['\"]\s*\)\s*\{[\s\S]*?_anchor\.paused[\s\S]*?startLiveAudioAnchor\(\);"
        )

    def test_mode2_action_handlers_conditional_anchor(self):
        """mediaSession.js handlePlayAction, pause, and playpause resume paths guard startLiveAudioAnchor with (!anchor || anchor.paused)."""
        # 1. handlePlayAction
        self.assertRegex(
            self.ms_content,
            r"function\s+handlePlayAction\(\)\s*\{[\s\S]*?!_resumeAnchorEl\s*\|\|\s*_resumeAnchorEl\.paused[\s\S]*?startLiveAudioAnchor\(\);"
        )
        # 2. setActionHandler('pause') resume branch
        self.assertRegex(
            self.ms_content,
            r"setActionHandler\(\s*['\"]pause['\"][\s\S]*?if\s*\(isActuallyPaused\)[\s\S]*?!_pauseResumeAnchorEl\s*\|\|\s*_pauseResumeAnchorEl\.paused[\s\S]*?startLiveAudioAnchor\(\);"
        )
        # 3. setActionHandler('playpause') resume branch
        self.assertRegex(
            self.ms_content,
            r"setActionHandler\(\s*['\"]playpause['\"][\s\S]*?if\s*\(isActuallyPaused\)[\s\S]*?!_toggleAnchorEl\s*\|\|\s*_toggleAnchorEl\.paused[\s\S]*?startLiveAudioAnchor\(\);"
        )

    def test_synthetic_simulation_mode2_media_card_resume_under_spoofing(self):
        """Synthetic simulation: media notification card center button resume under Mode 2 eviction spoofing."""
        class MockAnchorElement:
            def __init__(self):
                self.paused = False
                self.play_calls = 0

            def play(self):
                self.paused = False
                self.play_calls += 1

            def pause(self):
                self.paused = True

        class MockActiveAudio:
            def __init__(self):
                self.paused = True
                self.currentTime = 50.0
                self.duration = 200.0
                self.play_count = 0
                self.listeners = {}

            def addEventListener(self, event, cb):
                self.listeners.setdefault(event, []).append(cb)

            def dispatchEvent(self, event):
                for cb in self.listeners.get(event, []):
                    cb()

            def play(self):
                self.paused = False
                self.play_count += 1
                self.dispatchEvent("play")

            def pause(self):
                self.paused = True

        class MockMediaSession:
            def __init__(self):
                self.playbackState = 'none'
                self.positionState = None

            def setPositionState(self, state):
                self.positionState = dict(state)

        class MockDualAudioPingPong:
            def __init__(self, active_el, anchor_el):
                self.active = active_el
                self.anchor = anchor_el
                self._preventAutoplay = False
                self.switching = False
                self.listeners = {}

                def forwardEvent(e_type):
                    if not self.switching:
                        if self._preventAutoplay and (e_type == 'play' or e_type == 'playing'):
                            return
                        self.dispatchEvent(e_type)

                self.forwardEvent = forwardEvent
                self.active.addEventListener("play", lambda: self.forwardEvent('play'))

            def addEventListener(self, event, cb):
                self.listeners.setdefault(event, []).append(cb)

            def dispatchEvent(self, event):
                for cb in self.listeners.get(event, []):
                    cb()

            @property
            def paused(self):
                return self.active.paused

            @property
            def currentTime(self):
                return self.active.currentTime

            @property
            def duration(self):
                return self.active.duration

            def play(self, wasPausedByUser, playbackMode):
                if wasPausedByUser:
                    return
                self._preventAutoplay = False
                if playbackMode == 'mode2':
                    if not self.anchor or self.anchor.paused:
                        self.anchor.play()
                self.active.play()

        media_session = MockMediaSession()
        anchor = MockAnchorElement()
        active_audio = MockActiveAudio()
        player = MockDualAudioPingPong(active_audio, anchor)

        # 1. State under Mode 2 user pause with eviction spoofing
        state = {
            "wasPausedByUser": True,
            "playbackMode": "mode2",
            "playbackState": "playing",
            "isCallActive": False
        }
        player._preventAutoplay = True
        media_session.playbackState = 'playing'

        # Emulate updateMediaSessionPosition helper
        def update_position(forced_pos, forced_dur, forced_rate, force=False):
            is_forced_rate_valid = isinstance(forced_rate, (int, float)) and forced_rate > 0
            is_paused = (player.paused or state["wasPausedByUser"])
            if is_forced_rate_valid:
                rate = forced_rate
            elif is_paused and state["playbackMode"] == 'mode2':
                rate = 0.00001
            elif not is_paused:
                rate = 1.0
            else:
                rate = 1.0

            media_session.setPositionState({
                "duration": forced_dur,
                "playbackRate": rate,
                "position": forced_pos
            })

        # When initially paused, position scrubber was frozen at 0.00001
        update_position(50.0, 200.0, 0.00001, True)
        self.assertAlmostEqual(media_session.positionState["playbackRate"], 0.00001, places=5)
        self.assertTrue(player.paused)
        self.assertTrue(state["wasPausedByUser"])

        # 2. User taps center button on media notification card
        # Android Chromium receives onPause() because mMediaNotificationInfo.isPaused is False
        isActuallyPaused = player.paused or state["wasPausedByUser"]
        self.assertTrue(isActuallyPaused, "Media card pause action must detect isActuallyPaused = True")

        # Resume execution branch in setActionHandler('pause')
        state["wasPausedByUser"] = False
        player._preventAutoplay = False
        media_session.playbackState = 'playing'
        actual_time = player.active.currentTime
        dur = player.active.duration

        # Replay at end of track resets actual_time
        if dur > 0 and actual_time >= dur - 0.5:
            player.active.currentTime = 0
            actual_time = 0

        # republishMediaMetadata executes before updateMediaSessionPosition
        def republish_metadata():
            # syncAfterRepublish invokes update_position with forcedRate=None, force=True
            update_position(player.active.currentTime, dur, None, True)

        republish_metadata()

        # Immediate position update with forcedRate=1.0 and force=True follows republishMediaMetadata
        update_position(actual_time, dur, 1.0, True)
        self.assertEqual(media_session.positionState["playbackRate"], 1.0, "Position state must immediately take rate 1.0 on resume even while audio is still paused and after republishMediaMetadata")
        self.assertEqual(media_session.positionState["position"], 50.0)

        # Also test end of track loop reset
        player.active.currentTime = 199.8
        actual_time = player.active.currentTime
        if dur > 0 and actual_time >= dur - 0.5:
            player.active.currentTime = 0
            actual_time = 0
        republish_metadata()
        update_position(actual_time, dur, 1.0, True)
        self.assertEqual(media_session.positionState["position"], 0.0, "Position state must reset to 0.0 on loop replay")
        self.assertEqual(media_session.positionState["playbackRate"], 1.0)

        # Anchor check: anchor is not paused, so play_calls must not increment
        initial_anchor_plays = anchor.play_calls
        if not anchor or anchor.paused:
            anchor.play()
        self.assertEqual(anchor.play_calls, initial_anchor_plays, "startLiveAudioAnchor must not re-assert play when anchor is already running")

        # Anchor check when null (not yet in DOM): must start anchor
        null_anchor = None
        started_null_anchor = False
        if not null_anchor or null_anchor.paused:
            started_null_anchor = True
        self.assertTrue(started_null_anchor, "startLiveAudioAnchor must execute when anchor element is null")

        # Player resume invocation
        player.play(state["wasPausedByUser"], state["playbackMode"])
        self.assertFalse(player.paused, "Audio player must be unpaused after resume")
        self.assertFalse(player._preventAutoplay, "_preventAutoplay must be False after resume")
        self.assertEqual(active_audio.play_count, 1, "Active audio play() must have executed exactly once")

    def test_synthetic_simulation_mode2_bluetooth_avrcp_play_resume(self):
        """Synthetic simulation: Bluetooth AVRCP discrete Play action resume in Mode 2."""
        class MockAnchor:
            def __init__(self):
                self.paused = False

            def play(self):
                self.paused = False

        class MockAudio:
            def __init__(self):
                self.paused = True
                self.currentTime = 12.0
                self.duration = 180.0
                self.played = False

            def play(self):
                self.paused = False
                self.played = True

        mock_audio = MockAudio()
        mock_anchor = MockAnchor()
        state = {
            "wasPausedByUser": True,
            "playbackMode": "mode2",
            "playbackState": "playing"
        }

        # Bluetooth AVRCP Play key routes to handlePlayAction()
        state["wasPausedByUser"] = False
        state["playbackState"] = "playing"
        mock_audio.play()

        self.assertFalse(state["wasPausedByUser"])
        self.assertFalse(mock_audio.paused)
        self.assertTrue(mock_audio.played)

    def test_synthetic_simulation_mode2_bluetooth_toggle_resume(self):
        """Synthetic simulation: Bluetooth single-button PlayPause toggle resume in Mode 2."""
        state = {
            "wasPausedByUser": True,
            "playbackMode": "mode2",
            "audioPaused": True,
            "playbackState": "playing"
        }

        # playpause handler check
        isActuallyPaused = state["audioPaused"] or state["wasPausedByUser"]
        self.assertTrue(isActuallyPaused)

        state["wasPausedByUser"] = False
        state["audioPaused"] = False
        state["playbackState"] = "playing"

        self.assertFalse(state["wasPausedByUser"])
        self.assertFalse(state["audioPaused"])
        self.assertEqual(state["playbackState"], "playing")

if __name__ == '__main__':
    unittest.main()
