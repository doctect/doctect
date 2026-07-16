import rateLimit from 'express-rate-limit';
import { getAuthForRequest } from '../authRequest.js';
import { query } from '../db.js';

const trustedOrigins = () => (process.env.TRUSTED_ORIGINS || 'http://localhost:3000,http://localhost:3001')
    .split(',').map(o => o.trim()).filter(Boolean);

const isActiveSuspension = row => {
    const banned = row.banned === true || row.banned === 1 || row.banned === '1';
    return banned && (row.banExpires == null || new Date(row.banExpires).getTime() > Date.now());
};

const resolveFreshUser = async req => {
    const auth = getAuthForRequest(req);
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return null;
    const users = await query(
        `SELECT banned, "banExpires" FROM "user" WHERE id = $1`,
        [session.user.id],
    );
    if (!users[0]) return null;
    if (isActiveSuspension(users[0])) {
        await query('DELETE FROM session WHERE "userId" = $1', [session.user.id]);
        return null;
    }
    return session.user;
};

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
        const user = await resolveFreshUser(req);
        if (!user) return res.status(401).json({ error: 'Unauthorized' });
        req.user = user;
        next();
    } catch (error) {
        console.error('Auth Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const optionalAuth = async (req, res, next) => {
    try {
        req.user = await resolveFreshUser(req);
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

export const requireUsername = (req, res, next) => {
    if (!req.user?.username) {
        return res.status(403).json({ error: 'Set a public username before using cloud/gallery features.', code: 'USERNAME_REQUIRED' });
    }
    next();
};

export const writeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
    message: { error: 'Too many requests, slow down' }
});
