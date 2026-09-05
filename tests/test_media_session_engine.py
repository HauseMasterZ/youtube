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
        state_path = os.path.join(base_dir, 'js', 'state.js')
        test_path = os.path.join(base_dir, 'tests', 'test_media_session_engine.py')

        with open(media_session_path, 'r', encoding='utf-8') as f:
            cls.ms_content = f.read()
        with open(dom_path, 'r', encoding='utf-8') as f:
            cls.dom_content = f.read()
        with open(main_path, 'r', encoding='utf-8') as f:
            cls.main_content = f.read()
        with open(state_path, 'r', encoding='utf-8') as f:
            cls.state_content = f.read()
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

    def test_anchor_user_gesture_priming(self):
        """initLiveAudioAnchor primes anchorEl with play/pause on initialization"""
        self.assertRegex(
            self.ms_content,
            r'anchorEl\.play\(\)\.then\(\s*\(\)\s*=>\s*\{[\s\S]*?anchorEl\.pause\(\);'
        )

    def test_watchdog_lifecycle_functions_defined(self):
        """armAutoKillWatchdog and cancelAutoKillWatchdog are defined and exposed"""
        self.assertRegex(self.ms_content, r'function\s+armAutoKillWatchdog\s*\(\s*\)')
        self.assertRegex(self.ms_content, r'function\s+cancelAutoKillWatchdog\s*\(\s*\)')
        self.assertIn('window.armAutoKillWatchdog = armAutoKillWatchdog;', self.ms_content)
        self.assertIn('window.cancelAutoKillWatchdog = cancelAutoKillWatchdog;', self.ms_content)

    def test_watchdog_lifecycle_implementation(self):
        """Watchdog checks playbackMode, btTimeoutMins, sets sleep timer, stops anchor, nulls metadata, and sets playbackState none"""
        self.assertIn('window.btSleepTimer', self.ms_content)
        self.assertIn('window.btTimeoutMins', self.ms_content)
        self.assertIn('cancelAutoKillWatchdog()', self.ms_content)
        self.assertIn("'never'", self.ms_content)
        self.assertIn('60 * 1000', self.ms_content)
        self.assertIn('Auto-kill: Inactivity timeout reached', self.ms_content)
        self.assertIn("'none'", self.ms_content)
        self.assertIn('navigator.mediaSession.metadata = null;', self.ms_content)

    def test_toggle_playback_mode_defined(self):
        """Verify togglePlaybackMode exists and is exposed globally"""
        self.assertRegex(self.ms_content, r'function\s+togglePlaybackMode\s*\(')
        self.assertIn('window.togglePlaybackMode = togglePlaybackMode;', self.ms_content)

    def test_no_detect_shortcut_in_play_pause_handlers(self):
        """Ensure detectPlaybackModeShortcut is not called on routine play/pause actions"""
        play_match = re.search(r"function\s+handlePlayAction\s*\(\s*\)\s*\{([\s\S]*?)\n    \}\n    window\.handlePlayAction", self.ms_content)
        self.assertIsNotNone(play_match)
        self.assertNotIn("detectPlaybackModeShortcut()", play_match.group(1))

    def test_show_mode_toast_function(self):
        """showModeToast function is defined, exposed, and updates DOM elements"""
        self.assertRegex(self.ms_content, r'function\s+showModeToast\s*\(\s*text\s*\)')
        self.assertIn('window.showModeToast = showModeToast;', self.ms_content)
        self.assertIn('mode-toast', self.ms_content)
        self.assertIn('mode-toast-text', self.ms_content)

    def test_no_micro_rate_spoof(self):
        """0.00001 micro-rate exists ONLY to freeze the card seekbar under spoofed mode2 pause; nowhere else"""
        self.assertIn("isMobileDevice", self.ms_content)
        self.assertNotIn("0.00001", self.dom_content)
        self.assertNotIn("0.00001", self.main_content)
        self.assertNotIn("0.00001", self.state_content)
        with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'js', 'playback.js'), 'r', encoding='utf-8') as f:
            playback_content = f.read()
        self.assertNotIn("0.00001", playback_content)
        self.assertEqual(self.ms_content.count("0.00001"), 2)
        self.assertRegex(
            self.ms_content,
            r'isPaused\s*&&\s*\(typeof\s+window\.playbackMode[\s\S]*?mode2[\s\S]*?rate\s*=\s*0\.00001;'
        )
        self.assertRegex(
            self.ms_content,
            r'function\s+reassertSpoofBurst[\s\S]*?updateMediaSessionPosition\(\s*audioPlayer\.currentTime\s*,\s*d\s*,\s*0\.00001\s*\);'
        )

    def test_start_live_anchor_scoped_to_mobile(self):
        """Ensure startLiveAudioAnchor exits early on desktop"""
        self.assertRegex(
            self.ms_content,
            r'if\s*\(\s*typeof\s+isMobileDevice\s*!==\s*[\'"]undefined[\'"]\s*&&\s*!isMobileDevice\s*\)\s*return;'
        )

    def test_start_live_anchor_leaves_declared_state_alone(self):
        """startLiveAudioAnchor starts audio without touching declared playback state"""
        self.assertRegex(
            self.ms_content,
            r'function\s+startLiveAudioAnchor\s*\(\s*\)[\s\S]*?anchorEl\.play\(\)'
        )
        self.assertNotRegex(
            self.ms_content,
            r'function\s+startLiveAudioAnchor\s*\(\s*\)\s*\{(?:(?!\n    function )[\s\S])*?playbackState'
        )

    def test_pause_listener_honest_paused(self):
        """audioPlayer pause event listener in main.js declares mode-aware paused state with rate 1.0"""
        self.assertRegex(
            self.main_content,
            r'audioPlayer\.addEventListener\(\s*[\'"]pause[\'"][\s\S]*?updateMediaSessionPosition\(\s*audioPlayer\.currentTime\s*,\s*dur\s*,\s*1\.0\s*\);[\s\S]*?declaredPausedState\(\)'
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
        """Pause action handler resumes in Mode 2 when audioPlayer.paused and pauses when !audioPlayer.paused"""
        pause_handler_match = re.search(
            r"navigator\.mediaSession\.setActionHandler\(\s*['\"]pause['\"]\s*,\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s*\}\s*\);\s*(?:\n\s*try|\n\s*navigator)",
            self.ms_content
        )
        self.assertIsNotNone(pause_handler_match, "Could not find pause action handler in mediaSession.js")
        pause_code = pause_handler_match.group(1)

        self.assertIn("audioPlayer && audioPlayer.paused", pause_code)
        self.assertIn("audioPlayer.play()", pause_code)
        self.assertIn("window.wasPausedByUser = true;", pause_code)
        self.assertIn("audioPlayer.pause()", pause_code)
        self.assertIn("startLiveAudioAnchor()", pause_code)

    def test_dual_audio_play_clean_execution_in_dom_js(self):
        """DualAudioPingPong play() sets volume, unsets muted, and directly invokes active.play() without seek collisions"""
        self.assertIn("this.active.muted = false;", self.dom_content)
        self.assertIn("return this.active.play();", self.dom_content)
        self.assertNotIn("this.active.currentTime = this.active.currentTime;", self.dom_content)
        self.assertNotIn("this.active.currentTime = ct;", self.dom_content)

    def test_play_authorization_choke_point_in_dom_js(self):
        """DualAudioPingPong play() gates on wasPausedByUser with no self-authorization; pauses keep volume at 1.0 so the OS keeps the card"""
        self.assertRegex(
            self.dom_content,
            r'play\(\)\s*\{[\s\S]*?if\s*\(\s*window\.wasPausedByUser\s*\)\s*\{\s*return\s+Promise\.resolve\(\);\s*\}'
        )
        self.assertNotRegex(
            self.dom_content,
            r'play\(\)\s*\{(?:(?!\n        (pause|instantPause|recoverTrack|switchTrack)\().)*?window\.wasPausedByUser\s*=\s*false;'
        )
        self.assertNotIn("this.active.volume = 0;", self.dom_content)

    def test_declared_paused_state_mapping(self):
        """state.js declares mode-aware paused state: mode2 spoofs playing (pin), mode1 honest paused"""
        self.assertIn("window.APP_BUILD", self.state_content)
        self.assertIn("window.APP_BUILD", self.main_content)
        self.assertIn("window.declaredPausedState = function()", self.state_content)
        self.assertRegex(
            self.state_content,
            r'window\.declaredPausedState\s*=\s*function\s*\(\s*\)\s*\{\s*return\s*\(\s*window\.playbackMode\s*===\s*[\'"]mode2[\'"]\s*\)\s*\?\s*[\'"]playing[\'"]\s*:\s*[\'"]paused[\'"];'
        )

    def test_honest_paused_playback_state_across_files(self):
        """pause paths in dom.js, main.js, and playback.js declare state via declaredPausedState helper"""
        for content in (self.dom_content, self.main_content):
            self.assertIn("declaredPausedState()", content)
        with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'js', 'playback.js'), 'r', encoding='utf-8') as f:
            playback_content = f.read()
        self.assertIn("declaredPausedState()", playback_content)
        # Mode 1 branch stays literally honest
        self.assertRegex(
            self.main_content,
            r'// Mode 1 or BT disconnect[\s\S]*?playbackState\s*=\s*[\'"]paused[\'"];'
        )

    def test_audio_handshake_stop_anchor_before_play(self):
        """Action handlers and dom.js invoke stopLiveAudioAnchor synchronously before audioPlayer.play"""
        self.assertRegex(
            self.ms_content,
            r'stopLiveAudioAnchor\(\);[\s\S]*?cancelAutoKillWatchdog\(\);[\s\S]*?const\s+playPromise\s*=\s*audioPlayer\.play\(\);'
        )
        self.assertRegex(
            self.dom_content,
            r'if\s*\(\s*typeof\s+stopLiveAudioAnchor\s*===\s*[\'"]function[\'"]\s*\)\s*\{\s*stopLiveAudioAnchor\(\);[\s\S]*?return\s+this\.active\.play\(\);'
        )

    def test_toggle_playback_mode_republishes_metadata(self):
        """togglePlaybackMode declares mode-aware paused state and re-publishes MediaMetadata when switching modes while paused"""
        self.assertRegex(
            self.ms_content,
            r'if\s*\(\s*typeof\s+hasMediaSession\s*!==\s*[\'"]undefined[\'"]\s*&&\s*hasMediaSession\s*\)\s*\{[\s\S]*?declaredPausedState\(\)[\s\S]*?new\s+MediaMetadata'
        )

    def test_thumbnail_fetch_guarded_by_thumbs_disabled(self):
        """Ensure playback.js uses 1:1 square artwork when !thumbsDisabled and checks offline square cache when thumbsDisabled"""
        with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'js', 'playback.js'), 'r', encoding='utf-8') as f:
            content = f.read()
        self.assertRegex(content, r'if\s*\(\s*!thumbsDisabled\s*&&\s*thumbUrl\s*\)[\s\S]*?getSquareArtwork\(\s*thumbUrl\s*,\s*track\.id[\s\S]*?else\s+if\s*\(\s*thumbsDisabled\s*&&\s*thumbUrl\s*\)[\s\S]*?getCachedSquareArtwork\(\s*track\.id\s*,\s*thumbUrl')

    def test_play_action_stops_live_anchor_before_play(self):
        """Verify play handler stops anchor and sets playbackState to playing"""
        play_handler_match = re.search(
            r"function\s+handlePlayAction\s*\(\s*\)\s*\{([\s\S]*?)\n    \}\n    window\.handlePlayAction",
            self.ms_content
        )
        self.assertIsNotNone(play_handler_match, "Could not find handlePlayAction in mediaSession.js")
        play_code = play_handler_match.group(1)
        self.assertIn("stopLiveAudioAnchor()", play_code)
        self.assertIn("navigator.mediaSession.playbackState = 'playing'", play_code)

    def test_play_handler_registered_unconditionally(self):
        """play action always registered (null-withdrawal reverted: glyph follows session activity, BT PLAY must keep its target)"""
        self.assertRegex(
            self.ms_content,
            r"setActionHandler\(\s*['\"]play['\"]\s*,\s*handlePlayAction\s*\)"
        )
        self.assertNotIn("applyPlayHandlerForMode", self.ms_content)

    def test_anchor_always_on_in_mode2(self):
        """Mode 2 keeps the anchor across playback and steals: starts on play/dom-play/toggle, never stopped on external pause"""
        self.assertRegex(
            self.ms_content,
            r'audioPlayer\.addEventListener\(\s*[\'"]play[\'"][\s\S]*?if\s*\(\s*window\.playbackMode\s*===\s*[\'"]mode2[\'"]\s*\)\s*\{\s*if\s*\(\s*typeof\s+startLiveAudioAnchor'
        )
        self.assertRegex(
            self.dom_content,
            r'if\s*\(\s*window\.playbackMode\s*===\s*[\'"]mode2[\'"]\s*\)\s*\{\s*if\s*\(\s*typeof\s+startLiveAudioAnchor'
        )
        self.assertRegex(
            self.main_content,
            r'window\.wasPausedByUser\s*=\s*false;[\s\S]*?if\s*\(\s*window\.playbackMode\s*===\s*[\'"]mode2[\'"]\s*\)\s*\{\s*if\s*\(\s*typeof\s+startLiveAudioAnchor'
        )

    def test_anchor_survives_external_steal(self):
        """external-steal branch never stops the anchor; init only pauses it outside Mode 2"""
        self.assertRegex(
            self.ms_content,
            r'if\s*\(\s*!window\.wasPausedByUser\s*\)\s*\{(?:(?!stopLiveAudioAnchor)[\s\S])*?return;'
        )
        self.assertEqual(
            len(re.findall(r"if\s*\(\s*window\.playbackMode\s*!==\s*['\"]mode2['\"]\s*\)\s*\{\s*_isInternalAnchorStop", self.ms_content)),
            2
        )

    def test_pause_boundary_recycles_anchor(self):
        """mode2 user-pause performs flagged stop+start recycle (genuine focus request)"""
        self.assertRegex(
            self.ms_content,
            r'_isInternalAnchorStop\s*=\s*true;[\s\S]*?anchorEl\.pause\(\);[\s\S]*?startLiveAudioAnchor\(\);[\s\S]*?setTimeout\(\s*\(\s*\)\s*=>\s*\{\s*_isInternalAnchorStop\s*=\s*false;\s*\},\s*200\s*\);'
        )

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

    def test_hardware_combo_executes_track_navigation(self):
        """Ensure nexttrack and previoustrack execute playNext and playPrev alongside togglePlaybackMode"""
        self.assertRegex(
            self.ms_content,
            r'navigator\.mediaSession\.setActionHandler\(\s*[\'"]previoustrack[\'"][\s\S]*?togglePlaybackMode\(\);[\s\S]*?playPrev\(\);'
        )
        self.assertRegex(
            self.ms_content,
            r'navigator\.mediaSession\.setActionHandler\(\s*[\'"]nexttrack[\'"][\s\S]*?togglePlaybackMode\(\);[\s\S]*?playNext\(\);'
        )

    def test_buffer_stalled_guard_in_dom_js(self):
        """DualAudioPingPong in dom.js guards auto-resume with _isBufferStalled, readyState >= 3, and !this.active.paused"""
        self.assertIn("this._isBufferStalled = false;", self.dom_content)
        self.assertRegex(
            self.dom_content,
            r'if\s*\(\s*this\._isBufferStalled\s*&&\s*!window\.wasPausedByUser\s*&&\s*!this\.active\.paused\s*&&\s*this\._pendingSeek\s*===\s*null\s*&&\s*this\.active\.readyState\s*>=\s*3\s*\)'
        )
        self.assertRegex(
            self.dom_content,
            r'if\s*\(\s*!preventAutoplay\s*&&\s*!window\.wasPausedByUser\s*\)'
        )

    def test_focus_and_visibility_resume_in_main_js(self):
        """main.js has no background autoplay on visibilitychange: only foreground anchor re-arm, no focus listener"""
        self.assertNotIn("attemptFocusResume", self.main_content)
        self.assertNotIn("_focusResumeTimer", self.main_content)
        self.assertRegex(self.main_content, r'document\.addEventListener\(\s*[\'"]visibilitychange[\'"]')
        self.assertNotIn('window.addEventListener("focus"', self.main_content)
        self.assertNotIn("capture: true", self.main_content)

    def test_foreground_resurrects_interrupted_session_honest(self):
        """visible foreground with interrupted (non-user) pause rebuilds metadata honest-paused for triangle delivery"""
        self.assertRegex(
            self.main_content,
            r'!\s*window\.wasPausedByUser\s*&&\s*window\.wasPlayingBeforeCall\s*!==\s*false[\s\S]*?window\.publishTrackMetadata\(track'
        )
        self.assertRegex(
            self.main_content,
            r'!\s*window\.wasPausedByUser\s*&&\s*window\.wasPlayingBeforeCall\s*!==\s*false[\s\S]*?navigator\.mediaSession\.playbackState\s*=\s*[\'"]paused[\'"];'
        )

    def test_hidden_bookend_respoofs_unattended(self):
        """hidden transition while paused in Mode 2 re-spoofs via helper (unattended pin)"""
        self.assertRegex(
            self.main_content,
            r'\}\s*else\s*\{\s*// Going hidden while paused in Mode 2[\s\S]*?declaredPausedState\(\)'
        )

    def test_bt_disconnect_stops_anchor_and_watchdog(self):
        """mediaSession.js tracks knownOutputCount, forces mode-aware playbackState on disconnect, and cancels watchdog"""
        self.assertIn("window.lastBtDisconnectTime", self.ms_content)
        self.assertIn("devicechange", self.ms_content)
        self.assertIn("knownOutputCount", self.ms_content)
        self.assertRegex(
            self.ms_content,
            r'newCount\s*<\s*knownOutputCount[\s\S]*?audioPlayer\.(instantPause|pause)\(\)'
        )
        self.assertRegex(
            self.ms_content,
            r'newCount\s*<\s*knownOutputCount[\s\S]*?stopLiveAudioAnchor\(\);'
        )
        self.assertRegex(
            self.ms_content,
            r'newCount\s*<\s*knownOutputCount(?:(?!\n\s*knownOutputCount\s*=\s*newCount)[\s\S])*?declaredPausedState\(\)'
        )
        self.assertRegex(
            self.ms_content,
            r'newCount\s*<\s*knownOutputCount(?:(?!\n\s*knownOutputCount\s*=\s*newCount)[\s\S])*?updateMediaSessionPosition\(\s*pos\s*,\s*dur\s*,\s*1\.0\s*\)'
        )

    def test_mode2_pause_arms_anchor_and_watchdog(self):
        """mediaSession.js audioPlayer pause listener arms anchor and watchdog in Mode 2 when not call active and not BT disconnect"""
        self.assertRegex(
            self.ms_content,
            r'audioPlayer\.addEventListener\(\s*[\'"]pause[\'"][\s\S]*?if\s*\(\s*window\.playbackMode\s*===\s*[\'"]mode2[\'"]\s*&&\s*!window\.isCallActive\s*&&\s*!isRecentBtDisconnect\s*\)\s*\{[\s\S]*?startLiveAudioAnchor\(\);[\s\S]*?armAutoKillWatchdog\(\);'
        )

    def test_bt_device_count_disconnect_detection(self):
        """mediaSession.js counts audiooutput devices to differentiate disconnect from connect"""
        self.assertRegex(
            self.ms_content,
            r'd\.filter\(\s*x\s*=>\s*x\.kind\s*===\s*[\'"]audiooutput[\'"]\s*\)\.length'
        )

    def test_action_handlers_clear_last_bt_disconnect_time(self):
        """Action handlers reset lastBtDisconnectTime to 0 on user resume"""
        self.assertRegex(
            self.ms_content,
            r'navigator\.mediaSession\.setActionHandler\(\s*[\'"]play[\'"][\s\S]*?window\.lastBtDisconnectTime\s*=\s*0;'
        )

    def test_next_song_buffering_threshold(self):
        """main.js progress listener checks 85 percent threshold and _streamDone before triggering preloads"""
        self.assertIn("0.85", self.main_content)
        self.assertIn("_streamDone", self.main_content)
        self.assertIn("triggerPreloads()", self.main_content)

    def test_toggle_playback_mode_synchronizes_paused_state(self):
        """togglePlaybackMode declares mode-aware paused state with rate 1.0 when switched while paused"""
        self.assertRegex(
            self.ms_content,
            r'function\s+togglePlaybackMode[\s\S]*?if\s*\(\s*isPaused\s*\)\s*\{[\s\S]*?declaredPausedState\(\)'
        )
        self.assertRegex(
            self.ms_content,
            r'updateMediaSessionPosition\(\s*pos\s*,\s*dur\s*,\s*1\.0\s*\)'
        )
        self.assertRegex(
            self.ms_content,
            r'function\s+togglePlaybackMode[\s\S]*?if\s*\(\s*anchorStartTimer\s*\)\s*\{\s*clearTimeout\(\s*anchorStartTimer\s*\);\s*anchorStartTimer\s*=\s*null;\s*\}'
        )

    def test_toggle_playback_mode_preserves_playing_state_on_mode1_switch(self):
        """togglePlaybackMode defines isPaused strictly by audioPlayer.paused or wasPausedByUser without false positive isAnchorActive"""
        self.assertRegex(
            self.ms_content,
            r'const\s+isPaused\s*=\s*\(typeof\s+audioPlayer\s*!==\s*[\'"]undefined[\'"][\s\S]*?\(audioPlayer\.paused\s*\|\|\s*window\.wasPausedByUser\)\);'
        )
        self.assertNotIn("isAnchorActive", self.ms_content)
        self.assertRegex(
            self.ms_content,
            r'function\s+togglePlaybackMode[\s\S]*?audioPlayer\.instantPause\(\)'
        )

    def test_stop_live_audio_anchor_teardown(self):
        """stopLiveAudioAnchor cleanly pauses anchorEl and teardownLiveAudioAnchor completely cleans up on Mode 1"""
        self.assertRegex(
            self.ms_content,
            r'function\s+stopLiveAudioAnchor\s*\(\s*\)[\s\S]*?anchorEl\.pause\(\);'
        )
        self.assertRegex(
            self.ms_content,
            r'function\s+teardownLiveAudioAnchor\s*\(\s*\)[\s\S]*?anchorEl\.srcObject\s*=\s*null;'
        )
        self.assertRegex(
            self.ms_content,
            r'function\s+teardownLiveAudioAnchor\s*\(\s*\)[\s\S]*?anchorEl\.removeAttribute\(\s*[\'"]src[\'"]\s*\);'
        )
        self.assertRegex(
            self.ms_content,
            r'function\s+teardownLiveAudioAnchor\s*\(\s*\)[\s\S]*?liveAudioContext\.close\(\)'
        )
        self.assertIn("teardownLiveAudioAnchor()", self.ms_content)

    def test_deterministic_mode1_pause_handler(self):
        """setActionHandler pause handles isActuallyPaused in Mode 1 to resume playback"""
        self.assertRegex(
            self.ms_content,
            r'const\s+isActuallyPaused\s*=\s*\(typeof\s+audioPlayer\s*!==\s*[\'"]undefined[\'"][\s\S]*?\(audioPlayer\.paused\s*\|\|\s*window\.wasPausedByUser\)\);[\s\S]*?if\s*\(\s*isActuallyPaused\s*\)\s*\{[\s\S]*?audioPlayer\.play\(\)'
        )

    def test_mode1_switch_enforces_paused_pipeline(self):
        """togglePlaybackMode declares honest paused on both mode branches when switching while paused"""
        self.assertNotRegex(
            self.ms_content,
            r'newMode\s*===\s*[\'"]mode2[\'"]\s*\)\s*\?\s*[\'"]playing[\'"]'
        )
        self.assertRegex(
            self.ms_content,
            r'if\s*\(\s*typeof\s+setPlayUI\s*===\s*[\'"]function[\'"]\s*\)\s*setPlayUI\(\s*false\s*\);'
        )
        self.assertIn("new MediaMetadata", self.ms_content)
        self.assertNotIn("setPositionState(null)", self.ms_content)

    def test_mode1_switch_audio_session_handshake(self):
        """togglePlaybackMode performs audioPlayer.active handshake on Mode 1 switch while paused"""
        self.assertRegex(
            self.ms_content,
            r'if\s*\(\s*audioPlayer\.active\s*&&\s*audioPlayer\.active\.paused\s*\)\s*\{[\s\S]*?audioPlayer\.active\.play\(\)[\s\S]*?audioPlayer\.active\.pause\(\)'
        )

    def test_mode2_anchor_starts_synchronously_on_pause(self):
        """Mode 2 starts live audio anchor synchronously on audioPlayer pause with no focus gap"""
        self.assertRegex(
            self.ms_content,
            r'audioPlayer\.addEventListener\(\s*[\'"]pause[\'"][\s\S]*?if\s*\(\s*window\.playbackMode\s*===\s*[\'"]mode2[\'"]\s*&&\s*audioPlayer\.paused[\s\S]*?startLiveAudioAnchor\(\);[\s\S]*?armAutoKillWatchdog\(\);'
        )
        self.assertNotRegex(
            self.ms_content,
            r'anchorStartTimer\s*=\s*setTimeout'
        )

    def test_phone_call_state_flags_in_state_js(self):
        """state.js declares wasPlayingBeforeCall, lastCallEndTime, and isCallActive flags"""
        self.assertIn("window.wasPlayingBeforeCall = false;", self.state_content)
        self.assertIn("window.lastCallEndTime = 0;", self.state_content)
        self.assertIn("window.isCallActive = false;", self.state_content)

    def test_phone_call_accepted_sets_paused_with_rate_1_0(self):
        """devicechange sets isCallActive and forces mode-aware playbackState with rate 1.0"""
        self.assertIn("window.isCallActive = true;", self.ms_content)
        self.assertRegex(
            self.ms_content,
            r'newCount\s*<\s*knownOutputCount(?:(?!\n\s*knownOutputCount\s*=\s*newCount)[\s\S])*?declaredPausedState\(\)'
        )
        self.assertRegex(
            self.ms_content,
            r'newCount\s*<\s*knownOutputCount(?:(?!\n\s*knownOutputCount\s*=\s*newCount)[\s\S])*?updateMediaSessionPosition\(\s*pos\s*,\s*dur\s*,\s*1\.0\s*\)'
        )

    def test_phone_call_hangup_auto_resume_and_post_call_filter(self):
        """devicechange resets isCallActive, auto-resumes if wasPlayingBeforeCall, and action handlers filter post-call events via centralized helper"""
        self.assertIn("window.isCallActive = false;", self.ms_content)
        self.assertIn("window.lastCallEndTime = Date.now();", self.ms_content)
        self.assertRegex(
            self.ms_content,
            r'if\s*\(\s*window\.wasPlayingBeforeCall\s*&&\s*!window\.wasPausedByUser[\s\S]*?audioPlayer\.play\(\)'
        )
        self.assertIn("window.isPostCallQuarantine = function()", self.state_content)
        self.assertNotIn("isAutoResumeAfterCall", self.ms_content)
        self.assertRegex(
            self.ms_content,
            r'window\.isPostCallQuarantine\(\)'
        )

    def test_action_handlers_guarded_against_active_call(self):
        """Action handlers return early when window.isCallActive is true"""
        self.assertRegex(
            self.ms_content,
            r'setActionHandler\(\s*[\'"]play[\'"][\s\S]*?if\s*\(\s*window\.isCallActive\s*\)\s*return;'
        )
        self.assertRegex(
            self.ms_content,
            r'setActionHandler\(\s*[\'"]pause[\'"][\s\S]*?if\s*\(\s*window\.isCallActive\s*\)\s*return;'
        )
        self.assertRegex(
            self.ms_content,
            r'setActionHandler\(\s*[\'"]playpause[\'"][\s\S]*?if\s*\(\s*window\.isCallActive\s*\)\s*return;'
        )

    def test_hangup_rearms_anchor_when_staying_paused(self):
        """devicechange hangup while staying paused re-arms anchor and watchdog (occasion 2 keepalive)"""
        self.assertRegex(
            self.ms_content,
            r'window\.isCallActive\s*=\s*false;[\s\S]*?else\s+if\s*\(\s*typeof\s+audioPlayer[\s\S]*?startLiveAudioAnchor\(\);[\s\S]*?armAutoKillWatchdog\(\);'
        )

    def test_seek_buttons_resume_in_mode2(self):
        """seekbackward/seekforward resume paused Mode 2 playback (post-steal guarantee)"""
        for action in ('seekbackward', 'seekforward'):
            handler_match = re.search(
                r"setActionHandler\(\s*['\"]" + action + r"['\"]\s*,\s*\(details\)\s*=>\s*\{([\s\S]*?)\n        \}\);",
                self.ms_content
            )
            self.assertIsNotNone(handler_match, f"Could not find {action} action handler")
            code = handler_match.group(1)
            self.assertIn("window.playbackMode === 'mode2'", code)
            self.assertIn("audioPlayer.play()", code)
            self.assertIn("startLiveAudioAnchor()", code)
            self.assertIn("cancelAutoKillWatchdog()", code)

    def test_seekto_stays_positioning_only(self):
        """seekto (seekbar scrub) never auto-plays"""
        seekto_match = re.search(
            r"setActionHandler\(\s*['\"]seekto['\"]\s*,\s*\(details\)\s*=>\s*\{([\s\S]*?)\n        \}\);",
            self.ms_content
        )
        self.assertIsNotNone(seekto_match, "Could not find seekto action handler")
        self.assertNotIn("audioPlayer.play()", seekto_match.group(1))

    def test_publish_track_metadata_helper(self):
        """playback.js exposes publishTrackMetadata used by resurrection"""
        with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'js', 'playback.js'), 'r', encoding='utf-8') as f:
            playback_content = f.read()
        self.assertIn("window.publishTrackMetadata = function(track, thumbUrl, originalIndex)", playback_content)
        self.assertIn("window.publishTrackMetadata(track, thumbUrl, originalIndex);", playback_content)

    def test_focus_probe_lifecycle_functions(self):
        """prime/start/stopFocusProbe defined, exposed, and internally flagged"""
        self.assertRegex(self.ms_content, r'function\s+primeFocusProbe\s*\(\s*\)')
        self.assertRegex(self.ms_content, r'function\s+startFocusProbe\s*\(\s*\)')
        self.assertRegex(self.ms_content, r'function\s+stopFocusProbe\s*\(\s*\)')
        self.assertIn('window.primeFocusProbe = primeFocusProbe;', self.ms_content)
        self.assertIn('window.startFocusProbe = startFocusProbe;', self.ms_content)
        self.assertIn('window.stopFocusProbe = stopFocusProbe;', self.ms_content)
        self.assertIn('_isProbeInternal', self.ms_content)
        self.assertIn('getElementById("focus-probe")', self.ms_content)

    def test_focus_probe_pause_is_passive(self):
        """probe pause never writes playbackState (pin absolutism) nor tears down anchor, watchdog, or UI"""
        probe_match = re.search(
            r'bindFocusProbeHandler[\s\S]*?probeEl\.addEventListener\(\s*["\']pause["\']\s*,\s*\(\)\s*=>\s*\{([\s\S]*?)\n        \}\);',
            self.ms_content
        )
        self.assertIsNotNone(probe_match, "Could not find probe pause handler")
        code = probe_match.group(1)
        self.assertNotIn("playbackState", code)
        self.assertNotIn("stopLiveAudioAnchor()", code)
        self.assertNotIn("cancelAutoKillWatchdog()", code)
        self.assertNotIn("setPlayUI(", code)
        self.assertIn("armAutoKillWatchdog()", code)
        self.assertIn("!_isProbeInternal", code)
        self.assertIn("[PROBE-SUSPEND]", code)

    def test_spoof_reassert_burst(self):
        """reassertSpoofBurst re-declares playing with frozen rate, self-terminates, and runs on steal paths"""
        self.assertRegex(
            self.ms_content,
            r'function\s+reassertSpoofBurst\s*\(\s*\)\s*\{[\s\S]*?if\s*\(\s*window\.playbackMode\s*!==\s*[\'"]mode2[\'"]\s*\)\s*return;'
        )
        self.assertRegex(
            self.ms_content,
            r'function\s+reassertSpoofBurst[\s\S]*?navigator\.mediaSession\.playbackState\s*=\s*[\'"]playing[\'"];'
        )
        self.assertRegex(
            self.ms_content,
            r'function\s+reassertSpoofBurst[\s\S]*?updateMediaSessionPosition\(\s*audioPlayer\.currentTime\s*,\s*d\s*,\s*0\.00001\s*\);'
        )
        self.assertRegex(
            self.ms_content,
            r'function\s+reassertSpoofBurst[\s\S]*?if\s*\(\s*\+\+n\s*<\s*5\s*\)\s*setTimeout\(\s*tick\s*,\s*1000\s*\);'
        )
        self.assertIn("window.reassertSpoofBurst = reassertSpoofBurst;", self.ms_content)

    def test_brace_balance_media_session_js(self):
        """mediaSession.js has perfectly balanced curly braces with no syntax errors"""
        open_b = self.ms_content.count('{')
        close_b = self.ms_content.count('}')
        self.assertEqual(open_b, close_b, f"Mismatched braces in mediaSession.js: {open_b} open vs {close_b} close")

    def test_destroyed_marker_lifecycle(self):
        """watchdog destroy sets marker, anchor start respects it, user intent clears it"""
        self.assertIn('window.mediaSessionDestroyed = false;', self.state_content)
        self.assertIn('window.mediaSessionDestroyed = true;', self.ms_content)
        self.assertIn('if (window.mediaSessionDestroyed) return;', self.ms_content)

    def test_metadata_republished_on_resume(self):
        """song info is re-sent fresh on hangup resume, play start, and foregrounding"""
        self.assertRegex(self.ms_content, r'function\s+republishMediaMetadata\s*\(\s*\)')
        self.assertIn('window.republishMediaMetadata = republishMediaMetadata;', self.ms_content)
        self.assertIn('new MediaMetadata({', self.ms_content)
        self.assertRegex(
            self.ms_content,
            r'window\.isCallActive\s*=\s*false;[\s\S]*?audioPlayer\.play\(\)[\s\S]*?republishMediaMetadata\(\);'
        )
        self.assertRegex(
            self.ms_content,
            r'audioPlayer\.addEventListener\(\s*[\'"]play[\'"][\s\S]*?republishMediaMetadata\(\);'
        )
        self.assertRegex(
            self.main_content,
            r'document\.addEventListener\(\s*[\'"]visibilitychange[\'"][\s\S]*?republishMediaMetadata\(\);'
        )

if __name__ == '__main__':
    unittest.main()

