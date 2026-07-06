# Gallery v2 (Ratings, Reviews, Tag Filtering, Visual Refresh) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 1–5 star ratings with optional written reviews to public gallery projects, tag/search filtering, and rework the gallery page into a curated sections-plus-filtered-grid layout with a visual polish pass — per `docs/superpowers/specs/2026-07-06-gallery-v2-ratings-reviews-filters-design.md`.

**Architecture:** One new DB migration (`008_reviews`: a `reviews` table + nullable `reports.review_id`). All server changes live in `server/routes/gallery.js` (review CRUD, review reporting, rating aggregates computed at read time via subqueries, tag filter, `/api/gallery/tags`) plus two small touches (`server/routes/me.js` gains rating fields on profile project cards; `server/routes/projects.js` delete route cleans up reviews). Client: new typed methods in `services/cloudApi.ts`; three new components (`StarRating`, `ProjectCard`, `ReviewsSection`); `useGalleryDetail` gains review state; `GalleryPage` is reworked into URL-param-driven sections/grid modes; `ProfilePage` adopts the shared card.

**Tech Stack:** Express + `server/db.js` `query()` (Postgres/SQLite dual), better-auth guards (`requireAuth`/`requireUsername`/`optionalAuth`), React 19 + TypeScript + Tailwind (Play CDN) + `lucide-react`, Vitest + supertest (server, `@vitest-environment node`) + `@testing-library/react` (client). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-06-gallery-v2-ratings-reviews-filters-design.md`

## Global Constraints

- Server files are plain-ESM JavaScript; client files are TypeScript. Follow existing style exactly (Tailwind utility classes, `lucide-react` icons, slate/blue palette, `rounded-xl` cards).
- **`query()` placeholder rule** (`server/db.js`): always `$1..$n`, **each number used exactly once**, params in order. For upserts use `EXCLUDED.column` (works on both Postgres and the bundled SQLite), never repeat a placeholder.
- **SQLite does not enforce foreign keys here** (no `PRAGMA foreign_keys`; existing code cleans up related rows manually — see the project-delete route). The `reviews` table therefore uses plain `TEXT` columns without `REFERENCES` clauses, matching the `reports` table precedent, and deletion cleanup is explicit.
- **Migration partial-failure rule** (spec §1): the runner splits on `;` and re-runs an unrecorded migration from the top. `CREATE TABLE/INDEX IF NOT EXISTS` first; the non-idempotent `ALTER TABLE reports ADD COLUMN` **must be the last statement**, and the Postgres variant uses `ADD COLUMN IF NOT EXISTS`.
- Review writes: rating required integer 1–5; body optional, trimmed, **> 2000 chars → 400** (reject, don't truncate). Timestamps are app-stamped `new Date().toISOString()` (never `CURRENT_TIMESTAMP` — SQLite's is whole-second and breaks ordering).
- `PUT /api/gallery/:id/review` is gated `requireAuth, requireUsername, userWriteLimiter`; `DELETE .../review` only `requireAuth` (never trap a legacy no-username account away from removing its own content). Owner reviewing own project → 403.
- New gallery list params are all optional and default to today's exact behavior (`q`, `sort=recent|popular` unchanged; new `tag`, `limit`, `sort=rating`).
- Rating aggregates are computed via SQL subqueries at read time — **no denormalized columns**. Postgres returns `AVG`/`COUNT` as strings: always wrap in `Number(...)` before math. DTO `ratingAvg` is rounded to 1 decimal or `null` when unrated; `ratingCount` is a number.
- `GET /api/gallery/tags` must be registered **before** `GET /api/gallery/:id`, or Express routes `tags` into the `:id` handler.
- Test files: server tests in `tests/unit/server/` start with `// @vitest-environment node`, import fixtures only from `tests/unit/server/helpers.js` (never from another `*.test.js`), and use unique names/emails/tags per file — **test files share a worker DB, so never assert on global ordering or totals; always filter to rows this file created** (find-by-name, or a unique `q`/`tag` value).
- Client tests: explicit imports from `'vitest'`, `MemoryRouter` + marker routes pattern, `vi.mock('../../lib/auth-client')` for session (see `tests/unit/GalleryDetailPage.test.tsx`).
- Commit style: `feat(gallery-v2): ...` / `test(gallery-v2): ...`.
- Baseline: before Task 1, run `npx vitest run` (all green) and `npx tsc --noEmit` (clean); record the passing test count and keep the suite green after every task.

---

### Task 1: Migration `008_reviews` + project-delete cleanup

**Files:**
- Modify: `server/migrations/index.js` (append after `007_commit_storage`)
- Modify: `server/routes/projects.js` (delete route, ~line 149)
- Test: Create `tests/unit/server/reviews.test.js`

**Interfaces:**
- Produces: `reviews` table (`id TEXT PK, project_id TEXT NOT NULL, user_id TEXT NOT NULL, rating INTEGER NOT NULL CHECK 1..5, body TEXT, created_at TIMESTAMP NOT NULL, updated_at TIMESTAMP NOT NULL, UNIQUE(project_id, user_id)`), index `idx_reviews_project`, nullable column `reports.review_id TEXT`. Project deletion removes the project's reviews.
- Consumes: migration runner (`server/migrations.js`, unchanged), `query()` from `server/db.js`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/server/reviews.test.js`:

```js
// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, PNG_1X1 } from './helpers.js';

let app, ownerCookie;
beforeAll(async () => {
    app = await initTestApp();
    ownerCookie = await signUpUser(app, { email: 'rev-schema-owner@test.dev', username: 'rev_schema_owner' });
});

