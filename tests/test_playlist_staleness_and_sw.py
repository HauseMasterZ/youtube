import os
import re
import unittest

class TestPlaylistStalenessAndSW(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        cls.sw_path = os.path.join(base_dir, 'sw.js')
        with open(cls.sw_path, 'r', encoding='utf-8') as f:
            cls.sw_content = f.read()

        cls.playback_path = os.path.join(base_dir, 'js', 'playback.js')
        with open(cls.playback_path, 'r', encoding='utf-8') as f:
            cls.playback_content = f.read()

        cls.main_path = os.path.join(base_dir, 'js', 'main.js')
        with open(cls.main_path, 'r', encoding='utf-8') as f:
            cls.main_content = f.read()

        cls.utils_path = os.path.join(base_dir, 'js', 'utils.js')
        with open(cls.utils_path, 'r', encoding='utf-8') as f:
            cls.utils_content = f.read()

        with open(os.path.abspath(__file__), 'r', encoding='utf-8') as f:
            cls.test_content = f.read()

    def test_zero_emojis(self):
        """Strictly zero emojis in sw.js, playback.js, main.js, utils.js, and this test."""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        self.assertEqual(emoji_pattern.findall(self.sw_content), [], "Found emojis in sw.js")
        self.assertEqual(emoji_pattern.findall(self.playback_content), [], "Found emojis in playback.js")
        self.assertEqual(emoji_pattern.findall(self.main_content), [], "Found emojis in main.js")
        self.assertEqual(emoji_pattern.findall(self.utils_content), [], "Found emojis in utils.js")
        self.assertEqual(emoji_pattern.findall(self.test_content), [], "Found emojis in test_playlist_staleness_and_sw.py")

    def test_sw_cache_version_bumped(self):
        """sw.js CACHE_NAME must be bumped to v149 to purge stale caches."""
        self.assertIn("yt-player-cache-v149", self.sw_content)

    def test_sw_database_persistent_cache_whitelist(self):
        """sw.js must define dedicated DB_CACHE and preserve it during cache activation purge."""
        self.assertIn("const DB_CACHE = 'yt-player-databases';", self.sw_content)
        self.assertIn("cacheName !== DB_CACHE", self.sw_content)

    def test_sw_database_swr_strategy(self):
        """sw.js must implement Stale-While-Revalidate with waitUntil for database requests."""
        self.assertIn("event.waitUntil(networkFetch)", self.sw_content)
        self.assertIn("fetch(event.request, { cache: 'no-store' })", self.sw_content)

    def test_sw_database_timeout_race_and_fallback(self):
        """sw.js must use timeout race for cache-busting queries and fallback to dbCache.match."""
        self.assertIn("dbCache.put(cleanUrl", self.sw_content)
        self.assertIn("await dbCache.match(cleanUrl)", self.sw_content)

    def test_utils_indexeddb_and_caching_helpers(self):
        """utils.js must provide IndexedDB mirror and multi-tier persistent caching helpers."""
        self.assertIn("openPlaylistIDB", self.utils_content)
        self.assertIn("savePlaylistToIDB", self.utils_content)
        self.assertIn("getPlaylistFromIDB", self.utils_content)
        self.assertIn("getAllPlaylistsFromIDB", self.utils_content)
        self.assertIn("getCachedPlaylistDatabase", self.utils_content)
        self.assertIn("storePlaylistDatabaseInAllCaches", self.utils_content)
        self.assertIn("seedOfflineDatabases", self.utils_content)

    def test_playback_load_playlist_busts_cache(self):
        """playback.js loadPlaylist must append timestamp and no-store to network fetch."""
        self.assertRegex(
            self.playback_content,
            r'_Playlist_Database\.json\?t=\$\{Date\.now\(\)\}',
            "dbUrl must include ?t=${Date.now()}"
        )
        self.assertIn("fetch(dbUrl, { cache: 'no-store' })", self.playback_content)

    def test_playback_offline_resilience_and_empty_state(self):
        """playback.js must feature actionable offline empty state, timeout race, and multi-tier fallback."""
        self.assertIn("showOfflinePlaylistEmptyState", self.playback_content)
        self.assertIn("retry-playlist-btn", self.playback_content)
        self.assertIn("6500", self.playback_content)
        self.assertIn("getCachedPlaylistDatabase(folderName)", self.playback_content)

    def test_playback_has_robust_change_detection(self):
        """playback.js must define isPlaylistDataIdentical and use it in applyPlaylistData and applyNormalizedDataInChunks."""
        self.assertIn("isPlaylistDataIdentical", self.playback_content)
        self.assertIn("isPlaylistDataIdentical(prevData, normalizedData)", self.playback_content)
        self.assertIn("isPlaylistDataIdentical(prevData, rawData)", self.playback_content)
        self.assertNotIn("i += 50", self.playback_content)

    def test_main_warm_remaining_playlists_busts_cache(self):
        """main.js warmRemainingPlaylists must append timestamp and no-store."""
        self.assertRegex(
            self.main_content,
            r'_Playlist_Database\.json\?t=\$\{Date\.now\(\)\}',
            "warmRemainingPlaylists must include ?t=${Date.now()}"
        )

    def test_main_startup_seeding_and_cache_sync(self):
        """main.js must call seedOfflineDatabases on boot and sync databases to all caches."""
        self.assertIn("seedOfflineDatabases()", self.main_content)
        self.assertIn("storePlaylistDatabaseInAllCaches", self.main_content)

if __name__ == '__main__':
    unittest.main()
