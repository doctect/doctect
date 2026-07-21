import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The generator tutorials are executable documents: their ```javascript fences
// are extracted at capture time (docs-capture/scenarios/generator.js) and run
// through the real generator. Those invariants only fire on a capture run;
// this test mirrors them so a doc edit that breaks the assembly fails vitest.

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, 'docs-content/tutorials/generator', p), 'utf8');
const fences = (md: string) =>
    [...md.matchAll(/```javascript\n([\s\S]*?)```/g)].map(m => m[1]);

describe('generator tutorial fence assembly', () => {
    it('templates-in-code: six fences, five templates + one hierarchy', () => {
        const blocks = fences(read('02-templates-in-code.md'));
        expect(blocks).toHaveLength(6);
        expect(blocks[4]).toContain('return t;');
        expect(blocks[5].startsWith('const nodes')).toBe(true);
    });

    it('hierarchy-in-code: seven fences ending in the deliberately broken script', () => {
        const blocks = fences(read('03-hierarchy-in-code.md'));
        expect(blocks).toHaveLength(7);
        expect(blocks[5].trimEnd().endsWith("return { nodes, rootId: 'root' };")).toBe(true);
        expect(blocks[6]).toContain("'dayly'");
    });

    it('build-a-dated-planner: assembled pair equals its cumulative stages', () => {
        const blocks = fences(read('04-build-a-dated-planner.md'));
        expect(blocks).toHaveLength(7);
        expect(blocks[5]).toBe(blocks[0] + blocks[2] + blocks[4]);
        expect(blocks[6]).toBe(blocks[1] + blocks[3]);
    });
});
