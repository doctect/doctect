import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { parseDocsContent } from '../../lib/docsContent';

// vi.hoisted (not a plain top-level const): the vi.mock factory below runs
// while resolving DocsSection's own import graph, which - per ESM evaluation
// order - happens before this file's own non-import statements run. A plain
// `const fixtureFiles = {...}` here would still be in its TDZ when the
// factory closes over it, throwing "Cannot access before initialization".
const fixtureFiles = vi.hoisted((): Record<string, string> => ({
  '../docs-content/tutorials/getting-started/01-what-is-it.md':
    '---\ntitle: What Is PDF Architect\ndifficulty: beginner\ntime: 5 min\nsummary: The mental model.\n---\n\n## Nodes\n\nIntro.\n',
  '../docs-content/tutorials/editor/01-canvas-basics.md':
    '---\ntitle: Canvas Basics\ndifficulty: beginner\ntime: 8 min\nsummary: Tools and navigation.\n---\n\n## Toolbar\n\nBody.\n',
  '../docs-content/tutorials/editor/02-grids.md':
    '---\ntitle: Grids\ndifficulty: intermediate\ntime: 10 min\nsummary: Data grids.\nprerequisites: editor/canvas-basics\n---\n\n## Sources\n\nBody.\n',
  '../docs-content/reference/grid/dynamic-offset.md':
    '---\ntitle: Dynamic Offset\nsummary: Field-driven offset.\naliases: calendar offset\n---\n\nOffset body.\n',
}));

vi.mock('../../lib/docsContentIndex', () => ({
  docsIndex: parseDocsContent(fixtureFiles),
  docsContentFiles: fixtureFiles,
}));

import { DocsSection } from '../../pages/docs/DocsSection';

const at = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/docs/*" element={<DocsSection />} /></Routes>
  </MemoryRouter>
);

describe('DocsSection routing', () => {
  it('renders the home page at /docs with track sections', () => {
    at('/docs');
    expect(screen.getByRole('heading', { name: /documentation/i })).toBeInTheDocument();
    expect(screen.getAllByText('Canvas Basics').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Getting Started/).length).toBeGreaterThan(0);
  });
  it('renders a tutorial page at /docs/:track/:slug', () => {
    at('/docs/editor/canvas-basics');
    expect(screen.getByRole('heading', { level: 1, name: 'Canvas Basics' })).toBeInTheDocument();
    expect(screen.getByText(/8 min/)).toBeInTheDocument();
  });
  it('shows a not-found panel for unknown tutorials', () => {
    at('/docs/editor/nope');
    expect(screen.getByText(/couldn.t find|not found/i)).toBeInTheDocument();
  });
  it('renders sidebar navigation links for every tutorial', () => {
    at('/docs');
    const nav = screen.getByRole('navigation');
    expect(nav).toHaveTextContent('Canvas Basics');
    expect(nav).toHaveTextContent('Grids');
    expect(nav).toHaveTextContent('Reference');
  });
});
