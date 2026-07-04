import { AppState } from '../types';

export const API_BASE: string = (import.meta as any).env?.VITE_API_BASE || '';

export class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
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
    if (!res.ok) throw new ApiError(res.status, body?.error || `Request failed (${res.status})`);
    return body as T;
}

export interface MeUser { id: string; email: string; name: string; username: string | null; role: string | null; }
export interface CloudProject {
    id: string; ownerId: string; name: string; description: string; tags: string[];
    visibility: 'private' | 'public'; headCommitId: string | null;
    forkedFromProjectId: string | null; forkedFromCommitId: string | null;
    downloadCount: number; forkCount: number; createdAt: string; updatedAt: string;
}
export interface CommitMeta { id: string; parentCommitId: string | null; message: string; schemaVersion: number | null; createdBy: string | null; createdAt: string; }

export interface GalleryItem {
    id: string; name: string; description: string; tags: string[]; author: string;
    forkCount: number; downloadCount: number; updatedAt: string; thumbnailId: string | null;
}
export interface GalleryDetail extends Omit<GalleryItem, 'thumbnailId'> {
    ownerId: string; headCommitId: string | null; thumbnailIds: string[];
    forkedFrom: { projectId: string; name: string; author: string } | null;
}

export const cloudApi = {
    me: async (): Promise<MeUser | null> =>
        (await api<{ user: MeUser | null }>('/api/me')).user,

    createProject: (args: { name: string; state: AppState; message?: string }) =>
        api<{ project: CloudProject; commit: { id: string } }>('/api/projects', { method: 'POST', body: JSON.stringify(args) }),

    getProject: async (projectId: string) =>
        (await api<{ project: CloudProject }>(`/api/projects/${projectId}`)).project,

    saveCommit: (projectId: string, args: { state: AppState; message: string }) =>
        api<{ commit: { id: string; message: string; createdAt: string } }>(`/api/projects/${projectId}/commits`, { method: 'POST', body: JSON.stringify(args) }),

    listCommits: async (projectId: string) =>
        (await api<{ commits: CommitMeta[] }>(`/api/projects/${projectId}/commits`)).commits,

    getCommit: async (projectId: string, commitId: string) =>
        (await api<{ commit: { id: string; message: string; createdAt: string; state: any } }>(`/api/projects/${projectId}/commits/${commitId}`)).commit,

    publish: (projectId: string, args: { description: string; tags: string[]; thumbnails: string[] }) =>
        api<{ project: CloudProject & { thumbnailIds: string[] } }>(`/api/projects/${projectId}/publish`, { method: 'POST', body: JSON.stringify(args) }),

    unpublish: (projectId: string) =>
        api<{ project: CloudProject }>(`/api/projects/${projectId}/unpublish`, { method: 'POST' }),

    gallery: (params: { q?: string; sort?: 'recent' | 'popular'; page?: number } = {}) => {
        const qs = new URLSearchParams();
        if (params.q) qs.set('q', params.q);
        if (params.sort) qs.set('sort', params.sort);
        if (params.page) qs.set('page', String(params.page));
        return api<{ items: GalleryItem[]; page: number; hasMore: boolean }>(`/api/gallery?${qs}`);
    },
    galleryDetail: async (id: string) =>
        (await api<{ project: GalleryDetail }>(`/api/gallery/${id}`)).project,
    galleryState: (id: string) =>
        api<{ name: string; state: any }>(`/api/gallery/${id}/state`),
    report: (id: string, reason: string) =>
        api<{ success: boolean }>(`/api/gallery/${id}/report`, { method: 'POST', body: JSON.stringify({ reason }) }),

    // Forks a public project into a new private project owned by the caller, seeded from
    // its head commit. Server endpoint implemented in Task 19 (Phase 4).
    fork: (projectId: string) =>
        api<{ project: CloudProject }>(`/api/projects/${projectId}/fork`, { method: 'POST' }),
};
