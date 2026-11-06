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

if __name__ == '__main__':
    unittest.main()
