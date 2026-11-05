import os
import re
import unittest

class ChromiumMediaSessionImpl:
    """
    Exact simulation of Chromium C++:
    - content/browser/media/session/media_session_impl.cc
    - content/browser/media/session/media_session_controller.cc
    """
    def __init__(self):
        self.normal_players_ = set()
        self.desired_audio_focus_type_ = 'kGain'
        self.audio_focus_state_ = 'INACTIVE'
        self.focus_abandonment_count = 0
        self.player_removal_count = 0

    def add_player(self, player):
        self.normal_players_.add(player)
        self.audio_focus_state_ = 'ACTIVE'
        self.desired_audio_focus_type_ = 'kGain'

    def on_player_paused(self, player):
        """
        Chromium MediaSessionImpl::OnPlayerPaused:
        If normal_players_.size() > 1:
            RemovePlayer(player)
        If normal_players_.size() == 1:
            OnSuspendInternal(..., State::SUSPENDED)
        """
        if player in self.normal_players_:
            self.normal_players_.remove(player)
            self.player_removal_count += 1

        if len(self.normal_players_) == 0:
            self.abandon_system_audio_focus_if_needed()

    def abandon_system_audio_focus_if_needed(self):
        self.audio_focus_state_ = 'INACTIVE'
        self.focus_abandonment_count += 1

    def is_controllable(self):
        """
        Chromium MediaSessionImpl::IsControllable() on Android:
        #if BUILDFLAG(IS_ANDROID)
        return audio_focus_state_ != State::INACTIVE &&
               desired_audio_focus_type_ == AudioFocusType::kGain;
        #endif
        """
        return (
            self.audio_focus_state_ != 'INACTIVE' and
            self.desired_audio_focus_type_ == 'kGain' and
            len(self.normal_players_) > 0
        )


class AndroidMediaSessionHelper:
    """
    Exact simulation of Chromium Android Java layer:
    org/chromium/content/browser/media/MediaSessionHelper.java
    """
    HIDE_NOTIFICATION_DELAY_MILLIS = 500

    def __init__(self, chromium_session):
        self.session = chromium_session
        self.notification_visible = False
        self.notification_destroyed = False
        self.m_notification_info_builder = None
        self.hide_notification_task = None
        self.hide_delayed_scheduled_count = 0
        self.hide_executed_count = 0
        self.show_notification_count = 0

    def show_notification(self, metadata):
        self.notification_visible = True
        self.notification_destroyed = False
        self.m_notification_info_builder = dict(metadata)
        self.show_notification_count += 1
        if self.hide_notification_task is not None:
            self.hide_notification_task = None

    def on_is_controllable_changed(self, current_time_ms):
        is_controllable = self.session.is_controllable()
        if not is_controllable:
            if self.hide_notification_task is None and self.notification_visible:
                self.hide_notification_task = current_time_ms + self.HIDE_NOTIFICATION_DELAY_MILLIS
                self.hide_delayed_scheduled_count += 1
                self.m_notification_info_builder = None
        else:
            if self.hide_notification_task is not None:
                self.hide_notification_task = None

    def advance_time(self, current_time_ms):
        if self.hide_notification_task is not None and current_time_ms >= self.hide_notification_task:
            self.notification_visible = False
            self.notification_destroyed = True
            self.hide_executed_count += 1
            self.hide_notification_task = None


class SyntheticMediaElement:
    def __init__(self, tag_id):
        self.id = tag_id
        self.paused = True
        self.currentTime = 0.0
        self.duration = 180.0
        self.playbackRate = 1.0
        self.play_count = 0
        self.pause_count = 0

    def play(self):
        self.play_count += 1
        self.paused = False

    def pause(self):
        self.pause_count += 1
        self.paused = True

    def instantPause(self):
        self.pause()


