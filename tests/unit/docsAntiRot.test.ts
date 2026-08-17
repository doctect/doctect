import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { docsIndex } from '../../lib/docsContentIndex';
import { slugifyHeading } from '../../lib/docsContent';
import { classifyLocalStorageContext, localStorageStatements } from './storageCopyAntiRot';

const ROOT = path.resolve(__dirname, '../..');

const AUTHORITY_DOC_PATHS = [
    'docs/1-high-level-architecture.md',
    'docs/3-state-management.md',
    'docs/8-cloud-and-gallery.md',
] as const;

const markdownPathsUnder = (relativeDirectory: string): string[] => {
    const paths: string[] = [];
    for (const entry of fs.readdirSync(path.join(ROOT, relativeDirectory), { withFileTypes: true })) {
        const relativePath = path.posix.join(relativeDirectory, entry.name);
        if (entry.isDirectory()) {
            if (relativePath !== 'docs/superpowers') paths.push(...markdownPathsUnder(relativePath));
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
            paths.push(relativePath);
        }
    }
    return paths.sort();
};

const maintainedMarkdownPaths = (): string[] => [
    'README.md',
    'PRODUCT.md',
    ...markdownPathsUnder('docs'),
];

const readMarkdown = (relativePaths: readonly string[]): Record<string, string> =>
    Object.fromEntries(relativePaths.map(relativePath => [
        relativePath,
        fs.readFileSync(path.join(ROOT, relativePath), 'utf8'),
    ]));

const PROJECT_PREPARATION_ORDER = /\bsource[- ]shape validation\b[^.\n]{0,180}\bschema migration\b[^.\n]{0,180}\bfinal validation(?:\s+and\s+|\/)normalization\b[^.\n]{0,180}\bpersistence\b/i;

const allDocs = () => [
    ...docsIndex.tutorials.map(t => ({ id: `${t.track}/${t.slug}`, body: t.body })),
    ...docsIndex.referenceEntries.map(e => ({ id: `reference/${e.slug}`, body: e.body })),
];

