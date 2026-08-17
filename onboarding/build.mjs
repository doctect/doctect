// onboarding/build.mjs
// Assembles onboarding/index.html from authored src/ + live repo data.
// Every step is exported pure so tests exercise them without writing files.
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import ts from 'typescript';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..');
export const REPOSITORY_DISPLAY_NAME = 'doctect';

// Basenames excluded anywhere; paths (with '/') excluded at that exact repo-relative path.
export const SCAN_EXCLUDES = [
    'node_modules', 'dist', '.git', '.claude', 'scratch', 'playwright-report', 'archives',
    'tutorial-videos', '.superpowers', 'package-lock.json', 'server.log',
    'server/analytics.db', 'onboarding/index.html', '.env',
];

const BINARY_EXT = /\.(png|jpe?g|webp|gif|ico|pdf|zip|woff2?|ttf|otf|mp4|webm|db|sqlite3?)$/i;

const isExcluded = (relPath, name) =>
    SCAN_EXCLUDES.includes(name) || SCAN_EXCLUDES.includes(relPath);

// wc -l semantics: a trailing newline TERMINATES the last line, it does not start
// an empty one. Counting split segments overcounts every newline-terminated file by
// one, which shipped as a visible contradiction (a tour called textPadding.ts an
// "87-line module" while the code window rendered "88 lines" for the same file).
const countLines = (text) =>
    text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0);

// Vitest runs test files in parallel and some suites create-then-delete temp dirs
// inside the repo (tests/unit/gallerySampleHarness.test.ts writes under
// gallery-samples/). An entry can therefore vanish between readdir and stat, and
// content.test.js calls buildRefs at module level — so an unguarded throw takes a
// whole test file down at collection with an opaque ENOENT. Skip what vanished;
// that covers any future churn, which an exclusion list would not.
const GONE = Symbol('gone');
const skipIfGone = (fn) => {
    try { return fn(); } catch (e) { if (e.code === 'ENOENT') return GONE; throw e; }
};

export const scanTree = (rootDir, relPath = '') => {
    const abs = path.join(rootDir, relPath);
    const name = relPath === '' ? REPOSITORY_DISPLAY_NAME : path.basename(relPath);
    const stat = skipIfGone(() => fs.statSync(abs));
    if (stat === GONE) return null;
    if (stat.isDirectory()) {
        const entries = skipIfGone(() => fs.readdirSync(abs));
        if (entries === GONE) return null;
        const children = entries
            .filter(entry => !isExcluded(relPath ? `${relPath}/${entry}` : entry, entry))
            .map(entry => scanTree(rootDir, relPath ? `${relPath}/${entry}` : entry))
            .filter(Boolean)
            .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1));
        return { name, path: relPath, kind: 'dir', size: children.reduce((s, c) => s + c.size, 0),
                 lines: null, children };
    }
    if (BINARY_EXT.test(name)) return { name, path: relPath, kind: 'file', size: stat.size, lines: null };
    const text = skipIfGone(() => fs.readFileSync(abs, 'utf8'));
    if (text === GONE) return null;
    return { name, path: relPath, kind: 'file', size: stat.size, lines: countLines(text) };
};

const walkFiles = (node, out = []) => {
    if (node.kind === 'file') out.push(node);
    else for (const c of node.children) walkFiles(c, out);
    return out;
};

export const flattenTreePaths = (tree) => walkFiles(tree).map(f => f.path);

export const collectVitals = (rootDir, tree, metadata = {}) => {
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

    let gitSha = metadata.gitSha ?? 'unknown';
    if (metadata.gitSha === undefined) {
        try { gitSha = execSync('git rev-parse --short HEAD', { cwd: rootDir }).toString().trim(); } catch { /* fine */ }
    }

    return {
        generatedAt: metadata.generatedAt ?? new Date().toISOString(), gitSha, testFileCount,
        migrations: { count: ids.length, last: ids[ids.length - 1], ids },
        routes, schemaVersion,
        deps: { runtime: Object.keys(pkg.dependencies).length, dev: Object.keys(pkg.devDependencies).length },
        areas, specs,
    };
};

export class AnchorError extends Error {
    constructor(id, reason) { super(`Anchor "${id}": ${reason}`); this.id = id; }
}

// Authoring rule (Global Constraints): imports single-line, exports are
// `export const|function|class` declarations only. That is all this handles.
export const stripModuleSyntax = (source) => source
    .replace(/^import[^\n]*;[ \t]*$/gm, '')
    .replace(/^export (const|function|class|let) /gm, '$1 ');

export const BROWSER_PREFERENCES_BUNDLE_START = '/* doctect-browser-preferences:start */';
export const BROWSER_PREFERENCES_BUNDLE_END = '/* doctect-browser-preferences:end */';

export const buildBrowserPreferencesBundle = (rootDir) => {
    const source = fs.readFileSync(path.join(rootDir, 'services/browserPreferences.ts'), 'utf8');
    const result = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
        },
        fileName: 'services/browserPreferences.ts',
        reportDiagnostics: true,
    });
    const errors = (result.diagnostics || []).filter(diagnostic =>
        diagnostic.category === ts.DiagnosticCategory.Error);
    if (errors.length) {
        throw new Error(ts.formatDiagnostics(errors, {
            getCanonicalFileName: fileName => fileName,
            getCurrentDirectory: () => rootDir,
            getNewLine: () => '\n',
        }));
    }
    const runtime = stripModuleSyntax(result.outputText).trim();
    const publicNames = [
        'readBrowserPreference',
        'writeBrowserPreference',
        'wasMigrationReceiptSeen',
        'markMigrationReceiptSeen',
    ].join(', ');
    return `${BROWSER_PREFERENCES_BUNDLE_START}\n` +
        `const { ${publicNames} } = (() => {\n${runtime}\n` +
        `return { ${publicNames} };\n})();\n` +
        BROWSER_PREFERENCES_BUNDLE_END;
};

