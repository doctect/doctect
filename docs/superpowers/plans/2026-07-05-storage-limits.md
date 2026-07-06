# Cloud Storage Cost Limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound Neon DB storage costs for cloud-saved project JSON with a per-user 50 MB quota, a global storage ceiling, commit dedupe, per-project commit retention, gzip compression, per-user project/publish/rate caps, and a "My projects" page where users can see and delete their projects to free space.

**Architecture:** Commits currently store raw JSON (`commits.state_json` TEXT, up to 5 MB each) with no cap on commit count, projects per user, or bytes per user. This plan adds three columns to `commits` (`state_gzip` BYTEA/BLOB, `state_bytes` INTEGER, `state_hash` TEXT) via a new migration; all new commits store gzip-compressed state (5–10× smaller) with `state_json = ''`, and readers fall back to `state_json` for pre-migration rows. Quotas are enforced as helper assertions inside the three content-creating routes (`POST /api/projects`, `POST .../commits`, `POST .../fork`) — deliberately mirroring where `requireUsername` is applied. Retention pruning runs inside `insertCommit` so every commit path (save, fork, merge) is covered automatically.

**Tech Stack:** Express 5, better-sqlite3 / pg behind `server/db.js` `query()`, `node:zlib` (no new dependency), express-rate-limit v8, vitest + supertest, React 19 + react-router-dom 6, Tailwind classes matching existing pages.

## Global Constraints

- All limits are env-driven with these exact names and defaults, **read at call time** (never cached at module load) so tests can override per-file: `USER_STORAGE_QUOTA_MB=50`, `MAX_TOTAL_STORAGE_MB=20480`, `COMMIT_RETENTION_PER_PROJECT=50`, `MAX_PROJECTS_PER_USER=25`, `MAX_PUBLIC_PROJECTS_PER_USER=20`, `USER_COMMITS_PER_HOUR=60`.
- Quota counts **stored (compressed) commit bytes only**. Thumbnails are bounded separately by the publish cap (max 20 public projects × 4 × 300 KB = 24 MB worst case per user).
- Error codes (client branches on `code`, mirroring the existing `USERNAME_REQUIRED` pattern): `STORAGE_QUOTA_EXCEEDED` (HTTP 413), `SERVICE_STORAGE_FULL` (507), `PROJECT_LIMIT_REACHED` (403), `PUBLIC_LIMIT_REACHED` (403), `RATE_LIMITED` (429).
- Every SQL statement must work on **both** Postgres and SQLite. The SQLite adapter in `server/db.js` rewrites `$N` → `?` positionally, so **never reuse a placeholder number** — if the same value appears twice, use two placeholders and pass the value twice in params.
- No quota check on the merge endpoint (`POST /api/merge-requests/:id/merge`) — same rationale as `requireUsername` being absent there: never block an owner from acting on content they already own. Merge-created commits are still bounded by retention + the global ceiling. Document this.
- Legacy (pre-migration) commit rows get `state_bytes` backfilled as their **uncompressed** byte length — a conservative overcount that self-corrects as retention prunes old rows.
- Server tests live in `tests/unit/server/`, use helpers from `tests/unit/server/helpers.js` (`initTestApp`, `signUpUser`, `minimalState`), and must import `server/db.js` **dynamically inside `beforeAll` after `initTestApp()`** (static imports are hoisted before `SQLITE_PATH` is set). Run with `npx vitest run <file>`.
- Full-suite check: `npx vitest run` must pass after every task.

---

### Task 1: State codec (`server/stateCodec.js`)

**Files:**
- Create: `server/stateCodec.js`
- Test: `tests/unit/server/stateCodec.test.js`

**Interfaces:**
- Consumes: `stableStringify` from `shared/diff.js` (existing; key-order-insensitive JSON serializer).
- Produces: `encodeState(state) -> { gzip: Buffer, bytes: number, hash: string }` and `decodeStateRow(row) -> object` where `row` has `state_gzip` (Buffer | null) and `state_json` (string). Every later server task uses exactly these two functions.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/server/stateCodec.test.js
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { encodeState, decodeStateRow } from '../../../server/stateCodec.js';

const state = {
    nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
    rootId: 'root',
    variants: { default: { id: 'default', name: 'Default', templates: {} } },
    schemaVersion: 7
};

