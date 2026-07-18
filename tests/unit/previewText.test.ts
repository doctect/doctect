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

const precedenceNodes: Record<string, AppNode> = {
    ancestor: {
        id: 'ancestor', parentId: null, type: 'page', title: 'Ancestor',
        data: { selfKey: 'ancestor', ancestorKey: 'ancestor' }, children: ['current'],
    },
    current: {
        id: 'current', parentId: 'ancestor', type: 'page', title: 'Current',
        data: { selfKey: 'self' }, children: ['child'], referenceId: 'reference-target',
    },
    'reference-target': {
        id: 'reference-target', parentId: null, type: 'page', title: 'Reference target',
        data: {
            selfKey: 'reference', ancestorKey: 'reference', referenceKey: 'reference',
        },
        children: [],
    },
    'referrer-ancestor': {
        id: 'referrer-ancestor', parentId: null, type: 'page', title: 'Referrer ancestor',
        data: {
            selfKey: 'referrer', ancestorKey: 'referrer', referenceKey: 'referrer',
            referrerKey: 'referrer',
        },
        children: ['target-referrer'],
    },
    'target-referrer': {
        id: 'target-referrer', parentId: 'referrer-ancestor', type: 'page', title: 'Referrer',
        data: {}, children: [], referenceId: 'reference-target',
    },
    child: {
        id: 'child', parentId: 'current', type: 'page', title: 'Child',
        data: {
            selfKey: 'child', ancestorKey: 'child', referenceKey: 'child',
            referrerKey: 'child', childKey: 'child',
        },
        children: [],
    },
};

const arithmeticNodes: Record<string, AppNode> = {
    current: {
        id: 'current', parentId: null, type: 'page', title: 'Current',
        data: { base: '0', span: '2', zero: '0' },
        children: ['unused-left', 'reverse-target', 'unused-right'],
    },
    'reverse-target': {
        id: 'reverse-target', parentId: 'current', type: 'page', title: 'Target',
        data: {}, children: [],
    },
    week: {
        id: 'week', parentId: null, type: 'week', title: 'Arithmetic week',
        data: {}, children: ['reverse-referrer'],
    },
    'reverse-referrer': {
        id: 'reverse-referrer', parentId: 'week', type: 'page', title: 'Referrer',
        data: {}, children: [], referenceId: 'reverse-target',
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

    it('keeps self, ancestor, reference, referrer-ancestor, then child precedence', () => {
        expect(resolveElementPreviewText(
            text({ text: '{{selfKey}} {{ancestorKey}} {{referenceKey}} {{referrerKey}} {{childKey}}' }),
            precedenceNodes.current,
            precedenceNodes,
        )).toBe('self ancestor reference referrer child');
    });

    it('evaluates addition and subtraction for forward and negative reverse searches', () => {
        expect(resolveElementPreviewText(
            text({ text: '{{child_referrer:base+1:span-1:week:title}}' }),
            arithmeticNodes.current,
            arithmeticNodes,
        )).toBe('Arithmetic week');
        expect(resolveElementPreviewText(
            text({ text: '{{child_referrer:base+2:zero-2:week:title}}' }),
            arithmeticNodes.current,
            arithmeticNodes,
        )).toBe('Arithmetic week');
    });
});
