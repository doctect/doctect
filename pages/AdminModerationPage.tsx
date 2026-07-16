import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { AppHeader } from '../components/AppHeader';
import { ApiError, cloudApi } from '../services/cloudApi';
import type {
    ModerationAction,
    ModerationUserDetail,
    ModerationUserSearchItem,
    SuspensionStatus,
} from '../services/cloudApi';

const durations = ['Indefinite', '24 hours', '7 days', '30 days', 'Custom'] as const;
type Duration = typeof durations[number];
type Confirmation =
    | {
        action: 'suspend';
        accountId: string;
        accountEmail: string;
        expectedModerationVersion: number;
        reason: string;
        duration: Duration;
        expiresAt: string | null;
        projects: { id: string; name: string }[];
    }
    | {
        action: 'restore';
        accountId: string;
        accountEmail: string;
        expectedModerationVersion: number;
        reason: string;
    };

const expiryFor = (duration: Duration, custom: string): string | null | undefined => {
    if (duration === 'Indefinite') return null;
    if (duration === 'Custom') {
        const timestamp = Date.parse(custom);
        return Number.isFinite(timestamp) && timestamp > Date.now()
            ? new Date(timestamp).toISOString()
            : undefined;
    }
    const hours = duration === '24 hours' ? 24 : duration === '7 days' ? 168 : 720;
    return new Date(Date.now() + hours * 3_600_000).toISOString();
};

const statusLabel = (status: SuspensionStatus) =>
    status === 'active'
        ? 'Active suspension'
        : status === 'expired'
            ? 'Expired suspension'
            : 'Not suspended';

const errorMessage = (error: unknown) => {
    if (error instanceof ApiError && error.status === 409) {
        return 'Account changed. Refresh account details before trying again.';
    }
    return error instanceof Error ? error.message : 'Request failed';
};

