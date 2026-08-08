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

    // "Only the server imports the engine" is the story the reader is GRADED on
    // (quiz L1, "What lives in shared/?"). The opposite claim has shipped FOUR
    // times in four different phrasings, so this guard is built to a rule the
    // last two rounds learned the hard way:
    //
    //   a known-bad phrase list is not sufficient on its own (copy 4 said it a
    //   fourth way and sailed through), and a semantic rule is not sufficient
    //   either (three of the four copies are PASSIVE — "imported by client and
    //   server" — so the client never "acts" and they sailed through too).
    //
    // Both families run, and every historical copy is kept as a fixture below so
    // the predicate can never quietly stop catching the ones it was written for.
    const VERBS = 'runs?|imports?|executes?|computes?|enforces?|renders?';
    // "client and server" is unambiguous. "both sides" is NOT — in this codebase's
    // merge vocabulary it means fork vs upstream ("threeWayDiff computes both sides'
    // change sets"), so it only counts inside an import/sharing phrase.
    const BOTH = ['both client and server', 'client and server',
                  '(?:imported|shared|used|available) (?:by|to) (?:both sides|both|either side)'].join('|');
    const ENGINE = String.raw`\bdiff\b|diff\.js|threeWayDiff|merge engine`;
    // Verbatim fragments of the four copies, as belt-and-braces behind the patterns.
    // Every one names the ENGINE in the bad relationship: "imported by BOTH client
    // and server" on its own is TRUE of shared/ (it is the graded quiz answer's own
    // wording), so a list of bare both-sides phrases would fire on correct text.
    const KNOWN_BAD = [
        /no dependencies, imported by client and server/i,
        /both sides — most importantly the diff engine/i,
        /the three-way diff engine and generator provenance/i,
        /renders the diff in the client/i,
    ];
    const PATTERNS = [
        // passive, both-sides first:  "…imported by both sides — … the diff engine"
        new RegExp(`\\b(${BOTH})\\b[^.]{0,80}(${ENGINE})`, 'i'),
        // mirrored:  "The three-way diff/merge engine — … imported by client and server"
        new RegExp(`(${ENGINE})[^.]{0,80}\\b(${BOTH})\\b`, 'i'),
        // active:  "renders the diff in the client", "the client runs the engine"
        new RegExp(`(${ENGINE})[^.]{0,60}\\bclient\\b[^.]{0,40}\\b(${VERBS})\\b`, 'i'),
        new RegExp(`\\b(${VERBS})\\b[^.]{0,40}\\b(in|on|by) the client\\b`, 'i'),
    ];
    // The escape hatch: a sentence may name the engine and the client together
    // when it says out loud which side runs it.
    const SERVER_ONLY = /only the server|server-side|the server computed|the server enforces/i;
    const semanticClaim = (sentence) =>
        !SERVER_ONLY.test(sentence)
        && new RegExp(ENGINE, 'i').test(sentence)
        && PATTERNS.some(re => re.test(sentence));
    const claimsClientRunsEngine = (sentence) =>
        KNOWN_BAD.some(re => re.test(sentence)) || semanticClaim(sentence);
    const sentencesOf = (strings) => strings.flatMap(s => s.split(/(?<=[.;])\s+/));
    const everyString = (value, out = []) => {
        if (typeof value === 'string') out.push(value);
        else if (value && typeof value === 'object') Object.values(value).forEach(v => everyString(v, out));
        return out;
    };

    // Every phrasing this claim has actually shipped in. Verbatim, so reverting any
    // of them in the source is caught by the sweep below AND proved caught here.
    const HISTORICAL_COPIES = {
        'shared/diff.js note (task 8)':
            'The three-way diff/merge engine — 189 lines, no dependencies, imported by client and server. This playground bundles the real thing (Merge Lab).',
        'intro paragraph 3 (task 2)':
            'It is one repo with no monorepo tooling: the React 19 + Vite client sits at the root (components/, pages/, services/, hooks/), the Express 5 server in server/ (SQLite in dev, Postgres in prod, versioned run-once migrations), and shared/ holds plain-ESM code imported by both sides — most importantly the diff engine.',
        'shared/ directory note (task 5)':
            'Plain ESM imported by BOTH client and server — the three-way diff engine and generator provenance rules.',
        'fork-merge tour blurb (task 6)':
            'The same 189-line plain-JS engine renders the diff in the client and enforces it on the server.',
    };
    // True statements that name the engine and the client in one breath. The guard
    // earns its keep only if it leaves these alone.
    const MUST_STAY_GREEN = {
        'generatorMetadata consumers':
            'Generator provenance shape + size caps, shared by validator, diff, and client.',
        'shared/ directory note (fixed)':
            'Plain ESM imported by BOTH client and server — generator metadata and shared validation rules. The diff engine lives here too, but only the server imports it today.',
        'shared/diff.js note (fixed)':
            'The three-way diff/merge engine — under 200 lines, no dependencies, server-side today (the client renders the ChangeSet the server computed). This playground bundles the real thing (Merge Lab).',
        'intro paragraph 3 (fixed)':
            'It is one repo with no monorepo tooling: the React 19 + Vite client sits at the root (components/, pages/, services/, hooks/), the Express 5 server in server/ (SQLite in dev, Postgres in prod, versioned run-once migrations), and shared/ holds plain-ESM code either side can import (password policy, generator metadata, project limits). The diff engine lives there too, but only the server imports it today — the client just renders the ChangeSet it gets back.',
        'fork-merge tour blurb (fixed)':
            'One plain-JS engine, server-side: it recomputes the diff on every view of the request and enforces it again at merge time. The client renders what comes back.',
        'quiz L1 option (graded answer)':
            'Plain ESM imported by BOTH client and server — generator metadata and shared validation rules',
        'quiz L1 why (graded answer)':
            'shared/generatorMetadata.js is imported by services/generatorSandbox.ts on the client AND server/validateAppState.js on the server; shared/passwordPolicy.js by pages/LoginPage.tsx AND server/auth.js. shared/diff.js is server-side today — the client renders the ChangeSet the server computed.',
    };

    it('the guard catches every phrasing this claim has ever shipped in', () => {
        for (const [where, text] of Object.entries(HISTORICAL_COPIES)) {
            expect(sentencesOf([text]).some(claimsClientRunsEngine), `missed: ${where}`).toBe(true);
        }
    });

    // …and the semantic patterns catch all four on their OWN, so the verbatim list
    // is redundancy rather than the thing doing the work. (A previous round shipped
    // a semantic rule that was green on three of the four: the passive phrasings
    // give the client no verb to be the subject of.)
    it('the semantic patterns alone catch all four, without the verbatim list', () => {
        for (const [where, text] of Object.entries(HISTORICAL_COPIES)) {
            expect(sentencesOf([text]).some(semanticClaim), `semantics missed: ${where}`).toBe(true);
        }
    });

    it('the guard leaves true statements about the engine alone', () => {
        for (const [where, text] of Object.entries(MUST_STAY_GREEN)) {
            expect(sentencesOf([text]).filter(claimsClientRunsEngine), `false positive: ${where}`).toEqual([]);
        }
    });

    it('never tells the reader the client runs the diff engine, anywhere', async () => {
        // Authored content (intro/tours/codeMap/playground) PLUS the render layer,
        // which carries its own copy — buildContent() alone does not reach it.
        const fs = await import('node:fs');
        const path = await import('node:path');
        const RENDER = ['introWin', 'toursWin', 'codeWin', 'playgroundWin']
            .map(m => fs.readFileSync(path.join(REPO_ROOT, `onboarding/src/render/${m}.mjs`), 'utf8'));
        const offenders = sentencesOf([...everyString(await buildContent()), ...RENDER])
            .filter(claimsClientRunsEngine);
        expect(offenders).toEqual([]);
    });

    it('says the true thing about shared/diff.js where it is annotated', () => {
        const note = CODE_MAP.annotations.find(a => a.path === 'shared/diff.js').note;
        expect(note).toContain('server-side today');
    });

    // Anti-rot for the claim above: if the client ever does import the engine,
    // this fires and points at the strings that have to change with it.
    it('the repo still agrees that only the server imports the engine', async () => {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const { scanTree, flattenTreePaths } = await import('../../../onboarding/build.mjs');
        const importers = flattenTreePaths(scanTree(REPO_ROOT))
            .filter(p => /\.[cm]?[jt]sx?$/.test(p) && !/\.test\./.test(p) && !p.startsWith('onboarding/'))
            .filter(p => /from ['"][^'"]*shared\/diff\.js['"]/
                .test(fs.readFileSync(path.join(REPO_ROOT, p), 'utf8')));
        expect(importers.sort()).toEqual(['server/routes/mergeRequests.js', 'server/stateCodec.js']);
    });
});

