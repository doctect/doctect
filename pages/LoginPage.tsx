import React, { useState, useEffect } from 'react';
import { signIn, signUp, authClient, useSession } from '../lib/auth-client';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { validatePassword } from '../shared/passwordPolicy.js';

export const LoginPage = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [verifyEmailFor, setVerifyEmailFor] = useState<string | null>(null);
    const [resent, setResent] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const from = (location.state as { from?: string } | null)?.from;
    const verifiedBanner = new URLSearchParams(location.search).get('verified') === '1';
    const verificationCallbackURL = `${window.location.origin}/login?verified=1`;
    const { data: session } = useSession();

    // After clicking the emailed verification link the user lands back on
    // /login?verified=1 already signed in (autoSignInAfterVerification) —
    // continue to where they were originally headed.
    useEffect(() => {
        if (verifiedBanner && session) {
            navigate(from ?? '/app', { replace: true });
        }
    }, [verifiedBanner, session, from, navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!isLogin && !/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
            setError('Username must be 3-30 characters and contain only letters, numbers, and underscores.');
            return;
        }

        if (!isLogin) {
            const policy = validatePassword(password);
            if (!policy.ok) {
                setPasswordError(policy.message);
                return;
            }
            setPasswordError(null);
        }

        setLoading(true);
        setError(null);

        try {
            if (isLogin) {
                const result: any = await signIn.email({
                    email,
                    password,
                }, {
                    onSuccess: () => {
                        navigate(from ?? '/app', { replace: true });
                    },
                    onError: (ctx) => {
                        if (ctx.error?.status === 403) {
                            setVerifyEmailFor(email);
                        } else {
                            setError(ctx.error.message);
                        }
                    }
                });
                if (result?.error) {
                    if (result.error.status === 403) {
                        setVerifyEmailFor(email);
                    } else {
                        setError(result.error.message);
                    }
                }
            } else {
                const result: any = await signUp.email({
                    email,
                    password,
                    name,
                    username,
                    callbackURL: verificationCallbackURL,
                } as any, {
                    onSuccess: () => {
                        setVerifyEmailFor(email);
                    },
                    onError: (ctx) => {
                        setError(ctx.error.message);
                    }
                });
                if (result?.error) {
                    setError(result.error.message);
                } else if (result?.data) {
                    setVerifyEmailFor(email);
                }
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-screen overflow-y-auto flex items-center justify-center bg-gray-50 p-4">
            <div className="w-full max-w-md bg-white rounded-lg shadow-md p-8">
                <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">
                    {verifyEmailFor ? 'Verify your email' : (isLogin ? 'Sign In' : 'Create Account')}
                </h2>

                {verifiedBanner && !verifyEmailFor && (
                    <div className="mb-4 p-3 bg-green-50 text-green-700 rounded text-sm text-center">
                        Email verified — you're signed in.
                    </div>
                )}

                {error && (
                    <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">
                        {error}
                    </div>
                )}

                {verifyEmailFor ? (
                    <div className="text-center space-y-3">
                        <p className="text-slate-600">We sent a verification link to <strong>{verifyEmailFor}</strong>. Click it to finish signing in.</p>
                        <button
                            onClick={async () => {
                                await authClient.sendVerificationEmail({
                                    email: verifyEmailFor,
                                    callbackURL: verificationCallbackURL,
                                });
                                setResent(true);
                            }}
                            className="px-3 py-1.5 border rounded text-sm"
                        >
                            Resend email
                        </button>
                        {resent && <p className="text-sm text-green-600">Sent — check your inbox.</p>}
                        <button
                            onClick={() => { setVerifyEmailFor(null); setResent(false); }}
                            className="text-sm text-slate-500 underline"
                        >
                            Back
                        </button>
                    </div>
                ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                    {!isLogin && (
                        <div>
                            <label htmlFor="login-name" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                            <input
                                id="login-name"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                required
                            />
                        </div>
                    )}

                    {!isLogin && (
                        <div>
                            <label htmlFor="login-username" className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                            <input
                                id="login-username"
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                required
                            />
                            <p className="text-xs text-gray-500 mt-1">3–30 chars, letters/numbers/underscores. Shown publicly on the gallery.</p>
                        </div>
                    )}

                    <div>
                        <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input
                            id="login-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        />
                    </div>

                    <div>
                        <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                        <input
                            id="login-password"
                            type="password"
                            value={password}
                            onChange={(e) => {
                                setPassword(e.target.value);
                                if (passwordError) setPasswordError(null);
                            }}
                            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        />
                        {!isLogin && passwordError && (
                            <p className="text-sm text-red-600 mt-1">{passwordError}</p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading && <Loader2 size={16} className="animate-spin" />}
                        {isLogin ? 'Sign In' : 'Sign Up'}
                    </button>

                    <div className="relative my-4">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-gray-300" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-white px-2 text-gray-500">Or continue with</span>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={async () => {
                            await signIn.social({
                                provider: "google",
                                callbackURL: window.location.origin + (from ?? '/app')
                            });
                        }}
                        className="w-full flex items-center justify-center gap-2 border border-gray-300 bg-white text-gray-700 py-2 rounded-md hover:bg-gray-50 transition-colors font-medium text-sm"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path
                                fill="currentColor"
                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            />
                            <path
                                fill="currentColor"
                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            />
                            <path
                                fill="currentColor"
                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26.81-.58z"
                            />
                            <path
                                fill="currentColor"
                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            />
                        </svg>
                        Sign in with Google
                    </button>
                </form>
                )}

                {!verifyEmailFor && (
                    <div className="mt-6 text-center text-sm text-gray-600">
                        {isLogin ? "Don't have an account? " : "Already have an account? "}
                        <button
                            onClick={() => setIsLogin(!isLogin)}
                            className="text-blue-600 hover:underline font-medium"
                        >
                            {isLogin ? 'Sign Up' : 'Sign In'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
