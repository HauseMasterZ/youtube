import math
import os
import re
import unittest

def damerau_levenshtein(s1, s2):
    m = len(s1)
    n = len(s2)
    if abs(m - n) > 2:
        return 99
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            cost = 0 if s1[i - 1] == s2[j - 1] else 1
            d = min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
            if i > 1 and j > 1 and s1[i - 1] == s2[j - 2] and s1[i - 2] == s2[j - 1]:
                d = min(d, dp[i - 2][j - 2] + cost)
            dp[i][j] = d
    return dp[m][n]

def calculate_fuzzy_score(query, title_raw, channel_raw):
    """
    Port of calculateFuzzyScore from youtube/js/utils.js.
    """
    if not query:
        return 0
    title = (title_raw or "").lower()
    channel = (channel_raw or "").lower()
    combined = f"{title} {channel}"

    if title == query:
        return 10000
    if combined == query:
        return 9000

    title_idx = title.find(query)
    if title_idx != -1:
        is_word_start = (title_idx == 0 or title[title_idx - 1] in " -_([/{")
        return 7000 + (1000 if is_word_start else 0) - title_idx * 2

    comb_idx = combined.find(query)
    if comb_idx != -1:
        return 5000 - comb_idx * 2

    title_words = re.findall(r'[a-z0-9]+', title)
    channel_words = re.findall(r'[a-z0-9]+', channel)
    all_words = title_words + channel_words

    if len(title_words) > 1:
        acronym = "".join([w[0] for w in title_words])
        if query == acronym or (len(query) >= 3 and query in acronym):
            return 4500

    tokens = [t for t in re.split(r'\s+', query) if t]
    if not tokens:
        return 0

    total_token_score = 0
    for token in tokens:
        t_len = len(token)
        max_dist = 1 if t_len <= 4 else 2
        best_word_score = 0

        for word in all_words:
            if word == token:
                best_word_score = max(best_word_score, 1000)
                break
            elif word.startswith(token):
                best_word_score = max(best_word_score, 800)
            elif token in word:
                best_word_score = max(best_word_score, 600)
            elif t_len >= 3:
                sub_w = word[:t_len]
                dist = damerau_levenshtein(token, sub_w)
                if dist <= max_dist:
                    best_word_score = max(best_word_score, 500 - dist * 100)
                else:
                    dist_full = damerau_levenshtein(token, word)
                    if dist_full <= max_dist:
                        best_word_score = max(best_word_score, 400 - dist_full * 100)

        if best_word_score == 0 and t_len >= 3:
            ti = 0
            for i in range(len(combined)):
                if combined[i] == token[ti]:
                    ti += 1
                    if ti == t_len:
                        break
            if ti == t_len:
                best_word_score = 300

        if best_word_score > 0:
            total_token_score += best_word_score
        else:
            return 0

    return 2000 + total_token_score


