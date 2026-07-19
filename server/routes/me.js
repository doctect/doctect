import { randomUUID } from 'crypto';
import { Router } from 'express';
import { strictOptionalAuth } from '../middleware/guards.js';
import { query } from '../db.js';
import { isSignupOpen } from '../signupCap.js';

const router = Router();

router.get('/api/me', strictOptionalAuth, (req, res) => {
    if (!req.user) return res.json({ user: null });
    // Deliberately excludes the account's real `name` field: it's the signup "Name" field,
    // never intended to be public, and no client code reads it off this endpoint.
    const { id, email, username, role } = req.user;
    res.json({ user: { id, email, username: username ?? null, role } });
});

router.get('/api/users/:username', async (req, res) => {
    const uname = String(req.params.username).toLowerCase();
    const users = await query('SELECT id, username, "createdAt" FROM "user" WHERE username = $1', [uname]);
    if (!users[0]) return res.status(404).json({ error: 'User not found' });
    const rows = await query(
        `SELECT p.id, p.published_name AS name, p.published_description AS description,
                p.published_tags AS tags, p.fork_count, p.download_count, p.published_at AS updated_at,
                (SELECT t.id FROM thumbnails t WHERE t.project_id = p.id ORDER BY t.position LIMIT 1) AS thumbnail_id,
                (SELECT AVG(rv.rating) FROM reviews rv WHERE rv.project_id = p.id) AS rating_avg,
                (SELECT COUNT(*) FROM reviews rv WHERE rv.project_id = p.id) AS rating_count
         FROM projects p WHERE p.owner_id = $1 AND p.visibility = 'public' AND p.published_commit_id IS NOT NULL
         ORDER BY p.published_at DESC LIMIT 100`,
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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.get('/api/signup-status', async (req, res) => {
    let open = true;
    try {
        open = await isSignupOpen();
    } catch (error) {
        // Same fail-open stance as the signup hook: a broken counter reads as open.
        console.error('Signup status check failed:', error);
    }
    // Deliberately exposes only the boolean — never the count or the cap value.
    res.json({ open });
});

router.post('/api/waitlist', async (req, res) => {
    if (await isSignupOpen()) {
        // Signups open: refuse, so the table can't become a general email collector.
        return res.status(409).json({ error: 'Signups are open — you can create an account right now.', code: 'SIGNUPS_OPEN' });
    }
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
        return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    // ON CONFLICT DO NOTHING: duplicate joins are idempotent success and don't
    // reveal whether an address was already on the list. Same syntax on both DBs.
    await query(
        'INSERT INTO waitlist (id, email, "createdAt") VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING',
        [randomUUID(), email, new Date().toISOString()]
    );
    res.json({ ok: true });
});

export default router;
