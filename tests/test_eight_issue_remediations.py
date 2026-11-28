import os
import re
import unittest

class TestEightIssueRemediations(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        cls.base_dir = base_dir

        with open(os.path.join(base_dir, 'js', 'dom.js'), 'r', encoding='utf-8') as f:
            cls.dom_content = f.read()

        with open(os.path.join(base_dir, 'js', 'lyrics.js'), 'r', encoding='utf-8') as f:
            cls.lyrics_content = f.read()

        with open(os.path.join(base_dir, 'js', 'main.js'), 'r', encoding='utf-8') as f:
            cls.main_content = f.read()

        with open(os.path.join(base_dir, 'js', 'playback.js'), 'r', encoding='utf-8') as f:
            cls.playback_content = f.read()

        with open(os.path.join(base_dir, 'js', 'mediaSession.js'), 'r', encoding='utf-8') as f:
            cls.ms_content = f.read()

        with open(os.path.join(base_dir, 'js', 'state.js'), 'r', encoding='utf-8') as f:
            cls.state_content = f.read()

        with open(os.path.join(base_dir, 'sw.js'), 'r', encoding='utf-8') as f:
            cls.sw_content = f.read()

        with open(os.path.join(base_dir, 'manifest.json'), 'r', encoding='utf-8') as f:
            cls.manifest_content = f.read()

        with open(os.path.join(base_dir, 'test.html'), 'r', encoding='utf-8') as f:
            cls.test_html_content = f.read()

        with open(__file__, 'r', encoding='utf-8') as f:
            cls.test_file_content = f.read()

    def test_strictly_zero_emojis(self):
        """Verify strictly zero emojis in all modified and checked files."""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        files = {
            'dom.js': self.dom_content,
            'lyrics.js': self.lyrics_content,
            'main.js': self.main_content,
            'playback.js': self.playback_content,
            'mediaSession.js': self.ms_content,
            'state.js': self.state_content,
            'sw.js': self.sw_content,
            'manifest.json': self.manifest_content,
            'test.html': self.test_html_content,
            'test_eight_issue_remediations.py': self.test_file_content
        }
        for name, content in files.items():
            matches = emoji_pattern.findall(content)
            self.assertEqual(len(matches), 0, f"Found emojis in {name}: {matches}")

    def test_issue1_ios_stream_id_and_safe_play_hoisted(self):
        """dom.js switchTrack hoists activeStreamId and safePlay above MSE check, guards _resetMSE, and clears _pendingSeek on direct audio."""
        self.assertRegex(
            self.dom_content,
            r'this\._streamId\s*=\s*\(this\._streamId\s*\|\|\s*0\)\s*\+\s*1;\s*\n\s*const\s+activeStreamId\s*=\s*this\._streamId;'
        )
        self.assertRegex(
            self.dom_content,
            r'const\s+isMseSupported\s*=\s*\([\'"]MediaSource[\'"]\s+in\s+window\s*&&\s*MediaSource\.isTypeSupported\([\'"]audio/webm;\s*codecs="opus"[\'"]\)\);'
        )
        self.assertIn("if (isMseSupported && !isOpusDirect) {", self.dom_content)

        # In direct audio else block, safePlay and activeStreamId are invoked
        direct_else = re.search(r'\}\s*else\s*\{[\s\S]*?this\._isDirectAudio\s*=\s*true;([\s\S]*?)\n\s{8}\}', self.dom_content)
        self.assertIsNotNone(direct_else, "Direct audio fallback block not found")
        direct_body = direct_else.group(1)
        self.assertIn("this._streamId === activeStreamId", direct_body)
        self.assertIn("safePlay();", direct_body)
        self.assertIn("this.switching = false;", direct_body)
        self.assertIn("this._pendingSeek = null;", direct_body)
        self.assertIn("loadedmetadata", direct_body)
        self.assertIn("canplay", direct_body)

    def test_issue2_kick_lrc_wrong_filter_and_cache_bust(self):
        """lyrics.js bumps cache to v=155 and rejects mismatched Relient K lyrics for Kick track."""
        self.assertIn("lyricsUrl}?v=155", self.lyrics_content)
        self.assertIn("_zh2LgJRXu4", self.lyrics_content)
        self.assertIn("Relient K", self.lyrics_content)
        self.assertIn("Kick-Off", self.lyrics_content)

    def test_issue3_swipe_threshold_increase_and_floor(self):
        """main.js and test.html increase thresholdRatio to 0.20 and enforce minimum 64px floor."""
        self.assertIn("thresholdRatio = 0.20;", self.main_content)
        self.assertIn("Math.max(64, activeLi.offsetWidth * thresholdRatio)", self.main_content)
        self.assertIn("Math.max(64, targetLi.offsetWidth * thresholdRatio)", self.main_content)
        self.assertIn("Math.abs(dx) >= thresholdPx", self.main_content)
        self.assertIn("thresholdRatio = 0.20;", self.test_html_content)
        self.assertIn("Math.max(64, surface.offsetWidth * thresholdRatio)", self.test_html_content)

    def test_issue4_pwa_png_icons_and_watchdog_safeguard(self):
        """manifest.json defines PNG icons, assets exist on disk, sw.js caches them, and watchdog is protected."""
        self.assertIn("assets/icon-192.png", self.manifest_content)
        self.assertIn("assets/icon-512.png", self.manifest_content)
        self.assertIn("image/png", self.manifest_content)

        icon192_path = os.path.join(self.base_dir, 'assets', 'icon-192.png')
        icon512_path = os.path.join(self.base_dir, 'assets', 'icon-512.png')
        self.assertTrue(os.path.isfile(icon192_path), "icon-192.png missing from assets")
        self.assertTrue(os.path.isfile(icon512_path), "icon-512.png missing from assets")

        self.assertIn("'./assets/icon-192.png'", self.sw_content)
        self.assertIn("'./assets/icon-512.png'", self.sw_content)

        # Watchdog safeguard against arming while actively playing
        self.assertRegex(
            self.ms_content,
            r'function\s+armAutoKillWatchdog\s*\(\s*\)\s*\{[\s\S]*?if\s*\(\s*typeof\s+audioPlayer\s*!==\s*[\'"]undefined[\'"]\s*&&\s*audioPlayer\s*&&\s*!audioPlayer\.paused\s*\)\s*\{\s*return;\s*\}'
        )

    def test_issue5_always_default_to_mode1_on_startup(self):
        """state.js defaults to mode1 without restoring mode2, and main.js toggles mode1 on init."""
        self.assertIn("window.playbackMode = 'mode1';", self.state_content)
        self.assertIn("var _playbackModeVal = 'mode1';", self.state_content)
        self.assertNotIn("getStoredSetting('yt_playback_mode'", self.state_content)

        self.assertRegex(
            self.main_content,
            r'if\s*\(\s*typeof\s+togglePlaybackMode\s*===\s*[\'"]function[\'"]\s*\)\s*\{\s*togglePlaybackMode\([\'"]mode1[\'"]\);\s*\}'
        )

    def test_issue6_bluetooth_resume_and_queue_fallback(self):
        """mediaSession.js clears lastBtDisconnectTime and wasPausedByUser on device reconnect, and pause handler includes queue fallback."""
        self.assertRegex(
            self.ms_content,
            r'else\s+if\s*\(\s*newCount\s*>\s*knownOutputCount\s*\)\s*\{[\s\S]*?window\.lastBtDisconnectTime\s*=\s*0;[\s\S]*?window\.wasPausedByUser\s*=\s*false;'
        )

        # Pause action handler in Mode 2 has queue fallback
        pause_match = re.search(
            r'navigator\.mediaSession\.setActionHandler\(\s*[\'"]pause[\'"]\s*,\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s{8}\}\);',
            self.ms_content
        )
        self.assertIsNotNone(pause_match, "Pause action handler not found")
        pause_body = pause_match.group(1)
        self.assertIn("if (!audioPlayer.src)", pause_body)
        self.assertIn("executePlayback(false);", pause_body)

    def test_issue7_seek_bar_instant_touch_transfer(self):
        """main.js pointerdown immediately updates currentTime and transfers playback without waiting for pointerup."""
        self.assertRegex(
            self.main_content,
            r'seekBar\.addEventListener\(\s*[\'"]pointerdown[\'"][\s\S]*?audioPlayer\.currentTime\s*=\s*calcTime;[\s\S]*?updateTimeUI\(calcTime\);[\s\S]*?audioPlayer\.play\(\)'
        )

    def test_issue8_double_swipe_de_perform(self):
        """Double swipe removes from playQueue without unqueue toast; download de-confirmation cancels in-flight or does nothing if already cached."""
        # Right swipe unqueue logic in queuePlayNext
        self.assertIn("return { unqueued: true };", self.playback_content)
        self.assertIn("return { unqueued: false };", self.playback_content)
        self.assertIn("window.enqueuedTrackKeys", self.playback_content)
        self.assertIn("window.enqueuedTrackKeys = new Set();", self.state_content)

        # Right swipe unqueue handling in main.js: no unqueue toast
        self.assertNotIn("showEphemeralToast(\"Unqueued\", false);", self.main_content)
        self.assertIn("targetLi.classList.remove('enqueued-flash');", self.main_content)

        # Left swipe de-confirmation in downloadSingleTrack: abort in-flight or no-op if done
        self.assertIn("window.activeDownloadAbortControllers", self.playback_content)
        self.assertIn("existingCtrl.abort();", self.playback_content)
        self.assertIn("return { cancelled: true };", self.playback_content)
        self.assertIn("return { alreadyDownloaded: true };", self.playback_content)

    def test_queue_play_next_double_swipe_simulation(self):
        """Simulate single playlist queuePlayNext to verify 1st swipe enqueues and 2nd swipe unqueues."""
        # Setup simulated state
        playQueue = [0, 1, 2, 3, 4]
        queueIndex = 0
        curPl = "Favorites"
        enqueuedKeys = set()

        def queuePlayNext(playlist, originalIndex):
            nonlocal queueIndex
            key = f"{playlist}:{originalIndex}"
            insertPos = queueIndex + 1 if queueIndex >= 0 else 0
            isMatch = lambda item: item == originalIndex if isinstance(item, int) else (item.get("playlist") == playlist and item.get("index") == originalIndex)

            existingIdx = -1
            for idx, item in enumerate(playQueue):
                if isMatch(item):
                    existingIdx = idx
                    break

            isEnqueued = key in enqueuedKeys or (existingIdx != -1 and existingIdx == insertPos)
            if isEnqueued and existingIdx != -1:
                playQueue.pop(existingIdx)
                if existingIdx <= queueIndex:
                    queueIndex -= 1
                enqueuedKeys.discard(key)
                return {"unqueued": True}

            if existingIdx != -1:
                playQueue.pop(existingIdx)
                if existingIdx <= queueIndex:
                    queueIndex -= 1

            targetPos = queueIndex + 1 if queueIndex >= 0 else 0
            playQueue.insert(targetPos, originalIndex)
            enqueuedKeys.add(key)
            return {"unqueued": False}

        # 1st swipe on track 3: moves track 3 to index 1 (next track)
        res1 = queuePlayNext(curPl, 3)
        self.assertFalse(res1["unqueued"], "First swipe must enqueue the track")
        self.assertEqual(playQueue[1], 3, "Track 3 must be queued next at index 1")
        self.assertIn(f"{curPl}:3", enqueuedKeys)

        # 2nd swipe on track 3: unqueues track 3
        res2 = queuePlayNext(curPl, 3)
        self.assertTrue(res2["unqueued"], "Second swipe must unqueue the track")
        self.assertNotIn(3, playQueue[:2], "Track 3 must be removed from next position")
        self.assertNotIn(f"{curPl}:3", enqueuedKeys)

        # 3rd swipe on track 3: enqueues track 3 again
        res3 = queuePlayNext(curPl, 3)
        self.assertFalse(res3["unqueued"], "Subsequent swipe must enqueue again")
        self.assertEqual(playQueue[1], 3)

if __name__ == '__main__':
    unittest.main()
