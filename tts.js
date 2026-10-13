// High-definition French Text-to-Speech engine for weather bulletins and alert narrations.
// Renders WAV files server-side so the audio routes through the standard page audio path
// (and is captured by the live stream/OBS), unlike the browser speechSynthesis API.
//
// Engine hierarchy:
//   1. Edge Neural TTS (Microsoft Azure Neural - Broadcast Studio Quality: fr-CA-SylvieNeural, fr-CA-JeanNeural, etc.)
//   2. Piper (Local neural ONNX model: fr_FR-upmc-medium, fr_FR-siwis-medium)
//   3. Google Translate TTS (Online fast neural fallback: fr-CA / fr)
//   4. espeak-ng (Robotic offline fallback: fr-fr)

const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

const CACHE_DIR = path.join(os.tmpdir(), 'intellistar-tts');
const PIPER_DIR = path.join(os.homedir(), '.local', 'share', 'piper');
const MAX_CHARS = 2500;
const DEFAULT_VOICE = process.env.TTS_VOICE || 'fr-CA-SylvieNeural';
const inflight = new Map();

let MsEdgeTTSModule = null;
try {
    MsEdgeTTSModule = require('msedge-tts');
} catch (e) {
    MsEdgeTTSModule = null;
}

function onPath(bin) {
    try { return spawnSync('which', [bin]).status === 0; } catch { return false; }
}

function findPiper() {
    const bin = process.env.PIPER_BIN
        || (onPath('piper') ? 'piper' : null)
        || [path.join(PIPER_DIR, 'piper', 'piper'), path.join(PIPER_DIR, 'piper')]
            .find(p => fs.existsSync(p) && fs.statSync(p).isFile());

    let model = process.env.PIPER_MODEL;
    if (!model && fs.existsSync(PIPER_DIR)) {
        const files = fs.readdirSync(PIPER_DIR);
        // Prioritize upmc and higher-fidelity models before siwis
        const upmc = files.find(f => /^fr_.*upmc.*\.onnx$/i.test(f));
        const tom = files.find(f => /^fr_.*tom.*\.onnx$/i.test(f));
        const anyFr = files.find(f => /^fr_.*\.onnx$/i.test(f));
        const selected = upmc || tom || anyFr;
        if (selected) model = path.join(PIPER_DIR, selected);
    }
    return bin && model && fs.existsSync(model) ? { bin, model } : null;
}

function engineInfo() {
    if (MsEdgeTTSModule) {
        return { engine: 'edge-tts', voice: DEFAULT_VOICE };
    }
    const piper = findPiper();
    if (piper) {
        return { engine: 'piper', model: path.basename(piper.model) };
    }
    if (onPath('espeak-ng')) {
        return { engine: 'espeak-ng', voice: process.env.TTS_ESPEAK_VOICE || 'fr-fr' };
    }
    return { engine: 'google-tts', voice: 'fr-CA' };
}

