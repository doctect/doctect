// @vitest-environment node
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const workflowPath = path.join(repositoryRoot, '.github/workflows/local-workspace-migration.yml');
const benchmarkMarker = 'coalesces near-limit built-editor interactions before one module-Worker save';
const migrationSpecPath = 'tests/e2e/local_workspace_migration.spec.js';
const playwrightCommand = ['npx', 'playwright', 'test', migrationSpecPath];
const sourceProjects = [
    'chromium',
    'firefox',
    'webkit',
    'workspace-large-chromium',
    'workspace-large-firefox',
];
const requiredMigrationSteps = [
    'Browser migration matrix',
    'Built Chromium Worker save proof',
];
const completionMarkerVariable = '$E2E_BUILT_WORKER_COMPLETION_MARKER';
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

const parseNarrowYamlScalar = source => {
    if (typeof source !== 'string') return null;
    const value = source.trim();
    if (!value) return null;
    if (value.startsWith("'")) {
        if (value.length < 2 || !value.endsWith("'")) return null;
        let parsed = '';
        const inner = value.slice(1, -1);
        for (let index = 0; index < inner.length; index += 1) {
            if (inner[index] !== "'") {
                parsed += inner[index];
            } else if (inner[index + 1] === "'") {
                parsed += "'";
                index += 1;
            } else {
                return null;
            }
        }
        return parsed;
    }
    if (value.startsWith('"')) {
        try {
            const parsed = JSON.parse(value);
            return typeof parsed === 'string' ? parsed : null;
        } catch {
            return null;
        }
    }
    if (value.includes("'") || value.includes('"')) return null;
    return value;
};

const lineIndent = line => {
    const spaces = line.match(/^ */)?.[0].length ?? 0;
    return line[spaces] === '\t' ? null : spaces;
};

const parseNarrowYamlMapping = source => {
    for (let index = 0; index < source.length; index += 1) {
        if (source[index] !== ':') continue;
        const keySource = source.slice(0, index).trim();
        const key = parseNarrowYamlScalar(keySource);
        if (key === null || !/^[a-z][a-z0-9-]*$/.test(key)) continue;
        return {
            key,
            quoted: keySource.startsWith("'") || keySource.startsWith('"'),
            value: source.slice(index + 1).trim(),
        };
    }
    return null;
};

const normalizeRunBlock = (lines, style, keyIndent) => {
    const firstContent = lines.find(line => line.trim());
    if (!firstContent) return null;
    const contentIndent = lineIndent(firstContent);
    if (contentIndent === null || contentIndent <= keyIndent) return null;

    const content = [];
    for (const line of lines) {
        if (!line.trim()) {
            content.push('');
            continue;
        }
        const indent = lineIndent(line);
        if (indent === null || indent < contentIndent) return null;
        if (style.startsWith('>') && indent !== contentIndent) return null;
        content.push(line.slice(contentIndent));
    }
    if (style.startsWith('|')) return content.join('\n');

    return content.reduce((script, line, index) => {
        if (index === 0) return line;
        const separator = !line || !content[index - 1] ? '\n' : ' ';
        return `${script}${separator}${line}`;
    }, '');
};

// Deliberately supports only simple commands used by this workflow. Variables
// remain symbolic; malformed quotes and shell control syntax fail closed.
const tokenizeShellCommands = script => {
    const commands = [];
    let argv = [];
    let token = '';
    let tokenStarted = false;
    let quote = null;

    const finishToken = () => {
        if (!tokenStarted) return;
        argv.push(token);
        token = '';
        tokenStarted = false;
    };
    const finishCommand = () => {
        finishToken();
        if (argv.length) commands.push(argv);
        argv = [];
    };

    for (let index = 0; index < script.length; index += 1) {
        const character = script[index];
        if (quote === "'") {
            if (character === "'") quote = null;
            else if (character === '\n') return null;
            else token += character;
            continue;
        }
        if (quote === '"') {
            if (character === '"') {
                quote = null;
            } else if (character === '\n' || character === '`') {
                return null;
            } else if (character === '\\') {
                const next = script[index + 1];
                if (next === undefined) return null;
                if (next === '\n') {
                    index += 1;
                } else if ('$`"\\'.includes(next)) {
                    token += next;
                    index += 1;
                } else {
                    token += character;
                }
            } else {
                token += character;
            }
            continue;
        }
        if (character === "'" || character === '"') {
            quote = character;
            tokenStarted = true;
        } else if (character === '\\') {
            const next = script[index + 1];
            if (next === undefined) return null;
            if (next === '\n') {
                index += 1;
            } else {
                token += next;
                tokenStarted = true;
                index += 1;
            }
        } else if (character === ' ' || character === '\t') {
            finishToken();
        } else if (character === '\n') {
            finishCommand();
        } else if (';&|<>()`#'.includes(character)) {
            return null;
        } else {
            token += character;
            tokenStarted = true;
        }
    }
    if (quote !== null) return null;
    finishCommand();
    return commands.length ? commands : null;
};

