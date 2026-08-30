import os
import re
import unittest
from html.parser import HTMLParser

class HTMLValidator(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags = []
        self.errors = []
        self.void_tags = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}

    def handle_starttag(self, tag, attrs):
        if tag.lower() not in self.void_tags:
            self.tags.append(tag.lower())

    def handle_endtag(self, tag):
        tag_lower = tag.lower()
        if tag_lower in self.void_tags:
            return
        if not self.tags:
            self.errors.append(f"Unexpected closing tag </{tag}> with no open tags")
            return
        last_tag = self.tags.pop()
        if last_tag != tag_lower:
            self.errors.append(f"Mismatched tag: expected </{last_tag}>, got </{tag_lower}>")

class TestSettingsMarkup(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        html_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'index.html')
        with open(html_path, 'r', encoding='utf-8') as f:
            cls.html_content = f.read()

    def test_html_tag_balance(self):
        """Verify HTML is well-formed with balanced tags"""
        validator = HTMLValidator()
        validator.feed(self.html_content)
        self.assertEqual(validator.errors, [], f"HTML tag errors: {validator.errors}")
        self.assertEqual(validator.tags, [], f"Unclosed tags at end of file: {validator.tags}")

    def test_no_emojis(self):
        """Strictly zero emojis anywhere in markup, labels, or placeholders"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        matches = emoji_pattern.findall(self.html_content)
        self.assertEqual(matches, [], f"Found emojis in HTML: {matches}")

    def test_playlist_select_settings_option(self):
        """Option value='__settings__' exists at the bottom of playlist-select"""
        select_match = re.search(r'<select[^>]*id=["\']playlist-select["\'][^>]*>(.*?)</select>', self.html_content, re.DOTALL)
        self.assertIsNotNone(select_match, "Could not find #playlist-select")
        select_body = select_match.group(1)
        options = re.findall(r'<option[^>]*value=["\']([^"\']*)["\'][^>]*>(.*?)</option>', select_body, re.DOTALL)
        self.assertTrue(len(options) > 0, "No options in #playlist-select")
        last_option_value, last_option_text = options[-1]
        self.assertEqual(last_option_value, "__settings__")
        self.assertEqual(last_option_text.strip(), "Settings")

    def test_settings_backdrop(self):
        """#settings-backdrop element exists with class and display none"""
        match = re.search(r'<div[^>]*id=["\']settings-backdrop["\'][^>]*>', self.html_content)
        self.assertIsNotNone(match, "Could not find #settings-backdrop")
        tag = match.group(0)
        self.assertIn('class="settings-backdrop"', tag)
        self.assertIn('display: none', tag)

    def test_settings_modal_container(self):
        """#settings-modal exists with proper attributes"""
        match = re.search(r'<div[^>]*id=["\']settings-modal["\'][^>]*>', self.html_content)
        self.assertIsNotNone(match, "Could not find #settings-modal")
        tag = match.group(0)
        self.assertIn('class="settings-modal"', tag)
        self.assertIn('role="dialog"', tag)
        self.assertIn('aria-modal="true"', tag)
        self.assertIn('aria-labelledby="settings-title"', tag)
        self.assertIn('display: none', tag)

    def test_settings_header(self):
        """Settings header with title and close button"""
        self.assertIn('id="settings-title"', self.html_content)
        self.assertIn('Settings</h2>', self.html_content)
        close_btn_match = re.search(r'<button[^>]*id=["\']btn-close-settings["\'][^>]*>', self.html_content)
        self.assertIsNotNone(close_btn_match, "Could not find #btn-close-settings")
        close_tag = close_btn_match.group(0)
        self.assertIn('class="settings-close-btn"', close_tag)
        self.assertIn('aria-label="Close settings"', close_tag)

    def test_playback_engine_radios(self):
        """Section 1: Playback engine radio buttons and subtexts"""
        # Mode 1
        m1_match = re.search(r'<input[^>]*id=["\']mode-1-radio["\'][^>]*>', self.html_content)
        self.assertIsNotNone(m1_match, "Could not find #mode-1-radio")
        m1_tag = m1_match.group(0)
        self.assertIn('name="playback-mode"', m1_tag)
        self.assertIn('value="mode1"', m1_tag)
        self.assertIn('Persistent Notification Mode', self.html_content)
        self.assertIn('Standard micro-rate spoofing for battery saving & pinned lock-screen controls', self.html_content)

        # Mode 2
        m2_match = re.search(r'<input[^>]*id=["\']mode-2-radio["\'][^>]*>', self.html_content)
        self.assertIsNotNone(m2_match, "Could not find #mode-2-radio")
        m2_tag = m2_match.group(0)
        self.assertIn('name="playback-mode"', m2_tag)
        self.assertIn('value="mode2"', m2_tag)
        self.assertIn('Hands-Free Bluetooth Mode', self.html_content)
        self.assertIn('Live audio anchor on pause with auto-kill sleep timer for seamless car/earbud playback', self.html_content)

    def test_bluetooth_timeout_section(self):
        """Section 2: Bluetooth timeout container, select, and custom input"""
        self.assertIn('id="bt-timeout-container"', self.html_content)
        self.assertIn('Inactivity Auto-Kill Timeout', self.html_content)
        
        select_match = re.search(r'<select[^>]*id=["\']bt-timeout-select["\'][^>]*>(.*?)</select>', self.html_content, re.DOTALL)
        self.assertIsNotNone(select_match, "Could not find #bt-timeout-select")
        select_body = select_match.group(1)
        
        options = re.findall(r'<option[^>]*value=["\']([^"\']*)["\']([^>]*)>(.*?)</option>', select_body, re.DOTALL)
        options_dict = {val: (attrs, text.strip()) for val, attrs, text in options}
        
        self.assertIn("15", options_dict)
        self.assertEqual(options_dict["15"][1], "15 Minutes")
        
        self.assertIn("30", options_dict)
        self.assertEqual(options_dict["30"][1], "30 Minutes")
        self.assertIn("selected", options_dict["30"][0])
        
        self.assertIn("60", options_dict)
        self.assertEqual(options_dict["60"][1], "1 Hour")
        
        self.assertIn("120", options_dict)
        self.assertEqual(options_dict["120"][1], "2 Hours")
        
        self.assertIn("never", options_dict)
        self.assertEqual(options_dict["never"][1], "Never (Stay Alive)")
        
        self.assertIn("custom", options_dict)
        self.assertEqual(options_dict["custom"][1], "Custom...")

        # Custom timeout input
        custom_input_match = re.search(r'<input[^>]*id=["\']bt-timeout-custom["\'][^>]*>', self.html_content)
        self.assertIsNotNone(custom_input_match, "Could not find #bt-timeout-custom")
        custom_tag = custom_input_match.group(0)
        self.assertIn('type="number"', custom_tag)
        self.assertIn('min="1"', custom_tag)
        self.assertIn('max="1440"', custom_tag)
        self.assertIn('placeholder="Minutes"', custom_tag)
        self.assertIn('display: none', custom_tag)

    def test_app_action_buttons(self):
        """Section 3: App action buttons"""
        reload_match = re.search(r'<button[^>]*id=["\']btn-modal-reload["\'][^>]*>(.*?)</button>', self.html_content, re.DOTALL)
        self.assertIsNotNone(reload_match, "Could not find #btn-modal-reload")
        self.assertIn('class="settings-action-btn"', reload_match.group(0))
        self.assertIn('Reload Playlists', reload_match.group(1))

        install_match = re.search(r'<button[^>]*id=["\']btn-modal-install["\'][^>]*>(.*?)</button>', self.html_content, re.DOTALL)
        self.assertIsNotNone(install_match, "Could not find #btn-modal-install")
        self.assertIn('class="settings-action-btn"', install_match.group(0))
        self.assertIn('Install App', install_match.group(1))

    def test_mode_toast(self):
        """Floating Toast #mode-toast and #mode-toast-text"""
        toast_match = re.search(r'<div[^>]*id=["\']mode-toast["\'][^>]*>(.*?)</div>', self.html_content, re.DOTALL)
        self.assertIsNotNone(toast_match, "Could not find #mode-toast")
        toast_tag = toast_match.group(0)
        self.assertIn('class="mode-toast"', toast_tag)
        self.assertIn('aria-live="polite"', toast_tag)
        self.assertIn('display: none', toast_tag)
        self.assertIn('id="mode-toast-text"', toast_match.group(1))

    def test_live_stream_anchor(self):
        """Hidden live stream anchor audio element"""
        anchor_match = re.search(r'<audio[^>]*id=["\']live-stream-anchor["\'][^>]*>', self.html_content)
        self.assertIsNotNone(anchor_match, "Could not find #live-stream-anchor")
        anchor_tag = anchor_match.group(0)
        self.assertIn('preload="none"', anchor_tag)
        self.assertIn('display:none', anchor_tag.replace(' ', ''))

if __name__ == '__main__':
    unittest.main()
