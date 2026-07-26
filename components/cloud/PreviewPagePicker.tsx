import React from 'react';
import { MAX_PREVIEWS } from '../../constants/previews';

export interface PreviewPage {
    id: string;
    title: string;
}

interface PreviewPagePickerProps {
    pages: PreviewPage[];
    selected: string[];
    onChange: (next: string[]) => void;
}

/**
 * The one place the MAX_PREVIEWS upper bound is implemented. Selection order is
 * publish order, and position 0 is the image the gallery card shows.
 *
 * The matching lower bound is NOT here: a picker with nothing ticked is a legal
 * intermediate state while the user re-picks. Each host enforces "at least one"
 * when it submits -- see PublishModal's `selected.length === 0` guard.
 *
 * The cap gates additions, not what it is given: a `selected` longer than
 * MAX_PREVIEWS (a listing published under a larger cap, say) renders fully ticked
 * and can only be shrunk, because unticking boxes on the host's behalf would
 * misreport what is published. generateThumbnails renders at most MAX_PREVIEWS
 * pages, so an over-long selection still cannot reach the server.
 */
export function PreviewPagePicker({ pages, selected, onChange }: PreviewPagePickerProps) {
    const toggle = (id: string) => {
        if (selected.includes(id)) {
            onChange(selected.filter(x => x !== id));
        } else if (selected.length < MAX_PREVIEWS) {
            onChange([...selected, id]);
        }
    };

    return (
        <div>
            <span className="text-xs font-medium text-slate-600">Preview pages (up to {MAX_PREVIEWS})</span>
            <p className="text-[10px] text-slate-400">The first page you pick is the cover shown on the gallery card.</p>
            <div className="mt-1 max-h-40 overflow-y-auto border rounded divide-y">
                {pages.map(p => (
                    <label key={p.id} className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-slate-50 cursor-pointer">
                        <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
                        <span className="truncate">{p.title}</span>
                    </label>
                ))}
            </div>
        </div>
    );
}
