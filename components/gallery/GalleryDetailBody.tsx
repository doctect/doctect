import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GitFork, Download, Flag, ExternalLink, History, Pencil } from 'lucide-react';
import { API_BASE } from '../../services/cloudApi';
import { HistoryModal } from '../cloud/HistoryModal';
import { LazyEditListingModal } from '../cloud/LazyEditListingModal';
import { UseGalleryDetailResult } from '../../hooks/useGalleryDetail';
import { GalleryLink } from './GalleryLink';
import { ProjectDescription } from './ProjectDescription';
import { StarRating } from './StarRating';
import { ReviewsSection } from './ReviewsSection';

export function GalleryDetailBody({ detail }: { detail: UseGalleryDetailResult }) {
    const navigate = useNavigate();
    const {
        project, busy, mrs, isOwner, session, fromPath,
        openInEditor, fork, downloadAllVariants, report,
        showHistory, setShowHistory, onCloneHistoryVersion,
        reviews, myReview, saveReview, deleteMyReview, reportReview,
    } = detail;
    const [editing, setEditing] = useState(false);
    if (!project) return null;

    return (
        <>
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
                <div className="mt-2"><StarRating value={project.ratingAvg} count={project.ratingCount} /></div>
                {project.forkedFrom && (
                    <div className="text-xs text-slate-400 mt-1">
                        forked from <GalleryLink projectId={project.forkedFrom.projectId} className="text-blue-600 hover:underline">
                            {project.forkedFrom.author}/{project.forkedFrom.name}</GalleryLink>
                    </div>
                )}
                <ProjectDescription text={project.description} />
                <div className="flex flex-wrap gap-1 mt-3">
                    {project.tags.map(t => (
                        <button key={t} type="button" onClick={() => navigate(`/gallery?tag=${encodeURIComponent(t)}`)}
                            className="text-[10px] bg-slate-200 text-slate-600 rounded-full px-2 py-0.5 hover:bg-blue-100 hover:text-blue-700 transition-colors">
                            {t}
                        </button>
                    ))}
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
                    <button onClick={() => setShowHistory(true)} disabled={busy !== null}
                        className="flex items-center justify-center gap-1.5 border border-slate-300 rounded-lg px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
                        <History size={14} /> Version history
                    </button>
                    {isOwner && (
                        <button onClick={() => setEditing(true)} disabled={busy !== null}
                            className="flex items-center justify-center gap-1.5 border border-slate-300 rounded-lg px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
                            <Pencil size={14} /> Edit listing
                        </button>
                    )}
                    {!session?.user ? (
                        <Link to="/login" state={{ from: fromPath }} className="text-center text-xs text-slate-500 hover:text-blue-600">Sign in to fork</Link>
                    ) : !session.user.username ? (
                        <Link to="/welcome" state={{ from: fromPath }} className="text-center text-xs text-slate-500 hover:text-blue-600">Set a username to fork</Link>
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
                <ReviewsSection
                    isOwner={isOwner}
                    session={session}
                    fromPath={fromPath}
                    ratingAvg={project.ratingAvg}
                    ratingCount={project.ratingCount}
                    reviews={reviews}
                    myReview={myReview}
                    onSave={saveReview}
                    onDelete={deleteMyReview}
                    onReport={reportReview}
                />
            </div>
            {showHistory && (
                <HistoryModal
                    cloudProjectId={project.id}
                    mode="clone"
                    onClone={onCloneHistoryVersion}
                    onClose={() => setShowHistory(false)}
                />
            )}
            {editing && (
                <LazyEditListingModal
                    projectId={project.id}
                    onClose={() => setEditing(false)}
                    // A full reload is the honest refresh here: useGalleryDetail fetches once per
                    // id and exposes no refetch handle, and this body also renders inside
                    // GalleryDetailModal, where a router navigation would close the overlay.
                    onSaved={() => { setEditing(false); window.location.reload(); }}
                />
            )}
        </>
    );
}
