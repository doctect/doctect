import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth.js";
import db from './db.js';

// Polyfill for Node 18
if (!global.crypto) {
    const { webcrypto } = await import('node:crypto');
    global.crypto = webcrypto;
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
    origin: "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"]
}));

// Better Auth Handler
app.use("/api/auth", toNodeHandler(auth));

app.use(express.json());

// Middleware to check for admin session
const requireAdmin = async (req, res, next) => {
    try {
        const session = await auth.api.getSession({
            headers: req.headers
        });

        console.log("Session Check:", session ? "Found" : "Null");

        if (!session || !session.user) {
            console.log("Unauthorized: No session");
            return res.status(401).json({ error: "Unauthorized" });
        }

        // Check for admin role (provided by admin plugin or custom field)
        if (session.user.role !== 'admin') {
            console.log("Forbidden: User role is", session.user.role);
            return res.status(403).json({ error: "Forbidden: Admins only" });
        }

        req.user = session.user;
        next();
    } catch (error) {
        console.error("Auth Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};


app.post('/api/track', (req, res) => {
    const { type, payload } = req.body;
    try {
        const stmt = db.prepare('INSERT INTO events (type, payload) VALUES (?, ?)');
        stmt.run(type, JSON.stringify(payload || {}));
        res.status(201).json({ success: true });
    } catch (err) {
        console.error('Error tracking event:', err);
        res.status(500).json({ error: 'Failed to track event' });
    }
});

app.get('/api/stats', requireAdmin, (req, res) => {
    try {
        const totalEvents = db.prepare('SELECT COUNT(*) as count FROM events').get();
        const byType = db.prepare('SELECT type, COUNT(*) as count FROM events GROUP BY type').all();

        // Get last 50 events
        const recent = db.prepare('SELECT * FROM events ORDER BY timestamp DESC LIMIT 50').all();

        res.json({
            total: totalEvents.count,
            byType,
            recent
        });
    } catch (err) {
        console.error('Error fetching stats:', err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// Serve static files from the React frontend app
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '../dist');

// Serve static files
app.use(express.static(distPath));

// Handle SPA routing: return index.html for any unknown route
// Handle SPA routing: return index.html for any unknown route
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Analytics server running on http://localhost:${PORT}`);
});
