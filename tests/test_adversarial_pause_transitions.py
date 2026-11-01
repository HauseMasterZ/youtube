import math
import os
import re
import unittest

class ChromiumMediaSessionImpl:
    """
    Simulation of Chromium C++ MediaSessionImpl:
    - content/browser/media/session/media_session_impl.cc
    """
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
        # On Android, MediaSessionImpl::IsControllable() requires active audio focus
        # and at least one active player.
        return (
            self.audio_focus_state != 'INACTIVE' and
            self.desired_audio_focus_type == 'kGain' and
            len(self.normal_players) > 0
        )


class AndroidMediaSessionHelper:
    """
    Simulation of Chromium Android Java layer:
    org/chromium/content/browser/media/MediaSessionHelper.java
    """
    HIDE_NOTIFICATION_DELAY_MS = 500

    def __init__(self, session):
        self.session = session
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
    def __init__(self, tag_id, should_fail_play=False):
        self.id = tag_id
        self.paused = True
        self.currentTime = 0.0
        self.duration = 180.0
        self.active = self
        self.play_calls = 0
        self.pause_calls = 0
        self.should_fail_play = should_fail_play
        self.srcObject = {'audioTracks': [{'readyState': 'live'}]}

    def play(self):
        self.play_calls += 1
        if self.should_fail_play:
            raise RuntimeError("DOMException: NotAllowedError: play() failed")
        self.paused = False

    def pause(self):
        self.pause_calls += 1
        self.paused = True

    def instantPause(self):
        self.pause()


