// Assembles an episode: lays each scene's narration mp3 at its recorded
// timestamp over the video, normalizes loudness, muxes to mp4, and emits the
// transcript + YouTube chapter list.
// Usage: node tutorial/assemble.js <episode-module> <out-dir> <final-name>
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const probeDuration = (file) =>
    parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());

const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function assembleEpisode(episode, outDir, finalName) {
    const audio = JSON.parse(fs.readFileSync(path.join(outDir, 'audio.json'), 'utf8'));
    const timing = JSON.parse(fs.readFileSync(path.join(outDir, 'timing.json'), 'utf8'));
    const video = path.join(outDir, 'video.webm');
    const videoDuration = probeDuration(video);

    // ffmpeg graph: silence bed + each clip delayed to its scene start, mixed.
    const clips = audio.filter(a => a.file);
    const inputs = ['-i', video];
    clips.forEach(c => inputs.push('-i', c.file));
    const delays = clips.map((c, k) => {
        const startMs = Math.round(timing[c.scene].start * 1000);
        return `[${k + 1}:a]adelay=${startMs}|${startMs}[a${k}]`;
    });
    const mixInputs = clips.map((_, k) => `[a${k}]`).join('');
    const graph = [
        `anullsrc=r=24000:cl=mono:d=${videoDuration.toFixed(2)}[bed]`,
        ...delays,
        `[bed]${mixInputs}amix=inputs=${clips.length + 1}:normalize=0[mix]`,
        `[mix]loudnorm=I=-16:TP=-1.5:LRA=11[aout]`,
    ].join(';');

    const out = path.join(outDir, finalName);
    execFileSync('ffmpeg', [
        '-y', ...inputs,
        '-filter_complex', graph,
        '-map', '0:v', '-map', '[aout]',
        '-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k',
        out,
    ], { stdio: ['ignore', 'ignore', 'inherit'] });

    // Transcript + chapters
    const lines = [`# ${episode.title}`, ''];
    const chapters = [];
    for (const t of timing) {
        const a = audio[t.scene];
        if (t.chapter) {
            chapters.push(`${mmss(t.start)} ${t.chapter}`);
            lines.push(`## ${t.chapter}`, '');
        }
        if (a?.narration) lines.push(a.narration, '');
    }
    fs.writeFileSync(path.join(outDir, 'transcript.md'), lines.join('\n'));
    fs.writeFileSync(path.join(outDir, 'chapters.txt'), chapters.join('\n') + '\n');
    return { out, videoDuration };
}

if (process.argv[1] && process.argv[1].endsWith('assemble.js') && process.argv[2]) {
    const episode = await import(path.resolve(process.argv[2]));
    const res = assembleEpisode(episode, path.resolve(process.argv[3]), process.argv[4] || 'episode.mp4');
    console.log(`assembled: ${res.out} (${res.videoDuration.toFixed(1)}s)`);
}
