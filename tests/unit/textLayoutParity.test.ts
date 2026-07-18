import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { AppState } from '../../types';
import { createCanvasTextLayoutSession } from '../../services/canvasTextLayout';
import { createPdfTextLayoutSession } from '../../services/pdfTextLayout';
import type { TextLayoutRequest, TextLayoutResult } from '../../services/textLayout';
import { textOverflowFixtureMetric, textOverflowFixtureRequests } from '../helpers/textOverflowParityFixture';

const fixture = JSON.parse(readFileSync(
  resolve('tests/fixtures/text-overflow-parity-v10.json'),
  'utf8',
)) as AppState;

const template = fixture.variants.parity.templates['parity-page'];
const elements = template.elements;
const fixedText = elements.filter(item => item.type === 'text' && !item.autoWidth);
const grids = elements.filter(item => item.type === 'grid');

const createSessions = () => {
  let canvasFontSize = 0;
  const canvasContext = {
    get font() { return `${canvasFontSize}px test`; },
    set font(value: string) {
      const match = value.match(/([0-9.]+)px/);
      canvasFontSize = match ? Number(match[1]) : Number.NaN;
    },
    measureText: vi.fn((text: string) => ({ width: textOverflowFixtureMetric(text, canvasFontSize) })),
  };
  const canvas = createCanvasTextLayoutSession({
    sessionIdentity: 'parity-canvas',
    createCanvas: () => ({ getContext: () => canvasContext } as unknown as HTMLCanvasElement),
  });

  let pdfFontSize = 0;
  const pdfDoc = {
    getTextWidth: vi.fn((text: string) => textOverflowFixtureMetric(text, pdfFontSize)),
  };
  const pdf = createPdfTextLayoutSession(pdfDoc as any, { sessionIdentity: 'parity-pdf' });
  const selectFont = (size: number) => {
    pdfFontSize = size;
    return { family: 'test', style: 'normal', rendererIdentity: 'parity-font' };
  };

  return { canvas, pdf, selectFont, canvasContext, pdfDoc };
};

const expectPolicyParity = (canvasResult: TextLayoutResult | null, pdfResult: TextLayoutResult | null) => {
  expect(canvasResult).not.toBeNull();
  expect(pdfResult).not.toBeNull();
  expect(pdfResult).toMatchObject({
    lines: canvasResult!.lines,
    effectiveFontSize: canvasResult!.effectiveFontSize,
    lineHeight: canvasResult!.lineHeight,
    blockHeight: canvasResult!.blockHeight,
    truncated: canvasResult!.truncated,
    requiresClip: canvasResult!.requiresClip,
  });
};

describe('Canvas/PDF text layout parity under equal metrics', () => {
  it('covers every fixed and grid mode/wrap pair plus fixture edge cases', () => {
    const requests = textOverflowFixtureRequests(fixture);
    const fixedPairs = fixedText.map(item => `${item.textOverflow}:${item.textWrap}`).sort();
    const gridPairs = grids.flatMap(item => [false, true].map(wrap => `${item.textOverflow}:${wrap}`)).sort();

    expect(fixedPairs).toEqual([
      'clip:false', 'clip:true', 'ellipsis:false', 'ellipsis:true',
      'shrink:false', 'shrink:true', 'visible:false', 'visible:true',
    ]);
    expect(gridPairs).toEqual([
      'clip:false', 'clip:true', 'ellipsis:false', 'ellipsis:true',
      'shrink:false', 'shrink:true', 'visible:false', 'visible:true',
    ]);
    expect(requests.some(item => item.request.text.includes('\n\n'))).toBe(true);
    expect(requests.some(item => item.request.text.includes('\u{1f469}\u200d\u{1f4bb}'))).toBe(true);
    expect(new Set(requests.map(item => item.request.align))).toEqual(new Set(['left', 'center', 'right']));
    expect(new Set(requests.map(item => item.request.verticalAlign))).toEqual(new Set(['top', 'middle', 'bottom']));
    expect(requests.filter(item => item.context.startsWith('grid-shrink:'))).toHaveLength(4);
  });

  it('returns identical policy and line geometry for cold, warm, and cleared adapter caches', () => {
    const sessions = createSessions();
    const requests = textOverflowFixtureRequests(fixture);
    const coldResults = new Map<string, { canvas: TextLayoutResult; pdf: TextLayoutResult }>();

    for (const { context, request } of requests) {
      const canvasResult = sessions.canvas.layout(request, context);
      const pdfResult = sessions.pdf.layout(request, 'parity-font', sessions.selectFont, context);
      expectPolicyParity(canvasResult, pdfResult);
      coldResults.set(context, { canvas: canvasResult!, pdf: pdfResult! });
    }
    const canvasColdMeasures = sessions.canvasContext.measureText.mock.calls.length;
    const pdfColdMeasures = sessions.pdfDoc.getTextWidth.mock.calls.length;

    for (const { context, request } of requests) {
      const canvasResult = sessions.canvas.layout(request, context);
      const pdfResult = sessions.pdf.layout(request, 'parity-font', sessions.selectFont, context);
      expect(canvasResult).toEqual(coldResults.get(context)!.canvas);
      expect(pdfResult).toEqual(coldResults.get(context)!.pdf);
      expectPolicyParity(canvasResult, pdfResult);
    }
    expect(sessions.canvasContext.measureText).toHaveBeenCalledTimes(canvasColdMeasures);
    expect(sessions.pdfDoc.getTextWidth).toHaveBeenCalledTimes(pdfColdMeasures);

    sessions.canvas.clear();
    sessions.pdf.clear();
    for (const { context, request } of requests) {
      const canvasResult = sessions.canvas.layout(request, context);
      const pdfResult = sessions.pdf.layout(request, 'parity-font', sessions.selectFont, context);
      expect(canvasResult).toEqual(coldResults.get(context)!.canvas);
      expect(pdfResult).toEqual(coldResults.get(context)!.pdf);
      expectPolicyParity(canvasResult, pdfResult);
    }
    expect(sessions.canvasContext.measureText.mock.calls.length).toBeGreaterThan(canvasColdMeasures);
    expect(sessions.pdfDoc.getTextWidth.mock.calls.length).toBeGreaterThan(pdfColdMeasures);

    const shrink = requests.filter(item => item.context.startsWith('grid-shrink:nowrap'));
    const short = sessions.canvas.layout(shrink[0].request, shrink[0].context)!;
    const long = sessions.canvas.layout(shrink[1].request, shrink[1].context)!;
    expect(short.effectiveFontSize).toBeGreaterThan(long.effectiveFontSize);
  });
});
