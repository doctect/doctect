import React from 'react';
import { ChevronRight, ChevronDown, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';

interface CollapsibleSectionProps {
    title: string;
    icon?: LucideIcon;
    expanded: boolean;
    onToggle: () => void;
    testId?: string;
    variant?: 'default' | 'compact';
    children: React.ReactNode;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
    title, icon: Icon, expanded, onToggle, testId, variant = 'default', children,
}) => {
    const compact = variant === 'compact';
    return (
        <div
            className={clsx(compact ? 'border-t border-slate-200 pt-3' : 'border-b bg-slate-50')}
            data-testid={testId}
        >
            <button
                type="button"
                onClick={onToggle}
                title={title}
                aria-expanded={expanded}
                className={clsx(
                    'w-full flex items-center text-slate-700 hover:bg-slate-100',
                    compact
                        ? 'gap-1.5 rounded py-1 text-xs font-semibold uppercase'
                        : 'gap-2 p-4 font-bold',
                )}
            >
                {expanded ? <ChevronDown size={compact ? 12 : 16} /> : <ChevronRight size={compact ? 12 : 16} />}
                {Icon && <Icon size={compact ? 12 : 16} />}
                {title}
            </button>
            {expanded && (
                <div
                    className={compact ? 'pt-2' : undefined}
                    data-testid={testId ? `${testId}-body` : undefined}
                >
                    {children}
                </div>
            )}
        </div>
    );
};
