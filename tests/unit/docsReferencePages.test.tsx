import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { parseDocsContent } from '../../lib/docsContent';

// vi.hoisted (not a plain top-level const): the vi.mock factory below runs
// while resolving DocsSection's own import graph, which - per ESM evaluation
// order - happens before this file's own non-import statements run. A plain
// `const fixtureFiles = {...}` here would still be in its TDZ when the
// factory closes over it, throwing "Cannot access before initialization".
//
// Same fixture as docsSection.test.tsx, except editor/02-grids.md's body
// now links to the reference entry below, so the entry page's "Appears in"
// section has a real tutorial to list.
const fixtureFiles = vi.hoisted((): Record<string, string> => ({
  '../docs-content/tutorials/getting-started/01-what-is-it.md':
    '---\ntitle: What Is PDF Architect\ndifficulty: beginner\ntime: 5 min\nsummary: The mental model.\n---\n\n## Nodes\n\nIntro.\n',
  '../docs-content/tutorials/editor/01-canvas-basics.md':
    '---\ntitle: Canvas Basics\ndifficulty: beginner\ntime: 8 min\nsummary: Tools and navigation.\n---\n\n## Toolbar\n\nBody.\n',
  '../docs-content/tutorials/editor/02-grids.md':
    '---\ntitle: Grids\ndifficulty: intermediate\ntime: 10 min\nsummary: Data grids.\nprerequisites: editor/canvas-basics\n---\n\n## Sources\n\nSee [Dynamic Offset](/docs/reference/dynamic-offset).\n',
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

// As established in docsSection.test.tsx / docsTutorialPage.test.tsx:
// DocsSection's routes render inside the full DocsLayout, whose sidebar
// renders a NavLink per tutorial - so "Grids" (the fixture tutorial that
// links to the dynamic-offset entry) is always present in the chrome
// alongside the entry page's own "Appears in" list, which also links to
// that same tutorial by the same title/href. An unscoped
// getByRole('link', { name: /Grids/ }) would be ambiguous (matches both the
// sidebar NavLink and the "Appears in" link), so that one assertion scopes
// to the "Appears in" region via its aria-label, matching the
// within()/aria-label convention already used for Breadcrumb/Prerequisites.
describe('DocsReferenceIndexPage', () => {
  it('groups entries by category label', () => {
    at('/docs/reference');
    expect(screen.getByText('Grid Configuration')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Dynamic Offset/ })).toHaveAttribute('href', '/docs/reference/dynamic-offset');
  });
  it('filters entries live', () => {
    at('/docs/reference');
    fireEvent.change(screen.getByPlaceholderText(/filter reference/i), { target: { value: 'zzz-no-match' } });
    expect(screen.queryByRole('link', { name: /Dynamic Offset/ })).not.toBeInTheDocument();
  });
});

describe('DocsReferenceEntryPage', () => {
  it('renders entry with alias line and body', () => {
    at('/docs/reference/dynamic-offset');
    expect(screen.getByRole('heading', { level: 1, name: 'Dynamic Offset' })).toBeInTheDocument();
    expect(screen.getByText(/calendar offset/)).toBeInTheDocument();
  });
  it('lists tutorials that reference the entry under "Appears in"', () => {
    at('/docs/reference/dynamic-offset');
    const appearsIn = screen.getByLabelText(/appears in/i);
    expect(within(appearsIn).getByRole('link', { name: /Grids/ })).toHaveAttribute('href', '/docs/editor/grids');
  });
  it('404s unknown entries', () => {
    at('/docs/reference/nope');
    expect(screen.getByText(/couldn.t find|not found/i)).toBeInTheDocument();
  });
});
