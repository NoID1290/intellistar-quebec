var bootAudioCtx = null;
var bootToneOsc = null;
var bootToneGain = null;
var bootStreamDest = null;
var bootClockInterval = null;

class AudioManager {
    constructor() {
        this.playlist = [];
        this.$players = $('<div id="players">');
        this.isMobile = false;
        this.vocallocal = {
            cc: [],
            lf: [`/vocallocal/DAYPART_DEFAULT1.wav`],
            bl: []
        };
        this.isVoicePlaying = false;
        this.customTracks = null;

        $('body').append(this.$players);

        // Initialize persistent jPlayer instances once to prevent DOM & WebAudio node churn
        this.initPersistentPlayers();

        setupAudioCapture();

        // Fetch actual custom music list from server if available
        this.loadServerMusic();

        if (typeof audioSettings !== 'undefined' && audioSettings.enableMusic) {
            this.buildPlaylist();
        }
    }

    async loadServerMusic() {
        try {
            const res = await fetch('/api/music');
            if (res.ok) {
                const data = await res.json();
                if (data && Array.isArray(data.tracks) && data.tracks.length > 0) {
                    this.customTracks = data.tracks;
                    console.log(`[Audio] Loaded ${data.tracks.length} tracks from custom music directory.`);
                    // Refresh playlist if music has not started yet
                    if (this.musicState.currentIdx === -1) {
                        this.buildPlaylist();
                    }
                }
            }
        } catch (e) {}
    }

    initPersistentPlayers() {
        const createPlayerDiv = (id, audioType) => {
            const $div = $(`<div id="${id}" class="jplayer ${audioType}"></div>`);
            const initialVol = audioType === 'music'
                ? (typeof audioSettings !== 'undefined' && audioSettings.musicVolume !== undefined ? audioSettings.musicVolume : 0.8)
                : (typeof audioSettings !== 'undefined' && audioSettings.vocalVolume !== undefined ? audioSettings.vocalVolume : 1.0);

            $div.jPlayer({
                swfPath: `${document.baseURI}jplayer`,
                supplied: 'wav, mp3, m4a, oga, ogg, webma',
                preload: 'auto',
                volume: initialVol
            });

            this.$players.append($div);
            return $div;
        };

        this.$musicP1 = createPlayerDiv('music-p1', 'music');
        this.$musicP2 = createPlayerDiv('music-p2', 'music');
        this.$voiceP1 = createPlayerDiv('voice-p1', 'voice');
        this.$voiceP2 = createPlayerDiv('voice-p2', 'voice');

        this.musicState = {
            active: this.$musicP1,
            preloader: this.$musicP2,
            queue: [],
            currentIdx: -1,
            loop: true
        };

        this.voiceState = {
            active: this.$voiceP1,
            preloader: this.$voiceP2,
            queue: [],
            currentIdx: -1
        };
    }

