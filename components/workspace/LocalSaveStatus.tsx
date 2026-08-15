import React from 'react';
import { AlertTriangle, Check, Download, Loader2, RotateCw } from 'lucide-react';
import type { ProjectSaveState } from '../../hooks/useWorkspaceProjectWrites';

export interface LocalSaveStatusProps {
  state: ProjectSaveState;
  onRetry: () => void;
  onDownload: () => void;
}

export function LocalSaveStatus({
  state,
  onRetry,
  onDownload,
}: LocalSaveStatusProps) {
  if (state.status === 'saving') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700"
      >
        <Loader2
          size={13}
          aria-hidden="true"
          className="animate-spin motion-reduce:animate-none"
        />
        Saving locally…
      </div>
    );
  }

  if (state.status === 'saved') {
    return (
      <div
        role="status"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600"
      >
        <Check size={13} aria-hidden="true" />
        Saved locally
      </div>
    );
  }

  const conflict = state.status === 'conflict';
  return (
    <div role="alert" className="relative z-40 shrink-0">
      <div className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${conflict ? 'bg-amber-100 text-amber-900' : 'bg-red-100 text-red-800'}`}>
        <AlertTriangle size={13} aria-hidden="true" />
        {conflict ? 'Storage conflict' : 'Not saved'}
      </div>
      <div className={`absolute right-0 top-full mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border bg-white p-3 shadow-lg ${conflict ? 'border-amber-200' : 'border-red-200'}`}>
        <p className="text-xs leading-5 text-slate-700">
          {conflict
            ? 'Another save changed this project. Your open work was not overwritten.'
            : 'Your work remains open in this tab, but local storage failed.'}
        </p>
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          {!conflict && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-11 items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <RotateCw size={12} aria-hidden="true" />
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex min-h-11 items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <Download size={12} aria-hidden="true" />
            Download JSON
          </button>
        </div>
      </div>
    </div>
  );
}
