import { describe, it, expect } from 'vitest';
import { normalizeGeneratedTemplates } from '../../services/generatorTemplates';

describe('normalizeGeneratedTemplates', () => {
    it('normalizes a flat { id: template } script return (existing/simple preset shape)', () => {
        const raw = {
            tpl_home: { id: 'tpl_home', name: 'Home', width: 509, height: 679, elements: [{ type: 'rect', x: 0, y: 0, w: 1, h: 1 }] },
        };
        const result = normalizeGeneratedTemplates(raw);
        expect(result.templates).toBeDefined();
        expect(result.variants).toBeUndefined();
        expect(Object.keys(result.templates!)).toEqual(['tpl_home']);
        expect(result.templates!.tpl_home.elements[0].id).toBeTruthy();
    });

    it('normalizes a { variants, activeVariantId } script return (documented multi-device shape) without dropping templates', () => {
        const raw = {
            variants: {
                remarkable: {
                    id: 'remarkable', name: 'reMarkable Paper Pro',
                    templates: {
                        tpl_home: { id: 'tpl_home', name: 'Home', width: 509, height: 679, elements: [{ type: 'rect', x: 0, y: 0, w: 1, h: 1 }] },
                        tpl_party: { id: 'tpl_party', name: 'Party', width: 509, height: 679, elements: [] },
                    }
                },
                ipad_a4: {
                    id: 'ipad_a4', name: 'iPad A4',
                    templates: {
                        tpl_home: { id: 'tpl_home', name: 'Home', width: 595, height: 842, elements: [] },
                        tpl_party: { id: 'tpl_party', name: 'Party', width: 595, height: 842, elements: [] },
                    }
                }
            },
            activeVariantId: 'remarkable'
        };
        const result = normalizeGeneratedTemplates(raw);
        expect(result.templates).toBeUndefined();
        expect(result.variants).toBeDefined();
        expect(result.activeVariantId).toBe('remarkable');
        expect(Object.keys(result.variants!)).toEqual(['remarkable', 'ipad_a4']);
        expect(Object.keys(result.variants!.remarkable.templates)).toEqual(['tpl_home', 'tpl_party']);
        expect(result.variants!.remarkable.templates.tpl_home.elements[0].id).toBeTruthy();
    });

    it('falls back to the first variant key when activeVariantId is missing or invalid', () => {
        const raw = {
            variants: { only_one: { id: 'only_one', name: 'Only', templates: { tpl_a: { id: 'tpl_a', name: 'A', width: 1, height: 1, elements: [] } } } },
            activeVariantId: 'does_not_exist'
        };
        const result = normalizeGeneratedTemplates(raw);
        expect(result.activeVariantId).toBe('only_one');
    });

    it('skips template objects missing an id, in both shapes', () => {
        const flat = normalizeGeneratedTemplates({ x: { name: 'no id' } });
        expect(flat.templates).toEqual({});

        const variantShape = normalizeGeneratedTemplates({
            variants: { v1: { id: 'v1', name: 'V1', templates: { x: { name: 'no id' } } } },
            activeVariantId: 'v1'
        });
        expect(variantShape.variants!.v1.templates).toEqual({});
    });
});

describe('normalizeGeneratedTemplates layer tagging', () => {
    const rawTpl = {
        id: 'day', name: 'Day', width: 500, height: 700,
        elements: [{ type: 'rect', x: 0, y: 0, w: 10, h: 10, rotation: 0, fill: '#fff', stroke: '', strokeWidth: 0, opacity: 1 }]
    };

    it('gives flat-map templates a default layer and tags every element', () => {
        const { templates } = normalizeGeneratedTemplates({ day: rawTpl });
        const tpl = templates!['day'];
        expect(tpl.layers).toHaveLength(1);
        expect(tpl.elements[0].layerId).toBe(tpl.layers![0].id);
    });

    it('gives variants-shaped templates a default layer and tags every element', () => {
        const raw = { variants: { v1: { id: 'v1', name: 'V1', templates: { day: rawTpl } } }, activeVariantId: 'v1' };
        const { variants } = normalizeGeneratedTemplates(raw);
        const tpl = variants!['v1'].templates['day'];
        expect(tpl.layers).toHaveLength(1);
        expect(tpl.elements[0].layerId).toBe(tpl.layers![0].id);
    });
});
