import rateLimit from 'express-rate-limit';
import { getAuthForRequest } from '../authRequest.js';

const trustedOrigins = () => (process.env.TRUSTED_ORIGINS || 'http://localhost:3000,http://localhost:3001')
    .split(',').map(o => o.trim()).filter(Boolean);

// CSRF defense-in-depth: sameSite cookies + explicit Origin allow-list on writes.
export const checkOrigin = (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin;
    if (!origin) return next(); // same-origin form-less fetch or curl; cookies still sameSite
    const host = req.headers.host;
    if (trustedOrigins().includes(origin) || origin === `https://${host}` || origin === `http://${host}`) {
        return next();
    }
    return res.status(403).json({ error: 'Cross-origin request rejected' });
};

export const requireAuth = async (req, res, next) => {
    try {
        const auth = getAuthForRequest(req);
        const session = await auth.api.getSession({ headers: req.headers });
        if (!session || !session.user) return res.status(401).json({ error: 'Unauthorized' });
        req.user = session.user;
        next();
    } catch (error) {
        console.error('Auth Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const optionalAuth = async (req, res, next) => {
    try {
        const auth = getAuthForRequest(req);
        const session = await auth.api.getSession({ headers: req.headers });
        req.user = session?.user ?? null;
    } catch {
        req.user = null;
    }
    next();
};

export const requireAdmin = async (req, res, next) => {
    await requireAuth(req, res, () => {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden: Admins only' });
        next();
    });
};

export const writeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
    message: { error: 'Too many requests, slow down' }
});