const parseWorkflowStep = (lines, start, end, stepIndent, allowEnv) => {
    const env = {};
    let commands = null;
    const seenKeys = new Set(['name']);
    for (let index = start + 1; index < end; index += 1) {
        const indent = lineIndent(lines[index]);
        if (indent === null) return null;
        if (!lines[index].trim()) continue;
        if (indent !== stepIndent + 2) return null;
        const mapping = parseNarrowYamlMapping(lines[index].slice(indent));
        if (!mapping || mapping.quoted || seenKeys.has(mapping.key)) return null;
        if (mapping.key === 'env') {
            if (!allowEnv || mapping.value) return null;
            seenKeys.add(mapping.key);
            let cursor = index + 1;
            for (; cursor < end; cursor += 1) {
                const line = lines[cursor];
                if (!line.trim()) continue;
                const childIndent = lineIndent(line);
                if (childIndent === null) return null;
                if (childIndent === stepIndent + 2) break;
                if (childIndent !== stepIndent + 4) return null;
                const entry = line.slice(childIndent).match(/^([A-Z][A-Z0-9_]*):(?: +(.*))?$/);
                if (!entry || Object.hasOwn(env, entry[1])) return null;
                const value = parseNarrowYamlScalar(entry[2]);
                if (value === null) return null;
                env[entry[1]] = value;
            }
            index = cursor - 1;
            continue;
        }

        if (mapping.key !== 'run') return null;
        const run = mapping.value.match(/^([>|][+-]?)$/);
        if (!run) return null;
        seenKeys.add(mapping.key);
        let cursor = index + 1;
        const blockLines = [];
        for (; cursor < end; cursor += 1) {
            const line = lines[cursor];
            const childIndent = lineIndent(line);
            if (childIndent === null) return null;
            if (line.trim() && childIndent === stepIndent + 2) break;
            if (line.trim() && childIndent < stepIndent + 2) return null;
            blockLines.push(line);
        }
        const script = normalizeRunBlock(blockLines, run[1], stepIndent + 2);
        if (script === null) return null;
        commands = tokenizeShellCommands(script);
        if (commands === null) return null;
        index = cursor - 1;
    }
    const expectedKeys = allowEnv ? ['name', 'env', 'run'] : ['name', 'run'];
    return commands === null || expectedKeys.some(key => !seenKeys.has(key))
        || seenKeys.size !== expectedKeys.length
        ? null
        : { env, commands };
};

const scanWorkflowJobs = lines => {
    const roots = new Map();
    let index = 0;
    while (index < lines.length) {
        if (!lines[index].trim()) {
            index += 1;
            continue;
        }
        if (lineIndent(lines[index]) !== 0) return null;
        const mapping = parseNarrowYamlMapping(lines[index]);
        if (!mapping || roots.has(mapping.key)) return null;

        let rootEnd = index + 1;
        for (; rootEnd < lines.length; rootEnd += 1) {
            if (!lines[rootEnd].trim()) continue;
            const childIndent = lineIndent(lines[rootEnd]);
            if (childIndent === null) return null;
            if (childIndent === 0) break;
            if (childIndent < 2) return null;
        }
        roots.set(mapping.key, { start: index, end: rootEnd, value: mapping.value });
        index = rootEnd;
    }

    const jobsRoot = roots.get('jobs');
    if (!jobsRoot || jobsRoot.value) return null;
    const { start, end } = jobsRoot;

    const jobs = new Map();
    index = start + 1;
    while (index < end) {
        if (!lines[index].trim()) {
            index += 1;
            continue;
        }
        const indent = lineIndent(lines[index]);
        if (indent !== 2) return null;
        const mapping = parseNarrowYamlMapping(lines[index].slice(indent));
        if (!mapping || mapping.value || jobs.has(mapping.key)) return null;

        let jobEnd = index + 1;
        for (; jobEnd < end; jobEnd += 1) {
            if (!lines[jobEnd].trim()) continue;
            const childIndent = lineIndent(lines[jobEnd]);
            if (childIndent === null) return null;
            if (childIndent === 2) break;
            if (childIndent < 4) return null;
        }
        jobs.set(mapping.key, { start: index, end: jobEnd });
        index = jobEnd;
    }
    return { jobs, lines };
};

