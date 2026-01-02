import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../analytics.db');

const db = new Database(dbPath);

const email = process.argv[2];

if (!email) {
    console.error("Usage: node server/scripts/make_admin.js <email>");
    process.exit(1);
}

try {
    const user = db.prepare("SELECT * FROM user WHERE email = ?").get(email);

    if (!user) {
        console.error(`User with email '${email}' not found.`);
        process.exit(1);
    }

    db.prepare("UPDATE user SET role = 'admin' WHERE id = ?").run(user.id);
    console.log(`Successfully promoted ${email} to admin.`);
} catch (err) {
    console.error("Error updating user role:", err);
}
