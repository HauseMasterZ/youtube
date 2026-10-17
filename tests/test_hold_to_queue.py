import os
import re
import unittest

class TestHoldToQueue(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        js_dir = os.path.join(base_dir, 'js')
        css_dir = os.path.join(base_dir, 'css')

        with open(os.path.join(js_dir, 'main.js'), 'r', encoding='utf-8') as f:
            cls.main_content = f.read()
        with open(os.path.join(css_dir, 'style.css'), 'r', encoding='utf-8') as f:
            cls.css_content = f.read()
        with open(__file__, 'r', encoding='utf-8') as f:
            cls.test_content = f.read()

    def test_zero_emojis(self):
        """Strictly zero emojis in test file and modified source files"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        self.assertEqual(emoji_pattern.findall(self.main_content), [], "Found emojis in main.js")
        self.assertEqual(emoji_pattern.findall(self.css_content), [], "Found emojis in style.css")
        self.assertEqual(emoji_pattern.findall(self.test_content), [], "Found emojis in test_hold_to_queue.py")

    def test_no_user_select_none_on_tracklist_in_css(self):
        """CSS does not disable text selection on track list container or items"""
        tracklist_match = re.search(r'#track-list\s*\{([^}]*)\}', self.css_content)
        if tracklist_match:
            self.assertNotIn('user-select: none', tracklist_match.group(1))
        tracklist_li_match = re.search(r'#track-list\s+li\s*\{([^}]*)\}', self.css_content)
        if tracklist_li_match:
            self.assertNotIn('user-select: none', tracklist_li_match.group(1))

    def test_selectstart_intercepted_on_hold(self):
        """selectstart listener on trackList prevents selection during active hold or suppressed click"""
        self.assertIn('trackList.addEventListener("selectstart"', self.main_content)
        self.assertRegex(
            self.main_content,
            r'trackList\.addEventListener\(\s*["\']selectstart["\']\s*,\s*\(e\)\s*=>\s*\{[\s\S]*?if\s*\(\s*holdTimer\s*\|\|\s*suppressNextClick\s*\)\s*\{[\s\S]*?e\.preventDefault\(\);'
        )

    def test_hold_timer_clears_selection_and_enqueues(self):
        """holdTimer cleans selection ranges before enqueuing track"""
        self.assertRegex(
            self.main_content,
            r'holdTimer\s*=\s*setTimeout\(\s*\(\)\s*=>\s*\{[\s\S]*?suppressNextClick\s*=\s*true;[\s\S]*?window\.getSelection[\s\S]*?queuePlayNext\(li\.dataset\.playlist'
        )

    def test_pointerup_and_contextmenu_clear_selection(self):
        """pointerup and contextmenu listeners purge any remaining selection ranges"""
        self.assertRegex(
            self.main_content,
            r'trackList\.addEventListener\(\s*["\']pointerup["\']\s*,\s*\(\)\s*=>\s*\{[\s\S]*?if\s*\(\s*suppressNextClick\s*\)\s*\{[\s\S]*?window\.getSelection'
        )
        self.assertRegex(
            self.main_content,
            r'trackList\.addEventListener\(\s*["\']contextmenu["\']\s*,\s*\(e\)\s*=>\s*\{[\s\S]*?window\.getSelection'
        )

    def test_contextmenu_guards_against_double_enqueue(self):
        """contextmenu listener only enqueues if holdTimer has not already enqueued"""
        self.assertRegex(
            self.main_content,
            r'trackList\.addEventListener\(\s*["\']contextmenu["\']\s*,\s*\(e\)\s*=>\s*\{[\s\S]*?if\s*\(\s*!suppressNextClick\s*\)\s*\{[\s\S]*?queuePlayNext\('
        )

    def test_pointerdown_filters_non_primary_mouse_buttons(self):
        """pointerdown ignores non-primary mouse buttons so desktop right-click behaves natively"""
        self.assertIn("if (e.pointerType === 'mouse' && e.button !== 0) return;", self.main_content)

if __name__ == '__main__':
    unittest.main()
