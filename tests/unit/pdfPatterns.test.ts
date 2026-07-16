import { describe, expect, it } from 'vitest';
import { generatePDF } from '../../services/pdfService';
import type { AppState, PatternType, TemplateElement } from '../../types';

const PAGE_HEIGHT = 300;
const PATTERN_SPACING = 12;
const PATTERN_WEIGHT = 0.25;
const PDF_TOLERANCE = 1e-6;

const patternElement = (patternType: PatternType): TemplateElement => ({
  id: `pattern-${patternType}`,
  type: 'rect',
  x: 40, y: 50, w: 180, h: 120, rotation: 0,
  fill: '#ff0000', fillType: 'pattern', patternType,
  patternSpacing: PATTERN_SPACING, patternWeight: PATTERN_WEIGHT,
  stroke: '', strokeWidth: 0, opacity: 1,
  layerId: 'main', zIndex: 1,
});

const gridPatternElement = (): TemplateElement => ({
  ...patternElement('lines-d'),
  id: 'grid-pattern-lines-d',
  type: 'grid',
  gridConfig: {
    cols: 1, gapX: 0, gapY: 0, sourceType: 'current', displayField: 'title',
    gridBorderMode: 'none', gridBorderWidth: 0, gridBorderStyle: 'solid',
  },
});

const stateWith = (element: TemplateElement, rootChildren: string[] = []): AppState => ({
  schemaVersion: 9,
  nodes: {
    root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: rootChildren },
    cell: { id: 'cell', parentId: 'root', type: 'page', title: 'Cell', data: {}, children: [] },
  },
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

const gridPdfText = async () => {
  const buffer = await generatePDF(stateWith(gridPatternElement(), ['cell']), { output: 'arraybuffer' }) as ArrayBuffer;
  return new TextDecoder('latin1').decode(new Uint8Array(buffer));
};

const paintedLineCount = (pdf: string) => (pdf.match(/\bl\s+S\b/g) ?? []).length;

const patternContentStream = (pdf: string) => {
  const streams = [...pdf.matchAll(/\bstream\r?\n([\s\S]*?)\r?\nendstream\b/g)].map(match => match[1]);
  const stream = streams.find(candidate => candidate.includes('1. 0. 0. RG'));
  expect(stream, 'red pattern content stream').toBeDefined();
  return stream!;
};

const parsePaintedLines = (stream: string) => {
  const number = '-?(?:\\d+(?:\\.\\d*)?|\\.\\d+)';
  const line = new RegExp(`(${number})\\s+(${number})\\s+m\\s+(${number})\\s+(${number})\\s+l\\s+S\\b`, 'g');
  return [...stream.matchAll(line)].map(match => ({
    x1: Number(match[1]),
    y1: PAGE_HEIGHT - Number(match[2]),
    x2: Number(match[3]),
    y2: PAGE_HEIGHT - Number(match[4]),
    index: match.index ?? -1,
  }));
};

const expectDiagonalPattern = (pdf: string, bounds: { x: number; y: number; w: number; h: number }) => {
  const stream = patternContentStream(pdf);
  const segments = parsePaintedLines(stream);
  expect(segments.length).toBeGreaterThan(5);

  for (const segment of segments) {
    expect(segment.x1 + segment.y1).toBeCloseTo(segment.x2 + segment.y2, 6);
    expect(segment.x2).toBeGreaterThan(segment.x1);
    expect(segment.y2).toBeLessThan(segment.y1);
    expect(segment.x1).toBeGreaterThanOrEqual(bounds.x - PDF_TOLERANCE);
    expect(segment.x2).toBeLessThanOrEqual(bounds.x + bounds.w + PDF_TOLERANCE);
    expect(segment.y2).toBeGreaterThanOrEqual(bounds.y - PDF_TOLERANCE);
    expect(segment.y1).toBeLessThanOrEqual(bounds.y + bounds.h + PDF_TOLERANCE);
  }

  const intercepts = segments.map(segment => segment.x1 + segment.y1);
  expect(intercepts[0] - bounds.x - bounds.y).toBeCloseTo(
    PATTERN_WEIGHT / 2 * Math.SQRT2,
    6,
  );
  for (let index = 1; index < intercepts.length; index += 1) {
    expect(intercepts[index] - intercepts[index - 1]).toBeCloseTo(PATTERN_SPACING * Math.SQRT2, 6);
  }

  const firstStrokeIndex = segments[0].index;
  const clipOperators = [...stream.matchAll(/(?:^|\s)W(?=\s|$)/g)]
    .filter(match => (match.index ?? -1) < firstStrokeIndex);
  expect(clipOperators.length).toBeGreaterThan(0);
  const beforeFirstStroke = stream.slice(clipOperators.at(-1)!.index ?? 0, firstStrokeIndex);
  const lineWidth = beforeFirstStroke.match(/(-?(?:\d+(?:\.\d*)?|\.\d+))\s+w(?=\s|$)/);
  expect(lineWidth, 'pattern line width operator').not.toBeNull();
  expect(Number(lineWidth![1])).toBeCloseTo(PATTERN_WEIGHT, 6);
};

describe('PDF pattern fills', () => {
  it('draws clipped diagonal strokes with source geometry, spacing, and weight', async () => {
    const pdf = await pdfText('lines-d');
    expect(pdf).toContain('1. 0. 0. RG');
    expectDiagonalPattern(pdf, { x: 40, y: 50, w: 180, h: 120 });
  });

  it('draws clipped diagonal strokes in grid cells', async () => {
    const pdf = await gridPdfText();
    expectDiagonalPattern(pdf, { x: 40, y: 50, w: 180, h: 120 });
  });

  it.each(['lines-h', 'lines-v'] as const)('keeps %s line patterns rendering', async patternType => {
    const pdf = await pdfText(patternType);
    expect(pdf).toContain('1. 0. 0. RG');
    expect(paintedLineCount(pdf)).toBeGreaterThan(5);
  });
});
