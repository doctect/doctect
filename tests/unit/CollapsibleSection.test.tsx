import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { CollapsibleSection } from '../../components/CollapsibleSection';

describe('CollapsibleSection', () => {
    it('always shows the title, even when collapsed, and hides the body', () => {
        const { getByText, queryByTestId } = render(
            <CollapsibleSection title="Layers" expanded={false} onToggle={() => {}}>
                <div data-testid="body-content" />
            </CollapsibleSection>
        );
        expect(getByText('Layers')).toBeTruthy();
        expect(queryByTestId('body-content')).toBeNull();
    });

    it('renders its children when expanded', () => {
        const { queryByTestId } = render(
            <CollapsibleSection title="Template Settings" expanded={true} onToggle={() => {}}>
                <div data-testid="body-content" />
            </CollapsibleSection>
        );
        expect(queryByTestId('body-content')).not.toBeNull();
    });

    it('calls onToggle when the header is clicked', () => {
        const onToggle = vi.fn();
        const { getByTitle } = render(
            <CollapsibleSection title="Layers" expanded={false} onToggle={onToggle}>
                <div />
            </CollapsibleSection>
        );
        fireEvent.click(getByTitle('Layers'));
        expect(onToggle).toHaveBeenCalledOnce();
    });
});
