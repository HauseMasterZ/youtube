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

        state_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'js', 'state.js')
        with open(state_path, 'r', encoding='utf-8') as f:
            cls.state_js = f.read()

        playback_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'js', 'playback.js')
        with open(playback_path, 'r', encoding='utf-8') as f:
            cls.playback_js = f.read()

        ui_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'js', 'ui.js')
        with open(ui_path, 'r', encoding='utf-8') as f:
            cls.ui_js = f.read()

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

    def test_ephemeral_active_css_mutual_exclusion(self):
        """Verify CSS mutual exclusion ensures track-list is hidden and ephemeral-container is shown"""
        self.assertRegex(
            self.css_content,
            r'body\.ephemeral-active\s+#track-list\s*\{[\s\S]*?display:\s*none\s*!important;'
        )
        self.assertRegex(
            self.css_content,
            r'body\.ephemeral-active\s+#ephemeral-search-container\s*\{[\s\S]*?display:\s*block\s*!important;'
        )

    def test_state_js_authoritative_search_mode(self):
        """Verify js/state.js exposes authoritative searchMode and helper functions"""
        self.assertIn("window.searchMode = 'local';", self.state_js)
        self.assertIn("window.isEphemeralSearchActive = function()", self.state_js)
        self.assertIn("window.setSearchMode = function(mode)", self.state_js)

    def test_main_js_perform_remote_search_clears_timer_and_sets_mode(self):
        """Verify performRemoteSearch clears searchDebounceTimer and activates ephemeral mode"""
        self.assertRegex(
            self.main_js,
            r'clearTimeout\(searchDebounceTimer\);[\s\S]*?searchDebounceTimer\s*=\s*null;'
        )
        self.assertRegex(
            self.main_js,
            r'window\.setSearchMode\([\'"]ephemeral[\'"]\);'
        )

    def test_main_js_debounce_and_scroll_ephemeral_guards(self):
        """Verify debounce timer, scheduleVirtualRender, and scrollSettleTimer guard against ephemeral mode"""
        self.assertRegex(
            self.main_js,
            r'searchDebounceTimer\s*=\s*null;[\s\S]*?isEphemeralSearchActive\(\)[\s\S]*?return;'
        )
        self.assertRegex(
            self.main_js,
            r'function\s+scheduleVirtualRender\s*\(\s*\)\s*\{[\s\S]*?isEphemeralSearchActive\(\)[\s\S]*?return;'
        )
        self.assertRegex(
            self.main_js,
            r'scrollSettleTimer\s*=\s*setTimeout\(\(\)\s*=>\s*\{[\s\S]*?isEphemeralSearchActive\(\)[\s\S]*?return;'
        )

    def test_playback_js_swr_view_gating(self):
        """Verify applyPlaylistData and applyNormalizedDataInChunks gate DOM rendering during ephemeral search"""
        self.assertRegex(
            self.playback_js,
            r'isEphemeralSearchActive\(\)\s*\)\s*\{[\s\S]*?return;[\s\S]*?trackList\.style\.height'
        )
        self.assertRegex(
            self.playback_js,
            r'isEphemeralSearchActive\(\)\s*\)\s*\{[\s\S]*?//\s*Data\s+update\s+complete[\s\S]*?else\s*\{[\s\S]*?renderVirtualTracks\(\);'
        )
        self.assertRegex(
            self.playback_js,
            r'function\s+loadPlaylist\(folderName\)\s*\{[\s\S]*?exitEphemeralSearch\(true\);'
        )

    def test_ui_js_render_virtual_tracks_ephemeral_guard(self):
        """Verify renderVirtualTracks in ui.js early-returns when ephemeral search is active"""
        self.assertRegex(
            self.ui_js,
            r'function\s+renderVirtualTracks\s*\(\s*\)\s*\{[\s\S]*?isEphemeralSearchActive\(\)\s*\)\s*\{[\s\S]*?isRendering\s*=\s*false;[\s\S]*?return;'
        )

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
        self.assertEqual(emoji_pattern.findall(self.state_js), [])
        self.assertEqual(emoji_pattern.findall(self.playback_js), [])
        self.assertEqual(emoji_pattern.findall(self.ui_js), [])

if __name__ == '__main__':
    unittest.main()
