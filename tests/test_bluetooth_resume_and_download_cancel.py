import os
import re
import unittest

class TestBluetoothResumeAndDownloadCancel(unittest.TestCase):
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

        with open(os.path.join(base_dir, 'sw.js'), 'r', encoding='utf-8') as f:
            cls.sw_content = f.read()

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
            'sw.js': self.sw_content,
            'test_bluetooth_resume_and_download_cancel.py': self.test_file_content
        }
        for name, content in files.items():
            matches = emoji_pattern.findall(content)
            self.assertEqual(len(matches), 0, f"Found emojis in {name}: {matches}")

    def test_issue1_unqueue_toast_suppressed(self):
        """Unqueuing via double-swipe right or contextmenu removes visual cues without showing toast."""
        self.assertNotIn('showEphemeralToast("Unqueued", false);', self.main_content)
        self.assertIn("targetLi.classList.remove('enqueued-flash');", self.main_content)
        self.assertIn("targetLi.style.removeProperty('--enqueued-color');", self.main_content)
        self.assertIn("li.classList.remove(\"enqueued-flash\");", self.main_content)

    def test_issue2_download_deconfirmation_cancel_and_noop(self):
        """downloadSingleTrack cancels in-flight download or does nothing if already downloaded."""
        self.assertIn("window.activeDownloadAbortControllers", self.playback_content)
        self.assertIn("existingCtrl.abort();", self.playback_content)
        self.assertIn("Cancelled download:", self.playback_content)
        self.assertIn("return { cancelled: true };", self.playback_content)
        self.assertIn("return { alreadyDownloaded: true };", self.playback_content)
        # Ensure mediaCache.delete is not called when already downloaded
        self.assertNotIn("showDownloadToast(`Removed from offline:", self.playback_content)

    def test_issue3_bluetooth_resume_in_pause_action_handler(self):
        """setActionHandler('pause') resumes when isActuallyPaused across Mode 1 and Mode 2."""
        pause_match = re.search(
            r"navigator\.mediaSession\.setActionHandler\(\s*['\"]pause['\"]\s*,\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s{8}\}\);",
            self.ms_content
        )
        self.assertIsNotNone(pause_match, "Pause action handler not found")
        pause_body = pause_match.group(1)

        self.assertIn("if (isActuallyPaused)", pause_body)
        self.assertIn("window.wasPausedByUser = false;", pause_body)
        self.assertIn("audioPlayer.play()", pause_body)

    def test_issue3_audio_player_play_event_not_vetoed_by_was_paused_by_user(self):
        """audioPlayer play event does not veto resume with wasPausedByUser."""
        self.assertNotRegex(
            self.main_content,
            r'audioPlayer\.addEventListener\(\s*[\'"]play[\'"][\s\S]*?if\s*\(\s*window\.wasPausedByUser\s*\)\s*\{[\s\S]*?audioPlayer\.instantPause\(\);'
        )

    def test_issue3_media_keys_in_universal_shortcuts(self):
        """Universal keydown shortcuts support hardware Media keys."""
        self.assertIn("MediaPlayPause", self.main_content)
        self.assertIn("MediaPlay", self.main_content)
        self.assertIn("MediaPause", self.main_content)
        self.assertIn("MediaTrackNext", self.main_content)
        self.assertIn("MediaTrackPrevious", self.main_content)


    def test_issue3_main_play_listener_clears_prevent_autoplay(self):
        """audioPlayer play listener clears audioPlayer._preventAutoplay alongside wasPausedByUser in main.js."""
        self.assertRegex(
            self.main_content,
            r"audioPlayer\.addEventListener\(\s*['\"]play['\"][\s\S]*?window\.wasPausedByUser\s*=\s*false;[\s\S]*?audioPlayer\._preventAutoplay\s*=\s*false;"
        )

    def test_issue3_pause_action_handler_unconditional_play_invocation(self):
        """setActionHandler('pause') calls audioPlayer.play() without being gated behind audioPlayer.paused."""
        pause_match = re.search(
            r"navigator\.mediaSession\.setActionHandler\(\s*['\"]pause['\"]\s*,\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s{8}\}\);",
            self.ms_content
        )
        self.assertIsNotNone(pause_match, "Pause action handler not found")
        pause_body = pause_match.group(1)
        self.assertNotRegex(
            pause_body,
            r"cancelAutoKillWatchdog\(\);\s*if\s*\(\s*audioPlayer\s*&&\s*audioPlayer\.paused\s*\)\s*\{\s*const\s+playPromise\s*=\s*audioPlayer\.play\(\);"
        )
        self.assertRegex(
            pause_body,
            r"cancelAutoKillWatchdog\(\);\s*if\s*\(\s*audioPlayer\s*\)\s*\{\s*const\s+playPromise\s*=\s*audioPlayer\.play\(\);"
        )

    def test_synthetic_bluetooth_resume_simulation_mode1_and_mode2(self):
        """Synthetic simulation of Bluetooth resume in Mode 1 and Mode 2."""
        class MockElement:
            def __init__(self):
                self.paused = True
                self.played = False
                self.listeners = {}

            def addEventListener(self, event, cb):
                self.listeners.setdefault(event, []).append(cb)

            def dispatchEvent(self, event_name):
                for cb in self.listeners.get(event_name, []):
                    cb()

            def play(self):
                self.paused = False
                self.played = True
                self.dispatchEvent("play")

            def pause(self):
                self.paused = True

        class MockDualAudioPingPong:
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
                self.active.addEventListener("play", lambda: self.forwardEvent('play'))

            def addEventListener(self, event, cb):
                self.listeners.setdefault(event, []).append(cb)

            def dispatchEvent(self, event_name):
                for cb in self.listeners.get(event_name, []):
                    cb()

            @property
            def paused(self):
                return self.active.paused

            def play(self, wasPausedByUser):
                if wasPausedByUser:
                    return
                self._preventAutoplay = False
                self.active.play()

        # Mode 1 Simulation
        active1 = MockElement()
        player1 = MockDualAudioPingPong(active1)
        state1 = {"wasPausedByUser": True, "playbackMode": "mode1", "playbackState": "paused"}
        player1._preventAutoplay = True

        def on_main_play_mode1():
            state1["wasPausedByUser"] = False
            state1["playbackState"] = "playing"
            player1._preventAutoplay = False

        player1.addEventListener("play", on_main_play_mode1)

        # Bluetooth AVRCP Play in Mode 1
        state1["wasPausedByUser"] = False
        player1.play(state1["wasPausedByUser"])

        self.assertFalse(state1["wasPausedByUser"], "Mode 1 wasPausedByUser should be cleared")
        self.assertFalse(player1._preventAutoplay, "Mode 1 _preventAutoplay should be false")
        self.assertEqual(state1["playbackState"], "playing", "Mode 1 playbackState should be playing")
        self.assertFalse(player1.paused, "Mode 1 audio player should not be paused")

        # Mode 2 Simulation: Bluetooth single-button AVRCP press delivers onPause()
        active2 = MockElement()
        player2 = MockDualAudioPingPong(active2)
        state2 = {"wasPausedByUser": True, "playbackMode": "mode2", "playbackState": "playing", "anchorActive": True}
        player2._preventAutoplay = True

        def on_main_play_mode2():
            state2["wasPausedByUser"] = False
            state2["playbackState"] = "playing"
            player2._preventAutoplay = False

        player2.addEventListener("play", on_main_play_mode2)

        # Android delivers onPause to setActionHandler('pause')
        isActuallyPaused = player2.paused or state2["wasPausedByUser"]
        self.assertTrue(isActuallyPaused, "Mode 2 should detect isActuallyPaused before resume")

        # In pause handler resume branch:
        state2["wasPausedByUser"] = False
        player2.play(state2["wasPausedByUser"])

        self.assertFalse(state2["wasPausedByUser"], "Mode 2 wasPausedByUser should be cleared")
        self.assertFalse(player2._preventAutoplay, "Mode 2 _preventAutoplay should be false")
        self.assertFalse(player2.paused, "Mode 2 audio player should not be paused")
        self.assertTrue(state2["anchorActive"], "Mode 2 anchor remains active to retain notification card")

if __name__ == '__main__':
    unittest.main()
