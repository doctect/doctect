# Gallery, Cloud Projects, Fork & Merge Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public gallery where users publish planner projects, plus GitHub-style cloud saves with commit history, forking with lineage, and merge requests back to upstream — gated behind the existing better-auth authentication (issue doctect/doctect#9).

**Architecture:** The app stays local-first (localStorage). The existing Express + better-auth server (`server/`) gains a versioned SQL migration system and REST endpoints for projects/commits/gallery/forks/MRs, storing full `AppState` snapshots as immutable commits in Postgres (prod) or SQLite (dev). A dialect-agnostic diff module (`shared/diff.js`) computes three-way structured diffs (variants/templates/nodes) used by both the client (MR review UI) and the server (authoritative merge). Thumbnails are generated client-side (jsPDF → pdfjs-dist raster → WebP) and stored as blobs.

**Tech Stack:** React 19 + TypeScript + Vite (client), Express 5 + better-auth 1.4 (server), better-sqlite3 / pg, jsPDF, new deps: `pdfjs-dist`, `express-rate-limit`, `supertest` (dev).

## Global Constraints

- **Never reuse a `$n` placeholder number in a SQL string.** The SQLite adapter naively rewrites `$n` → `?` positionally. Write `$1, $2, $3...` each exactly once, params in order.
- **Never pass JS booleans as SQL params** (better-sqlite3 rejects them). Use `0`/`1` integers or TEXT values (`visibility` is TEXT: `'private'`/`'public'`).
- All IDs generated with `crypto.randomUUID()` (Node ≥ 18 global, browser global).
- All API error responses are JSON: `{ "error": "<message>" }` with an appropriate 4xx/5xx status.
- Server files are **ESM JavaScript** (`.js` with `import`), client files are TypeScript. `shared/diff.js` is plain ESM JS with JSDoc so both sides can import it.
- Max project state: **5 MB** serialized. Max thumbnails per project: **4**, each ≤ **300 KB**, WebP or PNG only.
- Unit tests: `npx vitest run <path>`. Server tests need `// @vitest-environment node` as the first line.
- Dev servers: `npm run dev` (Vite on :3000 + Express on :3001). For dev, create `.env` with `VITE_API_BASE=http://localhost:3001` (client → API) and `TRUSTED_ORIGINS=http://localhost:3000,http://localhost:3001`.
- Production note (document, don't fix): Cloud Run's filesystem is ephemeral — SQLite is dev-only; production **must** set `DATABASE_URL`.
- Commit style: `feat(scope): message` / `fix(scope): message` / `test(scope): message`.
- If a local dev SQLite migration fails because a column already exists (e.g. from an old better-auth CLI run), delete `server/analytics.db` and rerun — it holds dev-only analytics data.
- User-generated text (titles, descriptions, template text) must only ever be rendered through React text nodes. Never use `dangerouslySetInnerHTML` anywhere in this feature.

## File Map (what this plan creates/modifies)

```
server/
  db.js                    MODIFY  unified query() adapter, remove DROP TABLE hack
  migrations.js            CREATE  migration runner
  migrations/index.js      CREATE  ordered migration list (001..006)
  authRequest.js           CREATE  getAuthForRequest extracted from index.js
  app.js                   CREATE  createApp() (express app without listen)
  index.js                 MODIFY  thin bootstrap: runMigrations + listen
  auth.js                  MODIFY  username plugin, rate limit, env trustedOrigins
  middleware/guards.js     CREATE  requireAuth / optionalAuth / checkOrigin
  validateAppState.js      CREATE  structural validator for AppState JSON
  routes/me.js             CREATE  GET /api/me, GET /api/users/:username
  routes/projects.js       CREATE  projects + commits + publish + fork CRUD
  routes/gallery.js        CREATE  public gallery + thumbnails + reports + admin
  routes/mergeRequests.js  CREATE  MR create/list/get/merge/close
shared/
  diff.js                  CREATE  stableStringify, computeChangeSet, threeWayDiff, applyChangeSet
lib/auth-client.ts         MODIFY  usernameClient plugin
services/
  cloudApi.ts              CREATE  typed fetch wrapper for all /api endpoints
  thumbnailService.ts      CREATE  jsPDF → pdfjs-dist → WebP data URLs
  importProject.ts         CREATE  stageImport/consumeImport via localStorage
  pdfService.ts            MODIFY  export computePageOrder(); output:'arraybuffer' option
components/
  AccountMenu.tsx          CREATE  session dropdown for headers
  cloud/CloudMenu.tsx      CREATE  Save to cloud / History / Publish / Propose changes
  cloud/HistoryModal.tsx   CREATE  commit list + restore
  cloud/PublishModal.tsx   CREATE  metadata + page picker + thumbnail preview
  cloud/ProposeChangesModal.tsx CREATE MR creation dialog
pages/
  LoginPage.tsx            MODIFY  signup collects username
  EditorPage.tsx           MODIFY  cloud metadata on Project, import flow, CloudMenu
  GalleryPage.tsx          CREATE  browse grid
  GalleryDetailPage.tsx    CREATE  detail + open/fork/report + owner MR list
  ProfilePage.tsx          CREATE  /u/:username
  MergeRequestPage.tsx     CREATE  /mr/:id review + merge/close
App.tsx                    MODIFY  new routes
tests/unit/server/*.test.js CREATE supertest + vitest API tests
tests/unit/shared/diff.test.js CREATE diff engine tests
tests/e2e/gallery.spec.ts  CREATE  publish→browse→fork happy path
docs/8-cloud-and-gallery.md CREATE user/dev docs
.env.example               CREATE  documented env vars
```

---

# Phase 0 — Server Foundation (migrations, app factory, hardening)

Nothing user-visible ships here, but every later phase depends on it. **Critical bug being fixed:** `server/db.js` currently `DROP TABLE ... CASCADE`s all auth tables on every Postgres boot. That destroys users. It must become a run-once migration system before we store anything valuable.

### Task 1: DB query adapter + migration runner

**Files:**
- Modify: `server/db.js` (full rewrite, 144 lines currently)
- Create: `server/migrations.js`
- Create: `server/migrations/index.js`
- Test: `tests/unit/server/migrations.test.js`

**Interfaces:**
- Produces: `query(text: string, params?: any[]) => Promise<Row[]>` (accepts `$1..$n` placeholders on both dialects; returns rows for SELECT/RETURNING, `[]` otherwise), `dbType: 'postgres'|'sqlite'`, `makeUserAdmin(userId)`, `logEvent(type, payload)`, `getStats()` — all from `server/db.js`; `runMigrations() => Promise<void>` from `server/migrations.js`.
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/server/migrations.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import os from 'os';

let query, runMigrations;

beforeAll(async () => {
    process.env.SQLITE_PATH = path.join(os.tmpdir(), `doctect-mig-${Date.now()}.db`);
    delete process.env.DATABASE_URL;
    ({ query } = await import('../../../server/db.js'));
    ({ runMigrations } = await import('../../../server/migrations.js'));
});

describe('migration runner', () => {
    it('applies migrations and is idempotent', async () => {
        await runMigrations();
        await runMigrations(); // second run must not throw
        const rows = await query('SELECT id FROM app_migrations ORDER BY id');
        expect(rows.map(r => r.id)).toContain('001_auth_tables');
        expect(rows.map(r => r.id)).toContain('002_events');
    });

    it('creates auth tables usable by better-auth', async () => {
        const users = await query('SELECT * FROM "user"');
        expect(users).toEqual([]);
    });

    it('query() supports $n placeholders and RETURNING on sqlite', async () => {
        await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`, ['unit_test', '{"a":1}']);
        const rows = await query(`SELECT * FROM events WHERE type = $1`, ['unit_test']);
        expect(rows.length).toBe(1);
        expect(rows[0].payload).toBe('{"a":1}');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/server/migrations.test.js`
Expected: FAIL — `server/migrations.js` does not exist / `query` is not exported.

- [ ] **Step 3: Rewrite `server/db.js`**

Replace the whole file with:

```js
import Database from 'better-sqlite3';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db;
let type;

if (process.env.DATABASE_URL) {
    type = 'postgres';
    const { Pool } = pg;
    db = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false } // Required for Neon
    });
} else {
    type = 'sqlite';
    const dbPath = process.env.SQLITE_PATH || path.join(__dirname, 'analytics.db');
    db = new Database(dbPath);
}

export const dbType = type;

// Unified query. ALWAYS use $1..$n placeholders, each number exactly once,
// params in order. Returns array of rows (SELECT / RETURNING), else [].
export const query = async (text, params = []) => {
    if (type === 'postgres') {
        const res = await db.query(text, params);
        return res.rows ?? [];
    }
    const sqliteText = text.replace(/\$(\d+)/g, '?');
    const stmt = db.prepare(sqliteText);
    const returnsRows = /^\s*(select|pragma)/i.test(text) || /\breturning\b/i.test(text);
    if (returnsRows) return stmt.all(...params);
    stmt.run(...params);
    return [];
};

export const makeUserAdmin = async (userId) => {
    await query(`UPDATE "user" SET role = 'admin' WHERE id = $1`, [userId]);
};

export const logEvent = async (eventType, payload) => {
    await query('INSERT INTO events (type, payload) VALUES ($1, $2)', [eventType, JSON.stringify(payload)]);
};

export const getStats = async () => {
    const totalRes = await query('SELECT COUNT(*) as count FROM events');
    const byType = await query('SELECT type, COUNT(*) as count FROM events GROUP BY type');
    const recent = await query('SELECT * FROM events ORDER BY timestamp DESC LIMIT 50');
    return { total: parseInt(totalRes[0].count, 10), byType, recent };
};

export default db;
```

Note: the old inline `initPg()` with `DROP TABLE IF EXISTS verification, account, session, "user" CASCADE` is **deleted** — schema creation now lives in migrations.

- [ ] **Step 4: Create `server/migrations/index.js`**

Each migration has `id`, `pg` (SQL), and optional `sqlite` (falls back to `pg` if omitted). Statements are split on `;`.

```js
// Ordered list of migrations. NEVER edit an applied migration — append a new one.
export const migrations = [
    {
        id: '001_auth_tables',
        pg: `
            CREATE TABLE IF NOT EXISTS "user" (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
                image TEXT,
                "createdAt" TIMESTAMP NOT NULL,
                "updatedAt" TIMESTAMP NOT NULL,
                role TEXT,
                banned BOOLEAN
            );
            CREATE TABLE IF NOT EXISTS session (
                id TEXT PRIMARY KEY,
                "expiresAt" TIMESTAMP NOT NULL,
                token TEXT NOT NULL UNIQUE,
                "createdAt" TIMESTAMP NOT NULL,
                "updatedAt" TIMESTAMP NOT NULL,
                "ipAddress" TEXT,
                "userAgent" TEXT,
                "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS account (
                id TEXT PRIMARY KEY,
                "accountId" TEXT NOT NULL,
                "providerId" TEXT NOT NULL,
                "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
                "accessToken" TEXT,
                "refreshToken" TEXT,
                "idToken" TEXT,
                "accessTokenExpiresAt" TIMESTAMP,
                "refreshTokenExpiresAt" TIMESTAMP,
                scope TEXT,
                password TEXT,
                "createdAt" TIMESTAMP NOT NULL,
                "updatedAt" TIMESTAMP NOT NULL
            );
            CREATE TABLE IF NOT EXISTS verification (
                id TEXT PRIMARY KEY,
                identifier TEXT NOT NULL,
                value TEXT NOT NULL,
                "expiresAt" TIMESTAMP NOT NULL,
                "createdAt" TIMESTAMP,
                "updatedAt" TIMESTAMP
            )
        `
        // sqlite: same DDL works on better-sqlite3 (BOOLEAN/TIMESTAMP degrade to NUMERIC/TEXT affinity)
    },
    {
        id: '002_events',
        pg: `
            CREATE TABLE IF NOT EXISTS events (
                id SERIAL PRIMARY KEY,
                type TEXT NOT NULL,
                payload TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `,
        sqlite: `
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                payload TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `
    }
];
```

- [ ] **Step 5: Create `server/migrations.js`**

```js
import { query, dbType } from './db.js';
import { migrations } from './migrations/index.js';

export const runMigrations = async () => {
    await query(`CREATE TABLE IF NOT EXISTS app_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    const appliedRows = await query('SELECT id FROM app_migrations');
    const applied = new Set(appliedRows.map(r => r.id));
    for (const m of migrations) {
        if (applied.has(m.id)) continue;
        const sql = dbType === 'postgres' ? m.pg : (m.sqlite ?? m.pg);
        const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
        for (const stmt of statements) {
            await query(stmt);
        }
        await query('INSERT INTO app_migrations (id) VALUES ($1)', [m.id]);
        console.log(`[migrations] applied ${m.id}`);
    }
};
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/unit/server/migrations.test.js`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add server/db.js server/migrations.js server/migrations/index.js tests/unit/server/migrations.test.js
git commit -m "feat(server): dialect-agnostic query adapter and run-once migration system, remove destructive pg init"
```

---

### Task 2: App factory (`createApp`) + auth request extraction + supertest harness

**Files:**
- Create: `server/authRequest.js`
- Create: `server/app.js`
- Modify: `server/index.js` (full rewrite to thin bootstrap)
- Create: `tests/unit/server/helpers.js`
- Test: `tests/unit/server/app.test.js`
- Modify: `package.json` (add `supertest` devDependency)

**Interfaces:**
- Produces: `createApp() => Express` from `server/app.js`; `getAuthForRequest(req)` from `server/authRequest.js`; test helpers `initTestApp() => Promise<Express>`, `signUpUser(app, {email, username}) => Promise<string /* cookie header */>`, `minimalState(title?) => AppState`, and `PNG_1X1` (a valid 1x1 PNG data URL) from `tests/unit/server/helpers.js`. Every later server test file imports its fixtures from this one shared module — never from another `*.test.js` file (see the note in Step 2 below).
- Consumes: `runMigrations`, `query` (Task 1).

- [ ] **Step 1: Install supertest**

Run: `npm install -D supertest`
Expected: added to devDependencies.

- [ ] **Step 2: Write the failing test**

```js
// tests/unit/server/helpers.js
import path from 'path';
import os from 'os';
import request from 'supertest';

export const initTestApp = async () => {
    if (!process.env.SQLITE_PATH) {
        process.env.SQLITE_PATH = path.join(os.tmpdir(), `doctect-app-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    }
    delete process.env.DATABASE_URL;
    const { runMigrations } = await import('../../../server/migrations.js');
    await runMigrations();
    const { createApp } = await import('../../../server/app.js');
    return createApp();
};

export const signUpUser = async (app, { email, username }) => {
    const res = await request(app)
        .post('/api/auth/sign-up/email')
        .send({ email, password: 'password1234', name: username, username });
    if (res.status !== 200) throw new Error(`sign-up failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
};

// Shared fixtures. IMPORTANT: keep these in this plain (non-`.test.js`) helper module,
// never export fixtures from a `*.test.js` file and import them into another `*.test.js`
// file — Vitest gives each test file its own isolated module graph, so importing a
// named export from another spec file re-evaluates that file's module top-to-bottom,
// silently re-registering (and re-running) its entire describe/it suite a second time
// under the importing file. Always add shared test fixtures here instead.
export const minimalState = (title = 'Root') => ({
    nodes: { root: { id: 'root', parentId: null, type: 'page', title, data: {}, children: [] } },
    rootId: 'root',
    variants: { default: { id: 'default', name: 'Default', templates: { page: { id: 'page', name: 'Page', width: 500, height: 700, elements: [] } } } },
    activeVariantId: 'default',
    schemaVersion: 7
});

// Valid 1x1 transparent PNG data URL, used by every publish-related test.
export const PNG_1X1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
```

Note: `username` in the sign-up body is ignored until Task 4 adds the plugin — better-auth drops unknown fields, so this helper works from now on.

```js
// tests/unit/server/app.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp } from './helpers.js';

let app;
beforeAll(async () => { app = await initTestApp(); });

describe('app factory', () => {
    it('tracks events', async () => {
        const res = await request(app).post('/api/track').send({ type: 'unit', payload: {} });
        expect(res.status).toBe(201);
    });
    it('rejects /api/stats without a session', async () => {
        const res = await request(app).get('/api/stats');
        expect(res.status).toBe(401);
    });
    it('signs up a user via better-auth and sets a session cookie', async () => {
        const res = await request(app)
            .post('/api/auth/sign-up/email')
            .send({ email: 'first@test.dev', password: 'password1234', name: 'First' });
        expect(res.status).toBe(200);
        expect(res.headers['set-cookie']).toBeDefined();
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/server/app.test.js`
Expected: FAIL — `server/app.js` does not exist.

- [ ] **Step 4: Create `server/authRequest.js`** (moved verbatim from `server/index.js` lines 24-42, plus host allow-list)

```js
import { createAuth } from './auth.js';

const authInstances = new Map();

const allowedHosts = (process.env.ALLOWED_HOSTS || '')
    .split(',').map(h => h.trim()).filter(Boolean);

export const isHostAllowed = (host) => {
    if (allowedHosts.length === 0) return true; // unset = allow all (dev)
    return allowedHosts.includes(host);
};

export const getAuthForRequest = (req) => {
    const host = req.headers.host;
    if (!host) {
        console.warn('Missing Host header, creating ephemeral auth instance');
        return createAuth();
    }
    if (!authInstances.has(host)) {
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const baseURL = `${protocol}://${host}/api/auth`;
        authInstances.set(host, createAuth({ baseURL }));
    }
    return authInstances.get(host);
};
```

- [ ] **Step 5: Create `server/app.js`**

Move everything except migrations + `app.listen` from `server/index.js` into a factory. Content:

```js
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { toNodeHandler } from 'better-auth/node';
import { getAuthForRequest, isHostAllowed } from './authRequest.js';
import { logEvent, getStats } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const createApp = () => {
    const app = express();
    app.set('trust proxy', 1);

    const trustedOrigins = (process.env.TRUSTED_ORIGINS || 'http://localhost:3000,http://localhost:3001')
        .split(',').map(o => o.trim()).filter(Boolean);

    app.use(cors({
        origin: trustedOrigins,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
    }));

    app.use((req, res, next) => {
        if (!isHostAllowed(req.headers.host)) return res.status(400).json({ error: 'Unknown host' });
        next();
    });

    app.use('/api/auth', (req, res, next) => {
        const auth = getAuthForRequest(req);
        return toNodeHandler(auth)(req, res, next);
    });

    app.use(express.json({ limit: '8mb' }));

    const requireAdmin = async (req, res, next) => {
        try {
            const auth = getAuthForRequest(req);
            const session = await auth.api.getSession({ headers: req.headers });
            if (!session || !session.user) return res.status(401).json({ error: 'Unauthorized' });
            if (session.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden: Admins only' });
            req.user = session.user;
            next();
        } catch (error) {
            console.error('Auth Error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    };

    app.post('/api/track', async (req, res) => {
        const { type, payload } = req.body;
        try {
            await logEvent(type, payload);
            res.status(201).json({ success: true });
        } catch (err) {
            console.error('Error tracking event:', err);
            res.status(500).json({ error: 'Failed to track event' });
        }
    });

    app.get('/api/stats', requireAdmin, async (req, res) => {
        try {
            res.json(await getStats());
        } catch (err) {
            console.error('Error fetching stats:', err);
            res.status(500).json({ error: 'Failed to fetch stats' });
        }
    });

    const distPath = path.join(__dirname, '../dist');
    app.use(express.static(distPath));
    app.get(/.*/, (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });

    return app;
};
```

- [ ] **Step 6: Rewrite `server/index.js`**

```js
import 'dotenv/config';

// Polyfill for Node 18
if (!global.crypto) {
    const { webcrypto } = await import('node:crypto');
    global.crypto = webcrypto;
}

const { runMigrations } = await import('./migrations.js');
await runMigrations();

const { createApp } = await import('./app.js');
const app = createApp();

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
```

(Dynamic imports keep the crypto polyfill effective before better-auth loads, matching the old file's behavior.)

- [ ] **Step 7: Run tests, then boot the server manually**

Run: `npx vitest run tests/unit/server/` — Expected: PASS (all tests, both files).
Run: `node server/index.js` briefly — Expected: `[migrations] applied ...` then `Server running on http://localhost:3001`. Ctrl-C.

- [ ] **Step 8: Commit**

```bash
git add server/authRequest.js server/app.js server/index.js tests/unit/server/ package.json package-lock.json
git commit -m "feat(server): extract createApp factory and auth-per-host module; add supertest harness"
```

---

### Task 3: Hardening middleware (origin check, rate limits, guards)

**Files:**
- Create: `server/middleware/guards.js`
- Modify: `server/app.js` (wire middleware)
- Modify: `server/auth.js` (rate limit + env trustedOrigins)
- Create: `.env.example`
- Test: `tests/unit/server/guards.test.js`
- Modify: `package.json` (add `express-rate-limit`)

**Interfaces:**
- Produces from `server/middleware/guards.js`: `requireAuth(req,res,next)` (sets `req.user`, else 401), `optionalAuth(req,res,next)` (sets `req.user` or `null`, never fails), `checkOrigin(req,res,next)` (403 on cross-origin mutating requests), `writeLimiter` (express-rate-limit instance). All later route tasks consume these.

- [ ] **Step 1: Install dependencies**

Run: `npm install express-rate-limit helmet`

- [ ] **Step 2: Write the failing test**

```js
// tests/unit/server/guards.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp } from './helpers.js';

let app;
beforeAll(async () => { app = await initTestApp(); });

describe('security guards', () => {
    it('rejects mutating requests from untrusted origins', async () => {
        const res = await request(app)
            .post('/api/track')
            .set('Origin', 'https://evil.example.com')
            .send({ type: 'x', payload: {} });
        expect(res.status).toBe(403);
    });
    it('allows mutating requests without an Origin header (same-origin/native)', async () => {
        const res = await request(app).post('/api/track').send({ type: 'x', payload: {} });
        expect(res.status).toBe(201);
    });
    it('allows mutating requests from a trusted origin', async () => {
        const res = await request(app)
            .post('/api/track')
            .set('Origin', 'http://localhost:3000')
            .send({ type: 'x', payload: {} });
        expect(res.status).toBe(201);
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/server/guards.test.js`
Expected: FAIL — 403 not returned (guard doesn't exist yet).

- [ ] **Step 4: Create `server/middleware/guards.js`**

```js
import rateLimit from 'express-rate-limit';
import { getAuthForRequest } from '../authRequest.js';

const trustedOrigins = () => (process.env.TRUSTED_ORIGINS || 'http://localhost:3000,http://localhost:3001')
    .split(',').map(o => o.trim()).filter(Boolean);

// CSRF defense-in-depth: sameSite cookies + explicit Origin allow-list on writes.
export const checkOrigin = (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin;
    if (!origin) return next(); // same-origin form-less fetch or curl; cookies still sameSite
    const host = req.headers.host;
    if (trustedOrigins().includes(origin) || origin === `https://${host}` || origin === `http://${host}`) {
        return next();
    }
    return res.status(403).json({ error: 'Cross-origin request rejected' });
};

export const requireAuth = async (req, res, next) => {
    try {
        const auth = getAuthForRequest(req);
        const session = await auth.api.getSession({ headers: req.headers });
        if (!session || !session.user) return res.status(401).json({ error: 'Unauthorized' });
        req.user = session.user;
        next();
    } catch (error) {
        console.error('Auth Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const optionalAuth = async (req, res, next) => {
    try {
        const auth = getAuthForRequest(req);
        const session = await auth.api.getSession({ headers: req.headers });
        req.user = session?.user ?? null;
    } catch {
        req.user = null;
    }
    next();
};

export const writeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
    message: { error: 'Too many requests, slow down' }
});
```

- [ ] **Step 5: Wire into `server/app.js`**

In `createApp()`, immediately after `app.use(express.json({ limit: '8mb' }))`, add:

```js
    app.use('/api', checkOrigin);
    app.use('/api', writeLimiter);
```

with import `import { checkOrigin, writeLimiter } from './middleware/guards.js';`.

Also add security headers as the FIRST middleware in `createApp()` (before CORS):

```js
    app.use(helmet({
        contentSecurityPolicy: false, // SPA loads Google Fonts + inline styles; CSP tuning is a deferred follow-up
        crossOriginEmbedderPolicy: false
    }));
```

with import `import helmet from 'helmet';`. Verify after wiring: `node server/index.js`, then `curl -sI http://localhost:3001/api/me | grep -i x-frame` shows `X-Frame-Options` (helmet active) and the app still loads at `http://localhost:3000`. Also delete the inline `requireAdmin` from `app.js` — recreate it in `guards.js` as:

```js
export const requireAdmin = async (req, res, next) => {
    await requireAuth(req, res, () => {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden: Admins only' });
        next();
    });
};
```

and import it in `app.js` (`/api/stats` keeps working unchanged).

- [ ] **Step 6: Update `server/auth.js`**

Add to the `betterAuth({...})` config object (keep everything else as-is):

```js
        rateLimit: {
            enabled: true,
            window: 60,
            max: 20
        },
```

and make trustedOrigins env-driven — replace the existing `defaultTrustedOrigins` definition with:

```js
const defaultTrustedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    ...((process.env.TRUSTED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean))
];
```

(Read the current `server/auth.js` first; keep its existing entries if it already lists production URLs.)

- [ ] **Step 7: Create `.env.example`**

```bash
# --- Server ---
# Postgres connection string. REQUIRED in production (Cloud Run FS is ephemeral).
# Leave unset for local dev to use server/analytics.db (SQLite).
DATABASE_URL=
# Comma-separated origins allowed to call the API with credentials.
TRUSTED_ORIGINS=http://localhost:3000,http://localhost:3001
# Optional: comma-separated Host headers this server will serve auth for. Unset = allow all (dev).
ALLOWED_HOSTS=
# Comma-separated emails auto-promoted to admin on signup.
ADMIN_EMAILS=
# Google OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
# --- Client (Vite) ---
# API origin for the browser in dev (server runs on :3001). Leave empty in prod (same origin).
VITE_API_BASE=http://localhost:3001
```

- [ ] **Step 8: Run all server tests to verify pass**

Run: `npx vitest run tests/unit/server/`
Expected: PASS (migrations, app, guards).

- [ ] **Step 9: Commit**

```bash
git add server/middleware/guards.js server/app.js server/auth.js .env.example tests/unit/server/guards.test.js package.json package-lock.json
git commit -m "feat(server): origin checks, rate limiting, auth guards, env-driven trusted origins"
```

---

# Phase 1 — Auth Expansion (usernames, /api/me, account UI)

Ships: open signup with a unique public handle, visible account state in the app header.

### Task 4: better-auth username plugin + migration

**Files:**
- Modify: `server/auth.js`
- Modify: `server/migrations/index.js` (append migration `003_username`)
- Test: `tests/unit/server/username.test.js`

**Interfaces:**
- Produces: `"user"` table gains `username` (unique, lowercase) and `displayUsername` columns; sign-up accepts `username`; sessions include `user.username`. Consumed by every later route (`req.user.username`).

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/server/username.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser } from './helpers.js';

let app;
beforeAll(async () => { app = await initTestApp(); });

describe('username plugin', () => {
    it('stores username at signup and returns it in the session', async () => {
        const cookie = await signUpUser(app, { email: 'handle@test.dev', username: 'planner_pro' });
        const res = await request(app).get('/api/auth/get-session').set('Cookie', cookie);
        expect(res.status).toBe(200);
        expect(res.body.user.username).toBe('planner_pro');
    });
    it('rejects duplicate usernames', async () => {
        await signUpUser(app, { email: 'a1@test.dev', username: 'dupe' });
        const res = await request(app)
            .post('/api/auth/sign-up/email')
            .send({ email: 'a2@test.dev', password: 'password1234', name: 'A2', username: 'dupe' });
        expect(res.status).toBeGreaterThanOrEqual(400);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/server/username.test.js`
Expected: FAIL — `user.username` undefined.

- [ ] **Step 3: Add migration `003_username`**

Append to the `migrations` array in `server/migrations/index.js`:

```js
    {
        id: '003_username',
        pg: `
            ALTER TABLE "user" ADD COLUMN IF NOT EXISTS username TEXT;
            ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "displayUsername" TEXT;
            CREATE UNIQUE INDEX IF NOT EXISTS idx_user_username ON "user"(username)
        `,
        sqlite: `
            ALTER TABLE "user" ADD COLUMN username TEXT;
            ALTER TABLE "user" ADD COLUMN "displayUsername" TEXT;
            CREATE UNIQUE INDEX IF NOT EXISTS idx_user_username ON "user"(username)
        `
    }
```

(SQLite has no `ADD COLUMN IF NOT EXISTS`; migrations run once so plain `ADD COLUMN` is correct. If a stale dev DB already has the column, delete `server/analytics.db`.)

- [ ] **Step 4: Enable the plugin in `server/auth.js`**

Change the plugins import and list:

```js
import { admin, username } from "better-auth/plugins";
// ...inside betterAuth config:
        plugins: [admin(), username({ minUsernameLength: 3, maxUsernameLength: 30 })],
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/server/username.test.js`
Expected: PASS (2 tests). If the duplicate test returns 500 instead of 4xx, better-auth is not pre-checking — keep the assertion `>= 400` (it already allows this).

- [ ] **Step 6: Commit**

```bash
git add server/auth.js server/migrations/index.js tests/unit/server/username.test.js
git commit -m "feat(auth): unique public usernames via better-auth username plugin"
```

---

### Task 5: `/api/me` route

**Files:**
- Create: `server/routes/me.js`
- Modify: `server/app.js` (mount router)
- Test: `tests/unit/server/me.test.js`

**Interfaces:**
- Produces: `GET /api/me` → `{ user: { id, email, name, username, role } | null }`. (Public profile route `GET /api/users/:username` is added in Task 17 in this same file.)
- Consumes: `optionalAuth` (Task 3).

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/server/me.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser } from './helpers.js';

let app;
beforeAll(async () => { app = await initTestApp(); });

describe('GET /api/me', () => {
    it('returns null user when anonymous', async () => {
        const res = await request(app).get('/api/me');
        expect(res.status).toBe(200);
        expect(res.body.user).toBeNull();
    });
    it('returns the session user when authenticated', async () => {
        const cookie = await signUpUser(app, { email: 'me@test.dev', username: 'me_user' });
        const res = await request(app).get('/api/me').set('Cookie', cookie);
        expect(res.status).toBe(200);
        expect(res.body.user.username).toBe('me_user');
        expect(res.body.user.email).toBe('me@test.dev');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/server/me.test.js` — Expected: FAIL (404).

- [ ] **Step 3: Create `server/routes/me.js`**

```js
import { Router } from 'express';
import { optionalAuth } from '../middleware/guards.js';

const router = Router();

router.get('/api/me', optionalAuth, (req, res) => {
    if (!req.user) return res.json({ user: null });
    const { id, email, name, username, role } = req.user;
    res.json({ user: { id, email, name, username: username ?? null, role: role ?? null } });
});

export default router;
```

Mount in `server/app.js` after the guards wiring:

```js
import meRouter from './routes/me.js';
// ...
    app.use(meRouter);
```

(Mount all routers BEFORE the `express.static`/SPA-fallback block.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/server/me.test.js` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/me.js server/app.js tests/unit/server/me.test.js
git commit -m "feat(server): /api/me session endpoint"
```

---

### Task 6: Client auth — username at signup + AccountMenu

**Files:**
- Modify: `lib/auth-client.ts`
- Modify: `pages/LoginPage.tsx`
- Create: `components/AccountMenu.tsx`
- Modify: `pages/EditorPage.tsx` (header), `pages/LandingPage.tsx` (nav)

**Interfaces:**
- Produces: `authClient` with `usernameClient` plugin; `<AccountMenu />` component (no props) rendered in headers; signup form collects `username`.
- Consumes: `useSession`, `signOut` from `lib/auth-client.ts`.

- [ ] **Step 1: Update `lib/auth-client.ts`**

```ts
import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
    baseURL: import.meta.env.VITE_API_URL || (typeof window !== "undefined" ? window.location.origin + "/api/auth" : "http://localhost:3001/api/auth"),
    plugins: [usernameClient()]
});

export const { signIn, signUp, useSession, signOut } = authClient;
```

- [ ] **Step 2: Update `pages/LoginPage.tsx` signup flow**

Read the existing file first and follow its styling. Required changes only:
1. In signup mode, add a `username` text input (state `const [username, setUsername] = useState('')`), with helper text "3–30 chars, letters/numbers/underscores. Shown publicly on the gallery."
2. Client-side check before submit: `/^[a-zA-Z0-9_]{3,30}$/.test(username)`, else show inline error.
3. Pass it to better-auth: `await signUp.email({ email, password, name, username } as any)`.
4. Surface server errors from the response (`error.message`) in the existing error display.

- [ ] **Step 3: Create `components/AccountMenu.tsx`**

```tsx
import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { User, LogOut, Image } from 'lucide-react';
import { useSession, signOut } from '../lib/auth-client';

export function AccountMenu() {
    const { data: session, isPending } = useSession();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    if (isPending) return null;
    if (!session?.user) {
        return <Link to="/login" className="text-xs font-medium text-slate-500 hover:text-blue-600">Sign in</Link>;
    }
    const username = (session.user as any).username || session.user.name;
    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-blue-600"
                title="Account"
            >
                <User size={14} /> <span className="hidden md:inline">{username}</span>
            </button>
            {open && (
                <div className="absolute right-0 top-7 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50 min-w-[160px]">
                    <Link to={`/u/${username}`} onClick={() => setOpen(false)} className="block px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">My profile</Link>
                    <Link to="/gallery" onClick={() => setOpen(false)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"><Image size={12} /> Gallery</Link>
                    <button onClick={() => { setOpen(false); signOut(); }} className="w-full text-left flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                        <LogOut size={12} /> Sign out
                    </button>
                </div>
            )}
        </div>
    );
}
```

(Routes `/u/:username` and `/gallery` are added in Phase 3; dead links until then are acceptable inside this phase — they 404 to the SPA fallback.)

- [ ] **Step 4: Render it in headers**

In `pages/EditorPage.tsx`, inside the `<div className="flex items-center gap-3 hidden sm:flex">` block (line ~201), add `<AccountMenu />` before the GitHub link, with import `import { AccountMenu } from '../components/AccountMenu';`.
In `pages/LandingPage.tsx`, find the top nav (read the file; it has links to /app and /docs) and add `<AccountMenu />` alongside them.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`. In the browser at `http://localhost:3000`:
1. `/login` → sign up with a username → redirected/logged in.
2. `/app` header shows the username; Sign out works; Sign in link reappears.
3. Sign up with the same username again on a different email → inline error shown.

- [ ] **Step 6: Commit**

```bash
git add lib/auth-client.ts pages/LoginPage.tsx components/AccountMenu.tsx pages/EditorPage.tsx pages/LandingPage.tsx
git commit -m "feat(auth): signup with public username and account menu in headers"
```

---

# Phase 2 — Cloud Saves + Version History

Ships: logged-in users can link a local project to a private cloud project, save named commits, browse history, and restore old versions.

### Task 7: `validateAppState` (server-side structural validation)

**Files:**
- Create: `server/validateAppState.js`
- Test: `tests/unit/server/validateAppState.test.js`

**Interfaces:**
- Produces: `validateAppState(state: unknown) => { ok: true } | { ok: false, error: string }` and `MAX_STATE_BYTES` (5 * 1024 * 1024). Consumed by projects and MR routes.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/server/validateAppState.test.js
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { validateAppState } from '../../../server/validateAppState.js';

const goodState = () => ({
    nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
    rootId: 'root',
    variants: { default: { id: 'default', name: 'Default', templates: { page: { id: 'page', name: 'Page', width: 500, height: 700, elements: [] } } } },
    activeVariantId: 'default',
    schemaVersion: 7
});

describe('validateAppState', () => {
    it('accepts a minimal valid state', () => {
        expect(validateAppState(goodState()).ok).toBe(true);
    });
    it('rejects non-objects', () => {
        expect(validateAppState(null).ok).toBe(false);
        expect(validateAppState('hi').ok).toBe(false);
    });
    it('rejects missing rootId in nodes', () => {
        const s = goodState(); s.rootId = 'nope';
        expect(validateAppState(s).ok).toBe(false);
    });
    it('rejects malformed nodes', () => {
        const s = goodState(); s.nodes.bad = { id: 'bad' };
        expect(validateAppState(s).ok).toBe(false);
    });
    it('rejects empty variants', () => {
        const s = goodState(); s.variants = {};
        expect(validateAppState(s).ok).toBe(false);
    });
    it('rejects templates with non-numeric dimensions', () => {
        const s = goodState(); s.variants.default.templates.page.width = 'wide';
        expect(validateAppState(s).ok).toBe(false);
    });
    it('rejects oversize payloads', () => {
        const s = goodState();
        s.nodes.root.data.big = 'x'.repeat(5 * 1024 * 1024);
        expect(validateAppState(s).ok).toBe(false);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/server/validateAppState.test.js` — Expected: FAIL (module missing).

- [ ] **Step 3: Create `server/validateAppState.js`**

```js
export const MAX_STATE_BYTES = 5 * 1024 * 1024;

const fail = (error) => ({ ok: false, error });
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export const validateAppState = (state) => {
    if (!isObj(state)) return fail('state must be an object');

    let bytes;
    try { bytes = Buffer.byteLength(JSON.stringify(state), 'utf8'); }
    catch { return fail('state is not serializable'); }
    if (bytes > MAX_STATE_BYTES) return fail(`state exceeds ${MAX_STATE_BYTES} bytes`);

    if (!isObj(state.nodes)) return fail('nodes must be an object');
    if (!isStr(state.rootId) || !state.nodes[state.rootId]) return fail('rootId must reference an existing node');
    if (Object.keys(state.nodes).length > 20000) return fail('too many nodes (max 20000)');

    for (const [id, node] of Object.entries(state.nodes)) {
        if (!isObj(node)) return fail(`node ${id} must be an object`);
        if (!isStr(node.id) || node.id !== id) return fail(`node ${id} has mismatched id`);
        if (node.parentId !== null && !isStr(node.parentId)) return fail(`node ${id} parentId invalid`);
        if (!isStr(node.type)) return fail(`node ${id} missing type`);
        if (!isStr(node.title)) return fail(`node ${id} missing title`);
        if (!isObj(node.data)) return fail(`node ${id} data must be an object`);
        if (!Array.isArray(node.children) || node.children.some(c => !isStr(c))) return fail(`node ${id} children invalid`);
    }

    if (!isObj(state.variants) || Object.keys(state.variants).length === 0) return fail('variants must be a non-empty object');
    if (Object.keys(state.variants).length > 50) return fail('too many variants (max 50)');

    let totalElements = 0;
    for (const [vid, variant] of Object.entries(state.variants)) {
        if (!isObj(variant)) return fail(`variant ${vid} must be an object`);
        if (!isStr(variant.id) || !isStr(variant.name)) return fail(`variant ${vid} missing id/name`);
        if (!isObj(variant.templates)) return fail(`variant ${vid} templates must be an object`);
        for (const [tid, tpl] of Object.entries(variant.templates)) {
            if (!isObj(tpl)) return fail(`template ${vid}/${tid} must be an object`);
            if (!isStr(tpl.id) || !isStr(tpl.name)) return fail(`template ${vid}/${tid} missing id/name`);
            if (!isNum(tpl.width) || !isNum(tpl.height) || tpl.width <= 0 || tpl.height <= 0 || tpl.width > 20000 || tpl.height > 20000) {
                return fail(`template ${vid}/${tid} has invalid dimensions`);
            }
            if (!Array.isArray(tpl.elements)) return fail(`template ${vid}/${tid} elements must be an array`);
            totalElements += tpl.elements.length;
        }
    }
    if (totalElements > 50000) return fail('too many elements (max 50000)');

    return { ok: true };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/server/validateAppState.test.js` — Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add server/validateAppState.js tests/unit/server/validateAppState.test.js
git commit -m "feat(server): structural AppState validator with size caps"
```

---

### Task 8: Projects + commits schema and API

**Files:**
- Modify: `server/migrations/index.js` (append `004_projects_commits`)
- Create: `server/routes/projects.js`
- Modify: `server/app.js` (mount router)
- Test: `tests/unit/server/projects.test.js`

**Interfaces:**
- Produces (all owner-scoped unless noted; `Cookie` session auth):
  - `POST /api/projects` body `{ name, state, message? }` → 201 `{ project: {id, name, visibility, headCommitId}, commit: {id} }`
  - `GET /api/projects` → `{ projects: [{ id, name, description, visibility, headCommitId, forkedFromProjectId, updatedAt }] }`
  - `GET /api/projects/:id` → `{ project }` (owner, or anyone if `visibility='public'`)
  - `PATCH /api/projects/:id` body `{ name?, description?, tags? }` → `{ project }`
  - `DELETE /api/projects/:id` → `{ success: true }`
  - `POST /api/projects/:id/commits` body `{ state, message }` → 201 `{ commit: {id, message, createdAt} }` (moves head)
  - `GET /api/projects/:id/commits` → `{ commits: [{ id, parentCommitId, message, schemaVersion, createdBy, createdAt }] }` (no state)
  - `GET /api/projects/:id/commits/:commitId` → `{ commit: { id, message, createdAt, state } }`
- Also exports helper `getProjectRow(id) => Promise<Row|undefined>` used by gallery/fork/MR routes.
- Consumes: `requireAuth`, `optionalAuth`, `validateAppState`, `query`.

- [ ] **Step 1: Append migration `004_projects_commits`** to `server/migrations/index.js`:

```js
    {
        id: '004_projects_commits',
        pg: `
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                tags TEXT NOT NULL DEFAULT '[]',
                visibility TEXT NOT NULL DEFAULT 'private',
                head_commit_id TEXT,
                forked_from_project_id TEXT,
                forked_from_commit_id TEXT,
                download_count INTEGER NOT NULL DEFAULT 0,
                fork_count INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS commits (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                parent_commit_id TEXT,
                message TEXT NOT NULL,
                state_json TEXT NOT NULL,
                schema_version INTEGER,
                created_by TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
            CREATE INDEX IF NOT EXISTS idx_projects_visibility ON projects(visibility);
            CREATE INDEX IF NOT EXISTS idx_commits_project ON commits(project_id)
        `
    }
```

(Same SQL works on SQLite — no `sqlite` override needed. `forked_from_project_id` intentionally has no FK so forks survive upstream deletion.)

- [ ] **Step 2: Write the failing test**

```js
// tests/unit/server/projects.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState } from './helpers.js';

let app, cookieA, cookieB;
beforeAll(async () => {
    app = await initTestApp();
    cookieA = await signUpUser(app, { email: 'owner@test.dev', username: 'owner_a' });
    cookieB = await signUpUser(app, { email: 'other@test.dev', username: 'other_b' });
});

describe('projects API', () => {
    it('requires auth to create', async () => {
        const res = await request(app).post('/api/projects').send({ name: 'X', state: minimalState() });
        expect(res.status).toBe(401);
    });

    it('creates a project with an initial commit', async () => {
        const res = await request(app).post('/api/projects').set('Cookie', cookieA)
            .send({ name: 'My Planner', state: minimalState(), message: 'Initial save' });
        expect(res.status).toBe(201);
        expect(res.body.project.headCommitId).toBe(res.body.commit.id);
        expect(res.body.project.visibility).toBe('private');
    });

    it('rejects invalid states with 400', async () => {
        const res = await request(app).post('/api/projects').set('Cookie', cookieA)
            .send({ name: 'Bad', state: { nope: true } });
        expect(res.status).toBe(400);
    });

    it('lists only my projects', async () => {
        const res = await request(app).get('/api/projects').set('Cookie', cookieB);
        expect(res.status).toBe(200);
        expect(res.body.projects.every(p => p.name !== 'My Planner')).toBe(true);
    });

    it('hides private projects from non-owners', async () => {
        const create = await request(app).post('/api/projects').set('Cookie', cookieA)
            .send({ name: 'Secret', state: minimalState() });
        const res = await request(app).get(`/api/projects/${create.body.project.id}`).set('Cookie', cookieB);
        expect(res.status).toBe(404);
    });

    it('adds commits and moves head, then serves history and state', async () => {
        const create = await request(app).post('/api/projects').set('Cookie', cookieA)
            .send({ name: 'Versioned', state: minimalState('v1') });
        const pid = create.body.project.id;
        const c2 = await request(app).post(`/api/projects/${pid}/commits`).set('Cookie', cookieA)
            .send({ state: minimalState('v2'), message: 'second' });
        expect(c2.status).toBe(201);

        const list = await request(app).get(`/api/projects/${pid}/commits`).set('Cookie', cookieA);
        expect(list.body.commits.length).toBe(2);
        expect(list.body.commits[0].message).toBe('second'); // newest first

        const full = await request(app).get(`/api/projects/${pid}/commits/${c2.body.commit.id}`).set('Cookie', cookieA);
        expect(full.body.commit.state.nodes.root.title).toBe('v2');

        const proj = await request(app).get(`/api/projects/${pid}`).set('Cookie', cookieA);
        expect(proj.body.project.headCommitId).toBe(c2.body.commit.id);
    });

    it('forbids commits by non-owners', async () => {
        const create = await request(app).post('/api/projects').set('Cookie', cookieA)
            .send({ name: 'Mine', state: minimalState() });
        const res = await request(app).post(`/api/projects/${create.body.project.id}/commits`)
            .set('Cookie', cookieB).send({ state: minimalState(), message: 'hijack' });
        expect(res.status).toBe(404);
    });

    it('deletes a project', async () => {
        const create = await request(app).post('/api/projects').set('Cookie', cookieA)
            .send({ name: 'Doomed', state: minimalState() });
        const del = await request(app).delete(`/api/projects/${create.body.project.id}`).set('Cookie', cookieA);
        expect(del.status).toBe(200);
        const gone = await request(app).get(`/api/projects/${create.body.project.id}`).set('Cookie', cookieA);
        expect(gone.status).toBe(404);
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/server/projects.test.js` — Expected: FAIL (404s everywhere).

- [ ] **Step 4: Create `server/routes/projects.js`**

```js
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { query } from '../db.js';
import { requireAuth, optionalAuth } from '../middleware/guards.js';
import { validateAppState } from '../validateAppState.js';

const router = Router();

export const getProjectRow = async (id) => {
    const rows = await query('SELECT * FROM projects WHERE id = $1', [id]);
    return rows[0];
};

const projectDto = (row) => ({
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    description: row.description,
    tags: JSON.parse(row.tags || '[]'),
    visibility: row.visibility,
    headCommitId: row.head_commit_id,
    forkedFromProjectId: row.forked_from_project_id,
    forkedFromCommitId: row.forked_from_commit_id,
    downloadCount: row.download_count,
    forkCount: row.fork_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
});

export const insertCommit = async ({ projectId, parentCommitId, message, state, userId }) => {
    const id = randomUUID();
    await query(
        `INSERT INTO commits (id, project_id, parent_commit_id, message, state_json, schema_version, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, projectId, parentCommitId ?? null, message, JSON.stringify(state), state.schemaVersion ?? null, userId]
    );
    await query(`UPDATE projects SET head_commit_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [id, projectId]);
    return id;
};

const cleanName = (name) => (typeof name === 'string' ? name.trim().slice(0, 100) : '');
const cleanMessage = (m) => (typeof m === 'string' && m.trim() ? m.trim().slice(0, 500) : 'Update');

router.post('/api/projects', requireAuth, async (req, res) => {
    const { name, state, message } = req.body || {};
    const n = cleanName(name);
    if (!n) return res.status(400).json({ error: 'name is required (max 100 chars)' });
    const v = validateAppState(state);
    if (!v.ok) return res.status(400).json({ error: `invalid state: ${v.error}` });

    const projectId = randomUUID();
    await query(
        `INSERT INTO projects (id, owner_id, name) VALUES ($1, $2, $3)`,
        [projectId, req.user.id, n]
    );
    const commitId = await insertCommit({ projectId, parentCommitId: null, message: cleanMessage(message ?? 'Initial save'), state, userId: req.user.id });
    const row = await getProjectRow(projectId);
    res.status(201).json({ project: projectDto(row), commit: { id: commitId } });
});

router.get('/api/projects', requireAuth, async (req, res) => {
    const rows = await query(
        `SELECT * FROM projects WHERE owner_id = $1 ORDER BY updated_at DESC`, [req.user.id]);
    res.json({ projects: rows.map(projectDto) });
});

// Loads project; enforces visibility. Sets req.project.
export const loadProject = (requireOwner) => async (req, res, next) => {
    const row = await getProjectRow(req.params.id);
    const isOwner = row && req.user && row.owner_id === req.user.id;
    if (!row) return res.status(404).json({ error: 'Project not found' });
    if (requireOwner && !isOwner) return res.status(404).json({ error: 'Project not found' });
    if (!requireOwner && !isOwner && row.visibility !== 'public') return res.status(404).json({ error: 'Project not found' });
    req.project = row;
    req.isOwner = !!isOwner;
    next();
};

router.get('/api/projects/:id', optionalAuth, loadProject(false), (req, res) => {
    res.json({ project: projectDto(req.project) });
});

router.patch('/api/projects/:id', requireAuth, loadProject(true), async (req, res) => {
    const { name, description, tags } = req.body || {};
    const n = name !== undefined ? cleanName(name) : req.project.name;
    if (!n) return res.status(400).json({ error: 'name cannot be empty' });
    const d = description !== undefined ? String(description).slice(0, 2000) : req.project.description;
    let t = req.project.tags;
    if (tags !== undefined) {
        if (!Array.isArray(tags) || tags.length > 10 || tags.some(x => typeof x !== 'string' || x.length > 30)) {
            return res.status(400).json({ error: 'tags must be up to 10 strings of max 30 chars' });
        }
        t = JSON.stringify(tags);
    }
    await query(`UPDATE projects SET name = $1, description = $2, tags = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
        [n, d, t, req.project.id]);
    res.json({ project: projectDto(await getProjectRow(req.project.id)) });
});

router.delete('/api/projects/:id', requireAuth, loadProject(true), async (req, res) => {
    await query('DELETE FROM commits WHERE project_id = $1', [req.project.id]);
    await query('DELETE FROM projects WHERE id = $1', [req.project.id]);
    res.json({ success: true });
});

router.post('/api/projects/:id/commits', requireAuth, loadProject(true), async (req, res) => {
    const { state, message } = req.body || {};
    const v = validateAppState(state);
    if (!v.ok) return res.status(400).json({ error: `invalid state: ${v.error}` });
    const commitId = await insertCommit({
        projectId: req.project.id,
        parentCommitId: req.project.head_commit_id,
        message: cleanMessage(message),
        state,
        userId: req.user.id
    });
    const rows = await query('SELECT id, message, created_at FROM commits WHERE id = $1', [commitId]);
    res.status(201).json({ commit: { id: rows[0].id, message: rows[0].message, createdAt: rows[0].created_at } });
});

router.get('/api/projects/:id/commits', optionalAuth, loadProject(false), async (req, res) => {
    const rows = await query(
        `SELECT id, parent_commit_id, message, schema_version, created_by, created_at
         FROM commits WHERE project_id = $1 ORDER BY created_at DESC, id DESC LIMIT 200`, [req.project.id]);
    res.json({
        commits: rows.map(r => ({
            id: r.id, parentCommitId: r.parent_commit_id, message: r.message,
            schemaVersion: r.schema_version, createdBy: r.created_by, createdAt: r.created_at
        }))
    });
});

router.get('/api/projects/:id/commits/:commitId', optionalAuth, loadProject(false), async (req, res) => {
    const rows = await query('SELECT id, message, created_at, state_json FROM commits WHERE id = $1 AND project_id = $2',
        [req.params.commitId, req.project.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Commit not found' });
    res.json({ commit: { id: rows[0].id, message: rows[0].message, createdAt: rows[0].created_at, state: JSON.parse(rows[0].state_json) } });
});

export default router;
```

Mount in `server/app.js`: `import projectsRouter from './routes/projects.js';` then `app.use(projectsRouter);` next to the me router.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/server/projects.test.js` — Expected: PASS (8 tests). Then run the whole suite: `npx vitest run tests/unit/server/` — Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add server/migrations/index.js server/routes/projects.js server/app.js tests/unit/server/projects.test.js
git commit -m "feat(server): cloud projects with immutable commit history API"
```

---

### Task 9: Client cloud API service

**Files:**
- Create: `services/cloudApi.ts`

**Interfaces:**
- Produces the `cloudApi` object used by all cloud UI. Signatures (all throw `ApiError { status, message }` on non-2xx):
  - `cloudApi.me(): Promise<MeUser | null>`
  - `cloudApi.createProject(args: { name: string; state: AppState; message?: string }): Promise<{ project: CloudProject; commit: { id: string } }>`
  - `cloudApi.saveCommit(projectId: string, args: { state: AppState; message: string }): Promise<{ commit: CommitMeta }>`
  - `cloudApi.getProject(projectId): Promise<CloudProject>`, `cloudApi.listCommits(projectId): Promise<CommitMeta[]>`, `cloudApi.getCommit(projectId, commitId): Promise<{ id: string; message: string; createdAt: string; state: any }>`
  - Later tasks extend this same file with `publish`, `gallery*`, `fork`, `mergeRequests*` methods — keep everything in this one module.
- Consumes: `/api` endpoints from Task 8.

- [ ] **Step 1: Create `services/cloudApi.ts`**

```ts
import { AppState } from '../types';

export const API_BASE: string = (import.meta as any).env?.VITE_API_BASE || '';

export class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        ...opts,
    });
    let body: any = null;
    try { body = await res.json(); } catch { /* non-JSON */ }
    if (!res.ok) throw new ApiError(res.status, body?.error || `Request failed (${res.status})`);
    return body as T;
}

export interface MeUser { id: string; email: string; name: string; username: string | null; role: string | null; }
export interface CloudProject {
    id: string; ownerId: string; name: string; description: string; tags: string[];
    visibility: 'private' | 'public'; headCommitId: string | null;
    forkedFromProjectId: string | null; forkedFromCommitId: string | null;
    downloadCount: number; forkCount: number; createdAt: string; updatedAt: string;
}
export interface CommitMeta { id: string; parentCommitId: string | null; message: string; schemaVersion: number | null; createdBy: string | null; createdAt: string; }

export const cloudApi = {
    me: async (): Promise<MeUser | null> =>
        (await api<{ user: MeUser | null }>('/api/me')).user,

    createProject: (args: { name: string; state: AppState; message?: string }) =>
        api<{ project: CloudProject; commit: { id: string } }>('/api/projects', { method: 'POST', body: JSON.stringify(args) }),

    getProject: async (projectId: string) =>
        (await api<{ project: CloudProject }>(`/api/projects/${projectId}`)).project,

    saveCommit: (projectId: string, args: { state: AppState; message: string }) =>
        api<{ commit: { id: string; message: string; createdAt: string } }>(`/api/projects/${projectId}/commits`, { method: 'POST', body: JSON.stringify(args) }),

    listCommits: async (projectId: string) =>
        (await api<{ commits: CommitMeta[] }>(`/api/projects/${projectId}/commits`)).commits,

    getCommit: async (projectId: string, commitId: string) =>
        (await api<{ commit: { id: string; message: string; createdAt: string; state: any } }>(`/api/projects/${projectId}/commits/${commitId}`)).commit,
};
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (pre-existing errors, if any, are unchanged — note them in the commit message if present).

- [ ] **Step 3: Commit**

```bash
git add services/cloudApi.ts
git commit -m "feat(client): typed cloud API service"
```

---

### Task 10: EditorPage cloud integration + CloudMenu (Save to Cloud)

**Files:**
- Modify: `pages/EditorPage.tsx`
- Create: `components/cloud/CloudMenu.tsx`

**Interfaces:**
- Produces: local `Project` wrapper gains `cloud?: { projectId: string; lastSyncedCommitId: string }` and `revision?: number` (bump to force ProjectEditor remount on restore/import); `<CloudMenu project state onLinkCloud onRestoreState />`.
- Consumes: `cloudApi` (Task 9), `useSession` (Task 6), `migrateState` from `services/migration.ts`.

- [ ] **Step 1: Extend the Project interface and remount key in `pages/EditorPage.tsx`**

1. Extend the interface (line ~15) and export it:

```ts
export interface Project {
    id: string;
    name: string;
    initialState: AppState;
    cloud?: { projectId: string; lastSyncedCommitId: string };
    revision?: number;
}
```

2. Change the workspace `<div key={project.id} ...>` (line ~215) to `key={`${project.id}:${project.revision || 0}`}` so replacing `initialState` remounts `ProjectEditor` (its state is initialized from the prop once).
3. Add handlers next to `handleUpdateProjectState`:

```ts
    const handleLinkCloud = (id: string, cloud: { projectId: string; lastSyncedCommitId: string }) => {
        setProjects(prev => prev.map(p => p.id === id ? { ...p, cloud } : p));
    };

    const handleRestoreState = (id: string, state: AppState) => {
        setProjects(prev => prev.map(p => p.id === id
            ? { ...p, initialState: state, revision: (p.revision || 0) + 1 }
            : p));
    };
```

4. In the header (same block as `<AccountMenu />`), render the menu for the active project:

```tsx
    {activeProject && (
        <CloudMenu
            project={activeProject}
            onLinkCloud={(cloud) => handleLinkCloud(activeProject.id, cloud)}
            onRestoreState={(state) => handleRestoreState(activeProject.id, state)}
        />
    )}
```

where `const activeProject = projects.find(p => p.id === activeProjectId);` — note the current saved state is `activeProject.initialState` (kept fresh by the existing 1s debounce; an explicit save may lag edits by up to 1 second, acceptable).

- [ ] **Step 2: Create `components/cloud/CloudMenu.tsx`**

```tsx
import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Cloud, History, UploadCloud, Globe, GitPullRequest } from 'lucide-react';
import { useSession } from '../../lib/auth-client';
import { cloudApi, ApiError } from '../../services/cloudApi';
import { AppState } from '../../types';
import { HistoryModal } from './HistoryModal';
import type { Project } from '../../pages/EditorPage';

interface CloudMenuProps {
    project: Project;
    onLinkCloud: (cloud: { projectId: string; lastSyncedCommitId: string }) => void;
    onRestoreState: (state: AppState) => void;
}

export function CloudMenu({ project, onLinkCloud, onRestoreState }: CloudMenuProps) {
    const { data: session } = useSession();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showHistory, setShowHistory] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setError(null); }
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    const saveToCloud = async () => {
        const message = window.prompt('Describe this save (commit message):', project.cloud ? 'Update' : 'Initial save');
        if (message === null) return;
        setBusy(true); setError(null);
        try {
            if (!project.cloud) {
                const res = await cloudApi.createProject({ name: project.name, state: project.initialState, message });
                onLinkCloud({ projectId: res.project.id, lastSyncedCommitId: res.commit.id });
            } else {
                const res = await cloudApi.saveCommit(project.cloud.projectId, { state: project.initialState, message });
                onLinkCloud({ projectId: project.cloud.projectId, lastSyncedCommitId: res.commit.id });
            }
            setOpen(false);
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Save failed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="relative" ref={ref}>
            <button onClick={() => setOpen(o => !o)}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-blue-600" title="Cloud">
                <Cloud size={14} /> <span className="hidden md:inline">Cloud</span>
            </button>
            {open && (
                <div className="absolute right-0 top-7 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50 min-w-[200px]">
                    {!session?.user ? (
                        <Link to="/login" className="block px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                            Sign in to save to cloud
                        </Link>
                    ) : (
                        <>
                            <button disabled={busy} onClick={saveToCloud}
                                className="w-full text-left flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                                <UploadCloud size={12} /> {project.cloud ? 'Save to cloud' : 'Save to cloud (new)'}
                            </button>
                            {project.cloud && (
                                <button onClick={() => { setShowHistory(true); setOpen(false); }}
                                    className="w-full text-left flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                                    <History size={12} /> Version history
                                </button>
                            )}
                            {/* Publish (Task 15) and Propose changes (Task 26) buttons are appended here in later tasks */}
                            {error && <div className="px-3 py-1.5 text-xs text-red-600">{error}</div>}
                        </>
                    )}
                </div>
            )}
            {showHistory && project.cloud && (
                <HistoryModal
                    cloudProjectId={project.cloud.projectId}
                    onRestore={(state) => { onRestoreState(state); setShowHistory(false); }}
                    onClose={() => setShowHistory(false)}
                />
            )}
        </div>
    );
}
```

(`HistoryModal` is Task 11 — create a temporary stub file now so the app compiles: a component with the same props that renders `null`. Task 11 replaces it.)

- [ ] **Step 3: Manual verification**

`npm run dev`, sign in, open `/app`:
1. Cloud → "Save to cloud (new)" with a message → no error; refresh page → project still shows Cloud menu with "Version history" (cloud link persisted in `hype_projects`).
2. Signed out → menu shows "Sign in to save to cloud".

- [ ] **Step 4: Commit**

```bash
git add pages/EditorPage.tsx components/cloud/CloudMenu.tsx components/cloud/HistoryModal.tsx
git commit -m "feat(client): save projects to cloud with commit messages"
```

---

### Task 11: History modal + restore

**Files:**
- Modify (replace stub): `components/cloud/HistoryModal.tsx`

**Interfaces:**
- Produces: `<HistoryModal cloudProjectId onRestore onClose />` — `onRestore(state: AppState)` receives a **migrated** state.
- Consumes: `cloudApi.listCommits`, `cloudApi.getCommit`, `migrateState`.

- [ ] **Step 1: Implement `components/cloud/HistoryModal.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { cloudApi, CommitMeta, ApiError } from '../../services/cloudApi';
import { migrateState } from '../../services/migration';
import { AppState } from '../../types';

interface HistoryModalProps {
    cloudProjectId: string;
    onRestore: (state: AppState) => void;
    onClose: () => void;
}

export function HistoryModal({ cloudProjectId, onRestore, onClose }: HistoryModalProps) {
    const [commits, setCommits] = useState<CommitMeta[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    useEffect(() => {
        cloudApi.listCommits(cloudProjectId)
            .then(setCommits)
            .catch(e => setError(e instanceof ApiError ? e.message : 'Failed to load history'));
    }, [cloudProjectId]);

    const restore = async (commitId: string) => {
        if (!window.confirm('Replace the current editor contents with this version? (Unsaved local changes will be lost — your cloud history is untouched.)')) return;
        setBusyId(commitId); setError(null);
        try {
            const commit = await cloudApi.getCommit(cloudProjectId, commitId);
            onRestore(migrateState(commit.state));
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Restore failed');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-[480px] max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b">
                    <h2 className="font-semibold text-slate-800 text-sm">Version history</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
                </div>
                <div className="overflow-y-auto p-2">
                    {error && <div className="text-xs text-red-600 p-2">{error}</div>}
                    {!commits && !error && <div className="text-xs text-slate-400 p-2">Loading…</div>}
                    {commits?.map((c, i) => (
                        <div key={c.id} className="flex items-center justify-between gap-2 px-2 py-2 rounded hover:bg-slate-50">
                            <div className="min-w-0">
                                <div className="text-xs font-medium text-slate-800 truncate">
                                    {c.message} {i === 0 && <span className="text-[10px] text-green-600 font-semibold ml-1">HEAD</span>}
                                </div>
                                <div className="text-[10px] text-slate-400">{new Date(c.createdAt).toLocaleString()}</div>
                            </div>
                            <button disabled={busyId !== null} onClick={() => restore(c.id)}
                                className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 disabled:opacity-50 flex-shrink-0">
                                <RotateCcw size={11} /> {busyId === c.id ? 'Loading…' : 'Restore'}
                            </button>
                        </div>
                    ))}
                    {commits?.length === 0 && <div className="text-xs text-slate-400 p-2">No versions yet.</div>}
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Manual verification**

`npm run dev`, with a cloud-linked project:
1. Save twice with different node titles ("v1", then rename root and save "v2").
2. Version history lists both, newest first with HEAD badge.
3. Restore "v1" → editor content reverts (ProjectEditor remounts via revision key); undo history resets — expected.

- [ ] **Step 3: Commit**

```bash
git add components/cloud/HistoryModal.tsx
git commit -m "feat(client): version history modal with restore"
```

---

# Phase 3 — Gallery + Publishing

Ships: publish a cloud project (metadata + thumbnails) to a public gallery browsable without login; report button; admin unpublish; public profiles.

### Task 12: Thumbnails/reports schema + publish/unpublish API

**Files:**
- Modify: `server/migrations/index.js` (append `005_thumbnails_reports`)
- Modify: `server/routes/projects.js` (publish/unpublish endpoints)
- Create: `server/routes/gallery.js` (thumbnail serving only, in this task)
- Modify: `server/app.js` (mount gallery router)
- Test: `tests/unit/server/publish.test.js`

**Interfaces:**
- Produces:
  - `POST /api/projects/:id/publish` body `{ description, tags, thumbnails: string[] /* data URLs */ }` → `{ project }` (sets `visibility='public'`, replaces thumbnails)
  - `POST /api/projects/:id/unpublish` → `{ project }`
  - `GET /api/thumbnails/:thumbId` → binary image, `Cache-Control: public, max-age=86400`, `X-Content-Type-Options: nosniff`
  - Exported helper `parseThumbnail(dataUrl) => { buf: Buffer, mime: string } | null` (magic-byte validated).
- Consumes: `loadProject`, `query`, guards.

- [ ] **Step 1: Append migration `005_thumbnails_reports`** to `server/migrations/index.js`:

```js
    {
        id: '005_thumbnails_reports',
        pg: `
            CREATE TABLE IF NOT EXISTS thumbnails (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                position INTEGER NOT NULL DEFAULT 0,
                mime TEXT NOT NULL,
                image BYTEA NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS reports (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                reporter_user_id TEXT,
                reason TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_thumbnails_project ON thumbnails(project_id)
        `,
        sqlite: `
            CREATE TABLE IF NOT EXISTS thumbnails (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                position INTEGER NOT NULL DEFAULT 0,
                mime TEXT NOT NULL,
                image BLOB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS reports (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                reporter_user_id TEXT,
                reason TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_thumbnails_project ON thumbnails(project_id)
        `
    }
```

- [ ] **Step 2: Write the failing test**

```js
// tests/unit/server/publish.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, PNG_1X1 } from './helpers.js';

let app, cookie, projectId;
beforeAll(async () => {
    app = await initTestApp();
    cookie = await signUpUser(app, { email: 'pub@test.dev', username: 'publisher' });
    const res = await request(app).post('/api/projects').set('Cookie', cookie)
        .send({ name: 'Gallery Planner', state: minimalState() });
    projectId = res.body.project.id;
});

describe('publishing', () => {
    it('publishes with metadata and thumbnails', async () => {
        const res = await request(app).post(`/api/projects/${projectId}/publish`).set('Cookie', cookie)
            .send({ description: 'A lovely planner', tags: ['planner', '2026'], thumbnails: [PNG_1X1] });
        expect(res.status).toBe(200);
        expect(res.body.project.visibility).toBe('public');
        expect(res.body.project.thumbnailIds.length).toBe(1);
    });

    it('serves the thumbnail with safe headers', async () => {
        const detail = await request(app).get(`/api/projects/${projectId}`).set('Cookie', cookie);
        // thumbnailIds available via publish response; fetch via gallery route
        const pub = await request(app).post(`/api/projects/${projectId}/publish`).set('Cookie', cookie)
            .send({ description: 'x', tags: [], thumbnails: [PNG_1X1] });
        const thumbId = pub.body.project.thumbnailIds[0];
        const res = await request(app).get(`/api/thumbnails/${thumbId}`);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('image/png');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('rejects invalid thumbnail data', async () => {
        const res = await request(app).post(`/api/projects/${projectId}/publish`).set('Cookie', cookie)
            .send({ description: 'x', tags: [], thumbnails: ['data:image/png;base64,aGVsbG8='] }); // "hello", not a PNG
        expect(res.status).toBe(400);
    });

    it('rejects more than 4 thumbnails', async () => {
        const res = await request(app).post(`/api/projects/${projectId}/publish`).set('Cookie', cookie)
            .send({ description: 'x', tags: [], thumbnails: [PNG_1X1, PNG_1X1, PNG_1X1, PNG_1X1, PNG_1X1] });
        expect(res.status).toBe(400);
    });

    it('unpublishes', async () => {
        const res = await request(app).post(`/api/projects/${projectId}/unpublish`).set('Cookie', cookie);
        expect(res.status).toBe(200);
        expect(res.body.project.visibility).toBe('private');
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/server/publish.test.js` — Expected: FAIL (404).

- [ ] **Step 4: Add publish/unpublish to `server/routes/projects.js`**

Append before `export default router;`:

```js
const MAX_THUMB_BYTES = 300 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const parseThumbnail = (dataUrl) => {
    if (typeof dataUrl !== 'string') return null;
    const m = /^data:image\/(webp|png);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!m) return null;
    let buf;
    try { buf = Buffer.from(m[2], 'base64'); } catch { return null; }
    if (buf.length === 0 || buf.length > MAX_THUMB_BYTES) return null;
    const isPng = buf.length > 8 && buf.subarray(0, 8).equals(PNG_MAGIC);
    const isWebp = buf.length > 12
        && buf.subarray(0, 4).toString('ascii') === 'RIFF'
        && buf.subarray(8, 12).toString('ascii') === 'WEBP';
    if (m[1] === 'png' && !isPng) return null;
    if (m[1] === 'webp' && !isWebp) return null;
    return { buf, mime: `image/${m[1]}` };
};

export const getThumbnailIds = async (projectId) => {
    const rows = await query('SELECT id FROM thumbnails WHERE project_id = $1 ORDER BY position', [projectId]);
    return rows.map(r => r.id);
};

router.post('/api/projects/:id/publish', requireAuth, loadProject(true), async (req, res) => {
    const { description, tags, thumbnails } = req.body || {};
    if (!Array.isArray(thumbnails) || thumbnails.length < 1 || thumbnails.length > 4) {
        return res.status(400).json({ error: 'thumbnails must contain 1-4 images' });
    }
    const parsed = thumbnails.map(parseThumbnail);
    if (parsed.some(p => p === null)) {
        return res.status(400).json({ error: 'thumbnails must be valid webp/png data URLs under 300KB' });
    }
    if (!Array.isArray(tags) || tags.length > 10 || tags.some(x => typeof x !== 'string' || x.length > 30)) {
        return res.status(400).json({ error: 'tags must be up to 10 strings of max 30 chars' });
    }
    const d = String(description ?? '').slice(0, 2000);

    await query('DELETE FROM thumbnails WHERE project_id = $1', [req.project.id]);
    for (let i = 0; i < parsed.length; i++) {
        await query('INSERT INTO thumbnails (id, project_id, position, mime, image) VALUES ($1, $2, $3, $4, $5)',
            [randomUUID(), req.project.id, i, parsed[i].mime, parsed[i].buf]);
    }
    await query(`UPDATE projects SET visibility = 'public', description = $1, tags = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
        [d, JSON.stringify(tags), req.project.id]);

    const row = await getProjectRow(req.project.id);
    res.json({ project: { ...projectDto(row), thumbnailIds: await getThumbnailIds(row.id) } });
});

router.post('/api/projects/:id/unpublish', requireAuth, loadProject(true), async (req, res) => {
    await query(`UPDATE projects SET visibility = 'private' WHERE id = $1`, [req.project.id]);
    res.json({ project: projectDto(await getProjectRow(req.project.id)) });
});
```

- [ ] **Step 5: Create `server/routes/gallery.js`** (thumbnail serving; extended in Task 13)

```js
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { query } from '../db.js';
import { optionalAuth, requireAdmin } from '../middleware/guards.js';

const router = Router();

router.get('/api/thumbnails/:thumbId', async (req, res) => {
    const rows = await query('SELECT mime, image FROM thumbnails WHERE id = $1', [req.params.thumbId]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    const img = Buffer.isBuffer(rows[0].image) ? rows[0].image : Buffer.from(rows[0].image);
    res.set('Content-Type', rows[0].mime)
        .set('X-Content-Type-Options', 'nosniff')
        .set('Cache-Control', 'public, max-age=86400')
        .send(img);
});

export default router;
```

Mount in `server/app.js`: `import galleryRouter from './routes/gallery.js';` then `app.use(galleryRouter);`.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/unit/server/publish.test.js` — Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add server/migrations/index.js server/routes/projects.js server/routes/gallery.js server/app.js tests/unit/server/publish.test.js
git commit -m "feat(server): publish/unpublish with validated thumbnail storage"
```

---

### Task 13: Public gallery browse/detail/download + reports + admin unpublish

**Files:**
- Modify: `server/routes/gallery.js`
- Test: `tests/unit/server/gallery.test.js`

**Interfaces:**
- Produces (all public unless noted):
  - `GET /api/gallery?q=&sort=recent|popular&page=0` → `{ items: [{ id, name, description, tags, author, forkCount, downloadCount, updatedAt, thumbnailId }], page, hasMore }` (24 per page)
  - `GET /api/gallery/:id` → `{ project: { ...same fields, thumbnailIds: string[], forkedFrom: { projectId, name, author } | null, headCommitId } }`
  - `GET /api/gallery/:id/state` → `{ name, state }` (head commit state; increments `download_count`)
  - `POST /api/gallery/:id/report` body `{ reason }` (optionalAuth) → 201
  - `GET /api/admin/reports` (admin) → `{ reports }`; `POST /api/admin/projects/:id/unpublish` (admin) → `{ success: true }`
- Consumes: guards, `query`.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/server/gallery.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, PNG_1X1 } from './helpers.js';

let app, cookie, publicId, privateId;
beforeAll(async () => {
    app = await initTestApp();
    cookie = await signUpUser(app, { email: 'gal@test.dev', username: 'gallerist' });
    const pub = await request(app).post('/api/projects').set('Cookie', cookie)
        .send({ name: 'Public Planner', state: minimalState() });
    publicId = pub.body.project.id;
    await request(app).post(`/api/projects/${publicId}/publish`).set('Cookie', cookie)
        .send({ description: 'shiny', tags: ['planner'], thumbnails: [PNG_1X1] });
    const priv = await request(app).post('/api/projects').set('Cookie', cookie)
        .send({ name: 'Hidden', state: minimalState() });
    privateId = priv.body.project.id;
});

describe('gallery', () => {
    it('lists only public projects, anonymously', async () => {
        const res = await request(app).get('/api/gallery');
        expect(res.status).toBe(200);
        const names = res.body.items.map(i => i.name);
        expect(names).toContain('Public Planner');
        expect(names).not.toContain('Hidden');
        // Find by name: other test files may share the worker DB, so ordering isn't guaranteed.
        const item = res.body.items.find(i => i.name === 'Public Planner');
        expect(item.author).toBe('gallerist');
        expect(item.thumbnailId).toBeTruthy();
    });

    it('supports search', async () => {
        const res = await request(app).get('/api/gallery?q=nomatchxyz');
        expect(res.body.items.length).toBe(0);
    });

    it('serves detail with thumbnails', async () => {
        const res = await request(app).get(`/api/gallery/${publicId}`);
        expect(res.status).toBe(200);
        expect(res.body.project.thumbnailIds.length).toBe(1);
    });

    it('404s for private projects', async () => {
        const res = await request(app).get(`/api/gallery/${privateId}`);
        expect(res.status).toBe(404);
    });

    it('serves state and increments download count', async () => {
        const res = await request(app).get(`/api/gallery/${publicId}/state`);
        expect(res.status).toBe(200);
        expect(res.body.state.rootId).toBe('root');
        const detail = await request(app).get(`/api/gallery/${publicId}`);
        expect(detail.body.project.downloadCount).toBe(1);
    });

    it('accepts reports', async () => {
        const res = await request(app).post(`/api/gallery/${publicId}/report`).send({ reason: 'spam' });
        expect(res.status).toBe(201);
    });

    it('lets admins unpublish', async () => {
        // signUpUser creates plain users; simulate admin via direct db update
        const { query } = await import('../../../server/db.js');
        const adminCookie = await signUpUser(app, { email: 'admin@test.dev', username: 'the_admin' });
        await query(`UPDATE "user" SET role = 'admin' WHERE email = $1`, ['admin@test.dev']);
        const res = await request(app).post(`/api/admin/projects/${publicId}/unpublish`).set('Cookie', adminCookie);
        expect(res.status).toBe(200);
        const detail = await request(app).get(`/api/gallery/${publicId}`);
        expect(detail.status).toBe(404);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/server/gallery.test.js` — Expected: FAIL.

- [ ] **Step 3: Extend `server/routes/gallery.js`**

Add below the thumbnail route (before `export default router;`):

```js
const PAGE_SIZE = 24;

const cardFields = `
    p.id, p.name, p.description, p.tags, p.fork_count, p.download_count, p.updated_at,
    u.username AS author,
    (SELECT t.id FROM thumbnails t WHERE t.project_id = p.id ORDER BY t.position LIMIT 1) AS thumbnail_id
`;

const cardDto = (r) => ({
    id: r.id, name: r.name, description: r.description, tags: JSON.parse(r.tags || '[]'),
    author: r.author, forkCount: r.fork_count, downloadCount: r.download_count,
    updatedAt: r.updated_at, thumbnailId: r.thumbnail_id
});

router.get('/api/gallery', async (req, res) => {
    const q = String(req.query.q ?? '').toLowerCase().slice(0, 100);
    const sort = req.query.sort === 'popular'
        ? 'ORDER BY (p.fork_count + p.download_count) DESC, p.updated_at DESC'
        : 'ORDER BY p.updated_at DESC';
    const page = Math.max(0, parseInt(req.query.page ?? '0', 10) || 0);
    const rows = await query(
        `SELECT ${cardFields}
         FROM projects p JOIN "user" u ON u.id = p.owner_id
         WHERE p.visibility = 'public'
           AND (LOWER(p.name) LIKE $1 OR LOWER(p.description) LIKE $2)
         ${sort}
         LIMIT ${PAGE_SIZE + 1} OFFSET ${page * PAGE_SIZE}`,
        [`%${q}%`, `%${q}%`]
    );
    res.json({ items: rows.slice(0, PAGE_SIZE).map(cardDto), page, hasMore: rows.length > PAGE_SIZE });
});

const loadPublicProject = async (req, res, next) => {
    const rows = await query(
        `SELECT p.*, u.username AS author FROM projects p JOIN "user" u ON u.id = p.owner_id
         WHERE p.id = $1 AND p.visibility = 'public'`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Project not found' });
    req.publicProject = rows[0];
    next();
};

router.get('/api/gallery/:id', loadPublicProject, async (req, res) => {
    const p = req.publicProject;
    const thumbs = await query('SELECT id FROM thumbnails WHERE project_id = $1 ORDER BY position', [p.id]);
    let forkedFrom = null;
    if (p.forked_from_project_id) {
        const src = await query(
            `SELECT p.id, p.name, p.visibility, u.username AS author
             FROM projects p JOIN "user" u ON u.id = p.owner_id WHERE p.id = $1`,
            [p.forked_from_project_id]);
        if (src[0] && src[0].visibility === 'public') {
            forkedFrom = { projectId: src[0].id, name: src[0].name, author: src[0].author };
        }
    }
    res.json({
        project: {
            id: p.id, name: p.name, description: p.description, tags: JSON.parse(p.tags || '[]'),
            author: p.author, ownerId: p.owner_id, forkCount: p.fork_count, downloadCount: p.download_count,
            updatedAt: p.updated_at, headCommitId: p.head_commit_id,
            thumbnailIds: thumbs.map(t => t.id), forkedFrom
        }
    });
});

router.get('/api/gallery/:id/state', loadPublicProject, async (req, res) => {
    const p = req.publicProject;
    if (!p.head_commit_id) return res.status(404).json({ error: 'Project has no content' });
    const rows = await query('SELECT state_json FROM commits WHERE id = $1', [p.head_commit_id]);
    if (!rows[0]) return res.status(404).json({ error: 'Commit not found' });
    await query('UPDATE projects SET download_count = download_count + 1 WHERE id = $1', [p.id]);
    res.json({ name: p.name, state: JSON.parse(rows[0].state_json) });
});

router.post('/api/gallery/:id/report', optionalAuth, loadPublicProject, async (req, res) => {
    const reason = String(req.body?.reason ?? '').trim().slice(0, 500);
    if (!reason) return res.status(400).json({ error: 'reason is required' });
    await query('INSERT INTO reports (id, project_id, reporter_user_id, reason) VALUES ($1, $2, $3, $4)',
        [randomUUID(), req.publicProject.id, req.user?.id ?? null, reason]);
    res.status(201).json({ success: true });
});

router.get('/api/admin/reports', requireAdmin, async (req, res) => {
    const rows = await query(
        `SELECT r.*, p.name AS project_name FROM reports r LEFT JOIN projects p ON p.id = r.project_id
         ORDER BY r.created_at DESC LIMIT 200`, []);
    res.json({ reports: rows });
});

router.post('/api/admin/projects/:id/unpublish', requireAdmin, async (req, res) => {
    await query(`UPDATE projects SET visibility = 'private' WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/server/gallery.test.js` — Expected: PASS (7 tests). Then full server suite: `npx vitest run tests/unit/server/` — all PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/gallery.js tests/unit/server/gallery.test.js
git commit -m "feat(server): public gallery browse/detail/download, reports, admin unpublish"
```

---

### Task 14: Client thumbnail generation (pdfService refactor + pdfjs-dist)

**Files:**
- Modify: `services/pdfService.ts`
- Create: `services/thumbnailService.ts`
- Test: `tests/unit/computePageOrder.test.ts`
- Modify: `package.json` (add `pdfjs-dist`)

**Interfaces:**
- Produces: `computePageOrder(state: AppState): string[]` (ordered page node IDs, 1-based page N = index N-1) exported from `services/pdfService.ts`; `GeneratePDFOptions.output?: 'save' | 'arraybuffer'` — when `'arraybuffer'`, `generatePDF` returns `Promise<ArrayBuffer>` instead of triggering a download; `generateThumbnails(state: AppState, nodeIds: string[], variantId?: string): Promise<string[]>` (WebP-or-PNG data URLs, ≤480px wide) from `services/thumbnailService.ts`.
- Consumes: existing `generatePDF`.

- [ ] **Step 1: Install dependency**

Run: `npm install pdfjs-dist`

- [ ] **Step 2: Write the failing test**

```ts
// tests/unit/computePageOrder.test.ts
import { describe, it, expect } from 'vitest';
import { computePageOrder } from '../../services/pdfService';

const state: any = {
    rootId: 'root',
    nodes: {
        root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: ['a', 'ref', 'b'] },
        a: { id: 'a', parentId: 'root', type: 'page', title: 'A', data: {}, children: [] },
        b: { id: 'b', parentId: 'root', type: 'page', title: 'B', data: {}, children: [] },
        target: { id: 'target', parentId: null, type: 'page', title: 'T', data: {}, children: [] },
        ref: { id: 'ref', parentId: 'root', type: 'page', title: 'Ref', data: {}, children: [], referenceId: 'target' }
    },
    variants: {}, activeVariantId: 'default'
};

describe('computePageOrder', () => {
    it('returns depth-first page order, skipping reference nodes', () => {
        expect(computePageOrder(state)).toEqual(['root', 'a', 'b']);
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/computePageOrder.test.ts` — Expected: FAIL (not exported).

- [ ] **Step 4: Refactor `services/pdfService.ts`**

1. Add above `generatePDF` (near line 723):

```ts
export const computePageOrder = (state: AppState): string[] => {
    const pageNodes: string[] = [];
    const traverse = (nodeId: string) => {
        const node = state.nodes[nodeId];
        if (!node) return;
        if (!node.referenceId) {
            pageNodes.push(nodeId);
            if (node.children) node.children.forEach(childId => traverse(childId));
        }
    };
    if (state.rootId) traverse(state.rootId);
    return pageNodes;
};
```

2. Inside `generatePDF` (lines 730-745), replace the inline `pageMap`/`pageNodes` traversal with:

```ts
    const pageNodes = computePageOrder(state);
    const pageMap = new Map<string, number>(pageNodes.map((id, i) => [id, i + 1]));
```

(Keep `resolvePage` unchanged.)

3. Add `output?: 'save' | 'arraybuffer';` to `GeneratePDFOptions` (line ~723).
4. Replace the last two lines of `generatePDF` (line ~1735-1736):

```ts
    if (options.output === 'arraybuffer') {
        return doc.output('arraybuffer');
    }
    const vName = state.variants[targetVariantId]?.name || 'export';
    doc.save(`${options.projectName || 'project'}_${vName}.pdf`);
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/computePageOrder.test.ts` — Expected: PASS. Also run the full existing unit suite `npx vitest run tests/unit` to confirm nothing regressed.

- [ ] **Step 6: Create `services/thumbnailService.ts`**

```ts
import { AppState } from '../types';
import { generatePDF, computePageOrder } from './pdfService';
import * as pdfjsLib from 'pdfjs-dist';
// Vite resolves the worker as an asset URL:
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_THUMB_WIDTH = 480;

/**
 * Renders up to 4 pages of the project to compressed image data URLs.
 * WebP where the browser supports canvas.toDataURL('image/webp'), else PNG.
 */
export async function generateThumbnails(
    state: AppState,
    nodeIds: string[],
    variantId?: string
): Promise<string[]> {
    const data = (await generatePDF(state, { variantId, output: 'arraybuffer' })) as ArrayBuffer;
    const order = computePageOrder(state);
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const out: string[] = [];
    try {
        for (const nodeId of nodeIds.slice(0, 4)) {
            const idx = order.indexOf(nodeId);
            if (idx === -1) continue;
            const page = await pdf.getPage(idx + 1);
            const base = page.getViewport({ scale: 1 });
            const scale = Math.min(1, MAX_THUMB_WIDTH / base.width);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            const ctx = canvas.getContext('2d');
            if (!ctx) continue;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport }).promise;
            const webp = canvas.toDataURL('image/webp', 0.8);
            out.push(webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png'));
        }
    } finally {
        await pdf.destroy();
    }
    return out;
}
```

(If TypeScript complains about the `?url` import, add `declare module '*?url' { const url: string; export default url; }` to the project's existing ambient declarations file, or create `vite-env.d.ts` addition accordingly.)

- [ ] **Step 7: Type-check and commit**

Run: `npx tsc --noEmit` — no new errors.

```bash
git add services/pdfService.ts services/thumbnailService.ts tests/unit/computePageOrder.test.ts package.json package-lock.json
git commit -m "feat(client): render template thumbnails via jsPDF arraybuffer + pdfjs raster"
```

---

### Task 15: Publish wizard modal

**Files:**
- Create: `components/cloud/PublishModal.tsx`
- Modify: `components/cloud/CloudMenu.tsx` (add Publish button)
- Modify: `services/cloudApi.ts` (add publish/unpublish)

**Interfaces:**
- Produces: `<PublishModal project cloudProjectId onClose onPublished />`; `cloudApi.publish(projectId, { description, tags, thumbnails }): Promise<{ project: CloudProject & { thumbnailIds: string[] } }>`, `cloudApi.unpublish(projectId)`.
- Consumes: `generateThumbnails`, `computePageOrder` (Task 14), publish API (Task 12).

- [ ] **Step 1: Add to `services/cloudApi.ts`** (inside the `cloudApi` object):

```ts
    publish: (projectId: string, args: { description: string; tags: string[]; thumbnails: string[] }) =>
        api<{ project: CloudProject & { thumbnailIds: string[] } }>(`/api/projects/${projectId}/publish`, { method: 'POST', body: JSON.stringify(args) }),

    unpublish: (projectId: string) =>
        api<{ project: CloudProject }>(`/api/projects/${projectId}/unpublish`, { method: 'POST' }),
```

- [ ] **Step 2: Create `components/cloud/PublishModal.tsx`**

```tsx
import React, { useMemo, useState } from 'react';
import { X, Globe, Loader } from 'lucide-react';
import { cloudApi, ApiError } from '../../services/cloudApi';
import { computePageOrder } from '../../services/pdfService';
import { generateThumbnails } from '../../services/thumbnailService';
import type { Project } from '../../pages/EditorPage';

interface PublishModalProps {
    project: Project;
    cloudProjectId: string;
    onClose: () => void;
    onPublished: () => void;
}

export function PublishModal({ project, cloudProjectId, onClose, onPublished }: PublishModalProps) {
    const [description, setDescription] = useState('');
    const [tagsText, setTagsText] = useState('');
    const [selected, setSelected] = useState<string[]>(() => computePageOrder(project.initialState).slice(0, 1));
    const [previews, setPreviews] = useState<string[]>([]);
    const [phase, setPhase] = useState<'form' | 'rendering' | 'uploading'>('form');
    const [error, setError] = useState<string | null>(null);

    const pages = useMemo(() => {
        const order = computePageOrder(project.initialState);
        return order.slice(0, 100).map(id => ({ id, title: project.initialState.nodes[id]?.title || id }));
    }, [project.initialState]);

    const toggle = (id: string) => {
        setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : (prev.length >= 4 ? prev : [...prev, id]));
    };

    const publish = async () => {
        if (selected.length === 0) { setError('Pick at least one page for the preview.'); return; }
        setError(null);
        try {
            setPhase('rendering');
            const thumbs = await generateThumbnails(project.initialState, selected, project.initialState.activeVariantId);
            setPreviews(thumbs);
            if (thumbs.length === 0) throw new Error('Could not render previews');
            setPhase('uploading');
            const tags = tagsText.split(',').map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 10);
            await cloudApi.publish(cloudProjectId, { description, tags, thumbnails: thumbs });
            onPublished();
        } catch (e) {
            setError(e instanceof ApiError ? e.message : (e as Error).message || 'Publish failed');
            setPhase('form');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-[560px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b">
                    <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5"><Globe size={14} /> Publish to gallery</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
                </div>
                <div className="p-4 overflow-y-auto space-y-3 text-sm">
                    <p className="text-xs text-slate-500">
                        Publishing makes this project's latest cloud version and previews visible to everyone.
                        Make sure you've saved to cloud first.
                    </p>
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
                    <div>
                        <span className="text-xs font-medium text-slate-600">Preview pages (up to 4)</span>
                        <div className="mt-1 max-h-40 overflow-y-auto border rounded divide-y">
                            {pages.map(p => (
                                <label key={p.id} className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-slate-50 cursor-pointer">
                                    <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
                                    <span className="truncate">{p.title}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    {previews.length > 0 && (
                        <div className="flex gap-2">
                            {previews.map((src, i) => <img key={i} src={src} alt={`Preview ${i + 1}`} className="h-24 border rounded" />)}
                        </div>
                    )}
                    {error && <div className="text-xs text-red-600">{error}</div>}
                </div>
                <div className="px-4 py-3 border-t flex justify-end gap-2">
                    <button onClick={onClose} className="text-xs px-3 py-1.5 rounded border text-slate-600">Cancel</button>
                    <button onClick={publish} disabled={phase !== 'form'}
                        className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-50 flex items-center gap-1">
                        {phase !== 'form' && <Loader size={11} className="animate-spin" />}
                        {phase === 'rendering' ? 'Rendering previews…' : phase === 'uploading' ? 'Publishing…' : 'Publish'}
                    </button>
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 3: Wire into `components/cloud/CloudMenu.tsx`**

Add state `const [showPublish, setShowPublish] = useState(false);` and, in the dropdown where the placeholder comment sits (only when `project.cloud` exists):

```tsx
    <button onClick={() => { setShowPublish(true); setOpen(false); }}
        className="w-full text-left flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
        <Globe size={12} /> Publish to gallery…
    </button>
```

and render at the bottom next to HistoryModal:

```tsx
    {showPublish && project.cloud && (
        <PublishModal project={project} cloudProjectId={project.cloud.projectId}
            onClose={() => setShowPublish(false)}
            onPublished={() => { setShowPublish(false); window.alert('Published! View it in the Gallery.'); }} />
    )}
```

- [ ] **Step 4: Manual verification**

`npm run dev`, signed in, cloud-saved project: Publish with a description → success alert. Confirm in DB: `curl http://localhost:3001/api/gallery` shows the item with `thumbnailId`, and `http://localhost:3001/api/thumbnails/<id>` renders an image of the actual first page.

- [ ] **Step 5: Commit**

```bash
git add components/cloud/PublishModal.tsx components/cloud/CloudMenu.tsx services/cloudApi.ts
git commit -m "feat(client): publish wizard with live thumbnail rendering"
```

---

### Task 16: Gallery pages + routes + open-in-editor import flow

**Files:**
- Create: `services/importProject.ts`
- Create: `pages/GalleryPage.tsx`
- Create: `pages/GalleryDetailPage.tsx`
- Modify: `App.tsx` (routes), `pages/EditorPage.tsx` (consume import), `services/cloudApi.ts` (gallery methods)

**Interfaces:**
- Produces: routes `/gallery`, `/gallery/:id`; `stageImport(payload: { name: string; state: any; cloud?: { projectId: string; lastSyncedCommitId: string } }): void` and `consumeImport(): payload | null` from `services/importProject.ts`; `cloudApi.gallery(params)`, `cloudApi.galleryDetail(id)`, `cloudApi.galleryState(id)`, `cloudApi.report(id, reason)`.
- Consumes: gallery API (Task 13), `migrateState`.

- [ ] **Step 1: Add gallery methods to `services/cloudApi.ts`**

```ts
export interface GalleryItem {
    id: string; name: string; description: string; tags: string[]; author: string;
    forkCount: number; downloadCount: number; updatedAt: string; thumbnailId: string | null;
}
export interface GalleryDetail extends Omit<GalleryItem, 'thumbnailId'> {
    ownerId: string; headCommitId: string | null; thumbnailIds: string[];
    forkedFrom: { projectId: string; name: string; author: string } | null;
}
```

and inside the `cloudApi` object:

```ts
    gallery: (params: { q?: string; sort?: 'recent' | 'popular'; page?: number } = {}) => {
        const qs = new URLSearchParams();
        if (params.q) qs.set('q', params.q);
        if (params.sort) qs.set('sort', params.sort);
        if (params.page) qs.set('page', String(params.page));
        return api<{ items: GalleryItem[]; page: number; hasMore: boolean }>(`/api/gallery?${qs}`);
    },
    galleryDetail: async (id: string) =>
        (await api<{ project: GalleryDetail }>(`/api/gallery/${id}`)).project,
    galleryState: (id: string) =>
        api<{ name: string; state: any }>(`/api/gallery/${id}/state`),
    report: (id: string, reason: string) =>
        api<{ success: boolean }>(`/api/gallery/${id}/report`, { method: 'POST', body: JSON.stringify({ reason }) }),
```

- [ ] **Step 2: Create `services/importProject.ts`**

```ts
const KEY = 'hype_import_pending';

export interface ImportPayload {
    name: string;
    state: any;
    cloud?: { projectId: string; lastSyncedCommitId: string };
}

export const stageImport = (payload: ImportPayload) => {
    localStorage.setItem(KEY, JSON.stringify(payload));
};

export const consumeImport = (): ImportPayload | null => {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    localStorage.removeItem(KEY);
    try { return JSON.parse(raw); } catch { return null; }
};
```

- [ ] **Step 3: Consume imports in `pages/EditorPage.tsx`**

Add a mount-time effect (after the state declarations):

```ts
    // Consume a staged import from the gallery (set by stageImport before navigating here)
    useEffect(() => {
        const pending = consumeImport();
        if (!pending) return;
        const newId = `proj_${Date.now()}`;
        const newProject: Project = {
            id: newId,
            name: pending.name,
            initialState: migrateState(pending.state),
            cloud: pending.cloud,
            revision: 0
        };
        setProjects(prev => [...prev, newProject]);
        setActiveProjectId(newId);
        trackEvent('project_imported_from_gallery', { name: pending.name });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
```

with import `import { consumeImport } from '../services/importProject';`.

- [ ] **Step 4: Create `pages/GalleryPage.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Square, GitFork, Download } from 'lucide-react';
import { cloudApi, GalleryItem, API_BASE } from '../services/cloudApi';
import { AccountMenu } from '../components/AccountMenu';

export function GalleryPage() {
    const [items, setItems] = useState<GalleryItem[]>([]);
    const [q, setQ] = useState('');
    const [sort, setSort] = useState<'recent' | 'popular'>('recent');
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const t = setTimeout(() => {
            cloudApi.gallery({ q, sort, page })
                .then(res => { setItems(res.items); setHasMore(res.hasMore); setError(null); })
                .catch(() => setError('Could not load the gallery.'));
        }, 250);
        return () => clearTimeout(t);
    }, [q, sort, page]);

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="h-14 bg-white border-b flex items-center px-6 gap-4 sticky top-0 z-10">
                <Link to="/" className="flex items-center gap-2 font-bold text-slate-800">
                    <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-white"><Square size={16} fill="currentColor" /></div>
                    Gallery
                </Link>
                <div className="flex-1 max-w-md relative">
                    <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                    <input value={q} onChange={e => { setQ(e.target.value); setPage(0); }}
                        placeholder="Search planners and notebooks…"
                        className="w-full border rounded-lg pl-8 pr-3 py-1.5 text-sm" />
                </div>
                <select value={sort} onChange={e => { setSort(e.target.value as any); setPage(0); }} className="border rounded-lg px-2 py-1.5 text-sm">
                    <option value="recent">Newest</option>
                    <option value="popular">Popular</option>
                </select>
                <Link to="/app" className="text-xs font-medium text-slate-500 hover:text-blue-600">Editor</Link>
                <AccountMenu />
            </header>
            <main className="max-w-6xl mx-auto p-6">
                {error && <div className="text-sm text-red-600">{error}</div>}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {items.map(item => (
                        <Link key={item.id} to={`/gallery/${item.id}`} className="bg-white border rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                            <div className="aspect-[3/4] bg-slate-100 flex items-center justify-center">
                                {item.thumbnailId
                                    ? <img src={`${API_BASE}/api/thumbnails/${item.thumbnailId}`} alt={item.name} className="w-full h-full object-contain" loading="lazy" />
                                    : <Square size={32} className="text-slate-300" />}
                            </div>
                            <div className="p-3">
                                <div className="text-sm font-semibold text-slate-800 truncate">{item.name}</div>
                                <div className="text-xs text-slate-500">by {item.author}</div>
                                <div className="flex gap-3 mt-1 text-[10px] text-slate-400">
                                    <span className="flex items-center gap-0.5"><GitFork size={10} /> {item.forkCount}</span>
                                    <span className="flex items-center gap-0.5"><Download size={10} /> {item.downloadCount}</span>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
                {items.length === 0 && !error && <div className="text-sm text-slate-400 text-center py-16">Nothing here yet. Publish the first project!</div>}
                <div className="flex justify-center gap-2 mt-6">
                    {page > 0 && <button onClick={() => setPage(p => p - 1)} className="text-xs px-3 py-1.5 border rounded">Previous</button>}
                    {hasMore && <button onClick={() => setPage(p => p + 1)} className="text-xs px-3 py-1.5 border rounded">Next</button>}
                </div>
            </main>
        </div>
    );
}
```

- [ ] **Step 5: Create `pages/GalleryDetailPage.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, GitFork, Download, Flag, ExternalLink } from 'lucide-react';
import { cloudApi, GalleryDetail, ApiError, API_BASE } from '../services/cloudApi';
import { stageImport } from '../services/importProject';
import { useSession } from '../lib/auth-client';
import { AccountMenu } from '../components/AccountMenu';

export function GalleryDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { data: session } = useSession();
    const [project, setProject] = useState<GalleryDetail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        cloudApi.galleryDetail(id).then(setProject).catch(e => setError(e instanceof ApiError ? e.message : 'Not found'));
    }, [id]);

    const openInEditor = async () => {
        if (!id) return;
        setBusy('open');
        try {
            const res = await cloudApi.galleryState(id);
            stageImport({ name: res.name, state: res.state });
            navigate('/app');
        } catch { setError('Could not load project'); setBusy(null); }
    };

    const fork = async () => {
        if (!id) return;
        setBusy('fork');
        try {
            const res = await cloudApi.fork(id);
            const commit = await cloudApi.getCommit(res.project.id, res.project.headCommitId!);
            stageImport({
                name: res.project.name,
                state: commit.state,
                cloud: { projectId: res.project.id, lastSyncedCommitId: commit.id }
            });
            navigate('/app');
        } catch (e) { setError(e instanceof ApiError ? e.message : 'Fork failed'); setBusy(null); }
    };

    const report = async () => {
        const reason = window.prompt('Why are you reporting this project?');
        if (!reason || !id) return;
        try { await cloudApi.report(id, reason); window.alert('Thanks — the report was sent.'); }
        catch { window.alert('Could not send report.'); }
    };

    if (error) return <div className="p-10 text-sm text-red-600">{error} — <Link className="text-blue-600" to="/gallery">back to gallery</Link></div>;
    if (!project) return <div className="p-10 text-sm text-slate-400">Loading…</div>;
    const isOwner = session?.user && (session.user as any).id === project.ownerId;

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="h-14 bg-white border-b flex items-center px-6 gap-4">
                <Link to="/gallery" className="flex items-center gap-1 text-sm text-slate-600 hover:text-blue-600"><ArrowLeft size={14} /> Gallery</Link>
                <div className="flex-1" />
                <AccountMenu />
            </header>
            <main className="max-w-4xl mx-auto p-6 grid md:grid-cols-2 gap-8">
                <div className="space-y-3">
                    {project.thumbnailIds.map(tid => (
                        <img key={tid} src={`${API_BASE}/api/thumbnails/${tid}`} alt="" className="w-full border rounded-xl bg-white" />
                    ))}
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">{project.name}</h1>
                    <div className="text-sm text-slate-500 mt-1">
                        by <Link to={`/u/${project.author}`} className="text-blue-600 hover:underline">{project.author}</Link>
                    </div>
                    {project.forkedFrom && (
                        <div className="text-xs text-slate-400 mt-1">
                            forked from <Link to={`/gallery/${project.forkedFrom.projectId}`} className="text-blue-600 hover:underline">
                                {project.forkedFrom.author}/{project.forkedFrom.name}</Link>
                        </div>
                    )}
                    <p className="text-sm text-slate-600 mt-4 whitespace-pre-wrap">{project.description}</p>
                    <div className="flex flex-wrap gap-1 mt-3">
                        {project.tags.map(t => <span key={t} className="text-[10px] bg-slate-200 text-slate-600 rounded-full px-2 py-0.5">{t}</span>)}
                    </div>
                    <div className="flex gap-4 mt-4 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><GitFork size={12} /> {project.forkCount} forks</span>
                        <span className="flex items-center gap-1"><Download size={12} /> {project.downloadCount} downloads</span>
                    </div>
                    <div className="flex flex-col gap-2 mt-6 max-w-xs">
                        <button onClick={openInEditor} disabled={busy !== null}
                            className="flex items-center justify-center gap-1.5 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
                            <ExternalLink size={14} /> {busy === 'open' ? 'Loading…' : 'Open in editor'}
                        </button>
                        {session?.user ? (
                            <button onClick={fork} disabled={busy !== null}
                                className="flex items-center justify-center gap-1.5 border border-slate-300 rounded-lg px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
                                <GitFork size={14} /> {busy === 'fork' ? 'Forking…' : 'Fork this project'}
                            </button>
                        ) : (
                            <Link to="/login" className="text-center text-xs text-slate-500 hover:text-blue-600">Sign in to fork</Link>
                        )}
                        <button onClick={report} className="flex items-center justify-center gap-1 text-[11px] text-slate-400 hover:text-red-600 mt-2">
                            <Flag size={11} /> Report
                        </button>
                    </div>
                    {/* Merge request list for owners is added in Task 26 */}
                </div>
            </main>
        </div>
    );
}
```

Note: `cloudApi.fork` doesn't exist until Task 19. For this task, add a temporary stub to `services/cloudApi.ts` so it compiles — Task 19 provides the real endpoint (the client signature below is final):

```ts
    fork: (projectId: string) =>
        api<{ project: CloudProject }>(`/api/projects/${projectId}/fork`, { method: 'POST' }),
```

(The signature is final; only the server side lands later. The Fork button will 404 until Phase 4 — acceptable inside the phase sequence, and the error is surfaced to the user.)

- [ ] **Step 6: Add routes in `App.tsx`**

Read the file, then add alongside existing routes:

```tsx
<Route path="/gallery" element={<GalleryPage />} />
<Route path="/gallery/:id" element={<GalleryDetailPage />} />
```

with the corresponding imports. Also add a "Gallery" link to the `LandingPage` nav and to the EditorPage header (next to Docs): `<Link to="/gallery" ...>Gallery</Link>`.

- [ ] **Step 7: Manual verification**

`npm run dev`:
1. Anonymous browser (incognito): `/gallery` lists the project published in Task 15 with a real thumbnail; detail page renders; "Open in editor" clones it into `/app` as a new local tab (no cloud link).
2. Search filters; sort toggles; report sends (check `reports` table or admin endpoint).

- [ ] **Step 8: Commit**

```bash
git add services/importProject.ts services/cloudApi.ts pages/GalleryPage.tsx pages/GalleryDetailPage.tsx pages/EditorPage.tsx App.tsx pages/LandingPage.tsx
git commit -m "feat(client): public gallery browse/detail with open-in-editor import"
```

---

### Task 17: Public profile pages

**Files:**
- Modify: `server/routes/me.js` (add `GET /api/users/:username`)
- Create: `pages/ProfilePage.tsx`
- Modify: `App.tsx` (route `/u/:username`)
- Test: `tests/unit/server/users.test.js`

**Interfaces:**
- Produces: `GET /api/users/:username` → `{ user: { username, name, createdAt }, projects: GalleryItem[] }` (public projects only); route `/u/:username`.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/server/users.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, PNG_1X1 } from './helpers.js';

let app;
beforeAll(async () => {
    app = await initTestApp();
    const cookie = await signUpUser(app, { email: 'prof@test.dev', username: 'profiled' });
    const p = await request(app).post('/api/projects').set('Cookie', cookie)
        .send({ name: 'Profile Planner', state: minimalState() });
    await request(app).post(`/api/projects/${p.body.project.id}/publish`).set('Cookie', cookie)
        .send({ description: '', tags: [], thumbnails: [PNG_1X1] });
    await request(app).post('/api/projects').set('Cookie', cookie)
        .send({ name: 'Private Thing', state: minimalState() });
});

describe('GET /api/users/:username', () => {
    it('returns public projects only', async () => {
        const res = await request(app).get('/api/users/profiled');
        expect(res.status).toBe(200);
        expect(res.body.user.username).toBe('profiled');
        expect(res.body.projects.map(p => p.name)).toEqual(['Profile Planner']);
    });
    it('404s unknown users', async () => {
        const res = await request(app).get('/api/users/ghost_user');
        expect(res.status).toBe(404);
    });
});
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: add to `server/routes/me.js`**:

```js
import { query } from '../db.js';
// ...
router.get('/api/users/:username', async (req, res) => {
    const uname = String(req.params.username).toLowerCase();
    const users = await query('SELECT id, name, username, "createdAt" FROM "user" WHERE username = $1', [uname]);
    if (!users[0]) return res.status(404).json({ error: 'User not found' });
    const rows = await query(
        `SELECT p.id, p.name, p.description, p.tags, p.fork_count, p.download_count, p.updated_at,
                (SELECT t.id FROM thumbnails t WHERE t.project_id = p.id ORDER BY t.position LIMIT 1) AS thumbnail_id
         FROM projects p WHERE p.owner_id = $1 AND p.visibility = 'public' ORDER BY p.updated_at DESC LIMIT 100`,
        [users[0].id]);
    res.json({
        user: { username: users[0].username, name: users[0].name, createdAt: users[0].createdAt },
        projects: rows.map(r => ({
            id: r.id, name: r.name, description: r.description, tags: JSON.parse(r.tags || '[]'),
            author: users[0].username, forkCount: r.fork_count, downloadCount: r.download_count,
            updatedAt: r.updated_at, thumbnailId: r.thumbnail_id
        }))
    });
});
```

(The better-auth username plugin stores usernames lowercased; keep the `toLowerCase()` normalization.)

- [ ] **Step 4: Run test to verify it passes**, commit checkpoint not yet — build the page first.

- [ ] **Step 5: Create `pages/ProfilePage.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, User, Square, GitFork, Download } from 'lucide-react';
import { GalleryItem, API_BASE } from '../services/cloudApi';
import { AccountMenu } from '../components/AccountMenu';

export function ProfilePage() {
    const { username } = useParams<{ username: string }>();
    const [data, setData] = useState<{ user: { username: string; name: string; createdAt: string }; projects: GalleryItem[] } | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch(`${API_BASE}/api/users/${username}`, { credentials: 'include' })
            .then(r => r.ok ? r.json() : Promise.reject(new Error('User not found')))
            .then(setData)
            .catch(e => setError(e.message));
    }, [username]);

    if (error) return <div className="p-10 text-sm text-red-600">{error} — <Link className="text-blue-600" to="/gallery">back to gallery</Link></div>;
    if (!data) return <div className="p-10 text-sm text-slate-400">Loading…</div>;

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="h-14 bg-white border-b flex items-center px-6 gap-4">
                <Link to="/gallery" className="flex items-center gap-1 text-sm text-slate-600 hover:text-blue-600"><ArrowLeft size={14} /> Gallery</Link>
                <div className="flex-1" />
                <AccountMenu />
            </header>
            <main className="max-w-6xl mx-auto p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center"><User size={20} className="text-slate-500" /></div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-800">{data.user.username}</h1>
                        <div className="text-xs text-slate-400">Joined {new Date(data.user.createdAt).toLocaleDateString()}</div>
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {data.projects.map(item => (
                        <Link key={item.id} to={`/gallery/${item.id}`} className="bg-white border rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                            <div className="aspect-[3/4] bg-slate-100 flex items-center justify-center">
                                {item.thumbnailId
                                    ? <img src={`${API_BASE}/api/thumbnails/${item.thumbnailId}`} alt={item.name} className="w-full h-full object-contain" loading="lazy" />
                                    : <Square size={32} className="text-slate-300" />}
                            </div>
                            <div className="p-3">
                                <div className="text-sm font-semibold text-slate-800 truncate">{item.name}</div>
                                <div className="flex gap-3 mt-1 text-[10px] text-slate-400">
                                    <span className="flex items-center gap-0.5"><GitFork size={10} /> {item.forkCount}</span>
                                    <span className="flex items-center gap-0.5"><Download size={10} /> {item.downloadCount}</span>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
                {data.projects.length === 0 && <div className="text-sm text-slate-400 text-center py-16">No published projects yet.</div>}
            </main>
        </div>
    );
}
```

Add route in `App.tsx`: `<Route path="/u/:username" element={<ProfilePage />} />`.

- [ ] **Step 6: Verify and commit**

Run: `npx vitest run tests/unit/server/users.test.js` — PASS. Manual: `/u/<your-handle>` shows your published project.

```bash
git add server/routes/me.js pages/ProfilePage.tsx App.tsx tests/unit/server/users.test.js
git commit -m "feat: public user profiles with published projects"
```

---

### Task 18: Gallery e2e happy path

**Files:**
- Create: `tests/e2e/gallery.spec.ts`

Read `playwright.config.ts` (or wherever the existing e2e config lives in `tests/e2e/`) first and match its conventions (baseURL, webServer). The test requires both dev servers (`npm run dev`) or a configured `webServer` entry.

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from '@playwright/test';

const unique = Date.now();

test('publish → browse → open in editor', async ({ page }) => {
    // 1. Sign up
    await page.goto('/login');
    // Adapt selectors to LoginPage's actual markup:
    await page.getByText(/sign up/i).first().click();
    await page.getByPlaceholder(/name/i).first().fill('E2E User');
    await page.getByPlaceholder(/username/i).fill(`e2e_user_${unique}`);
    await page.getByPlaceholder(/email/i).fill(`e2e${unique}@test.dev`);
    await page.getByPlaceholder(/password/i).fill('password1234');
    await page.getByRole('button', { name: /sign up/i }).click();

    // 2. Save to cloud
    await page.goto('/app');
    page.on('dialog', d => d.accept(d.type() === 'prompt' ? 'e2e save' : undefined));
    await page.getByTitle('Cloud').click();
    await page.getByText(/save to cloud/i).click();

    // 3. Publish
    await page.getByTitle('Cloud').click();
    await page.getByText(/publish to gallery/i).click();
    await page.getByPlaceholder(/what is this planner for/i).fill('E2E published planner');
    await page.getByRole('button', { name: /^publish$/i }).click();
    await expect(page.getByText(/published/i)).toBeVisible({ timeout: 60000 });

    // 4. Browse anonymously-ish (same session is fine for happy path)
    await page.goto('/gallery');
    await expect(page.getByText('E2E published planner').first()).toBeVisible({ timeout: 10000 });
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test tests/e2e/gallery.spec.ts`
Expected: PASS. Fix selectors against the real DOM if they drift (the flows themselves are mandatory).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/gallery.spec.ts
git commit -m "test(e2e): publish and browse gallery happy path"
```

---

# Phase 4 — Fork / Clone with Lineage

### Task 19: Fork endpoint

**Files:**
- Modify: `server/routes/projects.js`
- Test: `tests/unit/server/fork.test.js`

**Interfaces:**
- Produces: `POST /api/projects/:id/fork` (auth required; source must be public, or owned by the caller) → 201 `{ project: CloudProject }` where the new project is private, owned by the caller, `forkedFromProjectId`/`forkedFromCommitId` set to the source and its head, head commit is a copy of the source head state with message `Fork of "<name>"`. Source `fork_count` incremented.
- Consumes: `insertCommit`, `getProjectRow`, `loadProject` (Task 8).

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/server/fork.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, PNG_1X1 } from './helpers.js';

let app, ownerCookie, forkerCookie, publicId, privateId;
beforeAll(async () => {
    app = await initTestApp();
    ownerCookie = await signUpUser(app, { email: 'fowner@test.dev', username: 'fork_owner' });
    forkerCookie = await signUpUser(app, { email: 'forker@test.dev', username: 'forker' });
    const pub = await request(app).post('/api/projects').set('Cookie', ownerCookie)
        .send({ name: 'Forkable', state: minimalState('upstream') });
    publicId = pub.body.project.id;
    await request(app).post(`/api/projects/${publicId}/publish`).set('Cookie', ownerCookie)
        .send({ description: '', tags: [], thumbnails: [PNG_1X1] });
    const priv = await request(app).post('/api/projects').set('Cookie', ownerCookie)
        .send({ name: 'NotForkable', state: minimalState() });
    privateId = priv.body.project.id;
});

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/server/fork.test.js` — Expected: FAIL (404).

- [ ] **Step 3: Add to `server/routes/projects.js`** (before `export default router;`)

```js
router.post('/api/projects/:id/fork', requireAuth, loadProject(false), async (req, res) => {
    const src = req.project;
    if (!src.head_commit_id) return res.status(400).json({ error: 'Source project has no content' });
    const headRows = await query('SELECT state_json FROM commits WHERE id = $1', [src.head_commit_id]);
    if (!headRows[0]) return res.status(404).json({ error: 'Source commit not found' });

    const forkId = randomUUID();
    await query(
        `INSERT INTO projects (id, owner_id, name, description, tags, forked_from_project_id, forked_from_commit_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [forkId, req.user.id, src.name, src.description, src.tags, src.id, src.head_commit_id]
    );
    await insertCommit({
        projectId: forkId,
        parentCommitId: null,
        message: `Fork of "${src.name}"`,
        state: JSON.parse(headRows[0].state_json),
        userId: req.user.id
    });
    await query('UPDATE projects SET fork_count = fork_count + 1 WHERE id = $1', [src.id]);
    res.status(201).json({ project: projectDto(await getProjectRow(forkId)) });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/server/fork.test.js` — Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/routes/projects.js tests/unit/server/fork.test.js
git commit -m "feat(server): fork public projects with commit lineage"
```

---

### Task 20: Fork UX verification + fork badge in editor

**Files:**
- Modify: `components/cloud/CloudMenu.tsx` (fork indicator)

The Fork button and client `cloudApi.fork` were wired in Task 16 (they 404'd until Task 19). This task verifies the full flow and surfaces fork status in the editor.

- [ ] **Step 1: Show upstream lineage in CloudMenu**

In `CloudMenu`, when the menu opens and `project.cloud` exists, fetch the cloud project once and remember it:

```tsx
    const [cloudProject, setCloudProject] = useState<CloudProject | null>(null);
    useEffect(() => {
        if (open && project.cloud && !cloudProject) {
            cloudApi.getProject(project.cloud.projectId).then(setCloudProject).catch(() => {});
        }
    }, [open, project.cloud, cloudProject]);
```

and render inside the dropdown (below Version history):

```tsx
    {cloudProject?.forkedFromProjectId && (
        <Link to={`/gallery/${cloudProject.forkedFromProjectId}`}
            className="block px-3 py-1.5 text-[11px] text-slate-400 hover:bg-slate-50">
            ↳ forked from upstream — view source
        </Link>
    )}
```

(import `CloudProject` from `../../services/cloudApi`).

- [ ] **Step 2: Manual verification of the full loop**

`npm run dev`, two browser profiles:
1. User A publishes a project (Phase 3 flow).
2. User B opens `/gallery/:id` → Fork → lands in `/app` with a new tab already cloud-linked; CloudMenu shows "forked from upstream"; edits a template; Save to cloud succeeds.
3. Gallery detail of the source shows `1 fork`; B's fork is **not** in the public gallery (it's private).

- [ ] **Step 3: Commit**

```bash
git add components/cloud/CloudMenu.tsx
git commit -m "feat(client): fork lineage indicator in cloud menu"
```

---

# Phase 5 — Merge Requests

The heart of the feature. Build the diff engine first (pure functions, dense tests), then the API, then the UI.

### Task 21: `shared/diff.js` — stableStringify + computeChangeSet

**Files:**
- Create: `shared/diff.js`
- Test: `tests/unit/shared/diff.test.js`

**Interfaces:**
- Produces (plain ESM JS + JSDoc; importable from both server and Vite client):
  - `stableStringify(value) => string` — deterministic JSON with sorted object keys.
  - `computeChangeSet(base, side) => ChangeSet` where base/side are `{ nodes, rootId, variants }`-shaped (extra AppState fields ignored) and:

```js
/**
 * @typedef {Object} ChangeSet
 * @property {string[]} variantsAdded
 * @property {string[]} variantsRemoved
 * @property {Record<string,string>} variantsRenamed   // variantId -> new name
 * @property {Record<string,string[]>} templatesAdded  // variantId -> templateIds
 * @property {Record<string,string[]>} templatesModified
 * @property {Record<string,string[]>} templatesRemoved
 * @property {boolean} nodesChanged
 */
```

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/shared/diff.test.js
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { stableStringify, computeChangeSet } from '../../../shared/diff.js';

const mkState = () => ({
    nodes: { root: { id: 'root', parentId: null, type: 'day', title: 'Root', data: {}, children: [] } },
    rootId: 'root',
    variants: {
        rm: { id: 'rm', name: 'reMarkable', templates: {
            day: { id: 'day', name: 'Day', width: 509, height: 679, elements: [] },
            week: { id: 'week', name: 'Week', width: 509, height: 679, elements: [] }
        } }
    }
});
const clone = (s) => JSON.parse(JSON.stringify(s));

describe('stableStringify', () => {
    it('is key-order independent', () => {
        expect(stableStringify({ a: 1, b: { c: 2, d: 3 } }))
            .toBe(stableStringify({ b: { d: 3, c: 2 }, a: 1 }));
    });
});

describe('computeChangeSet', () => {
    it('reports no changes for identical states', () => {
        const cs = computeChangeSet(mkState(), mkState());
        expect(cs.nodesChanged).toBe(false);
        expect(cs.variantsAdded).toEqual([]);
        expect(cs.templatesModified).toEqual({});
    });

    it('detects node hierarchy changes', () => {
        const side = mkState();
        side.nodes.root.title = 'Renamed';
        expect(computeChangeSet(mkState(), side).nodesChanged).toBe(true);
    });

    it('detects added/removed variants', () => {
        const side = mkState();
        side.variants.ipad = { id: 'ipad', name: 'iPad', templates: {} };
        delete side.variants.rm;
        const cs = computeChangeSet(mkState(), side);
        expect(cs.variantsAdded).toEqual(['ipad']);
        expect(cs.variantsRemoved).toEqual(['rm']);
    });

    it('detects renamed variants without flagging templates', () => {
        const side = mkState();
        side.variants.rm.name = 'RM Pro';
        const cs = computeChangeSet(mkState(), side);
        expect(cs.variantsRenamed).toEqual({ rm: 'RM Pro' });
        expect(cs.templatesModified).toEqual({});
    });

    it('detects template add/modify/remove within a variant', () => {
        const side = mkState();
        side.variants.rm.templates.day.elements = [{ id: 'e1', type: 'rect', x: 0, y: 0, w: 10, h: 10 }];
        side.variants.rm.templates.month = { id: 'month', name: 'Month', width: 509, height: 679, elements: [] };
        delete side.variants.rm.templates.week;
        const cs = computeChangeSet(mkState(), side);
        expect(cs.templatesModified).toEqual({ rm: ['day'] });
        expect(cs.templatesAdded).toEqual({ rm: ['month'] });
        expect(cs.templatesRemoved).toEqual({ rm: ['week'] });
    });

    it('ignores key-order differences', () => {
        const side = clone(mkState());
        // Rebuild a template with different key order but equal content
        const t = side.variants.rm.templates.day;
        side.variants.rm.templates.day = { elements: t.elements, height: t.height, width: t.width, name: t.name, id: t.id };
        const cs = computeChangeSet(mkState(), side);
        expect(cs.templatesModified).toEqual({});
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/shared/diff.test.js` — Expected: FAIL (module missing).

- [ ] **Step 3: Create `shared/diff.js`** (first half)

```js
// Structured three-way diff/merge for PDF Architect project states.
// Plain ESM JavaScript so both the Express server and the Vite client can import it.
// A "DiffState" is any object with { nodes, rootId, variants } (extra fields ignored).

export const stableStringify = (value) => {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    return '{' + Object.keys(value).sort()
        .map(k => JSON.stringify(k) + ':' + stableStringify(value[k]))
        .join(',') + '}';
};

const eq = (a, b) => stableStringify(a) === stableStringify(b);
const clone = (v) => JSON.parse(JSON.stringify(v));
const pushMap = (map, key, val) => { (map[key] = map[key] || []).push(val); };

/** @returns {ChangeSet} */
export const computeChangeSet = (base, side) => {
    const cs = {
        variantsAdded: [], variantsRemoved: [], variantsRenamed: {},
        templatesAdded: {}, templatesModified: {}, templatesRemoved: {},
        nodesChanged: false
    };
    cs.nodesChanged = !eq(
        { nodes: base.nodes, rootId: base.rootId },
        { nodes: side.nodes, rootId: side.rootId }
    );
    const baseV = base.variants || {};
    const sideV = side.variants || {};
    for (const vid of Object.keys(sideV)) if (!baseV[vid]) cs.variantsAdded.push(vid);
    for (const vid of Object.keys(baseV)) if (!sideV[vid]) cs.variantsRemoved.push(vid);
    for (const vid of Object.keys(sideV)) {
        if (!baseV[vid]) continue; // wholly-added variants aren't itemized
        if (baseV[vid].name !== sideV[vid].name) cs.variantsRenamed[vid] = sideV[vid].name;
        const bt = baseV[vid].templates || {};
        const st = sideV[vid].templates || {};
        for (const tid of Object.keys(st)) {
            if (!bt[tid]) pushMap(cs.templatesAdded, vid, tid);
            else if (!eq(bt[tid], st[tid])) pushMap(cs.templatesModified, vid, tid);
        }
        for (const tid of Object.keys(bt)) {
            if (!st[tid]) pushMap(cs.templatesRemoved, vid, tid);
        }
    }
    return cs;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/shared/diff.test.js` — Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/diff.js tests/unit/shared/diff.test.js
git commit -m "feat(shared): stable stringify and per-variant change-set computation"
```

---

### Task 22: `threeWayDiff` with conflict detection

**Files:**
- Modify: `shared/diff.js`
- Test: append to `tests/unit/shared/diff.test.js`

**Interfaces:**
- Produces: `threeWayDiff(base, source, target) => { source: ChangeSet, target: ChangeSet, conflicts: Conflict[] }` where `Conflict = { kind: 'nodes'|'variant'|'template', variantId?, templateId?, description }`.
- Conflict rules (exactly these):
  1. `nodes`: both sides changed nodes AND their node sets are not identical to each other.
  2. `variant`: same variant added on both sides with different content; or renamed differently on both sides; or removed on one side while the other side touched its templates (added/modified/removed) or renamed it.
  3. `template`: the same template in the same variant was touched (added/modified/removed) on both sides AND the two sides' resulting values differ (removal counts as a distinct value).

- [ ] **Step 1: Write the failing tests** (append to `tests/unit/shared/diff.test.js`)

```js
import { threeWayDiff } from '../../../shared/diff.js';

describe('threeWayDiff', () => {
    it('no conflicts when sides touch different templates', () => {
        const base = mkState();
        const source = clone(base); source.variants.rm.templates.day.name = 'Day v2';
        const target = clone(base); target.variants.rm.templates.week.name = 'Week v2';
        const d = threeWayDiff(base, source, target);
        expect(d.conflicts).toEqual([]);
        expect(d.source.templatesModified).toEqual({ rm: ['day'] });
    });

    it('flags same-template conflicts', () => {
        const base = mkState();
        const source = clone(base); source.variants.rm.templates.day.name = 'Source Day';
        const target = clone(base); target.variants.rm.templates.day.name = 'Target Day';
        const d = threeWayDiff(base, source, target);
        expect(d.conflicts.some(c => c.kind === 'template' && c.templateId === 'day')).toBe(true);
    });

    it('does not flag identical convergent edits', () => {
        const base = mkState();
        const source = clone(base); source.variants.rm.templates.day.name = 'Same';
        const target = clone(base); target.variants.rm.templates.day.name = 'Same';
        expect(threeWayDiff(base, source, target).conflicts).toEqual([]);
    });

    it('flags nodes conflicts only when both changed differently', () => {
        const base = mkState();
        const source = clone(base); source.nodes.root.title = 'S';
        const target = clone(base); target.nodes.root.title = 'T';
        expect(threeWayDiff(base, source, target).conflicts.some(c => c.kind === 'nodes')).toBe(true);

        const target2 = clone(base); target2.nodes.root.title = 'S';
        expect(threeWayDiff(base, source, target2).conflicts).toEqual([]);
    });

    it('flags variant removed vs modified', () => {
        const base = mkState();
        const source = clone(base); delete source.variants.rm;
        const target = clone(base); target.variants.rm.templates.day.name = 'Edited';
        const d = threeWayDiff(base, source, target);
        expect(d.conflicts.some(c => c.kind === 'variant' && c.variantId === 'rm')).toBe(true);
    });

    it('flags variant added on both sides with different content', () => {
        const base = mkState();
        const source = clone(base); source.variants.ipad = { id: 'ipad', name: 'iPad', templates: {} };
        const target = clone(base); target.variants.ipad = { id: 'ipad', name: 'iPad Pro', templates: {} };
        const d = threeWayDiff(base, source, target);
        expect(d.conflicts.some(c => c.kind === 'variant' && c.variantId === 'ipad')).toBe(true);
    });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run tests/unit/shared/diff.test.js` — Expected: 6 new FAIL.

- [ ] **Step 3: Implement in `shared/diff.js`**

```js
const touchedTemplates = (cs, vid) => new Set([
    ...(cs.templatesAdded[vid] || []),
    ...(cs.templatesModified[vid] || []),
    ...(cs.templatesRemoved[vid] || [])
]);

const variantTouched = (cs, vid) =>
    touchedTemplates(cs, vid).size > 0 || Object.prototype.hasOwnProperty.call(cs.variantsRenamed, vid);

/** @returns {{source: ChangeSet, target: ChangeSet, conflicts: Array}} */
export const threeWayDiff = (base, source, target) => {
    const src = computeChangeSet(base, source);
    const tgt = computeChangeSet(base, target);
    const conflicts = [];

    if (src.nodesChanged && tgt.nodesChanged &&
        !eq({ nodes: source.nodes, rootId: source.rootId }, { nodes: target.nodes, rootId: target.rootId })) {
        conflicts.push({ kind: 'nodes', description: 'Both projects changed the page hierarchy differently' });
    }

    for (const vid of src.variantsAdded) {
        if (tgt.variantsAdded.includes(vid) && !eq(source.variants[vid], target.variants[vid])) {
            conflicts.push({ kind: 'variant', variantId: vid, description: `Variant "${vid}" was added on both sides with different content` });
        }
    }
    for (const vid of Object.keys(src.variantsRenamed)) {
        if (vid in tgt.variantsRenamed && src.variantsRenamed[vid] !== tgt.variantsRenamed[vid]) {
            conflicts.push({ kind: 'variant', variantId: vid, description: `Variant "${vid}" was renamed differently on both sides` });
        }
    }
    for (const vid of src.variantsRemoved) {
        if (variantTouched(tgt, vid)) {
            conflicts.push({ kind: 'variant', variantId: vid, description: `Variant "${vid}" was removed in the fork but modified upstream` });
        }
    }
    for (const vid of tgt.variantsRemoved) {
        if (variantTouched(src, vid)) {
            conflicts.push({ kind: 'variant', variantId: vid, description: `Variant "${vid}" was removed upstream but modified in the fork` });
        }
    }

    const vids = new Set([
        ...Object.keys(src.templatesAdded), ...Object.keys(src.templatesModified), ...Object.keys(src.templatesRemoved),
        ...Object.keys(tgt.templatesAdded), ...Object.keys(tgt.templatesModified), ...Object.keys(tgt.templatesRemoved)
    ]);
    for (const vid of vids) {
        const srcSet = touchedTemplates(src, vid);
        const tgtSet = touchedTemplates(tgt, vid);
        for (const tid of srcSet) {
            if (!tgtSet.has(tid)) continue;
            const sVal = source.variants[vid]?.templates?.[tid];
            const tVal = target.variants[vid]?.templates?.[tid];
            if (!eq(sVal, tVal)) {
                conflicts.push({ kind: 'template', variantId: vid, templateId: tid, description: `Template "${tid}" in variant "${vid}" was changed on both sides` });
            }
        }
    }

    return { source: src, target: tgt, conflicts };
};
```

- [ ] **Step 4: Run test to verify all pass**

Run: `npx vitest run tests/unit/shared/diff.test.js` — Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/diff.js tests/unit/shared/diff.test.js
git commit -m "feat(shared): three-way diff with template/variant/nodes conflict detection"
```

---

### Task 23: `applyChangeSet` (merge application)

**Files:**
- Modify: `shared/diff.js`
- Test: append to `tests/unit/shared/diff.test.js`

**Interfaces:**
- Produces: `applyChangeSet(base, source, target) => mergedState` — deep-clones `target` (the FULL target AppState, preserving its UI fields), applies source's changes computed against base, fixes `activeVariantId` if it was removed. Callers must ensure `threeWayDiff(...).conflicts` is empty first.

- [ ] **Step 1: Write the failing tests** (append)

```js
import { applyChangeSet } from '../../../shared/diff.js';

describe('applyChangeSet', () => {
    it('applies template edits and additions onto target', () => {
        const base = mkState();
        const source = clone(base);
        source.variants.rm.templates.day.name = 'Fancy Day';
        source.variants.ipad = { id: 'ipad', name: 'iPad', templates: {} };
        const target = clone(base);
        target.variants.rm.templates.week.name = 'Upstream Week'; // target's own change is preserved
        target.activeVariantId = 'rm';

        const merged = applyChangeSet(base, source, target);
        expect(merged.variants.rm.templates.day.name).toBe('Fancy Day');
        expect(merged.variants.rm.templates.week.name).toBe('Upstream Week');
        expect(merged.variants.ipad.name).toBe('iPad');
        expect(merged.activeVariantId).toBe('rm');
    });

    it('applies removals and repairs activeVariantId', () => {
        const base = mkState();
        base.variants.extra = { id: 'extra', name: 'Extra', templates: {} };
        const source = clone(base);
        delete source.variants.extra;
        delete source.variants.rm.templates.week;
        const target = clone(base);
        target.activeVariantId = 'extra';

        const merged = applyChangeSet(base, source, target);
        expect(merged.variants.extra).toBeUndefined();
        expect(merged.variants.rm.templates.week).toBeUndefined();
        expect(merged.variants[merged.activeVariantId]).toBeDefined();
    });

    it('applies node changes when only source changed them', () => {
        const base = mkState();
        const source = clone(base);
        source.nodes.child = { id: 'child', parentId: 'root', type: 'day', title: 'Child', data: {}, children: [] };
        source.nodes.root.children = ['child'];
        const merged = applyChangeSet(base, source, clone(base));
        expect(merged.nodes.child.title).toBe('Child');
    });

    it('applies variant renames', () => {
        const base = mkState();
        const source = clone(base); source.variants.rm.name = 'RM Pro Max';
        const merged = applyChangeSet(base, source, clone(base));
        expect(merged.variants.rm.name).toBe('RM Pro Max');
    });
});
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: implement** in `shared/diff.js`:

```js
/**
 * Applies source's changes (relative to base) on top of target.
 * PRECONDITION: threeWayDiff(base, source, target).conflicts is empty.
 * @returns merged full state (target clone + source changes)
 */
export const applyChangeSet = (base, source, target) => {
    const merged = clone(target);
    const cs = computeChangeSet(base, source);

    if (cs.nodesChanged) {
        merged.nodes = clone(source.nodes);
        merged.rootId = source.rootId;
    }
    for (const vid of cs.variantsAdded) merged.variants[vid] = clone(source.variants[vid]);
    for (const vid of cs.variantsRemoved) delete merged.variants[vid];
    for (const [vid, newName] of Object.entries(cs.variantsRenamed)) {
        if (merged.variants[vid]) merged.variants[vid].name = newName;
    }
    const applyTemplates = (map, fn) => {
        for (const [vid, tids] of Object.entries(map)) {
            if (!merged.variants[vid]) continue;
            for (const tid of tids) fn(vid, tid);
        }
    };
    applyTemplates(cs.templatesAdded, (vid, tid) => { merged.variants[vid].templates[tid] = clone(source.variants[vid].templates[tid]); });
    applyTemplates(cs.templatesModified, (vid, tid) => { merged.variants[vid].templates[tid] = clone(source.variants[vid].templates[tid]); });
    applyTemplates(cs.templatesRemoved, (vid, tid) => { delete merged.variants[vid].templates[tid]; });

    if (!merged.variants[merged.activeVariantId]) {
        merged.activeVariantId = Object.keys(merged.variants)[0];
    }
    return merged;
};
```

- [ ] **Step 4: Run all diff tests**

Run: `npx vitest run tests/unit/shared/diff.test.js` — Expected: PASS (17 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/diff.js tests/unit/shared/diff.test.js
git commit -m "feat(shared): applyChangeSet merge application"
```

---

### Task 24: MR schema + create/list/get API

**Files:**
- Modify: `server/migrations/index.js` (append `006_merge_requests`)
- Create: `server/routes/mergeRequests.js`
- Modify: `server/app.js` (mount)
- Test: `tests/unit/server/mergeRequests.test.js`

**Interfaces:**
- Produces:
  - `POST /api/merge-requests` body `{ sourceProjectId, title, description? }` (auth; caller owns source; source has `forked_from_project_id`) → 201 `{ mergeRequest }` with `status` `'open'` or `'conflicted'` (computed at creation). 400 if source head equals fork point (no changes).
  - `GET /api/projects/:id/merge-requests` (target owner) → `{ mergeRequests: MrDto[] }`
  - `GET /api/merge-requests/mine` (auth) → `{ mergeRequests }` (authored)
  - `GET /api/merge-requests/:id` (target owner or author) → `{ mergeRequest, diff, sourceState, targetState }` — diff recomputed live against target's CURRENT head; status auto-updated between open/conflicted.
  - `MrDto = { id, sourceProjectId, sourceProjectName, sourceCommitId, targetProjectId, targetProjectName, baseCommitId, title, description, status, createdBy, authorUsername, createdAt, resolvedAt }`.
- Consumes: `threeWayDiff` (shared), `getProjectRow`, guards.

- [ ] **Step 1: Append migration `006_merge_requests`**:

```js
    {
        id: '006_merge_requests',
        pg: `
            CREATE TABLE IF NOT EXISTS merge_requests (
                id TEXT PRIMARY KEY,
                source_project_id TEXT NOT NULL,
                source_commit_id TEXT NOT NULL,
                target_project_id TEXT NOT NULL,
                base_commit_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'open',
                created_by TEXT NOT NULL,
                resolved_by TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                resolved_at TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_mr_target ON merge_requests(target_project_id);
            CREATE INDEX IF NOT EXISTS idx_mr_author ON merge_requests(created_by)
        `
    }
```

- [ ] **Step 2: Write the failing test**

```js
// tests/unit/server/mergeRequests.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { initTestApp, signUpUser, minimalState, PNG_1X1 } from './helpers.js';

const stateWithDayName = (dayName) => {
    const s = minimalState();
    s.variants.default.templates.page.name = dayName;
    return s;
};

let app, ownerCookie, authorCookie, upstreamId, forkId;

const setupForkWithChanges = async () => {
    // upstream published project
    const up = await request(app).post('/api/projects').set('Cookie', ownerCookie)
        .send({ name: 'Upstream', state: stateWithDayName('Original') });
    upstreamId = up.body.project.id;
    await request(app).post(`/api/projects/${upstreamId}/publish`).set('Cookie', ownerCookie)
        .send({ description: '', tags: [], thumbnails: [PNG_1X1] });
    // fork + a change
    const fork = await request(app).post(`/api/projects/${upstreamId}/fork`).set('Cookie', authorCookie);
    forkId = fork.body.project.id;
    await request(app).post(`/api/projects/${forkId}/commits`).set('Cookie', authorCookie)
        .send({ state: stateWithDayName('Improved'), message: 'improve page template' });
};

beforeAll(async () => {
    app = await initTestApp();
    ownerCookie = await signUpUser(app, { email: 'mrowner@test.dev', username: 'mr_owner' });
    authorCookie = await signUpUser(app, { email: 'mrauthor@test.dev', username: 'mr_author' });
    await setupForkWithChanges();
});

describe('merge request creation', () => {
    it('rejects MRs from projects that are not forks', async () => {
        const p = await request(app).post('/api/projects').set('Cookie', authorCookie)
            .send({ name: 'Standalone', state: minimalState() });
        const res = await request(app).post('/api/merge-requests').set('Cookie', authorCookie)
            .send({ sourceProjectId: p.body.project.id, title: 'nope' });
        expect(res.status).toBe(400);
    });

    it('creates an open MR with a computed diff', async () => {
        const res = await request(app).post('/api/merge-requests').set('Cookie', authorCookie)
            .send({ sourceProjectId: forkId, title: 'Improve the page template', description: 'Better name' });
        expect(res.status).toBe(201);
        expect(res.body.mergeRequest.status).toBe('open');
        expect(res.body.mergeRequest.targetProjectId).toBe(upstreamId);
    });

    it('lists incoming MRs for the target owner and blocks others', async () => {
        const mine = await request(app).get(`/api/projects/${upstreamId}/merge-requests`).set('Cookie', ownerCookie);
        expect(mine.status).toBe(200);
        expect(mine.body.mergeRequests.length).toBe(1);
        expect(mine.body.mergeRequests[0].authorUsername).toBe('mr_author');

        const blocked = await request(app).get(`/api/projects/${upstreamId}/merge-requests`).set('Cookie', authorCookie);
        expect(blocked.status).toBe(404);
    });

    it('serves MR detail with live diff to owner and author only', async () => {
        const list = await request(app).get('/api/merge-requests/mine').set('Cookie', authorCookie);
        const mrId = list.body.mergeRequests[0].id;

        const detail = await request(app).get(`/api/merge-requests/${mrId}`).set('Cookie', ownerCookie);
        expect(detail.status).toBe(200);
        expect(detail.body.diff.source.templatesModified).toEqual({ default: ['page'] });
        expect(detail.body.diff.conflicts).toEqual([]);
        expect(detail.body.sourceState.variants.default.templates.page.name).toBe('Improved');

        const stranger = await signUpUser(app, { email: 'nosy@test.dev', username: 'nosy' });
        const blocked = await request(app).get(`/api/merge-requests/${mrId}`).set('Cookie', stranger);
        expect(blocked.status).toBe(404);
    });
});
```

- [ ] **Step 3: Run test to verify it fails**, then **Step 4: create `server/routes/mergeRequests.js`**:

```js
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { query } from '../db.js';
import { requireAuth } from '../middleware/guards.js';
import { getProjectRow, loadProject } from './projects.js';
import { threeWayDiff } from '../../shared/diff.js';

const router = Router();

const getCommitState = async (commitId) => {
    const rows = await query('SELECT state_json, schema_version FROM commits WHERE id = $1', [commitId]);
    if (!rows[0]) return null;
    return { state: JSON.parse(rows[0].state_json), schemaVersion: rows[0].schema_version };
};

const mrDto = async (row) => {
    const src = await getProjectRow(row.source_project_id);
    const tgt = await getProjectRow(row.target_project_id);
    const users = await query('SELECT username FROM "user" WHERE id = $1', [row.created_by]);
    return {
        id: row.id,
        sourceProjectId: row.source_project_id,
        sourceProjectName: src?.name ?? '(deleted)',
        sourceCommitId: row.source_commit_id,
        targetProjectId: row.target_project_id,
        targetProjectName: tgt?.name ?? '(deleted)',
        baseCommitId: row.base_commit_id,
        title: row.title,
        description: row.description,
        status: row.status,
        createdBy: row.created_by,
        authorUsername: users[0]?.username ?? null,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at
    };
};

export const getMrRow = async (id) => {
    const rows = await query('SELECT * FROM merge_requests WHERE id = $1', [id]);
    return rows[0];
};

// Recomputes the diff vs the target's CURRENT head. Returns { diff, sourceState, targetState } or { error }.
export const computeMrDiff = async (mr) => {
    const base = await getCommitState(mr.base_commit_id);
    const source = await getCommitState(mr.source_commit_id);
    const target = await getProjectRow(mr.target_project_id);
    if (!base || !source || !target?.head_commit_id) return { error: 'Missing commits' };
    const targetHead = await getCommitState(target.head_commit_id);
    if (!targetHead) return { error: 'Missing target head' };
    if (source.schemaVersion !== targetHead.schemaVersion) {
        return { error: 'Schema versions differ between fork and upstream — the fork author must re-save with the latest app version' };
    }
    return {
        diff: threeWayDiff(base.state, source.state, targetHead.state),
        sourceState: source.state,
        targetState: targetHead.state,
        targetHeadCommitId: target.head_commit_id
    };
};

router.post('/api/merge-requests', requireAuth, async (req, res) => {
    const { sourceProjectId, title, description } = req.body || {};
    const t = typeof title === 'string' ? title.trim().slice(0, 200) : '';
    if (!t) return res.status(400).json({ error: 'title is required' });

    const source = await getProjectRow(sourceProjectId);
    if (!source || source.owner_id !== req.user.id) return res.status(404).json({ error: 'Source project not found' });
    if (!source.forked_from_project_id) return res.status(400).json({ error: 'Source project is not a fork' });
    const target = await getProjectRow(source.forked_from_project_id);
    if (!target || target.visibility !== 'public') return res.status(400).json({ error: 'Upstream project is not available' });
    if (source.head_commit_id === null) return res.status(400).json({ error: 'Source project has no commits' });

    const mr = {
        id: randomUUID(),
        source_project_id: source.id,
        source_commit_id: source.head_commit_id,
        target_project_id: target.id,
        base_commit_id: source.forked_from_commit_id,
        title: t,
        description: String(description ?? '').slice(0, 2000),
        created_by: req.user.id
    };
    const computed = await computeMrDiff(mr);
    if (computed.error) return res.status(400).json({ error: computed.error });
    const { diff } = computed;
    const hasChanges = diff.source.nodesChanged
        || diff.source.variantsAdded.length || diff.source.variantsRemoved.length
        || Object.keys(diff.source.variantsRenamed).length
        || Object.keys(diff.source.templatesAdded).length
        || Object.keys(diff.source.templatesModified).length
        || Object.keys(diff.source.templatesRemoved).length;
    if (!hasChanges) return res.status(400).json({ error: 'No changes to propose — save your edits to the cloud first' });

    const status = diff.conflicts.length > 0 ? 'conflicted' : 'open';
    await query(
        `INSERT INTO merge_requests (id, source_project_id, source_commit_id, target_project_id, base_commit_id, title, description, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [mr.id, mr.source_project_id, mr.source_commit_id, mr.target_project_id, mr.base_commit_id, mr.title, mr.description, status, mr.created_by]
    );
    res.status(201).json({ mergeRequest: await mrDto(await getMrRow(mr.id)) });
});

router.get('/api/projects/:id/merge-requests', requireAuth, loadProject(true), async (req, res) => {
    const rows = await query(
        `SELECT * FROM merge_requests WHERE target_project_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [req.project.id]);
    res.json({ mergeRequests: await Promise.all(rows.map(mrDto)) });
});

router.get('/api/merge-requests/mine', requireAuth, async (req, res) => {
    const rows = await query(
        `SELECT * FROM merge_requests WHERE created_by = $1 ORDER BY created_at DESC LIMIT 100`,
        [req.user.id]);
    res.json({ mergeRequests: await Promise.all(rows.map(mrDto)) });
});

const loadMrForParticipant = async (req, res, next) => {
    const mr = await getMrRow(req.params.id);
    if (!mr) return res.status(404).json({ error: 'Merge request not found' });
    const target = await getProjectRow(mr.target_project_id);
    const isAuthor = mr.created_by === req.user.id;
    const isTargetOwner = target && target.owner_id === req.user.id;
    if (!isAuthor && !isTargetOwner) return res.status(404).json({ error: 'Merge request not found' });
    req.mr = mr;
    req.isTargetOwner = !!isTargetOwner;
    next();
};

router.get('/api/merge-requests/:id', requireAuth, loadMrForParticipant, async (req, res) => {
    const mr = req.mr;
    if (mr.status === 'merged' || mr.status === 'closed') {
        return res.json({ mergeRequest: await mrDto(mr), diff: null, sourceState: null, targetState: null });
    }
    const computed = await computeMrDiff(mr);
    if (computed.error) return res.status(409).json({ error: computed.error });
    // keep stored status in sync with live conflict state
    const liveStatus = computed.diff.conflicts.length > 0 ? 'conflicted' : 'open';
    if (liveStatus !== mr.status) {
        await query('UPDATE merge_requests SET status = $1 WHERE id = $2', [liveStatus, mr.id]);
        mr.status = liveStatus;
    }
    res.json({
        mergeRequest: await mrDto(mr),
        diff: computed.diff,
        sourceState: computed.sourceState,
        targetState: computed.targetState
    });
});

export default router;
```

Mount in `server/app.js`: `import mergeRequestsRouter from './routes/mergeRequests.js';` then `app.use(mergeRequestsRouter);`.

**Route-order warning:** `/api/merge-requests/mine` must be declared BEFORE `/api/merge-requests/:id` (it is, in the code above — keep it that way).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/server/mergeRequests.test.js` — Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add server/migrations/index.js server/routes/mergeRequests.js server/app.js tests/unit/server/mergeRequests.test.js
git commit -m "feat(server): merge request creation, listing, and live diff detail"
```

---

### Task 25: MR merge + close endpoints

**Files:**
- Modify: `server/routes/mergeRequests.js`
- Test: append to `tests/unit/server/mergeRequests.test.js`

**Interfaces:**
- Produces:
  - `POST /api/merge-requests/:id/merge` (target owner only) → `{ mergeRequest, commit: { id } }`. Recomputes diff; 409 with `{ error }` if conflicted (and stores `status='conflicted'`); on success creates commit `Merge: <title> (from @<author>)` on target, sets `status='merged'`, `resolved_by`, `resolved_at`.
  - `POST /api/merge-requests/:id/close` (target owner or author) → `{ mergeRequest }` with `status='closed'`.
- Consumes: `applyChangeSet` (shared), `insertCommit` (projects route), `validateAppState`.

- [ ] **Step 1: Write the failing tests** (append to `mergeRequests.test.js`)

```js
describe('merge and close', () => {
    let mrId;
    beforeAll(async () => {
        const list = await request(app).get('/api/merge-requests/mine').set('Cookie', authorCookie);
        mrId = list.body.mergeRequests[0].id;
    });

    it('forbids merge by the author (only target owner)', async () => {
        const res = await request(app).post(`/api/merge-requests/${mrId}/merge`).set('Cookie', authorCookie);
        expect(res.status).toBe(403);
    });

    it('merges cleanly and creates a merge commit on target', async () => {
        const res = await request(app).post(`/api/merge-requests/${mrId}/merge`).set('Cookie', ownerCookie);
        expect(res.status).toBe(200);
        expect(res.body.mergeRequest.status).toBe('merged');

        const head = await request(app)
            .get(`/api/projects/${upstreamId}/commits/${res.body.commit.id}`).set('Cookie', ownerCookie);
        expect(head.body.commit.state.variants.default.templates.page.name).toBe('Improved');
        expect(head.body.commit.message).toContain('Merge:');
    });

    it('refuses to merge twice', async () => {
        const res = await request(app).post(`/api/merge-requests/${mrId}/merge`).set('Cookie', ownerCookie);
        expect(res.status).toBe(409);
    });

    it('409s on conflicted MRs', async () => {
        // author makes a NEW fork change; owner then changes the same template upstream
        await request(app).post(`/api/projects/${forkId}/commits`).set('Cookie', authorCookie)
            .send({ state: stateWithDayName('Fork v3'), message: 'fork again' });
        const mk = await request(app).post('/api/merge-requests').set('Cookie', authorCookie)
            .send({ sourceProjectId: forkId, title: 'Second round' });
        // NOTE: base is still the original fork point; upstream already merged 'Improved',
        // and now the owner edits the same template again:
        await request(app).post(`/api/projects/${upstreamId}/commits`).set('Cookie', ownerCookie)
            .send({ state: stateWithDayName('Owner rewrite'), message: 'owner edit' });
        const res = await request(app).post(`/api/merge-requests/${mk.body.mergeRequest.id}/merge`).set('Cookie', ownerCookie);
        expect(res.status).toBe(409);
        const detail = await request(app).get(`/api/merge-requests/${mk.body.mergeRequest.id}`).set('Cookie', ownerCookie);
        expect(detail.body.mergeRequest.status).toBe('conflicted');
    });

    it('author can close their own MR', async () => {
        const list = await request(app).get('/api/merge-requests/mine').set('Cookie', authorCookie);
        const openMr = list.body.mergeRequests.find(m => m.status !== 'merged');
        const res = await request(app).post(`/api/merge-requests/${openMr.id}/close`).set('Cookie', authorCookie);
        expect(res.status).toBe(200);
        expect(res.body.mergeRequest.status).toBe('closed');
    });
});
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: implement** (append to `server/routes/mergeRequests.js` before `export default router;`):

```js
import { insertCommit } from './projects.js';          // add to the existing import line at top
import { validateAppState } from '../validateAppState.js'; // top of file
import { applyChangeSet } from '../../shared/diff.js';     // extend existing shared import

router.post('/api/merge-requests/:id/merge', requireAuth, loadMrForParticipant, async (req, res) => {
    const mr = req.mr;
    if (!req.isTargetOwner) return res.status(403).json({ error: 'Only the upstream owner can merge' });
    if (mr.status === 'merged' || mr.status === 'closed') {
        return res.status(409).json({ error: `Merge request is already ${mr.status}` });
    }
    const computed = await computeMrDiff(mr);
    if (computed.error) return res.status(409).json({ error: computed.error });
    if (computed.diff.conflicts.length > 0) {
        await query(`UPDATE merge_requests SET status = 'conflicted' WHERE id = $1`, [mr.id]);
        return res.status(409).json({ error: 'Merge request has conflicts', conflicts: computed.diff.conflicts });
    }
    const base = await getCommitState(mr.base_commit_id);
    const merged = applyChangeSet(base.state, computed.sourceState, computed.targetState);
    const v = validateAppState(merged);
    if (!v.ok) return res.status(409).json({ error: `Merged state failed validation: ${v.error}` });

    const users = await query('SELECT username FROM "user" WHERE id = $1', [mr.created_by]);
    const target = await getProjectRow(mr.target_project_id);
    const commitId = await insertCommit({
        projectId: target.id,
        parentCommitId: target.head_commit_id,
        message: `Merge: ${mr.title} (from @${users[0]?.username ?? 'unknown'})`,
        state: merged,
        userId: req.user.id
    });
    await query(
        `UPDATE merge_requests SET status = 'merged', resolved_by = $1, resolved_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [req.user.id, mr.id]);
    res.json({ mergeRequest: await mrDto(await getMrRow(mr.id)), commit: { id: commitId } });
});

router.post('/api/merge-requests/:id/close', requireAuth, loadMrForParticipant, async (req, res) => {
    const mr = req.mr;
    if (mr.status === 'merged') return res.status(409).json({ error: 'Already merged' });
    await query(
        `UPDATE merge_requests SET status = 'closed', resolved_by = $1, resolved_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [req.user.id, mr.id]);
    res.json({ mergeRequest: await mrDto(await getMrRow(mr.id)) });
});
```

(Consolidate the imports at the top of the file rather than mid-file — ESM imports must be top-level.)

- [ ] **Step 4: Run all MR tests**

Run: `npx vitest run tests/unit/server/mergeRequests.test.js` — Expected: PASS (9 tests). Then the full suite: `npx vitest run tests/unit/` — all PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/mergeRequests.js tests/unit/server/mergeRequests.test.js
git commit -m "feat(server): merge and close endpoints with conflict re-verification"
```

---

### Task 26: MR client UI (propose, list, review, merge)

**Files:**
- Modify: `services/cloudApi.ts` (MR methods)
- Create: `components/cloud/ProposeChangesModal.tsx`
- Modify: `components/cloud/CloudMenu.tsx` (Propose changes entry)
- Create: `pages/MergeRequestPage.tsx`
- Modify: `pages/GalleryDetailPage.tsx` (owner's incoming MR list)
- Modify: `App.tsx` (route `/mr/:id`)

**Interfaces:**
- Produces route `/mr/:id`; `cloudApi` gains:

```ts
export interface MergeRequestDto {
    id: string; sourceProjectId: string; sourceProjectName: string; sourceCommitId: string;
    targetProjectId: string; targetProjectName: string; baseCommitId: string;
    title: string; description: string; status: 'open' | 'merged' | 'closed' | 'conflicted';
    createdBy: string; authorUsername: string | null; createdAt: string; resolvedAt: string | null;
}
export interface ChangeSetDto {
    variantsAdded: string[]; variantsRemoved: string[]; variantsRenamed: Record<string, string>;
    templatesAdded: Record<string, string[]>; templatesModified: Record<string, string[]>; templatesRemoved: Record<string, string[]>;
    nodesChanged: boolean;
}
export interface MrDetail {
    mergeRequest: MergeRequestDto;
    diff: { source: ChangeSetDto; target: ChangeSetDto; conflicts: { kind: string; variantId?: string; templateId?: string; description: string }[] } | null;
    sourceState: any; targetState: any;
}
```

and methods:

```ts
    createMergeRequest: (args: { sourceProjectId: string; title: string; description?: string }) =>
        api<{ mergeRequest: MergeRequestDto }>('/api/merge-requests', { method: 'POST', body: JSON.stringify(args) }),
    listIncomingMrs: async (projectId: string) =>
        (await api<{ mergeRequests: MergeRequestDto[] }>(`/api/projects/${projectId}/merge-requests`)).mergeRequests,
    listMyMrs: async () =>
        (await api<{ mergeRequests: MergeRequestDto[] }>('/api/merge-requests/mine')).mergeRequests,
    getMr: (id: string) => api<MrDetail>(`/api/merge-requests/${id}`),
    mergeMr: (id: string) => api<{ mergeRequest: MergeRequestDto; commit: { id: string } }>(`/api/merge-requests/${id}/merge`, { method: 'POST' }),
    closeMr: (id: string) => api<{ mergeRequest: MergeRequestDto }>(`/api/merge-requests/${id}/close`, { method: 'POST' }),
```

- [ ] **Step 1: Add the cloudApi types/methods above.** Run `npx tsc --noEmit`.

- [ ] **Step 2: Create `components/cloud/ProposeChangesModal.tsx`**

```tsx
import React, { useState } from 'react';
import { X, GitPullRequest } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cloudApi, ApiError } from '../../services/cloudApi';

interface ProposeChangesModalProps {
    sourceProjectId: string;
    onClose: () => void;
}

export function ProposeChangesModal({ sourceProjectId, onClose }: ProposeChangesModalProps) {
    const navigate = useNavigate();
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        if (!title.trim()) { setError('A title is required.'); return; }
        setBusy(true); setError(null);
        try {
            const res = await cloudApi.createMergeRequest({ sourceProjectId, title, description });
            navigate(`/mr/${res.mergeRequest.id}`);
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Could not create merge request');
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-[440px]" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b">
                    <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                        <GitPullRequest size={14} /> Propose changes to upstream
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
                </div>
                <div className="p-4 space-y-3">
                    <p className="text-xs text-slate-500">
                        Your latest cloud save will be proposed to the upstream project's owner.
                        Save to cloud first if you have unsaved edits.
                    </p>
                    <input value={title} onChange={e => setTitle(e.target.value)} maxLength={200}
                        className="w-full border rounded p-2 text-xs" placeholder="Title, e.g. 'Add iPad variant'" />
                    <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={2000} rows={3}
                        className="w-full border rounded p-2 text-xs" placeholder="What changed and why?" />
                    {error && <div className="text-xs text-red-600">{error}</div>}
                </div>
                <div className="px-4 py-3 border-t flex justify-end gap-2">
                    <button onClick={onClose} className="text-xs px-3 py-1.5 rounded border text-slate-600">Cancel</button>
                    <button onClick={submit} disabled={busy}
                        className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-50">
                        {busy ? 'Creating…' : 'Create merge request'}
                    </button>
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 3: Wire into `CloudMenu`**

Add `const [showPropose, setShowPropose] = useState(false);` and in the dropdown, only when `cloudProject?.forkedFromProjectId` (state from Task 20):

```tsx
    <button onClick={() => { setShowPropose(true); setOpen(false); }}
        className="w-full text-left flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
        <GitPullRequest size={12} /> Propose changes to upstream…
    </button>
```

and render:

```tsx
    {showPropose && project.cloud && (
        <ProposeChangesModal sourceProjectId={project.cloud.projectId} onClose={() => setShowPropose(false)} />
    )}
```

- [ ] **Step 4: Create `pages/MergeRequestPage.tsx`**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, GitMerge, XCircle, AlertTriangle, Eye } from 'lucide-react';
import { cloudApi, MrDetail, ChangeSetDto, ApiError } from '../services/cloudApi';
import { useSession } from '../lib/auth-client';
import { AccountMenu } from '../components/AccountMenu';
import { computePageOrder } from '../services/pdfService';
import { generateThumbnails } from '../services/thumbnailService';
import { migrateState } from '../services/migration';

const statusStyles: Record<string, string> = {
    open: 'bg-green-100 text-green-700',
    merged: 'bg-purple-100 text-purple-700',
    closed: 'bg-slate-200 text-slate-600',
    conflicted: 'bg-red-100 text-red-700'
};

function ChangeList({ cs }: { cs: ChangeSetDto }) {
    const rows: string[] = [];
    cs.variantsAdded.forEach(v => rows.push(`+ Variant added: ${v}`));
    cs.variantsRemoved.forEach(v => rows.push(`− Variant removed: ${v}`));
    Object.entries(cs.variantsRenamed).forEach(([v, n]) => rows.push(`~ Variant renamed: ${v} → "${n}"`));
    Object.entries(cs.templatesAdded).forEach(([v, ts]) => ts.forEach(t => rows.push(`+ Template added: ${v}/${t}`)));
    Object.entries(cs.templatesModified).forEach(([v, ts]) => ts.forEach(t => rows.push(`~ Template modified: ${v}/${t}`)));
    Object.entries(cs.templatesRemoved).forEach(([v, ts]) => ts.forEach(t => rows.push(`− Template removed: ${v}/${t}`)));
    if (cs.nodesChanged) rows.push('~ Page hierarchy (nodes) changed');
    if (rows.length === 0) return <div className="text-xs text-slate-400">No changes.</div>;
    return (
        <ul className="text-xs font-mono space-y-1">
            {rows.map((r, i) => (
                <li key={i} className={r.startsWith('+') ? 'text-green-700' : r.startsWith('−') ? 'text-red-700' : 'text-amber-700'}>{r}</li>
            ))}
        </ul>
    );
}

export function MergeRequestPage() {
    const { id } = useParams<{ id: string }>();
    const { data: session } = useSession();
    const [detail, setDetail] = useState<MrDetail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [previews, setPreviews] = useState<{ before: string; after: string } | null>(null);
    const [rendering, setRendering] = useState(false);

    const load = useCallback(() => {
        if (!id) return;
        cloudApi.getMr(id).then(setDetail).catch(e => setError(e instanceof ApiError ? e.message : 'Not found'));
    }, [id]);
    useEffect(load, [load]);

    const merge = async () => {
        if (!id || !window.confirm('Merge these changes into your project? A new version will be created.')) return;
        setBusy(true); setError(null);
        try { await cloudApi.mergeMr(id); load(); }
        catch (e) { setError(e instanceof ApiError ? e.message : 'Merge failed'); }
        finally { setBusy(false); }
    };

    const close = async () => {
        if (!id || !window.confirm('Close this merge request without merging?')) return;
        setBusy(true);
        try { await cloudApi.closeMr(id); load(); } finally { setBusy(false); }
    };

    // Renders a before/after preview of the first page whose template the MR modifies.
    const renderPreviews = async () => {
        if (!detail?.diff || !detail.sourceState || !detail.targetState) return;
        setRendering(true);
        try {
            const modified = Object.values(detail.diff.source.templatesModified).flat();
            const added = Object.values(detail.diff.source.templatesAdded).flat();
            const interesting = new Set([...modified, ...added]);
            const srcState = migrateState(detail.sourceState);
            const tgtState = migrateState(detail.targetState);
            const order = computePageOrder(srcState);
            const pageNode = order.find(nid => interesting.has(srcState.nodes[nid]?.type)) ?? order[0];
            const [after] = await generateThumbnails(srcState, [pageNode]);
            const [before] = await generateThumbnails(tgtState, [pageNode]);
            setPreviews({ before: before ?? '', after: after ?? '' });
        } catch { setError('Preview rendering failed'); }
        finally { setRendering(false); }
    };

    if (error && !detail) return <div className="p-10 text-sm text-red-600">{error}</div>;
    if (!detail) return <div className="p-10 text-sm text-slate-400">Loading…</div>;
    const mr = detail.mergeRequest;
    const isOwner = session?.user && (session.user as any).id !== mr.createdBy; // participant who isn't the author is the owner
    const actionable = mr.status === 'open' || mr.status === 'conflicted';

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="h-14 bg-white border-b flex items-center px-6 gap-4">
                <Link to={`/gallery/${mr.targetProjectId}`} className="flex items-center gap-1 text-sm text-slate-600 hover:text-blue-600">
                    <ArrowLeft size={14} /> {mr.targetProjectName}
                </Link>
                <div className="flex-1" />
                <AccountMenu />
            </header>
            <main className="max-w-3xl mx-auto p-6">
                <div className="flex items-center gap-3">
                    <h1 className="text-xl font-bold text-slate-800">{mr.title}</h1>
                    <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 uppercase ${statusStyles[mr.status]}`}>{mr.status}</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                    by {mr.authorUsername} · from <span className="font-mono">{mr.sourceProjectName}</span> · {new Date(mr.createdAt).toLocaleString()}
                </div>
                {mr.description && <p className="text-sm text-slate-600 mt-3 whitespace-pre-wrap">{mr.description}</p>}

                {detail.diff && (
                    <div className="bg-white border rounded-xl p-4 mt-5">
                        <h2 className="text-sm font-semibold text-slate-700 mb-2">Proposed changes</h2>
                        <ChangeList cs={detail.diff.source} />
                        {detail.diff.conflicts.length > 0 && (
                            <div className="mt-3 bg-red-50 border border-red-200 rounded p-3">
                                <div className="flex items-center gap-1 text-xs font-semibold text-red-700"><AlertTriangle size={12} /> Conflicts</div>
                                <ul className="text-xs text-red-600 mt-1 list-disc ml-4">
                                    {detail.diff.conflicts.map((c, i) => <li key={i}>{c.description}</li>)}
                                </ul>
                                <p className="text-[11px] text-red-500 mt-1">The fork author should fork the latest version again and re-apply their changes.</p>
                            </div>
                        )}
                        <div className="mt-3">
                            <button onClick={renderPreviews} disabled={rendering}
                                className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800 disabled:opacity-50">
                                <Eye size={12} /> {rendering ? 'Rendering…' : 'Render before/after preview'}
                            </button>
                            {previews && (
                                <div className="grid grid-cols-2 gap-3 mt-3">
                                    <div><div className="text-[10px] text-slate-400 mb-1">Current (upstream)</div>
                                        {previews.before && <img src={previews.before} className="border rounded w-full" alt="before" />}</div>
                                    <div><div className="text-[10px] text-slate-400 mb-1">Proposed</div>
                                        {previews.after && <img src={previews.after} className="border rounded w-full" alt="after" />}</div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {error && <div className="text-xs text-red-600 mt-3">{error}</div>}

                {actionable && (
                    <div className="flex gap-2 mt-5">
                        {isOwner && mr.status === 'open' && (
                            <button onClick={merge} disabled={busy}
                                className="flex items-center gap-1.5 bg-purple-600 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
                                <GitMerge size={14} /> Merge
                            </button>
                        )}
                        <button onClick={close} disabled={busy}
                            className="flex items-center gap-1.5 border border-slate-300 rounded-lg px-4 py-2 text-sm text-slate-700 disabled:opacity-50">
                            <XCircle size={14} /> Close
                        </button>
                    </div>
                )}
            </main>
        </div>
    );
}
```

Add route in `App.tsx`: `<Route path="/mr/:id" element={<MergeRequestPage />} />`.

- [ ] **Step 5: Owner's incoming MR list on `GalleryDetailPage`**

Where the Task 16 placeholder comment sits, add (state + effect + render):

```tsx
    const [mrs, setMrs] = useState<MergeRequestDto[]>([]);
    useEffect(() => {
        if (isOwner && id) cloudApi.listIncomingMrs(id).then(setMrs).catch(() => {});
    }, [isOwner, id]);
```

```tsx
    {isOwner && mrs.length > 0 && (
        <div className="mt-8">
            <h2 className="text-sm font-semibold text-slate-700 mb-2">Merge requests</h2>
            <div className="border rounded-lg divide-y bg-white">
                {mrs.map(mr => (
                    <Link key={mr.id} to={`/mr/${mr.id}`} className="flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50">
                        <span className="truncate">{mr.title} <span className="text-slate-400">by {mr.authorUsername}</span></span>
                        <span className="text-[10px] uppercase font-semibold text-slate-500">{mr.status}</span>
                    </Link>
                ))}
            </div>
        </div>
    )}
```

(import `MergeRequestDto` from cloudApi. Note `isOwner` was defined in Task 16.)

- [ ] **Step 6: Manual verification (full MR loop)**

Two browser profiles:
1. B (forker, from Task 20) edits a template on the fork → Save to cloud → Cloud → "Propose changes to upstream…" → lands on `/mr/:id` showing `~ Template modified: ...`.
2. A opens the upstream gallery page → sees the MR listed → opens it → "Render before/after preview" shows the visual difference → Merge → status flips to `merged`.
3. A opens Version history on their project → a `Merge: ...` commit is HEAD, and the template change is present after Restore.
4. Conflict path: repeat with both sides editing the same template → MR shows conflicted, Merge refused.

- [ ] **Step 7: Commit**

```bash
git add services/cloudApi.ts components/cloud/ProposeChangesModal.tsx components/cloud/CloudMenu.tsx pages/MergeRequestPage.tsx pages/GalleryDetailPage.tsx App.tsx
git commit -m "feat(client): merge request propose, review, preview, and merge UI"
```

---

### Task 27: E2E, docs, and wrap-up

**Files:**
- Create: `tests/e2e/merge-request.spec.ts`
- Create: `docs/8-cloud-and-gallery.md`
- Modify: `README.md`, `docs/README.md`

- [ ] **Step 1: Write the e2e spec** (single-browser, two sequential sessions via sign-out)

```ts
import { test, expect } from '@playwright/test';

const unique = Date.now();

// Full loop: A publishes → B forks, edits nothing structural but saves, proposes → A merges.
// Keep assertions coarse; the unit suites cover edge cases.
test('fork and merge request round trip', async ({ page }) => {
    test.setTimeout(180000);
    // ... sign up user A, save+publish (reuse the working selectors from tests/e2e/gallery.spec.ts)
    // ... sign out, sign up user B, open gallery detail, click "Fork this project"
    // ... in /app: Cloud → Save to cloud, then Cloud → Propose changes → fill title → Create
    await expect(page).toHaveURL(/\/mr\//);
    // ... sign out, sign in as A, open /mr link from gallery detail, click Merge
    // await expect(page.getByText(/merged/i)).toBeVisible();
});
```

Flesh this out by copying the exact working selectors from `tests/e2e/gallery.spec.ts` (Task 18). If multi-user flows prove too flaky for one browser context, use two `browser.newContext()` sessions in one test — Playwright supports independent cookie jars per context.

- [ ] **Step 2: Write `docs/8-cloud-and-gallery.md`**

Cover, in the same voice as docs 1–7: the local-first + explicit sync model; commits/history/restore; publishing requirements (account, cloud save, thumbnails); gallery browsing without login; fork lineage; MR lifecycle (open → merged/closed/conflicted) and the conflict rules from Task 22; the API surface table; env vars (`DATABASE_URL`, `TRUSTED_ORIGINS`, `ALLOWED_HOSTS`, `VITE_API_BASE`); the security model (session cookies, origin checks, rate limits, validation caps, thumbnail magic-byte checks); and the follow-ups list: email verification (needs an email provider), moving thumbnails to object storage, per-change cherry-pick merging, "update fork from upstream".

- [ ] **Step 3: Update `README.md`** — add a "☁️ Cloud, Gallery & Merge Requests" feature section mirroring the existing feature blurbs, and add `docs/8-cloud-and-gallery.md` to the docs index in `docs/README.md`.

- [ ] **Step 4: Full verification pass**

Run: `npx vitest run` — all unit tests PASS.
Run: `npx playwright test` — e2e PASS.
Run: `npm run build` — production build succeeds.
Boot `node server/index.js` and click through: gallery loads anonymously at `http://localhost:3001/gallery` (served from dist).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/merge-request.spec.ts docs/8-cloud-and-gallery.md README.md docs/README.md
git commit -m "docs+test: cloud/gallery documentation and merge-request e2e"
```

---

## Deferred (documented, intentionally NOT in this plan)

- **Email verification** — requires choosing/configuring an email provider; better-auth supports it via `emailVerification` config once one exists.
- **Object storage for thumbnails** — Postgres bytea is fine at launch scale; the `/api/thumbnails/:id` indirection means switching to GCS later changes no client code.
- **Per-change cherry-pick merging** and **"update fork from upstream"** — conflicted MRs currently require re-forking; acceptable v1 semantics per design.
- **Auto-sync** — explicitly rejected in design; local-first with explicit saves.
- **Content-Security-Policy tuning** — helmet ships with CSP disabled here because the SPA uses Google Fonts and inline styles; a tuned CSP is a follow-up hardening task.

## Verification Summary (run after every phase)

| Check | Command | Must show |
|---|---|---|
| Unit tests | `npx vitest run` | 0 failures |
| Types | `npx tsc --noEmit` | no new errors |
| Server boots | `node server/index.js` | migrations applied, listening |
| E2E (phases 3+) | `npx playwright test` | 0 failures |
| No secrets committed | `git diff --staged` before each commit | no `.env`, no tokens |