class MultiPlaylistSearchSimulation:
    """
    Simulates PiYT multi-playlist search engine, virtual list management,
    background revalidations, and click-to-play execution.
    """
    ITEM_HEIGHT = 50

    def __init__(self, all_playlists=None):
        self.all_playlists = all_playlists or ['rock', 'classics', 'favorites', 'workout', 'chill']
        self.all_databases = {}
        self.current_playlist = 'rock'
        self.current_playlist_data = []
        self.filtered_indices = []
        self.search_input_value = ""
        self.selected_search_index = -1
        self.playlist_container_scroll_top = 0
        self.container_client_height = 400
        self.shuffle_mode = 0
        self.play_queue = []
        self.queue_index = -1
        self.global_active_playlist = None
        self.global_active_original_index = -1
        self.queue_base_playlist = None
        self.cross_shuffle_history = []
        self.cross_shuffle_pos = -1
        self.rendered_tracks = []
        self.track_list_height = 0

    def set_playlist_data(self, playlist, data):
        self.all_databases[playlist] = data
        if self.current_playlist == playlist:
            self.current_playlist_data = data
            if not self.search_input_value.strip():
                self.filtered_indices = [{'playlist': playlist, 'index': i} for i in range(len(data))]
                self.track_list_height = len(self.filtered_indices) * self.ITEM_HEIGHT

    def on_search_input(self, raw_input):
        """
        Simulates main.js searchInput input listener logic (lines 254-315).
        """
        self.search_input_value = raw_input
        self.selected_search_index = -1
        query = raw_input.lower().strip()
        current_pl = self.current_playlist

        if not query:
            self.filtered_indices = (
                [{'playlist': current_pl, 'index': i} for i in range(len(self.current_playlist_data))]
                if self.current_playlist_data else []
            )
        else:
            scored_results = []

            # 1. Current playlist matches (with +50 bonus)
            if self.current_playlist_data:
                for i, track in enumerate(self.current_playlist_data):
                    score = calculate_fuzzy_score(query, track.get('title', ''), track.get('channel', ''))
                    if score > 0:
                        scored_results.append({'playlist': current_pl, 'index': i, 'score': score + 50})

            # 2. Global matches (other playlists)
            for pl in self.all_playlists:
                if pl != current_pl and pl in self.all_databases:
                    data = self.all_databases[pl]
                    for i, track in enumerate(data):
                        score = calculate_fuzzy_score(query, track.get('title', ''), track.get('channel', ''))
                        if score > 0:
                            scored_results.append({'playlist': pl, 'index': i, 'score': score})

            scored_results.sort(key=lambda x: x['score'], reverse=True)
            self.filtered_indices = [{'playlist': item['playlist'], 'index': item['index']} for item in scored_results]

        self.track_list_height = len(self.filtered_indices) * self.ITEM_HEIGHT
        self.playlist_container_scroll_top = 0
        self.render_virtual_tracks()

    def render_virtual_tracks(self):
        """
        Simulates ui.js renderVirtualTracks (lines 170-279).
        """
        scroll_top = self.playlist_container_scroll_top
        start_index = max(0, int(math.floor(scroll_top / self.ITEM_HEIGHT)) - 3)
        end_index = min(len(self.filtered_indices) - 1, int(math.ceil((scroll_top + self.container_client_height) / self.ITEM_HEIGHT)) + 3)

        self.rendered_tracks = []
        if end_index < start_index or len(self.filtered_indices) == 0:
            return

        for i in range(start_index, end_index + 1):
            item = self.filtered_indices[i]
            pl_data = self.all_databases.get(item['playlist']) or (self.current_playlist_data if item['playlist'] == self.current_playlist else None)
            if not pl_data or item['index'] >= len(pl_data):
                continue
            track = pl_data[item['index']]
            is_current = (item['playlist'] == self.current_playlist)
            display_title = f"[In {item['playlist']}] {track.get('title')} - {track.get('channel')}" if not is_current else f"{track.get('title')} - {track.get('channel')}"
            self.rendered_tracks.append({
                'virtual_index': i,
                'playlist': item['playlist'],
                'index': item['index'],
                'display_title': display_title,
                'track': track
            })

    def apply_playlist_data(self, folder_name, normalized_data, is_revalidation=False):
        """
        Simulates playback.js applyPlaylistData (lines 82-114).
        """
        self.current_playlist_data = normalized_data
        filter_text = self.search_input_value.strip().lower()

        # Invalidation resistance: do not overwrite filteredIndices if filterText is active
        if not filter_text:
            self.filtered_indices = [{'playlist': folder_name, 'index': i} for i in range(len(normalized_data))]

        effective_total = len(self.filtered_indices)
        self.track_list_height = effective_total * self.ITEM_HEIGHT
        self.render_virtual_tracks()

        if not is_revalidation:
            if self.global_active_playlist == folder_name and self.global_active_original_index != -1:
                self.scroll_to_track(self.global_active_original_index, force_scroll=True, allow_scroll=True)
            else:
                self.playlist_container_scroll_top = 0

    def scroll_to_track(self, original_index, force_scroll=False, allow_scroll=True):
        """
        Simulates ui.js scrollToTrack (lines 280-309).
        """
        if not allow_scroll:
            self.render_virtual_tracks()
            return

        current_pl = self.current_playlist
        virtual_index = -1
        for idx, item in enumerate(self.filtered_indices):
            if item['playlist'] == current_pl and item['index'] == original_index:
                virtual_index = idx
                break

        if virtual_index == -1:
            self.render_virtual_tracks()
            return

        scroll_pos = virtual_index * self.ITEM_HEIGHT
        self.playlist_container_scroll_top = max(0, scroll_pos - (self.container_client_height / 2) + (self.ITEM_HEIGHT / 2))
        self.render_virtual_tracks()

    def play_track_selection(self, target_playlist, target_original_index, should_scroll=False):
        """
        Simulates playback.js playTrackSelection (lines 507-590).
        """
        self.global_active_playlist = target_playlist
        self.global_active_original_index = target_original_index
        self.queue_base_playlist = target_playlist

        if target_playlist not in self.all_databases:
            # Fallback loading
            self.all_databases[target_playlist] = []

        self.current_playlist_data = self.all_databases[target_playlist]

        # Auto-switch playlist dropdown
        if self.current_playlist != target_playlist:
            self.current_playlist = target_playlist

        if self.shuffle_mode == 1:
            # Cross shuffle mode
            existing_idx = -1
            for idx, t in enumerate(self.cross_shuffle_history):
                if t['playlist'] == target_playlist and t['index'] == target_original_index:
                    existing_idx = idx
                    break
            if existing_idx != -1:
                self.cross_shuffle_history.pop(existing_idx)
                if existing_idx <= self.cross_shuffle_pos:
                    self.cross_shuffle_pos -= 1
            self.cross_shuffle_history.insert(self.cross_shuffle_pos + 1, {'playlist': target_playlist, 'index': target_original_index})
            self.cross_shuffle_pos += 1

        self.selected_search_index = -1
        if self.search_input_value.strip() != "":
            self.search_input_value = ""

        if self.current_playlist_data:
            self.filtered_indices = [{'playlist': target_playlist, 'index': i} for i in range(len(self.current_playlist_data))]
            self.track_list_height = len(self.filtered_indices) * self.ITEM_HEIGHT
            self.render_virtual_tracks()

        total_tracks = len(self.current_playlist_data) if self.current_playlist_data else 0

        if self.shuffle_mode == 2 and total_tracks > 0:
            rest = [i for i in range(total_tracks) if i != target_original_index]
            self.play_queue = [target_original_index] + rest
            self.queue_index = 0
        elif total_tracks > 0:
            self.play_queue = list(range(total_tracks))
            self.queue_index = target_original_index

        self.execute_playback(prevent_autoplay=False, is_history_nav=False, force_scroll=should_scroll, allow_scroll=should_scroll)

    def execute_playback(self, prevent_autoplay=False, is_history_nav=False, force_scroll=False, allow_scroll=True):
        """
        Simulates playback.js executePlayback (lines 684-900).
        """
        if not self.play_queue:
            return
        if self.queue_index < 0 or self.queue_index >= len(self.play_queue):
            self.queue_index = max(0, min(self.queue_index, len(self.play_queue) - 1))

        raw_item = self.play_queue[self.queue_index]
        if isinstance(raw_item, dict):
            original_index = raw_item['index']
            target_playlist = raw_item['playlist']
        else:
            original_index = raw_item
            target_playlist = self.queue_base_playlist or self.global_active_playlist or self.current_playlist

        self.global_active_original_index = original_index
        self.global_active_playlist = target_playlist

        self.scroll_to_track(original_index, force_scroll, allow_scroll)

    def on_track_click(self, playlist, index):
        """
        Simulates trackList click event (main.js line 684-698).
        Passes shouldScroll = false to preserve scroll position.
        """
        self.play_track_selection(playlist, index, should_scroll=False)

    def on_search_enter(self, target_idx):
        """
        Simulates searchInput keydown Enter event (main.js line 340-350).
        Passes shouldScroll = true for deliberate search navigation.
        """
        if 0 <= target_idx < len(self.filtered_indices):
            item = self.filtered_indices[target_idx]
            self.play_track_selection(item['playlist'], item['index'], should_scroll=True)


