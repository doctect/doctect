import React, { useLayoutEffect, useRef } from 'react';

export interface UnsavedNavigationDialogProps {
  backgroundRef: React.RefObject<HTMLElement | null>;
  onStay: () => void;
  onLeave: () => void;
}

export function UnsavedNavigationDialog({
  backgroundRef,
  onStay,
  onLeave,
}: UnsavedNavigationDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const stayRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const background = backgroundRef.current;
    const wasInert = background?.hasAttribute('inert') ?? false;
    const previousAriaHidden = background?.getAttribute('aria-hidden');
    background?.setAttribute('inert', '');
    background?.setAttribute('aria-hidden', 'true');
    stayRef.current?.focus();
    return () => {
      if (!wasInert) background?.removeAttribute('inert');
      if (previousAriaHidden == null) background?.removeAttribute('aria-hidden');
      else background?.setAttribute('aria-hidden', previousAriaHidden);
      if (!previousFocus?.isConnected) return;
      previousFocus.focus();
      queueMicrotask(() => {
        if (previousFocus.isConnected && document.activeElement === document.body) {
          previousFocus.focus();
        }
      });
    };
  }, [backgroundRef]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onStay();
      return;
    }
    if (event.key !== 'Tab') return;
    const buttons = Array.from(
      dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [],
    );
    if (buttons.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && (document.activeElement === first
      || !dialogRef.current?.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last
      || !dialogRef.current?.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-4">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-navigation-title"
        aria-describedby="unsaved-navigation-description"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl outline-none"
      >
        <h2 id="unsaved-navigation-title" className="text-lg font-bold text-slate-900">
          Leave editor?
        </h2>
        <p id="unsaved-navigation-description" className="mt-2 text-sm leading-6 text-slate-600">
          Changes are still saving or are not saved. Leaving now may lose them.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onLeave}
            className="min-h-11 rounded-md px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            Leave editor
          </button>
          <button
            ref={stayRef}
            type="button"
            onClick={onStay}
            className="min-h-11 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Stay
          </button>
        </div>
      </div>
    </div>
  );
}
