// tests/unit/onboarding/content.test.js
import { describe, it, expect } from 'vitest';
import { REPO_ROOT, buildRefs, buildContent } from '../../../onboarding/build.mjs';
import { validateContent } from '../../../onboarding/src/content/validate.mjs';
import { INTRO } from '../../../onboarding/src/content/intro.mjs';
import { TOURS } from '../../../onboarding/src/content/tours.mjs';

const refs = buildRefs(REPO_ROOT);

describe('content integrity', () => {
    it('every content module is JSON-serializable and passes validation', async () => {
        const content = await buildContent();
        expect(JSON.parse(JSON.stringify(content))).toEqual(content);
        expect(validateContent(content, refs)).toEqual([]);
    });

    it('validators actually catch rot', () => {
        const broken = {
            intro: { ...INTRO, roundLabels: { 'not-a-real-spec.md': 'x' } },
            tours: [{ id: 't', title: 'T', blurb: 'b', diagram: ['{{a:A}}'],
                      steps: [{ text: 's', files: ['no/such/file.js'], highlight: ['a'] }] }],
            codeMap: { annotations: [{ path: 'also/missing.ts', note: 'n' }], deepDives: [], anchors: [] },
            playground: { quizLevels: [{ title: 'L', questions: [
                { q: 'q?', options: ['a', 'b', 'c'], answer: 9, why: 'w' }] }],
                bugHunt: [], mergeScenarios: [], wdil: [] },
        };
        const errors = validateContent(broken, refs);
        expect(errors.some(e => e.includes('not-a-real-spec.md'))).toBe(true);
        expect(errors.some(e => e.includes('no/such/file.js'))).toBe(true);
        expect(errors.some(e => e.includes('also/missing.ts'))).toBe(true);
        expect(errors.some(e => e.includes('4 options'))).toBe(true);
        expect(errors.some(e => e.includes('answer'))).toBe(true);
    });
});

describe('INTRO content', () => {
    it('is substantively filled', () => {
        expect(INTRO.about.length).toBeGreaterThanOrEqual(3);
        expect(INTRO.run.length).toBeGreaterThanOrEqual(5);
        expect(INTRO.houseMethod.stages.length).toBeGreaterThanOrEqual(6);
        expect(INTRO.houseMethod.catches.length).toBeGreaterThanOrEqual(3);
        expect(Object.keys(INTRO.roundLabels).length).toBeGreaterThanOrEqual(12);
    });
});

describe('TOURS content', () => {
    it('ships the six spec tours', () => {
        expect(TOURS.map(t => t.id)).toEqual(
            ['local-first', 'cloud-save', 'publish', 'fork-merge', 'pdf-export', 'signup']);
        for (const tour of TOURS) {
            expect(tour.steps.length).toBeGreaterThanOrEqual(5);
            expect(tour.diagram.length).toBeGreaterThanOrEqual(4);
            expect(tour.steps.every(s => s.files.length >= 1)).toBe(true);
        }
    });
});

import { CODE_MAP } from '../../../onboarding/src/content/code-map.mjs';

describe('CODE_MAP annotations', () => {
    it('covers the load-bearing surface', () => {
        expect(CODE_MAP.annotations.length).toBeGreaterThanOrEqual(40);
        const annotated = new Set(CODE_MAP.annotations.map(a => a.path));
        for (const must of ['components', 'pages', 'services', 'server', 'shared', 'tests',
            'server/routes/projects.js', 'shared/diff.js', 'services/textLayout.ts',
            'server/auth.js', 'components/canvas/CanvasElement.tsx', 'types.ts']) {
            expect(annotated.has(must), `missing annotation for ${must}`).toBe(true);
        }
    });
});
