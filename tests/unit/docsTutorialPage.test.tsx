import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

// DocsSection's tutorial route renders inside the full DocsLayout, whose
// persistent AppHeader ("Editor" -> /app) and sidebar (a NavLink per
// tutorial, e.g. "Grids", "Canvas Basics") are always present alongside the
// page under test. Several of this page's own labels collide with that
// chrome by plain text (the "editor" track's label is literally "Editor",
// same string as the header's link to the main app; every tutorial title
// also appears once as a sidebar NavLink). Unscoped screen.getByText /
// getByRole('link', {name}) queries would either false-pass (matching only
// the chrome, satisfied even without this page's feature) or throw on
// ambiguity (matching both the chrome and this page's own element) - so
// each assertion below scopes to this page's own labelled region
// (Breadcrumb / Prerequisites / "On this page", or the <article> itself).
describe('DocsTutorialPage', () => {
  it('renders breadcrumbs with track label', () => {
    at('/docs/editor/canvas-basics');
    const breadcrumb = screen.getByLabelText('Breadcrumb');
    expect(within(breadcrumb).getByText('Editor', { selector: 'a, span' })).toBeInTheDocument();
  });
  it('links prerequisites by title', () => {
    at('/docs/editor/grids');
    const prereqs = screen.getByLabelText('Prerequisites');
    const chip = within(prereqs).getByRole('link', { name: /Canvas Basics/ });
    expect(chip).toHaveAttribute('href', '/docs/editor/canvas-basics');
  });
  it('renders a TOC entry per ## heading', () => {
    at('/docs/editor/canvas-basics');
    const toc = screen.getByLabelText('On this page');
    expect(toc).toHaveTextContent('Toolbar');
  });
  it('renders next link to the following tutorial in the track', () => {
    at('/docs/editor/canvas-basics');
    const article = screen.getByRole('article');
    expect(within(article).getByRole('link', { name: /Grids/ })).toHaveAttribute('href', '/docs/editor/grids');
  });
  it('renders prev link and no next at the end of a track', () => {
    at('/docs/editor/grids');
    const article = screen.getByRole('article');
    expect(within(article).getAllByRole('link', { name: /Canvas Basics/ }).length).toBeGreaterThan(0);
    expect(within(article).queryByText(/^Next$/)).not.toBeInTheDocument();
  });

  // The five tests above establish the mechanism (mirroring the brief's
  // Step 1 spec, scoped per the note above); these round out the contract
  // bullets that spec left unexercised, still using only the mandated
  // fixture's existing tutorials/tracks (no fixture edits).
  it('links the first two breadcrumb segments to /docs and the track\'s first tutorial', () => {
    at('/docs/editor/grids'); // grids is order 2, so "first tutorial of track" is
    // distinguishable from "links back to the current page".
    const breadcrumb = screen.getByLabelText('Breadcrumb');
    expect(within(breadcrumb).getByRole('link', { name: 'Docs' })).toHaveAttribute('href', '/docs');
    expect(within(breadcrumb).getByRole('link', { name: 'Editor' })).toHaveAttribute('href', '/docs/editor/canvas-basics');
  });
  it('links each TOC entry to its heading anchor via slugifyHeading', () => {
    at('/docs/editor/canvas-basics');
    const toc = screen.getByLabelText('On this page');
    expect(within(toc).getByRole('link', { name: 'Toolbar' })).toHaveAttribute('href', '#toolbar');
  });
  it('renders no previous card at the start of a track', () => {
    at('/docs/editor/canvas-basics');
    const article = screen.getByRole('article');
    expect(within(article).queryByText(/^Previous$/)).not.toBeInTheDocument();
  });
  it('renders neither prev nor next for a track with a single tutorial', () => {
    at('/docs/getting-started/what-is-it');
    const article = screen.getByRole('article');
    expect(within(article).queryByText(/^Previous$/)).not.toBeInTheDocument();
    expect(within(article).queryByText(/^Next$/)).not.toBeInTheDocument();
  });
});