const scanReleaseGate = workflow => {
    const lines = workflow.split(/\r?\n/);
    const workflowJobs = scanWorkflowJobs(lines);
    const releaseGate = workflowJobs?.jobs.get('release-gate');
    if (!workflowJobs || !releaseGate) return null;

    const allowedKeys = new Set(['runs-on', 'timeout-minutes', 'steps']);
    const seenKeys = new Set();
    let activeKey = null;
    let stepsStart = null;
    let stepsEnd = null;
    for (let index = releaseGate.start + 1; index < releaseGate.end; index += 1) {
        const line = lines[index];
        if (!line.trim()) continue;
        const indent = lineIndent(line);
        if (indent === null || indent < 4) return null;
        if (indent > 4) {
            if (activeKey !== 'steps') return null;
            continue;
        }
        if (stepsStart !== null && stepsEnd === null) stepsEnd = index;

        const mapping = parseNarrowYamlMapping(line.slice(indent));
        if (!mapping || mapping.quoted || !allowedKeys.has(mapping.key)
            || seenKeys.has(mapping.key)) return null;
        if (mapping.key === 'steps' ? mapping.value : !mapping.value) return null;
        seenKeys.add(mapping.key);
        activeKey = mapping.key;
        if (mapping.key === 'steps') stepsStart = index;
    }
    if (seenKeys.size !== allowedKeys.size
        || [...allowedKeys].some(key => !seenKeys.has(key))
        || stepsStart === null) return null;
    return {
        lines,
        stepsStart,
        stepsEnd: stepsEnd ?? releaseGate.end,
    };
};

const scanDirectRequiredSteps = releaseGate => {
    const steps = new Map();
    let index = releaseGate.stepsStart + 1;
    while (index < releaseGate.stepsEnd) {
        if (!releaseGate.lines[index].trim()) {
            index += 1;
            continue;
        }
        const indent = lineIndent(releaseGate.lines[index]);
        if (indent !== 6 || !releaseGate.lines[index].trim().startsWith('- ')) return null;

        const start = index;
        let end = start + 1;
        for (; end < releaseGate.stepsEnd; end += 1) {
            if (!releaseGate.lines[end].trim()) continue;
            const childIndent = lineIndent(releaseGate.lines[end]);
            if (childIndent === null) return null;
            if (childIndent === 6 && releaseGate.lines[end].trim().startsWith('- ')) break;
            if (childIndent < 8) return null;
        }

        const stepName = releaseGate.lines[start].match(/^ {6}- +name:(?: +(.*))?$/);
        if (stepName) {
            const name = parseNarrowYamlScalar(stepName[1]);
            if (name === null) return null;
            if (requiredMigrationSteps.includes(name)) {
                if (steps.has(name)) return null;
                const step = parseWorkflowStep(
                    releaseGate.lines,
                    start,
                    end,
                    6,
                    name === 'Built Chromium Worker save proof',
                );
                if (step === null) return null;
                steps.set(name, step);
            }
        }
        index = end;
    }
    return steps;
};

const extractNamedWorkflowStep = (workflow, name) => {
    const releaseGate = scanReleaseGate(workflow);
    const steps = releaseGate && scanDirectRequiredSteps(releaseGate);
    return steps?.get(name) ?? null;
};

const releaseGateJobIsUnconditional = workflow => {
    return scanReleaseGate(workflow) !== null;
};

const assertMigrationWorkflow = workflow => {
    expect(releaseGateJobIsUnconditional(workflow)).toBe(true);
    expect(extractNamedWorkflowStep(workflow, 'Browser migration matrix')).toEqual({
        env: {},
        commands: [[
            ...playwrightCommand,
            ...sourceProjects.map(project => `--project=${project}`),
        ]],
    });
    expect(extractNamedWorkflowStep(workflow, 'Built Chromium Worker save proof')).toEqual({
        env: {
            E2E_BUILT_BUNDLE: '1',
            E2E_BUILT_WORKER_COMPLETION_MARKER:
                '${{ runner.temp }}/built-worker-proof-complete.json',
        },
        commands: [
            ['rm', '-f', completionMarkerVariable],
            [
                ...playwrightCommand,
                '--project=chromium',
                `--grep=${benchmarkMarker}$`,
                '--workers=1',
                '--retries=0',
            ],
            ['test', '-s', completionMarkerVariable],
        ],
    });
};

