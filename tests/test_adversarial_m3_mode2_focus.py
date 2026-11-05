import math
import os
import re
import unittest

class SimulatedChromiumMediaSessionImpl:
    """
    Simulates Chromium C++ MediaSessionImpl (content/browser/media/session/media_session_impl.cc)
    and MediaSessionHelper (org/chromium/content/browser/media/MediaSessionHelper.java).
    """
    def __init__(self):
        self.normal_players = set()
        self.audio_focus_state = 'INACTIVE'
        self.desired_focus_type = 'kGain'
        self.notification_visible = False
        self.notification_evicted = False
        self.remove_player_call_count = 0
        self.abandon_audio_focus_call_count = 0
        self.playback_state = 'none'
        self.position = None

    def add_player(self, player_id):
        self.normal_players.add(player_id)
        if self.audio_focus_state != 'ACTIVE':
            self.audio_focus_state = 'ACTIVE'
            self.notification_visible = True
            self.notification_evicted = False

    def remove_player(self, player_id):
        self.remove_player_call_count += 1
        if player_id in self.normal_players:
            self.normal_players.remove(player_id)
        if len(self.normal_players) == 0:
            self.abandon_system_audio_focus_if_needed()

    def on_player_paused(self, player_id):
        """
        Chromium media_session_impl_decoded.cc:622:
        if (normal_players_.size() != 1) {
            RemovePlayer(observer, player_id);
            return;
        }
        """
        if player_id not in self.normal_players:
            return
        if len(self.normal_players) != 1:
            self.remove_player(player_id)

    def abandon_system_audio_focus_if_needed(self):
        if len(self.normal_players) == 0:
            self.audio_focus_state = 'INACTIVE'
            self.abandon_audio_focus_call_count += 1
            self.notification_visible = False
            self.notification_evicted = True

    def on_audio_focus_loss_transient(self):
        self.audio_focus_state = 'SUSPENDED'

    def on_audio_focus_gain(self):
        if len(self.normal_players) > 0:
            self.audio_focus_state = 'ACTIVE'

    def is_controllable(self):
        return self.audio_focus_state != 'INACTIVE' and len(self.normal_players) > 0


