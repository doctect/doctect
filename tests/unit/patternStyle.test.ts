import { describe, expect, it } from 'vitest';
import {
  buildPatternBackgroundStyle,
  DOT_FEATHER_SCREEN_PX,
  MIN_SCREEN_DOT_PX,
  MIN_SCREEN_LINE_PX,
} from '../../components/canvas/patternStyle';

describe('buildPatternBackgroundStyle', () => {
  it('keeps source line weight when it already exceeds the screen minimum', () => {
    const style = buildPatternBackgroundStyle({
      type: 'lines-h', color: '#123456', spacing: 24, weight: 4, renderScale: 0.5,
    });
    expect(style.backgroundImage).toBe(
      'repeating-linear-gradient(180deg, #123456, #123456 4px, transparent 4px, transparent 24px)',
    );
  });

  it.each([
    ['lines-h', '180deg'],
    ['lines-v', '90deg'],
    ['lines-d', '135deg'],
  ] as const)('clamps %s to one screen pixel', (type, angle) => {
    const scale = 0.125;
    const style = buildPatternBackgroundStyle({
      type, color: '#334155', spacing: 24, weight: 1, renderScale: scale,
    });
    expect(style.backgroundImage).toBe(
      `repeating-linear-gradient(${angle}, #334155, #334155 8px, transparent 8px, transparent 24px)`,
    );
    expect(8 * scale).toBe(MIN_SCREEN_LINE_PX);
  });

  it('clamps dots to 1.5 screen pixels with a 0.5 screen pixel feather', () => {
    const scale = 0.125;
    const style = buildPatternBackgroundStyle({
      type: 'dots', color: '#334155', spacing: 24, weight: 1, renderScale: scale,
    });
    expect(style.backgroundImage).toBe(
      'radial-gradient(circle, #334155 0, #334155 2px, transparent 6px)',
    );
    expect(style.backgroundSize).toBe('24px 24px');
    expect(12 * scale).toBe(MIN_SCREEN_DOT_PX);
    expect(4 * scale).toBe(DOT_FEATHER_SCREEN_PX);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'falls back to scale 1 for invalid scale %s',
    renderScale => {
      const style = buildPatternBackgroundStyle({
        type: 'lines-v', color: '#000000', spacing: 10, weight: 1, renderScale,
      });
      expect(style.backgroundImage).toContain('#000000 1px');
    },
  );

  it('returns no background for an absent pattern type', () => {
    expect(buildPatternBackgroundStyle({ color: '#000000' })).toEqual({});
  });
});
