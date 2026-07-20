import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { parseDocsContent } from '../../lib/docsContent';
import { buildDocsSearchIndex } from '../../lib/docsSearch';
import { DocsSearchBox } from '../../components/docs/DocsSearchBox';

const sIdx = buildDocsSearchIndex(parseDocsContent({
  '../docs-content/reference/grid/dynamic-offset.md':
    '---\ntitle: Dynamic Offset\nsummary: Field-driven offset.\naliases: calendar offset\n---\n\nBody.\n',
  '../docs-content/reference/grid/traversal-path.md':
    '---\ntitle: Traversal Path\nsummary: Drill into descendants.\n---\n\nBody.\n',
}));

const LocationProbe = () => <div data-testid="loc">{useLocation().pathname}</div>;

const setup = () => render(
  <MemoryRouter initialEntries={['/docs']}>
    <DocsSearchBox searchIndex={sIdx} />
    <Routes><Route path="*" element={<LocationProbe />} /></Routes>
  </MemoryRouter>
);

describe('DocsSearchBox', () => {
  it('shows results while typing', () => {
    setup();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'offset' } });
    expect(screen.getByText('Dynamic Offset')).toBeInTheDocument();
  });
  it('navigates with arrow keys + Enter', () => {
    setup();
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'path' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('loc')).toHaveTextContent('/docs/reference/traversal-path');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
  it('closes on Escape', () => {
    setup();
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'offset' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByText('Dynamic Offset')).not.toBeInTheDocument();
  });
  it('focuses on global "/" keypress', () => {
    setup();
    fireEvent.keyDown(window, { key: '/' });
    expect(screen.getByRole('combobox')).toHaveFocus();
  });
  it('shows a no-matches row', () => {
    setup();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zzzz' } });
    expect(screen.getByText(/no matches/i)).toBeInTheDocument();
  });
});

// Regression coverage added after review: the five tests above exercise
// typing, Escape, "/" focus, a no-matches row, and one Enter-navigation
// path - but none of them can tell wrapping modulo arithmetic apart from
// simple clamping, or even from ArrowDown being a complete no-op (the
// "path" query's Enter test has only one result, so (0 + 1) % 1,
// Math.min(0 + 1, 0), and "ArrowDown does nothing" all land on the same
// index 0). They also don't exercise mouse interaction (result click,
// outside click), the "/" guard's own exclusion clause, the "up to 8" /
// badge-chip parts of the typing contract, or a whitespace-only query.
// Each test below closes one of those gaps; where a single test can't
// fully isolate its claim (a 2-item list makes "moves forward, twice" and
// "does nothing" coincide after landing back on index 0), a second test
// pins the piece the first one leaves ambiguous - see the two ArrowDown
// tests' comments.
describe('DocsSearchBox — additional contract coverage (regression coverage)', () => {
  // 'body' is the one query where both fixture docs tie in score (each
  // matches only via its own literal "Body." text), so it resolves to
  // exactly two results ordered alphabetically: Dynamic Offset (index 0),
  // then Traversal Path (index 1) - letting a wrap in either direction be
  // read off of which result Enter lands on.
  it('moves the highlight forward with a single ArrowDown', () => {
    // Isolates "ArrowDown moves at all" from the wrap test below: a single
    // press from index 0 must land on index 1 (Traversal Path). A no-op
    // ArrowDown would leave Enter landing on index 0 (Dynamic Offset)
    // instead, so this fails on its own if the key is disabled entirely -
    // unlike the two-press wrap test, which a no-op would pass by
    // coincidence (see next test's comment).
    setup();
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'body' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // 0 (Dynamic Offset) -> 1 (Traversal Path)
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('loc')).toHaveTextContent('/docs/reference/traversal-path');
  });

  it('wraps ArrowDown past the last result back to the first', () => {
    // On its own, two ArrowDown presses landing back on index 0 is
    // ambiguous with ArrowDown being a no-op (both never leave index 0).
    // Combined with the single-press test above - which already proves
    // one press does move to index 1 - the only way this test's second
    // press can also land back on index 0 is a genuine wrap, which is what
    // this pins: a non-wrapping clamp (Math.min(h + 1, results.length - 1))
    // would instead stay at index 1 (Traversal Path) after the second
    // press, failing this assertion.
    setup();
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'body' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // 0 (Dynamic Offset) -> 1 (Traversal Path)
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // 1 -> wraps to 0 (Dynamic Offset)
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('loc')).toHaveTextContent('/docs/reference/dynamic-offset');
  });

  it('wraps ArrowUp from the first result to the last', () => {
    // Unlike the ArrowDown pair above, one press already fully isolates
    // this claim: both a no-op and a clamp-at-0 leave Enter on index 0
    // (Dynamic Offset), so landing on index 1 (Traversal Path) can only
    // happen if ArrowUp actually wraps.
    setup();
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'body' } });
    fireEvent.keyDown(input, { key: 'ArrowUp' }); // 0 -> wraps to the last result (1, Traversal Path)
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('loc')).toHaveTextContent('/docs/reference/traversal-path');
  });

  it('clicking a result navigates and closes the dropdown', () => {
    setup();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'offset' } });
    fireEvent.click(screen.getByRole('option', { name: /Dynamic Offset/ }));
    expect(screen.getByTestId('loc')).toHaveTextContent('/docs/reference/dynamic-offset');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes the dropdown on an outside click', () => {
    setup();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'offset' } });
    expect(screen.getByText('Dynamic Offset')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('Dynamic Offset')).not.toBeInTheDocument();
  });

  it("shows each result's category badge chip", () => {
    setup();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'offset' } });
    const option = screen.getByRole('option', { name: /Dynamic Offset/ });
    expect(within(option).getByText('Grid Configuration')).toBeInTheDocument();
  });

  it('caps the dropdown at 8 results even when more match', () => {
    const many = buildDocsSearchIndex(parseDocsContent(
      Object.fromEntries(Array.from({ length: 10 }, (_, i) => [
        `../docs-content/reference/grid/widget-${i}.md`,
        `---\ntitle: Widget ${i}\nsummary: Synthetic fixture entry ${i}.\n---\n\nBody.\n`,
      ]))
    ));
    render(
      <MemoryRouter initialEntries={['/docs']}>
        <DocsSearchBox searchIndex={many} />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'widget' } });
    expect(screen.getAllByRole('option')).toHaveLength(8);
  });

  it('does not steal focus on "/" while already typing in another input', () => {
    // The existing "/" test only exercises the happy path (nothing else
    // focused); this pins the guard clause itself - without it, "/" would
    // always preventDefault + steal focus, breaking the literal "/"
    // character in any other field on the page.
    render(
      <MemoryRouter initialEntries={['/docs']}>
        <input aria-label="Other field" />
        <DocsSearchBox searchIndex={sIdx} />
      </MemoryRouter>
    );
    const other = screen.getByLabelText('Other field');
    other.focus();
    fireEvent.keyDown(window, { key: '/' });
    expect(other).toHaveFocus();
    expect(screen.getByRole('combobox')).not.toHaveFocus();
  });

  it('does not open the dropdown for a whitespace-only query', () => {
    // Pins the "non-space" half of "typing >= 1 non-space char shows a
    // dropdown" - searchDocs already returns [] for an all-whitespace
    // query (see docsSearch.test.ts), so without the .trim().length > 0
    // guard specifically, this would render the listbox with a "No
    // matches" row rather than nothing at all.
    setup();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '   ' } });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
