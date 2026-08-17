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

    it.each(['file', 'directory'] as const)(
        'rejects non-Markdown %s symlinks encountered under maintained roots',
        kind => {
            const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doctect-docs-copy-'));
            try {
                fs.mkdirSync(path.join(temporaryRoot, 'docs'), { recursive: true });
                fs.mkdirSync(path.join(temporaryRoot, 'docs-content'), { recursive: true });
                fs.writeFileSync(path.join(temporaryRoot, 'README.md'), '# README\n');
                fs.writeFileSync(path.join(temporaryRoot, 'PRODUCT.md'), '# Product\n');
                const target = path.join(temporaryRoot, kind === 'file' ? 'outside.txt' : 'outside');
                if (kind === 'file') fs.writeFileSync(target, 'outside\n');
                else fs.mkdirSync(target);
                fs.symlinkSync(target, path.join(temporaryRoot, 'docs-content', 'linked'));

                expect(() => discoverMaintainedMarkdownPaths(temporaryRoot))
                    .toThrow(/symlink.*docs-content\/linked/i);
            } finally {
                fs.rmSync(temporaryRoot, { recursive: true, force: true });
            }
        },
    );

    it('rejects a maintained directory root that is itself a symlink', () => {
        const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doctect-docs-copy-'));
        try {
            fs.mkdirSync(path.join(temporaryRoot, 'docs'));
            fs.writeFileSync(path.join(temporaryRoot, 'README.md'), '# README\n');
            fs.writeFileSync(path.join(temporaryRoot, 'PRODUCT.md'), '# Product\n');
            const target = path.join(temporaryRoot, 'outside-docs-content');
            fs.mkdirSync(target);
            fs.writeFileSync(path.join(target, 'stale.md'), 'Projects live in localStorage.\n');
            fs.symlinkSync(target, path.join(temporaryRoot, 'docs-content'));

            expect(() => discoverMaintainedMarkdownPaths(temporaryRoot))
                .toThrow(/symlink.*docs-content/i);
        } finally {
            fs.rmSync(temporaryRoot, { recursive: true, force: true });
        }
    });

    it('rejects a repository root reached through a symlink', () => {
        const temporaryParent = fs.mkdtempSync(path.join(os.tmpdir(), 'doctect-docs-copy-'));
        try {
            const target = path.join(temporaryParent, 'repository');
            fs.mkdirSync(path.join(target, 'docs'), { recursive: true });
            fs.mkdirSync(path.join(target, 'docs-content'), { recursive: true });
            fs.writeFileSync(path.join(target, 'README.md'), '# README\n');
            fs.writeFileSync(path.join(target, 'PRODUCT.md'), '# Product\n');
            const linkedRoot = path.join(temporaryParent, 'linked-repository');
            fs.symlinkSync(target, linkedRoot);

            expect(() => discoverMaintainedMarkdownPaths(linkedRoot))
                .toThrow(/symlink.*maintained root/i);
        } finally {
            fs.rmSync(temporaryParent, { recursive: true, force: true });
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
            reviewLegacyDocumentKeys: 'Legacy localStorage document keys are read-only migration inputs, but they still store every project.',
            reviewLegacyThoseKeys: 'Legacy browser storage keys are read-only during migration, but those keys remain project authority.',
            reviewLegacyWorkspace: 'Legacy localStorage is read-only during migration, but it still stores the workspace.',
            reviewLegacyBacks: 'Legacy localStorage is read-only during migration, but it still backs every project.',
            reviewPreferenceWorkspace: 'localStorage stores only a non-document preference, but it remains workspace authority.',
            reviewSandboxThere: 'The sandbox denies localStorage access, but the editor persists its workspace there.',
        };

        expect(Object.fromEntries(Object.entries(staleClaims).map(([name, claim]) => [
            name,
            classifyLocalStorageContext(claim),
        ]))).toEqual(Object.fromEntries(Object.keys(staleClaims).map(name => [name, null])));

        const crossSentenceClaim = 'Legacy localStorage document keys are read-only during migration. They still store every project.';
        expect(localStorageStatements(crossSentenceClaim)).toEqual([crossSentenceClaim]);
        expect(classifyLocalStorageContext(crossSentenceClaim)).toBeNull();
    });

    it('rejects bounded storage-reference, entity, action, and authority variants', () => {
        const staleClaims = {
            it: 'Legacy localStorage is read-only during migration, but it stores every project.',
            they: 'Legacy localStorage keys are read-only during migration, but they store every project.',
            them: 'Legacy localStorage keys are read-only during migration, but the editor saves every project to them.',
            thoseKeys: 'Legacy localStorage keys are read-only during migration, but those keys hold every project.',
            theseKeys: 'Legacy localStorage keys are read-only during migration, but these keys contain every project.',
            there: 'Legacy localStorage is read-only during migration, but every project lives there.',
            thatStorage: 'Legacy localStorage is read-only during migration, but that storage keeps every project.',
            document: 'Legacy localStorage is read-only during migration, but it stores every document.',
            preset: 'Legacy localStorage is read-only during migration, but it stores every preset.',
            workspace: 'Legacy localStorage is read-only during migration, but it stores every workspace.',
            editorState: 'Legacy localStorage is read-only during migration, but it stores editor state.',
            appState: 'Legacy localStorage is read-only during migration, but it stores app state.',
            design: 'Legacy localStorage is read-only during migration, but it stores every design.',
            storing: 'Legacy localStorage is read-only during migration, but it is storing every project.',
            saved: 'Legacy localStorage is read-only during migration, but it saved every project.',
            persists: 'Legacy localStorage is read-only during migration, but it persists every project.',
            written: 'Legacy localStorage is read-only during migration, but it has written every project.',
            reads: 'Legacy localStorage is read-only during migration, but it reads every project.',
            lived: 'Legacy localStorage is read-only during migration, but every project lived there.',
            residing: 'Legacy localStorage is read-only during migration, but every project is residing there.',
            keeps: 'Legacy localStorage is read-only during migration, but it keeps every project.',
            held: 'Legacy localStorage is read-only during migration, but it held every project.',
            contains: 'Legacy localStorage is read-only during migration, but it contains every project.',
            backing: 'Legacy localStorage is read-only during migration, but it is backing every project.',
            referenceBetweenEntityAndAction: 'Legacy localStorage is read-only during migration, but projects in that storage persist.',
            remainsAuthority: 'Legacy localStorage is read-only during migration, but it remains project authority.',
            isHome: 'Legacy localStorage is read-only during migration, but it is the home for every project.',
            actsAsSourceOfTruth: 'Legacy localStorage is read-only during migration, but it acts as source of truth for every project.',
            referenceBetweenEntityAndAuthority: 'Legacy localStorage is read-only during migration, but every project remains in that storage as its home.',
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
            oldStorageConsulted: 'Old browser storage is consulted only during migration and recovery; it is never written.',
            preference: 'localStorage stores only a non-document onboarding profile preference.',
            onboardingProfile: 'An onboarding-profile preference is the only value stored in local storage.',
            onboardingFlags: 'Browser storage retains onboarding flags only.',
            sandbox: 'Your code runs in a disposable generator sandbox where localStorage is explicitly blanked out.',
            sandboxStorageDenial: 'The generator sandbox blanks local storage and denies all browser storage access.',
            isolatedWorker: 'Browser storage is disabled in the isolated worker.',
        };
        expect(Object.fromEntries(Object.entries(legitimateClaims).map(([name, claim]) => [
            name,
            classifyLocalStorageContext(claim),
        ]))).toEqual({
            legacy: 'legacy-read-only-migration-recovery',
            legacyNeverWritten: 'legacy-read-only-migration-recovery',
            legacyAfterIndexedDb: 'legacy-read-only-migration-recovery',
            oldStorageConsulted: 'legacy-read-only-migration-recovery',
            preference: 'non-document-preference',
            onboardingProfile: 'non-document-preference',
            onboardingFlags: 'non-document-preference',
            sandbox: 'sandbox-denial',
            sandboxStorageDenial: 'sandbox-denial',
            isolatedWorker: 'sandbox-denial',
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
