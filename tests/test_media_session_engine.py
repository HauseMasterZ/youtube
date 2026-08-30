import os
import re
import unittest

class TestMediaSessionEngine(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        media_session_path = os.path.join(base_dir, 'js', 'mediaSession.js')
        test_path = os.path.join(base_dir, 'tests', 'test_media_session_engine.py')

        with open(media_session_path, 'r', encoding='utf-8') as f:
            cls.ms_content = f.read()
        with open(test_path, 'r', encoding='utf-8') as f:
            cls.test_content = f.read()

    def test_no_emojis_in_media_session(self):
        """Strictly zero emojis in js/mediaSession.js"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        matches = emoji_pattern.findall(self.ms_content)
        self.assertEqual(matches, [], f"Found emojis in mediaSession.js: {matches}")

    def test_no_emojis_in_test_file(self):
        """Strictly zero emojis in tests/test_media_session_engine.py"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        matches = emoji_pattern.findall(self.test_content)
        self.assertEqual(matches, [], f"Found emojis in test_media_session_engine.py: {matches}")

    def test_live_audio_anchor_functions_defined(self):
        """initLiveAudioAnchor, startLiveAudioAnchor, and stopLiveAudioAnchor are defined and exposed"""
        self.assertRegex(self.ms_content, r'function\s+initLiveAudioAnchor\s*\(\s*\)')
        self.assertRegex(self.ms_content, r'function\s+startLiveAudioAnchor\s*\(\s*\)')
        self.assertRegex(self.ms_content, r'function\s+stopLiveAudioAnchor\s*\(\s*\)')
        self.assertIn('window.initLiveAudioAnchor = initLiveAudioAnchor;', self.ms_content)
        self.assertIn('window.startLiveAudioAnchor = startLiveAudioAnchor;', self.ms_content)
        self.assertIn('window.stopLiveAudioAnchor = stopLiveAudioAnchor;', self.ms_content)

    def test_live_audio_anchor_implementation(self):
        """Live audio anchor creates AudioContext and destination node with gain.value = 0 for pure silence"""
        self.assertRegex(self.ms_content, r'(AudioContext|webkitAudioContext)')
        self.assertIn('createMediaStreamDestination', self.ms_content)
        self.assertIn('live-stream-anchor', self.ms_content)
        self.assertIn('srcObject', self.ms_content)
        self.assertRegex(self.ms_content, r'liveAudioGain\.gain\.value\s*=\s*0;')
        self.assertNotIn('liveAudioGain.gain.value = 0.0001;', self.ms_content)
        # startLiveAudioAnchor checks mode2
        self.assertRegex(self.ms_content, r'window\.playbackMode\s*!==?\s*[\'"]mode2[\'"]')

    def test_watchdog_lifecycle_functions_defined(self):
        """armAutoKillWatchdog and cancelAutoKillWatchdog are defined and exposed"""
        self.assertRegex(self.ms_content, r'function\s+armAutoKillWatchdog\s*\(\s*\)')
        self.assertRegex(self.ms_content, r'function\s+cancelAutoKillWatchdog\s*\(\s*\)')
        self.assertIn('window.armAutoKillWatchdog = armAutoKillWatchdog;', self.ms_content)
        self.assertIn('window.cancelAutoKillWatchdog = cancelAutoKillWatchdog;', self.ms_content)

    def test_watchdog_lifecycle_implementation(self):
        """Watchdog checks playbackMode, btTimeoutMins, sets sleep timer, stops anchor and sets playbackState none"""
        self.assertIn('window.btSleepTimer', self.ms_content)
        self.assertIn('window.btTimeoutMins', self.ms_content)
        self.assertIn('cancelAutoKillWatchdog()', self.ms_content)
        self.assertIn("'never'", self.ms_content)
        self.assertIn('60 * 1000', self.ms_content)
        self.assertIn('Auto-kill: Inactivity timeout reached', self.ms_content)
        self.assertIn("'none'", self.ms_content)

    def test_four_tap_detector_implementation(self):
        """4-tap detector checks lastPlaybackModeTransitions within 1500ms, toggles mode, updates UI and toast"""
        self.assertIn('window.lastPlaybackModeTransitions', self.ms_content)
        self.assertRegex(self.ms_content, r'1500')
        self.assertRegex(self.ms_content, r'length\s*>=\s*4')
        self.assertIn('yt_playback_mode', self.ms_content)
        self.assertIn('mode-1-radio', self.ms_content)
        self.assertIn('mode-2-radio', self.ms_content)
        self.assertIn('bt-timeout-container', self.ms_content)
        self.assertIn('Mode Switched: Car & Bluetooth Mode', self.ms_content)
        self.assertIn('Mode Switched: Standard Mode', self.ms_content)

    def test_four_tap_detector_resets_transitions(self):
        """4-tap detector resets window.lastPlaybackModeTransitions after triggering switch"""
        self.assertRegex(self.ms_content, r'window\.lastPlaybackModeTransitions\s*=\s*\[\s*\]')

    def test_show_mode_toast_function(self):
        """showModeToast function is defined, exposed, and updates DOM elements"""
        self.assertRegex(self.ms_content, r'function\s+showModeToast\s*\(\s*text\s*\)')
        self.assertIn('window.showModeToast = showModeToast;', self.ms_content)
        self.assertIn('mode-toast', self.ms_content)
        self.assertIn('mode-toast-text', self.ms_content)

    def test_update_media_session_position_w3c_compliance(self):
        """updateMediaSessionPosition ensures paused/buffering rate is 0.00001 for W3C setPositionState compliance"""
        self.assertIn('0.00001', self.ms_content)
        self.assertRegex(self.ms_content, r'\(isBuffering\s*\|\|\s*isPaused\)\s*\?\s*0\.00001')
        self.assertNotIn('(isBuffering || isPaused) ? 0 :', self.ms_content)
        self.assertIn('setPositionState', self.ms_content)

    def test_action_handlers_include_playpause_and_taps(self):
        """Action handlers handle play, pause, playpause, nexttrack, previoustrack, seekto, seekbackward, seekforward"""
        self.assertIn("'play'", self.ms_content)
        self.assertIn("'pause'", self.ms_content)
        self.assertIn("'playpause'", self.ms_content)
        self.assertIn("'previoustrack'", self.ms_content)
        self.assertIn("'nexttrack'", self.ms_content)
        self.assertIn("'seekto'", self.ms_content)
        self.assertIn("'seekbackward'", self.ms_content)
        self.assertIn("'seekforward'", self.ms_content)

    def test_audio_player_event_listeners(self):
        """audioPlayer play/pause event listeners start/stop live audio anchor and watchdog"""
        self.assertRegex(self.ms_content, r"audioPlayer\.addEventListener\(\s*['\"]play['\"]")
        self.assertRegex(self.ms_content, r"audioPlayer\.addEventListener\(\s*['\"]pause['\"]")

    def test_mode2_tws_single_button_resume(self):
        """Pause action handler resumes playback when paused in mode2 for TWS single-button earbuds"""
        pause_handler_match = re.search(
            r"navigator\.mediaSession\.setActionHandler\(\s*['\"]pause['\"]\s*,\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*\);",
            self.ms_content
        )
        self.assertIsNotNone(pause_handler_match, "Could not find pause action handler in mediaSession.js")
        pause_code = pause_handler_match.group(1)

        # Check condition for Mode 2 paused state
        self.assertRegex(pause_code, r"window\.playbackMode\s*===\s*['\"]mode2['\"]\s*&&\s*audioPlayer\s*&&\s*audioPlayer\.paused")

        # Check resume branch
        self.assertIn("window.wasPausedByUser = false;", pause_code)
        self.assertIn("audioPlayer.play()", pause_code)
        self.assertIn("stopLiveAudioAnchor()", pause_code)
        self.assertIn("cancelAutoKillWatchdog()", pause_code)

        # Check standard pause branch
        self.assertIn("window.wasPausedByUser = true;", pause_code)
        self.assertIn("startLiveAudioAnchor()", pause_code)
        self.assertIn("armAutoKillWatchdog()", pause_code)

    def test_thumbnail_fetch_guarded_by_thumbs_disabled(self):
        """Ensure getSquareArtwork in playback.js is guarded by !thumbsDisabled"""
        with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'js', 'playback.js'), 'r', encoding='utf-8') as f:
            content = f.read()
        self.assertRegex(content, r'!thumbsDisabled\s*&&\s*!squareCached\s*&&\s*thumbUrl\s*&&\s*typeof\s+getSquareArtwork')

    def test_play_action_stops_live_anchor_before_play(self):
        """Verify play handler stops anchor and sets playbackState to playing"""
        play_handler_match = re.search(
            r"navigator\.mediaSession\.setActionHandler\(\s*['\"]play['\"]\s*,\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*\);",
            self.ms_content
        )
        self.assertIsNotNone(play_handler_match, "Could not find play action handler in mediaSession.js")
        play_code = play_handler_match.group(1)
        self.assertIn("stopLiveAudioAnchor()", play_code)
        self.assertIn("navigator.mediaSession.playbackState = 'playing'", play_code)

if __name__ == '__main__':
    unittest.main()
