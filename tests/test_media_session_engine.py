import os
import re
import unittest

class TestMediaSessionEngine(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        media_session_path = os.path.join(base_dir, 'js', 'mediaSession.js')
        dom_path = os.path.join(base_dir, 'js', 'dom.js')
        main_path = os.path.join(base_dir, 'js', 'main.js')
        test_path = os.path.join(base_dir, 'tests', 'test_media_session_engine.py')

        with open(media_session_path, 'r', encoding='utf-8') as f:
            cls.ms_content = f.read()
        with open(dom_path, 'r', encoding='utf-8') as f:
            cls.dom_content = f.read()
        with open(main_path, 'r', encoding='utf-8') as f:
            cls.main_content = f.read()
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

    def test_toggle_playback_mode_defined(self):
        """Verify togglePlaybackMode exists and is exposed globally"""
        self.assertRegex(self.ms_content, r'function\s+togglePlaybackMode\s*\(')
        self.assertIn('window.togglePlaybackMode = togglePlaybackMode;', self.ms_content)

    def test_no_detect_shortcut_in_play_pause_handlers(self):
        """Ensure detectPlaybackModeShortcut is not called on routine play/pause actions"""
        play_match = re.search(r"navigator\.mediaSession\.setActionHandler\(\s*['\"]play['\"]\s*,\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*\);", self.ms_content)
        self.assertIsNotNone(play_match)
        self.assertNotIn("detectPlaybackModeShortcut()", play_match.group(1))

    def test_show_mode_toast_function(self):
        """showModeToast function is defined, exposed, and updates DOM elements"""
        self.assertRegex(self.ms_content, r'function\s+showModeToast\s*\(\s*text\s*\)')
        self.assertIn('window.showModeToast = showModeToast;', self.ms_content)
        self.assertIn('mode-toast', self.ms_content)
        self.assertIn('mode-toast-text', self.ms_content)

    def test_micro_rate_scoped_to_mobile(self):
        """Ensure 0.00001 micro-rate spoof is guarded by isMobileDevice check"""
        self.assertIn("isMobileDevice", self.ms_content)
        self.assertRegex(
            self.ms_content,
            r'isMobileDevice\s*\)\s*\{[\s\S]*?0\.00001[\s\S]*?\}\s*else\s*\{[\s\S]*?\(isBuffering\s*\|\|\s*isPaused\)\s*\?\s*0\s*:'
        )

    def test_start_live_anchor_scoped_to_mobile(self):
        """Ensure startLiveAudioAnchor exits early on desktop"""
        self.assertRegex(
            self.ms_content,
            r'if\s*\(\s*typeof\s+isMobileDevice\s*!==\s*[\'"]undefined[\'"]\s*&&\s*!isMobileDevice\s*\)\s*return;'
        )

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

    def test_mode2_was_paused_by_user_resume_and_disconnect_silence(self):
        """Pause action handler resumes in Mode 2 when wasPausedByUser is true and pauses during disconnect"""
        pause_handler_match = re.search(
            r"navigator\.mediaSession\.setActionHandler\(\s*['\"]pause['\"]\s*,\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*\);",
            self.ms_content
        )
        self.assertIsNotNone(pause_handler_match, "Could not find pause action handler in mediaSession.js")
        pause_code = pause_handler_match.group(1)

        self.assertIn("window.playbackMode === 'mode2' && audioPlayer && audioPlayer.paused && window.wasPausedByUser", pause_code)
        self.assertIn("audioPlayer.play()", pause_code)
        self.assertIn("window.wasPausedByUser = true;", pause_code)
        self.assertIn("audioPlayer.pause()", pause_code)
        self.assertIn("navigator.mediaSession.playbackState = (window.playbackMode === 'mode2') ? 'playing' : 'paused'", pause_code)

    def test_dual_audio_play_clean_execution_in_dom_js(self):
        """DualAudioPingPong play() sets volume, unsets muted, and directly invokes active.play()"""
        self.assertIn("this.active.muted = false;", self.dom_content)
        self.assertIn("return this.active.play();", self.dom_content)
        self.assertNotIn("this.active.currentTime = this.active.currentTime;", self.dom_content)

    def test_thumbnail_fetch_guarded_by_thumbs_disabled(self):
        """Ensure playback.js uses direct thumbUrl when !thumbsDisabled and checks offline cache when thumbsDisabled"""
        with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'js', 'playback.js'), 'r', encoding='utf-8') as f:
            content = f.read()
        self.assertRegex(content, r'if\s*\(\s*!thumbsDisabled\s*&&\s*thumbUrl\s*\)[\s\S]*?\{ src:\s*thumbUrl[\s\S]*?else\s*\{[\s\S]*?caches\.open\(\s*[\'"]yt-player-thumbs[\'"]\s*\)')

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

    def test_hardware_combo_shortcut(self):
        """Ensure nexttrack, previoustrack, seekforward, and seekbackward handlers detect combo and call togglePlaybackMode"""
        self.assertIn("lastPlaybackModeTransitions", self.ms_content)
        self.assertIn("2500", self.ms_content)
        self.assertIn("togglePlaybackMode()", self.ms_content)

    def test_hardware_combo_scoped_to_mobile(self):
        """Ensure combo shortcut is only active on mobile devices"""
        self.assertRegex(
            self.ms_content,
            r'isMobile\s*&&\s*window\.lastPlaybackModeTransitions\.action\s*===\s*[\'"]next[\'"]'
        )

    def test_buffer_stalled_guard_in_dom_js(self):
        """DualAudioPingPong in dom.js guards auto-resume with _isBufferStalled, readyState >= 3, and !this.active.paused"""
        self.assertIn("this._isBufferStalled = false;", self.dom_content)
        self.assertRegex(
            self.dom_content,
            r'if\s*\(\s*this\._isBufferStalled\s*&&\s*!window\.wasPausedByUser\s*&&\s*this\.active\.paused\s*&&\s*this\._pendingSeek\s*===\s*null\s*&&\s*this\.active\.readyState\s*>=\s*3\s*\)'
        )
        self.assertRegex(
            self.dom_content,
            r'if\s*\(\s*!preventAutoplay\s*&&\s*!window\.wasPausedByUser\s*&&\s*!this\.active\.paused\s*\)'
        )

    def test_focus_and_visibility_resume_in_main_js(self):
        """main.js defines debounced attemptFocusResume on visibilitychange event without pointerdown capture interference"""
        self.assertRegex(self.main_content, r'function\s+attemptFocusResume\s*\(\s*\)')
        self.assertRegex(self.main_content, r'document\.addEventListener\(\s*[\'"]visibilitychange[\'"]\s*,\s*attemptFocusResume\s*\)')
        self.assertIn("_focusResumeTimer", self.main_content)
        self.assertNotIn("capture: true", self.main_content)

    def test_bt_disconnect_anchor_debouncing(self):
        """mediaSession.js queues Mode 2 anchor behind anchorStartTimer and cancels on devicechange"""
        self.assertIn("anchorStartTimer", self.ms_content)
        self.assertIn("devicechange", self.ms_content)
        self.assertIn("800", self.ms_content)
        self.assertRegex(
            self.ms_content,
            r'navigator\.mediaDevices\.addEventListener\(\s*[\'"]devicechange[\'"][\s\S]*?stopLiveAudioAnchor\(\)'
        )

if __name__ == '__main__':
    unittest.main()
