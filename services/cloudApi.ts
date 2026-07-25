import { AppState } from '../types';

export const API_BASE: string = (import.meta as any).env?.VITE_API_BASE || '';

export class ApiError extends Error {
    status: number;
    code?: string;
    constructor(status: number, message: string, code?: string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        ...opts,
    });
    let body: any = null;
    try { body = await res.json(); } catch { /* non-JSON */ }
    if (!res.ok) throw new ApiError(res.status, body?.error || `Request failed (${res.status})`, body?.code);
    return body as T;
}

export type PlatformRole = 'owner' | 'admin' | 'user';

export interface MeUser { id: string; email: string; username: string | null; role: PlatformRole; }
export interface CloudProject {
    id: string; ownerId: string; name: string; description: string; tags: string[];
    visibility: 'private' | 'public'; headCommitId: string | null; publishedCommitId: string | null;
    forkedFromProjectId: string | null; forkedFromCommitId: string | null;
    downloadCount: number; forkCount: number; createdAt: string; updatedAt: string;
}
export interface CommitMeta { id: string; parentCommitId: string | null; message: string; schemaVersion: number | null; createdBy: string | null; createdAt: string; }
export interface MyProject extends CloudProject { storedBytes: number; commitCount: number; }
export interface StorageUsage { usedBytes: number; quotaBytes: number; }

export type SuspensionStatus = 'none' | 'active' | 'expired';

export interface ModerationUserSearchItem {
    id: string;
    email: string;
    username: string | null;
    role: PlatformRole;
    createdAt: string;
    suspensionStatus: SuspensionStatus;
    banExpires: string | null;
    moderationVersion: number;
}

export interface ModerationAccount extends ModerationUserSearchItem {
    banReason: string | null;
}

export interface ModerationProject {
    id: string;
    name: string;
    publishedAt: string | null;
}

export type ModerationActionType =
    | 'owner_granted'
    | 'owner_removed'
    | 'admin_promoted'
    | 'admin_demoted'
    | 'account_suspended'
    | 'account_restored'
    | 'project_unpublished'
    | 'review_deleted';

export type AuditSource =
    | 'owner_emails_reconciliation'
    | 'account_workflow'
    | 'owner_role_workflow'
    | 'standalone_project'
    | 'standalone_review';

export interface AuditMetadata {
    source: AuditSource;
    previousRole?: PlatformRole;
    newRole?: PlatformRole;
    previousProjectVisibility?: 'public';
    deletedReviewRating?: number;
}

export interface PlatformAuditAction {
    id: string;
    actorKind: 'user' | 'system';
    actorUserId: string | null;
    actorEmail: string;
    targetUserId: string | null;
    targetEmail: string | null;
    projectId: string | null;
    reviewId: string | null;
    action: ModerationActionType;
    reason: string;
    expiresAt: string | null;
    createdAt: string;
    metadata: AuditMetadata;
}

export type ModerationAction = PlatformAuditAction;

export interface ModerationUserDetail {
    account: ModerationAccount;
    projects: ModerationProject[];
    history: { items: PlatformAuditAction[]; nextCursor: string | null };
}

export interface SuspendAccountInput {
    reason: string;
    expiresAt: string | null;
    projectIdsToUnpublish: string[];
    expectedModerationVersion: number;
}

export interface RestoreAccountInput {
    reason: string;
    expectedModerationVersion: number;
}

export interface PromoteAdminInput {
    reason: string;
    expectedModerationVersion: number;
}

export interface RevokeAdminInput {
    reason: string;
    expectedModerationVersion: number;
    suspension: { expiresAt: string | null } | null;
    projectIdsToUnpublish: string[];
}

export interface GlobalAuditFilters {
    actorEmail?: string;
    targetEmail?: string;
    action?: ModerationActionType;
    from?: string;
    to?: string;
    cursor?: string;
}

export interface GalleryItem {
    id: string; name: string; description: string; tags: string[]; author: string;
    forkCount: number; downloadCount: number; updatedAt: string; thumbnailId: string | null;
    ratingAvg: number | null; ratingCount: number;
}
export interface GalleryDetail extends Omit<GalleryItem, 'thumbnailId'> {
    ownerId: string; headCommitId: string | null; thumbnailIds: string[];
    forkedFrom: { projectId: string; name: string; author: string } | null;
}

export interface ReviewDto { id: string; rating: number; body: string; author: string; createdAt: string; updatedAt: string; }
export interface GalleryTag { tag: string; count: number; }

