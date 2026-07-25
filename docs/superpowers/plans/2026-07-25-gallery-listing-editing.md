# Gallery Listing Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a project's owner change a published gallery listing's description, tags, and preview screenshots without moving the published version, and raise the preview cap from 4 to 6.

**Architecture:** A new metadata-only `PATCH /api/projects/:id/publication` writes `published_description`, `published_tags`, and the `thumbnails` rows while leaving `published_commit_id`, `published_name`, and `published_at` alone. A new nullable `thumbnails.node_id` records which page produced each preview so the picker can open pre-checked. One lazy-loaded `EditListingModal` is reached from three entry points (gallery detail, My Projects, editor Cloud menu); lazy-loading keeps `pdfjs-dist` off the gallery and my-projects chunks.

**Tech Stack:** Express + Postgres/SQLite (`server/`), React 18 + React Router + Tailwind (`components/`, `pages/`), Vitest (`tests/unit/`), Playwright (`tests/e2e/`).

**Spec:** `docs/superpowers/specs/2026-07-25-gallery-listing-editing-design.md`

## Global Constraints

- **Preview cap is 6.** Server, client picker, and docs must all say 1–6. Per-image cap stays 300 KB; tag cap stays 10 tags × 30 chars; description cap stays 2000 chars.
- **The edit route must never write `published_commit_id`, `published_name`, or `published_at`.** `published_at` drives the gallery's "recently updated" sort — bumping it on a tag edit is free ranking.
- **SQL placeholders are positional.** The SQLite adapter rewrites `$n` by position, so a placeholder reused twice in one statement mis-binds. Pass the same value twice with two distinct placeholders (see `pruneCommits` in `server/routes/projects.js:43-53`).
- **Migrations are run-once and split on `;`.** Postgres entries use `ADD COLUMN IF NOT EXISTS`; SQLite entries use plain `ADD COLUMN` (the runner in `server/migrations.js` already skips an existing column via `PRAGMA table_info`). Never write `IF NOT EXISTS` in the SQLite variant — it breaks the runner's column-name regex.
- **Two test files regex-match production SQL to inject interleaving — keep those statements matchable.** `tests/unit/server/publish.test.js` matches the publish `UPDATE projects SET visibility = 'public', …` statement (including its `WHERE id = $6 AND head_commit_id = $7` clause) and `INSERT INTO thumbnails`; `tests/unit/server/gallery.test.js` matches `/SELECT p\.\*, u\.username AS author[\s\S]*WHERE p\.id = \$1 AND p\.visibility = 'public'/`. Changing parameter *values* is safe; changing the SQL *text* of those statements silently disables the interleaving tests.
- **Run tests with `npx vitest run <path>`** (the `test` script is watch-mode `vitest`).
- **Every line number in this plan refers to the file as it stands before that task's edits.** Locate code by the quoted snippet, not by the number, once you have already inserted something above it.
- **Existing behaviour that must not regress:** `GET /api/gallery/:id` keeps returning `thumbnailIds`; `PublishModal`'s generator-source warning, `If-Match` head check, and `PROJECT_HEAD_CHANGED` recovery are untouched.

---

### Task 1: Server — record each preview's source page, raise cap to 6

**Files:**
- Modify: `server/migrations/index.js:518-529` (append a migration after `015_waitlist`)
- Modify: `server/routes/projects.js:291-375`
- Test: `tests/unit/server/publish.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `MAX_PREVIEWS = 6` (exported const, `server/routes/projects.js`)
  - `parsePreviewSet(body) -> { error: string } | { previews: null } | { previews: Array<{ buf: Buffer, mime: string, nodeId: string | null }> }` — `{ previews: null }` means the caller omitted `thumbnails` entirely.
  - `parseTagList(tags) -> string | null` — JSON string, or `null` when invalid.
  - `replaceThumbnails(projectId, previews, txQuery) -> Promise<void>`
  - DB column `thumbnails.node_id TEXT NULL`.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/server/publish.test.js`, replace the existing `it('rejects more than 4 thumbnails', …)` block (around line 83) with the three tests below, and add `query` access to the file.

Change the top-level state declaration from `let app, cookie, projectId;` to `let app, cookie, projectId, query;`, and add this line inside `beforeAll` immediately after `app = await initTestApp();`:

```js
    ({ query } = await import('../../../server/db.js'));
```

Then replace the 4-thumbnail test with:

```js
    it('accepts six thumbnails', async () => {
        const six = [PNG_1X1, PNG_1X1, PNG_1X1, PNG_1X1, PNG_1X1, PNG_1X1];
        const res = await publish({ description: 'x', tags: [], thumbnails: six });
        expect(res.status).toBe(200);
        expect(res.body.project.thumbnailIds.length).toBe(6);
    });

    it('rejects more than six thumbnails', async () => {
        const seven = [PNG_1X1, PNG_1X1, PNG_1X1, PNG_1X1, PNG_1X1, PNG_1X1, PNG_1X1];
        const res = await publish({ description: 'x', tags: [], thumbnails: seven });
        expect(res.status).toBe(400);
    });

    it('records the source page of each preview, and null when not supplied', async () => {
        const withIds = await publish({
            description: 'x', tags: [],
            thumbnails: [PNG_1X1, PNG_1X1],
            previewNodeIds: ['root', 'root'],
        });
        expect(withIds.status).toBe(200);
        const tagged = await query(
            'SELECT node_id FROM thumbnails WHERE project_id = $1 ORDER BY position', [projectId]);
        expect(tagged.map(r => r.node_id)).toEqual(['root', 'root']);

        const withoutIds = await publish({ description: 'x', tags: [], thumbnails: [PNG_1X1] });
        expect(withoutIds.status).toBe(200);
        const untagged = await query(
            'SELECT node_id FROM thumbnails WHERE project_id = $1 ORDER BY position', [projectId]);
        expect(untagged.map(r => r.node_id)).toEqual([null]);
    });

    it('rejects previewNodeIds that do not pair one-to-one with thumbnails', async () => {
        const res = await publish({
            description: 'x', tags: [],
            thumbnails: [PNG_1X1, PNG_1X1],
            previewNodeIds: ['root'],
        });
        expect(res.status).toBe(400);
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/server/publish.test.js`
Expected: FAIL — "accepts six thumbnails" gets 400 (`thumbnails must contain 1-4 images`), and the `node_id` tests fail with a SQLite/Postgres error that no such column exists.

- [ ] **Step 3: Add the migration**

In `server/migrations/index.js`, insert this object after the `015_waitlist` entry (before the closing `];`):

```js
    {
        id: '016_thumbnail_node_id',
        pg: `
            ALTER TABLE thumbnails ADD COLUMN IF NOT EXISTS node_id TEXT
        `,
        sqlite: `
            ALTER TABLE thumbnails ADD COLUMN node_id TEXT
        `
    },
```

- [ ] **Step 4: Add the shared parse/write helpers**

In `server/routes/projects.js`, immediately after the existing `getThumbnailIds` export (currently ending at line 313), add:

```js
export const MAX_PREVIEWS = 6;

// Shared by the publish route and the listing-edit route so their validation can
// never drift. Returns { error } on bad input, { previews: null } when the caller
// omitted `thumbnails` entirely (the edit route reads that as "leave the existing
// previews alone"; publish rejects it), or the parsed set otherwise.
export const parsePreviewSet = (body) => {
    const { thumbnails, previewNodeIds } = body || {};
    if (thumbnails === undefined) return { previews: null };
    if (!Array.isArray(thumbnails) || thumbnails.length < 1 || thumbnails.length > MAX_PREVIEWS) {
        return { error: `thumbnails must contain 1-${MAX_PREVIEWS} images` };
    }
    const parsed = thumbnails.map(parseThumbnail);
    if (parsed.some(p => p === null)) {
        return { error: 'thumbnails must be valid webp/png data URLs under 300KB' };
    }
    if (previewNodeIds !== undefined
        && (!Array.isArray(previewNodeIds)
            || previewNodeIds.length !== thumbnails.length
            || previewNodeIds.some(x => typeof x !== 'string' || x.length === 0 || x.length > 200))) {
        return { error: 'previewNodeIds must be one non-empty string per thumbnail (max 200 chars)' };
    }
    return { previews: parsed.map((p, i) => ({ ...p, nodeId: previewNodeIds?.[i] ?? null })) };
};

export const parseTagList = (tags) => {
    if (!Array.isArray(tags) || tags.length > 10 || tags.some(x => typeof x !== 'string' || x.length > 30)) {
        return null;
    }
    return JSON.stringify(tags);
};

export const replaceThumbnails = async (projectId, previews, txQuery) => {
    await txQuery('DELETE FROM thumbnails WHERE project_id = $1', [projectId]);
    for (let i = 0; i < previews.length; i++) {
        await txQuery(
            'INSERT INTO thumbnails (id, project_id, position, mime, image, node_id) VALUES ($1, $2, $3, $4, $5, $6)',
            [randomUUID(), projectId, i, previews[i].mime, previews[i].buf, previews[i].nodeId]);
    }
};
```

