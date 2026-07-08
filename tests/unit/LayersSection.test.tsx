import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { LayersSection } from '../../components/LayersSection';

describe('LayersSection (collapsible)', () => {
    it('always shows the "Layers" title, even when collapsed, and hides the body', () => {
        const { getByText, queryByTestId } = render(
            <LayersSection expanded={false} onToggle={() => {}}>
                <div data-testid="body-content" />
            </LayersSection>
        );
        expect(getByText('Layers')).toBeTruthy();
        expect(queryByTestId('body-content')).toBeNull();
    });

    it('renders its children when expanded', () => {
        const { queryByTestId } = render(
            <LayersSection expanded={true} onToggle={() => {}}>
                <div data-testid="body-content" />
            </LayersSection>
        );
        expect(queryByTestId('body-content')).not.toBeNull();
    });

    it('calls onToggle when the header is clicked', () => {
        const onToggle = vi.fn();
        const { getByTitle } = render(
            <LayersSection expanded={false} onToggle={onToggle}>
                <div />
            </LayersSection>
        );
        fireEvent.click(getByTitle('Layers'));
        expect(onToggle).toHaveBeenCalledOnce();
    });
});
