import os
import re
import unittest

class TestGpuSteadyStateMediaSessionDampening(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base_dir = os.path.dirname(os.path.dirname(__file__))
        cls.js_dir = os.path.join(cls.base_dir, 'js')
        cls.css_dir = os.path.join(cls.base_dir, 'css')
        cls.tests_dir = os.path.join(cls.base_dir, 'tests')

        with open(os.path.join(cls.js_dir, 'mediaSession.js'), 'r', encoding='utf-8') as f:
            cls.ms_src = f.read()
        with open(os.path.join(cls.js_dir, 'main.js'), 'r', encoding='utf-8') as f:
            cls.main_src = f.read()
        with open(os.path.join(cls.css_dir, 'style.css'), 'r', encoding='utf-8') as f:
            cls.css_src = f.read()
        with open(os.path.join(os.path.dirname(cls.base_dir), 'GEMINI.md'), 'r', encoding='utf-8') as f:
            cls.root_gemini = f.read()
        with open(os.path.join(cls.base_dir, 'GEMINI.md'), 'r', encoding='utf-8') as f:
            cls.yt_gemini = f.read()

    def test_strictly_zero_emojis_in_source_tests_and_rules(self):
        """Strictly zero emojis in all touched files and rules"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        with open(__file__, 'r', encoding='utf-8') as f:
            this_content = f.read()

        for name, content in [
            ('mediaSession.js', self.ms_src),
            ('main.js', self.main_src),
            ('style.css', self.css_src),
            ('root GEMINI.md', self.root_gemini),
            ('youtube GEMINI.md', self.yt_gemini),
            ('test_gpu_steady_state_mediasession_dampening.py', this_content),
        ]:
            matches = emoji_pattern.findall(content)
            self.assertEqual(matches, [], f"Found emojis in {name}: {matches}")

    def test_strictly_unix_lf_line_endings_across_target_files(self):
        """Strictly UNIX LF line endings across all modified files"""
        target_files = [
            os.path.join(self.js_dir, 'mediaSession.js'),
            os.path.join(self.js_dir, 'main.js'),
            os.path.join(self.css_dir, 'style.css'),
            os.path.join(os.path.dirname(self.base_dir), 'GEMINI.md'),
            os.path.join(self.base_dir, 'GEMINI.md'),
            __file__,
        ]
        for fpath in target_files:
            with open(fpath, 'rb') as f:
                raw_bytes = f.read()
            self.assertEqual(raw_bytes.count(b'\r\n'), 0, f"Found CRLF in {fpath}")

    def test_mediasession_drift_throttling_implementation(self):
        """mediaSession.js implements drift <= 1.5 check and duration shift detection"""
        self.assertIn("const drift = Math.abs(pos - projected);", self.ms_src)
        self.assertIn("if (drift <= 1.5) {", self.ms_src)
        self.assertIn("let _lastPositionCheckTimestamp = 0;", self.ms_src)
        self.assertIn("let _lastSentDuration = -1;", self.ms_src)
        self.assertIn("return Math.max(_lastSentTimestamp, _lastPositionCheckTimestamp);", self.ms_src)

    def test_main_mark_user_active_filters_stationary_pointermove(self):
        """main.js markUserActive ignores pointermove when movementX and movementY are zero"""
        pattern = r'if\s*\(\s*event\s*&&\s*event\.type\s*===\s*[\'"]pointermove[\'"]\s*&&\s*typeof\s+event\.movementX\s*===\s*[\'"]number[\'"]\s*&&\s*typeof\s+event\.movementY\s*===\s*[\'"]number[\'"]\s*&&\s*event\.movementX\s*===\s*0\s*&&\s*event\.movementY\s*===\s*0\s*\)\s*\{\s*return;\s*\}'
        match = re.search(pattern, self.main_src)
        self.assertIsNotNone(match, "markUserActive must filter out stationary pointermove events")

    def test_gemini_rules_document_dampening_and_stationary_filter(self):
        """Both GEMINI.md files document drift-throttling, staleGap preservation, and stationary pointer filtering"""
        phrases = [
            "drift = Math.abs(pos - projected) <= 1.5s",
            "Math.max(_lastSentTimestamp, _lastPositionCheckTimestamp)",
            "movementX === 0 && movementY === 0",
        ]
        for phrase in phrases:
            self.assertIn(phrase, self.root_gemini, f"Missing phrase in root GEMINI.md: {phrase}")
            self.assertIn(phrase, self.yt_gemini, f"Missing phrase in youtube/GEMINI.md: {phrase}")

    def test_compositor_layer_allocation_audit_no_forced_translatez(self):
        """Audit compositing layers: .progress-container and .seek-wrap enforce layout containment without forced translateZ(0)"""
        match_progress = re.search(r'\.progress-container\s*\{([^}]+)\}', self.css_src)
        self.assertIsNotNone(match_progress, ".progress-container rule not found in style.css")
        self.assertIn('contain: layout paint;', match_progress.group(1))
        self.assertNotIn('transform: translateZ(0);', match_progress.group(1))

        match_seek = re.search(r'\.seek-wrap\s*\{([^}]+)\}', self.css_src)
        self.assertIsNotNone(match_seek, ".seek-wrap rule not found in style.css")
        self.assertIn('contain: layout paint;', match_seek.group(1))
        self.assertNotIn('transform: translateZ(0);', match_seek.group(1))

    def test_synthetic_mediasession_drift_throttling_simulation(self):
        """Simulate mediaSession updateMediaSessionPosition state machine under steady state and drift conditions"""
        class SyntheticMediaSessionController:
            def __init__(self):
                self._lastSentPosition = -1
                self._lastSentTimestamp = 0
                self._lastSentRate = -1
                self._lastSentDuration = -1
                self._lastPositionCheckTimestamp = 0
                self._forceNextPosition = False
                self.ipc_call_count = 0
                self.last_ipc_state = None

            def getLastPositionTimestamp(self):
                return max(self._lastSentTimestamp, self._lastPositionCheckTimestamp)

            def updateMediaSessionPosition(self, forcedPosition=None, forcedDuration=None, forcedRate=None, force=False, now_ms=0, is_paused=False, is_seeking=False, is_buffering=False):
                self._lastPositionCheckTimestamp = now_ms

                dur = forcedDuration if (forcedDuration is not None and forcedDuration > 0) else 180.0
                pos = forcedPosition if (forcedPosition is not None and forcedPosition >= 0) else 0.0
                rate = forcedRate if (forcedRate is not None and forcedRate > 0) else 1.0

                valid_rate = rate
                is_rate_shift = (self._lastSentRate > 0 and abs(valid_rate - self._lastSentRate) > 0.001)

                force_bypass = (force is True) or (self._forceNextPosition is True)
                if force_bypass:
                    self._forceNextPosition = False

                if not force_bypass and not is_rate_shift and not is_paused and not is_buffering and not is_seeking and self._lastSentPosition >= 0:
                    if self._lastSentDuration > 0 and dur > 0 and abs(dur - self._lastSentDuration) > 1.0:
                        pass
                    else:
                        elapsed = now_ms - self._lastSentTimestamp
                        if pos < self._lastSentPosition - 0.5 and elapsed < 3000:
                            return False
                        if elapsed < 850:
                            return False
                        if elapsed < 1500 and abs(pos - self._lastSentPosition) < 0.25:
                            return False
                        projected = self._lastSentPosition + (elapsed * 0.001 * valid_rate)
                        drift = abs(pos - projected)
                        if drift <= 1.5:
                            return False

                valid_pos = max(0.0, min(pos, dur))
                if not force_bypass and not is_paused and not is_seeking and not is_buffering and valid_rate == 1.0 and self._lastSentPosition >= 0:
                    elapsed_since_last = now_ms - self._lastSentTimestamp
                    if elapsed_since_last < 1500:
                        projected = self._lastSentPosition + (elapsed_since_last * 0.001 * valid_rate)
                        if abs(valid_pos - projected) < 0.25:
                            valid_pos = max(0.0, min(projected, dur))
                    if elapsed_since_last < 1000 and valid_pos < self._lastSentPosition:
                        valid_pos = self._lastSentPosition

                self.ipc_call_count += 1
                self.last_ipc_state = {
                    'duration': dur,
                    'playbackRate': valid_rate,
                    'position': valid_pos
                }
                self._lastSentPosition = valid_pos
                self._lastSentTimestamp = now_ms
                self._lastSentRate = valid_rate
                self._lastSentDuration = dur
                return True

        controller = SyntheticMediaSessionController()
        now = 1000000

        # Initial playback start: force = True
        res = controller.updateMediaSessionPosition(forcedPosition=0.0, forcedDuration=180.0, forcedRate=1.0, force=True, now_ms=now)
        self.assertTrue(res)
        self.assertEqual(controller.ipc_call_count, 1)
        self.assertEqual(controller.last_ipc_state['position'], 0.0)

        # 60 seconds of steady-state playback: ticks every 1000ms
        for sec in range(1, 61):
            now += 1000
            current_pos = sec * 1.0 + 0.02  # minor 20ms audio clock jitter
            res = controller.updateMediaSessionPosition(forcedPosition=current_pos, forcedDuration=180.0, forcedRate=1.0, force=False, now_ms=now)
            self.assertFalse(res, f"Steady-state tick at sec {sec} must be throttled")

        # IPC calls must remain exactly 1 after 60 seconds!
        self.assertEqual(controller.ipc_call_count, 1, "0 setPositionState IPC calls during steady playback")

        # Check that getLastPositionTimestamp remains fresh and avoids false staleGap
        self.assertEqual(controller.getLastPositionTimestamp(), now)
        self.assertLessEqual(now - controller.getLastPositionTimestamp(), 1000)

        # Inject 2.0s drift at second 61
        now += 1000
        current_pos = 63.0  # projected was 61.0, drift is 2.0s > 1.5s
        res = controller.updateMediaSessionPosition(forcedPosition=current_pos, forcedDuration=180.0, forcedRate=1.0, force=False, now_ms=now)
        self.assertTrue(res, "Drift > 1.5s must trigger IPC sync")
        self.assertEqual(controller.ipc_call_count, 2)
        self.assertEqual(controller.last_ipc_state['position'], 63.0)

        # Next steady tick returns to throttled
        now += 1000
        current_pos = 64.0
        res = controller.updateMediaSessionPosition(forcedPosition=current_pos, forcedDuration=180.0, forcedRate=1.0, force=False, now_ms=now)
        self.assertFalse(res, "Tick after drift sync must return to throttled")
        self.assertEqual(controller.ipc_call_count, 2)

        # Force seek immediately updates
        now += 500
        res = controller.updateMediaSessionPosition(forcedPosition=120.0, forcedDuration=180.0, forcedRate=1.0, force=True, now_ms=now)
        self.assertTrue(res, "Forced seek must immediately update IPC")
        self.assertEqual(controller.ipc_call_count, 3)
        self.assertEqual(controller.last_ipc_state['position'], 120.0)

if __name__ == '__main__':
    unittest.main()
