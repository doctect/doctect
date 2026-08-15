import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BookOpen, Calendar, FilePlus, Star, Trash2, X } from 'lucide-react';
import type { WorkspaceCustomPreset } from '../services/localWorkspace';
import type { PresetDefinition, ProjectPreset } from '../services/presets';

export interface NewProjectModalProps {
  isOpen: boolean;
  customPresets: readonly WorkspaceCustomPreset[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSelectPreset: (presetId: ProjectPreset) => Promise<void>;
  onDeleteCustomPreset: (presetId: string) => Promise<void>;
}

const defaultPresets: readonly PresetDefinition[] = [
  {
    id: 'blank',
    title: 'Blank Project',
    desc: 'Start fresh with a single A4 page. Perfect for creating custom layouts from scratch.',
    icon: FilePlus,
    color: 'text-slate-500',
  },
  {
    id: 'notebook',
    title: 'Simple Notebook',
    desc: 'A structured digital notebook with a cover, subject dividers, and lined/grid pages.',
    icon: BookOpen,
    color: 'text-indigo-500',
  },
  {
    id: 'planner_2026',
    title: '2026 Planner',
    desc: 'A complex, hyperlinked planner with Year, Month, Week, Day, and Tracker views.',
    icon: Calendar,
    color: 'text-blue-500',
  },
];

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  isOpen,
  customPresets,
  busy,
  error,
  onClose,
  onSelectPreset,
  onDeleteCustomPreset,
}) => {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectingId, setSelectingId] = useState<ProjectPreset | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef(false);
  const interactionBusy = busy || deleting || selectingId !== null;
  const deletePreset = deleteId
    ? customPresets.find(preset => preset.id === deleteId)
    : undefined;

  useEffect(() => {
    if (!isOpen) return;
    actionRef.current = false;
    setDeleteId(null);
    setDeleting(false);
    setSelectingId(null);
  }, [isOpen]);

  useEffect(() => {
    if (deleteId && !customPresets.some(preset => preset.id === deleteId)) {
      setDeleteId(null);
    }
  }, [customPresets, deleteId]);

  useLayoutEffect(() => {
    if (!isOpen) return undefined;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    dialogRef.current?.focus();
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen]);

  useLayoutEffect(() => {
    if (deleteId) deleteDialogRef.current?.focus();
  }, [deleteId]);

  if (!isOpen) return null;

  const close = () => {
    if (interactionBusy || actionRef.current) return;
    onClose();
  };

  const selectPreset = async (presetId: ProjectPreset) => {
    if (interactionBusy || actionRef.current) return;
    dialogRef.current?.focus();
    actionRef.current = true;
    setSelectingId(presetId);
    try {
      await onSelectPreset(presetId);
    } finally {
      actionRef.current = false;
      setSelectingId(null);
    }
  };

  const requestDelete = (event: React.MouseEvent, presetId: string) => {
    event.stopPropagation();
    if (interactionBusy || actionRef.current) return;
    setDeleteId(presetId);
  };

  const cancelDelete = () => {
    if (interactionBusy || actionRef.current) return;
    setDeleteId(null);
  };

  const confirmDelete = async () => {
    if (!deleteId || interactionBusy || actionRef.current) return;
    deleteDialogRef.current?.focus();
    actionRef.current = true;
    setDeleting(true);
    try {
      await onDeleteCustomPreset(deleteId);
    } catch {
      // Parent owns durable error copy; controlled card remains available for retry.
    } finally {
      actionRef.current = false;
      setDeleting(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key !== 'Escape') return;
    event.preventDefault();
    if (interactionBusy || actionRef.current) return;
    if (deleteId) setDeleteId(null);
    else onClose();
  };

  const renderPresetCard = (preset: PresetDefinition) => {
    const Icon = preset.icon || Star;
    return (
      <div
        key={preset.id}
        className="group relative overflow-hidden rounded-xl border bg-white transition-all hover:border-blue-400 hover:bg-blue-50/50 hover:shadow-md"
      >
        <button
          type="button"
          disabled={interactionBusy}
          onClick={() => { void selectPreset(preset.id); }}
          className="flex h-full w-full cursor-pointer flex-col items-center rounded-xl p-6 text-center outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-inset disabled:cursor-wait disabled:opacity-60"
        >
          <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 transition-all group-hover:scale-110 group-hover:bg-white ${preset.color || 'text-slate-500'}`}>
            <Icon size={24} />
          </div>
          <h3 className="mb-2 w-full truncate font-bold text-slate-800">{preset.title}</h3>
          <p className="line-clamp-3 text-xs leading-relaxed text-slate-500">{preset.desc}</p>
        </button>

        {preset.isCustom && (
          <button
            type="button"
            disabled={interactionBusy}
            onClick={event => requestDelete(event, String(preset.id))}
            className="absolute right-2 top-2 z-10 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-transparent p-2 text-slate-400 opacity-0 shadow-sm transition-all hover:border-red-100 hover:bg-red-50 hover:text-red-600 focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 group-hover:opacity-100 disabled:cursor-wait disabled:opacity-50"
            title={`Delete ${preset.title}`}
            aria-label={`Delete ${preset.title}`}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    );
  };

  const customCards: PresetDefinition[] = customPresets.map(preset => ({
    ...preset,
    icon: Star,
    color: 'text-amber-500',
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
        aria-busy={interactionBusy || undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl outline-none animate-in fade-in zoom-in duration-200"
      >
        {deleteId && (
          <div
            ref={deleteDialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-preset-title"
            aria-describedby="delete-preset-description"
            tabIndex={-1}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto bg-white/95 p-6 text-center outline-none backdrop-blur-sm animate-in fade-in duration-200"
          >
            <div className="mb-4 rounded-full bg-red-100 p-4 text-red-600 shadow-sm">
              <Trash2 size={32} />
            </div>
            <h3 id="delete-preset-title" className="mb-2 text-xl font-bold text-slate-800">Delete Preset?</h3>
            <p id="delete-preset-description" className="mb-8 max-w-xs text-slate-500 leading-relaxed">
              Are you sure you want to delete <span className="font-semibold text-slate-700">"{deletePreset?.title}"</span>? This action cannot be undone.
            </p>
            {error && (
              <p role="alert" className="mb-5 max-w-md text-sm font-medium text-red-700">
                {error}
              </p>
            )}
            <div className="flex gap-4">
              <button
                type="button"
                disabled={interactionBusy}
                onClick={cancelDelete}
                className="min-h-11 rounded-lg border border-transparent px-6 py-2.5 font-medium text-slate-600 transition-colors hover:border-slate-200 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 disabled:cursor-wait disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={interactionBusy}
                onClick={() => { void confirmDelete(); }}
                className="min-h-11 rounded-lg bg-red-600 px-6 py-2.5 font-medium text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-red-700 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
                aria-live="polite"
              >
                {deleting || busy ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        )}

        <div
          aria-hidden={deleteId ? true : undefined}
          inert={Boolean(deleteId)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex flex-shrink-0 items-center justify-between border-b p-6">
            <div>
              <h2 id="new-project-title" className="text-xl font-bold text-slate-800">Create New Project</h2>
              <p className="text-sm text-slate-500">Select a template to get started</p>
            </div>
            <button
              type="button"
              disabled={interactionBusy}
              onClick={close}
              aria-label="Close new project"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-wait disabled:opacity-50"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {!deleteId && error && (
            <div role="alert" className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm font-medium text-red-800">
              {error}
            </div>
          )}

          <div className="min-h-0 overflow-y-auto p-6">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-400">Standard Presets</h3>
            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              {defaultPresets.map(renderPresetCard)}
            </div>

            {customCards.length > 0 && (
              <>
                <h3 className="mb-4 border-t pt-6 text-xs font-bold uppercase tracking-wider text-slate-400">My Saved Presets</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                  {customCards.map(renderPresetCard)}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