export function AdminModerationPage() {
    const [query, setQuery] = useState('');
    const [users, setUsers] = useState<ModerationUserSearchItem[]>([]);
    const [searchCursor, setSearchCursor] = useState<string | null>(null);
    const [searched, setSearched] = useState(false);
    const [detail, setDetail] = useState<ModerationUserDetail | null>(null);
    const [reason, setReason] = useState('');
    const [duration, setDuration] = useState<Duration>('Indefinite');
    const [customExpiry, setCustomExpiry] = useState('');
    const [selected, setSelected] = useState<string[]>([]);
    const [restoreReason, setRestoreReason] = useState('');
    const [confirming, setConfirming] = useState<Confirmation | null>(null);
    const [busy, setBusy] = useState(false);
    const [loadingSearch, setLoadingSearch] = useState(false);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [refreshFailure, setRefreshFailure] = useState<{ accountId: string; accountEmail: string } | null>(null);

    const searchGeneration = useRef(0);
    const activeSearchQuery = useRef('');
    const detailGeneration = useRef(0);
    const selectedAccountId = useRef<string | null>(null);
    const submitLock = useRef(false);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const cancelButtonRef = useRef<HTMLButtonElement>(null);
    const previousFocus = useRef<HTMLElement | null>(null);
    const confirmationOpen = useRef(false);

    useEffect(() => {
        if (confirming && !confirmationOpen.current) {
            previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            confirmationOpen.current = true;
            cancelButtonRef.current?.focus();
        } else if (!confirming && confirmationOpen.current) {
            confirmationOpen.current = false;
            const target = previousFocus.current?.isConnected ? previousFocus.current : searchInputRef.current;
            previousFocus.current = null;
            target?.focus();
        }
    }, [confirming]);

    useEffect(() => () => {
        if (confirmationOpen.current && previousFocus.current?.isConnected) previousFocus.current.focus();
    }, []);

    const resetAccountDrafts = () => {
        setReason('');
        setDuration('Indefinite');
        setCustomExpiry('');
        setSelected([]);
        setRestoreReason('');
        setConfirming(null);
    };

    const search = async (cursor: string | null = null) => {
        const trimmed = cursor ? activeSearchQuery.current : query.trim();
        if (!trimmed) {
            setError('Enter an email or username.');
            return;
        }

        const generation = cursor ? searchGeneration.current : ++searchGeneration.current;
        if (!cursor) activeSearchQuery.current = trimmed;
        setError(null);
        setLoadingSearch(true);
        try {
            const result = await cloudApi.searchModerationUsers(trimmed, cursor);
            if (generation !== searchGeneration.current) return;
            setUsers(current => cursor ? [...current, ...result.users] : result.users);
            setSearchCursor(result.nextCursor);
            setSearched(true);
        } catch (requestError) {
            if (generation === searchGeneration.current) setError(errorMessage(requestError));
        } finally {
            if (generation === searchGeneration.current) setLoadingSearch(false);
        }
    };

    const loadDetail = async (id: string, historyCursor: string | null = null) => {
        const generation = historyCursor ? detailGeneration.current : ++detailGeneration.current;
        setError(null);
        setLoadingDetail(true);
        try {
            const result = await cloudApi.getModerationUser(id, historyCursor);
            if (generation !== detailGeneration.current) return false;
            if (historyCursor) {
                setDetail(current => current?.account.id === id ? {
                    ...result,
                    history: {
                        items: [...current.history.items, ...result.history.items],
                        nextCursor: result.history.nextCursor,
                    },
                } : current);
            } else {
                if (selectedAccountId.current !== id) resetAccountDrafts();
                selectedAccountId.current = id;
                setDetail(result);
                setRefreshFailure(null);
            }
            return true;
        } catch (requestError) {
            if (generation === detailGeneration.current) setError(errorMessage(requestError));
            return false;
        } finally {
            if (generation === detailGeneration.current) setLoadingDetail(false);
        }
    };

    const reviewSuspend = () => {
        if (!detail || detail.account.role === 'admin') return;
        const trimmed = reason.trim();
        if (!trimmed || trimmed.length > 1000) {
            setError('Enter a reason from 1 to 1,000 characters.');
            return;
        }
        const expiresAt = expiryFor(duration, customExpiry);
        if (expiresAt === undefined) {
            setError('Custom expiry must be in the future.');
            return;
        }
        setError(null);
        setConfirming({
            action: 'suspend',
            accountId: detail.account.id,
            accountEmail: detail.account.email,
            expectedModerationVersion: detail.account.moderationVersion,
            reason: trimmed,
            duration,
            expiresAt,
            projects: detail.projects
                .filter(project => selected.includes(project.id))
                .map(project => ({ id: project.id, name: project.name })),
        });
    };

    const reviewRestore = () => {
        if (!detail || detail.account.role === 'admin') return;
        const trimmed = restoreReason.trim();
        if (!trimmed || trimmed.length > 1000) {
            setError('Enter a restoration reason from 1 to 1,000 characters.');
            return;
        }
        setError(null);
        setConfirming({
            action: 'restore',
            accountId: detail.account.id,
            accountEmail: detail.account.email,
            expectedModerationVersion: detail.account.moderationVersion,
            reason: trimmed,
        });
    };

    const submit = async () => {
        if (!confirming || submitLock.current) return;
        const confirmation = confirming;
        if (
            confirmation.action === 'suspend'
            && confirmation.expiresAt !== null
            && Date.parse(confirmation.expiresAt) <= Date.now()
        ) {
            setConfirming(null);
            setError('Suspension expiry is no longer in the future. Choose a new duration and review again.');
            return;
        }
        submitLock.current = true;
        setBusy(true);
        setError(null);
        try {
            if (confirmation.action === 'suspend') {
                await cloudApi.suspendAccount(confirmation.accountId, {
                    reason: confirmation.reason,
                    expiresAt: confirmation.expiresAt,
                    projectIdsToUnpublish: confirmation.projects.map(project => project.id),
                    expectedModerationVersion: confirmation.expectedModerationVersion,
                });
            } else {
                await cloudApi.restoreAccount(confirmation.accountId, {
                    reason: confirmation.reason,
                    expectedModerationVersion: confirmation.expectedModerationVersion,
                });
            }

            setConfirming(null);
            if (confirmation.action === 'suspend') {
                setReason('');
                setDuration('Indefinite');
                setCustomExpiry('');
                setSelected([]);
            } else {
                setRestoreReason('');
            }
            setDetail(null);
            const refreshed = await loadDetail(confirmation.accountId);
            if (!refreshed) {
                setRefreshFailure({
                    accountId: confirmation.accountId,
                    accountEmail: confirmation.accountEmail,
                });
                setError('Account changed successfully, but refresh failed. Refresh account details to continue.');
            }
        } catch (requestError) {
            setConfirming(null);
            setError(errorMessage(requestError));
        } finally {
            submitLock.current = false;
            setBusy(false);
        }
    };

    const refreshAccountDetails = async () => {
        if (!refreshFailure || loadingDetail) return;
        const target = refreshFailure;
        const refreshed = await loadDetail(target.accountId);
        if (!refreshed) {
            setRefreshFailure(target);
            setError('Account changed successfully, but refresh failed. Refresh account details to continue.');
        }
    };

    const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            if (!busy) setConfirming(null);
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled])'));
        if (focusable.length === 0) {
            event.preventDefault();
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !event.currentTarget.contains(document.activeElement))) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !event.currentTarget.contains(document.activeElement))) {
            event.preventDefault();
            first.focus();
        }
    };

    const toggleProject = (id: string) => setSelected(current =>
        current.includes(id) ? current.filter(item => item !== id) : [...current, id]);

    return (
        <div className="min-h-screen overflow-y-auto bg-slate-50 text-slate-900">
            <AppHeader />
            <main className="p-4 md:p-8">
                <div className="mx-auto max-w-6xl space-y-6">
                    <header>
                        <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">Administration</p>
                        <h1 className="text-3xl font-bold">Account moderation</h1>
                    </header>

                    <form
                        onSubmit={event => { event.preventDefault(); void search(); }}
                        className="flex flex-col gap-2 sm:flex-row"
                    >
                        <label className="flex-1 text-sm font-medium">
                            Search accounts
                            <input
                                ref={searchInputRef}
                                aria-label="Search accounts"
                                value={query}
                                onChange={event => setQuery(event.target.value)}
                                maxLength={100}
                                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                            />
                        </label>
                        <button
                            className="self-end rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
                            type="submit"
                            disabled={busy}
                        >
                            Search
                        </button>
                    </form>

                    {error && (
                        <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            <p>{error}</p>
                            {refreshFailure && (
                                <div className="mt-2 flex flex-wrap items-center gap-3">
                                    <span>Target account: {refreshFailure.accountEmail} ({refreshFailure.accountId})</span>
                                    <button
                                        type="button"
                                        onClick={() => void refreshAccountDetails()}
                                        disabled={loadingDetail}
                                        className="font-semibold text-blue-700 disabled:opacity-50"
                                    >
                                        Refresh account details
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                    {loadingSearch && <p role="status">Loading accounts…</p>}
                    {loadingDetail && <p role="status">Loading account details…</p>}

                    <section aria-label="Account search results" className="grid gap-3 md:grid-cols-2">
                        {users.map(user => (
                            <article key={user.id} className="rounded border bg-white p-4">
                                <strong>{user.email}</strong>
                                <p className="text-sm text-slate-600">
                                    {user.username || 'No username'} · {statusLabel(user.suspensionStatus)}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => void loadDetail(user.id)}
                                    aria-label={`Review ${user.email}`}
                                    disabled={busy}
                                    className="mt-2 text-sm font-semibold text-blue-700 disabled:opacity-50"
                                >
                                    Review account
                                </button>
                            </article>
                        ))}
                        {searched && users.length === 0 && <p>No matching accounts.</p>}
                    </section>
                    {searchCursor && (
                        <button
                            type="button"
                            onClick={() => void search(searchCursor)}
                            disabled={loadingSearch || busy}
                            className="text-sm font-semibold text-blue-700 disabled:opacity-50"
                        >
                            More accounts
                        </button>
                    )}

                    {detail && (
                        <section aria-label="Account moderation details" className="space-y-6 rounded-xl border bg-white p-4 md:p-6">
                            <div>
                                <h2 className="text-2xl font-bold">{detail.account.email}</h2>
                                <p>
                                    {detail.account.username || 'No username'} · {detail.account.role || 'user'} · {statusLabel(detail.account.suspensionStatus)}
                                </p>
                                {detail.account.banExpires && <p>Expiry: {new Date(detail.account.banExpires).toLocaleString()}</p>}
                            </div>

                            {detail.account.role === 'admin' ? (
                                <div role="status" className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-900">
                                    <strong>Protected administrator account</strong>
                                    <p>Administrator accounts cannot be suspended through this workflow.</p>
                                </div>
                            ) : detail.account.suspensionStatus !== 'active' ? (
                                <>
                                    <label className="block text-sm font-medium">
                                        Suspension duration
                                        <select
                                            aria-label="Suspension duration"
                                            value={duration}
                                            onChange={event => setDuration(event.target.value as Duration)}
                                            className="mt-1 block rounded border px-3 py-2"
                                        >
                                            {durations.map(item => <option key={item}>{item}</option>)}
                                        </select>
                                    </label>
                                    {duration === 'Custom' && (
                                        <label className="block text-sm font-medium">
                                            Custom expiry
                                            <input
                                                aria-label="Custom expiry"
                                                type="datetime-local"
                                                value={customExpiry}
                                                onChange={event => setCustomExpiry(event.target.value)}
                                                className="mt-1 block rounded border px-3 py-2"
                                            />
                                        </label>
                                    )}
                                    <label className="block text-sm font-medium">
                                        Reason
                                        <textarea
                                            aria-label="Suspension reason"
                                            value={reason}
                                            onChange={event => setReason(event.target.value)}
                                            maxLength={1000}
                                            className="mt-1 block min-h-24 w-full rounded border px-3 py-2"
                                        />
                                    </label>
                                    <fieldset>
                                        <legend className="font-semibold">Published projects to unpublish</legend>
                                        {detail.projects.length === 0 && <p className="mt-2 text-sm text-slate-600">No published projects.</p>}
                                        {detail.projects.map(project => (
                                            <div key={project.id} className="flex items-center justify-between border-b py-2">
                                                <label>
                                                    <input
                                                        type="checkbox"
                                                        aria-label={`Unpublish ${project.name} (${project.id})`}
                                                        checked={selected.includes(project.id)}
                                                        onChange={() => toggleProject(project.id)}
                                                    />{' '}
                                                    <span>{project.name} <span className="text-slate-500">({project.id})</span></span>
                                                </label>
                                                <Link
                                                    aria-label={`Review ${project.name} (${project.id})`}
                                                    to={`/gallery/${project.id}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-blue-700"
                                                >
                                                    Review
                                                </Link>
                                            </div>
                                        ))}
                                    </fieldset>
                                    <button
                                        type="button"
                                        onClick={reviewSuspend}
                                        disabled={busy}
                                        className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50"
                                    >
                                        Review suspension
                                    </button>
                                </>
                            ) : (
                                <>
                                    <label className="block text-sm font-medium">
                                        Restoration reason
                                        <textarea
                                            aria-label="Restoration reason"
                                            value={restoreReason}
                                            onChange={event => setRestoreReason(event.target.value)}
                                            maxLength={1000}
                                            className="mt-1 block min-h-24 w-full rounded border px-3 py-2"
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        onClick={reviewRestore}
                                        disabled={busy}
                                        className="rounded bg-emerald-700 px-4 py-2 text-white disabled:opacity-50"
                                    >
                                        Review restoration
                                    </button>
                                </>
                            )}

                            <div>
                                <h3 className="text-lg font-bold">Moderation history</h3>
                                {detail.history.items.length === 0 ? (
                                    <p>No moderation actions.</p>
                                ) : (
                                    <ul>
                                        {detail.history.items.map((action: ModerationAction) => (
                                            <li key={action.id} className="border-b py-3">
                                                <strong>{action.action.replaceAll('_', ' ')}</strong>
                                                <p>{action.reason}</p>
                                                <small>
                                                    {action.actorEmail} · {new Date(action.createdAt).toLocaleString()}
                                                    {action.projectId ? ` · project ${action.projectId}` : ''}
                                                </small>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {detail.history.nextCursor && (
                                    <button
                                        type="button"
                                        onClick={() => void loadDetail(detail.account.id, detail.history.nextCursor)}
                                        disabled={loadingDetail || busy}
                                        className="mt-2 text-sm font-semibold text-blue-700 disabled:opacity-50"
                                    >
                                        More history
                                    </button>
                                )}
                            </div>
                        </section>
                    )}

                    {confirming && detail?.account.role !== 'admin' && (
                        <div
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="moderation-confirm-title"
                            onKeyDown={handleDialogKeyDown}
                            className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 p-4"
                        >
                            <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
                                <h2 id="moderation-confirm-title" className="text-xl font-bold">
                                    Confirm {confirming.action === 'suspend' ? 'suspension' : 'restoration'}
                                </h2>
                                <div className="mt-3 space-y-1">
                                    <p>Account: {confirming.accountEmail}</p>
                                    <p>Account ID: {confirming.accountId}</p>
                                    <p>Moderation version: {confirming.expectedModerationVersion}</p>
                                    {confirming.action === 'suspend' ? (
                                        <>
                                            <p>Duration: {confirming.duration}</p>
                                            <p>Expiry: {confirming.expiresAt || 'Indefinite'}</p>
                                            <p>Reason: {confirming.reason}</p>
                                            <p>Projects:</p>
                                            {confirming.projects.length ? (
                                                <ul>{confirming.projects.map(project => <li key={project.id}>{project.name} ({project.id})</li>)}</ul>
                                            ) : <p>None</p>}
                                        </>
                                    ) : (
                                        <p>Reason: {confirming.reason}</p>
                                    )}
                                </div>
                                <div className="mt-4 flex gap-2">
                                    <button
                                        ref={cancelButtonRef}
                                        type="button"
                                        onClick={() => setConfirming(null)}
                                        disabled={busy}
                                        className="rounded border px-3 py-2 disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void submit()}
                                        disabled={busy}
                                        className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-50"
                                    >
                                        {busy
                                            ? 'Submitting…'
                                            : confirming.action === 'suspend'
                                                ? 'Confirm suspension'
                                                : 'Confirm restoration'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
