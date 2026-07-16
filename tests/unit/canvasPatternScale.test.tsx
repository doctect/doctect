import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CanvasElement } from '../../components/canvas/CanvasElement';
import { ReadOnlyPagePreview } from '../../components/canvas/ReadOnlyPagePreview';
import type { AppNode, PageTemplate, TemplateElement } from '../../types';
import { makeEl, makeLayer, renderCanvas } from './canvasTestUtils';

const nodes: Record<string, AppNode> = {
  root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: ['child'] },
  child: { id: 'child', parentId: 'root', type: 'page', title: 'Cell', data: {}, children: [] },
};

const baseProps = {
  selected: false,
  nodes,
  currentNodeId: 'root',
  tool: 'select',
  showHandles: false,
};

const patternChild = (container: HTMLElement, id: string) => (
  container.querySelector(`[data-element-id="${id}"] > div`) as HTMLElement
);

describe('scale-aware canvas patterns', () => {
  it('passes editor Canvas scale into interactive normal elements', () => {
    const line = makeEl('line-pattern', {
      fill: '#334155', fillType: 'pattern', patternType: 'lines-h', patternSpacing: 24, patternWeight: 1,
    });
    const { container } = renderCanvas([line], [makeLayer('base', 0)], { scale: 0.125 });
    expect(patternChild(container, 'line-pattern').style.backgroundImage).toContain('#334155 8px');
  });

  it('passes ReadOnlyPagePreview scale into default dot rendering', () => {
    const dot = makeEl('dot-pattern', {
      fill: '#334155', fillType: 'pattern', patternType: 'dots', patternSpacing: 24, patternWeight: 1,
    });
    const template: PageTemplate = {
      id: 'page', name: 'Page', width: 1404, height: 1872,
      layers: [makeLayer('base', 0)], elements: [{ ...dot, layerId: 'base' }],
    };
    const { container } = render(
      <ReadOnlyPagePreview template={template} nodes={nodes} currentNodeId="root" scale={0.125} />,
    );
    expect(patternChild(container, 'dot-pattern').style.backgroundImage).toContain('transparent 6px');
  });

  it('uses the same scale-aware helper for grid cells and diagonal patterns', () => {
    const grid: TemplateElement = makeEl('grid-pattern', {
      type: 'grid', w: 100, h: 40, fill: '#334155', fillType: 'pattern',
      patternType: 'lines-d', patternSpacing: 24, patternWeight: 1,
      gridConfig: {
        cols: 1, gapX: 0, gapY: 0, sourceType: 'current', displayField: 'title',
        gridBorderMode: 'none', gridBorderWidth: 0, gridBorderColor: 'transparent', gridBorderStyle: 'solid',
      },
    });
    const { container } = render(<CanvasElement element={grid} renderScale={0.125} {...baseProps} />);
    const cell = container.querySelector('[data-element-id="grid-pattern"] > div') as HTMLElement;
    expect(cell.style.backgroundImage).toContain('repeating-linear-gradient(135deg');
    expect(cell.style.backgroundImage).toContain('#334155 8px');
  });
});
