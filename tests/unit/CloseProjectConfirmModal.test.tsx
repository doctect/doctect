import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloseProjectConfirmModal } from '../../components/CloseProjectConfirmModal';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
  reject(reason?: unknown): void;
}

const deferred = <T,>(): Deferred<T> => {
  let resolve!: Deferred<T>['resolve'];
  let reject!: Deferred<T>['reject'];
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
};

const renderModal = ({
  onClose = vi.fn(),
  onConfirmClose = vi.fn(() => Promise.resolve()),
  onSaveAndClose = vi.fn(() => Promise.resolve()),
}: {
  onClose?: () => void;
  onConfirmClose?: () => Promise<void>;
  onSaveAndClose?: () => Promise<void>;
} = {}) => render(
  <CloseProjectConfirmModal
    isOpen
    projectName="Pending Project"
    onClose={onClose}
    onConfirmClose={onConfirmClose}
    onSaveAndClose={onSaveAndClose}
  />,
);

afterEach(cleanup);

describe('CloseProjectConfirmModal', () => {
  it('admits one discard across same-tick pointer and keyboard-generated clicks', async () => {
    const pending = deferred<void>();
    const onConfirmClose = vi.fn(() => pending.promise);
    renderModal({ onConfirmClose });
    const discard = screen.getByRole('button', { name: 'Close without Saving' });

    act(() => {
      fireEvent.click(discard);
      fireEvent.click(discard);
      fireEvent.click(discard, { detail: 0 });
    });

    expect(onConfirmClose).not.toHaveBeenCalled();
    await act(async () => { await Promise.resolve(); });
    expect(onConfirmClose).toHaveBeenCalledOnce();
    expect(discard).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save JSON & Close' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    await act(async () => pending.resolve());
    expect(discard).toBeEnabled();
  });

  it('excludes mixed close actions and cancel while save is pending', async () => {
    const pending = deferred<void>();
    const onClose = vi.fn();
    const onConfirmClose = vi.fn(() => Promise.resolve());
    const onSaveAndClose = vi.fn(() => pending.promise);
    renderModal({ onClose, onConfirmClose, onSaveAndClose });
    const buttons = screen.getAllByRole('button');
    const titleClose = buttons[0];
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const discard = screen.getByRole('button', { name: 'Close without Saving' });
    const save = screen.getByRole('button', { name: 'Save JSON & Close' });

    act(() => {
      fireEvent.click(save);
      fireEvent.click(discard);
      fireEvent.click(save, { detail: 0 });
      fireEvent.click(cancel);
      fireEvent.click(titleClose);
    });

    expect(onSaveAndClose).not.toHaveBeenCalled();
    await act(async () => { await Promise.resolve(); });
    expect(onSaveAndClose).toHaveBeenCalledOnce();
    expect(onConfirmClose).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(titleClose).toBeDisabled();
    expect(cancel).toBeDisabled();
    expect(discard).toBeDisabled();
    expect(save).toBeDisabled();

    await act(async () => pending.resolve());
    expect(save).toBeEnabled();
  });

  it('releases the lock after rejection and preserves the modal for retry', async () => {
    const failed = deferred<void>();
    const onSaveAndClose = vi.fn()
      .mockReturnValueOnce(failed.promise)
      .mockResolvedValueOnce(undefined);
    renderModal({ onSaveAndClose });
    const save = screen.getByRole('button', { name: 'Save JSON & Close' });

    fireEvent.click(save);
    expect(save).toBeDisabled();
    await act(async () => {
      failed.reject(new Error('download failed'));
    });

    expect(screen.getByRole('heading', { name: 'Close Project?' })).toBeVisible();
    expect(screen.getByText(/Pending Project/)).toBeVisible();
    expect(save).toBeEnabled();
    await act(async () => fireEvent.click(save));
    expect(onSaveAndClose).toHaveBeenCalledTimes(2);
  });

  it('holds the lock through a synchronous throw task and rejection microtask', async () => {
    const onConfirmClose = vi.fn((): Promise<void> => {
      throw new Error('synchronous close failure');
    });
    const onSaveAndClose = vi.fn(() => Promise.resolve());
    const unhandledRejection = vi.fn();
    window.addEventListener('unhandledrejection', unhandledRejection);
    try {
      renderModal({ onConfirmClose, onSaveAndClose });
      const discard = screen.getByRole('button', { name: 'Close without Saving' });
      const save = screen.getByRole('button', { name: 'Save JSON & Close' });

      await act(async () => {
        fireEvent.click(discard);
        fireEvent.click(save);
        await Promise.resolve().then(() => fireEvent.click(save, { detail: 0 }));
      });

      expect(onConfirmClose).toHaveBeenCalledOnce();
      expect(onSaveAndClose).not.toHaveBeenCalled();
      expect(unhandledRejection).not.toHaveBeenCalled();
      expect(save).toBeEnabled();

      await act(async () => {
        fireEvent.click(save);
        await Promise.resolve();
      });
      expect(onSaveAndClose).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener('unhandledrejection', unhandledRejection);
    }
  });

  it('handles pending rejection after unmount without another action', async () => {
    const pending = deferred<void>();
    const onSaveAndClose = vi.fn(() => pending.promise);
    const view = renderModal({ onSaveAndClose });

    fireEvent.click(screen.getByRole('button', { name: 'Save JSON & Close' }));
    view.unmount();
    await act(async () => {
      pending.reject(new Error('unmounted'));
    });

    expect(onSaveAndClose).toHaveBeenCalledOnce();
  });
});
