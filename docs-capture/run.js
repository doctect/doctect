// CLI: node docs-capture/run.js [scenario ...] [--out=DIR]
// Default: every scenario in docs-capture/scenarios, out to public/docs-assets.
// After a default-out run, warns about orphan assets no markdown references.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { runScenario } from './lib/capture.js';

const ROOT = new URL('..', import.meta.url).pathname;
const DEFAULT_OUT = path.join(ROOT, 'public', 'docs-assets');

const args = process.argv.slice(2);
const outArg = args.find(a => a.startsWith('--out='));
const outDir = outArg ? path.resolve(outArg.slice(6)) : DEFAULT_OUT;
const names = args.filter(a => !a.startsWith('--'));

const scenariosDir = path.join(ROOT, 'docs-capture', 'scenarios');
const available = fs.readdirSync(scenariosDir).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3));
const selected = names.length ? names : available.filter(n => !n.startsWith('smoke'));

for (const name of selected) {
    if (!available.includes(name)) {
        console.error(`unknown scenario "${name}" — available: ${available.join(', ')}`);
        process.exit(1);
    }
}

// Pre-flight: tutorial/lib/servers.js's vite child can outlive stop() (see
// README Troubleshooting), leaving :5199/:3001 bound across runs. Check
// before every scenario and fail fast with guidance instead of a cryptic
// strictPort error deep inside startServers().
const isPortFree = (port) => new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port);
});
async function checkPortsFree() {
    const busy = [];
    for (const port of [3001, 5199]) {
        if (!(await isPortFree(port))) busy.push(port);
    }
    if (busy.length) {
        console.error(`✗ port(s) ${busy.join(', ')} already in use — a previous tutorial/docs-capture run likely leaked a process.`);
        console.error('  Check:  lsof -i :3001 -i :5199   (or: pgrep -f "vite --port 5199")');
        console.error("  Remedy: kill only processes attributable to this repo's previous runs, then rerun.");
        console.error('  See docs-capture/README.md → Troubleshooting.');
        process.exit(1);
    }
}

for (const name of selected) {
    await checkPortsFree();
    console.log(`scenario ${name}`);
    const mod = await import(path.join(scenariosDir, `${name}.js`));
    await runScenario(name, mod.shots, { outDir });
}

if (outDir === DEFAULT_OUT) {
    const referenced = new Set();
    const contentDir = path.join(ROOT, 'docs-content');
    const walkMd = (dir) => {
        for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, f.name);
            if (f.isDirectory()) walkMd(p);
            else if (f.name.endsWith('.md')) {
                const body = fs.readFileSync(p, 'utf8');
                for (const m of body.matchAll(/\((\/docs-assets\/[^)\s]+)/g)) referenced.add(m[1]);
            }
        }
    };
    if (fs.existsSync(contentDir)) walkMd(contentDir);
    const walkAssets = (dir) => {
        if (!fs.existsSync(dir)) return;
        for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, f.name);
            if (f.isDirectory()) walkAssets(p);
            else if (!referenced.has('/' + path.relative(path.join(ROOT, 'public'), p))) {
                console.warn(`⚠ orphan asset: ${path.relative(ROOT, p)}`);
            }
        }
    };
    walkAssets(DEFAULT_OUT);
}
console.log('done');