const addStepEntry = (workflow, stepName, entry) => {
    const marker = `      - name: ${stepName}\n`;
    const mutated = workflow.replace(marker, `${marker}${entry}`);
    if (mutated === workflow) throw new Error(`Missing workflow step: ${stepName}`);
    return mutated;
};

const directStepBlock = (workflow, stepName) => {
    const lines = workflow.split('\n');
    const start = lines.findIndex(line => line === `      - name: ${stepName}`);
    if (start === -1) throw new Error(`Missing direct workflow step: ${stepName}`);
    let end = start + 1;
    for (; end < lines.length; end += 1) {
        if (!lines[end].trim()) continue;
        const indent = lineIndent(lines[end]);
        if (indent === null || indent <= 4
            || (indent === 6 && lines[end].trim().startsWith('- '))) break;
    }
    return `${lines.slice(start, end).join('\n')}\n`;
};

const removeDirectSteps = (workflow, stepNames = requiredMigrationSteps) => stepNames.reduce(
    (source, stepName) => source.replace(directStepBlock(source, stepName), ''),
    workflow,
);

const disabledShadowJob = (stepBlocks, id = 'disabled-shadow') => `  ${id}:
    if: false
    runs-on: ubuntu-latest
    steps:
${stepBlocks.join('')}`;

const insertSiblingJob = (workflow, job, position) => position === 'before'
    ? workflow.replace('  release-gate:\n', `${job}  release-gate:\n`)
    : `${workflow.trimEnd()}\n${job}`;

const yamlKey = (key, style) => style === 'plain'
    ? key
    : style === 'single' ? `'${key}'` : `"${key}"`;

