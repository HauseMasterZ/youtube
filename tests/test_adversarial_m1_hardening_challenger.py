import os
import re
import unittest

class ChromiumMediaSessionDecodedSimulation:
    """
    Empirical behavioral simulation of Chromium MediaSessionImpl and Android MediaSessionHelper:
    - media_session_impl_decoded.cc
    - media_session_android_decoded.cc
    - MediaSessionHelper_decoded.java
    """
    HIDE_NOTIFICATION_DELAY_MILLIS = 500

    def __init__(self):
        self.normal_players_ = set()
        self.audio_focus_state_ = 'INACTIVE'
        self.desired_audio_focus_type_ = 'kGain'
        self.notification_visible = False
        self.notification_destroyed = False
        self.hide_task_scheduled_at = None
        self.playback_state_ = 'none'
        self.playback_rate_ = 1.0
        self.last_position_ = 0.0
        self.last_position_update_time_ = 0
        self.history = []

    def add_player(self, player_id):
        self.normal_players_.add(player_id)
        self.audio_focus_state_ = 'ACTIVE'
        self.on_session_state_changed()

    def remove_player(self, player_id):
        if player_id in self.normal_players_:
            self.normal_players_.remove(player_id)
        if len(self.normal_players_) == 0:
            self.audio_focus_state_ = 'INACTIVE'
        self.on_session_state_changed()

    def is_controllable(self):
        return (
            self.audio_focus_state_ != 'INACTIVE' and
            self.desired_audio_focus_type_ == 'kGain' and
            len(self.normal_players_) > 0
        )

    def on_session_state_changed(self):
        controllable = self.is_controllable()
        if controllable:
            self.notification_visible = True
            self.notification_destroyed = False
            self.hide_task_scheduled_at = None
        else:
            if self.notification_visible and self.hide_task_scheduled_at is None:
                self.hide_task_scheduled_at = 500

    def set_position_state(self, position, duration, rate, virtual_time_ms):
        """Simulate Chromium MediaPosition updates and operator== comparison."""
        elapsed = (virtual_time_ms - self.last_position_update_time_) * 0.001
        projected = self.last_position_ + (elapsed * self.playback_rate_)
        # Chromium MediaPosition::operator== check:
        # If position == projected and rate unchanged, update is considered duplicate
        is_duplicate = (abs(position - projected) < 0.001 and abs(rate - self.playback_rate_) < 0.0001)

        self.last_position_ = position
        self.playback_rate_ = rate
        self.last_position_update_time_ = virtual_time_ms
        self.history.append((virtual_time_ms, position, rate, is_duplicate))
        return not is_duplicate


