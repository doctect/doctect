import 'dotenv/config';
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import db from "./db.js";

export const auth = betterAuth({
    database: db,
    baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3001/api/auth",
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
    trustedOrigins: [process.env.CLIENT_URL || "http://localhost:3000"],
    logger: {
        verbose: true,
        disabled: false
    },
    databaseHooks: {
        user: {
            create: {
                after: async (user) => {
                    const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim());
                    if (adminEmails.includes(user.email)) {
                        await db.prepare("UPDATE user SET role = 'admin' WHERE id = ?").run(user.id);
                        console.log(`Auto-promoted ${user.email} to admin`);
                    }
                }
            }
        }
    }
});
