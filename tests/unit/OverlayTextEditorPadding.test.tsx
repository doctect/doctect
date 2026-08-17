import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OverlayTextEditor } from '../../components/canvas/OverlayTextEditor';
import type { TemplateElement } from '../../types';

const element = (overrides: Partial<TemplateElement> = {}): TemplateElement => ({
  id: 'text', type: 'text', x: 10, y: 20, w: 100, h: 40, rotation: 15,
  fill: '', stroke: '', strokeWidth: 0, opacity: 1, text: 'FULL SOURCE TEXT',
  fontSize: 12, fontFamily: 'helvetica', align: 'left', verticalAlign: 'top',
  textOverflow: 'ellipsis', textWrap: false,
  textPadding: { top: 3, right: 4, bottom: 5, left: 6 },
  ...overrides,
});

const renderEditor = (value: TemplateElement) => render(
  <OverlayTextEditor element={value} onChange={vi.fn()} onFinish={vi.fn()} />,
);

describe('OverlayTextEditor padding', () => {
  it('keeps outer rotation geometry and starts full source inside the padded box', () => {
    renderEditor(element({ transformOrigin: { x: 0.25, y: 0.75 } }));
    const editor = screen.getByTestId('overlay-text-editor');
    const box = screen.getByTestId('overlay-text-editor-box');
    const outer = box.parentElement!;

    expect(outer).toHaveStyle({
      left: '10px', top: '20px', width: '100px', height: '40px', transform: 'rotate(15deg)',
      transformOrigin: '25px 30px',
    });
    expect(box).toHaveStyle({
      left: '6px', top: '3px', width: '90px', height: '32px', overflow: 'visible',
    });
    expect(editor).toHaveTextContent('FULL SOURCE TEXT');
    expect(editor).toHaveStyle({ whiteSpace: 'pre-wrap', maxWidth: '100%' });
  });

  it('provides a minimal editing-only target for exhausted content', () => {
    renderEditor(element({ textPadding: { top: 50, right: 40, bottom: 0, left: 70 } }));
    expect(screen.getByTestId('overlay-text-editor-box')).toHaveStyle({
      left: '70px', top: '50px', width: '1px', height: '1px', overflow: 'visible',
    });
    expect(screen.getByTestId('overlay-text-editor')).toHaveTextContent('FULL SOURCE TEXT');
  });

  it('ignores dormant padding for auto-width editing', () => {
    renderEditor(element({ autoWidth: true }));
    expect(screen.getByTestId('overlay-text-editor-box')).toHaveStyle({
      left: '0px', top: '0px', width: '100px', height: '40px',
    });
    expect(screen.getByTestId('overlay-text-editor')).toHaveStyle({
      whiteSpace: 'pre', maxWidth: 'none',
    });
  });
});

