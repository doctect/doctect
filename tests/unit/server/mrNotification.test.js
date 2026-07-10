// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, PNG_1X1 } from './helpers.js';
import { setSendEmailImpl } from '../../../server/email.js';

let app;
const sent = [];

// The notification is fire-and-forget (sent after the response), so poll for
// the expected message instead of a fixed sleep — slow CI can't flake this.
const waitForEmail = async (predicate, timeoutMs = 2000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const hit = sent.find(predicate);
        if (hit) return hit;
        await new Promise(r => setTimeout(r, 10));
    }
    return undefined;
};

// Negative-case settle: a short beat for the fire-and-forget chain to (not) fire.
const settle = () => new Promise(r => setTimeout(r, 200));

beforeAll(async () => {
    setSendEmailImpl(async (msg) => { sent.push(msg); return { id: `t-${sent.length}` }; });
    app = await initTestApp();
});
afterAll(() => setSendEmailImpl(null));

const stateWithDayName = (dayName) => {
    const s = minimalState();
    s.variants.default.templates.page.name = dayName;
    return s;
};

// Builds the standard publish -> fork -> save -> propose chain. Mirrors the
// exact request sequence used by tests/unit/server/mergeRequests.test.js.
const createMrBetween = async (ownerEmail, authorEmail) => {
    const ownerCookie = await signUpUser(app, { email: ownerEmail, username: `u_${sent.length}_${Math.random().toString(36).slice(2, 8)}` });
    const authorCookie = ownerEmail === authorEmail
        ? ownerCookie
        : await signUpUser(app, { email: authorEmail, username: `a_${sent.length}_${Math.random().toString(36).slice(2, 8)}` });

    const up = await request(app).post('/api/projects').set('Cookie', ownerCookie)
        .send({ name: 'Upstream', state: stateWithDayName('Original') });
    const upstreamId = up.body.project.id;
    await request(app).post(`/api/projects/${upstreamId}/publish`).set('Cookie', ownerCookie)
        .send({ description: '', tags: [], thumbnails: [PNG_1X1] });

    const fork = await request(app).post(`/api/projects/${upstreamId}/fork`).set('Cookie', authorCookie);
    const forkId = fork.body.project.id;
    await request(app).post(`/api/projects/${forkId}/commits`).set('Cookie', authorCookie)
        .send({ state: stateWithDayName('Improved'), message: 'improve page template' });

    return request(app).post('/api/merge-requests').set('Cookie', authorCookie)
        .send({ sourceProjectId: forkId, title: 'Improve the page template', description: 'Better name' });
};

describe('merge request owner notification', () => {
    it('emails the target owner with a link to the MR', async () => {
        sent.length = 0;
        const res = await createMrBetween('owner@test.dev', 'author@test.dev');
        expect(res.status).toBe(201);
        // Sign-up also sends a verification email to the same address through the same
        // captured sink, so filter on subject too rather than address alone.
        const msg = await waitForEmail(m => m.to === 'owner@test.dev' && /new merge request/i.test(m.subject));
        expect(msg).toBeTruthy();
        expect(msg.subject).toMatch(/new merge request/i);
        expect(msg.text || msg.html).toContain(`/mr/${res.body.mergeRequest.id}`);
    });

    it('sends nothing for a self-MR (author owns the target)', async () => {
        sent.length = 0;
        const res = await createMrBetween('selfowner@test.dev', 'selfowner@test.dev'); // same account forks own project
        expect(res.status).toBe(201);
        await settle();
        expect(sent.filter(m => m.to === 'selfowner@test.dev' && /merge request/i.test(m.subject))).toHaveLength(0);
    });

    it('a failing email send does not change the create response', async () => {
        setSendEmailImpl(async () => { throw new Error('smtp down'); });
        const res = await createMrBetween('owner2@test.dev', 'author2@test.dev');
        expect(res.status).toBe(201);
        setSendEmailImpl(async (msg) => { sent.push(msg); return { id: 'x' }; });
    });
});
