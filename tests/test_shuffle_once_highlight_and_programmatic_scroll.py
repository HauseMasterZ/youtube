import os
import re
import unittest

class TestShuffleOnceHighlightAndProgrammaticScroll(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base_dir = os.path.dirname(os.path.dirname(__file__))
        cls.js_dir = os.path.join(cls.base_dir, 'js')
        with open(os.path.join(cls.js_dir, 'ui.js'), 'r', encoding='utf-8') as f:
            cls.ui_content = f.read()
        with open(os.path.join(cls.js_dir, 'main.js'), 'r', encoding='utf-8') as f:
            cls.main_content = f.read()
        with open(os.path.join(cls.js_dir, 'playback.js'), 'r', encoding='utf-8') as f:
            cls.playback_content = f.read()
        with open(os.path.join(cls.js_dir, 'mediaSession.js'), 'r', encoding='utf-8') as f:
            cls.ms_content = f.read()
        with open(os.path.join(os.path.dirname(cls.base_dir), 'GEMINI.md'), 'r', encoding='utf-8') as f:
            cls.root_gemini = f.read()
        with open(os.path.join(cls.base_dir, 'GEMINI.md'), 'r', encoding='utf-8') as f:
            cls.yt_gemini = f.read()

    def test_strictly_zero_emojis_in_source_and_tests(self):
        """Strictly zero emojis in modified js files and test"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        with open(__file__, 'r', encoding='utf-8') as f:
            this_content = f.read()

        for name, content in [
            ('ui.js', self.ui_content),
            ('main.js', self.main_content),
            ('playback.js', self.playback_content),
            ('mediaSession.js', self.ms_content),
            ('root GEMINI.md', self.root_gemini),
            ('youtube GEMINI.md', self.yt_gemini),
            ('test_shuffle_once_highlight_and_programmatic_scroll.py', this_content),
        ]:
            matches = emoji_pattern.findall(content)
            self.assertEqual(matches, [], f"Found emojis in {name}: {matches}")

    def test_strictly_unix_lf_line_endings(self):
        """Strictly UNIX LF line endings across modified files and test"""
        target_files = [
            os.path.join(self.js_dir, 'ui.js'),
            os.path.join(self.js_dir, 'main.js'),
            os.path.join(self.js_dir, 'playback.js'),
            os.path.join(self.js_dir, 'mediaSession.js'),
            os.path.join(os.path.dirname(self.base_dir), 'GEMINI.md'),
            os.path.join(self.base_dir, 'GEMINI.md'),
            __file__,
        ]
        for fpath in target_files:
            with open(fpath, 'rb') as f:
                raw_bytes = f.read()
            self.assertEqual(raw_bytes.count(b'\r\n'), 0, f"Found CRLF in {fpath}")

    def test_ui_scroll_to_track_sets_programmatic_scroll_flag(self):
        """ui.js scrollToTrack sets window.isProgrammaticPlaylistScroll during programmatic scroll"""
        self.assertIn("window.isProgrammaticPlaylistScroll = true;", self.ui_content)
        self.assertIn("window._progScrollTimer = setTimeout(() => {", self.ui_content)
        self.assertIn("window.isProgrammaticPlaylistScroll = false;", self.ui_content)

    def test_main_scroll_listener_guards_programmatic_scroll(self):
        """main.js playlistContainer scroll listener returns early without updating lastUserScrollTime during programmatic scroll"""
        match = re.search(
            r'playlistContainer\.addEventListener\(["\']scroll["\'],\s*\(\)\s*=>\s*\{([\s\S]*?)\},\s*\{\s*passive:\s*true\s*\}\);',
            self.main_content
        )
        self.assertIsNotNone(match, "playlistContainer scroll listener not found in main.js")
        listener_body = match.group(1)
        self.assertIn("if (typeof window !== 'undefined' && window.isProgrammaticPlaylistScroll)", listener_body)
        self.assertIn("scheduleVirtualRender();", listener_body)
        self.assertIn("return;", listener_body)

    def test_playback_play_next_and_prev_force_scroll(self):
        """playback.js playNext and playPrev call executePlayback with forceScroll = true"""
        play_next_match = re.search(r'function\s+playNext\s*\(\s*\)\s*\{([\s\S]*?)\n\s*function\s+playPrev', self.playback_content)
        self.assertIsNotNone(play_next_match, "playNext not found in playback.js")
        next_body = play_next_match.group(1)
        self.assertIn("executePlayback(false, false, true);", next_body)
        self.assertNotIn("executePlayback();", next_body)

        play_prev_match = re.search(r'function\s+playPrev\s*\(\s*\)\s*\{([\s\S]*?)\n\s*function\s+executePlayback', self.playback_content)
        self.assertIsNotNone(play_prev_match, "playPrev not found in playback.js")
        prev_body = play_prev_match.group(1)
        self.assertIn("executePlayback(false, true, true);", prev_body)
        self.assertNotIn("executePlayback();", prev_body)

    def test_synthetic_consecutive_shuffle_track_highlights(self):
        """Simulation: multiple consecutive shuffle-once track advances always scroll and preserve active highlight"""
        total_tracks = 50
        item_height = 48
        container_height = 400

        # State simulation
        state = {
            'scroll_top': 0,
            'last_user_scroll_time': 0,
            'is_scrolling_fast': False,
            'is_prog_scroll': False,
            'active_original_index': -1,
            'rendered_active': None,
            'scroll_count': 0,
        }

        def on_scroll(is_user_gesture):
            if state['is_prog_scroll']:
                return
            state['last_user_scroll_time'] = 1000
            state['is_scrolling_fast'] = True

        def scroll_to_track(original_index, force_scroll=False, allow_scroll=True, current_time=0):
            if not allow_scroll:
                return
            virtual_index = original_index
            is_user_active_scrolling = ((current_time - state['last_user_scroll_time']) < 1500) or state['is_scrolling_fast']
            if force_scroll or not is_user_active_scrolling:
                scroll_pos = virtual_index * item_height
                target_top = max(0, scroll_pos - (container_height / 2) + (item_height / 2))
                state['is_prog_scroll'] = True
                state['scroll_top'] = target_top
                state['scroll_count'] += 1
                on_scroll(False)
                state['is_prog_scroll'] = False

            # Render virtual window
            start_index = max(0, int(state['scroll_top'] / item_height) - 3)
            end_index = min(total_tracks - 1, int((state['scroll_top'] + container_height) / item_height) + 3)
            if start_index <= virtual_index <= end_index:
                state['rendered_active'] = original_index
            else:
                state['rendered_active'] = None

        # Shuffled sequence of track indices
        shuffled_deck = [38, 5, 42, 12, 49, 1, 27, 8]
        current_clock = 2000

        for track_idx in shuffled_deck:
            current_clock += 500  # Rapid skips (500ms apart, well within 1500ms window)
            scroll_to_track(track_idx, force_scroll=True, allow_scroll=True, current_time=current_clock)
            self.assertEqual(
                state['rendered_active'],
                track_idx,
                f"Track {track_idx} failed to receive active highlight during rapid shuffle advance"
            )

        self.assertEqual(state['scroll_count'], len(shuffled_deck))

    def test_gemini_rules_document_programmatic_scroll_isolation(self):
        """Both GEMINI.md files document programmatic scroll isolation and shuffle once highlight invariant"""
        phrases = [
            "window.isProgrammaticPlaylistScroll = true",
            "scheduleVirtualRender()",
            "executePlayback(false, false, true)",
        ]
        for phrase in phrases:
            self.assertIn(phrase, self.root_gemini, f"Missing phrase in root GEMINI.md: {phrase}")
            self.assertIn(phrase, self.yt_gemini, f"Missing phrase in youtube/GEMINI.md: {phrase}")

if __name__ == '__main__':
    unittest.main()
