import type { AppState, TemplateElement, TextOverflow } from '../../types';
import { segmentGraphemes } from '../../services/graphemes';
import type { TextLayoutRequest } from '../../services/textLayout';
import { resolveTextContentBox } from '../../services/textPadding';

export interface TextOverflowFixtureRequest {
  context: string;
  request: TextLayoutRequest;
}

export const textOverflowFixtureMetric = (text: string, size: number): number => (
  segmentGraphemes(text).length * size * 0.5
);

const requestFor = (
  item: TemplateElement,
  text: string,
  textWrap = item.textWrap as boolean,
  grid = false,
): TextLayoutRequest => {
  const contentBox = grid
    ? { width: Math.max(0, item.w - 2), height: item.h }
    : resolveTextContentBox(item);

  return {
    text,
    contentWidth: contentBox.width,
    contentHeight: contentBox.height,
    fontSize: item.fontSize ?? 12,
    fontFamily: item.fontFamily ?? 'helvetica',
    fontWeight: item.fontWeight ?? 'normal',
    fontStyle: item.fontStyle ?? 'normal',
    textOverflow: item.textOverflow as TextOverflow,
    textWrap,
    align: item.align ?? 'left',
    verticalAlign: item.verticalAlign ?? 'top',
  };
};

export const textOverflowFixtureRequests = (fixture: AppState): TextOverflowFixtureRequest[] => {
  const template = fixture.variants.parity.templates['parity-page'];
  const fixedText = template.elements.filter(item => item.type === 'text' && !item.autoWidth);
  const grids = template.elements.filter(item => item.type === 'grid');
  const childLabels = fixture.nodes[fixture.rootId].children.map(id => fixture.nodes[id].title);

  return [
    ...fixedText.map(item => ({
      context: item.id,
      request: requestFor(item, item.text ?? ''),
    })),
    ...grids.flatMap(item => [false, true].flatMap(textWrap => {
      const labels = item.textOverflow === 'shrink' ? childLabels : [childLabels[1]];
      return labels.map((label, index) => ({
        context: `${item.id}:${textWrap ? 'wrap' : 'nowrap'}:cell-${index}`,
        request: requestFor(item, label, textWrap, true),
      }));
    })),
  ];
};
