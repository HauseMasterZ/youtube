import os
import re
import unittest

class TestSettingsCSS(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        css_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'css', 'style.css')
        with open(css_path, 'r', encoding='utf-8') as f:
            cls.css_content = f.read()

    def test_no_emojis(self):
        """Strictly zero emojis in CSS file"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        matches = emoji_pattern.findall(self.css_content)
        self.assertEqual(matches, [], f"Found emojis in CSS: {matches}")

    def test_settings_backdrop_styles(self):
        """Settings backdrop glassmorphic overlay rules"""
        self.assertRegex(self.css_content, r'(#settings-backdrop|\.settings-backdrop)[^{]*\{[^}]*position:\s*fixed;')
        self.assertRegex(self.css_content, r'(#settings-backdrop|\.settings-backdrop)[^{]*\{[^}]*background:\s*rgba\(\s*0,\s*0,\s*0,\s*0\.6\s*\);')
        self.assertRegex(self.css_content, r'(#settings-backdrop|\.settings-backdrop)[^{]*\{[^}]*backdrop-filter:\s*blur\(8px\);')
        self.assertRegex(self.css_content, r'(#settings-backdrop|\.settings-backdrop)[^{]*\{[^}]*-webkit-backdrop-filter:\s*blur\(8px\);')
        self.assertRegex(self.css_content, r'(#settings-backdrop|\.settings-backdrop)[^{]*\{[^}]*z-index:\s*10000;')
        self.assertRegex(self.css_content, r'(#settings-backdrop|\.settings-backdrop)[^{]*\{[^}]*transition:\s*opacity\s*0\.2s\s*ease;')

    def test_settings_modal_styles(self):
        """Settings modal glassmorphic window rules"""
        self.assertRegex(self.css_content, r'(#settings-modal|\.settings-modal)[^{]*\{[^}]*position:\s*fixed;')
        self.assertRegex(self.css_content, r'(#settings-modal|\.settings-modal)[^{]*\{[^}]*top:\s*50%;')
        self.assertRegex(self.css_content, r'(#settings-modal|\.settings-modal)[^{]*\{[^}]*left:\s*50%;')
        self.assertRegex(self.css_content, r'(#settings-modal|\.settings-modal)[^{]*\{[^}]*transform:\s*translate\(-50%,\s*-50%\);')
        self.assertRegex(self.css_content, r'(#settings-modal|\.settings-modal)[^{]*\{[^}]*z-index:\s*10001;')
        self.assertRegex(self.css_content, r'(#settings-modal|\.settings-modal)[^{]*\{[^}]*width:\s*90%;')
        self.assertRegex(self.css_content, r'(#settings-modal|\.settings-modal)[^{]*\{[^}]*max-width:\s*420px;')
        self.assertRegex(self.css_content, r'(#settings-modal|\.settings-modal)[^{]*\{[^}]*max-height:\s*85vh;')
        self.assertRegex(self.css_content, r'(#settings-modal|\.settings-modal)[^{]*\{[^}]*overflow-y:\s*auto;')
        self.assertRegex(self.css_content, r'(#settings-modal|\.settings-modal)[^{]*\{[^}]*background:\s*rgba\(\s*18,\s*18,\s*24,\s*0\.95\s*\);')
        self.assertRegex(self.css_content, r'(#settings-modal|\.settings-modal)[^{]*\{[^}]*backdrop-filter:\s*blur\(20px\);')
        self.assertRegex(self.css_content, r'(#settings-modal|\.settings-modal)[^{]*\{[^}]*-webkit-backdrop-filter:\s*blur\(20px\);')
        self.assertRegex(self.css_content, r'(#settings-modal|\.settings-modal)[^{]*\{[^}]*border:\s*1px\s*solid\s*rgba\(\s*255,\s*255,\s*255,\s*0\.1\s*\);')
        self.assertRegex(self.css_content, r'(#settings-modal|\.settings-modal)[^{]*\{[^}]*border-radius:\s*16px;')
        self.assertRegex(self.css_content, r'(#settings-modal|\.settings-modal)[^{]*\{[^}]*padding:\s*20px;')
        self.assertRegex(self.css_content, r'(#settings-modal|\.settings-modal)[^{]*\{[^}]*box-shadow:\s*0\s*8px\s*32px\s*rgba\(\s*0,\s*0,\s*0,\s*0\.8\s*\);')

    def test_settings_header_styles(self):
        """Settings header flex layout"""
        self.assertRegex(self.css_content, r'\.settings-header[^{]*\{[^}]*display:\s*flex;')
        self.assertRegex(self.css_content, r'\.settings-header[^{]*\{[^}]*justify-content:\s*space-between;')
        self.assertRegex(self.css_content, r'\.settings-header[^{]*\{[^}]*align-items:\s*center;')
        self.assertRegex(self.css_content, r'\.settings-header[^{]*\{[^}]*margin-bottom:\s*16px;')

    def test_settings_title_styles(self):
        """Settings title typography"""
        self.assertRegex(self.css_content, r'(#settings-title|\.settings-title)[^{]*\{[^}]*font-size:\s*18px;')
        self.assertRegex(self.css_content, r'(#settings-title|\.settings-title)[^{]*\{[^}]*font-weight:\s*700;')
        self.assertRegex(self.css_content, r'(#settings-title|\.settings-title)[^{]*\{[^}]*margin:\s*0;')

    def test_settings_close_btn_styles(self):
        """Settings close button styling"""
        self.assertRegex(self.css_content, r'(#btn-close-settings|\.settings-close-btn)[^{]*\{[^}]*background:\s*transparent;')
        self.assertRegex(self.css_content, r'(#btn-close-settings|\.settings-close-btn)[^{]*\{[^}]*border:\s*none;')
        self.assertRegex(self.css_content, r'(#btn-close-settings|\.settings-close-btn)[^{]*\{[^}]*color:\s*var\(--text-secondary\);')
        self.assertRegex(self.css_content, r'(#btn-close-settings|\.settings-close-btn)[^{]*\{[^}]*font-size:\s*22px;')
        self.assertRegex(self.css_content, r'(#btn-close-settings|\.settings-close-btn)[^{]*\{[^}]*cursor:\s*pointer;')
        self.assertRegex(self.css_content, r'(#btn-close-settings|\.settings-close-btn)[^{]*\{[^}]*padding:\s*4px\s*8px;')
        self.assertRegex(self.css_content, r'(#btn-close-settings|\.settings-close-btn)[^{]*\{[^}]*border-radius:\s*6px;')

    def test_settings_section_styles(self):
        """Settings section spacing and section title"""
        self.assertRegex(self.css_content, r'(\.settings-section|#bt-timeout-container)[^{]*\{[^}]*margin-bottom:\s*18px;')
        self.assertRegex(self.css_content, r'\.settings-section-title[^{]*\{[^}]*font-size:\s*13px;')
        self.assertRegex(self.css_content, r'\.settings-section-title[^{]*\{[^}]*font-weight:\s*600;')
        self.assertRegex(self.css_content, r'\.settings-section-title[^{]*\{[^}]*text-transform:\s*uppercase;')
        self.assertRegex(self.css_content, r'\.settings-section-title[^{]*\{[^}]*letter-spacing:\s*0\.5px;')
        self.assertRegex(self.css_content, r'\.settings-section-title[^{]*\{[^}]*color:\s*var\(--text-secondary\);')
        self.assertRegex(self.css_content, r'\.settings-section-title[^{]*\{[^}]*margin-bottom:\s*10px;')

    def test_settings_radio_card_styles(self):
        """Settings radio cards and active/checked state"""
        self.assertRegex(self.css_content, r'(\.settings-radio-card|\.settings-radio-label)[^{]*\{[^}]*background:\s*rgba\(\s*255,\s*255,\s*255,\s*0\.04\s*\);')
        self.assertRegex(self.css_content, r'(\.settings-radio-card|\.settings-radio-label)[^{]*\{[^}]*border:\s*1px\s*solid\s*rgba\(\s*255,\s*255,\s*255,\s*0\.08\s*\);')
        self.assertRegex(self.css_content, r'(\.settings-radio-card|\.settings-radio-label)[^{]*\{[^}]*border-radius:\s*10px;')
        self.assertRegex(self.css_content, r'(\.settings-radio-card|\.settings-radio-label)[^{]*\{[^}]*padding:\s*12px;')
        self.assertRegex(self.css_content, r'(\.settings-radio-card|\.settings-radio-label)[^{]*\{[^}]*margin-bottom:\s*10px;')
        self.assertRegex(self.css_content, r'(\.settings-radio-card|\.settings-radio-label)[^{]*\{[^}]*display:\s*flex;')
        self.assertRegex(self.css_content, r'(\.settings-radio-card|\.settings-radio-label)[^{]*\{[^}]*gap:\s*10px;')
        self.assertRegex(self.css_content, r'(\.settings-radio-card|\.settings-radio-label)[^{]*\{[^}]*align-items:\s*flex-start;')
        self.assertRegex(self.css_content, r'(\.settings-radio-card|\.settings-radio-label)[^{]*\{[^}]*cursor:\s*pointer;')
        
        # Hover border color
        self.assertRegex(self.css_content, r'(\.settings-radio-card|\.settings-radio-label)[^}]*:hover\s*\{[^}]*border-color:\s*rgba\(\s*255,\s*255,\s*255,\s*0\.2\s*\);')
        
        # Checked state styling
        self.assertRegex(self.css_content, r'border-color:\s*var\(--primary-color,\s*#8c73ff\);')
        self.assertRegex(self.css_content, r'background:\s*rgba\(\s*140,\s*115,\s*255,\s*0\.08\s*\);')

    def test_settings_subtext_styles(self):
        """Settings subtext typography"""
        self.assertRegex(self.css_content, r'(\.settings-subtext|\.settings-radio-subtext)[^{]*\{[^}]*font-size:\s*12px;')
        self.assertRegex(self.css_content, r'(\.settings-subtext|\.settings-radio-subtext)[^{]*\{[^}]*color:\s*var\(--text-secondary\);')
        self.assertRegex(self.css_content, r'(\.settings-subtext|\.settings-radio-subtext)[^{]*\{[^}]*line-height:\s*1\.4;')
        self.assertRegex(self.css_content, r'(\.settings-subtext|\.settings-radio-subtext)[^{]*\{[^}]*margin-top:\s*3px;')

    def test_settings_select_and_input_styles(self):
        """Settings select and input controls"""
        self.assertRegex(self.css_content, r'(\.settings-select|#bt-timeout-select)[^{]*\{[^}]*width:\s*100%;')
        self.assertRegex(self.css_content, r'(\.settings-select|#bt-timeout-select)[^{]*\{[^}]*background:\s*#000000;')
        self.assertRegex(self.css_content, r'(\.settings-select|#bt-timeout-select)[^{]*\{[^}]*border:\s*1px\s*solid\s*rgba\(\s*255,\s*255,\s*255,\s*0\.15\s*\);')
        self.assertRegex(self.css_content, r'(\.settings-select|#bt-timeout-select)[^{]*\{[^}]*border-radius:\s*8px;')
        self.assertRegex(self.css_content, r'(\.settings-select|#bt-timeout-select)[^{]*\{[^}]*padding:\s*10px;')
        self.assertRegex(self.css_content, r'(\.settings-select|#bt-timeout-select)[^{]*\{[^}]*font-size:\s*14px;')
        self.assertRegex(self.css_content, r'(\.settings-select|#bt-timeout-select)[^{]*\{[^}]*outline:\s*none;')

        self.assertRegex(self.css_content, r'(\.settings-input|#bt-timeout-custom)[^{]*\{[^}]*width:\s*100%;')
        self.assertRegex(self.css_content, r'(\.settings-input|#bt-timeout-custom)[^{]*\{[^}]*box-sizing:\s*border-box;')
        self.assertRegex(self.css_content, r'(\.settings-input|#bt-timeout-custom)[^{]*\{[^}]*background:\s*#000000;')
        self.assertRegex(self.css_content, r'(\.settings-input|#bt-timeout-custom)[^{]*\{[^}]*border:\s*1px\s*solid\s*rgba\(\s*255,\s*255,\s*255,\s*0\.15\s*\);')
        self.assertRegex(self.css_content, r'(\.settings-input|#bt-timeout-custom)[^{]*\{[^}]*border-radius:\s*8px;')
        self.assertRegex(self.css_content, r'(\.settings-input|#bt-timeout-custom)[^{]*\{[^}]*padding:\s*10px;')
        self.assertRegex(self.css_content, r'(\.settings-input|#bt-timeout-custom)[^{]*\{[^}]*font-size:\s*14px;')
        self.assertRegex(self.css_content, r'(\.settings-input|#bt-timeout-custom)[^{]*\{[^}]*margin-top:\s*8px;')
        self.assertRegex(self.css_content, r'(\.settings-input|#bt-timeout-custom)[^{]*\{[^}]*outline:\s*none;')

    def test_settings_action_btn_styles(self):
        """Settings action button styles"""
        self.assertRegex(self.css_content, r'(\.settings-action-btn|#btn-modal-reload)[^{]*\{[^}]*width:\s*100%;')
        self.assertRegex(self.css_content, r'(\.settings-action-btn|#btn-modal-reload)[^{]*\{[^}]*background:\s*rgba\(\s*255,\s*255,\s*255,\s*0\.06\s*\);')
        self.assertRegex(self.css_content, r'(\.settings-action-btn|#btn-modal-reload)[^{]*\{[^}]*border:\s*1px\s*solid\s*rgba\(\s*255,\s*255,\s*255,\s*0\.12\s*\);')
        self.assertRegex(self.css_content, r'(\.settings-action-btn|#btn-modal-reload)[^{]*\{[^}]*border-radius:\s*8px;')
        self.assertRegex(self.css_content, r'(\.settings-action-btn|#btn-modal-reload)[^{]*\{[^}]*color:\s*var\(--text-primary\);')
        self.assertRegex(self.css_content, r'(\.settings-action-btn|#btn-modal-reload)[^{]*\{[^}]*padding:\s*12px;')
        self.assertRegex(self.css_content, r'(\.settings-action-btn|#btn-modal-reload)[^{]*\{[^}]*font-size:\s*14px;')
        self.assertRegex(self.css_content, r'(\.settings-action-btn|#btn-modal-reload)[^{]*\{[^}]*font-weight:\s*600;')
        self.assertRegex(self.css_content, r'(\.settings-action-btn|#btn-modal-reload)[^{]*\{[^}]*cursor:\s*pointer;')
        self.assertRegex(self.css_content, r'(\.settings-action-btn|#btn-modal-reload)[^{]*\{[^}]*margin-bottom:\s*8px;')
        self.assertRegex(self.css_content, r'(\.settings-action-btn|#btn-modal-reload)[^{]*\{[^}]*transition:\s*background\s*0\.2s\s*ease,\s*border-color\s*0\.2s\s*ease;')

    def test_mode_toast_styles(self):
        """Mode toast glassmorphic notification styling"""
        self.assertRegex(self.css_content, r'(#mode-toast|\.mode-toast)[^{]*\{[^}]*position:\s*fixed;')
        self.assertRegex(self.css_content, r'(#mode-toast|\.mode-toast)[^{]*\{[^}]*bottom:\s*80px;')
        self.assertRegex(self.css_content, r'(#mode-toast|\.mode-toast)[^{]*\{[^}]*left:\s*50%;')
        self.assertRegex(self.css_content, r'(#mode-toast|\.mode-toast)[^{]*\{[^}]*transform:\s*translateX\(-50%\);')
        self.assertRegex(self.css_content, r'(#mode-toast|\.mode-toast)[^{]*\{[^}]*background:\s*rgba\(\s*18,\s*18,\s*24,\s*0\.92\s*\);')
        self.assertRegex(self.css_content, r'(#mode-toast|\.mode-toast)[^{]*\{[^}]*backdrop-filter:\s*blur\(16px\);')
        self.assertRegex(self.css_content, r'(#mode-toast|\.mode-toast)[^{]*\{[^}]*-webkit-backdrop-filter:\s*blur\(16px\);')
        self.assertRegex(self.css_content, r'(#mode-toast|\.mode-toast)[^{]*\{[^}]*border:\s*1px\s*solid\s*var\(--primary-color,\s*#8c73ff\);')
        self.assertRegex(self.css_content, r'(#mode-toast|\.mode-toast)[^{]*\{[^}]*box-shadow:\s*0\s*4px\s*20px\s*rgba\(\s*0,\s*0,\s*0,\s*0\.6\s*\),\s*0\s*0\s*12px\s*rgba\(\s*140,\s*115,\s*255,\s*0\.3\s*\);')
        self.assertRegex(self.css_content, r'(#mode-toast|\.mode-toast)[^{]*\{[^}]*color:\s*#ffffff;')
        self.assertRegex(self.css_content, r'(#mode-toast|\.mode-toast)[^{]*\{[^}]*padding:\s*10px\s*20px;')
        self.assertRegex(self.css_content, r'(#mode-toast|\.mode-toast)[^{]*\{[^}]*border-radius:\s*24px;')
        self.assertRegex(self.css_content, r'(#mode-toast|\.mode-toast)[^{]*\{[^}]*font-size:\s*13px;')
        self.assertRegex(self.css_content, r'(#mode-toast|\.mode-toast)[^{]*\{[^}]*font-weight:\s*600;')
        self.assertRegex(self.css_content, r'(#mode-toast|\.mode-toast)[^{]*\{[^}]*letter-spacing:\s*0\.2px;')
        self.assertRegex(self.css_content, r'(#mode-toast|\.mode-toast)[^{]*\{[^}]*z-index:\s*10002;')
        self.assertRegex(self.css_content, r'(#mode-toast|\.mode-toast)[^{]*\{[^}]*pointer-events:\s*none;')
        self.assertRegex(self.css_content, r'(#mode-toast|\.mode-toast)[^{]*\{[^}]*transition:\s*opacity\s*0\.3s\s*ease,\s*transform\s*0\.3s\s*ease;')

    def test_responsive_mobile_rules(self):
        """Responsive rules for mobile under max-width 800px"""
        # Find 800px media query section
        match = re.search(r'@media\s*\(\s*max-width:\s*800px\s*\)\s*\{([\s\S]*?)\n\}', self.css_content)
        self.assertIsNotNone(match, "Could not find @media (max-width: 800px) block")
        mobile_section = match.group(1)
        
        # Modal width & padding on mobile
        self.assertRegex(mobile_section, r'(#settings-modal|\.settings-modal)[^{]*\{[^}]*width:\s*92%;')
        self.assertRegex(mobile_section, r'(#settings-modal|\.settings-modal)[^{]*\{[^}]*max-width:\s*380px;')
        self.assertRegex(mobile_section, r'(#settings-modal|\.settings-modal)[^{]*\{[^}]*padding:\s*16px;')

        # Touch targets >= 44px
        self.assertRegex(mobile_section, r'(\.settings-action-btn|\.settings-radio-card|\.settings-radio-label)[^{]*\{[^}]*min-height:\s*44px;')

if __name__ == '__main__':
    unittest.main()
