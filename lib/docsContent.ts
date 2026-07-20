export type DocTrack = 'getting-started' | 'editor' | 'generator' | 'gallery';
export type DocDifficulty = 'beginner' | 'intermediate' | 'advanced';

export const TRACK_ORDER: DocTrack[] = ['getting-started', 'editor', 'generator', 'gallery'];

export const TRACK_LABELS: Record<DocTrack, string> = {
    'getting-started': 'Getting Started',
    editor: 'Editor',
    generator: 'Generator',
    gallery: 'Gallery & Collaboration',
};

export const CATEGORY_ORDER: string[] = [
    'canvas-tools', 'shortcuts', 'element-properties', 'grid', 'linking',
    'binding', 'layers', 'editor', 'generator', 'cloud',
];

export const CATEGORY_LABELS: Record<string, string> = {
    'canvas-tools': 'Canvas Tools',
    shortcuts: 'Keyboard Shortcuts',
    'element-properties': 'Element Properties',
    grid: 'Grid Configuration',
    linking: 'Linking',
    binding: 'Data Binding',
    layers: 'Layers',
    editor: 'Editor & Workspace',
    generator: 'Generator API',
    cloud: 'Cloud & Gallery',
};

export interface DocTutorial {
    kind: 'tutorial';
    track: DocTrack;
    slug: string;
    order: number;
    title: string;
    difficulty: DocDifficulty;
    time: string;
    summary: string;
    keywords: string[];
    prerequisites: string[];
    body: string;
}

export interface DocReferenceEntry {
    kind: 'reference';
    category: string;
    slug: string;
    title: string;
    summary: string;
    keywords: string[];
    aliases: string[];
    body: string;
}

export interface DocsIndex {
    tutorials: DocTutorial[];
    referenceEntries: DocReferenceEntry[];
    tutorialByPath: Map<string, DocTutorial>;
    referenceBySlug: Map<string, DocReferenceEntry>;
}

export function slugifyHeading(text: string): string {
    return text
        .toLowerCase()
        .trim()
        .replace(/[`*_~]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

export function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!m) return { meta: {}, body: raw };
    const meta: Record<string, string> = {};
    for (const line of m[1].split(/\r?\n/)) {
        if (!line.trim() || line.trim().startsWith('#')) continue;
        const idx = line.indexOf(':');
        if (idx === -1) continue;
        meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    return { meta, body: raw.slice(m[0].length) };
}

const list = (v: string | undefined): string[] =>
    (v ?? '').split(',').map(s => s.trim()).filter(Boolean);

const DIFFICULTIES: DocDifficulty[] = ['beginner', 'intermediate', 'advanced'];
const TUTORIAL_PATH = /(?:^|\/)tutorials\/([a-z-]+)\/(\d+)-([a-z0-9-]+)\.md$/;
const REFERENCE_PATH = /(?:^|\/)reference\/([a-z0-9-]+)\/([a-z0-9-]+)\.md$/;

export function parseDocsContent(files: Record<string, string>): DocsIndex {
    const errors: string[] = [];
    const tutorials: DocTutorial[] = [];
    const referenceEntries: DocReferenceEntry[] = [];
    const tutorialByPath = new Map<string, DocTutorial>();
    const referenceBySlug = new Map<string, DocReferenceEntry>();

    for (const [path, raw] of Object.entries(files)) {
        const tm = path.match(TUTORIAL_PATH);
        const rm = path.match(REFERENCE_PATH);
        if (!tm && !rm) continue; // e.g. docs-content/README.md

        const { meta, body } = parseFrontmatter(raw);
        const require = (field: string): string => {
            const v = (meta[field] ?? '').trim();
            if (!v) errors.push(`${path}: missing required frontmatter field "${field}"`);
            return v;
        };

        if (tm) {
            const [, track, orderStr, slug] = tm;
            if (!(TRACK_ORDER as string[]).includes(track)) {
                errors.push(`${path}: unknown track "${track}"`);
                continue;
            }
            const difficulty = require('difficulty') as DocDifficulty;
            if (difficulty && !DIFFICULTIES.includes(difficulty)) {
                errors.push(`${path}: invalid difficulty "${difficulty}"`);
            }
            const t: DocTutorial = {
                kind: 'tutorial',
                track: track as DocTrack,
                slug,
                order: parseInt(orderStr, 10),
                title: require('title'),
                difficulty,
                time: require('time'),
                summary: require('summary'),
                keywords: list(meta.keywords),
                prerequisites: list(meta.prerequisites),
                body,
            };
            const key = `${t.track}/${t.slug}`;
            if (tutorialByPath.has(key)) errors.push(`${path}: duplicate tutorial slug "${key}"`);
            tutorialByPath.set(key, t);
            tutorials.push(t);
        } else if (rm) {
            const [, category, slug] = rm;
            if (!CATEGORY_ORDER.includes(category)) {
                errors.push(`${path}: unknown reference category "${category}"`);
                continue;
            }
            const e: DocReferenceEntry = {
                kind: 'reference',
                category,
                slug,
                title: require('title'),
                summary: require('summary'),
                keywords: list(meta.keywords),
                aliases: list(meta.aliases),
                body,
            };
            if (referenceBySlug.has(slug)) errors.push(`${path}: duplicate reference slug "${slug}"`);
            referenceBySlug.set(slug, e);
            referenceEntries.push(e);
        }
    }

    for (const t of tutorials) {
        for (const p of t.prerequisites) {
            if (!tutorialByPath.has(p)) {
                errors.push(`${t.track}/${t.slug}: unresolvable prerequisite "${p}"`);
            }
        }
    }

    if (errors.length) throw new Error(`docs-content validation failed:\n${errors.join('\n')}`);

    tutorials.sort((a, b) =>
        TRACK_ORDER.indexOf(a.track) - TRACK_ORDER.indexOf(b.track) || a.order - b.order);
    referenceEntries.sort((a, b) =>
        CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.title.localeCompare(b.title));

    return { tutorials, referenceEntries, tutorialByPath, referenceBySlug };
}
