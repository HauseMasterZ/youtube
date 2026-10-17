import os
import re
import unittest

class TestDesktopAutoscroll(unittest.TestCase):
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
        """Strictly zero emojis in test_desktop_autoscroll.py"""
        with open(__file__, 'r', encoding='utf-8') as f:
            content = f.read()
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        matches = emoji_pattern.findall(content)
        self.assertEqual(matches, [], f"Found emojis in test_desktop_autoscroll.py: {matches}")

    def test_fast_scroller_ignores_non_primary_buttons(self):
        """fastScroller pointerdown ignores middle click and right click (e.button !== 0)"""
        match = re.search(
            r'fastScroller\.addEventListener\(\s*[\'"]pointerdown[\'"]\s*,\s*\(\s*e\s*\)\s*=>\s*\{([\s\S]*?)\n\s*\}\);',
            self.main_content
        )
        self.assertIsNotNone(match, "fastScroller pointerdown listener not found")
        body = match.group(1)
        self.assertIn("if (e.button !== 0) return;", body)

    def test_blur_playlist_select_ignores_non_primary_buttons(self):
        """blurPlaylistSelectIfActive ignores non-primary buttons to prevent focus shift during middle-click"""
        match = re.search(
            r'function\s+blurPlaylistSelectIfActive\s*\(\s*e\s*\)\s*\{([\s\S]*?)\n\s*\}',
            self.main_content
        )
        self.assertIsNotNone(match, "blurPlaylistSelectIfActive function not found")
        body = match.group(1)
        self.assertIn("if (e && e.button !== 0) return;", body)

    def test_playlist_container_has_overflow_x_hidden(self):
        """playlist-container sets overflow-x: hidden to lock autoscroll strictly to vertical navigation"""
        match = re.search(
            r'\.playlist-container\s*\{([^}]+)\}',
            self.css_content
        )
        self.assertIsNotNone(match, ".playlist-container CSS block not found")
        rules = match.group(1)
        self.assertIn("overflow-y: auto;", rules)
        self.assertIn("overflow-x: hidden;", rules)

    def test_fast_scroller_desktop_pointer_events_none(self):
        """fast-scroller sets pointer-events: none under hover: hover and pointer: fine for desktop pass-through"""
        match = re.search(
            r'@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)\s*\{[\s\S]*?\.fast-scroller\s*\{([^}]+)\}',
            self.css_content
        )
        self.assertIsNotNone(match, "Desktop media query with .fast-scroller not found")
        rules = match.group(1)
        self.assertIn("pointer-events: none;", rules)

    def test_rule_19_documented_in_gemini_md(self):
        """Rule 19 Desktop Playlist Middle-Click Autoscroll Invariant is documented in GEMINI.md"""
        self.assertIn("## 19. Desktop Playlist Middle-Click Autoscroll Invariant", self.gemini_content)
        self.assertIn("Native Autoscroll Integrity", self.gemini_content)
        self.assertIn("Non-Primary Button Filtering on Fast Scroller", self.gemini_content)
        self.assertIn("Desktop Pointer Pass-Through for Fast Scroller", self.gemini_content)
        self.assertIn("Focus Shift Quarantine during PointerDown", self.gemini_content)
        self.assertIn("Strict Vertical Axis Lock", self.gemini_content)

if __name__ == '__main__':
    unittest.main()
