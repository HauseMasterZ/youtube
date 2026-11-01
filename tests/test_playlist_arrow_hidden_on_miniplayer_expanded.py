import os
import re
import unittest

class TestPlaylistArrowHiddenOnMiniplayerExpanded(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        with open(os.path.join(base_dir, 'js', 'main.js'), 'r', encoding='utf-8') as f:
            cls.main_content = f.read()
        with open(os.path.join(base_dir, 'css', 'style.css'), 'r', encoding='utf-8') as f:
            cls.css_content = f.read()
        with open(os.path.join(base_dir, 'GEMINI.md'), 'r', encoding='utf-8') as f:
            cls.gemini_content = f.read()

    def test_no_emojis_in_test_file(self):
        """Strictly zero emojis in test file"""
        with open(__file__, 'r', encoding='utf-8') as f:
            content = f.read()
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        matches = emoji_pattern.findall(content)
        self.assertEqual(matches, [], f"Found emojis in test_playlist_arrow_hidden_on_miniplayer_expanded.py: {matches}")

    def test_css_hides_playlist_scroll_arrow_when_expanded(self):
        """style.css includes rules hiding playlist-scroll-arrow when now-playing is expanded"""
        self.assertRegex(
            self.css_content,
            r'\.main-layout:has\(\.now-playing\.expanded\)[^{]*\.playlist-scroll-arrow[^}]*display:\s*none\s*!important;'
        )
        self.assertRegex(
            self.css_content,
            r'body:has\(\.now-playing\.expanded\)[^{]*\.playlist-scroll-arrow[^}]*display:\s*none\s*!important;'
        )
        self.assertRegex(
            self.css_content,
            r'\.player-container:has\(\.now-playing\.expanded\)\s*\+\s*\.playlist-panel[^{]*\.playlist-scroll-arrow[^}]*display:\s*none\s*!important;'
        )

    def test_js_update_playlist_scroll_arrow_evaluates_expanded_state(self):
        """updatePlaylistScrollArrow checks expanded class on nowPlaying and hides/restores arrow button"""
        start = self.main_content.find("function updatePlaylistScrollArrow()")
        self.assertNotEqual(start, -1, "updatePlaylistScrollArrow function not found in main.js")
        end = self.main_content.find("if (playlistScrollArrow && playlistContainer)", start)
        fn_body = self.main_content[start:end]

        self.assertIn('classList.contains("expanded")', fn_body)
        self.assertIn('arrowBtn.style.display = "none";', fn_body)
        self.assertIn('arrowBtn.style.display = "";', fn_body)
        self.assertIn('playlistContainer.scrollTop > 2', fn_body)
        self.assertIn('arrowBtn.setAttribute("aria-label"', fn_body)

    def test_js_expand_and_collapse_handlers_trigger_update_scroll_arrow(self):
        """Click, touch, popstate, and collapse handlers invoke updatePlaylistScrollArrow"""
        # popstate miniplayer collapse
        popstate_match = re.search(
            r'window\.addEventListener\(\s*["\']popstate["\']\s*,\s*\(\s*e\s*\)\s*=>\s*\{([\s\S]*?)\n\s*\}\);',
            self.main_content
        )
        self.assertIsNotNone(popstate_match, "popstate listener not found")
        self.assertIn('nowPlaying.classList.remove("expanded");', popstate_match.group(1))
        self.assertIn('updatePlaylistScrollArrow();', popstate_match.group(1))

        # nowPlaying click expand
        click_match = re.search(
            r'nowPlaying\.addEventListener\(\s*["\']click["\']\s*,\s*\(\s*e\s*\)\s*=>\s*\{([\s\S]*?)\n\s*\}\);',
            self.main_content
        )
        self.assertIsNotNone(click_match, "nowPlaying click listener not found")
        self.assertIn('nowPlaying.classList.add("expanded");', click_match.group(1))
        self.assertIn('updatePlaylistScrollArrow();', click_match.group(1))

        # btnCollapse click handler
        collapse_match = re.search(
            r'btnCollapse\.addEventListener\(\s*["\']click["\']\s*,\s*\(\s*e\s*\)\s*=>\s*\{([\s\S]*?)\n\s*\}\);',
            self.main_content
        )
        self.assertIsNotNone(collapse_match, "btnCollapse click listener not found")
        self.assertIn('history.back();', collapse_match.group(1))
        self.assertIn('updatePlaylistScrollArrow();', collapse_match.group(1))

    def test_js_mutation_observer_watches_now_playing_class(self):
        """MutationObserver monitors nowPlaying class attribute to keep playlistScrollArrow synchronized"""
        self.assertIn('MutationObserver', self.main_content)
        self.assertIn('playerObserver.observe(nowPlaying, { attributes: true, attributeFilter: ["class"] });', self.main_content)

    def test_gemini_md_documents_expanded_arrow_hiding(self):
        """Section 34 of GEMINI.md documents playlist arrow hiding when miniplayer is expanded"""
        self.assertIn('## 34. Playlist Scroll Edge Navigation', self.gemini_content)
        self.assertIn('Automatically hidden when the miniplayer is expanded into full player view', self.gemini_content)
        self.assertIn('.now-playing.expanded', self.gemini_content)

if __name__ == '__main__':
    unittest.main()
