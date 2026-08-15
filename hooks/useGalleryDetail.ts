import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cloudApi, GalleryDetail, ApiError, MergeRequestDto, ReviewDto } from '../services/cloudApi';
import { IMPORT_STAGE_ERROR_MESSAGE, stageImport } from '../services/importProject';
import { downloadVariantsZip } from '../services/pdfService';
import { useSession } from '../lib/auth-client';

export interface UseGalleryDetailResult {
    project: GalleryDetail | null;
    error: string | null;
    importError: string | null;
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
    onCloneHistoryVersion: (args: { state: unknown; commitId: string }) => Promise<void>;
    reviews: ReviewDto[];
    myReview: ReviewDto | null;
    saveReview: (args: { rating: number; body: string }) => Promise<void>;
    deleteMyReview: () => Promise<void>;
    reportReview: (reviewId: string) => Promise<void>;
}

export function useGalleryDetail(id: string | undefined): UseGalleryDetailResult {
    const navigate = useNavigate();
    const location = useLocation();
    const { data: session } = useSession();
    const [project, setProject] = useState<GalleryDetail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [importError, setImportError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [mrs, setMrs] = useState<MergeRequestDto[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const forkAttemptRef = useRef<{
        sourceProjectId: string;
        sourceKey: string;
        payload: {
            name: string;
            state: unknown;
            cloud: { projectId: string; lastSyncedCommitId: string };
        };
    } | null>(null);
    const isOwner = !!(session?.user && project && (session.user as any).id === project.ownerId);

    useEffect(() => {
        if (!id) return;
        cloudApi.galleryDetail(id).then(setProject).catch(e => setError(e instanceof ApiError ? e.message : 'Not found'));
    }, [id]);

    useEffect(() => {
        if (isOwner && id) cloudApi.listIncomingMrs(id).then(setMrs).catch(() => {});
    }, [isOwner, id]);

    useEffect(() => {
        if (forkAttemptRef.current?.sourceProjectId !== id) forkAttemptRef.current = null;
    }, [id]);

    const openInEditor = async () => {
        if (!id) return;
        setBusy('open');
        setImportError(null);
        try {
            const res = await cloudApi.galleryState(id);
            await stageImport(
                { name: res.name, state: res.state },
                { sourceKey: `gallery-open:${id}` },
            );
            navigate('/app');
        } catch {
            setImportError(IMPORT_STAGE_ERROR_MESSAGE);
            setBusy(null);
        }
    };

    const fork = async () => {
        if (!id) return;
        setBusy('fork');
        setImportError(null);
        try {
            let attempt = forkAttemptRef.current;
            if (!attempt || attempt.sourceProjectId !== id) {
                const res = await cloudApi.fork(id);
                const commit = await cloudApi.getCommit(res.project.id, res.project.headCommitId!);
                attempt = {
                    sourceProjectId: id,
                    sourceKey: `gallery-fork:${res.project.id}:${commit.id}`,
                    payload: {
                        name: res.project.name,
                        state: commit.state,
                        cloud: { projectId: res.project.id, lastSyncedCommitId: commit.id },
                    },
                };
                forkAttemptRef.current = attempt;
            }
            await stageImport(attempt.payload, { sourceKey: attempt.sourceKey });
            forkAttemptRef.current = null;
            navigate('/app');
        } catch (e) {
            if (e instanceof ApiError && e.code === 'USERNAME_REQUIRED') {
                navigate('/welcome', { state: { from: location.pathname } });
                return;
            }
            setImportError(IMPORT_STAGE_ERROR_MESSAGE);
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

    const onCloneHistoryVersion = async ({
        state,
        commitId,
    }: { state: unknown; commitId: string }): Promise<void> => {
        if (!project) return;
        setBusy('history');
        try {
            await stageImport(
                { name: project.name, state },
                { sourceKey: `gallery-history:${project.id}:${commitId}` },
            );
            navigate('/app');
        } catch {
            throw new Error(IMPORT_STAGE_ERROR_MESSAGE);
        } finally {
            setBusy(null);
        }
    };

    const [reviews, setReviews] = useState<ReviewDto[]>([]);
    const [myReview, setMyReview] = useState<ReviewDto | null>(null);

    const loadReviews = () => {
        if (!id) return;
        cloudApi.listReviews(id)
            .then(r => { setReviews(r.reviews); setMyReview(r.myReview); })
            .catch(() => {});
    };
    // session in deps: myReview is caller-specific, so a sign-in/out must refetch.
    useEffect(loadReviews, [id, session?.user?.id]);

    const refreshAfterReviewChange = () => {
        loadReviews();
        if (id) cloudApi.galleryDetail(id).then(setProject).catch(() => {});
    };

    const saveReview = async ({ rating, body }: { rating: number; body: string }) => {
        if (!id) return;
        await cloudApi.putReview(id, { rating, body }); // ApiError propagates to the form
        refreshAfterReviewChange();
    };

    const deleteMyReview = async () => {
        if (!id) return;
        await cloudApi.deleteReview(id);
        refreshAfterReviewChange();
    };

    const reportReview = async (reviewId: string) => {
        const reason = window.prompt('Why are you reporting this review?');
        if (!reason || !id) return;
        try { await cloudApi.reportReview(id, reviewId, reason); window.alert('Thanks — the report was sent.'); }
        catch { window.alert('Could not send report.'); }
    };

    return {
        project, error, importError, busy, mrs, isOwner, showHistory, setShowHistory,
        fromPath: location.pathname, session,
        openInEditor, fork, downloadAllVariants, report, onCloneHistoryVersion,
        reviews, myReview, saveReview, deleteMyReview, reportReview,
    };
}
