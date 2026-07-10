import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Layers } from 'lucide-react';
import clsx from 'clsx';
import { AccountMenu } from './AccountMenu';

const NavLink: React.FC<{ to: string; label: string }> = ({ to, label }) => {
    const { pathname } = useLocation();
    const active = to === '/app' ? pathname.startsWith('/app') : pathname.startsWith(to);
    return (
        <Link
            to={to}
            className={clsx(
                'text-sm font-medium transition-colors',
                active ? 'text-blue-600' : 'text-slate-600 hover:text-blue-600'
            )}
        >
            {label}
        </Link>
    );
};

/**
 * Shared top bar for all non-editor pages. Sticky + z-50 so the AccountMenu
 * dropdown can never be occluded by page content (the landing page's hero
 * once painted over it — see 2026-07-10 spec §2). shrink-0 because several
 * adopters render this inside a flex-col whose content overflows (e.g.
 * DocsPage) — without it the fixed h-14 gets squashed.
 */
export const AppHeader: React.FC = () => (
    <header className="h-14 shrink-0 bg-white/90 backdrop-blur border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-50">
        <Link to="/" className="flex items-center gap-2 font-bold text-slate-800">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-white">
                <Layers size={16} />
            </div>
            <span>PDF Architect</span>
        </Link>
        <div className="flex items-center gap-5">
            <NavLink to="/app" label="Editor" />
            <NavLink to="/gallery" label="Gallery" />
            <NavLink to="/docs" label="Docs" />
            <AccountMenu />
        </div>
    </header>
);