- [ ] **Step 5: Rewire the publish route onto the helpers**

In `server/routes/projects.js`, replace the validation block at the top of the publish handler (currently lines 318-329, from `const { description, tags, thumbnails } = req.body || {};` through `const d = String(description ?? '').slice(0, 2000);`) with:

```js
    const previewSet = parsePreviewSet(req.body);
    if (previewSet.error) return res.status(400).json({ error: previewSet.error });
    if (!previewSet.previews) {
        return res.status(400).json({ error: `thumbnails must contain 1-${MAX_PREVIEWS} images` });
    }
    const parsedTags = parseTagList(req.body?.tags);
    if (parsedTags === null) {
        return res.status(400).json({ error: 'tags must be up to 10 strings of max 30 chars' });
    }
    const d = String(req.body?.description ?? '').slice(0, 2000);
```

In the same handler's transaction, change the `UPDATE projects` params array (currently line 348) from

```js
                [expectedHead, d, JSON.stringify(tags), d, JSON.stringify(tags), current[0].id, expectedHead]
```

to

```js
                [expectedHead, d, parsedTags, d, parsedTags, current[0].id, expectedHead]
```

Leave the SQL string itself byte-identical — `tests/unit/server/publish.test.js` regex-matches it.

Then replace the delete/insert block (currently lines 358-362, `await txQuery('DELETE FROM thumbnails …')` through the closing brace of the `for` loop) with:

```js
            await replaceThumbnails(current[0].id, previewSet.previews, txQuery);
```

- [ ] **Step 6: Run the publish tests**

Run: `npx vitest run tests/unit/server/publish.test.js`
Expected: PASS, all tests in the file.

- [ ] **Step 7: Run the full server suite for regressions**

Run: `npx vitest run tests/unit/server`
Expected: PASS. `fork.test.js`, `commitStorage.test.js`, `gallery.test.js`, `storageLimits.test.js` and the publication-snapshot tests all exercise publish; none should change behaviour.

- [ ] **Step 8: Commit**

```bash
git add server/migrations/index.js server/routes/projects.js tests/unit/server/publish.test.js
git commit -m "feat(gallery): record preview source pages and allow six previews"
```

---

### Task 2: Server — `PATCH /api/projects/:id/publication`

**Files:**
- Modify: `server/routes/projects.js` (add the route after the publish route, before `POST /api/projects/:id/unpublish` at line ~377)
- Modify: `tests/unit/server/userRateLimit.test.js`
- Test: `tests/unit/server/publication.test.js` (create)

**Interfaces:**
- Consumes: `parsePreviewSet`, `parseTagList`, `replaceThumbnails`, `MAX_PREVIEWS`, `getThumbnailIds`, `projectDto`, `loadProject`, `lockProjectRows` (Task 1 and existing module scope).
- Produces: `PATCH /api/projects/:id/publication` accepting `{ description?, tags, thumbnails?, previewNodeIds? }` and returning `{ project: { …projectDto, thumbnailIds } }`; error code `NOT_PUBLISHED` (409).

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/server/publication.test.js`:

```js
// tests/unit/server/publication.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, PNG_1X1 } from './helpers.js';

let app, cookie, otherCookie, query;

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

const editListing = (id, body, cookieOverride) => request(app)
    .patch(`/api/projects/${id}/publication`)
    .set('Cookie', cookieOverride ?? cookie)
    .send(body);

beforeAll(async () => {
    app = await initTestApp();
    ({ query } = await import('../../../server/db.js'));
    cookie = await signUpUser(app, { email: 'listing@test.dev', username: 'listing_owner' });
    otherCookie = await signUpUser(app, { email: 'stranger@test.dev', username: 'stranger_u' });
});

