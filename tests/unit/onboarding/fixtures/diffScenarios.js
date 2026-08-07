// tests/unit/onboarding/fixtures/diffScenarios.js
// Small DiffStates exercising the real shared/diff.js engine. Reused by the
// Merge Lab presets (content/playground.mjs) — keep names in sync with it.
const base = () => ({
    nodes: { root: { id: 'root', name: 'Planner', children: ['week'] },
             week: { id: 'week', name: 'Week 1', children: [] } },
    rootId: 'root',
    variants: {
        weekly: { name: 'Weekly', templates: {
            day:   { id: 'day', elements: [{ type: 'text', text: 'Day', x: 10, y: 10 }] },
            notes: { id: 'notes', elements: [{ type: 'rect', x: 0, y: 0, w: 100, h: 40 }] },
        } },
    },
});

const withTemplate = (state, vid, tid, template) => {
    const next = JSON.parse(JSON.stringify(state));
    next.variants[vid].templates[tid] = template;
    return next;
};
const withoutTemplate = (state, vid, tid) => {
    const next = JSON.parse(JSON.stringify(state));
    delete next.variants[vid].templates[tid];
    return next;
};
const gen = (marker) => ({ formatVersion: 1, templateScript: `// ${marker}`,
    hierarchyScript: '// h', generatedAt: '2026-08-07T00:00:00.000Z' });

export const DIFF_SCENARIOS = [
    {
        name: 'clean-merge',
        base: base(),
        fork: withTemplate(base(), 'weekly', 'day',
            { id: 'day', elements: [{ type: 'text', text: 'Day (fork)', x: 10, y: 10 }] }),
        upstream: (() => { const s = base(); s.variants.weekly.name = 'Weekly v2'; return s; })(),
    },
    {
        name: 'same-template-conflict',
        base: base(),
        fork: withTemplate(base(), 'weekly', 'day',
            { id: 'day', elements: [{ type: 'text', text: 'Fork edit', x: 1, y: 1 }] }),
        upstream: withTemplate(base(), 'weekly', 'day',
            { id: 'day', elements: [{ type: 'text', text: 'Upstream edit', x: 2, y: 2 }] }),
    },
    {
        name: 'remove-vs-modify',
        base: base(),
        fork: withoutTemplate(base(), 'weekly', 'notes'),
        upstream: withTemplate(base(), 'weekly', 'notes',
            { id: 'notes', elements: [{ type: 'rect', x: 5, y: 5, w: 90, h: 30 }] }),
    },
    {
        name: 'variant-added-both-sides',
        base: base(),
        fork: (() => { const s = base(); s.variants.daily = { name: 'Daily', templates: {
            morning: { id: 'morning', elements: [] } } }; return s; })(),
        upstream: (() => { const s = base(); s.variants.daily = { name: 'Daily', templates: {
            evening: { id: 'evening', elements: [] } } }; return s; })(),
    },
    {
        name: 'generator-conflict',
        base: (() => { const s = base(); s.generator = gen('base'); return s; })(),
        fork: (() => { const s = base(); s.generator = gen('fork'); return s; })(),
        upstream: (() => { const s = base(); s.generator = gen('upstream'); return s; })(),
    },
];
