import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StarRating, StarRatingInput } from '../../components/gallery/StarRating';

describe('StarRating (display)', () => {
    it('shows the value to one decimal with the count', () => {
        render(<StarRating value={4.25} count={7} />);
        expect(screen.getByText(/4\.3/)).toBeInTheDocument();
        expect(screen.getByText(/\(7\)/)).toBeInTheDocument();
        expect(screen.getByLabelText(/rated 4\.25? out of 5/i)).toBeInTheDocument();
    });

    it('renders a fractional fill width', () => {
        const { container } = render(<StarRating value={2.5} />);
        const fill = container.querySelector('[data-testid="star-fill"]') as HTMLElement;
        expect(fill.style.width).toBe('50%');
    });

    it('renders "No ratings yet" for null', () => {
        render(<StarRating value={null} />);
        expect(screen.getByText('No ratings yet')).toBeInTheDocument();
    });
});

describe('StarRatingInput', () => {
    it('renders 5 radios and reports clicks', () => {
        const onChange = vi.fn();
        render(<StarRatingInput value={2} onChange={onChange} />);
        const radios = screen.getAllByRole('radio');
        expect(radios).toHaveLength(5);
        expect(radios[1]).toHaveAttribute('aria-checked', 'true');
        fireEvent.click(screen.getByLabelText('4 stars'));
        expect(onChange).toHaveBeenCalledWith(4);
    });
});
