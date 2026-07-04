const KEY = 'hype_import_pending';

export interface ImportPayload {
    name: string;
    state: any;
    cloud?: { projectId: string; lastSyncedCommitId: string };
}

export const stageImport = (payload: ImportPayload) => {
    localStorage.setItem(KEY, JSON.stringify(payload));
};

export const consumeImport = (): ImportPayload | null => {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    localStorage.removeItem(KEY);
    try { return JSON.parse(raw); } catch { return null; }
};
