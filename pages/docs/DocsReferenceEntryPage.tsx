import React, { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { docsIndex } from '../../lib/docsContentIndex';
import { CATEGORY_LABELS } from '../../lib/docsContent';
import { DocsMarkdown } from '../../components/docs/DocsMarkdown';
import { tutorialUrl, DocsNotFound } from './docsUi';

export function DocsReferenceEntryPage() {
    const { slug = '' } = useParams();
    const entry = docsIndex.referenceBySlug.get(slug);
    const appearsIn = useMemo(() =>
        docsIndex.tutorials.filter(t => t.body.includes(`/docs/reference/${slug}`)), [slug]);

    if (!entry) return <DocsNotFound />;
    return (
        <article className="p-8 md:p-14 max-w-3xl">
            <div className="flex items-center gap-1.5 text-sm text-slate-500 mb-6">
                <Link to="/docs/reference" className="hover:text-blue-600">Reference</Link>
                <ChevronRight size={14} />
                <span>{CATEGORY_LABELS[entry.category]}</span>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight mb-2">{entry.title}</h1>
            {entry.aliases.length > 0 && (
                <p className="text-sm text-slate-400 italic mb-4">Also known as: {entry.aliases.join(', ')}</p>
            )}
            <p className="text-lg text-slate-500 mb-8">{entry.summary}</p>
            <DocsMarkdown markdown={entry.body} />
            {appearsIn.length > 0 && (
                // aria-label (not just the visible heading text below) so tests -
                // and the sidebar's own per-tutorial NavLinks always rendered
                // alongside this page - can scope a query for e.g. "Grids" to
                // just this region rather than colliding with the chrome.
                <div aria-label="Appears in" className="mt-12 pt-6 border-t">
                    <div className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3">Appears in</div>
                    <div className="flex flex-wrap gap-2">
                        {appearsIn.map(t => (
                            <Link key={`${t.track}/${t.slug}`} to={tutorialUrl(t)} className="bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 rounded-full px-3 py-1 text-sm">{t.title}</Link>
                        ))}
                    </div>
                </div>
            )}
        </article>
    );
}