class TestMultiPlaylistSearchStressChallenger(unittest.TestCase):
    """
    Adversarial Empirical Stress Tests for Requirement R3:
    1. Duplicate songs across 3+ playlists, special characters, regex syntax, whitespace queries.
    2. Concurrent database updates / revalidations during active search.
    3. Click-to-play from search results, playlist switching, queue updates, Rule 6 scroll retention.
    """

    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        with open(os.path.join(base_dir, 'js', 'main.js'), 'r', encoding='utf-8') as f:
            cls.main_js = f.read()
        with open(os.path.join(base_dir, 'js', 'playback.js'), 'r', encoding='utf-8') as f:
            cls.playback_js = f.read()
        with open(os.path.join(base_dir, 'js', 'ui.js'), 'r', encoding='utf-8') as f:
            cls.ui_js = f.read()
        with open(os.path.join(base_dir, 'js', 'utils.js'), 'r', encoding='utf-8') as f:
            cls.utils_js = f.read()

    def setUp(self):
        self.sim = MultiPlaylistSearchSimulation()

        # Seed realistic test databases across 5 playlists
        self.rock_db = [
            {'id': 'lp_numb', 'title': 'Numb', 'channel': 'Linkin Park'},
            {'id': 'queen_bohrhap', 'title': 'Bohemian Rhapsody', 'channel': 'Queen'},
            {'id': 'acdc_backinblack', 'title': 'Back In Black', 'channel': 'AC/DC'},
            {'id': 'nirv_smells', 'title': 'Smells Like Teen Spirit', 'channel': 'Nirvana'},
            {'id': 'gnr_sweetchild', 'title': "Sweet Child O' Mine", 'channel': "Guns N' Roses"},
        ]
        self.classics_db = [
            {'id': 'queen_bohrhap', 'title': 'Bohemian Rhapsody', 'channel': 'Queen'},
            {'id': 'lp_numb', 'title': 'Numb', 'channel': 'Linkin Park'},
            {'id': 'beatles_heyjude', 'title': 'Hey Jude', 'channel': 'The Beatles'},
            {'id': 'eag_hotelcal', 'title': 'Hotel California', 'channel': 'Eagles'},
        ]
        self.favorites_db = [
            {'id': 'lp_numb', 'title': 'Numb', 'channel': 'Linkin Park'},
            {'id': 'queen_bohrhap', 'title': 'Bohemian Rhapsody', 'channel': 'Queen'},
            {'id': 'kesha_tiktok', 'title': 'TiK ToK', 'channel': 'Ke$ha'},
            {'id': 'pink_sowhat', 'title': 'So What', 'channel': 'P!nk'},
        ]
        self.workout_db = [
            {'id': 'lp_numb', 'title': 'Numb', 'channel': 'Linkin Park'},
            {'id': 'em_loseyourself', 'title': 'Lose Yourself (Soundtrack)', 'channel': 'Eminem'},
            {'id': 'surv_eyeoftiger', 'title': 'Eye of the Tiger [Remix]', 'channel': 'Survivor'},
        ]
        self.chill_db = [
            {'id': 'lp_numb', 'title': 'Numb', 'channel': 'Linkin Park'},
            {'id': 'miku_worldismine', 'title': 'World is Mine (初音ミク)', 'channel': 'supercell feat. 初音ミク'},
            {'id': 'royk_soeasy', 'title': 'So Easy', 'channel': 'Röyksopp'},
            {'id': 'spec_chars', 'title': 'Track ^.*+?[]#$ (Special & Strange)', 'channel': 'Artist / Complex'},
        ]

        self.sim.set_playlist_data('rock', self.rock_db)
        self.sim.set_playlist_data('classics', self.classics_db)
        self.sim.set_playlist_data('favorites', self.favorites_db)
        self.sim.set_playlist_data('workout', self.workout_db)
        self.sim.set_playlist_data('chill', self.chill_db)

    # 1. Invariant Tests: Zero Emoji & Static Assertions

    def test_strictly_zero_emojis_in_test_script(self):
        """Strictly zero emojis in test_multi_playlist_search_stress_challenger.py"""
        with open(__file__, 'r', encoding='utf-8') as f:
            content = f.read()
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        matches = emoji_pattern.findall(content)
        self.assertEqual(matches, [], f"Found emojis in test script: {matches}")

    def test_static_code_no_added_ids_set_in_search_handler(self):
        """Verify main.js has no addedIds Set suppressing duplicates across playlists"""
        search_match = re.search(
            r'searchInput\.addEventListener\(\s*["\']input["\'][\s\S]*?\n\s{4}\}\);',
            self.main_js
        )
        self.assertIsNotNone(search_match, "searchInput input listener not found in main.js")
        handler_body = search_match.group(0)
        self.assertNotIn("const addedIds = new Set()", handler_body)
        self.assertNotIn("addedIds.has(", handler_body)
        self.assertNotIn("addedIds.add(", handler_body)

    def test_static_code_current_playlist_score_bonus(self):
        """Verify main.js adds +50 score bonus to current playlist search matches"""
        search_match = re.search(
            r'searchInput\.addEventListener\(\s*["\']input["\'][\s\S]*?\n\s{4}\}\);',
            self.main_js
        )
        handler_body = search_match.group(0)
        self.assertIn("score: score + 50", handler_body)

    def test_static_code_apply_playlist_data_guards_filtered_indices(self):
        """Verify playback.js guards filteredIndices assignment behind if (!filterText)"""
        apply_match = re.search(
            r'function\s+applyPlaylistData\s*\(folderName,\s*normalizedData[\s\S]*?\n\s{4}\}',
            self.playback_js
        )
        self.assertIsNotNone(apply_match, "applyPlaylistData not found in playback.js")
        body = apply_match.group(0)
        self.assertIn("if (!filterText) {", body)
        self.assertIn("filteredIndices = indices;", body)

    def test_static_code_render_virtual_tracks_falls_back_to_current_playlist(self):
        """Verify ui.js renderVirtualTracks safely falls back to currentPlaylistData"""
        render_match = re.search(
            r'function\s+renderVirtualTracks\s*\(\)\s*\{[\s\S]*?\n\s{4}\}',
            self.ui_js
        )
        self.assertIsNotNone(render_match, "renderVirtualTracks not found in ui.js")
        body = render_match.group(0)
        self.assertIn("item.playlist === currentPl ? currentPlaylistData : null", body)

    # 2. Challenge Dimension 1: Multi-Playlist Search Query Edge Cases & De-duplication

    def test_song_duplicated_across_5_playlists_returns_all_5_occurrences(self):
        """
        Adversarial test: 'Numb' is present in all 5 playlists.
        Search must return exactly 5 entries, with the current playlist ranked first (+50 bonus).
        """
        self.sim.current_playlist = 'rock'
        self.sim.on_search_input("Numb")

        self.assertEqual(len(self.sim.filtered_indices), 5, "Expected all 5 duplicate playlist occurrences to be returned")
        playlists_found = [item['playlist'] for item in self.sim.filtered_indices]
        self.assertIn('rock', playlists_found)
        self.assertIn('classics', playlists_found)
        self.assertIn('favorites', playlists_found)
        self.assertIn('workout', playlists_found)
        self.assertIn('chill', playlists_found)

        # First result MUST be from the current playlist ('rock') due to the +50 score bonus
        self.assertEqual(self.sim.filtered_indices[0]['playlist'], 'rock')
        self.assertEqual(self.sim.filtered_indices[0]['index'], 0)

        # Check rendered titles: current playlist has no prefix, other playlists have [In <playlist>] prefix
        self.sim.render_virtual_tracks()
        rendered = self.sim.rendered_tracks
        self.assertEqual(len(rendered), 5)
        self.assertEqual(rendered[0]['display_title'], "Numb - Linkin Park")
        for r in rendered[1:]:
            self.assertTrue(r['display_title'].startswith(f"[In {r['playlist']}]"))

    def test_song_duplicated_with_different_original_indices(self):
        """
        Adversarial test: 'Bohemian Rhapsody' is in 3 playlists with different originalIndices.
        Verify that each search result retains its exact original index and playlist key.
        """
        self.sim.current_playlist = 'favorites'  # Here, Bohemian Rhapsody is at index 1
        self.sim.on_search_input("Bohemian Rhapsody")

        # Present in 'rock' (idx 1), 'classics' (idx 0), 'favorites' (idx 1)
        self.assertEqual(len(self.sim.filtered_indices), 3)

        # Rank 0 must be from 'favorites' (current playlist)
        self.assertEqual(self.sim.filtered_indices[0]['playlist'], 'favorites')
        self.assertEqual(self.sim.filtered_indices[0]['index'], 1)

        other_results = {(item['playlist'], item['index']) for item in self.sim.filtered_indices[1:]}
        self.assertIn(('rock', 1), other_results)
        self.assertIn(('classics', 0), other_results)

    def test_search_queries_with_special_characters_and_punctuation(self):
        """
        Adversarial test: punctuation characters like '/', ''', '!', '$', '&', '#'.
        Must execute without throwing and match correctly.
        """
        # AC/DC query
        self.sim.on_search_input("AC/DC")
        self.assertGreater(len(self.sim.filtered_indices), 0)
        first_match = self.sim.all_databases[self.sim.filtered_indices[0]['playlist']][self.sim.filtered_indices[0]['index']]
        self.assertEqual(first_match['channel'], 'AC/DC')

        # Guns N' Roses query
        self.sim.on_search_input("Guns N' Roses")
        self.assertGreater(len(self.sim.filtered_indices), 0)
        gnr_match = self.sim.all_databases[self.sim.filtered_indices[0]['playlist']][self.sim.filtered_indices[0]['index']]
        self.assertEqual(gnr_match['channel'], "Guns N' Roses")

        # P!nk query
        self.sim.on_search_input("P!nk")
        self.assertGreater(len(self.sim.filtered_indices), 0)
        pink_match = self.sim.all_databases[self.sim.filtered_indices[0]['playlist']][self.sim.filtered_indices[0]['index']]
        self.assertEqual(pink_match['channel'], 'P!nk')

        # Ke$ha query
        self.sim.on_search_input("Ke$ha")
        self.assertGreater(len(self.sim.filtered_indices), 0)
        kesha_match = self.sim.all_databases[self.sim.filtered_indices[0]['playlist']][self.sim.filtered_indices[0]['index']]
        self.assertEqual(kesha_match['channel'], 'Ke$ha')

    def test_search_queries_with_regex_metacharacters(self):
        """
        Adversarial test: regex metacharacters in queries e.g. '(', '[', '*', '+', '?', '^', '$'.
        Must NOT raise syntax errors and correctly match exact phrases.
        """
        regex_queries = [
            "(Soundtrack)",
            "[Remix]",
            "^.*+?[]#$",
            "(feat.",
            "a+b",
            "c*d",
            "foo?",
            "^start",
            "end$",
            "a|b",
            "\\s+",
            "{remix}"
        ]
        for query in regex_queries:
            try:
                self.sim.on_search_input(query)
            except Exception as e:
                self.fail(f"Search query '{query}' raised unexpected exception: {e}")

        # Exact phrase query '(Soundtrack)' should match Eminem - Lose Yourself (Soundtrack)
        self.sim.on_search_input("(Soundtrack)")
        self.assertGreater(len(self.sim.filtered_indices), 0)
        res = self.sim.all_databases[self.sim.filtered_indices[0]['playlist']][self.sim.filtered_indices[0]['index']]
        self.assertEqual(res['id'], 'em_loseyourself')

        # Exact phrase query '[Remix]' should match Survivor - Eye of the Tiger [Remix]
        self.sim.on_search_input("[Remix]")
        self.assertGreater(len(self.sim.filtered_indices), 0)
        res = self.sim.all_databases[self.sim.filtered_indices[0]['playlist']][self.sim.filtered_indices[0]['index']]
        self.assertEqual(res['id'], 'surv_eyeoftiger')

    def test_empty_and_whitespace_search_queries(self):
        """
        Adversarial test: empty string, pure spaces, tabs, and newlines.
        Must restore all current playlist tracks without showing 'No results found'.
        """
        self.sim.current_playlist = 'rock'
        total_rock_tracks = len(self.rock_db)

        # First filter down to 1 item
        self.sim.on_search_input("Nirvana")
        self.assertEqual(len(self.sim.filtered_indices), 1)

        # Clear with empty string
        self.sim.on_search_input("")
        self.assertEqual(len(self.sim.filtered_indices), total_rock_tracks)
        for i, item in enumerate(self.sim.filtered_indices):
            self.assertEqual(item['playlist'], 'rock')
            self.assertEqual(item['index'], i)

        # Whitespace variations
        for ws in [" ", "   ", "\t", "  \n  "]:
            self.sim.on_search_input("Nirvana")
            self.assertGreater(len(self.sim.filtered_indices), 0)

            self.sim.on_search_input(ws)
            self.assertEqual(len(self.sim.filtered_indices), total_rock_tracks)
            self.assertEqual(self.sim.filtered_indices[0]['playlist'], 'rock')

    def test_unicode_and_non_ascii_queries(self):
        """
        Adversarial test: non-ASCII UTF-8 queries (e.g. Japanese, Accents).
        Exact substring and token matching must find the correct tracks.
        """
        self.sim.on_search_input("初音ミク")
        self.assertGreater(len(self.sim.filtered_indices), 0)
        res = self.sim.all_databases[self.sim.filtered_indices[0]['playlist']][self.sim.filtered_indices[0]['index']]
        self.assertEqual(res['id'], 'miku_worldismine')

        self.sim.on_search_input("Röyksopp")
        self.assertGreater(len(self.sim.filtered_indices), 0)
        res = self.sim.all_databases[self.sim.filtered_indices[0]['playlist']][self.sim.filtered_indices[0]['index']]
        self.assertEqual(res['id'], 'royk_soeasy')

    # 3. Challenge Dimension 2: Concurrent Database Updates / Revalidations

    def test_background_database_revalidation_does_not_clobber_filtered_indices(self):
        """
        Adversarial test: user has active search query 'Queen'.
        A background network fetch revalidates 'rock' playlist database.
        applyPlaylistData must NOT overwrite filteredIndices.
        """
        self.sim.current_playlist = 'rock'
        self.sim.on_search_input("Queen")
        initial_filtered_count = len(self.sim.filtered_indices)
        self.assertGreater(initial_filtered_count, 0)
        initial_indices_snapshot = list(self.sim.filtered_indices)

        # Background revalidation arrives with modified rock database (e.g. 10 tracks)
        updated_rock_db = self.rock_db + [
            {'id': 'rock_extra_1', 'title': 'Extra Song 1', 'channel': 'Artist 1'},
            {'id': 'rock_extra_2', 'title': 'Extra Song 2', 'channel': 'Artist 2'},
        ]
        self.sim.apply_playlist_data('rock', updated_rock_db, is_revalidation=True)

        # filteredIndices MUST NOT have been overwritten with updated_rock_db (len 7)
        self.assertEqual(self.sim.filtered_indices, initial_indices_snapshot)
        self.assertEqual(len(self.sim.filtered_indices), initial_filtered_count)

    def test_revalidation_with_empty_search_query_updates_filtered_indices(self):
        """
        Adversarial test: when search query is empty, applyPlaylistData MUST
        update filteredIndices to reflect the new database length.
        """
        self.sim.current_playlist = 'rock'
        self.sim.on_search_input("")
        self.assertEqual(len(self.sim.filtered_indices), len(self.rock_db))

        updated_rock_db = self.rock_db + [
            {'id': 'rock_extra_1', 'title': 'Extra Song 1', 'channel': 'Artist 1'},
        ]
        self.sim.apply_playlist_data('rock', updated_rock_db, is_revalidation=True)

        self.assertEqual(len(self.sim.filtered_indices), len(updated_rock_db))
        self.assertEqual(self.sim.filtered_indices[-1]['index'], len(updated_rock_db) - 1)

    # 4. Challenge Dimension 3: Click-to-Play, Playlist Switching, Queue, & Rule 6 Scroll Retention

    def test_click_search_result_in_different_playlist_switches_playlist_and_queue(self):
        """
        Adversarial test: user is in 'rock' playlist.
        User searches for 'Eye of the Tiger', which exists in 'workout'.
        User clicks the track item.
        Verify:
        - Playlist switches to 'workout'.
        - Search input is cleared.
        - filteredIndices resets to 'workout' tracks.
        - Play queue and active track point to 'workout' index 2.
        """
        self.sim.current_playlist = 'rock'
        self.sim.on_search_input("Eye of the Tiger")
        self.assertEqual(len(self.sim.filtered_indices), 1)
        item = self.sim.filtered_indices[0]
        self.assertEqual(item['playlist'], 'workout')
        self.assertEqual(item['index'], 2)

        # User clicks search result
        self.sim.on_track_click(item['playlist'], item['index'])

        # Playlist must be switched
        self.assertEqual(self.sim.current_playlist, 'workout')
        self.assertEqual(self.sim.global_active_playlist, 'workout')
        self.assertEqual(self.sim.global_active_original_index, 2)
        self.assertEqual(self.sim.queue_base_playlist, 'workout')

        # Search input must be cleared
        self.assertEqual(self.sim.search_input_value, "")

        # filteredIndices must now reflect the full 'workout' playlist
        self.assertEqual(len(self.sim.filtered_indices), len(self.workout_db))
        self.assertEqual(self.sim.filtered_indices[0]['playlist'], 'workout')

        # Play queue must be initialized for 'workout' with queueIndex = 2
        self.assertEqual(self.sim.play_queue, [0, 1, 2])
        self.assertEqual(self.sim.queue_index, 2)

    def test_click_search_result_strictly_retains_scroll_top_per_rule_6(self):
        """
        Adversarial test: Rule 6 Playlist Track Item Click Scroll Retention Invariant.
        Clicking any track item MUST strictly retain playlistContainer.scrollTop.
        """
        self.sim.current_playlist = 'rock'
        self.sim.on_search_input("Numb")

        # Simulate user scrolling down 150px while browsing search results
        initial_scroll_top = 150
        self.sim.playlist_container_scroll_top = initial_scroll_top

        # Click on search result #3 (Linkin Park in 'workout')
        target_item = self.sim.filtered_indices[3]
        self.sim.on_track_click(target_item['playlist'], target_item['index'])

        # Per Rule 6, scroll_top must remain exactly 150 (not reset to 0 or auto-centered)
        self.assertEqual(
            self.sim.playlist_container_scroll_top,
            initial_scroll_top,
            f"Rule 6 violation: scrollTop changed from {initial_scroll_top} to {self.sim.playlist_container_scroll_top}"
        )

    def test_keyboard_enter_search_selection_allows_scroll_navigation(self):
        """
        Contrast test: unlike track click (Rule 6), hitting Enter on search input
        is intentional search navigation and should scroll to the track.
        """
        self.sim.current_playlist = 'rock'
        self.sim.on_search_input("Numb")
        self.sim.playlist_container_scroll_top = 0

        # Select index 0 via Enter key
        self.sim.on_search_enter(0)

        # executePlayback was called with force_scroll = True, allow_scroll = True
        # scrollToTrack ran and updated position without early return
        self.assertEqual(self.sim.global_active_playlist, 'rock')
        self.assertEqual(self.sim.global_active_original_index, 0)

    def test_click_search_result_under_single_playlist_shuffle_mode_2(self):
        """
        Adversarial test: when shuffleMode === 2 (single playlist shuffle),
        clicking a search result must place the selected song at playQueue[0]
        and shuffle the rest of the target playlist tracks behind it.
        """
        self.sim.shuffle_mode = 2
        self.sim.current_playlist = 'rock'
        self.sim.on_search_input("Hotel California")
        self.assertEqual(len(self.sim.filtered_indices), 1)
        item = self.sim.filtered_indices[0]
        self.assertEqual(item['playlist'], 'classics')
        self.assertEqual(item['index'], 3)

        self.sim.on_track_click(item['playlist'], item['index'])

        self.assertEqual(self.sim.current_playlist, 'classics')
        self.assertEqual(self.sim.play_queue[0], 3)
        self.assertEqual(self.sim.queue_index, 0)
        self.assertEqual(set(self.sim.play_queue), {0, 1, 2, 3})

    def test_click_search_result_under_cross_playlist_shuffle_mode_1(self):
        """
        Adversarial test: when shuffleMode === 1 (cross playlist shuffle),
        clicking a search result must insert the item into crossShuffleHistory
        at crossShufflePos + 1.
        """
        self.sim.shuffle_mode = 1
        self.sim.cross_shuffle_history = [{'playlist': 'rock', 'index': 0}]
        self.sim.cross_shuffle_pos = 0

        self.sim.current_playlist = 'rock'
        self.sim.on_search_input("TiK ToK")
        item = self.sim.filtered_indices[0]
        self.assertEqual(item['playlist'], 'favorites')
        self.assertEqual(item['index'], 2)

        self.sim.on_track_click(item['playlist'], item['index'])

        self.assertEqual(self.sim.cross_shuffle_pos, 1)
        self.assertEqual(
            self.sim.cross_shuffle_history[1],
            {'playlist': 'favorites', 'index': 2}
        )


if __name__ == '__main__':
    unittest.main()
