import React from 'react';
import { ChevronRight, ChevronDown, LucideIcon } from 'lucide-react';

interface CollapsibleSectionProps {
    title: string;
    icon?: LucideIcon;
    expanded: boolean;
    onToggle: () => void;
    testId?: string;
    children: React.ReactNode;
}

// Collapsible section for the right-hand properties column. The title row is
// always visible (so the section stays discoverable); the body renders only
// when expanded.
export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, icon: Icon, expanded, onToggle, testId, children }) => (
    <div className="border-b bg-slate-50" data-testid={testId}>
        <button
            type="button"
            onClick={onToggle}
            title={title}
            aria-expanded={expanded}
            className="w-full flex items-center gap-2 p-4 font-bold text-slate-700 hover:bg-slate-100"
        >
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            {Icon && <Icon size={16} />}
            {title}
        </button>
        {expanded && <div data-testid={testId ? `${testId}-body` : undefined}>{children}</div>}
    </div>
);
