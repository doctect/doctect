import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { toNodeHandler } from 'better-auth/node';
import { getAuthForRequest, isHostAllowed } from './authRequest.js';
import { logEvent, getStats } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const createApp = () => {
    const app = express();
    app.set('trust proxy', 1);

    const trustedOrigins = (process.env.TRUSTED_ORIGINS || 'http://localhost:3000,http://localhost:3001')
        .split(',').map(o => o.trim()).filter(Boolean);

    app.use(cors({
        origin: trustedOrigins,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
    }));

    app.use((req, res, next) => {
        if (!isHostAllowed(req.headers.host)) return res.status(400).json({ error: 'Unknown host' });
        next();
    });

    app.use('/api/auth', (req, res, next) => {
        const auth = getAuthForRequest(req);
        return toNodeHandler(auth)(req, res, next);
    });

    app.use(express.json({ limit: '8mb' }));

    const requireAdmin = async (req, res, next) => {
        try {
            const auth = getAuthForRequest(req);
            const session = await auth.api.getSession({ headers: req.headers });
            if (!session || !session.user) return res.status(401).json({ error: 'Unauthorized' });
            if (session.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden: Admins only' });
            req.user = session.user;
            next();
        } catch (error) {
            console.error('Auth Error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    };

    app.post('/api/track', async (req, res) => {
        const { type, payload } = req.body;
        try {
            await logEvent(type, payload);
            res.status(201).json({ success: true });
        } catch (err) {
            console.error('Error tracking event:', err);
            res.status(500).json({ error: 'Failed to track event' });
        }
    });

    app.get('/api/stats', requireAdmin, async (req, res) => {
        try {
            res.json(await getStats());
        } catch (err) {
            console.error('Error fetching stats:', err);
            res.status(500).json({ error: 'Failed to fetch stats' });
        }
    });

    const distPath = path.join(__dirname, '../dist');
    app.use(express.static(distPath));
    app.get(/.*/, (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });

    return app;
};
