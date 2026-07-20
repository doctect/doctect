import React from 'react';
import { Link } from 'react-router-dom';
import type { DocDifficulty, DocTrack, DocTutorial } from '../../lib/docsContent';

const DIFF_STYLES: Record<DocDifficulty, string> = {
    beginner: 'bg-green-50 text-green-700 border-green-200',
    intermediate: 'bg-amber-50 text-amber-700 border-amber-200',
    advanced: 'bg-purple-50 text-purple-700 border-purple-200',
};

export const DifficultyBadge: React.FC<{ level: DocDifficulty }> = ({ level }) => (
    <span className={`inline-block text-[11px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 ${DIFF_STYLES[level]}`}>{level}</span>
);

export const TRACK_DESCRIPTIONS: Record<DocTrack, string> = {
    'getting-started': 'What PDF Architect is and your first document — start here.',
    editor: 'Every canvas tool, panel, and shortcut, from first click to overlapped-stack selection.',
    generator: 'Build entire documents in code — from first script to full dated planners.',
    gallery: 'Browse, publish, fork, and merge — with or without an account.',
};

export const tutorialUrl = (t: DocTutorial): string => `/docs/${t.track}/${t.slug}`;

// Lives here (not DocsSection.tsx, where it originated) so the page
// components DocsSection routes to (DocsTutorialPage,
// DocsReferenceEntryPage) can import it without a cycle back through
// DocsSection - a page importing DocsNotFound from DocsSection previously
// created exactly that (benign, but needless) import cycle.
export function DocsNotFound() {
    return (
        <div className="p-14">
            <h1 className="text-2xl font-bold mb-2">We couldn't find that page</h1>
            <p className="text-slate-500 mb-4">The link may be outdated.</p>
            <Link to="/docs" className="text-blue-600 font-medium">Back to the documentation home</Link>
        </div>
    );
}