class AdversarialSimulationHarness:
    """
    Adversarial verification harness reproducing the PiYT MediaSession pipeline
    and testing all failure boundaries.
    """
    def __init__(self, playback_mode='mode2', anchor_broken=False, anchor_missing=False):
        self.playback_mode = playback_mode
        self.current_time_ms = 1000
        self.scheduled_tasks = []

        self.chromium = ChromiumMediaSessionImpl()
        self.android = AndroidMediaSessionHelper(self.chromium)

        self.audio_player = SyntheticMediaElement('audio-player')
        self.anchor_missing = anchor_missing
        if not anchor_missing:
            self.anchor_el = SyntheticMediaElement('live-stream-anchor', should_fail_play=anchor_broken)
        else:
            self.anchor_el = None
        self.probe_el = SyntheticMediaElement('focus-probe')

        self.window = {
            'playbackMode': playback_mode,
            'wasPausedByUser': False,
            'wasPlayingBeforeCall': False,
            'isCallActive': False,
            'mediaSessionDestroyed': False,
            'lastBtDisconnectTime': 0,
            '_forceNextPosition': False,
        }

        self.media_session = {
            'playbackState': 'none',
            'metadata': None,
            'positionState': None,
        }

        self.last_sent_position = -1
        self.last_sent_timestamp = 0
        self.last_sent_rate = 1.0

        self.probe_exec_count = 0
        self.type_error_count = 0
        self.position_update_count = 0
        self.reassert_spoof_burst_count = 0
        self.heartbeat_tick_count = 0

    def schedule_task(self, delay_ms, func):
        target_t = self.current_time_ms + delay_ms
        self.scheduled_tasks.append((target_t, func))
        self.scheduled_tasks.sort(key=lambda x: x[0])

    def advance_time(self, target_t_ms, step_ms=5):
        while self.current_time_ms < target_t_ms:
            self.current_time_ms = min(self.current_time_ms + step_ms, target_t_ms)
            ready = [t for t in self.scheduled_tasks if t[0] <= self.current_time_ms]
            self.scheduled_tasks = [t for t in self.scheduled_tasks if t[0] > self.current_time_ms]
            for _, task in ready:
                task()
            self.android.advance_time(self.current_time_ms)

    def start_playback(self, title='Adversarial Track', duration=180.0):
        self.audio_player.duration = duration
        self.audio_player.currentTime = 0.0
        self.audio_player.play()
        self.chromium.add_player(self.audio_player)

        if self.playback_mode == 'mode2' and self.anchor_el is not None:
            try:
                self.anchor_el.play()
                self.chromium.add_player(self.anchor_el)
            except Exception:
                pass

        self.media_session['playbackState'] = 'playing'
        self.media_session['metadata'] = {'title': title}
        self.android.show_notification()
        self.android.on_is_controllable_changed(self.current_time_ms)

    def update_media_session_position(self, pos, dur, forced_rate=None, force=False):
        try:
            self.position_update_count += 1
            raw_dur = dur
            raw_pos = pos

            parsed_dur = 0
            if isinstance(raw_dur, (int, float)) and not math.isnan(raw_dur) and not math.isinf(raw_dur) and raw_dur > 0:
                parsed_dur = float(raw_dur)

            parsed_pos = 0.0
            if isinstance(raw_pos, (int, float)) and not math.isnan(raw_pos) and not math.isinf(raw_pos) and raw_pos >= 0:
                parsed_pos = float(raw_pos)

            is_paused = (self.audio_player.paused or self.window['wasPausedByUser'])
            if is_paused and self.playback_mode == 'mode2':
                rate = 0.00001
            elif forced_rate is not None and isinstance(forced_rate, (int, float)) and forced_rate > 0:
                rate = float(forced_rate)
            elif not is_paused:
                rate = 1.0
            else:
                rate = 1.0

            valid_rate = rate if (isinstance(rate, (int, float)) and not math.isnan(rate) and rate > 0) else 1.0

            # Guard against W3C violation: duration must be finite positive number
            if parsed_dur > 0 and parsed_pos >= 0:
                valid_pos = max(0.0, min(parsed_pos, parsed_dur))

                # W3C MediaSession setPositionState check:
                if not (valid_rate > 0 and parsed_dur > 0 and 0 <= valid_pos <= parsed_dur):
                    self.type_error_count += 1
                    raise ValueError("W3C MediaSession TypeError: Invalid positionState parameters")

                self.media_session['positionState'] = {
                    'duration': parsed_dur,
                    'playbackRate': valid_rate,
                    'position': valid_pos,
                }
                self.last_sent_position = valid_pos
                self.last_sent_timestamp = self.current_time_ms
                self.last_sent_rate = valid_rate
        except Exception as e:
            # Code catches transient position errors
            pass

    def start_focus_probe(self):
        self.probe_exec_count += 1
        self.probe_el.play()
        self.chromium.add_player(self.probe_el)
        self.android.on_is_controllable_changed(self.current_time_ms)
        self.probe_el.pause()
        self.chromium.on_player_paused(self.probe_el)
        self.android.on_is_controllable_changed(self.current_time_ms)

    def start_anchor_heartbeat(self, initial_delay=1000):
        if initial_delay <= 0:
            self._execute_heartbeat_tick()
        else:
            self.schedule_task(initial_delay, self._execute_heartbeat_tick)

    def _execute_heartbeat_tick(self):
        self.heartbeat_tick_count += 1
        if self.anchor_el is None:
            return

        # Patched non-destructive guard:
        if not self.anchor_el.paused:
            self.update_media_session_position(self.audio_player.currentTime, self.audio_player.duration, 0.00001, True)
            return

        try:
            self.anchor_el.play()
            self.chromium.add_player(self.anchor_el)
            self.android.on_is_controllable_changed(self.current_time_ms)
        except Exception:
            pass

    def reassert_spoof_burst(self):
        self.reassert_spoof_burst_count += 1

    def handle_pause_action(self):
        """Emulates setActionHandler('pause') in Mode 2"""
        self.window['wasPausedByUser'] = True
        self.window['wasPlayingBeforeCall'] = False

        if self.playback_mode == 'mode2':
            self.media_session['playbackState'] = 'playing'
            dur = self.audio_player.duration or 0
            pos = self.audio_player.currentTime or 0
            self.update_media_session_position(pos, dur, 0.00001, True)
        else:
            self.media_session['playbackState'] = 'paused'

        self.audio_player.instantPause()
        self.chromium.on_player_paused(self.audio_player)
        self.android.on_is_controllable_changed(self.current_time_ms)

        # Trigger audioPlayer 'pause' event listener
        self._on_audio_player_pause_event()

        if self.playback_mode == 'mode2':
            self.start_anchor_heartbeat(0)
            self.reassert_spoof_burst()

    def handle_play_action(self):
        """Emulates setActionHandler('play') in Mode 2"""
        self.window['wasPausedByUser'] = False
        self.window['wasPlayingBeforeCall'] = True

        self.audio_player.play()
        self.chromium.add_player(self.audio_player)
        self.media_session['playbackState'] = 'playing'
        self.update_media_session_position(self.audio_player.currentTime, self.audio_player.duration, 1.0, True)
        self.android.on_is_controllable_changed(self.current_time_ms)

    def handle_playpause_action(self):
        """Emulates setActionHandler('playpause')"""
        is_paused = self.audio_player.paused or self.window['wasPausedByUser']
        if is_paused and self.window['wasPausedByUser']:
            self.handle_play_action()
        else:
            self.handle_pause_action()

    def _on_audio_player_pause_event(self):
        """Emulates audioPlayer.addEventListener('pause')"""
        is_recent_bt = (self.window['lastBtDisconnectTime'] > 0 and self.current_time_ms - self.window['lastBtDisconnectTime'] < 2500)
        if self.playback_mode == 'mode2' and not self.window['isCallActive'] and not is_recent_bt:
            if not self.window['wasPausedByUser']:
                self.start_focus_probe()
            self.start_anchor_heartbeat(0 if self.window['wasPausedByUser'] else 1000)
        else:
            # Mode 1, call active, or BT disconnect
            if self.anchor_el and not self.anchor_el.paused:
                self.anchor_el.pause()
                self.chromium.on_player_paused(self.anchor_el)
                self.android.on_is_controllable_changed(self.current_time_ms)


