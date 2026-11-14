import os
import re
import unittest

class TestSteadyStateGpuElimination(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base_dir = os.path.dirname(os.path.dirname(__file__))
        cls.js_dir = os.path.join(cls.base_dir, 'js')
        cls.css_dir = os.path.join(cls.base_dir, 'css')
        cls.tests_dir = os.path.join(cls.base_dir, 'tests')

        with open(os.path.join(cls.js_dir, 'main.js'), 'r', encoding='utf-8') as f:
            cls.main_src = f.read()
        with open(os.path.join(cls.js_dir, 'ui.js'), 'r', encoding='utf-8') as f:
            cls.ui_src = f.read()
        with open(os.path.join(cls.css_dir, 'style.css'), 'r', encoding='utf-8') as f:
            cls.css_src = f.read()
        with open(os.path.join(cls.base_dir, 'index.html'), 'r', encoding='utf-8') as f:
            cls.html_src = f.read()
        with open(os.path.join(os.path.dirname(cls.base_dir), 'GEMINI.md'), 'r', encoding='utf-8') as f:
            cls.root_gemini = f.read()
        with open(os.path.join(cls.base_dir, 'GEMINI.md'), 'r', encoding='utf-8') as f:
            cls.yt_gemini = f.read()

    def test_zero_emojis_in_source_tests_and_rules(self):
        """Strictly zero emojis in all modified and related files"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        for name, content in [
            ('main.js', self.main_src),
            ('ui.js', self.ui_src),
            ('style.css', self.css_src),
            ('index.html', self.html_src),
            ('root GEMINI.md', self.root_gemini),
            ('youtube GEMINI.md', self.yt_gemini),
        ]:
            matches = emoji_pattern.findall(content)
            self.assertEqual(matches, [], f"Found emojis in {name}: {matches}")

    def test_unix_lf_line_endings_across_all_target_files(self):
        """Strictly UNIX LF line endings across all modified files"""
        target_files = [
            os.path.join(self.js_dir, 'main.js'),
            os.path.join(self.js_dir, 'ui.js'),
            os.path.join(self.css_dir, 'style.css'),
            os.path.join(os.path.dirname(self.base_dir), 'GEMINI.md'),
            os.path.join(self.base_dir, 'GEMINI.md'),
            __file__,
        ]
        for fpath in target_files:
            with open(fpath, 'rb') as f:
                raw_bytes = f.read()
            self.assertEqual(raw_bytes.count(b'\r\n'), 0, f"Found CRLF in {fpath}")

    def test_timeupdate_gates_update_time_ui_behind_document_hidden(self):
        """main.js timeupdate suppresses updateTimeUI when document.hidden is true"""
        match = re.search(
            r'if\s*\(!document\.hidden\)\s*\{\s*updateTimeUI\(ct\);\s*\}\s*else\s*\{\s*lastRenderTime\s*=\s*roundedSec;\s*\}',
            self.main_src
        )
        self.assertIsNotNone(match, "updateTimeUI must be gated behind !document.hidden in main.js timeupdate")

    def test_timeupdate_gates_lyrics_and_buffer_progress_behind_document_hidden(self):
        """main.js timeupdate suppresses updateLyricsUI and updateBufferProgress when document.hidden is true"""
        match = re.search(
            r'if\s*\(!document\.hidden\)\s*\{[\s\S]*?updateLyricsUI\(audioPlayer\.currentTime\);[\s\S]*?updateBufferProgress\(\);[\s\S]*?\}',
            self.main_src
        )
        self.assertIsNotNone(match, "Lyrics and buffer progress updates must be gated behind !document.hidden in timeupdate")

    def test_timeupdate_preserves_unthrottled_1hz_media_session_in_background(self):
        """main.js timeupdate maintains updateMediaSessionPosition execution even when document.hidden is true"""
        match = re.search(
            r'if\s*\(roundedSec\s*!==\s*lastRenderTime\s*\|\|\s*\(staleGap\s*&&\s*!audioPlayer\.paused\)\)\s*\{[\s\S]*?updateMediaSessionPosition\(ct,\s*dur',
            self.main_src
        )
        self.assertIsNotNone(match, "updateMediaSessionPosition must execute on 1Hz cadence inside timeupdate")

    def test_timeupdate_preserves_save_last_played_regex_and_gates_hidden(self):
        """main.js timeupdate preserves 2000ms debounce structure while gating actual state save behind !document.hidden"""
        match = re.search(
            r'if\s*\(\s*!audioPlayer\.paused\s*&&\s*typeof\s+saveLastPlayedState\s*===\s*[\'"]function[\'"]\s*\)\s*\{\s*const\s+now\s*=\s*Date\.now\(\);[\s\S]*?now\s*-\s*lastSaveStateTime\s*>\s*2000[\s\S]*?if\s*\(!document\.hidden\)\s*\{\s*saveLastPlayedState\(\);',
            self.main_src
        )
        self.assertIsNotNone(match, "saveLastPlayedState debounce structure must be preserved with !document.hidden gate")

    def test_visibilitychange_resyncs_time_and_buffer_progress(self):
        """main.js visibilitychange immediately resyncs updateTimeUI and updateBufferProgress on foreground transition"""
        match = re.search(
            r'document\.addEventListener\([\'"]visibilitychange[\'"],\s*\(\)\s*=>\s*\{[\s\S]*?if\s*\(!document\.hidden\)\s*\{[\s\S]*?lastRenderTime\s*=\s*-1;[\s\S]*?updateTimeUI\(Math\.floor\(audioPlayer\.currentTime\)\);[\s\S]*?updateBufferProgress\(\);',
            self.main_src
        )
        self.assertIsNotNone(match, "visibilitychange must reset lastRenderTime, updateTimeUI, and updateBufferProgress")

    def test_ui_buffer_progress_early_exit_on_document_hidden(self):
        """ui.js updateBufferProgress early exits immediately when document.hidden is true"""
        match = re.search(
            r'function\s+updateBufferProgress\(\)\s*\{[\s\S]*?if\s*\(\s*typeof\s+document\s*!==\s*[\'"]undefined[\'"]\s*&&\s*document\.hidden\s*\)\s*return;',
            self.ui_src
        )
        self.assertIsNotNone(match, "updateBufferProgress must check document.hidden at entry")

    def test_ui_buffer_progress_early_exit_on_stream_done_complete(self):
        """ui.js updateBufferProgress skips DOM queries when streamDone is true and buffer signature is already complete"""
        match = re.search(
            r'if\s*\(\s*audioPlayer\s*&&\s*audioPlayer\._streamDone\s*&&\s*lastBufferSignature\s*===\s*[\'"]complete[\'"]\s*\)\s*return;',
            self.ui_src
        )
        self.assertIsNotNone(match, "updateBufferProgress must early exit when streamDone and complete before DOM lookups")

    def test_ui_time_ui_early_exit_on_document_hidden(self):
        """ui.js updateTimeUI early exits immediately when document.hidden is true"""
        match = re.search(
            r'function\s+updateTimeUI\(seconds\)\s*\{[\s\S]*?if\s*\(\s*typeof\s+document\s*!==\s*[\'"]undefined[\'"]\s*&&\s*document\.hidden\s*\)\s*return;',
            self.ui_src
        )
        self.assertIsNotNone(match, "updateTimeUI must check document.hidden at entry")

    def test_ui_time_ui_memoizes_current_time_display_text(self):
        """ui.js updateTimeUI avoids setting textContent when formatted time is identical"""
        match = re.search(
            r'const\s+formatted\s*=\s*formatTime\(roundedSec\);[\s\S]*?if\s*\(\s*currentTimeDisplay\.textContent\s*!==\s*formatted\s*\)\s*\{[\s\S]*?currentTimeDisplay\.textContent\s*=\s*formatted;[\s\S]*?\}',
            self.ui_src
        )
        self.assertIsNotNone(match, "currentTimeDisplay.textContent must be memoized in updateTimeUI")

    def test_ui_time_ui_seekbar_value_change_guard(self):
        """ui.js updateTimeUI avoids setting seekBar.value when already equal to seconds"""
        match = re.search(
            r'if\s*\(\s*seekBar\.value\s*!=\s*seconds\s*\)\s*\{[\s\S]*?seekBar\.value\s*=\s*seconds;[\s\S]*?\}',
            self.ui_src
        )
        self.assertIsNotNone(match, "seekBar.value mutation must be guarded against identical values")

    def test_css_swipe_surface_omits_will_change(self):
        """style.css .swipe-surface omits dead will-change: transform"""
        match = re.search(r'\.swipe-surface\s*\{([^}]+)\}', self.css_src)
        self.assertIsNotNone(match, ".swipe-surface rule must exist in style.css")
        block = match.group(1)
        self.assertNotIn('will-change:', block, ".swipe-surface must not have will-change")

    def test_css_progress_container_layout_containment_and_layer_promotion(self):
        """style.css .progress-container has contain: layout paint and no forced layer allocation"""
        match = re.search(r'\.progress-container\s*\{([^}]+)\}', self.css_src)
        self.assertIsNotNone(match, ".progress-container rule not found in style.css")
        block = match.group(1)
        self.assertIn('contain: layout paint;', block)
        self.assertNotIn('transform: translateZ(0);', block)

    def test_css_buffer_container_layout_containment(self):
        """style.css #buffer-container has contain: layout paint"""
        match = re.search(r'#buffer-container[^{]*\{([^}]+)\}', self.css_src)
        self.assertIsNotNone(match, "#buffer-container rule not found in style.css")
        block = match.group(1)
        self.assertIn('contain: layout paint;', block)

    def test_css_now_playing_layout_containment(self):
        """style.css #now-playing has contain: layout"""
        match = re.search(r'#now-playing[^{]*\{([^}]+)\}', self.css_src)
        self.assertIsNotNone(match, "#now-playing rule not found in style.css")
        block = match.group(1)
        self.assertIn('contain: layout;', block)

    def test_css_seek_wrap_compositor_layer_promotion(self):
        """style.css .seek-wrap uses layout containment without forced layer allocation"""
        match = re.search(r'\.seek-wrap\s*\{([^}]+)\}', self.css_src)
        self.assertIsNotNone(match, ".seek-wrap rule not found in style.css")
        block = match.group(1)
        self.assertIn('contain: layout paint;', block)
        self.assertNotIn('transform: translateZ(0);', block)

    def test_gemini_invariants_document_steady_state_gpu_elimination(self):
        """Root GEMINI.md Rule 18 and youtube/GEMINI.md Rule 51 document steady-state 0% GPU optimizations"""
        key_phrases = [
            "!document.hidden",
            "updateMediaSessionPosition",
            "visibilitychange",
            "updateBufferProgress",
            "lastBufferSignature === 'complete'",
            "currentTimeDisplay.textContent",
            "contain: layout paint;",
            "transform: translateZ(0);",
        ]
        for phrase in key_phrases:
            self.assertIn(phrase, self.root_gemini, f"Missing phrase in root GEMINI.md: {phrase}")
            self.assertIn(phrase, self.yt_gemini, f"Missing phrase in youtube/GEMINI.md: {phrase}")

    def test_synthetic_timeupdate_behavioral_simulation(self):
        """Behavioral simulation of timeupdate loop verifying zero DOM calls in background and full resync on foreground"""
        class SyntheticPlayer:
            def __init__(self):
                self.currentTime = 42.4
                self.duration = 200.0
                self.paused = False
                self.playbackRate = 1.0
                self._pendingSeek = None
                self.switching = False
                self._streamDone = False

        class SyntheticDOM:
            def __init__(self):
                self.hidden = False
                self.time_ui_calls = 0
                self.lyrics_ui_calls = 0
                self.buffer_progress_calls = 0
                self.media_session_calls = 0
                self.save_state_calls = 0
                self.last_render_time = -1
                self.last_save_state_time = 0
                self.last_media_session_rate = 1.0

            def updateTimeUI(self, seconds):
                if self.hidden:
                    return
                self.time_ui_calls += 1

            def updateLyricsUI(self, seconds):
                if self.hidden:
                    return
                self.lyrics_ui_calls += 1

            def updateBufferProgress(self):
                if self.hidden:
                    return
                self.buffer_progress_calls += 1

            def updateMediaSessionPosition(self, ct, dur, rate=1.0, force=False):
                self.media_session_calls += 1
                self.last_media_session_rate = rate

            def saveLastPlayedState(self):
                if self.hidden:
                    return
                self.save_state_calls += 1

            def simulate_timeupdate(self, player, now_ms):
                ct = player.currentTime
                roundedSec = int(ct)
                dur = player.duration

                if roundedSec != self.last_render_time:
                    if not self.hidden:
                        self.updateTimeUI(ct)
                    else:
                        self.last_render_time = roundedSec
                    self.updateMediaSessionPosition(ct, dur, player.playbackRate)

                if not player.paused:
                    if now_ms - self.last_save_state_time > 2000:
                        self.last_save_state_time = now_ms
                        if not self.hidden:
                            self.saveLastPlayedState()

                if not self.hidden:
                    self.updateLyricsUI(ct)
                    self.updateBufferProgress()

            def simulate_visibilitychange(self, player):
                if not self.hidden:
                    self.last_render_time = -1
                    self.updateTimeUI(int(player.currentTime))
                    self.updateBufferProgress()

        player = SyntheticPlayer()
        dom = SyntheticDOM()

        # Phase 1: Foreground playback for 3 seconds (12 timeupdates at 250ms interval)
        for tick in range(12):
            player.currentTime = 10.0 + (tick * 0.25)
            dom.simulate_timeupdate(player, now_ms=1000 + (tick * 250))

        self.assertGreater(dom.time_ui_calls, 0, "Foreground must invoke updateTimeUI")
        self.assertGreater(dom.buffer_progress_calls, 0, "Foreground must invoke updateBufferProgress")
        self.assertGreater(dom.lyrics_ui_calls, 0, "Foreground must invoke updateLyricsUI")
        self.assertGreater(dom.media_session_calls, 0, "Foreground must invoke MediaSession")
        self.assertGreater(dom.save_state_calls, 0, "Foreground must invoke saveLastPlayedState")

        # Phase 2: Background playback for 4 seconds (16 timeupdates at 250ms interval)
        dom.hidden = True
        baseline_time_ui = dom.time_ui_calls
        baseline_buffer = dom.buffer_progress_calls
        baseline_lyrics = dom.lyrics_ui_calls
        baseline_save = dom.save_state_calls
        baseline_ms = dom.media_session_calls

        for tick in range(16):
            player.currentTime = 13.0 + (tick * 0.25)
            dom.simulate_timeupdate(player, now_ms=4000 + (tick * 250))

        # In background: ZERO new visual DOM mutations or disk saves
        self.assertEqual(dom.time_ui_calls, baseline_time_ui, "Background playback must generate 0 updateTimeUI calls")
        self.assertEqual(dom.buffer_progress_calls, baseline_buffer, "Background playback must generate 0 updateBufferProgress calls")
        self.assertEqual(dom.lyrics_ui_calls, baseline_lyrics, "Background playback must generate 0 updateLyricsUI calls")
        self.assertEqual(dom.save_state_calls, baseline_save, "Background playback must generate 0 saveLastPlayedState calls")

        # BUT MediaSession updates MUST continue at 1Hz in background (4 seconds = 4 updates)
        new_ms_calls = dom.media_session_calls - baseline_ms
        self.assertGreaterEqual(new_ms_calls, 3, "Background playback must maintain 1Hz MediaSession updates")

        # Phase 3: Transition back to foreground via visibilitychange
        dom.hidden = False
        dom.simulate_visibilitychange(player)

        # Immediate resync executed
        self.assertEqual(dom.time_ui_calls, baseline_time_ui + 1, "visibilitychange must execute catch-up updateTimeUI")
        self.assertEqual(dom.buffer_progress_calls, baseline_buffer + 1, "visibilitychange must execute catch-up updateBufferProgress")

if __name__ == '__main__':
    unittest.main()
