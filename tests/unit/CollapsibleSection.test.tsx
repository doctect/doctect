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

    it('renders compact disclosure as a full-width native button with accessibility state', () => {
        const onToggle = vi.fn();
        const { getByRole, queryByTestId } = render(
            <CollapsibleSection
                title="Geometry"
                variant="compact"
                expanded={false}
                onToggle={onToggle}
                testId="geometry-section"
            >
                <div data-testid="geometry-content" />
            </CollapsibleSection>,
        );
        const button = getByRole('button', { name: 'Geometry' });
        expect(button.tagName).toBe('BUTTON');
        expect(button).toHaveAttribute('type', 'button');
        expect(button).toHaveAttribute('aria-expanded', 'false');
        expect(button).toHaveClass('w-full');
        expect(queryByTestId('geometry-content')).toBeNull();

        button.focus();
        fireEvent.keyDown(button, { key: 'Enter' });
        fireEvent.click(button);
        expect(onToggle).toHaveBeenCalledOnce();
        expect(button).toHaveFocus();
    });

    it('keeps default presentation classes for Template Settings and Layers', () => {
        const { getByRole, getByTestId } = render(
            <CollapsibleSection
                title="Layers"
                expanded={true}
                onToggle={() => undefined}
                testId="layers-section"
            >
                <div />
            </CollapsibleSection>,
        );
        expect(getByTestId('layers-section')).toHaveClass('border-b', 'bg-slate-50');
        expect(getByRole('button', { name: 'Layers' })).toHaveClass('p-4', 'font-bold');
    });
});
