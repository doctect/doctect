import { ArrowRight, CheckCircle2, Download, LoaderCircle } from 'lucide-react';
import type { MigrationReceipt as MigrationReceiptValue } from '../../services/localWorkspace/index';
import { RECOVERY_SOURCE_PRESENTATION } from './recoverySourcePresentation';

export interface MigrationReceiptProps {
  receipt: MigrationReceiptValue;
  onContinue: () => void;
  onDownloadOriginal: () => void;
  isDownloading?: boolean;
  downloadError?: string | null;
}

const countLabel = (count: number, singular: string, plural: string): string =>
  `${count} ${count === 1 ? singular : plural}`;

export function MigrationReceipt({
  receipt,
  onContinue,
  onDownloadOriginal,
  isDownloading = false,
  downloadError,
}: MigrationReceiptProps) {
  const originalProjects = RECOVERY_SOURCE_PRESENTATION['legacy-original'];

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 text-slate-900 sm:px-6"
      aria-labelledby="migration-receipt-heading"
    >
      <section className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.45)] sm:p-8">
        <div
          role="status"
          aria-live="polite"
          className="mb-5 flex size-12 items-center justify-center rounded-lg bg-green-50 text-green-700"
        >
          <CheckCircle2 className="size-6" aria-hidden="true" />
          <span className="sr-only">Upgrade complete</span>
        </div>
        <h1
          id="migration-receipt-heading"
          className="text-2xl font-bold tracking-tight text-slate-900"
        >
          Your projects are ready
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
          Doctect moved and checked your local projects.
        </p>

        <ul className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm text-slate-700">
          <li className="flex items-center justify-between gap-4 py-3">
            <span>Projects copied</span>
            <strong className="font-semibold text-slate-900">
              {countLabel(receipt.projectCount, 'project', 'projects')}
            </strong>
          </li>
          <li className="flex items-center justify-between gap-4 py-3">
            <span>Saved presets copied</span>
            <strong className="font-semibold text-slate-900">
              {countLabel(receipt.customPresetCount, 'custom preset', 'custom presets')}
            </strong>
          </li>
          <li className="py-3 font-medium text-slate-900">
            {receipt.pendingImportPreserved
              ? 'Pending import preserved'
              : 'No pending import was waiting'}
          </li>
        </ul>

        <p className="mt-5 max-w-[68ch] text-sm leading-6 text-slate-600">
          Doctect kept the previous saved project data unchanged in case recovery is needed.
        </p>
        {downloadError && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {downloadError}
          </p>
        )}

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onDownloadOriginal}
            disabled={isDownloading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
          >
            {isDownloading
              ? (
                  <LoaderCircle
                    className="size-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                )
              : <Download className="size-4" aria-hidden="true" />}
            {isDownloading ? 'Preparing project file' : originalProjects.actionLabel}
          </button>
          <button
            type="button"
            onClick={onContinue}
            disabled={isDownloading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_18px_-12px_rgba(37,99,235,0.9)] transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
          >
            Continue to editor
            <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </section>
    </main>
  );
}
