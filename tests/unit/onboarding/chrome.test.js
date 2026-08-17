import { describe, it, expect, beforeEach } from 'vitest';
import { parseHash, buildHash, formatBytes, filterTree, findNode, nearestAnnotated,
         rankFor, scoreProfile, levelUnlocked, defaultProfile, loadProfile, saveProfile,
         WINDOWS, escapeHtml } from '../../../onboarding/src/app-logic.mjs';
import { REPO_ROOT, buildBrowserPreferencesBundle, buildRuntimeBundle,
         assemblePage, buildData, buildContent }
    from '../../../onboarding/build.mjs';
import { highlightCode } from '../../../onboarding/src/render/codeWin.mjs';

const inspectPreferenceBundle = bundle => new Function('window', `
    ${bundle}
    const operations = [
        ['readBrowserPreference', readBrowserPreference],
        ['writeBrowserPreference', writeBrowserPreference],
        ['wasMigrationReceiptSeen', wasMigrationReceiptSeen],
        ['markMigrationReceiptSeen', markMigrationReceiptSeen],
    ];
    return {
        readBrowserPreference: typeof readBrowserPreference,
        writeBrowserPreference: typeof writeBrowserPreference,
        wasMigrationReceiptSeen: typeof wasMigrationReceiptSeen,
        markMigrationReceiptSeen: typeof markMigrationReceiptSeen,
        fixedBrowserPreferenceKeys: typeof fixedBrowserPreferenceKeys,
        readRuntimeBrowserPreference: typeof readRuntimeBrowserPreference,
        writeRuntimeBrowserPreference: typeof writeRuntimeBrowserPreference,
        publicProperties: operations.flatMap(([operationName, operation]) =>
            Reflect.ownKeys(operation).map(key => {
                const descriptor = Object.getOwnPropertyDescriptor(operation, key);
                return {
                    name: operationName + '.' + String(key),
                    propertyName: String(key),
                    descriptorKeys: Reflect.ownKeys(descriptor).map(String).sort(),
                    configurable: descriptor.configurable,
                    enumerable: descriptor.enumerable,
                    writable: descriptor.writable,
                    valueType: typeof descriptor.value,
                    primitiveValue: ['string', 'number', 'boolean'].includes(typeof descriptor.value)
                        ? descriptor.value
                        : undefined,
                    getterType: typeof descriptor.get,
                    setterType: typeof descriptor.set,
                    rawStorage: descriptor.value === window.localStorage,
                };
            })),
    };
`);

const assertPreferenceBundleSurfaceClosed = (bundle, windowValue = {}) => {
    const inspection = inspectPreferenceBundle(bundle)(windowValue);
    const expectedFunctions = new Map([
        ['readBrowserPreference', 1],
        ['writeBrowserPreference', 2],
        ['wasMigrationReceiptSeen', 1],
        ['markMigrationReceiptSeen', 1],
    ]);
    const approvedNames = new Set([...expectedFunctions.keys()].flatMap(name => [
        `${name}.length`,
        `${name}.name`,
    ]));
    const unexpected = inspection.publicProperties.filter(property => !approvedNames.has(property.name));
    if (unexpected.length > 0) {
        throw new Error(unexpected.map(property => property.name).join(', '));
    }
    for (const [functionName, length] of expectedFunctions) {
        for (const [propertyName, primitiveValue] of [['length', length], ['name', functionName]]) {
            const property = inspection.publicProperties.find(candidate =>
                candidate.name === `${functionName}.${propertyName}`);
            const expected = {
                name: `${functionName}.${propertyName}`,
                propertyName,
                descriptorKeys: ['configurable', 'enumerable', 'value', 'writable'],
                configurable: true,
                enumerable: false,
                writable: false,
                valueType: typeof primitiveValue,
                primitiveValue,
                getterType: 'undefined',
                setterType: 'undefined',
                rawStorage: false,
            };
            if (JSON.stringify(property) !== JSON.stringify(expected)) {
                throw new Error(`${functionName}.${propertyName} descriptor changed`);
            }
        }
    }
    return { ...inspection, publicProperties: [] };
};

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

