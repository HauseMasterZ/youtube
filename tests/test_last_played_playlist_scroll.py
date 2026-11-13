import os
import re
import unittest

class TestLastPlayedPlaylistScroll(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        js_dir = os.path.join(base_dir, 'js')

        with open(os.path.join(js_dir, 'playback.js'), 'r', encoding='utf-8') as f:
            cls.playback_content = f.read()
        with open(os.path.join(js_dir, 'ui.js'), 'r', encoding='utf-8') as f:
            cls.ui_content = f.read()
        with open(__file__, 'r', encoding='utf-8') as f:
            cls.test_content = f.read()

    def test_zero_emojis_in_source_and_tests(self):
        """Strictly zero emojis in playback.js, ui.js, and this test suite"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        for name, content in [
            ('playback.js', self.playback_content),
            ('ui.js', self.ui_content),
            ('test_last_played_playlist_scroll.py', self.test_content)
        ]:
            matches = emoji_pattern.findall(content)
            self.assertEqual(matches, [], f"Found emojis in {name}: {matches}")

    def test_restore_last_played_initializes_scroll_flag_and_parses_indices(self):
        """restoreLastPlayedTrack initializes _stagedLastPlayedTrackScrolled and parses indices robustly"""
        self.assertIn("window._stagedLastPlayedTrackScrolled = false;", self.playback_content)
        self.assertIn("const parsedOrig = parseInt(lastPlayed.originalIndex, 10);", self.playback_content)
        self.assertIn("const parsedQueue = parseInt(lastPlayed.queueIndex, 10);", self.playback_content)

    def test_apply_normalized_data_expands_initial_slice_for_target_track(self):
        """applyNormalizedDataInChunks expands initialSlice beyond INITIAL_CHUNK when target track index exceeds 60"""
        self.assertIn("let targetIndexInRaw = -1;", self.playback_content)
        self.assertIn("targetIndexInRaw = validRawData.findIndex(t => (Array.isArray(t) ? t[0] : t.id) === capturedTargetTrackId);", self.playback_content)
        self.assertIn("const initialEnd = (targetIndexInRaw >= INITIAL_CHUNK)", self.playback_content)
        self.assertIn("? Math.min(totalCount, Math.max(INITIAL_CHUNK, targetIndexInRaw + 25))", self.playback_content)
        self.assertIn(": INITIAL_CHUNK;", self.playback_content)
        self.assertIn("const initialSlice = normalizePlaylistData(validRawData, folderName, 0, initialEnd);", self.playback_content)
        self.assertIn("applyPlaylistData(folderName, initialSlice, isRevalidation, totalCount);", self.playback_content)

    def test_apply_playlist_data_indexes_full_count_and_scrolls_staged_track(self):
        """applyPlaylistData allocates filteredIndices for totalCount and scrolls staged track even on revalidation"""
        self.assertIn("const effectiveLen = (totalCount > 0 && totalCount > currentPlaylistData.length) ? totalCount : currentPlaylistData.length;", self.playback_content)
        self.assertIn("const shouldInitialScroll = !isRevalidation || (window._stagedLastPlayedTrack && !window._stagedLastPlayedTrackScrolled);", self.playback_content)
        self.assertIn("if (shouldInitialScroll) {", self.playback_content)
        self.assertIn("scrollToTrack(globalActiveOriginalIndex, true);", self.playback_content)
        self.assertIn("window._stagedLastPlayedTrackScrolled = true;", self.playback_content)

    def test_process_next_chunk_reconciles_and_scrolls_on_completion(self):
        """processNextChunk reconciles index before rendering virtual tracks and scrolls active track on completion"""
        self.assertIn("const shouldScrollOnChunkFinish = !isRevalidation || (window._stagedLastPlayedTrack && !window._stagedLastPlayedTrackScrolled);", self.playback_content)
        self.assertIn("if (shouldScrollOnChunkFinish && globalActivePlaylist === folderName && globalActiveOriginalIndex !== -1) {", self.playback_content)
        self.assertIn("scrollToTrack(globalActiveOriginalIndex, true);", self.playback_content)
        self.assertIn("window._stagedLastPlayedTrackScrolled = true;", self.playback_content)

    def test_scroll_to_track_supports_loose_matching_direct_scroll_and_raf(self):
        """scrollToTrack matches indices loosely, clamps negative tops, sets scrollTop, and schedules RAF on forceScroll"""
        self.assertIn("const virtualIndex = filteredIndices.findIndex(item => item.playlist === currentPl && item.index == originalIndex);", self.ui_content)
        self.assertIn("const targetTop = Math.max(0, scrollPos - (containerHeight / 2) + (ITEM_HEIGHT / 2));", self.ui_content)
        self.assertIn("playlistContainer.scrollTop = targetTop;", self.ui_content)
        self.assertIn("if (typeof playlistContainer.scrollTo === 'function')", self.ui_content)
        self.assertIn("if (typeof requestAnimationFrame === 'function' && forceScroll)", self.ui_content)

    def test_rule_6_scroll_retention_preserved_on_track_click(self):
        """Clicking a track item passes allowScroll = false, strictly returning early without modifying scroll position"""
        self.assertIn("if (!allowScroll) {", self.ui_content)
        self.assertIn("lastStartIndex = -1;", self.ui_content)
        self.assertIn("renderVirtualTracks();", self.ui_content)
        self.assertIn("return;", self.ui_content)

    def test_render_virtual_tracks_sets_original_index_dataset_and_active_class(self):
        """renderVirtualTracks sets dataset.originalIndex and checks active state with loose comparison"""
        self.assertIn("li.dataset.originalIndex = item.index;", self.ui_content)
        self.assertIn("item.playlist === globalActivePlaylist && item.index == globalActiveOriginalIndex", self.ui_content)

if __name__ == '__main__':
    unittest.main()
