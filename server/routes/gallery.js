import { Router } from 'express';
import { randomUUID } from 'crypto';
import { dbType, query, withTransaction } from '../db.js';
import { optionalAuth, requireAdmin, requireAuth, requireUsername } from '../middleware/guards.js';
import { userWriteLimiter } from '../middleware/limits.js';
import { lockUser } from '../moderationSupport.js';
import { canModerateRole } from '../ownerAuthority.js';
import { insertPlatformAudit, validateReason } from '../platformAudit.js';
import { decodeStateRow } from '../stateCodec.js';
import { lockProjectRows } from '../projectLocks.js';

const router = Router();

router.get('/api/thumbnails/:thumbId', async (req, res) => {
    const rows = await query(
        `SELECT t.mime, t.image FROM thumbnails t
         JOIN projects p ON p.id = t.project_id
         WHERE t.id = $1 AND p.visibility = 'public' AND p.published_commit_id IS NOT NULL`,
        [req.params.thumbId]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    const img = Buffer.isBuffer(rows[0].image) ? rows[0].image : Buffer.from(rows[0].image);
    res.set('Content-Type', rows[0].mime)
        .set('X-Content-Type-Options', 'nosniff')
        .set('Cache-Control', 'public, max-age=86400')
        // These are already-public, unauthenticated images meant to be embedded from the
        // client origin (which may differ from the API origin — see VITE_API_BASE). Helmet's
        // app-wide default (same-origin) would otherwise block <img> tags from loading them
        // cross-origin.
        .set('Cross-Origin-Resource-Policy', 'cross-origin')
        .send(img);
});

const PAGE_SIZE = 24;

const ratingFields = `
    (SELECT AVG(rv.rating) FROM reviews rv WHERE rv.project_id = p.id) AS rating_avg,
    (SELECT COUNT(*) FROM reviews rv WHERE rv.project_id = p.id) AS rating_count
`;

// Postgres returns AVG/COUNT as strings — Number() before math.
const ratingDtoFields = (r) => ({
    ratingAvg: r.rating_avg == null ? null : Math.round(Number(r.rating_avg) * 10) / 10,
    ratingCount: Number(r.rating_count ?? 0),
});

const cardFields = `
    p.id, p.published_name AS name, p.published_description AS description,
    p.published_tags AS tags, p.fork_count, p.download_count, p.published_at AS updated_at,
    u.username AS author,
    (SELECT t.id FROM thumbnails t WHERE t.project_id = p.id ORDER BY t.position LIMIT 1) AS thumbnail_id,
    ${ratingFields}
`;

const cardDto = (r) => ({
    id: r.id, name: r.name, description: r.description, tags: JSON.parse(r.tags || '[]'),
    author: r.author, forkCount: r.fork_count, downloadCount: r.download_count,
    updatedAt: r.updated_at, thumbnailId: r.thumbnail_id,
    ...ratingDtoFields(r)
});

// Ordered preview ids for the card rollover. Batched (one query for the whole
// page of results) because a per-row correlated subquery can't return an array
// on SQLite. Exported: the /api/users/:username projects DTO (routes/me.js)
// must stay shape-identical to the gallery card DTO, so it reuses this helper.
export async function thumbnailIdsByProject(projectIds) {
    const map = new Map();
    if (projectIds.length === 0) return map;
    const placeholders = projectIds.map((_, i) => `$${i + 1}`).join(', ');
    const rows = await query(
        `SELECT id, project_id FROM thumbnails WHERE project_id IN (${placeholders}) ORDER BY position`,
        projectIds);
    for (const r of rows) {
        if (!map.has(r.project_id)) map.set(r.project_id, []);
        map.get(r.project_id).push(r.id);
    }
    return map;
}

router.get('/api/gallery', async (req, res) => {
    const q = String(req.query.q ?? '').toLowerCase().slice(0, 100);
    const tag = String(req.query.tag ?? '').slice(0, 30);
    const sort = req.query.sort === 'popular'
        ? 'ORDER BY (p.fork_count + p.download_count) DESC, p.published_at DESC'
        : req.query.sort === 'rating'
            ? 'ORDER BY rating_avg DESC NULLS LAST, rating_count DESC, p.published_at DESC'
            : 'ORDER BY p.published_at DESC';
    const page = Math.max(0, parseInt(req.query.page ?? '0', 10) || 0);
    const limit = Math.min(PAGE_SIZE, Math.max(1, parseInt(req.query.limit ?? '0', 10) || PAGE_SIZE));

    const params = [`%${q}%`, `%${q}%`, `%${q}%`];
    let where = `p.visibility = 'public' AND p.published_commit_id IS NOT NULL
           AND (LOWER(p.published_name) LIKE $1 OR LOWER(p.published_description) LIKE $2 OR LOWER(p.published_tags) LIKE $3)`;
    if (tag) {
        // Tags are stored as a JSON array string; matching the JSON-quoted encoding of the
        // tag ("tag", incl. escaping) makes this an exact-element match — 'plan' cannot
        // match 'planner' because the closing quote must follow. The JSON-quoted tag can
        // itself contain LIKE wildcard characters (% or _), which must be escaped so a
        // tag like "a%b" can't wildcard-match unrelated tags — escape backslashes first,
        // then wildcards, and tell the DB the escape character is backslash.
        const quoted = JSON.stringify(tag).replace(/\\/g, '\\\\').replace(/[%_]/g, m => '\\' + m);
        params.push(`%${quoted}%`);
        where += ` AND p.published_tags LIKE $${params.length} ESCAPE '\\'`;
    }
    const rows = await query(
        `SELECT ${cardFields}
         FROM projects p JOIN "user" u ON u.id = p.owner_id
         WHERE ${where}
         ${sort}
         LIMIT ${limit + 1} OFFSET ${page * limit}`,
        params
    );
    const items = rows.slice(0, limit);
    const thumbs = await thumbnailIdsByProject(items.map(r => r.id));
    res.json({
        items: items.map(r => ({ ...cardDto(r), thumbnailIds: thumbs.get(r.id) ?? [] })),
        page,
        hasMore: rows.length > limit,
    });
});

router.get('/api/gallery/tags', async (req, res) => {
    const rows = await query(`SELECT published_tags AS tags FROM projects WHERE visibility = 'public' AND published_commit_id IS NOT NULL`, []);
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

const loadPublicProject = async (req, res, next) => {
    const rows = await query(
        `SELECT p.*, u.username AS author FROM projects p JOIN "user" u ON u.id = p.owner_id
         WHERE p.id = $1 AND p.visibility = 'public' AND p.published_commit_id IS NOT NULL`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Project not found' });
    req.publicProject = rows[0];
    next();
};

const isPublishedProject = project => project?.visibility === 'public' && project.published_commit_id !== null;

const reviewDto = (r) => ({
    id: r.id, rating: r.rating, body: r.body || '', author: r.author,
    createdAt: r.created_at, updatedAt: r.updated_at
});

const reviewSelect = `
    SELECT r.id, r.rating, r.body, r.created_at, r.updated_at, u.username AS author
    FROM reviews r JOIN "user" u ON u.id = r.user_id
`;

router.get('/api/gallery/:id', async (req, res) => {
    const rows = await query(
        `SELECT p.*, u.username AS author, t.id AS thumbnail_id, t.node_id AS thumbnail_node_id,
                fp.id AS forked_project_id, fp.published_name AS forked_name,
                fp.visibility AS forked_visibility, fu.username AS forked_author,
                ${ratingFields}
         FROM projects p
         JOIN "user" u ON u.id = p.owner_id
         LEFT JOIN thumbnails t ON t.project_id = p.id
         LEFT JOIN projects fp ON fp.id = p.forked_from_project_id
         LEFT JOIN "user" fu ON fu.id = fp.owner_id
         WHERE p.id = $1 AND p.visibility = 'public' AND p.published_commit_id IS NOT NULL
         ORDER BY t.position`,
        [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Project not found' });

    const p = rows[0];
    const forkedFrom = p.forked_project_id && p.forked_visibility === 'public'
        ? { projectId: p.forked_project_id, name: p.forked_name, author: p.forked_author }
        : null;
    res.json({
        project: {
            id: p.id, name: p.published_name, description: p.published_description, tags: JSON.parse(p.published_tags || '[]'),
            author: p.author, ownerId: p.owner_id, forkCount: p.fork_count, downloadCount: p.download_count,
            updatedAt: p.published_at, headCommitId: p.published_commit_id,
            thumbnailIds: rows.map(row => row.thumbnail_id).filter(Boolean),
            previews: rows.filter(row => row.thumbnail_id)
                .map(row => ({ id: row.thumbnail_id, nodeId: row.thumbnail_node_id ?? null })),
            forkedFrom,
            ...ratingDtoFields(p)
        }
    });
});

router.get('/api/gallery/:id/state', loadPublicProject, async (req, res) => {
    const p = req.publicProject;
    if (!p.published_commit_id) return res.status(404).json({ error: 'Project has no content' });
    const rows = await query('SELECT state_json, state_gzip FROM commits WHERE id = $1', [p.published_commit_id]);
    if (!rows[0]) return res.status(404).json({ error: 'Commit not found' });
    await query('UPDATE projects SET download_count = download_count + 1 WHERE id = $1', [p.id]);
    res.json({ name: p.published_name, state: decodeStateRow(rows[0]) });
});

router.post('/api/gallery/:id/report', optionalAuth, loadPublicProject, async (req, res) => {
    const reason = String(req.body?.reason ?? '').trim().slice(0, 500);
    if (!reason) return res.status(400).json({ error: 'reason is required' });
    const created = await withTransaction(async txQuery => {
        const projects = await lockProjectRows([req.params.id], txQuery);
        if (!isPublishedProject(projects[0])) return false;
        await txQuery('INSERT INTO reports (id, project_id, reporter_user_id, reason) VALUES ($1, $2, $3, $4)',
            [randomUUID(), projects[0].id, req.user?.id ?? null, reason]);
        return true;
    });
    if (!created) return res.status(404).json({ error: 'Project not found' });
    res.status(201).json({ success: true });
});

router.get('/api/admin/reports', requireAdmin, async (req, res) => {
    const rows = await query(
        `SELECT r.*, p.name AS project_name, rv.body AS review_body, rv.rating AS review_rating
         FROM reports r
         LEFT JOIN projects p ON p.id = r.project_id
         LEFT JOIN reviews rv ON rv.id = r.review_id
         ORDER BY r.created_at DESC LIMIT 200`, []);
    res.json({ reports: rows });
});

router.post('/api/admin/projects/:id/unpublish', requireAdmin, async (req, res) => {
    const reason = validateReason(req.body?.reason);
    if (!reason) return res.status(400).json({ error: 'Invalid project unpublish request' });

    try {
        const discovered = await query('SELECT owner_id FROM projects WHERE id = $1', [req.params.id]);
        if (!discovered[0]) return res.status(404).json({ error: 'Project not found' });

        const result = await withTransaction(async txQuery => {
            const target = await lockUser(discovered[0].owner_id, txQuery);
            const projects = await lockProjectRows([req.params.id], txQuery);
            const project = projects[0];
            if (!target || !project || project.owner_id !== discovered[0].owner_id) return { status: 409 };
            if (!canModerateRole(req.user.role, target.role)) return { status: 403 };
            if (!isPublishedProject(project)) return { status: 409 };

            await txQuery(
                `UPDATE projects SET visibility = 'private', published_commit_id = NULL WHERE id = $1`,
                [project.id],
            );
            const action = await insertPlatformAudit(txQuery, {
                actorKind: 'user',
                actorUserId: req.user.id,
                actorEmail: req.user.email,
                targetUserId: target.id,
                targetEmail: target.email,
                projectId: project.id,
                reviewId: null,
                action: 'project_unpublished',
                reason,
                expiresAt: null,
                createdAt: new Date().toISOString(),
                metadata: { source: 'standalone_project', previousProjectVisibility: 'public' },
            });
            return { status: 200, action };
        });
        if (result.status === 403) return res.status(403).json({ error: 'Target is protected by role hierarchy' });
        if (result.status === 409) {
            return res.status(409).json({ error: 'Project state changed; refresh and try again' });
        }
        return res.json({ success: true, action: result.action });
    } catch (error) {
        console.error('Project unpublish failed:', error);
        return res.status(500).json({ error: 'Project unpublish failed' });
    }
});

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
    const result = await withTransaction(async txQuery => {
        const projects = await lockProjectRows([req.params.id], txQuery);
        const current = projects[0];
        if (!isPublishedProject(current)) return { status: 'missing' };
        if (current.owner_id === req.user.id) return { status: 'self-review' };

        await txQuery(
            `INSERT INTO reviews (id, project_id, user_id, rating, body, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (project_id, user_id)
             DO UPDATE SET rating = EXCLUDED.rating, body = EXCLUDED.body, updated_at = EXCLUDED.updated_at`,
            [randomUUID(), current.id, req.user.id, rating, body, now, now]);
        const rows = await txQuery(
            `${reviewSelect} WHERE r.project_id = $1 AND r.user_id = $2`, [current.id, req.user.id]);
        if (!rows[0]) return { status: 'removed' };
        return { status: 'saved', review: reviewDto(rows[0]) };
    });
    if (result.status === 'missing') return res.status(404).json({ error: 'Project not found' });
    if (result.status === 'self-review') return res.status(403).json({ error: "You can't review your own project" });
    if (result.status === 'removed') return res.status(409).json({ error: 'Review was removed concurrently, try again' });
    res.json({ review: result.review });
});

router.delete('/api/gallery/:id/review', requireAuth, loadPublicProject, async (req, res) => {
    const rows = await query(
        'SELECT id FROM reviews WHERE project_id = $1 AND user_id = $2',
        [req.publicProject.id, req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'No review to delete' });
    await query('DELETE FROM reviews WHERE id = $1', [rows[0].id]);
    res.json({ success: true });
});

router.post('/api/gallery/:id/reviews/:reviewId/report', optionalAuth, loadPublicProject, async (req, res) => {
    const reason = String(req.body?.reason ?? '').trim().slice(0, 500);
    if (!reason) return res.status(400).json({ error: 'reason is required' });
    const resolved = await query('SELECT id, project_id FROM reviews WHERE id = $1', [req.params.reviewId]);
    if (!resolved[0] || resolved[0].project_id !== req.params.id) {
        return res.status(404).json({ error: 'Review not found' });
    }

    const result = await withTransaction(async txQuery => {
        const projects = await lockProjectRows([resolved[0].project_id], txQuery);
        if (!isPublishedProject(projects[0])) return 'project-missing';

        const lockSuffix = dbType === 'postgres' ? ' FOR UPDATE' : '';
        const reviews = await txQuery(
            `SELECT id FROM reviews WHERE id = $1 AND project_id = $2${lockSuffix}`,
            [req.params.reviewId, projects[0].id]);
        if (!reviews[0]) return 'review-missing';
        await txQuery(
            'INSERT INTO reports (id, project_id, reporter_user_id, reason, review_id) VALUES ($1, $2, $3, $4, $5)',
            [randomUUID(), projects[0].id, req.user?.id ?? null, reason, reviews[0].id]);
        return 'created';
    });
    if (result === 'project-missing') return res.status(404).json({ error: 'Project not found' });
    if (result === 'review-missing') return res.status(404).json({ error: 'Review not found' });
    res.status(201).json({ success: true });
});

router.delete('/api/admin/reviews/:id', requireAdmin, async (req, res) => {
    const reason = validateReason(req.body?.reason);
    if (!reason) return res.status(400).json({ error: 'Invalid review deletion request' });

    try {
        const discovered = await query('SELECT user_id, project_id FROM reviews WHERE id = $1', [req.params.id]);
        if (!discovered[0]) return res.status(404).json({ error: 'Review not found' });

        const result = await withTransaction(async txQuery => {
            const target = await lockUser(discovered[0].user_id, txQuery);
            const projects = await lockProjectRows([discovered[0].project_id], txQuery);
            const project = projects[0];
            const lockSuffix = dbType === 'postgres' ? ' FOR UPDATE' : '';
            const reviews = await txQuery(
                `SELECT id, project_id, user_id, rating FROM reviews WHERE id = $1${lockSuffix}`,
                [req.params.id],
            );
            const review = reviews[0];
            if (!target || !project || !review
                || project.id !== discovered[0].project_id
                || review.project_id !== discovered[0].project_id
                || review.user_id !== discovered[0].user_id) return { status: 409 };
            if (!canModerateRole(req.user.role, target.role)) return { status: 403 };

            await txQuery('DELETE FROM reviews WHERE id = $1', [review.id]);
            const action = await insertPlatformAudit(txQuery, {
                actorKind: 'user',
                actorUserId: req.user.id,
                actorEmail: req.user.email,
                targetUserId: target.id,
                targetEmail: target.email,
                projectId: review.project_id,
                reviewId: review.id,
                action: 'review_deleted',
                reason,
                expiresAt: null,
                createdAt: new Date().toISOString(),
                metadata: { source: 'standalone_review', deletedReviewRating: Number(review.rating) },
            });
            return { status: 200, action };
        });
        if (result.status === 403) return res.status(403).json({ error: 'Target is protected by role hierarchy' });
        if (result.status === 409) {
            return res.status(409).json({ error: 'Review state changed; refresh and try again' });
        }
        return res.json({ success: true, action: result.action });
    } catch (error) {
        console.error('Review deletion failed:', error);
        return res.status(500).json({ error: 'Review deletion failed' });
    }
});

export default router;
