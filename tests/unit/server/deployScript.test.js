// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const deployScript = path.join(repositoryRoot, 'deploy.sh');
let tempDir;
let binDir;
let callLog;

const writeExecutable = (name, contents) => {
    const file = path.join(binDir, name);
    fs.writeFileSync(file, contents, { mode: 0o755 });
};

beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doctect-deploy-test-'));
    binDir = path.join(tempDir, 'bin');
    callLog = path.join(tempDir, 'calls.log');
    fs.mkdirSync(binDir);
    writeExecutable('gcloud', `#!/bin/bash
printf '%s\\n' "$*" >> "$CALL_LOG"
case "$*" in
  *"artifacts repositories list"*)
    [ "\${FAIL_STAGE:-}" = repository-describe ] && exit 42
    [ "\${REPOSITORY_STATE:-}" = present ] && printf 'doctect-repo\\n'
    ;;
  *"artifacts repositories create"*) [ "\${FAIL_STAGE:-}" = repository-create ] && exit 42 ;;
  *"auth print-access-token"*) printf 'test-token\\n' ;;
  *"run deploy"*) [ "\${FAIL_STAGE:-}" = deploy ] && exit 42 ;;
  *"run services describe"*"value(status.url)"*) printf 'https://doctect.test\\n' ;;
  *"run services describe"*"env[].name"*)
    [ "\${FAIL_STAGE:-}" = service-env-describe ] && exit 42
    [ "\${SERVICE_ENV_STATE:-}" = present ] && printf 'CLIENT_URL\\nBETTER_AUTH_URL\\n'
    ;;
  *"run services update"*"--remove-env-vars"*) [ "\${FAIL_STAGE:-}" = remove-env ] && exit 42 ;;
  *"run services update"*) [ "\${FAIL_STAGE:-}" = update ] && exit 42 ;;
esac
exit 0
`);
    writeExecutable('sudo', `#!/bin/bash
case "$*" in
  "docker login"*) while IFS= read -r _; do :; done; exit 0 ;;
  "docker build"*) [ "\${FAIL_STAGE:-}" = build ] && exit 42 ;;
  "docker tag"*) [ "\${FAIL_STAGE:-}" = tag ] && exit 42 ;;
  "docker push"*) [ "\${FAIL_STAGE:-}" = push ] && exit 42 ;;
esac
exit 0
`);
});

afterAll(() => fs.rmSync(tempDir, { recursive: true, force: true }));

const runDeploy = ({ failStage = '', repositoryState = 'absent', serviceEnvState = 'absent' } = {}) => {
    fs.writeFileSync(callLog, '');
    const result = spawnSync('bash', [deployScript], {
        cwd: tempDir,
        encoding: 'utf8',
        env: {
            ...process.env,
            PATH: `${binDir}:${process.env.PATH}`,
            CALL_LOG: callLog,
            FAIL_STAGE: failStage,
            REPOSITORY_STATE: repositoryState,
            SERVICE_ENV_STATE: serviceEnvState,
            GOOGLE_CLIENT_ID: 'client-id',
            GOOGLE_CLIENT_SECRET: 'client-secret',
            OWNER_EMAILS: 'owner1@test.dev,owner2@test.dev',
            DATABASE_URL: 'postgres://deploy-test',
            RESEND_API_KEY: '',
            EMAIL_FROM: '',
            TRUSTED_ORIGINS: '',
            CLIENT_URL: '',
            BETTER_AUTH_URL: '',
        },
    });
    result.calls = fs.readFileSync(callLog, 'utf8');
    return result;
};

describe('deploy.sh failure handling', () => {
    it.each(['build', 'tag', 'push', 'deploy', 'update'])('stops before success output when %s fails', stage => {
        const result = runDeploy({ failStage: stage });

        expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(42);
        expect(result.stdout).not.toContain('Deployment complete!');
        expect(result.stdout).not.toContain('App is live at:');
    });

    it.each([
        'repository-describe',
        'repository-create',
        'service-env-describe',
        'remove-env',
    ])('stops before success output when %s fails', stage => {
        const result = runDeploy({
            failStage: stage,
            serviceEnvState: stage === 'remove-env' ? 'present' : 'absent',
        });

        expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(42);
        expect(result.stdout).not.toContain('Deployment complete!');
        expect(result.stdout).not.toContain('App is live at:');
    });

    it('skips repository creation and env removal when preflights report them present and absent', () => {
        const result = runDeploy({ repositoryState: 'present', serviceEnvState: 'absent' });

        expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
        expect(result.calls).not.toContain('artifacts repositories create');
        expect(result.calls).not.toContain('--remove-env-vars BETTER_AUTH_URL');
        expect(result.stdout).toContain('Artifact Registry repository already exists.');
        expect(result.stdout).toContain('BETTER_AUTH_URL is already absent.');
        expect(result.stdout).toContain('Deployment complete!');
    });

    it('creates an absent repository and removes a present BETTER_AUTH_URL', () => {
        const result = runDeploy({ repositoryState: 'absent', serviceEnvState: 'present' });

        expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
        expect(result.calls).toContain('artifacts repositories create doctect-repo');
        expect(result.calls).toContain('--remove-env-vars BETTER_AUTH_URL');
        expect(result.stdout).toContain('Deployment complete!');
    });
});
