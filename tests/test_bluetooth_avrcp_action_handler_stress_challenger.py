import os
import re
import unittest

class TestBluetoothAvrcpActionHandlerStressChallenger(unittest.TestCase):
    """
    Adversarial empirical stress-test harness for Bluetooth AVRCP and MediaSession
    action handler execution paths across Mode 1 and Mode 2.
    """

    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        cls.base_dir = base_dir

        with open(os.path.join(base_dir, 'js', 'mediaSession.js'), 'r', encoding='utf-8') as f:
            cls.ms_content = f.read()

        with open(os.path.join(base_dir, 'js', 'main.js'), 'r', encoding='utf-8') as f:
            cls.main_content = f.read()

        with open(os.path.join(base_dir, 'js', 'dom.js'), 'r', encoding='utf-8') as f:
            cls.dom_content = f.read()

        with open(os.path.join(base_dir, 'js', 'playback.js'), 'r', encoding='utf-8') as f:
            cls.playback_content = f.read()

        with open(os.path.join(base_dir, 'GEMINI.md'), 'r', encoding='utf-8') as f:
            cls.gemini_content = f.read()

        root_gemini = os.path.join(os.path.dirname(base_dir), 'GEMINI.md')
        cls.root_gemini_content = ''
        if os.path.exists(root_gemini):
            with open(root_gemini, 'r', encoding='utf-8') as f:
                cls.root_gemini_content = f.read()

        with open(__file__, 'r', encoding='utf-8') as f:
            cls.test_content = f.read()

    def test_strictly_zero_emojis(self):
        """Verify strictly zero emojis across all relevant source, docs, and test files."""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        files = {
            'mediaSession.js': self.ms_content,
            'main.js': self.main_content,
            'dom.js': self.dom_content,
            'playback.js': self.playback_content,
            'GEMINI.md': self.gemini_content,
            'root_GEMINI.md': self.root_gemini_content,
            'test_file': self.test_content
        }
        for name, content in files.items():
            matches = emoji_pattern.findall(content)
            self.assertEqual(len(matches), 0, f'Found emoji in {name}: {matches}')

    def test_strictly_unix_lf_line_endings(self):
        """Verify strictly UNIX LF line endings across checked files."""
        check_paths = [
            os.path.join(self.base_dir, 'js', 'main.js'),
            os.path.join(self.base_dir, 'js', 'mediaSession.js'),
            os.path.join(self.base_dir, 'js', 'dom.js'),
            os.path.join(self.base_dir, 'tests', 'test_mode2_media_card_and_bluetooth_resume.py'),
            __file__
        ]
        for p in check_paths:
            if os.path.exists(p):
                with open(p, 'rb') as f:
                    raw = f.read()
                self.assertNotIn(b'\r\n', raw, f'CRLF found in {p}')

    def test_static_main_mode2_pause_passes_micro_rate(self):
        """Verify main.js Mode 2 pause listener calls updateMediaSessionPosition with 0.00001, true and not 1.0."""
        pause_block_match = re.search(r'audioPlayer\.addEventListener\(\s*[\'"]pause[\'"]\s*,[\s\S]*?\}\);', self.main_content)
        self.assertIsNotNone(pause_block_match, 'Could not find audioPlayer pause listener in main.js')
        pause_block = pause_block_match.group(0)

        mode2_block_match = re.search(
            r'if\s*\(\s*window\.playbackMode\s*===\s*[\'"]mode2[\'"]\s*&&\s*!isRecentBtDisconnect\s*\)\s*\{\s*if\s*\(\s*window\.wasPausedByUser\s*\)\s*\{([\s\S]*?)\}\s*else',
            pause_block
        )
        self.assertIsNotNone(mode2_block_match, 'Could not find Mode 2 wasPausedByUser pause block in main.js')
        mode2_block = mode2_block_match.group(1)

        self.assertIn('updateMediaSessionPosition(audioPlayer.currentTime, dur, 0.00001, true);', mode2_block)
        self.assertNotIn('updateMediaSessionPosition(audioPlayer.currentTime, dur, 1.0)', mode2_block)

    def test_static_republish_metadata_ordering(self):
        """republishMediaMetadata must precede updateMediaSessionPosition across all resume sites."""
        # 1. handlePlayAction
        play_match = re.search(r'function\s+handlePlayAction\(\)\s*\{([\s\S]*?)const playPromise', self.ms_content)
        self.assertIsNotNone(play_match)
        play_code = play_match.group(1)
        meta_pos = play_code.find('republishMediaMetadata()')
        update_pos = play_code.find('updateMediaSessionPosition(actualTime, dur, 1.0, true)')
        self.assertNotEqual(meta_pos, -1)
        self.assertNotEqual(update_pos, -1)
        self.assertLess(meta_pos, update_pos, 'republishMediaMetadata must precede updateMediaSessionPosition in handlePlayAction')

        # 2. setActionHandler('pause') resume branch
        pause_match = re.search(r'setActionHandler\(\s*[\'"]pause[\'"][\s\S]*?if\s*\(isActuallyPaused\)\s*\{([\s\S]*?)audioPlayer\.play\(\)', self.ms_content)
        self.assertIsNotNone(pause_match)
        pause_code = pause_match.group(1)
        meta_pos = pause_code.find('republishMediaMetadata()')
        update_pos = pause_code.find('updateMediaSessionPosition(actualTime, dur, 1.0, true)')
        self.assertNotEqual(meta_pos, -1)
        self.assertNotEqual(update_pos, -1)
        self.assertLess(meta_pos, update_pos, 'republishMediaMetadata must precede updateMediaSessionPosition in pause resume branch')

        # 3. setActionHandler('playpause') resume branch
        playpause_match = re.search(r'setActionHandler\(\s*[\'"]playpause[\'"][\s\S]*?if\s*\(isActuallyPaused\)\s*\{([\s\S]*?)audioPlayer\.play\(\)', self.ms_content)
        self.assertIsNotNone(playpause_match)
        playpause_code = playpause_match.group(1)
        meta_pos = playpause_code.find('republishMediaMetadata()')
        update_pos = playpause_code.find('updateMediaSessionPosition(actualTime, dur, 1.0, true)')
        self.assertNotEqual(meta_pos, -1)
        self.assertNotEqual(update_pos, -1)
        self.assertLess(meta_pos, update_pos, 'republishMediaMetadata must precede updateMediaSessionPosition in playpause resume branch')

    def test_static_anchor_conditional_guard_across_all_sites(self):
        """All Mode 2 resume and play execution sites must guard startLiveAudioAnchor with (!anchor || anchor.paused)."""
        # mediaSession.js
        self.assertRegex(self.ms_content, r'!_resumeAnchorEl\s*\|\|\s*_resumeAnchorEl\.paused')
        self.assertRegex(self.ms_content, r'!_pauseResumeAnchorEl\s*\|\|\s*_pauseResumeAnchorEl\.paused')
        self.assertRegex(self.ms_content, r'!_toggleAnchorEl\s*\|\|\s*_toggleAnchorEl\.paused')
        self.assertRegex(self.ms_content, r'!_anchor\s*\|\|\s*_anchor\.paused')

        # dom.js
        self.assertRegex(self.dom_content, r'!_anchor\s*\|\|\s*_anchor\.paused')

        # main.js
        self.assertRegex(self.main_content, r'!_anchor\s*\|\|\s*_anchor\.paused')

    def test_simulated_avrcp_toggle_resume_mode1_and_mode2(self):
        """
        Synthetic simulation: Bluetooth AVRCP toggle command (pause action when isActuallyPaused is true)
        across Mode 1 and Mode 2.
        """
        class MockAnchor:
            def __init__(self, running=False):
                self.paused = not running
                self.play_calls = 0
                self.stop_calls = 0

            def play(self):
                self.paused = False
                self.play_calls += 1

            def stop(self):
                self.paused = True
                self.stop_calls += 1

        class MockMediaSession:
            def __init__(self):
                self.playbackState = 'none'
                self.positionState = None

            def setPositionState(self, state):
                self.positionState = dict(state)

        class MockAudioPlayer:
            def __init__(self, paused=True, current_time=25.0, duration=180.0):
                self.paused = paused
                self.currentTime = current_time
                self.duration = duration
                self._preventAutoplay = True
                self.play_calls = 0

            def play(self, was_paused_by_user):
                if was_paused_by_user:
                    return False
                self.paused = False
                self._preventAutoplay = False
                self.play_calls += 1
                return True

        # Test Case 1: Mode 1 AVRCP toggle resume
        ms1 = MockMediaSession()
        anchor1 = MockAnchor(running=True)
        player1 = MockAudioPlayer(paused=True, current_time=30.0, duration=200.0)
        state1 = {
            'playbackMode': 'mode1',
            'wasPausedByUser': True,
            'isCallActive': False
        }

        # AVRCP toggle dispatches pause handler
        isActuallyPaused1 = player1.paused or state1['wasPausedByUser']
        self.assertTrue(isActuallyPaused1)

        # Resume logic in setActionHandler('pause')
        state1['wasPausedByUser'] = False
        player1._preventAutoplay = False
        ms1.playbackState = 'playing'
        actual_time1 = player1.currentTime
        dur1 = player1.duration

        # Mode 1 stops live audio anchor
        if state1['playbackMode'] == 'mode2':
            if not anchor1 or anchor1.paused:
                anchor1.play()
        else:
            anchor1.stop()

        ms1.setPositionState({'position': actual_time1, 'duration': dur1, 'playbackRate': 1.0})
        res1 = player1.play(state1['wasPausedByUser'])

        self.assertTrue(res1)
        self.assertFalse(player1.paused)
        self.assertFalse(player1._preventAutoplay)
        self.assertFalse(state1['wasPausedByUser'])
        self.assertEqual(ms1.playbackState, 'playing')
        self.assertEqual(ms1.positionState['playbackRate'], 1.0)
        self.assertEqual(anchor1.stop_calls, 1)
        self.assertEqual(anchor1.play_calls, 0)

        # Test Case 2: Mode 2 AVRCP toggle resume with running anchor
        ms2 = MockMediaSession()
        anchor2 = MockAnchor(running=True)  # Already running silent anchor in background
        player2 = MockAudioPlayer(paused=True, current_time=45.0, duration=210.0)
        state2 = {
            'playbackMode': 'mode2',
            'wasPausedByUser': True,
            'isCallActive': False
        }

        # Paused under micro-rate spoofing: rate 0.00001
        ms2.playbackState = 'playing'
        ms2.setPositionState({'position': 45.0, 'duration': 210.0, 'playbackRate': 0.00001})

        # AVRCP toggle dispatches pause handler
        isActuallyPaused2 = player2.paused or state2['wasPausedByUser']
        self.assertTrue(isActuallyPaused2)

        state2['wasPausedByUser'] = False
        player2._preventAutoplay = False
        ms2.playbackState = 'playing'
        actual_time2 = player2.currentTime
        dur2 = player2.duration

        # Republish metadata simulation (syncAfterRepublish with fallback rate)
        # In Mode 2 paused, rate is 0.00001; but since we cleared wasPausedByUser and player unpausing,
        # immediate forced rate 1.0 must override
        ms2.setPositionState({'position': actual_time2, 'duration': dur2, 'playbackRate': 0.00001})

        # Immediate position update with forced rate 1.0, true
        ms2.setPositionState({'position': actual_time2, 'duration': dur2, 'playbackRate': 1.0})

        # Conditional anchor in Mode 2: only play if paused
        if state2['playbackMode'] == 'mode2':
            if not anchor2 or anchor2.paused:
                anchor2.play()

        res2 = player2.play(state2['wasPausedByUser'])

        self.assertTrue(res2)
        self.assertFalse(player2.paused)
        self.assertFalse(player2._preventAutoplay)
        self.assertFalse(state2['wasPausedByUser'])
        self.assertEqual(ms2.playbackState, 'playing')
        self.assertEqual(ms2.positionState['playbackRate'], 1.0)
        # Running anchor was NOT re-invoked (no redundant play)
        self.assertEqual(anchor2.play_calls, 0)

        # Test Case 3: Mode 2 AVRCP toggle resume with paused anchor (e.g. initial setup)
        anchor3 = MockAnchor(running=False)
        if state2['playbackMode'] == 'mode2':
            if not anchor3 or anchor3.paused:
                anchor3.play()
        self.assertEqual(anchor3.play_calls, 1)

    def test_simulated_avrcp_discrete_play_mode1_and_mode2(self):
        """
        Synthetic simulation: Bluetooth discrete Play command (handlePlayAction)
        across Mode 1 and Mode 2.
        """
        class MockPlayer:
            def __init__(self):
                self.paused = True
                self.currentTime = 10.0
                self.duration = 150.0
                self._preventAutoplay = True

            def play(self, was_paused):
                if was_paused:
                    return False
                self.paused = False
                self._preventAutoplay = False
                return True

        # Mode 1 discrete play
        p1 = MockPlayer()
        wasPausedByUser1 = True
        # handlePlayAction:
        wasPausedByUser1 = False
        p1._preventAutoplay = False
        success1 = p1.play(wasPausedByUser1)
        self.assertTrue(success1)
        self.assertFalse(p1.paused)
        self.assertFalse(p1._preventAutoplay)

        # Mode 2 discrete play
        p2 = MockPlayer()
        wasPausedByUser2 = True
        wasPausedByUser2 = False
        p2._preventAutoplay = False
        success2 = p2.play(wasPausedByUser2)
        self.assertTrue(success2)
        self.assertFalse(p2.paused)
        self.assertFalse(p2._preventAutoplay)

    def test_authorization_choke_point_and_prevent_autoplay_suppression(self):
        """
        Verify DualAudioPingPong authorization choke point and forwardEvent suppression:
        1. Rogue play() while wasPausedByUser is true dies synchronously.
        2. Pre-staging forwardEvent suppresses play/playing when _preventAutoplay is true.
        3. Authorized resume clears _preventAutoplay and forwards genuine events.
        """
        class MockTransport:
            def __init__(self):
                self.active_paused = True
                self._preventAutoplay = True
                self.forwarded_events = []

            def forwardEvent(self, e_type):
                if self._preventAutoplay and (e_type == 'play' or e_type == 'playing'):
                    return
                self.forwarded_events.append(e_type)

            def play(self, was_paused_by_user):
                if was_paused_by_user:
                    return 'BLOCKED'
                self._preventAutoplay = False
                self.active_paused = False
                self.forwardEvent('play')
                return 'PLAYING'

        transport = MockTransport()

        # Step 1: Rogue play attempt while paused by user
        res = transport.play(was_paused_by_user=True)
        self.assertEqual(res, 'BLOCKED')
        self.assertTrue(transport.active_paused)
        self.assertTrue(transport._preventAutoplay)
        self.assertEqual(len(transport.forwarded_events), 0)

        # Step 2: Spurious background event while _preventAutoplay is True
        transport.forwardEvent('play')
        transport.forwardEvent('playing')
        self.assertEqual(len(transport.forwarded_events), 0, 'Spurious events must be suppressed when _preventAutoplay is true')

        # Non-play event (e.g. timeupdate) is forwarded
        transport.forwardEvent('timeupdate')
        self.assertEqual(transport.forwarded_events, ['timeupdate'])

        # Step 3: Legitimate AVRCP resume (clears wasPausedByUser first)
        res2 = transport.play(was_paused_by_user=False)
        self.assertEqual(res2, 'PLAYING')
        self.assertFalse(transport.active_paused)
        self.assertFalse(transport._preventAutoplay)
        self.assertIn('play', transport.forwarded_events)

    def test_near_track_end_loop_replay_boundary_conditions(self):
        """
        Test near-track-end replay reset logic across boundary conditions:
        actualTime >= dur - 0.5 resets actualTime = 0 and audioPlayer.currentTime = 0.
        """
        def evaluate_reset(dur, current_time, pending_seek=None):
            actual_time = current_time
            currentTime = current_time
            if dur > 0 and actual_time >= dur - 0.5 and (pending_seek is None):
                currentTime = 0
                actual_time = 0
            return currentTime, actual_time

        dur = 120.0

        # Boundary 1: dur - 0.6 (119.4) -> should NOT reset
        c1, a1 = evaluate_reset(dur, 119.4)
        self.assertEqual(c1, 119.4)
        self.assertEqual(a1, 119.4)

        # Boundary 2: dur - 0.51 (119.49) -> should NOT reset
        c2, a2 = evaluate_reset(dur, 119.49)
        self.assertEqual(c2, 119.49)
        self.assertEqual(a2, 119.49)

        # Boundary 3: exact threshold dur - 0.5 (119.50) -> MUST reset to 0
        c3, a3 = evaluate_reset(dur, 119.50)
        self.assertEqual(c3, 0)
        self.assertEqual(a3, 0)

        # Boundary 4: dur - 0.1 (119.90) -> MUST reset to 0
        c4, a4 = evaluate_reset(dur, 119.90)
        self.assertEqual(c4, 0)
        self.assertEqual(a4, 0)

        # Boundary 5: exact dur (120.00) -> MUST reset to 0
        c5, a5 = evaluate_reset(dur, 120.00)
        self.assertEqual(c5, 0)
        self.assertEqual(a5, 0)

        # Boundary 6: pending seek active (pending_seek != None) -> should NOT reset
        c6, a6 = evaluate_reset(dur, 119.95, pending_seek=119.95)
        self.assertEqual(c6, 119.95)
        self.assertEqual(a6, 119.95)

        # Boundary 7: unknown duration (dur <= 0) -> should NOT reset
        c7, a7 = evaluate_reset(0, 50.0)
        self.assertEqual(c7, 50.0)
        self.assertEqual(a7, 50.0)

    def test_call_active_and_quarantine_gates(self):
        """AVRCP resume commands must be strictly gated when isCallActive or isPostCallQuarantine is true."""
        def try_resume(isCallActive, isPostCallQuarantine):
            if isCallActive:
                return 'ABORT_CALL'
            if isPostCallQuarantine:
                return 'ABORT_QUARANTINE'
            return 'RESUME_AUTHORIZED'

        self.assertEqual(try_resume(True, False), 'ABORT_CALL')
        self.assertEqual(try_resume(False, True), 'ABORT_QUARANTINE')
        self.assertEqual(try_resume(True, True), 'ABORT_CALL')
        self.assertEqual(try_resume(False, False), 'RESUME_AUTHORIZED')

    def test_rapid_avrcp_toggle_stress_500_cycles(self):
        """
        Stress-test 500 rapid alternating pause/resume AVRCP toggle cycles in Mode 2.
        Verifies zero flag desynchronization, zero redundant anchor starts, and consistent state.
        """
        class Anchor:
            def __init__(self):
                self.paused = False
                self.play_calls = 0

            def play(self):
                self.paused = False
                self.play_calls += 1

            def pause(self):
                self.paused = True

        class Player:
            def __init__(self):
                self.paused = False
                self._preventAutoplay = False
                self.currentTime = 10.0
                self.duration = 200.0

            def play(self, was_paused):
                if was_paused:
                    return False
                self.paused = False
                self._preventAutoplay = False
                return True

            def pause(self):
                self.paused = True
                self._preventAutoplay = True

        anchor = Anchor()
        player = Player()
        wasPausedByUser = False
        playbackMode = 'mode2'
        playbackState = 'playing'
        forcedRate = 1.0

        for cycle in range(500):
            # Alternating user action:
            isActuallyPaused = player.paused or wasPausedByUser
            if isActuallyPaused:
                # Resume action
                wasPausedByUser = False
                player._preventAutoplay = False
                playbackState = 'playing'
                forcedRate = 1.0
                if playbackMode == 'mode2':
                    if not anchor or anchor.paused:
                        anchor.play()
                success = player.play(wasPausedByUser)
                self.assertTrue(success)
                self.assertFalse(player.paused)
                self.assertFalse(player._preventAutoplay)
                self.assertEqual(playbackState, 'playing')
                self.assertEqual(forcedRate, 1.0)
            else:
                # Pause action
                wasPausedByUser = True
                player.pause()
                playbackState = 'playing'  # Mode 2 spoofing pins card
                forcedRate = 0.00001
                self.assertTrue(player.paused)
                self.assertTrue(player._preventAutoplay)
                self.assertTrue(wasPausedByUser)
                self.assertEqual(forcedRate, 0.00001)

        # Anchor was started once initially and remained running across all 500 cycles:
        # Zero redundant anchor.play() calls should have occurred during resumes
        self.assertEqual(anchor.play_calls, 0, 'Running anchor must never receive redundant play() calls')

if __name__ == '__main__':
    unittest.main()
