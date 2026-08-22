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
import {
  INDEXED_DB_UPGRADE_BLOCKED_MESSAGE,
  type RecoverySource,
  type WorkspaceBootstrapResult,
} from '../../services/localWorkspace/index';
import {
  OPEN_WORKSPACE_PRESENTATION,
  PROJECT_COPY_HELPER_TEXT,
  RECOVERY_SOURCE_PRESENTATION,
} from './recoverySourcePresentation';

export type WorkspaceBlockingResult = Extract<
  WorkspaceBootstrapResult,
  { status: 'recovery' | 'unavailable' }
>;

export interface WorkspaceRecoveryScreenProps {
  result: WorkspaceBlockingResult;
  onRetry?: () => void;
  onExportOpenWorkspace?: () => void;
  onExport: (source: RecoverySource) => void;
  onRecoverAsCopies?: () => void;
  activeExport?: RecoverySource | null;
  isRecovering?: boolean;
  actionError?: string | null;
}

const downloadButtonClassName = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60';

export function WorkspaceRecoveryScreen({
  result,
  onRetry,
  onExportOpenWorkspace,
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
  const blockedUpgrade = result.status === 'unavailable'
    && result.message === INDEXED_DB_UPGRADE_BLOCKED_MESSAGE;
  const heading = result.status === 'unavailable'
    ? 'Doctect can’t open your saved projects'
    : splitBrain
      ? 'We found two different saved project sets'
      : 'We couldn’t finish preparing your projects';
  const supportingCopy = result.status === 'unavailable'
    ? blockedUpgrade
      ? 'Close other Doctect tabs, then reload this page.'
      : 'Local project storage could not be opened. No saved project data was changed.'
    : splitBrain
      ? 'Another tab or an older Doctect version may have saved different changes. Nothing was overwritten.'
      : 'Editor stayed closed to protect your work. Your saved projects were not replaced or deleted.';
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
        aria-hidden={confirmationOpen ? true : undefined}
        inert={confirmationOpen ? true : undefined}
        className="w-full max-w-2xl rounded-xl border border-red-200 bg-white p-6 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.45)] sm:p-8"
      >
        <div role="alert" aria-live="assertive">
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
          {actionError && (
            <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
              {actionError}
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
              Try again
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
                ? (
                    <LoaderCircle
                      className="size-4 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  )
                : <DatabaseBackup className="size-4" aria-hidden="true" />}
              {isRecovering
                ? 'Adding separate copies'
                : 'Add changed projects without replacing anything'}
            </button>
          )}
        </div>

        <div className="mt-7 border-t border-slate-200 pt-6">
          <h2 className="text-base font-semibold text-slate-900">Save project copies</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{PROJECT_COPY_HELPER_TEXT}</p>
          {onExportOpenWorkspace || availableExports.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {onExportOpenWorkspace && (
                <article className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <h3 className="font-semibold text-slate-900">
                    {OPEN_WORKSPACE_PRESENTATION.title}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {OPEN_WORKSPACE_PRESENTATION.explanation}
                  </p>
                  <button
                    type="button"
                    onClick={onExportOpenWorkspace}
                    disabled={busy}
                    className={`${downloadButtonClassName} mt-3`}
                  >
                    <Download className="size-4" aria-hidden="true" />
                    {OPEN_WORKSPACE_PRESENTATION.actionLabel}
                  </button>
                </article>
              )}
              {availableExports.map(source => {
                const presentation = RECOVERY_SOURCE_PRESENTATION[source];
                const downloading = activeExport === source;
                return (
                  <article
                    key={source}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                  >
                    <h3 className="font-semibold text-slate-900">{presentation.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {presentation.explanation}
                    </p>
                    <button
                      type="button"
                      onClick={() => onExport(source)}
                      disabled={busy}
                      className={`${downloadButtonClassName} mt-3`}
                    >
                      {downloading
                        ? (
                            <LoaderCircle
                              className="size-4 animate-spin motion-reduce:animate-none"
                              aria-hidden="true"
                            />
                          )
                        : <Download className="size-4" aria-hidden="true" />}
                      {downloading ? 'Preparing project file' : presentation.actionLabel}
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-sm leading-6 text-slate-600">
              No project copies are available to save right now.
            </p>
          )}
        </div>
        <details className="mt-6 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700">
          <summary className="min-h-11 cursor-pointer font-semibold text-slate-900">
            Technical details
          </summary>
          <p className="mt-2 leading-6">{technicalMessage}</p>
        </details>
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
                  Add changed projects as separate copies?
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
                className="-mr-2 -mt-2 inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
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
                Add separate copies
              </button>
            </div>
          </dialog>
        </div>
      )}
    </main>
  );
}