// Normalize text for natural French broadcast narration
function normalizeText(text) {
    let t = String(text || '').replace(/<[^>]*>/g, ' ');

    // Filter boilerplate reporting and contact sentences for natural TTS narration
    const sentenceEnd = '(?:(?<=[a-z0-9_#)])\\.\\s+(?=[A-ZÀ-ÖØ-ß])|\\.$|$)';
    const boilerplate = [
        new RegExp('Veuillez continuer [àa] surveiller.*?' + sentenceEnd, 'gi'),
        new RegExp('Please continue to monitor.*?' + sentenceEnd, 'gi'),
        new RegExp('Continuez [àa] surveiller.*?' + sentenceEnd, 'gi'),
        new RegExp('Pour signaler du temps violent.*?' + sentenceEnd, 'gi'),
        new RegExp('To report severe weather.*?' + sentenceEnd, 'gi'),
        new RegExp('Pour signaler (?:des|une) inondations?.*?' + sentenceEnd, 'gi'),
        new RegExp('To report flooding.*?' + sentenceEnd, 'gi'),
        new RegExp('(?:Faites parvenir|Envoyez) un courriel.*?' + sentenceEnd, 'gi'),
        new RegExp('Send an email.*?' + sentenceEnd, 'gi'),
        new RegExp('Publiez un message sur les r[ée]seaux sociaux.*?' + sentenceEnd, 'gi'),
        new RegExp('(?:Post|Tweet) reports.*?' + sentenceEnd, 'gi'),
        new RegExp('(?:Appelez au|Call) 1-[0-9-]+.*?' + sentenceEnd, 'gi'),
        new RegExp('Consultez les pr[ée]visions locales.*?' + sentenceEnd, 'gi'),
        new RegExp('Check local forecasts.*?' + sentenceEnd, 'gi'),
        new RegExp('(?:Consultez le site|Visit) (?:meteo|weather)\\.gc\\.ca.*?' + sentenceEnd, 'gi'),
        new RegExp('Pour (?:de plus amples|obtenir de plus amples) renseignements.*?' + sentenceEnd, 'gi'),
        new RegExp('For more information.*?' + sentenceEnd, 'gi'),
        new RegExp('(?:Une mise [àa] jour|Des mises [àa] jour) (?:sera|seront) [ée]mise.*?' + sentenceEnd, 'gi'),
        new RegExp('(?:An update|Updates) will be issued.*?' + sentenceEnd, 'gi')
    ];
    for (const b of boilerplate) {
        t = t.replace(b, '');
    }

    // Weather unit expansions
    t = t
        .replace(/(\d+)\s*km\/h\b/gi, '$1 kilomètres à l\'heure')
        .replace(/(\d+)\s*mm\b/gi, '$1 millimètres')
        .replace(/(\d+)\s*cm\b/gi, '$1 centimètres')
        .replace(/(\d+)\s*m\b/gi, '$1 mètres')
        .replace(/(-?\d+)\s*°\s*C\b/gi, '$1 degrés')
        .replace(/(-?\d+)\s*°\b/gi, '$1 degrés')
        .replace(/(\d+)\s*kPa\b/gi, '$1 kilopascals')
        .replace(/(\d+)\s*%\b/gi, '$1 pour cent')
        .replace(/\bEC\b/g, 'Environnement Canada')
        .replace(/\bECCC\b/g, 'Environnement Canada')
        .replace(/\bHNE\b/g, 'heure normale de l\'Est')
        .replace(/\bHAE\b/g, 'heure avancée de l\'Est')
        .replace(/\bQC\b/g, 'Québec');

    // Wind cardinal directions in French
    t = t
        .replace(/\bvents?\s+(?:du\s+)?SO\b/gi, 'vents du sud-ouest')
        .replace(/\bvents?\s+(?:du\s+)?NO\b/gi, 'vents du nord-ouest')
        .replace(/\bvents?\s+(?:du\s+)?NE\b/gi, 'vents du nord-est')
        .replace(/\bvents?\s+(?:du\s+)?SE\b/gi, 'vents du sud-est')
        .replace(/\bvents?\s+(?:du\s+)?SSO\b/gi, 'vents du sud-sud-ouest')
        .replace(/\bvents?\s+(?:du\s+)?NNO\b/gi, 'vents du nord-nord-ouest')
        .replace(/\bvents?\s+(?:du\s+)?NNE\b/gi, 'vents du nord-nord-est')
        .replace(/\bvents?\s+(?:du\s+)?SSE\b/gi, 'vents du sud-sud-est')
        .replace(/\bvents?\s+(?:du\s+)?ONO\b/gi, 'vents d\'ouest-nord-ouest')
        .replace(/\bvents?\s+(?:du\s+)?OSO\b/gi, 'vents d\'ouest-sud-ouest')
        .replace(/\bvents?\s+(?:du\s+)?ENE\b/gi, 'vents d\'est-nord-est')
        .replace(/\bvents?\s+(?:du\s+)?ESE\b/gi, 'vents d\'est-sud-est');

    return t
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_CHARS);
}

