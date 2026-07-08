import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import {
    ChevronDown, ChevronRight, Circle, Eye, EyeOff, Grid3X3, GripVertical, Image as ImageIcon,
    Layers, Lock, Minus, Plus, Search, Square, Trash2, Triangle, Type, Unlock,
} from 'lucide-react';
import { Layer, PageTemplate, TemplateElement } from '../types';
import { addLayer, getElementLabel, moveElementsToLayer, moveLayerToIndex, removeLayerFromTemplate } from '../services/layers';

const LAYER_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', ''];

const TYPE_ICONS: Record<string, React.FC<any>> = {
    rect: Square, ellipse: Circle, triangle: Triangle, text: Type, grid: Grid3X3, line: Minus, svg: ImageIcon,
};

interface LayersPanelProps {
    template: PageTemplate;
    selectedElementIds: string[];
    activeLayerId?: string;
    onUpdateTemplate: (updates: Partial<PageTemplate>) => void;
    onUpdateElements: (elements: TemplateElement[], saveHistory?: boolean) => void;
    onSelectElements: (ids: string[]) => void;
    onSetActiveLayer: (layerId: string) => void;
}

export const LayersPanel: React.FC<LayersPanelProps> = ({
    template, selectedElementIds, activeLayerId,
    onUpdateTemplate, onUpdateElements, onSelectElements, onSetActiveLayer,
}) => {
    const layers = [...(template.layers ?? [])].sort((a, b) => b.order - a.order); // frontmost first
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [colorPickerId, setColorPickerId] = useState<string | null>(null);
    const [dragLayerId, setDragLayerId] = useState<string | null>(null);
    const [filter, setFilter] = useState('');
    const [dragElementId, setDragElementId] = useState<string | null>(null);

    // Dismiss the color popover when a mousedown lands outside it (or its chip).
    useEffect(() => {
        if (!colorPickerId) return;
        const onWindowMouseDown = (e: MouseEvent) => {
            if (!(e.target as HTMLElement)?.closest?.('[data-color-popover]')) setColorPickerId(null);
        };
        window.addEventListener('mousedown', onWindowMouseDown);
        return () => window.removeEventListener('mousedown', onWindowMouseDown);
    }, [colorPickerId]);

    const updateLayer = (id: string, updates: Partial<Layer>) => {
        onUpdateTemplate({ layers: (template.layers ?? []).map(l => (l.id === id ? { ...l, ...updates } : l)) });
    };

    const commitRename = () => {
        if (renamingId && renameValue.trim()) updateLayer(renamingId, { name: renameValue.trim() });
        setRenamingId(null);
    };

    const handleAdd = () => {
        const { layers: next, newLayer } = addLayer(template.layers ?? []);
        onUpdateTemplate({ layers: next });
        onSetActiveLayer(newLayer.id);
    };

    const handleDelete = (id: string) => {
        const next = removeLayerFromTemplate(template, id);
        if (next === template) return;
        onUpdateTemplate({ layers: next.layers });
        onUpdateElements(next.elements, true);
    };

    const handleDropOnLayer = (targetId: string) => {
        if (!dragLayerId || dragLayerId === targetId) { setDragLayerId(null); return; }
        const asc = [...(template.layers ?? [])].sort((a, b) => a.order - b.order);
        const targetIndex = asc.findIndex(l => l.id === targetId);
        onUpdateTemplate({ layers: moveLayerToIndex(template.layers ?? [], dragLayerId, targetIndex) });
        setDragLayerId(null);
    };

    return (
        <div data-testid="layers-panel" className="border-b border-slate-200 bg-white flex flex-col max-h-[45%] overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    <Layers size={13} /> Layers
                </div>
                <button title="Add layer" onClick={handleAdd}
                    className="p-1 rounded text-slate-500 hover:text-slate-700 hover:bg-slate-100">
                    <Plus size={14} />
                </button>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-100">
                <div className="flex items-center gap-1 flex-1 min-w-0 bg-slate-50 rounded px-1.5">
                    <Search size={11} className="text-slate-400 flex-shrink-0" />
                    <input value={filter} onChange={e => setFilter(e.target.value)}
                        placeholder="Filter elements…"
                        className="w-full bg-transparent py-1 text-xs outline-none" />
                </div>
                {selectedElementIds.length > 0 && (
                    <select data-testid="move-selection-select" value=""
                        title="Move selection to layer"
                        className="text-xs border border-slate-200 rounded py-1 max-w-[110px]"
                        onChange={e => {
                            if (!e.target.value) return;
                            onUpdateElements(moveElementsToLayer(template.elements, selectedElementIds, e.target.value), true);
                        }}>
                        <option value="">Move to…</option>
                        {layers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                )}
            </div>
            <div className="overflow-y-auto">
                {layers.map(layer => (
                    <React.Fragment key={layer.id}>
                    <div data-testid={`layer-row-${layer.id}`}
                        draggable
                        onDragStart={() => setDragLayerId(layer.id)}
                        onDragEnd={() => { setDragElementId(null); setDragLayerId(null); }}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => {
                            // Only retag when an element drag was actually in progress (no layer
                            // reorder underway) — an aborted element drag must not hijack a reorder.
                            if (dragElementId && !dragLayerId) {
                                onUpdateElements(moveElementsToLayer(template.elements, [dragElementId], layer.id), true);
                                setDragElementId(null);
                            } else {
                                handleDropOnLayer(layer.id);
                            }
                        }}
                        className={clsx('group flex items-center gap-1 px-2 py-1.5 border-b border-slate-50 text-sm',
                            activeLayerId === layer.id ? 'bg-blue-50' : 'hover:bg-slate-50')}>
                        <span title="Reorder layer" className="cursor-grab text-slate-300 group-hover:text-slate-400">
                            <GripVertical size={12} />
                        </span>
                        <button title="Collapse layer" className="text-slate-400"
                            onClick={() => updateLayer(layer.id, { collapsed: !layer.collapsed })}>
                            {layer.collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                        </button>
                        <button title="Toggle visibility" className="text-slate-500"
                            onClick={() => updateLayer(layer.id, { visible: !layer.visible })}>
                            {layer.visible ? <Eye size={13} /> : <EyeOff size={13} className="text-slate-300" />}
                        </button>
                        <button title="Toggle lock" className="text-slate-500"
                            onClick={() => updateLayer(layer.id, { locked: !layer.locked })}>
                            {layer.locked ? <Lock size={13} /> : <Unlock size={13} className="text-slate-300" />}
                        </button>
                        <span className="relative" data-color-popover>
                            <button title="Layer color"
                                className="w-3 h-3 rounded-full border border-slate-300"
                                style={{ backgroundColor: layer.color || 'transparent' }}
                                onClick={() => setColorPickerId(colorPickerId === layer.id ? null : layer.id)} />
                            {colorPickerId === layer.id && (
                                <span className="absolute left-0 top-4 z-40 flex gap-1 bg-white border border-slate-200 rounded p-1 shadow">
                                    {LAYER_COLORS.map(c => (
                                        <button key={c || 'none'} data-testid={`layer-color-swatch-${c || 'none'}`}
                                            className="w-3.5 h-3.5 rounded-full border border-slate-300"
                                            style={{ backgroundColor: c || 'transparent' }}
                                            onClick={() => { updateLayer(layer.id, { color: c || undefined }); setColorPickerId(null); }} />
                                    ))}
                                </span>
                            )}
                        </span>
                        {renamingId === layer.id ? (
                            <input autoFocus value={renameValue}
                                className="flex-1 min-w-0 px-1 py-0.5 text-sm border border-blue-300 rounded"
                                onChange={e => setRenameValue(e.target.value)}
                                onBlur={commitRename}
                                onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }} />
                        ) : (
                            <span data-testid="layer-name"
                                className={clsx('flex-1 min-w-0 truncate cursor-default', !layer.visible && 'text-slate-400')}
                                onClick={() => onSetActiveLayer(layer.id)}
                                onDoubleClick={() => { setRenamingId(layer.id); setRenameValue(layer.name); }}>
                                {layer.name}
                            </span>
                        )}
                        <button title="Delete layer" disabled={(template.layers ?? []).length <= 1}
                            className="p-0.5 text-slate-300 hover:text-red-500 disabled:opacity-30 disabled:hover:text-slate-300"
                            onClick={() => handleDelete(layer.id)}>
                            <Trash2 size={12} />
                        </button>
                    </div>
                    {!layer.collapsed && template.elements
                        .filter(el => el.layerId === layer.id)
                        .filter(el => {
                            if (!filter.trim()) return true;
                            const q = filter.trim().toLowerCase();
                            return getElementLabel(el).toLowerCase().includes(q) || el.type.includes(q);
                        })
                        .sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0))
                        .map(el => {
                            const Icon = TYPE_ICONS[el.type] || Square;
                            const isSelected = selectedElementIds.includes(el.id);
                            return (
                                <div key={el.id} data-testid={`element-row-${el.id}`}
                                    aria-selected={isSelected}
                                    draggable
                                    onDragStart={e => { e.stopPropagation(); setDragElementId(el.id); }}
                                    onDragEnd={() => { setDragElementId(null); setDragLayerId(null); }}
                                    onClick={() => onSelectElements([el.id])}
                                    className={clsx('flex items-center gap-1.5 pl-9 pr-2 py-1 text-xs cursor-pointer border-b border-slate-50',
                                        isSelected ? 'bg-blue-100 text-blue-800' : 'text-slate-500 hover:bg-slate-50')}>
                                    <Icon size={11} className="flex-shrink-0" />
                                    <span className="truncate">{getElementLabel(el)}</span>
                                </div>
                            );
                        })}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
};
