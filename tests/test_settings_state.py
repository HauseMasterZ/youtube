import os
import re
import unittest

class TestSettingsState(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        state_path = os.path.join(base_dir, 'js', 'state.js')
        test_path = os.path.join(base_dir, 'tests', 'test_settings_state.py')
        
        with open(state_path, 'r', encoding='utf-8') as f:
            cls.state_content = f.read()
        with open(test_path, 'r', encoding='utf-8') as f:
            cls.test_content = f.read()

    def test_no_emojis_in_state(self):
        """Strictly zero emojis anywhere in js/state.js"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        matches = emoji_pattern.findall(self.state_content)
        self.assertEqual(matches, [], f"Found emojis in state.js: {matches}")

    def test_no_emojis_in_test_file(self):
        """Strictly zero emojis anywhere in tests/test_settings_state.py"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        matches = emoji_pattern.findall(self.test_content)
        self.assertEqual(matches, [], f"Found emojis in test_settings_state.py: {matches}")

    def test_playback_mode_initialization(self):
        """window.playbackMode is initialized to in-memory default 'mode1' on startup"""
        self.assertIn('window.playbackMode', self.state_content)
        self.assertIn('mode1', self.state_content)
        self.assertRegex(
            self.state_content,
            r'window\.playbackMode\s*=\s*[\'"]mode1[\'"];'
        )

    def test_bt_timeout_mins_initialization(self):
        """window.btTimeoutMins is initialized from localStorage key 'yt_bt_timeout_mins' with default '5'"""
        self.assertIn('window.btTimeoutMins', self.state_content)
        self.assertIn('yt_bt_timeout_mins', self.state_content)
        self.assertIn('5', self.state_content)
        self.assertRegex(
            self.state_content,
            r'window\.btTimeoutMins\s*=\s*(getStoredSetting\(\s*[\'"]yt_bt_timeout_mins[\'"],\s*[\'"]5[\'"]\s*\)|\(typeof localStorage[^\n]+\|\|\s*[\'"]5[\'"]\));'
        )

    def test_bt_sleep_timer_initialization(self):
        """window.btSleepTimer is initialized to null"""
        self.assertRegex(
            self.state_content,
            r'window\.btSleepTimer\s*=\s*null\s*;'
        )

    def test_last_playback_mode_transitions_initialization(self):
        """window.lastPlaybackModeTransitions is initialized to an empty array for shortcut detection"""
        self.assertRegex(
            self.state_content,
            r'window\.lastPlaybackModeTransitions\s*=\s*\[\s*\]\s*;'
        )

    def test_safe_localstorage_access(self):
        """Safe access to localStorage with try/catch and typeof check"""
        self.assertIn('localStorage', self.state_content)
        self.assertRegex(
            self.state_content,
            r'try\s*\{[\s\S]*?localStorage[\s\S]*?\}\s*catch'
        )
        self.assertIn("typeof localStorage !== 'undefined'", self.state_content)

    def test_helper_functions_defined(self):
        """Helper functions getStoredSetting and setStoredSetting exist and are exposed"""
        self.assertRegex(self.state_content, r'function\s+getStoredSetting\s*\(\s*key\s*,\s*defaultValue\s*\)')
        self.assertRegex(self.state_content, r'function\s+setStoredSetting\s*\(\s*key\s*,\s*value\s*\)')
        self.assertIn('window.getStoredSetting = getStoredSetting;', self.state_content)
        self.assertIn('window.setStoredSetting = setStoredSetting;', self.state_content)

if __name__ == '__main__':
    unittest.main()
