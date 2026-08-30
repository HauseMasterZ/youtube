import os
import re
import unittest

class TestSettingsUI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        main_path = os.path.join(base_dir, 'js', 'main.js')
        ms_path = os.path.join(base_dir, 'js', 'mediaSession.js')
        test_path = os.path.join(base_dir, 'tests', 'test_settings_ui.py')

        with open(main_path, 'r', encoding='utf-8') as f:
            cls.main_content = f.read()
        with open(ms_path, 'r', encoding='utf-8') as f:
            cls.ms_content = f.read()
        with open(test_path, 'r', encoding='utf-8') as f:
            cls.test_content = f.read()

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
        """Radio inputs change listener updates mode, storage, display, anchor/watchdog on pause, and media session"""
        self.assertIn('name="playback-mode"', self.main_content)
        self.assertIn('yt_playback_mode', self.main_content)
        self.assertIn('startLiveAudioAnchor', self.main_content)
        self.assertIn('stopLiveAudioAnchor', self.main_content)
        self.assertIn('armAutoKillWatchdog', self.main_content)
        self.assertIn('cancelAutoKillWatchdog', self.main_content)
        self.assertRegex(
            self.main_content,
            r'input\[name=["\']playback-mode["\']\][\s\S]*?addEventListener\(\s*[\'"]change[\'"]'
        )

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
        """audioPlayer pause event listener calls updateMediaSessionPosition without hardcoded 0.00001"""
        pause_block_match = re.search(r'audioPlayer\.addEventListener\(\s*[\'"]pause[\'"]\s*,[\s\S]*?\}\);', self.main_content)
        self.assertIsNotNone(pause_block_match, "Could not find audioPlayer pause listener in main.js")
        pause_block = pause_block_match.group(0)
        self.assertNotIn('0.00001', pause_block)
        self.assertRegex(pause_block, r'updateMediaSessionPosition\(\s*audioPlayer\.currentTime\s*,\s*dur\s*\)')

if __name__ == '__main__':
    unittest.main()
