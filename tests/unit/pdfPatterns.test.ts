import { describe, expect, it } from 'vitest';
import { generatePDF } from '../../services/pdfService';
import type { AppState, PatternType, TemplateElement } from '../../types';

const patternElement = (patternType: PatternType): TemplateElement => ({
  id: `pattern-${patternType}`,
  type: 'rect',
  x: 40, y: 50, w: 180, h: 120, rotation: 0,
  fill: '#ff0000', fillType: 'pattern', patternType,
  patternSpacing: 12, patternWeight: 2,
  stroke: '', strokeWidth: 0, opacity: 1,
  layerId: 'main', zIndex: 1,
});

const stateWith = (element: TemplateElement): AppState => ({
  schemaVersion: 9,
  nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
  rootId: 'root',
  variants: { default: { id: 'default', name: 'Default', templates: {
    page: {
      id: 'page', name: 'Page', width: 300, height: 300,
      layers: [{ id: 'main', name: 'Main', order: 0, visible: true, locked: false }],
      elements: [element],
    },
  } } },
  activeVariantId: 'default',
  viewMode: 'hierarchy', selectedNodeId: 'root', selectedNodeIds: ['root'],
  selectedTemplateId: 'page', selectedTemplateIds: ['page'], selectedElementIds: [],
  scale: 1, tool: 'select', showJsonModal: false,
  sidebarWidth: 288, propertiesPanelWidth: 320,
  snapToGrid: false, showGrid: false, showNodeSelector: false,
  nodeSelectorMode: 'grid_source', editingElementId: null, clipboard: [],
} as AppState);

const pdfText = async (patternType: PatternType) => {
  const buffer = await generatePDF(stateWith(patternElement(patternType)), { output: 'arraybuffer' }) as ArrayBuffer;
  return new TextDecoder('latin1').decode(new Uint8Array(buffer));
};

const paintedLineCount = (pdf: string) => (pdf.match(/\bl\s+S\b/g) ?? []).length;

describe('PDF pattern fills', () => {
  it('draws multiple clipped diagonal strokes', async () => {
    const pdf = await pdfText('lines-d');
    expect(pdf).toContain('1. 0. 0. RG');
    expect(paintedLineCount(pdf)).toBeGreaterThan(5);
  });

  it.each(['lines-h', 'lines-v'] as const)('keeps %s line patterns rendering', async patternType => {
    const pdf = await pdfText(patternType);
    expect(pdf).toContain('1. 0. 0. RG');
    expect(paintedLineCount(pdf)).toBeGreaterThan(5);
  });
});
