import React, { useEffect, useRef, useState } from 'react';
import { Square } from 'lucide-react';
import { API_BASE } from '../../services/cloudApi';

const thumbUrl = (id: string) => `${API_BASE}/api/thumbnails/${id}`;

const prefersReducedMotion = () =>
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function RollingPreview({ thumbnailIds = [], alt, autoPlay = false, intervalMs = 700, className = '', imgClassName = '' }: {
    thumbnailIds: string[];
    alt: string;
    autoPlay?: boolean;
    intervalMs?: number;
    className?: string;
    imgClassName?: string;
}) {
    const [index, setIndex] = useState(0);
    const [hovered, setHovered] = useState(false);
    const preloaded = useRef(false);
    const cycling = (autoPlay || hovered) && thumbnailIds.length > 1 && !prefersReducedMotion();

    useEffect(() => {
        if (!cycling) return;
        if (!preloaded.current) {
            preloaded.current = true;
            thumbnailIds.slice(1).forEach(id => { new Image().src = thumbUrl(id); });
        }
        const t = setInterval(() => setIndex(i => (i + 1) % thumbnailIds.length), intervalMs);
        return () => clearInterval(t);
    }, [cycling, intervalMs, thumbnailIds]);

    // A deleted/re-published listing can shrink the id list under a live index.
    const safeIndex = index < thumbnailIds.length ? index : 0;

    return (
        <div data-testid="rolling-preview" className={`relative ${className}`}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => { setHovered(false); if (!autoPlay) setIndex(0); }}>
            {thumbnailIds.length === 0
                ? <div className="w-full h-full flex items-center justify-center"><Square size={32} className="text-slate-300" /></div>
                : <img src={thumbUrl(thumbnailIds[safeIndex])} alt={alt} loading="lazy" className={imgClassName} />}
            {thumbnailIds.length > 1 && (
                <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1">
                    {thumbnailIds.map((id, i) => (
                        <span key={id} role="button" tabIndex={-1} aria-label={`Preview page ${i + 1}`}
                            onClick={e => { e.preventDefault(); e.stopPropagation(); setIndex(i); }}
                            className={`w-1.5 h-1.5 rounded-full transition-colors ${i === safeIndex ? 'bg-blue-500' : 'bg-slate-300/80'}`} />
                    ))}
                </div>
            )}
        </div>
    );
}
