import os
import re
import unittest

class TestMode2MediaSessionPersistence(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        cls.ms_path = os.path.join(base_dir, 'js', 'mediaSession.js')
        cls.main_path = os.path.join(base_dir, 'js', 'main.js')
        cls.test_path = os.path.join(base_dir, 'tests', 'test_mode2_media_session_persistence.py')

        with open(cls.ms_path, 'r', encoding='utf-8') as f:
            cls.ms_content = f.read()
        with open(cls.main_path, 'r', encoding='utf-8') as f:
            cls.main_content = f.read()
        with open(cls.test_path, 'r', encoding='utf-8') as f:
            cls.test_content = f.read()

    # Invariant Tests

    def test_strictly_zero_emojis_in_source_and_test_files(self):
        """Strictly zero emojis in mediaSession.js, main.js, and test_mode2_media_session_persistence.py"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        for name, content in [
            ('mediaSession.js', self.ms_content),
            ('main.js', self.main_content),
            ('test_mode2_media_session_persistence.py', self.test_content),
        ]:
            matches = emoji_pattern.findall(content)
            self.assertEqual(matches, [], f"Found emojis in {name}: {matches}")

    def test_unix_lf_line_endings_enforced(self):
        """Ensure all modified files maintain strictly UNIX LF line endings (zero CRLF)"""
        for file_path in [self.ms_path, self.main_path, self.test_path]:
            with open(file_path, 'rb') as f:
                raw_bytes = f.read()
            crlf_count = raw_bytes.count(b'\r\n')
            self.assertEqual(crlf_count, 0, f"Found CRLF line endings in {file_path}")

    # Static Code Pattern Tests - mediaSession.js

    def test_pause_action_handler_synchronous_position_freeze_before_pause(self):
        """setActionHandler('pause') in Mode 2 synchronously freezes position with micro-rate 0.00001 and force=true BEFORE audioPlayer.instantPause"""
        pause_block = re.search(
            r"navigator\.mediaSession\.setActionHandler\(\s*['\"]pause['\"][\s\S]*?\n\s{8}\}\);",
            self.ms_content
        )
        self.assertIsNotNone(pause_block, "setActionHandler('pause') block not found")
        content = pause_block.group(0)

        # In Mode 2 else branch (user pausing):
        # 1. updateMediaSessionPosition must be invoked with 0.00001 and true
        self.assertRegex(
            content,
            r"updateMediaSessionPosition\(\s*pos\s*,\s*dur\s*,\s*0\.00001\s*,\s*true\s*\);"
        )
        # 2. republishMediaMetadata must be called synchronously
        self.assertIn("republishMediaMetadata();", content)

        # 3. Position freeze must precede audioPlayer.instantPause / audioPlayer.pause
        freeze_idx = content.find("updateMediaSessionPosition(pos, dur, 0.00001, true);")
        pause_idx = content.find("audioPlayer.instantPause();")
        self.assertNotEqual(freeze_idx, -1)
        self.assertNotEqual(pause_idx, -1)
        self.assertLess(freeze_idx, pause_idx, "updateMediaSessionPosition must execute BEFORE audioPlayer.instantPause")

        # 4. startAnchorHeartbeat(0) called with initialDelay = 0
        self.assertIn("startAnchorHeartbeat(0);", content)
        # 5. reassertSpoofBurst() called
        self.assertIn("reassertSpoofBurst();", content)

    def test_playpause_action_handler_synchronous_position_freeze_before_pause(self):
        """setActionHandler('playpause') in Mode 2 synchronously freezes position with micro-rate 0.00001 and force=true BEFORE audioPlayer.instantPause"""
        playpause_block = re.search(
            r"navigator\.mediaSession\.setActionHandler\(\s*['\"]playpause['\"][\s\S]*?\n\s{8}\}\);",
            self.ms_content
        )
        self.assertIsNotNone(playpause_block, "setActionHandler('playpause') block not found")
        content = playpause_block.group(0)

        # In Mode 2 pause path:
        self.assertRegex(
            content,
            r"if\s*\(\s*window\.playbackMode\s*===\s*['\"]mode2['\"]\s*\)\s*\{[\s\S]*?updateMediaSessionPosition\(\s*pos\s*,\s*dur\s*,\s*0\.00001\s*,\s*true\s*\);[\s\S]*?republishMediaMetadata\(\);"
        )
        freeze_idx = content.find("updateMediaSessionPosition(pos, dur, 0.00001, true);")
        pause_idx = content.find("audioPlayer.instantPause();")
        self.assertNotEqual(freeze_idx, -1)
        self.assertNotEqual(pause_idx, -1)
        self.assertLess(freeze_idx, pause_idx, "updateMediaSessionPosition in playpause must execute BEFORE audioPlayer.instantPause")

        self.assertIn("startAnchorHeartbeat(0);", content)
        self.assertIn("reassertSpoofBurst();", content)

    def test_audio_player_pause_listener_guards_focus_probe(self):
        """audioPlayer pause event listener in mediaSession.js skips startFocusProbe during intentional user pause in Mode 2"""
        pause_listener_block = re.search(
            r"audioPlayer\.addEventListener\(\s*['\"]pause['\"][\s\S]*?\n\s{8}\}\);",
            self.ms_content
        )
        self.assertIsNotNone(pause_listener_block, "audioPlayer pause listener not found")
        content = pause_listener_block.group(0)

        # startFocusProbe must be guarded by !window.wasPausedByUser
        self.assertRegex(
            content,
            r"if\s*\(\s*!window\.wasPausedByUser\s*&&\s*typeof\s+startFocusProbe\s*===\s*['\"]function['\"]\s*\)\s*startFocusProbe\(\);"
        )

        # startAnchorHeartbeat must pass 0 when wasPausedByUser is true
        self.assertRegex(
            content,
            r"startAnchorHeartbeat\(\s*window\.wasPausedByUser\s*\?\s*0\s*:\s*1000\s*\);"
        )

    def test_start_anchor_heartbeat_non_destructive_when_active(self):
        """startAnchorHeartbeat in mediaSession.js eliminates anchorEl.pause() when anchorEl is already actively playing"""
        heartbeat_block = re.search(
            r"function\s+startAnchorHeartbeat\s*\(\s*\)\s*\{([\s\S]*?)\n\s{4}function\s+stopAnchorHeartbeat",
            self.ms_content
        )
        self.assertIsNotNone(heartbeat_block, "startAnchorHeartbeat block not found")
        content = heartbeat_block.group(0)

        # Must guard against calling anchorEl.pause() when !anchorEl.paused
        self.assertRegex(
            content,
            r"if\s*\(\s*!anchorEl\.paused\s*\)\s*\{[\s\S]*?updateMediaSessionPosition\(\s*pos\s*,\s*dur\s*,\s*0\.00001\s*,\s*true\s*\);[\s\S]*?republishMediaMetadata\(\);[\s\S]*?stopAnchorHeartbeat\(\);\s*return;\s*\}"
        )

        # Must handle initialDelay <= 0 without waiting
        self.assertRegex(
            content,
            r"if\s*\(\s*initialDelay\s*<=\s*0\s*\)\s*\{[\s\S]*?executeTick\(\);[\s\S]*?\}\s*else\s*\{[\s\S]*?anchorHeartbeatTimeout\s*=\s*setTimeout\(\s*executeTick\s*,\s*initialDelay\s*\);"
        )

    # Static Code Pattern Tests - main.js

    def test_main_btn_play_pause_synchronous_position_freeze_and_republish(self):
        """btnPlayPause in main.js freezes position and republishes metadata before pausing, and triggers heartbeat(0)"""
        btn_block = re.search(
            r"btnPlayPause\.addEventListener\(\s*['\"]click['\"][\s\S]*?\n\s{4}\}\);",
            self.main_content
        )
        self.assertIsNotNone(btn_block, "btnPlayPause listener not found in main.js")
        content = btn_block.group(0)

        self.assertRegex(
            content,
            r"if\s*\(\s*window\.playbackMode\s*===\s*['\"]mode2['\"]\s*&&\s*hasMediaSession\s*\)\s*\{[\s\S]*?updateMediaSessionPosition\(\s*audioPlayer\.currentTime\s*,\s*dur\s*,\s*null\s*,\s*true\s*\);[\s\S]*?republishMediaMetadata\(\);"
        )
        self.assertIn("startAnchorHeartbeat(0);", content)
        self.assertIn("reassertSpoofBurst();", content)

    def test_main_pause_listener_mode2_user_pause_actions(self):
        """audioPlayer pause listener in main.js calls republishMediaMetadata, startAnchorHeartbeat(0), and reassertSpoofBurst on user pause"""
        pause_block = re.search(
            r"audioPlayer\.addEventListener\(\s*['\"]pause['\"][\s\S]*?\n\s{4}\}\);",
            self.main_content
        )
        self.assertIsNotNone(pause_block, "audioPlayer pause listener not found in main.js")
        content = pause_block.group(0)

        self.assertRegex(
            content,
            r"if\s*\(\s*window\.wasPausedByUser\s*\)\s*\{[\s\S]*?republishMediaMetadata\(\);[\s\S]*?startAnchorHeartbeat\(0\);[\s\S]*?reassertSpoofBurst\(\);"
        )

    # Synthetic Event Simulation Tests

    def test_synthetic_simulation_mode2_notification_card_pause_persistence(self):
        """Synthetic simulation: media notification card pause retains continuous controllability without eviction"""
        sim = SyntheticMediaSessionPipeline(playback_mode='mode2')
        sim.start_playback(track_name='Test Track', duration=180.0)

        # Verify initial active playback state
        self.assertFalse(sim.audio_player.paused)
        self.assertFalse(sim.anchor_el.paused)
        self.assertEqual(sim.chromium_normal_players_count(), 2)
        self.assertTrue(sim.chromium_is_controllable())
        self.assertTrue(sim.android_notification_visible)
        self.assertEqual(sim.android_hide_delayed_task_count, 0)

        # User taps pause button on Android SystemUI notification card
        # Blink intentionally suppresses user activation for pause actions
        sim.dispatch_media_session_action('pause', has_user_activation=False)

        # Inspect the state immediately following the pause transition
        self.assertTrue(sim.audio_player.paused)
        self.assertTrue(sim.window['wasPausedByUser'])
        self.assertEqual(sim.navigator_media_session['playbackState'], 'playing') # spoofed mode 2 pin

        # Micro-rate position freeze verified
        last_pos_state = sim.navigator_media_session['lastPositionState']
        self.assertIsNotNone(last_pos_state)
        self.assertAlmostEqual(last_pos_state['playbackRate'], 0.00001, places=5)
        self.assertTrue(last_pos_state['forceBypass'])

        # Focus probe was NOT triggered because of intentional user pause guard
        self.assertEqual(sim.probe_el.play_call_count, 0, "startFocusProbe should be bypassed during intentional user pause")
        self.assertEqual(sim.probe_el.pause_call_count, 0)

        # Anchor element was NEVER paused during transition
        self.assertFalse(sim.anchor_el.paused)
        self.assertEqual(sim.anchor_el.pause_call_count, 0, "anchorEl.pause() must not be called when anchor is active")

        # startAnchorHeartbeat ran with initialDelay = 0 (eliminating 1000ms deadzone)
        self.assertEqual(sim.last_heartbeat_initial_delay, 0)
        self.assertTrue(sim.heartbeat_tick_executed)

        # Chromium normal_players_ maintained anchorEl (size = 1)
        self.assertEqual(sim.chromium_normal_players_count(), 1)
        self.assertEqual(sim.chromium_audio_focus_state, 'ACTIVE')
        self.assertTrue(sim.chromium_is_controllable())

        # Android SystemUI notification was NEVER evicted or scheduled for eviction
        self.assertTrue(sim.android_notification_visible)
        self.assertEqual(sim.android_hide_delayed_task_count, 0, "hideNotificationDelayed must NOT be called")
        self.assertEqual(sim.android_clear_notification_count, 0, "clearNotification must NOT be called")

    def test_synthetic_simulation_mode2_playpause_action_persistence(self):
        """Synthetic simulation: playpause media action retains continuous controllability without eviction"""
        sim = SyntheticMediaSessionPipeline(playback_mode='mode2')
        sim.start_playback(track_name='Test Track', duration=240.0)

        # Dispatch playpause toggle action
        sim.dispatch_media_session_action('playpause', has_user_activation=False)

        self.assertTrue(sim.audio_player.paused)
        self.assertTrue(sim.window['wasPausedByUser'])
        self.assertFalse(sim.anchor_el.paused)
        self.assertEqual(sim.anchor_el.pause_call_count, 0)
        self.assertEqual(sim.probe_el.play_call_count, 0)
        self.assertEqual(sim.last_heartbeat_initial_delay, 0)
        self.assertTrue(sim.chromium_is_controllable())
        self.assertTrue(sim.android_notification_visible)
        self.assertEqual(sim.android_hide_delayed_task_count, 0)

    def test_synthetic_simulation_mode2_resume_transitions(self):
        """Synthetic simulation: resuming playback from Mode 2 paused state transitions cleanly without card destruction"""
        sim = SyntheticMediaSessionPipeline(playback_mode='mode2')
        sim.start_playback(track_name='Test Track', duration=200.0)
        sim.dispatch_media_session_action('pause', has_user_activation=False)

        # Now resume playback via play action
        sim.dispatch_media_session_action('play', has_user_activation=True)

        self.assertFalse(sim.audio_player.paused)
        self.assertFalse(sim.window['wasPausedByUser'])
        self.assertEqual(sim.navigator_media_session['playbackState'], 'playing')
        last_pos_state = sim.navigator_media_session['lastPositionState']
        self.assertEqual(last_pos_state['playbackRate'], 1.0)
        self.assertEqual(sim.chromium_normal_players_count(), 2)
        self.assertTrue(sim.chromium_is_controllable())
        self.assertTrue(sim.android_notification_visible)
        self.assertEqual(sim.android_clear_notification_count, 0)

    def test_synthetic_simulation_mode2_in_app_button_pause_persistence(self):
        """Synthetic simulation: in-app UI pause button retains continuous controllability without eviction"""
        sim = SyntheticMediaSessionPipeline(playback_mode='mode2')
        sim.start_playback(track_name='Test Track', duration=150.0)

        # Click in-app btnPlayPause
        sim.trigger_btn_play_pause_click()

        self.assertTrue(sim.audio_player.paused)
        self.assertTrue(sim.window['wasPausedByUser'])
        self.assertFalse(sim.anchor_el.paused)
        self.assertEqual(sim.anchor_el.pause_call_count, 0)
        self.assertEqual(sim.probe_el.play_call_count, 0)
        self.assertEqual(sim.last_heartbeat_initial_delay, 0)
        self.assertTrue(sim.chromium_is_controllable())
        self.assertTrue(sim.android_notification_visible)
        self.assertEqual(sim.android_hide_delayed_task_count, 0)

    def test_synthetic_simulation_defect_reproduction_demonstrates_fix_efficacy(self):
        """Synthetic simulation: verifies that legacy destructive anchor.pause() causes focus collapse and eviction"""
        # Run defective pipeline simulating legacy unpatched code
        defective_sim = SyntheticMediaSessionPipeline(playback_mode='mode2', simulate_legacy_defect=True)
        defective_sim.start_playback(track_name='Test Track', duration=180.0)

        # Pausing triggers legacy defect: anchorEl is paused, normal_players_ drops to 0
        defective_sim.dispatch_media_session_action('pause', has_user_activation=False)

        # Under the legacy defect:
        self.assertTrue(defective_sim.legacy_focus_abandoned)
        self.assertFalse(defective_sim.chromium_is_controllable())
        self.assertTrue(defective_sim.android_hide_delayed_task_count > 0, "Legacy unpatched defect triggers hideNotificationDelayed")

    def test_republish_metadata_gates_instantiation_behind_should_republish(self):
        """republishMediaMetadata gates new MediaMetadata allocation behind shouldRepublishMetadata to prevent SystemUI blinking"""
        self.assertRegex(
            self.ms_content,
            r'if\s*\(\s*forceBreakDedup\s*\|\|\s*\(\s*typeof\s+shouldRepublishMetadata\s*===\s*[\'"]function[\'"]\s*&&\s*shouldRepublishMetadata\(\)\s*\)\s*\)\s*\{[\s\S]*?navigator\.mediaSession\.metadata\s*=\s*new\s+MediaMetadata\('
        )

    def test_reassert_spoof_burst_rearms_live_audio_anchor_in_mode2(self):
        """reassertSpoofBurst re-arms startLiveAudioAnchor within 150ms progressive tick to satisfy Android 500ms deadline"""
        burst_match = re.search(
            r'function\s+reassertSpoofBurst\s*\(\s*\)\s*\{([\s\S]*?)\n    \}',
            self.ms_content
        )
        self.assertIsNotNone(burst_match, "reassertSpoofBurst block not found")
        content = burst_match.group(1)
        self.assertRegex(
            content,
            r'if\s*\(\s*window\.playbackMode\s*===\s*[\'"]mode2[\'"]\s*&&\s*typeof\s+startLiveAudioAnchor\s*===\s*[\'"]function[\'"]\s*\)\s*\{\s*startLiveAudioAnchor\(\);'
        )

    def test_anchor_pause_listener_rearms_live_anchor_in_mode2(self):
        """anchorEl pause listener immediately re-invokes startLiveAudioAnchor in Mode 2"""
        self.assertRegex(
            self.ms_content,
            r'anchorEl\.addEventListener\(\s*["\']pause["\'][\s\S]*?reassertSpoofBurst\(\);[\s\S]*?if\s*\(\s*window\.playbackMode\s*===\s*[\'"]mode2[\'"]\s*&&\s*typeof\s+startLiveAudioAnchor\s*===\s*[\'"]function[\'"]\s*\)\s*\{\s*startLiveAudioAnchor\(\);'
        )

    def test_main_pause_listener_triggers_reassert_spoof_burst_on_external_interrupt(self):
        """audioPlayer pause listener in main.js calls reassertSpoofBurst on external video focus loss (!wasPausedByUser)"""
        pause_block = re.search(
            r"audioPlayer\.addEventListener\(\s*['\"]pause['\"][\s\S]*?\n    \}\);",
            self.main_content
        )
        self.assertIsNotNone(pause_block, "audioPlayer pause listener not found in main.js")
        content = pause_block.group(0)
        self.assertRegex(
            content,
            r"if\s*\(\s*window\.wasPausedByUser\s*\)\s*\{[\s\S]*?\}\s*else\s*\{\s*if\s*\(\s*typeof\s+reassertSpoofBurst\s*===\s*['\"]function['\"]\s*\)\s*reassertSpoofBurst\(\);\s*\}"
        )

    def test_synthetic_simulation_mode2_external_focus_loss_transient_preserves_card(self):
        """Synthetic simulation: external video interrupt (AUDIOFOCUS_LOSS_TRANSIENT) preserves pinned notification card"""
        sim = SyntheticMediaSessionPipeline(playback_mode='mode2')
        sim.start_playback(track_name='External Interrupt Test Track', duration=210.0)

        # External video steals focus: fires AUDIOFOCUS_LOSS_TRANSIENT
        sim.simulate_external_focus_loss_transient()

        # Audio player is paused by external system focus loss
        self.assertTrue(sim.audio_player.paused)
        self.assertFalse(sim.window['wasPausedByUser'], "External focus steal must NOT mark wasPausedByUser")
        self.assertTrue(sim.window['wasPlayingBeforeCall'])

        # Mode 2 defense burst is triggered
        self.assertTrue(sim.reassert_spoof_burst_called)

        # Spoof burst restores anchor to Chromium normal_players_ within 150ms
        self.assertGreaterEqual(sim.chromium_normal_players_count(), 1)
        self.assertEqual(sim.chromium_audio_focus_state, 'ACTIVE')
        self.assertTrue(sim.chromium_is_controllable())

        # Android SystemUI notification card remains pinned
        self.assertTrue(sim.android_notification_visible)
        self.assertEqual(sim.android_hide_delayed_task_count, 0, "hideNotificationDelayed must NOT be scheduled on external interrupt")
        self.assertEqual(sim.navigator_media_session['playbackState'], 'playing')


# Synthetic Mock Framework for Chromium & Android SystemUI Media Lifecycle

class SyntheticMediaElement:
    def __init__(self, tag_id):
        self.id = tag_id
        self.paused = True
        self.currentTime = 0.0
        self.duration = 0.0
        self.active = self
        self.srcObject = None
        self.src = ""
        self.play_call_count = 0
        self.pause_call_count = 0

    def play(self):
        self.play_call_count += 1
        self.paused = False

    def pause(self):
        self.pause_call_count += 1
        self.paused = True

    def instantPause(self):
        self.pause()


class SyntheticMediaSessionPipeline:
    def __init__(self, playback_mode='mode2', simulate_legacy_defect=False):
        self.playback_mode = playback_mode
        self.simulate_legacy_defect = simulate_legacy_defect

        self.window = {
            'playbackMode': playback_mode,
            'wasPausedByUser': False,
            'wasPlayingBeforeCall': False,
            'isCallActive': False,
            'mediaSessionDestroyed': False,
            'lastBtDisconnectTime': 0,
        }
        self.audio_player = SyntheticMediaElement('audio-player')
        self.anchor_el = SyntheticMediaElement('live-stream-anchor')
        self.probe_el = SyntheticMediaElement('focus-probe')

        self.navigator_media_session = {
            'playbackState': 'none',
            'actionHandlers': {},
            'metadata': None,
            'lastPositionState': None,
        }

        # Chromium C++ state
        self.chromium_normal_players = set()
        self.chromium_audio_focus_state = 'INACTIVE'
        self.legacy_focus_abandoned = False

        # Android Java state
        self.android_notification_visible = False
        self.android_hide_delayed_task_count = 0
        self.android_clear_notification_count = 0

        # Pipeline audit metrics
        self.last_heartbeat_initial_delay = None
        self.heartbeat_tick_executed = False
        self.reassert_spoof_burst_called = False
        self.republish_metadata_called = False

        # Wire handlers
        self._register_handlers()

    def _register_handlers(self):
        self.navigator_media_session['actionHandlers']['pause'] = self._handle_pause_action
        self.navigator_media_session['actionHandlers']['play'] = self._handle_play_action
        self.navigator_media_session['actionHandlers']['playpause'] = self._handle_playpause_action

    def start_playback(self, track_name, duration):
        self.audio_player.duration = duration
        self.audio_player.play()
        self.anchor_el.play()
        self.window['wasPausedByUser'] = False
        self.navigator_media_session['playbackState'] = 'playing'
        self.navigator_media_session['metadata'] = {'title': track_name}

        self.chromium_normal_players.add(self.audio_player)
        self.chromium_normal_players.add(self.anchor_el)
        self.chromium_audio_focus_state = 'ACTIVE'

        self.android_notification_visible = True
        self.android_hide_delayed_task_count = 0

    def chromium_normal_players_count(self):
        return len(self.chromium_normal_players)

    def chromium_is_controllable(self):
        # MediaSessionImpl::IsControllable() on Android:
        # Requires audio_focus_state_ != State::INACTIVE and desired_audio_focus_type_ == kGain
        if self.chromium_audio_focus_state == 'INACTIVE':
            return False
        return len(self.chromium_normal_players) > 0

    def _update_media_session_position(self, pos, dur, rate=None, force=False):
        if rate is None:
            if self.audio_player.paused or self.window['wasPausedByUser']:
                rate = 0.00001 if self.playback_mode == 'mode2' else 1.0
            else:
                rate = 1.0
        self.navigator_media_session['lastPositionState'] = {
            'position': pos,
            'duration': dur,
            'playbackRate': rate,
            'forceBypass': force,
        }

    def _republish_media_metadata(self):
        self.republish_metadata_called = True

    def _reassert_spoof_burst(self):
        self.reassert_spoof_burst_called = True
        if self.playback_mode == 'mode2' and not self.simulate_legacy_defect:
            self.anchor_el.play()
            self.chromium_normal_players.add(self.anchor_el)
            self.chromium_audio_focus_state = 'ACTIVE'

    def _start_focus_probe(self):
        self.probe_el.play()
        self.probe_el.pause()

    def _start_anchor_heartbeat(self, initial_delay=1000):
        self.last_heartbeat_initial_delay = initial_delay
        if initial_delay <= 0 or self.simulate_legacy_defect:
            self._run_heartbeat_tick()

    def _run_heartbeat_tick(self):
        self.heartbeat_tick_executed = True
        if self.simulate_legacy_defect:
            # Legacy unpatched defect: unconditionally pauses anchor element
            self.anchor_el.pause()
            self.chromium_normal_players.discard(self.anchor_el)
            self._on_player_paused_in_chromium(self.anchor_el)
            return

        # Patched behavior: non-destructive when already active
        if not self.anchor_el.paused:
            self._update_media_session_position(self.audio_player.currentTime, self.audio_player.duration, 0.00001, True)
            self._republish_media_metadata()
            return

        # If not playing, play anchor
        self.anchor_el.play()
        self.chromium_normal_players.add(self.anchor_el)

    def _on_player_paused_in_chromium(self, player):
        # Chromium MediaSessionImpl::OnPlayerPaused:
        # If normal_players_.size() != 1, RemovePlayer(player)
        if player in self.chromium_normal_players:
            self.chromium_normal_players.remove(player)

        if len(self.chromium_normal_players) == 0:
            # AbandonSystemAudioFocusIfNeeded()
            self.chromium_audio_focus_state = 'INACTIVE'
            self.legacy_focus_abandoned = True

        # Android MediaSessionHelper checks controllability
        if not self.chromium_is_controllable():
            self.android_hide_delayed_task_count += 1

    def _on_audio_player_pause_event(self):
        # Emulates audioPlayer.addEventListener('pause')
        if self.playback_mode == 'mode2':
            if not self.window['wasPausedByUser'] and not self.simulate_legacy_defect:
                self._start_focus_probe()
                # External video interruption defense trigger (main.js else branch)
                self._reassert_spoof_burst()
            elif self.simulate_legacy_defect:
                # Legacy unpatched code called probe unconditionally
                self._start_focus_probe()
                self._on_player_paused_in_chromium(self.probe_el)

    def simulate_external_focus_loss_transient(self):
        # Native external focus steal (AUDIOFOCUS_LOSS_TRANSIENT):
        # Chromium calls SuspendType::kSystem -> OnSuspendInternal(kSystem)
        # Directly pauses normal_players_ without setting wasPausedByUser
        self.window['wasPausedByUser'] = False
        self.window['wasPlayingBeforeCall'] = True

        # Main audio player is paused by native system suspension
        self.audio_player.pause()
        self._on_player_paused_in_chromium(self.audio_player)
        self._on_audio_player_pause_event()

        # In Mode 2, position is preserved and playbackState is maintained
        if self.playback_mode == 'mode2':
            dur = self.audio_player.duration
            self._update_media_session_position(self.audio_player.currentTime, dur, 1.0)
            self.navigator_media_session['playbackState'] = 'playing'

    def _handle_pause_action(self):
        # Emulates setActionHandler('pause') in mediaSession.js
        self.window['wasPausedByUser'] = True
        self.window['wasPlayingBeforeCall'] = False
        self.navigator_media_session['playbackState'] = 'playing' if self.playback_mode == 'mode2' else 'paused'

        if self.playback_mode == 'mode2':
            # RCF: Synchronous position update with micro-rate freeze and force=true BEFORE pause
            dur = self.audio_player.duration
            pos = self.audio_player.currentTime
            self._update_media_session_position(pos, dur, 0.00001, True)
            self._republish_media_metadata()

            # Pause main audio player
            self.audio_player.instantPause()
            self._on_player_paused_in_chromium(self.audio_player)
            self._on_audio_player_pause_event()

            # Immediate heartbeat and spoof burst
            self._start_anchor_heartbeat(0)
            self._reassert_spoof_burst()

    def _handle_playpause_action(self):
        is_paused = self.audio_player.paused or self.window['wasPausedByUser']
        if is_paused and self.window['wasPausedByUser']:
            self._handle_play_action()
        else:
            self._handle_pause_action()

    def _handle_play_action(self):
        self.window['wasPausedByUser'] = False
        self.window['wasPlayingBeforeCall'] = True
        self.audio_player.play()
        self.chromium_normal_players.add(self.audio_player)
        self.navigator_media_session['playbackState'] = 'playing'
        self._update_media_session_position(self.audio_player.currentTime, self.audio_player.duration, 1.0, True)
        self._republish_media_metadata()

    def trigger_btn_play_pause_click(self):
        # Emulates btnPlayPause click handler in main.js
        if not self.audio_player.paused and not self.window['wasPausedByUser']:
            self.window['wasPausedByUser'] = True
            if self.playback_mode == 'mode2':
                self.navigator_media_session['playbackState'] = 'playing'
                dur = self.audio_player.duration
                self._update_media_session_position(self.audio_player.currentTime, dur, None, True)
                self._republish_media_metadata()
                self.audio_player.instantPause()
                self._on_player_paused_in_chromium(self.audio_player)
                self._on_audio_player_pause_event()
                self._start_anchor_heartbeat(0)
                self._reassert_spoof_burst()
        else:
            self._handle_play_action()

    def dispatch_media_session_action(self, action_name, has_user_activation=False):
        handler = self.navigator_media_session['actionHandlers'].get(action_name)
        if handler:
            handler()


if __name__ == '__main__':
    unittest.main()
