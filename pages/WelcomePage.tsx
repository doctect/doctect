import React from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../lib/auth-client';
import { UsernameForm } from '../components/UsernameForm';

export function WelcomePage() {
    const { data: session, isPending } = useSession();
    const location = useLocation();
    const navigate = useNavigate();
    const from = (location.state as { from?: string } | null)?.from;

    // AuthGuard (in App.tsx) already guarantees a session by the time this renders;
    // this is a defensive fallback only (e.g. a brief render race), not a redirect-to-login.
    if (isPending || !session?.user) {
        return <div className="p-10 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
    }
    if (session.user.username) {
        return <Navigate to={from ?? '/gallery'} replace />;
    }

    return (
        <div className="h-screen overflow-y-auto flex items-center justify-center bg-gray-50 p-4">
            <div className="w-full max-w-md bg-white rounded-lg shadow-md p-8">
                <h2 className="text-2xl font-bold mb-2 text-center text-gray-800">Choose a username</h2>
                <p className="text-sm text-gray-500 text-center mb-6">
                    You need a public username to save to the cloud, publish, fork, or propose changes.
                </p>
                <UsernameForm submitLabel="Continue" onSuccess={() => navigate(from ?? '/gallery', { replace: true })} />
            </div>
        </div>
    );
}
