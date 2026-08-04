import { GalleryItem } from '../../services/cloudApi';

export interface StripDef { key: string; title: string; emoji: string; tags: string[]; }

// Curated use-case strips. A strip's tags are the publishing convention for the
// flagship samples — publish flagships with tags from this list so they land in
// the intended strip. First strip to claim a project wins.
export const STRIPS: StripDef[] = [
    { key: 'plan', title: 'Plan & organize', emoji: '📋', tags: ['planner', 'planning', 'organization', 'productivity', 'finance', 'business'] },
    { key: 'track', title: 'Track & improve', emoji: '📈', tags: ['tracker', 'habits', 'fitness', 'wellness', 'learning', 'practice'] },
    { key: 'create', title: 'Create & reflect', emoji: '✍️', tags: ['journal', 'writing', 'creative', 'recipes', 'family'] },
    { key: 'play', title: 'Play & explore', emoji: '🎲', tags: ['games', 'adventure', 'travel', 'hobby', 'chess', 'astronomy'] },
];

// A one-card strip reads as broken; its matches fall through to the leftover grid.
export const MIN_STRIP_ITEMS = 2;

export interface GroupedCatalog {
    strips: { def: StripDef; items: GalleryItem[] }[];
    leftover: GalleryItem[];
}

export function groupCatalog(items: GalleryItem[], strips: StripDef[] = STRIPS): GroupedCatalog {
    const claimed = new Set<string>();
    const grouped = strips.map(def => {
        const matches = items.filter(i =>
            !claimed.has(i.id) && i.tags.some(t => def.tags.includes(t.toLowerCase())));
        matches.forEach(i => claimed.add(i.id));
        return { def, items: matches };
    });
    const kept = grouped.filter(g => g.items.length >= MIN_STRIP_ITEMS);
    const keptIds = new Set(kept.flatMap(g => g.items.map(i => i.id)));
    return { strips: kept, leftover: items.filter(i => !keptIds.has(i.id)) };
}

export function dateKey(now: Date): string {
    return now.toISOString().slice(0, 10);
}

// Deterministic daily pick: stable within a day, changes across days, and — via
// the id sort — independent of the API's result ordering. Spotlighting never
// removes a project from its strip (see spec).
export function pickSpotlight(items: GalleryItem[], key: string): GalleryItem | null {
    if (items.length === 0) return null;
    const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
    let hash = 0;
    for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return sorted[hash % sorted.length];
}
