import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CanvasElement } from '../../components/canvas/CanvasElement';
import { TemplateElement, AppNode } from '../../types';

// Minimal fixture matching the REAL CanvasElementProps interface
// (components/canvas/CanvasElement.tsx): element, selected, nodes,
// currentNodeId, tool, showHandles are all required. There is no `scale`
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
        const { container } = render(<CanvasElement element={malicious} {...baseProps} />);
        expect(container.querySelector('script')).toBeNull();
        expect(container.innerHTML).not.toMatch(/onload=/i);
        expect(container.innerHTML).not.toContain('window.__xss_fired');
        // The legitimate rect should still render
        expect(container.querySelector('rect')).not.toBeNull();
    });

    it('preserves legitimate SVG content (shapes, viewBox, styling) unchanged in substance', () => {
        const legit: TemplateElement = {
            ...baseElement,
            svgContent: '<svg viewBox="0 0 100 100"><path d="M10 10 L90 90" stroke="blue" stroke-width="2"/><circle cx="50" cy="50" r="20" fill="green"/></svg>'
        };
        const { container } = render(<CanvasElement element={legit} {...baseProps} />);
        expect(container.querySelector('path')).not.toBeNull();
        expect(container.querySelector('circle')).not.toBeNull();
        expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 100 100');
    });
});
