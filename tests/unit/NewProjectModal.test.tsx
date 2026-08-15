import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NewProjectModal } from '../../components/NewProjectModal';
import { createBlankProject } from '../../services/presets';
import type { WorkspaceCustomPreset } from '../../services/localWorkspace';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const customPreset = (id: string, title: string): WorkspaceCustomPreset => ({
  id,
  title,
  desc: `${title} description`,
  isCustom: true,
  initialState: createBlankProject(),
});

const defaultProps = {
  isOpen: true,
  busy: false,
  error: null,
  onClose: vi.fn(),
  onSelectPreset: vi.fn(async () => undefined),
  onDeleteCustomPreset: vi.fn(async () => undefined),
};

describe('NewProjectModal', () => {
  it('renders custom preset cards in verified snapshot order', () => {
    render(
      <NewProjectModal
        {...defaultProps}
        customPresets={[
          customPreset('custom-second', 'Second Saved Preset'),
          customPreset('custom-first', 'First Saved Preset'),
        ]}
      />,
    );

    const customHeadings = screen.getAllByRole('heading', { level: 3 })
      .map(heading => heading.textContent)
      .filter(text => text?.endsWith('Saved Preset'));
    expect(customHeadings).toEqual(['Second Saved Preset', 'First Saved Preset']);
  });

  it('keeps a preset card and locks deletion until the durable delete resolves', async () => {
    const pending = deferred<void>();
    const onDelete = vi.fn(async (_presetId: string) => pending.promise);

    function Harness() {
      const [presets, setPresets] = useState([customPreset('custom-1', 'My Custom Preset')]);
      return (
        <NewProjectModal
          {...defaultProps}
          customPresets={presets}
          onDeleteCustomPreset={async presetId => {
            await onDelete(presetId);
            setPresets(current => current.filter(preset => preset.id !== presetId));
          }}
        />
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete My Custom Preset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, Delete' }));

    expect(screen.getByText('My Custom Preset', { selector: 'h3' })).toBeInTheDocument();
    expect(screen.getByRole('alertdialog', { name: 'Delete Preset?' })).toHaveFocus();
    const deleting = screen.getByRole('button', { name: 'Deleting…' });
    expect(deleting).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.click(deleting);
    expect(onDelete).toHaveBeenCalledOnce();

    await act(async () => {
      pending.resolve(undefined);
      await pending.promise;
    });
    await waitFor(() => {
      expect(screen.queryByText('My Custom Preset', { selector: 'h3' })).not.toBeInTheDocument();
    });
  });

  it('ignores same-tick Cancel after deletion starts but before pending state renders', async () => {
    const pending = deferred<void>();
    let cancel!: HTMLButtonElement;
    const onDeleteCustomPreset = vi.fn((_presetId: string) => {
      cancel.click();
      return pending.promise;
    });
    render(
      <NewProjectModal
        {...defaultProps}
        customPresets={[customPreset('custom-1', 'My Custom Preset')]}
        onDeleteCustomPreset={onDeleteCustomPreset}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete My Custom Preset' }));
    cancel = screen.getByRole('button', { name: 'Cancel' });

    fireEvent.click(screen.getByRole('button', { name: 'Yes, Delete' }));

    expect(onDeleteCustomPreset).toHaveBeenCalledOnce();
    expect(screen.getByRole('alertdialog', { name: 'Delete Preset?' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();

    await act(async () => {
      pending.resolve(undefined);
      await pending.promise;
    });
  });

  it('retains the card and delete confirmation after durable failure', async () => {
    const onDelete = vi.fn(async (_presetId: string) => {
      throw new Error('write failed');
    });

    function Harness() {
      const [error, setError] = useState<string | null>(null);
      return (
        <NewProjectModal
          {...defaultProps}
          customPresets={[customPreset('custom-1', 'My Custom Preset')]}
          error={error}
          onDeleteCustomPreset={async presetId => {
            try {
              await onDelete(presetId);
            } catch (failure) {
              setError('Preset was not deleted. Nothing was changed.');
              throw failure;
            }
          }}
        />
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete My Custom Preset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, Delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Preset was not deleted. Nothing was changed.',
    );
    expect(screen.getByText('My Custom Preset', { selector: 'h3' })).toBeInTheDocument();
    expect(screen.getByRole('alertdialog', { name: 'Delete Preset?' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Yes, Delete' })).toBeEnabled();
  });

  it('blocks selection, deletion, and dismissal while a preset command is busy', () => {
    const onClose = vi.fn();
    const onSelectPreset = vi.fn(async () => undefined);
    const onDeleteCustomPreset = vi.fn(async () => undefined);
    render(
      <NewProjectModal
        isOpen
        customPresets={[customPreset('custom-1', 'My Custom Preset')]}
        busy
        error={null}
        onClose={onClose}
        onSelectPreset={onSelectPreset}
        onDeleteCustomPreset={onDeleteCustomPreset}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Create New Project' })).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Blank Project/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete My Custom Preset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close new project' }));

    expect(onSelectPreset).not.toHaveBeenCalled();
    expect(onDeleteCustomPreset).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('contains editor shortcut keys while preserving local Escape and normal Tab behavior', () => {
    const onParentKeyDown = vi.fn();
    const onClose = vi.fn();
    render(
      <div onKeyDown={onParentKeyDown}>
        <NewProjectModal
          {...defaultProps}
          customPresets={[]}
          onClose={onClose}
        />
      </div>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Create New Project' });

    fireEvent.keyDown(dialog, { key: 'Delete' });
    fireEvent.keyDown(dialog, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(dialog, { key: 'd', ctrlKey: true });
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    expect(fireEvent.keyDown(dialog, { key: 'Tab' })).toBe(true);

    expect(onParentKeyDown).not.toHaveBeenCalled();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    expect(onParentKeyDown).not.toHaveBeenCalled();
  });
});
