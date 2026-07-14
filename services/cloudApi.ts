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

export interface MeUser { id: string; email: string; username: string | null; role: string | null; }
export interface CloudProject {
    id: string; ownerId: string; name: string; description: string; tags: string[];
    visibility: 'private' | 'public'; headCommitId: string | null;
    forkedFromProjectId: string | null; forkedFromCommitId: string | null;
    downloadCount: number; forkCount: number; createdAt: string; updatedAt: string;
}
export interface CommitMeta { id: string; parentCommitId: string | null; message: string; schemaVersion: number | null; createdBy: string | null; createdAt: string; }
export interface MyProject extends CloudProject { storedBytes: number; commitCount: number; }
export interface StorageUsage { usedBytes: number; quotaBytes: number; }

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

    createProject: (args: { name: string; state: AppState; message?: string }) =>
        api<{ project: CloudProject; commit: { id: string } }>('/api/projects', { method: 'POST', body: JSON.stringify(args) }),

    getProject: async (projectId: string) =>
        (await api<{ project: CloudProject }>(`/api/projects/${projectId}`)).project,

    listProjects: () =>
        api<{ projects: MyProject[]; usage: StorageUsage }>('/api/projects'),

    deleteProject: (projectId: string) =>
        api<{ success: boolean }>(`/api/projects/${projectId}`, { method: 'DELETE' }),

    saveCommit: (projectId: string, args: { state: AppState; message: string }) =>
        api<{ commit: { id: string; message: string; createdAt: string } }>(`/api/projects/${projectId}/commits`, { method: 'POST', body: JSON.stringify(args) }),

    listCommits: async (projectId: string) =>
        (await api<{ commits: CommitMeta[] }>(`/api/projects/${projectId}/commits`)).commits,

    getCommit: async (projectId: string, commitId: string) =>
        (await api<{ commit: { id: string; message: string; createdAt: string; state: any } }>(`/api/projects/${projectId}/commits/${commitId}`)).commit,

    publish: (projectId: string, expectedHead: string, args: { description: string; tags: string[]; thumbnails: string[] }) =>
        api<{ project: CloudProject & { thumbnailIds: string[] } }>(`/api/projects/${projectId}/publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'If-Match': expectedHead },
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
};
