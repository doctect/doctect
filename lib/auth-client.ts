import { createAuthClient } from "better-auth/react"

export const authClient = createAuthClient({
    baseURL: import.meta.env.VITE_API_URL || (typeof window !== "undefined" ? window.location.origin + "/api/auth" : "http://localhost:3001/api/auth")
})

export const { signIn, signUp, useSession, signOut } = authClient;
