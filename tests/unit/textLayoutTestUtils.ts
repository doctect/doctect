import type { TextLayoutRequest, TextMeasurer } from '../../services/textLayout';

export const monoMeasurer = (calls: string[] = []): TextMeasurer => ({
    cacheKey: 'fake-mono-v1',
    measureWidth(text, font) {
        calls.push(`${font.size}:${text}`);
        return [...text].length * font.size;
    },
});

export const request = (overrides: Partial<TextLayoutRequest> = {}): TextLayoutRequest => ({
    text: 'AB CD',
    contentWidth: 3,
    contentHeight: 12,
    fontSize: 1,
    fontFamily: 'Fake Mono',
    fontWeight: 'normal',
    fontStyle: 'normal',
    textOverflow: 'clip',
    textWrap: true,
    align: 'left',
    verticalAlign: 'top',
    ...overrides,
});
