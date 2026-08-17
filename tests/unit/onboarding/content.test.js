// tests/unit/onboarding/content.test.js
import { describe, it, expect } from 'vitest';
import { REPO_ROOT, buildRefs, buildContent, scanTree, flattenTreePaths } from '../../../onboarding/build.mjs';
import { validateContent } from '../../../onboarding/src/content/validate.mjs';
import { INTRO } from '../../../onboarding/src/content/intro.mjs';
import { TOURS } from '../../../onboarding/src/content/tours.mjs';
import { classifyLocalStorageContext, localStorageStatements } from '../storageCopyAntiRot';

const refs = buildRefs(REPO_ROOT);

const contentStrings = (value, out = []) => {
    if (typeof value === 'string') out.push(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(item => contentStrings(item, out));
    return out;
};
const PROJECT_PREPARATION_ORDER = /\bsource[- ]shape validation\b[^.\n]{0,180}\bschema migration\b[^.\n]{0,180}\bfinal validation(?:\s+and\s+|\/)normalization\b[^.\n]{0,180}\bpersistence\b/i;

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

    it('teaches IndexedDB authority without reviving active localStorage claims', async () => {
        const introCopy = INTRO.about.join(' ');
        const localFirst = TOURS.find(tour => tour.id === 'local-first');
        const tourCopy = contentStrings(localFirst, []).join(' ');
        const diagram = localFirst.diagram.join('\n');

        expect(introCopy).toMatch(/\bIndexedDB\b[^.]{0,100}\b(?:document\s+)?authority\b/i);
        expect(introCopy).toMatch(/\bLocalWorkspaceStore\b[^.]{0,100}\b(?:local\s+)?document authority\b/i);
        expect(introCopy).toMatch(/explicit(?:ly)?[^.]{0,50}opt-in|opt-in[^.]{0,50}explicit/i);
        for (const label of ['WorkspaceBootstrapGate', 'LocalWorkspaceStore', 'IndexedDB', 'useWorkspaceProjectWrites']) {
            expect(diagram, `local-first diagram missing ${label}`).toContain(label);
        }

        expect(tourCopy).toMatch(/three-method[^.]{0,80}LocalWorkspaceStore|LocalWorkspaceStore[^.]{0,80}three-method/i);
        for (const method of ['bootstrap', 'commit', 'exportRecoveryBundle']) {
            expect(tourCopy, `local-first tour missing ${method}`).toMatch(new RegExp(`\\b${method}\\b`));
        }
        expect(tourCopy).toMatch(/\bsix\b[^.]{0,100}\bstores\b[^.]{0,120}\batomic/i);
        for (const store of [
            'projects', 'workspace', 'presets', 'pendingImports', 'migrationLedger', 'legacyBackup',
        ]) {
            expect(tourCopy, `local-first tour missing IndexedDB store ${store}`).toContain(store);
        }
        expect(tourCopy).toContain('useWorkspaceProjectWrites');
        expect(tourCopy).toMatch(/per-project[^.]{0,80}\bqueue|\bqueue[^.]{0,80}per-project/i);
        expect(tourCopy).toMatch(/compare-and-swap|\bCAS\b/);
        expect(tourCopy).toContain('loadProjectState');
        expect(tourCopy).toContain('migrateState');
        expect(tourCopy).toMatch(PROJECT_PREPARATION_ORDER);
        expect(tourCopy).toMatch(/legacy[^.]{0,80}\blocalStorage\b[^.]{0,80}retained[^.]{0,40}only[^.]{0,40}read-only[^.]{0,120}(?:migration|recovery)/i);
        expect(tourCopy).toMatch(/\bno\b[^.]{0,80}\bcleanup\b/i);
        expect(tourCopy).toMatch(/\bno\b[^.]{0,80}\bfallback\b/i);
        expect(tourCopy).toMatch(/\bno\b[^.]{0,80}\bdual[- ]write\b/i);
        expect(tourCopy).toMatch(/cloud[^.]{0,80}(?:explicit[^.]{0,30}opt-in|opt-in[^.]{0,30}explicit)/i);

        const files = new Set(localFirst.steps.flatMap(step => step.files));
        for (const requiredPath of [
            'components/workspace/WorkspaceBootstrapGate.tsx',
            'services/localWorkspace/LocalWorkspaceStore.ts',
            'services/localWorkspace/schema.ts',
            'hooks/useWorkspaceProjectWrites.ts',
            'services/loadProjectState.ts',
            'services/migration.ts',
        ]) {
            expect(files.has(requiredPath), `local-first tour missing ${requiredPath}`).toBe(true);
        }

        const staleClaims = [
            'Projects live in browser localStorage.',
            'The whole editor runs against one JSON document in localStorage.',
            'Projects persist to localStorage on every change.',
            'A project without cloud metadata uses pure localStorage.',
            'Offline documents still call localStorage home.',
        ];
        expect(staleClaims.every(claim => classifyLocalStorageContext(claim) === null)).toBe(true);
        expect(classifyLocalStorageContext(
            'Legacy localStorage document keys remain read-only inputs for migration and recovery.',
        )).toBe('legacy-read-only-migration-recovery');
        expect(classifyLocalStorageContext(
            'localStorage stores a non-document onboarding profile preference.',
        )).toBe('non-document-preference');

        const allowedContexts = new Set([
            'legacy-read-only-migration-recovery',
            'non-document-preference',
        ]);
        const offenders = contentStrings(await buildContent(), [])
            .flatMap(localStorageStatements)
            .filter(statement => !allowedContexts.has(classifyLocalStorageContext(statement)));
        expect(offenders, `localStorage mentions without explicit onboarding context:\n${offenders.join('\n')}`)
            .toEqual([]);
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

    it('identifies shared validator implementation and server compatibility path', () => {
        const shared = CODE_MAP.annotations.find(a => a.path === 'shared/validateAppState.js');
        const server = CODE_MAP.annotations.find(a => a.path === 'server/validateAppState.js');
        expect(shared?.note).toMatch(/implementation/i);
        expect(server?.note).toMatch(/compatibility re-export/i);
        expect(CODE_MAP.anchors.find(a => a.id === 'validate-appstate')?.file)
            .toBe('shared/validateAppState.js');
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
    // Participles are listed explicitly: `imports?` does not match "imported", so
    // "shared/diff.js is imported by the client" escaped every guard until now.
    const VERBS = 'runs?|imports?|executes?|computes?|enforces?|renders?'
        + '|imported|executed|rendered|computed|enforced';
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
        /diff\/merge engine[^.]{0,80}imported by client and server/i,
        /both sides — most importantly the diff engine/i,
        /the three-way diff engine and generator provenance/i,
        /renders the diff in the client/i,
    ];
    const PATTERNS = [
        // passive, both-sides first:  "…imported by both sides — … the diff engine"
        new RegExp(`\\b(${BOTH})\\b[^.]{0,80}(${ENGINE})`, 'i'),
        // mirrored:  "The three-way diff/merge engine — … imported by client and server"
        new RegExp(`(${ENGINE})[^.]{0,80}\\b(${BOTH})\\b`, 'i'),
        // active, client first:  "The client runs the diff engine."  ENGINE is gated
        // separately in semanticClaim, so this deliberately does NOT sequence the two
        // — requiring the engine to be named BEFORE the client is what dropped this
        // whole family once. Keep it unordered.
        new RegExp(`\\bclient\\b[^.]{0,40}\\b(${VERBS})\\b`, 'i'),
        // active, engine first:  "…the diff engine, which the client runs"
        new RegExp(`(${ENGINE})[^.]{0,60}\\bclient\\b[^.]{0,40}\\b(${VERBS})\\b`, 'i'),
        // active, client as object:  "renders the diff in the client", "imported by the client"
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
    // Phrasings that have not shipped but must not be able to. The plainest way of
    // saying the false thing is the ACTIVE voice — which is what this test and the
    // predicate are both named after — and a pattern rewrite silently dropped it
    // once already. The passive participle is the other easy escape ("is imported
    // by the client": `imports?` does not match "imported").
    const MUST_BE_CAUGHT = {
        'active · runs': 'The client runs the diff engine.',
        'active · imports': 'The client imports shared/diff.js directly.',
        'active · executes': 'The client executes threeWayDiff before it posts.',
        'passive participle': 'shared/diff.js is imported by the client.',
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
        // The other dependency-free shared modules ARE imported by both sides. A
        // verbatim fragment that is not engine-scoped fires on these.
        'a true both-sides claim about another shared module':
            'shared/passwordPolicy.js — no dependencies, imported by client and server.',
        'generatorMetadata, both sides, spelled out':
            'Generator provenance shape + size caps, no dependencies, imported by client and server.',
    };

    it('the guard catches every phrasing this claim has ever shipped in', () => {
        for (const [where, text] of Object.entries(HISTORICAL_COPIES)) {
            expect(sentencesOf([text]).some(claimsClientRunsEngine), `missed: ${where}`).toBe(true);
        }
    });

    it('the guard catches the plainest ways of saying it, shipped or not', () => {
        for (const [where, text] of Object.entries(MUST_BE_CAUGHT)) {
            expect(sentencesOf([text]).some(claimsClientRunsEngine), `missed: ${where}`).toBe(true);
        }
    });

    // …and the semantic patterns catch all four on their OWN, so the verbatim list
    // is redundancy rather than the thing doing the work. (A previous round shipped
    // a semantic rule that was green on three of the four: the passive phrasings
    // give the client no verb to be the subject of.)
    it('the semantic patterns alone catch every phrasing, without the verbatim list', () => {
        for (const [where, text] of Object.entries({ ...HISTORICAL_COPIES, ...MUST_BE_CAUGHT })) {
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

import fs from 'node:fs';
import path from 'node:path';

// Sibling guards to the shared/diff.js importer pin above, for the claims that are
// COUNTABLE against the repo. Every one of these shipped wrong at least once: a
// module states a number, a later task corrects it in its own module, nobody sweeps
// back. A count that the repo can answer should not be re-checked by hand.
describe('countable claims still agree with the repo', () => {
    const readRepo = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

    // Shipped as "Two migrations are database triggers" while three do. That note is
    // also the nearest-commentary FALLBACK for every unannotated file under
    // server/migrations/, so it is the most-shown sentence in the module.
    it('exactly three migrations install database triggers', () => {
        const src = readRepo('server/migrations/index.js');
        const ids = [...src.matchAll(/id:\s*'(\d{3}_[a-z0-9_]+)'/g)];
        const withTriggers = ids.filter(([, ], i) => {
            const from = ids[i].index;
            const to = i + 1 < ids.length ? ids[i + 1].index : src.length;
            return /CREATE TRIGGER/.test(src.slice(from, to));
        }).map(m => m[1]);
        expect(withTriggers,
            'server/migrations/index.js changed which migrations CREATE TRIGGER. Update the '
            + '"server/migrations" and "server/migrations/index.js" annotations in '
            + 'onboarding/src/content/code-map.mjs, plus the migrations deep dive.'
        ).toEqual(['011_account_moderation', '012_session_suspension_guard', '014_platform_audit_actions']);
        const note = CODE_MAP.annotations.find(a => a.path === 'server/migrations').note;
        expect(note, 'the note must still say how many install triggers').toContain('Three');
    });

    // Shipped enumerating FOUR classes and closing "Everything else coexists" while
    // the engine detects six — and the Merge Lab ships a preset producing one of the
    // two that were missing, so a reader disproved the deep dive with one click.
    it('shared/diff.js still detects exactly six conflict classes', () => {
        const src = readRepo('shared/diff.js');
        const pushes = src.split('conflicts.push').length - 1;
        // 7 push sites, 6 classes: removed-vs-modified is pushed twice, once per
        // direction (fork removed / upstream removed), and reads as one class.
        expect(pushes,
            'shared/diff.js gained or lost a conflicts.push. Re-enumerate the conflict '
            + 'classes in the diff-engine deep dive (onboarding/src/content/code-map.mjs) '
            + 'AND the fork-merge tour step (onboarding/src/content/tours.mjs) — both list '
            + 'them out loud and both have been wrong before.'
        ).toBe(7);
        for (const [where, text] of Object.entries({
            'code-map diff-engine dive': CODE_MAP.deepDives.find(d => d.id === 'diff-engine')
                .sections.find(s => s.anchorId === 'diff-threeway').text,
            'fork-merge tour step': TOURS.find(t => t.id === 'fork-merge')
                .steps.find(s => /threeWayDiff/.test(s.text)).text,
        })) {
            expect(text, `${where} must state the count`).toMatch(/six/i);
        }
    });

    // Shipped as "every path that accepts an AppState: commits, publish, …" and
    // "Every write path funnels through it — saves, publishes, merges". Publish takes
    // listing fields and an If-Match head; it never accepts an AppState.
    it('validateAppState still has exactly three server call sites', () => {
        const sites = {};
        for (const rel of flattenTreePaths(scanTree(REPO_ROOT))) {
            if (!rel.startsWith('server/') || !/\.[cm]?[jt]sx?$/.test(rel) || /\.test\./.test(rel)) continue;
            const calls = readRepo(rel).split(/(?<![A-Za-z])validateAppState\(/).length - 1;
            if (calls) sites[rel] = calls;
        }
        expect(sites,
            'the validateAppState call sites moved. Update the validate-appstate deep dive '
            + '(onboarding/src/content/code-map.mjs) and the cloud-save tour step that names '
            + 'them (onboarding/src/content/tours.mjs) — if publish ever gains one, both '
            + 'currently say out loud that it has none.'
        ).toEqual({ 'server/routes/mergeRequests.js': 1, 'server/routes/projects.js': 2 });
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
        expect(CODE_MAP.anchors.find(a => a.id === 'validate-appstate')?.file)
            .toBe('shared/validateAppState.js');
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

// Three of the four windows executed in ZERO committed tests: a refactor that made
// renderTours/renderCode throw would have shipped a blank window under a green
// suite. These drive the two that the playground tests below do not.
describe('tour + code windows actually render', () => {
    const baseCtx = (content, parts, data = {}) => ({
        content, data, profile: { quiz: {}, bugs: {}, wdil: {} },
        save: () => {}, navigate: () => {}, diff: null, route: { win: 'x', parts },
    });

    it('renderTours paints the active step and lights exactly its diagram tokens', async () => {
        const { renderTours } = await import('../../../onboarding/src/render/toursWin.mjs');
        const content = await buildContent();
        const tour = content.tours.find(t => t.id === 'fork-merge');
        const idx = tour.steps.length - 1;
        const el = document.createElement('div');

        renderTours(el, baseCtx(content, ['fork-merge', String(idx)]));

        expect(el.querySelector('.tour-text').textContent).toBe(tour.steps[idx].text);
        const lit = [...el.querySelectorAll('.diag.lit')].map(n => n.dataset.d).sort();
        expect(lit.length).toBeGreaterThan(0);
        expect(lit).toEqual([...tour.steps[idx].highlight].sort());
        // The unlit tokens must still render — a diagram that lights everything, or
        // nothing, is the failure this catches.
        expect(el.querySelectorAll('.diag').length).toBeGreaterThan(lit.length);
    });

    it('renderCode paints a deep dive with its anchored excerpt', async () => {
        const { renderCode } = await import('../../../onboarding/src/render/codeWin.mjs');
        const content = await buildContent();
        const dive = content.codeMap.deepDives.find(d => d.id === 'diff-engine');
        const idx = dive.sections.findIndex(s => s.anchorId === 'diff-changeset');
        const excerpts = extractExcerpts(REPO_ROOT, content.codeMap.anchors);
        const el = document.createElement('div');

        renderCode(el, baseCtx(content, ['dive', 'diff-engine', String(idx)], { excerpts }));

        expect(el.querySelector('.pane-title').textContent).toContain(dive.title);
        expect(el.textContent).toContain(dive.sections[idx].text);
        const code = el.querySelector('pre.code');
        expect(code, 'the anchored excerpt did not render').not.toBeNull();
        expect(code.textContent).toContain('export const computeChangeSet');
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
