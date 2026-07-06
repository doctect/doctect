import 'dotenv/config';
import { betterAuth } from "better-auth";
import { admin, username } from "better-auth/plugins";
import db, { makeUserAdmin } from "./db.js";

const defaultTrustedOrigins = [
    process.env.CLIENT_URL || "http://localhost:3000",
    "http://localhost:3001",
    ...(process.env.TRUSTED_ORIGINS ? process.env.TRUSTED_ORIGINS.split(/[,|]/).map(o => o.trim()).filter(Boolean) : [])
];

export const createAuth = (config = {}) => {
    return betterAuth({
        database: db,
        baseURL: config.baseURL || process.env.BETTER_AUTH_URL,
        emailAndPassword: {
            enabled: true
        },
        socialProviders: {
            google: {
                clientId: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            }
        },
        plugins: [
            admin(),
            username({ minUsernameLength: 3, maxUsernameLength: 30 })
        ],
        trustedOrigins: defaultTrustedOrigins,
        rateLimit: {
            // Enabled unless a test opts out by setting this to the exact string 'true'
            // (env var is never set in production, so the default there is unchanged:
            // enabled). Any other value (including 'false' or an empty string) leaves
            // rate limiting enabled, so the toggle fails safe. better-auth additionally
            // applies a built-in "special rule" of max 3 requests per 10s to /sign-in*,
            // /sign-up*, /change-password* and /change-email* that overrides the
            // window/max below; test files that create 4+ users in a beforeAll trip it,
            // so the test harness (tests/unit/server/helpers.js) sets
            // DISABLE_AUTH_RATE_LIMIT=true.
            enabled: process.env.DISABLE_AUTH_RATE_LIMIT !== 'true',
            window: 60,
            max: 20
        },
        logger: {
            verbose: true,
            disabled: false
        },
        advanced: {
            cookie: {
                secure: true,
                sameSite: "none"
            }
        },
        databaseHooks: {
            user: {
                create: {
                    after: async (user) => {
                        const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim());
                        if (adminEmails.includes(user.email)) {
                            await makeUserAdmin(user.id);
                            console.log(`Auto-promoted ${user.email} to admin`);
                        }
                    }
                }
            }
        },
        ...config // Allow overrides
    });
};
