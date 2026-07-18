import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CanvasElement } from '../../components/canvas/CanvasElement';
import { TemplateElement, AppNode } from '../../types';
import { createTestCanvasTextLayoutSession } from './canvasTestUtils';

// Minimal fixture matching the REAL CanvasElementProps interface
// (components/canvas/CanvasElement.tsx): element, selected, nodes,
// currentNodeId, tool, showHandles, and textLayoutSession are required. There is no `scale`
// prop on CanvasElement itself (scale is applied by the parent Canvas.tsx
// wrapper, not passed down) — see components/Canvas.tsx's <CanvasElement />
// call site for the real invocation shape.
const baseElement: Omit<TemplateElement, 'svgContent'> = {
    id: 'el1', type: 'svg', x: 0, y: 0, w: 100, h: 100, rotation: 0,
    fill: '#000000', stroke: '#000000', strokeWidth: 0, opacity: 1,
};

const nodes: Record<string, AppNode> = {
    root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] },
};

const baseProps = {
    selected: false,
    nodes,
    currentNodeId: 'root',
    tool: 'select',
    showHandles: false,
};

describe('CanvasElement SVG sanitization', () => {
    it('strips <script> tags and event-handler attributes from svgContent before rendering', () => {
        const malicious: TemplateElement = {
            ...baseElement,
            svgContent: '<svg><script>window.__xss_fired = true;</script><rect width="10" height="10" fill="red" onload="window.__xss_fired = true"/></svg>'
        };
        const { container } = render(<CanvasElement element={malicious} textLayoutSession={createTestCanvasTextLayoutSession()} {...baseProps} />);
        expect(container.querySelector('script')).toBeNull();
        expect(container.innerHTML).not.toMatch(/onload=/i);
        expect(container.innerHTML).not.toContain('window.__xss_fired');
        // The legitimate rect should still render
        expect(container.querySelector('rect')).not.toBeNull();
    });

    it('keeps child width/height attributes when the root svg tag has none (viewBox only)', () => {
        // Regression: the width/height-stripping regexes (meant for the ROOT
        // <svg> tag so it can be replaced with width/height 100%) were not
        // anchored to the root tag — with a viewBox-only root they deleted the
        // FIRST child's width/height instead, rendering that shape invisible.
        const viewBoxOnly: TemplateElement = {
            ...baseElement,
            svgContent: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="40" height="40" fill="hsla(200,50%,50%,0.5)" stroke="#000"/></svg>'
        };
        const { container } = render(<CanvasElement element={viewBoxOnly} textLayoutSession={createTestCanvasTextLayoutSession()} {...baseProps} />);
        const rect = container.querySelector('rect');
        expect(rect).not.toBeNull();
        expect(rect?.getAttribute('width')).toBe('40');
        expect(rect?.getAttribute('height')).toBe('40');
        // root still gets the fill-the-box treatment
        const svg = container.querySelector('svg');
        expect(svg?.getAttribute('width')).toBe('100%');
        expect(svg?.getAttribute('height')).toBe('100%');
    });

    it('replaces root width/height with 100% when the root svg tag has them', () => {
        const withDims: TemplateElement = {
            ...baseElement,
            svgContent: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="40" height="40" fill="red"/></svg>'
        };
        const { container } = render(<CanvasElement element={withDims} textLayoutSession={createTestCanvasTextLayoutSession()} {...baseProps} />);
        const svg = container.querySelector('svg');
        expect(svg?.getAttribute('width')).toBe('100%');
        expect(svg?.getAttribute('height')).toBe('100%');
        expect(container.querySelector('rect')?.getAttribute('width')).toBe('40');
    });

    it('preserves legitimate SVG content (shapes, viewBox, styling) unchanged in substance', () => {
        const legit: TemplateElement = {
            ...baseElement,
            svgContent: '<svg viewBox="0 0 100 100"><path d="M10 10 L90 90" stroke="blue" stroke-width="2"/><circle cx="50" cy="50" r="20" fill="green"/></svg>'
        };
        const { container } = render(<CanvasElement element={legit} textLayoutSession={createTestCanvasTextLayoutSession()} {...baseProps} />);
        expect(container.querySelector('path')).not.toBeNull();
        expect(container.querySelector('circle')).not.toBeNull();
        expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 100 100');
    });
});
