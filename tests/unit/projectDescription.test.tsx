import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProjectDescription } from '../../components/gallery/ProjectDescription';

describe('ProjectDescription', () => {
    it('renders markdown formatting', () => {
        render(<ProjectDescription text={'# Weekly Planner\n\nA planner with **bold claims** and:\n\n- one\n- two'} />);
        expect(screen.getByRole('heading', { name: 'Weekly Planner' })).toBeInTheDocument();
        expect(screen.getByText('bold claims').tagName).toBe('STRONG');
        expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual(['one', 'two']);
    });

    it('keeps raw HTML inert instead of injecting it', () => {
        const { container } = render(<ProjectDescription text={'hello <img src=x onerror="alert(1)"> world'} />);
        expect(container.querySelector('img')).toBeNull();
        // The tag survives as visible text, not as a parsed element.
        expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
    });

    it('does not render javascript: links as clickable hrefs', () => {
        render(<ProjectDescription text={'[click](javascript:alert(1))'} />);
        const link = screen.getByText('click').closest('a');
        expect(link?.getAttribute('href') ?? '').not.toMatch(/^javascript:/i);
    });

    it('opens external links in a new tab with rel protection', () => {
        render(<ProjectDescription text={'[docs](https://example.com)'} />);
        const link = screen.getByRole('link', { name: 'docs' });
        expect(link).toHaveAttribute('href', 'https://example.com');
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('renders nothing for an empty description', () => {
        const { container } = render(<ProjectDescription text="" />);
        expect(container).toBeEmptyDOMElement();
    });
});
