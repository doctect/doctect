// tests/unit/server/rateLimitSkipsFailed.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, saveProjectCommit } from './helpers.js';

let app, cookie;
beforeAll(async () => {
    process.env.USER_COMMITS_PER_HOUR = '2';
    process.env.MAX_PROJECTS_PER_USER = '1';
    app = await initTestApp();
    cookie = await signUpUser(app, { email: 'skipfail@test.dev', username: 'skipfail_u' });
});
afterAll(() => {
    delete process.env.USER_COMMITS_PER_HOUR;
    delete process.env.MAX_PROJECTS_PER_USER;
});

describe('rate limiter does not count rejected (>=400) writes against the hourly budget', () => {
    it('lets a legitimate write through after several rejected ones that would have exhausted a naive budget', async () => {
        const first = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'Only', state: minimalState('only') });
        expect(first.status).toBe(201);

        // Cap is 1 and we're already at 1, so all 5 of these fail with 403
        // PROJECT_LIMIT_REACHED. None should consume the USER_COMMITS_PER_HOUR=2 budget.
        for (let i = 0; i < 5; i++) {
            const rejected = await request(app).post('/api/projects').set('Cookie', cookie)
                .send({ name: `Rejected${i}`, state: minimalState(`r${i}`) });
            expect(rejected.status).toBe(403);
        }

        // A genuinely allowed write (a commit on the one project we're allowed) still
        // succeeds. If the 5 rejections above had each counted, this would 429 first --
        // the create (1) + 5 rejections would already be 6 hits against a budget of 2.
        const commit = await saveProjectCommit(app, cookie, first.body.project.id,
            { state: minimalState('changed'), message: 'edit' }, first.body.commit.id);
        expect(commit.status).toBe(201);
    });
});
