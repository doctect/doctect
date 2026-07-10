import React, { useState, useEffect } from 'react';
import { authClient, useSession } from '../lib/auth-client';
import { UsernameForm } from '../components/UsernameForm';
import { validatePassword } from '../shared/passwordPolicy.js';
import { AppHeader } from '../components/AppHeader';

function ChangePasswordSection() {
    const [hasCredential, setHasCredential] = useState(false);
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let cancelled = false;
        // Wrapping the call itself inside the .then() means a missing/throwing
        // listAccounts (e.g. a mock that doesn't stub it) rejects the promise
        // instead of throwing synchronously inside the effect.
        Promise.resolve()
            .then(() => authClient.listAccounts())
            .then((res: any) => {
                if (cancelled) return;
                // better-auth's /list-accounts response keys the provider as `providerId`
                // (see node_modules/better-auth/dist/api/routes/account.mjs), not `provider`.
                setHasCredential(!!res?.data?.some((a: any) => a.providerId === 'credential'));
            })
            .catch(() => {
                // On lookup failure, stay hidden (no password-less account should see it).
                if (!cancelled) setHasCredential(false);
            });
        return () => { cancelled = true; };
    }, []);

    if (!hasCredential) return null;

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setDone(false);
        const policy = validatePassword(next);
        if (!policy.ok) { setError(policy.message); return; }
        if (next !== confirm) { setError('New passwords do not match'); return; }
        setError(null);
        setBusy(true);
        try {
            const { error: apiError } = await authClient.changePassword({
                currentPassword: current,
                newPassword: next,
                revokeOtherSessions: true,
            });
            if (apiError) { setError(apiError.message || 'Password change failed'); return; }
            setDone(true);
            setCurrent(''); setNext(''); setConfirm('');
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} className="mt-8 pt-6 border-t space-y-2">
            <h2 className="text-sm font-medium text-gray-700 mb-1">Change password</h2>
            <div>
                <label htmlFor="current-password-input" className="block text-xs text-gray-500 mb-1">Current password</label>
                <input
                    id="current-password-input"
                    type="password"
                    value={current}
                    onChange={(e) => setCurrent(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>
            <div>
                <label htmlFor="new-password-input" className="block text-xs text-gray-500 mb-1">New password</label>
                <input
                    id="new-password-input"
                    type="password"
                    value={next}
                    onChange={(e) => { setNext(e.target.value); setError(null); }}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>
            <div>
                <label htmlFor="confirm-password-input" className="block text-xs text-gray-500 mb-1">Confirm new password</label>
                <input
                    id="confirm-password-input"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>
            {error && <div className="text-sm text-red-600">{error}</div>}
            {done && <div className="text-sm text-green-600">Password updated</div>}
            <button
                type="submit"
                disabled={busy}
                className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
                {busy ? 'Updating…' : 'Update password'}
            </button>
        </form>
    );
}

export function AccountSettingsPage() {
    const { data: session, isPending } = useSession();
    const [saved, setSaved] = useState(false);

    // AuthGuard (in App.tsx) already guarantees a session by the time this renders;
    // this is a defensive fallback only, not a redirect-to-login.
    if (isPending || !session?.user) {
        return <div className="p-10 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
    }

    const user = session.user;

    return (
        <div className="h-screen overflow-y-auto bg-slate-50">
            <AppHeader />
            <main className="max-w-md mx-auto p-6">
                <h1 className="text-xl font-bold text-slate-800 mb-1">Account settings</h1>
                <p className="text-sm text-slate-500 mb-6">Signed in as {user.email}</p>
                {saved && <div className="mb-4 p-3 bg-green-50 text-green-700 rounded text-sm">Username updated.</div>}
                <UsernameForm
                    initialValue={user.username ?? ''}
                    submitLabel="Save changes"
                    onSuccess={() => setSaved(true)}
                />
                <ChangePasswordSection />
            </main>
        </div>
    );
}
