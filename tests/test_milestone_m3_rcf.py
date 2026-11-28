import os
import re
import unittest

class TestMilestoneM3RCF(unittest.TestCase):
    """
    Unit tests for Milestone M3 Root Cause Fix (RCF):
    - R1: Mode 2 pause resumption on media card action handlers
    - R2: Mode 2 single-player isolation during external audio focus interrupts
    - R3: Multi-playlist search across all playlists and background revalidation resistance
    - R4: Zero emoji invariant and UNIX LF line endings
    """
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        cls.ms_path = os.path.join(base_dir, 'js', 'mediaSession.js')
        cls.main_path = os.path.join(base_dir, 'js', 'main.js')
        cls.playback_path = os.path.join(base_dir, 'js', 'playback.js')
        cls.ui_path = os.path.join(base_dir, 'js', 'ui.js')
        cls.test_path = os.path.join(base_dir, 'tests', 'test_milestone_m3_rcf.py')

        with open(cls.ms_path, 'r', encoding='utf-8') as f:
            cls.ms_content = f.read()
        with open(cls.main_path, 'r', encoding='utf-8') as f:
            cls.main_content = f.read()
        with open(cls.playback_path, 'r', encoding='utf-8') as f:
            cls.playback_content = f.read()
        with open(cls.ui_path, 'r', encoding='utf-8') as f:
            cls.ui_content = f.read()
        with open(cls.test_path, 'r', encoding='utf-8') as f:
            cls.test_content = f.read()

    # R4 Invariants

    def test_strictly_zero_emojis_in_all_modified_files(self):
        """Strictly zero emojis in all modified JS and test files"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        for name, content in [
            ('mediaSession.js', self.ms_content),
            ('main.js', self.main_content),
            ('playback.js', self.playback_content),
            ('ui.js', self.ui_content),
            ('test_milestone_m3_rcf.py', self.test_content),
        ]:
            matches = emoji_pattern.findall(content)
            self.assertEqual(matches, [], f"Found emojis in {name}: {matches}")

    def test_unix_lf_line_endings_enforced(self):
        """Ensure all modified files maintain strictly UNIX LF line endings (zero CRLF)"""
        for file_path in [self.ms_path, self.main_path, self.playback_path, self.ui_path, self.test_path]:
            with open(file_path, 'rb') as f:
                raw_bytes = f.read()
            crlf_count = raw_bytes.count(b'\r\n')
            self.assertEqual(crlf_count, 0, f"Found CRLF line endings in {file_path}")

    # R1: Mode 2 Pause Resumption Tests

    def test_mode2_pause_action_handler_handles_is_actually_paused_without_user_flag(self):
        """setActionHandler('pause') handles isActuallyPaused without requiring wasPausedByUser"""
        pause_block = re.search(
            r"navigator\.mediaSession\.setActionHandler\(\s*['\"]pause['\"][\s\S]*?\n\s{8}\}\);",
            self.ms_content
        )
        self.assertIsNotNone(pause_block, "setActionHandler('pause') block not found")
        content = pause_block.group(0)

        # Must branch on isActuallyPaused without requiring window.wasPausedByUser
        self.assertIn("if (isActuallyPaused)", content)
        self.assertNotIn("if (isActuallyPaused && window.wasPausedByUser)", content)
        # Must clear spoof burst
        self.assertIn("clearSpoofBurst();", content)

    def test_mode2_playpause_action_handler_handles_is_actually_paused_without_user_flag(self):
        """setActionHandler('playpause') handles isActuallyPaused without requiring wasPausedByUser"""
        playpause_block = re.search(
            r"navigator\.mediaSession\.setActionHandler\(\s*['\"]playpause['\"][\s\S]*?\n\s{8}\}\);",
            self.ms_content
        )
        self.assertIsNotNone(playpause_block, "setActionHandler('playpause') block not found")
        content = playpause_block.group(0)

        # Must branch on isActuallyPaused without requiring window.wasPausedByUser
        self.assertIn("if (isActuallyPaused)", content)
        self.assertNotIn("if (isActuallyPaused && window.wasPausedByUser)", content)
        # Must clear spoof burst
        self.assertIn("clearSpoofBurst();", content)

    def test_handle_play_action_clears_spoof_burst(self):
        """handlePlayAction clears spoof burst on play request"""
        play_block = re.search(
            r"function handlePlayAction\(\)\s*\{[\s\S]*?\n\s{4}\}",
            self.ms_content
        )
        self.assertIsNotNone(play_block, "handlePlayAction block not found")
        content = play_block.group(0)
        self.assertIn("clearSpoofBurst();", content)

    def test_start_live_audio_anchor_gates_anchor_heartbeat_on_user_pause(self):
        """startLiveAudioAnchor only starts anchor heartbeat when wasPausedByUser is true"""
        anchor_block = re.search(
            r"function startLiveAudioAnchor\(\)\s*\{[\s\S]*?\n\s{4}\}",
            self.ms_content
        )
        self.assertIsNotNone(anchor_block, "startLiveAudioAnchor block not found")
        content = anchor_block.group(0)
        self.assertIn("window.wasPausedByUser === true", content)
        self.assertRegex(content, r"startAnchorHeartbeat\((?:0|200)\);")

    def test_anchor_auto_resume_neutralized(self):
        """_setupAnchorAutoResume does not auto-resume on anchor play event"""
        setup_block = re.search(
            r"function _setupAnchorAutoResume\s*\(anchorEl\)\s*\{[\s\S]*?\n\s{4}\}",
            self.ms_content
        )
        self.assertIsNotNone(setup_block, "_setupAnchorAutoResume block not found")
        content = setup_block.group(0)
        # Should NOT contain audioPlayer.play()
        self.assertNotIn("audioPlayer.play()", content)

    # R2: Mode 2 Single-Player Isolation on External Interrupt Tests

    def test_media_session_audio_pause_enforces_single_player_isolation_on_external_interrupt(self):
        """mediaSession.js audioPlayer pause listener tears down anchor and probes on external interrupt"""
        pause_block = re.search(
            r"audioPlayer\.addEventListener\(\s*['\"]pause['\"]\s*,\s*\(\)\s*=>\s*\{[\s\S]*?\n\s{8}\}\);\n",
            self.ms_content
        )
        self.assertIsNotNone(pause_block, "audioPlayer pause listener in mediaSession.js not found")
        content = pause_block.group(0)

        # Must check if (window.wasPausedByUser) ... else ...
        self.assertIn("if (window.wasPausedByUser)", content)
        self.assertIn("stopLiveAudioAnchor();", content)
        self.assertIn("stopFocusProbe();", content)
        self.assertIn("stopAnchorHeartbeat();", content)
        self.assertIn("clearSpoofBurst();", content)

    def test_main_audio_pause_enforces_single_player_isolation_on_external_interrupt(self):
        """main.js audioPlayer pause listener sets paused playback state and position on external interrupt"""
        pause_block = re.search(
            r"audioPlayer\.addEventListener\(\s*['\"]pause['\"]\s*,\s*\(\)\s*=>\s*\{[\s\S]*?\n\s{4}\}\);",
            self.main_content
        )
        self.assertIsNotNone(pause_block, "audioPlayer pause listener in main.js not found")
        content = pause_block.group(0)

        # Must check if (window.wasPausedByUser) ... else ...
        self.assertIn("if (window.wasPausedByUser) {", content)
        self.assertIn("playbackState = 'paused';", content)
        self.assertIn("updateMediaSessionPosition(audioPlayer.currentTime, dur, 1.0, true);", content)

    def test_audio_play_listener_clears_spoof_burst(self):
        """audioPlayer play listener clears spoof burst"""
        play_block = re.search(
            r"audioPlayer\.addEventListener\(\s*['\"]play['\"]\s*,\s*\(\)\s*=>\s*\{[\s\S]*?\n\s{8}\}\);",
            self.ms_content
        )
        self.assertIsNotNone(play_block, "audioPlayer play listener in mediaSession.js not found")
        content = play_block.group(0)
        self.assertIn("clearSpoofBurst();", content)

    # R3: Multi-Playlist Search and Invalidation Resistance Tests

    def test_search_input_no_added_ids_deduplication(self):
        """main.js searchInput debounce handler does not deduplicate songs by addedIds"""
        search_block = re.search(
            r"searchInput\.addEventListener\(\s*['\"]input['\"][\s\S]*?\n\s{4}\}\);",
            self.main_content
        )
        self.assertIsNotNone(search_block, "searchInput input listener block not found")
        content = search_block.group(0)

        # Must NOT contain addedIds check suppressing cross-playlist occurrences
        self.assertNotIn("addedIds.has(", content)
        self.assertNotIn("const addedIds = new Set()", content)

    def test_search_scoring_current_playlist_bonus(self):
        """main.js search applies +50 score bonus for songs in current playlist"""
        search_block = re.search(
            r"searchInput\.addEventListener\(\s*['\"]input['\"][\s\S]*?\n\s{4}\}\);",
            self.main_content
        )
        self.assertIsNotNone(search_block, "searchInput input listener block not found")
        content = search_block.group(0)
        self.assertIn("score: score + 50", content)

    def test_search_input_focus_warms_remaining_playlists(self):
        """main.js triggers warmRemainingPlaylists on search input focus"""
        focus_block = re.search(
            r"searchInput\.addEventListener\(\s*['\"]focus['\"]\s*,\s*\(\)\s*=>\s*\{[\s\S]*?\n\s{4}\}\);",
            self.main_content
        )
        self.assertIsNotNone(focus_block, "searchInput focus listener not found")
        content = focus_block.group(0)
        self.assertIn("warmRemainingPlaylists", content)

    def test_background_warming_unrestricted_by_mobile_check(self):
        """main.js warmRemainingPlaylists runs regardless of device type"""
        warm_block = re.search(
            r"function warmRemainingPlaylists\s*\(activePl\)\s*\{[\s\S]*?\n\s{4}\}",
            self.main_content
        )
        self.assertIsNotNone(warm_block, "warmRemainingPlaylists function not found")
        content = warm_block.group(0)
        self.assertNotIn("if (!isMobileDevice)", content)

    def test_apply_playlist_data_guards_filtered_indices_on_active_search(self):
        """playback.js applyPlaylistData protects filteredIndices when filterText is active"""
        apply_block = re.search(
            r"function applyPlaylistData\s*\(folderName,\s*normalizedData[\s\S]*?\n\s{4}\}",
            self.playback_content
        )
        self.assertIsNotNone(apply_block, "applyPlaylistData function not found")
        content = apply_block.group(0)
        self.assertIn("if (!filterText) {", content)
        self.assertIn("filteredIndices = indices;", content)

    def test_render_virtual_tracks_falls_back_to_current_playlist_data(self):
        """ui.js renderVirtualTracks falls back to currentPlaylistData when item is in current playlist"""
        render_block = re.search(
            r"function renderVirtualTracks\s*\(\)\s*\{[\s\S]*?\n\s{4}\}",
            self.ui_content
        )
        self.assertIsNotNone(render_block, "renderVirtualTracks function not found")
        content = render_block.group(0)
        self.assertIn("item.playlist === currentPl ? currentPlaylistData : null", content)

if __name__ == '__main__':
    unittest.main()