    shuffleArray(array) {
        if (!Array.isArray(array) || array.length <= 1) return array;
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = array[i];
            array[i] = array[j];
            array[j] = temp;
        }
        return array;
    }

    shuffleStart() {
        if (!Array.isArray(this.playlist) || this.playlist.length <= 1) return;
        const firstHalf = [...this.playlist];
        const splitIdx = Math.floor(Math.random() * firstHalf.length);
        const secondHalf = firstHalf.splice(splitIdx);
        this.playlist = [...secondHalf, ...firstHalf];
    }

    playCC(vl) {
        if (vl) {
            this.startPlaying(this.vocallocal.cc, false);
        } else {
            this.startPlaying(['narrations/Your_current_conditions.mp3'], false);
        }
    }

    playRadar() {
        this.startPlaying([`/vocallocal/doppler/LRADAR_DEFAULT${Math.floor(Math.random()) + 1}.wav`], false);
    }

    playBulletin() {
        this.startPlaying(this.vocallocal.bl, false);
    }

    playLF() {
        this.startPlaying(this.vocallocal.lf, false);
    }

    playEF() {
        this.startPlaying([`/vocallocal/weekahead/7DAY_DEFAULT${Math.floor(Math.random() * 3) + 1}.wav`], false);
    }

    playSevere(name) {
        if (name == "Flash Flood Warning") {
            this.startPlaying(['/vocallocal/beep.wav', '/vocallocal/FFLOOD_DEFAULT.wav', '/vocallocal/beep.wav'], false);
        } else if (name == "Tornado Warning") {
            this.startPlaying(['/vocallocal/beep.wav', '/vocallocal/TORNADO_DEFAULT.wav', '/vocallocal/beep.wav'], false);
        } else if (name == "Severe Thunderstorm Warning") {
            this.startPlaying(['/vocallocal/beep.wav', '/vocallocal/TSTORM_DEFAULT.wav', '/vocallocal/beep.wav'], false);
        } else {
            this.startPlaying(['/vocallocal/beep.wav', '/vocallocal/beep.wav', '/vocallocal/beep.wav', '/vocallocal/beep.wav'], false);
        }
    }

    buildPlaylist() {
        this.playlist = [];
        const musicPath = 'music/custom/';

        const isSingleSelectedTrack = (typeof audioSettings !== 'undefined' && Array.isArray(audioSettings.order) && audioSettings.order.length === 1 && audioSettings.order[0] !== 'Track 1');

        if (Array.isArray(this.customTracks) && this.customTracks.length > 0 && !isSingleSelectedTrack) {
            this.playlist = [...this.customTracks];
        } else if (typeof audioSettings !== 'undefined' && Array.isArray(audioSettings.order)) {
            for (let i = 0; i < audioSettings.order.length; i++) {
                let track = audioSettings.order[i];
                if (!track) continue;

                // Handle full paths / URLs / blobs
                if (track.startsWith('blob:') || track.startsWith('http://') || track.startsWith('https://') || track.startsWith('data:')) {
                    this.playlist.push(track);
                    continue;
                }

                // If already starts with music/ or /music/
                if (track.startsWith('music/') || track.startsWith('/music/')) {
                    this.playlist.push(track.replace(/^\//, ''));
                    continue;
                }

                if (track.startsWith('custom/')) {
                    this.playlist.push(`music/${track}`);
                    continue;
                }

                const hasExt = /\.(wav|mp3|ogg|oga|m4a|flac|aac|webm)$/i.test(track);
                const ext = hasExt ? '' : '.wav';
                this.playlist.push(`${musicPath}${track}${ext}`);
            }
        }

        if (this.playlist.length > 1) {
            if (audioSettings && audioSettings.shuffle) {
                this.shuffleArray(this.playlist);
            } else if (audioSettings && audioSettings.randomStart) {
                this.shuffleStart();
            }
        }

        console.log(`[Audio] Built playlist (${this.playlist.length} tracks)`);
    }

    startPlaying(arr, loop) {
        if (!arr || arr.length === 0) return;

        if (loop && typeof audioSettings !== 'undefined' && audioSettings.source === 'spotify') {
            return;
        }

        const getMediaObj = (trackName) => {
            if (typeof trackName !== 'string') return { mp3: trackName };
            const lower = trackName.toLowerCase();
            if (lower.endsWith('.wav')) return { wav: trackName };
            if (lower.endsWith('.mp3')) return { mp3: trackName };
            if (lower.endsWith('.m4a')) return { m4a: trackName };
            if (lower.endsWith('.ogg') || lower.endsWith('.oga')) return { oga: trackName };
            if (lower.endsWith('.webm') || lower.endsWith('.webma')) return { webma: trackName };
            return { wav: trackName, mp3: trackName };
        };

        if (loop) {
            // MUSIC PLAYBACK
            const state = this.musicState;
            state.queue = Array.isArray(arr) ? [...arr] : [];
            if (state.queue.length === 0) return;

            // If shuffle is enabled and queue wasn't randomized yet, shuffle now
            if (typeof audioSettings !== 'undefined' && audioSettings.shuffle && state.queue.length > 1) {
                this.shuffleArray(state.queue);
            }

            state.currentIdx = -1;
            state.loop = true;

            const playNextMusic = () => {
                state.currentIdx++;
                if (state.currentIdx >= state.queue.length) {
                    state.currentIdx = 0;
                    if (typeof audioSettings !== 'undefined' && audioSettings.shuffle && state.queue.length > 1) {
                        this.shuffleArray(state.queue);
                    }
                }

                const trackToPlay = state.queue[state.currentIdx];
                console.log(`[Audio] Playing music track [${state.currentIdx + 1}/${state.queue.length}]: ${trackToPlay}`);

                // Switch active / preloader
                const temp = state.active;
                state.active = state.preloader;
                state.preloader = temp;

                if (typeof window.connectAllAudioPlayers === 'function') {
                    window.connectAllAudioPlayers();
                }

                state.active.off($.jPlayer.event.ended).on($.jPlayer.event.ended, () => {
                    playNextMusic();
                });

                state.active.jPlayer('play', Math.abs((typeof audioSettings !== 'undefined' && audioSettings.offset) || 0));

                // Preload next track
                const nextIdx = (state.currentIdx + 1) % state.queue.length;
                try {
                    state.preloader.jPlayer('setMedia', getMediaObj(state.queue[nextIdx])).jPlayer('stop');
                } catch (e) {}
            };

            state.preloader.jPlayer('setMedia', getMediaObj(state.queue[0]));
            playNextMusic();
        } else {
            // VOICE / VOCAL NARRATION PLAYBACK
            const state = this.voiceState;
            this.isVoicePlaying = true;
            state.queue = arr;
            state.currentIdx = -1;

            // Duck background music
            const duckedVol = (typeof audioSettings !== 'undefined' && audioSettings.musicDuckedVolume !== undefined)
                ? audioSettings.musicDuckedVolume : 0.3;
            this.$players.find('.music').jPlayer('volume', duckedVol);
            if (typeof spotifyManager !== 'undefined' && spotifyManager.player) {
                spotifyManager.setVolume(duckedVol);
            }

            // Stop any currently playing voice audio
            state.active.jPlayer('stop').off($.jPlayer.event.ended);
            state.preloader.jPlayer('stop').off($.jPlayer.event.ended);

            const onVoiceFinished = () => {
                this.isVoicePlaying = false;
                state.active.off($.jPlayer.event.ended);
                state.preloader.off($.jPlayer.event.ended);
                state.active.jPlayer('stop');
                state.preloader.jPlayer('stop');

                // Restore music volume
                const musicVol = (typeof audioSettings !== 'undefined' && audioSettings.musicVolume !== undefined)
                    ? audioSettings.musicVolume : 0.8;
                this.$players.find('.music').jPlayer('volume', musicVol);
                if (typeof spotifyManager !== 'undefined' && spotifyManager.player) {
                    spotifyManager.setVolume(musicVol);
                }
            };

            const playNextVoice = () => {
                state.currentIdx++;
                if (state.currentIdx >= state.queue.length) {
                    onVoiceFinished();
                    return;
                }

                // Switch active / preloader
                const temp = state.active;
                state.active = state.preloader;
                state.preloader = temp;

                state.active.off($.jPlayer.event.ended).on($.jPlayer.event.ended, () => {
                    setTimeout(() => {
                        playNextVoice();
                    }, 50);
                });

                state.active.jPlayer('play');

                // Preload upcoming track if available
                const nextIdx = state.currentIdx + 1;
                if (nextIdx < state.queue.length) {
                    try {
                        state.preloader.jPlayer('setMedia', getMediaObj(state.queue[nextIdx])).jPlayer('stop');
                    } catch (e) {}
                }
            };

            state.preloader.jPlayer('setMedia', getMediaObj(arr[0]));
            playNextVoice();
        }
    }

    stopAll() {
        if (this.musicState) {
            this.musicState.loop = false;
            this.musicState.currentIdx = -1;
            this.musicState.queue = [];
            if (this.musicState.active) {
                this.musicState.active.off($.jPlayer.event.ended);
                try { this.musicState.active.jPlayer('stop'); } catch (e) {}
            }
            if (this.musicState.preloader) {
                this.musicState.preloader.off($.jPlayer.event.ended);
                try { this.musicState.preloader.jPlayer('stop'); } catch (e) {}
            }
        }
        if (this.voiceState) {
            this.voiceState.currentIdx = -1;
            this.voiceState.queue = [];
            if (this.voiceState.active) {
                this.voiceState.active.off($.jPlayer.event.ended);
                try { this.voiceState.active.jPlayer('stop'); } catch (e) {}
            }
            if (this.voiceState.preloader) {
                this.voiceState.preloader.off($.jPlayer.event.ended);
                try { this.voiceState.preloader.jPlayer('stop'); } catch (e) {}
            }
        }
        if (this.$players) {
            this.$players.find('.music, .voice').jPlayer('stop');
        }
        this.isVoicePlaying = false;
        if (typeof spotifyManager !== 'undefined' && spotifyManager.player) {
            try { spotifyManager.pause(); } catch (e) {}
        }
    }

    stopPlaying() {
        this.stopAll();
    }

    setMusicVolume(vol) {
        var num = Math.max(0, Math.min(2, vol));
        if (typeof audioSettings !== 'undefined') {
            audioSettings.musicVolume = num;
        }
        if (!this.isVoicePlaying) {
            this.$players.find('.music').jPlayer('volume', num);
        }
    }

    setVocalVolume(vol) {
        var num = Math.max(0, Math.min(2, vol));
        if (typeof audioSettings !== 'undefined') {
            audioSettings.vocalVolume = num;
        }
        this.$players.find('.voice').jPlayer('volume', num);
    }

    levelUpMusic(step = 0.1) {
        var current = (typeof audioSettings !== 'undefined' && audioSettings.musicVolume !== undefined) ? audioSettings.musicVolume : 0.8;
        this.setMusicVolume(Math.round((current + step) * 10) / 10);
    }

    levelDownMusic(step = 0.1) {
        var current = (typeof audioSettings !== 'undefined' && audioSettings.musicVolume !== undefined) ? audioSettings.musicVolume : 0.8;
        this.setMusicVolume(Math.round((current - step) * 10) / 10);
    }

    levelUpVocal(step = 0.1) {
        var current = (typeof audioSettings !== 'undefined' && audioSettings.vocalVolume !== undefined) ? audioSettings.vocalVolume : 1.0;
        this.setVocalVolume(Math.round((current + step) * 10) / 10);
    }

    levelDownVocal(step = 0.1) {
        var current = (typeof audioSettings !== 'undefined' && audioSettings.vocalVolume !== undefined) ? audioSettings.vocalVolume : 1.0;
        this.setVocalVolume(Math.round((current - step) * 10) / 10);
    }
}

var audioPlayer = new AudioManager();

function updateBootClock() {
    const el = document.getElementById('boot-clock-text');
    if (!el) return;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timeStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    el.textContent = timeStr;
}

function setBootStatus(msg) {
    const el = document.getElementById('boot-status-text');
    if (el) {
        el.textContent = msg;
    }
    console.log(`[Boot Status] ${msg}`);
}

function startTestTone() {
    try {
        const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtxClass) return;
        if (!bootAudioCtx) {
            bootAudioCtx = new AudioCtxClass();
        }
        if (bootAudioCtx.state === 'suspended') {
            bootAudioCtx.resume();
        }
        if (bootToneOsc) return;

        bootToneOsc = bootAudioCtx.createOscillator();
        bootToneGain = bootAudioCtx.createGain();

        bootToneOsc.type = 'sine';
        bootToneOsc.frequency.setValueAtTime(1000, bootAudioCtx.currentTime); // Standard 1000 Hz SMPTE alignment tone

        // -18 dBFS reference level (~0.125 amplitude)
        bootToneGain.gain.setValueAtTime(0.125, bootAudioCtx.currentTime);

        bootToneOsc.connect(bootToneGain);
        bootToneGain.connect(bootAudioCtx.destination);

        if (bootStreamDest) {
            bootToneGain.connect(bootStreamDest);
        }

        bootToneOsc.start();
        console.log('[Audio] 1000 Hz broadcast test tone active.');

        if (!bootClockInterval) {
            updateBootClock();
            bootClockInterval = setInterval(updateBootClock, 1000);
        }
    } catch (e) {
        console.warn('[Audio] Failed to start test tone:', e);
    }
}