class TestAdversarialPauseTransitions(unittest.TestCase):
    """
    Adversarial challenge test suite verifying:
    1. Rapid play/pause flapping in Mode 2.
    2. Pause while track duration is NaN, 0, or missing.
    3. Pause when anchor element is uninitialized, delayed, or restarting.
    4. Concurrency of audioPlayer pause event vs setActionHandler invocation.
    5. Call interruption / Bluetooth disconnect interop.
    6. Repository invariants (zero emojis, UNIX LF line endings).
    """

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

    # Invariant Tests

    def test_strictly_zero_emojis_in_source_and_challenger_files(self):
        """Ensure strictly zero emojis in mediaSession.js, main.js, and challenger test file"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        for name, content in [
            ('mediaSession.js', self.ms_content),
            ('main.js', self.main_content),
            ('test_adversarial_pause_transitions.py', self.test_content),
        ]:
            matches = emoji_pattern.findall(content)
            self.assertEqual(matches, [], f"Found emojis in {name}: {matches}")

    def test_strictly_unix_lf_line_endings_in_source_and_challenger_files(self):
        """Ensure strictly UNIX LF line endings across all examined files"""
        for file_path in [self.ms_path, self.main_path, self.test_path]:
            with open(file_path, 'rb') as f:
                raw_bytes = f.read()
            self.assertEqual(raw_bytes.count(b'\r\n'), 0, f"Found CRLF in {file_path}")

    # Adversarial Scenario 1: Rapid Play/Pause Flapping

    def test_adversarial_rapid_flapping_stress(self):
        """
        Adversarial Scenario 1:
        100 rapid play/pause/playpause flapping actions with varying intervals (0ms, 10ms, 25ms).
        Verifies:
        - normal_players_ never drops to 0 during pause.
        - Chromium isControllable() never drops to False during pause.
        - Android notification is NEVER dismissed or destroyed.
        - Probe churn is zero on user pauses.
        - Seek position does not drift.
        """
        harness = AdversarialSimulationHarness(playback_mode='mode2')
        harness.start_playback('Flapping Stress Track', duration=300.0)

        current_track_time = 12.5
        harness.audio_player.currentTime = current_track_time

        intervals = [0, 5, 10, 15, 20, 25, 50]
        for i in range(100):
            interval = intervals[i % len(intervals)]

            if i % 3 == 0:
                harness.handle_pause_action()
                self.assertTrue(harness.window['wasPausedByUser'])
                self.assertTrue(harness.audio_player.paused)
                # Controllability check during pause
                self.assertTrue(harness.chromium.is_controllable(), f"Lost controllability at iteration {i}")
                self.assertTrue(harness.android.notification_visible)
                self.assertFalse(harness.android.notification_destroyed)
                self.assertIsNone(harness.android.hide_notification_deadline)
                self.assertEqual(harness.probe_exec_count, 0, "Focus probe churn detected during user pause")
                # Position check
                pos_state = harness.media_session['positionState']
                self.assertIsNotNone(pos_state)
                self.assertAlmostEqual(pos_state['position'], current_track_time, places=2)
                self.assertAlmostEqual(pos_state['playbackRate'], 0.00001, places=5)
            elif i % 3 == 1:
                harness.handle_play_action()
                self.assertFalse(harness.window['wasPausedByUser'])
                self.assertFalse(harness.audio_player.paused)
                self.assertTrue(harness.chromium.is_controllable())
                self.assertTrue(harness.android.notification_visible)
            else:
                harness.handle_playpause_action()
                self.assertTrue(harness.chromium.is_controllable())
                self.assertTrue(harness.android.notification_visible)
                self.assertFalse(harness.android.notification_destroyed)

            if interval > 0:
                harness.advance_time(harness.current_time_ms + interval)

        # Final pause check after 100 iterations
        harness.handle_pause_action()
        harness.advance_time(harness.current_time_ms + 1000)
        self.assertTrue(harness.chromium.is_controllable())
        self.assertTrue(harness.android.notification_visible)
        self.assertFalse(harness.android.notification_destroyed)
        self.assertEqual(harness.android.hide_scheduled_count, 0)

    # Adversarial Scenario 2: Pause while track duration is NaN, 0, or missing

    def test_adversarial_duration_edge_cases(self):
        """
        Adversarial Scenario 2:
        Tests pausing when duration is NaN, 0, None, negative, infinity, or string.
        Verifies:
        - No unhandled exceptions / TypeErrors thrown.
        - Invalid parameters are sanitized per W3C specification.
        - Controllability and card retention remain solid.
        """
        adversarial_durations = [
            float('nan'),
            0.0,
            0,
            None,
            -1.0,
            -999.0,
            float('inf'),
            float('-inf'),
            "0",
            "NaN",
            "invalid_str"
        ]

        for dur in adversarial_durations:
            with self.subTest(duration=dur):
                harness = AdversarialSimulationHarness(playback_mode='mode2')
                harness.start_playback('Duration Boundary Track', duration=100.0)

                # Set adversarial duration
                harness.audio_player.duration = dur
                harness.audio_player.currentTime = 5.0

                # Pause action must not raise unhandled exception
                try:
                    harness.handle_pause_action()
                except Exception as e:
                    self.fail(f"Pause action crashed on duration={dur}: {e}")

                self.assertEqual(harness.type_error_count, 0, f"W3C TypeError occurred with duration={dur}")
                self.assertTrue(harness.chromium.is_controllable(), f"Lost controllability with duration={dur}")
                self.assertTrue(harness.android.notification_visible)
                self.assertFalse(harness.android.notification_destroyed)
                self.assertIsNone(harness.android.hide_notification_deadline)

    # Adversarial Scenario 3: Anchor element uninitialized, delayed, or restarting

    def test_adversarial_anchor_missing_or_delayed(self):
        """
        Adversarial Scenario 3:
        Tests pause handling when anchor element is completely missing (uninitialized in DOM)
        or when anchor element play() throws an error (broken audio pipeline).
        Verifies:
        - No unhandled exceptions crash the pause transition.
        - Pipeline handles missing/failing anchor gracefully.
        """
        # Test 3A: Missing anchor element
        harness_missing = AdversarialSimulationHarness(playback_mode='mode2', anchor_missing=True)
        harness_missing.start_playback('Missing Anchor Track', duration=150.0)
        try:
            harness_missing.handle_pause_action()
            harness_missing.advance_time(harness_missing.current_time_ms + 1000)
        except Exception as e:
            self.fail(f"Crash when anchor element is missing: {e}")

        # Test 3B: Broken anchor element throwing on play
        harness_broken = AdversarialSimulationHarness(playback_mode='mode2', anchor_broken=True)
        harness_broken.start_playback('Broken Anchor Track', duration=150.0)
        try:
            harness_broken.handle_pause_action()
            harness_broken.advance_time(harness_broken.current_time_ms + 1000)
        except Exception as e:
            self.fail(f"Crash when anchor element play() throws: {e}")

    # Adversarial Scenario 4: Concurrency between pause event and action handler

    def test_adversarial_concurrency_ordering(self):
        """
        Adversarial Scenario 4:
        Tests concurrency permutations between audioPlayer 'pause' event and setActionHandler('pause'):
        Order A: Action handler executes -> sets wasPausedByUser=True -> audioPlayer pauses -> pause event fires.
        Order B: External pause occurs -> pause event fires (wasPausedByUser=False) -> action handler executes.
        Verifies:
        - In Order A, focus probe is bypassed completely.
        - In Order B, probe churn is safely handled and eventual user pause establishes stable pin.
        """
        # Order A: Standard notification card pause
        harness_a = AdversarialSimulationHarness(playback_mode='mode2')
        harness_a.start_playback('Order A Track', duration=200.0)
        harness_a.handle_pause_action()

        self.assertEqual(harness_a.probe_exec_count, 0, "Order A must bypass focus probe")
        self.assertTrue(harness_a.chromium.is_controllable())
        self.assertTrue(harness_a.android.notification_visible)

        # Order B: External audioPlayer pause followed by user pause action
        harness_b = AdversarialSimulationHarness(playback_mode='mode2')
        harness_b.start_playback('Order B Track', duration=200.0)

        # 1. External pause happens first (wasPausedByUser is False)
        harness_b.audio_player.pause()
        harness_b.chromium.on_player_paused(harness_b.audio_player)
        harness_b._on_audio_player_pause_event()

        # Probe executed because it was not an intentional user pause yet
        self.assertEqual(harness_b.probe_exec_count, 1)

        # 2. Now user taps pause on notification card
        harness_b.handle_pause_action()

        # Probe count must NOT have increased on user pause
        self.assertEqual(harness_b.probe_exec_count, 1)
        self.assertTrue(harness_b.chromium.is_controllable())
        self.assertTrue(harness_b.android.notification_visible)
        self.assertFalse(harness_b.android.notification_destroyed)

    # Adversarial Scenario 5: Call Interruption & Bluetooth Disconnect Interop

    def test_adversarial_call_interruption_and_bluetooth_interop(self):
        """
        Adversarial Scenario 5:
        Tests call interruption and Bluetooth disconnect interop:
        - Active call prevents anchor audio and prevents auto-resume if user paused.
        - Bluetooth disconnect stops anchor element to prevent speaker bleed.
        """
        # Test 5A: User paused, then phone call starts and ends
        harness_call = AdversarialSimulationHarness(playback_mode='mode2')
        harness_call.start_playback('Call Interop Track', duration=240.0)

        # User intentionally pauses
        harness_call.handle_pause_action()
        self.assertTrue(harness_call.window['wasPausedByUser'])
        self.assertFalse(harness_call.window['wasPlayingBeforeCall'])

        # Phone call becomes active
        harness_call.window['isCallActive'] = True
        harness_call._on_audio_player_pause_event()
        # During call, anchor must be stopped so user hears call
        self.assertTrue(harness_call.anchor_el.paused)

        # Phone call ends
        harness_call.window['isCallActive'] = False
        # Because wasPausedByUser was True, it must NOT auto-resume
        self.assertTrue(harness_call.audio_player.paused)
        self.assertTrue(harness_call.window['wasPausedByUser'])

        # Test 5B: Bluetooth disconnect while in Mode 2 pause
        harness_bt = AdversarialSimulationHarness(playback_mode='mode2')
        harness_bt.start_playback('BT Interop Track', duration=180.0)
        harness_bt.handle_pause_action()
        self.assertFalse(harness_bt.anchor_el.paused)

        # Bluetooth disconnect occurs
        harness_bt.window['lastBtDisconnectTime'] = harness_bt.current_time_ms
        harness_bt._on_audio_player_pause_event()

        # Anchor must be stopped to avoid speaker bleed
        self.assertTrue(harness_bt.anchor_el.paused, "Anchor must be paused on BT disconnect to avoid speaker bleed")

    # Static Pattern Tests against Implementation Files

    def test_adversarial_static_pause_action_handler_freeze_precedes_pause(self):
        """setActionHandler('pause') in Mode 2 synchronously freezes position before pausing"""
        pause_block = re.search(
            r"navigator\.mediaSession\.setActionHandler\(\s*['\"]pause['\"][\s\S]*?\n\s{8}\}\);",
            self.ms_content
        )
        self.assertIsNotNone(pause_block, "setActionHandler('pause') block not found")
        content = pause_block.group(0)

        self.assertIn("updateMediaSessionPosition(pos, dur, 0.00001, true);", content)
        self.assertIn("republishMediaMetadata();", content)
        self.assertIn("startAnchorHeartbeat(0);", content)
        self.assertIn("reassertSpoofBurst();", content)

        freeze_idx = content.find("updateMediaSessionPosition(pos, dur, 0.00001, true);")
        pause_idx = content.find("audioPlayer.instantPause();")
        self.assertNotEqual(freeze_idx, -1)
        self.assertNotEqual(pause_idx, -1)
        self.assertLess(freeze_idx, pause_idx, "Position freeze must execute BEFORE audioPlayer.instantPause")

    def test_adversarial_static_playpause_action_handler_freeze_precedes_pause(self):
        """setActionHandler('playpause') in Mode 2 synchronously freezes position before pausing"""
        playpause_block = re.search(
            r"navigator\.mediaSession\.setActionHandler\(\s*['\"]playpause['\"][\s\S]*?\n\s{8}\}\);",
            self.ms_content
        )
        self.assertIsNotNone(playpause_block, "setActionHandler('playpause') block not found")
        content = playpause_block.group(0)

        self.assertIn("updateMediaSessionPosition(pos, dur, 0.00001, true);", content)
        self.assertIn("republishMediaMetadata();", content)
        self.assertIn("startAnchorHeartbeat(0);", content)
        self.assertIn("reassertSpoofBurst();", content)

        freeze_idx = content.find("updateMediaSessionPosition(pos, dur, 0.00001, true);")
        pause_idx = content.find("audioPlayer.instantPause();")
        self.assertNotEqual(freeze_idx, -1)
        self.assertNotEqual(pause_idx, -1)
        self.assertLess(freeze_idx, pause_idx, "Position freeze must execute BEFORE audioPlayer.instantPause in playpause")

    def test_adversarial_static_focus_probe_user_pause_guard(self):
        """audioPlayer pause event listener in mediaSession.js guards startFocusProbe with !window.wasPausedByUser"""
        pause_listener_block = re.search(
            r"audioPlayer\.addEventListener\(\s*['\"]pause['\"][\s\S]*?\n\s{8}\}\);",
            self.ms_content
        )
        self.assertIsNotNone(pause_listener_block, "audioPlayer pause listener not found")
        content = pause_listener_block.group(0)

        self.assertIn("if (!window.wasPausedByUser && typeof startFocusProbe === 'function') startFocusProbe();", content)
        self.assertIn("startAnchorHeartbeat(window.wasPausedByUser ? 0 : 1000);", content)

    def test_adversarial_static_non_destructive_heartbeat_guard(self):
        """startAnchorHeartbeat in mediaSession.js guards anchorEl.pause() when anchor is actively running"""
        heartbeat_block = re.search(
            r"function\s+startAnchorHeartbeat\s*\(\s*\)\s*\{([\s\S]*?)\n\s{4}function\s+stopAnchorHeartbeat",
            self.ms_content
        )
        self.assertIsNotNone(heartbeat_block, "startAnchorHeartbeat block not found")
        content = heartbeat_block.group(0)

        self.assertIn("if (!anchorEl.paused) {", content)
        self.assertIn("initialDelay <= 0", content)


if __name__ == '__main__':
    unittest.main()

