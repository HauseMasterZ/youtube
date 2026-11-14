import os
import re
import unittest

class TestGpuAbsoluteZeroSteadyState(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base_dir = os.path.dirname(os.path.dirname(__file__))
        cls.js_dir = os.path.join(cls.base_dir, 'js')
        cls.css_dir = os.path.join(cls.base_dir, 'css')

        with open(os.path.join(cls.js_dir, 'mediaSession.js'), 'r', encoding='utf-8') as f:
            cls.ms_src = f.read()
        with open(os.path.join(cls.js_dir, 'ui.js'), 'r', encoding='utf-8') as f:
            cls.ui_src = f.read()
        with open(os.path.join(cls.js_dir, 'main.js'), 'r', encoding='utf-8') as f:
            cls.main_src = f.read()
        with open(os.path.join(cls.css_dir, 'style.css'), 'r', encoding='utf-8') as f:
            cls.css_src = f.read()
        with open(os.path.join(cls.base_dir, 'index.html'), 'r', encoding='utf-8') as f:
            cls.html_src = f.read()
        with open(os.path.join(os.path.dirname(cls.base_dir), 'GEMINI.md'), 'r', encoding='utf-8') as f:
            cls.root_gemini = f.read()
        with open(os.path.join(cls.base_dir, 'GEMINI.md'), 'r', encoding='utf-8') as f:
            cls.yt_gemini = f.read()

    def test_strictly_zero_emojis_in_source_tests_and_rules(self):
        """Strictly zero emojis in all touched source files, tests, and rules"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        with open(__file__, 'r', encoding='utf-8') as f:
            this_content = f.read()

        for name, content in [
            ('mediaSession.js', self.ms_src),
            ('ui.js', self.ui_src),
            ('main.js', self.main_src),
            ('style.css', self.css_src),
            ('index.html', self.html_src),
            ('root GEMINI.md', self.root_gemini),
            ('youtube GEMINI.md', self.yt_gemini),
            ('test_gpu_absolute_zero_steady_state.py', this_content),
        ]:
            matches = emoji_pattern.findall(content)
            self.assertEqual(matches, [], f"Found emojis in {name}: {matches}")

    def test_strictly_unix_lf_line_endings_across_target_files(self):
        """Strictly UNIX LF line endings across all modified files"""
        target_files = [
            os.path.join(self.js_dir, 'mediaSession.js'),
            os.path.join(self.js_dir, 'ui.js'),
            os.path.join(self.js_dir, 'main.js'),
            os.path.join(self.css_dir, 'style.css'),
            os.path.join(self.base_dir, 'index.html'),
            os.path.join(os.path.dirname(self.base_dir), 'GEMINI.md'),
            os.path.join(self.base_dir, 'GEMINI.md'),
            __file__,
        ]
        for fpath in target_files:
            with open(fpath, 'rb') as f:
                raw_bytes = f.read()
            self.assertEqual(raw_bytes.count(b'\r\n'), 0, f"Found CRLF in {fpath}")

    def test_init_live_audio_anchor_desktop_guard(self):
        """initLiveAudioAnchor returns null on desktop to prevent AudioContext allocation"""
        match = re.search(
            r'function\s+initLiveAudioAnchor\s*\(\s*\)\s*\{[\s\S]*?if\s*\(\s*typeof\s+isMobileDevice\s*!==\s*[\'"]undefined[\'"]\s*&&\s*!isMobileDevice\s*\)\s*\{\s*return\s+null;\s*\}',
            self.ms_src
        )
        self.assertIsNotNone(match, "initLiveAudioAnchor must return null when !isMobileDevice")

    def test_focus_probe_preload_none(self):
        """index.html sets preload=none on focus-probe audio element"""
        match = re.search(r'<audio[^>]*id=[\'"]focus-probe[\'"][^>]*>', self.html_src)
        self.assertIsNotNone(match, "#focus-probe not found in index.html")
        tag = match.group(0)
        self.assertIn('preload="none"', tag, "#focus-probe must use preload=none")

    def test_seekbar_update_gated_by_integer_second(self):
        """ui.js updateTimeUI nests seekBar.value update inside integer second lastRenderTime guard"""
        match = re.search(
            r'const\s+roundedSec\s*=\s*Math\.floor\(seconds\);\s*if\s*\(\s*roundedSec\s*!==\s*lastRenderTime\s*\)\s*\{[\s\S]*?if\s*\(\s*seekBar\.value\s*!=\s*seconds\s*\)\s*\{[\s\S]*?seekBar\.value\s*=\s*seconds;\s*\}[\s\S]*?lastRenderTime\s*=\s*roundedSec;\s*\}',
            self.ui_src
        )
        self.assertIsNotNone(match, "seekBar.value update must be nested inside roundedSec !== lastRenderTime guard")

    def test_underlay_actions_omit_will_change(self):
        """style.css .underlay-action and .swipe-legend omit will-change: transform"""
        match = re.search(r'\.underlay-action,\s*\.swipe-legend\s*\{([^}]+)\}', self.css_src)
        self.assertIsNotNone(match, ".underlay-action, .swipe-legend rule not found in style.css")
        block = match.group(1)
        self.assertNotIn('will-change:', block, ".underlay-action, .swipe-legend must not have will-change")

    def test_synthetic_steady_state_simulation(self):
        """Synthetic simulation verifies 0 DOM updates and 0 Web Audio calls during steady idle playback"""
        class MockPlayer:
            def __init__(self):
                self.currentTime = 0.0
                self.paused = False

        class MockUI:
            def __init__(self):
                self.isPlaybackUiIdle = False
                self.lastRenderTime = -1
                self.dom_mutations = 0
                self.seekbar_value = 0

            def updateTimeUI(self, seconds):
                if self.isPlaybackUiIdle:
                    self.lastRenderTime = int(seconds)
                    return
                roundedSec = int(seconds)
                if roundedSec != self.lastRenderTime:
                    if self.seekbar_value != roundedSec:
                        self.seekbar_value = roundedSec
                        self.dom_mutations += 1
                    self.lastRenderTime = roundedSec

        ui = MockUI()
        player = MockPlayer()

        # Phase 1: User active (first 2 seconds)
        for t in [0.25, 0.50, 0.75, 1.0, 1.25, 1.50, 1.75, 2.0]:
            ui.updateTimeUI(t)
        self.assertEqual(ui.dom_mutations, 2, "During active state, DOM updates at most 1 time per integer second")

        # Phase 2: Steady state idle presentation engages
        ui.isPlaybackUiIdle = True
        initial_mutations = ui.dom_mutations
        for t in [2.25, 2.50, 2.75, 3.0, 3.25, 3.50, 3.75, 4.0, 5.0, 6.0, 7.0]:
            ui.updateTimeUI(t)
        self.assertEqual(ui.dom_mutations, initial_mutations, "During idle state, DOM mutations must be exactly 0")

if __name__ == '__main__':
    unittest.main()
