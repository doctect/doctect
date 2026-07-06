// tests/unit/server/stateCodec.test.js
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { encodeState, decodeStateRow } from '../../../server/stateCodec.js';

const state = {
    nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
    rootId: 'root',
    variants: { default: { id: 'default', name: 'Default', templates: {} } },
    schemaVersion: 7
};

describe('stateCodec', () => {
    it('round-trips a state through gzip', () => {
        const enc = encodeState(state);
        expect(Buffer.isBuffer(enc.gzip)).toBe(true);
        expect(enc.bytes).toBe(enc.gzip.length);
        expect(decodeStateRow({ state_gzip: enc.gzip, state_json: '' })).toEqual(state);
    });

    it('compresses repetitive JSON well below its raw size', () => {
        const big = { ...state, padding: 'x'.repeat(100000) };
        const enc = encodeState(big);
        expect(enc.bytes).toBeLessThan(JSON.stringify(big).length / 5);
    });

    it('hash is stable under key reordering', () => {
        const reordered = { schemaVersion: 7, variants: state.variants, rootId: 'root', nodes: state.nodes };
        expect(encodeState(state).hash).toBe(encodeState(reordered).hash);
    });

    it('hash differs for different content', () => {
        const other = { ...state, rootId: 'root', schemaVersion: 8 };
        expect(encodeState(state).hash).not.toBe(encodeState(other).hash);
    });

    it('falls back to plain state_json for legacy rows without state_gzip', () => {
        expect(decodeStateRow({ state_gzip: null, state_json: JSON.stringify(state) })).toEqual(state);
    });

    it('normalizes non-Buffer blob values (some drivers return Uint8Array)', () => {
        const enc = encodeState(state);
        expect(decodeStateRow({ state_gzip: new Uint8Array(enc.gzip), state_json: '' })).toEqual(state);
    });
});
