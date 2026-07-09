import React, { useEffect, useRef } from 'react';
import clsx from 'clsx';
import { TemplateElement } from '../../types';
import { getElementLabel } from '../../services/layers';

interface SelectUnderMenuProps {
    position: { x: number; y: number };
    items: { element: TemplateElement; layerName: string }[];
    selectedIds?: string[];
    /** additive = shift-click: toggle into the selection; the menu stays open. */
    onSelect: (id: string, additive: boolean) => void;
    onClose: () => void;
    /** Fired with the hovered entry's element id, and null when the pointer leaves the menu. */
    onHover?: (id: string | null) => void;
}

export const SelectUnderMenu: React.FC<SelectUnderMenuProps> = ({ position, items, selectedIds = [], onSelect, onClose, onHover }) => {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        const onDown = (e: globalThis.MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        window.addEventListener('keydown', onKey);
        window.addEventListener('mousedown', onDown);
        return () => {
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('mousedown', onDown);
        };
    }, [onClose]);

    return (
        <div
            ref={ref}
            data-testid="select-under-menu"
            className="fixed z-50 min-w-[200px] max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl py-1 text-sm"
            style={{ left: position.x, top: position.y }}
            onContextMenu={e => e.preventDefault()}
            onMouseLeave={() => onHover?.(null)}
        >
            <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-slate-400">Select element · shift-click to add</div>
            {items.map(({ element, layerName }) => {
                const isSelected = selectedIds.includes(element.id);
                return (
                    <button
                        key={element.id}
                        data-menu-element-id={element.id}
                        aria-selected={isSelected}
                        className={clsx('w-full flex items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-blue-50',
                            isSelected ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700')}
                        onMouseDown={e => e.stopPropagation()}
                        onMouseEnter={() => onHover?.(element.id)}
                        onClick={e => { onSelect(element.id, e.shiftKey); if (!e.shiftKey) onClose(); }}
                    >
                        <span className="truncate">{getElementLabel(element)}</span>
                        <span className="flex-shrink-0 text-[10px] text-slate-400">{element.type} · {layerName}</span>
                    </button>
                );
            })}
        </div>
    );
};
