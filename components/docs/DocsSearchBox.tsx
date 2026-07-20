import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { getDefaultSearchIndex, searchDocs, type DocsSearchIndex } from '../../lib/docsSearch';

const LISTBOX_ID = 'docs-search-listbox';

export function DocsSearchBox({ searchIndex }: { searchIndex?: DocsSearchIndex }) {
    const [q, setQ] = useState('');
    const [open, setOpen] = useState(false);
    const [highlight, setHighlight] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    const sIdx = useMemo(() => searchIndex ?? getDefaultSearchIndex(), [searchIndex]);
    const results = useMemo(() => searchDocs(sIdx, q, 8), [sIdx, q]);
    // Single source of truth for "is the dropdown visible" - feeds
    // aria-expanded, the arrow/Enter key-handling gate, and the render
    // condition below, so those three can't drift out of sync with each
    // other the way three separately-written `open && q.trim()` checks could.
    const showDropdown = open && q.trim().length > 0;

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== '/') return;
            const tag = (document.activeElement?.tagName ?? '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || (document.activeElement as HTMLElement | null)?.isContentEditable) return;
            e.preventDefault();
            inputRef.current?.focus();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, []);

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { setOpen(false); return; }
        if (!showDropdown || !results.length) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => (h + 1) % results.length); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => (h - 1 + results.length) % results.length); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            const r = results[highlight];
            if (r) { setOpen(false); setQ(''); navigate(r.url); }
        }
    };

    const activeOptionId = showDropdown && results.length ? `${LISTBOX_ID}-option-${highlight}` : undefined;

    return (
        <div ref={rootRef} className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
                ref={inputRef}
                role="combobox"
                aria-expanded={showDropdown}
                aria-haspopup="listbox"
                aria-controls={LISTBOX_ID}
                aria-activedescendant={activeOptionId}
                aria-label="Search documentation"
                value={q}
                onChange={e => { setQ(e.target.value); setOpen(true); setHighlight(0); }}
                onFocus={() => setOpen(true)}
                onKeyDown={onKeyDown}
                placeholder="Search docs…  ( / )"
                className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            {showDropdown && (
                <div id={LISTBOX_ID} role="listbox" aria-label="Search results" className="absolute z-40 mt-1 w-[22rem] max-w-[80vw] bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                    {results.length === 0 && <div role="presentation" className="px-4 py-3 text-sm text-slate-400">No matches</div>}
                    {results.map((r, i) => (
                        <Link
                            key={r.url}
                            id={`${LISTBOX_ID}-option-${i}`}
                            to={r.url}
                            role="option"
                            aria-selected={i === highlight}
                            onClick={() => { setOpen(false); setQ(''); }}
                            onMouseEnter={() => setHighlight(i)}
                            className={`block px-4 py-2.5 text-sm border-b border-slate-50 last:border-0 ${i === highlight ? 'bg-blue-50' : ''}`}
                        >
                            <span className="flex items-center justify-between gap-2">
                                <span className="font-medium text-slate-800 truncate">{r.title}</span>
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0 ${r.type === 'reference' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>{r.badge}</span>
                            </span>
                            <span className="block text-slate-500 truncate">{r.snippet}</span>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