describe('PATCH /api/projects/:id/publication', () => {
    it('updates description, tags and previews without moving the published version', async () => {
        const id = await publishedProject('Editable Listing');
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
        expect(after.published_at).toEqual(before.published_at);

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

    it('404s for a non-owner and for an anonymous caller', async () => {
        const id = await publishedProject('Not Yours');
        const stranger = await editListing(id, { description: 'hijack', tags: [] }, otherCookie);
        expect(stranger.status).toBe(404);

        const anon = await request(app).patch(`/api/projects/${id}/publication`)
            .send({ description: 'hijack', tags: [] });
        expect(anon.status).toBe(401);

        const row = await projectRow(id);
        expect(row.published_description).toBe('original description');
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/server/publication.test.js`
Expected: FAIL — every request 404s, because no `PATCH /api/projects/:id/publication` route is registered.

- [ ] **Step 3: Implement the route**

In `server/routes/projects.js`, insert this immediately after the publish route's closing `});` (currently line 375) and before `router.post('/api/projects/:id/unpublish', …)`:

```js
// Edits the public listing only. Deliberately never writes published_commit_id
// (the public version is changed by publishing, not by editing its description),
// published_name (a copy of the project name), or published_at (it drives the
// gallery's "recently updated" sort, so a tag edit must not re-rank the project).
// No requireUsername: the established rule gates routes that attach NEW content
// to the gallery as the acting user, not routes acting on content the caller
// already owns — and publishing already required a username.
router.patch('/api/projects/:id/publication', requireAuth, userWriteLimiter, loadProject(true), async (req, res) => {
    const notPublished = () => res.status(409).json({ error: 'Project is not published.', code: 'NOT_PUBLISHED' });
    if (req.project.visibility !== 'public' || !req.project.published_commit_id) return notPublished();

    const previewSet = parsePreviewSet(req.body);
    if (previewSet.error) return res.status(400).json({ error: previewSet.error });
    const parsedTags = parseTagList(req.body?.tags);
    if (parsedTags === null) {
        return res.status(400).json({ error: 'tags must be up to 10 strings of max 30 chars' });
    }
    const d = String(req.body?.description ?? '').slice(0, 2000);

    const updated = await withTransaction(async txQuery => {
        const [current] = await lockProjectRows([req.project.id], txQuery);
        if (!current || current.owner_id !== req.user.id) return null;
        if (current.visibility !== 'public' || !current.published_commit_id) return null;

        const rows = await txQuery(
            `UPDATE projects SET published_description = $1, published_tags = $2,
                 description = $3, tags = $4, updated_at = CURRENT_TIMESTAMP
             WHERE id = $5 RETURNING *`,
            [d, parsedTags, d, parsedTags, current.id]
        );
        if (previewSet.previews) await replaceThumbnails(current.id, previewSet.previews, txQuery);
        return rows[0];
    });

    if (!updated) return notPublished();
    res.json({ project: { ...projectDto(updated), thumbnailIds: await getThumbnailIds(updated.id) } });
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/server/publication.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the failing rate-limit test**

Append this `it` block inside the existing `describe('per-user write rate limit', …)` in `tests/unit/server/userRateLimit.test.js`:

```js
    it('counts listing edits against the same per-user write budget', async () => {
        const editor = await signUpUser(app, { email: 'editor@test.dev', username: 'editor_u' });
        const created = await request(app).post('/api/projects').set('Cookie', editor)
            .send({ name: 'Listing Budget', state: minimalState('root') });        // write 1
        expect(created.status).toBe(201);
        const id = created.body.project.id;

        const published = await request(app).post(`/api/projects/${id}/publish`).set('Cookie', editor)
            .set('If-Match', `"${created.body.project.headCommitId}"`)
            .send({ description: 'x', tags: [], thumbnails: [PNG_1X1] });
        expect(published.status).toBe(200);   // publish carries no limiter today

        const first = await request(app).patch(`/api/projects/${id}/publication`)
            .set('Cookie', editor).send({ description: 'edit one', tags: [] });     // write 2
        expect(first.status).toBe(200);

        const second = await request(app).patch(`/api/projects/${id}/publication`)
            .set('Cookie', editor).send({ description: 'edit two', tags: [] });     // write 3 — over
        expect(second.status).toBe(429);
        expect(second.body.code).toBe('RATE_LIMITED');
    });
```

Also extend that file's import to include `PNG_1X1`:

```js
import { initTestApp, signUpUser, minimalState, saveProjectCommit, PNG_1X1 } from './helpers.js';
```

- [ ] **Step 6: Run the rate-limit test**

Run: `npx vitest run tests/unit/server/userRateLimit.test.js`
Expected: PASS — both tests. (This test would have failed at Step 5 had the route been registered without `userWriteLimiter`; run it now to confirm the limiter is really wired.)

- [ ] **Step 7: Run the full server suite**

Run: `npx vitest run tests/unit/server`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/routes/projects.js tests/unit/server/publication.test.js tests/unit/server/userRateLimit.test.js
git commit -m "feat(gallery): add metadata-only listing edit endpoint"
```

---

### Task 3: Server — expose preview source pages on the gallery detail route

**Files:**
- Modify: `server/routes/gallery.js:133-162`
- Test: `tests/unit/server/gallery.test.js`

**Interfaces:**
- Consumes: `thumbnails.node_id` (Task 1).
- Produces: `GET /api/gallery/:id` response gains `previews: Array<{ id: string, nodeId: string | null }>`, ordered by `position`, alongside the unchanged `thumbnailIds`.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/server/gallery.test.js`, inside its existing top-level `describe` (match the file's existing helper names when wiring setup — if it has no publish helper, publish inline exactly as `tests/unit/server/publication.test.js` does):

```js
    it('returns each preview with the page that produced it, keeping thumbnailIds', async () => {
        const created = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'Preview Sources', state: minimalState('root') });
        const id = created.body.project.id;
        await request(app).post(`/api/projects/${id}/publish`).set('Cookie', cookie)
            .set('If-Match', `"${created.body.project.headCommitId}"`)
            .send({
                description: 'd', tags: [],
                thumbnails: [PNG_1X1, PNG_1X1], previewNodeIds: ['root', 'root'],
            });

        const res = await request(app).get(`/api/gallery/${id}`);

        expect(res.status).toBe(200);
        expect(res.body.project.previews.length).toBe(2);
        expect(res.body.project.previews.every(p => p.nodeId === 'root')).toBe(true);
        expect(res.body.project.previews.map(p => p.id)).toEqual(res.body.project.thumbnailIds);
    });

    it('returns a null nodeId for previews published without one', async () => {
        const created = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'Legacy Previews', state: minimalState('root') });
        const id = created.body.project.id;
        await request(app).post(`/api/projects/${id}/publish`).set('Cookie', cookie)
            .set('If-Match', `"${created.body.project.headCommitId}"`)
            .send({ description: 'd', tags: [], thumbnails: [PNG_1X1] });

        const res = await request(app).get(`/api/gallery/${id}`);

        expect(res.body.project.previews).toEqual([
            { id: res.body.project.thumbnailIds[0], nodeId: null },
        ]);
    });
```

If `tests/unit/server/gallery.test.js` does not already import `PNG_1X1`, add it to the `./helpers.js` import list.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/server/gallery.test.js`
Expected: FAIL — `res.body.project.previews` is `undefined`.

- [ ] **Step 3: Implement**

In `server/routes/gallery.js`, change the detail query's select list (line 135) from

```js
        `SELECT p.*, u.username AS author, t.id AS thumbnail_id,
```

to

```js
        `SELECT p.*, u.username AS author, t.id AS thumbnail_id, t.node_id AS thumbnail_node_id,
```

and, in the response body (line 158), change

```js
            thumbnailIds: rows.map(row => row.thumbnail_id).filter(Boolean), forkedFrom,
```

to

```js
            thumbnailIds: rows.map(row => row.thumbnail_id).filter(Boolean),
            previews: rows.filter(row => row.thumbnail_id)
                .map(row => ({ id: row.thumbnail_id, nodeId: row.thumbnail_node_id ?? null })),
            forkedFrom,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/server/gallery.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full server suite**

Run: `npx vitest run tests/unit/server`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/routes/gallery.js tests/unit/server/gallery.test.js
git commit -m "feat(gallery): return preview source pages from the detail endpoint"
```

---

### Task 4: Client — thumbnails render as `{ nodeId, dataUrl }` pairs, capped at 6

**Files:**
- Modify: `services/thumbnailService.ts:11-50`
- Modify: `pages/MergeRequestPage.tsx:95-97`
- Test: `tests/unit/thumbnailService.test.ts` (create)
- Test: `tests/unit/MergeRequestPage.test.tsx`, `tests/unit/mergeRequestGuidance.test.tsx` (mock return shape)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `generateThumbnails(state: AppState, nodeIds: string[], variantId?: string): Promise<Array<{ nodeId: string; dataUrl: string }>>`, rendering at most 6 pages.

**Why the shape change:** the render loop `continue`s past a node id absent from the page order and past a canvas with no 2d context. A caller that built a parallel `previewNodeIds` array from its own selection would then pair image *n* with page *n* after a skip has shifted everything — silently mislabelling which page each published preview came from. Returning pairs makes the misalignment unrepresentable.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/thumbnailService.test.ts`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';

const generatePDF = vi.hoisted(() => vi.fn());
const computePageOrder = vi.hoisted(() => vi.fn());
vi.mock('../../services/pdfService', () => ({ generatePDF, computePageOrder }));

const getPage = vi.hoisted(() => vi.fn());
const destroy = vi.hoisted(() => vi.fn());
vi.mock('pdfjs-dist', () => ({
    GlobalWorkerOptions: {},
    getDocument: () => ({ promise: Promise.resolve({ getPage }), destroy }),
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker-url' }));

import { generateThumbnails } from '../../services/thumbnailService';

const state: any = { nodes: {}, rootId: 'a', variants: {}, activeVariantId: 'default' };

beforeEach(() => {
    vi.clearAllMocks();
    generatePDF.mockResolvedValue(new ArrayBuffer(8));
    computePageOrder.mockReturnValue(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    getPage.mockResolvedValue({
        getViewport: () => ({ width: 100, height: 100 }),
        render: () => ({ promise: Promise.resolve() }),
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        fillStyle: '', fillRect: vi.fn(),
    } as any);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/webp;base64,AAAA');
});

describe('generateThumbnails', () => {
    it('pairs each rendered image with the page it came from', async () => {
        const out = await generateThumbnails(state, ['b', 'c']);
        expect(out).toEqual([
            { nodeId: 'b', dataUrl: 'data:image/webp;base64,AAAA' },
            { nodeId: 'c', dataUrl: 'data:image/webp;base64,AAAA' },
        ]);
    });

    it('drops unknown pages without shifting the remaining pairings', async () => {
        const out = await generateThumbnails(state, ['b', 'not-a-page', 'c']);
        expect(out.map(o => o.nodeId)).toEqual(['b', 'c']);
    });

    it('renders at most six pages', async () => {
        const out = await generateThumbnails(state, ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
        expect(out.length).toBe(6);
        expect(out.map(o => o.nodeId)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/thumbnailService.test.ts`
Expected: FAIL — the returned array holds bare strings, not `{ nodeId, dataUrl }` objects; the six-page test returns 4 items.

- [ ] **Step 3: Implement**

In `services/thumbnailService.ts`, replace lines 11-24 (the doc comment, signature, and `out` declaration) with:

```ts
export const MAX_PREVIEWS = 6;

export interface RenderedPreview {
    nodeId: string;
    dataUrl: string;
}

/**
 * Renders up to 6 pages of the project to compressed image data URLs.
 * WebP where the browser supports canvas.toDataURL('image/webp'), else PNG.
 *
 * Returns page/image PAIRS, not bare images: the loop below skips any node id
 * missing from the page order or any canvas without a 2d context, so a caller
 * zipping its own selection against a bare image array would mislabel every
 * preview after the first skip.
 */
export async function generateThumbnails(
    state: AppState,
    nodeIds: string[],
    variantId?: string
): Promise<RenderedPreview[]> {
    const data = (await generatePDF(state, { variantId, output: 'arraybuffer' })) as ArrayBuffer;
    const order = computePageOrder(state);
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;
    const out: RenderedPreview[] = [];
```

Then change the loop bound (line 26) from `nodeIds.slice(0, 4)` to `nodeIds.slice(0, MAX_PREVIEWS)`, and the push (line 42) from

```ts
            out.push(webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png'));
```

to

```ts
            out.push({
                nodeId,
                dataUrl: webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png'),
            });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/thumbnailService.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Update the merge-request preview caller**

In `pages/MergeRequestPage.tsx`, replace lines 95-97:

```tsx
            const [after] = await generateThumbnails(srcState, [pageNode]);
            const [before] = await generateThumbnails(tgtState, [pageNode]);
            setPreviews({ before: before ?? '', after: after ?? '' });
```

with:

```tsx
            const [after] = await generateThumbnails(srcState, [pageNode]);
            const [before] = await generateThumbnails(tgtState, [pageNode]);
            setPreviews({ before: before?.dataUrl ?? '', after: after?.dataUrl ?? '' });
```

- [ ] **Step 6: Update the two mocks that return the old shape**

In `tests/unit/MergeRequestPage.test.tsx` and `tests/unit/mergeRequestGuidance.test.tsx`, find every place the hoisted `generateThumbnails` mock is given a resolved value and change bare strings to pairs — e.g. `mockResolvedValue(['data:image/png;base64,x'])` becomes `mockResolvedValue([{ nodeId: 'page-1', dataUrl: 'data:image/png;base64,x' }])`. Leave assertions on the rendered `<img src>` unchanged; they should still see the same URL.

- [ ] **Step 7: Run the affected client tests**

Run: `npx vitest run tests/unit/thumbnailService.test.ts tests/unit/MergeRequestPage.test.tsx tests/unit/mergeRequestGuidance.test.tsx tests/unit/PublishModal.test.tsx`
Expected: PASS for the first three. `PublishModal.test.tsx` may still pass because its mock is untyped — Task 5 covers it either way.

- [ ] **Step 8: Commit**

```bash
git add services/thumbnailService.ts pages/MergeRequestPage.tsx tests/unit/thumbnailService.test.ts tests/unit/MergeRequestPage.test.tsx tests/unit/mergeRequestGuidance.test.tsx
git commit -m "refactor(previews): return page/image pairs and raise the render cap to six"
```

---

### Task 5: Client — extract `PreviewPagePicker`, publish with source pages

**Files:**
- Create: `components/cloud/PreviewPagePicker.tsx`
- Modify: `components/cloud/PublishModal.tsx:87-89`, `:98-104`, `:186-201`
- Modify: `services/cloudApi.ts:214-219`
- Test: `tests/unit/PublishModal.test.tsx`

**Interfaces:**
- Consumes: `generateThumbnails` returning `RenderedPreview[]` (Task 4); `MAX_PREVIEWS` from `services/thumbnailService`.
- Produces:
  - `PreviewPagePicker({ pages, selected, onChange })` where `pages: Array<{ id: string; title: string }>`, `selected: string[]`, `onChange: (next: string[]) => void`.
  - `cloudApi.publish(projectId, expectedHead, { description, tags, thumbnails, previewNodeIds })` — `previewNodeIds` added.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/PublishModal.test.tsx` (a new `describe` block at the end of the file; reuse the file's existing `renderModal` helper and mocked `cloudApi`):

```tsx
describe('PublishModal preview selection', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(cloudApi, 'getProject').mockResolvedValue(cloudProject);
        vi.spyOn(cloudApi, 'getCommit').mockResolvedValue({
            id: 'head-1', message: 'm', createdAt: '', state,
        } as any);
        computePageOrder.mockImplementation(() => ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']);
    });

    it('caps the selection at six pages and sends each preview with its page', async () => {
        const publishSpy = vi.spyOn(cloudApi, 'publish').mockResolvedValue({} as any);
        generateThumbnails.mockImplementation(async (_s: any, ids: string[]) =>
            ids.map(id => ({ nodeId: id, dataUrl: `data:image/webp;base64,${id}` })));

        render(<PublishModal
            project={{ id: 'local-1', name: 'Project', initialState: state as any }}
            cloudProjectId="cloud-1" onClose={vi.fn()} onPublished={vi.fn()} />);

        const boxes = await screen.findAllByRole('checkbox');
        expect(boxes.length).toBe(7);
        // p1 is preselected by the modal; tick p2..p7 and expect the 7th to be refused.
        for (const box of boxes.slice(1)) fireEvent.click(box);
        expect(boxes.filter(b => (b as HTMLInputElement).checked).length).toBe(6);

        fireEvent.click(screen.getByRole('button', { name: /^publish$/i }));

        await waitFor(() => expect(publishSpy).toHaveBeenCalled());
        const [, , args] = publishSpy.mock.calls[0];
        expect(args.thumbnails.length).toBe(6);
        expect(args.previewNodeIds).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/PublishModal.test.tsx`
Expected: FAIL — the selection caps at 4, and `args.previewNodeIds` is `undefined`.

- [ ] **Step 3: Create the shared picker**

Create `components/cloud/PreviewPagePicker.tsx`:

```tsx
import React from 'react';
import { MAX_PREVIEWS } from '../../services/thumbnailService';

export interface PreviewPage {
    id: string;
    title: string;
}

interface PreviewPagePickerProps {
    pages: PreviewPage[];
    selected: string[];
    onChange: (next: string[]) => void;
}

/**
 * The one place the 1-MAX_PREVIEWS rule is implemented. Selection order is
 * publish order, and position 0 is the image the gallery card shows.
 */
export function PreviewPagePicker({ pages, selected, onChange }: PreviewPagePickerProps) {
    const toggle = (id: string) => {
        if (selected.includes(id)) {
            onChange(selected.filter(x => x !== id));
        } else if (selected.length < MAX_PREVIEWS) {
            onChange([...selected, id]);
        }
    };

    return (
        <div>
            <span className="text-xs font-medium text-slate-600">Preview pages (up to {MAX_PREVIEWS})</span>
            <p className="text-[10px] text-slate-400">The first page you pick is the cover shown on the gallery card.</p>
            <div className="mt-1 max-h-40 overflow-y-auto border rounded divide-y">
                {pages.map(p => (
                    <label key={p.id} className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-slate-50 cursor-pointer">
                        <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
                        <span className="truncate">{p.title}</span>
                    </label>
                ))}
            </div>
        </div>
    );
}
```

- [ ] **Step 4: Use the picker in `PublishModal` and send the node ids**

In `components/cloud/PublishModal.tsx`:

Add the import beside the existing ones:

```tsx
import { PreviewPagePicker } from './PreviewPagePicker';
```

Delete the `toggle` function (lines 87-89 in the current file).

Replace the preview block in the render (lines 186-196, the `<div>` containing the `Preview pages (up to 4)` label and its checkbox list) with:

```tsx
                    <PreviewPagePicker pages={pages} selected={selected} onChange={setSelected} />
```

In `publish()`, replace lines 98-104:

```tsx
            const thumbs = await generateThumbnails(inspected.state, selected, inspected.state.activeVariantId);
            if (currentProjectId.current !== cloudProjectId) return;
            setPreviews(thumbs);
            if (thumbs.length === 0) throw new Error('Could not render previews');
            setPhase('uploading');
            const tags = tagsText.split(',').map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 10);
            await cloudApi.publish(cloudProjectId, inspected.headCommitId, { description, tags, thumbnails: thumbs });
```

with:

```tsx
            const rendered = await generateThumbnails(inspected.state, selected, inspected.state.activeVariantId);
            if (currentProjectId.current !== cloudProjectId) return;
            setPreviews(rendered.map(r => r.dataUrl));
            if (rendered.length === 0) throw new Error('Could not render previews');
            setPhase('uploading');
            const tags = tagsText.split(',').map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 10);
            await cloudApi.publish(cloudProjectId, inspected.headCommitId, {
                description, tags,
                thumbnails: rendered.map(r => r.dataUrl),
                previewNodeIds: rendered.map(r => r.nodeId),
            });
```

- [ ] **Step 5: Widen the `cloudApi.publish` signature**

In `services/cloudApi.ts`, change line 214 from

```ts
    publish: (projectId: string, expectedHead: string, args: { description: string; tags: string[]; thumbnails: string[] }) =>
```

to

```ts
    publish: (projectId: string, expectedHead: string, args: { description: string; tags: string[]; thumbnails: string[]; previewNodeIds?: string[] }) =>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/PublishModal.test.tsx`
Expected: PASS, every test in the file including the pre-existing generator-warning and head-change suites.

- [ ] **Step 7: Commit**

```bash
git add components/cloud/PreviewPagePicker.tsx components/cloud/PublishModal.tsx services/cloudApi.ts tests/unit/PublishModal.test.tsx
git commit -m "feat(publish): share the preview picker and publish preview source pages"
```

---

### Task 6: Client — `EditListingModal`

**Files:**
- Create: `components/cloud/EditListingModal.tsx`
- Modify: `services/cloudApi.ts:150-153` (the `GalleryDetail` interface) and the `cloudApi` object (add `updatePublication` next to `publish`)
- Test: `tests/unit/EditListingModal.test.tsx` (create)

**Interfaces:**
- Consumes: `PreviewPagePicker` (Task 5), `generateThumbnails` → `RenderedPreview[]` (Task 4), `GET /api/gallery/:id`'s `previews` (Task 3), `PATCH /api/projects/:id/publication` (Task 2).
- Produces:
  - `cloudApi.updatePublication(projectId, { description, tags, thumbnails?, previewNodeIds? })`
  - `GalleryDetail.previews: Array<{ id: string; nodeId: string | null }>`
  - `EditListingModal({ projectId, onClose, onSaved })` — default export **not** used; import by name.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/EditListingModal.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditListingModal } from '../../components/cloud/EditListingModal';
import { cloudApi } from '../../services/cloudApi';

const computePageOrder = vi.hoisted(() => vi.fn(() => ['p1', 'p2', 'p3']));
vi.mock('../../services/pdfService', () => ({ computePageOrder }));
const generateThumbnails = vi.hoisted(() => vi.fn());
vi.mock('../../services/thumbnailService', () => ({ generateThumbnails, MAX_PREVIEWS: 6 }));

const state = {
    nodes: {
        p1: { id: 'p1', parentId: null, type: 'page', title: 'Cover', data: {}, children: [] },
        p2: { id: 'p2', parentId: null, type: 'page', title: 'Week', data: {}, children: [] },
        p3: { id: 'p3', parentId: null, type: 'page', title: 'Notes', data: {}, children: [] },
    },
    rootId: 'p1',
    variants: { default: { id: 'default', name: 'Default', templates: {} } },
    activeVariantId: 'default',
    schemaVersion: 10,
};

const listing = (previews: Array<{ id: string; nodeId: string | null }>) => ({
    id: 'proj-1', name: 'Planner', description: 'old description', tags: ['old'],
    author: 'someone', ownerId: 'user-1', forkCount: 0, downloadCount: 0,
    updatedAt: '', headCommitId: 'commit-1', thumbnailIds: previews.map(p => p.id),
    previews, forkedFrom: null, ratingAvg: null, ratingCount: 0,
}) as any;

const renderModal = () => {
    const props = { onClose: vi.fn(), onSaved: vi.fn() };
    return { ...props, ...render(<EditListingModal projectId="proj-1" {...props} />) };
};

beforeEach(() => {
    vi.restoreAllMocks();
    generateThumbnails.mockReset();
    vi.spyOn(cloudApi, 'getCommit').mockResolvedValue({
        id: 'commit-1', message: 'm', createdAt: '', state,
    } as any);
});

describe('EditListingModal', () => {
    it('opens with the published description, tags and preview pages already selected', async () => {
        vi.spyOn(cloudApi, 'galleryDetail').mockResolvedValue(
            listing([{ id: 't1', nodeId: 'p2' }]));
        renderModal();

        expect(await screen.findByDisplayValue('old description')).toBeTruthy();
        expect(screen.getByDisplayValue('old')).toBeTruthy();
        const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
        expect(boxes.map(b => b.checked)).toEqual([false, true, false]);
    });

    it('saves tags without re-rendering previews when the selection is untouched', async () => {
        vi.spyOn(cloudApi, 'galleryDetail').mockResolvedValue(
            listing([{ id: 't1', nodeId: 'p2' }]));
        const save = vi.spyOn(cloudApi, 'updatePublication').mockResolvedValue({} as any);
        const { onSaved } = renderModal();

        const tags = await screen.findByDisplayValue('old');
        fireEvent.change(tags, { target: { value: 'fresh, tags' } });
        fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(generateThumbnails).not.toHaveBeenCalled();
        expect(save).toHaveBeenCalledWith('proj-1', {
            description: 'old description', tags: ['fresh', 'tags'],
            thumbnails: undefined, previewNodeIds: undefined,
        });
    });

    it('re-renders and sends previews when the selection changes', async () => {
        vi.spyOn(cloudApi, 'galleryDetail').mockResolvedValue(
            listing([{ id: 't1', nodeId: 'p2' }]));
        const save = vi.spyOn(cloudApi, 'updatePublication').mockResolvedValue({} as any);
        generateThumbnails.mockImplementation(async (_s: any, ids: string[]) =>
            ids.map(id => ({ nodeId: id, dataUrl: `data:image/webp;base64,${id}` })));
        renderModal();

        const boxes = await screen.findAllByRole('checkbox');
        fireEvent.click(boxes[2]);   // add "Notes"
        fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

        await waitFor(() => expect(save).toHaveBeenCalled());
        expect(save.mock.calls[0][1]).toEqual({
            description: 'old description', tags: ['old'],
            thumbnails: ['data:image/webp;base64,p2', 'data:image/webp;base64,p3'],
            previewNodeIds: ['p2', 'p3'],
        });
    });

    it('opens a legacy listing unchecked and keeps its previews when left alone', async () => {
        vi.spyOn(cloudApi, 'galleryDetail').mockResolvedValue(
            listing([{ id: 't1', nodeId: null }, { id: 't2', nodeId: null }]));
        const save = vi.spyOn(cloudApi, 'updatePublication').mockResolvedValue({} as any);
        renderModal();

        const boxes = await screen.findAllByRole('checkbox') as HTMLInputElement[];
        expect(boxes.some(b => b.checked)).toBe(false);
        expect(screen.getByText(/current previews/i)).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

        await waitFor(() => expect(save).toHaveBeenCalled());
        expect(generateThumbnails).not.toHaveBeenCalled();
        expect(save.mock.calls[0][1].thumbnails).toBeUndefined();
    });

    it('refuses to save when every preview page has been unticked', async () => {
        vi.spyOn(cloudApi, 'galleryDetail').mockResolvedValue(
            listing([{ id: 't1', nodeId: 'p2' }]));
        const save = vi.spyOn(cloudApi, 'updatePublication').mockResolvedValue({} as any);
        renderModal();

        const boxes = await screen.findAllByRole('checkbox');
        fireEvent.click(boxes[1]);   // untick the only selected page
        fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

        expect(await screen.findByRole('alert')).toBeTruthy();
        expect(save).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/EditListingModal.test.tsx`
Expected: FAIL — `Failed to resolve import "../../components/cloud/EditListingModal"`.

- [ ] **Step 3: Extend the client API**

In `services/cloudApi.ts`, change the `GalleryDetail` interface (line 150-153) to:

```ts
export interface GalleryPreview { id: string; nodeId: string | null; }
export interface GalleryDetail extends Omit<GalleryItem, 'thumbnailId'> {
    ownerId: string; headCommitId: string | null; thumbnailIds: string[];
    previews: GalleryPreview[];
    forkedFrom: { projectId: string; name: string; author: string } | null;
}
```

and add this to the `cloudApi` object, immediately after `publish`:

```ts
    // Metadata-only. Never moves the published commit — see the route comment in
    // server/routes/projects.js. `thumbnails` omitted means "keep the current previews".
    updatePublication: (projectId: string, args: {
        description: string; tags: string[];
        thumbnails?: string[]; previewNodeIds?: string[];
    }) =>
        api<{ project: CloudProject & { thumbnailIds: string[] } }>(`/api/projects/${projectId}/publication`, {
            method: 'PATCH',
            body: JSON.stringify(args),
        }),
```

- [ ] **Step 4: Create the modal**

Create `components/cloud/EditListingModal.tsx`:

```tsx
import React, { useEffect, useMemo, useState } from 'react';
import { X, Pencil, Loader } from 'lucide-react';
import { API_BASE, ApiError, cloudApi, GalleryDetail } from '../../services/cloudApi';
import { computePageOrder } from '../../services/pdfService';
import { generateThumbnails } from '../../services/thumbnailService';
import { PreviewPagePicker } from './PreviewPagePicker';
import type { AppState } from '../../types';

interface EditListingModalProps {
    projectId: string;
    onClose: () => void;
    onSaved: () => void;
}

type LoadState =
    | { status: 'loading' }
    | { status: 'ready'; listing: GalleryDetail; state: AppState; initialSelection: string[] }
    | { status: 'error'; message: string };

const sameSelection = (a: string[], b: string[]) =>
    a.length === b.length && a.every((id, i) => id === b[i]);

export function EditListingModal({ projectId, onClose, onSaved }: EditListingModalProps) {
    const [load, setLoad] = useState<LoadState>({ status: 'loading' });
    const [description, setDescription] = useState('');
    const [tagsText, setTagsText] = useState('');
    const [selected, setSelected] = useState<string[]>([]);
    const [phase, setPhase] = useState<'form' | 'rendering' | 'saving'>('form');
    const [error, setError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoad({ status: 'loading' });
        setError(null);
        (async () => {
            try {
                const listing = await cloudApi.galleryDetail(projectId);
                if (!listing.headCommitId) throw new Error('This listing has no published version.');
                const commit = await cloudApi.getCommit(projectId, listing.headCommitId);
                if (cancelled) return;
                // A preview published before migration 016 has no recorded source page,
                // so it cannot be pre-checked. Those listings open unchecked instead.
                const initialSelection = listing.previews
                    .map(p => p.nodeId)
                    .filter((id): id is string => !!id);
                setLoad({
                    status: 'ready',
                    listing,
                    state: commit.state as AppState,
                    initialSelection,
                });
                setDescription(listing.description);
                setTagsText(listing.tags.join(', '));
                setSelected(initialSelection);
            } catch (e) {
                if (!cancelled) {
                    setLoad({ status: 'error', message: e instanceof Error ? e.message : 'Could not load this listing.' });
                }
            }
        })();
        return () => { cancelled = true; };
    }, [projectId, attempt]);

    const pages = useMemo(() => {
        if (load.status !== 'ready') return [];
        return computePageOrder(load.state).slice(0, 100)
            .map(id => ({ id, title: load.state.nodes[id]?.title || id }));
    }, [load]);

    const legacyPreviews = load.status === 'ready' && load.initialSelection.length === 0
        ? load.listing.previews
        : [];

    const save = async () => {
        if (load.status !== 'ready') return;
        setError(null);
        const tags = tagsText.split(',').map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 10);
        try {
            let thumbnails: string[] | undefined;
            let previewNodeIds: string[] | undefined;
            if (!sameSelection(selected, load.initialSelection)) {
                if (selected.length === 0) {
                    setError('Pick at least one preview page, or leave the current previews as they are.');
                    return;
                }
                setPhase('rendering');
                const rendered = await generateThumbnails(load.state, selected, load.state.activeVariantId);
                if (rendered.length === 0) throw new Error('Could not render previews');
                thumbnails = rendered.map(r => r.dataUrl);
                previewNodeIds = rendered.map(r => r.nodeId);
            }
            setPhase('saving');
            await cloudApi.updatePublication(projectId, { description, tags, thumbnails, previewNodeIds });
            onSaved();
        } catch (e) {
            setError(e instanceof ApiError ? e.message : (e as Error).message || 'Could not save this listing.');
            setPhase('form');
        }
    };

    const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center" onClick={onClose}>
            <div role="dialog" aria-modal="true" aria-labelledby="edit-listing-title"
                className="bg-white rounded-xl shadow-2xl w-[560px] max-h-[80vh] flex flex-col"
                onClick={e => e.stopPropagation()} onKeyDown={handleDialogKeyDown}>
                <div className="flex items-center justify-between px-4 py-3 border-b">
                    <h2 id="edit-listing-title" className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                        <Pencil size={14} /> Edit gallery listing
                    </h2>
                    <button type="button" aria-label="Close edit listing dialog" onClick={onClose}
                        className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
                </div>
                <div className="p-4 overflow-y-auto space-y-3 text-sm">
                    <p className="text-xs text-slate-500">
                        This changes what visitors see on the gallery page. It does not publish a newer
                        version of your project, and it will not move it back to the top of "recently updated."
                    </p>
                    {load.status === 'loading' && (
                        <div role="status" className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 flex items-center gap-2">
                            <Loader size={12} className="animate-spin" /> Loading listing…
                        </div>
                    )}
                    {load.status === 'error' && (
                        <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-center justify-between gap-3">
                            <span>{load.message}</span>
                            <button type="button" onClick={() => setAttempt(v => v + 1)} className="font-semibold hover:text-red-900">Retry</button>
                        </div>
                    )}
                    {load.status === 'ready' && (
                        <>
                            <label className="block">
                                <span className="text-xs font-medium text-slate-600">Description</span>
                                <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={2000}
                                    className="mt-1 w-full border rounded p-2 text-xs" rows={3} placeholder="What is this planner for?" />
                            </label>
                            <label className="block">
                                <span className="text-xs font-medium text-slate-600">Tags (comma-separated)</span>
                                <input value={tagsText} onChange={e => setTagsText(e.target.value)}
                                    className="mt-1 w-full border rounded p-2 text-xs" placeholder="planner, 2026, remarkable" />
                            </label>
                            {legacyPreviews.length > 0 && (
                                <div>
                                    <span className="text-xs font-medium text-slate-600">Current previews</span>
                                    <p className="text-[10px] text-slate-400">
                                        These were published before we started recording which page each preview came from.
                                        Leave the list below untouched to keep them, or pick pages to replace the whole set.
                                    </p>
                                    <div className="flex gap-2 mt-1">
                                        {legacyPreviews.map(p => (
                                            <img key={p.id} src={`${API_BASE}/api/thumbnails/${p.id}`} alt="" className="h-20 border rounded" />
                                        ))}
                                    </div>
                                </div>
                            )}
                            <PreviewPagePicker pages={pages} selected={selected} onChange={setSelected} />
                        </>
                    )}
                    {error && <div role="alert" className="text-xs text-red-600">{error}</div>}
                </div>
                <div className="px-4 py-3 border-t flex justify-end gap-2">
                    <button onClick={onClose} className="text-xs px-3 py-1.5 rounded border text-slate-600">Cancel</button>
                    <button onClick={save} disabled={phase !== 'form' || load.status !== 'ready'}
                        className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-50 flex items-center gap-1">
                        {phase !== 'form' && <Loader size={11} className="animate-spin" />}
                        {phase === 'rendering' ? 'Rendering previews…' : phase === 'saving' ? 'Saving…' : 'Save changes'}
                    </button>
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/EditListingModal.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add components/cloud/EditListingModal.tsx services/cloudApi.ts tests/unit/EditListingModal.test.tsx
git commit -m "feat(gallery): add the edit-listing modal"
```

---

### Task 7: Client — three lazy entry points

**Files:**
- Create: `components/cloud/LazyEditListingModal.tsx`
- Modify: `components/gallery/GalleryDetailBody.tsx`
- Modify: `pages/MyProjectsPage.tsx`
- Modify: `components/cloud/CloudMenu.tsx`
- Test: `tests/unit/EditListingEntryPoints.test.tsx` (create)

**Interfaces:**
- Consumes: `EditListingModal` (Task 6), `useGalleryDetail`'s existing `isOwner` and `project`, `MyProject.visibility`, `CloudMenu`'s existing `cloudProject` state.
- Produces: `LazyEditListingModal({ projectId, onClose, onSaved })` — same props as `EditListingModal`, wrapped in `React.lazy` + `Suspense`.

**Why lazy:** `EditListingModal` pulls in `services/thumbnailService`, which statically imports `pdfjs-dist` and its worker asset. The gallery and my-projects routes have no other pdfjs dependency today; a static import would move that whole library onto their critical path — exactly the regression the docs round had to undo.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/EditListingEntryPoints.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { GalleryDetailBody } from '../../components/gallery/GalleryDetailBody';

vi.mock('../../components/cloud/LazyEditListingModal', () => ({
    LazyEditListingModal: () => <div>edit listing modal</div>,
}));
vi.mock('../../components/cloud/HistoryModal', () => ({ HistoryModal: () => null }));

const detail = (isOwner: boolean): any => ({
    project: {
        id: 'p1', name: 'Planner', description: '', tags: [], author: 'me', ownerId: 'u1',
        forkCount: 0, downloadCount: 0, updatedAt: '', headCommitId: 'c1',
        thumbnailIds: [], previews: [], forkedFrom: null, ratingAvg: null, ratingCount: 0,
    },
    busy: null, mrs: [], isOwner, session: { user: { id: 'u1', username: 'me' } }, fromPath: '/gallery',
    openInEditor: vi.fn(), fork: vi.fn(), downloadAllVariants: vi.fn(), report: vi.fn(),
    showHistory: false, setShowHistory: vi.fn(), onCloneHistoryVersion: vi.fn(),
    reviews: [], myReview: null, saveReview: vi.fn(), deleteMyReview: vi.fn(), reportReview: vi.fn(),
});

const renderBody = (isOwner: boolean) => render(
    <MemoryRouter><GalleryDetailBody detail={detail(isOwner)} /></MemoryRouter>);

describe('gallery detail edit-listing entry point', () => {
    it('offers Edit listing to the owner', () => {
        renderBody(true);
        expect(screen.getByRole('button', { name: /edit listing/i })).toBeTruthy();
    });

    it('hides Edit listing from everyone else', () => {
        renderBody(false);
        expect(screen.queryByRole('button', { name: /edit listing/i })).toBeNull();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/EditListingEntryPoints.test.tsx`
Expected: FAIL — `Failed to resolve import "../../components/cloud/LazyEditListingModal"`.

- [ ] **Step 3: Create the lazy wrapper**

Create `components/cloud/LazyEditListingModal.tsx`:

```tsx
import React, { Suspense, lazy } from 'react';

// EditListingModal statically imports services/thumbnailService, which pulls in
// pdfjs-dist and its worker asset. Loading it lazily keeps that library out of
// the gallery and my-projects chunks, which have no other reason to carry it.
const EditListingModal = lazy(() =>
    import('./EditListingModal').then(m => ({ default: m.EditListingModal })));

interface LazyEditListingModalProps {
    projectId: string;
    onClose: () => void;
    onSaved: () => void;
}

export function LazyEditListingModal(props: LazyEditListingModalProps) {
    return (
        <Suspense fallback={
            <div role="status" className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center text-white text-sm">
                Loading editor…
            </div>
        }>
            <EditListingModal {...props} />
        </Suspense>
    );
}
```

- [ ] **Step 4: Wire the gallery detail entry point**

In `components/gallery/GalleryDetailBody.tsx`:

Change the React import and add the modal import:

```tsx
import React, { useState } from 'react';
```

```tsx
import { LazyEditListingModal } from '../cloud/LazyEditListingModal';
```

Add `Pencil` to the `lucide-react` import list on line 3.

Add local state at the top of the component body, immediately after the destructuring block (after line 19):

```tsx
    const [editing, setEditing] = useState(false);
```

Add the button inside the action column, immediately after the "Version history" button's closing `</button>` (line 66):

```tsx
                    {isOwner && (
                        <button onClick={() => setEditing(true)} disabled={busy !== null}
                            className="flex items-center justify-center gap-1.5 border border-slate-300 rounded-lg px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
                            <Pencil size={14} /> Edit listing
                        </button>
                    )}
```

Add the modal beside the existing `showHistory` block, just before the closing `</>` (after line 114):

```tsx
            {editing && (
                <LazyEditListingModal
                    projectId={project.id}
                    onClose={() => setEditing(false)}
                    onSaved={() => { setEditing(false); window.location.reload(); }}
                />
            )}
```

`window.location.reload()` is the honest refresh here: `useGalleryDetail` fetches once per `id` with no refetch handle, and the modal is also rendered inside `GalleryDetailModal`, where a router navigation would close the overlay.

- [ ] **Step 5: Wire the My Projects entry point**

In `pages/MyProjectsPage.tsx`:

Add `Pencil` to the `lucide-react` import on line 2, and add:

```tsx
import { LazyEditListingModal } from '../components/cloud/LazyEditListingModal';
```

Add state beside the existing `deletingId` (after line 12):

```tsx
    const [editingId, setEditingId] = useState<string | null>(null);
```

Add the row action immediately before the existing Delete `<button>` (line 89):

```tsx
                                {p.visibility === 'public' && (
                                    <button
                                        onClick={() => setEditingId(p.id)}
                                        className="flex items-center gap-1 text-xs text-slate-600 hover:text-blue-700"
                                    >
                                        <Pencil size={12} /> Edit listing
                                    </button>
                                )}
```

Add the modal just before the closing `</div>` of the page wrapper (after `</main>`, line 100):

```tsx
            {editingId && (
                <LazyEditListingModal
                    projectId={editingId}
                    onClose={() => setEditingId(null)}
                    onSaved={() => { setEditingId(null); load(); }}
                />
            )}
```

- [ ] **Step 6: Wire the editor Cloud menu entry point**

In `components/cloud/CloudMenu.tsx`:

Add `Pencil` to the `lucide-react` import on line 3, and add:

```tsx
import { LazyEditListingModal } from './LazyEditListingModal';
```

Add state beside `showPublish` (after line 24):

```tsx
    const [showEditListing, setShowEditListing] = useState(false);
```

Add the menu item immediately after the "Publish to gallery…" button block (after line 131's closing `</button>`), matching that button's classes:

```tsx
                                {cloudProject?.visibility === 'public' && (
                                    <button onClick={() => { setShowEditListing(true); setOpen(false); }}
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2">
                                        <Pencil size={12} /> Edit gallery listing…
                                    </button>
                                )}
```

Add the modal beside the existing `showPublish` render (after line 161):

```tsx
            {showEditListing && project.cloud && (
                <LazyEditListingModal projectId={project.cloud.projectId}
                    onClose={() => setShowEditListing(false)}
                    onSaved={() => {
                        setShowEditListing(false);
                        setCloudProject(null);
                        window.alert('Listing updated. Your published version is unchanged.');
                    }} />
            )}
```

Setting `cloudProject` back to `null` makes the menu refetch on next open, so a listing edited then unpublished elsewhere does not keep offering the item from stale state.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/EditListingEntryPoints.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 8: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS. Pay attention to any existing `MyProjectsPage`, `CloudMenu`, or gallery-detail specs — the new buttons add elements those files may count.

- [ ] **Step 9: Verify the bundle split held**

Run: `npm run build`
Expected: build succeeds, and the output lists a separate chunk containing `EditListingModal`. Confirm pdfjs is not in the gallery route's chunk:

```bash
npm run build 2>&1 | grep -iE "editlisting|pdf"
```

Expected: an `EditListingModal-*.js` chunk appears in the asset list. If `pdfjs` has instead been folded into the main or gallery chunk, the lazy import was bypassed — fix before committing.

- [ ] **Step 10: Commit**

```bash
git add components/cloud/LazyEditListingModal.tsx components/gallery/GalleryDetailBody.tsx pages/MyProjectsPage.tsx components/cloud/CloudMenu.tsx tests/unit/EditListingEntryPoints.test.tsx
git commit -m "feat(gallery): reach the listing editor from gallery, my projects and the editor"
```

---

### Task 8: Documentation

**Files:**
- Modify: `docs-content/tutorials/gallery/04-publishing.md`
- Modify: `docs-content/reference/cloud/publish-and-unpublish.md`
- Modify: `docs/8-cloud-and-gallery.md:25`
- Modify: `public/walkthroughs/walkthrough.md`

**Interfaces:**
- Consumes: the shipped behaviour from Tasks 1-7.
- Produces: no code interfaces.

- [ ] **Step 1: Run the docs guard tests first, to see them green before you edit**

Run: `npx vitest run tests/unit/docs`
Expected: PASS. (Vitest treats the argument as a path filter, so this matches `tests/unit/docsAntiRot.test.ts`, `docsContent.test.ts`, `docsReferencePages.test.tsx` and the rest of the `docs*` suite. These are the guards that fail the build on a broken image reference or an unresolvable `/docs` link.)

- [ ] **Step 2: Update the preview count in the tutorial**

In `docs-content/tutorials/gallery/04-publishing.md`, line 38, change `The server accepts 1–4 of them` to `The server accepts 1–6 of them`.

- [ ] **Step 3: Update the reference entry**

In `docs-content/reference/cloud/publish-and-unpublish.md`, line 8, change `**1–4 preview pages**` to `**1–6 preview pages**`.

Then add this paragraph after that same paragraph:

```markdown
**Edit gallery listing…** changes the listing without republishing. It is reachable three ways — the **Edit listing** button on your own project's gallery page, the **Edit listing** row action on [My Projects](/docs/reference/cloud/my-projects), and **Edit gallery listing…** in the editor's Cloud menu — and it edits the description, the tags, and which pages are used as previews. The published version itself does not move: visitors keep seeing the same commit, and the project does not jump back to the top of the gallery's *recently updated* row. Preview pages you already published open pre-ticked; change them and the whole preview set is re-rendered from the **published** version, so what visitors see always matches what they can download. Leave the page list alone and your existing previews are kept untouched.
```

Check the link target `/docs/reference/cloud/my-projects` resolves — if no such entry exists, drop that link and write "the My Projects page" as plain text. The docs suite fails the build on an unresolvable in-docs link.

- [ ] **Step 4: Update the architecture doc**

In `docs/8-cloud-and-gallery.md`, line 25, change:

```markdown
1. **Page selection** — pick 1–4 pages to serve as gallery preview images (checkbox picker over `computePageOrder`, capped client-side at 4).
```

to:

```markdown
1. **Page selection** — pick 1–6 pages to serve as gallery preview images (`PreviewPagePicker` over `computePageOrder`, capped client-side at `MAX_PREVIEWS`). Each preview records the page that produced it in `thumbnails.node_id`, so the listing editor can reopen the picker pre-ticked.
```

- [ ] **Step 5: Add a "fixing a listing after the fact" step to the tutorial**

In `docs-content/tutorials/gallery/04-publishing.md`, append a section before whatever closing/next-steps section the file ends with:

```markdown
## Fixing a listing after the fact

Tags go stale, descriptions get typos, and the page you picked as a cover is rarely the best one. None of that needs a republish. Open your project's gallery page and click **Edit listing** (the same dialog is on **My Projects**, and in the editor's Cloud menu as **Edit gallery listing…**).

You get the description, the tags, and the preview page list back, with your current preview pages already ticked. Change what you need and save. What visitors download is untouched — the listing editor never moves the published version — and editing a tag will not push your project back to the top of *Recently updated*, so there is no cost to keeping a listing tidy.

One wrinkle for older projects: listings published before previews started recording their source page open with nothing ticked and your current preview images shown above the list. Leave the list alone to keep those images, or tick pages to replace the whole set.
```

- [ ] **Step 6: Regenerate the publish-wizard screenshots**

Run: `node docs-capture/run.js gallery`
Expected: the gallery-track stills regenerate; the publish-wizard shot now reads "Preview pages (up to 6)". If the capture run needs services it cannot start in this environment, stop and report that rather than hand-editing images.

- [ ] **Step 7: Add a walkthrough entry**

In `public/walkthroughs/walkthrough.md`, add a new `##` section before `## By the numbers`:

```markdown
## Editing a published listing

Publishing was a one-shot: the only writer of a listing's description, tags, and preview images was the publish endpoint, and it always pinned the public version to your current head. Fixing a typo'd tag meant republishing whatever you happened to be working on. This round split the two apart — a metadata-only `PATCH /api/projects/:id/publication` that changes the listing and deliberately touches neither `published_commit_id` nor `published_at` (the second matters: it drives the gallery's "recently updated" sort, so a tag edit that re-ranked you would be free promotion). One modal, reached from the gallery page, My Projects, and the editor's Cloud menu, lazy-loaded so the PDF rasteriser stays off those routes' critical path. Previews now record which page produced them (`thumbnails.node_id`), so the picker reopens pre-ticked and editing reads as an edit rather than a redo; listings published before that column existed open unticked, show their current images, and keep them untouched unless you pick pages. The preview cap went from 4 to 6 in the same pass, behind one shared `PreviewPagePicker` so the client and server rule can't drift.
```

Also update the `## By the numbers` list to mention this round alongside the others.

- [ ] **Step 8: Run the docs guards**

Run: `npx vitest run tests/unit/docs`
Expected: PASS — no broken image references, no unresolvable `/docs` links.

- [ ] **Step 9: Commit**

```bash
git add docs-content docs/8-cloud-and-gallery.md public/walkthroughs/walkthrough.md docs-capture
git commit -m "docs: cover listing editing and the six-preview cap"
```

---

### Task 9: End-to-end coverage and real-browser verification

**Files:**
- Modify: `tests/e2e/gallery.spec.js`

**Interfaces:**
- Consumes: everything from Tasks 1-7.
- Produces: no code interfaces.

- [ ] **Step 1: Write the failing e2e test**

Append this test to `tests/e2e/gallery.spec.js`, inside the file's existing top-level `test.describe` (or at top level if the file has none — match the surrounding structure):

```js
test('an owner edits a published listing without moving the published version', async ({ page }) => {
    const email = `listing-${unique}@test.dev`;
    await signUpAndVerify(page, { name: 'Listing Owner', username: `listing${unique}`.slice(0, 30), email });

    const created = await page.request.post(`${API_BASE}/api/projects`, {
        data: { name: `Listing E2E ${unique}`, state: {
            nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
            rootId: 'root',
            variants: { default: { id: 'default', name: 'Default', templates: { page: { id: 'page', name: 'Page', width: 500, height: 700, elements: [] } } } },
            activeVariantId: 'default',
            schemaVersion: 7,
        } },
    });
    expect(created.ok()).toBeTruthy();
    const { project } = await created.json();

    const published = await page.request.post(`${API_BASE}/api/projects/${project.id}/publish`, {
        headers: { 'If-Match': `"${project.headCommitId}"` },
        data: {
            description: 'before edit', tags: [`stale${unique}`],
            thumbnails: [PNG_1X1], previewNodeIds: ['root'],
        },
    });
    expect(published.ok()).toBeTruthy();
    const publishedCommitId = (await published.json()).project.publishedCommitId;

    await page.goto(`/gallery/${project.id}`);
    await page.getByRole('button', { name: /edit listing/i }).click();
    await expect(page.getByRole('heading', { name: /edit gallery listing/i })).toBeVisible();

    // The page that produced the current preview reopens already ticked.
    await expect(page.getByRole('checkbox', { name: /root/i })).toBeChecked();

    await page.getByPlaceholder('planner, 2026, remarkable').fill(`fresh${unique}`);
    await page.getByRole('button', { name: /save changes/i }).click();

    await expect.poll(async () => {
        const detail = await (await page.request.get(`${API_BASE}/api/gallery/${project.id}`)).json();
        return detail.project.tags;
    }).toEqual([`fresh${unique}`]);

    const after = await (await page.request.get(`${API_BASE}/api/gallery/${project.id}`)).json();
    expect(after.project.headCommitId).toBe(publishedCommitId);

    // The new tag is a real filter; the old one is gone.
    const filtered = await (await page.request.get(`${API_BASE}/api/gallery?tag=fresh${unique}`)).json();
    expect(filtered.projects.map(p => p.id)).toContain(project.id);
    const stale = await (await page.request.get(`${API_BASE}/api/gallery?tag=stale${unique}`)).json();
    expect(stale.projects.map(p => p.id)).not.toContain(project.id);
});
```

- [ ] **Step 2: Run the e2e test to verify it fails on the current `main`**

If you have already implemented Tasks 1-7, skip verifying the failure and go to Step 3 — the point of this step is only to confirm the test is not vacuous. To check that, temporarily assert `expect(after.project.headCommitId).toBe('nonsense')` and confirm it fails, then restore the real assertion.

Run: `npx playwright test tests/e2e/gallery.spec.js -g "edits a published listing"`

- [ ] **Step 3: Run the e2e test**

Run: `npx playwright test tests/e2e/gallery.spec.js -g "edits a published listing"`
Expected: PASS.

- [ ] **Step 4: Run the whole e2e suite for regressions**

Run: `npx playwright test`
Expected: PASS.

- [ ] **Step 5: Real-browser verification of all three entry points**

Start the app (`npm run dev`) and drive it manually or with a throwaway Playwright script. Confirm each item and record the result:

1. Sign in, publish a project with 6 preview pages — all 6 appear on the gallery detail page, and the picker refuses a 7th.
2. On your own project's gallery page, **Edit listing** appears; on someone else's it does not.
3. Edit tags only, save — the gallery page shows the new tags, the previews are visually unchanged, and the project has *not* moved to the front of the "Recently updated" row.
4. Edit the preview selection, save — the gallery page shows the newly chosen pages, and "Open in editor" still loads the same content it did before the edit.
5. Reopen the editor after step 4 — the picker comes back pre-ticked with the pages you just chose.
6. My Projects — **Edit listing** shows only on public rows, opens the same dialog, and the list refreshes after saving.
7. Editor Cloud menu — **Edit gallery listing…** appears only for a published project and opens the same dialog.
8. Open DevTools' Network tab and confirm the `EditListingModal` chunk loads only when the dialog is opened, not on page load.

- [ ] **Step 6: Run the full unit suite one last time**

Run: `npx vitest run`
Expected: PASS, no skipped tests.

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/gallery.spec.js
git commit -m "test: cover editing a published listing end to end"
```

---

## Self-Review Notes

Checked against `docs/superpowers/specs/2026-07-25-gallery-listing-editing-design.md`:

- Migration 016, cap 6, `parsePreviewSet`/`parseTagList`/`replaceThumbnails` → Task 1.
- `PATCH …/publication`, `NOT_PUBLISHED`, untouched `published_commit_id`/`published_name`/`published_at`, no `requireUsername`, `userWriteLimiter`, omittable `thumbnails`, rejected empty array → Task 2.
- `GET /api/gallery/:id` `previews` → Task 3.
- `generateThumbnails` pairs + cap, `MergeRequestPage` and its two mocks → Task 4.
- `PreviewPagePicker`, `PublishModal` sending node ids, `cloudApi.publish` signature → Task 5.
- `EditListingModal`, `cloudApi.updatePublication`, `GalleryDetail.previews`, legacy path, unchanged-selection path → Task 6.
- Three lazy entry points and the bundle check → Task 7.
- All four documentation files and the screenshot regeneration → Task 8.
- E2E and the mandatory real-browser drive → Task 9.

Naming is consistent across tasks: `MAX_PREVIEWS` (server const in `server/routes/projects.js`, client const in `services/thumbnailService.ts`), `parsePreviewSet`, `parseTagList`, `replaceThumbnails`, `RenderedPreview`, `PreviewPagePicker`, `EditListingModal`, `LazyEditListingModal`, `updatePublication`, `previews`/`previewNodeIds`.