const duplicateKeyCases = ['before', 'after'].flatMap(position =>
    ['plain', 'single', 'double'].map(style => [position, style]));

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

        assertMigrationWorkflow(workflow);
    });

    it.each([
        ['single', "'"],
        ['double', '"'],
    ])('recognizes %s-quoted workflow step names', (_style, quote) => {
        const workflow = fs.readFileSync(workflowPath, 'utf8')
            .replace(
                '- name: Browser migration matrix',
                `- name: ${quote}Browser migration matrix${quote}`,
            )
            .replace(
                '- name: Built Chromium Worker save proof',
                `- name: ${quote}Built Chromium Worker save proof${quote}`,
            );

        assertMigrationWorkflow(workflow);
    });

    it.each([
        [
            'project suffix',
            workflow => workflow.replace(
                '          --project=chromium\n',
                '          --project=chromium-renamed\n',
            ),
        ],
        [
            'grep suffix',
            workflow => workflow.replace(
                `--grep="${benchmarkMarker}$"`,
                `--grep="${benchmarkMarker}$"-renamed`,
            ),
        ],
    ])('rejects a near-miss %s token', (_case, mutate) => {
        const workflow = fs.readFileSync(workflowPath, 'utf8');

        expect(() => assertMigrationWorkflow(mutate(workflow))).toThrow();
    });

    it('fails closed on malformed YAML step-name quoting', () => {
        const workflow = fs.readFileSync(workflowPath, 'utf8').replace(
            '- name: Browser migration matrix',
            '- name: "Browser migration matrix',
        );

        expect(extractNamedWorkflowStep(workflow, 'Browser migration matrix')).toBeNull();
    });

    it('fails closed on malformed shell quoting', () => {
        const workflow = fs.readFileSync(workflowPath, 'utf8').replace(
            'rm -f "$E2E_BUILT_WORKER_COMPLETION_MARKER"',
            'rm -f "$E2E_BUILT_WORKER_COMPLETION_MARKER',
        );

        expect(extractNamedWorkflowStep(workflow, 'Built Chromium Worker save proof')).toBeNull();
    });

    it.each(requiredMigrationSteps.flatMap(stepName => [
        ['if', stepName, '        if: false\n'],
        ['continue-on-error', stepName, '        continue-on-error: true\n'],
        ['timeout-minutes', stepName, '        timeout-minutes: 1\n'],
        ['shell', stepName, '        shell: bash\n'],
        ['working-directory', stepName, '        working-directory: tests\n'],
        ['quoted if', stepName, '        "if": false\n'],
        ['uses', stepName, '        uses: example/action@v1\n'],
    ]))('rejects unmodeled %s on %s', (_case, stepName, entry) => {
        const workflow = fs.readFileSync(workflowPath, 'utf8');
        const mutated = addStepEntry(workflow, stepName, entry);

        expect(extractNamedWorkflowStep(mutated, stepName)).toBeNull();
    });

    it.each(requiredMigrationSteps)(
        'rejects a duplicate name on %s',
        stepName => {
            const workflow = fs.readFileSync(workflowPath, 'utf8');
            const mutated = addStepEntry(workflow, stepName, '        name: Duplicate gate\n');

            expect(extractNamedWorkflowStep(mutated, stepName)).toBeNull();
        },
    );

    it.each(requiredMigrationSteps)(
        'rejects a duplicate run on %s',
        stepName => {
            const workflow = fs.readFileSync(workflowPath, 'utf8');
            const mutated = addStepEntry(workflow, stepName, '        run: >-\n          true\n');

            expect(extractNamedWorkflowStep(mutated, stepName)).toBeNull();
        },
    );

    it('rejects env on the source matrix and duplicate env on the built proof', () => {
        const workflow = fs.readFileSync(workflowPath, 'utf8');
        const sourceEnv = addStepEntry(
            workflow,
            'Browser migration matrix',
            "        env:\n          E2E_BUILT_BUNDLE: '1'\n",
        );
        const duplicateBuiltEnv = workflow.replace(
            '        run: |\n',
            '        env:\n          DUPLICATE: value\n        run: |\n',
        );

        expect(extractNamedWorkflowStep(sourceEnv, 'Browser migration matrix')).toBeNull();
        expect(extractNamedWorkflowStep(duplicateBuiltEnv, 'Built Chromium Worker save proof'))
            .toBeNull();
    });

    it('rejects malformed step and env indentation', () => {
        const workflow = fs.readFileSync(workflowPath, 'utf8');
        const malformedStep = addStepEntry(
            workflow,
            'Browser migration matrix',
            '         if: false\n',
        );
        const malformedEnv = workflow.replace(
            '          E2E_BUILT_BUNDLE:',
            '         E2E_BUILT_BUNDLE:',
        );

        expect(extractNamedWorkflowStep(malformedStep, 'Browser migration matrix')).toBeNull();
        expect(extractNamedWorkflowStep(malformedEnv, 'Built Chromium Worker save proof'))
            .toBeNull();
    });

    it.each([
        ['if', '    if: false\n'],
        ['continue-on-error', '    continue-on-error: true\n'],
        ['quoted if', '    "if": false\n'],
    ])('rejects release-gate job-level %s', (_case, entry) => {
        const workflow = fs.readFileSync(workflowPath, 'utf8');
        const mutated = workflow.replace(
            '  release-gate:\n',
            `  release-gate:\n${entry}`,
        );

        expect(() => assertMigrationWorkflow(mutated)).toThrow();
    });

    it.each(['before', 'after'])(
        'rejects required steps relocated to an if-false sibling %s release-gate',
        position => {
            const workflow = fs.readFileSync(workflowPath, 'utf8');
            const blocks = requiredMigrationSteps.map(stepName => directStepBlock(workflow, stepName));
            const relocated = insertSiblingJob(
                removeDirectSteps(workflow),
                disabledShadowJob(blocks),
                position,
            );

            expect(() => assertMigrationWorkflow(relocated)).toThrow();
        },
    );

    it.each(['before', 'after'])(
        'ignores a same-name sibling shadow %s release-gate',
        position => {
            const workflow = fs.readFileSync(workflowPath, 'utf8');
            const blocks = requiredMigrationSteps
                .map(stepName => directStepBlock(workflow, stepName))
                .map(block => block.replace('--project=chromium', '--project=chromium-shadow'));
            const shadowed = insertSiblingJob(
                workflow,
                disabledShadowJob(blocks),
                position,
            );

            expect(() => assertMigrationWorkflow(shadowed)).not.toThrow();
        },
    );

    it.each([
        [
            'release-gate ID',
            workflow => `${workflow.trimEnd()}\n  release-gate:\n    runs-on: ubuntu-latest\n    steps: []\n`,
        ],
        [
            'mixed quoted release-gate ID',
            workflow => `${workflow.trimEnd()}\n  'release-gate':\n    runs-on: ubuntu-latest\n    steps: []\n`,
        ],
        [
            'sibling job ID',
            workflow => `${workflow.trimEnd()}\n  duplicate-shadow:\n    runs-on: ubuntu-latest\n    steps: []\n  duplicate-shadow:\n    runs-on: ubuntu-latest\n    steps: []\n`,
        ],
    ])('rejects duplicate %s', (_case, mutate) => {
        const workflow = fs.readFileSync(workflowPath, 'utf8');

        expect(() => assertMigrationWorkflow(mutate(workflow))).toThrow();
    });

    it('rejects required names nested below a non-required step', () => {
        const workflow = fs.readFileSync(workflowPath, 'utf8');
        const blocks = requiredMigrationSteps.map(stepName => directStepBlock(workflow, stepName));
        const nestedBlocks = blocks
            .map(block => block.split('\n').map(line => line ? `      ${line}` : line).join('\n'))
            .join('');
        const nested = removeDirectSteps(workflow).replace(
            '      - uses: actions/checkout@v4\n',
            `      - uses: actions/checkout@v4
        with:
          misleading:
${nestedBlocks}            - name: Nested sentinel
              run: >-
                true
`,
        );

        expect(() => assertMigrationWorkflow(nested)).toThrow();
    });

    it.each([
        ['single', "'"],
        ['double', '"'],
    ])('accepts a %s-quoted release-gate job ID', (_style, quote) => {
        const workflow = fs.readFileSync(workflowPath, 'utf8').replace(
            '  release-gate:',
            `  ${quote}release-gate${quote}:`,
        );

        expect(() => assertMigrationWorkflow(workflow)).not.toThrow();
    });

    it.each(requiredMigrationSteps)('rejects missing direct step %s', stepName => {
        const workflow = fs.readFileSync(workflowPath, 'utf8');
        const missing = removeDirectSteps(workflow, [stepName]);

        expect(() => assertMigrationWorkflow(missing)).toThrow();
    });

    it.each(requiredMigrationSteps)('rejects duplicate direct step %s', stepName => {
        const workflow = fs.readFileSync(workflowPath, 'utf8');
        const block = directStepBlock(workflow, stepName);

        expect(() => assertMigrationWorkflow(workflow.replace(block, `${block}${block}`))).toThrow();
    });

    it.each(['single', 'double'])('accepts a %s-quoted jobs root', style => {
        const workflow = fs.readFileSync(workflowPath, 'utf8').replace(
            'jobs:',
            `${yamlKey('jobs', style)}:`,
        );

        expect(() => assertMigrationWorkflow(workflow)).not.toThrow();
    });

    it.each(duplicateKeyCases)(
        'rejects a %s %s-style semantic jobs root',
        (position, style) => {
            const workflow = fs.readFileSync(workflowPath, 'utf8');
            const duplicate = `${yamlKey('jobs', style)}:
  release-gate:
    if: false
    runs-on: ubuntu-latest
    steps: []
`;
            const mutated = position === 'before'
                ? workflow.replace('jobs:\n', `${duplicate}jobs:\n`)
                : `${workflow.trimEnd()}\n${duplicate}`;

            expect(() => assertMigrationWorkflow(mutated)).toThrow();
        },
    );

    it.each(duplicateKeyCases)(
        'rejects a %s %s-style semantic release-gate job ID',
        (position, style) => {
            const workflow = fs.readFileSync(workflowPath, 'utf8');
            const duplicate = `  ${yamlKey('release-gate', style)}:
    runs-on: ubuntu-latest
    steps: []
`;
            const mutated = position === 'before'
                ? workflow.replace('  release-gate:\n', `${duplicate}  release-gate:\n`)
                : `${workflow.trimEnd()}\n${duplicate}`;

            expect(() => assertMigrationWorkflow(mutated)).toThrow();
        },
    );

    it.each(duplicateKeyCases)(
        'rejects a %s %s-style semantic release-gate steps key',
        (position, style) => {
            const workflow = fs.readFileSync(workflowPath, 'utf8');
            const duplicate = `    ${yamlKey('steps', style)}:
      - run: true
`;
            const mutated = position === 'before'
                ? workflow.replace('    steps:\n', `${duplicate}    steps:\n`)
                : `${workflow.trimEnd()}\n${duplicate}`;

            expect(() => assertMigrationWorkflow(mutated)).toThrow();
        },
    );
});
