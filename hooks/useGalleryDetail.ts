import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cloudApi, GalleryDetail, ApiError, MergeRequestDto } from '../services/cloudApi';
import { stageImport } from '../services/importProject';
import { downloadVariantsZip } from '../services/pdfService';
import { useSession } from '../lib/auth-client';

export interface UseGalleryDetailResult {
    project: GalleryDetail | null;
    error: string | null;
    busy: string | null;
    mrs: MergeRequestDto[];
    isOwner: boolean;
    showHistory: boolean;
    setShowHistory: (v: boolean) => void;
    fromPath: string;
    session: ReturnType<typeof useSession>['data'];
    openInEditor: () => Promise<void>;
    fork: () => Promise<void>;
    downloadAllVariants: () => Promise<void>;
    report: () => Promise<void>;
    onCloneHistoryVersion: (args: { state: any }) => void;
}

export function useGalleryDetail(id: string | undefined): UseGalleryDetailResult {
    const navigate = useNavigate();
    const location = useLocation();
    const { data: session } = useSession();
    const [project, setProject] = useState<GalleryDetail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [mrs, setMrs] = useState<MergeRequestDto[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const isOwner = !!(session?.user && project && (session.user as any).id === project.ownerId);

    useEffect(() => {
        if (!id) return;
        cloudApi.galleryDetail(id).then(setProject).catch(e => setError(e instanceof ApiError ? e.message : 'Not found'));
    }, [id]);

    useEffect(() => {
        if (isOwner && id) cloudApi.listIncomingMrs(id).then(setMrs).catch(() => {});
    }, [isOwner, id]);

    const openInEditor = async () => {
        if (!id) return;
        setBusy('open');
        try {
            const res = await cloudApi.galleryState(id);
            stageImport({ name: res.name, state: res.state });
            navigate('/app');
        } catch { setError('Could not load project'); setBusy(null); }
    };

    const fork = async () => {
        if (!id) return;
        setBusy('fork');
        try {
            const res = await cloudApi.fork(id);
            const commit = await cloudApi.getCommit(res.project.id, res.project.headCommitId!);
            stageImport({
                name: res.project.name,
                state: commit.state,
                cloud: { projectId: res.project.id, lastSyncedCommitId: commit.id }
            });
            navigate('/app');
        } catch (e) {
            if (e instanceof ApiError && e.code === 'USERNAME_REQUIRED') {
                navigate('/welcome', { state: { from: location.pathname } });
                return;
            }
            setError(e instanceof ApiError ? e.message : 'Fork failed');
            setBusy(null);
        }
    };

    const downloadAllVariants = async () => {
        if (!id || !project) return;
        setBusy('download');
        try {
            const res = await cloudApi.galleryState(id);
            await downloadVariantsZip(res.state, res.name);
        } catch {
            setError('Could not generate the PDF download');
        } finally {
            setBusy(null);
        }
    };

    const report = async () => {
        const reason = window.prompt('Why are you reporting this project?');
        if (!reason || !id) return;
        try { await cloudApi.report(id, reason); window.alert('Thanks — the report was sent.'); }
        catch { window.alert('Could not send report.'); }
    };

    const onCloneHistoryVersion = ({ state }: { state: any }) => {
        if (!project) return;
        stageImport({ name: project.name, state });
        navigate('/app');
    };

    return {
        project, error, busy, mrs, isOwner, showHistory, setShowHistory,
        fromPath: location.pathname, session,
        openInEditor, fork, downloadAllVariants, report, onCloneHistoryVersion,
    };
}
