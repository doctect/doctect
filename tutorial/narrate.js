// Generates per-scene narration mp3s for an episode storyboard and measures
// their durations. Usage: node tutorial/narrate.js <episode-module> <out-dir>
// Writes <out-dir>/scene-K.mp3 and <out-dir>/audio.json:
//   [{ scene, file, duration, narration }]
// Voice: en-US-JennyNeural (spec). Requires network (Microsoft Edge TTS).
// Node 18: msedge-tts needs global webcrypto (same polyfill as the server).
if (!globalThis.crypto) {
    globalThis.crypto = (await import('node:crypto')).webcrypto;
}
const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Provider: Google Chirp 3 HD via the local gcloud credentials (default),
// or the free msedge-tts fallback with TUTORIAL_TTS=edge.
const PROVIDER = process.env.TUTORIAL_TTS || 'chirp';
const CHIRP_VOICE = 'en-US-Chirp3-HD-Aoede';
const EDGE_VOICE = 'en-US-JennyNeural';

let gcloudAuth = null;
const getGcloudAuth = () => {
    if (!gcloudAuth) {
        gcloudAuth = {
            token: execFileSync('gcloud', ['auth', 'print-access-token']).toString().trim(),
            project: execFileSync('gcloud', ['config', 'get-value', 'project']).toString().trim(),
        };
    }
    return gcloudAuth;
};

async function synthesizeChirp(text, file, rate) {
    const { token, project } = getGcloudAuth();
    const res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Goog-User-Project': project,
        },
        body: JSON.stringify({
            input: { text },
            voice: { languageCode: 'en-US', name: CHIRP_VOICE },
            audioConfig: { audioEncoding: 'MP3', sampleRateHertz: 24000, ...(rate ? { speakingRate: rate } : {}) },
        }),
    });
    const data = await res.json();
    if (!data.audioContent) throw new Error(`chirp synthesis failed: ${JSON.stringify(data).slice(0, 200)}`);
    fs.writeFileSync(file, Buffer.from(data.audioContent, 'base64'));
}

const probeDuration = (file) =>
    parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());

export async function narrateEpisode(scenes, outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    const entries = [];
    for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const file = path.join(outDir, `scene-${i}.mp3`);
        if (!scene.narration) {
            entries.push({ scene: i, file: null, duration: 0, narration: '' });
            continue;
        }
        if (PROVIDER === 'chirp') {
            await synthesizeChirp(scene.narration, file, scene.voiceRate);
        } else {
            // one TTS connection per clip: msedge-tts websockets go stale across
            // many sequential requests, and a fresh connection per scene is cheap.
            const tts = new MsEdgeTTS();
            await tts.setMetadata(EDGE_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, {
                rate: scene.voiceRate ?? '+0%',
            });
            const sceneDir = path.join(outDir, `scene-${i}-tmp`);
            fs.mkdirSync(sceneDir, { recursive: true });
            const { audioFilePath } = await tts.toFile(sceneDir, scene.narration);
            fs.renameSync(audioFilePath, file);
            fs.rmSync(sceneDir, { recursive: true, force: true });
        }
        entries.push({ scene: i, file, duration: probeDuration(file), narration: scene.narration });
        process.stdout.write(`scene ${i}: ${entries[i].duration.toFixed(1)}s\n`);
    }
    fs.writeFileSync(path.join(outDir, 'audio.json'), JSON.stringify(entries, null, 2));
    return entries;
}

if (process.argv[1] && process.argv[1].endsWith('narrate.js') && process.argv[2]) {
    const { scenes } = await import(path.resolve(process.argv[2]));
    await narrateEpisode(scenes, path.resolve(process.argv[3]));
}
