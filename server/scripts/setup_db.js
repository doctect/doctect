import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../analytics.db');

const db = new Database(dbPath);

console.log("Setting up database schema...");

db.exec(`
    DROP TABLE IF EXISTS user;
    DROP TABLE IF EXISTS session;
    DROP TABLE IF EXISTS account;
    DROP TABLE IF EXISTS verification;

    CREATE TABLE IF NOT EXISTS user (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        emailVerified INTEGER,
        image TEXT,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL,
        role TEXT,
        banned INTEGER,
        banReason TEXT,
        banExpires DATETIME
    );

    CREATE TABLE IF NOT EXISTS session (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        token TEXT NOT NULL,
        expiresAt DATETIME NOT NULL,
        ipAddress TEXT,
        userAgent TEXT,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL,
        FOREIGN KEY (userId) REFERENCES user(id)
    );

    CREATE TABLE IF NOT EXISTS account (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        accountId TEXT NOT NULL,
        providerId TEXT NOT NULL,
        accessToken TEXT,
        refreshToken TEXT,
        accessTokenExpiresAt DATETIME,
        refreshTokenExpiresAt DATETIME,
        scope TEXT,
        password TEXT,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL,
        idToken TEXT,
        FOREIGN KEY (userId) REFERENCES user(id)
    );

    CREATE TABLE IF NOT EXISTS verification (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        value TEXT NOT NULL,
        expiresAt DATETIME NOT NULL,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL
    );
`);

console.log("Database schema setup complete.");
