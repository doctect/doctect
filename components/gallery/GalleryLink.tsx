import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { Location } from 'react-router-dom';

export function GalleryLink({ projectId, className, children }: { projectId: string; className?: string; children: React.ReactNode }) {
    const location = useLocation();
    const backgroundLocation = (location.state as { backgroundLocation?: Location } | null)?.backgroundLocation ?? location;
    return (
        <Link to={`/gallery/${projectId}`} state={{ backgroundLocation }} className={className}>
            {children}
        </Link>
    );
}
