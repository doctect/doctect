// @vitest-environment node
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const workflowPath = path.join(repositoryRoot, '.github/workflows/local-workspace-migration.yml');
const benchmarkMarker = 'coalesces near-limit built-editor interactions before one module-Worker save';
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

const unquoteYamlScalar = value => {
    const trimmed = value.trim();
    if ((trimmed.startsWith("'") && trimmed.endsWith("'"))
        || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
};

const extractNamedWorkflowStep = (workflow, name) => {
    const lines = workflow.split(/\r?\n/);
    const start = lines.findIndex(line => line.trim() === `- name: ${name}`);
    if (start === -1) return null;

    const stepIndent = lines[start].search(/\S/);
    let end = lines.length;
    for (let index = start + 1; index < lines.length; index += 1) {
        if (lines[index].search(/\S/) === stepIndent && lines[index].trim().startsWith('- ')) {
            end = index;
            break;
        }
    }

    const env = {};
    const runLines = [];
    let section = null;
    for (const line of lines.slice(start + 1, end)) {
        const indent = line.search(/\S/);
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (indent === stepIndent + 2) {
            section = null;
            if (trimmed === 'env:') section = 'env';
            if (trimmed.startsWith('run:')) {
                section = 'run';
                const inline = trimmed.slice('run:'.length).trim();
                if (inline && !/^[>|][+-]?$/.test(inline)) runLines.push(inline);
            }
            continue;
        }
        if (indent <= stepIndent + 2) continue;
        if (section === 'env') {
            const separator = trimmed.indexOf(':');
            if (separator !== -1) {
                env[trimmed.slice(0, separator)] = unquoteYamlScalar(trimmed.slice(separator + 1));
            }
        } else if (section === 'run') {
            runLines.push(trimmed);
        }
    }

    return {
        env,
        run: runLines.join(' ').replace(/\s+/g, ' ').trim(),
    };
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
        const benchmarkStart = source.indexOf(benchmarkMarker);

        expect(benchmarkStart).toBeGreaterThanOrEqual(0);
        const benchmark = source.slice(benchmarkStart);
        expect(benchmark).not.toContain("import('/services/localWorkspace/index.ts')");
    });

    it('runs the built Worker save proof separately from the five-project source matrix', () => {
        const workflow = fs.readFileSync(workflowPath, 'utf8');
        const sourceMatrix = extractNamedWorkflowStep(workflow, 'Browser migration matrix');
        const builtProof = extractNamedWorkflowStep(workflow, 'Built Chromium Worker save proof');

        expect(sourceMatrix).not.toBeNull();
        expect(sourceMatrix?.run.match(/--project=/g)).toHaveLength(5);
        for (const project of [
            'chromium',
            'firefox',
            'webkit',
            'workspace-large-chromium',
            'workspace-large-firefox',
        ]) {
            expect(sourceMatrix?.run).toContain(`--project=${project}`);
        }
        expect(sourceMatrix?.env.E2E_BUILT_BUNDLE).toBeUndefined();
        expect(builtProof).not.toBeNull();
        expect(builtProof?.env.E2E_BUILT_BUNDLE).toBe('1');
        expect(builtProof?.env.E2E_BUILT_WORKER_COMPLETION_MARKER)
            .toContain('built-worker-proof-complete.json');
        expect(builtProof?.run).toContain('playwright test tests/e2e/local_workspace_migration.spec.js');
        expect(builtProof?.run).toContain('--project=chromium');
        expect(builtProof?.run).toContain(`--grep="${benchmarkMarker}$"`);
        expect(builtProof?.run).toContain('--workers=1');
        expect(builtProof?.run).toContain('--retries=0');
        expect(builtProof?.run).toContain('rm -f "$E2E_BUILT_WORKER_COMPLETION_MARKER"');
        expect(builtProof?.run).toContain('test -s "$E2E_BUILT_WORKER_COMPLETION_MARKER"');
    });
});