describe('highlightCode', () => {
    it('tags keywords, strings and comments and escapes the code itself', () => {
        const out = highlightCode('const tag = "<script>"; // & done');
        expect(out).toContain('<span class="tok-k">const</span>');
        expect(out).toContain('&lt;script&gt;');
        expect(out).not.toContain('<script>');
        expect(out).toContain('<span class="tok-c">// &amp; done</span>');
    });
    it('never rewrites the markup it already emitted (class is itself a keyword)', () => {
        const src = "const x = 'added'; // note";
        const out = highlightCode(src);
        expect(out).not.toMatch(/<span <span/);          // nested-tag corruption
        expect(out).not.toMatch(/>=&quot;|>="tok-/);      // attribute text leaking into the page
        expect(out.replace(/<\/?span[^>]*>/g, '')).toBe(src);
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
        const preferenceDefinition = bundle.indexOf('const readBrowserPreference =');
        const preferenceUse = bundle.indexOf('const raw = readBrowserPreference(STORE_KEY);');
        expect(preferenceDefinition).toBeGreaterThanOrEqual(0);
        expect(preferenceUse).toBeGreaterThan(preferenceDefinition);
    });
    it('exposes only public preference operations to the onboarding runtime', () => {
        expect(assertPreferenceBundleSurfaceClosed(buildBrowserPreferencesBundle(REPO_ROOT))).toEqual({
            readBrowserPreference: 'function',
            writeBrowserPreference: 'function',
            wasMigrationReceiptSeen: 'function',
            markMigrationReceiptSeen: 'function',
            fixedBrowserPreferenceKeys: 'undefined',
            readRuntimeBrowserPreference: 'undefined',
            writeRuntimeBrowserPreference: 'undefined',
            publicProperties: [],
        });
    });
    it('rejects non-enumerable private-operation and raw-storage properties', () => {
        const publicReturn = 'return { readBrowserPreference, writeBrowserPreference, '
            + 'wasMigrationReceiptSeen, markMigrationReceiptSeen };';
        const original = buildBrowserPreferencesBundle(REPO_ROOT);
        const malicious = original.replace(publicReturn, `
Object.defineProperty(readBrowserPreference, 'leakedWrite', {
    value: writeRuntimeBrowserPreference,
});
Object.defineProperty(writeBrowserPreference, Symbol('rawStorage'), {
    value: window.localStorage,
});
${publicReturn}`);
        expect(malicious).not.toBe(original);

        expect(() => assertPreferenceBundleSurfaceClosed(malicious, { localStorage: {} }))
            .toThrow('readBrowserPreference.leakedWrite, writeBrowserPreference.Symbol(rawStorage)');
    });
    it('buildData and buildContent produce JSON-serializable payloads', async () => {
        const data = buildData(REPO_ROOT);
        expect(data.tree.kind).toBe('dir');
        expect(Array.isArray(data.excerpts)).toBe(true);
        const content = await buildContent();
        expect(JSON.parse(JSON.stringify(content))).toEqual(content);
    });
});

// The whole runtime is one IIFE: any bare global it touches that a host does not
// provide aborts the lot and paints a blank page. This boots the COMMITTED page in
// a jsdom that deliberately has no matchMedia — the page's own no-blank-screen guard.
describe('built page boots without matchMedia', () => {
    it('renders chrome and the intro window in a bare jsdom document', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const { JSDOM, VirtualConsole } = await import('jsdom');
        const html = fs.readFileSync(path.join(REPO_ROOT, 'onboarding/index.html'), 'utf8');
        const errors = [];
        // Wired BEFORE construction: inline scripts run during it, and jsdom reports
        // an uncaught one as a virtual-console 'jsdomError', not a window 'error'.
        const virtualConsole = new VirtualConsole();
        virtualConsole.on('jsdomError', (err) => errors.push(err));
        const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: false, virtualConsole });
        dom.window.addEventListener('error', (e) => errors.push(e.error || e.message));
        // finally: a failed assertion must not leave the boot-typing and clock
        // intervals firing for the rest of the worker's life.
        try {
            expect(dom.window.matchMedia).toBeUndefined();
            expect(errors.map(String)).toEqual([]);
            expect(dom.window.document.querySelector('#statusbar').textContent).toContain('doctect');
            expect(dom.window.document.querySelector('#root').textContent.length).toBeGreaterThan(200);
        } finally {
            dom.window.close();
        }
    });
});
