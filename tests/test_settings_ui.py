import os
import re
import unittest

class TestSettingsUI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        main_path = os.path.join(base_dir, 'js', 'main.js')
        dom_path = os.path.join(base_dir, 'js', 'dom.js')
        ms_path = os.path.join(base_dir, 'js', 'mediaSession.js')
        playback_path = os.path.join(base_dir, 'js', 'playback.js')
        ui_path = os.path.join(base_dir, 'js', 'ui.js')
        utils_path = os.path.join(base_dir, 'js', 'utils.js')
        test_path = os.path.join(base_dir, 'tests', 'test_settings_ui.py')

        with open(dom_path, 'r', encoding='utf-8') as f:
            cls.dom_content = f.read()
        with open(main_path, 'r', encoding='utf-8') as f:
            cls.main_content = f.read()
        with open(ms_path, 'r', encoding='utf-8') as f:
            cls.ms_content = f.read()
        with open(playback_path, 'r', encoding='utf-8') as f:
            cls.playback_content = f.read()
        with open(ui_path, 'r', encoding='utf-8') as f:
            cls.ui_content = f.read()
        with open(utils_path, 'r', encoding='utf-8') as f:
            cls.utils_content = f.read()
        with open(test_path, 'r', encoding='utf-8') as f:
            cls.test_content = f.read()

        cls.headers_path = os.path.join(base_dir, '_headers')
        if os.path.exists(cls.headers_path):
            with open(cls.headers_path, 'r', encoding='utf-8') as f:
                cls.headers_content = f.read()
        else:
            cls.headers_content = ''

        index_path = os.path.join(base_dir, 'index.html')
        with open(index_path, 'r', encoding='utf-8') as f:
            cls.index_content = f.read()

    def test_no_emojis_in_dom_js(self):
        """Strictly zero emojis anywhere in js/dom.js"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        matches = emoji_pattern.findall(self.dom_content)
        self.assertEqual(matches, [], f"Found emojis in dom.js: {matches}")

    def test_no_emojis_in_utils_js(self):
        """Strictly zero emojis anywhere in js/utils.js"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        matches = emoji_pattern.findall(self.utils_content)
        self.assertEqual(matches, [], f"Found emojis in utils.js: {matches}")

    def test_no_emojis_in_main_js(self):
        """Strictly zero emojis anywhere in js/main.js"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        matches = emoji_pattern.findall(self.main_content)
        self.assertEqual(matches, [], f"Found emojis in main.js: {matches}")

    def test_no_emojis_in_media_session_js(self):
        """Strictly zero emojis anywhere in js/mediaSession.js"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        matches = emoji_pattern.findall(self.ms_content)
        self.assertEqual(matches, [], f"Found emojis in mediaSession.js: {matches}")

    def test_no_emojis_in_test_settings_ui(self):
        """Strictly zero emojis anywhere in tests/test_settings_ui.py"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        matches = emoji_pattern.findall(self.test_content)
        self.assertEqual(matches, [], f"Found emojis in test_settings_ui.py: {matches}")

    def test_no_emojis_in_ui_js(self):
        """Strictly zero emojis anywhere in js/ui.js"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        matches = emoji_pattern.findall(self.ui_content)
        self.assertEqual(matches, [], f"Found emojis in ui.js: {matches}")

    def test_playlist_select_options_configuration(self):
        """updatePlaylistSelectOptions defines unified UPDATE_SITE and INSTALL_APP for desktop and __settings__ for mobile"""
        self.assertRegex(self.main_content, r'function\s+updatePlaylistSelectOptions\s*\(\s*\)')
        self.assertIn('INSTALL_APP', self.main_content)
        self.assertIn('Install App', self.main_content)
        self.assertIn('UPDATE_SITE', self.main_content)
        self.assertIn('Update Site', self.main_content)
        self.assertIn('Settings', self.main_content)
        self.assertIn('__settings__', self.main_content)
        self.assertRegex(
            self.main_content,
            r'if\s*\(\s*typeof\s+isMobileDevice\s*!==\s*[\'"]undefined[\'"]\s*&&\s*isMobileDevice\s*\)\s*\{[\s\S]*?__settings__[\s\S]*?\}\s*else\s*\{[\s\S]*?UPDATE_SITE[\s\S]*?INSTALL_APP[\s\S]*?\}'
        )

    def test_desktop_dropdown_strictly_excludes_settings_option(self):
        """Desktop branch of updatePlaylistSelectOptions strictly excludes __settings__ and includes unified UPDATE_SITE"""
        func_match = re.search(
            r'function\s+updatePlaylistSelectOptions\s*\(\s*\)\s*\{([\s\S]*?)\}\s*updatePlaylistSelectOptions\(\);',
            self.main_content
        )
        self.assertIsNotNone(func_match, "Could not match updatePlaylistSelectOptions function body")
        parts = func_match.group(1).split('else')
        self.assertEqual(len(parts), 2, "Expected updatePlaylistSelectOptions to contain an if-else branch")
        mobile_branch = parts[0]
        desktop_branch = parts[1]
        self.assertIn('__settings__', mobile_branch, "Mobile branch must include __settings__")
        self.assertNotIn('__settings__', desktop_branch, "Desktop branch must strictly exclude __settings__")
        self.assertNotIn('Settings', desktop_branch, "Desktop branch must strictly exclude 'Settings' text")
        self.assertIn('UPDATE_SITE', desktop_branch, "Desktop branch must include UPDATE_SITE")
        self.assertNotIn('HARD_RELOAD', desktop_branch, "Desktop branch unifies reload into UPDATE_SITE and excludes HARD_RELOAD")
        self.assertIn('INSTALL_APP', desktop_branch, "Desktop branch must include INSTALL_APP")

    def test_playlist_select_settings_interceptor(self):
        """playlistSelect change event intercepts __settings__, reverts select value, opens modal, and returns early"""
        self.assertIn('__settings__', self.main_content)
        self.assertRegex(
            self.main_content,
            r'if\s*\(\s*e\.target\.value\s*===\s*[\'"]__settings__[\'"]\s*\)\s*\{[\s\S]*?lastValidPlaylist[\s\S]*?openSettingsModal\(\)[\s\S]*?return\s*;?\s*\}'
        )

    def test_open_settings_modal_definition(self):
        """openSettingsModal function is defined in js/main.js"""
        self.assertRegex(self.main_content, r'function\s+openSettingsModal\s*\(\s*\)')

    def test_open_settings_modal_mode_sync(self):
        """openSettingsModal synchronizes radio buttons and btTimeoutContainer with window.playbackMode"""
        self.assertIn('mode-1-radio', self.main_content)
        self.assertIn('mode-2-radio', self.main_content)
        self.assertIn('bt-timeout-container', self.main_content)
        self.assertRegex(
            self.main_content,
            r'function\s+openSettingsModal\s*\(\s*\)\s*\{[\s\S]*?playbackMode[\s\S]*?mode2[\s\S]*?checked[\s\S]*?style\.display'
        )

    def test_open_settings_modal_timeout_sync(self):
        """openSettingsModal synchronizes timeout select and custom input with window.btTimeoutMins"""
        self.assertIn('bt-timeout-select', self.main_content)
        self.assertIn('bt-timeout-custom', self.main_content)
        self.assertRegex(
            self.main_content,
            r'function\s+openSettingsModal\s*\(\s*\)\s*\{[\s\S]*?btTimeoutMins[\s\S]*?custom[\s\S]*?style\.display'
        )

    def test_open_settings_modal_display(self):
        """openSettingsModal shows settings-modal and settings-backdrop with display block"""
        self.assertRegex(
            self.main_content,
            r'function\s+openSettingsModal\s*\(\s*\)\s*\{[\s\S]*?(settingsModal|settings-modal)[\s\S]*?style\.display\s*=\s*[\'"]block[\'"]'
        )
        self.assertRegex(
            self.main_content,
            r'function\s+openSettingsModal\s*\(\s*\)\s*\{[\s\S]*?(settingsBackdrop|settings-backdrop)[\s\S]*?style\.display\s*=\s*[\'"]block[\'"]'
        )

    def test_close_settings_modal_definition_and_display(self):
        """closeSettingsModal function is defined and hides settings-modal and settings-backdrop"""
        self.assertRegex(self.main_content, r'function\s+closeSettingsModal\s*\(\s*\)')
        self.assertRegex(
            self.main_content,
            r'function\s+closeSettingsModal\s*\(\s*\)\s*\{[\s\S]*?style\.display\s*=\s*[\'"]none[\'"][\s\S]*?style\.display\s*=\s*[\'"]none[\'"]'
        )

    def test_modal_close_events_wired(self):
        """btn-close-settings and settings-backdrop click listeners close modal"""
        self.assertRegex(
            self.main_content,
            r'btn-close-settings[\s\S]*?addEventListener\(\s*[\'"]click[\'"],\s*closeSettingsModal\)'
        )
        self.assertRegex(
            self.main_content,
            r'settings-backdrop[\s\S]*?addEventListener\(\s*[\'"]click[\'"],\s*closeSettingsModal\)'
        )

    def test_escape_key_closes_modal(self):
        """Escape keydown closes settings modal when open"""
        self.assertRegex(
            self.main_content,
            r'e\.key\s*===\s*[\'"]Escape[\'"][\s\S]*?closeSettingsModal\(\)'
        )

    def test_mode_radio_change_listener(self):
        """Radio inputs change listener delegates to togglePlaybackMode and eagerly initializes anchor for Mode 2"""
        self.assertIn('name="playback-mode"', self.main_content)
        self.assertRegex(
            self.main_content,
            r'input\[name=["\']playback-mode["\']\][\s\S]*?addEventListener\(\s*[\'"]change[\'"][\s\S]*?togglePlaybackMode\s*\('
        )
        self.assertIn('initLiveAudioAnchor', self.main_content)
        self.assertIn('initLiveAudioAnchor', self.ms_content)
        self.assertIn('startLiveAudioAnchor', self.ms_content)
        self.assertIn('stopLiveAudioAnchor', self.ms_content)
        self.assertIn('armAutoKillWatchdog', self.ms_content)
        self.assertIn('cancelAutoKillWatchdog', self.ms_content)
        self.assertIn('yt_playback_mode', self.ms_content)

    def test_timeout_select_change_listener(self):
        """bt-timeout-select change listener toggles custom input and updates window.btTimeoutMins and storage"""
        self.assertIn('yt_bt_timeout_mins', self.main_content)
        self.assertRegex(
            self.main_content,
            r'btTimeoutSelect[\s\S]*?addEventListener\(\s*[\'"]change[\'"]'
        )

    def test_timeout_custom_input_listener(self):
        """bt-timeout-custom input/change listener validates 1-1440 mins and updates storage and watchdog"""
        self.assertRegex(
            self.main_content,
            r'btTimeoutCustom[\s\S]*?addEventListener\(\s*[\'"]input[\'"]'
        )
        self.assertRegex(
            self.main_content,
            r'1440'
        )

    def test_app_action_buttons_wired(self):
        """btn-modal-reload and btn-modal-install are wired to app actions and close modal"""
        self.assertIn('btn-modal-reload', self.main_content)
        self.assertIn('btn-modal-install', self.main_content)
        self.assertRegex(
            self.main_content,
            r'btn-modal-reload[\s\S]*?addEventListener\(\s*[\'"]click[\'"]'
        )
        self.assertRegex(
            self.main_content,
            r'btn-modal-install[\s\S]*?addEventListener\(\s*[\'"]click[\'"]'
        )

    def test_playlist_select_hard_reload_interceptor(self):
        """playlistSelect change event intercepts HARD_RELOAD and reloads databases"""
        self.assertRegex(
            self.main_content,
            r'if\s*\(\s*e\.target\.value\s*===\s*[\'"]HARD_RELOAD[\'"][\s\S]*?reloadPlaylistDatabases\(\)'
        )
        vc_match = re.search(r'addEventListener\(\s*["\']visibilitychange["\']\s*,\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\}\);', self.main_content)
        if vc_match:
            self.assertNotIn('reloadPlaylistDatabases', vc_match.group(1))

    def test_media_session_position_type_safety(self):
        """updateMediaSessionPosition in mediaSession.js guards forcedPosition and forcedDuration types"""
        self.assertRegex(
            self.ms_content,
            r'typeof\s+forcedPosition\s*===\s*[\'"]number[\'"]\s*&&\s*!isNaN\(\s*forcedPosition\s*\)'
        )
        self.assertRegex(
            self.ms_content,
            r'typeof\s+forcedDuration\s*===\s*[\'"]number[\'"]\s*&&\s*!isNaN\(\s*forcedDuration\s*\)'
        )

    def test_pause_listener_media_session_position(self):
        """audioPlayer pause event listener calls updateMediaSessionPosition with honest rate 1.0"""
        pause_block_match = re.search(r'audioPlayer\.addEventListener\(\s*[\'"]pause[\'"]\s*,[\s\S]*?\}\);', self.main_content)
        self.assertIsNotNone(pause_block_match, "Could not find audioPlayer pause listener in main.js")
        pause_block = pause_block_match.group(0)
        self.assertNotIn('0.00001', pause_block)
        self.assertRegex(pause_block, r'updateMediaSessionPosition\(\s*audioPlayer\.currentTime\s*,\s*dur\s*,\s*1\.0\s*\)')

    def test_pause_listener_mode2_and_mode1_playback_state(self):
        """audioPlayer pause event listener declares mode-aware state (helper) with honest Mode 1 fallback"""
        pause_block_match = re.search(r'audioPlayer\.addEventListener\(\s*[\'"]pause[\'"]\s*,[\s\S]*?\}\);', self.main_content)
        self.assertIsNotNone(pause_block_match, "Could not find audioPlayer pause listener in main.js")
        pause_block = pause_block_match.group(0)
        self.assertIn("declaredPausedState()", pause_block)
        self.assertIn("'paused'", pause_block)

    def test_media_session_play_handler_lyrics_reset(self):
        """MediaSession play action handler resets lyrics UI on near-end rewind"""
        play_handler_match = re.search(
            r"function\s+handlePlayAction\s*\(\s*\)\s*\{([\s\S]*?)\n    \}\n    window\.handlePlayAction",
            self.ms_content
        )
        self.assertIsNotNone(play_handler_match, "Could not find play action handler in mediaSession.js")
        play_code = play_handler_match.group(1)
        self.assertRegex(
            play_code,
            r'if\s*\(\s*typeof\s+lyricsActive\s*!==\s*[\'"]undefined[\'"]\s*&&\s*lyricsActive\s*&&\s*typeof\s+updateLyricsUI\s*===\s*[\'"]function[\'"]\s*\)\s*\{?\s*updateLyricsUI\(0\)'
        )

    def test_no_desktop_m_key_shortcut(self):
        """Ensure desktop 'm' / 'M' shortcut is absent from main.js"""
        self.assertNotRegex(self.main_content, r"e\.key\s*===\s*['\"]m['\"]\s*\|\|\s*e\.key\s*===\s*['\"]M['\"]")

    def test_no_play_pause_long_press_listeners(self):
        """Ensure btnPlayPause does not have pointerdown hold listeners"""
        self.assertNotIn("playPauseHoldTimer", self.main_content)
        self.assertNotIn("playPauseSuppressClick", self.main_content)

    def test_search_selection_reset_on_playback(self):
        """playTrackSelection resets selectedSearchIndex to -1"""
        self.assertRegex(
            self.playback_content,
            r'function playTrackSelection\s*\([\s\S]*?selectedSearchIndex\s*=\s*-1;'
        )

    def test_search_highlight_requires_active_search(self):
        """renderVirtualTracks in ui.js only adds search-highlight when active search query is present"""
        self.assertRegex(
            self.ui_content,
            r'isSearching[\s\S]*?&&[\s\S]*?i\s*===\s*selectedSearchIndex'
        )

    def test_search_selection_reset_on_playlist_load(self):
        """loadPlaylist resets selectedSearchIndex to -1"""
        self.assertRegex(
            self.playback_content,
            r'function loadPlaylist\s*\([\s\S]*?selectedSearchIndex\s*=\s*-1;'
        )

    def test_mobile_swipe_gesture_works_with_keyboard_open(self):
        """playlistSelectContainer touchend allows swipe even when searchInput is focused, clearing/blurring search on switch"""
        self.assertNotIn("if (document.activeElement === searchInput) return;", self.main_content)
        self.assertRegex(
            self.main_content,
            r'playlistSelectContainer\.addEventListener\(\s*[\'"]touchend[\'"][\s\S]*?searchInput\.blur\(\)[\s\S]*?playlistSelect\.dispatchEvent'
        )

    def test_mobile_swipe_gesture_scoped_to_playlist_select_container_only(self):
        """Mobile swipe to switch playlists is strictly scoped to playlist-select-container and never playlist-panel or playlist-container"""
        self.assertIn('playlistSelectContainer.addEventListener("touchstart"', self.main_content)
        self.assertIn('playlistSelectContainer.addEventListener("touchend"', self.main_content)
        self.assertNotIn('playlistPanel.addEventListener("touchstart"', self.main_content)
        self.assertNotIn('playlistPanel.addEventListener("touchend"', self.main_content)
        self.assertNotIn('playlistContainer.addEventListener("touchstart"', self.main_content)
        self.assertNotIn('playlistContainer.addEventListener("touchend"', self.main_content)
        self.assertIn('id="playlist-select-container"', getattr(self, 'index_content', ''))
        self.assertIn('const playlistSelectContainer = document.getElementById("playlist-select-container")', self.dom_content)
        self.assertIn("#btn-download-playlist", self.main_content)
        self.assertIn("#playlist-container", self.main_content)

    def test_playlist_switch_clears_and_unfocuses_search(self):
        """loadPlaylist, playFromPlaylist, and playlistSelect change listener clear and blur search"""
        self.assertRegex(
            self.playback_content,
            r'function loadPlaylist\s*\([\s\S]*?sInput\.value\s*=\s*[\'"][\'"];[\s\S]*?sInput\.blur\(\);'
        )
        self.assertRegex(
            self.playback_content,
            r'function playFromPlaylist\s*\([\s\S]*?sInput\.value\s*=\s*[\'"][\'"];[\s\S]*?sInput\.blur\(\);'
        )
        self.assertRegex(
            self.main_content,
            r'playlistSelect\.addEventListener\(\s*[\'"]change[\'"][\s\S]*?searchInput\.value\s*=\s*[\'"][\'"];[\s\S]*?searchInput\.blur\(\);'
        )

    def test_vibrant_fallback_color_and_normalization(self):
        """utils.js defines getVibrantFallbackColor with rich palette and uses it in normalizeTrackItem"""
        self.assertRegex(
            self.utils_content,
            r'function\s+getVibrantFallbackColor\s*\('
        )
        self.assertIn('window.getVibrantFallbackColor = getVibrantFallbackColor;', self.utils_content)
        self.assertIn('vibrantPalette = [', self.utils_content)
        self.assertRegex(
            self.utils_content,
            r'const\s+fallbackColor\s*=\s*getVibrantFallbackColor'
        )

    def test_paint_thumb_nodes_replaces_stale_closure(self):
        """ui.js defines paintThumbNodes and uses data-target-src query lookup to avoid stale recycled closures"""
        self.assertRegex(self.ui_content, r'function\s+paintThumbNodes\s*\(')
        self.assertIn('trackList.querySelectorAll', self.ui_content)
        self.assertIn('.track-thumb[data-target-src="', self.ui_content)
        self.assertIn('CSS.escape(thumbUrl)', self.ui_content)

    def test_request_thumb_load_single_flight_and_retry(self):
        """ui.js defines requestThumbLoad with single-flight check, paintThumbNodes call, and scheduleThumbRetry"""
        self.assertRegex(self.ui_content, r'function\s+requestThumbLoad\s*\(')
        self.assertRegex(self.ui_content, r'function\s+scheduleThumbRetry\s*\(')
        self.assertIn('thumbCache.has(thumbUrl)', self.ui_content)
        self.assertIn('paintThumbNodes(thumbUrl, thumbUrl)', self.ui_content)
        self.assertIn('MAX_THUMB_RETRIES', self.ui_content)

    def test_scroll_settle_resets_both_start_and_end_index(self):
        """main.js scroll settle timeout resets both lastStartIndex and lastEndIndex to -1"""
        self.assertRegex(
            self.main_content,
            r'scrollSettleTimer\s*=\s*setTimeout\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?lastStartIndex\s*=\s*-1;[\s\S]*?lastEndIndex\s*=\s*-1;[\s\S]*?renderVirtualTracks\(\);'
        )

    def test_audio_fetch_explicit_high_priority(self):
        """dom.js primary audio fetch and recovery declare priority: 'high' for network scheduling"""
        self.assertRegex(
            self.dom_content,
            r'fetch\(\s*fetchUrl\s*,\s*\{[\s\S]*?priority:\s*[\'"]high[\'"]'
        )
        self.assertRegex(
            self.dom_content,
            r'fetch\(\s*resumeUrl\s*,\s*\{[\s\S]*?priority:\s*[\'"]high[\'"]'
        )

    def test_secondary_assets_explicit_low_priority(self):
        """utils.js artwork, playback.js preload, and ui.js thumbnails use low priority"""
        self.assertIn("fetch(url, { priority: 'low' })", self.utils_content)
        self.assertRegex(self.playback_content, r"fetch\(\s*audioUrl\s*,\s*\{[\s\S]*?priority:\s*['\"]low['\"]")
        self.assertIn('loader.fetchPriority = "low"', self.ui_content)

    def test_lazy_color_resolution_and_track_color(self):
        """utils.js defines getTrackColor and memoizes colors lazily on demand"""
        self.assertRegex(self.utils_content, r'function\s+getTrackColor\s*\(')
        self.assertIn('window.getTrackColor = getTrackColor;', self.utils_content)
        self.assertIn('dominantColorCache.set(track.id, fallbackColor);', self.utils_content)

    def test_external_anchor_security_noopener(self):
        """ui.js sets rel=noopener noreferrer on external YouTube track links"""
        self.assertIn('tLink.rel = "noopener noreferrer";', self.ui_content)

    def test_chunked_normalization_pipeline(self):
        """playback.js defines applyNormalizedDataInChunks and utils.js supports slicing"""
        self.assertRegex(self.playback_content, r'function\s+applyNormalizedDataInChunks\s*\(')
        self.assertRegex(self.utils_content, r'function\s+normalizePlaylistData\s*\([^)]*startIndex[^)]*count')

    def test_headers_configuration(self):
        """_headers file exists and defines security policies"""
        self.assertTrue(len(self.headers_content) > 0, "_headers file must not be empty")
        self.assertIn('Permissions-Policy:', self.headers_content)
        self.assertIn('X-Content-Type-Options: nosniff', self.headers_content)
        self.assertIn('Referrer-Policy: strict-origin-when-cross-origin', self.headers_content)

    def test_shuffle_downloaded_markup_and_modal(self):
        """index.html contains shuffle-downloaded-container and main.js synchronizes toggle on mobile"""
        self.assertIn('id="shuffle-downloaded-container"', self.index_content)
        self.assertIn('id="toggle-shuffle-downloaded"', self.index_content)
        self.assertIn('Shuffle Only Downloaded', self.index_content)
        self.assertIn('shuffleDownloadedContainer', self.main_content)
        self.assertIn('toggleShuffleDownloaded', self.main_content)
        self.assertRegex(
            self.main_content,
            r'shuffleDownloadedContainer\.style\.display\s*=\s*isMobile\s*\?\s*[\'"]block[\'"]\s*:\s*[\'"]none[\'"]'
        )

    def test_shuffle_downloaded_audio_cache_check(self):
        """utils.js defines isTrackAudioCached and refreshCachedAudioUrls checking yt-player-media only"""
        self.assertRegex(self.utils_content, r'function\s+isTrackAudioCached\s*\(')
        self.assertRegex(self.utils_content, r'async\s+function\s+refreshCachedAudioUrls\s*\(')
        self.assertIn("caches.open('yt-player-media')", self.utils_content)
        cache_block = self.utils_content[self.utils_content.find('async function refreshCachedAudioUrls'):]
        self.assertNotIn("yt-player-thumbs", cache_block)

    def test_shuffle_downloaded_playback_integration(self):
        """playback.js generateQueue and playTrackSelection filter to downloaded songs when isShuffleDownloadedOnly is true"""
        self.assertIn('isShuffleDownloadedOnly()', self.playback_content)
        self.assertIn('isTrackAudioCached(data[i])', self.playback_content)
        self.assertIn('isTrackAudioCached(currentPlaylistData[i])', self.playback_content)

    def test_snap_to_search_definition_and_character_insertion(self):
        """snapToSearch blurs active element, focuses searchInput, inserts character, and dispatches input event"""
        self.assertRegex(self.main_content, r'function\s+snapToSearch\s*\(\s*char\s*\)')
        self.assertIn('window.snapToSearch = snapToSearch;', self.main_content)
        self.assertIn('searchInput.focus();', self.main_content)
        self.assertIn('searchInput.setSelectionRange', self.main_content)
        self.assertRegex(self.main_content, r"searchInput\.dispatchEvent\(\s*new\s+Event\(\s*['\"]input['\"]")

    def test_playlist_select_keydown_snaps_to_search_on_desktop(self):
        """playlistSelect keydown listener snaps to searchInput on printable characters when not on mobile"""
        self.assertRegex(
            self.main_content,
            r'playlistSelect\.addEventListener\(\s*[\'"]keydown[\'"][\s\S]*?snapToSearch\(\s*e\.key\s*\)'
        )
        self.assertRegex(
            self.main_content,
            r'playlistSelect\.blur\(\)[\s\S]*?snapToSearch\(\s*e\.key\s*\)'
        )

    def test_playlist_select_change_blurs_select(self):
        """playlistSelect change listener blurs playlistSelect to prevent sticky focus"""
        self.assertRegex(
            self.main_content,
            r'loadPlaylist\(\s*e\.target\.value\s*\);\s*if\s*\(\s*playlistSelect[\s\S]*?playlistSelect\.blur\(\)'
        )

    def test_container_divs_blur_playlist_select_on_pointerdown(self):
        """Container divs blur playlistSelect on pointerdown to resolve focus traps"""
        self.assertIn('blurPlaylistSelectIfActive', self.main_content)
        self.assertIn('playlistContainer.addEventListener("pointerdown", blurPlaylistSelectIfActive);', self.main_content)
        self.assertIn('nowPlaying.addEventListener("pointerdown", blurPlaylistSelectIfActive);', self.main_content)
        self.assertIn('lyricsContainer.addEventListener("pointerdown", blurPlaylistSelectIfActive);', self.main_content)
        self.assertIn('albumArtContainer.addEventListener("pointerdown", blurPlaylistSelectIfActive);', self.main_content)

    def test_window_keydown_handles_playlist_select_and_desktop_snapping(self):
        """window keydown checks e.target === playlistSelect and triggers snapToSearch on printable keys"""
        self.assertRegex(
            self.main_content,
            r'if\s*\(\s*e\.target\s*===\s*playlistSelect\s*\)[\s\S]*?snapToSearch\(\s*e\.key\s*\)'
        )
        self.assertRegex(
            self.main_content,
            r'settingsModal[\s\S]*?display\s*!==\s*[\'"]none[\'"][\s\S]*?return;'
        )

    def test_desktop_mode2_radio_disabled_and_guarded(self):
        """openSettingsModal disables mode2Radio on desktop and change listener rejects mode2"""
        self.assertRegex(
            self.main_content,
            r'if\s*\(\s*!isMobile\s*\)\s*\{[\s\S]*?mode2Radio\.disabled\s*=\s*true;[\s\S]*?mode2Radio\.checked\s*=\s*false;'
        )
        self.assertRegex(
            self.main_content,
            r'if\s*\(\s*!isMobile\s*\)\s*\{[\s\S]*?newMode\s*=\s*[\'"]mode1[\'"];[\s\S]*?mode1Radio\.checked\s*=\s*true;[\s\S]*?mode2Radio\.checked\s*=\s*false;'
        )

    def test_update_site_button_wired_and_defined(self):
        """btnModalUpdate is wired to updateSiteApp which defines executeSitePurgeAndReload"""
        self.assertIn('btnModalUpdate', self.main_content)
        self.assertIn('window.updateSiteApp = updateSiteApp;', self.main_content)
        self.assertRegex(
            self.main_content,
            r'btnModalUpdate\.addEventListener\(\s*[\'"]click[\'"]\s*,\s*\(\s*\)\s*=>\s*\{[\s\S]*?updateSiteApp\(\);'
        )

    def test_update_site_offline_guard_and_resilience(self):
        """updateSiteApp guards against offline state and flushes playback position"""
        self.assertRegex(
            self.main_content,
            r'typeof\s+navigator\s*!==\s*[\'"]undefined[\'"]\s*&&\s*navigator\.onLine\s*===\s*false'
        )
        self.assertIn('Offline - cannot update', self.main_content)
        self.assertRegex(
            self.main_content,
            r'flushLastPlayedState\(\)|saveLastPlayedState\(\)'
        )

    def test_update_site_desktop_select_interceptor(self):
        """playlistSelect on desktop defines and intercepts UPDATE_SITE"""
        self.assertIn('UPDATE_SITE', self.main_content)
        self.assertRegex(
            self.main_content,
            r'if\s*\(\s*e\.target\.value\s*===\s*[\'"]UPDATE_SITE[\'"]\s*\)\s*\{[\s\S]*?updateSiteApp\(\)'
        )

    def test_update_site_unifies_playlist_reload(self):
        """updateSiteApp concurrently triggers reloadPlaylistDatabases to unify site update and playlist reload"""
        self.assertRegex(
            self.main_content,
            r'async\s+function\s+updateSiteApp\s*\(\s*\)\s*\{[\s\S]*?reloadPlaylistDatabases[\s\S]*?\}'
        )

if __name__ == '__main__':
    unittest.main()
