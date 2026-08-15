import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Save, X } from 'lucide-react';

interface SavePresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (title: string, description: string) => Promise<boolean>;
  defaultTitle?: string;
}

const SAVE_ERROR = 'Preset was not saved. Try again or download the project as JSON.';

export const SavePresetModal: React.FC<SavePresetModalProps> = ({
  isOpen,
  onClose,
  onSave,
  defaultTitle,
}) => {
  const [title, setTitle] = useState(defaultTitle || '');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const saveLockRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    saveLockRef.current = false;
    setTitle(defaultTitle || '');
    setDescription('');
    setSaving(false);
    setError(null);
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) return undefined;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    titleRef.current?.focus();
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen]);

  useLayoutEffect(() => {
    if (isOpen && error && !saving) titleRef.current?.focus();
  }, [error, isOpen, saving]);

  if (!isOpen) return null;

  const close = () => {
    if (saving || saveLockRef.current) return;
    onClose();
  };

  const savePreset = async () => {
    if (!title.trim() || saving || saveLockRef.current) return;
    dialogRef.current?.focus();
    saveLockRef.current = true;
    setSaving(true);
    setError(null);
    try {
      if (await onSave(title, description)) {
        saveLockRef.current = false;
        setSaving(false);
        onClose();
        return;
      }
    } catch {
      // Rejected durable writes use the same retained-form recovery state.
    }
    saveLockRef.current = false;
    setSaving(false);
    setError(SAVE_ERROR);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-preset-title"
        aria-busy={saving || undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="w-full max-w-md rounded-xl bg-white shadow-2xl outline-none animate-in fade-in zoom-in duration-200"
      >
        <div className="flex items-center justify-between border-b p-4">
          <h2 id="save-preset-title" className="flex items-center gap-2 text-lg font-bold text-slate-800">
            <Save size={18} className="text-amber-500" />
            Save As Preset
          </h2>
          <button
            type="button"
            disabled={saving}
            onClick={close}
            aria-label="Close save preset"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full p-1 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:cursor-wait disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        <form
          onSubmit={event => {
            event.preventDefault();
            void savePreset();
          }}
        >
          <div className="space-y-4 p-6">
            <div>
              <label htmlFor="preset-name" className="mb-1 block text-sm font-medium text-slate-700">Preset Name</label>
              <input
                ref={titleRef}
                id="preset-name"
                className="w-full rounded-lg border px-3 py-2 text-base outline-none focus:ring-2 focus:ring-amber-500 disabled:cursor-wait disabled:bg-slate-100 sm:text-sm"
                value={title}
                disabled={saving}
                aria-describedby={error ? 'save-preset-error' : undefined}
                onChange={event => {
                  setTitle(event.target.value);
                  setError(null);
                }}
                placeholder="My Custom Project"
              />
            </div>
            <div>
              <label htmlFor="preset-description" className="mb-1 block text-sm font-medium text-slate-700">Description</label>
              <textarea
                id="preset-description"
                className="h-24 w-full resize-none rounded-lg border px-3 py-2 text-base outline-none focus:ring-2 focus:ring-amber-500 disabled:cursor-wait disabled:bg-slate-100 sm:text-sm"
                value={description}
                disabled={saving}
                onChange={event => {
                  setDescription(event.target.value);
                  setError(null);
                }}
                placeholder="A short description of this template..."
              />
            </div>
            {error && (
              <p id="save-preset-error" role="alert" className="text-sm font-medium text-red-700">
                {error}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t bg-slate-50 p-4">
            <button
              type="button"
              disabled={saving}
              onClick={close}
              className="min-h-11 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 disabled:cursor-wait disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || saving}
              aria-live="polite"
              className="min-h-11 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Preset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
