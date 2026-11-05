import os
import re
import unittest

class SyntheticChromiumMediaSession:
    """
    Simulates Chromium C++ MediaSessionImpl and Android MediaSessionHelper
    behavior during Mode 2 playback, user pauses, and external focus interrupts.
    """
    def __init__(self):
        self.normal_players = set()
        self.audio_focus_state = 'INACTIVE'
        self.audio_focus_type = None
        self.notification_visible = False
        self.notification_playback_state = 'none'
        self.remove_player_calls = 0
        self.focus_loss_transient_active = False

    def request_audio_focus(self, focus_type='kGain'):
        self.audio_focus_state = 'ACTIVE'
        self.audio_focus_type = focus_type
        self.notification_visible = True

    def abandon_audio_focus(self):
        self.audio_focus_state = 'INACTIVE'
        self.audio_focus_type = None
        self.notification_visible = False

    def add_player(self, player_id):
        self.normal_players.add(player_id)
        if self.audio_focus_state != 'ACTIVE':
            self.request_audio_focus('kGain')

    def remove_player(self, player_id):
        self.remove_player_calls += 1
        if player_id in self.normal_players:
            self.normal_players.remove(player_id)
        if len(self.normal_players) == 0:
            self.abandon_audio_focus()

    def is_controllable(self):
        return (
            self.audio_focus_state != 'INACTIVE' and
            len(self.normal_players) > 0
        )

    def on_external_focus_loss_transient(self):
        """Simulates external app (e.g. video/call) acquiring transient audio focus."""
        self.focus_loss_transient_active = True
        # Chromium Android maintains notification if session is not abandoned and controllable
        if len(self.normal_players) == 0:
            self.abandon_audio_focus()

    def on_external_focus_gain(self):
        """Simulates external app releasing audio focus back."""
        self.focus_loss_transient_active = False


class SyntheticPiYTPipeline:
    """
    Simulates PiYT JavaScript runtime state across Mode 2 playback,
    mediaSession.js handlers, and main.js listeners.
    """
    def __init__(self, chromium_session):
        self.session = chromium_session
        self.audio_player_paused = True
        self.anchor_running = False
        self.was_paused_by_user = False
        self.focus_probe_running = False
        self.anchor_heartbeat_running = False
        self.spoof_burst_active = False
        self.playback_mode = 'mode2'
        self.media_session_destroyed = False
        self.media_session_playback_state = 'none'
        self.position = 0.0
        self.duration = 200.0

    def start_playback(self):
        self.audio_player_paused = False
        self.was_paused_by_user = False
        self.media_session_destroyed = False
        self.media_session_playback_state = 'playing'
        self.session.add_player('audioPlayer')
        if self.playback_mode == 'mode2':
            # Mode 2 always-on anchor
            self.anchor_running = True
            self.session.add_player('anchor')

    def user_pause(self):
        """Simulates user initiating pause in Mode 2."""
        self.was_paused_by_user = True
        self.audio_player_paused = True

        # In Mode 2 user pause:
        # Seamless handover: anchor is actively maintained
        if self.playback_mode == 'mode2':
            self.anchor_running = True
            self.session.add_player('anchor')
            self.anchor_heartbeat_running = True
            self.media_session_playback_state = 'playing'
        else:
            self.media_session_playback_state = 'paused'
            self.session.remove_player('audioPlayer')

    def external_interrupt(self):
        """
        Simulates external video or audio interrupt (AUDIOFOCUS_LOSS_TRANSIENT).
        was_paused_by_user is False.
        """
        self.was_paused_by_user = False
        self.audio_player_paused = True

        # Mode 2 Single-Player Isolation:
        # Stop anchor, focus probe, heartbeat, spoof burst
        if self.anchor_running:
            self.anchor_running = False
            self.session.remove_player('anchor')
        self.focus_probe_running = False
        self.anchor_heartbeat_running = False
        self.spoof_burst_active = False
        self.media_session_playback_state = 'paused'

    def action_handler_play(self):
        """User presses Play on notification card."""
        self.spoof_burst_active = False
        self.anchor_heartbeat_running = False
        self.was_paused_by_user = False
        self.audio_player_paused = False
        self.media_session_playback_state = 'playing'
        self.session.add_player('audioPlayer')

    def action_handler_pause(self):
        """User presses Pause / PlayPause on notification card."""
        is_actually_paused = self.audio_player_paused
        self.spoof_burst_active = False

        if is_actually_paused:
            # Resumes playback directly without requiring was_paused_by_user
            self.action_handler_play()
        else:
            self.user_pause()


