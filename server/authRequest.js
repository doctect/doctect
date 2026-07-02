import { createAuth } from './auth.js';

const authInstances = new Map();

const allowedHosts = (process.env.ALLOWED_HOSTS || '')
    .split(',').map(h => h.trim()).filter(Boolean);

export const isHostAllowed = (host) => {
    if (allowedHosts.length === 0) return true; // unset = allow all (dev)
    return allowedHosts.includes(host);
};

export const getAuthForRequest = (req) => {
    const host = req.headers.host;
    if (!host) {
        console.warn('Missing Host header, creating ephemeral auth instance');
        return createAuth();
    }
    if (!authInstances.has(host)) {
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const baseURL = `${protocol}://${host}/api/auth`;
        authInstances.set(host, createAuth({ baseURL }));
    }
    return authInstances.get(host);
};
