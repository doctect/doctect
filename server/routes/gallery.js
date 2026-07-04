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
        // These are already-public, unauthenticated images meant to be embedded from the
        // client origin (which may differ from the API origin — see VITE_API_BASE). Helmet's
        // app-wide default (same-origin) would otherwise block <img> tags from loading them
        // cross-origin.
        .set('Cross-Origin-Resource-Policy', 'cross-origin')
        .send(img);
});

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

export default router;
