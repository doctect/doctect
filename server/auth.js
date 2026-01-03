import 'dotenv/config';
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import db, { makeUserAdmin } from "./db.js";

const defaultTrustedOrigins = [
    process.env.CLIENT_URL || "http://localhost:3000",
    ...(process.env.TRUSTED_ORIGINS ? process.env.TRUSTED_ORIGINS.split(/[,|]/) : [])
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
            admin()
        ],
        trustedOrigins: defaultTrustedOrigins,
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
