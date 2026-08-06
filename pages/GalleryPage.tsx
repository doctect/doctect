import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, X, ArrowLeft } from 'lucide-react';
import { cloudApi, GalleryItem, GalleryTag } from '../services/cloudApi';
import { AppHeader } from '../components/AppHeader';
import { ProjectCard } from '../components/gallery/ProjectCard';
import { GalleryExplainer } from '../components/gallery/GalleryExplainer';
import { Spotlight } from '../components/gallery/Spotlight';
import { GalleryDirectory } from '../components/gallery/GalleryDirectory';
import { groupCatalog, pickSpotlight, dateKey } from '../components/gallery/sections';

function SkeletonGrid({ count }: { count: number }) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: count }, (_, i) => (
                <div key={i} data-testid="skeleton-card" className="bg-white border rounded-xl overflow-hidden animate-pulse">
                    <div className="aspect-[3/4] bg-slate-100" />
                    <div className="p-3 space-y-2">
                        <div className="h-3.5 bg-slate-200 rounded w-3/4" />
                        <div className="h-3 bg-slate-200 rounded w-1/2" />
                    </div>
                </div>
            ))}
        </div>
    );
}

export function GalleryPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const qParam = searchParams.get('q') ?? '';
    const tagParam = searchParams.get('tag') ?? '';
    const sortParam = searchParams.get('sort') ?? '';
    const page = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10) || 0);
    const isFiltered = !!(qParam || tagParam || sortParam);
    const viewParam = searchParams.get('view') ?? '';
    const isDirectory = !isFiltered && viewParam === 'all';

    const [qInput, setQInput] = useState(qParam);
    const [tags, setTags] = useState<GalleryTag[]>([]);
    const [items, setItems] = useState<GalleryItem[] | null>(null);   // grid mode; null = loading
    const [hasMore, setHasMore] = useState(false);
    const [catalog, setCatalog] = useState<GalleryItem[] | null>(null);   // sections mode; null = loading
    const [error, setError] = useState<string | null>(null);

    const setParam = (key: string, value: string | null) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (value) next.set(key, value); else next.delete(key);
            if (key !== 'page') next.delete('page');
            return next;
        });
    };

    // Debounce the search box into ?q= so filtered views stay shareable/bookmarkable.
    useEffect(() => {
        const t = setTimeout(() => {
            if (qInput === qParam) return;
            setSearchParams(prev => {
                const next = new URLSearchParams(prev);
                if (qInput) next.set('q', qInput); else next.delete('q');
                next.delete('page');
                return next;
            }, { replace: true });
        }, 250);
        return () => clearTimeout(t);
    }, [qInput]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { setQInput(qParam); }, [qParam]);

    useEffect(() => {
        cloudApi.galleryTags().then(setTags).catch(() => {});
    }, []);

    // Sections mode: one sweep of the whole (small) catalog, grouped client-side.
    useEffect(() => {
        if (isFiltered) return;
        setCatalog(null);
        cloudApi.galleryAll()
            .then(items => { setCatalog(items); setError(null); })
            .catch(() => setError('Could not load the gallery.'));
    }, [isFiltered]);

    // Grid mode: one filtered, paginated fetch.
    useEffect(() => {
        if (!isFiltered) return;
        setItems(null);
        const sort = sortParam === 'popular' || sortParam === 'rating' ? sortParam : 'recent';
        cloudApi.gallery({ q: qParam || undefined, tag: tagParam || undefined, sort, page })
            .then(res => { setItems(res.items); setHasMore(res.hasMore); setError(null); })
            .catch(() => setError('Could not load the gallery.'));
    }, [isFiltered, qParam, tagParam, sortParam, page]);

    const clearFilters = () => { setQInput(''); setSearchParams({}); };
    const grouped = useMemo(() => catalog ? groupCatalog(catalog) : null, [catalog]);
    const spotlight = useMemo(() => catalog ? pickSpotlight(catalog, dateKey(new Date())) : null, [catalog]);
    const galleryEmpty = catalog !== null && catalog.length === 0;

    return (
        // h-screen + overflow-y-auto: index.html sets body{overflow:hidden}, so each page owns its scrolling
        <div className="h-screen overflow-y-auto bg-slate-50">
            <AppHeader />
            <div className="bg-white border-b flex items-center px-6 py-3 gap-4 sticky top-14 z-10">
                <div className="flex-1 max-w-md relative">
                    <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                    <input value={qInput} onChange={e => setQInput(e.target.value)}
                        placeholder="Search planners and notebooks…"
                        className="w-full border rounded-lg pl-8 pr-3 py-1.5 text-sm" />
                </div>
                {!isFiltered && !isDirectory && (
                    <button onClick={() => setParam('view', 'all')}
                        className="text-xs text-blue-600 hover:underline whitespace-nowrap">
                        All projects
                    </button>
                )}
                {isFiltered && (
                    <select value={sortParam || 'recent'} onChange={e => setParam('sort', e.target.value)}
                        className="border rounded-lg px-2 py-1.5 text-sm">
                        <option value="recent">Newest</option>
                        <option value="popular">Popular</option>
                        <option value="rating">Top rated</option>
                    </select>
                )}
            </div>

            <main className="max-w-6xl mx-auto p-6">
                {error && <div className="text-sm text-red-600">{error}</div>}

                {!isFiltered ? (
                    catalog === null && !error ? <SkeletonGrid count={8} />
                    : galleryEmpty
                        ? <div className="text-sm text-slate-400 text-center py-16">Nothing here yet. Publish the first project!</div>
                        : isDirectory && catalog ? (
                            <>
                                <div className="flex items-center gap-3 mb-4">
                                    <button onClick={() => setParam('view', null)}
                                        className="flex items-center gap-1 text-xs text-slate-600 hover:text-blue-600">
                                        <ArrowLeft size={12} /> Gallery
                                    </button>
                                    <h1 className="text-sm font-semibold text-slate-700">All projects ({catalog.length})</h1>
                                </div>
                                <GalleryDirectory items={catalog} />
                            </>
                        ) : <>
                            <GalleryExplainer />
                            {spotlight && <Spotlight item={spotlight} />}
                            {grouped?.strips.map(({ def, items: stripItems }) => (
                                <section key={def.key} className="mt-8 first:mt-2">
                                    <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                                        <span aria-hidden>{def.emoji}</span> {def.title}
                                    </h2>
                                    <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
                                        {stripItems.map(i => <div key={i.id} className="w-44 shrink-0"><ProjectCard item={i} /></div>)}
                                    </div>
                                </section>
                            ))}
                            {grouped && grouped.leftover.length > 0 && (
                                <section className="mt-8">
                                    <div className="flex items-center justify-between mb-3">
                                        <h2 className="text-sm font-semibold text-slate-700">More to explore</h2>
                                        <button onClick={() => setParam('view', 'all')}
                                            className="text-xs text-blue-600 hover:underline">See all →</button>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                        {grouped.leftover.map(i => <ProjectCard key={i.id} item={i} />)}
                                    </div>
                                </section>
                            )}
                            <button onClick={() => setParam('view', 'all')}
                                className="block w-full mt-10 border rounded-xl bg-white hover:border-blue-300 hover:text-blue-700 text-sm text-slate-700 font-medium py-3 text-center transition-colors">
                                Browse all {catalog?.length ?? 0} projects →
                            </button>
                            {tags.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-6 pt-6 border-t">
                                    {tags.map(t => (
                                        <button key={t.tag} onClick={() => setParam('tag', t.tag)}
                                            className="text-xs bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-700 rounded-full px-3 py-1 transition-colors">
                                            {t.tag} <span className="text-slate-400">({t.count})</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
                ) : (
                    <>
                        <div className="flex items-center gap-3 mb-4">
                            <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-slate-600 hover:text-blue-600">
                                <ArrowLeft size={12} /> All projects
                            </button>
                            {tagParam && (
                                <span className="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 rounded-full px-3 py-1">
                                    {tagParam}
                                    <button onClick={() => setParam('tag', null)} aria-label="Remove tag filter" className="hover:text-blue-900">
                                        <X size={12} />
                                    </button>
                                </span>
                            )}
                        </div>
                        {items === null ? (
                            <SkeletonGrid count={8} />
                        ) : items.length === 0 ? (
                            <div className="text-center py-16">
                                <div className="text-sm text-slate-400">No projects match.</div>
                                <button onClick={clearFilters} className="text-xs text-blue-600 hover:underline mt-2">Clear filters</button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {items.map(item => <ProjectCard key={item.id} item={item} />)}
                            </div>
                        )}
                        <div className="flex justify-center gap-2 mt-6">
                            {page > 0 && <button onClick={() => setParam('page', String(page - 1))} className="text-xs px-3 py-1.5 border rounded">Previous</button>}
                            {hasMore && <button onClick={() => setParam('page', String(page + 1))} className="text-xs px-3 py-1.5 border rounded">Next</button>}
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
