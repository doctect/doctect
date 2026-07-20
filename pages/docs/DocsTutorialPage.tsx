import React from 'react';
import { useParams } from 'react-router-dom';
import { docsIndex } from '../../lib/docsContentIndex';
import { DocsMarkdown } from '../../components/docs/DocsMarkdown';
import { DifficultyBadge } from './docsUi';
import { DocsNotFound } from './DocsSection';

export function DocsTutorialPage() {
    const { track = '', slug = '' } = useParams();
    const tutorial = docsIndex.tutorialByPath.get(`${track}/${slug}`);
    if (!tutorial) return <DocsNotFound />;
    return (
        <article className="p-8 md:p-14 max-w-4xl">
            <h1 className="text-4xl font-extrabold tracking-tight mb-3">{tutorial.title}</h1>
            <div className="flex items-center gap-3 mb-8 text-sm text-slate-500">
                <DifficultyBadge level={tutorial.difficulty} />
                <span>{tutorial.time}</span>
            </div>
            <DocsMarkdown markdown={tutorial.body} />
        </article>
    );
}
