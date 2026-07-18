import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';
import { SvgSourceSection } from '../../components/properties/SvgSourceSection';

const VALID_A = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="5" height="5" fill="red"/></svg>';
const VALID_B = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="blue"/></svg>';
const VALID_C = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><polygon points="0,0 5,10 10,0" fill="green"/></svg>';
const INVALID = '<svg><rect</svg>';

describe('SvgSourceSection', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    const getTextarea = () => screen.getByTestId('svg-source-textarea') as HTMLTextAreaElement;

    it('shows the current svgContent in the textarea', () => {
        render(<SvgSourceSection svgContent={VALID_A} expanded={true} onToggle={vi.fn()} onCommit={vi.fn()} />);
        expect(getTextarea().value).toBe(VALID_A);
    });

    it('commits a valid edit after the 400ms debounce, with saveHistory=true on the first commit of a burst', () => {
        const onCommit = vi.fn();
        render(<SvgSourceSection svgContent={VALID_A} expanded={true} onToggle={vi.fn()} onCommit={onCommit} />);
        fireEvent.focus(getTextarea());
        fireEvent.change(getTextarea(), { target: { value: VALID_B } });
        expect(onCommit).not.toHaveBeenCalled(); // not before debounce
        act(() => { vi.advanceTimersByTime(400); });
        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit).toHaveBeenCalledWith(VALID_B, true);
    });

    it('passes saveHistory=false on subsequent commits within the same focus session', () => {
        const onCommit = vi.fn();
        render(<SvgSourceSection svgContent={VALID_A} expanded={true} onToggle={vi.fn()} onCommit={onCommit} />);
        fireEvent.focus(getTextarea());
        fireEvent.change(getTextarea(), { target: { value: VALID_B } });
        act(() => { vi.advanceTimersByTime(400); });
        fireEvent.change(getTextarea(), { target: { value: VALID_A } });
        act(() => { vi.advanceTimersByTime(400); });
        expect(onCommit).toHaveBeenCalledTimes(2);
        expect(onCommit).toHaveBeenNthCalledWith(1, VALID_B, true);
        expect(onCommit).toHaveBeenNthCalledWith(2, VALID_A, false);
    });

    it('resets the burst on blur: next focus session saves history again', () => {
        const onCommit = vi.fn();
        render(<SvgSourceSection svgContent={VALID_A} expanded={true} onToggle={vi.fn()} onCommit={onCommit} />);
        fireEvent.focus(getTextarea());
        fireEvent.change(getTextarea(), { target: { value: VALID_B } });
        act(() => { vi.advanceTimersByTime(400); });
        fireEvent.blur(getTextarea());
        fireEvent.focus(getTextarea());
        fireEvent.change(getTextarea(), { target: { value: VALID_A } });
        act(() => { vi.advanceTimersByTime(400); });
        expect(onCommit).toHaveBeenNthCalledWith(2, VALID_A, true);
    });

    it('keeps saveHistory=false when blur races a pending commit in the same burst', () => {
        const onCommit = vi.fn();
        render(<SvgSourceSection svgContent={VALID_A} expanded={true} onToggle={vi.fn()} onCommit={onCommit} />);
        fireEvent.focus(getTextarea());
        fireEvent.change(getTextarea(), { target: { value: VALID_B } });
        act(() => { vi.advanceTimersByTime(400); });
        expect(onCommit).toHaveBeenNthCalledWith(1, VALID_B, true);
        fireEvent.change(getTextarea(), { target: { value: VALID_A } }); // schedules commit 2
        fireEvent.blur(getTextarea()); // blur BEFORE the debounce elapses
        act(() => { vi.advanceTimersByTime(400); });
        expect(onCommit).toHaveBeenCalledTimes(2);
        expect(onCommit).toHaveBeenNthCalledWith(2, VALID_A, false);
    });

    it('keeps the scheduled history decision when collapse and refocus start a new session', () => {
        const onCommit = vi.fn();
        const Controlled = () => {
            const [expanded, setExpanded] = React.useState(true);
            return <SvgSourceSection
                svgContent={VALID_A}
                onCommit={onCommit}
                expanded={expanded}
                onToggle={() => setExpanded(value => !value)}
            />;
        };
        render(<Controlled />);
        fireEvent.focus(getTextarea());
        fireEvent.change(getTextarea(), { target: { value: VALID_B } });
        act(() => { vi.advanceTimersByTime(400); });
        expect(onCommit).toHaveBeenNthCalledWith(1, VALID_B, true);

        fireEvent.change(getTextarea(), { target: { value: VALID_C } });
        fireEvent.click(screen.getByRole('button', { name: 'SVG Source' }));
        fireEvent.click(screen.getByRole('button', { name: 'SVG Source' }));
        fireEvent.focus(getTextarea());
        act(() => { vi.advanceTimersByTime(400); });

        expect(onCommit).toHaveBeenCalledTimes(2);
        expect(onCommit).toHaveBeenNthCalledWith(2, VALID_C, false);

        fireEvent.change(getTextarea(), { target: { value: VALID_A } });
        act(() => { vi.advanceTimersByTime(400); });
        expect(onCommit).toHaveBeenNthCalledWith(3, VALID_A, true);
    });

    it('shows an error and does not commit invalid SVG', () => {
        const onCommit = vi.fn();
        render(<SvgSourceSection svgContent={VALID_A} expanded={true} onToggle={vi.fn()} onCommit={onCommit} />);
        fireEvent.focus(getTextarea());
        fireEvent.change(getTextarea(), { target: { value: INVALID } });
        act(() => { vi.advanceTimersByTime(400); });
        expect(onCommit).not.toHaveBeenCalled();
        expect(screen.getByText('Invalid SVG — canvas shows last valid version')).toBeTruthy();
    });

    it('clears the error once the draft becomes valid again', () => {
        const onCommit = vi.fn();
        render(<SvgSourceSection svgContent={VALID_A} expanded={true} onToggle={vi.fn()} onCommit={onCommit} />);
        fireEvent.focus(getTextarea());
        fireEvent.change(getTextarea(), { target: { value: INVALID } });
        act(() => { vi.advanceTimersByTime(400); });
        fireEvent.change(getTextarea(), { target: { value: VALID_B } });
        act(() => { vi.advanceTimersByTime(400); });
        expect(screen.queryByText('Invalid SVG — canvas shows last valid version')).toBeNull();
        expect(onCommit).toHaveBeenCalledWith(VALID_B, true);
    });

    it('re-seeds the draft when svgContent changes externally (undo/redo/restore)', () => {
        const { rerender } = render(<SvgSourceSection svgContent={VALID_A} expanded={true} onToggle={vi.fn()} onCommit={vi.fn()} />);
        rerender(<SvgSourceSection svgContent={VALID_B} expanded={true} onToggle={vi.fn()} onCommit={vi.fn()} />);
        expect(getTextarea().value).toBe(VALID_B);
    });

    it('does not re-seed (or loop) from its own committed value', () => {
        const onCommit = vi.fn();
        const { rerender } = render(<SvgSourceSection svgContent={VALID_A} expanded={true} onToggle={vi.fn()} onCommit={onCommit} />);
        fireEvent.focus(getTextarea());
        fireEvent.change(getTextarea(), { target: { value: VALID_B } });
        act(() => { vi.advanceTimersByTime(400); });
        // Parent state updated with our own commit — textarea must keep the draft untouched
        rerender(<SvgSourceSection svgContent={VALID_B} expanded={true} onToggle={vi.fn()} onCommit={onCommit} />);
        expect(getTextarea().value).toBe(VALID_B);
        expect(onCommit).toHaveBeenCalledTimes(1);
    });

    it('shows a size hint in KB', () => {
        render(<SvgSourceSection svgContent={VALID_A} expanded={true} onToggle={vi.fn()} onCommit={vi.fn()} />);
        expect(screen.getByTestId('svg-source-size').textContent).toMatch(/KB/);
    });

    it('invokes the latest onCommit, not a stale closure, when the prop changes before the debounce fires', () => {
        const first = vi.fn();
        const second = vi.fn();
        const { rerender } = render(<SvgSourceSection svgContent={VALID_A} expanded={true} onToggle={vi.fn()} onCommit={first} />);
        fireEvent.focus(getTextarea());
        fireEvent.change(getTextarea(), { target: { value: VALID_B } });
        // Interleaved edit elsewhere re-renders this component with a fresh onCommit
        // BEFORE the debounce timer fires.
        rerender(<SvgSourceSection svgContent={VALID_A} expanded={true} onToggle={vi.fn()} onCommit={second} />);
        act(() => { vi.advanceTimersByTime(400); });
        expect(second).toHaveBeenCalledTimes(1);
        expect(second).toHaveBeenCalledWith(VALID_B, true);
        expect(first).not.toHaveBeenCalled();
    });

    it('clears a pending debounce timer when svgContent changes externally, so the stale draft never re-commits over the restore', () => {
        const onCommit = vi.fn();
        const { rerender } = render(<SvgSourceSection svgContent={VALID_A} expanded={true} onToggle={vi.fn()} onCommit={onCommit} />);
        fireEvent.focus(getTextarea());
        fireEvent.change(getTextarea(), { target: { value: VALID_B } });
        // External change (undo/redo/restore) arrives before the debounce fires.
        rerender(<SvgSourceSection svgContent={VALID_C} expanded={true} onToggle={vi.fn()} onCommit={onCommit} />);
        act(() => { vi.advanceTimersByTime(400); });
        expect(onCommit).not.toHaveBeenCalled();
        expect(getTextarea().value).toBe(VALID_C);
    });

    it('keeps invalid draft and validation error while its controlled body is collapsed', () => {
        const onCommit = vi.fn();
        const Controlled = () => {
            const [expanded, setExpanded] = React.useState(true);
            return <SvgSourceSection
                svgContent={VALID_A}
                onCommit={onCommit}
                expanded={expanded}
                onToggle={() => setExpanded(value => !value)}
            />;
        };
        render(<Controlled />);
        fireEvent.change(getTextarea(), { target: { value: INVALID } });
        act(() => { vi.advanceTimersByTime(400); });
        expect(screen.getByText('Invalid SVG — canvas shows last valid version')).toBeVisible();

        fireEvent.click(screen.getByRole('button', { name: 'SVG Source' }));
        expect(screen.queryByTestId('svg-source-textarea')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'SVG Source' }));

        expect(getTextarea()).toHaveValue(INVALID);
        expect(screen.getByText('Invalid SVG — canvas shows last valid version')).toBeVisible();
        expect(onCommit).not.toHaveBeenCalled();
    });
});
