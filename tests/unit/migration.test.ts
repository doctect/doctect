import { describe, it, expect } from 'vitest';
import { migrateState, CURRENT_SCHEMA_VERSION, needsMigration } from '../../services/migration';
import { createBlankProject, createNotebookProject, createPlannerProject, loadPreset } from '../../services/presets';

const el = (id: string, zIndex?: number) => ({
    id, type: 'rect', x: 0, y: 0, w: 10, h: 10, rotation: 0,
    fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1,
    ...(zIndex !== undefined ? { zIndex } : {})
});

const v7State = () => ({
    schemaVersion: 7,
    nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
    rootId: 'root',
    activeVariantId: 'default',
    variants: {
        default: { id: 'default', name: 'Default', templates: {
            page: { id: 'page', name: 'Page', width: 500, height: 700, elements: [el('a', 5), el('b')] },
        } },
        tablet: { id: 'tablet', name: 'Tablet', templates: {
            page: { id: 'page', name: 'Page', width: 800, height: 600, elements: [el('c', 2)] },
        } },
    },
});

const validV8State = () => ({
    ...v7State(),
    schemaVersion: 8,
});

const validLegacyV0State = () => ({
    nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
    rootId: 'root',
    templates: { page: { id: 'page', name: 'Page', width: 500, height: 700, elements: [el('a')] } },
});

const source = {
    formatVersion: 1 as const,
    templateScript: 'const café = "☕";\nreturn {};',
    hierarchyScript: 'return { nodes: {}, rootId: "root" };\n',
    generatedAt: '2026-07-13T12:00:00.000Z',
};

describe('migrateV7ToV8', () => {
    it('continues to the current schema version', () => {
        expect(CURRENT_SCHEMA_VERSION).toBe(10);
    });

    it('creates exactly one default "Layer 1" per template across all variants and tags every element', () => {
        const out: any = migrateState(v7State());
        expect(out.schemaVersion).toBe(10);
        for (const variant of Object.values<any>(out.variants)) {
            for (const tpl of Object.values<any>(variant.templates)) {
                expect(tpl.layers).toHaveLength(1);
                expect(tpl.layers[0]).toMatchObject({ name: 'Layer 1', order: 0, visible: true, locked: false });
                tpl.elements.forEach((e: any) => expect(e.layerId).toBe(tpl.layers[0].id));
            }
        }
    });

    it('preserves zIndex values untouched (migrated document renders identically)', () => {
        const out: any = migrateState(v7State());
        const els = out.variants.default.templates.page.elements;
        expect(els.find((e: any) => e.id === 'a').zIndex).toBe(5);
        expect(els.find((e: any) => e.id === 'b').zIndex).toBeUndefined();
    });

    it('covers the legacy flat templates structure (pre-v4 states)', () => {
        const legacy: any = {
            schemaVersion: 3,
            nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
            rootId: 'root',
            templates: { page: { id: 'page', name: 'Page', width: 500, height: 700, elements: [el('a', 1)] } },
        };
        const out: any = migrateState(legacy);
        expect(out.schemaVersion).toBe(10);
        const tpl = out.variants.default.templates.page;
        expect(tpl.layers).toHaveLength(1);
        expect(tpl.elements[0].layerId).toBe(tpl.layers[0].id);
    });

    it('is idempotent (re-running the transform changes nothing, keeps the same layer ids)', () => {
        const once: any = migrateState(v7State());
        const rerun: any = migrateState({ ...JSON.parse(JSON.stringify(once)), schemaVersion: 7 });
        expect(rerun.variants).toEqual(once.variants);
    });

    it('does not mutate its input', () => {
        const input = v7State();
        const snapshot = JSON.parse(JSON.stringify(input));
        migrateState(input);
        expect(input).toEqual(snapshot);
    });
});

describe('migrateV8ToV9', () => {
    it('preserves optional generator provenance without mutating input and remains idempotent', () => {
        const input = { ...validV8State(), generator: source, schemaVersion: 8 };
        const before = structuredClone(input);
        const output = migrateState(input);

        expect(CURRENT_SCHEMA_VERSION).toBe(10);
        expect(output.schemaVersion).toBe(10);
        expect(output.generator).toEqual(source);
        expect(input).toEqual(before);
        expect(migrateState(structuredClone(output))).toEqual(output);
        expect(migrateState(validV8State()).generator).toBeUndefined();
        expect(migrateState(validLegacyV0State()).schemaVersion).toBe(10);
    });
});

const overflowElements = (prefix: string) => [
    { ...el(`${prefix}-fixed`), type: 'text', autoWidth: false, textOverflow: 'shrink', textWrap: false },
    { ...el(`${prefix}-auto`), type: 'text', autoWidth: true, textOverflow: 'ellipsis', textWrap: false },
    { ...el(`${prefix}-grid`), type: 'grid', textOverflow: 'visible', textWrap: true },
    { ...el(`${prefix}-rect`), textOverflow: 'future', textWrap: 'false', custom: { keep: true } },
];

const v9OverflowState = () => ({
    schemaVersion: 9,
    nodes: {},
    rootId: 'root',
    activeVariantId: 'default',
    variants: {
        default: { id: 'default', name: 'Default', templates: {
            page: { id: 'page', name: 'Page', width: 500, height: 700, elements: overflowElements('default') },
        } },
        tablet: { id: 'tablet', name: 'Tablet', templates: {
            page: { id: 'page', name: 'Page', width: 800, height: 600, elements: overflowElements('tablet') },
        } },
    },
    templates: {
        legacy: { id: 'legacy', name: 'Legacy', width: 500, height: 700, elements: overflowElements('legacy') },
    },
});

