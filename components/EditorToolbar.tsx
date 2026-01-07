import React, { useMemo } from 'react';
import { MousePointer2, Hand, Type, Square, Circle, Triangle, Minus, Grid3X3, Magnet, GripVertical, ZoomOut, ZoomIn, Wand2, Save, Eye } from 'lucide-react';
import clsx from 'clsx';
import { AppState } from '../types';

interface EditorToolbarProps {
    state: AppState;
    setState: React.Dispatch<React.SetStateAction<AppState>>;
    onOpenScriptGen?: () => void;
    onSavePreset?: () => void;
}

const ToolButton: React.FC<{ active: boolean, icon: any, onClick: () => void, title?: string }> = ({ active, icon: Icon, onClick, title }) => (
    <button onClick={onClick} title={title} className={clsx("p-1.5 rounded transition-all", active ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100")}>
        <Icon size={16} />
    </button>
);

export const EditorToolbar: React.FC<EditorToolbarProps> = ({ state, setState, onOpenScriptGen, onSavePreset }) => {
    // Compute nodes that use the current template (for template preview selector)
    const nodesForCurrentTemplate = useMemo(() => {
        if (state.viewMode !== 'templates') return [];
        const templateId = state.selectedTemplateId;
        return Object.values(state.nodes).filter(node => node.type === templateId);
    }, [state.viewMode, state.selectedTemplateId, state.nodes]);

    // Determine the effective preview node
    const effectivePreviewNodeId = useMemo(() => {
        if (state.viewMode !== 'templates') return state.selectedNodeId;

        // If a preview node is set and it's valid for this template, use it
        if (state.templatePreviewNodeId) {
            const node = state.nodes[state.templatePreviewNodeId];
            if (node && node.type === state.selectedTemplateId) {
                return state.templatePreviewNodeId;
            }
        }

        // Otherwise use first matching node, or root as fallback
        if (nodesForCurrentTemplate.length > 0) {
            return nodesForCurrentTemplate[0].id;
        }
        return state.rootId;
    }, [state.viewMode, state.templatePreviewNodeId, state.selectedTemplateId, state.nodes, state.rootId, nodesForCurrentTemplate]);

    return (
        <div className="h-10 bg-slate-50 border-b flex items-center justify-center gap-4 shadow-sm z-10 flex-shrink-0">
            <div className="flex bg-white border border-slate-200 p-0.5 rounded gap-0.5 shadow-sm">
                <ToolButton active={state.tool === 'select'} icon={MousePointer2} onClick={() => setState(s => ({ ...s, tool: 'select' }))} title="Select Tool (V)" />
                <ToolButton active={state.tool === 'hand'} icon={Hand} onClick={() => setState(s => ({ ...s, tool: 'hand' }))} title="Pan Tool (H)" />
                <div className="w-px bg-slate-200 mx-1"></div>
                <ToolButton active={state.tool === 'text'} icon={Type} onClick={() => setState(s => ({ ...s, tool: 'text' }))} title="Text Box (T)" />
                <ToolButton active={state.tool === 'rect'} icon={Square} onClick={() => setState(s => ({ ...s, tool: 'rect' }))} title="Rectangle (R)" />
                <ToolButton active={state.tool === 'ellipse'} icon={Circle} onClick={() => setState(s => ({ ...s, tool: 'ellipse' }))} title="Circle/Ellipse (E)" />
                <ToolButton active={state.tool === 'triangle'} icon={Triangle} onClick={() => setState(s => ({ ...s, tool: 'triangle' }))} title="Triangle (Y)" />
                <ToolButton active={state.tool === 'line'} icon={Minus} onClick={() => setState(s => ({ ...s, tool: 'line' }))} title="Line (L)" />
                <ToolButton active={state.tool === 'grid'} icon={Grid3X3} onClick={() => setState(s => ({ ...s, tool: 'grid' }))} title="Data Grid (G)" />
            </div>
            <div className="h-6 w-px bg-slate-300 mx-1"></div>
            <div className="flex bg-white border border-slate-200 p-0.5 rounded gap-0.5 shadow-sm">
                <ToolButton active={state.snapToGrid} icon={Magnet} onClick={() => setState(s => ({ ...s, snapToGrid: !s.snapToGrid, showGrid: !s.snapToGrid ? true : s.showGrid }))} title="Snap to Grid" />
                <ToolButton active={state.showGrid} icon={GripVertical} onClick={() => setState(s => ({ ...s, showGrid: !s.showGrid }))} title="Show Grid" />
            </div>
            <div className="h-6 w-px bg-slate-300 mx-1"></div>
            <div className="flex items-center gap-1">
                <button className="p-1 hover:bg-white rounded text-slate-600" onClick={() => setState(s => ({ ...s, scale: Math.max(0.2, s.scale - 0.1) }))}><ZoomOut size={16} /></button>
                <span className="text-xs font-mono text-slate-500 w-10 text-center">{Math.round(state.scale * 100)}%</span>
                <button className="p-1 hover:bg-white rounded text-slate-600" onClick={() => setState(s => ({ ...s, scale: Math.min(3, s.scale + 0.1) }))}><ZoomIn size={16} /></button>
            </div>

            {/* Template Preview Node Selector - only visible in template mode */}
            {state.viewMode === 'templates' && (
                <>
                    <div className="h-6 w-px bg-slate-300 mx-1"></div>
                    <div className="flex items-center gap-2 bg-white border border-slate-200 px-2 py-1 rounded shadow-sm">
                        <Eye size={14} className="text-slate-400" />
                        <span className="text-xs text-slate-500 hidden sm:inline">Preview:</span>
                        <select
                            className="text-xs border-0 bg-transparent text-slate-700 font-medium focus:outline-none max-w-[150px] truncate"
                            value={effectivePreviewNodeId}
                            onChange={(e) => setState(s => ({ ...s, templatePreviewNodeId: e.target.value }))}
                        >
                            {nodesForCurrentTemplate.length > 0 ? (
                                nodesForCurrentTemplate.map(node => (
                                    <option key={node.id} value={node.id}>
                                        {node.title || node.id}
                                    </option>
                                ))
                            ) : (
                                <option value={state.rootId}>No nodes use this template</option>
                            )}
                        </select>
                    </div>
                </>
            )}

            {(onOpenScriptGen || onSavePreset) && (
                <>
                    <div className="h-6 w-px bg-slate-300 mx-1"></div>
                    <div className="flex gap-2">
                        {onOpenScriptGen && (
                            <button
                                onClick={onOpenScriptGen}
                                className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded transition-colors"
                                title="Generate Hierarchy via Script"
                            >
                                <Wand2 size={14} />
                                <span className="hidden lg:inline">Generator</span>
                            </button>
                        )}
                        {onSavePreset && (
                            <button
                                onClick={onSavePreset}
                                className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded transition-colors"
                                title="Save current project as a reusable preset"
                            >
                                <Save size={14} />
                                <span className="hidden lg:inline">Save Preset</span>
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};
