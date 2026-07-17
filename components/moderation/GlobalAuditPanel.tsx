import { useRef, useState } from 'react';
import { cloudApi } from '../../services/cloudApi';
import type {
    GlobalAuditFilters,
    ModerationActionType,
    PlatformAuditAction,
    PlatformRole,
} from '../../services/cloudApi';

const actions: ModerationActionType[] = [
    'owner_granted',
    'owner_removed',
    'admin_promoted',
    'admin_demoted',
    'account_suspended',
    'account_restored',
    'project_unpublished',
    'review_deleted',
];

const localDateToIso = (value: string): string | null => {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
};

export function GlobalAuditPanel({ actorRole }: { actorRole: PlatformRole }) {
    const [actorEmail, setActorEmail] = useState('');
    const [targetEmail, setTargetEmail] = useState('');
    const [action, setAction] = useState<ModerationActionType | ''>('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [items, setItems] = useState<PlatformAuditAction[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [searched, setSearched] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const generation = useRef(0);
    const appliedFilters = useRef<GlobalAuditFilters>({});

    if (actorRole !== 'owner') return null;

    const request = async (filters: GlobalAuditFilters, append: boolean) => {
        const requestGeneration = ++generation.current;
        setLoading(true);
        setError(null);
        try {
            const result = await cloudApi.getGlobalAudit(filters);
            if (requestGeneration !== generation.current) return;
            if (!append) appliedFilters.current = filters;
            setItems(current => append ? [...current, ...result.items] : result.items);
            setNextCursor(result.nextCursor);
            setSearched(true);
        } catch (requestError) {
            if (requestGeneration === generation.current) {
                setError(requestError instanceof Error ? requestError.message : 'Request failed');
            }
        } finally {
            if (requestGeneration === generation.current) setLoading(false);
        }
    };

    const search = () => {
        const fromIso = from ? localDateToIso(from) : undefined;
        const toIso = to ? localDateToIso(to) : undefined;
        if ((from && !fromIso) || (to && !toIso)) {
            setError('Enter a valid audit date range.');
            return;
        }
        if (fromIso && toIso && fromIso > toIso) {
            setError('Audit from must be before or equal to audit to.');
            return;
        }

        const filters: GlobalAuditFilters = {};
        if (actorEmail.trim()) filters.actorEmail = actorEmail.trim();
        if (targetEmail.trim()) filters.targetEmail = targetEmail.trim();
        if (action) filters.action = action;
        if (fromIso) filters.from = fromIso;
        if (toIso) filters.to = toIso;
        void request(filters, false);
    };

    const more = () => {
        if (!nextCursor || loading) return;
        void request({ ...appliedFilters.current, cursor: nextCursor }, true);
    };

    const reset = () => {
        generation.current += 1;
        appliedFilters.current = {};
        setActorEmail('');
        setTargetEmail('');
        setAction('');
        setFrom('');
        setTo('');
        setItems([]);
        setNextCursor(null);
        setSearched(false);
        setLoading(false);
        setError(null);
    };

    return (
        <section aria-label="Global audit" className="space-y-4 rounded-xl border border-amber-200 bg-white p-4 md:p-6">
            <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">Owner controls</p>
                <h2 className="text-2xl font-bold">Global audit</h2>
            </div>
            <form
                noValidate
                onSubmit={event => { event.preventDefault(); search(); }}
                className="grid gap-3 md:grid-cols-2 lg:grid-cols-3"
            >
                <label className="text-sm font-medium">
                    Actor email
                    <input
                        aria-label="Audit actor email"
                        type="email"
                        value={actorEmail}
                        onChange={event => setActorEmail(event.target.value)}
                        maxLength={320}
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                    />
                </label>
                <label className="text-sm font-medium">
                    Target email
                    <input
                        aria-label="Audit target email"
                        type="email"
                        value={targetEmail}
                        onChange={event => setTargetEmail(event.target.value)}
                        maxLength={320}
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                    />
                </label>
                <label className="text-sm font-medium">
                    Action
                    <select
                        aria-label="Audit action"
                        value={action}
                        onChange={event => setAction(event.target.value as ModerationActionType | '')}
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                    >
                        <option value="">All actions</option>
                        {actions.map(item => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}
                    </select>
                </label>
                <label className="text-sm font-medium">
                    From
                    <input
                        aria-label="Audit from"
                        type="datetime-local"
                        value={from}
                        onChange={event => setFrom(event.target.value)}
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                    />
                </label>
                <label className="text-sm font-medium">
                    To
                    <input
                        aria-label="Audit to"
                        type="datetime-local"
                        value={to}
                        onChange={event => setTo(event.target.value)}
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                    />
                </label>
                <div className="flex items-end gap-2">
                    <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white">
                        Search global audit
                    </button>
                    <button type="button" onClick={reset} className="rounded border border-slate-300 px-4 py-2">
                        Reset global audit
                    </button>
                </div>
            </form>

            {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            {loading && <p role="status">Loading global audit…</p>}
            {searched && !loading && items.length === 0 && <p>No matching audit actions.</p>}
            {items.length > 0 && (
                <ul className="divide-y rounded border border-slate-200">
                    {items.map(item => (
                        <li key={item.id} className="space-y-1 p-4">
                            <strong className="capitalize">{item.action.replaceAll('_', ' ')}</strong>
                            <p>{item.reason}</p>
                            <div className="grid gap-x-6 gap-y-1 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
                                <span>Actor: {item.actorKind === 'system' ? `System (${item.actorEmail})` : item.actorEmail}</span>
                                <span>Actor ID: {item.actorUserId ?? 'None'}</span>
                                <span>Target: {item.targetEmail ?? 'None'}</span>
                                <span>Target ID: {item.targetUserId ?? 'None'}</span>
                                <span>Project ID: {item.projectId ?? 'None'}</span>
                                <span>Review ID: {item.reviewId ?? 'None'}</span>
                                <span>Time: {new Date(item.createdAt).toLocaleString()}</span>
                                {item.expiresAt && <span>Expiry: {new Date(item.expiresAt).toLocaleString()}</span>}
                                <span>Source: {item.metadata.source.replaceAll('_', ' ')}</span>
                                {item.metadata.previousRole && item.metadata.newRole && (
                                    <span>Role: {item.metadata.previousRole} {'->'} {item.metadata.newRole}</span>
                                )}
                                {item.metadata.previousProjectVisibility && (
                                    <span>Previous project visibility: {item.metadata.previousProjectVisibility}</span>
                                )}
                                {item.metadata.deletedReviewRating !== undefined && (
                                    <span>Deleted review rating: {item.metadata.deletedReviewRating}</span>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            {nextCursor && (
                <button
                    type="button"
                    onClick={more}
                    disabled={loading}
                    className="text-sm font-semibold text-blue-700 disabled:opacity-50"
                >
                    More audit actions
                </button>
            )}
        </section>
    );
}
