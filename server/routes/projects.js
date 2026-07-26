import { Router } from 'express';
import { randomUUID } from 'crypto';
import { dbType, query, withTransaction } from '../db.js';
import { requireAuth, optionalAuth, requireUsername } from '../middleware/guards.js';
import { validateAppState } from '../validateAppState.js';
import { encodeState, decodeStateRow } from '../stateCodec.js';
import { assertStorageAllowance, assertProjectAllowance, assertPublishAllowance, sendLimitError, userWriteLimiter, userStorageQuotaBytes } from '../middleware/limits.js';
import { lockProjectRows } from '../projectLocks.js';
import { publicationTag } from '../../shared/publicationTag.js';

const router = Router();

export const getProjectRow = async (id, queryFn = query) => {
    const rows = await queryFn('SELECT * FROM projects WHERE id = $1', [id]);
    return rows[0];
};

const projectDto = (row, usePublishedHead = false) => ({
    id: row.id,
    ownerId: row.owner_id,
    name: usePublishedHead ? row.published_name : row.name,
    description: usePublishedHead ? row.published_description : row.description,
    tags: JSON.parse((usePublishedHead ? row.published_tags : row.tags) || '[]'),
    visibility: row.visibility,
    headCommitId: usePublishedHead ? row.published_commit_id : row.head_commit_id,
    publishedCommitId: row.published_commit_id,
    forkedFromProjectId: row.forked_from_project_id,
    forkedFromCommitId: row.forked_from_commit_id,
    downloadCount: row.download_count,
    forkCount: row.fork_count,
    createdAt: row.created_at,
    updatedAt: usePublishedHead ? row.published_at : row.updated_at
});

const retentionLimit = () => {
    const v = Number(process.env.COMMIT_RETENTION_PER_PROJECT);
    return Number.isFinite(v) && v > 0 ? v : 50;
};

// Deletes commits beyond the newest N for a project. Commits referenced by an active
// merge request must survive because detail recomputes its diff from them live.
// Note $1 and $2 are the same projectId passed twice: the SQLite adapter rewrites
// placeholders positionally, so a reused $1 would mis-bind (see Global Constraints).
export const pruneCommits = async (projectId, queryFn = query) => {
    await queryFn(
        `DELETE FROM commits
         WHERE project_id = $1
           AND id NOT IN (SELECT id FROM commits WHERE project_id = $2 ORDER BY created_at DESC, id DESC LIMIT $3)
           AND id NOT IN (SELECT source_commit_id FROM merge_requests WHERE status IN ('open', 'conflicted'))
           AND id NOT IN (SELECT base_commit_id FROM merge_requests WHERE status IN ('open', 'conflicted'))
           AND id NOT IN (SELECT commit_id FROM project_publications WHERE project_id = $4)`,
        [projectId, projectId, retentionLimit(), projectId]
    );
};

export class ProjectHeadChangedError extends Error {}

