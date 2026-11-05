import os
import re
import unittest

class TestDefaultFocusAndSpacebar(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        with open(os.path.join(base_dir, 'js', 'main.js'), 'r', encoding='utf-8') as f:
            cls.main_content = f.read()
        with open(os.path.join(base_dir, 'GEMINI.md'), 'r', encoding='utf-8') as f:
            cls.gemini_content = f.read()

    def test_no_emojis_in_test_file(self):
        """Strictly zero emojis in test_default_focus_and_spacebar.py"""
        with open(__file__, 'r', encoding='utf-8') as f:
            content = f.read()
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        matches = emoji_pattern.findall(content)
        self.assertEqual(matches, [], f"Found emojis in test_default_focus_and_spacebar.py: {matches}")

    def test_pointer_click_blurs_buttons_outside_modals(self):
        """document click listener blurs pointer-activated button elements outside modals to keep focus on main site"""
        self.assertRegex(
            self.main_content,
            r'document\.addEventListener\(\s*["\']click["\']\s*,\s*\(e\)\s*=>\s*\{[\s\S]*?if\s*\(\s*!e\.detail\s*\)\s*return;[\s\S]*?el\.closest\(\s*[\'"]button,\s*\[role=["\']button["\']\][\'"]\s*\)[\s\S]*?btn\.blur\(\);',
        )

    def test_spacebar_does_not_bail_out_on_button(self):
        """Spacebar keydown handler does not return early when e.target is a button"""
        self.assertNotIn("if (e.target && e.target.tagName === 'BUTTON') return;", self.main_content)

    def test_spacebar_prevents_default_blurs_and_clicks_playpause(self):
        """Spacebar keydown handler blurs active element, calls preventDefault, and triggers btnPlayPause"""
        self.assertRegex(
            self.main_content,
            r'\}[\s\S]*?else\s+if\s*\(\s*e\.key\s*===\s*[\'"] [\'"]\s*\|\|\s*e\.code\s*===\s*[\'"]Space[\'"]\s*\)\s*\{[\s\S]*?document\.activeElement\.blur\(\);[\s\S]*?e\.preventDefault\(\);[\s\S]*?btnPlayPause\.click\(\);'
        )

    def test_text_inputs_preserve_native_space_handling(self):
        """Text inputs, textareas, selects, and contenteditable elements return early before Spacebar shortcut"""
        self.assertRegex(
            self.main_content,
            r'if\s*\(\s*e\.target\.tagName\s*===\s*[\'"]TEXTAREA[\'"]\s*\|\|\s*\(\s*e\.target\.tagName\s*===\s*[\'"]INPUT[\'"]\s*&&\s*e\.target\.type\s*!==\s*[\'"]range[\'"]\s*\)\s*\|\|\s*e\.target\.tagName\s*===\s*[\'"]SELECT[\'"]\s*\|\|\s*e\.target\.isContentEditable\s*\)\s*return;'
        )

    def test_close_settings_modal_blurs_active_element(self):
        """closeSettingsModal blurs active element to restore focus to main site"""
        self.assertRegex(
            self.main_content,
            r'function\s+closeSettingsModal\(\)\s*\{[\s\S]*?document\.activeElement\.blur\(\);'
        )

    def test_gemini_rule_40_documented(self):
        """Rule 40 Main PWA Default Focus and Spacebar Play/Pause Invariant is documented in GEMINI.md"""
        self.assertIn("## 40. Main PWA Default Focus & Spacebar Play/Pause Invariant", self.gemini_content)
        self.assertIn("Default focus strictly persists", self.gemini_content)
        self.assertIn("btnPlayPause.click()", self.gemini_content)

if __name__ == '__main__':
    unittest.main()
