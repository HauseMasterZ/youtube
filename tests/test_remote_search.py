import os
import re
import unittest

class TestRemoteSearchMarkupAndUI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        html_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'index.html')
        with open(html_path, 'r', encoding='utf-8') as f:
            cls.html_content = f.read()

        css_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'css', 'style.css')
        with open(css_path, 'r', encoding='utf-8') as f:
            cls.css_content = f.read()

        js_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'js', 'main.js')
        with open(js_path, 'r', encoding='utf-8') as f:
            cls.main_js = f.read()

    def test_search_button_exists(self):
        """Verify #btn-remote-search button exists with accessible label"""
        self.assertIn('id="btn-remote-search"', self.html_content)
        self.assertIn('aria-label="Search online"', self.html_content)

    def test_ephemeral_container_exists(self):
        """Verify #ephemeral-search-container exists inside playlist container"""
        self.assertIn('id="ephemeral-search-container"', self.html_content)

    def test_search_button_css_present(self):
        """Verify CSS rules for search action button and ephemeral container"""
        self.assertIn('.search-action-btn', self.css_content)
        self.assertIn('.ephemeral-search-container', self.css_content)
        self.assertIn('.ephemeral-header', self.css_content)
        self.assertIn('.ephemeral-track-item', self.css_content)

    def test_js_perform_remote_search_present(self):
        """Verify remote search and exit functions exist in main.js"""
        self.assertIn('function performRemoteSearch', self.main_js)
        self.assertIn('function exitEphemeralSearch', self.main_js)
        self.assertIn('/api/search?q=', self.main_js)
        self.assertNotIn('Copy URL', self.main_js)
        self.assertNotIn('Add to Playlist', self.main_js)
        self.assertIn('Open on YouTube', self.main_js)

    def test_no_emojis_in_search_code(self):
        """Strictly zero emojis in new search features"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        self.assertEqual(emoji_pattern.findall(self.html_content), [])
        self.assertEqual(emoji_pattern.findall(self.css_content), [])
        self.assertEqual(emoji_pattern.findall(self.main_js), [])

if __name__ == '__main__':
    unittest.main()