export const bundleDiffEngine = (rootDir) => {
    const meta = fs.readFileSync(path.join(rootDir, 'shared/generatorMetadata.js'), 'utf8');
    const diff = fs.readFileSync(path.join(rootDir, 'shared/diff.js'), 'utf8');
    return `window.DoctectDiff = (() => {\n${stripModuleSyntax(meta)}\n${stripModuleSyntax(diff)}\n` +
        `return { stableStringify, computeChangeSet, threeWayDiff, applyChangeSet };\n})();\n`;
};

const countOccurrences = (haystack, needle) => haystack.split(needle).length - 1;

export const extractExcerpts = (rootDir, anchors) => anchors.map(anchor => {
    const abs = path.join(rootDir, anchor.file);
    if (!fs.existsSync(abs)) throw new AnchorError(anchor.id, `file not found: ${anchor.file}`);
    const source = fs.readFileSync(abs, 'utf8');
    const n = countOccurrences(source, anchor.start);
    if (n === 0) throw new AnchorError(anchor.id, `start not found in ${anchor.file}`);
    if (n > 1) throw new AnchorError(anchor.id, `start matches ${n} times in ${anchor.file} — not unique`);
    const lines = source.split('\n');
    const startLine = lines.findIndex(l => l.includes(anchor.start));
    let endLine;
    if (anchor.lines) {
        endLine = startLine + anchor.lines;
    } else {
        const rel = lines.slice(startLine + 1).findIndex(l => l.includes(anchor.end));
        if (rel === -1) throw new AnchorError(anchor.id, `end not found after start in ${anchor.file}`);
        endLine = startLine + 1 + rel;
    }
    return { id: anchor.id, file: anchor.file, startLine: startLine + 1,
             code: lines.slice(startLine, endLine).join('\n') };
});

export const RUNTIME_MODULES = [
    'src/app-logic.mjs',
    'src/render/introWin.mjs', 'src/render/toursWin.mjs',
    'src/render/codeWin.mjs', 'src/render/playgroundWin.mjs',
    'src/app.js',
];

export const buildRuntimeBundle = (rootDir) => [
    buildBrowserPreferencesBundle(rootDir),
    ...RUNTIME_MODULES
        .map(rel => stripModuleSyntax(fs.readFileSync(path.join(rootDir, 'onboarding', rel), 'utf8'))),
].join('\n');

export const assemblePage = ({ style, runtime, dataJson, contentJson, diffBundle, footerHtml }) => {
    const shell = fs.readFileSync(path.join(HERE, 'src/shell.html'), 'utf8');
    return shell
        .replace('<!--SLOT:STYLE-->', () => style)
        .replace('<!--SLOT:DATA-->', () => `window.DOCTECT = {data: ${dataJson}, content: ${contentJson}};`)
        .replace('<!--SLOT:DIFF-->', () => diffBundle)
        .replace('<!--SLOT:RUNTIME-->', () => `(() => {\n${runtime}\n})();`)
        .replace('<!--SLOT:FOOTER-->', () => footerHtml);
};

export const buildContent = async () => {
    const { INTRO } = await import('./src/content/intro.mjs');
    const { TOURS } = await import('./src/content/tours.mjs');
    const { CODE_MAP } = await import('./src/content/code-map.mjs');
    const { PLAYGROUND } = await import('./src/content/playground.mjs');
    return { intro: INTRO, tours: TOURS, codeMap: CODE_MAP, playground: PLAYGROUND };
};

export const buildData = (rootDir, anchors = [], metadata = {}) => {
    const tree = scanTree(rootDir);
    return { tree, vitals: collectVitals(rootDir, tree, metadata), excerpts: extractExcerpts(rootDir, anchors) };
};

export const buildRefs = (rootDir) => {
    const tree = scanTree(rootDir);
    const filePaths = new Set();
    const dirPaths = new Set();
    const walk = (n) => {
        if (n.kind === 'file') filePaths.add(n.path);
        else { if (n.path) dirPaths.add(n.path); (n.children || []).forEach(walk); }
    };
    walk(tree);
    return { filePaths, dirPaths,
             specFiles: new Set(fs.readdirSync(path.join(rootDir, 'docs/superpowers/specs'))) };
};

export const main = async () => {
    const content = await buildContent();
    const { validateContent } = await import('./src/content/validate.mjs');
    const errors = validateContent(content, buildRefs(REPO_ROOT));
    if (errors.length) {
        console.error('Content validation failed:\n' + errors.map(e => `  - ${e}`).join('\n'));
        process.exit(1);
    }
    const data = buildData(REPO_ROOT, content.codeMap.anchors);
    const html = assemblePage({
        style: fs.readFileSync(path.join(HERE, 'src/style.css'), 'utf8'),
        runtime: buildRuntimeBundle(REPO_ROOT),
        // <-escape so no code excerpt or story containing "</script" (or any
        // tag) can terminate the inline <script> block. Valid JSON, parses identically.
        dataJson: JSON.stringify(data).replace(/</g, '\\u003c'),
        contentJson: JSON.stringify(content).replace(/</g, '\\u003c'),
        diffBundle: bundleDiffEngine(REPO_ROOT),
        footerHtml: `generated ${data.vitals.generatedAt} @ ${data.vitals.gitSha}`,
    });
    fs.writeFileSync(path.join(HERE, 'index.html'), html);
    console.log(`onboarding/index.html written (${(html.length / 1024).toFixed(0)} KB, @${data.vitals.gitSha})`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
