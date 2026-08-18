// tests/unit/onboarding/bundle.test.js
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { REPO_ROOT, stripModuleSyntax, bundleDiffEngine, extractExcerpts, AnchorError,
         assemblePage, buildContent, buildData, buildRuntimeBundle }
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

describe('built page', () => {
    const metadata = {
        generatedAt: '2000-01-01T00:00:00.000Z',
        gitSha: 'normalized-sha',
    };
    const buildPage = async rootDir => {
        const content = await buildContent();
        const data = buildData(rootDir, content.codeMap.anchors, metadata);
        return assemblePage({
            style: fs.readFileSync(path.join(rootDir, 'onboarding/src/style.css'), 'utf8'),
            runtime: buildRuntimeBundle(rootDir),
            dataJson: JSON.stringify(data).replace(/</g, '\\u003c'),
            contentJson: JSON.stringify(content).replace(/</g, '\\u003c'),
            diffBundle: bundleDiffEngine(rootDir),
            footerHtml: `generated ${data.vitals.generatedAt} @ ${data.vitals.gitSha}`,
        });
    };

    // A `display` rule on #boot beats the UA sheet's `[hidden] { display: none }`
    // on cascade origin, so hiding the overlay in JS is not enough: without this
    // rule the finished page ships a full-screen overlay over everything.
    it('keeps the boot overlay hidden-state rule', () => {
        const html = fs.readFileSync(path.join(REPO_ROOT, 'onboarding/index.html'), 'utf8');
        // The declaration, not just the selector: `#boot[hidden] { display: block }`
        // would satisfy a bare selector match and still paint over the whole page.
        expect(html).toMatch(/#boot\[hidden\]\s*\{\s*display:\s*none\s*;?\s*\}/);
    });

    it('matches a fresh build under normalized timestamp and SHA metadata', async () => {
        const normalizeMetadata = html => html
            .replace(
                /"generatedAt":"[^"]+","gitSha":"[^"]+"/,
                `"generatedAt":"${metadata.generatedAt}","gitSha":"${metadata.gitSha}"`,
            )
            .replace(
                /<div id="buildinfo">generated [^<]+ @ [^<]+<\/div>/,
                `<div id="buildinfo">generated ${metadata.generatedAt} @ ${metadata.gitSha}</div>`,
            );
        const rebuilt = await buildPage(REPO_ROOT);
        const committed = fs.readFileSync(path.join(REPO_ROOT, 'onboarding/index.html'), 'utf8');

        expect(normalizeMetadata(committed)).toBe(rebuilt);
    });

    it('builds byte-identically through an alternate checkout root name', async () => {
        const alternateRoot = '/proc/self/cwd';
        expect(fs.realpathSync(alternateRoot)).toBe(fs.realpathSync(REPO_ROOT));

        expect(await buildPage(alternateRoot)).toBe(await buildPage(REPO_ROOT));
    });

    it('builds byte-identically when ignored Playwright result state changes', async () => {
        const artifact = path.join(REPO_ROOT, 'test-results/.last-run.json');
        const existed = fs.existsSync(artifact);
        const original = existed ? fs.readFileSync(artifact) : undefined;
        const before = await buildPage(REPO_ROOT);
        try {
            fs.mkdirSync(path.dirname(artifact), { recursive: true });
            fs.writeFileSync(artifact, JSON.stringify({
                status: 'failed',
                failedTests: ['ignored-built-page-nondeterminism-probe'],
            }, null, 2));

            expect(await buildPage(REPO_ROOT)).toBe(before);
        } finally {
            if (original) fs.writeFileSync(artifact, original);
            else fs.rmSync(artifact, { force: true });
        }
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
