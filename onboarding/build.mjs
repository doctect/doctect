// onboarding/build.mjs
// Assembles onboarding/index.html from authored src/ + live repo data.
// Every step is exported pure so tests exercise them without writing files.
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..');

// Basenames excluded anywhere; paths (with '/') excluded at that exact repo-relative path.
export const SCAN_EXCLUDES = [
    'node_modules', 'dist', '.git', '.claude', 'scratch', 'playwright-report', 'archives',
    'tutorial-videos', '.superpowers', 'package-lock.json', 'server.log',
    'server/analytics.db', 'onboarding/index.html', '.env',
];

const BINARY_EXT = /\.(png|jpe?g|webp|gif|ico|pdf|zip|woff2?|ttf|otf|mp4|webm|db|sqlite3?)$/i;

const isExcluded = (relPath, name) =>
    SCAN_EXCLUDES.includes(name) || SCAN_EXCLUDES.includes(relPath);

export const scanTree = (rootDir, relPath = '') => {
    const abs = path.join(rootDir, relPath);
    const name = relPath === '' ? path.basename(rootDir) : path.basename(relPath);
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
        const children = fs.readdirSync(abs)
            .filter(entry => !isExcluded(relPath ? `${relPath}/${entry}` : entry, entry))
            .map(entry => scanTree(rootDir, relPath ? `${relPath}/${entry}` : entry))
            .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1));
        return { name, path: relPath, kind: 'dir', size: children.reduce((s, c) => s + c.size, 0),
                 lines: null, children };
    }
    const lines = BINARY_EXT.test(name) ? null
        : fs.readFileSync(abs, 'utf8').split('\n').length;
    return { name, path: relPath, kind: 'file', size: stat.size, lines };
};

const walkFiles = (node, out = []) => {
    if (node.kind === 'file') out.push(node);
    else for (const c of node.children) walkFiles(c, out);
    return out;
};

export const flattenTreePaths = (tree) => walkFiles(tree).map(f => f.path);

export const collectVitals = (rootDir, tree) => {
    const read = (rel) => fs.readFileSync(path.join(rootDir, rel), 'utf8');
    const files = walkFiles(tree);

    const testFileCount = files.filter(f => /\.test\.[cm]?[jt]sx?$/.test(f.name)).length;

    const migrationSrc = read('server/migrations/index.js');
    const ids = [...migrationSrc.matchAll(/id:\s*'(\d{3}_[a-z0-9_]+)'/g)].map(m => m[1]);

    const routes = files
        .filter(f => f.path.startsWith('server/routes/'))
        .map(f => ({
            file: f.path,
            endpoints: [...read(f.path).matchAll(/router\.(get|post|patch|put|delete)\(\s*['"]([^'"]+)/g)]
                .map(m => ({ method: m[1].toUpperCase(), path: m[2] })),
        }));

    const schemaVersion = Number(read('services/migration.ts').match(/CURRENT_SCHEMA_VERSION = (\d+)/)[1]);
    const pkg = JSON.parse(read('package.json'));

    const areas = tree.children
        .filter(c => c.kind === 'dir')
        .map(c => ({ dir: c.name, files: walkFiles(c).length,
                     lines: walkFiles(c).reduce((s, f) => s + (f.lines || 0), 0) }))
        .sort((a, b) => b.lines - a.lines);

    const specs = fs.readdirSync(path.join(rootDir, 'docs/superpowers/specs')).filter(f => f.endsWith('.md')).sort();

    let gitSha = 'unknown';
    try { gitSha = execSync('git rev-parse --short HEAD', { cwd: rootDir }).toString().trim(); } catch { /* fine */ }

    return {
        generatedAt: new Date().toISOString(), gitSha, testFileCount,
        migrations: { count: ids.length, last: ids[ids.length - 1], ids },
        routes, schemaVersion,
        deps: { runtime: Object.keys(pkg.dependencies).length, dev: Object.keys(pkg.devDependencies).length },
        areas, specs,
    };
};
