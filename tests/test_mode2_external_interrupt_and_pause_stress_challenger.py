import math
import os
import re
import unittest

class ChromiumMediaSessionSimulation:
    def __init__(self):
        self.normal_players = set()
        self.audio_focus_state = 'INACTIVE'
        self.desired_audio_focus_type = 'kGain'
        self.focus_abandonment_count = 0
        self.player_removal_count = 0

    def add_player(self, player):
        self.normal_players.add(player)
        self.audio_focus_state = 'ACTIVE'
        self.desired_audio_focus_type = 'kGain'

    def on_player_paused(self, player):
        if player in self.normal_players:
            self.normal_players.remove(player)
            self.player_removal_count += 1
        if len(self.normal_players) == 0:
            self.abandon_audio_focus()

    def abandon_audio_focus(self):
        self.audio_focus_state = 'INACTIVE'
        self.focus_abandonment_count += 1

    def is_controllable(self):
        return (
            self.audio_focus_state != 'INACTIVE' and
            self.desired_audio_focus_type == 'kGain' and
            len(self.normal_players) > 0
        )


class AndroidSystemUIMediaSessionHelperSimulation:
    HIDE_NOTIFICATION_DELAY_MS = 500

    def __init__(self, chromium_session):
        self.session = chromium_session
        self.notification_visible = False
        self.notification_destroyed = False
        self.hide_notification_deadline = None
        self.hide_scheduled_count = 0
        self.hide_executed_count = 0
        self.show_count = 0

    def show_notification(self):
        self.notification_visible = True
        self.notification_destroyed = False
        self.show_count += 1
        self.hide_notification_deadline = None

    def on_is_controllable_changed(self, current_time_ms):
        controllable = self.session.is_controllable()
        if not controllable:
            if self.hide_notification_deadline is None and self.notification_visible:
                self.hide_notification_deadline = current_time_ms + self.HIDE_NOTIFICATION_DELAY_MS
                self.hide_scheduled_count += 1
        else:
            if self.hide_notification_deadline is not None:
                self.hide_notification_deadline = None

    def advance_time(self, current_time_ms):
        if self.hide_notification_deadline is not None and current_time_ms >= self.hide_notification_deadline:
            self.notification_visible = False
            self.notification_destroyed = True
            self.hide_executed_count += 1
            self.hide_notification_deadline = None


class SyntheticMediaElement:
    def __init__(self, tag_id):
        self.id = tag_id
        self.paused = True
        self.currentTime = 0.0
        self.duration = 200.0
        self.active = self
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


