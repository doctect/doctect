// Records one episode: continuous Chromium session, paced to pre-measured
// narration durations. Usage: node tutorial/record.js <episode-module> <out-dir>
// Requires <out-dir>/audio.json from narrate.js. Produces <out-dir>/video.webm
// and <out-dir>/timing.json ([{ scene, start, chapter }] seconds).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { startServers } from './lib/servers.js';
import { installCursor, resyncCursor } from './lib/cursor.js';

const BREATH = 0.6; // seconds of quiet after each scene's narration

// Tracks the currently-alive sealed servers so a SIGINT/SIGTERM handler (see
// the CLI guard below) can stop it — normal execution never reaches
// recordEpisode's own finally when the process is killed by a signal
// (Node's default SIGINT/SIGTERM disposition exits immediately), which would
// otherwise orphan the api+vite process groups.
let activeServers = null;

export async function recordEpisode(episode, outDir) {
    const audio = JSON.parse(fs.readFileSync(path.join(outDir, 'audio.json'), 'utf8'));
    const servers = await startServers(path.basename(outDir));
    activeServers = servers;
    const browser = await chromium.launch();
    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        recordVideo: { dir: outDir, size: { width: 1920, height: 1080 } },
    });
    await installCursor(context);
    const page = await context.newPage();

    const timing = [];
    const ctx = { servers, resyncCursor: () => resyncCursor(page) };
    const t0 = Date.now();
    try {
        for (let i = 0; i < episode.scenes.length; i++) {
            const scene = episode.scenes[i];
            const start = (Date.now() - t0) / 1000;
            timing.push({ scene: i, start, chapter: scene.chapter ?? null });
            process.stdout.write(`scene ${i} @ ${start.toFixed(1)}s${scene.chapter ? ` [${scene.chapter}]` : ''}\n`);

            try {
                await scene.actions(page, ctx);
            } catch (err) {
                await page.screenshot({ path: path.join(outDir, `failure-scene-${i}.png`) }).catch(() => {});
                throw err;
            }

            const narrationEnd = start + (audio[i]?.duration ?? 0) + BREATH;
            const now = () => (Date.now() - t0) / 1000;
            if (now() < narrationEnd) {
                await page.waitForTimeout((narrationEnd - now()) * 1000);
            }
        }
    } finally {
        const video = page.video();
        await context.close(); // flushes the recording
        const videoPath = await video.path();
        const target = path.join(outDir, 'video.webm');
        if (videoPath !== target) fs.renameSync(videoPath, target);
        await browser.close();
        servers.stop();
        activeServers = null;
    }
    fs.writeFileSync(path.join(outDir, 'timing.json'), JSON.stringify(timing, null, 2));
    return timing;
}

if (process.argv[1] && process.argv[1].endsWith('record.js') && process.argv[2]) {
    // Registered only for the direct-CLI-invocation path, not when
    // recordEpisode is imported as a library function elsewhere — an
    // importer should own its own process-wide signal handling.
    const shutdown = (signal) => () => {
        console.error(`\n✗ received ${signal} — stopping active sealed servers...`);
        if (activeServers) { activeServers.stop(); activeServers = null; }
        process.exit(130);
    };
    process.on('SIGINT', shutdown('SIGINT'));
    process.on('SIGTERM', shutdown('SIGTERM'));
    process.on('SIGHUP', shutdown('SIGHUP'));

    const episode = await import(path.resolve(process.argv[2]));
    const outDir = path.resolve(process.argv[3]);
    // One retry: recordings depend on the app's CDN assets (Tailwind); a
    // transient fetch failure mid-episode breaks styling and usually selectors.
    try {
        await recordEpisode(episode, outDir);
    } catch (err) {
        console.error('episode failed, retrying once:', err.message.split('\n')[0]);
        await recordEpisode(episode, outDir);
    }
}
