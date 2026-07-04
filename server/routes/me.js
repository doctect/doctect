import { Router } from 'express';
import { optionalAuth } from '../middleware/guards.js';
import { query } from '../db.js';

const router = Router();

router.get('/api/me', optionalAuth, (req, res) => {
    if (!req.user) return res.json({ user: null });
    const { id, email, name, username, role } = req.user;
    res.json({ user: { id, email, name, username: username ?? null, role: role ?? null } });
});

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

export default router;
