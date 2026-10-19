import os
import re
import unittest

class TestDownloadEngine(unittest.TestCase):
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

        utils_path = os.path.join(base_dir, 'js', 'utils.js')
        with open(utils_path, 'r', encoding='utf-8') as f:
            cls.utils_content = f.read()

        css_path = os.path.join(base_dir, 'css', 'style.css')
        with open(css_path, 'r', encoding='utf-8') as f:
            cls.css_content = f.read()

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
        self.assertEqual(emoji_pattern.findall(self.css_content), [], "Found emojis in style.css")
        self.assertEqual(emoji_pattern.findall(self.test_content), [], "Found emojis in test_download_engine.py")

    def test_download_uses_bypass_query(self):
        """downloadActivePlaylist appends bypass=true to audio requests to prevent service worker double buffering"""
        self.assertRegex(
            self.playback_content,
            r'bypass=true'
        )

    def test_thumbs_cache_name_normalized(self):
        """downloadActivePlaylist opens yt-player-thumbs matching sw.js"""
        self.assertIn("caches.open('yt-player-thumbs')", self.playback_content)
        self.assertNotIn("caches.open('yt-thumbs-cache')", self.playback_content)

    def test_download_retry_mechanism(self):
        """downloadActivePlaylist implements exponential backoff retry for network resiliency"""
        self.assertRegex(
            self.playback_content,
            r'fetchWithRetry|retry|attempt'
        )

    def test_download_toast_zero_gpu_styles(self):
        """.download-toast has zero backdrop-filter and uses contain: layout paint"""
        toast_rules = re.findall(r'\.download-toast\s*\{([^}]*)\}', self.css_content)
        self.assertTrue(len(toast_rules) > 0, "No .download-toast rule found")
        for rule in toast_rules:
            self.assertNotIn('backdrop-filter', rule)
            self.assertNotIn('-webkit-backdrop-filter', rule)

        # Check mobile media query block
        self.assertRegex(self.css_content, r'\.download-toast\s*\{[^}]*contain:\s*layout\s+paint;')
        self.assertRegex(self.css_content, r'\.download-toast\s*\{[^}]*background:\s*#141418;')

    def test_thumbs_download_unconditional(self):
        """downloadActivePlaylist unconditionally downloads thumbnails without thumbsDisabled gating"""
        d_match = re.search(r'async function downloadActivePlaylist\s*\(\)\s*\{([\s\S]*)', self.playback_content)
        self.assertIsNotNone(d_match, "Could not find downloadActivePlaylist")
        d_body = d_match.group(1)
        self.assertNotIn('!thumbsDisabled && thumbUrl', d_body)
        self.assertIn('thumbsCache.put(thumbUrl', d_body)

    def test_recovery_pass_retries_all_assets(self):
        """Recovery loop in downloadActivePlaylist retries audio, thumbnail, and lyrics"""
        d_match = re.search(r'async function downloadActivePlaylist\s*\(\)\s*\{([\s\S]*)', self.playback_content)
        self.assertIsNotNone(d_match, "Could not find downloadActivePlaylist")
        d_body = d_match.group(1)
        self.assertRegex(d_body, r'missingTracks[\s\S]*?mediaCache\.put\(audioUrl[\s\S]*?thumbsCache\.put\(thumbUrl[\s\S]*?mediaCache\.put\(lyricsUrl')

    def test_get_cached_square_artwork_defined(self):
        """getCachedSquareArtwork exists in utils.js, inspects yt-player-thumbs, and contains no network fetch or new Image"""
        self.assertRegex(self.utils_content, r'async\s+function\s+getCachedSquareArtwork\s*\(')
        self.assertIn("caches.open('yt-player-thumbs')", self.utils_content)
        fn_match = re.search(r'async\s+function\s+getCachedSquareArtwork\s*\([\s\S]*?\n\s*\}', self.utils_content)
        self.assertIsNotNone(fn_match, "Could not find getCachedSquareArtwork function body")
        fn_body = fn_match.group(0)
        self.assertNotIn('fetch(', fn_body)
        self.assertNotIn('new Image', fn_body)

    def test_playback_uses_get_cached_square_artwork_when_thumbs_disabled(self):
        """playTrack checks yt-player-thumbs cache for direct zero-network square artwork when thumbsDisabled is true"""
        self.assertRegex(
            self.playback_content,
            r'thumbsDisabled[\s\S]*?getCachedSquareArtwork\(\s*track\.id\s*,\s*thumbUrl'
        )
        self.assertRegex(
            self.playback_content,
            r'getSquareArtwork\(\s*thumbUrl\s*,\s*track\.id'
        )

    def test_fast_path_cache_duration_incomplete_guard(self):
        """Fast-path verifies demuxed duration against expected duration and treats incomplete files as partial without misclassifying complete tracks"""
        self.assertIn("buffEnd < (this._expectedDuration - 15)", self.dom_content)
        self.assertRegex(
            self.dom_content,
            r'const\s+isDurationIncomplete\s*=\s*!isExplicitlyComplete\s*&&\s*this\._expectedDuration\s*>\s*0\s*&&\s*buffEnd\s*<\s*\(this\._expectedDuration\s*-\s*15\);'
        )
        self.assertIn("if (isExplicitlyPartial || isDurationIncomplete || isSizeIncomplete || isLengthIncomplete)", self.dom_content)

    def test_fast_path_cache_size_incomplete_guard(self):
        """Fast-path verifies cached bytes against minimum expected audio bitrate"""
        self.assertIn("cachedPartialBytes < (this._expectedDuration * 4000)", self.dom_content)

    def test_fast_path_cache_header_self_healing(self):
        """Fast-path self-heals CacheStorage with X-Partial-Cached: true when truncated audio is detected"""
        self.assertRegex(
            self.dom_content,
            r'cachedRes\.headers\.get\([\'"]X-Partial-Cached[\'"]\)\s*!==\s*[\'"]true[\'"][\s\S]*?\'X-Partial-Cached\':\s*\'true\''
        )

    def test_read_stream_completion_verification(self):
        """readStream verifies full song duration and Content-Length before marking stream done"""
        self.assertIn("isDurationComplete = this._expectedDuration <= 0 || demuxedBuffEnd >= (this._expectedDuration - 15)", self.dom_content)
        self.assertIn("totalBytesAppended < totalExpected", self.dom_content)
        self.assertRegex(
            self.dom_content,
            r'if\s*\(\s*isPremature\s*\)\s*\{[\s\S]*?await\s+saveProgress\(false\);[\s\S]*?attemptRecovery\(\);'
        )

    def test_waiting_event_mid_song_stall_recovery(self):
        """DualAudioPingPong waiting event resets streamDone and triggers recovery when stalled mid-song"""
        self.assertRegex(
            self.dom_content,
            r'if\s*\(\s*e\.type\s*===\s*[\'"]waiting[\'"]\s*\)\s*\{[\s\S]*?if\s*\(\s*dur\s*>\s*0\s*&&\s*ct\s*<\s*dur\s*-\s*1\.5\s*\)\s*\{[\s\S]*?if\s*\(\s*!this\._streamDone\s*\)\s*\{[\s\S]*?this\._triggerBufferRecovery\(\)'
        )

    def test_waiting_event_underrun_guard(self):
        """DualAudioPingPong waiting event checks buffer underrun before setting isBufferStalled or triggering recovery"""
        self.assertRegex(
            self.dom_content,
            r'const\s+isUnderrun\s*=\s*\(currentRangeEnd\s*<=\s*ct\s*\+\s*0\.5\);'
        )
        self.assertRegex(
            self.dom_content,
            r'if\s*\(\s*!this\.active\.paused\s*&&\s*isUnderrun\s*\)\s*\{[\s\S]*?this\._isBufferStalled\s*=\s*true;'
        )
        self.assertRegex(
            self.dom_content,
            r'if\s*\(\s*!this\._streamDone\s*\)\s*\{[\s\S]*?if\s*\(\s*isUnderrun\s*\)\s*\{[\s\S]*?this\._triggerBufferRecovery\(\)'
        )

    def test_attempt_recovery_cancels_active_reader(self):
        """attemptRecovery cancels existing active reader to prevent concurrent stream collisions"""
        self.assertRegex(
            self.dom_content,
            r'if\s*\(\s*currentActiveReader\s*\)\s*\{[\s\S]*?currentActiveReader\.cancel\(\);[\s\S]*?currentActiveReader\s*=\s*null;'
        )

    def test_premature_buffer_end_recovery_guard(self):
        """timeupdate event suppresses premature ended firing and triggers recovery if effectiveEnd is short and stream not done"""
        self.assertRegex(
            self.dom_content,
            r'if\s*\(\s*!this\._streamDone\s*&&\s*this\._expectedDuration\s*>\s*0\s*&&\s*effectiveEnd\s*<\s*this\._expectedDuration\s*-\s*3\.5\s*\)\s*\{[\s\S]*?this\._isBufferStalled\s*=\s*true;[\s\S]*?this\._triggerBufferRecovery\(\)'
        )

    def test_premature_ended_event_recovery_guard(self):
        """ended event listener suppresses premature ended and triggers recovery when currentTime is short and stream not done"""
        self.assertRegex(
            self.dom_content,
            r'if\s*\(\s*e\.type\s*===\s*[\'"]ended[\'"]\s*\)\s*\{[\s\S]*?if\s*\(\s*!this\._streamDone\s*&&\s*this\._expectedDuration\s*>\s*0\s*&&\s*this\.active\.currentTime\s*<\s*this\._expectedDuration\s*-\s*3\.5\s*\)\s*\{[\s\S]*?this\._isBufferStalled\s*=\s*true;'
        )

    def test_attempt_recovery_416_handling(self):
        """attemptRecovery explicitly handles HTTP 416 Range Not Satisfiable by concluding stream without wiping buffer"""
        self.assertIn("if (resumeRes.status === 416)", self.dom_content)
        self.assertNotIn("mediaCache.delete(url);", self.dom_content)

    def test_preload_next_track_buffers_array_buffer(self):
        """preloadNextTrack buffers entire arrayBuffer before writing to cache with X-Partial-Cached: false"""
        self.assertRegex(
            self.playback_content,
            r'const\s+buf\s*=\s*await\s+response\.arrayBuffer\(\);[\s\S]*?\'X-Partial-Cached\':\s*\'false\'[\s\S]*?cache\.put\(audioUrl,\s*fullRes\)'
        )

    def test_sw_audio_buffers_array_buffer(self):
        """sw.js audio media handler buffers arrayBuffer before caching with X-Partial-Cached: false"""
        self.assertRegex(
            self.sw_content,
            r'cloned\.arrayBuffer\(\)\.then\(\s*buf\s*=>\s*\{[\s\S]*?\'X-Partial-Cached\':\s*\'false\'[\s\S]*?cache\.put\(cacheKeyUrl\.href,\s*fullRes\)'
        )

if __name__ == '__main__':
    unittest.main()
