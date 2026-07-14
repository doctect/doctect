import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { toNodeHandler } from 'better-auth/node';
import { getAuthForRequest, isHostAllowed } from './authRequest.js';
import { logEvent, getStats } from './db.js';
import { checkOrigin, writeLimiter, requireAdmin } from './middleware/guards.js';
import meRouter from './routes/me.js';
import projectsRouter from './routes/projects.js';
import galleryRouter from './routes/gallery.js';
import mergeRequestsRouter from './routes/mergeRequests.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const createApp = () => {
    const app = express();
    app.set('trust proxy', 1);

    app.use(helmet({
        contentSecurityPolicy: false, // SPA loads Google Fonts + inline styles; CSP tuning is a deferred follow-up
        crossOriginEmbedderPolicy: false
    }));

    const trustedOrigins = (process.env.TRUSTED_ORIGINS || 'http://localhost:3000,http://localhost:3001')
        .split(',').map(o => o.trim()).filter(Boolean);

    app.use(cors({
        origin: trustedOrigins,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'If-Match']
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

    app.use('/api', checkOrigin);
    app.use('/api', writeLimiter);

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

    app.use(meRouter);
    app.use(projectsRouter);
    app.use(galleryRouter);
    app.use(mergeRequestsRouter);

    const distPath = path.join(__dirname, '../dist');
    app.use(express.static(distPath));
    app.get(/.*/, (req, res) => {
        // Must pass a relative filename + { root } rather than an absolute path: express@5.2.1's
        // res.sendFile() 404s on a bare absolute path here even when the file exists, silently
        // breaking every hard/direct load (deep link, bookmark, refresh) of any non-root client
        // route in production. { root } is also express's own recommended sendFile pattern.
        res.sendFile('index.html', { root: distPath });
    });

    return app;
};
