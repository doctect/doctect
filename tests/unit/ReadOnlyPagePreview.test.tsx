import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReadOnlyPagePreview } from '../../components/canvas/ReadOnlyPagePreview';
import type { AppNode, PageTemplate } from '../../types';
import { createTestCanvasTextLayoutSession } from './canvasTestUtils';

const nodes: Record<string, AppNode> = {
  root: { id: 'root', parentId: null, type: 'page', title: 'Bound title', data: { label: 'Canvas value' }, children: [] },
};

const template: PageTemplate = {
  id: 'page',
  name: 'Page',
  width: 200,
  height: 300,
  layers: [{ id: 'base', name: 'Base', order: 0, visible: true, locked: false }],
  elements: [
    { id: 'shape', type: 'rect', x: 10, y: 10, w: 40, h: 30, rotation: 0, fill: '#ff0000', stroke: '#000000', strokeWidth: 1, opacity: 1, layerId: 'base', zIndex: 1 },
    { id: 'label', type: 'text', x: 10, y: 50, w: 100, h: 20, rotation: 0, text: '{{label}}', dataBinding: 'label', fontSize: 12, fill: 'transparent', stroke: 'transparent', strokeWidth: 0, textColor: '#000000', opacity: 1, layerId: 'base', zIndex: 2 },
  ],
};

describe('ReadOnlyPagePreview', () => {
  it('renders the production canvas elements at the requested scale without editor controls', () => {
    const { container } = render(
      <ReadOnlyPagePreview
        template={template}
        nodes={nodes}
        currentNodeId="root"
        scale={0.5}
        testId="page-preview"
        textLayoutSession={createTestCanvasTextLayoutSession()}
      />,
    );

    expect(screen.getByTestId('page-preview')).toHaveStyle({ width: '100px', height: '150px' });
    expect(container.querySelector('[data-element-id="shape"]')).not.toBeNull();
    expect(screen.getByText('Canvas value')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="selection-handle"]')).toBeNull();
    expect(container.querySelector('.canvas-scroll-container')).toBeNull();
  });

  it('renders the background overlay before elements and child overlays after elements', () => {
    const { container } = render(
      <ReadOnlyPagePreview
        template={template}
        nodes={nodes}
        currentNodeId="root"
        scale={1}
        backgroundOverlay={<div data-testid="grid-overlay" />}
        textLayoutSession={createTestCanvasTextLayoutSession()}
      >
        <div data-testid="editor-overlay" />
      </ReadOnlyPagePreview>,
    );
    const backgroundOverlay = screen.getByTestId('grid-overlay');
    const renderedElement = container.querySelector('[data-element-id="shape"]');
    const editorOverlay = screen.getByTestId('editor-overlay');
    expect(renderedElement).not.toBeNull();
    expect(backgroundOverlay.compareDocumentPosition(renderedElement!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(renderedElement!.compareDocumentPosition(editorOverlay)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
