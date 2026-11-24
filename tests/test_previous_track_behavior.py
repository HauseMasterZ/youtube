import os
import re
import unittest

class TestPreviousTrackBehavior(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base_dir = os.path.dirname(os.path.dirname(__file__))
        cls.js_dir = os.path.join(cls.base_dir, 'js')
        with open(os.path.join(cls.js_dir, 'playback.js'), 'r', encoding='utf-8') as f:
            cls.playback_content = f.read()
        with open(os.path.join(cls.js_dir, 'main.js'), 'r', encoding='utf-8') as f:
            cls.main_content = f.read()
        with open(os.path.join(cls.js_dir, 'mediaSession.js'), 'r', encoding='utf-8') as f:
            cls.ms_content = f.read()
        with open(os.path.join(os.path.dirname(cls.base_dir), 'GEMINI.md'), 'r', encoding='utf-8') as f:
            cls.root_gemini = f.read()
        with open(os.path.join(cls.base_dir, 'GEMINI.md'), 'r', encoding='utf-8') as f:
            cls.yt_gemini = f.read()

    def test_strictly_zero_emojis_in_source_and_tests(self):
        """Strictly zero emojis across modified source files and this test suite"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        with open(__file__, 'r', encoding='utf-8') as f:
            this_content = f.read()

        for name, content in [
            ('playback.js', self.playback_content),
            ('main.js', self.main_content),
            ('mediaSession.js', self.ms_content),
            ('root GEMINI.md', self.root_gemini),
            ('youtube GEMINI.md', self.yt_gemini),
            ('test_previous_track_behavior.py', this_content),
        ]:
            matches = emoji_pattern.findall(content)
            self.assertEqual(matches, [], f"Found emojis in {name}: {matches}")

    def test_strictly_unix_lf_line_endings(self):
        """Strictly UNIX LF line endings across modified files and this test suite"""
        target_files = [
            os.path.join(self.js_dir, 'playback.js'),
            os.path.join(self.js_dir, 'main.js'),
            os.path.join(self.js_dir, 'mediaSession.js'),
            os.path.join(os.path.dirname(self.base_dir), 'GEMINI.md'),
            os.path.join(self.base_dir, 'GEMINI.md'),
            __file__,
        ]
        for fpath in target_files:
            with open(fpath, 'rb') as f:
                raw_bytes = f.read()
            self.assertEqual(raw_bytes.count(b'\r\n'), 0, f"Found CRLF in {fpath}")

    def test_play_from_playlist_shuffle_once_queue_index_reconciliation(self):
        """playFromPlaylist in Shuffle Once (mode 2) finds track position in playQueue via findIndex"""
        match = re.search(
            r'function\s+playFromPlaylist\s*\([\s\S]*?\{([\s\S]*?)\n\s*executePlayback',
            self.playback_content
        )
        self.assertIsNotNone(match, "playFromPlaylist not found in playback.js")
        body = match.group(1)
        self.assertIn("shuffleMode === 2", body)
        self.assertIn("playQueue.findIndex", body)
        self.assertIn("queueIndex = (foundIdx !== -1) ? foundIdx : trackIndex;", body)

    def test_play_prev_three_second_rewind_threshold(self):
        """playPrev resets currentTime to 0 and resumes playback when currentTime > 3.0"""
        match = re.search(
            r'function\s+playPrev\s*\(\s*\)\s*\{([\s\S]*?)\n\s*function\s+executePlayback',
            self.playback_content
        )
        self.assertIsNotNone(match, "playPrev not found in playback.js")
        body = match.group(1)
        self.assertRegex(body, r'audioPlayer\.currentTime\s*>\s*3\.0')
        self.assertIn("audioPlayer.currentTime = 0;", body)
        self.assertIn("updateTimeUI(0);", body)
        self.assertIn("audioPlayer.play();", body)

    def test_play_prev_queue_fallback_passes_is_history_nav_true(self):
        """playPrev passes isHistoryNav = true to executePlayback in queue fallback to prevent history loops"""
        match = re.search(
            r'function\s+playPrev\s*\(\s*\)\s*\{([\s\S]*?)\n\s*function\s+executePlayback',
            self.playback_content
        )
        self.assertIsNotNone(match, "playPrev not found in playback.js")
        body = match.group(1)
        self.assertIn("executePlayback(false, true, true);", body)
        self.assertNotIn("executePlayback(false, false, true);", body)

    def test_restore_last_played_track_seeds_playback_history(self):
        """restoreLastPlayedTrack seeds playbackHistory with staged track when empty"""
        match = re.search(
            r'function\s+restoreLastPlayedTrack\s*\([\s\S]*?window\.restoreLastPlayedTrack\s*=',
            self.playback_content
        )
        self.assertIsNotNone(match, "restoreLastPlayedTrack not found in playback.js")
        body = match.group(0)
        self.assertIn("playbackHistory.length === 0", body)
        self.assertIn("playbackHistory.push({ playlist: lastPlayed.playlist, index: globalActiveOriginalIndex });", body)
        self.assertIn("playbackHistoryIndex = 0;", body)

    def test_main_play_event_seeds_playback_history_on_first_play(self):
        """main.js audioPlayer play listener seeds playbackHistory on initial user play gesture"""
        match = re.search(
            r'audioPlayer\.addEventListener\(\s*[\'"]play[\'"]\s*,[\s\S]*?updateLyricsUI\(audioPlayer\.currentTime\);',
            self.main_content
        )
        self.assertIsNotNone(match, "audioPlayer play event listener not found in main.js")
        body = match.group(0)
        self.assertIn("playbackHistory.length === 0", body)
        self.assertIn("playbackHistory.push({ playlist: globalActivePlaylist, index: globalActiveOriginalIndex });", body)
        self.assertIn("playbackHistoryIndex = 0;", body)

    def test_media_session_prev_action_guards_transitions_and_delegates(self):
        """mediaSession.js previoustrack action handler guards lastPlaybackModeTransitions and delegates to playPrev"""
        match = re.search(
            r'navigator\.mediaSession\.setActionHandler\(\s*[\'"]previoustrack[\'"]\s*,\s*\(\)\s*=>\s*\{([\s\S]*?)\}\);',
            self.ms_content
        )
        self.assertIsNotNone(match, "previoustrack action handler not found in mediaSession.js")
        body = match.group(1)
        self.assertIn("playPrev();", body)
        self.assertIn("Array.isArray(window.lastPlaybackModeTransitions)", body)

    def test_simulation_shuffle_off_previous_navigation(self):
        """Simulation: Shuffle Off (mode 0) history and 3-second rewind behavior"""
        class MockPlayer:
            def __init__(self):
                self.current_time = 0.0
                self.paused = False
                self.play_count = 0
            def play(self):
                self.paused = False
                self.play_count += 1

        player = MockPlayer()
        history = [{'playlist': 'default', 'index': 0}, {'playlist': 'default', 'index': 1}]
        history_index = 1
        play_queue = [0, 1, 2]
        queue_index = 1

        # Case 1: currentTime > 3.0 rewinds current track
        player.current_time = 4.5
        if player.current_time > 3.0:
            player.current_time = 0.0
            player.play()
        self.assertEqual(player.current_time, 0.0)
        self.assertEqual(history_index, 1)

        # Case 2: currentTime <= 3.0 navigates backward through history
        player.current_time = 1.2
        if player.current_time <= 3.0 and history_index > 0:
            history_index -= 1
            target = history[history_index]
            queue_index = target['index']
        self.assertEqual(history_index, 0)
        self.assertEqual(queue_index, 0)

        # Case 3: At beginning of history (index 0), queue fallback or 0:00 clamp
        player.current_time = 0.5
        rewound_at_start = False
        if player.current_time <= 3.0:
            if history_index > 0:
                history_index -= 1
            elif queue_index > 0:
                queue_index -= 1
            else:
                player.current_time = 0.0
                player.play()
                rewound_at_start = True
        self.assertTrue(rewound_at_start)
        self.assertEqual(queue_index, 0)

    def test_simulation_cross_playlist_shuffle_previous_navigation(self):
        """Simulation: Cross-Playlist Shuffle (mode 1) deck navigation"""
        cross_shuffle_history = [
            {'playlist': 'rock', 'index': 3},
            {'playlist': 'jazz', 'index': 7},
            {'playlist': 'classical', 'index': 2},
        ]
        cross_pos = 2
        current_time = 1.0

        # Navigating back from classical -> jazz
        if current_time <= 3.0 and cross_pos > 0:
            cross_pos -= 1
        self.assertEqual(cross_pos, 1)
        self.assertEqual(cross_shuffle_history[cross_pos]['playlist'], 'jazz')

        # Navigating back from jazz -> rock
        if current_time <= 3.0 and cross_pos > 0:
            cross_pos -= 1
        self.assertEqual(cross_pos, 0)
        self.assertEqual(cross_shuffle_history[cross_pos]['playlist'], 'rock')

        # At start of deck (cross_pos 0): clamp to 0 without underflowing
        at_deck_start = False
        if current_time <= 3.0:
            if cross_pos > 0:
                cross_pos -= 1
            else:
                at_deck_start = True
        self.assertTrue(at_deck_start)
        self.assertEqual(cross_pos, 0)

    def test_simulation_shuffle_once_queue_reconciliation(self):
        """Simulation: Shuffle Once (mode 2) queueIndex reconciliation via findIndex prevents desync"""
        shuffled_queue = [4, 1, 0, 3, 2]
        history = [{'playlist': 'pl1', 'index': 4}]
        history_index = 0
        queue_index = 0

        # Next: advance to track 1 (index 1 in shuffled_queue)
        queue_index += 1
        current_track = shuffled_queue[queue_index]
        history.append({'playlist': 'pl1', 'index': current_track})
        history_index += 1
        self.assertEqual(current_track, 1)
        self.assertEqual(queue_index, 1)
        self.assertEqual(history_index, 1)

        # Prev: navigate back to track 4 via history
        history_index -= 1
        target_track = history[history_index]['index']
        # playFromPlaylist findIndex reconciliation:
        found_idx = -1
        for i, item in enumerate(shuffled_queue):
            if item == target_track:
                found_idx = i
                break
        queue_index = found_idx if found_idx != -1 else target_track
        self.assertEqual(queue_index, 0)
        self.assertEqual(shuffled_queue[queue_index], 4)

        # Next again: queueIndex must advance to 1 (track 1), not jump based on raw original index
        queue_index += 1
        self.assertEqual(queue_index, 1)
        self.assertEqual(shuffled_queue[queue_index], 1)

if __name__ == '__main__':
    unittest.main()
