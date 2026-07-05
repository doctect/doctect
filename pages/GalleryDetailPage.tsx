import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, GitFork, Download, Flag, ExternalLink } from 'lucide-react';
import { cloudApi, GalleryDetail, ApiError, API_BASE, MergeRequestDto } from '../services/cloudApi';
import { stageImport } from '../services/importProject';
import { downloadVariantsZip } from '../services/pdfService';
import { useSession } from '../lib/auth-client';
import { AccountMenu } from '../components/AccountMenu';

export function GalleryDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { data: session } = useSession();
    const [project, setProject] = useState<GalleryDetail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [mrs, setMrs] = useState<MergeRequestDto[]>([]);
    // `isOwner` must be hooked in above any early return (hooks can't run conditionally), so it's
    // computed null-safely here rather than after the `!project` guard below.
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

    if (error) return <div className="p-10 text-sm text-red-600">{error} — <Link className="text-blue-600" to="/gallery">back to gallery</Link></div>;
    if (!project) return <div className="p-10 text-sm text-slate-400">Loading…</div>;

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="h-14 bg-white border-b flex items-center px-6 gap-4">
                <Link to="/gallery" className="flex items-center gap-1 text-sm text-slate-600 hover:text-blue-600"><ArrowLeft size={14} /> Gallery</Link>
                <div className="flex-1" />
                <AccountMenu />
            </header>
            <main className="max-w-4xl mx-auto p-6 grid md:grid-cols-2 gap-8">
                <div className="space-y-3">
                    {project.thumbnailIds.map(tid => (
                        <img key={tid} src={`${API_BASE}/api/thumbnails/${tid}`} alt="" className="w-full border rounded-xl bg-white" />
                    ))}
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">{project.name}</h1>
                    <div className="text-sm text-slate-500 mt-1">
                        by <Link to={`/u/${project.author}`} className="text-blue-600 hover:underline">{project.author}</Link>
                    </div>
                    {project.forkedFrom && (
                        <div className="text-xs text-slate-400 mt-1">
                            forked from <Link to={`/gallery/${project.forkedFrom.projectId}`} className="text-blue-600 hover:underline">
                                {project.forkedFrom.author}/{project.forkedFrom.name}</Link>
                        </div>
                    )}
                    <p className="text-sm text-slate-600 mt-4 whitespace-pre-wrap">{project.description}</p>
                    <div className="flex flex-wrap gap-1 mt-3">
                        {project.tags.map(t => <span key={t} className="text-[10px] bg-slate-200 text-slate-600 rounded-full px-2 py-0.5">{t}</span>)}
                    </div>
                    <div className="flex gap-4 mt-4 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><GitFork size={12} /> {project.forkCount} forks</span>
                        <span className="flex items-center gap-1"><Download size={12} /> {project.downloadCount} downloads</span>
                    </div>
                    <div className="flex flex-col gap-2 mt-6 max-w-xs">
                        <button onClick={openInEditor} disabled={busy !== null}
                            className="flex items-center justify-center gap-1.5 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
                            <ExternalLink size={14} /> {busy === 'open' ? 'Loading…' : 'Open in editor'}
                        </button>
                        <button onClick={downloadAllVariants} disabled={busy !== null}
                            className="flex items-center justify-center gap-1.5 border border-slate-300 rounded-lg px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
                            <Download size={14} /> {busy === 'download' ? 'Generating…' : 'Download all variants (.zip)'}
                        </button>
                        {!session?.user ? (
                            <Link to="/login" state={{ from: location.pathname }} className="text-center text-xs text-slate-500 hover:text-blue-600">Sign in to fork</Link>
                        ) : !session.user.username ? (
                            <Link to="/welcome" state={{ from: location.pathname }} className="text-center text-xs text-slate-500 hover:text-blue-600">Set a username to fork</Link>
                        ) : (
                            <button onClick={fork} disabled={busy !== null}
                                className="flex items-center justify-center gap-1.5 border border-slate-300 rounded-lg px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
                                <GitFork size={14} /> {busy === 'fork' ? 'Forking…' : 'Fork this project'}
                            </button>
                        )}
                        <button onClick={report} className="flex items-center justify-center gap-1 text-[11px] text-slate-400 hover:text-red-600 mt-2">
                            <Flag size={11} /> Report
                        </button>
                    </div>
                    {isOwner && mrs.length > 0 && (
                        <div className="mt-8">
                            <h2 className="text-sm font-semibold text-slate-700 mb-2">Merge requests</h2>
                            <div className="border rounded-lg divide-y bg-white">
                                {mrs.map(mr => (
                                    <Link key={mr.id} to={`/mr/${mr.id}`} className="flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50">
                                        <span className="truncate">{mr.title} <span className="text-slate-400">by {mr.authorUsername}</span></span>
                                        <span className="text-[10px] uppercase font-semibold text-slate-500">{mr.status}</span>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
