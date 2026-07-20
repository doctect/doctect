import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { docsIndex } from '../../lib/docsContentIndex';
import { slugifyHeading } from '../../lib/docsContent';

const ROOT = path.resolve(__dirname, '../..');

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
