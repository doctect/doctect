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
