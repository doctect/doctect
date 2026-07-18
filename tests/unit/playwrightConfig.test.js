// @vitest-environment node
import path from 'node:path';
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
        });
    });

    it('keeps the default web and API ports', () => {
        expect(probeConfig({})).toEqual({
            webBaseURL: 'http://localhost:3000',
            apiBase: 'http://localhost:3001',
            serverPort: '3001',
            serverApiBase: 'http://localhost:3001',
        });
    });
});
