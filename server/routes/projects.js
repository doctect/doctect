import { Router } from 'express';
import { randomUUID } from 'crypto';
import { query } from '../db.js';
import { requireAuth, optionalAuth, requireUsername } from '../middleware/guards.js';
import { validateAppState } from '../validateAppState.js';
import { encodeState, decodeStateRow } from '../stateCodec.js';
import { assertStorageAllowance, assertProjectAllowance, assertPublishAllowance, sendLimitError, userWriteLimiter, userStorageQuotaBytes } from '../middleware/limits.js';

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
    await pruneCommits(projectId);
    return id;
};

const cleanName = (name) => (typeof name === 'string' ? name.trim().slice(0, 100) : '');
const cleanMessage = (m) => (typeof m === 'string' && m.trim() ? m.trim().slice(0, 500) : 'Update');

router.post('/api/projects', requireAuth, requireUsername, userWriteLimiter, async (req, res) => {
    const { name, state, message } = req.body || {};
    const n = cleanName(name);
    if (!n) return res.status(400).json({ error: 'name is required (max 100 chars)' });
    const v = validateAppState(state);
    if (!v.ok) return res.status(400).json({ error: `invalid state: ${v.error}` });

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
    const row = await getProjectRow(projectId);
    res.status(201).json({ project: projectDto(row), commit: { id: commitId } });
});

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
    await query('DELETE FROM reviews WHERE project_id = $1', [req.project.id]);
    await query('DELETE FROM commits WHERE project_id = $1', [req.project.id]);
    await query('DELETE FROM projects WHERE id = $1', [req.project.id]);
    res.json({ success: true });
});

router.post('/api/projects/:id/commits', requireAuth, requireUsername, userWriteLimiter, loadProject(true), async (req, res) => {
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

    try {
        await assertStorageAllowance(req.user.id, encoded.bytes);
    } catch (e) {
        if (sendLimitError(res, e)) return;
        throw e;
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
    const rows = await query('SELECT id, message, created_at, state_json, state_gzip FROM commits WHERE id = $1 AND project_id = $2',
        [req.params.commitId, req.project.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Commit not found' });
    res.json({ commit: { id: rows[0].id, message: rows[0].message, createdAt: rows[0].created_at, state: decodeStateRow(rows[0]) } });
});

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

router.post('/api/projects/:id/publish', requireAuth, requireUsername, loadProject(true), async (req, res) => {
    const expectedHead = req.get('If-Match');
    if (!expectedHead) {
        return res.status(428).json({ error: 'If-Match header is required.', code: 'PROJECT_HEAD_REQUIRED' });
    }
    const currentProject = await getProjectRow(req.project.id);
    if (!currentProject || currentProject.head_commit_id !== expectedHead) {
        return res.status(409).json({ error: 'Project head changed since it was inspected.', code: 'PROJECT_HEAD_CHANGED' });
    }

    if (currentProject.visibility !== 'public') {
        try {
            await assertPublishAllowance(req.user.id);
        } catch (e) {
            if (sendLimitError(res, e)) return;
            throw e;
        }
    }
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

    const updated = await query(
        `UPDATE projects SET visibility = 'public', description = $1, tags = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND head_commit_id = $4
         RETURNING *`,
        [d, JSON.stringify(tags), currentProject.id, expectedHead]
    );
    if (!updated[0]) {
        return res.status(409).json({ error: 'Project head changed since it was inspected.', code: 'PROJECT_HEAD_CHANGED' });
    }

    await query('DELETE FROM thumbnails WHERE project_id = $1', [currentProject.id]);
    for (let i = 0; i < parsed.length; i++) {
        await query('INSERT INTO thumbnails (id, project_id, position, mime, image) VALUES ($1, $2, $3, $4, $5)',
            [randomUUID(), currentProject.id, i, parsed[i].mime, parsed[i].buf]);
    }

    const row = updated[0];
    res.json({ project: { ...projectDto(row), thumbnailIds: await getThumbnailIds(row.id) } });
});

router.post('/api/projects/:id/unpublish', requireAuth, loadProject(true), async (req, res) => {
    await query(`UPDATE projects SET visibility = 'private' WHERE id = $1`, [req.project.id]);
    res.json({ project: projectDto(await getProjectRow(req.project.id)) });
});

router.post('/api/projects/:id/fork', requireAuth, requireUsername, userWriteLimiter, loadProject(false), async (req, res) => {
    const src = req.project;
    if (!src.head_commit_id) return res.status(400).json({ error: 'Source project has no content' });
    const headRows = await query('SELECT state_json, state_gzip, state_bytes FROM commits WHERE id = $1', [src.head_commit_id]);
    if (!headRows[0]) return res.status(404).json({ error: 'Source commit not found' });

    try {
        await assertProjectAllowance(req.user.id);
        await assertStorageAllowance(req.user.id, Number(headRows[0].state_bytes ?? 0));
    } catch (e) {
        if (sendLimitError(res, e)) return;
        throw e;
    }

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
        state: decodeStateRow(headRows[0]),
        userId: req.user.id
    });
    await query('UPDATE projects SET fork_count = fork_count + 1 WHERE id = $1', [src.id]);
    res.status(201).json({ project: projectDto(await getProjectRow(forkId)) });
});

export default router;
