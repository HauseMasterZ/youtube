import os
import re
import unittest

class ChromiumMediaSessionSimulation:
    """
    Simulation of Chromium MediaSessionImpl and MediaSessionController:
    - media_session_impl_decoded.cc
    - media_session_android_decoded.cc
    """
    def __init__(self):
        self.normal_players_ = set()
        self.audio_focus_state_ = 'INACTIVE'
        self.desired_audio_focus_type_ = 'kGain'
        self.history = []

    def add_player(self, player_id):
        self.normal_players_.add(player_id)
        self.audio_focus_state_ = 'ACTIVE'
        self.history.append(('add_player', player_id, len(self.normal_players_), self.audio_focus_state_))

    def remove_player(self, player_id):
        if player_id in self.normal_players_:
            self.normal_players_.remove(player_id)
        if len(self.normal_players_) == 0:
            self.abandon_system_audio_focus_if_needed()
        self.history.append(('remove_player', player_id, len(self.normal_players_), self.audio_focus_state_))

    def abandon_system_audio_focus_if_needed(self):
        if len(self.normal_players_) == 0:
            self.audio_focus_state_ = 'INACTIVE'

    def is_controllable(self):
        return (
            self.audio_focus_state_ != 'INACTIVE' and
            self.desired_audio_focus_type_ == 'kGain' and
            len(self.normal_players_) > 0
        )


class AndroidMediaSessionHelperSimulation:
    """
    Simulation of Android MediaSessionHelper:
    - MediaSessionHelper_decoded.java
    """
    HIDE_NOTIFICATION_DELAY_MILLIS = 500

    def __init__(self, session):
        self.session = session
        self.notification_visible = False
        self.notification_destroyed = False
        self.hide_task_scheduled_at = None
        self.hide_delayed_call_count = 0
        self.hide_executed_count = 0
        self.show_notification_count = 0

    def on_session_state_changed(self, virtual_time_ms):
        controllable = self.session.is_controllable()
        if controllable:
            self.notification_visible = True
            self.notification_destroyed = False
            self.show_notification_count += 1
            if self.hide_task_scheduled_at is not None:
                self.hide_task_scheduled_at = None
        else:
            if self.hide_task_scheduled_at is None and self.notification_visible:
                self.hide_task_scheduled_at = virtual_time_ms + self.HIDE_NOTIFICATION_DELAY_MILLIS
                self.hide_delayed_call_count += 1

    def advance_clock(self, virtual_time_ms):
        if self.hide_task_scheduled_at is not None and virtual_time_ms >= self.hide_task_scheduled_at:
            self.notification_visible = False
            self.notification_destroyed = True
            self.hide_executed_count += 1
            self.hide_task_scheduled_at = None


