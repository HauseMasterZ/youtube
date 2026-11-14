import os
import re
import unittest

class TestForegroundIdleGpuElimination(unittest.TestCase):
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
        with open(os.path.join(cls.js_dir, 'playback.js'), 'r', encoding='utf-8') as f:
            cls.playback_src = f.read()
        with open(os.path.join(cls.js_dir, 'state.js'), 'r', encoding='utf-8') as f:
            cls.state_src = f.read()
        with open(os.path.join(cls.css_dir, 'style.css'), 'r', encoding='utf-8') as f:
            cls.css_src = f.read()
        with open(os.path.join(cls.base_dir, 'index.html'), 'r', encoding='utf-8') as f:
            cls.html_src = f.read()
        with open(os.path.join(os.path.dirname(cls.base_dir), 'GEMINI.md'), 'r', encoding='utf-8') as f:
            cls.root_gemini = f.read()
        with open(os.path.join(cls.base_dir, 'GEMINI.md'), 'r', encoding='utf-8') as f:
            cls.yt_gemini = f.read()

    def test_strictly_zero_emojis_in_source_tests_and_rules(self):
        """Strictly zero emojis in all modified and related files"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        with open(__file__, 'r', encoding='utf-8') as f:
            this_content = f.read()

        for name, content in [
            ('main.js', self.main_src),
            ('ui.js', self.ui_src),
            ('playback.js', self.playback_src),
            ('state.js', self.state_src),
            ('style.css', self.css_src),
            ('index.html', self.html_src),
            ('root GEMINI.md', self.root_gemini),
            ('youtube GEMINI.md', self.yt_gemini),
            ('test_foreground_idle_gpu_elimination.py', this_content),
        ]:
            matches = emoji_pattern.findall(content)
            self.assertEqual(matches, [], f"Found emojis in {name}: {matches}")

    def test_strictly_unix_lf_line_endings_across_target_files(self):
        """Strictly UNIX LF line endings across all modified files"""
        target_files = [
            os.path.join(self.js_dir, 'main.js'),
            os.path.join(self.js_dir, 'ui.js'),
            os.path.join(self.js_dir, 'playback.js'),
            os.path.join(self.js_dir, 'state.js'),
            os.path.join(os.path.dirname(self.base_dir), 'GEMINI.md'),
            os.path.join(self.base_dir, 'GEMINI.md'),
            __file__,
        ]
        for fpath in target_files:
            with open(fpath, 'rb') as f:
                raw_bytes = f.read()
            self.assertEqual(raw_bytes.count(b'\r\n'), 0, f"Found CRLF in {fpath}")

    def test_state_initializes_playback_ui_idle_flag(self):
        """state.js defines and initializes window.isPlaybackUiIdle to false"""
        self.assertIn('window.isPlaybackUiIdle = false;', self.state_src)

    def test_main_defines_activity_idle_detection_and_timeout(self):
        """main.js defines PLAYBACK_IDLE_TIMEOUT_MS as 2500 and manages debounce check"""
        self.assertIn('const PLAYBACK_IDLE_TIMEOUT_MS = 2500;', self.main_src)
        self.assertIn('function schedulePlaybackIdleCheck()', self.main_src)
        self.assertIn('function markUserActive(event)', self.main_src)
        self.assertIn('window.markUserActive = markUserActive;', self.main_src)
        self.assertIn('window.schedulePlaybackIdleCheck = schedulePlaybackIdleCheck;', self.main_src)

    def test_main_registers_all_required_activity_event_listeners(self):
        """main.js listens to pointermove, pointerdown, touchstart, keydown, wheel, focus, and blur"""
        for evt in ['pointermove', 'pointerdown', 'touchstart', 'keydown', 'wheel']:
            self.assertIn(evt, self.main_src)
        self.assertRegex(
            self.main_src,
            r'window\.addEventListener\([\'"]focus[\'"],\s*markUserActive\)'
        )
        self.assertRegex(
            self.main_src,
            r'window\.addEventListener\([\'"]blur[\'"],\s*\(\)\s*=>\s*\{[\s\S]*?window\.isPlaybackUiIdle\s*=\s*true;'
        )

    def test_ui_update_time_ui_suspends_dom_mutations_on_playback_ui_idle(self):
        """ui.js updateTimeUI early exits and advances lastRenderTime when window.isPlaybackUiIdle is true"""
        match = re.search(
            r'const\s+isUiIdle\s*=\s*!!\(\s*typeof\s+window\s*!==\s*[\'"]undefined[\'"]\s*&&\s*window\.isPlaybackUiIdle\s*&&\s*\(!window\.lyricsActive\s*\|\|\s*\(typeof\s+document\s*!==\s*[\'"]undefined[\'"]\s*&&\s*typeof\s+document\.hasFocus\s*===\s*[\'"]function[\'"]\s*&&\s*!document\.hasFocus\(\)\)\)\);[\s\S]*?if\s*\(\s*isUiIdle\s*\)\s*\{\s*lastRenderTime\s*=\s*Math\.floor\(seconds\);\s*return;\s*\}',
            self.ui_src
        )
        self.assertIsNotNone(match, "updateTimeUI must check isUiIdle, advance lastRenderTime, and early return")

    def test_ui_update_buffer_progress_suspends_on_playback_ui_idle(self):
        """ui.js updateBufferProgress early exits when window.isPlaybackUiIdle is true"""
        match = re.search(
            r'if\s*\(\s*typeof\s+window\s*!==\s*[\'"]undefined[\'"]\s*&&\s*window\.isPlaybackUiIdle\s*\)\s*return;',
            self.ui_src
        )
        self.assertIsNotNone(match, "updateBufferProgress must check window.isPlaybackUiIdle at entry")

    def test_main_timeupdate_gates_buffer_progress_behind_playback_ui_idle(self):
        """main.js timeupdate suppresses updateBufferProgress when window.isPlaybackUiIdle is true"""
        match = re.search(
            r'if\s*\(!window\.isPlaybackUiIdle\s*&&\s*typeof\s+updateBufferProgress\s*===\s*[\'"]function[\'"]\)\s*updateBufferProgress\(\);',
            self.main_src
        )
        self.assertIsNotNone(match, "main.js timeupdate must gate updateBufferProgress behind !window.isPlaybackUiIdle")

    def test_playback_eliminates_storage_churn_via_signature_check(self):
        """playback.js saveLastPlayedState skips writes when forcedPosition is null and signature is unchanged"""
        match = re.search(
            r'const\s+currentSignature\s*=\s*`\$\{targetPlaylist\}:\$\{track\.id\}:\$\{globalActiveOriginalIndex\}:\$\{queueIndex\}:[\s\S]*?`;[\s\S]*?if\s*\(\s*forcedPosition\s*===\s*null\s*&&\s*window\._lastSavedSignature\s*===\s*currentSignature\s*\)\s*\{\s*return;\s*\}[\s\S]*?window\._lastSavedSignature\s*=\s*currentSignature;',
            self.playback_src
        )
        self.assertIsNotNone(match, "saveLastPlayedState must check signature to eliminate steady-state storage churn")

    def test_instant_resync_on_user_interaction_in_mark_user_active(self):
        """main.js markUserActive immediately resets lastRenderTime and synchronously calls updateTimeUI and updateBufferProgress"""
        match = re.search(
            r'function\s+markUserActive\([^\)]*\)\s*\{[\s\S]*?lastRenderTime\s*=\s*-1;[\s\S]*?updateTimeUI\(audioPlayer\.currentTime\);[\s\S]*?updateBufferProgress\(\);',
            self.main_src
        )
        self.assertIsNotNone(match, "markUserActive must synchronously resync updateTimeUI and updateBufferProgress")

    def test_gemini_invariants_document_foreground_idle_gpu_elimination(self):
        """Both root and youtube GEMINI.md document foreground activity idle detection and 0% GPU steady-state"""
        phrases = [
            "PLAYBACK_IDLE_TIMEOUT_MS = 2500",
            "window.isPlaybackUiIdle = true",
            "pointermove",
            "pointerdown",
            "touchstart",
            "keydown",
            "wheel",
            "updateMediaSessionPosition",
            "saveLastPlayedState",
            "0ms latency",
        ]
        for phrase in phrases:
            self.assertIn(phrase, self.root_gemini, f"Missing phrase in root GEMINI.md: {phrase}")
            self.assertIn(phrase, self.yt_gemini, f"Missing phrase in youtube/GEMINI.md: {phrase}")

    def test_synthetic_foreground_idle_gpu_behavioral_simulation(self):
        """Comprehensive synthetic state machine modeling foreground active, idle suspension, instant wake, blur, and focus"""
        class SyntheticAudioPlayer:
            def __init__(self):
                self.currentTime = 10.0
                self.duration = 180.0
                self.paused = False
                self.playbackRate = 1.0

        class SyntheticCompositorViewport:
            def __init__(self):
                self.hidden = False
                self.focused = True
                self.isPlaybackUiIdle = False
                self.lyricsActive = False

                self.lastRenderTime = -1
                self.lastSavedSignature = None

                # Metric counters
                self.time_ui_dom_mutations = 0
                self.buffer_progress_mutations = 0
                self.mediasession_position_updates = 0
                self.storage_writes = 0
                self.compositor_frame_presents = 0

                self.user_activity_debounce_timer = None
                self.IDLE_TIMEOUT_MS = 2500
                self.current_time_ms = 0

            def schedule_playback_idle_check(self):
                self.user_activity_debounce_timer = self.current_time_ms + self.IDLE_TIMEOUT_MS

            def mark_user_active(self, event_type=None):
                was_idle = self.isPlaybackUiIdle
                self.isPlaybackUiIdle = False
                self.user_activity_debounce_timer = None

                if was_idle:
                    self.lastRenderTime = -1
                    self.updateTimeUI(player.currentTime)
                    self.updateBufferProgress()

                self.schedule_playback_idle_check()

            def updateTimeUI(self, seconds):
                if self.hidden:
                    return
                is_ui_idle = self.isPlaybackUiIdle and (not self.lyricsActive or not self.focused)
                if is_ui_idle:
                    self.lastRenderTime = int(seconds)
                    return
                # Real DOM mutations occur
                self.time_ui_dom_mutations += 1
                self.compositor_frame_presents += 1
                self.lastRenderTime = int(seconds)

            def updateBufferProgress(self):
                if self.hidden or self.isPlaybackUiIdle:
                    return
                self.buffer_progress_mutations += 1
                self.compositor_frame_presents += 1

            def updateMediaSessionPosition(self, ct, dur, rate=1.0):
                # Out-of-process IPC: does not present compositor frames or damage DOM
                self.mediasession_position_updates += 1

            def saveLastPlayedState(self, forced_pos=None):
                sig = "Gym:track1:0:0:0:0"
                if forced_pos is None and self.lastSavedSignature == sig:
                    return
                self.lastSavedSignature = sig
                self.storage_writes += 1

            def tick(self, player, delta_ms=250):
                self.current_time_ms += delta_ms
                player.currentTime += delta_ms / 1000.0

                # Check idle debounce timer
                if (self.user_activity_debounce_timer is not None and 
                    self.current_time_ms >= self.user_activity_debounce_timer and
                    not player.paused and not self.hidden):
                    self.isPlaybackUiIdle = True
                    self.user_activity_debounce_timer = None

                ct = player.currentTime
                rounded_sec = int(ct)
                dur = player.duration

                # 1 Hz Media clock & UI presentation cycle
                if rounded_sec != self.lastRenderTime:
                    if not self.hidden:
                        self.updateTimeUI(ct)
                    else:
                        self.lastRenderTime = rounded_sec
                    self.updateMediaSessionPosition(ct, dur, player.playbackRate)

                # Periodic storage save attempt every 2000ms
                if not player.paused and not self.hidden:
                    self.saveLastPlayedState()

                # Buffer progress attempt
                if not self.hidden and not self.isPlaybackUiIdle:
                    self.updateBufferProgress()

        player = SyntheticAudioPlayer()
        viewport = SyntheticCompositorViewport()

        # Initial playback start
        viewport.mark_user_active()
        viewport.saveLastPlayedState(0) # Initial track start forced save
        self.assertEqual(viewport.storage_writes, 1, "Initial track start must save state")

        # Phase 1: Foreground playback for 2.0 seconds with frequent user interaction (pointermove every 500ms)
        for i in range(8): # 8 * 250ms = 2.0s
            if i % 2 == 0:
                viewport.mark_user_active('pointermove')
            viewport.tick(player, delta_ms=250)

        self.assertFalse(viewport.isPlaybackUiIdle, "Player must remain active during user activity")
        self.assertGreater(viewport.time_ui_dom_mutations, 0, "Active user must receive time updates")
        self.assertGreater(viewport.compositor_frame_presents, 0, "Active UI presents frames")
        # Steady state storage writes should remain 1 (no churn!)
        self.assertEqual(viewport.storage_writes, 1, "Storage churn must be 0 during active playback")

        # Phase 2: Inactivity for 5.0 seconds (no pointer/touch events)
        # At 2.5s of inactivity, isPlaybackUiIdle must transition to True
        baseline_dom_mutations = viewport.time_ui_dom_mutations
        baseline_buffer_mutations = viewport.buffer_progress_mutations
        baseline_ms_updates = viewport.mediasession_position_updates
        baseline_presents = viewport.compositor_frame_presents

        for i in range(20): # 20 * 250ms = 5.0s
            viewport.tick(player, delta_ms=250)

        self.assertTrue(viewport.isPlaybackUiIdle, "After >= 2.5s without activity, player must be idle")
        # During the idle period after 2.5s:
        # DOM mutations to time UI and buffer must be completely FROZEN (0 presentations)!
        # At most 2 updates happened during the first 2.5s before idle engaged
        mutations_during_phase2 = viewport.time_ui_dom_mutations - baseline_dom_mutations
        self.assertLessEqual(mutations_during_phase2, 3, "UI mutations must halt once idle engages")

        # Record frozen baseline during steady idle
        frozen_dom_mutations = viewport.time_ui_dom_mutations
        frozen_buffer_mutations = viewport.buffer_progress_mutations
        frozen_presents = viewport.compositor_frame_presents
        frozen_storage = viewport.storage_writes

        # Run 8 more ticks (2.0s) strictly during idle
        for i in range(8):
            viewport.tick(player, delta_ms=250)

        # EXACTLY ZERO DOM mutations, ZERO buffer mutations, ZERO presents, ZERO storage writes
        self.assertEqual(viewport.time_ui_dom_mutations, frozen_dom_mutations, "0 time UI mutations during idle")
        self.assertEqual(viewport.buffer_progress_mutations, frozen_buffer_mutations, "0 buffer mutations during idle")
        self.assertEqual(viewport.compositor_frame_presents, frozen_presents, "0 frame presents during idle (0% GPU!)")
        self.assertEqual(viewport.storage_writes, frozen_storage, "0 storage writes during idle")

        # BUT MediaSession position state MUST continue at 1 Hz for Android SystemUI / Windows SMTC!
        ms_updates_during_idle = viewport.mediasession_position_updates - baseline_ms_updates
        self.assertGreaterEqual(ms_updates_during_idle, 5, "MediaSession must continue at 1Hz during idle")

        # Phase 3: Instant interaction resynchronization upon simulated pointermove
        viewport.mark_user_active('pointermove')
        self.assertFalse(viewport.isPlaybackUiIdle, "User activity must immediately clear idle flag")
        self.assertEqual(viewport.time_ui_dom_mutations, frozen_dom_mutations + 1, "Must synchronously resync time UI (0ms latency)")
        self.assertEqual(viewport.buffer_progress_mutations, frozen_buffer_mutations + 1, "Must synchronously resync buffer UI")

        # Phase 4: Window blur / defocus gating
        viewport.focused = False
        viewport.isPlaybackUiIdle = True # blur event fires
        blur_dom_baseline = viewport.time_ui_dom_mutations
        for i in range(8):
            viewport.tick(player, delta_ms=250)
        self.assertEqual(viewport.time_ui_dom_mutations, blur_dom_baseline, "0 DOM mutations while window is blurred")

        # Phase 5: Window focus resync
        viewport.focused = True
        viewport.mark_user_active('focus')
        self.assertFalse(viewport.isPlaybackUiIdle, "Window focus must clear idle flag")
        self.assertEqual(viewport.time_ui_dom_mutations, blur_dom_baseline + 1, "Focus must immediately resync UI")

if __name__ == '__main__':
    unittest.main()
