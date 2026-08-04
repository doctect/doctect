import { describe, it, expect } from 'vitest';
import { GalleryItem } from '../../services/cloudApi';
import { groupCatalog, pickSpotlight, dateKey, MIN_STRIP_ITEMS, StripDef } from '../../components/gallery/sections';

const item = (id: string, tags: string[]): GalleryItem => ({
    id, name: id, description: '', tags, author: 'a',
    forkCount: 0, downloadCount: 0, updatedAt: '2026-01-01',
    thumbnailId: null, thumbnailIds: [], ratingAvg: null, ratingCount: 0,
});

const strips: StripDef[] = [
    { key: 'plan', title: 'Plan', emoji: '📋', tags: ['planner', 'finance'] },
    { key: 'play', title: 'Play', emoji: '🎲', tags: ['games', 'planner'] },
];

describe('groupCatalog', () => {
    it('first strip claims a project; later strips cannot re-claim it', () => {
        const items = [item('a', ['planner']), item('b', ['planner']), item('c', ['games']), item('d', ['games'])];
        const g = groupCatalog(items, strips);
        expect(g.strips.map(s => s.def.key)).toEqual(['plan', 'play']);
        expect(g.strips[0].items.map(i => i.id)).toEqual(['a', 'b']);
        expect(g.strips[1].items.map(i => i.id)).toEqual(['c', 'd']); // not a/b again
        expect(g.leftover).toEqual([]);
    });

    it('tag matching is case-insensitive on the item side', () => {
        const g = groupCatalog([item('a', ['Planner']), item('b', ['PLANNER'])], strips);
        expect(g.strips[0]?.items.map(i => i.id)).toEqual(['a', 'b']);
    });

    it(`collapses strips with fewer than ${MIN_STRIP_ITEMS} matches into leftover`, () => {
        const items = [item('a', ['planner']), item('b', ['planner']), item('c', ['games'])];
        const g = groupCatalog(items, strips);
        expect(g.strips.map(s => s.def.key)).toEqual(['plan']); // play collapsed
        expect(g.leftover.map(i => i.id)).toEqual(['c']);
    });

    it('unmatched projects land in leftover in input (newest-first) order', () => {
        const items = [item('z', ['misc']), item('a', ['other'])];
        const g = groupCatalog(items, strips);
        expect(g.strips).toEqual([]);
        expect(g.leftover.map(i => i.id)).toEqual(['z', 'a']);
    });
});

describe('pickSpotlight', () => {
    const items = [item('a', []), item('b', []), item('c', []), item('d', []), item('e', [])];

    it('is stable for the same day key and catalog', () => {
        expect(pickSpotlight(items, '2026-08-04')).toBe(pickSpotlight(items, '2026-08-04'));
    });

    it('does not depend on catalog order', () => {
        const shuffled = [items[3], items[0], items[4], items[2], items[1]];
        expect(pickSpotlight(shuffled, '2026-08-04')?.id).toBe(pickSpotlight(items, '2026-08-04')?.id);
    });

    it('varies across days', () => {
        const picks = new Set(
            ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05',
             '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09', '2026-08-10']
                .map(k => pickSpotlight(items, k)?.id));
        expect(picks.size).toBeGreaterThan(1);
    });

    it('returns null on an empty catalog', () => {
        expect(pickSpotlight([], '2026-08-04')).toBeNull();
    });
});

describe('dateKey', () => {
    it('formats YYYY-MM-DD', () => {
        expect(dateKey(new Date('2026-08-04T15:30:00Z'))).toBe('2026-08-04');
    });
});
