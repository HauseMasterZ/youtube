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

    def test_progress_container_opaque_background_and_fixed_time_display(self):
        """style.css enforces opaque background-color: #000000 on progress-container, seek-wrap, and time-display with fixed width"""
        progress_match = re.search(r'\.progress-container\s*\{([^}]+)\}', self.css_content)
        self.assertIsNotNone(progress_match, ".progress-container block not found in style.css")
        self.assertIn('background-color: #000000;', progress_match.group(1))

        seek_match = re.search(r'\.seek-wrap\s*\{([^}]+)\}', self.css_content)
        self.assertIsNotNone(seek_match, ".seek-wrap block not found in style.css")
        self.assertIn('background-color: #000000;', seek_match.group(1))

        time_match = re.search(r'\.time-display\s*\{([^}]+)\}', self.css_content)
        self.assertIsNotNone(time_match, ".time-display block not found in style.css")
        self.assertIn('background-color: #000000;', time_match.group(1))
        self.assertIn('width: 44px;', time_match.group(1))
        self.assertIn('flex-shrink: 0;', time_match.group(1))
        self.assertIn('text-align: center;', time_match.group(1))

    def test_playback_controls_and_title_wrapper_containment_and_opaque_background(self):
        """style.css enforces contain: layout paint and opaque background-color: #000000 on playback-controls and title-channel-wrapper"""
        controls_match = re.search(r'\.playback-controls\s*\{([^}]+)\}', self.css_content)
        self.assertIsNotNone(controls_match, ".playback-controls block not found in style.css")
        self.assertIn('contain: layout paint;', controls_match.group(1))
        self.assertIn('background-color: #000000;', controls_match.group(1))

        title_match = re.search(r'\.title-channel-wrapper\s*\{([^}]+)\}', self.css_content)
        self.assertIsNotNone(title_match, ".title-channel-wrapper block not found in style.css")
        self.assertIn('contain: layout paint;', title_match.group(1))
        self.assertIn('background-color: #000000;', title_match.group(1))

    def test_time_display_font_smoothing_and_letter_spacing(self):
        """style.css enforces grayscale font smoothing and letter-spacing: -0.2px on time-display"""
        time_match = re.search(r'\.time-display\s*\{([^}]+)\}', self.css_content)
        self.assertIsNotNone(time_match, ".time-display block not found in style.css")
        self.assertIn('-webkit-font-smoothing: antialiased;', time_match.group(1))
        self.assertIn('-moz-osx-font-smoothing: grayscale;', time_match.group(1))
        self.assertIn('letter-spacing: -0.2px;', time_match.group(1))

    def test_seek_bar_integer_step_in_html(self):
        """index.html enforces integer step='1' on seek-bar input"""
        match = re.search(r'<input[^>]*id=[\'"]seek-bar[\'"][^>]*>', self.html_content)
        self.assertIsNotNone(match, "#seek-bar not found in index.html")
        tag = match.group(0)
        self.assertIn('step="1"', tag, "#seek-bar must use step='1'")

    def test_seek_bar_strict_containment(self):
        """style.css enforces contain: strict on input[type='range']#seek-bar to eliminate shadow DOM size recalculation"""
        match = re.search(r'input\[type="range"\]#seek-bar\s*\{([^}]+)\}', self.css_content)
        self.assertIsNotNone(match, "input[type='range']#seek-bar block not found in style.css")
        self.assertIn('contain: strict;', match.group(1))

    def test_time_display_speed_optimized_font_shaping(self):
        """style.css enforces text-rendering: optimizeSpeed and font-kerning: none on .time-display"""
        match = re.search(r'\.time-display\s*\{([^}]+)\}', self.css_content)
        self.assertIsNotNone(match, ".time-display block not found in style.css")
        self.assertIn('text-rendering: optimizeSpeed;', match.group(1))
        self.assertIn('font-kerning: none;', match.group(1))

    def test_album_art_and_lyrics_toggle_containment_and_opaque_background(self):
        """style.css enforces contain: layout paint and opaque background-color: #000000 on album-art-container and lyrics-toggle-hint"""
        art_match = re.search(r'#album-art-container\s*\{([^}]+)\}', self.css_content)
        self.assertIsNotNone(art_match, "#album-art-container block not found in style.css")
        self.assertIn('contain: layout paint;', art_match.group(1))
        self.assertIn('background-color: #000000;', art_match.group(1))

        lyrics_match = re.search(r'#lyrics-toggle-hint\s*\{([^}]+)\}', self.css_content)
        self.assertIsNotNone(lyrics_match, "#lyrics-toggle-hint block not found in style.css")
        self.assertIn('contain: layout paint;', lyrics_match.group(1))
        self.assertIn('background-color: #000000;', lyrics_match.group(1))

    def test_now_playing_opaque_background(self):
        """style.css enforces background-color: #000000 on #now-playing while preserving contain: layout"""
        match = re.search(r'#now-playing,\s*\.now-playing\s*\{([^}]+)\}', self.css_content)
        self.assertIsNotNone(match, "#now-playing rule not found in style.css")
        block = match.group(1)
        self.assertIn('background-color: #000000;', block)
        self.assertIn('contain: layout;', block)

    def test_player_container_and_playlist_panel_containment(self):
        """style.css enforces contain: layout on .player-container and .playlist-panel"""
        player_match = re.search(r'\.player-container\s*\{([^}]+)\}', self.css_content)
        self.assertIsNotNone(player_match, ".player-container rule not found in style.css")
        self.assertIn('contain: layout;', player_match.group(1))

        panel_match = re.search(r'\.playlist-panel\s*\{([^}]+)\}', self.css_content)
        self.assertIsNotNone(panel_match, ".playlist-panel rule not found in style.css")
        self.assertIn('contain: layout;', panel_match.group(1))

    def test_buffer_segment_opaque_and_progress_container_height(self):
        """style.css enforces opaque background: #666666 on .buffer-segment and fixed height: 20px on .progress-container"""
        buffer_match = re.search(r'\.buffer-segment\s*\{([^}]+)\}', self.css_content)
        self.assertIsNotNone(buffer_match, ".buffer-segment rule not found in style.css")
        self.assertIn('background: #666666;', buffer_match.group(1))

        prog_match = re.search(r'\.progress-container\s*\{([^}]+)\}', self.css_content)
        self.assertIsNotNone(prog_match, ".progress-container rule not found in style.css")
        self.assertIn('height: 20px;', prog_match.group(1))

if __name__ == '__main__':
    unittest.main()
