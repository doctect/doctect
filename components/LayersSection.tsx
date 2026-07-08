import React from 'react';
import { ChevronRight, ChevronDown, Layers } from 'lucide-react';

interface LayersSectionProps {
    expanded: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}

// Collapsible "Layers" section for the right-hand properties column. The title row is
// always visible (so the panel is discoverable); the body renders only when expanded.
export const LayersSection: React.FC<LayersSectionProps> = ({ expanded, onToggle, children }) => (
    <div className="border-b bg-slate-50" data-testid="layers-section">
        <button
            type="button"
            onClick={onToggle}
            title="Layers"
            aria-expanded={expanded}
            className="w-full flex items-center gap-2 p-4 font-bold text-slate-700 hover:bg-slate-100"
        >
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <Layers size={16} />
            Layers
        </button>
        {expanded && <div data-testid="layers-section-body">{children}</div>}
    </div>
);