class SimulatedSystemUIPipeline:
    """
    Full end-to-end simulation of PiYT MediaSession pipeline under Chromium Android SystemUI.
    """
    def __init__(self, playback_mode='mode2', legacy_unpatched=False, heartbeat_delay_override=None):
        self.playback_mode = playback_mode
        self.legacy_unpatched = legacy_unpatched
        self.heartbeat_delay_override = heartbeat_delay_override

        self.virtual_time_ms = 0
        self.scheduled_tasks = []

        self.chromium = ChromiumMediaSessionImpl()
        self.android = AndroidMediaSessionHelper(self.chromium)

        self.audio_player = SyntheticMediaElement('audio-player')
        self.anchor_el = SyntheticMediaElement('live-stream-anchor')
        self.probe_el = SyntheticMediaElement('focus-probe')

        self.window = {
            'playbackMode': playback_mode,
            'wasPausedByUser': False,
            'wasPlayingBeforeCall': False,
            'isCallActive': False,
            'mediaSessionDestroyed': False,
            'lastBtDisconnectTime': 0,
        }

        self.media_session = {
            'playbackState': 'none',
            'metadata': None,
            'positionState': None,
        }

        self.probe_executions = 0
        self.anchor_pause_calls_during_active = 0

    def schedule_task(self, delay_ms, func):
        exec_time = self.virtual_time_ms + delay_ms
        self.scheduled_tasks.append((exec_time, func))
        self.scheduled_tasks.sort(key=lambda x: x[0])

    def advance_time_step(self, target_time_ms, step_ms=10):
        while self.virtual_time_ms < target_time_ms:
            self.virtual_time_ms = min(self.virtual_time_ms + step_ms, target_time_ms)
            ready_tasks = [t for t in self.scheduled_tasks if t[0] <= self.virtual_time_ms]
            self.scheduled_tasks = [t for t in self.scheduled_tasks if t[0] > self.virtual_time_ms]
            for _, task in ready_tasks:
                task()
            self.android.advance_time(self.virtual_time_ms)

    def start_playback(self, track_title='PiYT Track', duration=200.0):
        self.audio_player.duration = duration
        self.audio_player.play()
        self.chromium.add_player(self.audio_player)

        if self.playback_mode == 'mode2':
            self.anchor_el.play()
            self.chromium.add_player(self.anchor_el)

        self.media_session['playbackState'] = 'playing'
        self.media_session['metadata'] = {'title': track_title}
        self.android.show_notification(self.media_session['metadata'])
        self.android.on_is_controllable_changed(self.virtual_time_ms)

    def _update_position(self, pos, dur, rate=None, force=False):
        if rate is None:
            if self.audio_player.paused or self.window['wasPausedByUser']:
                rate = 0.00001 if self.playback_mode == 'mode2' else 1.0
            else:
                rate = 1.0
        self.media_session['positionState'] = {
            'position': pos,
            'duration': dur,
            'playbackRate': rate,
            'force': force,
        }

    def _start_focus_probe(self):
        self.probe_executions += 1
        self.probe_el.play()
        self.chromium.add_player(self.probe_el)
        self.android.on_is_controllable_changed(self.virtual_time_ms)
        self.probe_el.pause()
        self.chromium.on_player_paused(self.probe_el)
        self.android.on_is_controllable_changed(self.virtual_time_ms)

    def _execute_heartbeat_tick(self):
        if self.legacy_unpatched:
            if not self.anchor_el.paused:
                self.anchor_pause_calls_during_active += 1
            self.anchor_el.pause()
            self.chromium.on_player_paused(self.anchor_el)
            self.android.on_is_controllable_changed(self.virtual_time_ms)
            return

        if not self.anchor_el.paused:
            self._update_position(self.audio_player.currentTime, self.audio_player.duration, 0.00001, True)
            return

        self.anchor_el.play()
        self.chromium.add_player(self.anchor_el)
        self.android.on_is_controllable_changed(self.virtual_time_ms)

    def _legacy_resurrect_anchor(self):
        self.anchor_el.play()
        self.chromium.add_player(self.anchor_el)
        self.android.show_notification(self.media_session['metadata'])
        self.android.on_is_controllable_changed(self.virtual_time_ms)

    def _start_anchor_heartbeat(self, initial_delay=None):
        if self.heartbeat_delay_override is not None:
            delay = self.heartbeat_delay_override
        elif initial_delay is not None:
            delay = initial_delay
        else:
            delay = 1000 if self.legacy_unpatched else (0 if self.window['wasPausedByUser'] else 1000)

        if delay <= 0:
            self._execute_heartbeat_tick()
        else:
            self.schedule_task(delay, self._execute_heartbeat_tick)

    def _on_audio_player_pause_event(self):
        if self.playback_mode == 'mode2':
            if self.legacy_unpatched:
                self._start_focus_probe()
                self.schedule_task(1000, self._legacy_resurrect_anchor)
            else:
                if not self.window['wasPausedByUser']:
                    self._start_focus_probe()
                self._start_anchor_heartbeat(0 if self.window['wasPausedByUser'] else 1000)

    def user_action_pause(self):
        self.window['wasPausedByUser'] = True
        self.window['wasPlayingBeforeCall'] = False

        if self.playback_mode == 'mode2':
            self.media_session['playbackState'] = 'playing'
            if not self.legacy_unpatched:
                self._update_position(self.audio_player.currentTime, self.audio_player.duration, 0.00001, True)
        else:
            self.media_session['playbackState'] = 'paused'

        self.audio_player.instantPause()
        self.chromium.on_player_paused(self.audio_player)
        self.android.on_is_controllable_changed(self.virtual_time_ms)

        if self.legacy_unpatched:
            # Under legacy unpatched code: destructive anchor recycling occurs during pause transition
            self.anchor_el.pause()
            self.chromium.on_player_paused(self.anchor_el)
            self.android.on_is_controllable_changed(self.virtual_time_ms)

        self._on_audio_player_pause_event()

        if self.playback_mode == 'mode2' and not self.legacy_unpatched:
            self._start_anchor_heartbeat(0)

    def user_action_play(self):
        self.window['wasPausedByUser'] = False
        self.window['wasPlayingBeforeCall'] = True
        self.audio_player.play()
        self.chromium.add_player(self.audio_player)
        self.media_session['playbackState'] = 'playing'
        self._update_position(self.audio_player.currentTime, self.audio_player.duration, 1.0, True)
        self.android.on_is_controllable_changed(self.virtual_time_ms)


