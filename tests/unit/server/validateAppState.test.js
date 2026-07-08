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
});
