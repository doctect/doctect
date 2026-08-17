import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { docsIndex } from '../../lib/docsContentIndex';
import { slugifyHeading } from '../../lib/docsContent';

const ROOT = path.resolve(__dirname, '../..');

const ARCHITECTURE_DOC_PATHS = [
    'docs/1-high-level-architecture.md',
    'docs/3-state-management.md',
    'docs/8-cloud-and-gallery.md',
] as const;

const ACTIVE_LOCAL_STORAGE_SUBJECT = /\b(?:projects?|project state|documents?|editor)\b/i;
const ACTIVE_LOCAL_STORAGE_VERB = /\b(?:live|lives|persist|persists|persisted|save|saves|saved|read|reads|write|writes|written|runs? against)\b(?!-)/i;
const claimsActiveLocalStorageAuthority = (sentence: string): boolean =>
    /\blocalStorage\b/i.test(sentence)
    && ((ACTIVE_LOCAL_STORAGE_SUBJECT.test(sentence) && ACTIVE_LOCAL_STORAGE_VERB.test(sentence))
        || /\bpure\s+`?localStorage`?\b/i.test(sentence));

const sentencesOf = (body: string): string[] =>
    body.split(/(?<=[.!?])\s+|\n+/).map(sentence => sentence.trim()).filter(Boolean);

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
        const docs = Object.fromEntries(ARCHITECTURE_DOC_PATHS.map(relativePath => [
            relativePath,
            fs.readFileSync(path.join(ROOT, relativePath), 'utf8'),
        ]));
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

        const cloudDoc = docs['docs/8-cloud-and-gallery.md'];
        expect(cloudDoc).toMatch(/explicit(?:ly)?[^.\n]{0,50}opt-in|opt-in[^.\n]{0,50}explicit/i);
        expect(corpus).toMatch(/legacy[^.\n]{0,80}\blocalStorage\b[^.\n]{0,80}retained[^.\n]{0,40}only[^.\n]{0,40}read-only[^.\n]{0,120}(?:migration|recovery)/i);
        expect(corpus).toMatch(/\bno\b[^.\n]{0,80}\bcleanup\b/i);
        expect(corpus).toMatch(/\bno\b[^.\n]{0,80}\bfallback\b/i);
        expect(corpus).toMatch(/\bno\b[^.\n]{0,80}\bdual[- ]write\b/i);

        const staleClaims = [
            'Projects live in localStorage.',
            'EditorPage reads all saved projects from localStorage.',
            'Project state is persisted in localStorage.',
            'The whole editor runs against one JSON document in localStorage.',
            'A project without cloud metadata uses pure localStorage.',
        ];
        expect(staleClaims.every(claimsActiveLocalStorageAuthority)).toBe(true);
        const offenders = Object.entries(docs).flatMap(([relativePath, body]) =>
            sentencesOf(body)
                .filter(claimsActiveLocalStorageAuthority)
                .map(sentence => `${relativePath}: ${sentence}`));
        expect(offenders, `active localStorage claims:\n${offenders.join('\n')}`).toEqual([]);
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
