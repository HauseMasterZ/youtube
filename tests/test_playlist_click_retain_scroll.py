import os
import re
import unittest

class TestPlaylistClickRetainScroll(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        with open(os.path.join(base_dir, 'js', 'main.js'), 'r', encoding='utf-8') as f:
            cls.main_content = f.read()
        with open(os.path.join(base_dir, 'js', 'playback.js'), 'r', encoding='utf-8') as f:
            cls.playback_content = f.read()
        with open(os.path.join(base_dir, 'js', 'ui.js'), 'r', encoding='utf-8') as f:
            cls.ui_content = f.read()
        with open(os.path.join(base_dir, 'GEMINI.md'), 'r', encoding='utf-8') as f:
            cls.gemini_content = f.read()

    def test_no_emojis_in_test_file(self):
        """Strictly zero emojis in test_playlist_click_retain_scroll.py"""
        with open(__file__, 'r', encoding='utf-8') as f:
            content = f.read()
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        matches = emoji_pattern.findall(content)
        self.assertEqual(matches, [], f"Found emojis in test_playlist_click_retain_scroll.py: {matches}")

    def test_tracklist_click_passes_should_scroll_false(self):
        """trackList click event passes false to playTrackSelection to prevent auto-centering"""
        self.assertRegex(
            self.main_content,
            r'trackList\.addEventListener\(\s*["\']click["\']\s*,\s*\(e\)\s*=>\s*\{[\s\S]*?playTrackSelection\(\s*li\.dataset\.playlist\s*,\s*parseInt\(\s*li\.dataset\.index\s*\)\s*,\s*false\s*\);'
        )

    def test_search_enter_passes_should_scroll_true(self):
        """Search input Enter key passes true to playTrackSelection for search navigation"""
        self.assertRegex(
            self.main_content,
            r'playTrackSelection\(\s*item\.playlist\s*,\s*item\.index\s*,\s*true\s*\);'
        )

    def test_play_track_selection_signature_and_scroll_propagation(self):
        """playTrackSelection accepts shouldScroll = false and forwards to executePlayback"""
        self.assertRegex(
            self.playback_content,
            r'async\s+function\s+playTrackSelection\(\s*targetPlaylist\s*,\s*targetOriginalIndex\s*,\s*shouldScroll\s*=\s*false\s*\)'
        )
        self.assertRegex(
            self.playback_content,
            r'executePlayback\(\s*false\s*,\s*false\s*,\s*shouldScroll\s*,\s*null\s*,\s*shouldScroll\s*\);'
        )

    def test_execute_playback_accepts_allow_scroll_and_forwards_to_scroll_to_track(self):
        """executePlayback accepts allowScroll = true and gates scrollToTrack"""
        self.assertRegex(
            self.playback_content,
            r'function\s+executePlayback\([\s\S]*?allowScroll\s*=\s*true\s*\)'
        )
        self.assertRegex(
            self.playback_content,
            r'scrollToTrack\(\s*originalIndex\s*,\s*forceScroll\s*,\s*allowScroll\s*\);'
        )

    def test_scroll_to_track_early_return_when_allow_scroll_false(self):
        """scrollToTrack accepts allowScroll = true and returns early without scrolling when allowScroll is false"""
        self.assertRegex(
            self.ui_content,
            r'function\s+scrollToTrack\(\s*originalIndex\s*,\s*forceScroll\s*=\s*false\s*,\s*allowScroll\s*=\s*true\s*\)\s*\{\s*if\s*\(\s*!allowScroll\s*\)\s*\{\s*lastStartIndex\s*=\s*-1;\s*renderVirtualTracks\(\);\s*return;\s*\}'
        )

    def test_gemini_rule_39_documented(self):
        """Rule 39 Playlist Track Item Click Scroll Retention Invariant is documented in GEMINI.md"""
        self.assertIn("## 39. Playlist Track Item Click Scroll Retention Invariant", self.gemini_content)
        self.assertIn("retains the current `playlistContainer.scrollTop` position", self.gemini_content)
        self.assertIn("without auto-centering", self.gemini_content)

if __name__ == '__main__':
    unittest.main()
