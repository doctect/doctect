// tests/unit/server/publication.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, PNG_1X1, saveProjectCommit } from './helpers.js';
import { publicationTag } from '../../../shared/publicationTag.js';

// Lets one test fail a preview insert mid-replacement, to prove the edit runs inside
// a transaction: a partial replacement would leave a live public listing showing
// fewer previews than it had before the failed edit.
const dbInterleave = vi.hoisted(() => ({ failThumbnailInsert: false }));
vi.mock('../../../server/db.js', async importOriginal => {
    const actual = await importOriginal();
    const intercept = async (baseQuery, text, params = []) => {
        if (/INSERT INTO thumbnails/.test(text) && dbInterleave.failThumbnailInsert) {
            dbInterleave.failThumbnailInsert = false;
            throw new Error('Injected thumbnail insert failure');
        }
        return baseQuery(text, params);
    };
    return {
        ...actual,
        query: (text, params = []) => intercept(actual.query, text, params),
        withTransaction: callback => actual.withTransaction(
            txQuery => callback((text, params = []) => intercept(txQuery, text, params)),
        ),
    };
});

let app, cookie, otherCookie, query;

// SQLite's CURRENT_TIMESTAMP has whole-second resolution, so comparing published_at
// against its own pre-edit value cannot tell "never written" from "rewritten inside
// the same second". Tests pin this instead: only leaving the column alone preserves it.
const PUBLISHED_AT_SENTINEL = '2000-01-01 00:00:00';

const publishedProject = async (name) => {
    const created = await request(app).post('/api/projects').set('Cookie', cookie)
        .send({ name, state: minimalState('root') });
    const id = created.body.project.id;
    const res = await request(app).post(`/api/projects/${id}/publish`).set('Cookie', cookie)
        .set('If-Match', `"${created.body.project.headCommitId}"`)
        .send({
            description: 'original description', tags: ['original'],
            thumbnails: [PNG_1X1], previewNodeIds: ['root'],
        });
    expect(res.status).toBe(200);
    return id;
};

const projectRow = async (id) => (await query('SELECT * FROM projects WHERE id = $1', [id]))[0];

// An edit carries a token for the listing it was loaded against — the published commit AND
// the moment it was published — so the helper builds the current one unless a test pins a
// stale value with `ifMatch`. `ifMatch: null` omits the header; so does an unpublished
// project, which has no listing to identify.
const currentTag = async (id) => {
    const row = await projectRow(id);
    return row?.published_commit_id ? publicationTag(row.published_commit_id, row.published_at) : null;
};

const editListing = async (id, body, opts = {}) => {
    const token = 'ifMatch' in opts ? opts.ifMatch : await currentTag(id);
    const req = request(app)
        .patch(`/api/projects/${id}/publication`)
        .set('Cookie', opts.cookie ?? cookie);
    if (token) req.set('If-Match', `"${token}"`);
    return req.send(body);
};

beforeAll(async () => {
    app = await initTestApp();
    ({ query } = await import('../../../server/db.js'));
    cookie = await signUpUser(app, { email: 'listing@test.dev', username: 'listing_owner' });
    otherCookie = await signUpUser(app, { email: 'stranger@test.dev', username: 'stranger_u' });
});

