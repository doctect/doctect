import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { Location } from 'react-router-dom';

export function GalleryLink({ projectId, className, children, tabIndex, 'aria-hidden': ariaHidden }: {
    projectId: string;
    className?: string;
    children: React.ReactNode;
    tabIndex?: number;
    'aria-hidden'?: React.AriaAttributes['aria-hidden'];
}) {
    const location = useLocation();
    const backgroundLocation = (location.state as { backgroundLocation?: Location } | null)?.backgroundLocation ?? location;
    return (
        <Link to={`/gallery/${projectId}`} state={{ backgroundLocation }} className={className}
            tabIndex={tabIndex} aria-hidden={ariaHidden}>
            {children}
        </Link>
    );
}
