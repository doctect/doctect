import { describe, it, expect } from 'vitest';
import { migrateState, CURRENT_SCHEMA_VERSION } from '../../services/migration';
import { createBlankProject, createNotebookProject, createPlannerProject } from '../../services/presets';

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

describe('migrateV7ToV8', () => {
    it('bumps CURRENT_SCHEMA_VERSION to 8', () => {
        expect(CURRENT_SCHEMA_VERSION).toBe(8);
    });

    it('creates exactly one default "Layer 1" per template across all variants and tags every element', () => {
        const out: any = migrateState(v7State());
        expect(out.schemaVersion).toBe(8);
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
        expect(out.schemaVersion).toBe(8);
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
