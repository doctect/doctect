// CLI: node docs-capture/run.js [scenario ...] [--out=DIR]
// Default: every scenario in docs-capture/scenarios, out to public/docs-assets.
// After a default-out run, warns about orphan assets no markdown references.
import fs from 'node:fs';
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

for (const name of selected) {
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
