import unittest
import os
import re

class TestLyricsAutoScroll(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root_dir = os.path.dirname(os.path.dirname(__file__))
        with open(os.path.join(cls.root_dir, 'js', 'lyrics.js'), 'r', encoding='utf-8') as f:
            cls.lyrics_content = f.read()
        with open(os.path.join(cls.root_dir, 'index.html'), 'r', encoding='utf-8') as f:
            cls.html_content = f.read()

    def test_autoscroll_state_variables_defined(self):
        """Verify state variables for autoscroll and programmatic scroll tracking are defined"""
        self.assertIn("let isAutoScrollActive = true;", self.lyrics_content)
        self.assertIn("let isProgrammaticScroll = false;", self.lyrics_content)
        self.assertIn("let programmaticScrollTimer = null;", self.lyrics_content)
        self.assertIn("let scrollStopTimer = null;", self.lyrics_content)

    def test_scroll_stop_trigger_function(self):
        """Verify checkAutoScrollTriggerOnStop detects whether active lyric is in visible viewport"""
        self.assertRegex(self.lyrics_content, r'function\s+checkAutoScrollTriggerOnStop\s*\(\s*\)\s*\{')
        self.assertIn("lineBottom >= visibleTop && lineTop <= visibleBottom", self.lyrics_content)
        self.assertIn("isAutoScrollActive = true;", self.lyrics_content)
        self.assertIn("isAutoScrollActive = false;", self.lyrics_content)

    def test_manual_scroll_listener_debounced(self):
        """Verify scroll event listener ignores programmatic scrolling and debounces trigger check by 150ms"""
        self.assertRegex(
            self.lyrics_content,
            r'lyricsContent\.addEventListener\(\s*[\'"]scroll[\'"]\s*,\s*\(\)\s*=>\s*\{[\s\S]*?if\s*\(\s*isProgrammaticScroll\s*\)\s*return;[\s\S]*?checkAutoScrollTriggerOnStop\(\);[\s\S]*?150\s*\);\s*\}\s*,\s*\{\s*passive:\s*true\s*\}\s*\);'
        )

    def test_screen_chunk_scrolling_boundary_check(self):
        """Verify updateLyricsUI only shifts scroll when lineBottom > visibleBottom or lineTop < visibleTop"""
        self.assertIn("lineBottom > visibleBottom || lineTop < visibleTop", self.lyrics_content)
        self.assertRegex(
            self.lyrics_content,
            r'lyricsContent\.scrollTo\(\s*\{[\s\S]*?top:\s*Math\.max\(\s*0\s*,\s*lineTop\s*-\s*20\s*\)[\s\S]*?behavior:\s*[\'"]smooth[\'"][\s\S]*?\}\s*\);'
        )

    def test_autoscroll_reset_on_load_and_close(self):
        """Verify isAutoScrollActive resets to true on lyrics load and UI close"""
        load_match = re.search(r'async\s+function\s+loadLyrics\s*\([\s\S]*?\{([\s\S]*?)\}', self.lyrics_content)
        self.assertIsNotNone(load_match, "Could not find loadLyrics function")
        self.assertIn("isAutoScrollActive = true;", load_match.group(1))

        close_match = re.search(r'function\s+closeLyricsUI\s*\(\s*\)\s*\{([\s\S]*?)\}', self.lyrics_content)
        self.assertIsNotNone(close_match, "Could not find closeLyricsUI function")
        self.assertIn("isAutoScrollActive = true;", close_match.group(1))

    def test_zero_visual_cues_added(self):
        """Verify strictly zero visual cue elements (scroll buttons, badges, toasts) were added to HTML or JS"""
        self.assertNotIn("autoscroll-btn", self.html_content)
        self.assertNotIn("autoscroll-badge", self.html_content)
        self.assertNotIn("autoscroll-toast", self.html_content)
        self.assertNotIn("btn-autoscroll", self.html_content)

    def test_strictly_zero_emojis(self):
        """Verify strictly zero emojis in lyrics.js and this test file"""
        emoji_pattern = re.compile(
            "["
            "\U0001F600-\U0001F64F"
            "\U0001F300-\U0001F5FF"
            "\U0001F680-\U0001F6FF"
            "\U0001F1E0-\U0001F1FF"
            "\U00002702-\U000027B0"
            "\U000024C2-\U0001F251"
            "\U0001F900-\U0001F9FF"
            "\U0001FA70-\U0001FAFF"
            "]+",
            flags=re.UNICODE
        )
        with open(__file__, 'r', encoding='utf-8') as f:
            test_content = f.read()
        self.assertEqual(len(emoji_pattern.findall(self.lyrics_content)), 0, "Found emoji in js/lyrics.js")
        self.assertEqual(len(emoji_pattern.findall(test_content)), 0, "Found emoji in test_lyrics_autoscroll.py")

if __name__ == '__main__':
    unittest.main()
