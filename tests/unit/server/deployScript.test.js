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

const writeExecutable = (name, contents) => {
    const file = path.join(binDir, name);
    fs.writeFileSync(file, contents, { mode: 0o755 });
};

beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doctect-deploy-test-'));
    binDir = path.join(tempDir, 'bin');
    fs.mkdirSync(binDir);
    writeExecutable('gcloud', `#!/bin/bash
case "$*" in
  *"artifacts repositories create"*) exit 1 ;;
  *"auth print-access-token"*) printf 'test-token\\n' ;;
  *"run deploy"*) [ "\${FAIL_STAGE:-}" = deploy ] && exit 42 ;;
  *"run services describe"*) printf 'https://doctect.test\\n' ;;
  *"run services update"*"--remove-env-vars"*) exit 1 ;;
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

const runDeploy = failStage => spawnSync('bash', [deployScript], {
    cwd: tempDir,
    encoding: 'utf8',
    env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
        FAIL_STAGE: failStage,
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

describe('deploy.sh failure handling', () => {
    it.each(['build', 'tag', 'push', 'deploy', 'update'])('stops before success output when %s fails', stage => {
        const result = runDeploy(stage);

        expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(42);
        expect(result.stdout).not.toContain('Deployment complete!');
        expect(result.stdout).not.toContain('App is live at:');
    });

    it('tolerates only repository creation and remove-env failures', () => {
        const result = runDeploy('');

        expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
        expect(result.stdout).toContain('likely already exists, skipping creation');
        expect(result.stdout).toContain('could not be removed (ignoring)');
        expect(result.stdout).toContain('Deployment complete!');
    });
});
