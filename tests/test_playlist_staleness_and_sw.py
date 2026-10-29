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

        worker_path = os.path.join(os.path.dirname(base_dir), 'alwaysdata-pi-setup', 'cloudflare_worker', 'worker.js')
        if os.path.exists(worker_path):
            with open(worker_path, 'r', encoding='utf-8') as f:
                cls.worker_content = f.read()
        else:
            cls.worker_content = ""

    def test_zero_emojis(self):
        """Strictly zero emojis in sw.js, playback.js, main.js, utils.js, worker.js, and this test."""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        self.assertEqual(emoji_pattern.findall(self.sw_content), [], "Found emojis in sw.js")
        self.assertEqual(emoji_pattern.findall(self.playback_content), [], "Found emojis in playback.js")
        self.assertEqual(emoji_pattern.findall(self.main_content), [], "Found emojis in main.js")
        self.assertEqual(emoji_pattern.findall(self.utils_content), [], "Found emojis in utils.js")
        if self.worker_content:
            self.assertEqual(emoji_pattern.findall(self.worker_content), [], "Found emojis in worker.js")
        self.assertEqual(emoji_pattern.findall(self.test_content), [], "Found emojis in test_playlist_staleness_and_sw.py")

    def test_sw_cache_version_bumped(self):
        """sw.js CACHE_NAME must be bumped to v150 to purge stale caches."""
        self.assertIn("yt-player-cache-v150", self.sw_content)

    def test_sw_thumbnail_swr_strategy(self):
        """sw.js must implement Stale-While-Revalidate for thumbnails."""
        self.assertIn("event.waitUntil(revalidatePromise)", self.sw_content)
        self.assertIn("cache.put(event.request.url, response.clone())", self.sw_content)

    def test_utils_thumbnail_cache_busting(self):
        """utils.js getThumbUrl must append color-derived cache-busting query parameter."""
        self.assertIn("const colorKey = track.color ? String(track.color).replace('#', '').trim() : '';", self.utils_content)
        self.assertIn("?v=${encodeURIComponent(colorKey)}", self.utils_content)

    def test_worker_thumbnail_revalidation_headers(self):
        """worker.js must serve webp thumbnails with revalidation headers and exclude from immutable extensions."""
        if not self.worker_content:
            return
        self.assertIn("const IMMUTABLE_MEDIA_EXTENSIONS = /\\.(webm|opus|m4a|aac|lrc)$/i;", self.worker_content)
        self.assertNotIn("webp", "webm|opus|m4a|aac|lrc")
        self.assertIn("const isThumbnail = /\\.webp$/i.test(cleanPath);", self.worker_content)
        self.assertIn('"public, max-age=86400, stale-while-revalidate=604800"', self.worker_content)

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
        self.assertIn("12000", self.playback_content)
        self.assertIn("getCachedPlaylistDatabase(folderName)", self.playback_content)

    def test_utils_base_url_trimmed(self):
        """utils.js baseUrl must be trimmed to avoid leading-whitespace URL corruption."""
        self.assertIn('("__API_GATEWAY_URL__" || "").trim().replace', self.utils_content)

    def test_sw_database_timeout_headroom(self):
        """sw.js must use 12000ms timeout for database requests to accommodate wearable proxies."""
        self.assertIn("setTimeout(() => controller.abort(), 12000)", self.sw_content)

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

    def test_sw_message_listener_skip_waiting_and_purge(self):
        """sw.js must listen for message events and handle SKIP_WAITING and PURGE_STATIC_CACHE."""
        self.assertIn("self.addEventListener('message'", self.sw_content)
        self.assertIn("event.data.type === 'SKIP_WAITING'", self.sw_content)
        self.assertIn("self.skipWaiting()", self.sw_content)
        self.assertIn("event.data.type === 'PURGE_STATIC_CACHE'", self.sw_content)
        self.assertIn("k.startsWith('yt-player-cache')", self.sw_content)

    def test_sw_navigation_bypasses_cache_on_forced_update(self):
        """sw.js navigation fallback must bypass cache when cache-busting v parameter is present."""
        self.assertIn("navUrl.searchParams.has('v')", self.sw_content)
        self.assertRegex(
            self.sw_content,
            r'if\s*\(\s*navUrl\.searchParams\.has\([\'"]v[\'"]\)\s*\)\s*\{[\s\S]*?fetch\(event\.request\)'
        )

    def test_sw_navigation_rate_limit_fallback(self):
        """sw.js must validate response status and content-type, falling back to cached shell on 429/Error 1015."""
        self.assertIn("response.ok && contentType.includes('text/html')", self.sw_content)
        self.assertIn("caches.match('./', { ignoreSearch: true })", self.sw_content)
        self.assertIn("caches.match('./index.html', { ignoreSearch: true })", self.sw_content)

    def test_sw_purge_static_cache_avoids_network_flood(self):
        """sw.js PURGE_STATIC_CACHE must delete stale caches without firing parallel reload floods."""
        self.assertNotIn("fetch(asset, { cache: 'reload' })", self.sw_content)

    def test_main_purge_preserves_active_cache(self):
        """main.js executeSitePurgeAndReload must preserve active build caches to avoid blank-screen on rate limit."""
        self.assertIn("key !== 'yt-player-cache-v150'", self.main_content)
        self.assertIn("!key.includes('-main-')", self.main_content)
        self.assertIn("!key.includes('-dev-')", self.main_content)
        self.assertIn("key !== 'yt-player-shell-v1'", self.main_content)

    def test_sw_dedicated_shell_cache(self):
        """sw.js must define and preserve immutable SHELL_CACHE to guarantee zero error screen exposure."""
        self.assertIn("const SHELL_CACHE = 'yt-player-shell-v1';", self.sw_content)
        self.assertIn("cacheName !== SHELL_CACHE", self.sw_content)
        self.assertIn("ignoreSearch: true", self.sw_content)

    def test_apply_normalized_data_captures_target_track_id_early(self):
        """applyNormalizedDataInChunks must capture targetTrackId before chunk slicing and filter with isValidTrackItem."""
        self.assertIn("let capturedTargetTrackId = null;", self.playback_content)
        self.assertIn("const validRawData = (typeof isValidTrackItem === 'function') ? rawData.filter(isValidTrackItem) : rawData;", self.playback_content)
        self.assertIn("targetTrackId = capturedTargetTrackId;", self.playback_content)

    def test_store_playlist_database_filters_invalid_items(self):
        """storePlaylistDatabaseInAllCaches must filter invalid items before saving to IndexedDB and Cache API."""
        self.assertIn("const validData = rawData.filter(isValidTrackItem);", self.utils_content)
        self.assertIn("savePlaylistToIDB(folderName, validData);", self.utils_content)
        self.assertIn("JSON.stringify(validData)", self.utils_content)
        self.assertIn("window.isValidTrackItem = isValidTrackItem;", self.utils_content)

    def test_is_valid_track_item_rejects_zero_duration_skeletons(self):
        """isValidTrackItem must reject unverified zero duration and suspected dead items without media."""
        self.assertIn("function isZeroOrInvalidDuration(dur)", self.utils_content)
        self.assertIn("if (isZeroOrInvalidDuration(item.duration)) return false;", self.utils_content)
        self.assertIn("if (isZeroOrInvalidDuration(item[3])) return false;", self.utils_content)
        self.assertIn("if (item.lifecycle_status === 'suspected_dead' && !item.file_path && !item.audio_path) return false;", self.utils_content)

if __name__ == '__main__':
    unittest.main()

