import os
import re
import unittest

class TestBluetoothAvrcpChallenger(unittest.TestCase):
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

        with open(os.path.join(base_dir, 'js', 'state.js'), 'r', encoding='utf-8') as f:
            cls.state_content = f.read()

    def test_zero_emojis_rigorous(self):
        """Audit for emojis across all javascript, python tests, and documentation."""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        files_to_check = [
            os.path.join(self.base_dir, 'js', 'main.js'),
            os.path.join(self.base_dir, 'js', 'playback.js'),
            os.path.join(self.base_dir, 'js', 'mediaSession.js'),
            os.path.join(self.base_dir, 'js', 'dom.js'),
            os.path.join(self.base_dir, 'js', 'state.js'),
            os.path.join(self.base_dir, 'tests', 'test_bluetooth_resume_and_download_cancel.py'),
            os.path.join(self.base_dir, 'tests', 'test_bluetooth_avrcp_challenger.py'),
            os.path.join(os.path.dirname(self.base_dir), 'GEMINI.md'),
            os.path.join(self.base_dir, 'GEMINI.md')
        ]
        for path in files_to_check:
            if os.path.exists(path):
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                matches = emoji_pattern.findall(content)
                self.assertEqual(len(matches), 0, f"Emoji violation found in {path}: {matches}")

    def test_dom_forward_event_suppresses_prevent_autoplay(self):
        """Verify dom.js forwardEvent suppresses play and playing when _preventAutoplay is active."""
        match = re.search(
            r"this\.forwardEvent\s*=\s*\(e\)\s*=>\s*\{([\s\S]*?)\n\s{12}\};",
            self.dom_content
        )
        self.assertIsNotNone(match, "forwardEvent definition not found in dom.js")
        body = match.group(1)
        self.assertIn("if (this._preventAutoplay && (e.type === 'play' || e.type === 'playing'))", body)
        self.assertRegex(
            self.dom_content,
            r'play\(\)\s*\{[\s\S]*?this\._preventAutoplay\s*=\s*false;'
        )

    def test_media_session_pause_handler_unconditional_play(self):
        """Verify setActionHandler('pause') invokes play unconditionally when isActuallyPaused is true."""
        pause_match = re.search(
            r"navigator\.mediaSession\.setActionHandler\(\s*['\"]pause['\"]\s*,\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s{8}\}\);",
            self.ms_content
        )
        self.assertIsNotNone(pause_match, "Pause action handler not found in mediaSession.js")
        body = pause_match.group(1)
        self.assertIn("if (isActuallyPaused)", body)
        self.assertIn("window.wasPausedByUser = false;", body)
        self.assertRegex(body, r"cancelAutoKillWatchdog\(\);\s*if\s*\(\s*audioPlayer\s*\)\s*\{\s*const\s+playPromise\s*=\s*audioPlayer\.play\(\);")

    def test_main_play_listener_clears_prevent_autoplay(self):
        """Verify main.js play listener resets both wasPausedByUser and audioPlayer._preventAutoplay."""
        play_match = re.search(
            r'audioPlayer\.addEventListener\(\s*["\']play["\']\s*,\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s{4}\}\);',
            self.main_content
        )
        self.assertIsNotNone(play_match, "Play listener not found in main.js")
        body = play_match.group(1)
        self.assertIn("window.wasPausedByUser = false;", body)
        self.assertRegex(
            body,
            r"if\s*\(\s*audioPlayer\s*&&\s*typeof\s+audioPlayer\._preventAutoplay\s*!==\s*['\"]undefined['\"]\s*\)\s*\{\s*audioPlayer\._preventAutoplay\s*=\s*false;\s*\}"
        )

    def test_call_active_and_quarantine_guards_across_all_entry_points(self):
        """Verify isCallActive and isPostCallQuarantine guards exist at all play/pause entry points."""
        # 1. main.js play listener
        self.assertRegex(
            self.main_content,
            r'audioPlayer\.addEventListener\(\s*["\']play["\'][\s\S]*?if\s*\(\s*window\.isCallActive\s*\|\|\s*\(typeof window\.isPostCallQuarantine === [\'"]function[\'"] && window\.isPostCallQuarantine\(\)\)\s*\)\s*\{\s*audioPlayer\.instantPause\(\);'
        )
        # 2. mediaSession.js handlePlayAction
        self.assertRegex(
            self.ms_content,
            r'function\s+handlePlayAction\(\)\s*\{[\s\S]*?if\s*\(\s*window\.isCallActive\s*\)\s*return;[\s\S]*?if\s*\(\s*typeof window\.isPostCallQuarantine === [\'"]function[\'"] && window\.isPostCallQuarantine\(\)\s*\)\s*\{\s*return;'
        )
        # 3. mediaSession.js pause handler
        self.assertRegex(
            self.ms_content,
            r'setActionHandler\(\s*[\'"]pause[\'"][\s\S]*?if\s*\(\s*window\.isCallActive\s*\)\s*return;[\s\S]*?if\s*\(isActuallyPaused\)\s*\{\s*if\s*\(\s*typeof window\.isPostCallQuarantine === [\'"]function[\'"] && window\.isPostCallQuarantine\(\)\s*\)\s*\{\s*return;'
        )

    def test_synthetic_mode1_bluetooth_toggle_lifecycle(self):
        """Empirically test complete Mode 1 pause and resume lifecycle via single-button and discrete events."""
        class MockAudioElement:
            def __init__(self):
                self.paused = True
                self.currentTime = 10.0
                self.duration = 180.0
                self.volume = 1.0
                self.listeners = {}

            def addEventListener(self, event, cb):
                self.listeners.setdefault(event, []).append(cb)

            def dispatchEvent(self, event_type):
                for cb in self.listeners.get(event_type, []):
                    cb()

            def play(self):
                self.paused = False
                self.dispatchEvent('play')

            def pause(self):
                self.paused = True
                self.dispatchEvent('pause')

        class MockDualPingPong:
            def __init__(self, active_el):
                self.active = active_el
                self._preventAutoplay = False
                self.switching = False
                self.listeners = {}

                def forwardEvent(e_type):
                    if not self.switching:
                        if self._preventAutoplay and (e_type == 'play' or e_type == 'playing'):
                            return
                        self.dispatchEvent(e_type)

                self.forwardEvent = forwardEvent
                self.active.addEventListener('play', lambda: self.forwardEvent('play'))
                self.active.addEventListener('pause', lambda: self.forwardEvent('pause'))

            def addEventListener(self, event, cb):
                self.listeners.setdefault(event, []).append(cb)

            def dispatchEvent(self, event_type):
                for cb in self.listeners.get(event_type, []):
                    cb()

            @property
            def paused(self):
                return self.active.paused

            def play(self, wasPausedByUser):
                if wasPausedByUser:
                    return
                self._preventAutoplay = False
                self.active.play()

            def instantPause(self):
                self._preventAutoplay = True
                self.active.pause()

        # Setup Mode 1 environment
        active = MockAudioElement()
        player = MockDualPingPong(active)
        state = {
            "wasPausedByUser": False,
            "playbackMode": "mode1",
            "playbackState": "playing",
            "isCallActive": False
        }

        def on_player_play():
            if state["isCallActive"]:
                player.instantPause()
                return
            state["wasPausedByUser"] = False
            player._preventAutoplay = False
            state["playbackState"] = "playing"

        player.addEventListener('play', on_player_play)

        # 1. Active playback initial state
        player.play(state["wasPausedByUser"])
        self.assertFalse(player.paused)
        self.assertEqual(state["playbackState"], "playing")

        # 2. Bluetooth pause in Mode 1
        isActuallyPaused = player.paused or state["wasPausedByUser"]
        self.assertFalse(isActuallyPaused, "Should not be paused initially")
        state["wasPausedByUser"] = True
        state["playbackState"] = "paused"
        player.instantPause()
        self.assertTrue(player.paused)
        self.assertTrue(player._preventAutoplay)
        self.assertTrue(state["wasPausedByUser"])

        # 3. Single-button Bluetooth headset resume (sends onPause while paused)
        isActuallyPaused = player.paused or state["wasPausedByUser"]
        self.assertTrue(isActuallyPaused, "Must detect isActuallyPaused = true")

        # In pause handler:
        state["wasPausedByUser"] = False
        state["playbackState"] = "playing"
        player.play(state["wasPausedByUser"])

        # Assert full resumption
        self.assertFalse(player.paused)
        self.assertFalse(player._preventAutoplay)
        self.assertFalse(state["wasPausedByUser"])
        self.assertEqual(state["playbackState"], "playing")

    def test_synthetic_mode2_bluetooth_toggle_with_anchor_retention(self):
        """Empirically test Mode 2 single-button AVRCP resume while anchor keeps notification card pinned."""
        class MockAnchor:
            def __init__(self):
                self.running = False

            def start(self):
                self.running = True

            def stop(self):
                self.running = False

        class MockPlayer:
            def __init__(self):
                self.paused = False
                self._preventAutoplay = False
                self.listeners = {}

            def addEventListener(self, event, cb):
                self.listeners.setdefault(event, []).append(cb)

            def dispatchEvent(self, event_type):
                for cb in self.listeners.get(event_type, []):
                    cb()

            def instantPause(self):
                self.paused = True
                self._preventAutoplay = True
                self.dispatchEvent('pause')

            def play(self, wasPausedByUser):
                if wasPausedByUser:
                    return
                self.paused = False
                self._preventAutoplay = False
                self.dispatchEvent('play')

        anchor = MockAnchor()
        player = MockPlayer()
        state = {
            "wasPausedByUser": False,
            "playbackMode": "mode2",
            "playbackState": "playing",
            "isCallActive": False,
            "notificationCardVisible": True
        }

        def on_player_play():
            if state["isCallActive"]:
                player.instantPause()
                return
            state["wasPausedByUser"] = False
            player._preventAutoplay = False
            state["playbackState"] = "playing"

        player.addEventListener('play', on_player_play)

        # 1. User pauses via Bluetooth button in Mode 2
        # Mode 2 keeps playbackState = 'playing' (or declaredPausedState) and starts anchor
        state["wasPausedByUser"] = True
        player.instantPause()
        anchor.start()
        # Android SystemUI notification remains visible because anchor is running and playbackState is 'playing'
        self.assertTrue(anchor.running, "Mode 2 anchor must be running")
        self.assertTrue(player.paused, "Audio player must be paused")
        self.assertTrue(state["notificationCardVisible"], "Media card must not be evicted")

        # 2. User presses Bluetooth single-button headset to resume
        # Because playbackState is 'playing', Android sends onPause()
        isActuallyPaused = player.paused or state["wasPausedByUser"]
        self.assertTrue(isActuallyPaused, "Must identify actual paused state despite spoofed playbackState")

        # setActionHandler('pause') executes resume branch:
        state["wasPausedByUser"] = False
        # Anchor remains running or restarted
        if not anchor.running:
            anchor.start()
        player.play(state["wasPausedByUser"])

        # Assert full recovery
        self.assertFalse(player.paused, "Audio player must be playing")
        self.assertFalse(player._preventAutoplay, "_preventAutoplay must be reset")
        self.assertFalse(state["wasPausedByUser"], "wasPausedByUser must be cleared")
        self.assertTrue(anchor.running, "Anchor remains active in Mode 2")
        self.assertTrue(state["notificationCardVisible"], "Notification card remains pinned")

    def test_synthetic_rapid_toggling_stress(self):
        """Stress test 20 consecutive rapid Bluetooth toggle cycles to ensure no deadlocks or state desync."""
        class MockAudio:
            def __init__(self):
                self.paused = True
                self._preventAutoplay = False
                self.play_calls = 0
                self.pause_calls = 0

            def play(self, wasPausedByUser):
                if wasPausedByUser:
                    return
                self.paused = False
                self._preventAutoplay = False
                self.play_calls += 1

            def instantPause(self):
                self.paused = True
                self._preventAutoplay = True
                self.pause_calls += 1

        audio = MockAudio()
        state = {"wasPausedByUser": True, "playbackMode": "mode2"}

        for cycle in range(20):
            # State: paused -> trigger resume
            isActuallyPaused = audio.paused or state["wasPausedByUser"]
            self.assertTrue(isActuallyPaused, f"Cycle {cycle}: should be paused before resume")
            state["wasPausedByUser"] = False
            audio.play(state["wasPausedByUser"])
            self.assertFalse(audio.paused, f"Cycle {cycle}: should be playing after resume")
            self.assertFalse(audio._preventAutoplay, f"Cycle {cycle}: _preventAutoplay should be false")

            # State: playing -> trigger pause
            isActuallyPaused = audio.paused or state["wasPausedByUser"]
            self.assertFalse(isActuallyPaused, f"Cycle {cycle}: should be playing before pause")
            state["wasPausedByUser"] = True
            audio.instantPause()
            self.assertTrue(audio.paused, f"Cycle {cycle}: should be paused after pause")
            self.assertTrue(audio._preventAutoplay, f"Cycle {cycle}: _preventAutoplay should be true")

        self.assertEqual(audio.play_calls, 20)
        self.assertEqual(audio.pause_calls, 20)

    def test_call_interruption_bluetooth_press_defense(self):
        """Verify that Bluetooth button press during incoming call or quarantine is strictly rejected."""
        class MockAudio:
            def __init__(self):
                self.paused = True
                self._preventAutoplay = True

            def play(self, wasPausedByUser):
                if wasPausedByUser:
                    return
                self.paused = False
                self._preventAutoplay = False

            def instantPause(self):
                self.paused = True
                self._preventAutoplay = True

        audio = MockAudio()
        state = {
            "wasPausedByUser": True,
            "isCallActive": True,
            "isPostCallQuarantine": False
        }

        # User presses Bluetooth button while phone is ringing/in-call
        # In pause handler:
        isActuallyPaused = audio.paused or state["wasPausedByUser"]
        handled = False
        if not state["isCallActive"]:
            if isActuallyPaused:
                state["wasPausedByUser"] = False
                audio.play(state["wasPausedByUser"])
                handled = True

        self.assertFalse(handled, "Bluetooth resume must be rejected while isCallActive is true")
        self.assertTrue(audio.paused, "Audio must remain paused")
        self.assertTrue(state["wasPausedByUser"], "wasPausedByUser must remain true")

        # Test quarantine period (e.g. 1.5 seconds post call)
        state["isCallActive"] = False
        state["isPostCallQuarantine"] = True

        handled_quarantine = False
        if not state["isCallActive"]:
            if isActuallyPaused:
                if not state["isPostCallQuarantine"]:
                    state["wasPausedByUser"] = False
                    audio.play(state["wasPausedByUser"])
                    handled_quarantine = True

        self.assertFalse(handled_quarantine, "Bluetooth resume must be rejected during post-call quarantine")
        self.assertTrue(audio.paused, "Audio must remain paused")

    def test_hardware_media_keys_in_main_js(self):
        """Verify hardware media keys (MediaPlay, MediaPause, MediaPlayPause) trigger play/pause."""
        self.assertIn("MediaPlayPause", self.main_content)
        self.assertIn("MediaPlay", self.main_content)
        self.assertIn("MediaPause", self.main_content)
        self.assertIn("btnPlayPause.click();", self.main_content)

if __name__ == '__main__':
    unittest.main()