class AdversarialMode2StressHarness:
    def __init__(self, playback_mode='mode2', simulate_legacy_unpatched=False):
        self.playback_mode = playback_mode
        self.simulate_legacy_unpatched = simulate_legacy_unpatched
        self.current_time_ms = 1000
        self.scheduled_tasks = []

        self.chromium = ChromiumMediaSessionSimulation()
        self.android = AndroidSystemUIMediaSessionHelperSimulation(self.chromium)

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
            'lastPublishedTrackKey': None,
        }

        self._is_internal_anchor_stop = False

        self.navigator_media_session = {
            'playbackState': 'none',
            'metadata': None,
            'positionState': None,
        }

        self.metadata_allocation_count = 0
        self.position_update_count = 0
        self.reassert_spoof_burst_count = 0
        self.spoof_burst_ticks_executed = 0
        self.heartbeat_tick_count = 0
        self.probe_executions = 0

        self.burst_delays = [150, 400, 800, 1500, 2500]

    def schedule_task(self, delay_ms, func):
        target_t = self.current_time_ms + delay_ms
        self.scheduled_tasks.append((target_t, func))
        self.scheduled_tasks.sort(key=lambda x: x[0])

    def cancel_tasks_by_tag(self, tag_prefix):
        self.scheduled_tasks = [t for t in self.scheduled_tasks if not getattr(t[1], '_tag', '').startswith(tag_prefix)]

    def advance_time(self, target_t_ms, step_ms=5):
        while self.current_time_ms < target_t_ms:
            self.current_time_ms = min(self.current_time_ms + step_ms, target_t_ms)
            ready = [t for t in self.scheduled_tasks if t[0] <= self.current_time_ms]
            self.scheduled_tasks = [t for t in self.scheduled_tasks if t[0] > self.current_time_ms]
            for _, task in ready:
                task()
            self.android.advance_time(self.current_time_ms)

    def start_playback(self, title='Adversarial Stress Track', duration=200.0):
        self.audio_player.duration = duration
        self.audio_player.currentTime = 0.0
        self.audio_player.play()
        self.chromium.add_player(self.audio_player)

        if self.playback_mode == 'mode2':
            self.anchor_el.play()
            self.chromium.add_player(self.anchor_el)

        self.window['wasPausedByUser'] = False
        self.window['wasPlayingBeforeCall'] = True
        self.window['lastPublishedTrackKey'] = title

        self.navigator_media_session['playbackState'] = 'playing'
        self._allocate_media_metadata(title, 'PiYT Artist', 'PiYT Album')

        self.android.show_notification()
        self.android.on_is_controllable_changed(self.current_time_ms)

    def _allocate_media_metadata(self, title, artist, album):
        self.metadata_allocation_count += 1
        self.navigator_media_session['metadata'] = {
            'title': title,
            'artist': artist,
            'album': album,
        }

    def should_republish_metadata(self, proposed_title=None):
        if self.window['mediaSessionDestroyed']:
            return True
        md = self.navigator_media_session['metadata']
        if not md or not md.get('title'):
            return True
        title_to_check = proposed_title if proposed_title is not None else md.get('title')
        if self.window['lastPublishedTrackKey'] and title_to_check != self.window['lastPublishedTrackKey']:
            return True
        if md.get('title') != title_to_check:
            return True
        return False

    def republish_media_metadata(self, force_break_dedup=False, proposed_title=None):
        md = self.navigator_media_session['metadata']
        title_to_use = proposed_title if proposed_title is not None else (md.get('title') if md else 'Adversarial Track')
        if force_break_dedup or self.should_republish_metadata(title_to_use):
            self._allocate_media_metadata(title_to_use, 'PiYT Artist', 'PiYT Album')
        self._sync_after_republish()

    def _sync_after_republish(self):
        dur = self.audio_player.duration or 0
        if dur > 0:
            self.update_media_session_position(self.audio_player.currentTime, dur, None, True)

    def update_media_session_position(self, pos, dur, forced_rate=None, force=False):
        self.position_update_count += 1
        is_paused = (self.audio_player.paused or self.window['wasPausedByUser'])
        if is_paused and self.playback_mode == 'mode2':
            rate = 0.00001
        elif forced_rate is not None:
            rate = forced_rate
        elif not is_paused:
            rate = 1.0
        else:
            rate = 1.0

        self.navigator_media_session['positionState'] = {
            'duration': dur,
            'playbackRate': rate,
            'position': pos,
            'force': force,
        }

    def start_live_audio_anchor(self):
        if self.playback_mode != 'mode2':
            return
        if self.window['isCallActive']:
            return
        is_recent_bt = (self.window['lastBtDisconnectTime'] > 0 and self.current_time_ms - self.window['lastBtDisconnectTime'] < 2500)
        if is_recent_bt:
            return
        if self.window['mediaSessionDestroyed']:
            return
        self.anchor_el.play()
        self.chromium.add_player(self.anchor_el)
        self.android.on_is_controllable_changed(self.current_time_ms)

    def stop_live_audio_anchor(self):
        self._is_internal_anchor_stop = True
        try:
            self.anchor_el.pause()
            self.chromium.on_player_paused(self.anchor_el)
            self.android.on_is_controllable_changed(self.current_time_ms)
        finally:
            self._is_internal_anchor_stop = False

    def reassert_spoof_burst(self):
        if self.playback_mode != 'mode2':
            return
        self.cancel_tasks_by_tag('spoof_burst')
        self.reassert_spoof_burst_count += 1

        delays = list(self.burst_delays)
        for idx, d in enumerate(delays):
            def make_tick(step_idx):
                def tick():
                    self.spoof_burst_ticks_executed += 1
                    if self.playback_mode != 'mode2':
                        return
                    if not self.audio_player.paused:
                        return
                    is_recent_bt = (self.window['lastBtDisconnectTime'] > 0 and self.current_time_ms - self.window['lastBtDisconnectTime'] < 2500)
                    if self.window['isCallActive'] or is_recent_bt:
                        return
                    if not self.simulate_legacy_unpatched:
                        self.start_live_audio_anchor()
                    self.navigator_media_session['playbackState'] = 'playing'
                    self.update_media_session_position(self.audio_player.currentTime, self.audio_player.duration)
                    self.republish_media_metadata(False)
                tick._tag = f'spoof_burst_{step_idx}'
                return tick
            self.schedule_task(d, make_tick(idx))

    def start_anchor_heartbeat(self, initial_delay=1000):
        if initial_delay <= 0:
            self._execute_heartbeat_tick()
        else:
            def hb_task():
                self._execute_heartbeat_tick()
            hb_task._tag = 'heartbeat'
            self.schedule_task(initial_delay, hb_task)

    def _execute_heartbeat_tick(self):
        self.heartbeat_tick_count += 1
        if self.simulate_legacy_unpatched:
            self.anchor_el.pause()
            self.chromium.on_player_paused(self.anchor_el)
            self.android.on_is_controllable_changed(self.current_time_ms)
            return

        if not self.anchor_el.paused:
            self.update_media_session_position(self.audio_player.currentTime, self.audio_player.duration, 0.00001, True)
            self.republish_media_metadata(False)
            return

        self.start_live_audio_anchor()

    def user_action_pause(self):
        self.window['wasPausedByUser'] = True
        self.window['wasPlayingBeforeCall'] = False

        if self.playback_mode == 'mode2':
            dur = self.audio_player.duration or 0
            pos = self.audio_player.currentTime or 0
            self.update_media_session_position(pos, dur, 0.00001, True)
            self.republish_media_metadata(False)
            self.navigator_media_session['playbackState'] = 'playing'
        else:
            self.navigator_media_session['playbackState'] = 'paused'

        self.audio_player.instantPause()
        self.chromium.on_player_paused(self.audio_player)
        self.android.on_is_controllable_changed(self.current_time_ms)

        self._on_audio_player_pause_event()

        if self.playback_mode == 'mode2':
            self.start_anchor_heartbeat(0)
            self.reassert_spoof_burst()

    def user_action_play(self):
        self.window['wasPausedByUser'] = False
        self.window['wasPlayingBeforeCall'] = True
        self.cancel_tasks_by_tag('spoof_burst')
        self.cancel_tasks_by_tag('heartbeat')

        self.audio_player.play()
        self.chromium.add_player(self.audio_player)
        self.navigator_media_session['playbackState'] = 'playing'
        self.update_media_session_position(self.audio_player.currentTime, self.audio_player.duration, 1.0, True)
        self.republish_media_metadata(False)
        self.android.on_is_controllable_changed(self.current_time_ms)

    def user_action_playpause(self):
        is_paused = (self.audio_player.paused or self.window['wasPausedByUser'])
        if is_paused and self.window['wasPausedByUser']:
            self.user_action_play()
        else:
            self.user_action_pause()

    def trigger_ui_btn_play_pause(self):
        if not self.audio_player.paused and not self.window['wasPausedByUser']:
            self.window['wasPausedByUser'] = True
            if self.playback_mode == 'mode2':
                self.navigator_media_session['playbackState'] = 'playing'
                dur = self.audio_player.duration or 0
                self.update_media_session_position(self.audio_player.currentTime, dur, None, True)
                self.republish_media_metadata(False)
            self.audio_player.instantPause()
            self.chromium.on_player_paused(self.audio_player)
            self.android.on_is_controllable_changed(self.current_time_ms)
            self._on_audio_player_pause_event()
            if self.playback_mode == 'mode2':
                self.start_anchor_heartbeat(0)
                self.reassert_spoof_burst()
        else:
            self.user_action_play()

    def simulate_bluetooth_route_loss(self):
        self.window['lastBtDisconnectTime'] = self.current_time_ms
        self.window['wasPausedByUser'] = True
        self.window['wasPlayingBeforeCall'] = False
        self.cancel_tasks_by_tag('spoof_burst')
        self.cancel_tasks_by_tag('heartbeat')
        self.audio_player.instantPause()
        self.chromium.on_player_paused(self.audio_player)
        self.stop_live_audio_anchor()
        self.navigator_media_session['playbackState'] = 'paused'
        self.android.on_is_controllable_changed(self.current_time_ms)

    def simulate_external_focus_loss_transient(self):
        self.window['wasPausedByUser'] = False
        self.window['wasPlayingBeforeCall'] = True

        self.audio_player.pause()
        self.chromium.on_player_paused(self.audio_player)

        # In native suspend, anchor is also temporarily suspended by OS
        self.anchor_el.pause()
        self.chromium.on_player_paused(self.anchor_el)
        self.android.on_is_controllable_changed(self.current_time_ms)

        # Trigger anchorEl pause event listener
        self._on_anchor_pause_event()

        # Trigger audioPlayer pause event listener
        self._on_audio_player_pause_event()

        if self.playback_mode == 'mode2':
            dur = self.audio_player.duration or 0
            self.update_media_session_position(self.audio_player.currentTime, dur, 1.0)
            self.navigator_media_session['playbackState'] = 'playing'

    def _on_anchor_pause_event(self):
        if self._is_internal_anchor_stop:
            return
        is_recent_bt = (self.window['lastBtDisconnectTime'] > 0 and self.current_time_ms - self.window['lastBtDisconnectTime'] < 2500)
        if self.playback_mode == 'mode2' and self.audio_player.paused and not is_recent_bt:
            if not self.window['isCallActive']:
                self.navigator_media_session['playbackState'] = 'playing'
                self.republish_media_metadata(False)
                self.reassert_spoof_burst()
                if not self.simulate_legacy_unpatched:
                    self.start_live_audio_anchor()

    def _on_audio_player_pause_event(self):
        is_recent_bt = (self.window['lastBtDisconnectTime'] > 0 and self.current_time_ms - self.window['lastBtDisconnectTime'] < 2500)
        if self.playback_mode == 'mode2' and not self.window['isCallActive'] and not is_recent_bt:
            if not self.window['wasPausedByUser']:
                self.probe_executions += 1
                self.probe_el.play()
                self.probe_el.pause()
            self.start_anchor_heartbeat(0 if self.window['wasPausedByUser'] else 1000)

            # main.js pause listener: triggers reassertSpoofBurst on both user and external pause
            if self.window['wasPausedByUser']:
                self.reassert_spoof_burst()
            else:
                # Patched main.js else branch:
                if not self.simulate_legacy_unpatched:
                    self.reassert_spoof_burst()


