import React, { useMemo, useState } from 'react';
import { Square, GitFork, Download } from 'lucide-react';
import { GalleryItem, API_BASE } from '../../services/cloudApi';
import { GalleryLink } from './GalleryLink';
import { StarRating } from './StarRating';

export type DirectorySortKey = 'name' | 'author' | 'rating' | 'downloads' | 'updated';
type SortDir = 'asc' | 'desc';

// Natural first-click direction per column: alphabetical columns ascend, metrics descend.
const DEFAULT_DIR: Record<DirectorySortKey, SortDir> = {
    name: 'asc', author: 'asc', rating: 'desc', downloads: 'desc', updated: 'desc',
};

export function sortItems(items: GalleryItem[], key: DirectorySortKey, dir: SortDir): GalleryItem[] {
    const mul = dir === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => {
        // Unrated projects sort last regardless of direction.
        if (key === 'rating') {
            if (a.ratingAvg == null && b.ratingAvg == null) return 0;
            if (a.ratingAvg == null) return 1;
            if (b.ratingAvg == null) return -1;
            return (a.ratingAvg - b.ratingAvg) * mul;
        }
        switch (key) {
            case 'name': return a.name.localeCompare(b.name) * mul;
            case 'author': return a.author.localeCompare(b.author) * mul;
            case 'downloads': return (a.downloadCount - b.downloadCount) * mul;
            // SQLite/ISO timestamps compare correctly as strings.
            case 'updated': return a.updatedAt.localeCompare(b.updatedAt) * mul;
        }
    });
}

const COLUMNS: { key: DirectorySortKey; label: string }[] = [
    { key: 'name', label: 'Name' },
    { key: 'author', label: 'Author' },
    { key: 'rating', label: 'Rating' },
    { key: 'downloads', label: 'Downloads' },
    { key: 'updated', label: 'Updated' },
];

export function GalleryDirectory({ items }: { items: GalleryItem[] }) {
    const [sortKey, setSortKey] = useState<DirectorySortKey>('updated');
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const sorted = useMemo(() => sortItems(items, sortKey, sortDir), [items, sortKey, sortDir]);

    const onHeader = (key: DirectorySortKey) => {
        if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        else { setSortKey(key); setSortDir(DEFAULT_DIR[key]); }
    };

    return (
        <div className="overflow-x-auto bg-white border rounded-xl">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b text-left">
                        <th className="w-12" aria-hidden />
                        {COLUMNS.map(c => (
                            <th key={c.key} className="px-3 py-2"
                                aria-sort={sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}>
                                <button onClick={() => onHeader(c.key)}
                                    className="font-semibold text-slate-600 hover:text-blue-600">
                                    {c.label}{sortKey === c.key && <span aria-hidden="true">{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>}
                                </button>
                            </th>
                        ))}
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Forks</th>
                    </tr>
                </thead>
                <tbody>
                    {sorted.map(i => (
                        <tr key={i.id} data-testid="directory-row" className="border-b last:border-b-0 hover:bg-slate-50">
                            <td className="pl-3 py-1.5">
                                {/* Bigger mouse target for the row's project link; aria-hidden +
                                    tabIndex=-1 keep the name link the row's only tab stop. */}
                                <GalleryLink projectId={i.id} tabIndex={-1} aria-hidden="true" className="block">
                                    <div className="w-8 aspect-[3/4] bg-slate-100 rounded overflow-hidden flex items-center justify-center">
                                        {i.thumbnailIds[0]
                                            ? <img src={`${API_BASE}/api/thumbnails/${i.thumbnailIds[0]}`} alt="" loading="lazy" className="w-full h-full object-cover" />
                                            : <Square size={12} className="text-slate-300" />}
                                    </div>
                                </GalleryLink>
                            </td>
                            <td className="px-3 py-1.5">
                                <GalleryLink projectId={i.id} className="font-medium text-slate-800 hover:text-blue-600">
                                    {i.name}
                                </GalleryLink>
                            </td>
                            <td className="px-3 py-1.5 text-slate-500">{i.author}</td>
                            <td className="px-3 py-1.5">
                                {i.ratingCount > 0
                                    ? <StarRating value={i.ratingAvg} count={i.ratingCount} size={12} />
                                    : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-3 py-1.5 text-slate-500"><span className="flex items-center gap-1"><Download size={12} /> {i.downloadCount}</span></td>
                            <td className="px-3 py-1.5 text-slate-500">{i.updatedAt.slice(0, 10)}</td>
                            <td className="px-3 py-1.5 text-slate-500"><span className="flex items-center gap-1"><GitFork size={12} /> {i.forkCount}</span></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
