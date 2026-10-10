// French text-to-speech for the weather bulletin (warning) slide.
// Renders WAV files server-side so the audio goes through the normal page
// audio path (and is therefore captured by the stream), unlike the browser's
// speechSynthesis API which bypasses tab/page audio capture.
//
// Engine priority:
//   1. Piper (neural, natural voice) if a binary + French .onnx model is found
//      - PIPER_BIN   (default: "piper" on PATH, or ~/.local/share/piper/piper/piper)
//      - PIPER_MODEL (default: first fr_*.onnx in ~/.local/share/piper)
//   2. espeak-ng (robotic fallback, voice TTS_ESPEAK_VOICE, default "fr-fr")
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CACHE_DIR = path.join(os.tmpdir(), 'intellistar-tts');
const PIPER_DIR = path.join(os.homedir(), '.local', 'share', 'piper');
const MAX_CHARS = 2500;
const inflight = new Map();

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
        const found = fs.readdirSync(PIPER_DIR).find(f => /^fr_.*\.onnx$/i.test(f));
        if (found) model = path.join(PIPER_DIR, found);
    }
    return bin && model && fs.existsSync(model) ? { bin, model } : null;
}

function engineInfo() {
    const piper = findPiper();
    if (piper) return { engine: 'piper', model: path.basename(piper.model) };
    if (onPath('espeak-ng')) return { engine: 'espeak-ng', voice: process.env.TTS_ESPEAK_VOICE || 'fr-fr' };
    return { engine: null };
}

// Make text read more naturally (units, abbreviations commonly found in alerts).
function normalizeText(text) {
    return String(text || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/(\d+)\s*km\/h/gi, '$1 kilomètres à l\'heure')
        .replace(/(\d+)\s*mm\b/gi, '$1 millimètres')
        .replace(/(\d+)\s*cm\b/gi, '$1 centimètres')
        .replace(/(-?\d+)\s*°\s*C\b/gi, '$1 degrés')
        .replace(/\bEC\b/g, 'Environnement Canada')
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
        p.stdin.end(input);
    });
}

async function synthesize(rawText) {
    const text = normalizeText(rawText);
    if (!text) throw new Error('empty text');
    const info = engineInfo();
    if (!info.engine) throw new Error('No TTS engine available (install piper or espeak-ng)');

    const key = crypto.createHash('sha1').update(JSON.stringify(info) + text).digest('hex');
    const out = path.join(CACHE_DIR, `${key}.wav`);
    if (fs.existsSync(out)) return out;
    if (inflight.has(key)) return inflight.get(key);

    const job = (async () => {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        const tmp = `${out}.${process.pid}.tmp`;
        if (info.engine === 'piper') {
            const { bin, model } = findPiper();
            await run(bin, ['--model', model, '--output_file', tmp, '--sentence_silence', '0.35'], text);
        } else {
            await run('espeak-ng', ['-v', info.voice, '-s', '150', '-w', tmp, '--stdin'], text);
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

