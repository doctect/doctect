import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { Canvas } from '../../components/Canvas';
import { AppNode, Layer, PageTemplate, TemplateElement } from '../../types';
import type { CanvasTextLayoutSession } from '../../services/canvasTextLayout';
import { createTextLayoutEngine, type FontDescriptor } from '../../services/textLayout';

let nextTestSession = 1;

export const createTestCanvasTextLayoutSession = (): CanvasTextLayoutSession => {
    const engine = createTextLayoutEngine(100);
    const measurer = {
        cacheKey: `canvas-test-${nextTestSession++}`,
        measureWidth: (text: string, font: FontDescriptor) => Array.from(text).length * font.size * 0.5,
    };

    return {
        layout: (request) => engine.layout(request, measurer),
        clear: () => engine.clear(),
    };
};

// jsdom: getBoundingClientRect() is all zeros, so at scale 1 canvas coords == clientX/clientY.
export const makeEl = (id: string, overrides: Partial<TemplateElement> = {}): TemplateElement => ({
    id, type: 'rect', x: 0, y: 0, w: 100, h: 100, rotation: 0,
    fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1, ...overrides
});

export const makeLayer = (id: string, order: number, overrides: Partial<Layer> = {}): Layer => ({
    id, name: id, order, visible: true, locked: false, ...overrides
});

const nodes: Record<string, AppNode> = {
    root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] },
};

export const renderCanvas = (elements: TemplateElement[], layers: Layer[], extra: Record<string, any> = {}) => {
    const template: PageTemplate = { id: 'page', name: 'Page', width: 500, height: 700, elements, layers };
    const onUpdateElements = vi.fn();
    const onSelectElements = vi.fn();
    const utils = render(
        <Canvas
            template={template}
            elements={elements}
            selectedElementIds={[]}
            scale={1}
            tool="select"
            nodes={nodes}
            currentNodeId="root"
            snapToGrid={false}
            showGrid={false}
            onUpdateElements={onUpdateElements}
            onSelectElements={onSelectElements}
            onZoom={vi.fn()}
            onInteractionStart={vi.fn()}
            textLayoutSession={createTestCanvasTextLayoutSession()}
            {...extra}
        />
    );
    const outer = utils.container.querySelector('.canvas-scroll-container') as HTMLElement;
    return { ...utils, outer, onUpdateElements, onSelectElements };
};
