import 'dotenv/config';
import { betterAuth } from "better-auth";
import { admin, username } from "better-auth/plugins";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { validatePassword } from "../shared/passwordPolicy.js";
import db, { makeUserAdmin } from "./db.js";
import { sendEmail } from "./email.js";

// Paths where a password is being SET. Sign-in is deliberately absent:
// pre-existing weaker passwords must keep working until changed.
const PASSWORD_SETTING_PATHS = ["/sign-up/email", "/change-password", "/reset-password"];

const defaultTrustedOrigins = [
    process.env.CLIENT_URL || "http://localhost:3000",
    "http://localhost:3001",
    ...(process.env.TRUSTED_ORIGINS ? process.env.TRUSTED_ORIGINS.split(/[,|]/).map(o => o.trim()).filter(Boolean) : [])
];

// One verification email per address per window (see sendVerificationEmail).
// Module-level so it survives across createAuth calls within one process.
const VERIFICATION_COOLDOWN_MS = 5 * 60 * 1000;
const verificationSendTimes = new Map();

/** Test hook: clears the cooldown so a re-send can be asserted immediately. */
export const resetVerificationCooldown = () => verificationSendTimes.clear();

export const createAuth = (config = {}) => {
    return betterAuth({
        database: db,
        baseURL: config.baseURL || process.env.BETTER_AUTH_URL,
        emailAndPassword: {
            enabled: true,
            minPasswordLength: 12,
            requireEmailVerification: true,
        },
        emailVerification: {
            sendVerificationEmail: async ({ user, url }) => {
                // Cooldown: sendOnSignIn re-sends on EVERY refused sign-in of an
                // unverified account, so repeated attempts (user retries, bots)
                // burn real Resend quota — one send per address per window is
                // plenty; the link stays valid for an hour anyway. In-memory is
                // acceptable for the same reason as the rate limiter: single
                // instance deploy; worst case after a restart is one extra email.
                const now = Date.now();
                const last = verificationSendTimes.get(user.email) || 0;
                if (now - last < VERIFICATION_COOLDOWN_MS) return;
                verificationSendTimes.set(user.email, now);
                await sendEmail({
                    to: user.email,
                    subject: "Verify your email — PDF Architect",
                    html: `<p>Confirm your address to finish signing up: <a href="${url}">Verify email</a></p><p>This link expires in 1 hour. If you didn't create this account, ignore this email.</p>`,
                    text: `Verify your email: ${url}\nThis link expires in 1 hour.`,
                });
            },
            sendOnSignUp: true,
            sendOnSignIn: true,
            autoSignInAfterVerification: true,
            expiresIn: 3600,
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
        hooks: {
            before: createAuthMiddleware(async (ctx) => {
                if (!PASSWORD_SETTING_PATHS.includes(ctx.path)) return;
                const password = ctx.body?.newPassword ?? ctx.body?.password;
                if (typeof password !== "string") return; // missing field: better-auth's own validation handles it
                const result = validatePassword(password);
                if (!result.ok) {
                    throw new APIError("BAD_REQUEST", { message: result.message, code: "PASSWORD_POLICY" });
                }
            }),
        },
        ...config // Allow overrides
    });
};
