import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Flag, Trash2 } from 'lucide-react';
import { ReviewDto, ApiError } from '../../services/cloudApi';
import { StarRating, StarRatingInput } from './StarRating';
import { UseGalleryDetailResult } from '../../hooks/useGalleryDetail';

interface Props {
    isOwner: boolean;
    session: UseGalleryDetailResult['session'];
    fromPath: string;
    ratingAvg: number | null;
    ratingCount: number;
    reviews: ReviewDto[];
    myReview: ReviewDto | null;
    onSave: (args: { rating: number; body: string }) => Promise<void>;
    onDelete: () => Promise<void>;
    onReport: (reviewId: string) => void;
}

export function ReviewsSection({ isOwner, session, fromPath, ratingAvg, ratingCount, reviews, myReview, onSave, onDelete, onReport }: Props) {
    const [rating, setRating] = useState(myReview?.rating ?? 0);
    const [body, setBody] = useState(myReview?.body ?? '');
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    // Pre-fill once my own review arrives (it loads async after mount).
    useEffect(() => {
        setRating(myReview?.rating ?? 0);
        setBody(myReview?.body ?? '');
    }, [myReview?.id, myReview?.updatedAt]);

    const save = async () => {
        setSaving(true);
        setFormError(null);
        try { await onSave({ rating, body: body.trim() }); }
        catch (e) { setFormError(e instanceof ApiError ? e.message : 'Could not save the review'); }
        finally { setSaving(false); }
    };

    const remove = async () => {
        setSaving(true);
        setFormError(null);
        try { await onDelete(); setRating(0); setBody(''); }
        catch { setFormError('Could not delete the review'); }
        finally { setSaving(false); }
    };

    const canWrite = !!session?.user?.username && !isOwner;

    return (
        <div className="mt-10">
            <div className="flex items-center gap-3 mb-3">
                <h2 className="text-sm font-semibold text-slate-700">Reviews</h2>
                <StarRating value={ratingAvg} count={ratingCount} />
            </div>

            {!isOwner && (
                !session?.user ? (
                    <Link to="/login" state={{ from: fromPath }} className="text-xs text-slate-500 hover:text-blue-600">Sign in to review</Link>
                ) : !session.user.username ? (
                    <Link to="/welcome" state={{ from: fromPath }} className="text-xs text-slate-500 hover:text-blue-600">Set a username to review</Link>
                ) : null
            )}

            {canWrite && (
                <div className="bg-white border rounded-xl p-4 mb-4 max-w-lg">
                    <div className="text-xs font-medium text-slate-600 mb-2">{myReview ? 'Your review' : 'Rate this project'}</div>
                    <StarRatingInput value={rating} onChange={setRating} />
                    <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={2000} rows={3}
                        placeholder="Share what you think (optional)"
                        className="w-full border rounded-lg px-3 py-2 text-sm mt-3" />
                    {formError && <div className="text-xs text-red-600 mt-1">{formError}</div>}
                    <div className="flex gap-2 mt-2">
                        <button onClick={save} disabled={saving || rating === 0}
                            className="bg-blue-600 text-white rounded-lg px-4 py-1.5 text-xs font-medium disabled:opacity-50">
                            {saving ? 'Saving…' : 'Save review'}
                        </button>
                        {myReview && (
                            <button onClick={remove} disabled={saving}
                                className="flex items-center gap-1 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-600 disabled:opacity-50">
                                <Trash2 size={12} /> Delete review
                            </button>
                        )}
                    </div>
                </div>
            )}

            {reviews.length === 0
                ? <div className="text-xs text-slate-400 mt-2">No reviews yet.</div>
                : (
                    <div className="space-y-3 mt-2 max-w-lg">
                        {reviews.map(r => (
                            <div key={r.id} className="bg-white border rounded-xl p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Link to={`/u/${r.author}`} className="text-xs font-semibold text-slate-700 hover:text-blue-600">{r.author}</Link>
                                        <StarRating value={r.rating} />
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-[10px] text-slate-400">{new Date(r.updatedAt).toLocaleDateString()}</span>
                                        <button onClick={() => onReport(r.id)} title="Report review"
                                            className="text-slate-300 hover:text-red-600"><Flag size={11} /></button>
                                    </div>
                                </div>
                                {r.body && <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{r.body}</p>}
                            </div>
                        ))}
                    </div>
                )}
        </div>
    );
}