export const insertCommit = async ({ projectId, parentCommitId, message, state, userId, encoded }, queryFn = query) => {
    const id = randomUUID();
    const enc = encoded ?? encodeState(state);
    // Explicit millisecond-precision timestamp rather than relying on the DB's
    // CURRENT_TIMESTAMP default: SQLite's default only has whole-second resolution,
    // so two commits created within the same second (routine in tests, and possible
    // in production for rapid saves) would tie and fall back to sorting by the
    // random commit UUID — breaking the "newest first" ordering guarantee below.
    const createdAt = new Date().toISOString();
    await queryFn(
        `INSERT INTO commits (id, project_id, parent_commit_id, message, state_json, state_gzip, state_bytes, state_hash, schema_version, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [id, projectId, parentCommitId ?? null, message, '', enc.gzip, enc.bytes, enc.hash, state.schemaVersion ?? null, userId, createdAt]
    );
    const updated = parentCommitId === null
        ? await queryFn(
            `UPDATE projects SET head_commit_id = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND head_commit_id IS NULL RETURNING id`,
            [id, projectId])
        : await queryFn(
            `UPDATE projects SET head_commit_id = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND head_commit_id = $3 RETURNING id`,
            [id, projectId, parentCommitId]);
    if (!updated[0]) throw new ProjectHeadChangedError('Project head changed.');
    await pruneCommits(projectId, queryFn);
    return { id, createdAt };
};

const cleanName = (name) => (typeof name === 'string' ? name.trim().slice(0, 100) : '');
const cleanMessage = (m) => (typeof m === 'string' && m.trim() ? m.trim().slice(0, 500) : 'Update');

const expectedHeadFromRequest = (req, res) => {
    const ifMatch = req.get('If-Match');
    if (!ifMatch) {
        res.status(428).json({ error: 'If-Match header is required.', code: 'PROJECT_HEAD_REQUIRED' });
        return null;
    }
    const entityTag = /^"([\x21\x23-\x7e]+)"$/.exec(ifMatch);
    if (!entityTag) {
        res.status(400).json({ error: 'If-Match must contain one quoted strong entity tag.', code: 'INVALID_IF_MATCH' });
        return null;
    }
    return entityTag[1];
};

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

    const created = await withTransaction(async txQuery => {
        const projectId = randomUUID();
        await txQuery(
            `INSERT INTO projects (id, owner_id, name) VALUES ($1, $2, $3)`,
            [projectId, req.user.id, n]
        );
        const commit = await insertCommit({ projectId, parentCommitId: null, message: cleanMessage(message ?? 'Initial save'), state, userId: req.user.id, encoded }, txQuery);
        return { row: await getProjectRow(projectId, txQuery), commit };
    });
    res.status(201).json({ project: projectDto(created.row), commit: { id: created.commit.id } });
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
    res.json({ project: projectDto(req.project, !req.isOwner) });
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
    // Keep closed MR history, but remove every project-owned row explicitly because
    // SQLite deployments cannot depend on foreign-key cascade settings.
    const deleted = await withTransaction(async txQuery => {
        // Merge resolves MR -> project, so deletion pre-locks active MRs in sorted
        // order before taking the project lock to preserve that PostgreSQL lock order.
        const mrLockSuffix = dbType === 'postgres' ? ' FOR UPDATE' : '';
        await txQuery(
            `SELECT id FROM merge_requests
             WHERE (source_project_id = $1 OR target_project_id = $2) AND status IN ('open', 'conflicted')
             ORDER BY id${mrLockSuffix}`,
            [req.params.id, req.params.id]
        );
        const projects = await lockProjectRows([req.params.id], txQuery);
        const project = projects[0];
        if (!project || project.owner_id !== req.user.id) return false;

        await txQuery(
            `UPDATE merge_requests SET status = 'closed', resolved_at = CURRENT_TIMESTAMP
             WHERE (source_project_id = $1 OR target_project_id = $2) AND status IN ('open', 'conflicted')`,
            [project.id, project.id]
        );
        await txQuery('DELETE FROM reports WHERE project_id = $1', [project.id]);
        await txQuery('DELETE FROM project_publications WHERE project_id = $1', [project.id]);
        await txQuery('DELETE FROM thumbnails WHERE project_id = $1', [project.id]);
        await txQuery('DELETE FROM reviews WHERE project_id = $1', [project.id]);
        await txQuery('DELETE FROM commits WHERE project_id = $1', [project.id]);
        await txQuery('DELETE FROM projects WHERE id = $1', [project.id]);
        return true;
    });
    if (!deleted) return res.status(404).json({ error: 'Project not found' });
    res.json({ success: true });
});

router.post('/api/projects/:id/commits', requireAuth, requireUsername, userWriteLimiter, loadProject(true), async (req, res) => {
    const expectedHead = expectedHeadFromRequest(req, res);
    if (expectedHead === null) return;
    const { state, message } = req.body || {};
    const v = validateAppState(state);
    if (!v.ok) return res.status(400).json({ error: `invalid state: ${v.error}` });
    const encoded = encodeState(state);

    let result;
    try {
        result = await withTransaction(async txQuery => {
            const lockSuffix = dbType === 'postgres' ? ' FOR UPDATE' : '';
            const projects = await txQuery(`SELECT * FROM projects WHERE id = $1${lockSuffix}`, [req.project.id]);
            const current = projects[0];
            if (!current || current.owner_id !== req.user.id) return { status: 'missing' };
            if (current.head_commit_id !== expectedHead) return { status: 'changed' };

            // Dedupe against the locked current head. Legacy NULL hashes never match.
            const heads = await txQuery('SELECT id, message, created_at, state_hash FROM commits WHERE id = $1', [expectedHead]);
            if (heads[0]?.state_hash === encoded.hash) {
                return { status: 'deduped', commit: { id: heads[0].id, message: heads[0].message, createdAt: heads[0].created_at } };
            }

            await assertStorageAllowance(req.user.id, encoded.bytes, txQuery);
            const clean = cleanMessage(message);
            const commit = await insertCommit({
                projectId: current.id,
                parentCommitId: expectedHead,
                message: clean,
                state,
                userId: req.user.id,
                encoded
            }, txQuery);
            return { status: 'created', commit: { id: commit.id, message: clean, createdAt: commit.createdAt } };
        });
    } catch (e) {
        if (sendLimitError(res, e)) return;
        if (e instanceof ProjectHeadChangedError) {
            return res.status(409).json({ error: 'Project head changed since your last save.', code: 'PROJECT_HEAD_CHANGED' });
        }
        throw e;
    }
    if (result.status === 'missing') return res.status(404).json({ error: 'Project not found' });
    if (result.status === 'changed') {
        return res.status(409).json({ error: 'Project head changed since your last save.', code: 'PROJECT_HEAD_CHANGED' });
    }
    if (result.status === 'deduped') return res.json({ commit: result.commit, deduped: true });
    res.status(201).json({ commit: result.commit });
});

router.get('/api/projects/:id/commits', optionalAuth, loadProject(false), async (req, res) => {
    const publicFilter = req.isOwner
        ? ''
        : ' AND EXISTS (SELECT 1 FROM project_publications pp WHERE pp.project_id = commits.project_id AND pp.commit_id = commits.id)';
    const rows = await query(
        `SELECT id, parent_commit_id, message, schema_version, created_by, created_at
         FROM commits WHERE project_id = $1${publicFilter} ORDER BY created_at DESC, id DESC LIMIT 200`, [req.project.id]);
    const publishedIds = req.isOwner ? null : new Set(rows.map(row => row.id));
    res.json({
        commits: rows.map(r => ({
            id: r.id,
            parentCommitId: req.isOwner || publishedIds.has(r.parent_commit_id) ? r.parent_commit_id : null,
            message: r.message,
            schemaVersion: r.schema_version, createdBy: r.created_by, createdAt: r.created_at
        }))
    });
});

router.get('/api/projects/:id/commits/:commitId', optionalAuth, loadProject(false), async (req, res) => {
    const publicFilter = req.isOwner
        ? ''
        : ' AND EXISTS (SELECT 1 FROM project_publications pp WHERE pp.project_id = commits.project_id AND pp.commit_id = commits.id)';
    const rows = await query(`SELECT id, message, created_at, state_json, state_gzip FROM commits WHERE id = $1 AND project_id = $2${publicFilter}`,
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

export const MAX_PREVIEWS = 6;
const PREVIEW_COUNT_ERROR = `thumbnails must contain 1-${MAX_PREVIEWS} images`;

// Shared by the publish route and the listing-edit route so their validation can
// never drift. Returns { error } on bad input, { previews: null } when the caller
// omitted `thumbnails` entirely (the edit route reads that as "leave the existing
// previews alone"; publish rejects it), or the parsed set otherwise.
export const parsePreviewSet = (body) => {
    const { thumbnails, previewNodeIds } = body || {};
    if (thumbnails === undefined) {
        // Node ids label the images they arrive with; there is no path that re-tags
        // previews already stored. Accepting them alone would make the edit route
        // answer 200 to a request it silently ignored.
        if (previewNodeIds !== undefined) return { error: 'previewNodeIds requires thumbnails' };
        return { previews: null };
    }
    if (!Array.isArray(thumbnails) || thumbnails.length < 1 || thumbnails.length > MAX_PREVIEWS) {
        return { error: PREVIEW_COUNT_ERROR };
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

// The whole validated field set both listing writers accept, so publish and the
// listing edit can never drift apart. Returns { error } on bad input, otherwise
// { previews, tags, description } where a field the caller omitted comes back as
// `null` (previews) or `undefined` (description). The two routes read an omission
// differently: publish rewrites the listing wholesale, so it demands a preview set
// and treats a missing description as empty; the edit route keeps whatever is
// already published. `undefined` is the ONLY omission marker: an explicit JSON
// null was sent, so it clears the description rather than storing String(null).
const parseListingFields = (body) => {
    const previewSet = parsePreviewSet(body);
    if (previewSet.error) return { error: previewSet.error };
    const tags = parseTagList(body?.tags);
    if (tags === null) return { error: 'tags must be up to 10 strings of max 30 chars' };
    const description = body?.description === undefined
        ? undefined
        : String(body.description ?? '').slice(0, 2000);
    return { previews: previewSet.previews, tags, description };
};

export const replaceThumbnails = async (projectId, previews, txQuery) => {
    await txQuery('DELETE FROM thumbnails WHERE project_id = $1', [projectId]);
    for (let i = 0; i < previews.length; i++) {
        await txQuery(
            'INSERT INTO thumbnails (id, project_id, position, mime, image, node_id) VALUES ($1, $2, $3, $4, $5, $6)',
            [randomUUID(), projectId, i, previews[i].mime, previews[i].buf, previews[i].nodeId]);
    }
};

router.post('/api/projects/:id/publish', requireAuth, requireUsername, loadProject(true), async (req, res) => {
    const expectedHead = expectedHeadFromRequest(req, res);
    if (expectedHead === null) return;
    const listing = parseListingFields(req.body);
    if (listing.error) return res.status(400).json({ error: listing.error });
    if (!listing.previews) {
        return res.status(400).json({ error: PREVIEW_COUNT_ERROR });
    }
    const parsedTags = listing.tags;
    const d = listing.description ?? '';

    let published;
    try {
        published = await withTransaction(async txQuery => {
            const lockSuffix = dbType === 'postgres' ? ' FOR UPDATE' : '';
            // Serialize first-publish allowance checks per owner before locking a project.
            await txQuery(`SELECT id FROM "user" WHERE id = $1${lockSuffix}`, [req.user.id]);
            const current = await txQuery(`SELECT * FROM projects WHERE id = $1${lockSuffix}`, [req.project.id]);
            if (!current[0] || current[0].head_commit_id !== expectedHead) return null;
            if (current[0].visibility !== 'public') await assertPublishAllowance(req.user.id, txQuery);

            const updated = await txQuery(
                `UPDATE projects SET visibility = 'public', published_commit_id = $1,
                     published_name = name, published_description = $2, published_tags = $3,
                     published_at = CURRENT_TIMESTAMP, description = $4, tags = $5,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $6 AND head_commit_id = $7
                 RETURNING *`,
                [expectedHead, d, parsedTags, d, parsedTags, current[0].id, expectedHead]
            );
            if (!updated[0]) return null;

            await txQuery(
                `INSERT INTO project_publications (project_id, commit_id)
                 VALUES ($1, $2) ON CONFLICT (project_id, commit_id) DO NOTHING`,
                [current[0].id, expectedHead]
            );

            await replaceThumbnails(current[0].id, listing.previews, txQuery);
            const thumbnailRows = await txQuery('SELECT id FROM thumbnails WHERE project_id = $1 ORDER BY position', [current[0].id]);
            return { row: updated[0], thumbnailIds: thumbnailRows.map(item => item.id) };
        });
    } catch (e) {
        if (sendLimitError(res, e)) return;
        throw e;
    }

    if (!published) {
        return res.status(409).json({ error: 'Project head changed since it was inspected.', code: 'PROJECT_HEAD_CHANGED' });
    }
    res.json({ project: { ...projectDto(published.row), thumbnailIds: published.thumbnailIds } });
});

// Edits the listing's metadata. Writes the published_* columns AND mirrors tags and
// description onto the draft columns, so a later publish (which copies the draft columns
// forward) does not silently revert the edit. PATCH /api/projects/:id writes those same two
// draft columns and has no client caller today; if one ever appears, these two routes are
// writing the same columns and will need reconciling.
//
// Deliberately never writes published_commit_id (the public version is changed by publishing,
// not by editing its description), published_name (a copy of the project name), or
// published_at (it drives the gallery's "recently updated" sort, so a tag edit must not
// re-rank the project).
//
// No requireUsername: the established rule gates routes that attach NEW content
// to the gallery as the acting user, not routes acting on content the caller
// already owns — and publishing already required a username.
//
// If-Match carries a token identifying the LISTING the client loaded — not merely the version
// it was published from — matching publish's idiom, and a mismatch is refused. The race it
// closes: the Cloud menu offers "Edit gallery listing…" and "Publish to gallery…" side by
// side, so an owner can open the dialog, publish, then save the still-open dialog — writing
// the pre-publish description and tags over the just-published ones while the untouched
// selection omits `thumbnails` and leaves the post-publish previews standing.
//
// The token is composite (see shared/publicationTag.js) because publish does not require the
// head to have moved: republishing an unchanged commit rewrites the description, tags,
// previews and published_at while published_commit_id stays identical, so a commit-only token
// would still match and let exactly that mixture through. published_at is the second factor
// and never the sole one — SQLite's CURRENT_TIMESTAMP is second-resolution, so a republish
// inside the same second remains indistinguishable. That is the one residual here.
//
// Two concurrent EDITS still last-write-wins, and that is intended: an edit never moves
// published_commit_id and never moves published_at either (both are on the never-written list
// above), so both halves of the token survive an edit and both writers carry the same valid
// one. Both are the same owner editing their own metadata, and the loser loses only text it
// just typed — not, as above, a mixture of two publishes shown to the public.
router.patch('/api/projects/:id/publication', requireAuth, userWriteLimiter, loadProject(true), async (req, res) => {
    const notPublished = () => res.status(409).json({ error: 'Project is not published.', code: 'NOT_PUBLISHED' });
    // Ahead of the If-Match parse on purpose: "you never published this" is the more useful
    // answer to give a caller than "you omitted a header", and it is the truer one.
    if (req.project.visibility !== 'public' || !req.project.published_commit_id) return notPublished();

    const expectedPublication = expectedHeadFromRequest(req, res);
    if (expectedPublication === null) return;

    const listing = parseListingFields(req.body);
    if (listing.error) return res.status(400).json({ error: listing.error });

    const updated = await withTransaction(async txQuery => {
        const [current] = await lockProjectRows([req.project.id], txQuery);
        if (!current || current.owner_id !== req.user.id) return null;
        if (current.visibility !== 'public' || !current.published_commit_id) return null;
        // Compared under the row lock, next to the checks it belongs with: a publish that
        // commits between loadProject and here is exactly the case being caught. Built from
        // the locked row rather than parsed out of the header, so there is no delimiter to
        // disagree about — the two sides either produce the same string or they do not.
        if (publicationTag(current.published_commit_id, current.published_at) !== expectedPublication) {
            return 'stale';
        }

        // An omitted description keeps the published one, exactly as an omitted
        // thumbnails set keeps the published previews — this route must never lose
        // public data a caller did not mention. Placeholders are positional (the
        // SQLite adapter rewrites $n by position), so every value takes its own
        // number even when two columns carry the same one; numbering from the push
        // keeps the two in step.
        const params = [];
        const assign = (column, value) => `${column} = $${params.push(value)}`;
        const assignments = [assign('published_tags', listing.tags), assign('tags', listing.tags)];
        if (listing.description !== undefined) {
            assignments.push(
                assign('published_description', listing.description),
                assign('description', listing.description));
        }
        // Part of the list, not concatenated after it: an empty assignment list would
        // otherwise emit `SET , updated_at = …`, which does not parse.
        assignments.push('updated_at = CURRENT_TIMESTAMP');
        const rows = await txQuery(
            `UPDATE projects SET ${assignments.join(', ')}
             WHERE id = $${params.push(current.id)} RETURNING *`,
            params
        );
        if (!rows[0]) return null;

        if (listing.previews) await replaceThumbnails(current.id, listing.previews, txQuery);
        const thumbnailRows = await txQuery(
            'SELECT id FROM thumbnails WHERE project_id = $1 ORDER BY position', [current.id]);
        return { row: rows[0], thumbnailIds: thumbnailRows.map(item => item.id) };
    });

    if (updated === 'stale') {
        return res.status(409).json({
            error: 'This listing was republished after you loaded it.',
            code: 'PUBLICATION_CHANGED',
        });
    }
    if (!updated) return notPublished();
    res.json({ project: { ...projectDto(updated.row), thumbnailIds: updated.thumbnailIds } });
});

router.post('/api/projects/:id/unpublish', requireAuth, loadProject(true), async (req, res) => {
    await query(`UPDATE projects SET visibility = 'private', published_commit_id = NULL WHERE id = $1`, [req.project.id]);
    res.json({ project: projectDto(await getProjectRow(req.project.id)) });
});

router.post('/api/projects/:id/fork', requireAuth, requireUsername, userWriteLimiter, loadProject(false), async (req, res) => {
    let forked;
    try {
        forked = await withTransaction(async txQuery => {
            const lockSuffix = dbType === 'postgres' ? ' FOR UPDATE' : '';
            const sources = await txQuery(`SELECT * FROM projects WHERE id = $1${lockSuffix}`, [req.project.id]);
            const src = sources[0];
            const isOwner = src?.owner_id === req.user.id;
            if (!src || (!isOwner && src.visibility !== 'public')) return { status: 'missing' };
            const sourceCommitId = src.visibility === 'public' ? src.published_commit_id : src.head_commit_id;
            if (!sourceCommitId) return { status: 'empty' };
            const headRows = await txQuery('SELECT state_json, state_gzip, state_bytes FROM commits WHERE id = $1', [sourceCommitId]);
            if (!headRows[0]) return { status: 'commit-missing' };

            await assertProjectAllowance(req.user.id, txQuery);
            await assertStorageAllowance(req.user.id, Number(headRows[0].state_bytes ?? 0), txQuery);
            const sourceName = src.visibility === 'public' ? src.published_name : src.name;
            const sourceDescription = src.visibility === 'public' ? src.published_description : src.description;
            const sourceTags = src.visibility === 'public' ? src.published_tags : src.tags;
            const forkId = randomUUID();
            await txQuery(
                `INSERT INTO projects (id, owner_id, name, description, tags, forked_from_project_id, forked_from_commit_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [forkId, req.user.id, sourceName, sourceDescription, sourceTags, src.id, sourceCommitId]
            );
            await insertCommit({
                projectId: forkId,
                parentCommitId: null,
                message: `Fork of "${sourceName}"`,
                state: decodeStateRow(headRows[0]),
                userId: req.user.id
            }, txQuery);
            await txQuery('UPDATE projects SET fork_count = fork_count + 1 WHERE id = $1', [src.id]);
            return { status: 'created', row: await getProjectRow(forkId, txQuery) };
        });
    } catch (e) {
        if (sendLimitError(res, e)) return;
        throw e;
    }
    if (forked.status === 'missing') return res.status(404).json({ error: 'Project not found' });
    if (forked.status === 'empty') return res.status(400).json({ error: 'Source project has no content' });
    if (forked.status === 'commit-missing') return res.status(404).json({ error: 'Source commit not found' });
    res.status(201).json({ project: projectDto(forked.row) });
});

export default router;
