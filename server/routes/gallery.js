import { Router } from 'express';
import { randomUUID } from 'crypto';
import { query } from '../db.js';
import { optionalAuth, requireAdmin, requireAuth, requireUsername } from '../middleware/guards.js';
import { userWriteLimiter } from '../middleware/limits.js';
import { decodeStateRow } from '../stateCodec.js';

const router = Router();

router.get('/api/thumbnails/:thumbId', async (req, res) => {
    const rows = await query('SELECT mime, image FROM thumbnails WHERE id = $1', [req.params.thumbId]);
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
    p.id, p.name, p.description, p.tags, p.fork_count, p.download_count, p.updated_at,
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

const loadPublicProject = async (req, res, next) => {
    const rows = await query(
        `SELECT p.*, u.username AS author FROM projects p JOIN "user" u ON u.id = p.owner_id
         WHERE p.id = $1 AND p.visibility = 'public'`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Project not found' });
    req.publicProject = rows[0];
    next();
};

const reviewDto = (r) => ({
    id: r.id, rating: r.rating, body: r.body || '', author: r.author,
    createdAt: r.created_at, updatedAt: r.updated_at
});

const reviewSelect = `
    SELECT r.id, r.rating, r.body, r.created_at, r.updated_at, u.username AS author
    FROM reviews r JOIN "user" u ON u.id = r.user_id
`;

router.get('/api/gallery/:id', loadPublicProject, async (req, res) => {
    const p = req.publicProject;
    const thumbs = await query('SELECT id FROM thumbnails WHERE project_id = $1 ORDER BY position', [p.id]);
    const agg = await query(
        'SELECT AVG(rating) AS rating_avg, COUNT(*) AS rating_count FROM reviews WHERE project_id = $1',
        [p.id]);
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
            thumbnailIds: thumbs.map(t => t.id), forkedFrom,
            ...ratingDtoFields(agg[0])
        }
    });
});

router.get('/api/gallery/:id/state', loadPublicProject, async (req, res) => {
    const p = req.publicProject;
    if (!p.head_commit_id) return res.status(404).json({ error: 'Project has no content' });
    const rows = await query('SELECT state_json, state_gzip FROM commits WHERE id = $1', [p.head_commit_id]);
    if (!rows[0]) return res.status(404).json({ error: 'Commit not found' });
    await query('UPDATE projects SET download_count = download_count + 1 WHERE id = $1', [p.id]);
    res.json({ name: p.name, state: decodeStateRow(rows[0]) });
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
        `SELECT r.*, p.name AS project_name, rv.body AS review_body, rv.rating AS review_rating
         FROM reports r
         LEFT JOIN projects p ON p.id = r.project_id
         LEFT JOIN reviews rv ON rv.id = r.review_id
         ORDER BY r.created_at DESC LIMIT 200`, []);
    res.json({ reports: rows });
});

router.post('/api/admin/projects/:id/unpublish', requireAdmin, async (req, res) => {
    await query(`UPDATE projects SET visibility = 'private' WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
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

router.delete('/api/admin/reviews/:id', requireAdmin, async (req, res) => {
    await query('DELETE FROM reviews WHERE id = $1', [req.params.id]);
    res.json({ success: true });
});

export default router;
