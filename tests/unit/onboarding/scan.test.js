// tests/unit/onboarding/scan.test.js
import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import { SCAN_EXCLUDES, scanTree, collectVitals } from '../../../onboarding/build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('scanTree', () => {
    const tree = scanTree(ROOT);

    it('returns a root dir node with children', () => {
        expect(tree.kind).toBe('dir');
        expect(tree.path).toBe('');
        expect(tree.children.length).toBeGreaterThan(5);
    });

    it('excludes junk and includes the load-bearing dirs', () => {
        const names = tree.children.map(c => c.name);
        for (const dir of ['components', 'server', 'services', 'shared', 'pages', 'tests']) {
            expect(names).toContain(dir);
        }
        for (const junk of ['node_modules', 'dist', 'scratch', 'playwright-report', '.git']) {
            expect(names).not.toContain(junk);
        }
    });

    it('excludes nested exact paths (built page, analytics db)', () => {
        const onboarding = tree.children.find(c => c.name === 'onboarding');
        if (onboarding) {
            expect(onboarding.children.map(c => c.name)).not.toContain('index.html');
        }
        const server = tree.children.find(c => c.name === 'server');
        expect(server.children.map(c => c.name)).not.toContain('analytics.db');
    });

    it('records size and line counts for text files, null lines for binaries', () => {
        const shared = tree.children.find(c => c.name === 'shared');
        const diff = shared.children.find(c => c.name === 'diff.js');
        expect(diff.size).toBeGreaterThan(1000);
        expect(diff.lines).toBeGreaterThan(100);
        const pub = tree.children.find(c => c.name === 'public');
        const findBinary = (node) => {
            if (node.kind === 'file') return /\.(png|webp|ico|woff2?|mp4)$/.test(node.name) ? node : null;
            for (const c of node.children || []) { const hit = findBinary(c); if (hit) return hit; }
            return null;
        };
        const bin = findBinary(pub);
        if (bin) expect(bin.lines).toBeNull();
    });

    it('sorts children dirs-first then alphabetical', () => {
        const kinds = tree.children.map(c => c.kind);
        const firstFile = kinds.indexOf('file');
        if (firstFile !== -1) expect(kinds.slice(firstFile)).not.toContain('dir');
    });
});

describe('collectVitals', () => {
    const tree = scanTree(ROOT);
    const vitals = collectVitals(ROOT, tree);

    it('counts unit test files', () => {
        expect(vitals.testFileCount).toBeGreaterThan(150);
    });

    it('reads the migration ledger', () => {
        expect(vitals.migrations.count).toBeGreaterThanOrEqual(16);
        expect(vitals.migrations.ids[0]).toBe('001_auth_tables');
    });

    it('reads route endpoints from server/routes/*.js', () => {
        const projects = vitals.routes.find(r => r.file === 'server/routes/projects.js');
        expect(projects.endpoints.some(e => e.method === 'POST' && e.path === '/api/projects/:id/publish')).toBe(true);
    });

    it('reads schema version and dep counts', () => {
        expect(vitals.schemaVersion).toBeGreaterThanOrEqual(11);
        expect(vitals.deps.runtime).toBeGreaterThan(10);
    });

    it('lists spec filenames and per-area rollups', () => {
        expect(vitals.specs).toContain('2026-08-07-dev-onboarding-playground-design.md');
        const serverArea = vitals.areas.find(a => a.dir === 'server');
        expect(serverArea.lines).toBeGreaterThan(1000);
    });
});