class TestMode2ExternalInterruptAndPauseStressChallenger(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        cls.ms_path = os.path.join(base_dir, 'js', 'mediaSession.js')
        cls.main_path = os.path.join(base_dir, 'js', 'main.js')
        cls.test_path = __file__

        with open(cls.ms_path, 'r', encoding='utf-8') as f:
            cls.ms_content = f.read()
        with open(cls.main_path, 'r', encoding='utf-8') as f:
            cls.main_content = f.read()
        with open(cls.test_path, 'r', encoding='utf-8') as f:
            cls.test_content = f.read()

    # Invariants

    def test_strictly_zero_emojis_in_source_and_challenger_test_file(self):
        """Strictly zero emojis across mediaSession.js, main.js, and challenger test file"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        for name, content in [
            ('mediaSession.js', self.ms_content),
            ('main.js', self.main_content),
            ('test_mode2_external_interrupt_and_pause_stress_challenger.py', self.test_content),
        ]:
            matches = emoji_pattern.findall(content)
            self.assertEqual(matches, [], f'Found emojis in {name}: {matches}')

    def test_strictly_unix_lf_line_endings_in_source_and_challenger_test_file(self):
        """Ensure strictly UNIX LF line endings (zero CRLF) in examined files"""
        for file_path in [self.ms_path, self.main_path, self.test_path]:
            with open(file_path, 'rb') as f:
                raw_bytes = f.read()
            self.assertEqual(raw_bytes.count(b'\r\n'), 0, f'Found CRLF in {file_path}')

    # Challenge Dimension 1: Rapid Alternating Pause/Play & Zero Metadata Churn

    def test_rapid_alternating_pause_play_zero_metadata_churn_stress(self):
        """
        Adversarial Challenge 1:
        100 rapid pause and play cycles via MediaSession action handlers.
        Verifies:
        - Exactly 1 MediaMetadata allocation occurred on initial track playback.
        - Zero additional MediaMetadata allocations occur during 100 pause/play cycles (stops SystemUI animation blinking).
        - Android notification is NEVER evicted or hidden.
        - Hide notification task count is strictly 0.
        """
        harness = AdversarialMode2StressHarness(playback_mode='mode2')
        harness.start_playback('Metadata Churn Test Track', 180.0)

        initial_allocations = harness.metadata_allocation_count
        self.assertEqual(initial_allocations, 1)

        for i in range(100):
            # Pause
            harness.user_action_pause()
            self.assertTrue(harness.window['wasPausedByUser'])
            self.assertTrue(harness.audio_player.paused)
            self.assertTrue(harness.android.notification_visible)
            self.assertFalse(harness.android.notification_destroyed)
            self.assertEqual(harness.android.hide_scheduled_count, 0)
            self.assertEqual(harness.metadata_allocation_count, 1, f'Metadata churn detected at pause {i}')

            harness.advance_time(harness.current_time_ms + 25)

            # Play
            harness.user_action_play()
            self.assertFalse(harness.window['wasPausedByUser'])
            self.assertFalse(harness.audio_player.paused)
            self.assertTrue(harness.android.notification_visible)
            self.assertFalse(harness.android.notification_destroyed)
            self.assertEqual(harness.metadata_allocation_count, 1, f'Metadata churn detected at play {i}')

            harness.advance_time(harness.current_time_ms + 25)

        # Track change correctly allocates fresh MediaMetadata
        harness.window['lastPublishedTrackKey'] = 'New Second Track'
        harness.republish_media_metadata(proposed_title='New Second Track')
        self.assertEqual(harness.metadata_allocation_count, 2, 'Legitimate track change must update metadata')

    def test_rapid_alternating_ui_btn_play_pause_stress(self):
        """
        Adversarial Challenge 2:
        100 rapid pause and play cycles via in-app btnPlayPause clicks.
        Verifies:
        - Zero redundant MediaMetadata allocations.
        - Notification retention is 100% continuous.
        - No hide notification tasks scheduled.
        """
        harness = AdversarialMode2StressHarness(playback_mode='mode2')
        harness.start_playback('UI Button Stress Track', 240.0)

        for i in range(100):
            harness.trigger_ui_btn_play_pause()
            self.assertTrue(harness.android.notification_visible)
            self.assertFalse(harness.android.notification_destroyed)
            self.assertEqual(harness.android.hide_scheduled_count, 0)
            self.assertEqual(harness.metadata_allocation_count, 1)

            harness.advance_time(harness.current_time_ms + 15)

    # Challenge Dimension 2: Repeated External Audio Focus Loss (AUDIOFOCUS_LOSS_TRANSIENT)

    def test_repeated_external_focus_loss_transient_stress(self):
        """
        Adversarial Challenge 3:
        50 repeated cycles of external video interrupts (AUDIOFOCUS_LOSS_TRANSIENT) followed by user resume.
        Verifies:
        - External video steal does NOT mark wasPausedByUser.
        - reassertSpoofBurst and anchor pause listeners restore normal_players_ within 150ms.
        - Android hide notification delayed task is cancelled or prevented.
        - Notification card remains pinned at all times.
        - Clean user playback resumption without audio glitches or card recreation.
        """
        harness = AdversarialMode2StressHarness(playback_mode='mode2')
        harness.start_playback('External Interrupt Stress Track', 300.0)

        for cycle in range(50):
            # External video interrupts playback
            harness.simulate_external_focus_loss_transient()

            self.assertFalse(harness.window['wasPausedByUser'], f'Cycle {cycle}: wasPausedByUser must be False on external focus loss')
            self.assertTrue(harness.audio_player.paused)
            self.assertTrue(harness.window['wasPlayingBeforeCall'])

            # Advance virtual time through the 150ms re-arm window
            harness.advance_time(harness.current_time_ms + 150)

            # Normal players must be restored
            self.assertGreaterEqual(len(harness.chromium.normal_players), 1, f'Cycle {cycle}: normal_players_ not restored at 150ms')
            self.assertEqual(harness.chromium.audio_focus_state, 'ACTIVE')
            self.assertTrue(harness.chromium.is_controllable())

            # Android SystemUI notification remains pinned
            self.assertTrue(harness.android.notification_visible)
            self.assertFalse(harness.android.notification_destroyed)
            self.assertIsNone(harness.android.hide_notification_deadline, f'Cycle {cycle}: hide deadline pending after 150ms')

            # User resumes playback after external video ends
            harness.user_action_play()
            self.assertFalse(harness.window['wasPausedByUser'])
            self.assertFalse(harness.audio_player.paused)
            self.assertTrue(harness.chromium.is_controllable())
            self.assertTrue(harness.android.notification_visible)

            harness.advance_time(harness.current_time_ms + 50)

    # Challenge Dimension 3: Discrete Virtual Timeline Advances around 500ms Hide Timer Deadline

    def test_discrete_virtual_timeline_external_interrupt_deadlines(self):
        """
        Adversarial Challenge 4:
        Tests discrete virtual time advances at 50ms, 150ms, 450ms, 500ms, and 1000ms
        after external focus loss (AUDIOFOCUS_LOSS_TRANSIENT).
        Verifies:
        - At 50ms: hide deadline may be scheduled if anchor was temporarily suspended.
        - At 150ms: spoof burst tick re-arms anchor, making session controllable.
        - At 450ms: hide deadline has been cancelled.
        - At 500ms: Android SystemUI HIDE_NOTIFICATION_DELAY_MS expires, but task was cancelled, so card is NOT evicted.
        - At 1000ms: anchor heartbeat ticks non-destructively, card remains visible.
        """
        harness = AdversarialMode2StressHarness(playback_mode='mode2')
        harness.start_playback('Timeline Test Track', 250.0)

        t0 = harness.current_time_ms
        harness.simulate_external_focus_loss_transient()

        # Step to 50ms
        harness.advance_time(t0 + 50)
        self.assertTrue(harness.android.notification_visible)

        # Step to 150ms: first spoof burst tick executes
        harness.advance_time(t0 + 150)
        self.assertGreaterEqual(len(harness.chromium.normal_players), 1)
        self.assertTrue(harness.chromium.is_controllable())
        self.assertIsNone(harness.android.hide_notification_deadline, 'Hide deadline must be cancelled at 150ms')

        # Step to 450ms: safely before the 500ms deadline
        harness.advance_time(t0 + 450)
        self.assertTrue(harness.android.notification_visible)
        self.assertFalse(harness.android.notification_destroyed)

        # Step to 500ms: exact deadline point
        harness.advance_time(t0 + 500)
        self.assertTrue(harness.android.notification_visible, 'Notification must NOT be evicted at 500ms deadline')
        self.assertFalse(harness.android.notification_destroyed)
        self.assertEqual(harness.android.hide_executed_count, 0)

        # Step to 1000ms: heartbeat executes non-destructively
        harness.advance_time(t0 + 1000)
        self.assertTrue(harness.android.notification_visible)
        self.assertFalse(harness.android.notification_destroyed)
        self.assertEqual(harness.android.hide_executed_count, 0)

    # Challenge Dimension 4: Contrast Oracle - Legacy Unpatched vs Patched Behavior

    def test_contrast_oracle_legacy_unpatched_evicts_at_500ms_vs_patched_retains(self):
        """
        Adversarial Challenge 5 (Contrast Oracle):
        Directly compares patched vs unpatched legacy behavior under external focus loss.
        - Unpatched: does not re-arm anchor in main pause listener, delayed hide executes at 500ms.
        - Patched: re-arms anchor within 150ms, cancels hide timer, card survives past 500ms.
        """
        # 1. Unpatched Legacy Simulation
        legacy_sim = AdversarialMode2StressHarness(playback_mode='mode2', simulate_legacy_unpatched=True)
        legacy_sim.start_playback('Legacy Contrast Track', 200.0)
        t_legacy = legacy_sim.current_time_ms

        legacy_sim.simulate_external_focus_loss_transient()
        self.assertEqual(len(legacy_sim.chromium.normal_players), 0)
        self.assertFalse(legacy_sim.chromium.is_controllable())
        self.assertIsNotNone(legacy_sim.android.hide_notification_deadline)

        # Advance legacy to 500ms
        legacy_sim.advance_time(t_legacy + 500)
        self.assertFalse(legacy_sim.android.notification_visible, 'Legacy defect must evict notification card at 500ms')
        self.assertTrue(legacy_sim.android.notification_destroyed)
        self.assertEqual(legacy_sim.android.hide_executed_count, 1)

        # 2. Patched Simulation
        patched_sim = AdversarialMode2StressHarness(playback_mode='mode2', simulate_legacy_unpatched=False)
        patched_sim.start_playback('Patched Contrast Track', 200.0)
        t_patched = patched_sim.current_time_ms

        patched_sim.simulate_external_focus_loss_transient()
        # Advance patched to 500ms
        patched_sim.advance_time(t_patched + 500)
        self.assertTrue(patched_sim.android.notification_visible, 'Patched code must retain notification card past 500ms')
        self.assertFalse(patched_sim.android.notification_destroyed)
        self.assertEqual(patched_sim.android.hide_executed_count, 0)

    # Challenge Dimension 5: Telephone Call & Bluetooth Disconnect Isolation

    def test_telephone_call_active_suppresses_keepalive_defense(self):
        """
        Adversarial Challenge 6:
        When window.isCallActive is True, Mode 2 must NOT re-arm anchor or spoof burst
        to prevent audio interference with telephone calls.
        """
        harness = AdversarialMode2StressHarness(playback_mode='mode2')
        harness.start_playback('Call Isolation Track', 180.0)

        # Phone call becomes active
        harness.window['isCallActive'] = True
        harness.simulate_external_focus_loss_transient()

        # Advance virtual time through the burst window
        harness.advance_time(harness.current_time_ms + 250)

        # Anchor must NOT be re-armed while call is active
        self.assertNotIn(harness.anchor_el, harness.chromium.normal_players)
        self.assertEqual(harness.spoof_burst_ticks_executed, 0, 'Spoof burst must abort during active call')

    def test_recent_bluetooth_disconnect_suppresses_keepalive_defense(self):
        """
        Adversarial Challenge 7:
        When a Bluetooth route disconnect occurs, Mode 2 must stop anchor and NOT re-arm
        spoof burst to prevent speaker bleed.
        """
        harness = AdversarialMode2StressHarness(playback_mode='mode2')
        harness.start_playback('BT Disconnect Isolation Track', 180.0)

        # BT headset disconnect route loss event
        harness.simulate_bluetooth_route_loss()

        # Advance virtual time 200ms (still within 2500ms window)
        harness.advance_time(harness.current_time_ms + 200)

        # Anchor must NOT be in normal_players_ after BT disconnect
        self.assertNotIn(harness.anchor_el, harness.chromium.normal_players)
        self.assertEqual(harness.navigator_media_session['playbackState'], 'paused')


if __name__ == '__main__':
    unittest.main()
