import React, { useEffect, useRef } from 'react';

export interface UnsavedNavigationDialogProps {
  onStay: () => void;
  onLeave: () => void;
}

export function UnsavedNavigationDialog({
  onStay,
  onLeave,
}: UnsavedNavigationDialogProps) {
  const stayRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    stayRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-navigation-title"
        aria-describedby="unsaved-navigation-description"
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onStay();
          }
        }}
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
            className="rounded-md px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            Leave editor
          </button>
          <button
            ref={stayRef}
            type="button"
            onClick={onStay}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Stay
          </button>
        </div>
      </div>
    </div>
  );
}
