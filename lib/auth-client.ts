import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
    baseURL: import.meta.env.VITE_API_URL || (typeof window !== "undefined" ? window.location.origin + "/api/auth" : "http://localhost:3001/api/auth"),
    plugins: [usernameClient()]
});

export const { signIn, signUp, useSession, signOut } = authClient;
