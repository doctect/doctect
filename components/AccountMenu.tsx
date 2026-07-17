import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { User, LogOut, Image, Settings, FolderOpen, Shield } from 'lucide-react';
import { signOut } from '../lib/auth-client';
import { useCurrentUser } from '../hooks/useCurrentUser';

export function AccountMenu() {
    const { user, loading, error, refresh } = useCurrentUser();
    const [open, setOpen] = useState(false);
    const [logoutError, setLogoutError] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const location = useLocation();
    const navigate = useNavigate();

    const handleSignOut = async () => {
        setLogoutError(false);
        try {
            const result = await signOut();
            if (result?.error) throw result.error;
            await refresh();
            setOpen(false);
            navigate('/login', { replace: true });
        } catch {
            setLogoutError(true);
        }
    };

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    if (loading) return null;
    if (error) {
        return (
            <div role="alert" className="flex items-center gap-2 text-xs text-red-700">
                <span>Unable to verify account authority.</span>
                <button type="button" onClick={() => void refresh()} className="font-semibold hover:text-red-900">Retry</button>
                <button type="button" onClick={() => void handleSignOut()} className="font-semibold hover:text-red-900">Sign out</button>
                {logoutError && <span>Unable to sign out. Try again.</span>}
            </div>
        );
    }
    if (!user) {
        return <Link to="/login" state={{ from: location.pathname }} className="text-xs font-medium text-slate-500 hover:text-blue-600">Sign in</Link>;
    }
    const username = user.username;
    const profileTo = username ? `/u/${username}` : '/welcome';
    const profileState = username ? undefined : { from: location.pathname };
    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-blue-600"
                title="Account"
            >
                <User size={14} /> <span className="hidden md:inline">{username || 'Set username'}</span>
            </button>
            {open && (
                <div className="absolute right-0 top-7 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50 min-w-[160px]">
                    <Link to={profileTo} state={profileState} onClick={() => setOpen(false)} className="block px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">My profile</Link>
                    <Link to="/gallery" onClick={() => setOpen(false)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"><Image size={12} /> Gallery</Link>
                    <Link to="/projects" onClick={() => setOpen(false)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"><FolderOpen size={12} /> My projects</Link>
                    {(user.role === 'admin' || user.role === 'owner') && (
                        <Link to="/admin/moderation" onClick={() => setOpen(false)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                            <Shield size={12} /> Moderation
                        </Link>
                    )}
                    <Link to="/account" onClick={() => setOpen(false)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"><Settings size={12} /> Account settings</Link>
                    {logoutError && <div role="alert" className="px-3 py-1.5 text-xs text-red-700">Unable to sign out. Try again.</div>}
                    <button onClick={() => void handleSignOut()} className="w-full text-left flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                        <LogOut size={12} /> Sign out
                    </button>
                </div>
            )}
        </div>
    );
}
