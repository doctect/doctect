// tests/unit/onboarding/scan.test.js
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'url';
import {
    SCAN_EXCLUDES,
    collectVitals,
    flattenTreePaths,
    scanTree,
} from '../../../onboarding/build.mjs';

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
        for (const junk of ['node_modules', 'dist', 'scratch', 'playwright-report', '.git', '.claude']) {
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

    it('excludes ignored Playwright result state from maintained-source discovery', () => {
        expect(flattenTreePaths(tree)).not.toContain('test-results/.last-run.json');
    });

    it('excludes case and nested artifact directories and never follows symlinks', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doctect-onboarding-scan-'));
        try {
            execFileSync('git', ['init', '-q'], { cwd: root });
            fs.mkdirSync(path.join(root, 'src'));
            fs.writeFileSync(path.join(root, '.gitignore'), '/test-results/\n');
            fs.writeFileSync(path.join(root, 'src/index.js'), 'export const tracked = true;\n');
            execFileSync('git', ['add', '.gitignore', 'src/index.js'], { cwd: root });
            fs.mkdirSync(path.join(root, 'test-results'));
            fs.writeFileSync(path.join(root, 'test-results/.last-run.json'), '{}\n');
            fs.mkdirSync(path.join(root, 'nested/TEST-RESULTS'), { recursive: true });
            fs.writeFileSync(path.join(root, 'nested/TEST-RESULTS/output.json'), '{}\n');
            fs.symlinkSync('src', path.join(root, 'linked-source'));

            const paths = flattenTreePaths(scanTree(root));

            expect(paths).toContain('src/index.js');
            expect(paths).not.toContain('test-results/.last-run.json');
            expect(paths).not.toContain('nested/TEST-RESULTS/output.json');
            expect(paths.some(file => file.startsWith('linked-source/'))).toBe(false);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
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
