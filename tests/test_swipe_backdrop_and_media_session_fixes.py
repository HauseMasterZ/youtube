import os
import re
import unittest

class TestSwipeBackdropAndMediaSessionFixes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        with open(os.path.join(base_dir, 'index.html'), 'r', encoding='utf-8') as f:
            cls.html_content = f.read()
        with open(os.path.join(base_dir, 'css', 'style.css'), 'r', encoding='utf-8') as f:
            cls.css_content = f.read()
        with open(os.path.join(base_dir, 'js', 'main.js'), 'r', encoding='utf-8') as f:
            cls.main_content = f.read()
        with open(os.path.join(base_dir, 'js', 'mediaSession.js'), 'r', encoding='utf-8') as f:
            cls.ms_content = f.read()
        with open(__file__, 'r', encoding='utf-8') as f:
            cls.test_content = f.read()

    def test_zero_emojis(self):
        """Strictly zero emojis in test file and all modified source files"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        self.assertEqual(emoji_pattern.findall(self.html_content), [])
        self.assertEqual(emoji_pattern.findall(self.css_content), [])
        self.assertEqual(emoji_pattern.findall(self.main_content), [])
        self.assertEqual(emoji_pattern.findall(self.ms_content), [])
        self.assertEqual(emoji_pattern.findall(self.test_content), [])

    def test_swipe_backdrop_markup(self):
        """index.html contains #swipe-backdrop inside #playlist-container preceding #track-list without text hints"""
        container_match = re.search(
            r'id="playlist-container"[\s\S]*?<div id="swipe-backdrop"[^>]*class="swipe-backdrop"[\s\S]*?<ul id="track-list">',
            self.html_content
        )
        self.assertIsNotNone(container_match)
        self.assertIn('class="swipe-legend swipe-legend-enqueue"', self.html_content)
        self.assertIn('class="swipe-legend swipe-legend-download"', self.html_content)
        self.assertNotIn('<span>Enqueue</span>', self.html_content)
        self.assertNotIn('<span>Download</span>', self.html_content)
        backdrop_match = re.search(r'<div id="swipe-backdrop"[\s\S]*?</div>\s*</div>', self.html_content)
        self.assertIsNotNone(backdrop_match)
        self.assertNotIn('Enqueue', backdrop_match.group(0))
        self.assertNotIn('Download', backdrop_match.group(0))

    def test_swipe_backdrop_and_legend_css(self):
        """css/style.css defines swipe backdrop, legends, and opaque card styles"""
        self.assertRegex(self.css_content, r'#track-list\s+li\s*\{[^}]*background-color:\s*#000000;')
        self.assertIn('.swipe-backdrop', self.css_content)
        self.assertIn('.swipe-legend', self.css_content)
        self.assertIn('.swipe-legend-enqueue', self.css_content)
        self.assertIn('.swipe-legend-download', self.css_content)
        self.assertIn('.swipe-legend.legend-triggered', self.css_content)
        self.assertIn('will-change: transform, opacity;', self.css_content)

    def test_active_song_swipe_guard(self):
        """main.js touchstart ignores touch on active song to prevent swiping active track"""
        self.assertRegex(
            self.main_content,
            r'if\s*\(\s*li\.classList\.contains\("active"\)\s*\|\|\s*\(\s*idx\s*===\s*globalActiveOriginalIndex\s*&&\s*pl\s*===\s*globalActivePlaylist\s*\)\s*\)\s*\{\s*return;\s*\}'
        )

    def test_mobile_swipe_backdrop_positioning_and_feedback(self):
        """main.js positions backdrop at currentY and scales/highlights legends on threshold without linear gradient calculations"""
        self.assertIn("swipeBackdrop.style.transform = `translate3d(0, ${currentY}, 0)`;", self.main_content)
        self.assertIn("legEnq.classList.add('legend-triggered')", self.main_content)
        self.assertIn("legDown.classList.add('legend-triggered')", self.main_content)
        self.assertIn("swipeBackdrop.style.opacity = '0';", self.main_content)
        self.assertNotIn("linear-gradient", self.main_content)
        self.assertIn("if (isHorizontalSwipe && e.type !== 'touchcancel')", self.main_content)

    def test_unlock_wave_animation_rebind_cooldown(self):
        """mediaSession.js allows shouldRepublishMetadata once on unlock-playing with 5000ms cooldown"""
        self.assertRegex(
            self.ms_content,
            r'const\s+isUnlockPlaying\s*=\s*typeof\s+reason\s*===\s*[\'"]string[\'"]\s*&&\s*\(\s*reason\.startsWith\([\'"]unlock-playing[\'"]\)'
        )
        self.assertIn('5000', self.ms_content)
        self.assertRegex(
            self.ms_content,
            r'if\s*\(\s*needsRebind\s*&&\s*typeof\s+republishMediaMetadata\s*===\s*[\'"]function[\'"]\s*\)\s*\{\s*republishMediaMetadata\(\s*true\s*\);'
        )

    def test_republish_metadata_null_bust(self):
        """mediaSession.js sets navigator.mediaSession.metadata = null before reassigning to bust dedup"""
        self.assertRegex(
            self.ms_content,
            r'navigator\.mediaSession\.metadata\s*=\s*null;[\s\S]*?window\.publishTrackMetadata'
        )

    def test_probe_pause_listener_hidden_guard(self):
        """probeEl pause listener ignores power manager suspend events while document is hidden"""
        self.assertRegex(
            self.ms_content,
            r'probeEl\.addEventListener\(\s*["\']pause["\']\s*,\s*\(\)\s*=>\s*\{\s*if\s*\(\s*document\.hidden\s*\)\s*return;'
        )

    def test_in_app_pause_and_hidden_transition_push_mode2_micro_rate(self):
        """btnPlayPause and visibilitychange push forced position update in Mode 2"""
        self.assertRegex(
            self.main_content,
            r'btnPlayPause\.addEventListener\(\s*["\']click["\'][\s\S]*?if\s*\(\s*window\.playbackMode\s*===\s*[\'"]mode2[\'"]\s*&&\s*hasMediaSession\s*\)\s*\{[\s\S]*?updateMediaSessionPosition\(\s*audioPlayer\.currentTime\s*,\s*dur\s*,\s*null\s*,\s*true\s*\);'
        )
        self.assertRegex(
            self.main_content,
            r'// Going hidden while paused in Mode 2[\s\S]*?updateMediaSessionPosition\(\s*audioPlayer\.currentTime\s*,\s*dur\s*,\s*null\s*,\s*true\s*\);'
        )

    def test_republish_metadata_preserves_zero_metadata_churn_without_arg(self):
        """republishMediaMetadata only busts dedup when arguments[0] is true"""
        self.assertRegex(
            self.ms_content,
            r'const\s+forceBreakDedup\s*=\s*\(arguments\s*&&\s*arguments\[0\]\s*===\s*true\)'
        )

    def test_enqueued_flash_color_not_stripped_on_touchend(self):
        """handleTouchEnd retains --enqueued-color on targetLi if it is flashing"""
        self.assertRegex(
            self.main_content,
            r'if\s*\(\s*!targetLi\.classList\.contains\([\'"]enqueued-flash[\'"]\)\s*\)\s*\{\s*targetLi\.style\.removeProperty\([\'"]--enqueued-color[\'"]\);'
        )

    def test_swipe_card_remains_opaque(self):
        """css/style.css ensures slide-enqueue and slide-download remain opaque over black"""
        self.assertRegex(
            self.css_content,
            r'#track-list\s+li\.slide-enqueue\s*\{[^}]*background-color:\s*color-mix\(in srgb,\s*var\(--enqueued-color,\s*#8c73ff\)\s*15%,\s*#000000\)\s*!important;'
        )
        self.assertRegex(
            self.css_content,
            r'#track-list\s+li\.slide-download\s*\{[^}]*background-color:\s*color-mix\(in srgb,\s*#00ff88\s*15%,\s*#000000\)\s*!important;'
        )

    def test_playlist_scroll_arrow_markup_and_css(self):
        """index.html and style.css define simple playlist scroll arrow button adjacent to fast-scroller with zero extra styling"""
        self.assertIn('id="playlist-scroll-arrow"', self.html_content)
        self.assertIn('id="playlist-arrow-up"', self.html_content)
        self.assertIn('id="playlist-arrow-down"', self.html_content)
        self.assertIn('.playlist-scroll-arrow', self.css_content)
        self.assertRegex(self.css_content, r'\.playlist-scroll-arrow\s*\{[^}]*right:\s*28px;')
        self.assertRegex(self.css_content, r'\.playlist-scroll-arrow\s*\{[^}]*z-index:\s*91;')
        self.assertRegex(self.css_content, r'\.playlist-scroll-arrow\s*\{[^}]*background:\s*transparent;')
        self.assertRegex(self.css_content, r'\.playlist-scroll-arrow\s*\{[^}]*border:\s*none;')
        self.assertRegex(self.css_content, r'\.playlist-scroll-arrow\s*\{[^}]*outline:\s*none;')
        self.assertRegex(self.css_content, r'\.playlist-scroll-arrow\s*\{[^}]*box-shadow:\s*none;')
        self.assertIn('calc(84px + env(safe-area-inset-bottom, 0px))', self.css_content)

    def test_playlist_scroll_arrow_behavior_in_main(self):
        """main.js binds scroll listener and click handler toggling top and bottom scroll"""
        self.assertIn('playlistScrollArrow.addEventListener("click"', self.main_content)
        self.assertIn('playlistContainer.scrollTop > 2', self.main_content)
        self.assertRegex(self.main_content, r'playlistContainer\.scrollTo\(\{\s*top:\s*0,\s*behavior:\s*["\']smooth["\']\s*\}\)')
        self.assertRegex(self.main_content, r'playlistContainer\.scrollTo\(\{\s*top:\s*playlistContainer\.scrollHeight,\s*behavior:\s*["\']smooth["\']\s*\}\)')

    def test_brace_balance(self):
        """main.js and mediaSession.js have balanced curly braces with zero syntax errors"""
        self.assertEqual(self.main_content.count('{'), self.main_content.count('}'))
        self.assertEqual(self.ms_content.count('{'), self.ms_content.count('}'))

if __name__ == '__main__':
    unittest.main()