function run(cmd, args, input) {
    return new Promise((resolve, reject) => {
        const p = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'pipe'] });
        let err = '';
        p.stderr.on('data', d => { err += d; });
        p.on('error', reject);
        p.on('close', code => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${err.slice(-300)}`)));
        if (input != null) {
            p.stdin.end(input);
        } else {
            p.stdin.end();
        }
    });
}

// Synthesize via Edge Neural TTS (Microsoft Azure Neural)
async function synthesizeEdgeTTS(text, targetWav) {
    if (!MsEdgeTTSModule) throw new Error('msedge-tts not installed');
    const { MsEdgeTTS, OUTPUT_FORMAT } = MsEdgeTTSModule;
    const tts = new MsEdgeTTS();
    const voice = process.env.TTS_VOICE || DEFAULT_VOICE;
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const tmpMp3 = `${targetWav}.mp3`;
    const { audioStream } = await tts.toStream(text);
    const writeStream = fs.createWriteStream(tmpMp3);

    await new Promise((resolve, reject) => {
        audioStream.pipe(writeStream);
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        audioStream.on('error', reject);
    });

    // Transcode MP3 to standard 22050Hz 16-bit mono WAV using ffmpeg
    if (onPath('ffmpeg')) {
        await run('ffmpeg', ['-y', '-i', tmpMp3, '-ar', '22050', '-ac', '1', '-f', 'wav', targetWav]);
        try { fs.unlinkSync(tmpMp3); } catch (e) {}
    } else {
        // If ffmpeg is absent, save mp3 as fallback
        fs.renameSync(tmpMp3, targetWav);
    }
}

// Synthesize via Piper (Local Neural ONNX)
async function synthesizePiper(text, targetWav) {
    const piper = findPiper();
    if (!piper) throw new Error('Piper binary or model not found');
    await run(piper.bin, ['--model', piper.model, '--output_file', targetWav, '--sentence_silence', '0.35'], text);
}

// Synthesize via Google Translate TTS (Fast Neural HTTP fallback)
async function synthesizeGoogleTTS(text, targetWav) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=fr-CA&client=tw-ob&q=${encodeURIComponent(text.slice(0, 200))}`;
    const tmpMp3 = `${targetWav}.mp3`;

    await new Promise((resolve, reject) => {
        const file = fs.createWriteStream(tmpMp3);
        const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            if (res.statusCode !== 200) {
                return reject(new Error(`Google TTS status ${res.statusCode}`));
            }
            res.pipe(file);
            file.on('finish', () => { file.close(resolve); });
        });
        req.on('error', (err) => {
            try { fs.unlinkSync(tmpMp3); } catch (e) {}
            reject(err);
        });
    });

    if (onPath('ffmpeg')) {
        await run('ffmpeg', ['-y', '-i', tmpMp3, '-ar', '22050', '-ac', '1', '-f', 'wav', targetWav]);
        try { fs.unlinkSync(tmpMp3); } catch (e) {}
    } else {
        fs.renameSync(tmpMp3, targetWav);
    }
}

// Synthesize via espeak-ng (Robotic offline fallback)
async function synthesizeEspeak(text, targetWav) {
    const voice = process.env.TTS_ESPEAK_VOICE || 'fr-fr';
    await run('espeak-ng', ['-v', voice, '-s', '150', '-w', targetWav, '--stdin'], text);
}

async function synthesize(rawText) {
    const text = normalizeText(rawText);
    if (!text) throw new Error('empty text');

    const info = engineInfo();
    const key = crypto.createHash('sha1').update(JSON.stringify(info) + text).digest('hex');
    const out = path.join(CACHE_DIR, `${key}.wav`);

    if (fs.existsSync(out)) return out;
    if (inflight.has(key)) return inflight.get(key);

    const job = (async () => {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        const tmp = `${out}.${process.pid}.tmp`;

        // Synthesis Cascade:
        // 1. Edge Neural TTS
        // 2. Piper (Local neural)
        // 3. Google Translate TTS
        // 4. espeak-ng
        let succeeded = false;

        if (MsEdgeTTSModule) {
            try {
                await synthesizeEdgeTTS(text, tmp);
                succeeded = true;
            } catch (err) {
                console.warn('[TTS] Edge Neural TTS failed, falling back to Piper:', err && err.message ? err.message : err);
            }
        }

        if (!succeeded) {
            try {
                await synthesizePiper(text, tmp);
                succeeded = true;
            } catch (err) {
                console.warn('[TTS] Piper failed, falling back to Google TTS:', err && err.message ? err.message : err);
            }
        }

        if (!succeeded) {
            try {
                await synthesizeGoogleTTS(text, tmp);
                succeeded = true;
            } catch (err) {
                console.warn('[TTS] Google TTS failed, falling back to espeak-ng:', err && err.message ? err.message : err);
            }
        }

        if (!succeeded) {
            if (onPath('espeak-ng')) {
                await synthesizeEspeak(text, tmp);
                succeeded = true;
            } else {
                throw new Error('No TTS engine available (install msedge-tts, piper, or espeak-ng)');
            }
        }

        fs.renameSync(tmp, out);
        return out;
    })().finally(() => inflight.delete(key));

    inflight.set(key, job);
    return job;
}

function installTTSAPI(app, logger = console) {
    app.get('/api/tts/info', (req, res) => res.json(engineInfo()));
    app.get('/api/tts', async (req, res) => {
        try {
            const file = await synthesize(req.query.text);
            res.set('Cache-Control', 'public, max-age=3600');
            res.type('audio/wav').sendFile(file);
        } catch (e) {
            logger.warn(`[TTS] ${e.message}`);
            res.status(e.message === 'empty text' ? 400 : 500).json({ error: e.message });
        }
    });
}

module.exports = { installTTSAPI, synthesize, normalizeText, engineInfo };
