import React from 'react';
import { useNavigate } from 'react-router-dom';
import { GitFork, Download } from 'lucide-react';
import { GalleryItem } from '../../services/cloudApi';
import { GalleryLink } from './GalleryLink';
import { RollingPreview } from './RollingPreview';
import { StarRating } from './StarRating';

export function ProjectCard({ item, showAuthor = true }: { item: GalleryItem; showAuthor?: boolean }) {
    const navigate = useNavigate();
    return (
        <GalleryLink projectId={item.id}
            className="group flex flex-col bg-white border rounded-xl overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-150">
            <div className="aspect-[3/4] bg-slate-100 overflow-hidden">
                <RollingPreview thumbnailIds={item.thumbnailIds} alt={item.name}
                    className="w-full h-full"
                    imgClassName="w-full h-full object-contain group-hover:scale-[1.03] transition-transform duration-200" />
            </div>
            <div className="p-3 flex flex-col gap-1 flex-1">
                <div className="text-sm font-semibold text-slate-800 truncate">{item.name}</div>
                {showAuthor && <div className="text-xs text-slate-500">by {item.author}</div>}
                {item.description && <div className="text-xs text-slate-500 line-clamp-2">{item.description}</div>}
                {item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                        {item.tags.slice(0, 3).map(t => (
                            <button key={t} type="button"
                                onClick={e => {
                                    // Filter by tag instead of following the surrounding card link.
                                    e.preventDefault();
                                    e.stopPropagation();
                                    navigate(`/gallery?tag=${encodeURIComponent(t)}`);
                                }}
                                className="text-[10px] bg-slate-100 text-slate-600 rounded-full px-2 py-0.5 hover:bg-blue-100 hover:text-blue-700 transition-colors">
                                {t}
                            </button>
                        ))}
                    </div>
                )}
                <div className="flex items-center justify-between mt-auto pt-1">
                    {item.ratingCount > 0 ? <StarRating value={item.ratingAvg} count={item.ratingCount} size={12} /> : <span />}
                    <span className="flex gap-3 text-[10px] text-slate-400">
                        <span className="flex items-center gap-0.5"><GitFork size={10} /> {item.forkCount}</span>
                        <span className="flex items-center gap-0.5"><Download size={10} /> {item.downloadCount}</span>
                    </span>
                </div>
            </div>
        </GalleryLink>
    );
}
