import { describe, it, expect } from 'vitest';
import { normalizeCssColor, normalizeSvgColorsInTree } from '../../services/svgColorNormalize';

describe('normalizeCssColor', () => {
    it('converts 4-digit hex (#rgba) to rgb + alpha', () => {
        expect(normalizeCssColor('#f008')).toEqual({ color: 'rgb(255, 0, 0)', alpha: 136 / 255 });
    });

    it('converts 8-digit hex (#rrggbbaa) to rgb + alpha', () => {
        expect(normalizeCssColor('#ff000080')).toEqual({ color: 'rgb(255, 0, 0)', alpha: 128 / 255 });
    });

    it('converts hsl() to rgb, alpha 1', () => {
        expect(normalizeCssColor('hsl(120, 50%, 50%)')).toEqual({ color: 'rgb(64, 191, 64)', alpha: 1 });
    });

    it('converts hsla() with numeric alpha', () => {
        expect(normalizeCssColor('hsla(200, 50%, 50%, 0.5)')).toEqual({ color: 'rgb(64, 149, 191)', alpha: 0.5 });
    });

    it('converts modern space-separated hsl() with % alpha', () => {
        expect(normalizeCssColor('hsl(200 50% 50% / 50%)')).toEqual({ color: 'rgb(64, 149, 191)', alpha: 0.5 });
    });

    it('leaves already-supported and non-color values untouched (returns null)', () => {
        for (const v of ['red', '#ff0000', '#f00', 'rgb(1, 2, 3)', 'rgba(1,2,3,0.5)', 'none', 'url(#g1)', 'currentColor', '', 'inherit']) {
            expect(normalizeCssColor(v), v).toBeNull();
        }
    });
});

describe('normalizeSvgColorsInTree', () => {
    const parse = (svg: string) => new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;

    it('rewrites hsla fill attribute to rgb + fill-opacity', () => {
        const root = parse('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="hsla(200, 50%, 50%, 0.5)"/></svg>');
        normalizeSvgColorsInTree(root);
        const rect = root.querySelector('rect')!;
        expect(rect.getAttribute('fill')).toBe('rgb(64, 149, 191)');
        expect(parseFloat(rect.getAttribute('fill-opacity')!)).toBeCloseTo(0.5);
    });

    it('multiplies alpha into an existing fill-opacity', () => {
        const root = parse('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#ff000080" fill-opacity="0.5"/></svg>');
        normalizeSvgColorsInTree(root);
        const rect = root.querySelector('rect')!;
        expect(rect.getAttribute('fill')).toBe('rgb(255, 0, 0)');
        expect(parseFloat(rect.getAttribute('fill-opacity')!)).toBeCloseTo(0.5 * (128 / 255));
    });

    it('rewrites stroke and stop-color attributes with their own opacity attrs', () => {
        const root = parse('<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient><stop stop-color="#00ff0080"/></linearGradient></defs><rect stroke="hsl(0, 100%, 50%)"/></svg>');
        normalizeSvgColorsInTree(root);
        expect(root.querySelector('rect')!.getAttribute('stroke')).toBe('rgb(255, 0, 0)');
        const stop = root.querySelector('stop')!;
        expect(stop.getAttribute('stop-color')).toBe('rgb(0, 255, 0)');
        expect(parseFloat(stop.getAttribute('stop-opacity')!)).toBeCloseTo(128 / 255);
    });

    it('rewrites colors inside inline style attributes', () => {
        const root = parse('<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill: hsla(200, 50%, 50%, 0.5); stroke: #f008"/></svg>');
        normalizeSvgColorsInTree(root);
        const style = root.querySelector('rect')!.getAttribute('style')!;
        expect(style).toContain('fill: rgb(64, 149, 191)');
        expect(style).toContain('stroke: rgb(255, 0, 0)');
        expect(style).toMatch(/fill-opacity:\s*0.5/);
        expect(style).toMatch(/stroke-opacity:\s*0.53/);
    });

    it('leaves supported colors and structure alone', () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="rgba(1,2,3,0.5)" stroke="blue"/></svg>';
        const root = parse(svg);
        normalizeSvgColorsInTree(root);
        const rect = root.querySelector('rect')!;
        expect(rect.getAttribute('fill')).toBe('rgba(1,2,3,0.5)');
        expect(rect.getAttribute('stroke')).toBe('blue');
        expect(rect.hasAttribute('fill-opacity')).toBe(false);
    });
});
