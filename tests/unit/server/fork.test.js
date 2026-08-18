// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, PNG_1X1 } from './helpers.js';

let app, ownerCookie, forkerCookie, secondForkerCookie, publicId, privateId;
beforeAll(async () => {
    app = await initTestApp();
    ownerCookie = await signUpUser(app, { email: 'fowner@test.dev', username: 'fork_owner' });
    forkerCookie = await signUpUser(app, { email: 'forker@test.dev', username: 'forker' });
    secondForkerCookie = await signUpUser(app, {
        email: 'second-forker@test.dev',
        username: 'second_forker',
    });
    const pub = await request(app).post('/api/projects').set('Cookie', ownerCookie)
        .send({ name: 'Forkable', state: minimalState('upstream') });
    publicId = pub.body.project.id;
    await request(app).post(`/api/projects/${publicId}/publish`).set('Cookie', ownerCookie)
        .set('If-Match', `"${pub.body.project.headCommitId}"`)
        .send({ description: '', tags: [], thumbnails: [PNG_1X1] });
    const priv = await request(app).post('/api/projects').set('Cookie', ownerCookie)
        .send({ name: 'NotForkable', state: minimalState() });
    privateId = priv.body.project.id;
});

const createPublishedSource = async (name) => {
    const created = await request(app).post('/api/projects').set('Cookie', ownerCookie)
        .send({ name, state: minimalState(name) });
    const projectId = created.body.project.id;
    await request(app).post(`/api/projects/${projectId}/publish`).set('Cookie', ownerCookie)
        .set('If-Match', `"${created.body.project.headCommitId}"`)
        .send({ description: '', tags: [], thumbnails: [PNG_1X1] });
    return projectId;
};

const keyedFork = (sourceId, key, cookie = forkerCookie) => request(app)
    .post(`/api/projects/${sourceId}/fork`)
    .set('Cookie', cookie)
    .send({ idempotencyKey: key });

describe('fork', () => {
    it('requires auth', async () => {
        const res = await request(app).post(`/api/projects/${publicId}/fork`);
        expect(res.status).toBe(401);
    });

    it('forks a public project with lineage and copied state', async () => {
        const res = await request(app).post(`/api/projects/${publicId}/fork`).set('Cookie', forkerCookie);
        expect(res.status).toBe(201);
        const fork = res.body.project;
        expect(fork.forkedFromProjectId).toBe(publicId);
        expect(fork.visibility).toBe('private');
        expect(fork.headCommitId).toBeTruthy();

        const commit = await request(app)
            .get(`/api/projects/${fork.id}/commits/${fork.headCommitId}`).set('Cookie', forkerCookie);
        expect(commit.body.commit.state.nodes.root.title).toBe('upstream');

        const src = await request(app).get(`/api/gallery/${publicId}`);
        expect(src.body.project.forkCount).toBe(1);
        // fork points at the exact source commit it was cut from
        expect(fork.forkedFromCommitId).toBe(src.body.project.headCommitId);
    });

    it('refuses to fork private projects of others', async () => {
        const res = await request(app).post(`/api/projects/${privateId}/fork`).set('Cookie', forkerCookie);
        expect(res.status).toBe(404);
    });

    it('returns one fork for concurrent repeats and increments the source once', async () => {
        const sourceId = await createPublishedSource('Concurrent source');
        const key = 'fork_10000000-0000-4000-8000-000000000001';
        const before = await request(app).get(`/api/gallery/${sourceId}`);

        const responses = await Promise.all([
            keyedFork(sourceId, key),
            keyedFork(sourceId, key),
        ]);

        expect(responses.map(res => res.status).sort()).toEqual([200, 201]);
        expect(responses[0].body.project.id).toBe(responses[1].body.project.id);
        expect(responses[0].body.project.headCommitId).toBe(responses[1].body.project.headCommitId);
        expect(responses[0].body.project).not.toHaveProperty('forkIdempotencyKey');
        expect(JSON.stringify(responses[0].body)).not.toContain(key);
        const { query } = await import('../../../server/db.js');
        const projects = await query(
            'SELECT id, fork_idempotency_key FROM projects WHERE id = $1',
            [responses[0].body.project.id],
        );
        const commits = await query('SELECT COUNT(*) AS n FROM commits WHERE project_id = $1', [projects[0].id]);
        const after = await request(app).get(`/api/gallery/${sourceId}`);
        expect(projects).toEqual([{ id: projects[0].id, fork_idempotency_key: key }]);
        expect(Number(commits[0].n)).toBe(1);
        expect(after.body.project.forkCount).toBe(before.body.project.forkCount + 1);
    });

    it('scopes stable keyed replays independently to each authenticated owner', async () => {
        const sourceId = await createPublishedSource('Owner-scoped replay source');
        const key = 'fork_30000000-0000-4000-8000-000000000003';
        const before = await request(app).get(`/api/gallery/${sourceId}`);

        const firstOwner = await keyedFork(sourceId, key);
        const secondOwner = await keyedFork(sourceId, key, secondForkerCookie);
        const firstReplay = await keyedFork(sourceId, key);
        const secondReplay = await keyedFork(sourceId, key, secondForkerCookie);

        expect([firstOwner.status, secondOwner.status]).toEqual([201, 201]);
        expect([firstReplay.status, secondReplay.status]).toEqual([200, 200]);
        expect(firstOwner.body.project.id).not.toBe(secondOwner.body.project.id);
        expect(firstReplay.body.project.id).toBe(firstOwner.body.project.id);
        expect(firstReplay.body.project.headCommitId).toBe(firstOwner.body.project.headCommitId);
        expect(secondReplay.body.project.id).toBe(secondOwner.body.project.id);
        expect(secondReplay.body.project.headCommitId).toBe(secondOwner.body.project.headCommitId);

        const after = await request(app).get(`/api/gallery/${sourceId}`);
        expect(after.body.project.forkCount).toBe(before.body.project.forkCount + 2);
    });

    it('returns a completed keyed fork before rechecking project or storage allowances', async () => {
        const sourceId = await createPublishedSource('Quota replay source');
        const key = 'fork_20000000-0000-4000-8000-000000000002';
        const first = await keyedFork(sourceId, key);
        expect(first.status).toBe(201);
        const previousProjectLimit = process.env.MAX_PROJECTS_PER_USER;
        const previousStorageLimit = process.env.USER_STORAGE_QUOTA_MB;
        process.env.MAX_PROJECTS_PER_USER = '1';
        process.env.USER_STORAGE_QUOTA_MB = '0.000001';
        try {
            const replay = await keyedFork(sourceId, key);
            expect(replay.status).toBe(200);
            expect(replay.body.project.id).toBe(first.body.project.id);
        } finally {
            if (previousProjectLimit === undefined) delete process.env.MAX_PROJECTS_PER_USER;
            else process.env.MAX_PROJECTS_PER_USER = previousProjectLimit;
            if (previousStorageLimit === undefined) delete process.env.USER_STORAGE_QUOTA_MB;
            else process.env.USER_STORAGE_QUOTA_MB = previousStorageLimit;
        }
    });

    it.each([
        ['too short', 'short'],
        ['invalid characters', 'fork key with spaces'],
        ['too long', `fork_${'a'.repeat(129)}`],
    ])('rejects a malformed idempotency key: %s', async (_label, idempotencyKey) => {
        const res = await keyedFork(publicId, idempotencyKey);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_IDEMPOTENCY_KEY');
    });
});
