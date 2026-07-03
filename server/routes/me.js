import { Router } from 'express';
import { optionalAuth } from '../middleware/guards.js';

const router = Router();

router.get('/api/me', optionalAuth, (req, res) => {
    if (!req.user) return res.json({ user: null });
    const { id, email, name, username, role } = req.user;
    res.json({ user: { id, email, name, username: username ?? null, role: role ?? null } });
});

export default router;
