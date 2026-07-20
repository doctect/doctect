import {
    type DocsIndex, TRACK_LABELS, CATEGORY_LABELS, slugifyHeading,
} from './docsContent';
import { docsIndex } from './docsContentIndex';

export interface DocsSearchResult {
    type: 'reference' | 'tutorial';
    title: string;
    url: string;
    badge: string;
    snippet: string;
    score: number;
}

interface IndexedDoc {
    type: 'reference' | 'tutorial';
    title: string;
    titleLower: string;
    titleTokens: string[];
    url: string;
    badge: string;
    snippet: string;
    aliases: string[];        // lowercased
    keywords: string[];       // lowercased tokens
    headings: { anchor: string; tokens: string[] }[];
    bodyTokens: Set<string>;
}

export interface DocsSearchIndex { docs: IndexedDoc[] }

const tokenize = (s: string): string[] =>
    s.toLowerCase().split(/[^a-z0-9_{}]+/).filter(Boolean);

export function buildDocsSearchIndex(index: DocsIndex): DocsSearchIndex {
    const docs: IndexedDoc[] = [];
    for (const e of index.referenceEntries) {
        docs.push({
            type: 'reference',
            title: e.title,
            titleLower: e.title.toLowerCase(),
            titleTokens: tokenize(e.title),
            url: `/docs/reference/${e.slug}`,
            badge: CATEGORY_LABELS[e.category] ?? e.category,
            snippet: e.summary,
            aliases: e.aliases.map(a => a.toLowerCase()),
            keywords: e.keywords.flatMap(tokenize),
            headings: [],
            bodyTokens: new Set(tokenize(e.body)),
        });
    }
    for (const t of index.tutorials) {
        const headings = [...t.body.matchAll(/^#{2,4}\s+(.+)$/gm)]
            .map(m => ({ anchor: slugifyHeading(m[1]), tokens: tokenize(m[1]) }));
        docs.push({
            type: 'tutorial',
            title: t.title,
            titleLower: t.title.toLowerCase(),
            titleTokens: tokenize(t.title),
            url: `/docs/${t.track}/${t.slug}`,
            badge: TRACK_LABELS[t.track],
            snippet: t.summary,
            aliases: [],
            keywords: t.keywords.flatMap(tokenize),
            headings,
            bodyTokens: new Set(tokenize(t.body)),
        });
    }
    return { docs };
}

export function searchDocs(sIdx: DocsSearchIndex, query: string, limit = 10): DocsSearchResult[] {
    const phrase = query.trim().toLowerCase();
    if (!phrase) return [];
    const qTokens = tokenize(phrase);
    if (!qTokens.length) return [];

    const results: DocsSearchResult[] = [];
    for (const d of sIdx.docs) {
        let score = 0;
        let anchor: string | null = null;

        if (d.titleLower.includes(phrase)) score += 30;
        for (const a of d.aliases) {
            if (a === phrase) score += 25;
            else if (a.includes(phrase) || phrase.includes(a)) score += 15;
        }
        for (const q of qTokens) {
            for (const t of d.titleTokens) {
                if (t === q) { score += 12; break; }
                if (t.startsWith(q)) { score += 10; break; }
            }
            if (d.keywords.includes(q)) score += 8;
            for (const h of d.headings) {
                if (h.tokens.some(t => t === q || t.startsWith(q))) {
                    score += 5;
                    if (!anchor) anchor = h.anchor;
                    break;
                }
            }
            if (d.bodyTokens.has(q)) score += 2;
        }
        if (score <= 0) continue;
        if (d.type === 'reference') score *= 1.25;
        results.push({
            type: d.type,
            title: d.title,
            url: anchor && d.type === 'tutorial' ? `${d.url}#${anchor}` : d.url,
            badge: d.badge,
            snippet: d.snippet,
            score,
        });
    }
    results.sort((a, b) =>
        b.score - a.score
        || (a.type === b.type ? 0 : a.type === 'reference' ? -1 : 1)
        || a.title.localeCompare(b.title));
    return results.slice(0, limit);
}

let defaultIndex: DocsSearchIndex | null = null;
export function getDefaultSearchIndex(): DocsSearchIndex {
    // Lazy so the tokenize pass runs only when search is first used.
    // The module import above is static (pure ESM under Vite; `require` is
    // unavailable), but building the index from it is deferred to first call.
    if (!defaultIndex) {
        defaultIndex = buildDocsSearchIndex(docsIndex);
    }
    return defaultIndex;
}
