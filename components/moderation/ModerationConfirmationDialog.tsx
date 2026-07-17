import { useEffect, useRef } from 'react';
import type { KeyboardEvent, RefObject } from 'react';

export const moderationDurations = ['Indefinite', '24 hours', '7 days', '30 days', 'Custom'] as const;
export type ModerationDuration = typeof moderationDurations[number];

type ConfirmationBase = Readonly<{
    accountId: string;
    accountEmail: string;
    expectedModerationVersion: number;
    reason: string;
}>;

export type ModerationConfirmation =
    | (ConfirmationBase & Readonly<{
        action: 'suspend';
        duration: ModerationDuration;
        expiresAt: string | null;
        projects: readonly Readonly<{ id: string; name: string }>[];
    }>)
    | (ConfirmationBase & Readonly<{ action: 'restore' }>)
    | (ConfirmationBase & Readonly<{
        action: 'promote-admin';
        fromRole: 'user';
        toRole: 'admin';
    }>)
    | (ConfirmationBase & Readonly<{
        action: 'revoke-admin';
        fromRole: 'admin';
        toRole: 'user';
        suspensionDuration: ModerationDuration | null;
        expiresAt: string | null;
        projects: readonly Readonly<{ id: string; name: string }>[];
    }>);

const titleFor = (confirmation: ModerationConfirmation) => {
    if (confirmation.action === 'suspend') return 'Confirm suspension';
    if (confirmation.action === 'restore') return 'Confirm restoration';
    if (confirmation.action === 'promote-admin') return 'Confirm moderator promotion';
    return 'Confirm moderator removal';
};

const confirmLabelFor = (confirmation: ModerationConfirmation) => {
    if (confirmation.action === 'suspend') return 'Confirm suspension';
    if (confirmation.action === 'restore') return 'Confirm restoration';
    if (confirmation.action === 'promote-admin') return 'Confirm promotion';
    return 'Confirm removal';
};

export function ModerationConfirmationDialog({
    confirmation,
    busy,
    fallbackFocusRef,
    onConfirm,
    onCancel,
}: {
    confirmation: ModerationConfirmation;
    busy: boolean;
    fallbackFocusRef: RefObject<HTMLElement | null>;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const cancelRef = useRef<HTMLButtonElement>(null);
    const previousFocus = useRef<HTMLElement | null>(null);
    const fallbackFocus = useRef<HTMLElement | null>(null);

    useEffect(() => {
        previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        fallbackFocus.current = fallbackFocusRef.current;
        cancelRef.current?.focus();
        return () => {
            const previous = previousFocus.current;
            const fallback = fallbackFocus.current;
            const target = previous?.isConnected ? previous : fallback;
            target?.focus();
            queueMicrotask(() => {
                const currentFallback = fallbackFocusRef.current
                    || document.querySelector<HTMLElement>('[data-moderation-dialog-fallback]');
                if (
                    (!previous?.isConnected || document.activeElement === document.body)
                    && currentFallback?.isConnected
                ) currentFallback.focus();
            });
        };
    }, []);

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            if (!busy) onCancel();
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') || []);
        if (focusable.length === 0) {
            event.preventDefault();
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
            event.preventDefault();
            first.focus();
        }
    };

    const hasProjects = confirmation.action === 'suspend' || confirmation.action === 'revoke-admin';

    return (
        <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="moderation-confirm-title"
            onKeyDown={handleKeyDown}
            className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 p-4"
        >
            <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
                <h2 id="moderation-confirm-title" className="text-xl font-bold">{titleFor(confirmation)}</h2>
                <div className="mt-3 space-y-1">
                    <p>Account: {confirmation.accountEmail}</p>
                    <p>Account ID: {confirmation.accountId}</p>
                    <p>Moderation version: {confirmation.expectedModerationVersion}</p>
                    {(confirmation.action === 'promote-admin' || confirmation.action === 'revoke-admin') && (
                        <p>Role transition: {confirmation.fromRole} -&gt; {confirmation.toRole}</p>
                    )}
                    {confirmation.action === 'suspend' && (
                        <>
                            <p>Duration: {confirmation.duration}</p>
                            <p>Expiry: {confirmation.expiresAt || 'Indefinite'}</p>
                        </>
                    )}
                    {confirmation.action === 'revoke-admin' && (
                        <>
                            <p>Suspension: {confirmation.suspensionDuration || 'None'}</p>
                            {confirmation.suspensionDuration && <p>Expiry: {confirmation.expiresAt || 'Indefinite'}</p>}
                        </>
                    )}
                    <p>Reason: {confirmation.reason}</p>
                    {hasProjects && (
                        <>
                            <p>Projects:</p>
                            {confirmation.projects.length
                                ? <ul>{confirmation.projects.map(project => <li key={project.id}>{project.name} ({project.id})</li>)}</ul>
                                : <p>None</p>}
                        </>
                    )}
                </div>
                <div className="mt-4 flex gap-2">
                    <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy} className="rounded border px-3 py-2 disabled:opacity-50">
                        Cancel
                    </button>
                    <button type="button" onClick={onConfirm} disabled={busy} className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-50">
                        {busy ? 'Submitting…' : confirmLabelFor(confirmation)}
                    </button>
                </div>
            </div>
        </div>
    );
}