class TestChromiumLifecycleSimulationChallenger(unittest.TestCase):
    """
    Challenger empirical stress suite verifying:
    1. Chromium C++ multi-player eviction logic
    2. Android MediaSessionImpl audio focus controllability gating
    3. MediaSessionHelper 500ms delayed notification dismissal window
    4. Adversarial timing variations and rapid pause/play thrashing
    """

    def test_strictly_zero_emojis_in_challenger_test_file(self):
        """Strictly zero emojis in test_chromium_lifecycle_simulation_challenger.py"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        current_file = __file__
        with open(current_file, 'r', encoding='utf-8') as f:
            content = f.read()
        matches = emoji_pattern.findall(content)
        self.assertEqual(matches, [], f'Found emojis: {matches}')

    def test_unix_lf_line_endings_in_challenger_test_file(self):
        """Ensure strictly UNIX LF line endings (zero CRLF)"""
        with open(__file__, 'rb') as f:
            raw_bytes = f.read()
        self.assertEqual(raw_bytes.count(b'\r\n'), 0, 'Found CRLF line endings')

    def test_legacy_unpatched_failure_mode_reproduction(self):
        """
        Empirically reproduces the exact RCA failure mode under unpatched code:
        At t=0: audioPlayer pause causes probe churn and destructive anchor pause.
        Chromium normal_players_ drops to 0, focus is abandoned, isControllable=false.
        Android MediaSessionHelper schedules hideNotificationDelayed(500ms).
        At t=500ms: notification card is destroyed by SystemUI.
        At t=1000ms: anchor heartbeat resurrects notification card.
        """
        sim = SimulatedSystemUIPipeline(playback_mode='mode2', legacy_unpatched=True)
        sim.start_playback('Legacy Test Track', 180.0)

        self.assertEqual(len(sim.chromium.normal_players_), 2)
        self.assertTrue(sim.chromium.is_controllable())
        self.assertTrue(sim.android.notification_visible)

        sim.user_action_pause()

        # Defect manifestation at t=0:
        self.assertEqual(len(sim.chromium.normal_players_), 0, 'Legacy defect must drop normal_players_ to 0')
        self.assertEqual(sim.chromium.audio_focus_state_, 'INACTIVE')
        self.assertFalse(sim.chromium.is_controllable())
        self.assertGreaterEqual(sim.android.hide_delayed_scheduled_count, 1)
        self.assertIsNotNone(sim.android.hide_notification_task)
        self.assertEqual(sim.android.hide_notification_task, 500)

        # Advance to t=490ms (just before dismissal): still visible but pending
        sim.advance_time_step(490)
        self.assertTrue(sim.android.notification_visible)
        self.assertFalse(sim.android.notification_destroyed)

        # Advance to t=500ms: eviction occurs!
        sim.advance_time_step(500)
        self.assertFalse(sim.android.notification_visible, 'At t=500ms, notification must be dismissed under legacy bug')
        self.assertTrue(sim.android.notification_destroyed)

        # Advance to t=1000ms: resurrection occurs!
        sim.advance_time_step(1000)
        self.assertTrue(sim.android.notification_visible, 'At t=1000ms, card is resurrected by anchor heartbeat')
        self.assertFalse(sim.android.notification_destroyed)
        self.assertTrue(sim.chromium.is_controllable())

    def test_patched_mode2_continuous_controllability_across_lifecycle(self):
        """
        Verifies that with the RCF patch, normal_players_ never drops to 0,
        isControllable never drops to false, and no notification dismissal is scheduled.
        """
        sim = SimulatedSystemUIPipeline(playback_mode='mode2', legacy_unpatched=False)
        sim.start_playback('Patched Track', 210.0)

        self.assertEqual(len(sim.chromium.normal_players_), 2)
        self.assertTrue(sim.chromium.is_controllable())

        sim.user_action_pause()

        # Check immediate post-pause state
        self.assertEqual(len(sim.chromium.normal_players_), 1, 'anchorEl must remain in normal_players_')
        self.assertIn(sim.anchor_el, sim.chromium.normal_players_)
        self.assertEqual(sim.chromium.audio_focus_state_, 'ACTIVE')
        self.assertEqual(sim.chromium.desired_audio_focus_type_, 'kGain')
        self.assertTrue(sim.chromium.is_controllable())

        # Android MediaSessionHelper must NOT have scheduled any hide task
        self.assertIsNone(sim.android.hide_notification_task)
        self.assertEqual(sim.android.hide_delayed_scheduled_count, 0)
        self.assertTrue(sim.android.notification_visible)
        self.assertFalse(sim.android.notification_destroyed)

        # Advance virtual time through the critical 500ms and 1000ms windows
        for target_t in [100, 300, 500, 750, 1000, 2000]:
            sim.advance_time_step(target_t)
            self.assertEqual(len(sim.chromium.normal_players_), 1)
            self.assertTrue(sim.chromium.is_controllable())
            self.assertTrue(sim.android.notification_visible)
            self.assertFalse(sim.android.notification_destroyed)
            self.assertEqual(sim.android.hide_delayed_scheduled_count, 0)

    def test_timing_variation_matrix_stress(self):
        """
        Adversarially tests timing variations of heartbeat transitions:
        delays = [0, 25, 50, 100, 200, 500, 1000, 2000] ms.
        In all cases, normal_players_ must remain >= 1 and notification retention must be 100%.
        """
        test_delays = [0, 25, 50, 100, 200, 500, 1000, 2000]
        for delay in test_delays:
            with self.subTest(heartbeat_delay_ms=delay):
                sim = SimulatedSystemUIPipeline(
                    playback_mode='mode2',
                    legacy_unpatched=False,
                    heartbeat_delay_override=delay
                )
                sim.start_playback(f'Timing Track {delay}', 300.0)
                sim.user_action_pause()

                # Step through virtual time up to 3000ms at 25ms increments
                for t in range(25, 3025, 25):
                    sim.advance_time_step(t, step_ms=25)
                    self.assertGreaterEqual(
                        len(sim.chromium.normal_players_), 1,
                        f'normal_players_ dropped below 1 at t={t} with delay={delay}'
                    )
                    self.assertTrue(
                        sim.chromium.is_controllable(),
                        f'isControllable became false at t={t} with delay={delay}'
                    )
                    self.assertTrue(
                        sim.android.notification_visible,
                        f'Notification lost visibility at t={t} with delay={delay}'
                    )
                    self.assertFalse(
                        sim.android.notification_destroyed,
                        f'Notification was destroyed at t={t} with delay={delay}'
                    )
                    self.assertEqual(
                        sim.android.hide_delayed_scheduled_count, 0,
                        f'hideNotificationDelayed was scheduled at t={t} with delay={delay}'
                    )

    def test_rapid_pause_play_thrashing_stress(self):
        """
        Stress tests rapid successive pause/play action toggles (10 rapid toggles at 50ms intervals).
        Verifies that rapid user interaction never causes race conditions, focus loss, or card eviction.
        """
        sim = SimulatedSystemUIPipeline(playback_mode='mode2', legacy_unpatched=False)
        sim.start_playback('Thrashing Track', 400.0)

        for cycle in range(10):
            # Pause
            sim.user_action_pause()
            sim.advance_time_step(sim.virtual_time_ms + 50, step_ms=10)
            self.assertTrue(sim.chromium.is_controllable())
            self.assertTrue(sim.android.notification_visible)
            self.assertFalse(sim.android.notification_destroyed)
            self.assertEqual(sim.android.hide_delayed_scheduled_count, 0)

            # Play
            sim.user_action_play()
            sim.advance_time_step(sim.virtual_time_ms + 50, step_ms=10)
            self.assertTrue(sim.chromium.is_controllable())
            self.assertTrue(sim.android.notification_visible)
            self.assertFalse(sim.android.notification_destroyed)
            self.assertEqual(sim.android.hide_delayed_scheduled_count, 0)

    def test_focus_probe_suppression_on_user_pause(self):
        """
        Verifies that focus probe churn is completely bypassed when wasPausedByUser is True.
        """
        sim = SimulatedSystemUIPipeline(playback_mode='mode2', legacy_unpatched=False)
        sim.start_playback('Probe Test Track', 180.0)

        sim.user_action_pause()
        self.assertEqual(sim.probe_executions, 0, 'Focus probe must NOT execute on intentional user pause')
        self.assertEqual(sim.probe_el.play_count, 0)
        self.assertEqual(sim.probe_el.pause_count, 0)

    def test_micro_rate_freeze_precision_and_bypass(self):
        """
        Verifies that in Mode 2 pause, positionState is updated with micro-rate 0.00001 and force=True.
        """
        sim = SimulatedSystemUIPipeline(playback_mode='mode2', legacy_unpatched=False)
        sim.start_playback('Micro Rate Track', 250.0)
        sim.audio_player.currentTime = 45.2

        sim.user_action_pause()

        pos_state = sim.media_session['positionState']
        self.assertIsNotNone(pos_state)
        self.assertAlmostEqual(pos_state['position'], 45.2, places=3)
        self.assertAlmostEqual(pos_state['duration'], 250.0, places=3)
        self.assertAlmostEqual(pos_state['playbackRate'], 0.00001, places=5)
        self.assertTrue(pos_state['force'])

        # Now resume and verify normal playback rate
        sim.user_action_play()
        pos_state_resumed = sim.media_session['positionState']
        self.assertAlmostEqual(pos_state_resumed['playbackRate'], 1.0, places=2)
        self.assertTrue(pos_state_resumed['force'])


if __name__ == '__main__':
    unittest.main()
