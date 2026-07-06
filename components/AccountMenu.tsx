import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { User, LogOut, Image, Settings, FolderOpen } from 'lucide-react';
import { useSession, signOut } from '../lib/auth-client';

export function AccountMenu() {
    const { data: session, isPending } = useSession();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const location = useLocation();

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    if (isPending) return null;
    if (!session?.user) {
        return <Link to="/login" state={{ from: location.pathname }} className="text-xs font-medium text-slate-500 hover:text-blue-600">Sign in</Link>;
    }
    const username = session.user.username as string | null;
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
                    <Link to="/account" onClick={() => setOpen(false)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"><Settings size={12} /> Account settings</Link>
                    <button onClick={() => { setOpen(false); signOut(); }} className="w-full text-left flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                        <LogOut size={12} /> Sign out
                    </button>
                </div>
            )}
        </div>
    );
}