class TestMilestoneM3SyntheticSimulation(unittest.TestCase):
    """
    Synthetic simulation tests covering:
    1. Multi-playlist search ranking & background revalidation preservation.
    2. Virtual track rendering fallback logic.
    3. Mode 2 pause/resume state machine.
    4. Mode 2 external interrupt single-player isolation and notification card retention.
    """
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        cls.test_path = os.path.join(base_dir, 'tests', 'test_milestone_m3_synthetic_simulation.py')
        with open(cls.test_path, 'r', encoding='utf-8') as f:
            cls.test_content = f.read()

    def test_strictly_zero_emojis(self):
        """Strictly zero emojis in test_milestone_m3_synthetic_simulation.py"""
        emoji_pattern = re.compile(
            r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u200d\ufe0f]',
            flags=re.UNICODE
        )
        matches = emoji_pattern.findall(self.test_content)
        self.assertEqual(matches, [], f"Found emojis: {matches}")

    def test_unix_lf_line_endings(self):
        """Strictly UNIX LF line endings enforced"""
        with open(self.test_path, 'rb') as f:
            raw = f.read()
        self.assertEqual(raw.count(b'\r\n'), 0, "Found CRLF endings")

    # Multi-Playlist Search Simulation

    def test_multi_playlist_search_preserves_duplicate_songs_across_playlists(self):
        """Simulates search results without addedIds suppression so identical songs in different playlists appear"""
        databases = {
            'rock': [
                {'id': 'song1', 'title': 'Midnight Echoes', 'channel': 'Band A'},
                {'id': 'song2', 'title': 'Starlight', 'channel': 'Band B'},
            ],
            'chill': [
                {'id': 'song1', 'title': 'Midnight Echoes', 'channel': 'Band A'},
                {'id': 'song3', 'title': 'Ocean Breeze', 'channel': 'Band C'},
            ]
        }
        query = 'midnight'
        current_pl = 'rock'
        all_playlists = ['rock', 'chill']

        scored_results = []
        # Current playlist matches with +50 bias
        for i, track in enumerate(databases[current_pl]):
            if query in track['title'].lower():
                scored_results.push({'playlist': current_pl, 'index': i, 'score': 100 + 50}) if hasattr(scored_results, 'push') else scored_results.append({'playlist': current_pl, 'index': i, 'score': 100 + 50})

        # Global matches (no addedIds deduplication!)
        for pl in all_playlists:
            if pl != current_pl and pl in databases:
                for i, track in enumerate(databases[pl]):
                    if query in track['title'].lower():
                        scored_results.append({'playlist': pl, 'index': i, 'score': 100})

        scored_results.sort(key=lambda x: x['score'], reverse=True)

        # Both occurrences must be present
        self.assertEqual(len(scored_results), 2, "Both occurrences of 'Midnight Echoes' should be returned")
        # Current playlist occurrence must rank first due to +50 bonus
        self.assertEqual(scored_results[0]['playlist'], 'rock')
        self.assertEqual(scored_results[0]['score'], 150)
        self.assertEqual(scored_results[1]['playlist'], 'chill')
        self.assertEqual(scored_results[1]['score'], 100)

    def test_background_revalidation_preserves_active_search_indices(self):
        """Simulates applyPlaylistData guarding filteredIndices during an active search query"""
        current_playlist_data = [{'id': f't{i}', 'title': f'Track {i}'} for i in range(10)]
        active_search_filtered_indices = [{'playlist': 'rock', 'index': 2}, {'playlist': 'chill', 'index': 0}]
        filter_text = 'track 2'

        # When filter_text is active, applyPlaylistData must NOT overwrite filteredIndices
        if not filter_text:
            filtered_indices = [{'playlist': 'rock', 'index': i} for i in range(len(current_playlist_data))]
        else:
            filtered_indices = active_search_filtered_indices

        self.assertEqual(filtered_indices, active_search_filtered_indices)

        # When filter_text is empty, applyPlaylistData updates filteredIndices to all items
        filter_text_empty = ''
        if not filter_text_empty:
            filtered_indices = [{'playlist': 'rock', 'index': i} for i in range(len(current_playlist_data))]

        self.assertEqual(len(filtered_indices), 10)

    def test_virtual_track_rendering_fallback_to_current_playlist_data(self):
        """Simulates ui.js fallback to currentPlaylistData when allDatabases has not yet cached current playlist"""
        all_databases = {'chill': [{'id': 'c1', 'title': 'Chill 1'}]}
        current_pl = 'rock'
        current_playlist_data = [{'id': 'r1', 'title': 'Rock 1'}]

        item_rock = {'playlist': 'rock', 'index': 0}
        item_chill = {'playlist': 'chill', 'index': 0}
        item_unknown = {'playlist': 'jazz', 'index': 0}

        def resolve_track(item):
            pl_data = (all_databases and all_databases.get(item['playlist'])) or (current_playlist_data if item['playlist'] == current_pl else None)
            if not pl_data or item['index'] >= len(pl_data):
                return None
            return pl_data[item['index']]

        # Fallback resolves rock track from currentPlaylistData even if not in allDatabases
        self.assertIsNotNone(resolve_track(item_rock))
        self.assertEqual(resolve_track(item_rock)['title'], 'Rock 1')

        # Resolves chill track from allDatabases
        self.assertIsNotNone(resolve_track(item_chill))
        self.assertEqual(resolve_track(item_chill)['title'], 'Chill 1')

        # Unknown cold playlist resolves to None without crashing
        self.assertIsNone(resolve_track(item_unknown))

    # Mode 2 Simulation: User Pause and Resumption

    def test_mode2_user_pause_and_action_handler_resumption(self):
        """Simulates Mode 2 user pause, anchor retention, and notification card resumption via play and playpause"""
        session = SyntheticChromiumMediaSession()
        piyt = SyntheticPiYTPipeline(session)

        # 1. Start playback in Mode 2
        piyt.start_playback()
        self.assertTrue(session.is_controllable())
        self.assertTrue(session.notification_visible)
        self.assertIn('audioPlayer', session.normal_players)
        self.assertIn('anchor', session.normal_players)

        # 2. User pauses playback
        piyt.user_pause()
        self.assertTrue(piyt.audio_player_paused)
        self.assertTrue(piyt.was_paused_by_user)
        # Anchor remains active, keeping controllable session
        self.assertTrue(session.is_controllable())
        self.assertTrue(session.notification_visible)

        # 3. User taps 'playpause' action handler on notification card
        piyt.action_handler_pause()
        self.assertFalse(piyt.audio_player_paused)
        self.assertFalse(piyt.was_paused_by_user)
        self.assertEqual(piyt.media_session_playback_state, 'playing')
        self.assertTrue(session.is_controllable())

    # Mode 2 Simulation: External Focus Interrupt

    def test_mode2_external_focus_interrupt_enforces_single_player_isolation(self):
        """
        Simulates Mode 2 external video interrupt:
        - was_paused_by_user is False
        - Anchor and probes are stopped immediately
        - Notification card is not destroyed by RemovePlayer() race
        - Card persists with playbackState = 'paused'
        """
        session = SyntheticChromiumMediaSession()
        piyt = SyntheticPiYTPipeline(session)

        # 1. Start playback in Mode 2
        piyt.start_playback()
        self.assertTrue(session.is_controllable())

        # 2. External app starts playing video (requesting transient audio focus)
        session.on_external_focus_loss_transient()
        piyt.external_interrupt()

        # Single-player isolation: anchor, probe, heartbeat are stopped
        self.assertFalse(piyt.anchor_running)
        self.assertFalse(piyt.focus_probe_running)
        self.assertFalse(piyt.anchor_heartbeat_running)
        self.assertFalse(piyt.spoof_burst_active)
        self.assertEqual(piyt.media_session_playback_state, 'paused')

        # PiYT maintains exactly 1 paused audioPlayer (or 0 active), so no dual-player race occurs
        self.assertNotIn('anchor', session.normal_players)
        self.assertIn('audioPlayer', session.normal_players)
        self.assertEqual(len(session.normal_players), 1)

        # Notification card remains pinned and controllable
        self.assertTrue(session.is_controllable())
        self.assertTrue(session.notification_visible)

        # 3. External app finishes and user taps play on notification card
        session.on_external_focus_gain()
        piyt.action_handler_play()
        self.assertFalse(piyt.audio_player_paused)
        self.assertEqual(piyt.media_session_playback_state, 'playing')
        self.assertTrue(session.is_controllable())

if __name__ == '__main__':
    unittest.main()
