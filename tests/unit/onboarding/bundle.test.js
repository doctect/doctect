// tests/unit/onboarding/bundle.test.js
import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { REPO_ROOT, stripModuleSyntax, bundleDiffEngine, extractExcerpts, AnchorError }
    from '../../../onboarding/build.mjs';
import * as realDiff from '../../../shared/diff.js';
import { DIFF_SCENARIOS } from './fixtures/diffScenarios.js';

describe('stripModuleSyntax', () => {
    it('drops single-line imports and unwraps export declarations', () => {
        const src = `import fs from 'fs';\nimport { a, b } from './x.js';\n` +
            `export const one = 1;\nexport function two() { return 2; }\nconst keep = 3;\n`;
        const out = stripModuleSyntax(src);
        expect(out).not.toContain('import ');
        expect(out).toContain('const one = 1;');
        expect(out).toContain('function two()');
        expect(out).toContain('const keep = 3;');
        expect(out).not.toContain('export ');
    });
});

describe('bundleDiffEngine parity', () => {
    it('the IIFE bundle behaves identically to the real ESM module', () => {
        const bundle = bundleDiffEngine(REPO_ROOT);
        const sandbox = { window: {} };
        vm.createContext(sandbox);
        vm.runInContext(bundle, sandbox);
        const bundled = sandbox.window.DoctectDiff;
        expect(Object.keys(bundled).sort()).toEqual(
            ['applyChangeSet', 'computeChangeSet', 'stableStringify', 'threeWayDiff']);
        for (const s of DIFF_SCENARIOS) {
            const real = realDiff.threeWayDiff(s.base, s.fork, s.upstream);
            const alt = bundled.threeWayDiff(s.base, s.fork, s.upstream);
            expect(alt).toEqual(real);
            expect(bundled.computeChangeSet(s.base, s.fork)).toEqual(realDiff.computeChangeSet(s.base, s.fork));
            if (real.conflicts.length === 0) {
                expect(bundled.applyChangeSet(s.base, s.fork, s.upstream))
                    .toEqual(realDiff.applyChangeSet(s.base, s.fork, s.upstream));
            }
        }
    });

    it('the scenarios actually cover both outcomes', () => {
        const conflictCounts = DIFF_SCENARIOS.map(s => realDiff.threeWayDiff(s.base, s.fork, s.upstream).conflicts.length);
        expect(conflictCounts.filter(n => n === 0).length).toBeGreaterThanOrEqual(1);
        expect(conflictCounts.filter(n => n > 0).length).toBeGreaterThanOrEqual(3);
    });
});

describe('extractExcerpts', () => {
    it('extracts by start + line count', () => {
        const [ex] = extractExcerpts(REPO_ROOT, [
            { id: 'diff-threeway', file: 'shared/diff.js', start: 'export const threeWayDiff', lines: 5 }]);
        expect(ex.code.split('\n')).toHaveLength(5);
        expect(ex.code).toContain('threeWayDiff');
        expect(ex.startLine).toBeGreaterThan(50);
    });

    it('extracts by start + exclusive end substring', () => {
        const [ex] = extractExcerpts(REPO_ROOT, [
            { id: 'diff-changeset', file: 'shared/diff.js',
              start: 'export const computeChangeSet', end: 'const touchedTemplates' }]);
        expect(ex.code).toContain('computeChangeSet');
        expect(ex.code).not.toContain('touchedTemplates');
    });

    it('throws AnchorError naming the anchor when start is missing or ambiguous', () => {
        expect(() => extractExcerpts(REPO_ROOT, [
            { id: 'nope', file: 'shared/diff.js', start: 'NOT PRESENT ANYWHERE', lines: 3 }]))
            .toThrowError(/nope/);
        expect(() => extractExcerpts(REPO_ROOT, [
            { id: 'ambig', file: 'shared/diff.js', start: 'const', lines: 3 }]))
            .toThrowError(AnchorError);
    });
});
