import os
import re
import unittest

class TestGpuUtilizationOptimizations(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        css_dir = os.path.join(base_dir, 'css')
        js_dir = os.path.join(base_dir, 'js')

        with open(os.path.join(base_dir, 'index.html'), 'r', encoding='utf-8') as f:
            cls.html_content = f.read()
        with open(os.path.join(css_dir, 'style.css'), 'r', encoding='utf-8') as f:
            cls.css_content = f.read()
        with open(os.path.join(js_dir, 'main.js'), 'r', encoding='utf-8') as f:
            cls.main_content = f.read()
        with open(__file__, 'r', encoding='utf-8') as f:
            cls.test_content = f.read()

    def test_zero_emojis_in_source_and_tests(self):
        """Strictly zero emojis in index.html, style.css, main.js, and this test suite"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        for name, content in [
            ('index.html', self.html_content),
            ('style.css', self.css_content),
            ('main.js', self.main_content),
            ('test_gpu_utilization_optimizations.py', self.test_content)
        ]:
            matches = emoji_pattern.findall(content)
            self.assertEqual(matches, [], f"Found emojis in {name}: {matches}")

    def test_track_list_li_idle_no_will_change(self):
        """#track-list li avoids persistent will-change: transform to prevent 30+ compositor layers during idle playback"""
        match = re.search(r'#track-list\s+li\s*\{([^}]+)\}', self.css_content)
        self.assertIsNotNone(match, "#track-list li block not found in style.css")
        block = match.group(1)
        self.assertNotIn('will-change:', block, "Idle #track-list li must not have will-change")
        self.assertIn('contain: layout paint;', block, "Idle #track-list li must have contain: layout paint")

    def test_track_list_li_swiping_has_will_change(self):
        """#track-list li only acquires will-change: transform during active swipe/snap gestures"""
        match = re.search(r'#track-list\s+li\.is-swiping[^\{]*\{([^}]+)\}', self.css_content)
        self.assertIsNotNone(match, "Swiping track item rule not found in style.css")
        block = match.group(1)
        self.assertIn('will-change: transform;', block, "Active swiping track item must have will-change: transform")

    def test_fast_scroll_bubble_culled_when_inactive(self):
        """#fast-scroll-bubble and .fast-scroll-bubble use display: none when inactive to eliminate backdrop-filter shader overhead"""
        self.assertIn('id="fast-scroll-bubble" class="fast-scroll-bubble" aria-hidden="true" style="display: none;"', self.html_content)
        bubble_match = re.search(r'\.fast-scroll-bubble\s*\{([^}]+)\}', self.css_content)
        self.assertIsNotNone(bubble_match, ".fast-scroll-bubble block not found in style.css")
        self.assertIn('display: none;', bubble_match.group(1))

        active_match = re.search(r'\.fast-scroll-bubble\.active\s*\{([^}]+)\}', self.css_content)
        self.assertIsNotNone(active_match, ".fast-scroll-bubble.active block not found in style.css")
        self.assertIn('display: flex;', active_match.group(1))

    def test_fast_scroll_bubble_lifecycle_in_main_js(self):
        """main.js explicitly activates display: flex and deactivates to display: none on fast scroll pointer events"""
        self.assertIn('fastBubble.style.display = "flex";', self.main_content)
        self.assertIn('fastBubble.style.display = "none";', self.main_content)

    def test_swipe_backdrop_culled_when_inactive(self):
        """#swipe-backdrop and .swipe-backdrop use display: none when idle to prevent layer allocation in compositor"""
        self.assertIn('id="swipe-backdrop" class="swipe-backdrop swipe-underlay" aria-hidden="true" style="display: none;"', self.html_content)
        backdrop_match = re.search(r'\.swipe-underlay,\s*\.swipe-backdrop\s*\{([^}]+)\}', self.css_content)
        self.assertIsNotNone(backdrop_match, ".swipe-backdrop block not found in style.css")
        self.assertIn('display: none;', backdrop_match.group(1))

    def test_swipe_backdrop_lifecycle_in_main_js(self):
        """main.js toggles swipeBackdrop.style.display between block and none on swipe interaction and settle"""
        self.assertIn("swipeBackdrop.style.display = 'block';", self.main_content)
        self.assertIn("swipeBackdrop.style.display = 'none';", self.main_content)

    def test_seek_bar_and_time_containment(self):
        """style.css isolates seek-wrap and time-display with contain: layout paint to prevent repaint propagation"""
        seek_match = re.search(r'\.seek-wrap\s*\{([^}]+)\}', self.css_content)
        self.assertIsNotNone(seek_match, ".seek-wrap block not found in style.css")
        self.assertIn('contain: layout paint;', seek_match.group(1))

        time_match = re.search(r'\.time-display\s*\{([^}]+)\}', self.css_content)
        self.assertIsNotNone(time_match, ".time-display block not found in style.css")
        self.assertIn('contain: layout paint;', time_match.group(1))

    def test_mode_toast_culled_in_css(self):
        """style.css defines display: none on #mode-toast and .mode-toast when inactive"""
        toast_match = re.search(r'#mode-toast,\s*\.mode-toast\s*\{([^}]+)\}', self.css_content)
        self.assertIsNotNone(toast_match, "#mode-toast block not found in style.css")
        self.assertIn('display: none;', toast_match.group(1))

if __name__ == '__main__':
    unittest.main()