class SimulatedPiYTRuntime:
    """
    Simulates PiYT JavaScript runtime in youtube/js/mediaSession.js and youtube/js/main.js.
    """
    def __init__(self, chromium_session):
        self.session = chromium_session
        self.playback_mode = 'mode2'
        self.audio_player_paused = True
        self.audio_player_current_time = 0.0
        self.audio_player_duration = 240.0
        self.anchor_paused = True
        self.is_internal_anchor_stop = False
        self.was_paused_by_user = False
        self.was_playing_before_call = False
        self.is_call_active = False
        self.last_bt_disconnect_time = 0
        self.media_session_destroyed = False

        # Timers
        self.spoof_burst_timer = None
        self.spoof_burst_call_count = 0
        self.anchor_heartbeat_active = False
        self.focus_probe_active = False

        # MediaSession State
        self.media_session_playback_state = 'none'
        self.last_position_update = None
        self.play_calls = 0
        self.pause_calls = 0

    def clear_spoof_burst(self):
        if self.spoof_burst_timer is not None:
            self.spoof_burst_timer = None

    def reassert_spoof_burst(self):
        if self.playback_mode != 'mode2':
            return
        self.clear_spoof_burst()
        self.spoof_burst_call_count += 1
        self.spoof_burst_timer = 'scheduled'

    def fire_scheduled_spoof_tick(self):
        """Simulates execution of scheduled spoof burst tick"""
        if self.spoof_burst_timer is None:
            return False
        if self.playback_mode != 'mode2':
            return False
        if not self.audio_player_paused:
            return False
        if self.is_call_active:
            return False
        self.update_media_session_position(self.audio_player_current_time, self.audio_player_duration, 1.0)
        self.media_session_playback_state = 'playing'
        return True

    def start_live_audio_anchor(self):
        if self.playback_mode != 'mode2' or self.is_call_active or self.media_session_destroyed:
            return
        self.anchor_paused = False
        self.session.add_player('anchor')
        if self.audio_player_paused and self.was_paused_by_user:
            self.anchor_heartbeat_active = True

    def stop_live_audio_anchor(self):
        self.clear_spoof_burst()
        self.anchor_heartbeat_active = False
        if not self.anchor_paused:
            try:
                self.is_internal_anchor_stop = True
                self.anchor_paused = True
                self.session.remove_player('anchor')
            finally:
                self.is_internal_anchor_stop = False

    def update_media_session_position(self, pos, dur, rate=1.0, force_bypass=False):
        self.last_position_update = {
            'position': pos,
            'duration': dur,
            'playbackRate': rate,
            'forceBypass': force_bypass
        }
        self.session.position = self.last_position_update

    # Audio Player Event Listeners

    def on_audio_player_play_event(self):
        self.clear_spoof_burst()
        self.anchor_heartbeat_active = False
        self.focus_probe_active = False
        if self.playback_mode == 'mode2':
            self.start_live_audio_anchor()
        else:
            self.stop_live_audio_anchor()

    def on_audio_player_pause_event(self):
        dur = self.audio_player_duration
        if self.playback_mode == 'mode2':
            if self.was_paused_by_user:
                self.start_live_audio_anchor()
                self.update_media_session_position(self.audio_player_current_time, dur, 1.0)
                self.media_session_playback_state = 'playing'
                self.reassert_spoof_burst()
            else:
                # Mode 2 external video interrupt: single player isolation
                self.was_playing_before_call = True
                self.stop_live_audio_anchor()
                self.focus_probe_active = False
                self.anchor_heartbeat_active = False
                self.clear_spoof_burst()
                self.media_session_playback_state = 'paused'
                self.update_media_session_position(self.audio_player_current_time, dur, 1.0, force_bypass=True)
        else:
            self.stop_live_audio_anchor()
            self.media_session_playback_state = 'paused'
            self.update_media_session_position(self.audio_player_current_time, dur, 1.0, force_bypass=True)

    # MediaSession Action Handlers

    def handle_play_action(self):
        if self.is_call_active:
            return
        self.media_session_destroyed = False
        self.clear_spoof_burst()
        self.anchor_heartbeat_active = False
        self.was_paused_by_user = False
        self.was_playing_before_call = True
        self.media_session_playback_state = 'playing'
        self.session.playback_state = 'playing'

        if self.playback_mode == 'mode2':
            self.start_live_audio_anchor()
        else:
            self.stop_live_audio_anchor()

        self.audio_player_paused = False
        self.session.add_player('audioPlayer')
        self.play_calls += 1
        self.on_audio_player_play_event()

    def handle_pause_action(self):
        is_actually_paused = self.audio_player_paused or self.was_paused_by_user
        if self.is_call_active:
            return
        self.media_session_destroyed = False

        if self.playback_mode == 'mode2':
            if is_actually_paused:
                # User intentionally resuming from paused state via card pause button
                self.clear_spoof_burst()
                self.anchor_heartbeat_active = False
                self.was_paused_by_user = False
                self.was_playing_before_call = True
                self.media_session_playback_state = 'playing'
                self.session.playback_state = 'playing'
                self.start_live_audio_anchor()
                self.audio_player_paused = False
                self.session.add_player('audioPlayer')
                self.play_calls += 1
                self.on_audio_player_play_event()
            else:
                # User pausing playback
                self.was_paused_by_user = True
                self.was_playing_before_call = False
                self.media_session_playback_state = 'playing'
                self.session.playback_state = 'playing'
                self.start_live_audio_anchor()
                self.update_media_session_position(self.audio_player_current_time, self.audio_player_duration, 0.00001, force_bypass=True)
                self.audio_player_paused = True
                self.pause_calls += 1
                self.on_audio_player_pause_event()
        else:
            # Mode 1
            self.was_paused_by_user = True
            self.was_playing_before_call = False
            self.media_session_playback_state = 'paused'
            self.session.playback_state = 'paused'
            self.audio_player_paused = True
            self.pause_calls += 1
            self.stop_live_audio_anchor()
            self.session.on_player_paused('audioPlayer')

    def handle_playpause_action(self):
        is_actually_paused = self.audio_player_paused or self.was_paused_by_user
        if self.is_call_active:
            return
        self.media_session_destroyed = False
        if is_actually_paused:
            self.clear_spoof_burst()
            self.anchor_heartbeat_active = False
            self.was_paused_by_user = False
            self.was_playing_before_call = True
            self.media_session_playback_state = 'playing'
            self.session.playback_state = 'playing'
            if self.playback_mode == 'mode2':
                self.start_live_audio_anchor()
            self.audio_player_paused = False
            self.session.add_player('audioPlayer')
            self.play_calls += 1
            self.on_audio_player_play_event()
        else:
            self.handle_pause_action()

    # External Audio Focus Interrupt Simulation

    def trigger_external_audio_focus_loss(self):
        """Simulates external media app taking transient audio focus"""
        self.session.on_audio_focus_loss_transient()
        # Android OS pauses audioPlayer
        self.audio_player_paused = True
        self.was_paused_by_user = False
        self.on_audio_player_pause_event()
        self.session.on_player_paused('audioPlayer')