describe('stateCodec', () => {
    it('round-trips a state through gzip', () => {
        const enc = encodeState(state);
        expect(Buffer.isBuffer(enc.gzip)).toBe(true);
        expect(enc.bytes).toBe(enc.gzip.length);
        expect(decodeStateRow({ state_gzip: enc.gzip, state_json: '' })).toEqual(state);
    });

    it('compresses repetitive JSON well below its raw size', () => {
        const big = { ...state, padding: 'x'.repeat(100000) };
        const enc = encodeState(big);
        expect(enc.bytes).toBeLessThan(JSON.stringify(big).length / 5);
    });

    it('hash is stable under key reordering', () => {
        const reordered = { schemaVersion: 7, variants: state.variants, rootId: 'root', nodes: state.nodes };
        expect(encodeState(state).hash).toBe(encodeState(reordered).hash);
    });

    it('hash differs for different content', () => {
        const other = { ...state, rootId: 'root', schemaVersion: 8 };
        expect(encodeState(state).hash).not.toBe(encodeState(other).hash);
    });

    it('falls back to plain state_json for legacy rows without state_gzip', () => {
        expect(decodeStateRow({ state_gzip: null, state_json: JSON.stringify(state) })).toEqual(state);
    });

    it('normalizes non-Buffer blob values (some drivers return Uint8Array)', () => {
        const enc = encodeState(state);
        expect(decodeStateRow({ state_gzip: new Uint8Array(enc.gzip), state_json: '' })).toEqual(state);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/server/stateCodec.test.js`
Expected: FAIL — `Cannot find module '.../server/stateCodec.js'`

- [ ] **Step 3: Write the implementation**

```js
// server/stateCodec.js
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { stableStringify } from '../shared/diff.js';

// Encodes an AppState for storage: gzip-compressed JSON plus its stored size and a
// content hash. The hash uses stableStringify so two states that differ only in
// object key order (e.g. re-serialized by different clients) dedupe as identical.
export const encodeState = (state) => {
    const gzip = gzipSync(Buffer.from(JSON.stringify(state), 'utf8'));
    const hash = createHash('sha256').update(stableStringify(state)).digest('hex');
    return { gzip, bytes: gzip.length, hash };
};

// Decodes a commits row back into an AppState object. New rows store gzip in
// state_gzip (state_json = ''); rows written before migration 007 have only
// state_json — both must keep working forever, so never drop the fallback.
export const decodeStateRow = (row) => {
    if (row.state_gzip != null) {
        const buf = Buffer.isBuffer(row.state_gzip) ? row.state_gzip : Buffer.from(row.state_gzip);
        return JSON.parse(gunzipSync(buf).toString('utf8'));
    }
    return JSON.parse(row.state_json);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/server/stateCodec.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add server/stateCodec.js tests/unit/server/stateCodec.test.js
git commit -m "feat: add gzip state codec with content hash for commit storage"
```

---

### Task 2: Migration 007 + wire codec into every commit write and read

**Files:**
- Modify: `server/migrations/index.js` (append migration `007_commit_storage`)
- Modify: `server/routes/projects.js` (`insertCommit` at line 30, commit-detail read at line 139, fork read at line 204)
- Modify: `server/routes/gallery.js` (download read, ~line 90)
- Modify: `server/routes/mergeRequests.js` (`getCommitState`, lines 11–15)
- Test: `tests/unit/server/commitStorage.test.js`

**Interfaces:**
- Consumes: `encodeState` / `decodeStateRow` from Task 1.
- Produces: `commits` table gains `state_gzip` (BYTEA/BLOB, nullable), `state_bytes` (INTEGER), `state_hash` (TEXT, nullable). `insertCommit` gains an optional `encoded` param: `insertCommit({ projectId, parentCommitId, message, state, userId, encoded })` where `encoded` is an `encodeState` result (computed internally when omitted). Later tasks rely on `state_bytes` being non-null on **every** row (new + backfilled) and `state_hash` non-null on new rows.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/server/commitStorage.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState } from './helpers.js';

let app, cookie, query;
beforeAll(async () => {
    app = await initTestApp();
    ({ query } = await import('../../../server/db.js'));
    cookie = await signUpUser(app, { email: 'store@test.dev', username: 'store_u' });
});

describe('compressed commit storage', () => {
    it('stores new commits gzipped with size and hash, state_json empty', async () => {
        const res = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'Zip', state: minimalState() });
        expect(res.status).toBe(201);
        const rows = await query('SELECT state_json, state_gzip, state_bytes, state_hash FROM commits WHERE id = $1', [res.body.commit.id]);
        expect(rows[0].state_json).toBe('');
        expect(rows[0].state_gzip).not.toBeNull();
        expect(rows[0].state_bytes).toBeGreaterThan(0);
        expect(typeof rows[0].state_hash).toBe('string');
    });

    it('round-trips state through the commit-detail endpoint', async () => {
        const state = minimalState('RoundTrip');
        const created = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'RT', state });
        const res = await request(app)
            .get(`/api/projects/${created.body.project.id}/commits/${created.body.commit.id}`)
            .set('Cookie', cookie);
        expect(res.status).toBe(200);
        expect(res.body.commit.state).toEqual(state);
    });

    it('still reads legacy rows that only have state_json', async () => {
        const created = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'Legacy', state: minimalState() });
        const projectId = created.body.project.id;
        const legacyState = minimalState('LegacyTitle');
        await query(
            `INSERT INTO commits (id, project_id, parent_commit_id, message, state_json, schema_version, created_by, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            ['legacy-commit-1', projectId, null, 'legacy', JSON.stringify(legacyState), 7, 'someone', new Date().toISOString()]);
        const res = await request(app)
            .get(`/api/projects/${projectId}/commits/legacy-commit-1`).set('Cookie', cookie);
        expect(res.status).toBe(200);
        expect(res.body.commit.state).toEqual(legacyState);
    });

    it('forking a compressed commit round-trips correctly', async () => {
        const state = minimalState('ForkMe');
        const created = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'ForkSrc', state });
        await request(app).post(`/api/projects/${created.body.project.id}/publish`).set('Cookie', cookie)
            .send({ description: '', tags: [], thumbnails: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='] });
        const cookieB = await signUpUser(app, { email: 'forker@test.dev', username: 'forker_u' });
        const fork = await request(app).post(`/api/projects/${created.body.project.id}/fork`).set('Cookie', cookieB);
        expect(fork.status).toBe(201);
        const detail = await request(app)
            .get(`/api/projects/${fork.body.project.id}/commits/${fork.body.project.headCommitId}`)
            .set('Cookie', cookieB);
        expect(detail.body.commit.state).toEqual(state);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/server/commitStorage.test.js`
Expected: FAIL — first test fails because `state_gzip` column doesn't exist (SQL error) or is null.

- [ ] **Step 3: Append migration 007**

In `server/migrations/index.js`, append to the `migrations` array (after `006_merge_requests`):

```js
    {
        id: '007_commit_storage',
        pg: `
            ALTER TABLE commits ADD COLUMN IF NOT EXISTS state_gzip BYTEA;
            ALTER TABLE commits ADD COLUMN IF NOT EXISTS state_bytes INTEGER;
            ALTER TABLE commits ADD COLUMN IF NOT EXISTS state_hash TEXT;
            UPDATE commits SET state_bytes = OCTET_LENGTH(state_json) WHERE state_bytes IS NULL
        `,
        sqlite: `
            ALTER TABLE commits ADD COLUMN state_gzip BLOB;
            ALTER TABLE commits ADD COLUMN state_bytes INTEGER;
            ALTER TABLE commits ADD COLUMN state_hash TEXT;
            UPDATE commits SET state_bytes = LENGTH(CAST(state_json AS BLOB)) WHERE state_bytes IS NULL
        `
    }
```

Note: SQLite has no `ADD COLUMN IF NOT EXISTS`; that's fine — the migration runner is run-once (same pattern as `003_username`). The backfill sets legacy rows' `state_bytes` to their uncompressed byte length (deliberate overcount, see Global Constraints).

- [ ] **Step 4: Update `insertCommit` in `server/routes/projects.js`**

Add the import at the top (line 5 area):

```js
import { encodeState, decodeStateRow } from '../stateCodec.js';
```

Replace the existing `insertCommit` (lines 30–45) with:

```js
export const insertCommit = async ({ projectId, parentCommitId, message, state, userId, encoded }) => {
    const id = randomUUID();
    const enc = encoded ?? encodeState(state);
    // Explicit millisecond-precision timestamp rather than relying on the DB's
    // CURRENT_TIMESTAMP default: SQLite's default only has whole-second resolution,
    // so two commits created within the same second (routine in tests, and possible
    // in production for rapid saves) would tie and fall back to sorting by the
    // random commit UUID — breaking the "newest first" ordering guarantee below.
    const createdAt = new Date().toISOString();
    await query(
        `INSERT INTO commits (id, project_id, parent_commit_id, message, state_json, state_gzip, state_bytes, state_hash, schema_version, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [id, projectId, parentCommitId ?? null, message, '', enc.gzip, enc.bytes, enc.hash, state.schemaVersion ?? null, userId, createdAt]
    );
    await query(`UPDATE projects SET head_commit_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [id, projectId]);
    return id;
};
```

- [ ] **Step 5: Update all four read sites to use `decodeStateRow`**

`server/routes/projects.js`, commit-detail route (currently lines 139–144):

```js
router.get('/api/projects/:id/commits/:commitId', optionalAuth, loadProject(false), async (req, res) => {
    const rows = await query('SELECT id, message, created_at, state_json, state_gzip FROM commits WHERE id = $1 AND project_id = $2',
        [req.params.commitId, req.project.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Commit not found' });
    res.json({ commit: { id: rows[0].id, message: rows[0].message, createdAt: rows[0].created_at, state: decodeStateRow(rows[0]) } });
});
```

`server/routes/projects.js`, fork route (currently lines 204–219) — change the head read and the `insertCommit` state:

```js
    const headRows = await query('SELECT state_json, state_gzip, state_bytes FROM commits WHERE id = $1', [src.head_commit_id]);
    if (!headRows[0]) return res.status(404).json({ error: 'Source commit not found' });
```

and in the fork's `insertCommit` call replace `state: JSON.parse(headRows[0].state_json)` with `state: decodeStateRow(headRows[0])`. (`state_bytes` in the SELECT is unused until Task 5 — include it now so Task 5 doesn't have to touch this query.)

`server/routes/gallery.js`, download endpoint (~line 90): add `import { decodeStateRow } from '../stateCodec.js';` at the top, change the SELECT to `SELECT state_json, state_gzip FROM commits WHERE id = $1` and the response to `res.json({ name: p.name, state: decodeStateRow(rows[0]) });`

`server/routes/mergeRequests.js`, `getCommitState` (lines 11–15): add `import { decodeStateRow } from '../stateCodec.js';` at the top and replace:

```js
const getCommitState = async (commitId) => {
    const rows = await query('SELECT state_json, state_gzip, schema_version FROM commits WHERE id = $1', [commitId]);
    if (!rows[0]) return null;
    return { state: decodeStateRow(rows[0]), schemaVersion: rows[0].schema_version };
};
```

- [ ] **Step 6: Run the new test, then the whole suite**

Run: `npx vitest run tests/unit/server/commitStorage.test.js`
Expected: PASS (4 tests)

Run: `npx vitest run`
Expected: ALL PASS — the existing projects/gallery/fork/merge-request suites exercise every read path against the new storage format.

- [ ] **Step 7: Commit**

```bash
git add server/migrations/index.js server/routes/projects.js server/routes/gallery.js server/routes/mergeRequests.js tests/unit/server/commitStorage.test.js
git commit -m "feat: store commit state gzip-compressed with size and content hash"
```

---

### Task 3: Commit dedupe (identical save is a no-op)

**Files:**
- Modify: `server/routes/projects.js` (`POST /api/projects/:id/commits`, currently lines 112–125)
- Test: `tests/unit/server/commitDedupe.test.js`

**Interfaces:**
- Consumes: `encodeState` (Task 1), `state_hash` column and `insertCommit`'s `encoded` param (Task 2).
- Produces: `POST /api/projects/:id/commits` returns **200** `{ commit: { id, message, createdAt }, deduped: true }` (the existing head commit) when the submitted state's hash equals the head commit's hash; unchanged **201** behavior otherwise. Client code may ignore `deduped` — response shape is otherwise identical.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/server/commitDedupe.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState } from './helpers.js';

let app, cookie, projectId, initialCommitId;
beforeAll(async () => {
    app = await initTestApp();
    cookie = await signUpUser(app, { email: 'dedupe@test.dev', username: 'dedupe_u' });
    const res = await request(app).post('/api/projects').set('Cookie', cookie)
        .send({ name: 'Dedupe', state: minimalState('A') });
    projectId = res.body.project.id;
    initialCommitId = res.body.commit.id;
});

describe('commit dedupe', () => {
    it('saving an identical state returns the existing head commit, creates nothing', async () => {
        const res = await request(app).post(`/api/projects/${projectId}/commits`).set('Cookie', cookie)
            .send({ state: minimalState('A'), message: 'same again' });
        expect(res.status).toBe(200);
        expect(res.body.deduped).toBe(true);
        expect(res.body.commit.id).toBe(initialCommitId);
        const list = await request(app).get(`/api/projects/${projectId}/commits`).set('Cookie', cookie);
        expect(list.body.commits.length).toBe(1);
    });

    it('a genuinely changed state still creates a new commit', async () => {
        const res = await request(app).post(`/api/projects/${projectId}/commits`).set('Cookie', cookie)
            .send({ state: minimalState('B'), message: 'changed' });
        expect(res.status).toBe(201);
        expect(res.body.commit.id).not.toBe(initialCommitId);
        const list = await request(app).get(`/api/projects/${projectId}/commits`).set('Cookie', cookie);
        expect(list.body.commits.length).toBe(2);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/server/commitDedupe.test.js`
Expected: FAIL — first test gets 201 and 2 commits instead of 200/deduped.

- [ ] **Step 3: Implement dedupe in the commits route**

Replace the `POST /api/projects/:id/commits` handler body:

```js
router.post('/api/projects/:id/commits', requireAuth, requireUsername, loadProject(true), async (req, res) => {
    const { state, message } = req.body || {};
    const v = validateAppState(state);
    if (!v.ok) return res.status(400).json({ error: `invalid state: ${v.error}` });
    const encoded = encodeState(state);

    // Dedupe: content identical to the current head is a no-op, not a new commit.
    // Legacy heads (pre-migration, state_hash NULL) never match and just commit normally.
    if (req.project.head_commit_id) {
        const head = await query('SELECT id, message, created_at, state_hash FROM commits WHERE id = $1', [req.project.head_commit_id]);
        if (head[0] && head[0].state_hash === encoded.hash) {
            return res.json({ commit: { id: head[0].id, message: head[0].message, createdAt: head[0].created_at }, deduped: true });
        }
    }

    const commitId = await insertCommit({
        projectId: req.project.id,
        parentCommitId: req.project.head_commit_id,
        message: cleanMessage(message),
        state,
        userId: req.user.id,
        encoded
    });
    const rows = await query('SELECT id, message, created_at FROM commits WHERE id = $1', [commitId]);
    res.status(201).json({ commit: { id: rows[0].id, message: rows[0].message, createdAt: rows[0].created_at } });
});
```

- [ ] **Step 4: Run test + whole suite**

Run: `npx vitest run tests/unit/server/commitDedupe.test.js`
Expected: PASS

Run: `npx vitest run`
Expected: ALL PASS. If any existing test saved the same state twice and asserted on commit count, update it to use distinct states (vary `minimalState(title)`), since dedupe is now the intended behavior.

- [ ] **Step 5: Commit**

```bash
git add server/routes/projects.js tests/unit/server/commitDedupe.test.js
git commit -m "feat: dedupe commits whose content matches the current head"
```

---

### Task 4: Per-project commit retention pruning

**Files:**
- Modify: `server/routes/projects.js` (add `pruneCommits`, call it from `insertCommit`)
- Test: `tests/unit/server/commitRetention.test.js`

**Interfaces:**
- Consumes: `insertCommit` (Task 2) — pruning runs inside it so save/fork/merge are all covered.
- Produces: after every commit insert, only the newest `COMMIT_RETENTION_PER_PROJECT` (default 50) commits per project survive, except commits referenced by an **open** merge request (`source_commit_id` or `base_commit_id`), which are never deleted. Dangling `parent_commit_id` references after pruning are harmless (informational only). `projects.forked_from_commit_id` is deliberately **not** protected — the "forked from" link degrades gracefully to project-level.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/server/commitRetention.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState } from './helpers.js';

let app, cookie, query;
beforeAll(async () => {
    process.env.COMMIT_RETENTION_PER_PROJECT = '3';
    app = await initTestApp();
    ({ query } = await import('../../../server/db.js'));
    cookie = await signUpUser(app, { email: 'retain@test.dev', username: 'retain_u' });
});
afterAll(() => { delete process.env.COMMIT_RETENTION_PER_PROJECT; });

const makeProjectWithCommits = async (name, count) => {
    const created = await request(app).post('/api/projects').set('Cookie', cookie)
        .send({ name, state: minimalState(`${name}-0`) });
    const projectId = created.body.project.id;
    for (let i = 1; i < count; i++) {
        await request(app).post(`/api/projects/${projectId}/commits`).set('Cookie', cookie)
            .send({ state: minimalState(`${name}-${i}`), message: `c${i}` });
    }
    return projectId;
};

describe('commit retention', () => {
    it('keeps only the newest N commits per project', async () => {
        const projectId = await makeProjectWithCommits('Prune', 5);
        const list = await request(app).get(`/api/projects/${projectId}/commits`).set('Cookie', cookie);
        expect(list.body.commits.length).toBe(3);
        expect(list.body.commits.map(c => c.message)).toEqual(['c4', 'c3', 'c2']);
    });

    it('never deletes commits referenced by an open merge request', async () => {
        const projectId = await makeProjectWithCommits('MrSafe', 2);
        const list = await request(app).get(`/api/projects/${projectId}/commits`).set('Cookie', cookie);
        const oldestId = list.body.commits[list.body.commits.length - 1].id;
        await query(
            `INSERT INTO merge_requests (id, source_project_id, source_commit_id, target_project_id, base_commit_id, title, status, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, 'open', $7)`,
            ['mr-retention-1', projectId, oldestId, 'other-project', oldestId, 'keep me', 'retain_u']);
        for (let i = 2; i < 6; i++) {
            await request(app).post(`/api/projects/${projectId}/commits`).set('Cookie', cookie)
                .send({ state: minimalState(`MrSafe-${i}`), message: `c${i}` });
        }
        const rows = await query('SELECT id FROM commits WHERE id = $1', [oldestId]);
        expect(rows.length).toBe(1);
    });

    it('does not prune below the limit', async () => {
        const projectId = await makeProjectWithCommits('Small', 2);
        const list = await request(app).get(`/api/projects/${projectId}/commits`).set('Cookie', cookie);
        expect(list.body.commits.length).toBe(2);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/server/commitRetention.test.js`
Expected: FAIL — first test sees 5 commits, not 3.

- [ ] **Step 3: Implement pruning inside `insertCommit`**

In `server/routes/projects.js`, add above `insertCommit`:

```js
const retentionLimit = () => {
    const v = Number(process.env.COMMIT_RETENTION_PER_PROJECT);
    return Number.isFinite(v) && v > 0 ? v : 50;
};

// Deletes commits beyond the newest N for a project. Commits referenced by an OPEN
// merge request must survive — the MR detail page recomputes its diff from them live.
// Note $1 and $2 are the same projectId passed twice: the SQLite adapter rewrites
// placeholders positionally, so a reused $1 would mis-bind (see Global Constraints).
export const pruneCommits = async (projectId) => {
    await query(
        `DELETE FROM commits
         WHERE project_id = $1
           AND id NOT IN (SELECT id FROM commits WHERE project_id = $2 ORDER BY created_at DESC, id DESC LIMIT $3)
           AND id NOT IN (SELECT source_commit_id FROM merge_requests WHERE status = 'open')
           AND id NOT IN (SELECT base_commit_id FROM merge_requests WHERE status = 'open')`,
        [projectId, projectId, retentionLimit()]
    );
};
```

Then add one line at the end of `insertCommit`, after the `UPDATE projects SET head_commit_id ...` and before `return id;`:

```js
    await pruneCommits(projectId);
```

- [ ] **Step 4: Run test + whole suite**

Run: `npx vitest run tests/unit/server/commitRetention.test.js`
Expected: PASS

Run: `npx vitest run`
Expected: ALL PASS (default retention 50 is far above anything existing tests create).

- [ ] **Step 5: Commit**

```bash
git add server/routes/projects.js tests/unit/server/commitRetention.test.js
git commit -m "feat: prune commits beyond retention limit, protecting open merge requests"
```

---

### Task 5: Storage quota, global ceiling, project & publish caps (`server/middleware/limits.js`)

**Files:**
- Create: `server/middleware/limits.js`
- Modify: `server/routes/projects.js` (`POST /api/projects`, `POST .../commits`, `POST .../fork`, `POST .../publish`)
- Test: `tests/unit/server/storageLimits.test.js`

**Interfaces:**
- Consumes: `state_bytes` column (Task 2), `encoded.bytes` from `encodeState` (already computed in the commits route by Task 3).
- Produces (all exported from `server/middleware/limits.js`):
  - `class LimitError extends Error` with `{ status: number, code: string }`
  - `sendLimitError(res, e) -> boolean` — responds `{ error, code }` and returns `true` if `e` is a `LimitError`, else returns `false`
  - `userStorageQuotaBytes() -> number`
  - `assertStorageAllowance(userId, incomingBytes) -> Promise<void>` — throws `LimitError(507, 'SERVICE_STORAGE_FULL')` or `LimitError(413, 'STORAGE_QUOTA_EXCEEDED')`
  - `assertProjectAllowance(userId) -> Promise<void>` — throws `LimitError(403, 'PROJECT_LIMIT_REACHED')`
  - `assertPublishAllowance(userId) -> Promise<void>` — throws `LimitError(403, 'PUBLIC_LIMIT_REACHED')`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/server/storageLimits.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, PNG_1X1 } from './helpers.js';

let app, cookie;
beforeAll(async () => {
    app = await initTestApp();
    cookie = await signUpUser(app, { email: 'limits@test.dev', username: 'limits_u' });
});
afterEach(() => {
    delete process.env.USER_STORAGE_QUOTA_MB;
    delete process.env.MAX_TOTAL_STORAGE_MB;
    delete process.env.MAX_PROJECTS_PER_USER;
    delete process.env.MAX_PUBLIC_PROJECTS_PER_USER;
});

describe('storage quota', () => {
    it('rejects a commit that would exceed the per-user quota', async () => {
        const created = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'Quota', state: minimalState('q0') });
        process.env.USER_STORAGE_QUOTA_MB = '0.0000001'; // ~0.1 bytes: anything trips it
        const res = await request(app).post(`/api/projects/${created.body.project.id}/commits`)
            .set('Cookie', cookie).send({ state: minimalState('q1'), message: 'over' });
        expect(res.status).toBe(413);
        expect(res.body.code).toBe('STORAGE_QUOTA_EXCEEDED');
    });

    it('rejects project creation over the global ceiling with 507', async () => {
        process.env.MAX_TOTAL_STORAGE_MB = '0.0000001';
        const res = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'Full', state: minimalState() });
        expect(res.status).toBe(507);
        expect(res.body.code).toBe('SERVICE_STORAGE_FULL');
    });

    it('allows writes when comfortably under quota', async () => {
        const res = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'Fine', state: minimalState('fine') });
        expect(res.status).toBe(201);
    });
});

describe('project count cap', () => {
    it('rejects creating a project beyond MAX_PROJECTS_PER_USER', async () => {
        const fresh = await signUpUser(app, { email: 'cap@test.dev', username: 'cap_u' });
        process.env.MAX_PROJECTS_PER_USER = '1';
        const first = await request(app).post('/api/projects').set('Cookie', fresh)
            .send({ name: 'One', state: minimalState('one') });
        expect(first.status).toBe(201);
        const second = await request(app).post('/api/projects').set('Cookie', fresh)
            .send({ name: 'Two', state: minimalState('two') });
        expect(second.status).toBe(403);
        expect(second.body.code).toBe('PROJECT_LIMIT_REACHED');
    });

    it('rejects forking beyond the cap too', async () => {
        const owner = await signUpUser(app, { email: 'capowner@test.dev', username: 'capowner_u' });
        const pub = await request(app).post('/api/projects').set('Cookie', owner)
            .send({ name: 'Pub', state: minimalState('pub') });
        await request(app).post(`/api/projects/${pub.body.project.id}/publish`).set('Cookie', owner)
            .send({ description: '', tags: [], thumbnails: [PNG_1X1] });
        const forker = await signUpUser(app, { email: 'capfork@test.dev', username: 'capfork_u' });
        await request(app).post('/api/projects').set('Cookie', forker)
            .send({ name: 'Mine', state: minimalState('mine') });
        process.env.MAX_PROJECTS_PER_USER = '1';
        const fork = await request(app).post(`/api/projects/${pub.body.project.id}/fork`).set('Cookie', forker);
        expect(fork.status).toBe(403);
        expect(fork.body.code).toBe('PROJECT_LIMIT_REACHED');
    });
});

describe('publish cap', () => {
    it('rejects publishing beyond MAX_PUBLIC_PROJECTS_PER_USER, but re-publishing an already-public project is fine', async () => {
        const u = await signUpUser(app, { email: 'pubcap@test.dev', username: 'pubcap_u' });
        const p1 = await request(app).post('/api/projects').set('Cookie', u)
            .send({ name: 'P1', state: minimalState('p1') });
        const p2 = await request(app).post('/api/projects').set('Cookie', u)
            .send({ name: 'P2', state: minimalState('p2') });
        process.env.MAX_PUBLIC_PROJECTS_PER_USER = '1';
        const pub1 = await request(app).post(`/api/projects/${p1.body.project.id}/publish`).set('Cookie', u)
            .send({ description: '', tags: [], thumbnails: [PNG_1X1] });
        expect(pub1.status).toBe(200);
        const pub2 = await request(app).post(`/api/projects/${p2.body.project.id}/publish`).set('Cookie', u)
            .send({ description: '', tags: [], thumbnails: [PNG_1X1] });
        expect(pub2.status).toBe(403);
        expect(pub2.body.code).toBe('PUBLIC_LIMIT_REACHED');
        const repub = await request(app).post(`/api/projects/${p1.body.project.id}/publish`).set('Cookie', u)
            .send({ description: 'updated', tags: [], thumbnails: [PNG_1X1] });
        expect(repub.status).toBe(200);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/server/storageLimits.test.js`
Expected: FAIL — over-quota commit returns 201, not 413.

- [ ] **Step 3: Create `server/middleware/limits.js`**

```js
// server/middleware/limits.js
// Storage/abuse limits. All env values are read at call time (never cached at module
// load) so they are tunable per-deploy and overridable per-test-file. Fractional MB
// values are intentionally allowed — tests use tiny quotas to trip limits cheaply.
import { query } from '../db.js';

const envNum = (name, dflt) => {
    const v = Number(process.env[name]);
    return Number.isFinite(v) && v > 0 ? v : dflt;
};

export class LimitError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

// Responds with the LimitError and returns true, or returns false for anything else.
// Usage: catch (e) { if (sendLimitError(res, e)) return; throw e; }
export const sendLimitError = (res, e) => {
    if (e instanceof LimitError) {
        res.status(e.status).json({ error: e.message, code: e.code });
        return true;
    }
    return false;
};

export const userStorageQuotaBytes = () => Math.round(envNum('USER_STORAGE_QUOTA_MB', 50) * 1024 * 1024);
const globalCeilingBytes = () => Math.round(envNum('MAX_TOTAL_STORAGE_MB', 20480) * 1024 * 1024);
const maxProjectsPerUser = () => envNum('MAX_PROJECTS_PER_USER', 25);
const maxPublicProjectsPerUser = () => envNum('MAX_PUBLIC_PROJECTS_PER_USER', 20);

export const getUserStoredBytes = async (userId) => {
    const rows = await query(
        `SELECT COALESCE(SUM(c.state_bytes), 0) AS used
         FROM commits c JOIN projects p ON c.project_id = p.id
         WHERE p.owner_id = $1`, [userId]);
    return Number(rows[0].used);
};

export const assertStorageAllowance = async (userId, incomingBytes) => {
    // Global ceiling first: a hard cost kill-switch that holds even if per-user
    // accounting is ever wrong. Checked on every content write.
    const total = await query('SELECT COALESCE(SUM(state_bytes), 0) AS used FROM commits');
    if (Number(total[0].used) + incomingBytes > globalCeilingBytes()) {
        throw new LimitError(507, 'SERVICE_STORAGE_FULL',
            'Cloud storage is temporarily full. Please try again later.');
    }
    if (await getUserStoredBytes(userId) + incomingBytes > userStorageQuotaBytes()) {
        throw new LimitError(413, 'STORAGE_QUOTA_EXCEEDED',
            'Storage quota exceeded. Delete old projects from the My Projects page to free up space.');
    }
};

export const assertProjectAllowance = async (userId) => {
    const rows = await query('SELECT COUNT(*) AS n FROM projects WHERE owner_id = $1', [userId]);
    if (Number(rows[0].n) >= maxProjectsPerUser()) {
        throw new LimitError(403, 'PROJECT_LIMIT_REACHED',
            `Project limit reached (max ${maxProjectsPerUser()}). Delete a project from the My Projects page to make room.`);
    }
};

export const assertPublishAllowance = async (userId) => {
    const rows = await query(`SELECT COUNT(*) AS n FROM projects WHERE owner_id = $1 AND visibility = 'public'`, [userId]);
    if (Number(rows[0].n) >= maxPublicProjectsPerUser()) {
        throw new LimitError(403, 'PUBLIC_LIMIT_REACHED',
            `Published project limit reached (max ${maxPublicProjectsPerUser()}). Unpublish one to publish another.`);
    }
};
```

- [ ] **Step 4: Wire into `server/routes/projects.js`**

Add the import:

```js
import { assertStorageAllowance, assertProjectAllowance, assertPublishAllowance, sendLimitError } from '../middleware/limits.js';
```

`POST /api/projects` — after the `validateAppState` check, replace the insert section with:

```js
    const encoded = encodeState(state);
    try {
        await assertProjectAllowance(req.user.id);
        await assertStorageAllowance(req.user.id, encoded.bytes);
    } catch (e) {
        if (sendLimitError(res, e)) return;
        throw e;
    }

    const projectId = randomUUID();
    await query(
        `INSERT INTO projects (id, owner_id, name) VALUES ($1, $2, $3)`,
        [projectId, req.user.id, n]
    );
    const commitId = await insertCommit({ projectId, parentCommitId: null, message: cleanMessage(message ?? 'Initial save'), state, userId: req.user.id, encoded });
```

`POST /api/projects/:id/commits` — after the dedupe block (Task 3) and before `insertCommit`:

```js
    try {
        await assertStorageAllowance(req.user.id, encoded.bytes);
    } catch (e) {
        if (sendLimitError(res, e)) return;
        throw e;
    }
```

`POST /api/projects/:id/fork` — after the `headRows[0]` existence check (the SELECT already includes `state_bytes` from Task 2):

```js
    try {
        await assertProjectAllowance(req.user.id);
        await assertStorageAllowance(req.user.id, Number(headRows[0].state_bytes ?? 0));
    } catch (e) {
        if (sendLimitError(res, e)) return;
        throw e;
    }
```

`POST /api/projects/:id/publish` — at the top of the handler, before thumbnail validation (only when the project is currently private, so metadata/thumbnail updates to an already-public project never count against the cap):

```js
    if (req.project.visibility !== 'public') {
        try {
            await assertPublishAllowance(req.user.id);
        } catch (e) {
            if (sendLimitError(res, e)) return;
            throw e;
        }
    }
```

- [ ] **Step 5: Run test + whole suite**

Run: `npx vitest run tests/unit/server/storageLimits.test.js`
Expected: PASS

Run: `npx vitest run`
Expected: ALL PASS (defaults are far above anything existing tests create).

- [ ] **Step 6: Commit**

```bash
git add server/middleware/limits.js server/routes/projects.js tests/unit/server/storageLimits.test.js
git commit -m "feat: enforce per-user storage quota, global ceiling, project and publish caps"
```

---

### Task 6: Per-user commit rate limit

**Files:**
- Modify: `server/middleware/limits.js` (add `userWriteLimiter`)
- Modify: `server/routes/projects.js` (apply to the three content-creating routes)
- Test: `tests/unit/server/userRateLimit.test.js`

**Interfaces:**
- Consumes: `req.user` set by `requireAuth` — the limiter MUST be placed **after** `requireAuth` in each route's middleware chain.
- Produces: `userWriteLimiter` (express-rate-limit instance, 1-hour window, `USER_COMMITS_PER_HOUR` max, keyed by user id, shared across `POST /api/projects`, `POST .../commits`, `POST .../fork`). Over-limit responds 429 `{ error, code: 'RATE_LIMITED' }`. This is defense-in-depth alongside the existing IP-based `writeLimiter` in `server/app.js` — IP limits die behind NAT/VPN; this one doesn't.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/server/userRateLimit.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState } from './helpers.js';

let app;
beforeAll(async () => {
    process.env.USER_COMMITS_PER_HOUR = '2';
    app = await initTestApp();
});
afterAll(() => { delete process.env.USER_COMMITS_PER_HOUR; });

describe('per-user write rate limit', () => {
    it('blocks a user after USER_COMMITS_PER_HOUR content writes, without affecting other users', async () => {
        const heavy = await signUpUser(app, { email: 'heavy@test.dev', username: 'heavy_u' });
        const calm = await signUpUser(app, { email: 'calm@test.dev', username: 'calm_u' });

        const p = await request(app).post('/api/projects').set('Cookie', heavy)
            .send({ name: 'R1', state: minimalState('r0') });                          // write 1
        expect(p.status).toBe(201);
        const c1 = await request(app).post(`/api/projects/${p.body.project.id}/commits`)
            .set('Cookie', heavy).send({ state: minimalState('r1'), message: 'c1' });   // write 2
        expect(c1.status).toBe(201);
        const c2 = await request(app).post(`/api/projects/${p.body.project.id}/commits`)
            .set('Cookie', heavy).send({ state: minimalState('r2'), message: 'c2' });   // write 3 — over
        expect(c2.status).toBe(429);
        expect(c2.body.code).toBe('RATE_LIMITED');

        const other = await request(app).post('/api/projects').set('Cookie', calm)
            .send({ name: 'Calm', state: minimalState('calm') });
        expect(other.status).toBe(201);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/server/userRateLimit.test.js`
Expected: FAIL — third write returns 201, not 429.

- [ ] **Step 3: Add the limiter to `server/middleware/limits.js`**

Add at the top: `import rateLimit from 'express-rate-limit';` — then append:

```js
// Per-USER write throttle for content-creating routes. Must run AFTER requireAuth
// (it keys on req.user.id). One shared instance across projects/commits/fork so the
// budget is a total, not per-route. `max` is a function so tests can tune it via env.
export const userWriteLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: () => envNum('USER_COMMITS_PER_HOUR', 60),
    keyGenerator: (req) => req.user.id,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many saves in the last hour. Please slow down and try again later.', code: 'RATE_LIMITED' }
});
```

- [ ] **Step 4: Apply it in `server/routes/projects.js`**

Add `userWriteLimiter` to the import from `../middleware/limits.js`, then change the three route signatures:

```js
router.post('/api/projects', requireAuth, requireUsername, userWriteLimiter, async (req, res) => {
```
```js
router.post('/api/projects/:id/commits', requireAuth, requireUsername, userWriteLimiter, loadProject(true), async (req, res) => {
```
```js
router.post('/api/projects/:id/fork', requireAuth, requireUsername, userWriteLimiter, loadProject(false), async (req, res) => {
```

- [ ] **Step 5: Run test + whole suite**

Run: `npx vitest run tests/unit/server/userRateLimit.test.js`
Expected: PASS

Run: `npx vitest run`
Expected: ALL PASS. If any existing test file makes more than 60 content writes with a single user (unlikely), set `process.env.USER_COMMITS_PER_HOUR` higher in that file's `beforeAll`.

- [ ] **Step 6: Commit**

```bash
git add server/middleware/limits.js server/routes/projects.js tests/unit/server/userRateLimit.test.js
git commit -m "feat: per-user hourly rate limit on content-creating routes"
```

---

### Task 7: Storage usage in `GET /api/projects`

**Files:**
- Modify: `server/routes/projects.js` (`GET /api/projects`, currently lines 67–71)
- Test: `tests/unit/server/projectsUsage.test.js`

**Interfaces:**
- Consumes: `state_bytes` (Task 2), `userStorageQuotaBytes` (Task 5).
- Produces: `GET /api/projects` response becomes `{ projects: [{ ...existing project DTO, storedBytes: number, commitCount: number }], usage: { usedBytes: number, quotaBytes: number } }`. The `projects` array keys are strictly additive — existing consumers keep working. Task 8's client relies on exactly these names.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/server/projectsUsage.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState } from './helpers.js';

let app, cookie;
beforeAll(async () => {
    app = await initTestApp();
    cookie = await signUpUser(app, { email: 'usage@test.dev', username: 'usage_u' });
});

describe('GET /api/projects usage', () => {
    it('reports per-project size/commit count and overall usage vs quota', async () => {
        const p = await request(app).post('/api/projects').set('Cookie', cookie)
            .send({ name: 'Usage', state: minimalState('u0') });
        await request(app).post(`/api/projects/${p.body.project.id}/commits`).set('Cookie', cookie)
            .send({ state: minimalState('u1'), message: 'second' });

        const res = await request(app).get('/api/projects').set('Cookie', cookie);
        expect(res.status).toBe(200);
        const proj = res.body.projects.find(x => x.id === p.body.project.id);
        expect(proj.commitCount).toBe(2);
        expect(proj.storedBytes).toBeGreaterThan(0);
        expect(res.body.usage.usedBytes).toBeGreaterThanOrEqual(proj.storedBytes);
        expect(res.body.usage.quotaBytes).toBe(50 * 1024 * 1024);
        // Existing DTO fields must survive untouched:
        expect(proj.name).toBe('Usage');
        expect(proj.visibility).toBe('private');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/server/projectsUsage.test.js`
Expected: FAIL — `proj.commitCount` is undefined.

- [ ] **Step 3: Implement**

Add `userStorageQuotaBytes` to the import from `../middleware/limits.js`, then replace the `GET /api/projects` handler:

```js
router.get('/api/projects', requireAuth, async (req, res) => {
    // GROUP BY p.id is enough on both engines: Postgres allows selecting p.* when
    // grouping by the primary key (functional dependency); SQLite allows it natively.
    const rows = await query(
        `SELECT p.*, COALESCE(SUM(c.state_bytes), 0) AS stored_bytes, COUNT(c.id) AS commit_count
         FROM projects p LEFT JOIN commits c ON c.project_id = p.id
         WHERE p.owner_id = $1
         GROUP BY p.id
         ORDER BY p.updated_at DESC`, [req.user.id]);
    const usedBytes = rows.reduce((sum, r) => sum + Number(r.stored_bytes), 0);
    res.json({
        projects: rows.map(r => ({ ...projectDto(r), storedBytes: Number(r.stored_bytes), commitCount: Number(r.commit_count) })),
        usage: { usedBytes, quotaBytes: userStorageQuotaBytes() }
    });
});
```

- [ ] **Step 4: Run test + whole suite**

Run: `npx vitest run tests/unit/server/projectsUsage.test.js`
Expected: PASS

Run: `npx vitest run`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/projects.js tests/unit/server/projectsUsage.test.js
git commit -m "feat: report storage usage and per-project size in GET /api/projects"
```

---

### Task 8: "My projects" page — list, usage bar, delete

**Files:**
- Modify: `services/cloudApi.ts` (add `MyProject`, `listProjects`, `deleteProject`)
- Create: `pages/MyProjectsPage.tsx`
- Modify: `App.tsx` (route `/projects` behind `AuthGuard`)
- Modify: `components/AccountMenu.tsx` (dropdown link)
- Test: `tests/unit/MyProjectsPage.test.tsx`

**Interfaces:**
- Consumes: Task 7's `GET /api/projects` payload; the **existing** `DELETE /api/projects/:id` endpoint (already implemented server-side at `server/routes/projects.js:106` — no server change needed).
- Produces: `cloudApi.listProjects(): Promise<{ projects: MyProject[]; usage: { usedBytes: number; quotaBytes: number } }>` and `cloudApi.deleteProject(projectId: string): Promise<{ success: boolean }>`; route `/projects` rendering `MyProjectsPage`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/MyProjectsPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MyProjectsPage } from '../../pages/MyProjectsPage';

const mockListProjects = vi.fn();
const mockDeleteProject = vi.fn();

vi.mock('../../services/cloudApi', () => ({
    cloudApi: {
        listProjects: (...args: any[]) => mockListProjects(...args),
        deleteProject: (...args: any[]) => mockDeleteProject(...args),
    },
}));

const project = (over: any = {}) => ({
    id: 'p1', ownerId: 'u1', name: 'Weekly Planner', description: '', tags: [],
    visibility: 'private', headCommitId: 'c1', forkedFromProjectId: null, forkedFromCommitId: null,
    downloadCount: 0, forkCount: 0, createdAt: '2026-07-01', updatedAt: '2026-07-02',
    storedBytes: 2 * 1024 * 1024, commitCount: 7, ...over,
});

const renderPage = () => render(
    <MemoryRouter initialEntries={['/projects']}>
        <MyProjectsPage />
    </MemoryRouter>
);

describe('MyProjectsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockListProjects.mockResolvedValue({
            projects: [project()],
            usage: { usedBytes: 2 * 1024 * 1024, quotaBytes: 50 * 1024 * 1024 },
        });
        mockDeleteProject.mockResolvedValue({ success: true });
    });

    it('lists projects with size, commit count and visibility', async () => {
        renderPage();
        expect(await screen.findByText('Weekly Planner')).toBeInTheDocument();
        // NB: /2\.0 MB/ alone would also match the usage bar ("2.0 MB of 50.0 MB used")
        // and fail with a multiple-match error — keep the matcher scoped to the row text.
        expect(screen.getByText(/2\.0 MB · 7 versions/)).toBeInTheDocument();
        expect(screen.getByText('private')).toBeInTheDocument();
    });

    it('shows overall storage usage against the quota', async () => {
        renderPage();
        expect(await screen.findByText(/2\.0 MB of 50\.0 MB used/)).toBeInTheDocument();
    });

    it('deletes a project after confirmation and refreshes the list', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: /delete/i }));
        await waitFor(() => expect(mockDeleteProject).toHaveBeenCalledWith('p1'));
        expect(mockListProjects).toHaveBeenCalledTimes(2);
    });

    it('does not delete when confirmation is declined', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: /delete/i }));
        expect(mockDeleteProject).not.toHaveBeenCalled();
    });

    it('shows an empty state when there are no projects', async () => {
        mockListProjects.mockResolvedValue({ projects: [], usage: { usedBytes: 0, quotaBytes: 50 * 1024 * 1024 } });
        renderPage();
        expect(await screen.findByText(/no cloud projects yet/i)).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/MyProjectsPage.test.tsx`
Expected: FAIL — `Cannot find module '../../pages/MyProjectsPage'`

- [ ] **Step 3: Add the API methods to `services/cloudApi.ts`**

After the `CommitMeta` interface, add:

```ts
export interface MyProject extends CloudProject { storedBytes: number; commitCount: number; }
export interface StorageUsage { usedBytes: number; quotaBytes: number; }
```

Inside the `cloudApi` object, after `getProject`, add:

```ts
    listProjects: () =>
        api<{ projects: MyProject[]; usage: StorageUsage }>('/api/projects'),

    deleteProject: (projectId: string) =>
        api<{ success: boolean }>(`/api/projects/${projectId}`, { method: 'DELETE' }),
```

- [ ] **Step 4: Create `pages/MyProjectsPage.tsx`**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Trash2, Globe, Lock } from 'lucide-react';
import { cloudApi, MyProject, StorageUsage } from '../services/cloudApi';

const formatMB = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export function MyProjectsPage() {
    const [projects, setProjects] = useState<MyProject[] | null>(null);
    const [usage, setUsage] = useState<StorageUsage | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await cloudApi.listProjects();
            setProjects(res.projects);
            setUsage(res.usage);
            setError(null);
        } catch (e: any) {
            setError(e?.message || 'Failed to load projects');
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const onDelete = async (p: MyProject) => {
        const ok = window.confirm(
            `Delete "${p.name}" and all ${p.commitCount} of its saved versions? This cannot be undone.`
        );
        if (!ok) return;
        setDeletingId(p.id);
        try {
            await cloudApi.deleteProject(p.id);
            await load();
        } catch (e: any) {
            setError(e?.message || 'Failed to delete project');
        } finally {
            setDeletingId(null);
        }
    };

    const pct = usage ? Math.min(100, Math.round((usage.usedBytes / usage.quotaBytes) * 100)) : 0;

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="h-14 bg-white border-b flex items-center px-6 gap-4">
                <Link to="/gallery" className="flex items-center gap-1 text-sm text-slate-600 hover:text-blue-600"><ArrowLeft size={14} /> Gallery</Link>
            </header>
            <main className="max-w-2xl mx-auto p-6">
                <h1 className="text-xl font-bold text-slate-800 mb-1">My projects</h1>
                <p className="text-sm text-slate-500 mb-4">Your cloud-saved projects. Delete old ones to free up storage.</p>

                {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>}

                {usage && (
                    <div className="mb-6">
                        <div className="flex justify-between text-xs text-slate-500 mb-1">
                            <span>{formatMB(usage.usedBytes)} of {formatMB(usage.quotaBytes)} used</span>
                            <span>{pct}%</span>
                        </div>
                        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full ${pct >= 90 ? 'bg-red-500' : 'bg-blue-500'}`}
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                    </div>
                )}

                {projects === null ? (
                    <div className="p-10 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
                ) : projects.length === 0 ? (
                    <p className="text-sm text-slate-500">No cloud projects yet. Save one from the editor's Cloud menu.</p>
                ) : (
                    <ul className="space-y-2">
                        {projects.map(p => (
                            <li key={p.id} className="bg-white border border-slate-200 rounded-lg p-4 flex items-center gap-4">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-slate-800 truncate">{p.name}</span>
                                        <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${p.visibility === 'public' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                            {p.visibility === 'public' ? <Globe size={10} /> : <Lock size={10} />}
                                            {p.visibility}
                                        </span>
                                    </div>
                                    <div className="text-xs text-slate-500 mt-0.5">
                                        {formatMB(p.storedBytes)} · {p.commitCount} versions · updated {new Date(p.updatedAt).toLocaleDateString()}
                                    </div>
                                </div>
                                <button
                                    onClick={() => onDelete(p)}
                                    disabled={deletingId === p.id}
                                    className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
                                >
                                    <Trash2 size={12} /> Delete
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </main>
        </div>
    );
}
```

- [ ] **Step 5: Add the route in `App.tsx`**

Import: `import { MyProjectsPage } from './pages/MyProjectsPage';` — then after the `/account` route:

```tsx
        <Route
          path="/projects"
          element={
            <AuthGuard>
              <MyProjectsPage />
            </AuthGuard>
          }
        />
```

- [ ] **Step 6: Add the dropdown link in `components/AccountMenu.tsx`**

Change the lucide import to `import { User, LogOut, Image, Settings, FolderOpen } from 'lucide-react';` and insert between the Gallery and Account settings links:

```tsx
                    <Link to="/projects" onClick={() => setOpen(false)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"><FolderOpen size={12} /> My projects</Link>
```

- [ ] **Step 7: Run test + whole suite + build**

Run: `npx vitest run tests/unit/MyProjectsPage.test.tsx`
Expected: PASS (5 tests)

Run: `npx vitest run`
Expected: ALL PASS

Run: `npm run build`
Expected: builds cleanly (catches TS errors in cloudApi/App/AccountMenu edits).

- [ ] **Step 8: Commit**

```bash
git add services/cloudApi.ts pages/MyProjectsPage.tsx App.tsx components/AccountMenu.tsx tests/unit/MyProjectsPage.test.tsx
git commit -m "feat: My Projects page with storage usage bar and project deletion"
```

---

### Task 9: Documentation + env samples + ops notes

**Files:**
- Modify: `.env.example`
- Modify: `docs/8-cloud-and-gallery.md`

- [ ] **Step 1: Add the new env vars to `.env.example`**

Append to the `# --- Server ---` section (after `ADMIN_EMAILS=`):

```
# --- Storage limits (all optional; defaults shown) ---
# Per-user cloud storage quota in MB (counts compressed commit bytes).
USER_STORAGE_QUOTA_MB=50
# Hard global ceiling in MB across all users — cost kill-switch. Default 20 GB.
MAX_TOTAL_STORAGE_MB=20480
# Newest commits kept per project; older ones are pruned (open-MR commits always survive).
COMMIT_RETENTION_PER_PROJECT=50
# Max cloud projects per user (forks count).
MAX_PROJECTS_PER_USER=25
# Max simultaneously published (public) projects per user.
MAX_PUBLIC_PROJECTS_PER_USER=20
# Max content-creating writes (project create / save / fork) per user per hour.
USER_COMMITS_PER_HOUR=60
```

- [ ] **Step 2: Document the limits in `docs/8-cloud-and-gallery.md`**

Add a `## Storage limits and cost control` section covering, in prose:

- The six env vars, their defaults, and which HTTP status + `code` each limit returns (`STORAGE_QUOTA_EXCEEDED` 413, `SERVICE_STORAGE_FULL` 507, `PROJECT_LIMIT_REACHED` 403, `PUBLIC_LIMIT_REACHED` 403, `RATE_LIMITED` 429).
- Commit state is stored gzip-compressed (`state_gzip`), with `state_json` kept as a legacy fallback read path for pre-migration rows; quota counts stored (compressed) bytes.
- Identical saves dedupe against the head commit (`state_hash`, key-order-insensitive).
- Retention pruning runs on every commit insert; commits referenced by open merge requests are never pruned; `forked_from_commit_id` links may degrade to project-level after pruning (deliberate).
- Deliberate exclusions: the merge endpoint performs **no quota check** (same reasoning as its `requireUsername` exemption — never block an owner acting on content they already own; merge commits are still bounded by retention and the global ceiling), and thumbnails are bounded by the publish cap rather than counted in the byte quota.
- Ops note for Neon: keep the branch **history retention / PITR window** short (≤ 1 day) in the Neon console — history is billed storage and this workload is insert-heavy; also note that deleting rows does not shrink billed storage until history ages out.

- [ ] **Step 3: Run the full suite one last time**

Run: `npx vitest run`
Expected: ALL PASS

Run: `npm run build`
Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add .env.example docs/8-cloud-and-gallery.md
git commit -m "docs: storage limits, env config, and Neon cost-control notes"
```

---

### Task 10: Global storage ceiling on merge (gap fix — added after Task 9 review)

**Why this task exists:** this plan's Global Constraints originally stated "merge-created commits are still bounded by retention and the global ceiling," but Task 5 only wired `assertStorageAllowance` into `projects.js`'s four routes (create/commit/fork/publish), never into the merge endpoint. Task 9's documentation work correctly surfaced this as a real discrepancy: merge-created commits currently bypass **both** the per-user quota and the global ceiling, bounded only by per-project retention (50 commits) and the 5 MB per-commit hard cap. Confirmed by human decision: add a **global-ceiling-only** check to the merge endpoint — deliberately **not** the per-user quota (that exemption's original reasoning — never block an owner acting on content they already own — still holds for the per-user quota, but the global ceiling is a shared-cost kill-switch where "whose fault is the growth" doesn't matter).

**Files:**
- Modify: `server/middleware/limits.js` — extract `assertGlobalCeiling` out of `assertStorageAllowance` (so it can be called alone), export it.
- Modify: `server/routes/mergeRequests.js` — call `assertGlobalCeiling` in the merge route, after validating the merged state, before `insertCommit`.
- Test: `tests/unit/server/mergeGlobalCeiling.test.js`

**Interfaces:**
- Consumes: `LimitError`, `sendLimitError`, `globalCeilingBytes` (already in `server/middleware/limits.js`); `insertCommit`'s existing `encoded` param (Task 2); `encodeState` (Task 1).
- Produces: `assertGlobalCeiling(incomingBytes) -> Promise<void>`, throwing the same `LimitError(507, 'SERVICE_STORAGE_FULL')` as before. `assertStorageAllowance(userId, incomingBytes)`'s own external behavior is unchanged (it now calls `assertGlobalCeiling` internally as its first check, then the per-user check) — every existing caller/test of `assertStorageAllowance` must keep passing unmodified.
- Deliberately does **not** touch `assertProjectAllowance`, `assertPublishAllowance`, `assertStorageAllowance`'s per-user branch, `userWriteLimiter`, or `requireUsername` on the merge route — none of those apply to merging, only the global ceiling is being added.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/server/mergeGlobalCeiling.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, PNG_1X1 } from './helpers.js';

let app, ownerCookie, authorCookie;
beforeAll(async () => {
    app = await initTestApp();
    ownerCookie = await signUpUser(app, { email: 'gceilowner@test.dev', username: 'gceil_owner' });
    authorCookie = await signUpUser(app, { email: 'gceilauthor@test.dev', username: 'gceil_author' });
});
afterEach(() => {
    delete process.env.MAX_TOTAL_STORAGE_MB;
    delete process.env.USER_STORAGE_QUOTA_MB;
});

// Creates a fresh upstream (owned by ownerCookie) + fork with one real edit (by
// authorCookie) + an open merge request proposing that edit back. Returns the MR id.
// A fresh combo per test avoids depending on merge/test execution order.
const makeOpenMr = async (seed) => {
    const pub = await request(app).post('/api/projects').set('Cookie', ownerCookie)
        .send({ name: `Upstream-${seed}`, state: minimalState(`base-${seed}`) });
    const targetId = pub.body.project.id;
    await request(app).post(`/api/projects/${targetId}/publish`).set('Cookie', ownerCookie)
        .send({ description: '', tags: [], thumbnails: [PNG_1X1] });
    const fork = await request(app).post(`/api/projects/${targetId}/fork`).set('Cookie', authorCookie);
    const sourceId = fork.body.project.id;
    await request(app).post(`/api/projects/${sourceId}/commits`).set('Cookie', authorCookie)
        .send({ state: minimalState(`changed-${seed}`), message: 'edit' });
    const mr = await request(app).post('/api/merge-requests').set('Cookie', authorCookie)
        .send({ sourceProjectId: sourceId, title: `Propose-${seed}` });
    return mr.body.mergeRequest.id;
};

describe('merge respects the global storage ceiling (but not the per-user quota)', () => {
    it('rejects a merge that would exceed MAX_TOTAL_STORAGE_MB with 507', async () => {
        const mrId = await makeOpenMr('ceiling-block');
        process.env.MAX_TOTAL_STORAGE_MB = '0.0000001';
        const res = await request(app).post(`/api/merge-requests/${mrId}/merge`).set('Cookie', ownerCookie);
        expect(res.status).toBe(507);
        expect(res.body.code).toBe('SERVICE_STORAGE_FULL');
    });

    it('allows the merge once comfortably under the ceiling', async () => {
        const mrId = await makeOpenMr('ceiling-ok');
        const res = await request(app).post(`/api/merge-requests/${mrId}/merge`).set('Cookie', ownerCookie);
        expect(res.status).toBe(200);
        expect(res.body.commit.id).toBeTruthy();
    });

    it('does NOT apply the per-user quota to merges — an owner already "over" their personal quota can still receive one', async () => {
        const mrId = await makeOpenMr('quota-exempt');
        process.env.USER_STORAGE_QUOTA_MB = '0.0000001';
        const res = await request(app).post(`/api/merge-requests/${mrId}/merge`).set('Cookie', ownerCookie);
        expect(res.status).toBe(200);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/server/mergeGlobalCeiling.test.js`
Expected: FAIL — first test gets 200 instead of 507 (merge endpoint doesn't check the ceiling yet).

- [ ] **Step 3: Extract `assertGlobalCeiling` in `server/middleware/limits.js`**

Replace the existing `assertStorageAllowance` function with:

```js
export const assertGlobalCeiling = async (incomingBytes) => {
    const total = await query('SELECT COALESCE(SUM(state_bytes), 0) AS used FROM commits');
    if (Number(total[0].used) + incomingBytes > globalCeilingBytes()) {
        throw new LimitError(507, 'SERVICE_STORAGE_FULL',
            'Cloud storage is temporarily full. Please try again later.');
    }
};

export const assertStorageAllowance = async (userId, incomingBytes) => {
    // Global ceiling first: a hard cost kill-switch that holds even if per-user
    // accounting is ever wrong. Checked on every content write.
    await assertGlobalCeiling(incomingBytes);
    if (await getUserStoredBytes(userId) + incomingBytes > userStorageQuotaBytes()) {
        throw new LimitError(413, 'STORAGE_QUOTA_EXCEEDED',
            'Storage quota exceeded. Delete old projects from the My Projects page to free up space.');
    }
};
```

This is a pure refactor of the existing function — `assertStorageAllowance`'s external behavior (signature, thrown errors, order of checks) is identical to before; every existing test in `tests/unit/server/storageLimits.test.js` must keep passing unmodified.

- [ ] **Step 4: Wire into the merge route in `server/routes/mergeRequests.js`**

Add to the imports at the top:

```js
import { assertGlobalCeiling, sendLimitError } from '../middleware/limits.js';
import { encodeState } from '../stateCodec.js';
```

In the `POST /api/merge-requests/:id/merge` handler, after the existing `validateAppState` check and before the `insertCommit` call, insert:

```js
    const encoded = encodeState(merged);
    try {
        await assertGlobalCeiling(encoded.bytes);
    } catch (e) {
        if (sendLimitError(res, e)) return;
        throw e;
    }
```

Then update the `insertCommit` call immediately below it to reuse the already-computed encoding (avoiding a redundant second gzip, same optimization as Task 3's dedupe check):

```js
    const commitId = await insertCommit({
        projectId: target.id,
        parentCommitId: target.head_commit_id,
        message: `Merge: ${mr.title} (from @${users[0]?.username ?? 'unknown'})`,
        state: merged,
        userId: req.user.id,
        encoded
    });
```

- [ ] **Step 5: Run the new test, then the full suite**

Run: `npx vitest run tests/unit/server/mergeGlobalCeiling.test.js`
Expected: PASS (3 tests)

Run: `npx vitest run`
Expected: ALL PASS — in particular, every test in `tests/unit/server/storageLimits.test.js` and `tests/unit/server/mergeRequests.test.js` must be unaffected, since `assertStorageAllowance`'s contract didn't change and the merge route's existing behavior (ownership check, conflict check, validation) is untouched.

- [ ] **Step 6: Commit**

```bash
git add server/middleware/limits.js server/routes/mergeRequests.js tests/unit/server/mergeGlobalCeiling.test.js
git commit -m "feat: enforce global storage ceiling on merge (not per-user quota)"
```

- [ ] **Step 7: Update the doc section this gap was found in**

In `docs/8-cloud-and-gallery.md`'s "Storage limits and cost control" section (added in Task 9), update the "Deliberate exclusions" bullet about merging — it currently says merging performs "no quota or global-ceiling check." Change it to say merging performs no *per-user quota* check (still true, and still exempt for the same ownership reasoning) but **does** enforce the global ceiling as of this task. Also update the `.env.example`/table wording only if it referenced this exemption specifically (the six-row table itself doesn't need to change — the ceiling row's meaning is unaffected, it now simply also applies on one more code path).

Run: `npx vitest run` once more after the doc edit (should still be ALL PASS — no code changed in this step).

- [ ] **Step 8: Commit**

```bash
git add docs/8-cloud-and-gallery.md
git commit -m "docs: merge endpoint now enforces the global storage ceiling"
```

---

### Task 11: Close open merge requests when their project is deleted (final-review gap fix)

**Why this task exists:** the final whole-branch review found that `DELETE /api/projects/:id` (a pre-existing endpoint, newly given a prominent UI in Task 8) has no awareness of open merge requests. Deleting a project that's the source or target of an open MR leaves that MR permanently broken — `computeMrDiff` starts erroring forever once a referenced commit is gone — with no warning at delete time. Worse, `assertProjectAllowance`'s own error message (`server/middleware/limits.js`) directs users to this exact delete flow to free up space. Human decision: **deletion always takes priority and is never blocked** by open merge requests — but as a courtesy cleanup, any merge request still `open` or `conflicted` that references the deleted project (as either source or target) should be closed at delete time, so it stops appearing as a live, silently-broken entry in anyone's incoming/outgoing MR list.

**Files:**
- Modify: `server/routes/projects.js` — `DELETE /api/projects/:id`
- Test: `tests/unit/server/deleteProjectClosesMrs.test.js`

**Interfaces:**
- Consumes: existing `merge_requests` table (`source_project_id`, `target_project_id`, `status`, `resolved_at` columns from migration `006_merge_requests`).
- Produces: no new exports. `DELETE /api/projects/:id`'s response shape (`{ success: true }`) and status codes are unchanged — this is a side-effect added inside the existing handler, not a new endpoint.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/server/deleteProjectClosesMrs.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, PNG_1X1 } from './helpers.js';

let app, query, ownerCookie, authorCookie;
beforeAll(async () => {
    app = await initTestApp();
    ({ query } = await import('../../../server/db.js'));
    ownerCookie = await signUpUser(app, { email: 'delmr-owner@test.dev', username: 'delmr_owner' });
    authorCookie = await signUpUser(app, { email: 'delmr-author@test.dev', username: 'delmr_author' });
});

// Builds a fresh upstream (owned by ownerCookie) + fork with one edit (by authorCookie)
// + an open merge request proposing that edit back. Returns all three ids so a test can
// delete either side. A fresh combo per test avoids cross-test ordering dependencies.
const makeOpenMr = async () => {
    const pub = await request(app).post('/api/projects').set('Cookie', ownerCookie)
        .send({ name: 'Upstream', state: minimalState('base') });
    const targetId = pub.body.project.id;
    await request(app).post(`/api/projects/${targetId}/publish`).set('Cookie', ownerCookie)
        .send({ description: '', tags: [], thumbnails: [PNG_1X1] });
    const fork = await request(app).post(`/api/projects/${targetId}/fork`).set('Cookie', authorCookie);
    const sourceId = fork.body.project.id;
    await request(app).post(`/api/projects/${sourceId}/commits`).set('Cookie', authorCookie)
        .send({ state: minimalState('changed'), message: 'edit' });
    const mr = await request(app).post('/api/merge-requests').set('Cookie', authorCookie)
        .send({ sourceProjectId: sourceId, title: 'Propose' });
    return { mrId: mr.body.mergeRequest.id, targetId, sourceId };
};

describe('deleting a project closes any open MRs referencing it', () => {
    it('closes an open MR when its SOURCE (fork) project is deleted', async () => {
        const { mrId, sourceId } = await makeOpenMr();
        const del = await request(app).delete(`/api/projects/${sourceId}`).set('Cookie', authorCookie);
        expect(del.status).toBe(200);
        const rows = await query('SELECT status FROM merge_requests WHERE id = $1', [mrId]);
        expect(rows[0].status).toBe('closed');
    });

    it('closes an open MR when its TARGET (upstream) project is deleted', async () => {
        const { mrId, targetId } = await makeOpenMr();
        const del = await request(app).delete(`/api/projects/${targetId}`).set('Cookie', ownerCookie);
        expect(del.status).toBe(200);
        const rows = await query('SELECT status FROM merge_requests WHERE id = $1', [mrId]);
        expect(rows[0].status).toBe('closed');
    });

    it('deletion still succeeds even though it closes MRs -- never blocked', async () => {
        const { targetId } = await makeOpenMr();
        const del = await request(app).delete(`/api/projects/${targetId}`).set('Cookie', ownerCookie);
        expect(del.status).toBe(200);
        expect(del.body.success).toBe(true);
        const getRes = await request(app).get(`/api/projects/${targetId}`).set('Cookie', ownerCookie);
        expect(getRes.status).toBe(404);
    });

    it('does not re-touch an already-closed MR\'s resolved_at when its project is later deleted', async () => {
        const { mrId, targetId } = await makeOpenMr();
        await request(app).post(`/api/merge-requests/${mrId}/close`).set('Cookie', ownerCookie);
        const before = await query('SELECT resolved_at FROM merge_requests WHERE id = $1', [mrId]);
        const resolvedAtBefore = before[0].resolved_at;
        await request(app).delete(`/api/projects/${targetId}`).set('Cookie', ownerCookie);
        const after = await query('SELECT status, resolved_at FROM merge_requests WHERE id = $1', [mrId]);
        expect(after[0].status).toBe('closed');
        expect(after[0].resolved_at).toBe(resolvedAtBefore);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/server/deleteProjectClosesMrs.test.js`
Expected: FAIL — first two tests see `status` still `'open'` (or `'conflicted'`) after deletion, since nothing closes it yet.

- [ ] **Step 3: Update `DELETE /api/projects/:id` in `server/routes/projects.js`**

```js
router.delete('/api/projects/:id', requireAuth, loadProject(true), async (req, res) => {
    // Deletion always proceeds -- it is never blocked by open merge requests (a project
    // owner's right to delete their own data takes priority). But an MR still open or
    // conflicted that references this project (as source or target) would otherwise be
    // left permanently broken once its referenced commits are gone (computeMrDiff starts
    // erroring forever), sitting silently in someone's incoming/outgoing list with no
    // warning. Closing it here is a courtesy cleanup, not a safety gate -- it runs
    // unconditionally and never prevents or delays the delete itself.
    await query(
        `UPDATE merge_requests SET status = 'closed', resolved_at = CURRENT_TIMESTAMP
         WHERE (source_project_id = $1 OR target_project_id = $2) AND status IN ('open', 'conflicted')`,
        [req.project.id, req.project.id]
    );
    await query('DELETE FROM commits WHERE project_id = $1', [req.project.id]);
    await query('DELETE FROM projects WHERE id = $1', [req.project.id]);
    res.json({ success: true });
});
```

Note `$1`/`$2` both bind `req.project.id` as two separate params (`[req.project.id, req.project.id]`) — per this codebase's placeholder rule (`server/db.js:26`, "each number exactly once, params in order"), never reuse a placeholder number for two occurrences of the same value; this is the same pattern already used in `pruneCommits` (Task 4).

- [ ] **Step 4: Run the new test, then the full suite**

Run: `npx vitest run tests/unit/server/deleteProjectClosesMrs.test.js`
Expected: PASS (4 tests)

Run: `npx vitest run`
Expected: ALL PASS — in particular, `tests/unit/server/mergeRequests.test.js` and `tests/unit/server/fork.test.js` (which also delete/interact with projects) must be unaffected.

- [ ] **Step 5: Commit**

```bash
git add server/routes/projects.js tests/unit/server/deleteProjectClosesMrs.test.js
git commit -m "fix: close open merge requests when a project they reference is deleted"
```

---

### Task 12: Rate limiter doesn't penalize rejected writes + disclose known limitations (final-review gap fix)

**Why this task exists:** the final whole-branch review found that `userWriteLimiter` (Task 6) counts every content-creating request against the hourly budget — including ones the handler itself goes on to reject with a 4xx/5xx (e.g. `PROJECT_LIMIT_REACHED`, `STORAGE_QUOTA_EXCEEDED`). This directly undercuts the recovery path the rest of this feature is built around: a user who hits a cap, follows the error message's own advice (e.g. deletes a project via the My Projects page), and retries within the same hour can find themselves additionally `RATE_LIMITED` by the earlier rejected attempts. `express-rate-limit`'s `skipFailedRequests` option (confirmed by reading the installed package source, `node_modules/express-rate-limit/dist/index.cjs`) decrements the counter for any request whose final response status is `>= 400`, via `requestWasSuccessful: (_, response) => response.statusCode < 400` — exactly the fix needed, with no other behavior change. Also folded into this task: disclosing two related findings from the final review (the non-atomic check-then-act race across all four `limits.js` assertions, and the in-memory rate-limiter store's single-instance assumption) in `docs/8-cloud-and-gallery.md`'s existing "Known Limitations / Follow-ups" section, matching the disclosure style already used there for the merge endpoint's own check-then-write race. Human decision: fix the rate-limiter penalty now (cheap, safe); disclose the other two rather than fix them now (fixing the check-then-act race would require adding transaction support to `server/db.js` itself — confirmed today to have none at all across its Postgres/SQLite backends — which is a foundational change out of proportion to this plan).

**Files:**
- Modify: `server/middleware/limits.js` — `userWriteLimiter`
- Modify: `docs/8-cloud-and-gallery.md` — "Known Limitations / Follow-ups" section
- Test: `tests/unit/server/rateLimitSkipsFailed.test.js`

**Interfaces:**
- Consumes: `userWriteLimiter` (Task 6, unchanged signature/export).
- Produces: no new exports. `userWriteLimiter`'s behavior changes only in that rejected (`>= 400`) requests no longer count toward `USER_COMMITS_PER_HOUR`.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/server/rateLimitSkipsFailed.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState } from './helpers.js';

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
        const commit = await request(app).post(`/api/projects/${first.body.project.id}/commits`)
            .set('Cookie', cookie).send({ state: minimalState('changed'), message: 'edit' });
        expect(commit.status).toBe(201);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/server/rateLimitSkipsFailed.test.js`
Expected: FAIL — final commit gets 429 instead of 201 (the 5 rejected attempts currently still consume budget).

- [ ] **Step 3: Add `skipFailedRequests: true` to `userWriteLimiter`**

In `server/middleware/limits.js`:

```js
export const userWriteLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: () => envNum('USER_COMMITS_PER_HOUR', 60),
    keyGenerator: (req) => req.user.id,
    standardHeaders: true,
    legacyHeaders: false,
    skipFailedRequests: true,
    message: { error: 'Too many saves in the last hour. Please slow down and try again later.', code: 'RATE_LIMITED' }
});
```

- [ ] **Step 4: Run the new test, then the full suite**

Run: `npx vitest run tests/unit/server/rateLimitSkipsFailed.test.js`
Expected: PASS

Run: `npx vitest run`
Expected: ALL PASS — in particular `tests/unit/server/userRateLimit.test.js` (Task 6's own test, which only exercises successful requests) must be unaffected, since `skipFailedRequests` changes nothing about how successful requests are counted.

- [ ] **Step 5: Commit**

```bash
git add server/middleware/limits.js tests/unit/server/rateLimitSkipsFailed.test.js
git commit -m "fix: don't count rejected writes against the per-user hourly rate limit"
```

- [ ] **Step 6: Disclose the two deferred findings in `docs/8-cloud-and-gallery.md`**

In the "Known Limitations / Follow-ups" section, change the intro line from "Three disclosed, unresolved findings" to "Five disclosed, unresolved findings", and add two new bullets after the existing merge-endpoint-race bullet:

```markdown
  - **No transaction or optimistic lock around the storage-limit checks in `server/middleware/limits.js`** (flagged during the storage-limits feature's final whole-branch review): `assertGlobalCeiling`, `assertStorageAllowance`'s per-user branch, `assertProjectAllowance`, and `assertPublishAllowance` each read a `SUM`/`COUNT`, compare it to a threshold, and return — the actual insert happens as a separate, later statement, with nothing holding a lock in between. Several concurrent requests from the same user (parallel tabs, or a client issuing overlapping requests) could all read the same pre-insert total, all pass the check, and all insert — jointly exceeding a cap that any one of them, checked alone, would have correctly blocked. The blast radius is bounded on every axis that matters: each individual commit is still capped at 5 MB by `validateAppState` regardless of this race, and the per-user `userWriteLimiter` caps the number of requests in the exposure window to `USER_COMMITS_PER_HOUR` (default 60) — so the worst case for the storage quota specifically is on the order of 60 × 5 MB in a single hour before the next request's check would see the (by-then-updated) total and correctly reject, and the limit self-resets every hour regardless. This is the same class of finding as the merge-endpoint race just above, and is left unresolved for the same reason: the fix requires transactional locking (`SELECT ... FOR UPDATE` or equivalent), and this codebase's `query()` abstraction (`server/db.js`) has no transaction support at all today across its Postgres/SQLite backends — adding it is a foundational change larger than either feature that has surfaced this need. A minimal mitigation, if pursued later: a maintained running-total column (updated atomically alongside insert/prune/delete) rather than a live `SUM` would close most of the window without requiring full transactions.
  - **The per-user write rate limiter's counter store is in-process memory, not shared** (flagged during the same review): `server/middleware/limits.js`'s `userWriteLimiter` uses `express-rate-limit`'s default in-memory store. This is fine for the byte-quota/cost-control goal this whole feature exists for — that accounting is entirely DB-backed via `SUM(state_bytes)`, correct regardless of how many server instances are running — but the separate per-user abuse-defense goal this specific limiter exists for ("IP limits die behind NAT/shared networks; a per-user limiter doesn't") only holds running a single server instance. If this app is ever deployed horizontally scaled behind a load balancer, each instance enforces its own independent `USER_COMMITS_PER_HOUR` budget, effectively multiplying the real limit by the instance count. A fix, if pursued: point `userWriteLimiter` at a shared store (e.g. a Postgres-backed counter table) instead of the default in-memory one.
```

- [ ] **Step 7: Run the full suite once more after the doc edit**

Run: `npx vitest run`
Expected: ALL PASS (no code changed in this step).

- [ ] **Step 8: Commit**

```bash
git add docs/8-cloud-and-gallery.md
git commit -m "docs: disclose non-atomic limit checks and single-instance rate limiter"
```
