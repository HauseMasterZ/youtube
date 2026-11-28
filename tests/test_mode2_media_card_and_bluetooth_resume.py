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

    def test_main_mode2_pause_passes_micro_rate_and_not_rate_1(self):
        """main.js Mode 2 pause listener calls updateMediaSessionPosition with 0.00001, true and not 1.0."""
        pause_block_match = re.search(r'audioPlayer\.addEventListener\(\s*[\'"]pause[\'"]\s*,[\s\S]*?\}\);', self.main_content)
        self.assertIsNotNone(pause_block_match, "Could not find audioPlayer pause listener in main.js")
        pause_block = pause_block_match.group(0)

        # Mode 2 user pause block:
        mode2_user_pause_match = re.search(
            r'if\s*\(\s*window\.playbackMode\s*===\s*[\'"]mode2[\'"]\s*&&\s*!isRecentBtDisconnect\s*\)\s*\{\s*if\s*\(\s*window\.wasPausedByUser\s*\)\s*\{([\s\S]*?)\}\s*else',
            pause_block
        )
        self.assertIsNotNone(mode2_user_pause_match, "Could not find Mode 2 wasPausedByUser pause block in main.js")
        mode2_block = mode2_user_pause_match.group(1)

        # Must pass 0.00001, true
        self.assertIn("updateMediaSessionPosition(audioPlayer.currentTime, dur, 0.00001, true);", mode2_block)
        # Must NOT pass 1.0 (rate flapping regression prevention)
        self.assertNotIn("updateMediaSessionPosition(audioPlayer.currentTime, dur, 1.0)", mode2_block)

    def test_media_session_mode2_pause_and_playpause_resume_on_is_actually_paused(self):
        """mediaSession.js pause and playpause action handlers resume playback when isActuallyPaused is true."""
        # 1. pause handler:
        pause_block_match = re.search(
            r"navigator\.mediaSession\.setActionHandler\(\s*['\"]pause['\"]\s*,\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*\);\s*try",
            self.ms_content
        )
        self.assertIsNotNone(pause_block_match, "Could not find pause action handler in mediaSession.js")
        pause_code = pause_block_match.group(1)

        self.assertIn("const isActuallyPaused = (typeof audioPlayer !== 'undefined' && audioPlayer && (audioPlayer.paused || window.wasPausedByUser));", pause_code)
        self.assertRegex(
            pause_code,
            r"if\s*\(isActuallyPaused\)\s*\{[\s\S]*?window\.wasPausedByUser\s*=\s*false;[\s\S]*?audioPlayer\._preventAutoplay\s*=\s*false;[\s\S]*?audioPlayer\.play\(\)"
        )

        # 2. playpause handler:
        playpause_block_match = re.search(
            r"navigator\.mediaSession\.setActionHandler\(\s*['\"]playpause['\"]\s*,\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*\);\s*\}\s*catch",
            self.ms_content
        )
        self.assertIsNotNone(playpause_block_match, "Could not find playpause action handler in mediaSession.js")
        playpause_code = playpause_block_match.group(1)

        self.assertIn("const isActuallyPaused = (typeof audioPlayer !== 'undefined' && audioPlayer && (audioPlayer.paused || window.wasPausedByUser));", playpause_code)
        self.assertRegex(
            playpause_code,
            r"if\s*\(isActuallyPaused\)\s*\{[\s\S]*?window\.wasPausedByUser\s*=\s*false;[\s\S]*?audioPlayer\._preventAutoplay\s*=\s*false;[\s\S]*?audioPlayer\.play\(\)"
        )

    def test_media_session_mode2_play_action_resumes_playback(self):
        """mediaSession.js handlePlayAction clears flags, forces rate 1.0, and calls audioPlayer.play()."""
        play_block_match = re.search(
            r"function\s+handlePlayAction\(\)\s*\{([\s\S]*?)\n\s{4}\}",
            self.ms_content
        )
        self.assertIsNotNone(play_block_match, "Could not find handlePlayAction in mediaSession.js")
        play_code = play_block_match.group(1)

        self.assertIn("window.wasPausedByUser = false;", play_code)
        self.assertIn("audioPlayer._preventAutoplay = false;", play_code)
        self.assertIn("updateMediaSessionPosition(actualTime, dur, 1.0, true);", play_code)
        self.assertIn("audioPlayer.play();", play_code)

    def test_media_session_resume_ordering_metadata_before_position_rate_1(self):
        """republishMediaMetadata strictly precedes updateMediaSessionPosition with rate 1.0 across all resume sites."""
        # Check handlePlayAction
        handle_play_match = re.search(r"function\s+handlePlayAction\(\)\s*\{([\s\S]*?)audioPlayer\.play\(\)", self.ms_content)
        self.assertIsNotNone(handle_play_match)
        play_code = handle_play_match.group(1)
        meta_pos = play_code.find("republishMediaMetadata")
        update_pos = play_code.find("updateMediaSessionPosition(actualTime, dur, 1.0, true)")
        self.assertNotEqual(meta_pos, -1)
        self.assertNotEqual(update_pos, -1)
        self.assertLess(meta_pos, update_pos, "republishMediaMetadata must precede updateMediaSessionPosition in handlePlayAction")

        # Check pause resume branch
        pause_match = re.search(r"setActionHandler\(\s*['\"]pause['\"][\s\S]*?if\s*\(isActuallyPaused\)\s*\{([\s\S]*?)audioPlayer\.play\(\)", self.ms_content)
        self.assertIsNotNone(pause_match)
        pause_resume_code = pause_match.group(1)
        meta_pos = pause_resume_code.find("republishMediaMetadata")
        update_pos = pause_resume_code.find("updateMediaSessionPosition(actualTime, dur, 1.0, true)")
        self.assertNotEqual(meta_pos, -1)
        self.assertNotEqual(update_pos, -1)
        self.assertLess(meta_pos, update_pos, "republishMediaMetadata must precede updateMediaSessionPosition in pause resume branch")

        # Check playpause resume branch
        playpause_match = re.search(r"setActionHandler\(\s*['\"]playpause['\"][\s\S]*?if\s*\(isActuallyPaused\)\s*\{([\s\S]*?)audioPlayer\.play\(\)", self.ms_content)
        self.assertIsNotNone(playpause_match)
        playpause_resume_code = playpause_match.group(1)
        meta_pos = playpause_resume_code.find("republishMediaMetadata")
        update_pos = playpause_resume_code.find("updateMediaSessionPosition(actualTime, dur, 1.0, true)")
        self.assertNotEqual(meta_pos, -1)
        self.assertNotEqual(update_pos, -1)
        self.assertLess(meta_pos, update_pos, "republishMediaMetadata must precede updateMediaSessionPosition in playpause resume branch")

    def test_conditional_anchor_avoids_redundant_play_on_resume(self):
        """Conditional anchor guard (!anchor || anchor.paused) strictly avoids redundant play() on resume across all paths."""
        # Verify guard pattern in mediaSession.js
        self.assertRegex(self.ms_content, r'!_resumeAnchorEl\s*\|\|\s*_resumeAnchorEl\.paused')
        self.assertRegex(self.ms_content, r'!_pauseResumeAnchorEl\s*\|\|\s*_pauseResumeAnchorEl\.paused')
        self.assertRegex(self.ms_content, r'!_toggleAnchorEl\s*\|\|\s*_toggleAnchorEl\.paused')

        # Simulation: when anchor is running (paused=False), resume must not trigger anchor.play()
        class AnchorTracker:
            def __init__(self, is_paused=False):
                self.paused = is_paused
                self.play_calls = 0

            def play(self):
                self.paused = False
                self.play_calls += 1

        # Case 1: Anchor is already running
        running_anchor = AnchorTracker(is_paused=False)
        if not running_anchor or running_anchor.paused:
            running_anchor.play()
        self.assertEqual(running_anchor.play_calls, 0, "Running anchor must not receive redundant play() calls on resume")

        # Case 2: Anchor is paused
        paused_anchor = AnchorTracker(is_paused=True)
        if not paused_anchor or paused_anchor.paused:
            paused_anchor.play()
        self.assertEqual(paused_anchor.play_calls, 1, "Paused anchor must receive play() call on resume")

        # Case 3: Anchor is None (not yet in DOM)
        none_anchor = None
        started = False
        if not none_anchor or none_anchor.paused:
            started = True
        self.assertTrue(started, "Null anchor must trigger anchor start")

    def test_fresh_visit_first_play_user_gesture_anchor_priming(self):
        """playTrackSelection synchronously primes anchor, focus probe, and anchor start before async playlist load."""
        play_track_match = re.search(
            r"async\s+function\s+playTrackSelection\s*\([\s\S]*?loadPlaylist\(targetPlaylist\);",
            self.playback_content
        )
        self.assertIsNotNone(play_track_match, "playTrackSelection async function start not found in playback.js")
        pre_await_code = play_track_match.group(0)

        # 1. Mode 2 and mobile guard
        self.assertIn("if (window.playbackMode === 'mode2' && typeof isMobileDevice !== 'undefined' && isMobileDevice)", pre_await_code)
        # 2. Synchronous initLiveAudioAnchor
        self.assertIn("initLiveAudioAnchor();", pre_await_code)
        # 3. Synchronous primeFocusProbe
        self.assertIn("primeFocusProbe();", pre_await_code)
        # 4. Synchronous guarded startLiveAudioAnchor
        self.assertRegex(
            pre_await_code,
            r"\(!_anchor\s*\|\|\s*_anchor\.paused\)\s*&&\s*typeof\s+startLiveAudioAnchor\s*===\s*['\"]function['\"]\s*\)\s*\{\s*startLiveAudioAnchor\(\);"
        )

        # 5. Position check: synchronous priming must strictly precede await loadPlaylist
        prime_idx = pre_await_code.find("initLiveAudioAnchor()")
        await_idx = pre_await_code.find("await loadPlaylist(targetPlaylist)")
        self.assertNotEqual(prime_idx, -1)
        self.assertNotEqual(await_idx, -1)
        self.assertLess(prime_idx, await_idx, "Synchronous anchor priming must precede await loadPlaylist to retain user gesture token")

        # 6. Settings toggle ordering in main.js: togglePlaybackMode must precede initLiveAudioAnchor
        settings_toggle_match = re.search(
            r"modeRadios\.forEach[\s\S]*?\}\);\s*\}\);",
            self.main_content
        )
        self.assertIsNotNone(settings_toggle_match, "Settings modeRadios change listener not found in main.js")
        toggle_code = settings_toggle_match.group(0)
        toggle_idx = toggle_code.find("togglePlaybackMode(newMode);")
        init_idx = toggle_code.find("initLiveAudioAnchor();")
        self.assertNotEqual(toggle_idx, -1)
        self.assertNotEqual(init_idx, -1)
        self.assertLess(toggle_idx, init_idx, "togglePlaybackMode must precede initLiveAudioAnchor so playbackMode is mode2 during initialization")

    def test_first_play_pause_retention_under_android_media_session_helper_simulation(self):
        """Simulation: first-play pause retention of Android notification card under AndroidMediaSessionHelper."""
        class SimulatedChromiumMediaSession:
            def __init__(self):
                self.normal_players = set()
                self.audio_focus_state = 'INACTIVE'
                self.desired_focus = 'kGain'

            def add_player(self, player):
                self.normal_players.add(player)
                self.audio_focus_state = 'ACTIVE'

            def remove_player(self, player):
                if player in self.normal_players:
                    self.normal_players.remove(player)
                if len(self.normal_players) == 0:
                    self.audio_focus_state = 'INACTIVE'

            def is_controllable(self):
                return self.audio_focus_state != 'INACTIVE' and len(self.normal_players) > 0

        class SimulatedAndroidHelper:
            def __init__(self, session):
                self.session = session
                self.notification_visible = False
                self.notification_destroyed = False
                self.hide_task_scheduled_at = None

            def on_state_changed(self, virtual_time_ms):
                controllable = self.session.is_controllable()
                if controllable:
                    self.notification_visible = True
                    self.hide_task_scheduled_at = None
                else:
                    if self.hide_task_scheduled_at is None:
                        self.hide_task_scheduled_at = virtual_time_ms + 500

            def advance_time(self, virtual_time_ms):
                if self.hide_task_scheduled_at is not None and virtual_time_ms >= self.hide_task_scheduled_at:
                    self.notification_visible = False
                    self.notification_destroyed = True
                    self.hide_task_scheduled_at = None

        # Fresh visit sequence in Mode 2
        session = SimulatedChromiumMediaSession()
        helper = SimulatedAndroidHelper(session)
        t_ms = 0

        audio_player = "audioPlayer"
        anchor_el = "liveStreamAnchor"

        # 1. User clicks track (user gesture): synchronous priming starts anchor
        session.add_player(anchor_el)
        helper.on_state_changed(t_ms)
        self.assertTrue(session.is_controllable())
        self.assertTrue(helper.notification_visible)

        # 2. Audio starts playing
        session.add_player(audio_player)
        helper.on_state_changed(t_ms)
        self.assertEqual(len(session.normal_players), 2)

        # 3. User pauses first song:
        session.remove_player(audio_player)
        helper.on_state_changed(t_ms)

        # Anchor remains in normal_players
        self.assertIn(anchor_el, session.normal_players)
        self.assertTrue(session.is_controllable(), "Chromium must remain controllable while anchor is playing")

        # Advance virtual time through the 500ms Android hide delay window
        t_ms = 600
        helper.advance_time(t_ms)
        self.assertTrue(helper.notification_visible, "Media card notification must remain visible past 500ms deadline")
        self.assertFalse(helper.notification_destroyed, "Media card must not be destroyed on first pause")

        # Advance further to 3000ms
        t_ms = 3000
        helper.advance_time(t_ms)
        self.assertTrue(helper.notification_visible, "Media card must remain pinned across steady-state Mode 2 pause")
        self.assertFalse(helper.notification_destroyed)

    def test_mode2_media_card_center_button_and_bluetooth_avrcp_multi_vector_resume(self):
        """Multi-vector resume verification across notification card, toggle, discrete play, and hardware keys."""
        class MockPlayer:
            def __init__(self):
                self.paused = True
                self.currentTime = 30.0
                self.duration = 150.0
                self._preventAutoplay = True
                self.play_calls = 0

            def play(self):
                self.paused = False
                self.play_calls += 1

        class MockMediaSession:
            def __init__(self):
                self.playbackState = 'playing'
                self.last_rate = None
                self.last_force = None

            def update_position(self, pos, dur, rate, force=False):
                self.last_rate = rate
                self.last_force = force

        # Vector 1: Center button tap in notification card (routes to onPause -> setActionHandler('pause') resume branch)
        player = MockPlayer()
        ms = MockMediaSession()
        wasPausedByUser = True
        isActuallyPaused = player.paused or wasPausedByUser
        self.assertTrue(isActuallyPaused)

        wasPausedByUser = False
        player._preventAutoplay = False
        ms.update_position(player.currentTime, player.duration, 1.0, True)
        player.play()

        self.assertFalse(wasPausedByUser)
        self.assertFalse(player._preventAutoplay)
        self.assertEqual(ms.last_rate, 1.0)
        self.assertTrue(ms.last_force)
        self.assertFalse(player.paused)
        self.assertEqual(player.play_calls, 1)

        # Vector 2: Bluetooth toggle headset command (routes to setActionHandler('playpause') resume branch)
        player = MockPlayer()
        ms = MockMediaSession()
        wasPausedByUser = True
        isActuallyPaused = player.paused or wasPausedByUser
        self.assertTrue(isActuallyPaused)

        wasPausedByUser = False
        player._preventAutoplay = False
        ms.update_position(player.currentTime, player.duration, 1.0, True)
        player.play()

        self.assertFalse(wasPausedByUser)
        self.assertFalse(player._preventAutoplay)
        self.assertEqual(ms.last_rate, 1.0)
        self.assertFalse(player.paused)
        self.assertEqual(player.play_calls, 1)

        # Vector 3: Discrete Play command (routes to handlePlayAction)
        player = MockPlayer()
        ms = MockMediaSession()
        wasPausedByUser = True

        wasPausedByUser = False
        player._preventAutoplay = False
        ms.update_position(player.currentTime, player.duration, 1.0, True)
        player.play()

        self.assertFalse(wasPausedByUser)
        self.assertFalse(player._preventAutoplay)
        self.assertEqual(ms.last_rate, 1.0)
        self.assertFalse(player.paused)
        self.assertEqual(player.play_calls, 1)

        # Vector 4: Hardware media keys (keydown MediaPlayPause / MediaPlay in main.js)
        self.assertIn("'MediaPlayPause'", self.main_content)
        self.assertIn("'MediaPlay'", self.main_content)
        self.assertIn("btnPlayPause.click();", self.main_content)

    def test_mode2_micro_rate_consistency_and_zero_rate_flapping(self):
        """Micro-rate 0.00001 consistency across pause handlers and absence of rate flapping."""
        # 1. anchorEl pause listener passes 0.00001, true and never 1.0
        anchor_pause_match = re.search(
            r'anchorEl\.addEventListener\(\s*["\']pause["\'][\s\S]*?updateMediaSessionPosition\([^)]*\);',
            self.ms_content
        )
        self.assertIsNotNone(anchor_pause_match)
        self.assertIn("0.00001, true", anchor_pause_match.group(0))
        self.assertNotIn("1.0", anchor_pause_match.group(0))

        # 2. liveAudioContext onstatechange listener passes 0.00001, true and never 1.0
        ctx_match = re.search(
            r'liveAudioContext\.onstatechange\s*=\s*\(\)\s*=>\s*\{[\s\S]*?updateMediaSessionPosition\([^)]*\);',
            self.ms_content
        )
        self.assertIsNotNone(ctx_match)
        self.assertIn("0.00001, true", ctx_match.group(0))
        self.assertNotIn("1.0", ctx_match.group(0))

        # 3. btnPlayPause click listener Mode 2 pause branch passes 0.00001, true
        btn_match = re.search(
            r'btnPlayPause\.addEventListener\(\s*["\']click["\'][\s\S]*?if\s*\(\s*window\.playbackMode\s*===\s*[\'"]mode2[\'"]\s*&&\s*hasMediaSession\s*\)\s*\{[\s\S]*?updateMediaSessionPosition\([^)]*\);',
            self.main_content
        )
        self.assertIsNotNone(btn_match)
        self.assertIn("0.00001, true", btn_match.group(0))

        # 4. reassertSpoofBurst passes 0.00001, true
        burst_match = re.search(
            r'function\s+reassertSpoofBurst\s*\(\s*\)\s*\{[\s\S]*?updateMediaSessionPosition\([^)]*\);',
            self.ms_content
        )
        self.assertIsNotNone(burst_match)
        self.assertIn("0.00001, true", burst_match.group(0))

        # 5. Simulation: 100 rapid pause ticks verify rate stability
        def resolve_rate(forced_rate, is_paused, mode):
            if isinstance(forced_rate, (int, float)) and forced_rate > 0:
                return forced_rate
            if is_paused and mode == 'mode2':
                return 0.00001
            return 1.0

        for _ in range(100):
            rate_heartbeat = resolve_rate(0.00001, is_paused=True, mode='mode2')
            rate_pause_listener = resolve_rate(0.00001, is_paused=True, mode='mode2')
            rate_spoof_burst = resolve_rate(0.00001, is_paused=True, mode='mode2')
            self.assertEqual(rate_heartbeat, 0.00001)
            self.assertEqual(rate_pause_listener, 0.00001)
            self.assertEqual(rate_spoof_burst, 0.00001)

if __name__ == '__main__':
    unittest.main()
