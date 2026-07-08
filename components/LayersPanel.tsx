import React, { useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronRight, Eye, EyeOff, GripVertical, Layers, Lock, Plus, Trash2, Unlock } from 'lucide-react';
import { Layer, PageTemplate, TemplateElement } from '../types';
import { addLayer, moveLayerToIndex, removeLayerFromTemplate } from '../services/layers';

const LAYER_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', ''];

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
            <div className="overflow-y-auto">
                {layers.map(layer => (
                    <div key={layer.id} data-testid={`layer-row-${layer.id}`}
                        draggable
                        onDragStart={() => setDragLayerId(layer.id)}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => handleDropOnLayer(layer.id)}
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
                        <span className="relative">
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
                ))}
                {/* Element rows are added in the next task */}
            </div>
        </div>
    );
};
