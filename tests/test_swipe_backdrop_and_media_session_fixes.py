import os
import re
import unittest

class TestSwipeBackdropAndMediaSessionFixes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        with open(os.path.join(base_dir, 'index.html'), 'r', encoding='utf-8') as f:
            cls.html_content = f.read()
        with open(os.path.join(base_dir, 'css', 'style.css'), 'r', encoding='utf-8') as f:
            cls.css_content = f.read()
        with open(os.path.join(base_dir, 'js', 'main.js'), 'r', encoding='utf-8') as f:
            cls.main_content = f.read()
        with open(os.path.join(base_dir, 'js', 'mediaSession.js'), 'r', encoding='utf-8') as f:
            cls.ms_content = f.read()
        with open(os.path.join(base_dir, 'js', 'dom.js'), 'r', encoding='utf-8') as f:
            cls.dom_content = f.read()
        with open(os.path.join(base_dir, 'js', 'playback.js'), 'r', encoding='utf-8') as f:
            cls.playback_content = f.read()
        with open(os.path.join(base_dir, 'js', 'utils.js'), 'r', encoding='utf-8') as f:
            cls.utils_content = f.read()
        with open(__file__, 'r', encoding='utf-8') as f:
            cls.test_content = f.read()

    def test_zero_emojis(self):
        """Strictly zero emojis in test file and all modified source files"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        self.assertEqual(emoji_pattern.findall(self.html_content), [])
        self.assertEqual(emoji_pattern.findall(self.css_content), [])
        self.assertEqual(emoji_pattern.findall(self.main_content), [])
        self.assertEqual(emoji_pattern.findall(self.ms_content), [])
        self.assertEqual(emoji_pattern.findall(self.dom_content), [])
        self.assertEqual(emoji_pattern.findall(self.playback_content), [])
        self.assertEqual(emoji_pattern.findall(self.utils_content), [])
        self.assertEqual(emoji_pattern.findall(self.test_content), [])

    def test_swipe_backdrop_markup(self):
        """index.html contains #swipe-backdrop inside #playlist-container preceding #track-list without text hints"""
        container_match = re.search(
            r'id="playlist-container"[\s\S]*?<div id="swipe-backdrop"[^>]*class="[^"]*swipe-backdrop[^"]*"[\s\S]*?<ul id="track-list">',
            self.html_content
        )
        self.assertIsNotNone(container_match)
        self.assertIn('action-enqueue', self.html_content)
        self.assertIn('action-download', self.html_content)
        self.assertIn('swipe-legend-enqueue', self.html_content)
        self.assertIn('swipe-legend-download', self.html_content)
        self.assertNotIn('<span>Enqueue</span>', self.html_content)
        self.assertNotIn('<span>Download</span>', self.html_content)
        backdrop_match = re.search(r'<div id="swipe-backdrop"[\s\S]*?</div>\s*</div>', self.html_content)
        self.assertIsNotNone(backdrop_match)
        self.assertNotIn('Enqueue', backdrop_match.group(0))
        self.assertNotIn('Download', backdrop_match.group(0))

    def test_swipe_backdrop_and_legend_css(self):
        """css/style.css defines swipe backdrop, legends, and opaque card styles matching test.html"""
        self.assertRegex(self.css_content, r'#track-list\s+li\s*\{[^}]*background-color:\s*#000000;')
        self.assertIn('.swipe-backdrop', self.css_content)
        self.assertIn('.swipe-underlay', self.css_content)
        self.assertIn('.underlay-action', self.css_content)
        self.assertIn('.action-enqueue', self.css_content)
        self.assertIn('.action-download', self.css_content)
        self.assertIn('.swipe-legend', self.css_content)
        self.assertIn('.swipe-legend-enqueue', self.css_content)
        self.assertIn('.swipe-legend-download', self.css_content)
        self.assertIn('.swipe-legend.legend-triggered', self.css_content)
        self.assertIn('will-change: transform, opacity;', self.css_content)
        self.assertIn('.swipe-item-wrapper', self.css_content)
        self.assertIn('.swipe-item-inner', self.css_content)
        self.assertIn('.swipe-surface', self.css_content)
        self.assertIn('#track-list li.is-swiping', self.css_content)
        self.assertIn('#track-list li.snapping', self.css_content)

    def test_active_song_swipe_guard(self):
        """main.js touchstart ignores touch on active song to prevent swiping active track"""
        self.assertRegex(
            self.main_content,
            r'if\s*\(\s*li\.classList\.contains\("active"\)\s*\|\|\s*\(\s*idx\s*===\s*globalActiveOriginalIndex\s*&&\s*pl\s*===\s*globalActivePlaylist\s*\)\s*\)\s*\{\s*return;\s*\}'
        )

    def test_mobile_swipe_backdrop_positioning_and_feedback(self):
        """main.js positions backdrop at currentY and scales/highlights legends on threshold without linear gradient calculations"""
        self.assertIn("swipeBackdrop.style.transform = `translate3d(0, ${currentY}, 0)`;", self.main_content)
        self.assertIn("legEnq.classList.add('legend-triggered')", self.main_content)
        self.assertIn("legDown.classList.add('legend-triggered')", self.main_content)
        self.assertIn("swipeBackdrop.style.opacity = '0';", self.main_content)
        self.assertNotIn("linear-gradient", self.main_content)
        self.assertIn("if (isHorizontalSwipe && e.type !== 'touchcancel')", self.main_content)
        self.assertIn("thresholdRatio = 0.20", self.main_content)
        self.assertIn("activeLi.classList.add('is-swiping')", self.main_content)

    def test_unlock_wave_animation_rebind_cooldown(self):
        """mediaSession.js allows shouldRepublishMetadata once on unlock-playing with 5000ms cooldown"""
        self.assertRegex(
            self.ms_content,
            r'const\s+isUnlockPlaying\s*=\s*typeof\s+reason\s*===\s*[\'"]string[\'"]\s*&&\s*\(\s*reason\.startsWith\([\'"]unlock-playing[\'"]\)'
        )
        self.assertIn('5000', self.ms_content)
        self.assertRegex(
            self.ms_content,
            r'if\s*\(\s*needsRebind\s*&&\s*typeof\s+republishMediaMetadata\s*===\s*[\'"]function[\'"]\s*\)\s*\{\s*republishMediaMetadata\(\s*true\s*\);'
        )

    def test_republish_metadata_null_bust(self):
        """mediaSession.js sets navigator.mediaSession.metadata = null before reassigning to bust dedup"""
        self.assertRegex(
            self.ms_content,
            r'navigator\.mediaSession\.metadata\s*=\s*null;[\s\S]*?window\.publishTrackMetadata'
        )

    def test_probe_pause_listener_hidden_guard(self):
        """probeEl pause listener unblocks background defense bursts in Mode 2 without document.hidden drop"""
        self.assertNotIn(
            'if (document.hidden) return;',
            self.ms_content
        )
        self.assertRegex(
            self.ms_content,
            r'probeEl\.addEventListener\(\s*["\']pause["\']\s*,\s*\(\)\s*=>\s*\{\s*const\s+isRecentBtDisconnect'
        )

    def test_in_app_pause_and_hidden_transition_push_mode2_micro_rate(self):
        """btnPlayPause and visibilitychange push forced position update in Mode 2"""
        self.assertRegex(
            self.main_content,
            r'btnPlayPause\.addEventListener\(\s*["\']click["\'][\s\S]*?if\s*\(\s*window\.playbackMode\s*===\s*[\'"]mode2[\'"]\s*&&\s*hasMediaSession\s*\)\s*\{[\s\S]*?updateMediaSessionPosition\(\s*audioPlayer\.currentTime\s*,\s*dur\s*,\s*null\s*,\s*true\s*\);'
        )
        self.assertRegex(
            self.main_content,
            r'// Going hidden while paused in Mode 2[\s\S]*?startLiveAudioAnchor\(\);[\s\S]*?updateMediaSessionPosition\(\s*audioPlayer\.currentTime\s*,\s*dur\s*,\s*null\s*,\s*true\s*\);'
        )

    def test_republish_metadata_preserves_zero_metadata_churn_without_arg(self):
        """republishMediaMetadata only busts dedup when arguments[0] is true"""
        self.assertRegex(
            self.ms_content,
            r'const\s+forceBreakDedup\s*=\s*\(arguments\s*&&\s*arguments\[0\]\s*===\s*true\)'
        )

    def test_enqueued_flash_color_not_stripped_on_touchend(self):
        """handleTouchEnd retains --enqueued-color on targetLi if it is flashing"""
        self.assertRegex(
            self.main_content,
            r'if\s*\(\s*!targetLi\.classList\.contains\([\'"]enqueued-flash[\'"]\)\s*\)\s*\{\s*targetLi\.style\.removeProperty\([\'"]--enqueued-color[\'"]\);'
        )

    def test_swipe_card_remains_opaque(self):
        """css/style.css ensures slide-enqueue and slide-download match test.html surface card styling"""
        self.assertRegex(
            self.css_content,
            r'#track-list\s+li\.slide-enqueue[^{]*\{[^}]*background:\s*#1e1e1e\s*!important;'
        )
        self.assertRegex(
            self.css_content,
            r'#track-list\s+li\.slide-download\s*\{[^}]*background:\s*#1e1e1e\s*!important;'
        )

    def test_playlist_scroll_arrow_markup_and_css(self):
        """index.html and style.css define simple playlist scroll arrow button adjacent to fast-scroller with zero extra styling"""
        self.assertIn('id="playlist-scroll-arrow"', self.html_content)
        self.assertIn('id="playlist-arrow-up"', self.html_content)
        self.assertIn('id="playlist-arrow-down"', self.html_content)
        self.assertIn('.playlist-scroll-arrow', self.css_content)
        self.assertRegex(self.css_content, r'\.playlist-scroll-arrow\s*\{[^}]*right:\s*28px;')
        self.assertRegex(self.css_content, r'\.playlist-scroll-arrow\s*\{[^}]*z-index:\s*91;')
        self.assertRegex(self.css_content, r'\.playlist-scroll-arrow\s*\{[^}]*background:\s*transparent;')
        self.assertRegex(self.css_content, r'\.playlist-scroll-arrow\s*\{[^}]*border:\s*none;')
        self.assertRegex(self.css_content, r'\.playlist-scroll-arrow\s*\{[^}]*outline:\s*none;')
        self.assertRegex(self.css_content, r'\.playlist-scroll-arrow\s*\{[^}]*box-shadow:\s*none;')
        self.assertIn('-webkit-tap-highlight-color: transparent;', self.css_content)
        self.assertIn('transition: background-color 0.25s ease;', self.css_content)
        self.assertIn('calc(84px + env(safe-area-inset-bottom, 0px))', self.css_content)

    def test_playlist_scroll_arrow_behavior_in_main(self):
        """main.js binds scroll listener and click handler toggling top and bottom instant scroll"""
        self.assertIn('playlistScrollArrow.addEventListener("click"', self.main_content)
        self.assertIn('playlistContainer.scrollTop > 2', self.main_content)
        self.assertRegex(self.main_content, r'playlistContainer\.scrollTo\(\{\s*top:\s*0,\s*behavior:\s*["\']instant["\']\s*\}\)')
        self.assertRegex(self.main_content, r'playlistContainer\.scrollTo\(\{\s*top:\s*playlistContainer\.scrollHeight,\s*behavior:\s*["\']instant["\']\s*\}\)')
        self.assertIn('playlistContainer.scrollTop = 0;', self.main_content)
        self.assertIn('playlistContainer.scrollTop = playlistContainer.scrollHeight;', self.main_content)
        self.assertIn('window.updatePlaylistScrollArrow = updatePlaylistScrollArrow;', self.main_content)
        self.assertIn('window.addEventListener("resize", updatePlaylistScrollArrow', self.main_content)

    def test_swipe_zero_gap_and_clamped_reveal(self):
        """main.js and style.css implement zero-gap and clamp icon after full reveal"""
        self.assertIn("const gap = 0;", self.main_content)
        self.assertIn("const enqX = Math.min(0, currentX - parkOffset);", self.main_content)
        self.assertIn("const downX = Math.max(0, currentX + parkOffset);", self.main_content)
        self.assertIn("transform: translateX(-22px);", self.css_content)
        self.assertIn("transform: translateX(22px);", self.css_content)

    def test_tap_artifact_prevention(self):
        """handleTouchEnd immediately exits on non-swipe taps without transitions or snapping"""
        self.assertIn("if (!isHorizontalSwipe) {", self.main_content)
        self.assertRegex(
            self.main_content,
            r'if\s*\(!isHorizontalSwipe\)\s*\{[\s\S]*?targetLi\.classList\.remove\(["\']snapping["\'][\s\S]*?return;'
        )

    def test_enqueue_success_minimal_green_hint_glow(self):
        """style.css and main.js define minimal green hint/glow for successful enqueue"""
        self.assertIn('.action-enqueue.enqueue-success', self.css_content)
        self.assertIn('color: #00ff88 !important;', self.css_content)
        self.assertIn('drop-shadow(0 0 6px rgba(0, 255, 136, 0.75))', self.css_content)
        self.assertIn("legEnq.classList.add('enqueue-success');", self.main_content)

    def test_dom_pause_methods_enforce_live_anchor_in_mode2(self):
        """DualAudioPlayer pause and instantPause in dom.js enforce startLiveAudioAnchor in Mode 2 before active.pause"""
        self.assertRegex(
            self.dom_content,
            r'pause\(\)\s*\{[\s\S]*?window\.playbackMode\s*===\s*[\'"]mode2[\'"]\s*&&\s*!window\.isCallActive\s*&&\s*typeof\s+startLiveAudioAnchor\s*===\s*[\'"]function[\'"]\s*\)\s*\{\s*startLiveAudioAnchor\(\);[\s\S]*?this\.active\.pause\(\);'
        )
        self.assertRegex(
            self.dom_content,
            r'instantPause\(\)\s*\{[\s\S]*?window\.playbackMode\s*===\s*[\'"]mode2[\'"]\s*&&\s*!window\.isCallActive\s*&&\s*typeof\s+startLiveAudioAnchor\s*===\s*[\'"]function[\'"]\s*\)\s*\{\s*startLiveAudioAnchor\(\);[\s\S]*?this\.active\.pause\(\);'
        )

    def test_main_pause_listener_enforces_live_anchor(self):
        """main.js audioPlayer pause listener enforces startLiveAudioAnchor in Mode 2"""
        self.assertRegex(
            self.main_content,
            r'audioPlayer\.addEventListener\(\s*["\']pause["\'][\s\S]*?if\s*\(\s*window\.playbackMode\s*===\s*[\'"]mode2[\'"]\s*&&\s*!isRecentBtDisconnect\s*\)\s*\{[\s\S]*?startLiveAudioAnchor\(\);'
        )

    def test_media_session_context_resumes_interrupted_state(self):
        """initLiveAudioAnchor and startLiveAudioAnchor resume liveAudioContext on suspended or interrupted states"""
        self.assertRegex(
            self.ms_content,
            r'if\s*\(\s*liveAudioContext\s*&&\s*\(\s*liveAudioContext\.state\s*===\s*[\'"]suspended[\'"]\s*\|\|\s*liveAudioContext\.state\s*===\s*[\'"]interrupted[\'"]\s*\)\s*\)\s*\{\s*liveAudioContext\.resume\(\)'
        )

    def test_prime_focus_probe_mode2_and_mobile_guarded(self):
        """primeFocusProbe in mediaSession.js returns immediately if not mobile or not mode2"""
        self.assertRegex(
            self.ms_content,
            r'function\s+primeFocusProbe\s*\(\s*\)\s*\{\s*if\s*\(\s*typeof\s+isMobileDevice\s*!==\s*[\'"]undefined[\'"]\s*&&\s*!isMobileDevice\s*\)\s*return;\s*if\s*\(\s*window\.playbackMode\s*!==\s*[\'"]mode2[\'"]\s*\)\s*return;'
        )

    def test_btn_play_pause_prime_focus_probe_gated_behind_mode2(self):
        """btnPlayPause click listener gates primeFocusProbe behind window.playbackMode === 'mode2' and mobile device"""
        self.assertRegex(
            self.main_content,
            r'btnPlayPause\.addEventListener\(\s*["\']click["\'][\s\S]*?if\s*\(\s*window\.playbackMode\s*===\s*[\'"]mode2[\'"]\s*&&\s*typeof\s+isMobileDevice\s*!==\s*[\'"]undefined[\'"]\s*&&\s*isMobileDevice\s*&&\s*typeof\s+primeFocusProbe\s*===\s*[\'"]function[\'"]\s*\)\s*\{\s*primeFocusProbe\(\);'
        )

    def test_btn_play_pause_pause_branch_forces_position_in_mode1(self):
        """btnPlayPause pause branch in Mode 1 immediately sets paused playbackState and forces position update"""
        self.assertRegex(
            self.main_content,
            r'btnPlayPause\.addEventListener\(\s*["\']click["\'][\s\S]*?audioPlayer\.instantPause\(\);[\s\S]*?if\s*\(\s*hasMediaSession\s*\)\s*\{[\s\S]*?navigator\.mediaSession\.playbackState\s*=\s*[\'"]paused[\'"];[\s\S]*?updateMediaSessionPosition\(\s*audioPlayer\.currentTime\s*,\s*dur\s*,\s*1\.0\s*,\s*true\s*\);'
        )

    def test_audio_player_pause_listener_forces_position_in_mode1(self):
        """audioPlayer pause listener sets paused and passes forceBypass true in Mode 1"""
        self.assertRegex(
            self.main_content,
            r'audioPlayer\.addEventListener\(\s*["\']pause["\'][\s\S]*?navigator\.mediaSession\.playbackState\s*=\s*[\'"]paused[\'"];[\s\S]*?updateMediaSessionPosition\(\s*audioPlayer\.currentTime\s*,\s*dur\s*,\s*1\.0\s*,\s*true\s*\);'
        )

    def test_visibilitychange_hidden_mode1_paused_synchronization(self):
        """visibilitychange hidden handler synchronizes playbackState and forced position in Mode 1 when paused"""
        self.assertRegex(
            self.main_content,
            r'document\.addEventListener\(\s*["\']visibilitychange["\'][\s\S]*?// Going hidden while paused in Mode 2[\s\S]*?else\s+if\s*\(\s*typeof\s+audioPlayer\s*!==\s*[\'"]undefined[\'"]\s*&&\s*audioPlayer\s*&&\s*\(\s*audioPlayer\.paused\s*\|\|\s*window\.wasPausedByUser\s*\)\s*&&\s*!audioPlayer\.switching\s*\)\s*\{[\s\S]*?updateMediaSessionPosition\(\s*pos\s*,\s*dur\s*,\s*1\.0\s*,\s*true\s*\);'
        )

    def test_visibilitychange_foreground_mode1_paused_reaffirmation(self):
        """visibilitychange foreground handler reaffirms playbackState = 'paused' and setPlayUI(false) if audioPlayer is paused"""
        self.assertRegex(
            self.main_content,
            r'document\.addEventListener\(\s*["\']visibilitychange["\'][\s\S]*?if\s*\(\s*!document\.hidden\s*\)\s*\{[\s\S]*?else\s+if\s*\(\s*audioPlayer\.paused\s*\|\|\s*window\.wasPausedByUser\s*\)\s*\{[\s\S]*?navigator\.mediaSession\.playbackState\s*=\s*[\'"]paused[\'"];[\s\S]*?setPlayUI\(false\);'
        )

    def test_gemini_md_documents_rule_37(self):
        """GEMINI.md documents Rule 37 Mode 1 Media Notification Retention & Single-Player Isolation Invariant"""
        with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'GEMINI.md'), 'r', encoding='utf-8') as f:
            gemini_content = f.read()
        self.assertIn('37. Mode 1 Media Notification Retention & Single-Player Isolation Invariant', gemini_content)
        self.assertIn('Single-Player Isolation', gemini_content)
        self.assertIn('Forced Position State Synchronization on Pause', gemini_content)

    def test_mode1_handover_keepalive_completely_removed(self):
        """Mode 1 handover keepalive functions are completely removed from mediaSession.js, dom.js, and main.js"""
        for content in (self.ms_content, self.dom_content, self.main_content):
            self.assertNotIn("startMode1HandoverKeepalive", content)
            self.assertNotIn("stopMode1HandoverKeepalive", content)
            self.assertNotIn("settleMode1HandoverKeepalive", content)

    def test_mode1_single_player_isolation(self):
        """Mode 1 enforces strict single-player isolation where auxiliary audio elements are never primed or started"""
        self.assertRegex(
            self.ms_content,
            r'function\s+initLiveAudioAnchor\s*\(\s*\)\s*\{[\s\S]*?if\s*\(\s*window\.playbackMode\s*!==\s*[\'"]mode2[\'"]\s*\)\s*\{[\s\S]*?return\s+liveAudioContext;'
        )
        self.assertRegex(
            self.ms_content,
            r'function\s+startLiveAudioAnchor\s*\(\s*\)\s*\{[\s\S]*?if\s*\(\s*window\.playbackMode\s*!==\s*[\'"]mode2[\'"]\s*\)\s*return;'
        )
        self.assertRegex(
            self.ms_content,
            r'function\s+primeFocusProbe\s*\(\s*\)\s*\{[\s\S]*?if\s*\(\s*window\.playbackMode\s*!==\s*[\'"]mode2[\'"]\s*\)\s*return;'
        )
        self.assertRegex(
            self.ms_content,
            r'function\s+startFocusProbe\s*\(\s*\)\s*\{[\s\S]*?if\s*\(\s*window\.playbackMode\s*!==\s*[\'"]mode2[\'"]\s*\)\s*return;'
        )


    def test_dom_pause_mode1_instant_paused_state(self):
        """dom.js pause and instantPause declare mode-aware paused state immediately via declaredPausedState"""
        self.assertRegex(
            self.dom_content,
            r'pause\(\)\s*\{[\s\S]*?navigator\.mediaSession\.playbackState\s*=\s*\(typeof\s+window\.declaredPausedState\s*===\s*[\'"]function[\'"]\)\s*\?\s*window\.declaredPausedState\(\)\s*:\s*[\'"]paused[\'"];'
        )
        self.assertRegex(
            self.dom_content,
            r'instantPause\(\)\s*\{[\s\S]*?navigator\.mediaSession\.playbackState\s*=\s*\(typeof\s+window\.declaredPausedState\s*===\s*[\'"]function[\'"]\)\s*\?\s*window\.declaredPausedState\(\)\s*:\s*[\'"]paused[\'"];'
        )

    def test_dom_pause_mode1_immediate_without_fade(self):
        """dom.js pause immediately pauses with volume 1.0 in Mode 1 without volume fade to prevent card eviction"""
        self.assertRegex(
            self.dom_content,
            r'pause\(\)\s*\{[\s\S]*?if\s*\(\s*document\.hidden\s*\|\|\s*window\.playbackMode\s*===\s*[\'"]mode1[\'"]\s*\)\s*\{[\s\S]*?this\.active\.pause\(\);[\s\S]*?this\.active\.volume\s*=\s*1\.0;'
        )

    def test_playpause_action_handler_mode1_updates_position(self):
        """mediaSession.js playpause action handler updates MediaSession position in Mode 1"""
        self.assertRegex(
            self.ms_content,
            r'setActionHandler\(\s*[\'"]playpause[\'"][\s\S]*?if\s*\(\s*window\.playbackMode\s*!==\s*[\'"]mode2[\'"]\s*&&\s*typeof\s+updateMediaSessionPosition\s*===\s*[\'"]function[\'"]\s*\)\s*\{[\s\S]*?updateMediaSessionPosition\(\s*pos\s*,\s*dur\s*,\s*1\.0\s*\);'
        )

    def test_media_session_duration_finite_guard(self):
        """updateMediaSessionPosition validates isFinite for forcedDuration and builds finite positive fallback chain"""
        self.assertRegex(
            self.ms_content,
            r'const\s+isForcedDurValid\s*=\s*typeof\s+forcedDuration\s*===\s*[\'"]number[\'"]\s*&&\s*!isNaN\(\s*forcedDuration\s*\)\s*&&\s*isFinite\(\s*forcedDuration\s*\)\s*&&\s*forcedDuration\s*>\s*0;'
        )
        self.assertRegex(
            self.ms_content,
            r'let\s+rawDur\s*=\s*0;[\s\S]*?if\s*\(\s*isForcedDurValid\s*\)\s*\{[\s\S]*?rawDur\s*=\s*forcedDuration;[\s\S]*?audioPlayer\.duration[\s\S]*?audioPlayer\._expectedDuration[\s\S]*?parseFloat\(\s*seekBar\.max\s*\)'
        )

    def test_dom_duration_getter_mse_and_finite_guard(self):
        """DualAudioPingPong duration getter prioritizes _expectedDuration under MSE and enforces isFinite on active.duration"""
        self.assertRegex(
            self.dom_content,
            r'get\s+duration\(\)\s*\{[\s\S]*?if\s*\(\s*this\._expectedDuration\s*&&\s*typeof\s+this\._expectedDuration\s*===\s*[\'"]number[\'"]\s*&&\s*isFinite\(\s*this\._expectedDuration\s*\)\s*&&\s*this\._expectedDuration\s*>\s*0\s*\)\s*\{[\s\S]*?if\s*\(\s*this\._mseEnabled\s*\)\s*\{[\s\S]*?return\s+this\._expectedDuration;'
        )

    def test_timeupdate_dur_resolution_and_pass(self):
        """main.js timeupdate event listener resolves finite dur and passes dur to updateMediaSessionPosition"""
        self.assertRegex(
            self.main_content,
            r'audioPlayer\.addEventListener\(\s*["\']timeupdate["\'][\s\S]*?const\s+rawDur\s*=\s*audioPlayer\.duration;[\s\S]*?const\s+dur\s*=[\s\S]*?audioPlayer\._expectedDuration[\s\S]*?parseFloat\(\s*seekBar\.max\s*\)[\s\S]*?updateMediaSessionPosition\(\s*ct\s*,\s*dur\s*,\s*audioPlayer\.playbackRate\s*\|\|\s*1\s*\);'
        )

    def test_perform_seek_delta_forces_position(self):
        """main.js performSeekDelta updates MediaSession with targetTime, dur, rate, and forceBypass true"""
        self.assertRegex(
            self.main_content,
            r'function\s+performSeekDelta\s*\(\s*delta\s*\)\s*\{[\s\S]*?updateMediaSessionPosition\(\s*targetTime\s*,\s*dur\s*,\s*audioPlayer\.playbackRate\s*\|\|\s*1\.0\s*,\s*true\s*\);'
        )

    def test_playback_js_invalidates_position_cache(self):
        """playback.js executePlayback invalidates MediaSession position cache to avoid stale values across tracks"""
        self.assertRegex(
            self.playback_content,
            r'function\s+executePlayback[\s\S]*?window\.invalidatePositionCache\(\);'
        )

    def test_parse_iso_duration_colon_and_numeric_support(self):
        """parseISODuration in utils.js parses MM:SS, HH:MM:SS, and numeric values accurately"""
        self.assertRegex(
            self.utils_content,
            r'function\s+parseISODuration\s*\(\s*pt\s*\)\s*\{[\s\S]*?typeof\s+pt\s*===\s*[\'"]number[\'"][\s\S]*?str\.includes\([\'"]:\'\)[\s\S]*?parts\.length\s*===\s*2[\s\S]*?parts\.length\s*===\s*3'
        )

    def test_async_square_artwork_updates_media_session_position(self):
        """publishTrackMetadata in playback.js syncs position after async square artwork assignment"""
        self.assertRegex(
            self.playback_content,
            r'getSquareArtwork\(thumbUrl,\s*track\.id,\s*\(\s*sqUrl\s*\)\s*=>\s*\{[\s\S]*?navigator\.mediaSession\.metadata\s*=\s*new\s+MediaMetadata[\s\S]*?updateMediaSessionPosition\(\s*curPos\s*,\s*totalDur\s*,\s*null\s*,\s*true\s*\);'
        )
        self.assertRegex(
            self.playback_content,
            r'getCachedSquareArtwork\(track\.id,\s*thumbUrl,\s*\(\s*sqUrl\s*\)\s*=>\s*\{[\s\S]*?navigator\.mediaSession\.metadata\s*=\s*new\s+MediaMetadata[\s\S]*?updateMediaSessionPosition\(\s*curPos\s*,\s*totalDur\s*,\s*null\s*,\s*true\s*\);'
        )

    def test_execute_playback_syncs_initial_micro_rate_position(self):
        """executePlayback in playback.js dispatches initial position to updateMediaSessionPosition with micro-rate"""
        self.assertRegex(
            self.playback_content,
            r'navigator\.mediaSession\.setPositionState\(\{\s*duration:\s*parsedDuration,\s*playbackRate:\s*0\.00001,\s*position:\s*initialPosition\s*\}\);[\s\S]*?updateMediaSessionPosition\(\s*initialPosition\s*,\s*parsedDuration\s*,\s*0\.00001\s*,\s*true\s*\);'
        )

    def test_republish_media_metadata_syncs_position(self):
        """republishMediaMetadata in mediaSession.js re-asserts position via syncAfterRepublish"""
        self.assertRegex(
            self.ms_content,
            r'function\s+republishMediaMetadata[\s\S]*?syncAfterRepublish[\s\S]*?updateMediaSessionPosition\(\s*curPos\s*,\s*dur\s*,\s*null\s*,\s*true\s*\);'
        )

    def test_position_state_rate_shift_bypasses_throttle(self):
        """updateMediaSessionPosition tracks _lastSentRate and bypasses delta throttle on rate shift"""
        self.assertRegex(
            self.ms_content,
            r'const\s+isRateShift\s*=\s*\(\s*_lastSentRate\s*>\s*0\s*&&\s*Math\.abs\(\s*validRate\s*-\s*_lastSentRate\s*\)\s*>\s*0\.001\s*\);'
        )
        self.assertRegex(
            self.ms_content,
            r'if\s*\(\s*!forceBypass\s*&&\s*!isRateShift\s*&&\s*!isPaused\s*&&\s*!isBuffering'
        )

    def test_sync_duration_unconditionally_updates_media_session(self):
        """syncDuration in main.js unconditionally synchronizes confirmed audio duration to MediaSession"""
        self.assertRegex(
            self.main_content,
            r'function\s+syncDuration\(\)\s*\{[\s\S]*?if\s*\(\s*currentMax\s*!==\s*roundedDur\s*\)\s*\{[\s\S]*?\}\s*updateMediaSessionPosition\(\s*audioPlayer\.currentTime\s*,\s*roundedDur\s*,\s*null\s*,\s*true\s*\);'
        )

    def test_seekto_action_handler_defensive_target_and_position_sync(self):
        """setActionHandler('seekto') in mediaSession.js safely handles seekTarget and updates position"""
        self.assertRegex(
            self.ms_content,
            r'navigator\.mediaSession\.setActionHandler\(\s*[\'"]seekto[\'"]\s*,\s*\(details\)\s*=>\s*\{[\s\S]*?try\s*\{[\s\S]*?const\s+seekTarget\s*=[\s\S]*?updateMediaSessionPosition\(\s*seekTarget\s*,\s*totalDur\s*,\s*null\s*,\s*true\s*\);'
        )

    def test_gemini_md_documents_rule_38(self):
        """GEMINI.md documents Rule 38 Android SystemUI Media Card Seekbar & Continuous Position Synchronization Invariant"""
        with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'GEMINI.md'), 'r', encoding='utf-8') as f:
            gemini_content = f.read()
        self.assertIn('38. Android SystemUI Media Card Seekbar & Continuous Position Synchronization Invariant', gemini_content)
        self.assertIn('Universal Duration Parsing', gemini_content)
        self.assertIn('Asynchronous Artwork Metadata Re-Assertion', gemini_content)
        self.assertIn('Republish Dedup Bust Synchronization', gemini_content)
        self.assertIn('Playback Rate Shift Throttle Bypass', gemini_content)
        self.assertIn('Continuous Duration Fallback Chaining', gemini_content)
        self.assertIn('Defensive Action Handler Isolation', gemini_content)
        self.assertIn('MediaSource Duration Early Binding', gemini_content)

    def test_duration_fallback_chaining_in_media_session(self):
        """updateMediaSessionPosition and syncAfterRepublish fall back to active playlist data when dur <= 0"""
        self.assertRegex(
            self.ms_content,
            r'if\s*\(\s*rawDur\s*<=\s*0\s*\)\s*\{[\s\S]*?activeTrack\s*=[\s\S]*?currentPlaylistData\[globalActiveOriginalIndex\][\s\S]*?allDatabases\[globalActivePlaylist\]'
        )
        self.assertRegex(
            self.ms_content,
            r'syncAfterRepublish[\s\S]*?if\s*\(\s*dur\s*<=\s*0\s*\)\s*\{[\s\S]*?currentPlaylistData\[globalActiveOriginalIndex\]'
        )

    def test_synchronous_artwork_metadata_assertion_in_publish_track_metadata(self):
        """publishTrackMetadata in playback.js immediately asserts position state right after synchronous new MediaMetadata"""
        self.assertRegex(
            self.playback_content,
            r'navigator\.mediaSession\.metadata\s*=\s*new\s+MediaMetadata\(\{[\s\S]*?artwork:\s*\[\{\s*src:\s*currentSq[\s\S]*?\}\);[\s\S]*?if\s*\(\s*totalDur\s*>\s*0\s*&&\s*typeof\s+updateMediaSessionPosition\s*===\s*[\'"]function[\'"]\s*\)\s*\{[\s\S]*?updateMediaSessionPosition\(\s*curPos\s*,\s*totalDur\s*,\s*null\s*,\s*true\s*\);'
        )

    def test_media_source_duration_initialized_on_sourceopen(self):
        """dom.js asserts MediaSource duration upon sourceopen event when _expectedDuration is available"""
        self.assertRegex(
            self.dom_content,
            r'addEventListener\(\s*[\'"]sourceopen[\'"]\s*,[\s\S]*?this\._mediaSource\.duration\s*=\s*this\._expectedDuration'
        )

    def test_seek_action_handlers_duration_fallback(self):
        """seekto, seekbackward, and seekforward fall back to active playlist track duration"""
        self.assertRegex(
            self.ms_content,
            r'setActionHandler\(\s*[\'"]seekto[\'"][\s\S]*?if\s*\(\s*totalDur\s*<=\s*0\s*&&\s*typeof\s+currentPlaylistData[\s\S]*?updateMediaSessionPosition\(\s*seekTarget\s*,\s*totalDur\s*,\s*null\s*,\s*true\s*\);'
        )
        self.assertRegex(
            self.ms_content,
            r'setActionHandler\(\s*[\'"]seekbackward[\'"][\s\S]*?if\s*\(\s*dur\s*<=\s*0\s*&&\s*typeof\s+currentPlaylistData[\s\S]*?updateMediaSessionPosition\(\s*newTime\s*,\s*dur\s*,\s*null\s*,\s*true\s*\);'
        )
        self.assertRegex(
            self.ms_content,
            r'setActionHandler\(\s*[\'"]seekforward[\'"][\s\S]*?if\s*\(\s*dur\s*<=\s*0\s*&&\s*typeof\s+currentPlaylistData[\s\S]*?updateMediaSessionPosition\(\s*newTime\s*,\s*dur\s*,\s*null\s*,\s*true\s*\);'
        )

    def test_async_artwork_duration_fallback_chaining(self):
        """publishTrackMetadata applies duration fallback chaining inside async square artwork callbacks"""
        self.assertRegex(
            self.playback_content,
            r'getSquareArtwork\(thumbUrl,\s*track\.id,\s*\(\s*sqUrl\s*\)\s*=>\s*\{[\s\S]*?let\s+totalDur\s*=[\s\S]*?if\s*\(\s*totalDur\s*<=\s*0\s*&&\s*track\s*\)\s*\{[\s\S]*?track\.duration_seconds[\s\S]*?track\.approxDurationMs[\s\S]*?updateMediaSessionPosition\(\s*curPos\s*,\s*totalDur\s*,\s*null\s*,\s*true\s*\);'
        )
        self.assertRegex(
            self.playback_content,
            r'getCachedSquareArtwork\(track\.id,\s*thumbUrl,\s*\(\s*sqUrl\s*\)\s*=>\s*\{[\s\S]*?let\s+totalDur\s*=[\s\S]*?if\s*\(\s*totalDur\s*<=\s*0\s*&&\s*track\s*\)\s*\{[\s\S]*?track\.duration_seconds[\s\S]*?track\.approxDurationMs[\s\S]*?updateMediaSessionPosition\(\s*curPos\s*,\s*totalDur\s*,\s*null\s*,\s*true\s*\);'
        )

    def test_mse_expected_duration_early_binding_in_switch_track(self):
        """switchTrack sets this._expectedDuration prior to invoking _initMSE"""
        self.assertRegex(
            self.dom_content,
            r'async\s+switchTrack\([^)]*\)\s*\{[\s\S]*?this\._expectedDuration\s*=\s*expectedDuration[\s\S]*?this\._initMSE\(\);'
        )

    def test_safe_play_and_playing_event_rate_1_dispatch(self):
        """safePlay and audioPlayer playing event immediately dispatch updateMediaSessionPosition with rate 1.0"""
        self.assertRegex(
            self.dom_content,
            r'const\s+safePlay\s*=\s*\(\s*\)\s*=>\s*\{[\s\S]*?const\s+p\s*=\s*this\.active\.play\(\);[\s\S]*?p\.then\(\(\)\s*=>\s*\{[\s\S]*?updateMediaSessionPosition\(\s*this\.active\.currentTime[\s\S]*?1\.0\s*,\s*true\s*\);'
        )
        self.assertRegex(
            self.main_content,
            r'audioPlayer\.addEventListener\(\s*[\'"]playing[\'"]\s*,\s*\(\)\s*=>\s*\{[\s\S]*?lastRenderTime\s*=\s*-1;[\s\S]*?updateMediaSessionPosition\(\s*audioPlayer\.currentTime[\s\S]*?1\.0\s*,\s*true\s*\);'
        )

    def test_action_handler_individual_try_catch_isolation(self):
        """mediaSession.js encloses action handler registrations in individual try-catch blocks"""
        for action in ('play', 'pause', 'playpause', 'previoustrack', 'nexttrack', 'seekto', 'seekbackward', 'seekforward'):
            self.assertRegex(
                self.ms_content,
                r'try\s*\{[\s\S]*?setActionHandler\(\s*[\'"]' + action + r'[\'"]'
            )

    def test_update_media_session_position_duration_string_parsing(self):
        """mediaSession.js updateMediaSessionPosition parses string duration_seconds and approxDurationMs"""
        self.assertRegex(
            self.ms_content,
            r'if\s*\(\s*rawDur\s*<=\s*0\s*&&\s*activeTrack\.duration_seconds\s*&&\s*!isNaN\(activeTrack\.duration_seconds\)\s*\)\s*\{\s*rawDur\s*=\s*parseInt\(activeTrack\.duration_seconds,\s*10\);'
        )
        self.assertRegex(
            self.ms_content,
            r'if\s*\(\s*rawDur\s*<=\s*0\s*&&\s*activeTrack\.approxDurationMs\s*&&\s*!isNaN\(activeTrack\.approxDurationMs\)\s*\)\s*\{\s*rawDur\s*=\s*Math\.floor\(parseInt\(activeTrack\.approxDurationMs,\s*10\)\s*/\s*1000\);'
        )

    def test_sync_after_republish_sequential_duration_chaining(self):
        """syncAfterRepublish applies sequential duration chaining across currentPlaylistData and allDatabases"""
        self.assertRegex(
            self.ms_content,
            r'syncAfterRepublish\s*=\s*\(\)\s*=>\s*\{[\s\S]*?if\s*\(\s*dur\s*<=\s*0\s*&&\s*tr\.duration_seconds[\s\S]*?if\s*\(\s*dur\s*<=\s*0\s*&&\s*typeof\s+allDatabases'
        )

    def test_seek_handlers_sequential_duration_chaining(self):
        """seekto, seekbackward, and seekforward fall back to allDatabases when duration is zero"""
        self.assertRegex(
            self.ms_content,
            r'setActionHandler\(\s*[\'"]seekto[\'"][\s\S]*?if\s*\(\s*totalDur\s*<=\s*0\s*&&\s*typeof\s+allDatabases'
        )
        self.assertRegex(
            self.ms_content,
            r'setActionHandler\(\s*[\'"]seekbackward[\'"][\s\S]*?if\s*\(\s*dur\s*<=\s*0\s*&&\s*typeof\s+allDatabases'
        )
        self.assertRegex(
            self.ms_content,
            r'setActionHandler\(\s*[\'"]seekforward[\'"][\s\S]*?if\s*\(\s*dur\s*<=\s*0\s*&&\s*typeof\s+allDatabases'
        )

    def test_brace_balance(self):
        """main.js, mediaSession.js, dom.js, and playback.js have balanced curly braces with zero syntax errors"""
        self.assertEqual(self.main_content.count('{'), self.main_content.count('}'))
        self.assertEqual(self.ms_content.count('{'), self.ms_content.count('}'))
        self.assertEqual(self.dom_content.count('{'), self.dom_content.count('}'))
        self.assertEqual(self.playback_content.count('{'), self.playback_content.count('}'))

if __name__ == '__main__':
    unittest.main()