describe('PATCH /api/projects/:id/publication', () => {
    it('updates description, tags and previews without moving the published version', async () => {
        const id = await publishedProject('Editable Listing');
        await query('UPDATE projects SET published_at = $1 WHERE id = $2', [PUBLISHED_AT_SENTINEL, id]);
        const before = await projectRow(id);

        const res = await editListing(id, {
            description: 'edited description',
            tags: ['edited', 'tags'],
            thumbnails: [PNG_1X1, PNG_1X1],
            previewNodeIds: ['root', 'root'],
        });

        expect(res.status).toBe(200);
        expect(res.body.project.thumbnailIds.length).toBe(2);

        const after = await projectRow(id);
        expect(after.published_description).toBe('edited description');
        expect(JSON.parse(after.published_tags)).toEqual(['edited', 'tags']);
        expect(after.published_commit_id).toBe(before.published_commit_id);
        expect(after.published_name).toBe(before.published_name);
        expect(after.published_at).toBe(PUBLISHED_AT_SENTINEL);

        const detail = await request(app).get(`/api/gallery/${id}`);
        expect(detail.body.project.tags).toEqual(['edited', 'tags']);
        expect(detail.body.project.description).toBe('edited description');
    });

    it('leaves existing previews untouched when thumbnails is omitted', async () => {
        const id = await publishedProject('Tag Only Edit');
        const before = await query(
            'SELECT id, position, node_id FROM thumbnails WHERE project_id = $1 ORDER BY position', [id]);

        const res = await editListing(id, { description: 'still here', tags: ['kept'] });

        expect(res.status).toBe(200);
        const after = await query(
            'SELECT id, position, node_id FROM thumbnails WHERE project_id = $1 ORDER BY position', [id]);
        expect(after).toEqual(before);
    });

    it('keeps the published description when it is omitted, and clears it only when sent empty', async () => {
        const id = await publishedProject('Description Omitted');

        const kept = await editListing(id, { tags: ['kept'] });
        expect(kept.status).toBe(200);
        expect(kept.body.project.description).toBe('original description');
        expect((await projectRow(id)).published_description).toBe('original description');

        const cleared = await editListing(id, { description: '', tags: ['kept'] });
        expect(cleared.status).toBe(200);
        expect(cleared.body.project.description).toBe('');
        expect((await projectRow(id)).published_description).toBe('');
    });

    // `form.description || null` and cleared optional fields both send a JSON null, so
    // this is an ordinary payload — and it must not land the word "null" on a live listing.
    it('treats a null description as an explicit clear', async () => {
        const id = await publishedProject('Null Description');

        const res = await editListing(id, { description: null, tags: ['kept'] });

        expect(res.status).toBe(200);
        expect((await projectRow(id)).published_description).toBe('');
    });

    it('rejects an empty thumbnails array rather than wiping the previews', async () => {
        const id = await publishedProject('Empty Previews');
        const res = await editListing(id, { description: 'x', tags: [], thumbnails: [] });
        expect(res.status).toBe(400);
        const rows = await query('SELECT id FROM thumbnails WHERE project_id = $1', [id]);
        expect(rows.length).toBe(1);
    });

    it('rejects more than six previews and invalid tags', async () => {
        const id = await publishedProject('Validation');
        const tooMany = await editListing(id, {
            description: 'x', tags: [],
            thumbnails: Array(7).fill(PNG_1X1),
        });
        expect(tooMany.status).toBe(400);

        const badTags = await editListing(id, { description: 'x', tags: 'planner' });
        expect(badTags.status).toBe(400);
    });

    // previewNodeIds label the images they arrive with, so re-tagging previews that are
    // already stored is not a thing the route can do. Without this the request would 200
    // and change nothing, which reads to the caller as "your re-tag was applied".
    it('rejects previewNodeIds sent without thumbnails', async () => {
        const id = await publishedProject('Retag Without Images');

        const res = await editListing(id, { description: 'x', tags: [], previewNodeIds: ['other-page'] });

        expect(res.status).toBe(400);
        const rows = await query('SELECT node_id FROM thumbnails WHERE project_id = $1', [id]);
        expect(rows.map(r => r.node_id)).toEqual(['root']);
    });

    it('rolls the whole edit back when a preview insert fails', async () => {
        const id = await publishedProject('Rollback Edit');
        const before = await query(
            'SELECT id, position, node_id FROM thumbnails WHERE project_id = $1 ORDER BY position', [id]);

        dbInterleave.failThumbnailInsert = true;
        const res = await editListing(id, {
            description: 'half written', tags: ['half'],
            thumbnails: [PNG_1X1, PNG_1X1], previewNodeIds: ['root', 'root'],
        });

        expect(res.status).toBe(500);
        const after = await query(
            'SELECT id, position, node_id FROM thumbnails WHERE project_id = $1 ORDER BY position', [id]);
        expect(after).toEqual(before);
        expect((await projectRow(id)).published_description).toBe('original description');
    });

    it('409s when the project is not published', async () => {
        const created = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'Never Published', state: minimalState('root') });
        const res = await editListing(created.body.project.id, { description: 'x', tags: [] });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('NOT_PUBLISHED');
    });

    it('409s after the project is unpublished', async () => {
        const id = await publishedProject('Then Unpublished');
        await request(app).post(`/api/projects/${id}/unpublish`).set('Cookie', cookie);
        const res = await editListing(id, { description: 'x', tags: [] });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('NOT_PUBLISHED');
    });

    // The Cloud menu offers "Edit gallery listing…" and "Publish to gallery…" side by side, so
    // this order of events costs nothing to reach: open the dialog, publish a new version, then
    // save the dialog that is still open. Without a precondition the PATCH lands the PRE-publish
    // description and tags on top of the just-published ones, while an untouched selection omits
    // `thumbnails` and leaves the POST-publish previews in place — one live listing whose text
    // and images come from two different publishes, reported to the owner as a success.
    it('409s on a published_commit_id that a republish has moved on from, and 200s on the current one', async () => {
        const id = await publishedProject('Republished Mid Edit');
        const staleToken = await currentTag(id);

        // A different title, so the commit route's state-hash dedupe does not hand back the
        // existing head and leave published_commit_id where it was.
        const commit = await saveProjectCommit(app, cookie, id, {
            state: minimalState('Second Version'), message: 'second version',
        });
        const republish = await request(app).post(`/api/projects/${id}/publish`).set('Cookie', cookie)
            .set('If-Match', `"${commit.body.commit.id}"`)
            .send({
                description: 'republished description', tags: ['republished'],
                thumbnails: [PNG_1X1], previewNodeIds: ['root'],
            });
        expect(republish.status).toBe(200);
        expect(await currentTag(id)).not.toBe(staleToken);

        const stale = await editListing(id, {
            description: 'pre-publish description', tags: ['pre-publish'],
        }, { ifMatch: staleToken });

        expect(stale.status).toBe(409);
        expect(stale.body.code).toBe('PUBLICATION_CHANGED');
        // Nothing written: the republished text is exactly what a visitor still sees.
        const afterRefusal = await projectRow(id);
        expect(afterRefusal.published_description).toBe('republished description');
        expect(JSON.parse(afterRefusal.published_tags)).toEqual(['republished']);

        // Reopening the dialog reloads the listing, so the same edit with the current token
        // is the recovery path — and it has to work.
        const fresh = await editListing(id, {
            description: 'edited after reopening', tags: ['reopened'],
        });
        expect(fresh.status).toBe(200);
        expect((await projectRow(id)).published_description).toBe('edited after reopening');
    });

    // Publishing does not require the head to have moved — POST /publish gates only on
    // head_commit_id — so a republish of the UNCHANGED commit rewrites the description, tags,
    // previews and published_at while published_commit_id stays exactly where it was. A token
    // made of the commit alone still matches, and the same mixed listing gets through: text
    // from before the republish, previews from after. The docs list "republish over it" as a
    // way to change a listing, so this is a lever an owner is told about.
    it('409s when a same-head republish rewrote the listing without moving the commit', async () => {
        const id = await publishedProject('Republished In Place');
        // published_at is pinned first so the republish's CURRENT_TIMESTAMP is certainly a
        // different value. SQLite's is second-resolution: a republish landing inside the same
        // second still cannot be told apart, which is the residual this precondition leaves.
        await query('UPDATE projects SET published_at = $1 WHERE id = $2', [PUBLISHED_AT_SENTINEL, id]);
        const before = await projectRow(id);
        const staleToken = publicationTag(before.published_commit_id, before.published_at);

        const republish = await request(app).post(`/api/projects/${id}/publish`).set('Cookie', cookie)
            .set('If-Match', `"${before.head_commit_id}"`)
            .send({
                description: 'republished in place', tags: ['republished'],
                thumbnails: [PNG_1X1], previewNodeIds: ['root'],
            });
        expect(republish.status).toBe(200);
        const after = await projectRow(id);
        expect(after.published_commit_id).toBe(before.published_commit_id);   // the point
        expect(after.published_at).not.toBe(before.published_at);

        const stale = await editListing(id, {
            description: 'pre-publish description', tags: ['pre-publish'],
        }, { ifMatch: staleToken });

        expect(stale.status).toBe(409);
        expect(stale.body.code).toBe('PUBLICATION_CHANGED');
        const afterRefusal = await projectRow(id);
        expect(afterRefusal.published_description).toBe('republished in place');
        expect(JSON.parse(afterRefusal.published_tags)).toEqual(['republished']);
    });

    it('428s when no published_commit_id is sent at all', async () => {
        const id = await publishedProject('No Precondition');

        const res = await editListing(id, { description: 'x', tags: [] }, { ifMatch: null });

        expect(res.status).toBe(428);
        expect(res.body.code).toBe('PROJECT_HEAD_REQUIRED');
        expect((await projectRow(id)).published_description).toBe('original description');
    });

    it('404s for a non-owner and 401s for an anonymous caller', async () => {
        const id = await publishedProject('Not Yours');
        const stranger = await editListing(id, { description: 'hijack', tags: [] }, { cookie: otherCookie });
        expect(stranger.status).toBe(404);

        const anon = await request(app).patch(`/api/projects/${id}/publication`)
            .send({ description: 'hijack', tags: [] });
        expect(anon.status).toBe(401);

        const row = await projectRow(id);
        expect(row.published_description).toBe('original description');
    });
});
