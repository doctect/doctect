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

const VOICE = 'en-US-JennyNeural';

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
        // one TTS connection per clip: msedge-tts websockets go stale across
        // many sequential requests, and a fresh connection per scene is cheap.
        const tts = new MsEdgeTTS();
        await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, {
            rate: scene.voiceRate ?? '+0%',
        });
        const sceneDir = path.join(outDir, `scene-${i}-tmp`);
        fs.mkdirSync(sceneDir, { recursive: true });
        const { audioFilePath } = await tts.toFile(sceneDir, scene.narration);
        fs.renameSync(audioFilePath, file);
        fs.rmSync(sceneDir, { recursive: true, force: true });
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
