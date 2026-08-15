import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  AlertTriangle,
  DatabaseBackup,
  Download,
  LoaderCircle,
  RefreshCw,
  X,
} from 'lucide-react';
import type {
  RecoverySource,
  WorkspaceBootstrapResult,
} from '../../services/localWorkspace/index';

export type WorkspaceBlockingResult = Extract<
  WorkspaceBootstrapResult,
  { status: 'recovery' | 'unavailable' }
>;

export interface WorkspaceRecoveryScreenProps {
  result: WorkspaceBlockingResult;
  onRetry?: () => void;
  onExport: (source: RecoverySource) => void;
  onRecoverAsCopies?: () => void;
  activeExport?: RecoverySource | null;
  isRecovering?: boolean;
  actionError?: string | null;
}

const EXPORT_LABELS: Record<RecoverySource, string> = {
  'legacy-current': 'Download current browser copy',
  'legacy-original': 'Download original backup',
  'indexeddb-workspace': 'Download editor copy',
};

export function WorkspaceRecoveryScreen({
  result,
  onRetry,
  onExport,
  onRecoverAsCopies,
  activeExport = null,
  isRecovering = false,
  actionError,
}: WorkspaceRecoveryScreenProps) {
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const dialogHeadingId = useId();
  const dialogCopyId = useId();
  const recoverTriggerRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef(false);
  const recovery = result.status === 'recovery' ? result.recovery : undefined;
  const splitBrain = recovery?.kind === 'split-brain';
  const initialFailure = recovery !== undefined && !splitBrain;
  const heading = result.status === 'unavailable'
    ? 'Local project storage is unavailable'
    : splitBrain
      ? 'Project copies changed in another tab'
      : "We couldn't upgrade local projects";
  const supportingCopy = result.status === 'unavailable'
    ? 'The editor cannot open safely. No existing project data was changed.'
    : splitBrain
      ? 'Nothing was overwritten. Download either copy before choosing how to continue.'
      : 'Your existing projects remain untouched. The upgrade did not finish, and the editor did not create replacement data.';
  const technicalMessage = result.status === 'recovery'
    ? result.recovery.message
    : result.message;
  const availableExports = result.status === 'recovery'
    ? result.recovery.availableExports
    : result.availableExports;
  const busy = activeExport !== null || isRecovering;

  useEffect(() => {
    if (confirmationOpen) {
      returnFocusRef.current = true;
      confirmButtonRef.current?.focus();
    } else if (returnFocusRef.current && !isRecovering) {
      returnFocusRef.current = false;
      recoverTriggerRef.current?.focus();
    }
  }, [confirmationOpen, isRecovering]);

  const closeConfirmation = () => setConfirmationOpen(false);
  const confirmRecovery = () => {
    setConfirmationOpen(false);
    onRecoverAsCopies?.();
  };
  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeConfirmation();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])'),
    );
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const focusOutside = !event.currentTarget.contains(document.activeElement);
    if (event.shiftKey && (document.activeElement === first || focusOutside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || focusOutside)) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 text-slate-900 sm:px-6"
      aria-labelledby="workspace-recovery-heading"
    >
      <section
        role="alert"
        aria-live="assertive"
        className="w-full max-w-2xl rounded-xl border border-red-200 bg-white p-6 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.45)] sm:p-8"
      >
        <div className="mb-5 flex size-12 items-center justify-center rounded-lg bg-red-50 text-red-700">
          <AlertTriangle className="size-6" aria-hidden="true" />
        </div>
        <h1
          id="workspace-recovery-heading"
          className="text-2xl font-bold tracking-tight text-slate-900"
        >
          {heading}
        </h1>
        <p className="mt-3 max-w-[68ch] text-sm leading-6 text-slate-700 sm:text-base">
          {supportingCopy}
        </p>
        <p className="mt-4 rounded-lg bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-700">
          <span className="font-semibold text-slate-900">Storage detail:</span>{' '}
          {technicalMessage}
        </p>
        {actionError && (
          <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {actionError}
          </p>
        )}

        <div className="mt-7 border-t border-slate-200 pt-6">
          <h2 className="text-base font-semibold text-slate-900">Recovery downloads</h2>
          {availableExports.length > 0 ? (
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {availableExports.map(source => {
                const label = initialFailure && source === 'legacy-current'
                  ? 'Download backup'
                  : EXPORT_LABELS[source];
                const downloading = activeExport === source;
                return (
                  <button
                    key={source}
                    type="button"
                    onClick={() => onExport(source)}
                    disabled={busy}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
                  >
                    {downloading
                      ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                      : <Download className="size-4" aria-hidden="true" />}
                    {downloading ? 'Preparing download' : label}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-sm leading-6 text-slate-600">
              No recovery downloads are currently available.
            </p>
          )}
        </div>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-end">
          {recovery?.canRetry && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={busy}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Retry
            </button>
          )}
          {recovery?.canRecoverLegacyAsCopies && onRecoverAsCopies && (
            <button
              ref={recoverTriggerRef}
              type="button"
              onClick={() => setConfirmationOpen(true)}
              disabled={busy}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_18px_-12px_rgba(37,99,235,0.9)] transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
            >
              {isRecovering
                ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                : <DatabaseBackup className="size-4" aria-hidden="true" />}
              {isRecovering ? 'Recovering copies' : 'Recover changed projects as copies'}
            </button>
          )}
        </div>
      </section>

      {confirmationOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <dialog
            open
            aria-labelledby={dialogHeadingId}
            aria-describedby={dialogCopyId}
            aria-modal="true"
            onKeyDown={handleDialogKeyDown}
            className="m-0 w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-[0_24px_65px_-24px_rgba(15,23,42,0.6)] sm:p-7"
          >
            <div className="flex items-start justify-between gap-5">
              <div>
                <h2 id={dialogHeadingId} className="text-xl font-bold tracking-tight text-slate-900">
                  Recover changed projects as copies?
                </h2>
                <p id={dialogCopyId} className="mt-3 text-sm leading-6 text-slate-600">
                  Changed projects, presets, and pending imports will be added as local working
                  copies. Cloud links are removed from working copies. Existing data remains
                  unchanged.
                </p>
              </div>
              <button
                type="button"
                onClick={closeConfirmation}
                className="-mr-2 -mt-2 inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                aria-label="Close recovery confirmation"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeConfirmation}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                Cancel
              </button>
              <button
                ref={confirmButtonRef}
                type="button"
                onClick={confirmRecovery}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_18px_-12px_rgba(37,99,235,0.9)] transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                <DatabaseBackup className="size-4" aria-hidden="true" />
                Recover as copies
              </button>
            </div>
          </dialog>
        </div>
      )}
    </main>
  );
}
