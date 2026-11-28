import os
import re
import unittest
import urllib.parse

class MockResponse:
    def __init__(self, body, status=200, headers=None):
        self.body = body
        self.status = status
        self.ok = (200 <= status < 300)
        self.headers = headers or {}

    def text(self):
        return self.body

    def clone(self):
        return MockResponse(self.body, self.status, dict(self.headers))


class MockCache:
    def __init__(self, name):
        self.name = name
        self.store = {}

    def put(self, request, response):
        url = request if isinstance(request, str) else getattr(request, 'url', str(request))
        self.store[url] = response.clone()

    def match(self, request, options=None):
        url = request if isinstance(request, str) else getattr(request, 'url', str(request))
        ignore_search = bool(options and options.get('ignoreSearch'))

        if not ignore_search:
            res = self.store.get(url)
            return res.clone() if res else None

        req_clean = url.split('?')[0]
        for stored_url, res in self.store.items():
            stored_clean = stored_url.split('?')[0]
            if stored_clean == req_clean:
                return res.clone()
        return None


class MockCacheStorage:
    def __init__(self):
        self.caches = {}

    def open(self, name):
        if name not in self.caches:
            self.caches[name] = MockCache(name)
        return self.caches[name]

    def delete(self, name):
        if name in self.caches:
            del self.caches[name]
            return True
        return False

    def keys(self):
        return list(self.caches.keys())

    def match(self, request, options=None):
        for cache in self.caches.values():
            res = cache.match(request, options)
            if res:
                return res
        return None


def get_lyrics_candidates_sim(track, base_url=""):
    if not track:
        return []
    candidates = []
    seen = set()

    def add_candidate(url):
        if not url or not isinstance(url, str):
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

    if track.get("lyrics_path") and isinstance(track.get("lyrics_path"), str):
        norm_lyr = track["lyrics_path"].replace("\\", "/").lstrip("/")
        if norm_lyr.startswith("http://") or norm_lyr.startswith("https://"):
            add_candidate(norm_lyr)
        else:
            lyr_parts = [p for p in norm_lyr.split("/") if p]
            if len(lyr_parts) > 1:
                encoded_parts = [urllib.parse.quote(p) for p in lyr_parts]
                add_candidate(f"{base_url}/" + "/".join(encoded_parts))
            elif len(lyr_parts) == 1:
                add_candidate(f"{folder_prefix}{urllib.parse.quote(lyr_parts[0])}")

    if track.get("id"):
        tid = str(track["id"])
        add_candidate(f"{folder_prefix}{urllib.parse.quote(tid)}.lrc")
        lower_id = tid.lower()
        if lower_id != tid:
            add_candidate(f"{folder_prefix}{urllib.parse.quote(lower_id)}.lrc")

    if track.get("title"):
        title = str(track["title"])
        add_candidate(f"{folder_prefix}{urllib.parse.quote(title)}.lrc")
        lower_title = title.lower()
        if lower_title != title:
            add_candidate(f"{folder_prefix}{urllib.parse.quote(lower_title)}.lrc")

    return candidates


