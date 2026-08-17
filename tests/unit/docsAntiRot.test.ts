import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { docsIndex } from '../../lib/docsContentIndex';
import { slugifyHeading } from '../../lib/docsContent';
import {
    classifyLocalStorageContext,
    discoverMaintainedMarkdownPaths,
    localStorageStatements,
} from './storageCopyAntiRot';

const ROOT = path.resolve(__dirname, '../..');

const AUTHORITY_DOC_PATHS = [
    'docs/1-high-level-architecture.md',
    'docs/3-state-management.md',
    'docs/8-cloud-and-gallery.md',
] as const;

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
    it('discovers every maintained Markdown root recursively except historical docs', () => {
        const paths = discoverMaintainedMarkdownPaths(ROOT);

        expect(paths).toContain('README.md');
        expect(paths).toContain('PRODUCT.md');
        expect(paths).toContain('docs/components/Modals.md');
        expect(paths).toContain('docs-content/README.md');
        expect(paths).toContain('docs-content/tutorials/getting-started/01-what-is-pdf-architect.md');
        expect(paths).toContain('docs-content/reference/editor/save-preset.md');
        expect(paths.some(relativePath => relativePath.startsWith('docs/superpowers/'))).toBe(false);
    });

    it('rejects Markdown symlinks instead of silently skipping maintained copy', () => {
        const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doctect-docs-copy-'));
        try {
            fs.mkdirSync(path.join(temporaryRoot, 'docs'), { recursive: true });
            fs.mkdirSync(path.join(temporaryRoot, 'docs-content'), { recursive: true });
            fs.writeFileSync(path.join(temporaryRoot, 'README.md'), '# README\n');
            fs.writeFileSync(path.join(temporaryRoot, 'PRODUCT.md'), '# Product\n');
            const target = path.join(temporaryRoot, 'outside.md');
            fs.writeFileSync(target, '# Outside\n');
            fs.symlinkSync(target, path.join(temporaryRoot, 'docs-content', 'linked.md'));

            expect(() => discoverMaintainedMarkdownPaths(temporaryRoot))
                .toThrow(/Markdown symlink.*docs-content\/linked\.md/i);
        } finally {
            fs.rmSync(temporaryRoot, { recursive: true, force: true });
        }
    });

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

    it('detects storage spelling variants and every exact legacy document key', () => {
        const legacyDocumentKeys = [
            ['hype', 'projects'].join('_'),
            ['hype', 'active', 'project'].join('_'),
            ['hype', 'custom', 'presets'].join('_'),
            ['hype', 'import', 'pending'].join('_'),
        ];
        const claims = {
            camelCase: 'Projects persist in localStorage on every edit.',
            spaced: 'Projects persist in local storage on every edit.',
            browserStorage: 'Every offline document lives in browser storage.',
            possessiveBrowserStorage: "Every custom preset lives in the browser's storage.",
            webStorage: 'Web Storage remains project authority.',
            ...Object.fromEntries(legacyDocumentKeys.map((key, index) => [
                `legacyDocumentKey${index}`,
                `${key} remains active project storage.`,
            ])),
        };

        expect(Object.fromEntries(Object.entries(claims).map(([name, claim]) => [
            name,
            localStorageStatements(claim),
        ]))).toEqual(Object.fromEntries(Object.entries(claims).map(([name, claim]) => [
            name,
            [claim],
        ])));
    });

    it('rejects active project storage claims before narrow legitimate contexts', () => {
        const staleClaims = {
            README: 'Sign in to back any project with cloud-saved version history - entirely opt-in; local `localStorage` projects work exactly as before.',
            SavePreset: 'SavePresetModal cleans the project and persists the custom preset directly to localStorage for future initialization.',
            equivalentAuthority: 'Browser localStorage remains the home for every offline document.',
            reviewMixedLegacy: 'Legacy localStorage is read-only for migration, but localStorage remains project authority',
            reviewMixedPreference: 'localStorage stores a non-document preference and every project',
            reviewMixedSandbox: 'The sandbox denies localStorage access, while the editor persists projects there',
            mixedLegacyPronoun: 'Legacy localStorage is read-only for migration, but it still stores every project',
            mixedPreferencePronoun: 'localStorage stores only a non-document preference, but it remains preset authority',
            mixedSandboxPronoun: 'The sandbox denies localStorage access, but it remains document authority for the editor',
        };

        expect(Object.fromEntries(Object.entries(staleClaims).map(([name, claim]) => [
            name,
            classifyLocalStorageContext(claim),
        ]))).toEqual(Object.fromEntries(Object.keys(staleClaims).map(name => [name, null])));
    });

    it('recognizes explicit legacy, preference, and sandbox contexts', () => {
        const legitimateClaims = {
            legacy: 'Legacy localStorage document keys remain read-only inputs for migration and recovery.',
            legacyNeverWritten: 'Legacy browser storage is a migration and recovery source and is never written.',
            legacyAfterIndexedDb: 'Projects persist in IndexedDB; legacy browser storage is read only during migration.',
            preference: 'localStorage stores only a non-document onboarding profile preference.',
            onboardingProfile: 'An onboarding-profile preference is the only value stored in local storage.',
            sandbox: 'Your code runs in a disposable generator sandbox where localStorage is explicitly blanked out.',
            sandboxStorageDenial: 'The generator sandbox blanks local storage and denies all browser storage access.',
        };
        expect(Object.fromEntries(Object.entries(legitimateClaims).map(([name, claim]) => [
            name,
            classifyLocalStorageContext(claim),
        ]))).toEqual({
            legacy: 'legacy-read-only-migration-recovery',
            legacyNeverWritten: 'legacy-read-only-migration-recovery',
            legacyAfterIndexedDb: 'legacy-read-only-migration-recovery',
            preference: 'non-document-preference',
            onboardingProfile: 'non-document-preference',
            sandbox: 'sandbox-denial',
            sandboxStorageDenial: 'sandbox-denial',
        });
    });

    it('allows storage mentions in maintained Markdown only with explicit legitimate context', () => {
        const paths = discoverMaintainedMarkdownPaths(ROOT);
        expect(paths).toContain('README.md');
        expect(paths).toContain('PRODUCT.md');
        expect(paths.some(relativePath => relativePath.startsWith('docs/components/'))).toBe(true);
        expect(paths.some(relativePath => relativePath.startsWith('docs-content/tutorials/'))).toBe(true);
        expect(paths.some(relativePath => relativePath.startsWith('docs-content/reference/'))).toBe(true);
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
