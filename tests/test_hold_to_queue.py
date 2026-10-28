import os
import re
import unittest

class TestHoldToQueue(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        js_dir = os.path.join(base_dir, 'js')
        css_dir = os.path.join(base_dir, 'css')

        with open(os.path.join(js_dir, 'main.js'), 'r', encoding='utf-8') as f:
            cls.main_content = f.read()
        with open(os.path.join(js_dir, 'playback.js'), 'r', encoding='utf-8') as f:
            cls.playback_content = f.read()
        with open(os.path.join(js_dir, 'lyrics.js'), 'r', encoding='utf-8') as f:
            cls.lyrics_content = f.read()
        with open(os.path.join(js_dir, 'dom.js'), 'r', encoding='utf-8') as f:
            cls.dom_content = f.read()
        with open(os.path.join(css_dir, 'style.css'), 'r', encoding='utf-8') as f:
            cls.css_content = f.read()
        with open(__file__, 'r', encoding='utf-8') as f:
            cls.test_content = f.read()

    def test_zero_emojis(self):
        """Strictly zero emojis in test file and modified source files"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        self.assertEqual(emoji_pattern.findall(self.main_content), [], "Found emojis in main.js")
        self.assertEqual(emoji_pattern.findall(self.playback_content), [], "Found emojis in playback.js")
        self.assertEqual(emoji_pattern.findall(self.lyrics_content), [], "Found emojis in lyrics.js")
        self.assertEqual(emoji_pattern.findall(self.dom_content), [], "Found emojis in dom.js")
        self.assertEqual(emoji_pattern.findall(self.css_content), [], "Found emojis in style.css")
        self.assertEqual(emoji_pattern.findall(self.test_content), [], "Found emojis in test_hold_to_queue.py")

    def test_no_user_select_none_on_tracklist_in_css(self):
        """CSS does not disable text selection on track list container or items"""
        tracklist_match = re.search(r'#track-list\s*\{([^}]*)\}', self.css_content)
        if tracklist_match:
            self.assertNotIn('user-select: none', tracklist_match.group(1))
        tracklist_li_match = re.search(r'#track-list\s+li\s*\{([^}]*)\}', self.css_content)
        if tracklist_li_match:
            self.assertNotIn('user-select: none', tracklist_li_match.group(1))

    def test_touch_action_pan_y_on_tracklist_in_css(self):
        """touch-action: pan-y eliminates mobile 300ms double-tap disambiguation delay"""
        tracklist_match = re.search(r'#track-list\s*\{([^}]*)\}', self.css_content)
        self.assertIsNotNone(tracklist_match)
        self.assertIn('touch-action: pan-y;', tracklist_match.group(1))

        tracklist_li_match = re.search(r'#track-list\s+li\s*\{([^}]*)\}', self.css_content)
        self.assertIsNotNone(tracklist_li_match)
        self.assertIn('touch-action: pan-y;', tracklist_li_match.group(1))

    def test_slide_css_classes_exist(self):
        """CSS defines zero-GPU feedback classes for slide gestures"""
        self.assertIn('#track-list li.slide-enqueue', self.css_content)
        self.assertIn('#track-list li.slide-download', self.css_content)

    def test_removal_of_mobile_hold_timer_in_main(self):
        """Mobile hold-to-enqueue timer and selectstart suppression are completely removed"""
        self.assertNotIn('holdTimer', self.main_content)
        self.assertNotIn('trackList.addEventListener("selectstart"', self.main_content)

    def test_desktop_contextmenu_clears_selection_and_enqueues(self):
        """Desktop right click contextmenu continues to enqueue tracks and clear selection"""
        self.assertRegex(
            self.main_content,
            r'trackList\.addEventListener\(\s*["\']contextmenu["\']\s*,\s*\(e\)\s*=>\s*\{[\s\S]*?window\.getSelection[\s\S]*?queuePlayNext\(li\.dataset\.playlist'
        )

    def test_mobile_slide_touchstart_preserves_virtual_scroller_transform(self):
        """touchstart captures active Li and preserves translateY using regex"""
        self.assertIn(r"activeLi.style.transform.match(/translate3d\(\s*[^,]+,\s*([^,]+)/)", self.main_content)

    def test_mobile_slide_touchmove_direction_lock_and_passive_false(self):
        """touchmove listener is non-passive to allow e.preventDefault() on horizontal swipe"""
        self.assertRegex(
            self.main_content,
            r'trackList\.addEventListener\(\s*["\']touchmove["\']\s*,[\s\S]*?,\s*\{\s*passive:\s*false\s*\}\s*\);'
        )
        self.assertIn('absX > 8 || absY > 8', self.main_content)
        self.assertIn("activeLi.classList.add('slide-enqueue')", self.main_content)
        self.assertIn("activeLi.classList.add('slide-download')", self.main_content)

    def test_mobile_slide_touchend_actions(self):
        """touchend triggers queuePlayNext on swipe right and downloadSingleTrack on swipe left"""
        self.assertIn('if (dx >= 60)', self.main_content)
        self.assertIn('queuePlayNext(pl, idx)', self.main_content)
        self.assertIn('else if (dx <= -60)', self.main_content)
        self.assertIn('window.downloadSingleTrack(pl, idx)', self.main_content)
        self.assertIn('navigator.vibrate(40)', self.main_content)

    def test_download_single_track_exposed_in_playback(self):
        """window.downloadSingleTrack is exposed and handles CacheStorage saving"""
        self.assertIn('window.downloadSingleTrack = downloadSingleTrack;', self.playback_content)
        self.assertIn("caches.open('yt-player-media')", self.playback_content)
        self.assertIn("caches.open('yt-player-thumbs')", self.playback_content)

    def test_lyrics_timestamp_instant_seek_invariants(self):
        """Lyric timestamp click immediately updates seek thumb, time UI, and media session"""
        self.assertRegex(
            self.lyrics_content,
            r'audioPlayer\.currentTime\s*=\s*targetTime;[\s\S]*?updateTimeUI\(targetTime\);[\s\S]*?updateLyricsUI\(targetTime\);[\s\S]*?updateMediaSessionPosition\(targetTime'
        )
        self.assertIn('lastRenderTime = -1', self.lyrics_content)
        self.assertIn('saveLastPlayedState(targetTime)', self.lyrics_content)

    def test_dom_stream_load_parallel_and_initial_bytes(self):
        """dom.js parallelizes buffer clear and cache lookup, reducing initial target bytes to 40KB"""
        self.assertIn('const INITIAL_TARGET_BYTES = 40960;', self.dom_content)
        self.assertIn('Promise.all([clearBufferPromise, cacheLookupPromise])', self.dom_content)

    def test_playback_preloaded_fetches_aborts_active_audio_url(self):
        """startPlayback aborts ongoing preloads for the active audio URL"""
        self.assertRegex(
            self.playback_content,
            r'if\s*\(\s*preloadedFetches\.has\(audioUrl\)\s*\)\s*\{[\s\S]*?controller\.abort\(\);'
        )

    def test_mobile_contextmenu_suppressed_to_remove_hold_to_queue(self):
        """Mobile long-press contextmenu is suppressed so hold-to-enqueue does not fire on mobile"""
        self.assertRegex(
            self.main_content,
            r'trackList\.addEventListener\(\s*["\']contextmenu["\']\s*,\s*\(e\)\s*=>\s*\{[\s\S]*?if\s*\(\s*typeof\s+isMobileDevice\s*!==\s*["\']undefined["\']\s*&&\s*isMobileDevice\s*\)\s*\{[\s\S]*?e\.preventDefault\(\);[\s\S]*?return;'
        )

    def test_clear_source_buffer_waits_for_update(self):
        """_clearSourceBuffer awaits _waitForUpdate to prevent InvalidStateError during in-flight appends"""
        self.assertRegex(
            self.dom_content,
            r'async\s+_clearSourceBuffer\(\)\s*\{[\s\S]*?await\s+this\._waitForUpdate\(\);[\s\S]*?this\._sourceBuffer\.remove'
        )

    def test_download_single_track_rate_limit_resilience(self):
        """downloadSingleTrack respects Cloudflare rate limit cooldown and 429 status"""
        self.assertIn("cfBlockedUntil", self.playback_content)
        self.assertIn("Rate limited by Cloudflare - retry in", self.playback_content)

if __name__ == '__main__':
    unittest.main()
