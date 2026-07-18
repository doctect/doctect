import { splitGraphemes } from 'unicode-segmenter/grapheme';

const native = typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

export function segmentGraphemes(
    text: string,
    segmenter: Pick<Intl.Segmenter, 'segment'> | null = native,
): string[] {
    return segmenter
        ? Array.from(segmenter.segment(text), part => part.segment)
        : Array.from(splitGraphemes(text));
}
