// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { validateAppState } from '../../../server/validateAppState.js';

const goodState = () => ({
    nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
    rootId: 'root',
    variants: { default: { id: 'default', name: 'Default', templates: { page: { id: 'page', name: 'Page', width: 500, height: 700, elements: [] } } } },
    activeVariantId: 'default',
    schemaVersion: 7
});

const validGenerator = () => ({
    formatVersion: 1,
    templateScript: '  const café = "☕";\r\nreturn { café };\n',
    hierarchyScript: '\n\treturn { nodes: { "根": true } };\r\n',
    generatedAt: '2026-07-14T12:34:56.000Z',
});

describe('validateAppState', () => {
    it('accepts a minimal valid state', () => {
        expect(validateAppState(goodState()).ok).toBe(true);
    });
    it('rejects non-objects', () => {
        expect(validateAppState(null).ok).toBe(false);
        expect(validateAppState('hi').ok).toBe(false);
    });
    it('rejects missing rootId in nodes', () => {
        const s = goodState(); s.rootId = 'nope';
        expect(validateAppState(s).ok).toBe(false);
    });
    it('rejects malformed nodes', () => {
        const s = goodState(); s.nodes.bad = { id: 'bad' };
        expect(validateAppState(s).ok).toBe(false);
    });
    it('rejects empty variants', () => {
        const s = goodState(); s.variants = {};
        expect(validateAppState(s).ok).toBe(false);
    });
    it('rejects templates with non-numeric dimensions', () => {
        const s = goodState(); s.variants.default.templates.page.width = 'wide';
        expect(validateAppState(s).ok).toBe(false);
    });
    it('rejects oversize payloads', () => {
        const s = goodState();
        s.nodes.root.data.big = 'x'.repeat(5 * 1024 * 1024);
        expect(validateAppState(s).ok).toBe(false);
    });
    it('accepts pre-migration states with no layers/layerId (legacy)', () => {
        expect(validateAppState(goodState()).ok).toBe(true);
    });
    it('accepts templates with a valid layers array and string layerIds', () => {
        const s = goodState();
        const tpl = s.variants.default.templates.page;
        tpl.layers = [{ id: 'l1', name: 'Layer 1', order: 0, visible: true, locked: false }];
        tpl.elements = [{ id: 'e1', layerId: 'l1' }];
        expect(validateAppState(s).ok).toBe(true);
    });
    it('rejects non-array layers', () => {
        const s = goodState();
        s.variants.default.templates.page.layers = { nope: true };
        expect(validateAppState(s).ok).toBe(false);
    });
    it('rejects more than 200 layers per template', () => {
        const s = goodState();
        s.variants.default.templates.page.layers = Array.from({ length: 201 }, (_, i) => ({ id: `l${i}` }));
        expect(validateAppState(s).ok).toBe(false);
    });
    it('rejects a non-string layerId on an element', () => {
        const s = goodState();
        s.variants.default.templates.page.elements = [{ id: 'e1', layerId: 42 }];
        expect(validateAppState(s).ok).toBe(false);
    });

    it.each([
        ['textOverflow', 'truncate'],
        ['textWrap', 'true'],
    ])('rejects malformed present v10 %s on text/grid', (field, value) => {
        const state = goodState();
        state.schemaVersion = 10;
        state.variants.default.templates.page.elements = [
            { id: 'text', type: 'text', [field]: value },
            { id: 'grid', type: 'grid', [field]: value },
        ];
        expect(validateAppState(state)).toMatchObject({ ok: false, error: expect.stringContaining(field) });
    });

    it('accepts missing fields, old-schema malformed fields, and unrelated shape fields', () => {
        const current = goodState();
        current.schemaVersion = 10;
        current.variants.default.templates.page.elements = [
            { id: 'text', type: 'text' },
            { id: 'grid', type: 'grid' },
        ];
        expect(validateAppState(current)).toEqual({ ok: true });

        const state = goodState();
        state.schemaVersion = 9;
        state.variants.default.templates.page.elements = [
            { id: 'old', type: 'text', textOverflow: 'old-value', textWrap: 'yes' },
            { id: 'shape', type: 'rect', textOverflow: 'future', textWrap: 1 },
        ];
        expect(validateAppState(state)).toEqual({ ok: true });
    });

    it('accepts valid generator metadata', () => {
        expect(validateAppState({ ...goodState(), generator: validGenerator() })).toEqual({ ok: true });
    });

    it.each([
        ['a non-object', null],
        ['an unknown field', { ...validGenerator(), secret: true }],
        ['an unsupported format', { ...validGenerator(), formatVersion: 2 }],
        ['a non-text template script', { ...validGenerator(), templateScript: 42 }],
        ['a non-text hierarchy script', { ...validGenerator(), hierarchyScript: null }],
        ['an invalid timestamp', { ...validGenerator(), generatedAt: 'not-a-date' }],
        ['an oversized template script', { ...validGenerator(), templateScript: 'x'.repeat(512 * 1024 + 1) }],
        ['an oversized hierarchy script', { ...validGenerator(), hierarchyScript: 'x'.repeat(512 * 1024 + 1) }],
    ])('rejects generator metadata with %s', (_label, generator) => {
        expect(validateAppState({ ...goodState(), generator })).toMatchObject({ ok: false });
    });

    it('enforces total state size before generator detail validation', () => {
        const state = { ...goodState(), generator: { secret: true } };
        state.nodes.root.data.padding = 'x'.repeat(5 * 1024 * 1024);
        expect(validateAppState(state)).toMatchObject({ ok: false, error: expect.stringContaining('state exceeds') });
    });
});
