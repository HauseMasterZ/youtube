import os
import re
import unittest
import urllib.parse

class TestMobileLyricsAndMediaSessionHardening(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        cls.base_dir = base_dir

        with open(os.path.join(base_dir, 'js', 'utils.js'), 'r', encoding='utf-8') as f:
            cls.utils_content = f.read()

        with open(os.path.join(base_dir, 'js', 'lyrics.js'), 'r', encoding='utf-8') as f:
            cls.lyrics_content = f.read()

        with open(os.path.join(base_dir, 'sw.js'), 'r', encoding='utf-8') as f:
            cls.sw_content = f.read()

        with open(os.path.join(base_dir, 'js', 'playback.js'), 'r', encoding='utf-8') as f:
            cls.playback_content = f.read()

        with open(os.path.join(base_dir, 'js', 'mediaSession.js'), 'r', encoding='utf-8') as f:
            cls.ms_content = f.read()

        with open(os.path.join(base_dir, 'js', 'main.js'), 'r', encoding='utf-8') as f:
            cls.main_content = f.read()

        with open(__file__, 'r', encoding='utf-8') as f:
            cls.test_file_content = f.read()

    def test_strictly_zero_emojis(self):
        """Verify strictly zero emojis across all checked files."""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        files = {
            'utils.js': self.utils_content,
            'lyrics.js': self.lyrics_content,
            'sw.js': self.sw_content,
            'playback.js': self.playback_content,
            'mediaSession.js': self.ms_content,
            'main.js': self.main_content,
            'test_mobile_lyrics_and_media_session_hardening.py': self.test_file_content
        }
        for name, content in files.items():
            matches = emoji_pattern.findall(content)
            self.assertEqual(len(matches), 0, f"Found emoji in {name}: {matches}")

    def test_get_lyrics_candidates_in_utils_and_window_export(self):
        """utils.js defines getLyricsCandidates and exports to window.getLyricsCandidates"""
        self.assertRegex(
            self.utils_content,
            r'function\s+getLyricsCandidates\s*\(\s*track\s*\)\s*\{'
        )
        self.assertIn('window.getLyricsCandidates = getLyricsCandidates;', self.utils_content)

    def test_get_lyrics_candidates_implementation_details(self):
        """getLyricsCandidates normalizes backslashes, checks lyrics_path, id, title, and lowercase variants"""
        self.assertIn(r".replace(/\\/g, '/')", self.utils_content)
        self.assertIn('track.lyrics_path', self.utils_content)
        self.assertIn('track.id', self.utils_content)
        self.assertIn('track.title', self.utils_content)
        self.assertIn('toLowerCase()', self.utils_content)

    def test_lyrics_candidate_resolution_simulation(self):
        """Simulate getLyricsCandidates logic in Python for 'Ek Baar' and verify candidate generation"""
        def get_candidates(track, base_url=""):
            if not track:
                return []
            candidates = []
            seen = set()

            def add_candidate(url):
                if not url:
                    return
                trimmed = url.strip()
                if not trimmed or trimmed in seen:
                    return
                seen.add(trimmed)
                candidates.append(trimmed)

            raw_path = (track.get("file_path") or "").replace("\\", "/")
            parts = [p for p in raw_path.split("/") if p]
            folder = parts[0] if parts else ""
            folder_prefix = f"{base_url}/{urllib.parse.quote(folder)}/lyrics/" if folder else f"{base_url}/lyrics/"

            if track.get("lyrics_path"):
                norm_lyr = track["lyrics_path"].replace("\\", "/").lstrip("/")
                if norm_lyr.startswith("http://") or norm_lyr.startswith("https://"):
                    add_candidate(norm_lyr)
                else:
                    lyr_parts = [p for p in norm_lyr.split("/") if p]
                    if len(lyr_parts) > 1:
                        encoded = "/".join(urllib.parse.quote(p) for p in lyr_parts)
                        add_candidate(f"{base_url}/{encoded}")
                    elif len(lyr_parts) == 1:
                        add_candidate(f"{folder_prefix}{urllib.parse.quote(lyr_parts[0])}")

            track_id = track.get("id")
            if track_id:
                add_candidate(f"{folder_prefix}{urllib.parse.quote(track_id)}.lrc")
                lower_id = track_id.lower()
                if lower_id != track_id:
                    add_candidate(f"{folder_prefix}{urllib.parse.quote(lower_id)}.lrc")

            track_title = track.get("title")
            if track_title:
                add_candidate(f"{folder_prefix}{urllib.parse.quote(track_title)}.lrc")
                lower_title = track_title.lower()
                if lower_title != track_title:
                    add_candidate(f"{folder_prefix}{urllib.parse.quote(lower_title)}.lrc")

            return candidates

        track_ek_baar = {
            "file_path": "Hindi\\Ek Baar.webm",
            "id": "ek_baar_id",
            "title": "Ek Baar"
        }
        cands = get_candidates(track_ek_baar)
        self.assertIn("/Hindi/lyrics/ek_baar_id.lrc", cands)
        self.assertIn("/Hindi/lyrics/Ek%20Baar.lrc", cands)
        self.assertIn("/Hindi/lyrics/ek%20baar.lrc", cands)

        # Explicit lyrics_path takes priority
        track_with_lyrics_path = {
            "file_path": "Hindi/Ek Baar.webm",
            "id": "ek_baar_id",
            "title": "Ek Baar",
            "lyrics_path": "Hindi/lyrics/custom_ek_baar.lrc"
        }
        cands2 = get_candidates(track_with_lyrics_path)
        self.assertEqual(cands2[0], "/Hindi/lyrics/custom_ek_baar.lrc")

    def test_lyrics_js_loads_candidates_and_cache_fallback(self):
        """lyrics.js iterates candidates, queries yt-player-media with ignoreSearch, and preserves cache-bust"""
        self.assertIn('getLyricsCandidates(track)', self.lyrics_content)
        self.assertIn("caches.open('yt-player-media')", self.lyrics_content)
        self.assertIn('ignoreSearch: true', self.lyrics_content)
        self.assertIn('lyricsUrl}?v=155', self.lyrics_content)
        self.assertIn('Relient K', self.lyrics_content)
        self.assertIn('Kick-Off', self.lyrics_content)

    def test_service_worker_lrc_routing_and_ignore_search(self):
        """sw.js routes .lrc requests to 'yt-player-media' with { ignoreSearch: true }"""
        self.assertRegex(
            self.sw_content,
            r'if\s*\(\s*event\.request\.url\.includes\([\'"]/lyrics/[\'"]\)\s*\|\|\s*event\.request\.url\.includes\([\'"]\.lrc[\'"]\)\s*\)\s*\{'
        )
        self.assertIn("caches.open('yt-player-media').then(cache => cache.put(event.request, clone));", self.sw_content)
        self.assertIn("cache.match(event.request, { ignoreSearch: true })", self.sw_content)

    def test_playback_js_lyrics_caching_and_path_normalization(self):
        """playback.js normalizes backslashes with .replace(/\\\\/g, '/') and preserves mediaCache.put(lyricsUrl"""
        self.assertIn(r".replace(/\\/g, '/')", self.playback_content)
        self.assertIn('mediaCache.put(lyricsUrl, res', self.playback_content)
        self.assertIn('mediaCache.put(lyricsUrl, lRes', self.playback_content)

    def test_media_session_force_bypass_projection(self):
        """mediaSession.js guards projection coercion with !forceBypass"""
        self.assertRegex(
            self.ms_content,
            r'if\s*\(!forceBypass\s*&&\s*!isPaused\s*&&\s*!isSeeking\s*&&\s*!isBuffering\s*&&\s*validRate\s*===\s*1\.0\s*&&\s*_lastSentPosition\s*>=\s*0\)'
        )

    def test_anchor_auto_resume_bound_on_fresh_init(self):
        """initLiveAudioAnchor unconditionally binds _setupAnchorAutoResume(anchorEl) on fresh initialization"""
        self.assertRegex(
            self.ms_content,
            r'const\s+anchorEl\s*=\s*document\.getElementById\([\'"]live-stream-anchor[\'"]\);\s*if\s*\(anchorEl\)\s*\{\s*_setupAnchorAutoResume\(anchorEl\);'
        )

    def test_pointerdown_gesture_priming_in_main_js(self):
        """main.js wires pointerdown priming on trackList and btnPlayPause in Mode 2"""
        self.assertRegex(
            self.main_content,
            r'trackList\.addEventListener\([\'"]pointerdown[\'"],\s*\(\)\s*=>\s*\{[\s\S]*?if\s*\(window\.playbackMode\s*===\s*[\'"]mode2[\'"]\)[\s\S]*?initLiveAudioAnchor\(\);[\s\S]*?startLiveAudioAnchor\(\);'
        )
        self.assertRegex(
            self.main_content,
            r'btnPlayPause\.addEventListener\([\'"]pointerdown[\'"],\s*\(\)\s*=>\s*\{[\s\S]*?if\s*\(window\.playbackMode\s*===\s*[\'"]mode2[\'"]\)[\s\S]*?initLiveAudioAnchor\(\);[\s\S]*?!audioPlayer\.src\s*&&\s*typeof\s+startLiveAudioAnchor'
        )
        self.assertRegex(
            self.main_content,
            r'if\s*\(!audioPlayer\.src\)\s*\{[\s\S]*?if\s*\(window\.playbackMode\s*===\s*[\'"]mode2[\'"]\)[\s\S]*?initLiveAudioAnchor\(\);[\s\S]*?startLiveAudioAnchor\(\);'
        )

    def test_device_unlock_resync_and_timeupdate_wake(self):
        """resyncMediaSessionOnForeground and timeupdate wake gap force rate 1.0 position updates"""
        self.assertIn("resyncMediaSessionOnForeground('unlock-playing')", self.main_content)
        self.assertIn("resyncMediaSessionOnForeground('unlock-mode2-paused')", self.main_content)
        self.assertRegex(
            self.main_content,
            r'staleGap\s*&&\s*!audioPlayer\.paused[\s\S]*?window\._forceNextPosition\s*=\s*true;[\s\S]*?updateMediaSessionPosition\(ct,\s*dur,\s*1\.0,\s*true\);'
        )

if __name__ == '__main__':
    unittest.main()
