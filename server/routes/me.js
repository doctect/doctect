import { Router } from 'express';
import { optionalAuth } from '../middleware/guards.js';
import { query } from '../db.js';

const router = Router();

router.get('/api/me', optionalAuth, (req, res) => {
    if (!req.user) return res.json({ user: null });
    // Deliberately excludes the account's real `name` field: it's the signup "Name" field,
    // never intended to be public, and no client code reads it off this endpoint.
    const { id, email, username, role } = req.user;
    res.json({ user: { id, email, username: username ?? null, role: role ?? null } });
});

router.get('/api/users/:username', async (req, res) => {
    const uname = String(req.params.username).toLowerCase();
    const users = await query('SELECT id, username, "createdAt" FROM "user" WHERE username = $1', [uname]);
    if (!users[0]) return res.status(404).json({ error: 'User not found' });
    const rows = await query(
        `SELECT p.id, p.name, p.description, p.tags, p.fork_count, p.download_count, p.updated_at,
                (SELECT t.id FROM thumbnails t WHERE t.project_id = p.id ORDER BY t.position LIMIT 1) AS thumbnail_id,
                (SELECT AVG(rv.rating) FROM reviews rv WHERE rv.project_id = p.id) AS rating_avg,
                (SELECT COUNT(*) FROM reviews rv WHERE rv.project_id = p.id) AS rating_count
         FROM projects p WHERE p.owner_id = $1 AND p.visibility = 'public' ORDER BY p.updated_at DESC LIMIT 100`,
        [users[0].id]);
    res.json({
        // Public, unauthenticated endpoint — anyone can call this for any known/guessed
        // username. Deliberately excludes the account's real `name` field (see /api/me above).
        user: { username: users[0].username, createdAt: users[0].createdAt },
        projects: rows.map(r => ({
            id: r.id, name: r.name, description: r.description, tags: JSON.parse(r.tags || '[]'),
            author: users[0].username, forkCount: r.fork_count, downloadCount: r.download_count,
            updatedAt: r.updated_at, thumbnailId: r.thumbnail_id,
            ratingAvg: r.rating_avg == null ? null : Math.round(Number(r.rating_avg) * 10) / 10,
            ratingCount: Number(r.rating_count ?? 0)
        }))
    });
});

export default router;
