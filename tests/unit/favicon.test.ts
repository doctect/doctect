import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = process.cwd();

const approvedLayerPaths = [
  'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z',
  'M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12',
  'M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17',
];

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

describe('favicon', () => {
  it('references the SVG favicon from the application document', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    const document = new DOMParser().parseFromString(html, 'text/html');
    const favicons = [...document.head.children].filter(
      element => element.tagName === 'LINK' && element.getAttribute('rel') === 'icon',
    );
    const [favicon] = favicons;

    expect(favicons).toHaveLength(1);
    expect(favicon?.getAttribute('type')).toBe('image/svg+xml');
    expect(favicon?.getAttribute('href')).toBe('/favicon.svg');
  });

  it('uses the exact approved layered-square geometry and structure', () => {
    const source = readFileSync(join(root, 'public/favicon.svg'), 'utf8');
    const document = new DOMParser().parseFromString(source, 'image/svg+xml');
    const svg = document.documentElement;
    const elements = [...svg.children];
    const [background, mark] = elements;

    expect(svg.tagName).toBe('svg');
    expect(svg.getAttribute('viewBox')).toBe('0 0 32 32');
    expect(elements.map(element => element.tagName)).toEqual(['rect', 'g']);
    expect(background.getAttribute('width')).toBe('32');
    expect(background.getAttribute('height')).toBe('32');
    expect(background.getAttribute('rx')).toBe('8');
    expect(background.getAttribute('fill')).toBe('#2563eb');
    expect(mark.getAttribute('transform')).toBe('translate(4 4)');
    expect(mark.getAttribute('fill')).toBe('none');
    expect(mark.getAttribute('stroke')).toBe('#fff');
    expect(mark.getAttribute('stroke-width')).toBe('2.4');
    expect(mark.getAttribute('stroke-linecap')).toBe('round');
    expect(mark.getAttribute('stroke-linejoin')).toBe('round');
    expect([...mark.children].map(element => element.tagName)).toEqual(['path', 'path', 'path']);
    expect([...mark.children].map(path => path.getAttribute('d'))).toEqual(approvedLayerPaths);
  });

  it('contains no forbidden rendered constructs', () => {
    const source = readFileSync(join(root, 'public/favicon.svg'), 'utf8');
    const document = new DOMParser().parseFromString(source, 'image/svg+xml');
    const forbiddenNames = new Set([
      'script', 'text', 'filter', 'animate', 'animatemotion', 'animatetransform', 'mpath', 'set',
    ]);
    const forbidden = [...document.documentElement.querySelectorAll('*')]
      .map(element => element.localName)
      .filter(name => forbiddenNames.has(name.toLowerCase()) || name.toLowerCase().includes('gradient'));

    expect(forbidden).toEqual([]);
  });

  it('retains the Lucide ISC and Feather MIT notices in an XML comment', () => {
    const source = readFileSync(join(root, 'public/favicon.svg'), 'utf8');
    const document = new DOMParser().parseFromString(source, 'image/svg+xml');
    const comments = [...document.documentElement.childNodes]
      .filter(node => node.nodeType === 8)
      .map(node => node.nodeValue ?? '');
    const notice = normalizeWhitespace(comments.join('\n'));

    expect(comments).toHaveLength(1);
    expect(notice).toContain('Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2023 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2025.');
    expect(notice).toContain(normalizeWhitespace(`
      Permission to use, copy, modify, and/or distribute this software for any
      purpose with or without fee is hereby granted, provided that the above
      copyright notice and this permission notice appear in all copies.
    `));
    expect(notice).toContain('Copyright (c) 2013-2023 Cole Bemis');
    expect(notice).toContain(normalizeWhitespace(`
      Permission is hereby granted, free of charge, to any person obtaining a copy
      of this software and associated documentation files (the "Software"), to deal
      in the Software without restriction, including without limitation the rights
      to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
      copies of the Software, and to permit persons to whom the Software is
      furnished to do so, subject to the following conditions:

      The above copyright notice and this permission notice shall be included in all
      copies or substantial portions of the Software.
    `));
  });
});
