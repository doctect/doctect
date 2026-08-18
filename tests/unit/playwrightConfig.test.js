// @vitest-environment node
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const probeScript = `
const config = require('./playwright.config.cjs');
process.stdout.write(JSON.stringify({
    webBaseURL: config.use.baseURL,
    apiBase: process.env.E2E_API_BASE,
    serverPort: config.webServer.env.PORT,
    serverApiBase: config.webServer.env.E2E_API_BASE,
    serverCommand: config.webServer.command,
}));
`;

const probeConfig = overrides => {
    const {
        E2E_WEB_PORT: _webPort,
        E2E_API_PORT: _apiPort,
        E2E_API_BASE: _apiBase,
        ...cleanEnv
    } = process.env;
    const result = spawnSync(process.execPath, ['-e', probeScript], {
        cwd: repositoryRoot,
        env: { ...cleanEnv, ...overrides },
        encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    return JSON.parse(result.stdout);
};

describe('playwright config ports', () => {
    it('uses the selected API port instead of a stale ambient API base', () => {
        expect(probeConfig({
            E2E_WEB_PORT: '4317',
            E2E_API_PORT: '4318',
            E2E_API_BASE: 'http://localhost:9999',
        })).toEqual({
            webBaseURL: 'http://localhost:4317',
            apiBase: 'http://localhost:4318',
            serverPort: '4318',
            serverApiBase: 'http://localhost:4318',
            serverCommand: 'npx concurrently --kill-others-on-fail "vite --host 127.0.0.1 --port 4317 --strictPort" "node server/index.js"',
        });
    });

    it('keeps the default web and API ports', () => {
        expect(probeConfig({})).toEqual({
            webBaseURL: 'http://localhost:3000',
            apiBase: 'http://localhost:3001',
            serverPort: '3001',
            serverApiBase: 'http://localhost:3001',
            serverCommand: 'npx concurrently --kill-others-on-fail "vite --host 127.0.0.1 --port 3000 --strictPort" "node server/index.js"',
        });
    });

    it('serves the explicit built-bundle proof with Vite preview', () => {
        const config = probeConfig({
            E2E_BUILT_BUNDLE: '1',
            E2E_WEB_PORT: '4327',
            E2E_API_PORT: '4328',
        });

        expect(config.serverCommand).toContain('vite preview');
        expect(config.serverCommand).not.toContain('"vite --host');
    });

    it('keeps the Worker benchmark out of direct source-store imports', () => {
        const source = fs.readFileSync(
            path.join(repositoryRoot, 'tests/e2e/local_workspace_migration.spec.js'),
            'utf8',
        );
        const marker = 'coalesces near-limit built-editor interactions';
        const benchmarkStart = source.indexOf(marker);

        expect(benchmarkStart).toBeGreaterThanOrEqual(0);
        const benchmark = source.slice(benchmarkStart);
        expect(benchmark).not.toContain("import('/services/localWorkspace/index.ts')");
    });
});