import { REPO_ROOT as ROOT2, extractExcerpts } from '../../../onboarding/build.mjs';
import { highlightCode } from '../../../onboarding/src/render/codeWin.mjs';

describe('deep dives + anchors', () => {
    it('ships the eight spec dives and every anchor resolves', () => {
        expect(CODE_MAP.deepDives.map(d => d.id)).toEqual(
            ['diff-engine', 'text-layout', 'generator-sandbox', 'migrations',
             'publication-pinning', 'validate-appstate', 'dotenv-seals', 'auth-stack']);
        const excerpts = extractExcerpts(ROOT2, CODE_MAP.anchors); // throws AnchorError on rot
        expect(excerpts.length).toBe(CODE_MAP.anchors.length);
        for (const dive of CODE_MAP.deepDives) {
            expect(dive.sections.length).toBeGreaterThanOrEqual(2);
            expect(dive.sections.some(s => s.anchorId)).toBe(true);
        }
    });

    // Anti-rot: re-pointing an anchor must not hand the page markup that the
    // highlighter mangles. Every shipped excerpt has to come out balanced and
    // with its text intact once the tokens are stripped again.
    it('highlights every shipped excerpt into balanced, text-preserving markup', () => {
        for (const excerpt of extractExcerpts(ROOT2, CODE_MAP.anchors)) {
            const html = highlightCode(excerpt.code);
            let depth = 0;
            for (const tag of html.match(/<\/?span[^>]*>/g) || []) {
                depth += tag.startsWith('</') ? -1 : 1;
                expect(depth, `${excerpt.id}: closing tag with nothing open`).toBeGreaterThanOrEqual(0);
            }
            expect(depth, `${excerpt.id}: unbalanced spans`).toBe(0);
            expect(html.replace(/<\/?span[^>]*>/g, ''), `${excerpt.id}: text changed`)
                .toBe(excerpt.code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
        }
    });
});

import { PLAYGROUND } from '../../../onboarding/src/content/playground.mjs';

describe('quiz ladder', () => {
    it('is 5 levels × 8 questions, each with a cited why', () => {
        expect(PLAYGROUND.quizLevels).toHaveLength(5);
        for (const level of PLAYGROUND.quizLevels) {
            expect(level.questions).toHaveLength(8);
            for (const q of level.questions) expect(q.why.length).toBeGreaterThan(20);
        }
    });
    it('answers are not all the same index (no answer-position tell)', () => {
        for (const level of PLAYGROUND.quizLevels) {
            expect(new Set(level.questions.map(q => q.answer)).size).toBeGreaterThan(1);
        }
    });
});

describe('quiz answer distribution', () => {
    it('no index dominates a level and constant-guessing cannot clear the 6/8 gate', () => {
        for (const [li, level] of PLAYGROUND.quizLevels.entries()) {
            for (let choice = 0; choice < 4; choice++) {
                const score = level.questions.filter(q => q.answer === choice).length;
                expect(score, `L${li} always-option-${choice} scores ${score}/8`).toBeLessThan(6);
                expect(score, `L${li} index ${choice} over-used`).toBeLessThanOrEqual(3);
            }
        }
    });
});

describe('quiz interaction', () => {
    const makeCtx = (content, profile, parts) => ({
        data: { vitals: { gitSha: 'x' } }, content, profile,
        save: () => {}, navigate: () => {}, route: { win: 'playground', parts }, diff: null,
    });

    it('locks later levels, unlocks on a passing best, and retry keeps the best', async () => {
        const { renderPlayground } = await import('../../../onboarding/src/render/playgroundWin.mjs');
        const { defaultProfile } = await import('../../../onboarding/src/app-logic.mjs');
        const content = await buildContent();
        const level = content.playground.quizLevels[0];
        const profile = defaultProfile();
        const el = document.createElement('div');

        renderPlayground(el, makeCtx(content, profile, ['quiz', '1']));
        expect(el.textContent).toContain('locked');

        renderPlayground(el, makeCtx(content, profile, ['quiz', '0']));
        level.questions.forEach((q, qi) => {
            el.querySelector(`.quiz-opt[data-q="${qi}"][data-o="${q.answer}"]`).click();
        });
        expect(profile.quiz[0].best).toBe(8);

        renderPlayground(el, makeCtx(content, profile, ['quiz', '1']));
        expect(el.textContent).not.toContain('locked');

        renderPlayground(el, makeCtx(content, profile, ['quiz', '0']));
        el.querySelector('[data-reset]').click();
        expect(profile.quiz[0].best).toBe(8);
        expect(profile.quiz[0].answers).toEqual({});
    });
});

describe('bug hunt', () => {
    it('ships seven bugs whose guilty lines are in range (validator) and stories are told', () => {
        expect(PLAYGROUND.bugHunt.map(b => b.id)).toEqual(
            ['dotenv-resurrection', 'rate-limit-toggle', 'like-wildcards', 'provider-id',
             'commit-timestamps', 'signup-cap-space', 'spa-fallback']);
        for (const b of PLAYGROUND.bugHunt) expect(b.story.length).toBeGreaterThan(80);
    });

    // The bug panel highlights each snippet LINE BY LINE. highlightCode's string
    // pass can emit malformed markup on a line holding an unbalanced quote next to
    // a comment (Task 7's review found the shape), so pin every shipped line.
    it('every bug-hunt line highlights to balanced, text-preserving markup', async () => {
        const { highlightCode } = await import('../../../onboarding/src/render/codeWin.mjs');
        for (const bug of PLAYGROUND.bugHunt) {
            for (const [i, line] of bug.code.split('\n').entries()) {
                const html = highlightCode(line);
                let depth = 0;
                for (const tag of html.match(/<\/?span[^>]*>/g) || []) {
                    depth += tag.startsWith('</') ? -1 : 1;
                    expect(depth, `${bug.id} line ${i}: closing tag with nothing open`).toBeGreaterThanOrEqual(0);
                }
                expect(depth, `${bug.id} line ${i}: unclosed span`).toBe(0);
                const text = html.replace(/<\/?span[^>]*>/g, '')
                    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
                expect(text, `${bug.id} line ${i}: text not preserved`).toBe(line);
            }
        }
    });
});

describe('bug hunt interaction', () => {
    it('clicking the guilty line marks found; a wrong line reveals', async () => {
        const { renderPlayground } = await import('../../../onboarding/src/render/playgroundWin.mjs');
        const { defaultProfile } = await import('../../../onboarding/src/app-logic.mjs');
        const content = await buildContent();
        const makeCtx = (profile, parts) => ({
            data: { vitals: { gitSha: 'x' } }, content, profile,
            save: () => {}, navigate: () => {}, route: { win: 'playground', parts }, diff: null });
        const el = document.createElement('div');
        const profile = defaultProfile();
        const bug = content.playground.bugHunt[0];
        renderPlayground(el, makeCtx(profile, ['bugs', bug.id]));
        el.querySelector(`[data-line="${bug.guiltyLine}"]`).click();
        expect(profile.bugs[bug.id]).toBe('found');
        const el2 = document.createElement('div');
        const profile2 = defaultProfile();
        renderPlayground(el2, makeCtx(profile2, ['bugs', bug.id]));
        el2.querySelector(`[data-line="${(bug.guiltyLine + 1) % bug.code.split('\n').length}"]`).click();
        expect(profile2.bugs[bug.id]).toBe('revealed');
    });
});

import { DIFF_SCENARIOS } from './fixtures/diffScenarios.js';
import * as realDiff from '../../../shared/diff.js';

describe('merge lab', () => {
    it('presets mirror the parity fixtures exactly', () => {
        expect(PLAYGROUND.mergeScenarios.map(s => s.name)).toEqual(DIFF_SCENARIOS.map(s => s.name));
        PLAYGROUND.mergeScenarios.forEach((s, i) => {
            expect({ base: s.base, fork: s.fork, upstream: s.upstream })
                .toEqual({ base: DIFF_SCENARIOS[i].base, fork: DIFF_SCENARIOS[i].fork, upstream: DIFF_SCENARIOS[i].upstream });
            expect(s.blurb.length).toBeGreaterThan(20);
        });
    });
    it('renderMerge runs the engine and prints conflicts', async () => {
        const { renderPlayground } = await import('../../../onboarding/src/render/playgroundWin.mjs');
        const { defaultProfile } = await import('../../../onboarding/src/app-logic.mjs');
        const content = await buildContent();
        const el = document.createElement('div');
        const ctx = { data: { vitals: { gitSha: 'x' } }, content, profile: defaultProfile(),
            save: () => {}, navigate: () => {}, route: { win: 'playground', parts: ['merge'] },
            diff: realDiff };
        renderPlayground(el, ctx);
        el.querySelector('[data-scenario]').value = 'same-template-conflict';
        el.querySelector('[data-scenario]').dispatchEvent(new Event('change'));
        el.querySelector('[data-run]').click();
        // Not the loose 'conflict' — the clean verdict ('no conflicts — mergeable')
        // contains that too, so the engine could stop detecting conflicts entirely
        // and this test would stay green. Anchored on the verdict marker so it
        // cannot pass on '11 conflict(s)' either.
        expect(el.querySelector('.merge-out').textContent).toMatch(/⚠ 1 conflict\(s\)/);
    });
    it('says out loud that it models the conflict gate only', async () => {
        const { renderPlayground } = await import('../../../onboarding/src/render/playgroundWin.mjs');
        const { defaultProfile } = await import('../../../onboarding/src/app-logic.mjs');
        const content = await buildContent();
        const el = document.createElement('div');
        renderPlayground(el, { data: { vitals: { gitSha: 'x' } }, content, profile: defaultProfile(),
            save: () => {}, navigate: () => {}, route: { win: 'playground', parts: ['merge'] }, diff: realDiff });
        expect(el.textContent).toContain('models the conflict gate only');
    });
});

describe('where-does-it-live', () => {
    it('ships ten prompts with existing answer paths (validator checks existence)', () => {
        expect(PLAYGROUND.wdil).toHaveLength(10);
        for (const w of PLAYGROUND.wdil) expect(w.answers.length).toBeGreaterThanOrEqual(1);
    });

    // A prompt has to be answerable from the prompt: the tries are spent before
    // the hint appears, so anything needed to pick between accepted answers (or
    // to disambiguate a plausible near-miss) belongs in the prompt itself.
    it('asks for everything its answers accept', () => {
        const cap = PLAYGROUND.wdil.find(w => w.id === 'signup-cap');
        expect(cap.answers).toContain('server/auth.js');   // the enforcement half
        expect(cap.prompt).toContain('enforced');
        const roll = PLAYGROUND.wdil.find(w => w.id === 'card-rollover');
        expect(roll.prompt).toContain('runs that cycle');  // not buried in the hint
    });
});

describe('where-does-it-live interaction', () => {
    // A non-answer file that is guaranteed to be in the scanned tree.
    const DECOY = 'package.json';
    const makeCtx = (content, profile, parts, tree) => ({
        data: { vitals: { gitSha: 'x' }, tree }, content, profile,
        save: () => {}, navigate: () => {}, route: { win: 'playground', parts }, diff: null,
    });

    it('a correct pick solves it and scores', async () => {
        const { renderPlayground } = await import('../../../onboarding/src/render/playgroundWin.mjs');
        const { defaultProfile, scoreProfile } = await import('../../../onboarding/src/app-logic.mjs');
        const { scanTree } = await import('../../../onboarding/build.mjs');
        const content = await buildContent();
        const tree = scanTree(REPO_ROOT);
        const item = content.playground.wdil[0];
        const profile = defaultProfile();
        const el = document.createElement('div');

        renderPlayground(el, makeCtx(content, profile, ['wdil', item.id], tree));
        expect(el.textContent).not.toContain('hint:');
        el.querySelector(`a.tree-file[href="#/code/${item.answers[0]}"]`).click();

        expect(profile.wdil[item.id]).toEqual({ tries: 0, done: true, failed: false });
        expect(el.textContent).toContain('correct:');
        expect(scoreProfile(profile, content.playground).points).toBe(1);
    });

    it('a wrong pick burns exactly one try and shows the hint; the third reveals without scoring', async () => {
        const { renderPlayground } = await import('../../../onboarding/src/render/playgroundWin.mjs');
        const { defaultProfile, scoreProfile } = await import('../../../onboarding/src/app-logic.mjs');
        const { scanTree } = await import('../../../onboarding/build.mjs');
        const content = await buildContent();
        const tree = scanTree(REPO_ROOT);
        const item = content.playground.wdil[0];
        const profile = defaultProfile();
        const el = document.createElement('div');
        const miss = () => el.querySelector(`a.tree-file[href="#/code/${DECOY}"]`).click();

        renderPlayground(el, makeCtx(content, profile, ['wdil', item.id], tree));
        miss();
        expect(profile.wdil[item.id]).toEqual({ tries: 1, done: false, failed: false });
        expect(el.textContent).toContain(`hint: ${item.hint}`);
        expect(el.textContent).toContain('2 tries left');

        miss();
        expect(profile.wdil[item.id]).toEqual({ tries: 2, done: false, failed: false });

        miss();
        expect(profile.wdil[item.id]).toEqual({ tries: 3, done: true, failed: true });
        expect(el.textContent).toContain('it lives in:');
        expect(el.textContent).toContain(item.answers[0]);
        // A revealed answer must never score.
        expect(scoreProfile(profile, content.playground).points).toBe(0);

        // Resolved: the tree stops taking picks.
        miss();
        expect(profile.wdil[item.id]).toEqual({ tries: 3, done: true, failed: true });
    });
});