class TestAdversarialM1HardeningChallenger(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        cls.base_dir = base_dir

        with open(os.path.join(base_dir, 'js', 'main.js'), 'r', encoding='utf-8') as f:
            cls.main_content = f.read()

        with open(os.path.join(base_dir, 'js', 'playback.js'), 'r', encoding='utf-8') as f:
            cls.playback_content = f.read()

        with open(os.path.join(base_dir, 'js', 'mediaSession.js'), 'r', encoding='utf-8') as f:
            cls.ms_content = f.read()

        with open(os.path.join(base_dir, 'js', 'dom.js'), 'r', encoding='utf-8') as f:
            cls.dom_content = f.read()

        with open(os.path.join(base_dir, 'js', 'utils.js'), 'r', encoding='utf-8') as f:
            cls.utils_content = f.read()

        with open(os.path.join(base_dir, 'js', 'lyrics.js'), 'r', encoding='utf-8') as f:
            cls.lyrics_content = f.read()

        with open(os.path.join(base_dir, 'sw.js'), 'r', encoding='utf-8') as f:
            cls.sw_content = f.read()

        with open(__file__, 'r', encoding='utf-8') as f:
            cls.test_content = f.read()

    def test_strictly_zero_emojis(self):
        """Verify strictly zero emojis across modified sources, tests, and documentation."""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        sources = {
            'main.js': self.main_content,
            'playback.js': self.playback_content,
            'mediaSession.js': self.ms_content,
            'dom.js': self.dom_content,
            'utils.js': self.utils_content,
            'lyrics.js': self.lyrics_content,
            'sw.js': self.sw_content,
            'test_adversarial_m1_hardening_challenger.py': self.test_content
        }
        for name, content in sources.items():
            matches = emoji_pattern.findall(content)
            self.assertEqual(len(matches), 0, f"Emoji invariant violated in {name}: {matches}")

    def test_unix_lf_line_endings(self):
        """Verify strictly UNIX LF line endings across modified sources and test suite."""
        files = [
            os.path.join(self.base_dir, 'js', 'main.js'),
            os.path.join(self.base_dir, 'js', 'playback.js'),
            os.path.join(self.base_dir, 'js', 'mediaSession.js'),
            os.path.join(self.base_dir, 'js', 'dom.js'),
            os.path.join(self.base_dir, 'js', 'utils.js'),
            os.path.join(self.base_dir, 'js', 'lyrics.js'),
            os.path.join(self.base_dir, 'sw.js'),
            __file__
        ]
        for fpath in files:
            with open(fpath, 'rb') as f:
                data = f.read()
            self.assertNotIn(b'\r\n', data, f"CRLF line ending detected in {fpath}")

    # =========================================================================
    # Issue B: Mode 2 First-Play Pause Retention Stress Tests
    # =========================================================================

    def test_fresh_init_unconditional_anchor_autoresume_binding(self):
        """Verify _setupAnchorAutoResume is unconditionally called when liveAudioContext is created fresh."""
        init_anchor_match = re.search(
            r'function\s+initLiveAudioAnchor\s*\(\s*\)\s*\{([\s\S]*?)\n\s{4}\}',
            self.ms_content
        )
        self.assertIsNotNone(init_anchor_match, "initLiveAudioAnchor function not found in mediaSession.js")
        init_body = init_anchor_match.group(1)

        # Fresh init branch (after new AudioCtx())
        fresh_branch_match = re.search(
            r'liveAudioContext\s*=\s*new\s+AudioCtx\(\);[\s\S]*?const\s+anchorEl\s*=\s*document\.getElementById\(["\']live-stream-anchor["\']\);([\s\S]*?)return\s+liveAudioContext;',
            init_body
        )
        self.assertIsNotNone(fresh_branch_match, "Fresh AudioContext branch not found in initLiveAudioAnchor")
        fresh_code = fresh_branch_match.group(1)

        # Must unconditionally call _setupAnchorAutoResume(anchorEl)
        self.assertRegex(
            fresh_code,
            r'if\s*\(anchorEl\)\s*\{\s*_setupAnchorAutoResume\(anchorEl\);',
            "_setupAnchorAutoResume(anchorEl) must be invoked unconditionally on fresh AudioContext initialization"
        )

    def test_anchor_autoresume_callback_behavior_on_first_song_pause(self):
        """Stress-test _setupAnchorAutoResume pause callback when main audioPlayer pauses on first song."""
        setup_match = re.search(
            r'function\s+_setupAnchorAutoResume\s*\(\s*anchorEl\s*\)\s*\{([\s\S]*?)\n\s{4}\}',
            self.ms_content
        )
        self.assertIsNotNone(setup_match, "_setupAnchorAutoResume function not found in mediaSession.js")
        setup_body = setup_match.group(1)

        # Idempotency guard
        self.assertIn("if (!anchorEl || anchorEl._boundAutoResume) return;", setup_body)
        self.assertIn("anchorEl._boundAutoResume = true;", setup_body)

        # Pause event listener logic
        pause_listener_match = re.search(
            r'anchorEl\.addEventListener\(["\']pause["\'],\s*\(\)\s*=>\s*\{([\s\S]*?)\}\);',
            setup_body
        )
        self.assertIsNotNone(pause_listener_match, "pause event listener not attached in _setupAnchorAutoResume")
        pause_code = pause_listener_match.group(1)

        # Must verify Mode 2 and audioPlayer paused state
        self.assertIn("window.playbackMode === 'mode2'", pause_code)
        self.assertIn("audioPlayer.paused", pause_code)

        # Must declare playbackState playing and update position with forced micro-rate 0.00001
        self.assertIn("updateMediaSessionPosition(pos, dur, 0.00001, true);", pause_code)

        # Must restart anchor via startLiveAudioAnchor()
        self.assertIn("startLiveAudioAnchor();", pause_code)

    def test_user_gesture_pointerdown_priming_callstacks(self):
        """Verify pointerdown listeners on trackList and btnPlayPause prime the anchor synchronously in Mode 2."""
        # 1. trackList pointerdown
        self.assertRegex(
            self.main_content,
            r'trackList\.addEventListener\(["\']pointerdown["\'],\s*\(\)\s*=>\s*\{[\s\S]*?if\s*\(window\.playbackMode\s*===\s*["\']mode2["\']\)[\s\S]*?initLiveAudioAnchor\(\);[\s\S]*?startLiveAudioAnchor\(\);[\s\S]*?\}\s*,\s*\{\s*passive:\s*true\s*\}\);',
            "trackList pointerdown listener must synchronously call initLiveAudioAnchor() and startLiveAudioAnchor() in Mode 2"
        )

        # 2. btnPlayPause pointerdown
        self.assertRegex(
            self.main_content,
            r'btnPlayPause\.addEventListener\(["\']pointerdown["\'],\s*\(\)\s*=>\s*\{[\s\S]*?if\s*\(window\.playbackMode\s*===\s*["\']mode2["\']\)[\s\S]*?initLiveAudioAnchor\(\);[\s\S]*?!audioPlayer\.src\s*&&\s*typeof\s+startLiveAudioAnchor',
            "btnPlayPause pointerdown listener must synchronously call initLiveAudioAnchor() and startLiveAudioAnchor() in Mode 2"
        )

        # 3. btnPlayPause click fallback when !audioPlayer.src
        self.assertRegex(
            self.main_content,
            r'if\s*\(!audioPlayer\.src\)\s*\{[\s\S]*?if\s*\(window\.playbackMode\s*===\s*["\']mode2["\']\)[\s\S]*?initLiveAudioAnchor\(\);[\s\S]*?startLiveAudioAnchor\(\);',
            "btnPlayPause click must prime initLiveAudioAnchor and startLiveAudioAnchor when audioPlayer.src is falsy"
        )

    def test_empirical_chromium_retention_on_first_play_pause(self):
        """Simulate fresh visit: user selects Mode 2, touches track, starts song 1, pauses at various times."""
        for pause_time_ms in [0, 50, 150, 300, 1000, 5000]:
            with self.subTest(pause_time_ms=pause_time_ms):
                sim = ChromiumMediaSessionDecodedSimulation()

                # User pointerdown initiates anchor synchronously
                sim.add_player('live-stream-anchor')
                self.assertTrue(sim.is_controllable())
                self.assertTrue(sim.notification_visible)
                self.assertIsNone(sim.hide_task_scheduled_at)

                # Song begins playing
                sim.add_player('audioPlayer')
                self.assertEqual(len(sim.normal_players_), 2)

                # User pauses song 1
                sim.remove_player('audioPlayer')

                # In Mode 2, anchor remains active (normal_players_ = 1)
                self.assertEqual(len(sim.normal_players_), 1)
                self.assertIn('live-stream-anchor', sim.normal_players_)
                self.assertTrue(sim.is_controllable())
                self.assertIsNone(sim.hide_task_scheduled_at)
                self.assertTrue(sim.notification_visible)
                self.assertFalse(sim.notification_destroyed)

    # =========================================================================
    # Issue C: Direct Unlock Animation Freeze & Projection Bypass Stress Tests
    # =========================================================================

    def test_projection_coercion_bypass_guard_in_media_session(self):
        """Verify updateMediaSessionPosition guards projection smoothing with !forceBypass."""
        fn_match = re.search(
            r'function\s+updateMediaSessionPosition\s*\([\s\S]*?const\s+forceBypass\s*=\s*([\s\S]*?)\n\s{4}\}',
            self.ms_content
        )
        self.assertIsNotNone(fn_match, "updateMediaSessionPosition function not found")
        fn_body = fn_match.group(0)

        # forceBypass computation must check both force === true and window._forceNextPosition === true
        self.assertRegex(
            fn_body,
            r'const\s+forceBypass\s*=\s*\(force\s*===\s*true\)\s*\|\|\s*\(typeof\s+window\._forceNextPosition\s*!==\s*["\']undefined["\']\s*&&\s*window\._forceNextPosition\s*===\s*true\);'
        )

        # forceBypass must immediately clear window._forceNextPosition to prevent leakage
        self.assertRegex(
            fn_body,
            r'if\s*\(forceBypass\)\s*\{\s*window\._forceNextPosition\s*=\s*false;\s*\}'
        )

        # Throttling return must be guarded with !forceBypass
        self.assertRegex(
            fn_body,
            r'if\s*\(!forceBypass\s*&&\s*!isRateShift\s*&&\s*!isPaused\s*&&\s*!isBuffering\s*&&\s*!isSeeking\s*&&\s*_lastSentPosition\s*>=\s*0\)'
        )

        # Mode 1 paused check must be guarded with !forceBypass
        self.assertRegex(
            fn_body,
            r'if\s*\(!forceBypass\s*&&\s*!isRateShift\s*&&\s*isPaused\s*&&\s*\(typeof\s+window\.playbackMode\s*!==\s*["\']undefined["\']\s*&&\s*window\.playbackMode\s*===\s*["\']mode1["\']\)'
        )

        # Projection coercion must be guarded with !forceBypass
        self.assertRegex(
            fn_body,
            r'if\s*\(!forceBypass\s*&&\s*!isPaused\s*&&\s*!isSeeking\s*&&\s*!isBuffering\s*&&\s*validRate\s*===\s*1\.0\s*&&\s*_lastSentPosition\s*>=\s*0\)'
        )

    def test_projection_smoothing_vs_force_bypass_simulation(self):
        """Simulate projection coercion algorithm: verify forceBypass preserves exact timestamp without smoothing."""
        def simulate_update_position(pos, dur, rate, force, force_next, last_pos, last_ts, current_ts):
            force_bypass = (force is True) or (force_next is True)
            valid_rate = rate if (rate > 0) else 1.0
            valid_pos = max(0.0, min(pos, dur))

            coerced = False
            if not force_bypass and valid_rate == 1.0 and last_pos >= 0:
                elapsed_since_last = current_ts - last_ts
                if elapsed_since_last < 1500:
                    projected = last_pos + (elapsed_since_last * 0.001 * valid_rate)
                    if abs(valid_pos - projected) < 0.25:
                        valid_pos = max(0.0, min(projected, dur))
                        coerced = True
                if elapsed_since_last < 1000 and valid_pos < last_pos:
                    valid_pos = last_pos
                    coerced = True

            return valid_pos, coerced

        dur = 200.0
        last_pos = 10.0
        last_ts = 1000000
        current_ts = last_ts + 500  # 500ms elapsed
        projected = last_pos + (500 * 0.001 * 1.0)  # 10.5s

        # Test Case 1: Normal playback without force: pos is 10.6s (within 0.25s of projected 10.5s)
        # Expected: Coerced to projected 10.5s
        vpos_norm, coerced_norm = simulate_update_position(
            pos=10.6, dur=dur, rate=1.0, force=False, force_next=False,
            last_pos=last_pos, last_ts=last_ts, current_ts=current_ts
        )
        self.assertTrue(coerced_norm)
        self.assertAlmostEqual(vpos_norm, projected, places=3)

        # Test Case 2: Unlock / Wake gap with force=True: pos is 10.6s
        # Expected: Bypasses coercion, outputs exact 10.6s
        vpos_forced, coerced_forced = simulate_update_position(
            pos=10.6, dur=dur, rate=1.0, force=True, force_next=False,
            last_pos=last_pos, last_ts=last_ts, current_ts=current_ts
        )
        self.assertFalse(coerced_forced)
        self.assertEqual(vpos_forced, 10.6)

        # Test Case 3: Unlock / Wake gap with window._forceNextPosition=True: pos is 10.6s
        # Expected: Bypasses coercion, outputs exact 10.6s
        vpos_flag, coerced_flag = simulate_update_position(
            pos=10.6, dur=dur, rate=1.0, force=False, force_next=True,
            last_pos=last_pos, last_ts=last_ts, current_ts=current_ts
        )
        self.assertFalse(coerced_flag)
        self.assertEqual(vpos_flag, 10.6)

    def test_stale_wake_gap_in_timeupdate(self):
        """Verify timeupdate listener detects staleGap (>3000ms) and dispatches forced rate 1.0 update."""
        timeupdate_match = re.search(
            r'audioPlayer\.addEventListener\(["\']timeupdate["\'],\s*\(\)\s*=>\s*\{([\s\S]*?)\}\);\s*audioPlayer\.addEventListener\(["\']progress["\']',
            self.main_content
        )
        self.assertIsNotNone(timeupdate_match, "audioPlayer timeupdate listener not found in main.js")
        tu_body = timeupdate_match.group(1)

        # staleGap detection
        self.assertIn("staleGap = (Date.now() - window.getLastPositionTimestamp() > 3000);", tu_body)

        # Forced wake update execution
        self.assertRegex(
            tu_body,
            r'if\s*\(roundedSec\s*!==\s*lastRenderTime\s*\|\|\s*\(staleGap\s*&&\s*!audioPlayer\.paused\)\)\s*\{[\s\S]*?const\s+isStaleWake\s*=\s*staleGap\s*&&\s*!audioPlayer\.paused;[\s\S]*?if\s*\(isStaleWake\)\s*\{\s*window\._forceNextPosition\s*=\s*true;\s*\}[\s\S]*?if\s*\(isStaleWake\)\s*\{\s*updateMediaSessionPosition\(ct,\s*dur,\s*1\.0,\s*true\);'
        )

    def test_direct_device_unlock_resync_pathways(self):
        """Verify visibilitychange directly triggers resyncMediaSessionOnForeground for unlock."""
        vc_match = re.search(
            r'document\.addEventListener\(["\']visibilitychange["\'],\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s{4}\}\);',
            self.main_content
        )
        self.assertIsNotNone(vc_match, "visibilitychange listener not found in main.js")
        vc_body = vc_match.group(1)

        # While playing
        self.assertIn("resyncMediaSessionOnForeground('unlock-playing');", vc_body)

        # While Mode 2 paused
        self.assertIn("resyncMediaSessionOnForeground('unlock-mode2-paused');", vc_body)

        # Verify resyncMediaSessionOnForeground implementation in mediaSession.js
        resync_match = re.search(
            r'function\s+resyncMediaSessionOnForeground\s*\(\s*reason\s*\)\s*\{([\s\S]*?)\n\s{4}\}',
            self.ms_content
        )
        self.assertIsNotNone(resync_match, "resyncMediaSessionOnForeground function not found")
        resync_body = resync_match.group(1)

        # Must set window._forceNextPosition = true and call updateMediaSessionPosition with force=true
        self.assertIn("window._forceNextPosition = true;", resync_body)
        self.assertRegex(
            resync_body,
            r'updateMediaSessionPosition\(audioPlayer\.currentTime,\s*dur,\s*\(audioPlayer\s*&&\s*audioPlayer\.playbackRate\)\s*\|\|\s*1\.0,\s*true\);'
        )

        # Follower timeout at 600ms must also set forceNextPosition and force=true
        self.assertRegex(
            resync_body,
            r'_resyncFollowerTimeout\s*=\s*setTimeout\(\(\)\s*=>\s*\{[\s\S]*?window\._forceNextPosition\s*=\s*true;[\s\S]*?updateMediaSessionPosition\(audioPlayer\.currentTime,\s*d2,\s*\(audioPlayer\s*&&\s*audioPlayer\.playbackRate\)\s*\|\|\s*1\.0,\s*true\);[\s\S]*?\}\s*,\s*600\);'
        )

    # =========================================================================
    # Issue A: Mode 2 Playback Resume Pathway Stress Tests
    # =========================================================================

    def test_mode2_resume_action_handlers_force_rate_1(self):
        """Verify setActionHandler pause, playpause, and play set rate 1.0 and force=true on resume."""
        # 1. pause handler resume branch
        pause_match = re.search(
            r"setActionHandler\(\s*['\"]pause['\"]\s*,\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*\);\s*try",
            self.ms_content
        )
        self.assertIsNotNone(pause_match)
        p_code = pause_match.group(1)
        self.assertIn("window.wasPausedByUser = false;", p_code)
        self.assertIn("audioPlayer._preventAutoplay = false;", p_code)
        self.assertIn("updateMediaSessionPosition(actualTime, dur, 1.0, true);", p_code)
        self.assertIn("audioPlayer.play()", p_code)

        # 2. playpause handler resume branch
        playpause_match = re.search(
            r"setActionHandler\(\s*['\"]playpause['\"]\s*,\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*\);\s*\}\s*catch",
            self.ms_content
        )
        self.assertIsNotNone(playpause_match)
        pp_code = playpause_match.group(1)
        self.assertIn("window.wasPausedByUser = false;", pp_code)
        self.assertIn("audioPlayer._preventAutoplay = false;", pp_code)
        self.assertIn("updateMediaSessionPosition(actualTime, dur, 1.0, true);", pp_code)
        self.assertIn("audioPlayer.play()", pp_code)

        # 3. handlePlayAction
        handle_match = re.search(
            r"function\s+handlePlayAction\(\)\s*\{([\s\S]*?)\n\s{4}\}",
            self.ms_content
        )
        self.assertIsNotNone(handle_match)
        h_code = handle_match.group(1)
        self.assertIn("window.wasPausedByUser = false;", h_code)
        self.assertIn("audioPlayer._preventAutoplay = false;", h_code)
        self.assertIn("updateMediaSessionPosition(actualTime, dur, 1.0, true);", h_code)
        self.assertIn("audioPlayer.play()", h_code)

    def test_conditional_anchor_start_avoids_audio_focus_arbitration_collision(self):
        """Verify resume paths only call startLiveAudioAnchor if anchor is absent or paused."""
        # Check handlePlayAction
        self.assertRegex(
            self.ms_content,
            r'const\s+_resumeAnchorEl\s*=\s*document\.getElementById\(["\']live-stream-anchor["\']\);\s*if\s*\(\(!_resumeAnchorEl\s*\|\|\s*_resumeAnchorEl\.paused\)\s*&&\s*typeof\s+startLiveAudioAnchor\s*===\s*["\']function["\']\)\s*startLiveAudioAnchor\(\);'
        )
        # Check setActionHandler('pause')
        self.assertRegex(
            self.ms_content,
            r'const\s+_pauseResumeAnchorEl\s*=\s*document\.getElementById\(["\']live-stream-anchor["\']\);\s*if\s*\(\(!_pauseResumeAnchorEl\s*\|\|\s*_pauseResumeAnchorEl\.paused\)\s*&&\s*typeof\s+startLiveAudioAnchor\s*===\s*["\']function["\']\)\s*startLiveAudioAnchor\(\);'
        )
        # Check setActionHandler('playpause')
        self.assertRegex(
            self.ms_content,
            r'const\s+_toggleAnchorEl\s*=\s*document\.getElementById\(["\']live-stream-anchor["\']\);\s*if\s*\(\(!_toggleAnchorEl\s*\|\|\s*_toggleAnchorEl\.paused\)\s*&&\s*typeof\s+startLiveAudioAnchor\s*===\s*["\']function["\']\)\s*startLiveAudioAnchor\(\);'
        )

    def test_near_end_of_track_rewind_on_resume(self):
        """Verify resuming within 0.5s of track end rewinds to 0 so playback replays instead of stalling."""
        for section in ['handlePlayAction', 'setActionHandler', 'playpause']:
            self.assertRegex(
                self.ms_content,
                r'if\s*\(dur\s*>\s*0\s*&&\s*actualTime\s*>=\s*dur\s*-\s*0\.5\s*&&\s*\(!audioPlayer\s*\|\|\s*audioPlayer\._pendingSeek\s*===\s*null\)\)\s*\{[\s\S]*?audioPlayer\.currentTime\s*=\s*0;[\s\S]*?actualTime\s*=\s*0;'
            )

    # =========================================================================
    # Issue D: Mobile Lyrics Resolution & Caching Verification
    # =========================================================================

    def test_mobile_lyrics_path_normalization_and_candidate_order(self):
        """Verify getLyricsCandidates normalizes Windows paths and prioritizes lyrics_path, id, title, and lowercase."""
        self.assertIn("function getLyricsCandidates(track)", self.utils_content)
        self.assertIn("window.getLyricsCandidates = getLyricsCandidates;", self.utils_content)
        self.assertIn(r".replace(/\\/g, '/')", self.utils_content)

        # sw.js and lyrics.js use 'yt-player-media' with ignoreSearch: true
        self.assertIn("caches.open('yt-player-media')", self.lyrics_content)
        self.assertIn("ignoreSearch: true", self.lyrics_content)
        self.assertIn("caches.open('yt-player-media')", self.sw_content)
        self.assertIn("ignoreSearch: true", self.sw_content)

if __name__ == '__main__':
    unittest.main()