export interface MergeRequestDto {
    id: string; sourceProjectId: string; sourceProjectName: string; sourceCommitId: string;
    targetProjectId: string; targetProjectName: string; baseCommitId: string;
    title: string; description: string; status: 'open' | 'merged' | 'closed' | 'conflicted';
    createdBy: string; authorUsername: string | null; createdAt: string; resolvedAt: string | null;
}
export interface ChangeSetDto {
    variantsAdded: string[]; variantsRemoved: string[]; variantsRenamed: Record<string, string>;
    templatesAdded: Record<string, string[]>; templatesModified: Record<string, string[]>; templatesRemoved: Record<string, string[]>;
    nodesChanged: boolean;
    generatorChange: null | 'added' | 'modified' | 'removed';
}
export interface MrDetail {
    mergeRequest: MergeRequestDto;
    diff: { source: ChangeSetDto; target: ChangeSetDto; conflicts: { kind: string; variantId?: string; templateId?: string; description: string }[] } | null;
    sourceState: any; targetState: any;
    // Server-computed (never re-derive client-side from "not the author" -- that heuristic breaks
    // when the same user is both the fork's author and the target's owner, e.g. a self-fork).
    isTargetOwner: boolean;
}

export const cloudApi = {
    me: async (): Promise<MeUser | null> =>
        (await api<{ user: MeUser | null }>('/api/me')).user,

    getSignupStatus: () => api<{ open: boolean }>('/api/signup-status'),
    joinWaitlist: (email: string) =>
        api<{ ok: true }>('/api/waitlist', { method: 'POST', body: JSON.stringify({ email }) }),
    getAdminWaitlist: () =>
        api<{ count: number; entries: { email: string; createdAt: string }[] }>('/api/admin/waitlist'),

    createProject: (args: { name: string; state: AppState; message?: string }) =>
        api<{ project: CloudProject; commit: { id: string } }>('/api/projects', { method: 'POST', body: JSON.stringify(args) }),

    getProject: async (projectId: string) =>
        (await api<{ project: CloudProject }>(`/api/projects/${projectId}`)).project,

    listProjects: () =>
        api<{ projects: MyProject[]; usage: StorageUsage }>('/api/projects'),

    deleteProject: (projectId: string) =>
        api<{ success: boolean }>(`/api/projects/${projectId}`, { method: 'DELETE' }),

    saveCommit: (projectId: string, expectedHead: string, args: { state: AppState; message: string }) =>
        api<{ commit: { id: string; message: string; createdAt: string } }>(`/api/projects/${projectId}/commits`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'If-Match': `"${expectedHead}"` },
            body: JSON.stringify(args),
        }),

    listCommits: async (projectId: string) =>
        (await api<{ commits: CommitMeta[] }>(`/api/projects/${projectId}/commits`)).commits,

    getCommit: async (projectId: string, commitId: string) =>
        (await api<{ commit: { id: string; message: string; createdAt: string; state: any } }>(`/api/projects/${projectId}/commits/${commitId}`)).commit,

    publish: (projectId: string, expectedHead: string, args: { description: string; tags: string[]; thumbnails: string[]; previewNodeIds?: string[] }) =>
        api<{ project: CloudProject & { thumbnailIds: string[] } }>(`/api/projects/${projectId}/publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'If-Match': `"${expectedHead}"` },
            body: JSON.stringify(args),
        }),

    unpublish: (projectId: string) =>
        api<{ project: CloudProject }>(`/api/projects/${projectId}/unpublish`, { method: 'POST' }),

    gallery: (params: { q?: string; sort?: 'recent' | 'popular' | 'rating'; page?: number; tag?: string; limit?: number } = {}) => {
        const qs = new URLSearchParams();
        if (params.q) qs.set('q', params.q);
        if (params.sort) qs.set('sort', params.sort);
        if (params.page) qs.set('page', String(params.page));
        if (params.tag) qs.set('tag', params.tag);
        if (params.limit) qs.set('limit', String(params.limit));
        return api<{ items: GalleryItem[]; page: number; hasMore: boolean }>(`/api/gallery?${qs}`);
    },
    galleryDetail: async (id: string) =>
        (await api<{ project: GalleryDetail }>(`/api/gallery/${id}`)).project,
    galleryState: (id: string) =>
        api<{ name: string; state: any }>(`/api/gallery/${id}/state`),
    report: (id: string, reason: string) =>
        api<{ success: boolean }>(`/api/gallery/${id}/report`, { method: 'POST', body: JSON.stringify({ reason }) }),

    galleryTags: async () =>
        (await api<{ tags: GalleryTag[] }>('/api/gallery/tags')).tags,
    listReviews: (projectId: string) =>
        api<{ reviews: ReviewDto[]; myReview: ReviewDto | null }>(`/api/gallery/${projectId}/reviews`),
    putReview: (projectId: string, args: { rating: number; body?: string }) =>
        api<{ review: ReviewDto }>(`/api/gallery/${projectId}/review`, { method: 'PUT', body: JSON.stringify(args) }),
    deleteReview: (projectId: string) =>
        api<{ success: boolean }>(`/api/gallery/${projectId}/review`, { method: 'DELETE' }),
    reportReview: (projectId: string, reviewId: string, reason: string) =>
        api<{ success: boolean }>(`/api/gallery/${projectId}/reviews/${reviewId}/report`, { method: 'POST', body: JSON.stringify({ reason }) }),

    // Forks a public project into a new private project owned by the caller, seeded from
    // its head commit. Server endpoint implemented in Task 19 (Phase 4).
    fork: (projectId: string) =>
        api<{ project: CloudProject }>(`/api/projects/${projectId}/fork`, { method: 'POST' }),

    createMergeRequest: (args: { sourceProjectId: string; title: string; description?: string }) =>
        api<{ mergeRequest: MergeRequestDto }>('/api/merge-requests', { method: 'POST', body: JSON.stringify(args) }),
    listIncomingMrs: async (projectId: string) =>
        (await api<{ mergeRequests: MergeRequestDto[] }>(`/api/projects/${projectId}/merge-requests`)).mergeRequests,
    listMyMrs: async () =>
        (await api<{ mergeRequests: MergeRequestDto[] }>('/api/merge-requests/mine')).mergeRequests,
    getMr: (id: string) => api<MrDetail>(`/api/merge-requests/${id}`),
    mergeMr: (id: string) => api<{ mergeRequest: MergeRequestDto; commit: { id: string } }>(`/api/merge-requests/${id}/merge`, { method: 'POST' }),
    closeMr: (id: string) => api<{ mergeRequest: MergeRequestDto }>(`/api/merge-requests/${id}/close`, { method: 'POST' }),

    searchModerationUsers: (q: string, cursor?: string | null) => {
        const params = new URLSearchParams({ q });
        if (cursor) params.set('cursor', cursor);
        return api<{ users: ModerationUserSearchItem[]; nextCursor: string | null }>(`/api/admin/users?${params}`);
    },
    getModerationUser: (id: string, historyCursor?: string | null) => {
        const params = new URLSearchParams();
        if (historyCursor) params.set('historyCursor', historyCursor);
        const suffix = params.size ? `?${params}` : '';
        return api<ModerationUserDetail>(`/api/admin/users/${encodeURIComponent(id)}${suffix}`);
    },
    suspendAccount: (id: string, input: SuspendAccountInput) =>
        api<{ account: ModerationAccount; actions: PlatformAuditAction[] }>(
            `/api/admin/users/${encodeURIComponent(id)}/suspend`,
            { method: 'POST', body: JSON.stringify(input) },
        ),
    restoreAccount: (id: string, input: RestoreAccountInput) =>
        api<{ account: ModerationAccount; actions: [PlatformAuditAction] }>(
            `/api/admin/users/${encodeURIComponent(id)}/restore`,
            { method: 'POST', body: JSON.stringify(input) },
        ),
    promoteAdmin: (id: string, input: PromoteAdminInput) =>
        api<{ account: ModerationAccount; actions: [PlatformAuditAction] }>(
            `/api/owner/users/${encodeURIComponent(id)}/promote-admin`,
            { method: 'POST', body: JSON.stringify(input) },
        ),
    revokeAdmin: (id: string, input: RevokeAdminInput) =>
        api<{ account: ModerationAccount; actions: PlatformAuditAction[] }>(
            `/api/owner/users/${encodeURIComponent(id)}/revoke-admin`,
            { method: 'POST', body: JSON.stringify(input) },
        ),
    moderatorUnpublishProject: (id: string, reason: string) =>
        api<{ success: true; action: PlatformAuditAction }>(
            `/api/admin/projects/${encodeURIComponent(id)}/unpublish`,
            { method: 'POST', body: JSON.stringify({ reason }) },
        ),
    moderatorDeleteReview: (id: string, reason: string) =>
        api<{ success: true; action: PlatformAuditAction }>(
            `/api/admin/reviews/${encodeURIComponent(id)}`,
            { method: 'DELETE', body: JSON.stringify({ reason }) },
        ),
    getGlobalAudit: (filters: GlobalAuditFilters = {}) => {
        const params = new URLSearchParams();
        if (filters.actorEmail !== undefined) params.set('actorEmail', filters.actorEmail);
        if (filters.targetEmail !== undefined) params.set('targetEmail', filters.targetEmail);
        if (filters.action !== undefined) params.set('action', filters.action);
        if (filters.from !== undefined) params.set('from', filters.from);
        if (filters.to !== undefined) params.set('to', filters.to);
        if (filters.cursor !== undefined) params.set('cursor', filters.cursor);
        const suffix = params.size ? `?${params}` : '';
        return api<{ items: PlatformAuditAction[]; nextCursor: string | null }>(`/api/owner/audit${suffix}`);
    },
};
