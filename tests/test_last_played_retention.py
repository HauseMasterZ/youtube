import os
import re
import unittest

class TestLastPlayedRetention(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        js_dir = os.path.join(base_dir, 'js')
        
        with open(os.path.join(js_dir, 'playback.js'), 'r', encoding='utf-8') as f:
            cls.playback_content = f.read()
        with open(os.path.join(js_dir, 'utils.js'), 'r', encoding='utf-8') as f:
            cls.utils_content = f.read()
        with open(os.path.join(js_dir, 'dom.js'), 'r', encoding='utf-8') as f:
            cls.dom_content = f.read()
        with open(os.path.join(js_dir, 'main.js'), 'r', encoding='utf-8') as f:
            cls.main_content = f.read()
        with open(__file__, 'r', encoding='utf-8') as f:
            cls.test_content = f.read()

    def test_no_emojis_in_source_and_test(self):
        """Strictly zero emojis anywhere in modified js files and this test file"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        for name, content in [
            ('playback.js', self.playback_content),
            ('utils.js', self.utils_content),
            ('dom.js', self.dom_content),
            ('main.js', self.main_content),
            ('test_last_played_retention.py', self.test_content)
        ]:
            matches = emoji_pattern.findall(content)
            self.assertEqual(matches, [], f"Found emojis in {name}: {matches}")

    def test_save_last_played_state_defined_and_exposed(self):
        """saveLastPlayedState is defined with near-end clamping, dual storage, and exposed on window"""
        self.assertIn('function saveLastPlayedState(forcedPosition = null)', self.playback_content)
        self.assertIn('window.saveLastPlayedState = saveLastPlayedState;', self.playback_content)
        self.assertIn("localStorage.setItem('yt_last_played'", self.playback_content)
        self.assertIn("saveLastPlayedToIDB(payload)", self.playback_content)
        self.assertIn("window._stagedLastPlayedTrack = payload;", self.playback_content)
        # Verify near-end clamp to zero
        self.assertRegex(
            self.playback_content,
            r'if\s*\(\s*totalDur\s*>\s*0\s*&&\s*pos\s*>=\s*totalDur\s*-\s*1\.5\s*\)\s*\{\s*pos\s*=\s*0;'
        )

    def test_load_last_played_state_defined_and_exposed(self):
        """loadLastPlayedState parses localStorage and validates payload structure"""
        self.assertIn('function loadLastPlayedState()', self.playback_content)
        self.assertIn('window.loadLastPlayedState = loadLastPlayedState;', self.playback_content)
        self.assertIn("localStorage.getItem('yt_last_played')", self.playback_content)
        self.assertIn('parsed.trackId && parsed.trackSnapshot && parsed.playlist', self.playback_content)

    def test_restore_last_played_track_defined_and_exposed(self):
        """restoreLastPlayedTrack sets up staged variables and calls executePlayback with uiOnly and resumePos"""
        self.assertIn('function restoreLastPlayedTrack(lastPlayed)', self.playback_content)
        self.assertIn('window.restoreLastPlayedTrack = restoreLastPlayedTrack;', self.playback_content)
        self.assertIn('window._stagedLastPlayedTrack = lastPlayed;', self.playback_content)
        self.assertIn('window.wasPausedByUser = true;', self.playback_content)
        self.assertIn('executePlayback(true, false, false, resumePos);', self.playback_content)

    def test_idb_retention_helpers_in_utils(self):
        """utils.js defines saveLastPlayedToIDB and getLastPlayedFromIDB and exports to window"""
        self.assertIn('async function saveLastPlayedToIDB(payload)', self.utils_content)
        self.assertIn('async function getLastPlayedFromIDB()', self.utils_content)
        self.assertIn('window.saveLastPlayedToIDB = saveLastPlayedToIDB;', self.utils_content)
        self.assertIn('window.getLastPlayedFromIDB = getLastPlayedFromIDB;', self.utils_content)
        self.assertIn("'__last_played__'", self.utils_content)

    def test_execute_playback_accepts_resume_position_and_staged_fallback(self):
        """executePlayback accepts resumePosition, falls back to _stagedLastPlayedTrack snapshot, and stages UI"""
        self.assertRegex(
            self.playback_content,
            r'function\s+executePlayback\(\s*preventAutoplay\s*=\s*false,\s*isHistoryNav\s*=\s*false,\s*forceScroll\s*=\s*false,\s*resumePosition\s*=\s*null\s*\)'
        )
        self.assertIn('window._stagedLastPlayedTrack && window._stagedLastPlayedTrack.trackSnapshot', self.playback_content)
        self.assertIn('track = window._stagedLastPlayedTrack.trackSnapshot;', self.playback_content)
        self.assertIn('seekBar.value = initialPosition;', self.playback_content)
        self.assertIn('updateTimeUI(initialPosition);', self.playback_content)
        self.assertIn('position: initialPosition', self.playback_content)
        self.assertIn('audioPlayer.switchTrack(audioUrl, preventAutoplay || uiOnly, parsedDuration, resumePosition);', self.playback_content)
        self.assertIn('saveLastPlayedState(0);', self.playback_content)

    def test_apply_playlist_data_reconciles_staged_track(self):
        """applyPlaylistData reconciles staged track by ID and reconstructs playQueue"""
        self.assertIn('window._stagedLastPlayedTrack && window._stagedLastPlayedTrack.trackId', self.playback_content)
        self.assertIn('normalizedData.findIndex(t => t.id === targetTrackId)', self.playback_content)
        self.assertIn('globalActiveOriginalIndex = newIndex;', self.playback_content)
        self.assertIn('playQueue = Array.from({length: normalizedData.length}, (_, i) => i);', self.playback_content)

    def test_dom_switch_track_prevent_autoplay_invariants(self):
        """DualAudioPingPong enforces _preventAutoplay to suppress play and playing event emissions during pre-staging"""
        self.assertIn('this._preventAutoplay = false;', self.dom_content)
        self.assertIn('if (this._preventAutoplay && (e.type === \'play\' || e.type === \'playing\'))', self.dom_content)
        self.assertIn('this._preventAutoplay = !!preventAutoplay;', self.dom_content)
        self.assertIn('if (this._pendingSeek === null && !this._preventAutoplay)', self.dom_content)
        self.assertIn('if (!this._preventAutoplay && !window.wasPausedByUser && this._streamId === activeStreamId)', self.dom_content)
        # Check paused getter honors wasPausedByUser
        self.assertRegex(
            self.dom_content,
            r'get\s+paused\(\)\s*\{\s*if\s*\(\s*window\.wasPausedByUser\s*\)\s*return\s+true;'
        )

    def test_main_startup_synchronous_last_played_restore(self):
        """main.js synchronously reads loadLastPlayedState and restores track before loadPlaylist"""
        self.assertIn('const lastPlayed = (typeof loadLastPlayedState === \'function\') ? loadLastPlayedState() : null;', self.main_content)
        self.assertIn('restoreLastPlayedTrack(lastPlayed);', self.main_content)
        self.assertIn('loadPlaylist(initialPl);', self.main_content)
        # Ensure restoreLastPlayedTrack appears before loadPlaylist in startup sequence
        restore_idx = self.main_content.find('restoreLastPlayedTrack(lastPlayed);')
        load_idx = self.main_content.find('loadPlaylist(initialPl);')
        self.assertNotEqual(restore_idx, -1)
        self.assertNotEqual(load_idx, -1)
        self.assertLess(restore_idx, load_idx, "restoreLastPlayedTrack must execute before loadPlaylist")

    def test_main_save_triggers(self):
        """saveLastPlayedState is triggered on timeupdate (throttled), pause, endSeek, shuffle, repeat, and page lifecycle"""
        self.assertIn('btnShuffle.addEventListener("click"', self.main_content)
        self.assertIn('btnRepeat.addEventListener("click"', self.main_content)
        # Throttled save in timeupdate
        self.assertRegex(
            self.main_content,
            r'if\s*\(\s*!audioPlayer\.paused\s*&&\s*typeof\s+saveLastPlayedState\s*===\s*[\'"]function[\'"]\s*\)\s*\{\s*const\s+now\s*=\s*Date\.now\(\);[\s\S]*?now\s*-\s*lastSaveStateTime\s*>\s*2000[\s\S]*?saveLastPlayedState\(\);'
        )
        # Immediate save on seek
        self.assertRegex(
            self.main_content,
            r'const\s+endSeek\s*=\s*\(e\)\s*=>\s*\{[\s\S]*?saveLastPlayedState\(\s*targetTime\s*\);'
        )
        # Lifecycle flushes
        self.assertIn('window.addEventListener("pagehide", flushLastPlayedState);', self.main_content)
        self.assertIn('window.addEventListener("beforeunload", flushLastPlayedState);', self.main_content)
        self.assertIn('document.addEventListener("freeze", flushLastPlayedState);', self.main_content)

    def test_offline_reconciliation_on_chunked_load_completion(self):
        """applyNormalizedDataInChunks reconciles staged track by ID against full database on completion"""
        self.assertIn('const newIndex = normalizedAccum.findIndex(t => t.id === targetTrackId);', self.playback_content)
        self.assertIn('if (newIndex !== -1) {', self.playback_content)
        self.assertIn('globalActiveOriginalIndex = newIndex;', self.playback_content)

    def test_generate_queue_bounds_safe_with_staged_track_fallback(self):
        """generateQueue safely bounds-checks playQueue and falls back to staged track ID or globalActiveOriginalIndex"""
        self.assertIn('if (playQueue && queueIndex >= 0 && queueIndex < playQueue.length)', self.playback_content)
        self.assertIn('window._stagedLastPlayedTrack.trackId && Array.isArray(data)', self.playback_content)
        self.assertIn('data.findIndex(t => t.id === window._stagedLastPlayedTrack.trackId)', self.playback_content)

    def test_load_playlist_cache_offline_guarantees(self):
        """loadPlaylist handles staged track queue generation, alreadyRendered checks, and offline empty state"""
        self.assertIn('const alreadyRendered = hasRendered || (currentPlaylistData && currentPlaylistData.length > 0 && playlistSelect && playlistSelect.value === folderName);', self.playback_content)
        self.assertIn('if (cachedData && !alreadyRendered)', self.playback_content)
        self.assertIn('else if (globalActivePlaylist === folderName)', self.playback_content)

    def test_utils_idb_sync_and_dom_offline_retry_guard(self):
        """utils.js mirrors IDB to DB_CACHE and dom.js caps audio fetch retries when offline"""
        self.assertIn('caches.open(DB_CACHE_NAME).then(dbCache => {', self.utils_content)
        self.assertIn('fetchAttempts >= 3 && typeof navigator !== \'undefined\' && navigator.onLine === false', self.dom_content)

if __name__ == '__main__':
    unittest.main()
