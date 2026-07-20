import React, { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { AppHeader } from '../../components/AppHeader';
import { DocsSearchBox } from '../../components/docs/DocsSearchBox';
import { docsIndex } from '../../lib/docsContentIndex';
import { TRACK_ORDER, TRACK_LABELS } from '../../lib/docsContent';
import { tutorialUrl } from './docsUi';

export function DocsLayout() {
    const location = useLocation();
    const mainRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (location.hash) {
            // Optional-chain the *call*, not just the lookup: jsdom (used by
            // the test environment) doesn't implement scrollIntoView on
            // Element, so an unguarded call throws under test even though
            // every real browser supports it.
            document.getElementById(location.hash.slice(1))?.scrollIntoView?.();
        } else if (mainRef.current) {
            // Plain scrollTop assignment (matches Canvas.tsx / OverlayTextEditor.tsx
            // elsewhere in this codebase) rather than .scrollTo(0, 0) - jsdom has
            // no Element.prototype.scrollTo, so that method call throws under test.
            mainRef.current.scrollTop = 0;
        }
    }, [location.pathname, location.hash]);

    return (
        <div className="h-screen w-full bg-white text-slate-900 font-sans flex flex-col overflow-hidden">
            <AppHeader />
            <div className="flex flex-1 min-h-0 max-w-[1400px] mx-auto w-full">
                <aside className="w-72 hidden md:flex flex-col border-r bg-slate-50/50 flex-shrink-0">
                    <div className="p-4 border-b"><DocsSearchBox /></div>
                    <nav role="navigation" className="flex-1 overflow-y-auto px-4 py-4 space-y-6 text-sm">
                        <NavLink to="/docs" end className={({ isActive }) => `block font-semibold px-2 py-1.5 rounded-lg ${isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-white'}`}>
                            <span className="flex items-center gap-2"><BookOpen size={15} /> Learning Path</span>
                        </NavLink>
                        {TRACK_ORDER.map(track => {
                            const tuts = docsIndex.tutorials.filter(t => t.track === track);
                            if (!tuts.length) return null;
                            return (
                                <div key={track}>
                                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-2">{TRACK_LABELS[track]}</div>
                                    {tuts.map(t => (
                                        <NavLink key={t.slug} to={tutorialUrl(t)} className={({ isActive }) => `block px-2 py-1.5 rounded-lg truncate ${isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}>
                                            <span className="text-slate-400 mr-1.5">{t.order}.</span>{t.title}
                                        </NavLink>
                                    ))}
                                </div>
                            );
                        })}
                        <div>
                            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-2">Lookup</div>
                            <NavLink to="/docs/reference" className={({ isActive }) => `block px-2 py-1.5 rounded-lg ${isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-white'}`}>Reference</NavLink>
                        </div>
                    </nav>
                </aside>
                <main ref={mainRef} className="flex-1 min-w-0 overflow-y-auto">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
