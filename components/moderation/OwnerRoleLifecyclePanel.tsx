import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ModerationAccount, ModerationProject, PlatformRole } from '../../services/cloudApi';
import { moderationDurations } from './ModerationConfirmationDialog';
import type { ModerationConfirmation, ModerationDuration } from './ModerationConfirmationDialog';

const expiryFor = (duration: ModerationDuration, custom: string): string | null | undefined => {
    if (duration === 'Indefinite') return null;
    if (duration === 'Custom') {
        const timestamp = Date.parse(custom);
        return Number.isFinite(timestamp) && timestamp > Date.now() ? new Date(timestamp).toISOString() : undefined;
    }
    const hours = duration === '24 hours' ? 24 : duration === '7 days' ? 168 : 720;
    return new Date(Date.now() + hours * 3_600_000).toISOString();
};

type PromoteConfirmation = Extract<ModerationConfirmation, { action: 'promote-admin' }>;
type RevokeConfirmation = Extract<ModerationConfirmation, { action: 'revoke-admin' }>;

export function OwnerRoleLifecyclePanel({
    actorRole,
    account,
    projects,
    busy,
    onReviewPromote,
    onReviewRevoke,
}: {
    actorRole: PlatformRole;
    account: ModerationAccount;
    projects: ModerationProject[];
    busy: boolean;
    onReviewPromote: (confirmation: PromoteConfirmation) => void;
    onReviewRevoke: (confirmation: RevokeConfirmation) => void;
}) {
    const [reason, setReason] = useState('');
    const [suspend, setSuspend] = useState(false);
    const [duration, setDuration] = useState<ModerationDuration>('Indefinite');
    const [customExpiry, setCustomExpiry] = useState('');
    const [selected, setSelected] = useState<string[]>([]);
    const [validation, setValidation] = useState<string | null>(null);

    if (actorRole !== 'owner' || (account.role !== 'user' && account.role !== 'admin')) return null;

    const validateReason = () => {
        const trimmed = reason.trim();
        if (!trimmed || trimmed.length > 1000) {
            setValidation('Enter a role change reason from 1 to 1,000 characters.');
            return null;
        }
        return trimmed;
    };

    const reviewPromote = () => {
        if (account.role !== 'user' || account.suspensionStatus === 'active') return;
        const trimmed = validateReason();
        if (!trimmed) return;
        setValidation(null);
        onReviewPromote({
            action: 'promote-admin',
            accountId: account.id,
            accountEmail: account.email,
            expectedModerationVersion: account.moderationVersion,
            reason: trimmed,
            fromRole: 'user',
            toRole: 'admin',
        });
    };

    const reviewRevoke = () => {
        if (account.role !== 'admin') return;
        const trimmed = validateReason();
        if (!trimmed) return;
        const expiresAt = suspend ? expiryFor(duration, customExpiry) : null;
        if (expiresAt === undefined) {
            setValidation('Custom expiry must be in the future.');
            return;
        }
        setValidation(null);
        onReviewRevoke({
            action: 'revoke-admin',
            accountId: account.id,
            accountEmail: account.email,
            expectedModerationVersion: account.moderationVersion,
            reason: trimmed,
            fromRole: 'admin',
            toRole: 'user',
            suspensionDuration: suspend ? duration : null,
            expiresAt,
            projects: projects.filter(project => selected.includes(project.id)).map(project => ({ id: project.id, name: project.name })),
        });
    };

    const toggleProject = (id: string) => setSelected(current =>
        current.includes(id) ? current.filter(item => item !== id) : [...current, id]);

    return (
        <section aria-label="Moderator role lifecycle" className="space-y-4 rounded-lg border border-blue-200 bg-blue-50/40 p-4">
            <h3 className="text-lg font-bold">Moderator access</h3>
            {validation && <p role="alert" className="text-sm text-red-700">{validation}</p>}
            <label className="block text-sm font-medium">
                Role change reason
                <textarea
                    aria-label="Role change reason"
                    value={reason}
                    onChange={event => setReason(event.target.value)}
                    maxLength={1000}
                    className="mt-1 block min-h-24 w-full rounded border px-3 py-2"
                />
            </label>
            {account.role === 'user' ? (
                account.suspensionStatus === 'active'
                    ? <p role="status">Restore this account before granting moderator access.</p>
                    : !busy && (
                        <button type="button" onClick={reviewPromote} className="rounded bg-blue-700 px-4 py-2 text-white">
                            Promote to moderator
                        </button>
                    )
            ) : (
                <>
                    <label className="flex items-center gap-2 font-medium">
                        <input
                            type="checkbox"
                            aria-label="Suspend account after removing moderator access"
                            checked={suspend}
                            onChange={event => setSuspend(event.target.checked)}
                        />
                        Suspend account after removing moderator access
                    </label>
                    {suspend && (
                        <>
                            <label className="block text-sm font-medium">
                                Role suspension duration
                                <select
                                    aria-label="Role suspension duration"
                                    value={duration}
                                    onChange={event => setDuration(event.target.value as ModerationDuration)}
                                    className="mt-1 block rounded border px-3 py-2"
                                >
                                    {moderationDurations.map(item => <option key={item}>{item}</option>)}
                                </select>
                            </label>
                            {duration === 'Custom' && (
                                <label className="block text-sm font-medium">
                                    Role suspension custom expiry
                                    <input
                                        aria-label="Role suspension custom expiry"
                                        type="datetime-local"
                                        value={customExpiry}
                                        onChange={event => setCustomExpiry(event.target.value)}
                                        className="mt-1 block rounded border px-3 py-2"
                                    />
                                </label>
                            )}
                        </>
                    )}
                    <fieldset>
                        <legend className="font-semibold">Published projects to unpublish</legend>
                        {projects.length === 0 && <p className="mt-2 text-sm text-slate-600">No published projects.</p>}
                        {projects.map(project => (
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
                                <Link aria-label={`Review ${project.name} (${project.id})`} to={`/gallery/${project.id}`} target="_blank" rel="noreferrer" className="text-blue-700">
                                    Review
                                </Link>
                            </div>
                        ))}
                    </fieldset>
                    {!busy && (
                        <button type="button" onClick={reviewRevoke} className="rounded bg-red-700 px-4 py-2 text-white">
                            Remove moderator access
                        </button>
                    )}
                </>
            )}
        </section>
    );
}
