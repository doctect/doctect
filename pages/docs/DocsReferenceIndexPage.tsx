import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { docsIndex } from '../../lib/docsContentIndex';
import { CATEGORY_ORDER, CATEGORY_LABELS } from '../../lib/docsContent';
import { buildDocsSearchIndex, searchDocs } from '../../lib/docsSearch';

export function DocsReferenceIndexPage() {
    const [q, setQ] = useState('');
    const refSearchIndex = useMemo(() => buildDocsSearchIndex({
        ...docsIndex, tutorials: [],
    }), []);
    const visibleSlugs = useMemo(() => {
        if (!q.trim()) return null;
        return new Set(searchDocs(refSearchIndex, q, 200).map(r => r.url.split('/').pop()));
    }, [q, refSearchIndex]);

    return (
        <div className="p-8 md:p-14 max-w-5xl">
            <h1 className="text-4xl font-extrabold tracking-tight mb-3">Reference</h1>
            <p className="text-lg text-slate-500 mb-8 max-w-3xl">One entry per tool, option, formula, and shortcut. Filter below, or use the sidebar search from any docs page.</p>
            <div className="relative mb-10 max-w-md">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter reference…"
                    className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            </div>
            {CATEGORY_ORDER.map(cat => {
                const entries = docsIndex.referenceEntries.filter(e =>
                    e.category === cat && (!visibleSlugs || visibleSlugs.has(e.slug)));
                if (!entries.length) return null;
                return (
                    <section key={cat} className="mb-10">
                        <h2 className="text-xl font-bold text-slate-800 mb-4">{CATEGORY_LABELS[cat]}</h2>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {entries.map(e => (
                                <Link key={e.slug} to={`/docs/reference/${e.slug}`} className="group border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm bg-white">
                                    <div className="font-semibold text-slate-800 group-hover:text-blue-700">{e.title}</div>
                                    <div className="text-sm text-slate-500 mt-1 line-clamp-2">{e.summary}</div>
                                    {e.aliases.length > 0 && <div className="text-xs text-slate-400 mt-2 italic truncate">aka {e.aliases.join(', ')}</div>}
                                </Link>
                            ))}
                        </div>
                    </section>
                );
            })}
        </div>
    );
}
