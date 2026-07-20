import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { DocsLayout } from './DocsLayout';
import { DocsHomePage } from './DocsHomePage';
import { DocsTutorialPage } from './DocsTutorialPage';

export function DocsNotFound() {
    return (
        <div className="p-14">
            <h1 className="text-2xl font-bold mb-2">We couldn't find that page</h1>
            <p className="text-slate-500 mb-4">The link may be outdated.</p>
            <Link to="/docs" className="text-blue-600 font-medium">Back to the documentation home</Link>
        </div>
    );
}

export function DocsSection() {
    return (
        <Routes>
            <Route element={<DocsLayout />}>
                <Route index element={<DocsHomePage />} />
                <Route path=":track/:slug" element={<DocsTutorialPage />} />
                <Route path="*" element={<DocsNotFound />} />
            </Route>
        </Routes>
    );
}
