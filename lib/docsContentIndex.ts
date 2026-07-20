import { parseDocsContent, type DocsIndex } from './docsContent';

// Bundles every docs markdown file at build time. Vitest runs through Vite,
// so the same glob works in tests without mocks.
export const docsContentFiles = import.meta.glob('../docs-content/{tutorials,reference}/**/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>;

export const docsIndex: DocsIndex = parseDocsContent(docsContentFiles);
