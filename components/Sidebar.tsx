
import React, { useState } from 'react';
import { AppState, AppNode, PageTemplate, Variant } from '../types';
import { Layers, LayoutTemplate, Plus, Trash2, Copy, Pencil, Check, X } from 'lucide-react';
import clsx from 'clsx';
import { NodeItem } from './sidebar/NodeItem';
import { TemplateItem } from './sidebar/TemplateItem';

interface SidebarProps {
    state: AppState;
    onSelectNode: (id: string) => void;
    onAddNode: (parentId: string | null) => void;
    onAddReference: (parentId: string) => void;
    onDeleteNode: (id: string) => void;
    onUpdateNode: (id: string, updates: Partial<AppNode>) => void;
    onSelectTemplate: (id: string) => void;
    onAddTemplate: () => void;
    onDeleteTemplate: (id: string) => void;
    onUpdateTemplateName: (id: string, name: string) => void;
    onChangeViewMode: (mode: 'hierarchy' | 'templates') => void;
    onSelectVariant?: (id: string) => void;
    onAddVariant?: () => void;
    onRenameVariant?: (id: string, name: string) => void;
    onDeleteVariant?: (id: string) => void;
    onDuplicateVariant?: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = (props) => {
    const activeVariant = props.state.variants[props.state.activeVariantId];
    const variantList = Object.values(props.state.variants || {});
    const [isEditingVariantName, setIsEditingVariantName] = useState(false);
    const [editingName, setEditingName] = useState('');

    const handleStartRename = () => {
        setEditingName(activeVariant?.name || '');
        setIsEditingVariantName(true);
    };

    const handleSaveRename = () => {
        if (editingName.trim() && props.onRenameVariant && activeVariant) {
            props.onRenameVariant(activeVariant.id, editingName.trim());
        }
        setIsEditingVariantName(false);
    };

    const handleCancelRename = () => {
        setIsEditingVariantName(false);
    };

    return (
        <div className="w-full border-r bg-slate-50 flex flex-col h-full flex-shrink-0">
            <div className="flex border-b bg-white">
                <button
                    onClick={() => props.onChangeViewMode('hierarchy')}
                    className={clsx(
                        "flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors",
                        props.state.viewMode === 'hierarchy' ? "border-blue-500 text-blue-600" : "border-transparent text-slate-500 hover:bg-slate-50"
                    )}
                >
                    <Layers size={16} /> Hierarchy
                </button>
                <button
                    onClick={() => props.onChangeViewMode('templates')}
                    className={clsx(
                        "flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors",
                        props.state.viewMode === 'templates' ? "border-blue-500 text-blue-600" : "border-transparent text-slate-500 hover:bg-slate-50"
                    )}
                >
                    <LayoutTemplate size={16} /> Templates
                </button>
            </div>

            {/* Variant Selector - only show in templates mode */}
            {props.state.viewMode === 'templates' && variantList.length > 0 && (
                <div className="px-2 py-2 border-b bg-indigo-50/50">
                    <div className="flex items-center gap-1">
                        {isEditingVariantName ? (
                            <>
                                <input
                                    type="text"
                                    value={editingName}
                                    onChange={(e) => setEditingName(e.target.value)}
                                    className="flex-1 text-xs border border-indigo-300 rounded px-2 py-1.5 bg-white text-indigo-700 font-medium focus:ring-1 focus:ring-indigo-400 focus:outline-none"
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveRename();
                                        if (e.key === 'Escape') handleCancelRename();
                                    }}
                                />
                                <button onClick={handleSaveRename} className="p-1.5 text-green-600 hover:bg-green-100 rounded" title="Save">
                                    <Check size={14} />
                                </button>
                                <button onClick={handleCancelRename} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded" title="Cancel">
                                    <X size={14} />
                                </button>
                            </>
                        ) : (
                            <>
                                <select
                                    value={props.state.activeVariantId}
                                    onChange={(e) => props.onSelectVariant?.(e.target.value)}
                                    className="flex-1 text-xs border border-indigo-200 rounded px-2 py-1.5 bg-white text-indigo-700 font-medium focus:ring-1 focus:ring-indigo-400 focus:outline-none"
                                >
                                    {variantList.map((v: Variant) => (
                                        <option key={v.id} value={v.id}>{v.name}</option>
                                    ))}
                                </select>
                                <button
                                    onClick={handleStartRename}
                                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-100 rounded"
                                    title="Rename Variant"
                                >
                                    <Pencil size={12} />
                                </button>
                                <button
                                    onClick={() => props.onDuplicateVariant?.(props.state.activeVariantId)}
                                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-100 rounded"
                                    title="Duplicate Variant"
                                >
                                    <Copy size={12} />
                                </button>
                                {variantList.length > 1 && (
                                    <button
                                        onClick={() => {
                                            if (confirm(`Delete variant "${activeVariant?.name}"? This cannot be undone.`)) {
                                                props.onDeleteVariant?.(props.state.activeVariantId);
                                            }
                                        }}
                                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-100 rounded"
                                        title="Delete Variant"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                )}
                                {props.onAddVariant && (
                                    <button
                                        onClick={props.onAddVariant}
                                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-100 rounded"
                                        title="Add New Variant"
                                    >
                                        <Plus size={12} />
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-y-auto py-2">
                {props.state.viewMode === 'hierarchy' ? (
                    <NodeItem
                        nodeId={props.state.rootId}
                        state={props.state}
                        depth={0}
                        onSelect={props.onSelectNode}
                        onAdd={props.onAddNode}
                        onAddRef={props.onAddReference}
                        onDelete={props.onDeleteNode}
                        onUpdate={props.onUpdateNode}
                    />
                ) : (
                    <div className="px-2 space-y-1">
                        <button
                            onClick={props.onAddTemplate}
                            className="w-full py-2 mb-2 border border-dashed border-slate-300 rounded-lg text-slate-500 text-sm hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 flex items-center justify-center gap-2"
                        >
                            <Plus size={16} /> New Template
                        </button>
                        {Object.values(props.state.variants[props.state.activeVariantId]?.templates || {}).map((tpl: PageTemplate) => (
                            <TemplateItem
                                key={tpl.id}
                                template={tpl}
                                isSelected={props.state.selectedTemplateId === tpl.id}
                                onSelect={() => props.onSelectTemplate(tpl.id)}
                                onDelete={() => props.onDeleteTemplate(tpl.id)}
                                onUpdateName={(n) => props.onUpdateTemplateName(tpl.id, n)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
