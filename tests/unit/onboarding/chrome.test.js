import { describe, it, expect, beforeEach } from 'vitest';
import { parseHash, buildHash, formatBytes, filterTree, findNode, nearestAnnotated,
         rankFor, scoreProfile, levelUnlocked, defaultProfile, loadProfile, saveProfile,
         WINDOWS, escapeHtml } from '../../../onboarding/src/app-logic.mjs';
import { REPO_ROOT, buildRuntimeBundle, assemblePage, buildData, buildContent }
    from '../../../onboarding/build.mjs';

describe('router helpers', () => {
    it('parses window + parts, defaults to intro', () => {
        expect(parseHash('#/tours/publish/3')).toEqual({ win: 'tours', parts: ['publish', '3'] });
        expect(parseHash('')).toEqual({ win: 'intro', parts: [] });
        expect(parseHash('#/nope')).toEqual({ win: 'intro', parts: [] });
        expect(buildHash('code', ['server', 'app.js'])).toBe('#/code/server/app.js');
    });
    it('WINDOWS lists the four windows in status-bar order', () => {
        expect(WINDOWS.map(w => w.id)).toEqual(['intro', 'tours', 'code', 'playground']);
    });
});

describe('tree helpers', () => {
    const tree = { name: 'root', path: '', kind: 'dir', size: 3, lines: null, children: [
        { name: 'server', path: 'server', kind: 'dir', size: 2, lines: null, children: [
            { name: 'app.js', path: 'server/app.js', kind: 'file', size: 1, lines: 10 },
            { name: 'db.js', path: 'server/db.js', kind: 'file', size: 1, lines: 10 } ] },
        { name: 'shared', path: 'shared', kind: 'dir', size: 1, lines: null, children: [
            { name: 'diff.js', path: 'shared/diff.js', kind: 'file', size: 1, lines: 10 } ] } ] };

    it('filterTree prunes to matches and their ancestors', () => {
        const out = filterTree(tree, 'diff');
        expect(out.children.map(c => c.name)).toEqual(['shared']);
        expect(filterTree(tree, 'zzz')).toBeNull();
        expect(filterTree(tree, '').children).toHaveLength(2);
    });
    it('findNode resolves exact paths', () => {
        expect(findNode(tree, 'server/app.js').name).toBe('app.js');
        expect(findNode(tree, 'missing/x.js')).toBeNull();
    });
    it('nearestAnnotated falls back to the closest annotated ancestor', () => {
        const anns = [{ path: 'server', note: 'server dir' }, { path: 'server/app.js', note: 'factory' }];
        expect(nearestAnnotated('server/app.js', anns).note).toBe('factory');
        expect(nearestAnnotated('server/db.js', anns).note).toBe('server dir');
        expect(nearestAnnotated('shared/diff.js', anns)).toBeNull();
    });
});

describe('profile + ranks', () => {
    beforeEach(() => localStorage.clear());
    const playground = { quizLevels: [{ questions: new Array(8).fill(0) }, { questions: new Array(8).fill(0) }],
                         bugHunt: [{ id: 'b1' }], wdil: [{ id: 'w1' }] };
    it('scores quiz best + bugs found + wdil clean solves', () => {
        const p = defaultProfile();
        p.quiz[0] = { answers: {}, best: 6 };
        p.bugs.b1 = 'found';
        p.wdil.w1 = { tries: 1, done: true, failed: false };
        expect(scoreProfile(p, playground)).toEqual({ points: 8, max: 18 });
    });
    it('rankFor walks thresholds', () => {
        expect(rankFor(0, 57)).toBe('visitor');
        expect(rankFor(29, 57)).toBe('contributor');
        expect(rankFor(57, 57)).toBe('maintainer');
    });
    it('level 0 open, later levels need best>=6 below', () => {
        const p = defaultProfile();
        expect(levelUnlocked(p, 0)).toBe(true);
        expect(levelUnlocked(p, 1)).toBe(false);
        p.quiz[0] = { answers: {}, best: 6 };
        expect(levelUnlocked(p, 1)).toBe(true);
    });
    it('profile round-trips localStorage and survives garbage', () => {
        const p = defaultProfile(); p.bootSeen = true; saveProfile(p);
        expect(loadProfile().bootSeen).toBe(true);
        localStorage.setItem('doctect-onboarding', '{corrupt');
        expect(loadProfile().v).toBe(1);
    });
    it('formatBytes', () => {
        expect(formatBytes(512)).toBe('512 B');
        expect(formatBytes(2048)).toBe('2.0 KB');
        expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
    });
    it('escapeHtml neutralizes markup', () => {
        expect(escapeHtml('node run.js <track> & "x"')).toBe('node run.js &lt;track&gt; &amp; &quot;x&quot;');
    });
});

describe('assembly', () => {
    it('fills every slot and leaves none behind', () => {
        const html = assemblePage({ style: '.x{}', runtime: 'var y=1;', dataJson: '{"d":1}',
            contentJson: '{"c":1}', diffBundle: 'window.DoctectDiff={};', footerHtml: 'sha abc' });
        expect(html).toContain('.x{}');
        expect(html).toContain('window.DOCTECT');
        expect(html).toContain('sha abc');
        expect(html).not.toContain('<!--SLOT:');
    });
    it('buildRuntimeBundle concatenates stripped modules with no module syntax left', () => {
        const bundle = buildRuntimeBundle(REPO_ROOT);
        expect(bundle).not.toMatch(/^import /m);
        expect(bundle).not.toMatch(/^export /m);
        expect(bundle).toContain('parseHash');
    });
    it('buildData and buildContent produce JSON-serializable payloads', async () => {
        const data = buildData(REPO_ROOT);
        expect(data.tree.kind).toBe('dir');
        expect(Array.isArray(data.excerpts)).toBe(true);
        const content = await buildContent();
        expect(JSON.parse(JSON.stringify(content))).toEqual(content);
    });
});
