import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { DocsMarkdown } from '../../components/docs/DocsMarkdown';

const md = (s: string) => render(<MemoryRouter><DocsMarkdown markdown={s} /></MemoryRouter>);

describe('DocsMarkdown', () => {
  it('gives headings slugified ids', () => {
    md('## Dynamic Offset — via `dayOfWeekNum`');
    const h = screen.getByRole('heading', { level: 2 });
    expect(h.id).toBe('dynamic-offset-via-dayofweeknum');
  });

  it('renders [!TIP] blockquotes as callouts with the marker stripped', () => {
    md('> [!TIP]\n> Lock your background layer.');
    expect(screen.getByText(/Lock your background layer/)).toBeInTheDocument();
    expect(screen.queryByText(/\[!TIP\]/)).not.toBeInTheDocument();
    expect(document.querySelector('[data-callout="tip"]')).toBeTruthy();
  });

  it('renders [!WARNING] callouts', () => {
    md('> [!WARNING]\n> Publishing exposes generator scripts.');
    expect(document.querySelector('[data-callout="warning"]')).toBeTruthy();
  });

  it('renders kbd: inline code as a key chip', () => {
    md('Press `kbd:Ctrl+Z` to undo.');
    const kbd = document.querySelector('kbd');
    expect(kbd?.textContent).toBe('Ctrl+Z');
  });

  it('leaves ordinary inline code alone', () => {
    md('The `{{title}}` placeholder.');
    expect(document.querySelector('kbd')).toBeNull();
    expect(screen.getByText('{{title}}').tagName.toLowerCase()).toBe('code');
  });

  it('renders js code fences through HighlightedCode', () => {
    md('```js\nconst x = 1;\n```');
    expect(document.querySelector('pre')?.textContent).toContain('const x = 1;');
  });

  it('renders images as captioned figures and opens a lightbox on click', () => {
    md('![Toolbar](/docs-assets/editor/toolbar.png "The editor toolbar")');
    expect(screen.getByText('The editor toolbar')).toBeInTheDocument();
    const img = screen.getByAltText('Toolbar');
    expect(img).toHaveAttribute('loading', 'lazy');
    fireEvent.click(img);
    expect(document.querySelector('[data-lightbox]')).toBeTruthy();
    fireEvent.click(document.querySelector('[data-lightbox]')!);
    expect(document.querySelector('[data-lightbox]')).toBeNull();
  });

  it('badges animated clips', () => {
    md('![Drag](/docs-assets/editor/clip-drag-create.webp "Dragging out a rectangle")');
    expect(screen.getByText('clip')).toBeInTheDocument();
  });

  it('renders internal links as router links and external links with target=_blank', () => {
    md('[Grids](/docs/editor/grids-sources) and [Ko-fi](https://ko-fi.com/x)');
    expect(screen.getByText('Grids').closest('a')).toHaveAttribute('href', '/docs/editor/grids-sources');
    expect(screen.getByText('Ko-fi').closest('a')).toHaveAttribute('target', '_blank');
  });

  it('wraps tables for horizontal scroll', () => {
    md('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(document.querySelector('.overflow-x-auto table')).toBeTruthy();
  });

  // Regression: a prose line stuck right after a table (no blank line
  // separating them, so it's still the same mdast paragraph) must not be
  // silently absorbed into the table as a spurious 1-cell row.
  it('does not absorb trailing prose into the table when there is no blank line after it', () => {
    md('| a | b |\n|---|---|\n| 1 | 2 |\nMore text right after');
    const table = document.querySelector('table');
    expect(table).toBeTruthy();
    expect(table!.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(table!.querySelectorAll('tbody tr td')).toHaveLength(2);
    const trailing = screen.getByText('More text right after');
    expect(trailing).toBeInTheDocument();
    expect(trailing.tagName.toLowerCase()).toBe('p');
  });

  // Regression: a linked image ([![alt](src)](href)) is a paragraph whose
  // sole child is an <a> wrapping an <img>, not a bare <img> - it must still
  // unwrap out of <p> (invalid nesting otherwise), and clicking the image to
  // open the lightbox must not also fire the wrapping link's navigation.
  it('unwraps a linked figure from <p> and does not navigate when the image is clicked', () => {
    const LocationProbe = () => {
      const loc = useLocation();
      return <div data-testid="location">{loc.pathname}</div>;
    };
    render(
      <MemoryRouter initialEntries={['/docs/start']}>
        <LocationProbe />
        <DocsMarkdown markdown='[![Toolbar](/docs-assets/editor/toolbar.png "cap")](/docs/editor/toolbar)' />
      </MemoryRouter>
    );
    expect(document.querySelector('p figure')).toBeNull();
    const img = screen.getByAltText('Toolbar');
    fireEvent.click(img);
    expect(document.querySelector('[data-lightbox]')).toBeTruthy();
    expect(screen.getByTestId('location').textContent).toBe('/docs/start');
  });
});
