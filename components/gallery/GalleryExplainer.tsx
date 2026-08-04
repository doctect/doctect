import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useSession } from '../../lib/auth-client';

const DISMISS_KEY = 'gallery-explainer-dismissed';

const STEPS = [
    { n: '①', title: 'Browse', text: 'Real, finished document products' },
    { n: '②', title: 'Open in editor', text: 'Free, instantly, no account' },
    { n: '③', title: 'Make it yours', text: 'Edit, fork, republish' },
];

export function GalleryExplainer() {
    const { data: session } = useSession();
    const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');
    if (session?.user || dismissed) return null;
    return (
        <div className="relative flex flex-col sm:flex-row gap-4 sm:gap-8 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl px-5 py-4 mb-6">
            {STEPS.map(s => (
                <div key={s.title} className="flex-1">
                    <div className="text-sm font-semibold text-slate-800">{s.n} {s.title}</div>
                    <div className="text-xs text-slate-500">{s.text}</div>
                </div>
            ))}
            <button aria-label="Dismiss" onClick={() => { localStorage.setItem(DISMISS_KEY, '1'); setDismissed(true); }}
                className="absolute top-2 right-2 text-slate-400 hover:text-slate-600">
                <X size={14} />
            </button>
        </div>
    );
}
