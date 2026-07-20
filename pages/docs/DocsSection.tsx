import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { DocsLayout } from './DocsLayout';
import { DocsHomePage } from './DocsHomePage';
import { DocsTutorialPage } from './DocsTutorialPage';
import { DocsReferenceIndexPage } from './DocsReferenceIndexPage';
import { DocsReferenceEntryPage } from './DocsReferenceEntryPage';
import { DocsNotFound } from './docsUi';

export function DocsSection() {
    return (
        <Routes>
            <Route element={<DocsLayout />}>
                <Route index element={<DocsHomePage />} />
                {/* Placed before ":track/:slug" per plan: "/docs/reference" (one
                    segment) can't match that two-segment pattern at all, so
                    without its own route it would fall through to the "*"
                    not-found route; "reference" never gets a chance to be
                    mismatched as a :track value either way. */}
                <Route path="reference" element={<DocsReferenceIndexPage />} />
                <Route path="reference/:slug" element={<DocsReferenceEntryPage />} />
                <Route path=":track/:slug" element={<DocsTutorialPage />} />
                <Route path="*" element={<DocsNotFound />} />
            </Route>
        </Routes>
    );
}
