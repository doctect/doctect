import React, { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronRight, ArrowLeft, ArrowRight } from 'lucide-react';
import { docsIndex } from '../../lib/docsContentIndex';
import { TRACK_LABELS, slugifyHeading } from '../../lib/docsContent';
import { DocsMarkdown } from '../../components/docs/DocsMarkdown';
import { DifficultyBadge, tutorialUrl, DocsNotFound } from './docsUi';

export function DocsTutorialPage() {
    const { track = '', slug = '' } = useParams();
    const tutorial = docsIndex.tutorialByPath.get(`${track}/${slug}`);

    const trackTutorials = useMemo(
        () => docsIndex.tutorials.filter(t => t.track === track),
        [track]);
    const headings = useMemo(() => {
        if (!tutorial) return [];
        return [...tutorial.body.matchAll(/^(##|###)\s+(.+)$/gm)]
            .map(m => ({ depth: m[1].length, text: m[2].replace(/[`*]/g, ''), anchor: slugifyHeading(m[2]) }));
    }, [tutorial]);

    if (!tutorial) return <DocsNotFound />;
    const i = trackTutorials.indexOf(tutorial);
    const prev = i > 0 ? trackTutorials[i - 1] : null;
    const next = i < trackTutorials.length - 1 ? trackTutorials[i + 1] : null;
    // trackTutorials is derived from the same globally (track, order)-sorted
    // docsIndex.tutorials array (see parseDocsContent), so its [0] is always
    // this track's lowest-`order` tutorial - the breadcrumb's link target.
    const firstOfTrack = trackTutorials[0];

    return (
        <div className="flex">
            <article className="p-8 md:p-14 max-w-4xl min-w-0 flex-1">
                <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-slate-500 mb-6">
                    <Link to="/docs" className="hover:text-blue-600">Docs</Link>
                    <ChevronRight size={14} />
                    <Link to={tutorialUrl(firstOfTrack)} className="hover:text-blue-600">{TRACK_LABELS[tutorial.track]}</Link>
                    <ChevronRight size={14} />
                    <span className="text-slate-800 font-medium truncate">{tutorial.title}</span>
                </nav>
                <h1 className="text-4xl font-extrabold tracking-tight mb-3">{tutorial.title}</h1>
                <p className="text-lg text-slate-500 mb-4">{tutorial.summary}</p>
                <div className="flex flex-wrap items-center gap-3 mb-4 text-sm text-slate-500">
                    <DifficultyBadge level={tutorial.difficulty} />
                    <span>{tutorial.time}</span>
                </div>
                {tutorial.prerequisites.length > 0 && (
                    <div aria-label="Prerequisites" className="flex flex-wrap items-center gap-2 mb-8 text-sm">
                        <span className="text-slate-400 font-medium">Before this:</span>
                        {tutorial.prerequisites.map(p => {
                            const target = docsIndex.tutorialByPath.get(p);
                            return target ? (
                                <Link key={p} to={tutorialUrl(target)} className="bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 rounded-full px-3 py-1">{target.title}</Link>
                            ) : null;
                        })}
                    </div>
                )}
                <DocsMarkdown markdown={tutorial.body} />
                <div className="mt-14 pt-8 border-t flex gap-4">
                    {prev && (
                        <Link to={tutorialUrl(prev)} className="flex-1 border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm group">
                            <div className="text-xs text-slate-400 flex items-center gap-1 mb-1"><ArrowLeft size={12} /> Previous</div>
                            <div className="font-semibold text-slate-800 group-hover:text-blue-700">{prev.title}</div>
                        </Link>
                    )}
                    {next && (
                        <Link to={tutorialUrl(next)} className="flex-1 border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm text-right group">
                            <div className="text-xs text-slate-400 flex items-center justify-end gap-1 mb-1">Next <ArrowRight size={12} /></div>
                            <div className="font-semibold text-slate-800 group-hover:text-blue-700">{next.title}</div>
                        </Link>
                    )}
                </div>
            </article>
            {headings.length > 0 && (
                <nav aria-label="On this page" className="hidden xl:block w-56 flex-shrink-0 pr-8 pt-14">
                    <div className="sticky top-6 text-sm">
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">On this page</div>
                        {headings.map(h => (
                            <a key={h.anchor} href={`#${h.anchor}`} className={`block py-1 text-slate-500 hover:text-blue-600 truncate ${h.depth === 3 ? 'pl-4' : ''}`}>{h.text}</a>
                        ))}
                    </div>
                </nav>
            )}
        </div>
    );
}
