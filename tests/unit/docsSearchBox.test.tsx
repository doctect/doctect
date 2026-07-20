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
// simple clamping (the "path" query's Enter test has only one result, so
// (0 + 1) % 1 and Math.min(0 + 1, 0) both land on 0), and none exercise
// mouse interaction (result click, outside click) or the "up to 8" /
// badge-chip parts of the typing contract at all. Each test below closes
// one of those gaps and is written so disabling just that behavior (not
// some other one) breaks only that test.
describe('DocsSearchBox — additional contract coverage (regression coverage)', () => {
  // 'body' is the one query where both fixture docs tie in score (each
  // matches only via its own literal "Body." text), so it resolves to
  // exactly two results ordered alphabetically: Dynamic Offset (index 0),
  // then Traversal Path (index 1) - letting a wrap in either direction be
  // read off of which result Enter lands on.
  it('wraps ArrowDown past the last result back to the first', () => {
    setup();
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'body' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // 0 (Dynamic Offset) -> 1 (Traversal Path)
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // 1 -> wraps to 0 (Dynamic Offset)
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('loc')).toHaveTextContent('/docs/reference/dynamic-offset');
  });

  it('wraps ArrowUp from the first result to the last', () => {
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
});
