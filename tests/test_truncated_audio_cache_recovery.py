import os
import re
import unittest

class TestTruncatedAudioCacheRecovery(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        playback_path = os.path.join(base_dir, 'js', 'playback.js')
        with open(playback_path, 'r', encoding='utf-8') as f:
            cls.playback_content = f.read()

        dom_path = os.path.join(base_dir, 'js', 'dom.js')
        with open(dom_path, 'r', encoding='utf-8') as f:
            cls.dom_content = f.read()

        sw_path = os.path.join(base_dir, 'sw.js')
        with open(sw_path, 'r', encoding='utf-8') as f:
            cls.sw_content = f.read()

        test_path = os.path.abspath(__file__)
        with open(test_path, 'r', encoding='utf-8') as f:
            cls.test_content = f.read()

    def test_no_emojis(self):
        """Strictly zero emojis in test and implementation files"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        self.assertEqual(emoji_pattern.findall(self.playback_content), [], "Found emojis in playback.js")
        self.assertEqual(emoji_pattern.findall(self.dom_content), [], "Found emojis in dom.js")
        self.assertEqual(emoji_pattern.findall(self.sw_content), [], "Found emojis in sw.js")
        self.assertEqual(emoji_pattern.findall(self.test_content), [], "Found emojis in test_truncated_audio_cache_recovery.py")

    def test_is_explicitly_complete_requires_duration_bitrate(self):
        """isExplicitlyComplete requires cached bytes to meet minimum expected audio bitrate"""
        self.assertRegex(
            self.dom_content,
            r'const\s+isExplicitlyComplete\s*=\s*cachedRes\.headers\.get\([\'"]X-Partial-Cached[\'"]\)\s*===\s*[\'"]false[\'"]\s*&&\s*\(this\._expectedDuration\s*<=\s*0\s*\|\|\s*cachedPartialBytes\s*>=\s*\(this\._expectedDuration\s*\*\s*4000\)\);'
        )

    def test_is_explicitly_partial_flags_truncated_cached_audio(self):
        """isExplicitlyPartial flags truncated cache entries when cached bytes fall below expected duration bitrate"""
        self.assertRegex(
            self.dom_content,
            r'const\s+isExplicitlyPartial\s*=\s*cachedRes\.headers\.get\([\'"]X-Partial-Cached[\'"]\)\s*===\s*[\'"]true[\'"]\s*\|\|\s*\(!isExplicitlyComplete\s*&&\s*this\._expectedDuration\s*>\s*0\s*&&\s*cachedPartialBytes\s*<\s*\(this\._expectedDuration\s*\*\s*4000\)\);'
        )

    def test_effective_end_guard_against_premature_buff_end(self):
        """timeupdate effectiveEnd does not clamp to buffEnd if buffEnd is less than expected duration minus 15 seconds"""
        self.assertRegex(
            self.dom_content,
            r'if\s*\(\s*buffEnd\s*>\s*0\s*&&\s*\(dur\s*<=\s*0\s*\|\|\s*buffEnd\s*>=\s*dur\s*-\s*15\)\s*\)\s*\{[\s\S]*?effectiveEnd\s*=\s*Math\.min\(dur,\s*buffEnd\);'
        )

    def test_sw_audio_handler_checks_reported_length(self):
        """sw.js marks partial responses as X-Partial-Cached: true if byteLength does not meet reported length"""
        self.assertRegex(
            self.sw_content,
            r'const\s+reportedLen\s*=\s*cloned\.headers\.get\([\'"]Content-Length[\'"]\)\s*\?\s*parseInt\(cloned\.headers\.get\([\'"]Content-Length[\'"]\),\s*10\)\s*:\s*0;'
        )
        self.assertIn("'X-Partial-Cached': 'true'", self.sw_content)
        self.assertIn("'X-Partial-Cached': 'false'", self.sw_content)

    def test_playback_preload_checks_reported_length(self):
        """playback.js preloadNextTrack marks partial responses as X-Partial-Cached: true if byteLength does not meet reported length"""
        self.assertRegex(
            self.playback_content,
            r'const\s+reportedLen\s*=\s*response\.headers\.get\([\'"]Content-Length[\'"]\)\s*\?\s*parseInt\(response\.headers\.get\([\'"]Content-Length[\'"]\),\s*10\)\s*:\s*0;'
        )
        self.assertIn("'X-Partial-Cached': 'true'", self.playback_content)
        self.assertIn("'X-Partial-Cached': 'false'", self.playback_content)

    def test_range_416_premature_recovery(self):
        """dom.js clears invalid buffer and restarts fresh fetch when HTTP 416 occurs on premature buffer"""
        self.assertRegex(
            self.dom_content,
            r'if\s*\(\s*response\s*&&\s*response\.status\s*===\s*416\s*\)\s*\{[\s\S]*?const\s+isDurationComplete\s*=\s*this\._expectedDuration\s*<=\s*0\s*\|\|\s*demuxedBuffEnd\s*>=\s*\(this\._expectedDuration\s*-\s*15\);'
        )

    def test_range_200_skip_cached_bytes(self):
        """dom.js skips already appended cachedPartialBytes if server ignores Range and returns HTTP 200"""
        self.assertRegex(
            self.dom_content,
            r'if\s*\(\s*response\.status\s*===\s*200\s*&&\s*cachedPartialBytes\s*>\s*0\s*\)\s*\{[\s\S]*?while\s*\(\s*skipped\s*<\s*cachedPartialBytes\s*\)'
        )

if __name__ == '__main__':
    unittest.main()
