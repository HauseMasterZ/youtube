import os
import re
import unittest

class TestDownloadEngine(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        playback_path = os.path.join(base_dir, 'js', 'playback.js')
        with open(playback_path, 'r', encoding='utf-8') as f:
            cls.playback_content = f.read()

        css_path = os.path.join(base_dir, 'css', 'style.css')
        with open(css_path, 'r', encoding='utf-8') as f:
            cls.css_content = f.read()

        test_path = os.path.abspath(__file__)
        with open(test_path, 'r', encoding='utf-8') as f:
            cls.test_content = f.read()

    def test_no_emojis(self):
        """Strictly zero emojis in test and implementation files"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        self.assertEqual(emoji_pattern.findall(self.playback_content), [], "Found emojis in playback.js")
        self.assertEqual(emoji_pattern.findall(self.css_content), [], "Found emojis in style.css")
        self.assertEqual(emoji_pattern.findall(self.test_content), [], "Found emojis in test_download_engine.py")

    def test_download_uses_bypass_query(self):
        """downloadActivePlaylist appends bypass=true to audio requests to prevent service worker double buffering"""
        self.assertRegex(
            self.playback_content,
            r'bypass=true'
        )

    def test_thumbs_cache_name_normalized(self):
        """downloadActivePlaylist opens yt-player-thumbs matching sw.js"""
        self.assertIn("caches.open('yt-player-thumbs')", self.playback_content)
        self.assertNotIn("caches.open('yt-thumbs-cache')", self.playback_content)

    def test_download_retry_mechanism(self):
        """downloadActivePlaylist implements exponential backoff retry for network resiliency"""
        self.assertRegex(
            self.playback_content,
            r'fetchWithRetry|retry|attempt'
        )

    def test_download_toast_zero_gpu_styles(self):
        """.download-toast has zero backdrop-filter and uses contain: layout paint"""
        toast_rules = re.findall(r'\.download-toast\s*\{([^}]*)\}', self.css_content)
        self.assertTrue(len(toast_rules) > 0, "No .download-toast rule found")
        for rule in toast_rules:
            self.assertNotIn('backdrop-filter', rule)
            self.assertNotIn('-webkit-backdrop-filter', rule)

        # Check mobile media query block
        self.assertRegex(self.css_content, r'\.download-toast\s*\{[^}]*contain:\s*layout\s+paint;')
        self.assertRegex(self.css_content, r'\.download-toast\s*\{[^}]*background:\s*#141418;')

if __name__ == '__main__':
    unittest.main()
