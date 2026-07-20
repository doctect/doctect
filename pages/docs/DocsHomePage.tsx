import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Layers, Wand2, Globe, Search } from 'lucide-react';
import { docsIndex } from '../../lib/docsContentIndex';
import { TRACK_ORDER, TRACK_LABELS, type DocTrack } from '../../lib/docsContent';
import { DifficultyBadge, TRACK_DESCRIPTIONS, tutorialUrl } from './docsUi';

const TRACK_ICONS: Record<DocTrack, React.FC<{ size?: number; className?: string }>> = {
    'getting-started': BookOpen, editor: Layers, generator: Wand2, gallery: Globe,
};

export function DocsHomePage() {
    return (
        <div className="p-8 md:p-14 max-w-5xl">
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">Documentation</h1>
            <p className="text-lg text-slate-500 leading-relaxed mb-10 max-w-3xl">
                Tutorials ordered from first click to advanced techniques, plus a searchable reference of
                every tool, option, and shortcut. Follow the path below in order, or jump straight to the
                track you need.
            </p>

            <div className="space-y-10">
                {TRACK_ORDER.map((track, i) => {
                    const tuts = docsIndex.tutorials.filter(t => t.track === track);
                    const Icon = TRACK_ICONS[track];
                    return (
                        <section key={track}>
                            <div className="flex items-center gap-3 mb-1">
                                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">{i + 1}</div>
                                <h2 className="text-2xl font-bold flex items-center gap-2"><Icon size={22} className="text-blue-500" /> {TRACK_LABELS[track]}</h2>
                            </div>
                            <p className="text-slate-500 mb-4 ml-11">{TRACK_DESCRIPTIONS[track]}</p>
                            <div className="ml-11 grid sm:grid-cols-2 gap-3">
                                {tuts.map(t => (
                                    <Link key={t.slug} to={tutorialUrl(t)} className="group border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-md transition-all bg-white">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-xs font-mono text-slate-400">{t.order.toString().padStart(2, '0')}</span>
                                            <DifficultyBadge level={t.difficulty} />
                                        </div>
                                        <div className="font-semibold text-slate-800 group-hover:text-blue-700">{t.title}</div>
                                        <div className="text-sm text-slate-500 mt-1 line-clamp-2">{t.summary}</div>
                                        <div className="text-xs text-slate-400 mt-2">{t.time}</div>
                                    </Link>
                                ))}
                                {!tuts.length && <div className="text-sm text-slate-400 italic">Tutorials landing soon.</div>}
                            </div>
                        </section>
                    );
                })}
            </div>

            <Link to="/docs/reference" className="mt-12 flex items-center gap-4 border border-slate-200 rounded-2xl p-6 hover:border-blue-300 hover:shadow-md transition-all bg-slate-50/50">
                <div className="p-3 bg-blue-100 rounded-xl text-blue-600"><Search size={24} /></div>
                <div className="flex-1">
                    <div className="font-bold text-lg text-slate-900">Reference</div>
                    <div className="text-slate-500 text-sm">Every tool, grid option, link target, formula, and shortcut — one indexed entry each, searchable from any docs page.</div>
                </div>
                <ArrowRight className="text-slate-400" />
            </Link>
        </div>
    );
}
