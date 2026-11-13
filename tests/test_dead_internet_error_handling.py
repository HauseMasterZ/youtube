import os
import re
import unittest

class TestDeadInternetErrorHandling(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        js_dir = os.path.join(base_dir, 'js')

        with open(os.path.join(js_dir, 'playback.js'), 'r', encoding='utf-8') as f:
            cls.playback_content = f.read()
        with open(os.path.join(js_dir, 'main.js'), 'r', encoding='utf-8') as f:
            cls.main_content = f.read()
        with open(__file__, 'r', encoding='utf-8') as f:
            cls.test_content = f.read()

    def test_zero_emojis_in_source_and_tests(self):
        """Strictly zero emojis in playback.js, main.js, and this test suite"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        for name, content in [
            ('playback.js', self.playback_content),
            ('main.js', self.main_content),
            ('test_dead_internet_error_handling.py', self.test_content)
        ]:
            matches = emoji_pattern.findall(content)
            self.assertEqual(matches, [], f"Found emojis in {name}: {matches}")

    def test_stop_playback_on_network_failure_defined(self):
        """stopPlaybackOnNetworkFailure pauses player, sets wasPausedByUser, and updates UI without auto-skipping"""
        self.assertIn("function stopPlaybackOnNetworkFailure(isOffline, isExplicitSelection = false)", self.main_content)
        self.assertIn("audioPlayer.pause();", self.main_content)
        self.assertIn("window.wasPausedByUser = true;", self.main_content)
        self.assertIn("setPlayUI(false);", self.main_content)
        self.assertIn("window.stopPlaybackOnNetworkFailure = stopPlaybackOnNetworkFailure;", self.main_content)

    def test_offline_skips_recovery_attempts(self):
        """When navigator.onLine is false, network recovery attempts are strictly bypassed"""
        self.assertIn("const isOffline = (typeof navigator !== 'undefined' && navigator.onLine === false);", self.main_content)
        self.assertIn("if (!isOffline && recoveryAttempts < 3 && !isRecoveringAudio)", self.main_content)

    def test_consecutive_errors_trigger_stop_playback(self):
        """Consecutive track errors cap at 3 to stop endless playlist skipping when connection is lost"""
        self.assertIn("window.consecutiveTrackErrors = (window.consecutiveTrackErrors || 0) + 1;", self.main_content)
        self.assertIn("if (isOffline || window.consecutiveTrackErrors >= 3)", self.main_content)
        self.assertIn("stopPlaybackOnNetworkFailure(isOffline, wasExplicit);", self.main_content)

    def test_consecutive_errors_reset_on_play_or_user_navigation(self):
        """Successful play, online event, or manual next/prev clicks reset consecutive error counter"""
        self.assertIn("window.consecutiveTrackErrors = 0;", self.main_content)
        self.assertIn("window.addEventListener('online', () => {", self.main_content)

    def test_find_next_playable_offline_index_defined_and_used(self):
        """findNextPlayableOfflineIndex checks cached status and advances queue or stops when offline"""
        self.assertIn("function findNextPlayableOfflineIndex(direction = 1)", self.playback_content)
        self.assertIn("if (candTrack && isTrackAudioCached(candTrack))", self.playback_content)
        self.assertIn("window.findNextPlayableOfflineIndex = findNextPlayableOfflineIndex;", self.playback_content)

    def test_play_next_checks_offline_playable_track(self):
        """playNext stops via stopPlaybackOnNetworkFailure if all remaining tracks are uncached and offline"""
        self.assertIn("const isOffline = (typeof navigator !== 'undefined' && navigator.onLine === false);", self.playback_content)
        self.assertIn("const nextOfflineIdx = findNextPlayableOfflineIndex(1);", self.playback_content)
        self.assertIn("window.stopPlaybackOnNetworkFailure(true);", self.playback_content)

    def test_consecutive_dead_track_skips_capped(self):
        """Consecutive dead tracks are capped at 3 to avoid infinite skip loops"""
        self.assertIn("window.consecutiveDeadTrackSkips = (window.consecutiveDeadTrackSkips || 0) + 1;", self.playback_content)
        self.assertIn("if (window.consecutiveDeadTrackSkips >= 3)", self.playback_content)
        self.assertIn("window.consecutiveDeadTrackSkips = 0;", self.playback_content)

if __name__ == '__main__':
    unittest.main()
