import { Database, LoaderCircle } from 'lucide-react';
import type { WorkspaceBootstrapPhase } from '../../services/localWorkspace/index';

export const PHASE_LABELS: Record<WorkspaceBootstrapPhase, string> = {
  'opening-local-storage': 'Opening local storage',
  'checking-existing-projects': 'Checking existing projects',
  'copying-projects': 'Copying projects',
  'verifying-projects': 'Verifying projects',
  'finishing-upgrade': 'Finishing upgrade',
};

interface WorkspaceBootstrapScreenProps {
  phase: WorkspaceBootstrapPhase;
}

export function WorkspaceBootstrapScreen({ phase }: WorkspaceBootstrapScreenProps) {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 text-slate-900 sm:px-6"
      aria-labelledby="workspace-bootstrap-heading"
    >
      <section className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.45)] sm:p-8">
        <div className="mb-5 flex size-12 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
          <Database className="size-6" aria-hidden="true" />
        </div>
        <h1
          id="workspace-bootstrap-heading"
          className="text-2xl font-bold tracking-tight text-slate-900"
        >
          Preparing your local projects
        </h1>
        <p className="mt-3 max-w-[68ch] text-sm leading-6 text-slate-600 sm:text-base">
          Keep this tab open. Existing projects remain untouched until verification finishes.
        </p>
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="mt-7 flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800"
        >
          <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
          <span>{PHASE_LABELS[phase]}</span>
        </div>
      </section>
    </main>
  );
}