describe('008_reviews schema', () => {
    it('creates the reviews table with a 1-5 rating check and per-user uniqueness', async () => {
        const { query } = await import('../../../server/db.js');
        const now = new Date().toISOString();
        await query(
            `INSERT INTO reviews (id, project_id, user_id, rating, body, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            ['rv-schema-1', 'proj-schema-x', 'user-schema-a', 4, 'nice', now, now]);
        const rows = await query('SELECT rating, body FROM reviews WHERE id = $1', ['rv-schema-1']);
        expect(rows[0].rating).toBe(4);
        expect(rows[0].body).toBe('nice');
        // CHECK constraint
        await expect(query(
            `INSERT INTO reviews (id, project_id, user_id, rating, body, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            ['rv-schema-2', 'proj-schema-x', 'user-schema-b', 6, null, now, now])).rejects.toThrow();
        // UNIQUE(project_id, user_id)
        await expect(query(
            `INSERT INTO reviews (id, project_id, user_id, rating, body, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            ['rv-schema-3', 'proj-schema-x', 'user-schema-a', 2, null, now, now])).rejects.toThrow();
    });

    it('adds a nullable review_id column to reports', async () => {
        const { query } = await import('../../../server/db.js');
        await query(
            `INSERT INTO reports (id, project_id, reporter_user_id, reason, review_id)
             VALUES ($1, $2, $3, $4, $5)`,
            ['rep-schema-1', 'proj-schema-x', null, 'test', 'rv-schema-1']);
        const rows = await query('SELECT review_id FROM reports WHERE id = $1', ['rep-schema-1']);
        expect(rows[0].review_id).toBe('rv-schema-1');
    });

    it('deleting a project deletes its reviews', async () => {
        const { query } = await import('../../../server/db.js');
        const p = await request(app).post('/api/projects').set('Cookie', ownerCookie)
            .send({ name: 'Review Cleanup Target', state: minimalState() });
        const projectId = p.body.project.id;
        const now = new Date().toISOString();
        await query(
            `INSERT INTO reviews (id, project_id, user_id, rating, body, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            ['rv-cleanup-1', projectId, 'user-schema-c', 5, null, now, now]);
        const del = await request(app).delete(`/api/projects/${projectId}`).set('Cookie', ownerCookie);
        expect(del.status).toBe(200);
        const left = await query('SELECT id FROM reviews WHERE project_id = $1', [projectId]);
        expect(left.length).toBe(0);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/server/reviews.test.js`
Expected: FAIL — `no such table: reviews` (first two tests) and the cleanup test's final assertion fails.

- [ ] **Step 3: Append migration 008**

In `server/migrations/index.js`, append to the `migrations` array (after the `007_commit_storage` entry, before the closing `];`):

```js
    {
        id: '008_reviews',
        // No REFERENCES clauses: SQLite runs without PRAGMA foreign_keys here, so FK
        // cascades would silently not fire — related-row cleanup is manual, matching
        // the reports/commits precedent. The non-idempotent ALTER is deliberately the
        // LAST statement (the runner re-runs an unrecorded migration from the top;
        // everything before it is IF NOT EXISTS — see spec §1 partial-failure note).
        pg: `
            CREATE TABLE IF NOT EXISTS reviews (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
                body TEXT,
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL,
                UNIQUE (project_id, user_id)
            );
            CREATE INDEX IF NOT EXISTS idx_reviews_project ON reviews(project_id);
            ALTER TABLE reports ADD COLUMN IF NOT EXISTS review_id TEXT
        `,
        sqlite: `
            CREATE TABLE IF NOT EXISTS reviews (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
                body TEXT,
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL,
                UNIQUE (project_id, user_id)
            );
            CREATE INDEX IF NOT EXISTS idx_reviews_project ON reviews(project_id);
            ALTER TABLE reports ADD COLUMN review_id TEXT
        `
    }
```

- [ ] **Step 4: Add review cleanup to the project delete route**

In `server/routes/projects.js`, in `router.delete('/api/projects/:id', ...)` (~line 149), add one line directly before the existing `DELETE FROM commits` line:

```js
    await query('DELETE FROM reviews WHERE project_id = $1', [req.project.id]);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/server/reviews.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Run the full suite (migration must not break anything)**

Run: `npx vitest run`
Expected: all green, including `tests/unit/server/migrations.test.js`.

- [ ] **Step 7: Commit**

```bash
git add server/migrations/index.js server/routes/projects.js tests/unit/server/reviews.test.js
git commit -m "feat(gallery-v2): reviews table migration + delete-route cleanup"
```

---

### Task 2: Review endpoints — list, upsert, delete

**Files:**
- Modify: `server/routes/gallery.js`
- Test: Extend `tests/unit/server/reviews.test.js`

**Interfaces:**
- Consumes: `reviews` table (Task 1); `loadPublicProject` middleware, `optionalAuth` (already in `gallery.js`); `requireAuth`, `requireUsername` from `../middleware/guards.js`; `userWriteLimiter` from `../middleware/limits.js` (new imports into `gallery.js`).
- Produces (later tasks and the client rely on these exact shapes):
  - `GET /api/gallery/:id/reviews` → `200 { reviews: ReviewDto[], myReview: ReviewDto | null }` (newest-updated first, `LIMIT 100`; `myReview` fetched by its own query so it's correct even outside the first 100).
  - `PUT /api/gallery/:id/review` body `{ rating: number, body?: string }` → `200 { review: ReviewDto }`; `400` invalid rating/body; `401` anonymous; `403 USERNAME_REQUIRED`; `403` owner self-review; `404` non-public project.
  - `DELETE /api/gallery/:id/review` → `200 { success: true }`; `404` if the caller has no review.
  - `ReviewDto = { id: string, rating: number, body: string, author: string, createdAt: string, updatedAt: string }`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/server/reviews.test.js` — and extend the `beforeAll` to create the shared published project and extra users:

```js
// Add to the imports at the top of the file:
import { signUpUserNoUsername } from './helpers.js';
// (merge into the existing import line from './helpers.js')

// Extend the top-level state and beforeAll:
let raterCookie, rater2Cookie, noUsernameCookie, projectId;
// inside beforeAll, after ownerCookie is created:
    raterCookie = await signUpUser(app, { email: 'rev-rater@test.dev', username: 'rev_rater' });
    rater2Cookie = await signUpUser(app, { email: 'rev-rater2@test.dev', username: 'rev_rater2' });
    noUsernameCookie = await signUpUserNoUsername(app, { email: 'rev-noname@test.dev', name: 'Anon Legacy' });
    const proj = await request(app).post('/api/projects').set('Cookie', ownerCookie)
        .send({ name: 'Reviewable Planner', state: minimalState() });
    projectId = proj.body.project.id;
    await request(app).post(`/api/projects/${projectId}/publish`).set('Cookie', ownerCookie)
        .send({ description: 'reviewable', tags: ['rev-tag'], thumbnails: [PNG_1X1] });
```

```js
describe('review write gating', () => {
    it('rejects anonymous writes', async () => {
        const res = await request(app).put(`/api/gallery/${projectId}/review`).send({ rating: 4 });
        expect(res.status).toBe(401);
    });

    it('rejects accounts without a username, with the USERNAME_REQUIRED code', async () => {
        const res = await request(app).put(`/api/gallery/${projectId}/review`)
            .set('Cookie', noUsernameCookie).send({ rating: 4 });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('USERNAME_REQUIRED');
    });

    it("rejects the owner's self-review", async () => {
        const res = await request(app).put(`/api/gallery/${projectId}/review`)
            .set('Cookie', ownerCookie).send({ rating: 5 });
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/own project/i);
    });

    it('validates the rating', async () => {
        for (const rating of [0, 6, 2.5, undefined, 'four']) {
            const res = await request(app).put(`/api/gallery/${projectId}/review`)
                .set('Cookie', raterCookie).send({ rating });
            expect(res.status).toBe(400);
        }
    });

    it('rejects bodies over 2000 chars', async () => {
        const res = await request(app).put(`/api/gallery/${projectId}/review`)
            .set('Cookie', raterCookie).send({ rating: 4, body: 'x'.repeat(2001) });
        expect(res.status).toBe(400);
    });
});

describe('review CRUD', () => {
    it('creates a review and returns its DTO', async () => {
        const res = await request(app).put(`/api/gallery/${projectId}/review`)
            .set('Cookie', raterCookie).send({ rating: 4, body: '  Solid layout.  ' });
        expect(res.status).toBe(200);
        expect(res.body.review.rating).toBe(4);
        expect(res.body.review.body).toBe('Solid layout.'); // trimmed
        expect(res.body.review.author).toBe('rev_rater');
        expect(res.body.review.createdAt).toBeTruthy();
    });

    it('lists reviews publicly; myReview only for the signed-in caller', async () => {
        const anon = await request(app).get(`/api/gallery/${projectId}/reviews`);
        expect(anon.status).toBe(200);
        expect(anon.body.reviews.some(r => r.author === 'rev_rater')).toBe(true);
        expect(anon.body.myReview).toBeNull();

        const mine = await request(app).get(`/api/gallery/${projectId}/reviews`).set('Cookie', raterCookie);
        expect(mine.body.myReview.rating).toBe(4);
    });

    it('upserts: a second PUT by the same user edits, not duplicates', async () => {
        const res = await request(app).put(`/api/gallery/${projectId}/review`)
            .set('Cookie', raterCookie).send({ rating: 2, body: 'Changed my mind.' });
        expect(res.status).toBe(200);
        const list = await request(app).get(`/api/gallery/${projectId}/reviews`);
        const mine = list.body.reviews.filter(r => r.author === 'rev_rater');
        expect(mine.length).toBe(1);
        expect(mine[0].rating).toBe(2);
        expect(mine[0].body).toBe('Changed my mind.');
    });

    it('a second user gets their own independent review', async () => {
        await request(app).put(`/api/gallery/${projectId}/review`)
            .set('Cookie', rater2Cookie).send({ rating: 5 });
        const list = await request(app).get(`/api/gallery/${projectId}/reviews`);
        expect(list.body.reviews.length).toBe(2);
    });

    it('deletes only the caller’s own review; 404 when there is none', async () => {
        const del = await request(app).delete(`/api/gallery/${projectId}/review`).set('Cookie', rater2Cookie);
        expect(del.status).toBe(200);
        const again = await request(app).delete(`/api/gallery/${projectId}/review`).set('Cookie', rater2Cookie);
        expect(again.status).toBe(404);
        const list = await request(app).get(`/api/gallery/${projectId}/reviews`);
        expect(list.body.reviews.length).toBe(1); // rev_rater's survives
    });

    it('anonymous delete is rejected', async () => {
        const res = await request(app).delete(`/api/gallery/${projectId}/review`);
        expect(res.status).toBe(401);
    });

    it('reviews of a non-public project 404 (write and read)', async () => {
        const priv = await request(app).post('/api/projects').set('Cookie', ownerCookie)
            .send({ name: 'Private No Reviews', state: minimalState() });
        const put = await request(app).put(`/api/gallery/${priv.body.project.id}/review`)
            .set('Cookie', raterCookie).send({ rating: 3 });
        expect(put.status).toBe(404);
        const list = await request(app).get(`/api/gallery/${priv.body.project.id}/reviews`);
        expect(list.status).toBe(404);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/server/reviews.test.js`
Expected: Task 1's tests still PASS; every new test FAILS with 404s (routes don't exist).

- [ ] **Step 3: Implement the three routes**

In `server/routes/gallery.js`:

Extend the guards import and add the limiter import at the top:

```js
import { optionalAuth, requireAdmin, requireAuth, requireUsername } from '../middleware/guards.js';
import { userWriteLimiter } from '../middleware/limits.js';
```

Add below the existing `loadPublicProject` definition:

```js
const reviewDto = (r) => ({
    id: r.id, rating: r.rating, body: r.body || '', author: r.author,
    createdAt: r.created_at, updatedAt: r.updated_at
});

const reviewSelect = `
    SELECT r.id, r.rating, r.body, r.created_at, r.updated_at, u.username AS author
    FROM reviews r JOIN "user" u ON u.id = r.user_id
`;

router.get('/api/gallery/:id/reviews', optionalAuth, loadPublicProject, async (req, res) => {
    const rows = await query(
        `${reviewSelect} WHERE r.project_id = $1 ORDER BY r.updated_at DESC LIMIT 100`,
        [req.publicProject.id]);
    let myReview = null;
    if (req.user) {
        const mine = await query(
            `${reviewSelect} WHERE r.project_id = $1 AND r.user_id = $2`,
            [req.publicProject.id, req.user.id]);
        myReview = mine[0] ? reviewDto(mine[0]) : null;
    }
    res.json({ reviews: rows.map(reviewDto), myReview });
});

router.put('/api/gallery/:id/review', requireAuth, requireUsername, userWriteLimiter, loadPublicProject, async (req, res) => {
    const p = req.publicProject;
    if (p.owner_id === req.user.id) {
        return res.status(403).json({ error: "You can't review your own project" });
    }
    const rating = req.body?.rating;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'rating must be an integer from 1 to 5' });
    }
    const rawBody = req.body?.body ?? '';
    if (typeof rawBody !== 'string') return res.status(400).json({ error: 'body must be a string' });
    const body = rawBody.trim();
    if (body.length > 2000) return res.status(400).json({ error: 'review must be 2000 characters or fewer' });

    const now = new Date().toISOString();
    await query(
        `INSERT INTO reviews (id, project_id, user_id, rating, body, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (project_id, user_id)
         DO UPDATE SET rating = EXCLUDED.rating, body = EXCLUDED.body, updated_at = EXCLUDED.updated_at`,
        [randomUUID(), p.id, req.user.id, rating, body, now, now]);
    const rows = await query(
        `${reviewSelect} WHERE r.project_id = $1 AND r.user_id = $2`, [p.id, req.user.id]);
    res.json({ review: reviewDto(rows[0]) });
});

router.delete('/api/gallery/:id/review', requireAuth, loadPublicProject, async (req, res) => {
    const rows = await query(
        'SELECT id FROM reviews WHERE project_id = $1 AND user_id = $2',
        [req.publicProject.id, req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'No review to delete' });
    await query('DELETE FROM reviews WHERE id = $1', [rows[0].id]);
    res.json({ success: true });
});
```

(Note: `ON CONFLICT ... EXCLUDED` is supported by both Postgres and the bundled better-sqlite3, and keeps each `$n` used exactly once per the `query()` contract.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/server/reviews.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/gallery.js tests/unit/server/reviews.test.js
git commit -m "feat(gallery-v2): review list/upsert/delete endpoints"
```

---

### Task 3: Review reporting + admin moderation

**Files:**
- Modify: `server/routes/gallery.js`
- Test: Extend `tests/unit/server/reviews.test.js`

**Interfaces:**
- Consumes: `reports.review_id` (Task 1), review endpoints (Task 2), existing `requireAdmin` and `GET /api/admin/reports`.
- Produces:
  - `POST /api/gallery/:id/reviews/:reviewId/report` body `{ reason: string }` → `201 { success: true }`; `400` missing reason; `404` review not on that project.
  - `GET /api/admin/reports` rows now include `review_id`, `review_body`, `review_rating` (NULL for plain project reports).
  - `DELETE /api/admin/reviews/:id` (admin) → `200 { success: true }`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/server/reviews.test.js`:

```js
describe('review reporting and moderation', () => {
    let adminCookie, reviewId;
    beforeAll(async () => {
        const { query } = await import('../../../server/db.js');
        adminCookie = await signUpUser(app, { email: 'rev-admin@test.dev', username: 'rev_admin' });
        await query(`UPDATE "user" SET role = 'admin' WHERE email = $1`, ['rev-admin@test.dev']);
        const list = await request(app).get(`/api/gallery/${projectId}/reviews`);
        reviewId = list.body.reviews.find(r => r.author === 'rev_rater').id;
    });

    it('accepts an anonymous review report and requires a reason', async () => {
        const bad = await request(app).post(`/api/gallery/${projectId}/reviews/${reviewId}/report`).send({});
        expect(bad.status).toBe(400);
        const ok = await request(app).post(`/api/gallery/${projectId}/reviews/${reviewId}/report`)
            .send({ reason: 'abusive text' });
        expect(ok.status).toBe(201);
    });

    it('404s when the review does not belong to that project', async () => {
        const res = await request(app).post(`/api/gallery/${projectId}/reviews/not-a-real-review/report`)
            .send({ reason: 'x' });
        expect(res.status).toBe(404);
    });

    it('surfaces the review in the admin report listing', async () => {
        const res = await request(app).get('/api/admin/reports').set('Cookie', adminCookie);
        expect(res.status).toBe(200);
        const rep = res.body.reports.find(r => r.review_id === reviewId);
        expect(rep).toBeTruthy();
        expect(rep.review_rating).toBe(2);
        expect(rep.review_body).toBe('Changed my mind.');
    });

    it('lets an admin delete a review; non-admins cannot', async () => {
        const forbidden = await request(app).delete(`/api/admin/reviews/${reviewId}`).set('Cookie', raterCookie);
        expect(forbidden.status).toBe(403);
        const res = await request(app).delete(`/api/admin/reviews/${reviewId}`).set('Cookie', adminCookie);
        expect(res.status).toBe(200);
        const list = await request(app).get(`/api/gallery/${projectId}/reviews`);
        expect(list.body.reviews.find(r => r.id === reviewId)).toBeUndefined();
    });
});
```

Also add `beforeAll` to the vitest import at the top of the file if not already there: `import { describe, it, expect, beforeAll } from 'vitest';` (already present from Task 1).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/server/reviews.test.js`
Expected: new describe FAILS (404 route, missing columns in admin listing); earlier tests PASS.

- [ ] **Step 3: Implement**

In `server/routes/gallery.js`:

Add after the review routes from Task 2:

```js
router.post('/api/gallery/:id/reviews/:reviewId/report', optionalAuth, loadPublicProject, async (req, res) => {
    const reason = String(req.body?.reason ?? '').trim().slice(0, 500);
    if (!reason) return res.status(400).json({ error: 'reason is required' });
    const rows = await query(
        'SELECT id FROM reviews WHERE id = $1 AND project_id = $2',
        [req.params.reviewId, req.publicProject.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Review not found' });
    await query(
        'INSERT INTO reports (id, project_id, reporter_user_id, reason, review_id) VALUES ($1, $2, $3, $4, $5)',
        [randomUUID(), req.publicProject.id, req.user?.id ?? null, reason, rows[0].id]);
    res.status(201).json({ success: true });
});
```

Replace the existing `GET /api/admin/reports` query with (LEFT JOIN keeps plain project reports intact — their `review_*` fields come back NULL):

```js
    const rows = await query(
        `SELECT r.*, p.name AS project_name, rv.body AS review_body, rv.rating AS review_rating
         FROM reports r
         LEFT JOIN projects p ON p.id = r.project_id
         LEFT JOIN reviews rv ON rv.id = r.review_id
         ORDER BY r.created_at DESC LIMIT 200`, []);
```

Add next to the existing admin unpublish route:

```js
router.delete('/api/admin/reviews/:id', requireAdmin, async (req, res) => {
    await query('DELETE FROM reviews WHERE id = $1', [req.params.id]);
    res.json({ success: true });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/server/reviews.test.js`
Expected: PASS. Also run `npx vitest run tests/unit/server/gallery.test.js` (admin listing change must not break it).

- [ ] **Step 5: Commit**

```bash
git add server/routes/gallery.js tests/unit/server/reviews.test.js
git commit -m "feat(gallery-v2): review reporting + admin review moderation"
```

---

### Task 4: Rating aggregates + `sort=rating` (gallery list, detail, profile)

**Files:**
- Modify: `server/routes/gallery.js`
- Modify: `server/routes/me.js`
- Test: Create `tests/unit/server/galleryRatings.test.js`

**Interfaces:**
- Consumes: `reviews` table and review PUT endpoint (Tasks 1–2).
- Produces (client Task 6 relies on these):
  - Gallery card DTO and detail DTO gain `ratingAvg: number | null` (1-decimal) and `ratingCount: number`.
  - `GET /api/gallery?sort=rating` orders by average DESC with unrated projects last, ties broken by `rating_count` DESC then `updated_at` DESC.
  - `GET /api/users/:username` project cards gain the same two fields.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/server/galleryRatings.test.js`:

```js
// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, PNG_1X1 } from './helpers.js';

// Unique q-prefix isolates this file's projects from the shared worker DB.
const PREFIX = 'ratingsort';

let app, ownerCookie, ids = {};
beforeAll(async () => {
    app = await initTestApp();
    ownerCookie = await signUpUser(app, { email: 'rs-owner@test.dev', username: 'rs_owner' });
    const raterA = await signUpUser(app, { email: 'rs-a@test.dev', username: 'rs_rater_a' });
    const raterB = await signUpUser(app, { email: 'rs-b@test.dev', username: 'rs_rater_b' });

    for (const suffix of ['high', 'low', 'none']) {
        const p = await request(app).post('/api/projects').set('Cookie', ownerCookie)
            .send({ name: `${PREFIX} ${suffix}`, state: minimalState() });
        ids[suffix] = p.body.project.id;
        await request(app).post(`/api/projects/${ids[suffix]}/publish`).set('Cookie', ownerCookie)
            .send({ description: 'd', tags: [], thumbnails: [PNG_1X1] });
    }
    // high: avg 4.5 (4 + 5), low: avg 2.0
    await request(app).put(`/api/gallery/${ids.high}/review`).set('Cookie', raterA).send({ rating: 4 });
    await request(app).put(`/api/gallery/${ids.high}/review`).set('Cookie', raterB).send({ rating: 5 });
    await request(app).put(`/api/gallery/${ids.low}/review`).set('Cookie', raterA).send({ rating: 2 });
});

describe('rating aggregates', () => {
    it('exposes ratingAvg / ratingCount on gallery cards', async () => {
        const res = await request(app).get(`/api/gallery?q=${PREFIX}`);
        const high = res.body.items.find(i => i.id === ids.high);
        const none = res.body.items.find(i => i.id === ids.none);
        expect(high.ratingAvg).toBe(4.5);
        expect(high.ratingCount).toBe(2);
        expect(none.ratingAvg).toBeNull();
        expect(none.ratingCount).toBe(0);
    });

    it('exposes them on the detail endpoint', async () => {
        const res = await request(app).get(`/api/gallery/${ids.high}`);
        expect(res.body.project.ratingAvg).toBe(4.5);
        expect(res.body.project.ratingCount).toBe(2);
    });

    it('sort=rating orders by average desc with unrated projects last', async () => {
        const res = await request(app).get(`/api/gallery?q=${PREFIX}&sort=rating`);
        const order = res.body.items.map(i => i.id);
        expect(order).toEqual([ids.high, ids.low, ids.none]);
    });

    it('rounds ratingAvg to one decimal', async () => {
        // 4 + 5 + 2 pattern on a fresh project: avg 3.666... -> 3.7
        const raterC = await signUpUser(app, { email: 'rs-c@test.dev', username: 'rs_rater_c' });
        await request(app).put(`/api/gallery/${ids.low}/review`).set('Cookie', raterC).send({ rating: 5 });
        // low is now (2 + 5) / 2 = 3.5 — exact; also verify a repeating decimal:
        const raterD = await signUpUser(app, { email: 'rs-d@test.dev', username: 'rs_rater_d' });
        await request(app).put(`/api/gallery/${ids.low}/review`).set('Cookie', raterD).send({ rating: 4 });
        // (2 + 5 + 4) / 3 = 3.666... -> 3.7
        const res = await request(app).get(`/api/gallery/${ids.low}`);
        expect(res.body.project.ratingAvg).toBe(3.7);
        expect(res.body.project.ratingCount).toBe(3);
    });

    it('profile project cards include the rating fields', async () => {
        const res = await request(app).get('/api/users/rs_owner');
        const high = res.body.projects.find(p => p.id === ids.high);
        expect(high.ratingAvg).toBe(4.5);
        expect(high.ratingCount).toBe(2);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/server/galleryRatings.test.js`
Expected: FAIL — `ratingAvg` is `undefined` everywhere; `sort=rating` falls through to recent ordering.

- [ ] **Step 3: Implement**

In `server/routes/gallery.js`:

Add a shared helper and extend `cardFields`/`cardDto`:

```js
const ratingFields = `
    (SELECT AVG(rv.rating) FROM reviews rv WHERE rv.project_id = p.id) AS rating_avg,
    (SELECT COUNT(*) FROM reviews rv WHERE rv.project_id = p.id) AS rating_count
`;

// Postgres returns AVG/COUNT as strings — Number() before math.
const ratingDtoFields = (r) => ({
    ratingAvg: r.rating_avg == null ? null : Math.round(Number(r.rating_avg) * 10) / 10,
    ratingCount: Number(r.rating_count ?? 0),
});
```

`cardFields` becomes:

```js
const cardFields = `
    p.id, p.name, p.description, p.tags, p.fork_count, p.download_count, p.updated_at,
    u.username AS author,
    (SELECT t.id FROM thumbnails t WHERE t.project_id = p.id ORDER BY t.position LIMIT 1) AS thumbnail_id,
    ${ratingFields}
`;
```

`cardDto` becomes:

```js
const cardDto = (r) => ({
    id: r.id, name: r.name, description: r.description, tags: JSON.parse(r.tags || '[]'),
    author: r.author, forkCount: r.fork_count, downloadCount: r.download_count,
    updatedAt: r.updated_at, thumbnailId: r.thumbnail_id,
    ...ratingDtoFields(r)
});
```

The `sort` ternary in `GET /api/gallery` gains a branch (`NULLS LAST` is valid on Postgres and on the SQLite bundled with better-sqlite3 — the ordering test in Step 1 proves it on the test engine):

```js
    const sort = req.query.sort === 'popular'
        ? 'ORDER BY (p.fork_count + p.download_count) DESC, p.updated_at DESC'
        : req.query.sort === 'rating'
            ? 'ORDER BY rating_avg DESC NULLS LAST, rating_count DESC, p.updated_at DESC'
            : 'ORDER BY p.updated_at DESC';
```

In `GET /api/gallery/:id`, add one aggregate query and spread it into the response:

```js
    const agg = await query(
        'SELECT AVG(rating) AS rating_avg, COUNT(*) AS rating_count FROM reviews WHERE project_id = $1',
        [p.id]);
```

and inside the `project: { ... }` object add:

```js
            ...ratingDtoFields(agg[0]),
```

In `server/routes/me.js`, `GET /api/users/:username`: add the same two subqueries to the SELECT —

```js
        `SELECT p.id, p.name, p.description, p.tags, p.fork_count, p.download_count, p.updated_at,
                (SELECT t.id FROM thumbnails t WHERE t.project_id = p.id ORDER BY t.position LIMIT 1) AS thumbnail_id,
                (SELECT AVG(rv.rating) FROM reviews rv WHERE rv.project_id = p.id) AS rating_avg,
                (SELECT COUNT(*) FROM reviews rv WHERE rv.project_id = p.id) AS rating_count
         FROM projects p WHERE p.owner_id = $1 AND p.visibility = 'public' ORDER BY p.updated_at DESC LIMIT 100`,
```

— and to the projects mapper add:

```js
            ratingAvg: r.rating_avg == null ? null : Math.round(Number(r.rating_avg) * 10) / 10,
            ratingCount: Number(r.rating_count ?? 0),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/server/galleryRatings.test.js tests/unit/server/gallery.test.js tests/unit/server/users.test.js`
Expected: all PASS (existing tests unaffected — new DTO fields are additive).

- [ ] **Step 5: Commit**

```bash
git add server/routes/gallery.js server/routes/me.js tests/unit/server/galleryRatings.test.js
git commit -m "feat(gallery-v2): rating aggregates + rating sort on gallery, detail, profile"
```

---

### Task 5: Tag filtering, tag-aware search, `limit` param, `GET /api/gallery/tags`

**Files:**
- Modify: `server/routes/gallery.js`
- Test: Create `tests/unit/server/galleryFilters.test.js`

**Interfaces:**
- Consumes: `GET /api/gallery` from Task 4.
- Produces (client Task 6 relies on these):
  - `GET /api/gallery?tag=<t>` — exact tag match (no substring false positives).
  - `q` also matches tag text.
  - `limit=<n>` — page size capped at `PAGE_SIZE` (24), floor 1; `hasMore`/`page` semantics preserved relative to the effective limit.
  - `GET /api/gallery/tags` → `200 { tags: [{ tag: string, count: number }] }`, count-desc then alphabetical, max 30. **Registered before `/api/gallery/:id`.**

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/server/galleryFilters.test.js`:

```js
// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, PNG_1X1 } from './helpers.js';

// Unique tag values isolate this file from the shared worker DB.
let app, ownerCookie, ids = {};
beforeAll(async () => {
    app = await initTestApp();
    ownerCookie = await signUpUser(app, { email: 'gf-owner@test.dev', username: 'gf_owner' });
    const make = async (name, tags) => {
        const p = await request(app).post('/api/projects').set('Cookie', ownerCookie)
            .send({ name, state: minimalState() });
        await request(app).post(`/api/projects/${p.body.project.id}/publish`).set('Cookie', ownerCookie)
            .send({ description: 'd', tags, thumbnails: [PNG_1X1] });
        return p.body.project.id;
    };
    ids.a = await make('gfilters alpha', ['gf-plan', 'gf-weekly']);
    ids.b = await make('gfilters beta', ['gf-planner']);
    ids.c = await make('gfilters gamma', ['gf-plan']);
});

describe('tag filtering', () => {
    it('filters by exact tag', async () => {
        const res = await request(app).get('/api/gallery?tag=gf-plan');
        const found = res.body.items.map(i => i.id);
        expect(found).toContain(ids.a);
        expect(found).toContain(ids.c);
        expect(found).not.toContain(ids.b); // 'gf-plan' must NOT match 'gf-planner'
    });

    it('combines tag with q', async () => {
        const res = await request(app).get('/api/gallery?tag=gf-plan&q=alpha');
        expect(res.body.items.map(i => i.id)).toEqual([ids.a]);
    });

    it('q matches tag text too', async () => {
        const res = await request(app).get('/api/gallery?q=gf-weekly');
        expect(res.body.items.map(i => i.id)).toContain(ids.a);
    });
});

describe('limit param', () => {
    it('caps the page size and reports hasMore against it', async () => {
        const res = await request(app).get('/api/gallery?q=gfilters&limit=2');
        expect(res.body.items.length).toBe(2);
        expect(res.body.hasMore).toBe(true);
        const page2 = await request(app).get('/api/gallery?q=gfilters&limit=2&page=1');
        expect(page2.body.items.length).toBe(1);
        expect(page2.body.hasMore).toBe(false);
    });

    it('clamps nonsense values', async () => {
        const res = await request(app).get('/api/gallery?q=gfilters&limit=9999');
        expect(res.status).toBe(200); // falls back to PAGE_SIZE cap, no error
        const zero = await request(app).get('/api/gallery?q=gfilters&limit=0');
        expect(zero.body.items.length).toBeGreaterThan(0); // floor of 1 / default applies
    });
});

describe('GET /api/gallery/tags', () => {
    it('returns public tag counts', async () => {
        const res = await request(app).get('/api/gallery/tags');
        expect(res.status).toBe(200);
        const plan = res.body.tags.find(t => t.tag === 'gf-plan');
        const planner = res.body.tags.find(t => t.tag === 'gf-planner');
        expect(plan.count).toBe(2);
        expect(planner.count).toBe(1);
    });

    it('does not fall through to the :id detail route', async () => {
        const res = await request(app).get('/api/gallery/tags');
        expect(res.body.tags).toBeDefined(); // not { error: 'Project not found' }
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/server/galleryFilters.test.js`
Expected: FAIL — `tag` is ignored (extra items returned), `limit` is ignored, `/api/gallery/tags` 404s ("Project not found" — proving the route-order hazard).

- [ ] **Step 3: Implement**

In `server/routes/gallery.js`, replace the body of `GET /api/gallery` with:

```js
router.get('/api/gallery', async (req, res) => {
    const q = String(req.query.q ?? '').toLowerCase().slice(0, 100);
    const tag = String(req.query.tag ?? '').slice(0, 30);
    const sort = req.query.sort === 'popular'
        ? 'ORDER BY (p.fork_count + p.download_count) DESC, p.updated_at DESC'
        : req.query.sort === 'rating'
            ? 'ORDER BY rating_avg DESC NULLS LAST, rating_count DESC, p.updated_at DESC'
            : 'ORDER BY p.updated_at DESC';
    const page = Math.max(0, parseInt(req.query.page ?? '0', 10) || 0);
    const limit = Math.min(PAGE_SIZE, Math.max(1, parseInt(req.query.limit ?? '0', 10) || PAGE_SIZE));

    const params = [`%${q}%`, `%${q}%`, `%${q}%`];
    let where = `p.visibility = 'public'
           AND (LOWER(p.name) LIKE $1 OR LOWER(p.description) LIKE $2 OR LOWER(p.tags) LIKE $3)`;
    if (tag) {
        // Tags are stored as a JSON array string; matching the JSON-quoted encoding of the
        // tag ("tag", incl. escaping) makes this an exact-element match — 'plan' cannot
        // match 'planner' because the closing quote must follow.
        params.push(`%${JSON.stringify(tag)}%`);
        where += ` AND p.tags LIKE $${params.length}`;
    }
    const rows = await query(
        `SELECT ${cardFields}
         FROM projects p JOIN "user" u ON u.id = p.owner_id
         WHERE ${where}
         ${sort}
         LIMIT ${limit + 1} OFFSET ${page * limit}`,
        params
    );
    res.json({ items: rows.slice(0, limit).map(cardDto), page, hasMore: rows.length > limit });
});
```

Add the tags endpoint **above** `router.get('/api/gallery/:id', ...)` (route order matters — `:id` would otherwise capture `tags`):

```js
router.get('/api/gallery/tags', async (req, res) => {
    const rows = await query(`SELECT tags FROM projects WHERE visibility = 'public'`, []);
    const counts = new Map();
    for (const r of rows) {
        for (const t of JSON.parse(r.tags || '[]')) {
            counts.set(t, (counts.get(t) || 0) + 1);
        }
    }
    const tags = [...counts.entries()]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
        .slice(0, 30);
    res.json({ tags });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/server/galleryFilters.test.js tests/unit/server/gallery.test.js tests/unit/server/galleryRatings.test.js`
Expected: all PASS.

- [ ] **Step 5: Full server suite + commit**

Run: `npx vitest run tests/unit/server`
Expected: all green.

```bash
git add server/routes/gallery.js tests/unit/server/galleryFilters.test.js
git commit -m "feat(gallery-v2): tag filter, tag-aware search, limit param, tags endpoint"
```

---

### Task 6: Client API — types and methods in `cloudApi.ts`

**Files:**
- Modify: `services/cloudApi.ts`
- Modify: `tests/unit/GalleryDetailPage.test.tsx`, `tests/unit/GalleryDetailModal.test.tsx`, `tests/unit/galleryModalRouting.test.tsx` (fixture objects gain the two new required fields)
- Test: Extend `tests/unit/cloudApi.test.ts`

**Interfaces:**
- Consumes: server endpoints from Tasks 2–5.
- Produces (every later client task imports these):

```ts
export interface GalleryItem {
    id: string; name: string; description: string; tags: string[]; author: string;
    forkCount: number; downloadCount: number; updatedAt: string; thumbnailId: string | null;
    ratingAvg: number | null; ratingCount: number;
}
export interface ReviewDto { id: string; rating: number; body: string; author: string; createdAt: string; updatedAt: string; }
export interface GalleryTag { tag: string; count: number; }

// cloudApi additions / changes:
gallery(params: { q?: string; sort?: 'recent' | 'popular' | 'rating'; page?: number; tag?: string; limit?: number })
galleryTags(): Promise<GalleryTag[]>
listReviews(projectId: string): Promise<{ reviews: ReviewDto[]; myReview: ReviewDto | null }>
putReview(projectId: string, args: { rating: number; body?: string }): Promise<{ review: ReviewDto }>
deleteReview(projectId: string): Promise<{ success: boolean }>
reportReview(projectId: string, reviewId: string, reason: string): Promise<{ success: boolean }>
```

- [ ] **Step 1: Write the failing tests**

Append a self-contained describe block to `tests/unit/cloudApi.test.ts` (it stubs `fetch` itself, so it works regardless of the file's other helpers):

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cloudApi } from '../../services/cloudApi';

describe('gallery v2 api methods', () => {
    const okJson = (body: unknown) =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
    afterEach(() => vi.unstubAllGlobals());

    it('gallery() serializes tag, limit and rating sort', async () => {
        const fetchMock = vi.fn().mockReturnValue(okJson({ items: [], page: 0, hasMore: false }));
        vi.stubGlobal('fetch', fetchMock);
        await cloudApi.gallery({ q: 'x', sort: 'rating', tag: 'planner', limit: 8, page: 2 });
        const url = fetchMock.mock.calls[0][0] as string;
        expect(url).toContain('/api/gallery?');
        expect(url).toContain('q=x');
        expect(url).toContain('sort=rating');
        expect(url).toContain('tag=planner');
        expect(url).toContain('limit=8');
        expect(url).toContain('page=2');
    });

    it('galleryTags() unwraps the tags array', async () => {
        vi.stubGlobal('fetch', vi.fn().mockReturnValue(okJson({ tags: [{ tag: 'planner', count: 3 }] })));
        const tags = await cloudApi.galleryTags();
        expect(tags).toEqual([{ tag: 'planner', count: 3 }]);
    });

    it('listReviews() returns reviews and myReview', async () => {
        vi.stubGlobal('fetch', vi.fn().mockReturnValue(okJson({ reviews: [], myReview: null })));
        const res = await cloudApi.listReviews('p1');
        expect(res).toEqual({ reviews: [], myReview: null });
    });

    it('putReview() PUTs to the review endpoint', async () => {
        const fetchMock = vi.fn().mockReturnValue(okJson({ review: { id: 'r1' } }));
        vi.stubGlobal('fetch', fetchMock);
        await cloudApi.putReview('p1', { rating: 4, body: 'good' });
        const [url, opts] = fetchMock.mock.calls[0];
        expect(url).toContain('/api/gallery/p1/review');
        expect(opts.method).toBe('PUT');
        expect(JSON.parse(opts.body)).toEqual({ rating: 4, body: 'good' });
    });

    it('deleteReview() DELETEs; reportReview() POSTs to the nested route', async () => {
        const fetchMock = vi.fn().mockReturnValue(okJson({ success: true }));
        vi.stubGlobal('fetch', fetchMock);
        await cloudApi.deleteReview('p1');
        expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
        await cloudApi.reportReview('p1', 'r9', 'spam');
        const [url, opts] = fetchMock.mock.calls[1];
        expect(url).toContain('/api/gallery/p1/reviews/r9/report');
        expect(JSON.parse(opts.body)).toEqual({ reason: 'spam' });
    });
});
```

(If the top of `tests/unit/cloudApi.test.ts` already imports these names from `'vitest'`, merge rather than duplicate the import line.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/cloudApi.test.ts`
Expected: FAIL — `galleryTags` etc. are not functions; the `gallery()` URL lacks `tag`/`limit`.

- [ ] **Step 3: Implement**

In `services/cloudApi.ts`:

`GalleryItem` gains the two fields (exact interface in the Interfaces block above). Add the two new interfaces next to it:

```ts
export interface ReviewDto { id: string; rating: number; body: string; author: string; createdAt: string; updatedAt: string; }
export interface GalleryTag { tag: string; count: number; }
```

Replace the `gallery` method and add the new methods inside the `cloudApi` object (after `report`):

```ts
    gallery: (params: { q?: string; sort?: 'recent' | 'popular' | 'rating'; page?: number; tag?: string; limit?: number } = {}) => {
        const qs = new URLSearchParams();
        if (params.q) qs.set('q', params.q);
        if (params.sort) qs.set('sort', params.sort);
        if (params.page) qs.set('page', String(params.page));
        if (params.tag) qs.set('tag', params.tag);
        if (params.limit) qs.set('limit', String(params.limit));
        return api<{ items: GalleryItem[]; page: number; hasMore: boolean }>(`/api/gallery?${qs}`);
    },
    galleryTags: async () =>
        (await api<{ tags: GalleryTag[] }>('/api/gallery/tags')).tags,
    listReviews: (projectId: string) =>
        api<{ reviews: ReviewDto[]; myReview: ReviewDto | null }>(`/api/gallery/${projectId}/reviews`),
    putReview: (projectId: string, args: { rating: number; body?: string }) =>
        api<{ review: ReviewDto }>(`/api/gallery/${projectId}/review`, { method: 'PUT', body: JSON.stringify(args) }),
    deleteReview: (projectId: string) =>
        api<{ success: boolean }>(`/api/gallery/${projectId}/review`, { method: 'DELETE' }),
    reportReview: (projectId: string, reviewId: string, reason: string) =>
        api<{ success: boolean }>(`/api/gallery/${projectId}/reviews/${reviewId}/report`, { method: 'POST', body: JSON.stringify({ reason }) }),
```

- [ ] **Step 4: Fix type-check fallout in existing test fixtures**

`GalleryDetail` fixtures in `tests/unit/GalleryDetailPage.test.tsx`, `tests/unit/GalleryDetailModal.test.tsx`, and `tests/unit/galleryModalRouting.test.tsx` construct typed `GalleryDetail` objects — add `ratingAvg: null, ratingCount: 0,` to each fixture object. Then:

Run: `npx tsc --noEmit`
Expected: clean. (If other files construct `GalleryItem`/`GalleryDetail` literals, tsc will list them — add the same two fields there too.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/cloudApi.test.ts tests/unit/GalleryDetailPage.test.tsx tests/unit/GalleryDetailModal.test.tsx tests/unit/galleryModalRouting.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/cloudApi.ts tests/unit/cloudApi.test.ts tests/unit/GalleryDetailPage.test.tsx tests/unit/GalleryDetailModal.test.tsx tests/unit/galleryModalRouting.test.tsx
git commit -m "feat(gallery-v2): client api types + methods for reviews, tags, rating sort"
```

---

### Task 7: `StarRating` display + input components

**Files:**
- Create: `components/gallery/StarRating.tsx`
- Test: Create `tests/unit/StarRating.test.tsx`

**Interfaces:**
- Consumes: `Star` icon from `lucide-react` only.
- Produces:

```tsx
export function StarRating(props: { value: number | null; count?: number; size?: number }): JSX.Element
// value null -> renders the muted text "No ratings yet"
// value 4.3  -> fractional amber fill, text "4.3", plus " (7)" when count provided

export function StarRatingInput(props: { value: number; onChange: (v: number) => void; size?: number }): JSX.Element
// 5 radio-semantics buttons, aria-label "N star(s)", hover preview, click -> onChange(N)
```

- [ ] **Step 1: Write the failing test**

Create `tests/unit/StarRating.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StarRating, StarRatingInput } from '../../components/gallery/StarRating';

describe('StarRating (display)', () => {
    it('shows the value to one decimal with the count', () => {
        render(<StarRating value={4.25} count={7} />);
        expect(screen.getByText(/4\.3/)).toBeInTheDocument();
        expect(screen.getByText(/\(7\)/)).toBeInTheDocument();
        expect(screen.getByLabelText(/rated 4\.25? out of 5/i)).toBeInTheDocument();
    });

    it('renders a fractional fill width', () => {
        const { container } = render(<StarRating value={2.5} />);
        const fill = container.querySelector('[data-testid="star-fill"]') as HTMLElement;
        expect(fill.style.width).toBe('50%');
    });

    it('renders "No ratings yet" for null', () => {
        render(<StarRating value={null} />);
        expect(screen.getByText('No ratings yet')).toBeInTheDocument();
    });
});

describe('StarRatingInput', () => {
    it('renders 5 radios and reports clicks', () => {
        const onChange = vi.fn();
        render(<StarRatingInput value={2} onChange={onChange} />);
        const radios = screen.getAllByRole('radio');
        expect(radios).toHaveLength(5);
        expect(radios[1]).toHaveAttribute('aria-checked', 'true');
        fireEvent.click(screen.getByLabelText('4 stars'));
        expect(onChange).toHaveBeenCalledWith(4);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/StarRating.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `components/gallery/StarRating.tsx`:

```tsx
import React, { useState } from 'react';
import { Star } from 'lucide-react';

const Stars = ({ size }: { size: number }) => (
    <>
        {[0, 1, 2, 3, 4].map(i => (
            <Star key={i} size={size} fill="currentColor" strokeWidth={0} className="shrink-0" />
        ))}
    </>
);

export function StarRating({ value, count, size = 14 }: { value: number | null; count?: number; size?: number }) {
    if (value == null) return <span className="text-xs text-slate-400">No ratings yet</span>;
    return (
        <span className="inline-flex items-center gap-1" aria-label={`Rated ${value} out of 5`}>
            <span className="relative inline-block leading-none">
                <span className="flex text-slate-300"><Stars size={size} /></span>
                <span data-testid="star-fill"
                    className="absolute inset-y-0 left-0 flex overflow-hidden text-amber-400"
                    style={{ width: `${(Math.max(0, Math.min(5, value)) / 5) * 100}%` }}>
                    <Stars size={size} />
                </span>
            </span>
            <span className="text-xs text-slate-500">
                {value.toFixed(1)}{count !== undefined ? ` (${count})` : ''}
            </span>
        </span>
    );
}

export function StarRatingInput({ value, onChange, size = 20 }: { value: number; onChange: (v: number) => void; size?: number }) {
    const [hover, setHover] = useState(0);
    const shown = hover || value;
    return (
        <div role="radiogroup" aria-label="Rating" className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map(n => (
                <button key={n} type="button" role="radio" aria-checked={value === n}
                    aria-label={`${n} star${n > 1 ? 's' : ''}`}
                    onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
                    onClick={() => onChange(n)}
                    className={`transition-colors ${n <= shown ? 'text-amber-400' : 'text-slate-300 hover:text-amber-300'}`}>
                    <Star size={size} fill="currentColor" strokeWidth={0} />
                </button>
            ))}
        </div>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/StarRating.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/gallery/StarRating.tsx tests/unit/StarRating.test.tsx
git commit -m "feat(gallery-v2): StarRating display + input components"
```

---

### Task 8: `ProjectCard` shared card + `ProfilePage` adoption

**Files:**
- Create: `components/gallery/ProjectCard.tsx`
- Modify: `pages/ProfilePage.tsx`
- Test: Create `tests/unit/ProjectCard.test.tsx`

**Interfaces:**
- Consumes: `GalleryItem`, `API_BASE` (`services/cloudApi`, Task 6 shape), `GalleryLink` (existing — `{ projectId, className, children }`), `StarRating` (Task 7), `useNavigate` from react-router.
- Produces:

```tsx
export function ProjectCard(props: { item: GalleryItem; showAuthor?: boolean }): JSX.Element
// Renders inside a GalleryLink (modal-overlay behavior preserved).
// Tag chip click navigates to /gallery?tag=<t> WITHOUT following the card link.
// Rating row hidden when ratingCount === 0. showAuthor=false hides the author line (profile page).
```

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ProjectCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ProjectCard } from '../../components/gallery/ProjectCard';
import { GalleryItem } from '../../services/cloudApi';

const item: GalleryItem = {
    id: 'p1', name: 'Weekly Planner', description: 'A tidy weekly spread for busy people',
    tags: ['planner', 'weekly', 'minimal', 'extra'], author: 'maker',
    forkCount: 2, downloadCount: 9, updatedAt: '2026-01-01', thumbnailId: null,
    ratingAvg: 4.5, ratingCount: 3,
};

function LocationProbe() {
    const loc = useLocation();
    return <div data-testid="loc">{loc.pathname + loc.search}</div>;
}

const renderCard = (it: GalleryItem = item) => render(
    <MemoryRouter initialEntries={['/gallery']}>
        <Routes>
            <Route path="/gallery" element={<><ProjectCard item={it} /><LocationProbe /></>} />
            <Route path="/gallery/:id" element={<div>DETAIL_MARKER</div>} />
        </Routes>
    </MemoryRouter>
);

describe('ProjectCard', () => {
    it('renders name, author, description, rating and counts', () => {
        renderCard();
        expect(screen.getByText('Weekly Planner')).toBeInTheDocument();
        expect(screen.getByText('by maker')).toBeInTheDocument();
        expect(screen.getByText(/4\.5/)).toBeInTheDocument();
        expect(screen.getByText(/\(3\)/)).toBeInTheDocument();
    });

    it('caps tag chips at 3', () => {
        renderCard();
        expect(screen.getByRole('button', { name: 'planner' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'extra' })).toBeNull();
    });

    it('hides the rating when there are no reviews', () => {
        renderCard({ ...item, ratingAvg: null, ratingCount: 0 });
        expect(screen.queryByText('No ratings yet')).toBeNull();
        expect(screen.queryByLabelText(/rated/i)).toBeNull();
    });

    it('tag chip navigates to the tag filter instead of the project', () => {
        renderCard();
        fireEvent.click(screen.getByRole('button', { name: 'weekly' }));
        expect(screen.getByTestId('loc')).toHaveTextContent('/gallery?tag=weekly');
        expect(screen.queryByText('DETAIL_MARKER')).toBeNull();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/ProjectCard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `components/gallery/ProjectCard.tsx`:

```tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Square, GitFork, Download } from 'lucide-react';
import { GalleryItem, API_BASE } from '../../services/cloudApi';
import { GalleryLink } from './GalleryLink';
import { StarRating } from './StarRating';

export function ProjectCard({ item, showAuthor = true }: { item: GalleryItem; showAuthor?: boolean }) {
    const navigate = useNavigate();
    return (
        <GalleryLink projectId={item.id}
            className="group flex flex-col bg-white border rounded-xl overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-150">
            <div className="aspect-[3/4] bg-slate-100 flex items-center justify-center overflow-hidden">
                {item.thumbnailId
                    ? <img src={`${API_BASE}/api/thumbnails/${item.thumbnailId}`} alt={item.name} loading="lazy"
                        className="w-full h-full object-contain group-hover:scale-[1.03] transition-transform duration-200" />
                    : <Square size={32} className="text-slate-300" />}
            </div>
            <div className="p-3 flex flex-col gap-1 flex-1">
                <div className="text-sm font-semibold text-slate-800 truncate">{item.name}</div>
                {showAuthor && <div className="text-xs text-slate-500">by {item.author}</div>}
                {item.description && <div className="text-xs text-slate-500 line-clamp-2">{item.description}</div>}
                {item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                        {item.tags.slice(0, 3).map(t => (
                            <button key={t} type="button"
                                onClick={e => {
                                    // Filter by tag instead of following the surrounding card link.
                                    e.preventDefault();
                                    e.stopPropagation();
                                    navigate(`/gallery?tag=${encodeURIComponent(t)}`);
                                }}
                                className="text-[10px] bg-slate-100 text-slate-600 rounded-full px-2 py-0.5 hover:bg-blue-100 hover:text-blue-700 transition-colors">
                                {t}
                            </button>
                        ))}
                    </div>
                )}
                <div className="flex items-center justify-between mt-auto pt-1">
                    {item.ratingCount > 0 ? <StarRating value={item.ratingAvg} count={item.ratingCount} size={12} /> : <span />}
                    <span className="flex gap-3 text-[10px] text-slate-400">
                        <span className="flex items-center gap-0.5"><GitFork size={10} /> {item.forkCount}</span>
                        <span className="flex items-center gap-0.5"><Download size={10} /> {item.downloadCount}</span>
                    </span>
                </div>
            </div>
        </GalleryLink>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/ProjectCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Adopt in `ProfilePage`**

In `pages/ProfilePage.tsx`: replace the inline `<GalleryLink ...>...</GalleryLink>` card block inside `data.projects.map(...)` with:

```tsx
                    {data.projects.map(item => (
                        <ProjectCard key={item.id} item={item} showAuthor={false} />
                    ))}
```

Update imports: add `import { ProjectCard } from '../components/gallery/ProjectCard';` and remove the now-unused `GalleryLink`, `Square`, `GitFork`, `Download`, and `API_BASE` imports (keep `User` and `ArrowLeft`).

- [ ] **Step 6: Verify types and suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean, all green.

- [ ] **Step 7: Commit**

```bash
git add components/gallery/ProjectCard.tsx pages/ProfilePage.tsx tests/unit/ProjectCard.test.tsx
git commit -m "feat(gallery-v2): shared ProjectCard + ProfilePage adoption"
```

---

### Task 9: Reviews UI on the detail page (hook + `ReviewsSection` + wiring)

**Files:**
- Modify: `hooks/useGalleryDetail.ts`
- Create: `components/gallery/ReviewsSection.tsx`
- Modify: `components/gallery/GalleryDetailBody.tsx`
- Test: Extend `tests/unit/GalleryDetailPage.test.tsx`

**Interfaces:**
- Consumes: `cloudApi.listReviews/putReview/deleteReview/reportReview`, `ReviewDto` (Task 6); `StarRating`/`StarRatingInput` (Task 7); existing `useGalleryDetail` fields (`project`, `isOwner`, `session`, `fromPath`).
- Produces — `UseGalleryDetailResult` gains:

```ts
reviews: ReviewDto[];
myReview: ReviewDto | null;
saveReview: (args: { rating: number; body: string }) => Promise<void>;   // throws ApiError on failure
deleteMyReview: () => Promise<void>;
reportReview: (reviewId: string) => Promise<void>;                        // prompt/alert flow, never throws
```

and `ReviewsSection` renders from those (no fetching of its own):

```tsx
export function ReviewsSection(props: {
    isOwner: boolean;
    session: UseGalleryDetailResult['session'];
    fromPath: string;
    ratingAvg: number | null;
    ratingCount: number;
    reviews: ReviewDto[];
    myReview: ReviewDto | null;
    onSave: (args: { rating: number; body: string }) => Promise<void>;
    onDelete: () => Promise<void>;
    onReport: (reviewId: string) => void;
}): JSX.Element
```

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/GalleryDetailPage.test.tsx` (the file's existing `detail` fixture and `renderAt` helper are reused; `detail` already has `ratingAvg: null, ratingCount: 0` from Task 6 — this describe overrides per test):

```tsx
describe('GalleryDetailPage reviews', () => {
    const review = { id: 'r1', rating: 4, body: 'Great grid.', author: 'fan_one', createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z' };

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(cloudApi, 'galleryDetail').mockResolvedValue({ ...detail, ratingAvg: 4.0, ratingCount: 1 });
        vi.spyOn(cloudApi, 'listIncomingMrs').mockResolvedValue([]);
        vi.spyOn(cloudApi, 'listReviews').mockResolvedValue({ reviews: [review], myReview: null });
    });

    it('shows the rating summary and the review list', async () => {
        mockUseSession.mockReturnValue({ data: null });
        renderAt();
        expect(await screen.findByText('Great grid.')).toBeInTheDocument();
        expect(screen.getByText('fan_one')).toBeInTheDocument();
        expect(screen.getAllByLabelText(/rated 4 out of 5/i).length).toBeGreaterThan(0);
    });

    it('signed out: shows "Sign in to review" and no star input', async () => {
        mockUseSession.mockReturnValue({ data: null });
        renderAt();
        expect(await screen.findByText('Sign in to review')).toBeInTheDocument();
        expect(screen.queryByRole('radiogroup', { name: 'Rating' })).toBeNull();
    });

    it('signed in without a username: shows the welcome link', async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'u9', username: null } } });
        renderAt();
        expect(await screen.findByText('Set a username to review')).toBeInTheDocument();
    });

    it('owner: sees reviews but no write box', async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'owner-1', username: 'the_owner' } } });
        renderAt();
        expect(await screen.findByText('Great grid.')).toBeInTheDocument();
        expect(screen.queryByRole('radiogroup', { name: 'Rating' })).toBeNull();
        expect(screen.queryByText('Sign in to review')).toBeNull();
    });

    it('signed in with a username: saves a review and refreshes', async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'u9', username: 'fan_two' } } });
        const put = vi.spyOn(cloudApi, 'putReview').mockResolvedValue({ review: { ...review, id: 'r2', author: 'fan_two', rating: 5, body: 'Mine' } });
        renderAt();
        fireEvent.click(await screen.findByLabelText('5 stars'));
        fireEvent.change(screen.getByPlaceholderText(/share what you think/i), { target: { value: 'Mine' } });
        fireEvent.click(screen.getByRole('button', { name: /save review/i }));
        await waitFor(() => expect(put).toHaveBeenCalledWith('proj-1', { rating: 5, body: 'Mine' }));
        // refresh: listReviews called again after save
        await waitFor(() => expect(cloudApi.listReviews).toHaveBeenCalledTimes(2));
    });

    it('editing: pre-fills my review and offers delete', async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'u9', username: 'fan_one' } } });
        const mine = { ...review, author: 'fan_one' };
        vi.spyOn(cloudApi, 'listReviews').mockResolvedValue({ reviews: [mine], myReview: mine });
        const del = vi.spyOn(cloudApi, 'deleteReview').mockResolvedValue({ success: true });
        renderAt();
        expect(await screen.findByDisplayValue('Great grid.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /delete review/i }));
        await waitFor(() => expect(del).toHaveBeenCalledWith('proj-1'));
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/GalleryDetailPage.test.tsx`
Expected: existing describes PASS; the new one FAILS (no reviews UI rendered).

- [ ] **Step 3: Extend `useGalleryDetail`**

In `hooks/useGalleryDetail.ts`:

Add to the imports: `ReviewDto` from `'../services/cloudApi'`.

Add to `UseGalleryDetailResult` (exact signatures in the Interfaces block above): `reviews`, `myReview`, `saveReview`, `deleteMyReview`, `reportReview`.

Inside the hook add:

```ts
    const [reviews, setReviews] = useState<ReviewDto[]>([]);
    const [myReview, setMyReview] = useState<ReviewDto | null>(null);

    const loadReviews = () => {
        if (!id) return;
        cloudApi.listReviews(id)
            .then(r => { setReviews(r.reviews); setMyReview(r.myReview); })
            .catch(() => {});
    };
    // session in deps: myReview is caller-specific, so a sign-in/out must refetch.
    useEffect(loadReviews, [id, session?.user?.id]);

    const refreshAfterReviewChange = () => {
        loadReviews();
        if (id) cloudApi.galleryDetail(id).then(setProject).catch(() => {});
    };

    const saveReview = async ({ rating, body }: { rating: number; body: string }) => {
        if (!id) return;
        await cloudApi.putReview(id, { rating, body }); // ApiError propagates to the form
        refreshAfterReviewChange();
    };

    const deleteMyReview = async () => {
        if (!id) return;
        await cloudApi.deleteReview(id);
        refreshAfterReviewChange();
    };

    const reportReview = async (reviewId: string) => {
        const reason = window.prompt('Why are you reporting this review?');
        if (!reason || !id) return;
        try { await cloudApi.reportReview(id, reviewId, reason); window.alert('Thanks — the report was sent.'); }
        catch { window.alert('Could not send report.'); }
    };
```

and add `reviews, myReview, saveReview, deleteMyReview, reportReview` to the returned object.

- [ ] **Step 4: Create `ReviewsSection`**

Create `components/gallery/ReviewsSection.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Flag, Trash2 } from 'lucide-react';
import { ReviewDto, ApiError } from '../../services/cloudApi';
import { StarRating, StarRatingInput } from './StarRating';
import { UseGalleryDetailResult } from '../../hooks/useGalleryDetail';

interface Props {
    isOwner: boolean;
    session: UseGalleryDetailResult['session'];
    fromPath: string;
    ratingAvg: number | null;
    ratingCount: number;
    reviews: ReviewDto[];
    myReview: ReviewDto | null;
    onSave: (args: { rating: number; body: string }) => Promise<void>;
    onDelete: () => Promise<void>;
    onReport: (reviewId: string) => void;
}

export function ReviewsSection({ isOwner, session, fromPath, ratingAvg, ratingCount, reviews, myReview, onSave, onDelete, onReport }: Props) {
    const [rating, setRating] = useState(myReview?.rating ?? 0);
    const [body, setBody] = useState(myReview?.body ?? '');
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    // Pre-fill once my own review arrives (it loads async after mount).
    useEffect(() => {
        setRating(myReview?.rating ?? 0);
        setBody(myReview?.body ?? '');
    }, [myReview?.id, myReview?.updatedAt]);

    const save = async () => {
        setSaving(true);
        setFormError(null);
        try { await onSave({ rating, body: body.trim() }); }
        catch (e) { setFormError(e instanceof ApiError ? e.message : 'Could not save the review'); }
        finally { setSaving(false); }
    };

    const remove = async () => {
        setSaving(true);
        setFormError(null);
        try { await onDelete(); setRating(0); setBody(''); }
        catch { setFormError('Could not delete the review'); }
        finally { setSaving(false); }
    };

    const canWrite = !!session?.user?.username && !isOwner;

    return (
        <div className="mt-10">
            <div className="flex items-center gap-3 mb-3">
                <h2 className="text-sm font-semibold text-slate-700">Reviews</h2>
                <StarRating value={ratingAvg} count={ratingCount} />
            </div>

            {!isOwner && (
                !session?.user ? (
                    <Link to="/login" state={{ from: fromPath }} className="text-xs text-slate-500 hover:text-blue-600">Sign in to review</Link>
                ) : !session.user.username ? (
                    <Link to="/welcome" state={{ from: fromPath }} className="text-xs text-slate-500 hover:text-blue-600">Set a username to review</Link>
                ) : null
            )}

            {canWrite && (
                <div className="bg-white border rounded-xl p-4 mb-4 max-w-lg">
                    <div className="text-xs font-medium text-slate-600 mb-2">{myReview ? 'Your review' : 'Rate this project'}</div>
                    <StarRatingInput value={rating} onChange={setRating} />
                    <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={2000} rows={3}
                        placeholder="Share what you think (optional)"
                        className="w-full border rounded-lg px-3 py-2 text-sm mt-3" />
                    {formError && <div className="text-xs text-red-600 mt-1">{formError}</div>}
                    <div className="flex gap-2 mt-2">
                        <button onClick={save} disabled={saving || rating === 0}
                            className="bg-blue-600 text-white rounded-lg px-4 py-1.5 text-xs font-medium disabled:opacity-50">
                            {saving ? 'Saving…' : 'Save review'}
                        </button>
                        {myReview && (
                            <button onClick={remove} disabled={saving}
                                className="flex items-center gap-1 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-600 disabled:opacity-50">
                                <Trash2 size={12} /> Delete review
                            </button>
                        )}
                    </div>
                </div>
            )}

            {reviews.length === 0
                ? <div className="text-xs text-slate-400 mt-2">No reviews yet.</div>
                : (
                    <div className="space-y-3 mt-2 max-w-lg">
                        {reviews.map(r => (
                            <div key={r.id} className="bg-white border rounded-xl p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Link to={`/u/${r.author}`} className="text-xs font-semibold text-slate-700 hover:text-blue-600">{r.author}</Link>
                                        <StarRating value={r.rating} />
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-[10px] text-slate-400">{new Date(r.updatedAt).toLocaleDateString()}</span>
                                        <button onClick={() => onReport(r.id)} title="Report review"
                                            className="text-slate-300 hover:text-red-600"><Flag size={11} /></button>
                                    </div>
                                </div>
                                {r.body && <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{r.body}</p>}
                            </div>
                        ))}
                    </div>
                )}
        </div>
    );
}
```

(Note: per-review `StarRating value={r.rating}` renders "4.0"-style text — integer ratings display as e.g. `4.0`, which is acceptable and keeps one component.)

- [ ] **Step 5: Wire into `GalleryDetailBody`**

In `components/gallery/GalleryDetailBody.tsx`:

1. Destructure the new hook fields: add `reviews, myReview, saveReview, deleteMyReview, reportReview` to the existing destructuring of `detail`.
2. Add imports: `import { StarRating } from './StarRating';` and `import { ReviewsSection } from './ReviewsSection';` — and `useNavigate` from `'react-router-dom'` (extend the existing import).
3. Directly under the `by {project.author}` line, add the summary:

```tsx
                <div className="mt-2"><StarRating value={project.ratingAvg} count={project.ratingCount} /></div>
```

4. Make the existing tag chips clickable — replace the `project.tags.map(...)` `<span>` with:

```tsx
                    {project.tags.map(t => (
                        <button key={t} type="button" onClick={() => navigate(`/gallery?tag=${encodeURIComponent(t)}`)}
                            className="text-[10px] bg-slate-200 text-slate-600 rounded-full px-2 py-0.5 hover:bg-blue-100 hover:text-blue-700 transition-colors">
                            {t}
                        </button>
                    ))}
```

with `const navigate = useNavigate();` at the top of the component.

5. After the merge-requests block (still inside the second `<div>`), add:

```tsx
                <ReviewsSection
                    isOwner={isOwner}
                    session={session}
                    fromPath={fromPath}
                    ratingAvg={project.ratingAvg}
                    ratingCount={project.ratingCount}
                    reviews={reviews}
                    myReview={myReview}
                    onSave={saveReview}
                    onDelete={deleteMyReview}
                    onReport={reportReview}
                />
```

`isOwner` is already provided by the hook.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/unit/GalleryDetailPage.test.tsx tests/unit/GalleryDetailModal.test.tsx`
Expected: PASS — including the pre-existing describes (the modal test file exercises the same `GalleryDetailBody`; if it fails on a missing `listReviews` mock, add `vi.spyOn(cloudApi, 'listReviews').mockResolvedValue({ reviews: [], myReview: null });` to its `beforeEach`).

- [ ] **Step 7: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add hooks/useGalleryDetail.ts components/gallery/ReviewsSection.tsx components/gallery/GalleryDetailBody.tsx tests/unit/GalleryDetailPage.test.tsx tests/unit/GalleryDetailModal.test.tsx
git commit -m "feat(gallery-v2): reviews UI on gallery detail (summary, write box, list, report)"
```

---

### Task 10: `GalleryPage` rework — hero, tag chips, sections/grid modes

**Files:**
- Modify: `pages/GalleryPage.tsx` (full rewrite)
- Test: Create `tests/unit/GalleryPage.test.tsx`

**Interfaces:**
- Consumes: `cloudApi.gallery` (with `tag`/`limit`/`sort: 'rating'`), `cloudApi.galleryTags`, `GalleryItem`, `GalleryTag` (Task 6); `ProjectCard` (Task 8); `AccountMenu` (existing); `useSearchParams` from react-router.
- Produces: `/gallery` URL contract — `?q=`, `?tag=`, `?sort=recent|popular|rating`, `?page=` all drive the view; no params = sections mode. Other code links to `/gallery?tag=<t>` (ProjectCard Task 8, GalleryDetailBody Task 9) — this page must honor it.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/GalleryPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { GalleryPage } from '../../pages/GalleryPage';
import { cloudApi, GalleryItem } from '../../services/cloudApi';

const mockUseSession = vi.fn();
vi.mock('../../lib/auth-client', () => ({
    useSession: () => mockUseSession(),
    signOut: vi.fn(),
}));

const mkItem = (id: string, name: string): GalleryItem => ({
    id, name, description: 'desc', tags: ['planner'], author: 'maker',
    forkCount: 0, downloadCount: 0, updatedAt: '2026-01-01', thumbnailId: null,
    ratingAvg: 4.0, ratingCount: 2,
});

const renderAt = (entry = '/gallery') => render(
    <MemoryRouter initialEntries={[entry]}>
        <Routes>
            <Route path="/gallery" element={<GalleryPage />} />
            <Route path="/gallery/:id" element={<div>DETAIL_MARKER</div>} />
        </Routes>
    </MemoryRouter>
);

describe('GalleryPage', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockUseSession.mockReturnValue({ data: null });
        vi.spyOn(cloudApi, 'galleryTags').mockResolvedValue([{ tag: 'planner', count: 3 }, { tag: 'weekly', count: 1 }]);
        vi.spyOn(cloudApi, 'gallery').mockResolvedValue({ items: [mkItem('p1', 'Alpha')], page: 0, hasMore: false });
    });

    it('default view renders the hero, tag chips and three sections', async () => {
        renderAt();
        expect(await screen.findByText(/discover planner & notebook templates/i)).toBeInTheDocument();
        expect(await screen.findByText('Top rated')).toBeInTheDocument();
        expect(screen.getByText('Popular')).toBeInTheDocument();
        expect(screen.getByText('Recently updated')).toBeInTheDocument();
        expect(await screen.findByRole('button', { name: /planner \(3\)/i })).toBeInTheDocument();
        await waitFor(() => {
            const sorts = (cloudApi.gallery as any).mock.calls.map((c: any[]) => c[0]?.sort);
            expect(sorts).toContain('rating');
            expect(sorts).toContain('popular');
            expect(sorts).toContain('recent');
        });
        // section fetches are limit-capped
        expect((cloudApi.gallery as any).mock.calls.every((c: any[]) => c[0]?.limit === 8)).toBe(true);
    });

    it('?tag= URL param opens the filtered grid directly', async () => {
        renderAt('/gallery?tag=planner');
        await waitFor(() => expect(cloudApi.gallery).toHaveBeenCalledWith(expect.objectContaining({ tag: 'planner' })));
        expect(screen.queryByText('Top rated')).toBeNull();
        expect(await screen.findByText('Alpha')).toBeInTheDocument();
        // dismissible active-tag chip
        expect(screen.getByRole('button', { name: /remove tag filter/i })).toBeInTheDocument();
    });

    it('typing a search switches to grid mode with the q param', async () => {
        renderAt();
        await screen.findByText('Top rated');
        fireEvent.change(screen.getByPlaceholderText(/search planners/i), { target: { value: 'alp' } });
        await waitFor(() => expect(cloudApi.gallery).toHaveBeenCalledWith(expect.objectContaining({ q: 'alp' })), { timeout: 2000 });
        expect(screen.queryByText('Top rated')).toBeNull();
    });

    it('"See all" enters grid mode with that sort', async () => {
        renderAt();
        await screen.findByText('Top rated');
        fireEvent.click(screen.getAllByRole('button', { name: /see all/i })[0]);
        await waitFor(() => expect(cloudApi.gallery).toHaveBeenCalledWith(expect.objectContaining({ sort: 'rating', page: 0 })));
    });

    it('clearing filters returns to sections mode', async () => {
        renderAt('/gallery?tag=planner');
        await screen.findByText('Alpha');
        fireEvent.click(screen.getByRole('button', { name: /all projects/i }));
        expect(await screen.findByText('Top rated')).toBeInTheDocument();
    });

    it('shows an empty state with a clear-filters action when nothing matches', async () => {
        vi.spyOn(cloudApi, 'gallery').mockResolvedValue({ items: [], page: 0, hasMore: false });
        renderAt('/gallery?q=zzz');
        expect(await screen.findByText(/no projects match/i)).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/GalleryPage.test.tsx`
Expected: FAIL — current page has neither hero nor sections nor URL-param handling.

- [ ] **Step 3: Rewrite `pages/GalleryPage.tsx`**

Replace the file's contents with:

```tsx
import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Square, Star, Flame, Clock, X, ArrowLeft } from 'lucide-react';
import { cloudApi, GalleryItem, GalleryTag } from '../services/cloudApi';
import { AccountMenu } from '../components/AccountMenu';
import { ProjectCard } from '../components/gallery/ProjectCard';

const SECTION_LIMIT = 8;

function SkeletonGrid({ count }: { count: number }) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: count }, (_, i) => (
                <div key={i} data-testid="skeleton-card" className="bg-white border rounded-xl overflow-hidden animate-pulse">
                    <div className="aspect-[3/4] bg-slate-100" />
                    <div className="p-3 space-y-2">
                        <div className="h-3.5 bg-slate-200 rounded w-3/4" />
                        <div className="h-3 bg-slate-200 rounded w-1/2" />
                    </div>
                </div>
            ))}
        </div>
    );
}

const SECTIONS = [
    { key: 'rating' as const, title: 'Top rated', icon: <Star size={16} className="text-amber-500" /> },
    { key: 'popular' as const, title: 'Popular', icon: <Flame size={16} className="text-orange-500" /> },
    { key: 'recent' as const, title: 'Recently updated', icon: <Clock size={16} className="text-blue-500" /> },
];
type SectionKey = typeof SECTIONS[number]['key'];

export function GalleryPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const qParam = searchParams.get('q') ?? '';
    const tagParam = searchParams.get('tag') ?? '';
    const sortParam = searchParams.get('sort') ?? '';
    const page = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10) || 0);
    const isFiltered = !!(qParam || tagParam || sortParam);

    const [qInput, setQInput] = useState(qParam);
    const [tags, setTags] = useState<GalleryTag[]>([]);
    const [items, setItems] = useState<GalleryItem[] | null>(null);   // grid mode; null = loading
    const [hasMore, setHasMore] = useState(false);
    const [sections, setSections] = useState<Record<SectionKey, GalleryItem[]> | null>(null);
    const [error, setError] = useState<string | null>(null);

    const setParam = (key: string, value: string | null) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (value) next.set(key, value); else next.delete(key);
            if (key !== 'page') next.delete('page');
            return next;
        });
    };

    // Debounce the search box into ?q= so filtered views stay shareable/bookmarkable.
    useEffect(() => {
        const t = setTimeout(() => {
            if (qInput === qParam) return;
            setSearchParams(prev => {
                const next = new URLSearchParams(prev);
                if (qInput) next.set('q', qInput); else next.delete('q');
                next.delete('page');
                return next;
            }, { replace: true });
        }, 250);
        return () => clearTimeout(t);
    }, [qInput]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { setQInput(qParam); }, [qParam]);

    useEffect(() => {
        cloudApi.galleryTags().then(setTags).catch(() => {});
    }, []);

    // Sections mode: three parallel, limit-capped fetches.
    useEffect(() => {
        if (isFiltered) return;
        setSections(null);
        Promise.all(SECTIONS.map(s => cloudApi.gallery({ sort: s.key, limit: SECTION_LIMIT })))
            .then(results => {
                const bySection = {} as Record<SectionKey, GalleryItem[]>;
                SECTIONS.forEach((s, i) => { bySection[s.key] = results[i].items; });
                setSections(bySection);
                setError(null);
            })
            .catch(() => setError('Could not load the gallery.'));
    }, [isFiltered]);

    // Grid mode: one filtered, paginated fetch.
    useEffect(() => {
        if (!isFiltered) return;
        setItems(null);
        const sort = sortParam === 'popular' || sortParam === 'rating' ? sortParam : 'recent';
        cloudApi.gallery({ q: qParam || undefined, tag: tagParam || undefined, sort, page })
            .then(res => { setItems(res.items); setHasMore(res.hasMore); setError(null); })
            .catch(() => setError('Could not load the gallery.'));
    }, [isFiltered, qParam, tagParam, sortParam, page]);

    const clearFilters = () => { setQInput(''); setSearchParams({}); };
    const galleryEmpty = sections !== null && SECTIONS.every(s => sections[s.key].length === 0);

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="h-14 bg-white border-b flex items-center px-6 gap-4 sticky top-0 z-10">
                <Link to="/" className="flex items-center gap-2 font-bold text-slate-800">
                    <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-white"><Square size={16} fill="currentColor" /></div>
                    Gallery
                </Link>
                <div className="flex-1 max-w-md relative">
                    <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                    <input value={qInput} onChange={e => setQInput(e.target.value)}
                        placeholder="Search planners and notebooks…"
                        className="w-full border rounded-lg pl-8 pr-3 py-1.5 text-sm" />
                </div>
                {isFiltered && (
                    <select value={sortParam || 'recent'} onChange={e => setParam('sort', e.target.value)}
                        className="border rounded-lg px-2 py-1.5 text-sm">
                        <option value="recent">Newest</option>
                        <option value="popular">Popular</option>
                        <option value="rating">Top rated</option>
                    </select>
                )}
                <Link to="/app" className="text-xs font-medium text-slate-500 hover:text-blue-600">Editor</Link>
                <AccountMenu />
            </header>

            {!isFiltered && (
                <div className="bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-500 text-white">
                    <div className="max-w-6xl mx-auto px-6 py-10">
                        <h1 className="text-2xl md:text-3xl font-bold">Discover planner & notebook templates</h1>
                        <p className="text-sm text-blue-100 mt-1">Browse community-published designs — open, download, or fork any of them.</p>
                        {tags.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-5">
                                {tags.map(t => (
                                    <button key={t.tag} onClick={() => setParam('tag', t.tag)}
                                        className="text-xs bg-white/15 hover:bg-white/30 rounded-full px-3 py-1 transition-colors">
                                        {t.tag} <span className="text-blue-100">({t.count})</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <main className="max-w-6xl mx-auto p-6">
                {error && <div className="text-sm text-red-600">{error}</div>}

                {!isFiltered ? (
                    galleryEmpty
                        ? <div className="text-sm text-slate-400 text-center py-16">Nothing here yet. Publish the first project!</div>
                        : SECTIONS.map(s => {
                            const rows = sections?.[s.key];
                            if (rows && rows.length === 0) return null;
                            return (
                                <section key={s.key} className="mt-8 first:mt-2">
                                    <div className="flex items-center justify-between mb-3">
                                        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">{s.icon} {s.title}</h2>
                                        <button onClick={() => setParam('sort', s.key)} className="text-xs text-blue-600 hover:underline">See all →</button>
                                    </div>
                                    {rows
                                        ? <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">{rows.map(i => <ProjectCard key={i.id} item={i} />)}</div>
                                        : <SkeletonGrid count={4} />}
                                </section>
                            );
                        })
                ) : (
                    <>
                        <div className="flex items-center gap-3 mb-4">
                            <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-slate-600 hover:text-blue-600">
                                <ArrowLeft size={12} /> All projects
                            </button>
                            {tagParam && (
                                <span className="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 rounded-full px-3 py-1">
                                    {tagParam}
                                    <button onClick={() => setParam('tag', null)} aria-label="Remove tag filter" className="hover:text-blue-900">
                                        <X size={12} />
                                    </button>
                                </span>
                            )}
                        </div>
                        {items === null ? (
                            <SkeletonGrid count={8} />
                        ) : items.length === 0 ? (
                            <div className="text-center py-16">
                                <div className="text-sm text-slate-400">No projects match.</div>
                                <button onClick={clearFilters} className="text-xs text-blue-600 hover:underline mt-2">Clear filters</button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {items.map(item => <ProjectCard key={item.id} item={item} />)}
                            </div>
                        )}
                        <div className="flex justify-center gap-2 mt-6">
                            {page > 0 && <button onClick={() => setParam('page', String(page - 1))} className="text-xs px-3 py-1.5 border rounded">Previous</button>}
                            {hasMore && <button onClick={() => setParam('page', String(page + 1))} className="text-xs px-3 py-1.5 border rounded">Next</button>}
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/GalleryPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full suite + type-check + commit**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all green, clean.

```bash
git add pages/GalleryPage.tsx tests/unit/GalleryPage.test.tsx
git commit -m "feat(gallery-v2): sections/grid gallery rework with hero, tag chips, URL filters"
```

---

### Task 11: Full-suite verification + real-browser walkthrough

**Files:**
- No production code changes expected (fix-forward if the walkthrough finds bugs).

**Interfaces:**
- Consumes: everything above.
- Produces: verified feature; suite green; evidence of the end-to-end flow.

- [ ] **Step 1: Full automated verification**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests green, tsc clean. Record the final test count.

- [ ] **Step 2: Boot the real app**

```bash
npm run dev
```

(Vite on :3000, API on :3001 — or per `vite.config.ts` proxy; use whatever the existing dev setup serves.)

- [ ] **Step 3: Real-browser walkthrough (use a real browser or Playwright script; throwaway, not committed — per house precedent from the version-history and modal rounds)**

1. Sign up user A (with username), create a project in the editor, publish it with description and 2+ tags.
2. Sign up user B. On the gallery: confirm the hero band, tag chips with counts, and the three sections render.
3. Open A's project (modal overlay). Confirm "No ratings yet", write a 4-star review with text. Confirm the stars + count appear in the summary and, after navigating back, on the gallery card.
4. Edit the review to 5 stars (form pre-filled). Confirm the average updates.
5. Click a tag chip on the card — confirm the filtered grid opens at `/gallery?tag=…`, the dismissible chip shows, and "← All projects" returns to sections.
6. Search for the project by a word in its description and by one of its tags — both must find it.
7. Sort by "Top rated" — A's project sorts above unrated ones.
8. As user A (owner): open own project — no write box, reviews visible. Confirm the Merge-requests block still renders (regression).
9. Signed out: confirm "Sign in to review" links to login and returns to the project after sign-in (`from`-redirect).
10. Report B's review (anonymous), then as an admin (role set via DB) check `GET /api/admin/reports` includes it and `DELETE /api/admin/reviews/:id` removes it.
11. Delete B's review via the UI — confirm the card's rating disappears (count 0).
12. Unpublish A's project — confirm its gallery detail (and reviews) 404.

- [ ] **Step 4: Fix anything found (fix-forward with a test), then final commit if any docs/plan checkboxes changed**

```bash
git add -A && git commit -m "docs(gallery-v2): mark plan verified"
```
