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
});
