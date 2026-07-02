import 'dotenv/config';

// Polyfill for Node 18
if (!global.crypto) {
    const { webcrypto } = await import('node:crypto');
    global.crypto = webcrypto;
}

const { runMigrations } = await import('./migrations.js');
await runMigrations();

const { createApp } = await import('./app.js');
const app = createApp();

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