describe('migrateV9ToV10', () => {
    it('preserves legacy text and grid appearance across variants and flat templates', () => {
        const input = v9OverflowState();
        const before = structuredClone(input);
        const output: any = migrateState(input);
        const templates = [
            output.variants.default.templates.page,
            output.variants.tablet.templates.page,
            output.templates.legacy,
        ];
        const originalTemplates = [
            before.variants.default.templates.page,
            before.variants.tablet.templates.page,
            before.templates.legacy,
        ];

        expect(output.schemaVersion).toBe(10);
        templates.forEach((template, index) => {
            expect(template.elements[0]).toMatchObject({ textOverflow: 'visible', textWrap: true });
            expect(template.elements[1]).toMatchObject({ textOverflow: 'visible', textWrap: true });
            expect(template.elements[2]).toMatchObject({ textOverflow: 'ellipsis', textWrap: false });
            expect(template.elements[3]).toEqual(originalTemplates[index].elements[3]);
        });
        expect(input).toEqual(before);
        expect(migrateState(output)).toEqual(output);
    });

    it('normalizes malformed current values while preserving valid values', () => {
        const input: any = {
            ...v9OverflowState(),
            schemaVersion: 10,
            variants: {
                default: { id: 'default', name: 'Default', templates: {
                    page: { id: 'page', name: 'Page', width: 100, height: 100, elements: [
                        { type: 'text', textOverflow: null, textWrap: 'true' },
                        { type: 'grid', textOverflow: 'visible', textWrap: true },
                    ] },
                } },
            },
        };
        const before = structuredClone(input);

        const output: any = migrateState(input);

        expect(output.variants.default.templates.page.elements).toEqual([
            { type: 'text', textOverflow: 'clip', textWrap: true },
            { type: 'grid', textOverflow: 'visible', textWrap: true },
        ]);
        expect(input).toEqual(before);
        expect(needsMigration(input)).toBe(false);
    });

    it('returns future-version state untouched by reference', () => {
        const future: any = {
            schemaVersion: 11,
            variants: { default: { templates: { page: { elements: [
                { type: 'text', textOverflow: null, textWrap: 'future' },
            ] } } } },
        };

        expect(migrateState(future)).toBe(future);
        expect(migrateState(future)).toEqual(future);
    });
});

describe('presets are layer-tagged (belt-and-suspenders)', () => {
    it.each([
        ['blank', createBlankProject],
        ['notebook', createNotebookProject],
        ['planner', createPlannerProject],
    ])('%s preset: every template has layers and every element a valid layerId', (_name, create) => {
        const state = create();
        for (const variant of Object.values(state.variants)) {
            for (const tpl of Object.values(variant.templates)) {
                expect(tpl.layers && tpl.layers.length).toBeGreaterThan(0);
                const ids = new Set(tpl.layers!.map(l => l.id));
                tpl.elements.forEach(e => expect(ids.has(e.layerId!)).toBe(true));
            }
        }
    });
});

// The three shipped presets are flat-`templates`-shaped, so their create*Project tests above
// never exercise the variants-shaped trap: loadPreset stamps variants presets at
// CURRENT_SCHEMA_VERSION, so migrateState skips versioned steps including migrateV7ToV8 while
// current-v10 normalization still runs. The belt-and-suspenders forEach in loadPreset is the ONLY
// thing that tags their layers. This block drives that path directly (and guards Fix 1's deep-clone
// independence).
describe('loadPreset: variants-shaped preset (belt-and-suspenders path)', () => {
    // Variants-shaped, untagged (no layers / no layerId). loadPreset stamps it at
    // CURRENT_SCHEMA_VERSION, skipping migrateV7ToV8 while current-v10 normalization still runs.
    const variantsPresetData = () => ({
        nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
        rootId: 'root',
        activeVariantId: 'default',
        variants: {
            default: { id: 'default', name: 'Default', templates: {
                page: { id: 'page', name: 'Page', width: 500, height: 700, elements: [el('a', 5), el('b')] },
            } },
            tablet: { id: 'tablet', name: 'Tablet', templates: {
                page: { id: 'page', name: 'Page', width: 800, height: 600, elements: [el('c', 2)] },
            } },
        },
    });

    it('tags every template with layers and every element with a valid layerId', () => {
        const state: any = loadPreset(variantsPresetData());
        expect(state.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
        for (const variant of Object.values<any>(state.variants)) {
            for (const tpl of Object.values<any>(variant.templates)) {
                expect(tpl.layers && tpl.layers.length).toBeGreaterThan(0);
                const ids = new Set(tpl.layers.map((l: any) => l.id));
                expect(tpl.elements.length).toBeGreaterThan(0);
                tpl.elements.forEach((e: any) => expect(ids.has(e.layerId)).toBe(true));
            }
        }
    });

    it('produces independent layer ids per call and never mutates the source preset data (Fix 1)', () => {
        // Same source object reference for both calls, exactly like the module-level preset constants.
        const source = variantsPresetData();
        const a: any = loadPreset(source);
        const b: any = loadPreset(source);

        const idA = a.variants.default.templates.page.layers[0].id;
        const idB = b.variants.default.templates.page.layers[0].id;
        expect(idA).not.toBe(idB); // independent documents, not a shared object graph

        // Source preset data must remain untouched (no layers leaked back into it).
        expect(source.variants.default.templates.page).not.toHaveProperty('layers');
        expect(a.variants.default.templates.page).not.toBe(b.variants.default.templates.page);
    });
});
