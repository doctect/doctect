import React, { useEffect, useRef } from 'react';
import { TemplateElement } from '../../types';
import { getElementLabel } from '../../services/layers';

interface SelectUnderMenuProps {
    position: { x: number; y: number };
    items: { element: TemplateElement; layerName: string }[];
    onSelect: (id: string) => void;
    onClose: () => void;
}

export const SelectUnderMenu: React.FC<SelectUnderMenuProps> = ({ position, items, onSelect, onClose }) => {
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
        >
            <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-slate-400">Select element</div>
            {items.map(({ element, layerName }) => (
                <button
                    key={element.id}
                    data-menu-element-id={element.id}
                    className="w-full flex items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-blue-50 text-slate-700"
                    onMouseDown={e => e.stopPropagation()}
                    onClick={() => { onSelect(element.id); onClose(); }}
                >
                    <span className="truncate">{getElementLabel(element)}</span>
                    <span className="flex-shrink-0 text-[10px] text-slate-400">{element.type} · {layerName}</span>
                </button>
            ))}
        </div>
    );
};
