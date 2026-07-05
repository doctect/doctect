import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useSession } from '../lib/auth-client';
import { UsernameForm } from '../components/UsernameForm';

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
        <div className="min-h-screen bg-slate-50">
            <header className="h-14 bg-white border-b flex items-center px-6 gap-4">
                <Link to="/gallery" className="flex items-center gap-1 text-sm text-slate-600 hover:text-blue-600"><ArrowLeft size={14} /> Gallery</Link>
            </header>
            <main className="max-w-md mx-auto p-6">
                <h1 className="text-xl font-bold text-slate-800 mb-1">Account settings</h1>
                <p className="text-sm text-slate-500 mb-6">Signed in as {user.email}</p>
                {saved && <div className="mb-4 p-3 bg-green-50 text-green-700 rounded text-sm">Username updated.</div>}
                <UsernameForm
                    initialValue={user.username ?? ''}
                    submitLabel="Save changes"
                    onSuccess={() => setSaved(true)}
                />
            </main>
        </div>
    );
}
