import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SavePresetModal } from '../../components/SavePresetModal';

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

const fillForm = () => {
  fireEvent.change(screen.getByLabelText('Preset Name'), { target: { value: 'My Preset' } });
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Reusable layout' } });
};

describe('SavePresetModal', () => {
  it('locks the form and keeps it open until durable save succeeds', async () => {
    const pending = deferred<boolean>();
    const onSave = vi.fn(() => pending.promise);
    const onClose = vi.fn();
    render(
      <SavePresetModal isOpen onClose={onClose} onSave={onSave} defaultTitle="Original" />,
    );
    fillForm();

    fireEvent.click(screen.getByRole('button', { name: 'Save Preset' }));

    const saving = screen.getByRole('button', { name: 'Saving…' });
    expect(screen.getByRole('dialog', { name: 'Save As Preset' })).toHaveAttribute('aria-busy', 'true');
    expect(saving).toBeDisabled();
    expect(screen.getByLabelText('Preset Name')).toBeDisabled();
    expect(screen.getByLabelText('Description')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close save preset' })).toBeDisabled();
    fireEvent.click(saving);
    expect(onSave).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve(true);
      await pending.promise;
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenCalledWith('My Preset', 'Reusable layout');
  });

  it.each([
    ['false result', () => Promise.resolve(false)],
    ['rejection', () => Promise.reject(new Error('write failed'))],
  ])('retains entered values and restores usable focus after a %s', async (_case, save) => {
    const onClose = vi.fn();
    render(
      <SavePresetModal isOpen onClose={onClose} onSave={save} defaultTitle="Original" />,
    );
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Save Preset' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Preset was not saved. Try again or download the project as JSON.',
    );
    expect(screen.getByLabelText('Preset Name')).toHaveValue('My Preset');
    expect(screen.getByLabelText('Description')).toHaveValue('Reusable layout');
    expect(screen.getByLabelText('Preset Name')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Save Preset' })).toBeEnabled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('clears prior form state when reopened', () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Reopen</button>
          <SavePresetModal
            isOpen={open}
            onClose={() => setOpen(false)}
            onSave={async () => false}
            defaultTitle="Fresh title"
          />
        </>
      );
    }

    render(<Harness />);
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));

    expect(screen.getByLabelText('Preset Name')).toHaveValue('Fresh title');
    expect(screen.getByLabelText('Description')).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
