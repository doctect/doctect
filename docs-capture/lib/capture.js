// Shot runner: one fresh browser context per shot (clean editor state every
// time), stills at deviceScaleFactor 2, clips via Playwright video -> ffmpeg
// animated webp. Sealed servers come from tutorial/lib/servers.js.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { startServers } from '../../tutorial/lib/servers.js';

const VIEWPORT = { width: 1600, height: 1000 };

export async function runScenario(name, shots, { outDir }) {
    if (!Array.isArray(shots) || !shots.length) throw new Error(`scenario ${name}: no shots exported`);
    // servers/browser/tmpVideoDir are declared before the try and assigned
    // inside it, so if a later setup step throws (e.g. chromium.launch()
    // fails after startServers() already succeeded), the finally block below
    // still only tears down what actually got created — nothing leaks.
    let servers = null;
    let browser = null;
    let tmpVideoDir = null;
    try {
        servers = await startServers(`docs-${name}`);
        browser = await chromium.launch();
        tmpVideoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-clip-'));
        for (const shot of shots) {
            const isClip = shot.kind === 'clip';
            const outPath = path.join(outDir, `${shot.id}.${isClip ? 'webp' : 'png'}`);
            fs.mkdirSync(path.dirname(outPath), { recursive: true });

            const context = await browser.newContext({
                viewport: VIEWPORT,
                deviceScaleFactor: isClip ? 1 : 2,
                ...(isClip ? { recordVideo: { dir: tmpVideoDir, size: VIEWPORT } } : {}),
            });
            const page = await context.newPage();
            // Headless Chromium auto-dismisses window.prompt/confirm, which
            // silently aborts cloud saves — accept with a stable answer instead.
            page.on('dialog', d => d.accept(shot.dialogText ?? 'Docs capture').catch(() => {}));

            const contextStart = Date.now();
            let snapped = false;
            let clipStart = null;
            const t = {
                page,
                servers,
                baseUrl: servers.baseUrl,
                snap: async (selector) => {
                    if (isClip) throw new Error(`${shot.id}: snap() is for stills`);
                    if (snapped) throw new Error(`${shot.id}: snap() called twice`);
                    const target = selector ? page.locator(selector).first() : page;
                    await target.screenshot({ path: outPath });
                    snapped = true;
                },
                beginClip: () => { clipStart = Date.now(); },
            };

            try {
                await shot.run(t);
                if (isClip) {
                    if (clipStart == null) throw new Error('clip shot never called beginClip()');
                    await page.waitForTimeout(400); // small tail so the last action lands
                } else if (!snapped) {
                    throw new Error('still shot never called snap()');
                }
            } catch (err) {
                const failPath = path.join(os.tmpdir(), `docs-capture-failure-${shot.id.replace(/\//g, '_')}.png`);
                await page.screenshot({ path: failPath }).catch(() => {});
                await context.close().catch(() => {});
                throw new Error(`[${name}] shot ${shot.id} failed: ${err.message}\n  failure screenshot: ${failPath}`);
            }

            // Same shot-id error context as the run() catch above, but no
            // failure screenshot here: for the clip branch the context (and
            // its page) is already closed by the time ffmpeg can fail, so
            // there is nothing left to screenshot. ffmpeg's own stderr is
            // captured and excerpted instead.
            try {
                if (isClip) {
                    const video = page.video();
                    await context.close(); // flushes recording
                    const videoPath = await video.path();
                    const offset = Math.max(0, (clipStart - contextStart) / 1000 - 0.2);
                    execFileSync('ffmpeg', [
                        '-y', '-ss', offset.toFixed(2), '-i', videoPath,
                        '-vf', 'fps=12,scale=1200:-2:flags=lanczos',
                        '-loop', '0', '-an', '-c:v', 'libwebp', '-q:v', '70',
                        outPath,
                    ], { stdio: 'pipe' });
                    fs.unlinkSync(videoPath);
                } else {
                    await context.close();
                }
            } catch (err) {
                await context.close().catch(() => {});
                const stderrExcerpt = err.stderr && err.stderr.length
                    ? err.stderr.toString().trim().split('\n').slice(-12).join('\n  ')
                    : null;
                const detail = stderrExcerpt
                    ? `${err.message.split('\n')[0]}\n  ffmpeg stderr (tail):\n  ${stderrExcerpt}`
                    : err.message;
                const step = isClip ? 'ffmpeg encode/cleanup' : 'context close';
                throw new Error(`[${name}] shot ${shot.id} failed: ${step} step failed: ${detail}`);
            }
            console.log(`  ✓ ${shot.kind.padEnd(5)} ${shot.id}`);
        }
    } finally {
        if (browser) await browser.close().catch(() => {});
        if (servers) servers.stop();
        if (tmpVideoDir) fs.rmSync(tmpVideoDir, { recursive: true, force: true });
    }
}