const IMAGE_RE = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
// Links only (exclude images via negative lookbehind on '!')
const LINK_RE = /(?<!!)\[[^\]]*\]\((\/docs[^)#\s]*)(#[^)\s]+)?\)/g;

const headingAnchors = (body: string): Set<string> => {
    const anchors = new Set<string>();
    for (const m of body.matchAll(/^#{2,4}\s+(.+)$/gm)) anchors.add(slugifyHeading(m[1]));
    return anchors;
};

describe('docs anti-rot guards', () => {
    it('keeps top-level architecture docs on the IndexedDB authority model', () => {
        const docs = readMarkdown(AUTHORITY_DOC_PATHS);
        const corpus = Object.values(docs).join('\n');

        for (const [relativePath, body] of Object.entries(docs)) {
            expect(body, `${relativePath} must identify IndexedDB persistence`).toMatch(/\bIndexedDB\b/);
        }
        expect(corpus).toMatch(/\bIndexedDB\b[^.\n]{0,120}\b(?:document\s+)?authority\b/i);
        expect(corpus).toMatch(/\bLocalWorkspaceStore\b[^.\n]{0,120}\b(?:local\s+)?document authority\b/i);
        expect(corpus).toContain('WorkspaceBootstrapGate');
        expect(corpus).toContain('LocalWorkspaceStore');
        for (const method of ['bootstrap', 'commit', 'exportRecoveryBundle']) {
            expect(corpus, `missing LocalWorkspaceStore.${method}`).toContain(`\`${method}\``);
        }
        expect(corpus).toMatch(/\bsix\b[^.\n]{0,100}\bstores\b[^.\n]{0,120}\batomic/i);
        for (const store of [
            'projects', 'workspace', 'presets', 'pendingImports', 'migrationLedger', 'legacyBackup',
        ]) {
            expect(corpus, `missing IndexedDB store ${store}`).toContain(`\`${store}\``);
        }

        const stateDoc = docs['docs/3-state-management.md'];
        expect(stateDoc).toContain('useWorkspaceProjectWrites');
        expect(stateDoc).toMatch(/per-project[^.\n]{0,80}\bqueue|\bqueue[^.\n]{0,80}per-project/i);
        expect(stateDoc).toMatch(/compare-and-swap|\bCAS\b/);
        expect(stateDoc).toContain('loadProjectState');
        expect(stateDoc).toContain('migrateState');
        for (const relativePath of [
            'docs/1-high-level-architecture.md',
            'docs/3-state-management.md',
        ]) {
            expect(docs[relativePath], `${relativePath} must state project preparation order`)
                .toMatch(PROJECT_PREPARATION_ORDER);
        }

        const cloudDoc = docs['docs/8-cloud-and-gallery.md'];
        expect(cloudDoc).toMatch(/explicit(?:ly)?[^.\n]{0,50}opt-in|opt-in[^.\n]{0,50}explicit/i);
        expect(corpus).toMatch(/legacy[^.\n]{0,80}\blocalStorage\b[^.\n]{0,80}retained[^.\n]{0,40}only[^.\n]{0,40}read-only[^.\n]{0,120}(?:migration|recovery)/i);
        expect(corpus).toMatch(/\bno\b[^.\n]{0,80}\bcleanup\b/i);
        expect(corpus).toMatch(/\bno\b[^.\n]{0,80}\bfallback\b/i);
        expect(corpus).toMatch(/\bno\b[^.\n]{0,80}\bdual[- ]write\b/i);
    });

    it('allows localStorage in maintained Markdown only with explicit legitimate context', () => {
        const staleClaims = {
            README: 'Sign in to back any project with cloud-saved version history - entirely opt-in; local `localStorage` projects work exactly as before.',
            SavePreset: 'SavePresetModal cleans the project and persists the custom preset directly to localStorage for future initialization.',
            equivalentAuthority: 'Browser localStorage remains the home for every offline document.',
        };
        for (const [name, claim] of Object.entries(staleClaims)) {
            expect(classifyLocalStorageContext(claim), `stale fixture passed: ${name}`).toBeNull();
        }

        const legitimateClaims = {
            legacy: 'Legacy localStorage document keys remain read-only inputs for migration and recovery.',
            preference: 'localStorage holds only a non-document onboarding profile preference.',
            sandbox: 'The generator sandbox denies localStorage access.',
        };
        expect(Object.fromEntries(Object.entries(legitimateClaims).map(([name, claim]) => [
            name,
            classifyLocalStorageContext(claim),
        ]))).toEqual({
            legacy: 'legacy-read-only-migration-recovery',
            preference: 'non-document-preference',
            sandbox: 'sandbox-denial',
        });

        const paths = maintainedMarkdownPaths();
        expect(paths).toContain('README.md');
        expect(paths).toContain('PRODUCT.md');
        expect(paths.some(relativePath => relativePath.startsWith('docs/components/'))).toBe(true);
        expect(paths.some(relativePath => relativePath.startsWith('docs/superpowers/'))).toBe(false);

        const offenders = Object.entries(readMarkdown(paths)).flatMap(([relativePath, body]) =>
            localStorageStatements(body)
                .filter(statement => classifyLocalStorageContext(statement) === null)
                .map(statement => `${relativePath}: ${statement}`));
        expect(offenders, `localStorage mentions without explicit legitimate context:\n${offenders.join('\n')}`)
            .toEqual([]);
    });

    it('every referenced image exists under public/docs-assets or public/walkthroughs', () => {
        const missing: string[] = [];
        for (const d of allDocs()) {
            for (const m of d.body.matchAll(IMAGE_RE)) {
                const src = m[1];
                expect(src, `${d.id}: image "${src}" must be an absolute /docs-assets/ or /walkthroughs/ path`)
                    .toMatch(/^\/(docs-assets|walkthroughs)\//);
                if (!fs.existsSync(path.join(ROOT, 'public', src))) missing.push(`${d.id}: ${src}`);
            }
        }
        expect(missing, `missing image files:\n${missing.join('\n')}`).toEqual([]);
    });

    it('every internal /docs link resolves to a real page (and anchor when present)', () => {
        const broken: string[] = [];
        for (const d of allDocs()) {
            for (const m of d.body.matchAll(LINK_RE)) {
                const [, url, anchor] = m;
                let targetBody: string | null = null;
                if (url === '/docs' || url === '/docs/' || url === '/docs/reference') {
                    targetBody = ''; // structural pages, always exist
                } else {
                    const refMatch = url.match(/^\/docs\/reference\/([a-z0-9-]+)$/);
                    const tutMatch = url.match(/^\/docs\/([a-z-]+)\/([a-z0-9-]+)$/);
                    if (refMatch) {
                        const e = docsIndex.referenceBySlug.get(refMatch[1]);
                        if (e) targetBody = e.body;
                    } else if (tutMatch) {
                        const t = docsIndex.tutorialByPath.get(`${tutMatch[1]}/${tutMatch[2]}`);
                        if (t) targetBody = t.body;
                    }
                }
                if (targetBody === null) { broken.push(`${d.id}: ${url}`); continue; }
                if (anchor && targetBody !== '' && !headingAnchors(targetBody).has(anchor.slice(1))) {
                    broken.push(`${d.id}: ${url}${anchor} (anchor not found)`);
                }
            }
        }
        expect(broken, `broken internal links:\n${broken.join('\n')}`).toEqual([]);
    });

    it('content corpus parses (loader threw no error on import)', () => {
        expect(docsIndex.tutorials).toBeInstanceOf(Array);
        expect(docsIndex.referenceEntries).toBeInstanceOf(Array);
    });
});
