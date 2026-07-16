import type { CSSProperties } from 'react';
import type { PatternType } from '../../types';

export const MIN_SCREEN_LINE_PX = 1;
export const MIN_SCREEN_DOT_PX = 1.5;
export const DOT_FEATHER_SCREEN_PX = 0.5;

export interface PatternBackgroundOptions {
  type?: PatternType;
  color: string;
  spacing?: number;
  weight?: number;
  renderScale?: number;
}

const PATTERN_ANGLES: Partial<Record<PatternType, string>> = {
  'lines-h': '180deg',
  'lines-v': '90deg',
  'lines-d': '135deg',
};

const safeScale = (value: number | undefined) => (
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 1
);

export function buildPatternBackgroundStyle({
  type,
  color,
  spacing = 10,
  weight = 1,
  renderScale = 1,
}: PatternBackgroundOptions): CSSProperties {
  const scale = safeScale(renderScale);
  const resolvedSpacing = Number(spacing) || 10;
  const sourceWeight = Number(weight) || 1;
  const angle = type ? PATTERN_ANGLES[type] : undefined;

  if (angle) {
    const effectiveWeight = Math.max(sourceWeight, MIN_SCREEN_LINE_PX / scale);
    return {
      backgroundImage: `repeating-linear-gradient(${angle}, ${color}, ${color} ${effectiveWeight}px, transparent ${effectiveWeight}px, transparent ${resolvedSpacing}px)`,
    };
  }

  if (type === 'dots') {
    const diameter = Math.max(sourceWeight, MIN_SCREEN_DOT_PX / scale);
    const radius = diameter / 2;
    const feather = Math.min(radius, DOT_FEATHER_SCREEN_PX / scale);
    const solidRadius = Math.max(0, radius - feather);
    return {
      backgroundImage: `radial-gradient(circle, ${color} 0, ${color} ${solidRadius}px, transparent ${radius}px)`,
      backgroundSize: `${resolvedSpacing}px ${resolvedSpacing}px`,
    };
  }

  return {};
}
