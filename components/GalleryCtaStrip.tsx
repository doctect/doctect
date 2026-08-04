import React, { useEffect, useState } from 'react';
import { cloudApi, GalleryItem, API_BASE } from '../services/cloudApi';

// Tiny live preview row inside the landing hero's gallery CTA. Purely decorative:
// while loading, on any error, or with no thumbnails it renders nothing at all.
export function GalleryCtaStrip() {
    const [items, setItems] = useState<GalleryItem[]>([]);
    useEffect(() => {
        cloudApi.gallery({ limit: 4 }).then(res => setItems(res.items)).catch(() => {});
    }, []);
    const thumbs = items.filter(i => i.thumbnailId);
    if (thumbs.length === 0) return null;
    return (
        <span className="flex -space-x-2 mr-1">
            {thumbs.map(i => (
                <img key={i.id} src={`${API_BASE}/api/thumbnails/${i.thumbnailId}`} alt={i.name}
                    className="w-7 h-9 object-cover rounded border-2 border-white shadow-sm" />
            ))}
        </span>
    );
}
