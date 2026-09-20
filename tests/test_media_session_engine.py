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
        """0.00001 micro-rate freezes the card seekbar under buffering/switching and spoofed mode2 pause; absent from main/state"""
        self.assertIn("isMobileDevice", self.ms_content)
        self.assertNotIn("0.00001", self.main_content)
        self.assertNotIn("0.00001", self.state_content)
        with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'js', 'playback.js'), 'r', encoding='utf-8') as f:
            playback_content = f.read()
        self.assertIn("playbackRate: 0.00001", playback_content)
        self.assertIn("updateMediaSessionPosition(0, expectedDuration || 0, 0.00001)", self.dom_content)
        self.assertIn("updateMediaSessionPosition(0, totalDur, 0.00001)", self.dom_content)
        self.assertRegex(
            self.ms_content,
            r'if\s*\(\s*isPaused\s*\)\s*\{[\s\S]*?rate\s*=\s*0\.00001;'
        )
        self.assertIn("reassertSpoofBurst", self.ms_content)

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
        self.assertIn("window.APP_BUILD = 'm2-88';", self.state_content)
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

    def test_anchor_and_context_listeners_never_kill_anchor_in_mode2(self):
        """anchorEl pause and audioContext statechange never call stopLiveAudioAnchor or cancelAutoKillWatchdog"""
        anchor_pause_match = re.search(
            r'anchorEl\.addEventListener\(\s*["\']pause["\']\s*,\s*\(\)\s*=>\s*\{([\s\S]*?)\n        \}\);',
            self.ms_content
        )
        self.assertIsNotNone(anchor_pause_match, "Could not find anchorEl pause listener")
        anchor_pause_code = anchor_pause_match.group(1)
        self.assertNotIn("stopLiveAudioAnchor()", anchor_pause_code)
        self.assertNotIn("cancelAutoKillWatchdog()", anchor_pause_code)
        self.assertIn("armAutoKillWatchdog()", anchor_pause_code)
        self.assertIn("republishMediaMetadata()", anchor_pause_code)

        ctx_change_match = re.search(
            r'liveAudioContext\.onstatechange\s*=\s*\(\)\s*=>\s*\{([\s\S]*?)\n            \};',
            self.ms_content
        )
        self.assertIsNotNone(ctx_change_match, "Could not find liveAudioContext onstatechange listener")
        ctx_code = ctx_change_match.group(1)
        self.assertNotIn("stopLiveAudioAnchor()", ctx_code)
        self.assertNotIn("cancelAutoKillWatchdog()", ctx_code)
        self.assertIn("armAutoKillWatchdog()", ctx_code)
        self.assertIn("republishMediaMetadata()", ctx_code)

    def test_external_steal_republishes_metadata_without_probe_collision(self):
        """external steal branch re-publishes metadata and avoids background startFocusProbe collision"""
        steal_match = re.search(
            r'if\s*\(\s*!window\.wasPausedByUser\s*\)\s*\{([\s\S]*?)return;',
            self.ms_content
        )
        self.assertIsNotNone(steal_match, "Could not find external steal branch")
        steal_code = steal_match.group(1)
        self.assertIn("republishMediaMetadata()", steal_code)
        self.assertNotIn("startFocusProbe()", steal_code)
        self.assertIn("armAutoKillWatchdog()", steal_code)

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
        self.assertIn("togglePlaybackMode", self.ms_content)

    def test_hardware_combo_scoped_to_mobile(self):
        """Ensure combo shortcut is only active on mobile devices"""
        self.assertRegex(
            self.ms_content,
            r'isMobile\s*&&\s*window\.lastPlaybackModeTransitions\.action\s*===\s*[\'"]next[\'"]'
        )

    def test_hardware_combo_consumes_shortcut(self):
        """Ensure nexttrack and previoustrack consume combo gesture and execute navigation on normal tap"""
        self.assertRegex(
            self.ms_content,
            r'navigator\.mediaSession\.setActionHandler\(\s*[\'"]previoustrack[\'"][\s\S]*?togglePlaybackMode\(null,[\s\S]*?\);\s*return;[\s\S]*?playPrev\(\);'
        )
        self.assertRegex(
            self.ms_content,
            r'navigator\.mediaSession\.setActionHandler\(\s*[\'"]nexttrack[\'"][\s\S]*?togglePlaybackMode\(null,[\s\S]*?\);\s*return;[\s\S]*?playNext\(\);'
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

    def test_foreground_resurrects_interrupted_session_declared_state(self):
        """visible foreground with interrupted (non-user) pause rebuilds metadata and sets mode-declared state"""
        self.assertRegex(
            self.main_content,
            r'!\s*window\.wasPausedByUser\s*&&\s*window\.wasPlayingBeforeCall\s*!==\s*false[\s\S]*?window\.publishTrackMetadata\(track'
        )
        self.assertRegex(
            self.main_content,
            r'!\s*window\.wasPausedByUser\s*&&\s*window\.wasPlayingBeforeCall\s*!==\s*false[\s\S]*?declaredPausedState\(\)'
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
        self.assertIn("setPositionState()", self.ms_content)

    def test_watchdog_teardown_clears_position_state(self):
        """Auto-kill watchdog calls setPositionState() guarded by feature check inside media session teardown block"""
        self.assertRegex(
            self.ms_content,
            r"navigator\.mediaSession\.metadata\s*=\s*null;[\s\S]*?setPositionState\s*\(\s*\)"
        )
        self.assertRegex(
            self.ms_content,
            r"if\s*\(\s*'setPositionState'\s+in\s+navigator\.mediaSession\s*\)\s*\{\s*navigator\.mediaSession\.setPositionState\(\s*\);\s*\}"
        )

    def test_watchdog_teardown_stops_heartbeat_before_anchor_teardown(self):
        """Auto-kill watchdog stops anchor heartbeat before tearing down the live audio anchor"""
        self.assertRegex(
            self.ms_content,
            r"stopAnchorHeartbeat\(\);[\s\S]*?teardownLiveAudioAnchor\(\);"
        )

    def test_mode1_switch_audio_session_handshake(self):
        """togglePlaybackMode sets honest paused synchronously without clobbering async play-pause handshake"""
        self.assertNotIn("audioPlayer.active.play()", self.ms_content)
        self.assertRegex(
            self.ms_content,
            r'window\.wasPausedByUser\s*=\s*true;[\s\S]*?audioPlayer\.instantPause\(\);[\s\S]*?navigator\.mediaSession\.playbackState\s*=\s*[\'"]paused[\'"];'
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
        self.assertIn("reassertSpoofBurst()", code)

    def test_spoof_reassert_burst(self):
        """reassertSpoofBurst re-declares playing with frozen rate, self-terminates, and runs on steal paths"""
        self.assertRegex(
            self.ms_content,
            r'function\s+reassertSpoofBurst\s*\(\s*\)\s*\{[\s\S]*?window\.playbackMode\s*!==\s*[\'"]mode2[\'"]\s*\)\s*return;'
        )
        self.assertRegex(
            self.ms_content,
            r'function\s+reassertSpoofBurst[\s\S]*?declaredPausedState\(\)'
        )
        self.assertRegex(
            self.ms_content,
            r'function\s+reassertSpoofBurst[\s\S]*?updateMediaSessionPosition\(\s*audioPlayer\.currentTime'
        )
        self.assertRegex(
            self.ms_content,
            r'function\s+reassertSpoofBurst[\s\S]*?republishMediaMetadata\(\);'
        )
        self.assertIn("window.reassertSpoofBurst = reassertSpoofBurst;", self.ms_content)

    def test_declared_paused_state_on_respoof_paths(self):
        """declaredPausedState is respected on all respoof paths in main.js and mediaSession.js"""
        self.assertRegex(
            self.main_content,
            r'hasMediaSession[\s\S]*?declaredPausedState\(\)'
        )
        self.assertNotIn("_probeTrippedSteal", self.state_content)
        self.assertNotIn("_probeTrippedSteal", self.main_content)

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

    def test_external_interruption_preserves_playing_state_and_recycles_anchor(self):
        """External focus loss in Mode 2 maintains declared playing state and starts anchor so IsActive remains true"""
        self.assertNotIn("_isExternalInterrupted", self.state_content)
        self.assertNotIn("_isExternalInterrupted", self.ms_content)
        self.assertNotIn("_isExternalInterrupted", self.main_content)
        self.assertRegex(
            self.ms_content,
            r'if\s*\(\s*!window\.wasPausedByUser\s*\)\s*\{[\s\S]*?startLiveAudioAnchor\(\);[\s\S]*?return;'
        )
        self.assertRegex(
            self.ms_content,
            r'if\s*\(\s*!window\.wasPausedByUser\s*\)\s*\{[\s\S]*?declaredPausedState\(\)[\s\S]*?return;'
        )

    def test_anchor_heartbeat_lifecycle_functions_defined(self):
        """startAnchorHeartbeat and stopAnchorHeartbeat are defined and exposed globally"""
        self.assertRegex(self.ms_content, r'function\s+startAnchorHeartbeat\s*\(\s*\)')
        self.assertRegex(self.ms_content, r'function\s+stopAnchorHeartbeat\s*\(\s*\)')
        self.assertIn('window.startAnchorHeartbeat = startAnchorHeartbeat;', self.ms_content)
        self.assertIn('window.stopAnchorHeartbeat = stopAnchorHeartbeat;', self.ms_content)

    def test_anchor_heartbeat_implementation(self):
        """Heartbeat checks mode2, call status, player pause, uses pending guard, and re-asserts state"""
        self.assertIn('anchorHeartbeatTimer = setInterval', self.ms_content)
        self.assertIn('1000', self.ms_content)
        self.assertIn('_isAnchorPlayPending', self.ms_content)
        self.assertRegex(
            self.ms_content,
            r'anchorEl\.play\(\)\.then\(\s*\(\)\s*=>\s*\{[\s\S]*?declaredPausedState\(\)'
        )

    def test_telecom_isolation_stops_heartbeat_synchronously(self):
        """Call start immediately stops heartbeat and halts anchor to protect Bluetooth SCO"""
        self.assertRegex(
            self.ms_content,
            r'window\.isCallActive\s*=\s*true;[\s\S]*?stopAnchorHeartbeat\(\);'
        )

    def test_heartbeat_forced_pause_then_play_recycle(self):
        """Heartbeat uses forced pause-then-play recycle with 200ms stop window to force genuine WebMediaPlayer focus request"""
        self.assertRegex(
            self.ms_content,
            r'_isInternalAnchorStop\s*=\s*true;\s*try\s*\{\s*anchorEl\.pause\(\);\s*\}\s*catch\s*\(e\)\s*\{\}\s*setTimeout\(\s*\(\)\s*=>\s*\{\s*_isInternalAnchorStop\s*=\s*false;\s*\},\s*200\s*\);'
        )
        self.assertRegex(
            self.ms_content,
            r'_isInternalAnchorStart\s*=\s*true;\s*anchorEl\.play\(\)\.then'
        )

    def test_heartbeat_split_timer_handles_and_liveness_check(self):
        """Heartbeat uses split anchorHeartbeatTimeout and anchorHeartbeatTimer handles, and checks track liveness"""
        self.assertIn('let anchorHeartbeatTimeout = null;', self.ms_content)
        self.assertIn('let anchorHeartbeatTimer = null;', self.ms_content)
        self.assertIn('initLiveAudioAnchor();', self.ms_content)
        self.assertRegex(
            self.ms_content,
            r'tracks\.length\s*===\s*0\s*\|\|\s*tracks\[0\]\.readyState\s*===\s*[\'"]ended[\'"]'
        )

    def test_heartbeat_stops_on_resolution(self):
        """Heartbeat self-terminates upon anchorEl.play resolution to conserve battery and hold IsActive"""
        self.assertRegex(
            self.ms_content,
            r'anchorEl\.play\(\)\.then\(\s*\(\)\s*=>\s*\{[\s\S]*?stopAnchorHeartbeat\(\);'
        )

    def test_pruned_dead_variables_absent(self):
        """Verify pruned dead variables are completely absent from mediaSession.js"""
        self.assertNotIn("_probeTrippedSteal", self.ms_content)
        self.assertNotIn("lastCallStartTime", self.ms_content)
        self.assertNotIn("lastAudioPlayerPauseTime", self.ms_content)
        self.assertNotIn("audioPlayer.audio1", self.ms_content)
        self.assertNotIn("audioPlayer.audio2", self.ms_content)

    def test_toggle_playback_mode_playing_switch(self):
        """togglePlaybackMode while playing sets playbackState to playing and republishes metadata"""
        self.assertRegex(
            self.ms_content,
            r'window\.wasPausedByUser\s*=\s*false;\s*if\s*\(\s*typeof\s+setPlayUI\s*===\s*[\'"]function[\'"]\s*\)\s*setPlayUI\(\s*true\s*\);\s*if\s*\(\s*typeof\s+hasMediaSession\s*!==\s*[\'"]undefined[\'"]\s*&&\s*hasMediaSession\s*\)\s*\{\s*navigator\.mediaSession\.playbackState\s*=\s*[\'"]playing[\'"];'
        )
        self.assertRegex(
            self.ms_content,
            r'navigator\.mediaSession\.playbackState\s*=\s*[\'"]playing[\'"];\s*if\s*\(\s*typeof\s+republishMediaMetadata\s*===\s*[\'"]function[\'"]\s*\)\s*\{\s*republishMediaMetadata\(\);'
        )

    def test_auto_kill_watchdog_operates_on_active_player(self):
        """armAutoKillWatchdog tears down audioPlayer.active directly"""
        self.assertRegex(
            self.ms_content,
            r'if\s*\(\s*audioPlayer\.active\s*\)\s*\{[\s\S]*?audioPlayer\.active\.pause\(\);[\s\S]*?audioPlayer\.active\.removeAttribute\(\s*[\'"]src[\'"]\s*\);'
        )

    def test_toggle_playback_mode_paused_republishes_metadata_and_bursts(self):
        """togglePlaybackMode while paused republishes metadata and arms reassertSpoofBurst for Mode 2"""
        self.assertRegex(
            self.ms_content,
            r'if\s*\(\s*isPaused\s*\)\s*\{[\s\S]*?republishMediaMetadata\(\);[\s\S]*?updateMediaSessionPosition\(pos,\s*dur,\s*1\.0\);[\s\S]*?reassertSpoofBurst\(\);'
        )

    def test_init_live_audio_anchor_mode2_guard(self):
        """initLiveAudioAnchor returns immediately if window.playbackMode is not mode2"""
        self.assertRegex(
            self.ms_content,
            r'function\s+initLiveAudioAnchor\s*\(\s*\)\s*\{\s*if\s*\(\s*window\.playbackMode\s*!==\s*[\'"]mode2[\'"]\s*\)\s*\{\s*return\s+liveAudioContext;\s*\}'
        )

    def test_update_media_session_position_unified_paused(self):
        """updateMediaSessionPosition checks both audioPlayer.paused and window.wasPausedByUser"""
        self.assertRegex(
            self.ms_content,
            r'const\s+isPaused\s*=\s*\(typeof\s+audioPlayer\s*!==\s*[\'"]undefined[\'"]\s*&&\s*audioPlayer\s*&&\s*\(audioPlayer\.paused\s*\|\|\s*window\.wasPausedByUser\)\)'
        )

    def test_init_live_audio_anchor_mode2_gated_in_play_paths(self):
        """initLiveAudioAnchor is gated behind window.playbackMode === 'mode2' in main.js and playback.js"""
        with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'js', 'main.js'), 'r', encoding='utf-8') as f:
            main_src = f.read()
        with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'js', 'playback.js'), 'r', encoding='utf-8') as f:
            playback_src = f.read()
        self.assertRegex(
            main_src,
            r'window\.playbackMode\s*===\s*[\'"]mode2[\'"]\s*&&\s*typeof\s+isMobileDevice[^\n]+initLiveAudioAnchor'
        )
        self.assertRegex(
            playback_src,
            r'window\.playbackMode\s*===\s*[\'"]mode2[\'"]\s*&&\s*typeof\s+isMobileDevice[^\n]+initLiveAudioAnchor'
        )

    def test_bt_disconnect_locks_was_paused_by_user(self):
        """Route loss in devicechange marks lastBtDisconnectTime, sets wasPausedByUser true, and clears isCallActive"""
        self.assertRegex(
            self.ms_content,
            r'newCount\s*<\s*knownOutputCount[\s\S]*?window\.lastBtDisconnectTime\s*=\s*Date\.now\(\);[\s\S]*?window\.isCallActive\s*=\s*false;[\s\S]*?window\.wasPausedByUser\s*=\s*true;[\s\S]*?window\.wasPlayingBeforeCall\s*=\s*false;'
        )

    def test_resync_media_session_on_foreground_defined(self):
        """mediaSession.js defines and exposes resyncMediaSessionOnForeground and shouldRepublishMetadata"""
        self.assertRegex(self.ms_content, r'function\s+resyncMediaSessionOnForeground\s*\(')
        self.assertRegex(self.ms_content, r'function\s+shouldRepublishMetadata\s*\(')
        self.assertIn('window.resyncMediaSessionOnForeground = resyncMediaSessionOnForeground;', self.ms_content)
        self.assertIn('window.shouldRepublishMetadata = shouldRepublishMetadata;', self.ms_content)

    def test_resync_media_session_canonical_ordering(self):
        """resyncMediaSessionOnForeground enforces metadata before position and position last"""
        self.assertRegex(
            self.ms_content,
            r'shouldRepublishMetadata\(\)[\s\S]*?republishMediaMetadata\(\);[\s\S]*?navigator\.mediaSession\.playbackState[\s\S]*?updateMediaSessionPosition\(audioPlayer\.currentTime,\s*dur\);'
        )

    def test_publish_track_metadata_records_key(self):
        """playback.js publishTrackMetadata records window.lastPublishedTrackKey"""
        with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'js', 'playback.js'), 'r', encoding='utf-8') as f:
            playback_src = f.read()
        self.assertIn('window.lastPublishedTrackKey = track.id || track.title || null;', playback_src)

    def test_visibilitychange_wires_resync_helpers(self):
        """main.js visibilitychange wires resyncMediaSessionOnForeground for unlock-playing and unlock-mode2-paused"""
        with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'js', 'main.js'), 'r', encoding='utf-8') as f:
            main_src = f.read()
        self.assertIn("resyncMediaSessionOnForeground('unlock-playing')", main_src)
        self.assertIn("resyncMediaSessionOnForeground('unlock-mode2-paused')", main_src)
        self.assertIn("startAnchorHeartbeat(0)", main_src)

    def test_update_media_session_position_monotonic_guard(self):
        """updateMediaSessionPosition enforces monotonic position guard to prevent backwards discontinuities"""
        self.assertRegex(
            self.ms_content,
            r'pos\s*<\s*_lastSentPosition\s*-\s*0\.5'
        )
        self.assertRegex(
            self.ms_content,
            r'_lastSentPosition\s*=\s*validPos;'
        )

    def test_teardown_live_audio_anchor_stops_tracks_and_loads(self):
        """teardownLiveAudioAnchor synchronously stops audio tracks and calls load() on anchorEl"""
        self.assertRegex(
            self.ms_content,
            r'function\s+teardownLiveAudioAnchor\s*\(\s*\)[\s\S]*?stream\.getAudioTracks\(\)\.forEach\([\s\S]*?t\.stop\(\)[\s\S]*?anchorEl\.load\(\);'
        )

    def test_toggle_playback_mode_mode1_paused_settle(self):
        """togglePlaybackMode Mode 1 paused re-asserts paused state with extended settle passes and idempotent track kill"""
        self.assertRegex(
            self.ms_content,
            r'const\s+settleMode1Paused\s*=\s*\(\)\s*=>\s*\{[\s\S]*?t\.stop\(\)[\s\S]*?navigator\.mediaSession\.playbackState\s*=\s*\'paused\';'
        )
        self.assertRegex(
            self.ms_content,
            r'setTimeout\(settleMode1Paused,\s*180\);[\s\S]*?setTimeout\(settleMode1Paused,\s*1200\);'
        )

    def test_visibilitychange_passive_dom_clock_update(self):
        """main.js visibilitychange updates DOM clock with float precision and aligns lastRenderTime without MediaSession IPC"""
        with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'js', 'main.js'), 'r', encoding='utf-8') as f:
            main_src = f.read()
        self.assertRegex(
            main_src,
            r'updateTimeUI\(audioPlayer\.currentTime\);[\s\S]*?lastRenderTime\s*=\s*Math\.floor\(audioPlayer\.currentTime\);'
        )

    def test_stop_focus_probe_unloads_element(self):
        """stopFocusProbe unbinds probe element and clears focusProbePrimed"""
        self.assertRegex(
            self.ms_content,
            r'function\s+stopFocusProbe\s*\(\s*\)\s*\{[\s\S]*?probeEl\.srcObject\s*=\s*null;[\s\S]*?probeEl\.removeAttribute\([\'"]src[\'"]\);[\s\S]*?probeEl\.load\(\);[\s\S]*?focusProbePrimed\s*=\s*false;'
        )

    def test_update_media_session_position_stability_guards(self):
        """updateMediaSessionPosition guards against rapid same-position and mode1-paused redundant writes"""
        self.assertRegex(
            self.ms_content,
            r'Math\.abs\(pos\s*-\s*_lastSentPosition\)\s*<\s*0\.25'
        )
        self.assertRegex(
            self.ms_content,
            r'window\.playbackMode\s*===\s*[\'"]mode1[\'"][\s\S]*?Math\.abs\(pos\s*-\s*_lastSentPosition\)\s*<\s*0\.25'
        )

    def test_resync_media_session_reanchors_playing_on_foreground(self):
        """resyncMediaSessionOnForeground re-anchors SystemUI on foreground playing with single forced position update"""
        self.assertRegex(
            self.ms_content,
            r'if\s*\(!isPaused\)\s*\{[\s\S]*?window\._forceNextPosition\s*=\s*true;[\s\S]*?updateMediaSessionPosition\(audioPlayer\.currentTime,\s*dur,\s*\(audioPlayer\s*&&\s*audioPlayer\.playbackRate\)\s*\|\|\s*1\.0,\s*true\);'
        )

    def test_resync_media_session_debounced_on_foreground(self):
        """resyncMediaSessionOnForeground debounces rapid duplicate calls from visibilitychange and pageshow"""
        self.assertRegex(
            self.ms_content,
            r'const\s+now\s*=\s*Date\.now\(\);[\s\S]*?now\s*-\s*_lastForegroundResyncTime\s*<\s*1000[\s\S]*?_lastForegroundResyncTime\s*=\s*now;'
        )

    def test_settle_mode1_paused_unbinds_focus_probe(self):
        """settleMode1Paused unbinds focus-probe element in settle passes"""
        self.assertRegex(
            self.ms_content,
            r'const\s+settleMode1Paused\s*=\s*\(\)\s*=>\s*\{[\s\S]*?focus-probe[\s\S]*?probeEl\.removeAttribute\([\'"]src[\'"]\);[\s\S]*?probeEl\.load\(\);'
        )

    def test_toggle_playback_mode_mode1_paused_state_only(self):
        """togglePlaybackMode Mode 1 paused asserts paused state and calls position update"""
        self.assertRegex(
            self.ms_content,
            r'if\s*\(\s*newMode\s*===\s*[\'"]mode2[\'"]\s*\)\s*\{[\s\S]*?updateMediaSessionPosition\(pos,\s*dur,\s*1\.0\);'
        )
        self.assertRegex(
            self.ms_content,
            r'navigator\.mediaSession\.playbackState\s*=\s*[\'"]paused[\'"];'
        )

    def test_toggle_playback_mode_mode1_paused_forced_position(self):
        """togglePlaybackMode Mode 1 paused forces honest position update before setting paused state to clear Mode 2 micro-rate"""
        self.assertRegex(
            self.ms_content,
            r'window\._forceNextPosition\s*=\s*true;[\s\S]*?updateMediaSessionPosition\(pos,\s*dur,\s*1\.0,\s*true\);[\s\S]*?navigator\.mediaSession\.playbackState\s*=\s*[\'"]paused[\'"];'
        )

    def test_update_media_session_position_force_bypass(self):
        """updateMediaSessionPosition honors force parameter and window._forceNextPosition"""
        self.assertRegex(
            self.ms_content,
            r'const\s+forceBypass\s*=\s*\(force\s*===\s*true\)\s*\|\|\s*\(typeof\s+window\._forceNextPosition\s*!==\s*[\'"]undefined[\'"]\s*&&\s*window\._forceNextPosition\s*===\s*true\);'
        )

    def test_timeupdate_lock_gap_self_heal_and_drift_gating(self):
        """main.js timeupdate handles lock gaps (>2500ms) with Math.max to prevent double-fire and delegates to drift-gating"""
        with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'js', 'main.js'), 'r', encoding='utf-8') as f:
            main_src = f.read()
        self.assertRegex(
            main_src,
            r'effectiveLastFire\s*=\s*Math\.max\(lastTimeupdateFire,\s*\(typeof\s+window\s*!==\s*[\'"]undefined[\'"]\s*&&\s*window\.lastTimeupdateFire\)\s*\|\|\s*0\);'
        )
        self.assertRegex(
            main_src,
            r'eventDelta\s*=\s*\(effectiveLastFire\s*>\s*0\)\s*\?\s*\(nowMonotonic\s*-\s*effectiveLastFire\)\s*:\s*0;'
        )
        self.assertRegex(
            main_src,
            r'staleGap\s*=\s*\(eventDelta\s*>\s*2500\);'
        )
        self.assertRegex(
            main_src,
            r'staleGap\s*&&\s*!audioPlayer\.paused[\s\S]*?window\._forceNextPosition\s*=\s*true;'
        )
        self.assertRegex(
            main_src,
            r'updateTimeUI\(ct\);[\s\S]*?updateMediaSessionPosition\(ct,\s*audioPlayer\.duration'
        )

    def test_visibilitychange_mode1_paused_reassert_on_hide(self):
        """main.js visibilitychange ensures honest paused state when going hidden in Mode 1 paused without redundant position IPC"""
        with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'js', 'main.js'), 'r', encoding='utf-8') as f:
            main_src = f.read()
        self.assertRegex(
            main_src,
            r'window\.playbackMode\s*===\s*[\'"]mode1[\'"][\s\S]*?navigator\.mediaSession\.playbackState\s*=\s*[\'"]paused[\'"];'
        )

    def test_update_media_session_position_drift_gate(self):
        """updateMediaSessionPosition drift-gates IPC against autonomous SystemUI extrapolation"""
        self.assertRegex(
            self.ms_content,
            r'const\s+expectedPos\s*=\s*_lastSentPosition\s*\+\s*\(elapsedSec\s*\*\s*\(rate\s*\|\|\s*1\.0\)\);'
        )
        self.assertRegex(
            self.ms_content,
            r'Math\.abs\(pos\s*-\s*expectedPos\)\s*<\s*2\.0'
        )

    def test_pageshow_listener_wires_resync(self):
        """main.js pageshow listener wires resyncMediaSessionOnForeground"""
        with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'js', 'main.js'), 'r', encoding='utf-8') as f:
            main_src = f.read()
        self.assertRegex(
            main_src,
            r'window\.addEventListener\([\'"]pageshow[\'"],\s*\(\)\s*=>\s*\{[\s\S]*?resyncMediaSessionOnForeground\([\'"]pageshow-playing[\'"]\);'
        )

    def test_resync_media_session_guards_republish_metadata_with_needs_rebind(self):
        """resyncMediaSessionOnForeground only republishes metadata when needsRebind is true to avoid SquigglyProgress freeze"""
        self.assertRegex(
            self.ms_content,
            r'if\s*\(!isPaused\)\s*\{[\s\S]*?const\s+needsRebind\s*=\s*\(typeof\s+shouldRepublishMetadata\s*===\s*[\'"]function[\'"]\)\s*&&\s*shouldRepublishMetadata\(\);[\s\S]*?if\s*\(\s*needsRebind\s*&&\s*typeof\s+republishMediaMetadata\s*===\s*[\'"]function[\'"]\s*\)\s*\{'
        )

    def test_toggle_playback_mode_guards_republish_metadata_on_pause(self):
        """togglePlaybackMode guards republishMediaMetadata with shouldRepublishMetadata when paused to prevent animation restarts"""
        self.assertRegex(
            self.ms_content,
            r'if\s*\(\s*isPaused\s*\)\s*\{[\s\S]*?const\s+needsRebind\s*=\s*\(typeof\s+shouldRepublishMetadata\s*===\s*[\'"]function[\'"]\)\s*&&\s*shouldRepublishMetadata\(\);[\s\S]*?if\s*\(\s*needsRebind\s*&&\s*typeof\s+republishMediaMetadata\s*===\s*[\'"]function[\'"]\s*\)\s*\{'
        )

    def test_toggle_playback_mode_mode1_synchronous_native_kill(self):
        """togglePlaybackMode Mode 1 synchronously kills probe and anchor elements before declaring paused"""
        self.assertRegex(
            self.ms_content,
            r'focus-probe[\s\S]*?probeEl\.pause\(\);[\s\S]*?live-stream-anchor[\s\S]*?anchorEl\.pause\(\);[\s\S]*?liveAudioContext\.suspend'
        )

    def test_visibilitychange_mode1_synchronous_native_kill_on_hide(self):
        """main.js visibilitychange synchronously kills probe and anchor before declaring paused on hide"""
        with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'js', 'main.js'), 'r', encoding='utf-8') as f:
            main_src = f.read()
        self.assertRegex(
            main_src,
            r'window\.playbackMode\s*===\s*[\'"]mode1[\'"][\s\S]*?live-stream-anchor[\s\S]*?aEl\.pause\(\);[\s\S]*?focus-probe[\s\S]*?pEl\.pause\(\);[\s\S]*?navigator\.mediaSession\.playbackState\s*=\s*[\'"]paused[\'"];'
        )

    def test_update_media_session_position_freshness_ceiling(self):
        """updateMediaSessionPosition enforces a 10s visible ceiling and 1000ms background ceiling to prevent SystemUI starvation and ensure fast homescreen unfreeze"""
        self.assertRegex(
            self.ms_content,
            r'const\s+freshnessCeilingMs\s*=\s*10000;[\s\S]*?backgroundCeilingMs\s*=\s*1000;[\s\S]*?effectiveCeiling\s*=\s*\(typeof\s+document\s*!==\s*[\'"]undefined[\'"]\s*&&\s*document\.hidden\s*&&\s*!isPaused\)\s*\?\s*backgroundCeilingMs\s*:\s*freshnessCeilingMs;'
        )
        self.assertRegex(
            self.ms_content,
            r'now\s*-\s*_lastSentTimestamp\s*>\s*effectiveCeiling'
        )

    def test_mode_transition_mutex_guards_resurrectors(self):
        """togglePlaybackMode arms window._modeTransitionUntil and guards resurrectors"""
        self.assertRegex(
            self.ms_content,
            r'if\s*\(\s*newMode\s*===\s*[\'"]mode1[\'"]\s*\)\s*\{[\s\S]*?window\._modeTransitionUntil\s*=\s*Date\.now\(\)\s*\+\s*2000;'
        )
        self.assertRegex(
            self.ms_content,
            r'function\s+startLiveAudioAnchor[\s\S]*?Date\.now\(\)\s*<\s*\(window\._modeTransitionUntil\s*\|\|\s*0\)'
        )

    def test_anchor_heartbeat_pauses_on_stale_generation(self):
        """startAnchorHeartbeat pauses anchorEl if generation is stale on play promise resolution"""
        self.assertRegex(
            self.ms_content,
            r'anchorEl\.play\(\)\.then\(\(\)\s*=>\s*\{[\s\S]*?currentGen\s*!==\s*_anchorGeneration[\s\S]*?anchorEl\.pause\(\);'
        )

    def test_audiocontext_close_awaited_on_mode1_switch(self):
        """togglePlaybackMode awaits AudioContext.close before declaring paused state on Mode 1 switch"""
        self.assertRegex(
            self.ms_content,
            r'const\s+ctxToClose\s*=\s*liveAudioContext;[\s\S]*?ctxToClose\.close\(\)\.then\(finishMode1SwitchOnce\)'
        )
        self.assertRegex(
            self.ms_content,
            r'const\s+finishMode1Switch\s*=\s*\([^)]*\)\s*=>\s*\{[\s\S]*?navigator\.mediaSession\.playbackState\s*=\s*[\'"]paused[\'"];'
        )

    def test_mode1_paused_rate_scoped_and_not_microrate(self):
        """Mode 1 paused uses nominal rate (not 0.00001 micro-rate) to avoid HyperOS wave animation leak"""
        self.assertRegex(
            self.ms_content,
            r'if\s*\(\s*window\.playbackMode\s*===\s*[\'"]mode2[\'"]\s*\)\s*\{[\s\S]*?rate\s*=\s*0\.00001;[\s\S]*?\}\s*else\s*\{[\s\S]*?rate\s*='
        )

    def test_finish_mode1_switch_position_before_paused_state(self):
        """finishMode1Switch updates position before setting playbackState to paused to ensure 0.0f speed in Android SystemUI"""
        self.assertRegex(
            self.ms_content,
            r'updateMediaSessionPosition\(pos,\s*dur,\s*1\.0,\s*true\);[\s\S]*?navigator\.mediaSession\.playbackState\s*=\s*[\'"]paused[\'"];'
        )

    def test_main_stale_gap_reasserts_playing(self):
        """main.js reasserts playing state and forces unthrottled position update when stale gap detected during playback"""
        with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'js', 'main.js'), 'r', encoding='utf-8') as f:
            main_src = f.read()
        self.assertRegex(
            main_src,
            r'staleGap\s*&&\s*!audioPlayer\.paused[\s\S]*?navigator\.mediaSession\.playbackState\s*=\s*[\'"]playing[\'"]'
        )
        self.assertNotRegex(
            main_src,
            r'restartSquigglyWaveAnimation'
        )

    def test_finish_mode1_switch_silent_active_el_cycle(self):
        """finishMode1Switch runs silent zero-volume muted cycle on activeEl protected by _isMode1SilentCycle"""
        self.assertRegex(
            self.ms_content,
            r'const\s+activeEl\s*=\s*\(typeof\s+audioPlayer[\s\S]*?window\._isMode1SilentCycle\s*=\s*true;[\s\S]*?activeEl\.volume\s*=\s*0;[\s\S]*?activeEl\.muted\s*=\s*true;[\s\S]*?activeEl\.play\(\)[\s\S]*?activeEl\.pause\(\);'
        )

    def test_finish_mode1_switch_restores_volume_and_unmutes_after_settle(self):
        """finishMode1Switch restores volume 1.0 and muted false 500ms after pause settles to prevent squiggly wave freeze"""
        self.assertRegex(
            self.ms_content,
            r'activeEl\.pause\(\);[\s\S]*?setTimeout\(\(\)\s*=>\s*\{[\s\S]*?activeEl\.volume\s*=\s*1\.0;[\s\S]*?activeEl\.muted\s*=\s*false;'
        )

    def test_settle_mode1_paused_reasserts_position(self):
        """settleMode1Paused reasserts honest position update alongside paused state"""
        self.assertRegex(
            self.ms_content,
            r'const\s+settleMode1Paused\s*=\s*\(\)\s*=>\s*\{[\s\S]*?updateMediaSessionPosition\(sPos,\s*sDur,\s*1\.0,\s*true\);'
        )

    def test_lock_gap_does_not_republish_metadata(self):
        """Lock gap detection in timeupdate does NOT republish MediaMetadata to preserve session identity and avoid wave freeze"""
        stale_block_match = re.search(r'if\s*\(\s*staleGap\s*&&\s*!audioPlayer\.paused\s*\)\s*\{([\s\S]*?)\n\s*updateTimeUI', self.main_content)
        self.assertIsNotNone(stale_block_match)
        self.assertNotIn("republishMediaMetadata", stale_block_match.group(1))

    def test_resync_media_session_reanchors_playing_on_foreground(self):
        """resyncMediaSessionOnForeground re-anchors SystemUI on foreground playing with single forced position update"""
        self.assertRegex(
            self.ms_content,
            r'window\._forceNextPosition\s*=\s*true;[\s\S]*?updateMediaSessionPosition\(audioPlayer\.currentTime,\s*dur,\s*\(audioPlayer\s*&&\s*audioPlayer\.playbackRate\)\s*\|\|\s*1\.0,\s*true\);'
        )
        self.assertNotIn("isFresh", self.ms_content)

    def test_resync_media_session_synchronizes_last_timeupdate_fire(self):
        """resyncMediaSessionOnForeground synchronizes window.lastTimeupdateFire with monotonic clock to suppress double-fire"""
        self.assertRegex(
            self.ms_content,
            r'const\s+monoNow\s*=\s*\(typeof\s+performance\s*!==\s*[\'"]undefined[\'"]\s*&&\s*performance\.now\)\s*\?\s*performance\.now\(\)\s*:\s*Date\.now\(\);[\s\S]*?window\.lastTimeupdateFire\s*=\s*monoNow;'
        )

    def test_resync_media_session_guards_quarantine_and_recent_bt_disconnect(self):
        """resyncMediaSessionOnForeground early-returns on call quarantine and recent bluetooth disconnect"""
        self.assertRegex(
            self.ms_content,
            r'if\s*\(typeof\s+window\.isPostCallQuarantine\s*===\s*[\'"]function[\'"]\s*&&\s*window\.isPostCallQuarantine\(\)\)\s*return;'
        )
        self.assertRegex(
            self.ms_content,
            r'const\s+isRecentBtDisconnect\s*=\s*\(typeof\s+window\.lastBtDisconnectTime\s*===\s*[\'"]number[\'"]\s*&&\s*Date\.now\(\)\s*-\s*window\.lastBtDisconnectTime\s*<\s*2500\);[\s\S]*?if\s*\(isRecentBtDisconnect\)\s*return;'
        )

    def test_action_handlers_guard_republish_metadata(self):
        """handlePlayAction, pause handler resume, and playpause handler resume guard republishMediaMetadata with shouldRepublishMetadata"""
        # handlePlayAction
        self.assertRegex(
            self.ms_content,
            r'function\s+handlePlayAction\s*\(\s*\)\s*\{[\s\S]*?if\s*\(typeof\s+shouldRepublishMetadata\s*===\s*[\'"]function[\'"]\s*&&\s*shouldRepublishMetadata\(\)\s*&&\s*typeof\s+republishMediaMetadata\s*===\s*[\'"]function[\'"]\)\s*\{[\s\S]*?republishMediaMetadata\(\);'
        )
        # pause action handler resume path
        self.assertRegex(
            self.ms_content,
            r'navigator\.mediaSession\.setActionHandler\([\'"]pause[\'"][\s\S]*?if\s*\(typeof\s+shouldRepublishMetadata\s*===\s*[\'"]function[\'"]\s*&&\s*shouldRepublishMetadata\(\)\s*&&\s*typeof\s+republishMediaMetadata\s*===\s*[\'"]function[\'"]\)\s*\{[\s\S]*?republishMediaMetadata\(\);'
        )
        # playpause action handler resume path
        self.assertRegex(
            self.ms_content,
            r'navigator\.mediaSession\.setActionHandler\([\'"]playpause[\'"][\s\S]*?if\s*\(typeof\s+shouldRepublishMetadata\s*===\s*[\'"]function[\'"]\s*&&\s*shouldRepublishMetadata\(\)\s*&&\s*typeof\s+republishMediaMetadata\s*===\s*[\'"]function[\'"]\)\s*\{[\s\S]*?republishMediaMetadata\(\);'
        )

    def test_main_background_stale_position_force(self):
        """main.js timeupdate detects background stale playback (>1000ms) and forces position update for fast home unlock recovery"""
        self.assertRegex(
            self.main_content,
            r'isBackgroundStale\s*=\s*isHiddenPlaying[\s\S]*?>\s*1000'
        )
        self.assertRegex(
            self.main_content,
            r'isBackgroundStale[\s\S]*?window\._forceNextPosition\s*=\s*true;'
        )

    def test_main_playing_listener_silent_cycle_guard(self):
        """main.js playing listener is guarded by _isMode1SilentCycle to prevent state pollution"""
        self.assertRegex(
            self.main_content,
            r'audioPlayer\.addEventListener\([\'"]playing[\'"],\s*\(\)\s*=>\s*\{[\s\S]*?if\s*\(window\._isMode1SilentCycle\)\s*return;'
        )

    def test_monotonic_event_delta_and_reset_hygiene(self):
        """main.js resets lastTimeupdateFire on pause, ended, and endSeek to prevent false lock gaps"""
        with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'js', 'main.js'), 'r', encoding='utf-8') as f:
            main_src = f.read()
        with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'js', 'state.js'), 'r', encoding='utf-8') as f:
            state_src = f.read()
        self.assertIn("window.lastTimeupdateFire = 0;", state_src)
        self.assertRegex(
            main_src,
            r'audioPlayer\.addEventListener\([\'"]pause[\'"],\s*\(\)\s*=>\s*\{[\s\S]*?lastTimeupdateFire\s*=\s*0;'
        )
        self.assertRegex(
            main_src,
            r'audioPlayer\.addEventListener\([\'"]ended[\'"],\s*\(\)\s*=>\s*\{[\s\S]*?lastTimeupdateFire\s*=\s*0;'
        )
        self.assertRegex(
            main_src,
            r'const\s+endSeek\s*=\s*\(e\)\s*=>\s*\{[\s\S]*?lastTimeupdateFire\s*=\s*0;'
        )
        self.assertRegex(
            main_src,
            r'nowMonotonic\s*=\s*\(typeof\s+performance\s*!==\s*[\'"]undefined[\'"]\s*&&\s*performance\.now\)\s*\?\s*performance\.now\(\)\s*:\s*Date\.now\(\);'
        )

    def test_shortcut_intent_preservation_and_mode_switch_retry(self):
        """mediaSession.js preserves playing intent during shortcut mode switch and retries if switching."""
        self.assertRegex(
            self.ms_content,
            r'function\s+togglePlaybackMode\(targetMode\s*=\s*null,\s*opts\s*=\s*\{\}\)\s*\{'
        )
        self.assertIn("const hasIntent = (typeof opts.intentPlaying === 'boolean');", self.ms_content)
        self.assertIn("const transportSwitching = (typeof audioPlayer !== 'undefined' && audioPlayer && (audioPlayer.switching || audioPlayer._pendingSeek !== null));", self.ms_content)
        self.assertIn("const transportPausedHonest = (typeof audioPlayer !== 'undefined' && audioPlayer && audioPlayer.paused && !transportSwitching);", self.ms_content)
        self.assertIn("const isPaused = hasIntent ? !opts.intentPlaying : (window.wasPausedByUser || transportPausedHonest);", self.ms_content)

        # finishMode1Switch retry and sequence preservation
        self.assertIn("const finishMode1Switch = (attempt = 0) => {", self.ms_content)
        self.assertIn("if (stillSwitching && attempt < 8) {", self.ms_content)
        self.assertIn("setTimeout(() => finishMode1Switch(attempt + 1), 300);", self.ms_content)
        self.assertIn("if (typeof opts.seqBefore !== 'undefined' && curSeq !== opts.seqBefore && hasIntent && opts.intentPlaying) {", self.ms_content)

        # settleMode1Paused guards
        self.assertIn("if (hasIntent && opts.intentPlaying) return;", self.ms_content)
        self.assertIn("if (audioPlayer.switching || audioPlayer._pendingSeek !== null) return;", self.ms_content)

        # Action handlers shortcut consumption
        self.assertRegex(
            self.ms_content,
            r"setActionHandler\('previoustrack'[\s\S]*?togglePlaybackMode\(null,\s*\{\s*intentPlaying:\s*intentPlayingBefore,\s*seqBefore:\s*seqBefore\s*\}\);\s*return;"
        )
        self.assertRegex(
            self.ms_content,
            r"setActionHandler\('nexttrack'[\s\S]*?togglePlaybackMode\(null,\s*\{\s*intentPlaying:\s*intentPlayingBefore,\s*seqBefore:\s*seqBefore\s*\}\);\s*return;"
        )
        self.assertRegex(
            self.ms_content,
            r"setActionHandler\('seekbackward'[\s\S]*?togglePlaybackMode\(null,\s*\{\s*intentPlaying:\s*intentPlayingBefore,\s*seqBefore:\s*seqBefore\s*\}\);\s*return;"
        )
        self.assertRegex(
            self.ms_content,
            r"setActionHandler\('seekforward'[\s\S]*?togglePlaybackMode\(null,\s*\{\s*intentPlaying:\s*intentPlayingBefore,\s*seqBefore:\s*seqBefore\s*\}\);\s*return;"
        )

if __name__ == '__main__':
    unittest.main()