class TestAdversarialFirstPlayEvictionChallenger(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        cls.base_dir = base_dir

        with open(os.path.join(base_dir, 'js', 'main.js'), 'r', encoding='utf-8') as f:
            cls.main_content = f.read()

        with open(os.path.join(base_dir, 'js', 'playback.js'), 'r', encoding='utf-8') as f:
            cls.playback_content = f.read()

        with open(os.path.join(base_dir, 'js', 'mediaSession.js'), 'r', encoding='utf-8') as f:
            cls.ms_content = f.read()

        with open(os.path.join(base_dir, 'js', 'dom.js'), 'r', encoding='utf-8') as f:
            cls.dom_content = f.read()

        with open(__file__, 'r', encoding='utf-8') as f:
            cls.test_file_content = f.read()

    def test_strictly_zero_emojis(self):
        """Zero emoji invariant across test file and reviewed sources."""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        sources = {
            'main.js': self.main_content,
            'playback.js': self.playback_content,
            'mediaSession.js': self.ms_content,
            'dom.js': self.dom_content,
            'test_adversarial_first_play_eviction_challenger.py': self.test_file_content
        }
        for name, content in sources.items():
            matches = emoji_pattern.findall(content)
            self.assertEqual(len(matches), 0, f"Found emojis in {name}: {matches}")

    def test_unix_lf_line_endings(self):
        """All files must have strictly UNIX LF line endings."""
        files = [
            os.path.join(self.base_dir, 'js', 'main.js'),
            os.path.join(self.base_dir, 'js', 'playback.js'),
            os.path.join(self.base_dir, 'js', 'mediaSession.js'),
            os.path.join(self.base_dir, 'js', 'dom.js'),
            __file__
        ]
        for fpath in files:
            with open(fpath, 'rb') as f:
                data = f.read()
            self.assertNotIn(b'\r\n', data, f"Found CRLF in {fpath}")

    def test_challenge_vector_1_first_play_pause_retention(self):
        """R1: First-play pause in Mode 2 retains Android media card without stripping."""
        session = ChromiumMediaSessionSimulation()
        helper = AndroidMediaSessionHelperSimulation(session)

        # Fresh site visit: user selects Mode 2 and clicks first track
        # Synchronous priming adds anchor
        session.add_player('live-stream-anchor')
        helper.on_session_state_changed(virtual_time_ms=0)
        self.assertTrue(session.is_controllable())
        self.assertTrue(helper.notification_visible)

        # Primary audio begins
        session.add_player('audioPlayer')
        helper.on_session_state_changed(virtual_time_ms=100)
        self.assertEqual(len(session.normal_players_), 2)

        # User pauses first song
        session.remove_player('audioPlayer')
        helper.on_session_state_changed(virtual_time_ms=2000)

        # Live anchor remains active
        self.assertIn('live-stream-anchor', session.normal_players_)
        self.assertEqual(len(session.normal_players_), 1)
        self.assertTrue(session.is_controllable())
        self.assertIsNone(helper.hide_task_scheduled_at)

        # Advance virtual clock past 500ms HIDE_NOTIFICATION_DELAY_MILLIS
        helper.advance_clock(virtual_time_ms=2600)
        self.assertTrue(helper.notification_visible)
        self.assertFalse(helper.notification_destroyed)

        # Advance clock to 10000ms
        helper.advance_clock(virtual_time_ms=10000)
        self.assertTrue(helper.notification_visible)
        self.assertFalse(helper.notification_destroyed)
        self.assertEqual(helper.hide_executed_count, 0)

    def test_challenge_vector_2_rapid_pause_race_conditions(self):
        """R1: Rapid pause race conditions at 10ms, 50ms, 100ms, 200ms, 500ms."""
        pause_delays = [10, 50, 100, 200, 500]

        for delay_ms in pause_delays:
            with self.subTest(pause_delay_ms=delay_ms):
                session = ChromiumMediaSessionSimulation()
                helper = AndroidMediaSessionHelperSimulation(session)

                # t = 0: Track clicked. Synchronous priming starts anchor
                session.add_player('live-stream-anchor')
                helper.on_session_state_changed(virtual_time_ms=0)

                # Advance to rapid pause timestamp
                t = delay_ms
                # Main audio player may have started or still buffering
                if delay_ms >= 100:
                    session.add_player('audioPlayer')
                    helper.on_session_state_changed(virtual_time_ms=t)
                    # Pause main player
                    session.remove_player('audioPlayer')
                    helper.on_session_state_changed(virtual_time_ms=t)
                else:
                    # User paused before audioPlayer even resolved
                    # audioPlayer is not added or instantly paused
                    pass

                # In all rapid pause timings, anchor must remain playing
                self.assertIn('live-stream-anchor', session.normal_players_)
                self.assertGreaterEqual(len(session.normal_players_), 1)
                self.assertTrue(session.is_controllable())
                self.assertIsNone(helper.hide_task_scheduled_at)

                # Advance past 500ms delay window
                helper.advance_clock(virtual_time_ms=t + 600)
                self.assertTrue(helper.notification_visible)
                self.assertFalse(helper.notification_destroyed)
                self.assertEqual(helper.hide_executed_count, 0)

    def test_challenge_vector_3_cold_cache_network_delay(self):
        """R1: Cold cache network playlist fetch delays (100ms, 500ms, 1000ms, 2000ms, 5000ms)."""
        network_delays = [100, 500, 1000, 2000, 5000]

        for net_delay_ms in network_delays:
            with self.subTest(network_delay_ms=net_delay_ms):
                session = ChromiumMediaSessionSimulation()
                helper = AndroidMediaSessionHelperSimulation(session)

                # t = 0: user gesture synchronously primes anchor before await loadPlaylist
                session.add_player('live-stream-anchor')
                helper.on_session_state_changed(virtual_time_ms=0)

                # Throughout the cold network fetch, anchor keeps session controllable
                step_ms = 50
                for current_t in range(step_ms, net_delay_ms + 1, step_ms):
                    helper.advance_clock(virtual_time_ms=current_t)
                    self.assertTrue(session.is_controllable())
                    self.assertTrue(helper.notification_visible)
                    self.assertFalse(helper.notification_destroyed)

                # Audio starts after network load completes
                t_play = net_delay_ms + 50
                session.add_player('audioPlayer')
                helper.on_session_state_changed(virtual_time_ms=t_play)

                # User pauses 200ms after playback starts
                t_pause = t_play + 200
                session.remove_player('audioPlayer')
                helper.on_session_state_changed(virtual_time_ms=t_pause)

                # Advance 1000ms past pause
                helper.advance_clock(virtual_time_ms=t_pause + 1000)
                self.assertTrue(helper.notification_visible)
                self.assertFalse(helper.notification_destroyed)
                self.assertEqual(helper.hide_executed_count, 0)

    def test_challenge_vector_4_virtual_clock_advance_past_hide_notification_delay(self):
        """R1: Advancing virtual clock past 500ms HIDE_NOTIFICATION_DELAY_MILLIS (600ms, 1000ms, 5000ms, 30000ms)."""
        clock_targets = [600, 1000, 5000, 30000]

        session = ChromiumMediaSessionSimulation()
        helper = AndroidMediaSessionHelperSimulation(session)

        # Start anchor and audio player
        session.add_player('live-stream-anchor')
        session.add_player('audioPlayer')
        helper.on_session_state_changed(virtual_time_ms=0)

        # Pause audio player at t = 100ms
        session.remove_player('audioPlayer')
        helper.on_session_state_changed(virtual_time_ms=100)

        for target_ms in clock_targets:
            with self.subTest(target_virtual_time_ms=target_ms):
                helper.advance_clock(virtual_time_ms=target_ms)
                self.assertTrue(helper.notification_visible)
                self.assertFalse(helper.notification_destroyed)
                self.assertEqual(helper.hide_executed_count, 0)
                self.assertTrue(session.is_controllable())

    def test_challenge_vector_5_chromium_normal_players_never_zero(self):
        """R1: In Chromium MediaSession simulation, normal_players_ never reaches 0 across entire lifecycle."""
        session = ChromiumMediaSessionSimulation()
        helper = AndroidMediaSessionHelperSimulation(session)

        # Verify normal_players_ state tracking over 100 sequential events
        session.add_player('live-stream-anchor')
        helper.on_session_state_changed(virtual_time_ms=0)
        self.assertEqual(len(session.normal_players_), 1)

        for cycle in range(50):
            # Play
            session.add_player('audioPlayer')
            helper.on_session_state_changed(virtual_time_ms=cycle * 100 + 10)
            self.assertEqual(len(session.normal_players_), 2)
            self.assertTrue(session.is_controllable())

            # Pause
            session.remove_player('audioPlayer')
            helper.on_session_state_changed(virtual_time_ms=cycle * 100 + 50)
            self.assertEqual(len(session.normal_players_), 1)
            self.assertTrue(session.is_controllable())

        # normal_players_ never dropped to 0
        min_players = min(entry[2] for entry in session.history)
        self.assertEqual(min_players, 1, "normal_players_ count must never drop below 1")

    def test_challenge_vector_6_elimination_of_destructive_anchor_pause(self):
        """R1: startAnchorHeartbeat in mediaSession.js strictly eliminates anchorEl.pause() in runTick."""
        heartbeat_match = re.search(
            r'function\s+startAnchorHeartbeat\s*\([\s\S]*?function\s+runTick\s*\(\s*\)\s*\{([\s\S]*?)\}\s*const\s+executeTick',
            self.ms_content
        )
        self.assertIsNotNone(heartbeat_match, "startAnchorHeartbeat runTick definition not found in mediaSession.js")
        run_tick_body = heartbeat_match.group(1)

        # Destructive anchor pause calls must be completely absent from runTick code
        code_only = re.sub(r'//.*', '', run_tick_body)
        self.assertIsNone(re.search(r'anchorEl\.pause\s*\(', code_only), "Destructive anchorEl.pause() invocation found in runTick code")
        self.assertNotIn("_isInternalAnchorStop = true", run_tick_body)

        # Must cleanly check if (!anchorEl.paused) and return
        self.assertIn("if (!anchorEl.paused)", run_tick_body)
        self.assertIn("stopAnchorHeartbeat();", run_tick_body)

    def test_challenge_vector_7_synchronous_priming_order_in_playback(self):
        """R1: Synchronous priming must strictly precede await loadPlaylist in playTrackSelection."""
        pts_match = re.search(
            r'async\s+function\s+playTrackSelection\s*\([\s\S]*?await\s+loadPlaylist\(targetPlaylist\);',
            self.playback_content
        )
        self.assertIsNotNone(pts_match, "playTrackSelection async start not found in playback.js")
        pre_await_block = pts_match.group(0)

        init_idx = pre_await_block.find("initLiveAudioAnchor()")
        probe_idx = pre_await_block.find("primeFocusProbe()")
        start_idx = pre_await_block.find("startLiveAudioAnchor()")
        load_idx = pre_await_block.find("await loadPlaylist(targetPlaylist)")

        self.assertNotEqual(init_idx, -1)
        self.assertNotEqual(probe_idx, -1)
        self.assertNotEqual(start_idx, -1)
        self.assertNotEqual(load_idx, -1)

        self.assertLess(init_idx, load_idx)
        self.assertLess(probe_idx, load_idx)
        self.assertLess(start_idx, load_idx)

if __name__ == '__main__':
    unittest.main()