class TestMobileLyricsAndSWCachingStressChallenger(unittest.TestCase):
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

        with open(__file__, 'r', encoding='utf-8') as f:
            cls.test_file_content = f.read()

    def test_strictly_zero_emojis(self):
        """Verify strictly zero emojis across all relevant files."""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        files = {
            'utils.js': self.utils_content,
            'lyrics.js': self.lyrics_content,
            'sw.js': self.sw_content,
            'playback.js': self.playback_content,
            'test_file': self.test_file_content
        }
        for name, content in files.items():
            matches = emoji_pattern.findall(content)
            self.assertEqual(len(matches), 0, f"Found emoji in {name}: {matches}")

    def test_unix_lf_line_endings(self):
        """Verify all relevant files strictly enforce UNIX LF line endings."""
        file_paths = [
            os.path.join(self.base_dir, 'js', 'utils.js'),
            os.path.join(self.base_dir, 'js', 'lyrics.js'),
            os.path.join(self.base_dir, 'sw.js'),
            os.path.join(self.base_dir, 'js', 'playback.js'),
            __file__
        ]
        for path in file_paths:
            with open(path, 'rb') as f:
                raw_bytes = f.read()
            self.assertNotIn(b'\r\n', raw_bytes, f"Found CRLF in {path}")

    def test_candidate_url_resolution_forward_and_backslashes(self):
        """Stress-test explicit lyrics_path with forward slashes, backslashes, mixed slashes, and external URLs."""
        # Forward slashes
        t1 = {
            "file_path": "Hindi/Ek Baar.webm",
            "lyrics_path": "Hindi/lyrics/Ek Baar.lrc",
            "id": "ek_baar_id",
            "title": "Ek Baar"
        }
        cands1 = get_lyrics_candidates_sim(t1)
        self.assertEqual(cands1[0], "/Hindi/lyrics/Ek%20Baar.lrc")

        # Windows backslashes
        t2 = {
            "file_path": "Hindi\\Ek Baar.webm",
            "lyrics_path": "Hindi\\lyrics\\Ek Baar.lrc",
            "id": "ek_baar_id",
            "title": "Ek Baar"
        }
        cands2 = get_lyrics_candidates_sim(t2)
        self.assertEqual(cands2[0], "/Hindi/lyrics/Ek%20Baar.lrc")

        # Mixed slashes and leading backslashes
        t3 = {
            "file_path": "\\Hindi\\sub\\Ek Baar.webm",
            "lyrics_path": "\\Hindi/lyrics\\Ek Baar.lrc",
            "id": "ek_baar_id",
            "title": "Ek Baar"
        }
        cands3 = get_lyrics_candidates_sim(t3)
        self.assertEqual(cands3[0], "/Hindi/lyrics/Ek%20Baar.lrc")

        # Relative single-file lyrics_path inheriting folderPrefix
        t4 = {
            "file_path": "Hindi/Ek Baar.webm",
            "lyrics_path": "Ek Baar.lrc",
            "id": "ek_baar_id",
            "title": "Ek Baar"
        }
        cands4 = get_lyrics_candidates_sim(t4)
        self.assertEqual(cands4[0], "/Hindi/lyrics/Ek%20Baar.lrc")

        # Absolute external HTTP/HTTPS URLs
        t5 = {
            "file_path": "Hindi/Ek Baar.webm",
            "lyrics_path": "https://cdn.example.com/lyrics/ek_baar.lrc",
            "id": "ek_baar_id",
            "title": "Ek Baar"
        }
        cands5 = get_lyrics_candidates_sim(t5)
        self.assertEqual(cands5[0], "https://cdn.example.com/lyrics/ek_baar.lrc")

    def test_candidate_url_resolution_casing_and_special_characters(self):
        """Stress-test casing differences ('Ek Baar' vs 'ek baar') and special characters without lyrics_path."""
        # Mixed-case title 'Ek Baar'
        t1 = {
            "file_path": "Hindi/Ek Baar.webm",
            "id": "ek_baar_id",
            "title": "Ek Baar"
        }
        cands1 = get_lyrics_candidates_sim(t1)
        self.assertIn("/Hindi/lyrics/ek_baar_id.lrc", cands1)
        self.assertIn("/Hindi/lyrics/Ek%20Baar.lrc", cands1)
        self.assertIn("/Hindi/lyrics/ek%20baar.lrc", cands1)
        # Ensure exact title is tried before lowercase fallback
        self.assertLess(cands1.index("/Hindi/lyrics/Ek%20Baar.lrc"), cands1.index("/Hindi/lyrics/ek%20baar.lrc"))

        # Lowercase title should not duplicate
        t2 = {
            "file_path": "Hindi/Ek Baar.webm",
            "id": "ek_baar_id",
            "title": "ek baar"
        }
        cands2 = get_lyrics_candidates_sim(t2)
        count_lower = cands2.count("/Hindi/lyrics/ek%20baar.lrc")
        self.assertEqual(count_lower, 1)

        # Special characters: ampersand, hash, brackets, plus
        t3 = {
            "file_path": "Hindi/Special.webm",
            "id": "spec_123",
            "title": "Ek Baar & Kabhi Kabhie (Live) [Remix] #1 + Bonus"
        }
        cands3 = get_lyrics_candidates_sim(t3)
        encoded_title = urllib.parse.quote("Ek Baar & Kabhi Kabhie (Live) [Remix] #1 + Bonus")
        self.assertIn(f"/Hindi/lyrics/{encoded_title}.lrc", cands3)

        # Unicode characters (Devanagari)
        t4 = {
            "file_path": "Hindi/Devanagari.webm",
            "id": "dev_123",
            "title": "एक बार"
        }
        cands4 = get_lyrics_candidates_sim(t4)
        encoded_dev = urllib.parse.quote("एक बार")
        self.assertIn(f"/Hindi/lyrics/{encoded_dev}.lrc", cands4)

        # ID equals title deduplication
        t5 = {
            "file_path": "Hindi/Duplicate.webm",
            "id": "Ek Baar",
            "title": "Ek Baar"
        }
        cands5 = get_lyrics_candidates_sim(t5)
        self.assertEqual(len(cands5), len(set(cands5)))

    def test_candidate_url_resolution_empty_missing_and_unusual_structures(self):
        """Stress-test edge cases: empty titles, missing file_path, None track, and malformed inputs."""
        # None and empty track
        self.assertEqual(get_lyrics_candidates_sim(None), [])
        self.assertEqual(get_lyrics_candidates_sim({}), [])
        self.assertEqual(get_lyrics_candidates_sim({"file_path": ""}), [])

        # Missing file_path with valid ID and Title
        t1 = {
            "id": "track_123",
            "title": "Ek Baar"
        }
        cands1 = get_lyrics_candidates_sim(t1)
        self.assertIn("/lyrics/track_123.lrc", cands1)
        self.assertIn("/lyrics/Ek%20Baar.lrc", cands1)
        self.assertIn("/lyrics/ek%20baar.lrc", cands1)

        # Empty strings everywhere
        t2 = {"file_path": "", "id": "", "title": "", "lyrics_path": ""}
        self.assertEqual(get_lyrics_candidates_sim(t2), [])

        # Deeply nested file_path
        t3 = {
            "file_path": "Soundtracks/2024/Hindi/Film/Ek Baar.webm",
            "id": "deep_123",
            "title": "Ek Baar"
        }
        cands3 = get_lyrics_candidates_sim(t3)
        self.assertTrue(cands3[0].startswith("/Soundtracks/lyrics/"))

        # Non-string lyrics_path
        t4 = {
            "file_path": "Hindi/Ek Baar.webm",
            "id": "ek_baar_id",
            "title": "Ek Baar",
            "lyrics_path": 12345
        }
        cands4 = get_lyrics_candidates_sim(t4)
        self.assertNotIn(12345, cands4)
        self.assertIn("/Hindi/lyrics/ek_baar_id.lrc", cands4)

    def test_sw_cache_routing_to_yt_player_media(self):
        """Simulate Service Worker routing for lyrics and verify storage in yt-player-media."""
        cs = MockCacheStorage()

        def sw_fetch_handler(url, status=200, body=""):
            # Check route in sw.js
            if '/lyrics/' in url or '.lrc' in url:
                resp = MockResponse(body, status=status)
                if resp.ok and resp.status != 429:
                    media_cache = cs.open('yt-player-media')
                    media_cache.put(url, resp.clone())
                return resp
            return MockResponse("", status=404)

        # 200 OK lyrics request cached in yt-player-media
        res1 = sw_fetch_handler("https://host/Hindi/lyrics/Ek%20Baar.lrc?v=155", status=200, body="[00:01.00] Ek Baar")
        self.assertTrue(res1.ok)
        media_cache = cs.open('yt-player-media')
        self.assertIn("https://host/Hindi/lyrics/Ek%20Baar.lrc?v=155", media_cache.store)

        # 429 Too Many Requests response NOT cached
        sw_fetch_handler("https://host/Hindi/lyrics/RateLimited.lrc", status=429, body="Rate limited")
        self.assertNotIn("https://host/Hindi/lyrics/RateLimited.lrc", media_cache.store)

        # 404 Not Found response NOT cached
        sw_fetch_handler("https://host/Hindi/lyrics/NotFound.lrc", status=404, body="Not found")
        self.assertNotIn("https://host/Hindi/lyrics/NotFound.lrc", media_cache.store)

    def test_sw_cache_persistence_across_app_shell_updates(self):
        """Verify yt-player-media is in whitelist and survives cache purge during Service Worker activation."""
        cs = MockCacheStorage()
        media_cache = cs.open('yt-player-media')
        media_cache.put("https://host/Hindi/lyrics/Ek%20Baar.lrc", MockResponse("[00:01.00] Lyrics"))

        old_cache = cs.open('yt-player-cache-dev-build100')
        old_cache.put("https://host/bundle.min.js", MockResponse("console.log('old');"))

        # Activation logic in sw.js:
        active_cache_name = 'yt-player-cache-dev-build101'
        thumbs_cache = 'thumbs-cache'
        shell_cache = 'shell-cache'

        for cname in list(cs.keys()):
            if cname != active_cache_name and cname != 'yt-player-media' and cname != thumbs_cache and cname != shell_cache:
                cs.delete(cname)

        # yt-player-media must survive, while old cache must be deleted
        self.assertIn('yt-player-media', cs.keys())
        self.assertNotIn('yt-player-cache-dev-build100', cs.keys())
        persisted = cs.open('yt-player-media').match("https://host/Hindi/lyrics/Ek%20Baar.lrc")
        self.assertIsNotNone(persisted)
        self.assertEqual(persisted.text(), "[00:01.00] Lyrics")

    def test_ignore_search_matching_with_query_strings(self):
        """Stress-test ignoreSearch matching with ?v=155, clean URLs, and mismatched parameters."""
        cache = MockCache('yt-player-media')

        # Cached with clean URL (e.g. downloaded offline via playback.js)
        cache.put("https://host/Hindi/lyrics/Ek%20Baar.lrc", MockResponse("[00:01.00] Clean URL cached"))

        # Match with ?v=155
        m1 = cache.match("https://host/Hindi/lyrics/Ek%20Baar.lrc?v=155", {"ignoreSearch": True})
        self.assertIsNotNone(m1)
        self.assertEqual(m1.text(), "[00:01.00] Clean URL cached")

        # Match with timestamp ?t=99999
        m2 = cache.match("https://host/Hindi/lyrics/Ek%20Baar.lrc?t=99999", {"ignoreSearch": True})
        self.assertIsNotNone(m2)
        self.assertEqual(m2.text(), "[00:01.00] Clean URL cached")

        # Cached with ?v=155 (e.g. cached during online play)
        cache.put("https://host/Hindi/lyrics/ek_baar_id.lrc?v=155", MockResponse("[00:01.00] Query URL cached"))

        # Match with clean URL
        m3 = cache.match("https://host/Hindi/lyrics/ek_baar_id.lrc", {"ignoreSearch": True})
        self.assertIsNotNone(m3)
        self.assertEqual(m3.text(), "[00:01.00] Query URL cached")

        # Match with different query parameter ?v=156
        m4 = cache.match("https://host/Hindi/lyrics/ek_baar_id.lrc?v=156", {"ignoreSearch": True})
        self.assertIsNotNone(m4)
        self.assertEqual(m4.text(), "[00:01.00] Query URL cached")

        # Negative test: Different track must not match
        m5 = cache.match("https://host/Hindi/lyrics/Different_Track.lrc?v=155", {"ignoreSearch": True})
        self.assertIsNone(m5)

    def test_lyrics_js_dual_layer_offline_fallback(self):
        """Simulate lyrics.js candidate iteration and CacheStorage fallback."""
        cs = MockCacheStorage()
        media_cache = cs.open('yt-player-media')

        # Store offline lyrics for the title candidate under clean URL
        media_cache.put("https://host/Hindi/lyrics/Ek%20Baar.lrc", MockResponse("[00:05.00] Simulated Offline Lyrics"))

        track = {
            "file_path": "Hindi/Ek Baar.webm",
            "id": "ek_baar_id",
            "title": "Ek Baar"
        }
        candidates = get_lyrics_candidates_sim(track, base_url="https://host")

        # Simulation of network failure and cache fallback in lyrics.js
        text = None
        matched_url = None

        # Network fails for all candidates
        # Fallback to mediaCache:
        for cand in candidates:
            cached = media_cache.match(cand, {"ignoreSearch": True})
            if not cached:
                cached = media_cache.match(f"{cand}?v=155", {"ignoreSearch": True})
            if cached and cached.ok:
                t = cached.text()
                if t and len(t.strip()) > 0:
                    text = t
                    matched_url = cand
                    break

        self.assertIsNotNone(text)
        self.assertEqual(text, "[00:05.00] Simulated Offline Lyrics")
        self.assertEqual(matched_url, "https://host/Hindi/lyrics/Ek%20Baar.lrc")

    def test_playback_js_download_dual_url_caching(self):
        """Simulate playback.js caching candidate under both candUrl and lyricsUrl in yt-player-media."""
        cs = MockCacheStorage()
        media_cache = cs.open('yt-player-media')

        track = {
            "file_path": "Hindi/Ek Baar.webm",
            "id": "ek_baar_id",
            "title": "Ek Baar"
        }
        candidates = get_lyrics_candidates_sim(track, base_url="https://host")
        lyrics_url = "https://host/Hindi/lyrics/ek_baar_id.lrc"
        if lyrics_url not in candidates:
            candidates.insert(0, lyrics_url)

        # Suppose candidate 'Ek Baar.lrc' is the one that exists on server
        server_store = {
            "https://host/Hindi/lyrics/Ek%20Baar.lrc": MockResponse("[00:10.00] Dual cached lyrics")
        }

        # Simulated download logic from playback.js:
        for cand in candidates:
            if cand in server_store:
                resp = server_store[cand]
                media_cache.put(cand, resp.clone())
                media_cache.put(lyrics_url, resp.clone())
                break

        # Verify cached under both URLs
        res_cand = media_cache.match("https://host/Hindi/lyrics/Ek%20Baar.lrc", {"ignoreSearch": True})
        res_id = media_cache.match("https://host/Hindi/lyrics/ek_baar_id.lrc", {"ignoreSearch": True})
        self.assertIsNotNone(res_cand)
        self.assertIsNotNone(res_id)
        self.assertEqual(res_cand.text(), "[00:10.00] Dual cached lyrics")
        self.assertEqual(res_id.text(), "[00:10.00] Dual cached lyrics")

    def test_static_contract_invariants(self):
        """Verify AST and regex invariants across utils.js, lyrics.js, sw.js, and playback.js."""
        # utils.js exports getLyricsCandidates
        self.assertRegex(self.utils_content, r'function\s+getLyricsCandidates\s*\(\s*track\s*\)')
        self.assertIn('window.getLyricsCandidates = getLyricsCandidates;', self.utils_content)

        # lyrics.js candidate retrieval and fallback
        self.assertIn('getLyricsCandidates(track)', self.lyrics_content)
        self.assertIn("caches.open('yt-player-media')", self.lyrics_content)
        self.assertIn('ignoreSearch: true', self.lyrics_content)

        # sw.js routes .lrc and /lyrics/ to yt-player-media with ignoreSearch: true
        self.assertRegex(self.sw_content, r'event\.request\.url\.includes\([\'"]/lyrics/[\'"]\)\s*\|\|\s*event\.request\.url\.includes\([\'"]\.lrc[\'"]\)')
        self.assertIn("caches.open('yt-player-media').then(cache => cache.put(event.request, clone))", self.sw_content)
        self.assertIn("cache.match(event.request, { ignoreSearch: true })", self.sw_content)

        # playback.js path normalization and caching
        self.assertIn(r".replace(/\\/g, '/')", self.playback_content)
        self.assertIn("mediaCache.put(lyricsUrl", self.playback_content)

if __name__ == '__main__':
    unittest.main()