describe('OverlayTextEditor scroll lock', () => {
  it('restores captured window scroll only while the input lock is active', () => {
    const originalX = Object.getOwnPropertyDescriptor(window, 'scrollX');
    const originalY = Object.getOwnPropertyDescriptor(window, 'scrollY');
    let x = 10;
    let y = 20;
    vi.useFakeTimers();
    Object.defineProperty(window, 'scrollX', { configurable: true, get: () => x });
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation((left, top) => {
      x = Number(left);
      y = Number(top);
    });

    try {
      renderEditor(element());
      fireEvent.input(screen.getByTestId('overlay-text-editor'));
      x = 30;
      y = 40;
      window.dispatchEvent(new Event('scroll', { cancelable: true }));

      expect(scrollTo).toHaveBeenCalledWith(10, 20);

      scrollTo.mockClear();
      vi.advanceTimersByTime(151);
      x = 30;
      y = 40;
      window.dispatchEvent(new Event('scroll', { cancelable: true }));

      expect(scrollTo).not.toHaveBeenCalled();
      expect([x, y]).toEqual([30, 40]);
    } finally {
      scrollTo.mockRestore();
      vi.useRealTimers();
      if (originalX) Object.defineProperty(window, 'scrollX', originalX);
      else delete (window as unknown as { scrollX?: number }).scrollX;
      if (originalY) Object.defineProperty(window, 'scrollY', originalY);
      else delete (window as unknown as { scrollY?: number }).scrollY;
    }
  });

  it('replaces the expiry timer and clears listener, timer, and lock state on unmount', () => {
    const originalX = Object.getOwnPropertyDescriptor(window, 'scrollX');
    const originalY = Object.getOwnPropertyDescriptor(window, 'scrollY');
    let x = 10;
    let y = 20;
    vi.useFakeTimers();
    Object.defineProperty(window, 'scrollX', { configurable: true, get: () => x });
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation((left, top) => {
      x = Number(left);
      y = Number(top);
    });
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const addEventListener = vi.spyOn(window, 'addEventListener');
    const removeEventListener = vi.spyOn(window, 'removeEventListener');

    try {
      const view = renderEditor(element());
      const editor = screen.getByTestId('overlay-text-editor');
      const scrollable = screen.getByTestId('overlay-text-editor-box');
      Object.defineProperties(scrollable, {
        scrollHeight: { configurable: true, value: 100 },
        clientHeight: { configurable: true, value: 10 },
      });
      scrollable.scrollLeft = 5;
      scrollable.scrollTop = 6;
      vi.clearAllTimers();

      fireEvent.input(editor);
      expect(vi.getTimerCount()).toBe(1);
      const firstLockTimer = setTimeoutSpy.mock.results.at(-1)?.value;
      vi.advanceTimersByTime(100);
      fireEvent.input(editor);
      expect(vi.getTimerCount()).toBe(1);
      expect(clearTimeoutSpy).toHaveBeenCalledWith(firstLockTimer);
      const replacementLockTimer = setTimeoutSpy.mock.results.at(-1)?.value;
      vi.advanceTimersByTime(51);

      scrollable.scrollLeft = 50;
      scrollable.scrollTop = 60;
      scrollable.dispatchEvent(new Event('scroll', { cancelable: true }));
      x = 30;
      y = 40;
      window.dispatchEvent(new Event('scroll', { cancelable: true }));
      expect([scrollable.scrollLeft, scrollable.scrollTop]).toEqual([5, 6]);
      expect([x, y]).toEqual([10, 20]);

      const scrollListener = (
        addEventListener.mock.calls.find(([type]) => type === 'scroll')?.[1]
      ) as EventListener | undefined;
      expect(scrollListener).toBeTypeOf('function');
      view.unmount();

      scrollTo.mockClear();
      scrollable.scrollLeft = 70;
      scrollable.scrollTop = 80;
      const elementEvent = new Event('scroll', { cancelable: true });
      Object.defineProperty(elementEvent, 'target', { configurable: true, value: scrollable });
      scrollListener?.call(window, elementEvent);
      x = 90;
      y = 100;
      scrollListener?.call(window, new Event('scroll', { cancelable: true }));

      expect.soft([scrollable.scrollLeft, scrollable.scrollTop]).toEqual([70, 80]);
      expect.soft([x, y]).toEqual([90, 100]);
      expect.soft(scrollTo).not.toHaveBeenCalled();
      expect.soft(clearTimeoutSpy).toHaveBeenCalledWith(replacementLockTimer);
      expect.soft(vi.getTimerCount()).toBeLessThanOrEqual(1);
      expect.soft(removeEventListener).toHaveBeenCalledWith(
        'scroll',
        scrollListener,
        { capture: true },
      );
    } finally {
      vi.clearAllTimers();
      removeEventListener.mockRestore();
      addEventListener.mockRestore();
      clearTimeoutSpy.mockRestore();
      setTimeoutSpy.mockRestore();
      scrollTo.mockRestore();
      vi.useRealTimers();
      if (originalX) Object.defineProperty(window, 'scrollX', originalX);
      else delete (window as unknown as { scrollX?: number }).scrollX;
      if (originalY) Object.defineProperty(window, 'scrollY', originalY);
      else delete (window as unknown as { scrollY?: number }).scrollY;
    }
  });
});