function stopTestTone() {
    try {
        if (bootClockInterval) {
            clearInterval(bootClockInterval);
            bootClockInterval = null;
        }
        if (bootToneGain && bootAudioCtx) {
            bootToneGain.gain.setValueAtTime(bootToneGain.gain.value, bootAudioCtx.currentTime);
            bootToneGain.gain.linearRampToValueAtTime(0.0001, bootAudioCtx.currentTime + 0.15);
        }
        setTimeout(() => {
            if (bootToneOsc) {
                try { bootToneOsc.stop(); } catch (e) {}
                try { bootToneOsc.disconnect(); } catch (e) {}
                bootToneOsc = null;
            }
            if (bootToneGain) {
                try { bootToneGain.disconnect(); } catch (e) {}
                bootToneGain = null;
            }
            console.log('[Audio] 1000 Hz broadcast test tone stopped.');
        }, 160);
    } catch (e) {}
}

function setupAudioCapture() {
    if (typeof window.sendAudioChunk !== 'function') return;
    if (window._audioCaptureInitialized) return;
    window._audioCaptureInitialized = true;

    try {
        const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtxClass) return;
        if (!bootAudioCtx) {
            bootAudioCtx = new AudioCtxClass();
        }
        const audioCtx = bootAudioCtx;
        bootStreamDest = audioCtx.createMediaStreamDestination();
        const streamDest = bootStreamDest;
        const connectedElements = new WeakSet();

        // Connect any existing test tone
        if (bootToneGain) {
            try {
                bootToneGain.connect(streamDest);
            } catch (e) {}
        }

        function connectAudioElement(el) {
            if (!el || connectedElements.has(el)) return;
            connectedElements.add(el);
            try {
                if (audioCtx.state === 'suspended') {
                    audioCtx.resume();
                }
                const source = audioCtx.createMediaElementSource(el);
                source.connect(audioCtx.destination);
                source.connect(streamDest);
            } catch (e) {
                console.warn('[IPTV Audio] Error connecting element source:', e);
            }
        }

        // Connect the persistent player audio elements
        const connectAllPlayers = () => {
            document.querySelectorAll('#players audio').forEach(connectAudioElement);
        };
        window.connectAllAudioPlayers = connectAllPlayers;
        connectAllPlayers();
        setTimeout(connectAllPlayers, 100);
        setTimeout(connectAllPlayers, 500);

        const mimeType = (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus'))
            ? 'audio/webm;codecs=opus'
            : ((typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm')) ? 'audio/webm' : '');

        if (!mimeType || typeof MediaRecorder === 'undefined') return;

        const mediaRecorder = new MediaRecorder(streamDest.stream, { mimeType });

        mediaRecorder.ondataavailable = async (e) => {
            if (e.data && e.data.size > 0 && typeof window.sendAudioChunk === 'function') {
                try {
                    const arrayBuffer = await e.data.arrayBuffer();
                    const bytes = new Uint8Array(arrayBuffer);
                    let binary = '';
                    const len = bytes.byteLength;
                    const chunkSize = 8192;
                    for (let i = 0; i < len; i += chunkSize) {
                        binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunkSize, len)));
                    }
                    const base64 = btoa(binary);
                    if (base64) {
                        window.sendAudioChunk(base64);
                    }
                } catch (err) {}
            }
        };

        // 500ms chunks
        mediaRecorder.start(500);
        console.log('[IPTV Audio] WebAudio digital stream capture initialized (persistent graph).');
    } catch (err) {
        console.error('[IPTV Audio] Setup failed:', err);
    }
}