class TestAdversarialM3Mode2Focus(unittest.TestCase):
    """
    Adversarial verification suite for Milestone M3:
    1. Mode 2 pause/play rapid churn and micro-position race condition prevention.
    2. Mode 2 action handler permutations ('play', 'pause', 'playpause').
    3. Mode 2 external video interrupt single-player isolation and notification retention.
    4. Sequential external focus loss events without player removal or eviction.
    5. Invariant enforcement: strictly zero emojis and UNIX LF line endings.
    """
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        cls.ms_path = os.path.join(base_dir, 'js', 'mediaSession.js')
        cls.main_path = os.path.join(base_dir, 'js', 'main.js')
        with open(cls.ms_path, 'r', encoding='utf-8') as f:
            cls.ms_content = f.read()
        with open(cls.main_path, 'r', encoding='utf-8') as f:
            cls.main_content = f.read()

    # Challenge 1: Rapid Toggle Churn Stress Test

    def test_rapid_pause_play_toggle_churn_prevents_stale_position_ticks(self):
        """
        Adversarial stress test: Rapidly alternating pause and resume actions 100 times.
        Verify that clearSpoofBurst() cleanly cancels any scheduled spoof bursts,
        preventing stale position overrides when the audio player is actively playing.
        """
        session = SimulatedChromiumMediaSessionImpl()
        piyt = SimulatedPiYTRuntime(session)

        # Start playback
        piyt.handle_play_action()
        self.assertFalse(piyt.audio_player_paused)
        self.assertEqual(piyt.media_session_playback_state, 'playing')

        # Stress churn: 100 iterations of pause -> resume
        for i in range(100):
            # Pause
            piyt.handle_pause_action()
            self.assertTrue(piyt.audio_player_paused)
            self.assertTrue(piyt.was_paused_by_user)
            self.assertIsNotNone(piyt.spoof_burst_timer)

            # Rapid resume via action handler before timer tick fires
            if i % 3 == 0:
                piyt.handle_play_action()
            elif i % 3 == 1:
                piyt.handle_pause_action()  # Pause action resumes when paused
            else:
                piyt.handle_playpause_action()

            self.assertFalse(piyt.audio_player_paused)
            self.assertFalse(piyt.was_paused_by_user)
            # clearSpoofBurst() must have canceled the scheduled timer
            self.assertIsNone(piyt.spoof_burst_timer)

            # Fire tick attempt should return False (noop) because timer was cleared
            tick_executed = piyt.fire_scheduled_spoof_tick()
            self.assertFalse(tick_executed, f"Iteration {i}: Stale spoof tick executed while player was active")

        # Verify final state is healthy
        self.assertFalse(piyt.audio_player_paused)
        self.assertEqual(session.playback_state, 'playing')
        self.assertTrue(session.is_controllable())
        self.assertFalse(session.notification_evicted)

    # Challenge 2: Media Card Action Handler Resumption Permutations

    def test_mode2_resumption_via_play_handler_from_user_pause(self):
        """Resuming via 'play' action handler after user pause"""
        session = SimulatedChromiumMediaSessionImpl()
        piyt = SimulatedPiYTRuntime(session)

        piyt.handle_play_action()
        piyt.handle_pause_action()
        self.assertTrue(piyt.audio_player_paused)
        self.assertTrue(piyt.was_paused_by_user)

        piyt.handle_play_action()
        self.assertFalse(piyt.audio_player_paused)
        self.assertFalse(piyt.was_paused_by_user)
        self.assertTrue(piyt.was_playing_before_call)
        self.assertEqual(piyt.media_session_playback_state, 'playing')
        self.assertTrue(session.is_controllable())

    def test_mode2_resumption_via_pause_handler_from_user_pause(self):
        """
        In Mode 2, clicking 'pause' on the media card when already paused resumes playback.
        (Android SystemUI displays a pause icon due to playbackState = 'playing' spoof).
        """
        session = SimulatedChromiumMediaSessionImpl()
        piyt = SimulatedPiYTRuntime(session)

        piyt.handle_play_action()
        piyt.handle_pause_action()
        self.assertTrue(piyt.audio_player_paused)

        # User taps the displayed pause/play toggle button on the card
        piyt.handle_pause_action()
        self.assertFalse(piyt.audio_player_paused)
        self.assertFalse(piyt.was_paused_by_user)
        self.assertEqual(piyt.media_session_playback_state, 'playing')
        self.assertTrue(session.is_controllable())

    def test_mode2_resumption_via_playpause_handler_from_user_pause(self):
        """Resuming via 'playpause' action handler after user pause"""
        session = SimulatedChromiumMediaSessionImpl()
        piyt = SimulatedPiYTRuntime(session)

        piyt.handle_play_action()
        piyt.handle_pause_action()
        self.assertTrue(piyt.audio_player_paused)

        piyt.handle_playpause_action()
        self.assertFalse(piyt.audio_player_paused)
        self.assertFalse(piyt.was_paused_by_user)
        self.assertEqual(piyt.media_session_playback_state, 'playing')
        self.assertTrue(session.is_controllable())

    def test_mode2_resumption_via_card_actions_from_external_interrupt(self):
        """
        When paused by an external video interrupt, wasPausedByUser is False.
        Resumption via 'play', 'pause', or 'playpause' MUST succeed without requiring wasPausedByUser.
        """
        for action in ['play', 'pause', 'playpause']:
            with self.subTest(action=action):
                session = SimulatedChromiumMediaSessionImpl()
                piyt = SimulatedPiYTRuntime(session)

                piyt.handle_play_action()
                piyt.trigger_external_audio_focus_loss()

                self.assertTrue(piyt.audio_player_paused)
                self.assertFalse(piyt.was_paused_by_user)
                self.assertEqual(piyt.media_session_playback_state, 'paused')

                # User taps card button to resume
                session.on_audio_focus_gain()
                if action == 'play':
                    piyt.handle_play_action()
                elif action == 'pause':
                    piyt.handle_pause_action()
                else:
                    piyt.handle_playpause_action()

                self.assertFalse(piyt.audio_player_paused, f"Action {action} failed to resume audioPlayer")
                self.assertFalse(piyt.was_paused_by_user)
                self.assertEqual(piyt.media_session_playback_state, 'playing')
                self.assertTrue(session.is_controllable())

    # Challenge 3: External Video Interrupt Single-Player Isolation

    def test_external_video_interrupt_enforces_single_player_isolation(self):
        """
        Directly challenges Chromium RemovePlayer() race condition (media_session_impl_decoded.cc:622).
        When external focus loss occurs:
        1. Anchor must be synchronously stopped.
        2. normal_players count must be exactly 1 (audioPlayer) or 0.
        3. Chromium OnPlayerPaused() must NOT call RemovePlayer(audioPlayer).
        4. Notification card must NOT be evicted.
        """
        session = SimulatedChromiumMediaSessionImpl()
        piyt = SimulatedPiYTRuntime(session)

        # 1. Mode 2 playing: both audioPlayer and anchor are active
        piyt.handle_play_action()
        self.assertEqual(len(session.normal_players), 2)
        self.assertIn('audioPlayer', session.normal_players)
        self.assertIn('anchor', session.normal_players)

        # 2. External app steals audio focus (AUDIOFOCUS_LOSS_TRANSIENT)
        initial_remove_calls = session.remove_player_call_count
        piyt.trigger_external_audio_focus_loss()

        # Anchor was stopped via stopLiveAudioAnchor()
        self.assertTrue(piyt.anchor_paused)
        self.assertNotIn('anchor', session.normal_players)

        # Exactly 1 player remains in normal_players: audioPlayer
        self.assertEqual(len(session.normal_players), 1)
        self.assertIn('audioPlayer', session.normal_players)

        # OnPlayerPaused executed with normal_players.size() == 1, so RemovePlayer was NOT called for audioPlayer
        # (Only anchor was cleanly removed during stopLiveAudioAnchor)
        self.assertEqual(session.remove_player_call_count, initial_remove_calls + 1)

        # Notification card was NOT evicted
        self.assertFalse(session.notification_evicted)
        self.assertEqual(piyt.media_session_playback_state, 'paused')
        self.assertTrue(piyt.was_playing_before_call)

    # Challenge 4: Sequential Focus Losses Stress Test

    def test_sequential_external_focus_losses_preserve_session_stability(self):
        """
        Adversarial test: Simulates multiple sequential external video interrupts
        without intermediate user playback.
        Ensures idempotent teardown, single-player isolation, and zero notification card eviction.
        """
        session = SimulatedChromiumMediaSessionImpl()
        piyt = SimulatedPiYTRuntime(session)

        piyt.handle_play_action()

        for step in range(5):
            # External interrupt
            piyt.trigger_external_audio_focus_loss()

            self.assertTrue(piyt.audio_player_paused)
            self.assertTrue(piyt.anchor_paused)
            self.assertEqual(len(session.normal_players), 1)
            self.assertFalse(session.notification_evicted)
            self.assertEqual(piyt.media_session_playback_state, 'paused')

            # External focus gain without user resumption
            session.on_audio_focus_gain()
            self.assertFalse(session.notification_evicted)

        # Finally, user taps resume
        piyt.handle_play_action()
        self.assertFalse(piyt.audio_player_paused)
        self.assertEqual(piyt.media_session_playback_state, 'playing')
        self.assertTrue(session.is_controllable())

    def test_external_interrupt_while_user_paused_prevents_focus_stealing(self):
        """
        Adversarial scenario: User is already paused in Mode 2 (anchor is playing to keep card pinned).
        An external video starts (AUDIOFOCUS_LOSS_TRANSIENT).
        The anchor pause event must NOT trigger an aggressive restart loop that steals focus back.
        """
        session = SimulatedChromiumMediaSessionImpl()
        piyt = SimulatedPiYTRuntime(session)

        # User pause
        piyt.handle_play_action()
        piyt.handle_pause_action()
        self.assertTrue(piyt.audio_player_paused)
        self.assertTrue(piyt.was_paused_by_user)
        self.assertFalse(piyt.anchor_paused)

        # External video interrupts anchor
        session.on_audio_focus_loss_transient()
        piyt.stop_live_audio_anchor()

        # Anchor is stopped, audioPlayer remains in session
        self.assertTrue(piyt.anchor_paused)
        self.assertEqual(len(session.normal_players), 1)
        self.assertFalse(session.notification_evicted)

    # Challenge 5: Static Code Inspection of R1 and R2 Guarantees

    def test_static_clear_spoof_burst_at_all_resume_sites(self):
        """Confirm clearSpoofBurst() is executed at all resumption paths in mediaSession.js"""
        # handlePlayAction
        self.assertIn("function handlePlayAction() {", self.ms_content)
        play_match = re.search(r"function handlePlayAction\(\)\s*\{[\s\S]*?clearSpoofBurst\(\);", self.ms_content)
        self.assertIsNotNone(play_match, "clearSpoofBurst() missing from handlePlayAction")

        # setActionHandler('pause') resume branch
        pause_match = re.search(r"setActionHandler\(['\"]pause['\"][\s\S]*?if\s*\(isActuallyPaused\)[\s\S]*?clearSpoofBurst\(\);", self.ms_content)
        self.assertIsNotNone(pause_match, "clearSpoofBurst() missing from setActionHandler('pause') resume branch")

        # setActionHandler('playpause') resume branch
        playpause_match = re.search(r"setActionHandler\(['\"]playpause['\"][\s\S]*?if\s*\(isActuallyPaused\)[\s\S]*?clearSpoofBurst\(\);", self.ms_content)
        self.assertIsNotNone(playpause_match, "clearSpoofBurst() missing from setActionHandler('playpause') resume branch")

        # audioPlayer 'play' listener
        player_play_match = re.search(r"audioPlayer\.addEventListener\(['\"]play['\"],\s*\(\)\s*=>\s*\{[\s\S]*?clearSpoofBurst\(\);", self.ms_content)
        self.assertIsNotNone(player_play_match, "clearSpoofBurst() missing from audioPlayer 'play' listener")

    def test_static_single_player_isolation_at_all_external_interrupt_sites(self):
        """Confirm stopLiveAudioAnchor and clean teardown are called on external pause in main.js and mediaSession.js"""
        # main.js audioPlayer pause listener
        main_pause_match = re.search(
            r"audioPlayer\.addEventListener\([\"']pause[\"'][\s\S]*?else\s*\{[\s\S]*?stopLiveAudioAnchor\(\);[\s\S]*?playbackState\s*=\s*['\"]paused['\"];",
            self.main_content
        )
        self.assertIsNotNone(main_pause_match, "Single-player isolation missing in main.js audioPlayer pause listener")

        # mediaSession.js audioPlayer pause listener
        ms_pause_match = re.search(
            r"audioPlayer\.addEventListener\([\"']pause[\"'][\s\S]*?else\s*\{[\s\S]*?stopLiveAudioAnchor\(\);",
            self.ms_content
        )
        self.assertIsNotNone(ms_pause_match, "Single-player isolation missing in mediaSession.js audioPlayer pause listener")

    def test_static_strictly_zero_emojis(self):
        """Strictly zero emojis across this adversarial test file"""
        with open(__file__, 'r', encoding='utf-8') as f:
            content = f.read()
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        matches = emoji_pattern.findall(content)
        self.assertEqual(matches, [], f"Found emojis in adversarial test file: {matches}")

    def test_static_unix_lf_line_endings(self):
        """Strictly UNIX LF line endings across this adversarial test file"""
        with open(__file__, 'rb') as f:
            raw = f.read()
        self.assertEqual(raw.count(b'\r\n'), 0, "Found CRLF endings in adversarial test file")


if __name__ == '__main__':
    unittest.main()
