window.onSpotifyWebPlaybackSDKReady = window.onSpotifyWebPlaybackSDKReady || function() {
    if (typeof spotifyManager !== 'undefined' && spotifyManager) {
        spotifyManager.sdkReady = true;
        spotifyManager.createPlayer();
    }
};

class SpotifyManager {
    constructor() {
        this.player = null;
        this.deviceId = null;
        this.syncInterval = null;
        this.currentTrack = null;
        this.isPlaying = false;
        this.playlists = [];
        this.sdkReady = false;

        // Load saved state
        this.loadSettings();

        // Handle OAuth callback if present in URL
        this.handleAuthCallback();
    }

    loadSettings() {
        const saved = localStorage.getItem('intellistar_spotify');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (typeof spotifySettings !== 'undefined') {
                    spotifySettings = { ...spotifySettings, ...parsed };
                }
            } catch (e) {
                console.error("Failed to parse saved spotify settings", e);
            }
        }
    }

    saveSettings() {
        if (typeof spotifySettings === 'undefined') return;
        localStorage.setItem('intellistar_spotify', JSON.stringify({
            enabled: spotifySettings.enabled,
            mode: spotifySettings.mode,
            clientId: spotifySettings.clientId,
            accessToken: spotifySettings.accessToken,
            refreshToken: spotifySettings.refreshToken,
            expiresAt: spotifySettings.expiresAt,
            playlistId: spotifySettings.playlistId
        }));
    }

    // --- PKCE OAuth Authorization ---

    generateRandomString(length) {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const values = crypto.getRandomValues(new Uint8Array(length));
        return values.reduce((acc, x) => acc + possible[x % possible.length], "");
    }

    async sha256(plain) {
        const encoder = new TextEncoder();
        const data = encoder.encode(plain);
        return window.crypto.subtle.digest('SHA-256', data);
    }

    base64encode(input) {
        return btoa(String.fromCharCode(...new Uint8Array(input)))
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');
    }

    async startAuth() {
        if (!spotifySettings.clientId) {
            alert("Please enter a Spotify Client ID first.");
            return;
        }

        const codeVerifier = this.generateRandomString(64);
        const hashed = await this.sha256(codeVerifier);
        const codeChallenge = this.base64encode(hashed);

        window.localStorage.setItem('spotify_code_verifier', codeVerifier);

        const redirectUri = window.location.origin + window.location.pathname;
        const scope = 'user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private streaming';

        const authUrl = new URL("https://accounts.spotify.com/authorize");
        const params = {
            response_type: 'code',
            client_id: spotifySettings.clientId,
            scope: scope,
            code_challenge_method: 'S256',
            code_challenge: codeChallenge,
            redirect_uri: redirectUri,
        };

        authUrl.search = new URLSearchParams(params).toString();
        window.location.href = authUrl.toString();
    }

    async handleAuthCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');

        if (code) {
            const codeVerifier = localStorage.getItem('spotify_code_verifier');
            const redirectUri = window.location.origin + window.location.pathname;

            try {
                const response = await fetch('https://accounts.spotify.com/api/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        client_id: spotifySettings.clientId,
                        grant_type: 'authorization_code',
                        code: code,
                        redirect_uri: redirectUri,
                        code_verifier: codeVerifier,
                    }),
                });

                const data = await response.json();
                if (data.access_token) {
                    spotifySettings.accessToken = data.access_token;
                    spotifySettings.refreshToken = data.refresh_token || spotifySettings.refreshToken;
                    spotifySettings.expiresAt = Date.now() + (data.expires_in * 1000);
                    spotifySettings.enabled = true;
                    this.saveSettings();

                    // Clean URL
                    window.history.replaceState({}, document.title, window.location.pathname);
                    this.init();
                } else {
                    console.error("Error exchanging token:", data);
                }
            } catch (e) {
                console.error("OAuth token exchange failed:", e);
            }
        }
    }

    async getValidToken() {
        if (!spotifySettings.accessToken) return null;

        if (Date.now() >= spotifySettings.expiresAt - 60000 && spotifySettings.refreshToken) {
            try {
                const response = await fetch('https://accounts.spotify.com/api/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        client_id: spotifySettings.clientId,
                        grant_type: 'refresh_token',
                        refresh_token: spotifySettings.refreshToken,
                    }),
                });

                const data = await response.json();
                if (data.access_token) {
                    spotifySettings.accessToken = data.access_token;
                    if (data.refresh_token) spotifySettings.refreshToken = data.refresh_token;
                    spotifySettings.expiresAt = Date.now() + (data.expires_in * 1000);
                    this.saveSettings();
                }
            } catch (e) {
                console.error("Failed to refresh Spotify token", e);
            }
        }

        return spotifySettings.accessToken;
    }

    async init() {
        if (!spotifySettings.enabled || !spotifySettings.accessToken) return;

        const token = await this.getValidToken();
        if (!token) return;

        await this.fetchPlaylists();

        if (spotifySettings.mode === 'sdk') {
            this.initSDK();
        } else {
            this.startLiveSync();
        }
    }

    async fetchPlaylists() {
        const token = await this.getValidToken();
        if (!token) return;

        try {
            const res = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.items) {
                this.playlists = data.items;
                this.populatePlaylistDropdown();
            }
        } catch (e) {
            console.error("Error fetching playlists:", e);
        }
    }

    populatePlaylistDropdown() {
        const dropdown = document.getElementById('spotify-playlist-select');
        if (!dropdown) return;

        dropdown.innerHTML = '<option value="">Select a Playlist...</option>';
        this.playlists.forEach(pl => {
            const option = document.createElement('option');
            option.value = pl.id;
            option.textContent = pl.name;
            if (pl.id === spotifySettings.playlistId) {
                option.selected = true;
            }
            dropdown.appendChild(option);
        });
    }

    // --- Web Playback SDK ---

    initSDK() {
        if (window.Spotify && !this.player) {
            this.createPlayer();
        } else {
            window.onSpotifyWebPlaybackSDKReady = () => {
                this.sdkReady = true;
                this.createPlayer();
            };
        }
    }

    async createPlayer() {
        const token = await this.getValidToken();
        if (!token) return;

        this.player = new Spotify.Player({
            name: 'Intellistar Simulator',
            getOAuthToken: async cb => {
                const tok = await this.getValidToken();
                cb(tok);
            },
            volume: typeof audioSettings !== 'undefined' ? (audioSettings.musicVolume || 0.8) : 0.8
        });

        this.player.addListener('ready', ({ device_id }) => {
            console.log('Spotify Player Ready with Device ID', device_id);
            this.deviceId = device_id;
            if (spotifySettings.playlistId) {
                this.playPlaylist(spotifySettings.playlistId);
            }
        });

        this.player.addListener('player_state_changed', state => {
            if (!state) return;
            const track = state.track_window.current_track;
            this.isPlaying = !state.paused;
            if (track) {
                this.onTrackChange({
                    title: track.name,
                    artist: track.artists.map(a => a.name).join(', '),
                    coverUrl: track.album.images[0]?.url || ''
                });
            }
        });

        this.player.connect();
    }

    async playPlaylist(playlistId) {
        if (!this.deviceId || !playlistId) return;
        const token = await this.getValidToken();
        if (!token) return;

        try {
            await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${this.deviceId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    context_uri: `spotify:playlist:${playlistId}`
                })
            });
        } catch (e) {
            console.error("Error playing playlist on Spotify SDK:", e);
        }
    }

    setVolume(vol) {
        if (this.player) {
            this.player.setVolume(vol);
        }
    }

    pause() {
        if (this.player) {
            this.player.pause();
        }
    }

    resume() {
        if (this.player) {
            this.player.resume();
        }
    }

    // --- Live Sync Polling ---

    startLiveSync() {
        if (this.syncInterval) clearInterval(this.syncInterval);
        this.fetchCurrentlyPlaying();
        this.syncInterval = setInterval(() => this.fetchCurrentlyPlaying(), 3000);
    }

    stopLiveSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }

    async fetchCurrentlyPlaying() {
        if (!spotifySettings.enabled) return;
        const token = await this.getValidToken();
        if (!token) return;

        try {
            const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.status === 204 || res.status > 400) {
                this.onTrackChange(null);
                return;
            }

            const data = await res.json();
            if (data && data.item) {
                const track = {
                    title: data.item.name,
                    artist: data.item.artists.map(a => a.name).join(', '),
                    coverUrl: data.item.album.images[0]?.url || '',
                    isPlaying: data.is_playing
                };
                this.onTrackChange(track);
            } else {
                this.onTrackChange(null);
            }
        } catch (e) {
            console.error("Error fetching currently playing track:", e);
        }
    }

    onTrackChange(track) {
        this.currentTrack = track;
        if (typeof updateSpotifyDisplay === 'function') {
            updateSpotifyDisplay(track);
        }
    }

    disconnect() {
        spotifySettings.enabled = false;
        spotifySettings.accessToken = '';
        spotifySettings.refreshToken = '';
        spotifySettings.expiresAt = 0;
        this.saveSettings();
        if (this.player) {
            this.player.disconnect();
            this.player = null;
        }
        this.stopLiveSync();
        this.onTrackChange(null);
    }
}

var spotifyManager = new SpotifyManager();
