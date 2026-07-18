import { describe, expect, it } from 'vitest';
import { resolveElementPreviewText } from '../../services/previewText';
import type { AppNode, TemplateElement } from '../../types';

const nodes: Record<string, AppNode> = {
    root: {
        id: 'root', parentId: null, type: 'page', title: 'Root title',
        data: { label: 'Root label', start: '0', count: '1' },
        children: ['target'],
    },
    target: {
        id: 'target', parentId: 'root', type: 'page', title: 'Target title',
        data: {}, children: [],
    },
    week: {
        id: 'week', parentId: null, type: 'week', title: 'Week title',
        data: { code: 'W42' }, children: ['target-ref'],
    },
    'target-ref': {
        id: 'target-ref', parentId: 'week', type: 'page', title: 'Target ref',
        data: {}, children: [], referenceId: 'target',
    },
};

const text = (overrides: Partial<TemplateElement> = {}) => ({
    text: '', dataBinding: undefined, ...overrides,
});

describe('resolveElementPreviewText', () => {
    it('preserves literal text and does not mutate its source', () => {
        const element = text({ text: 'literal text' });
        const before = { ...element };
        expect(resolveElementPreviewText(element, nodes.root, nodes)).toBe('literal text');
        expect(element).toEqual(before);
    });

    it('uses dataBinding instead of source text and resolves current-node data', () => {
        const element = text({ text: 'ignored source', dataBinding: 'label' });
        expect(resolveElementPreviewText(element, nodes.root, nodes)).toBe('Root label');
    });

    it('keeps current Canvas interpolation order and unresolved fallback', () => {
        expect(resolveElementPreviewText(
            text({ text: '{{title}} / {{label}} / {{missing}}' }),
            nodes.root,
            nodes,
        )).toBe('Root title / Root label / ');
        expect(resolveElementPreviewText(
            text({ text: '{{label}}' }),
            undefined,
            nodes,
        )).toBe('{{label}}');
    });

    it('resolves child-referrer arithmetic and selected parent fields', () => {
        expect(resolveElementPreviewText(
            text({ text: '{{child_referrer:start:count:week:title}} {{child_referrer:0:1::code}}' }),
            nodes.root,
            nodes,
        )).toBe('Week title W42');
    });
});
