import React, { useMemo } from 'react';
import { MousePointer2, Hand, Type, Square, Circle, Triangle, Minus, Grid3X3, Magnet, GripVertical, ZoomOut, ZoomIn, Wand2, Save, Eye, AlignLeft, AlignCenter, AlignRight, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignHorizontalSpaceAround, AlignVerticalSpaceAround } from 'lucide-react';
import clsx from 'clsx';
import { AppState } from '../types';

interface EditorToolbarProps {
    state: AppState;
    setState: React.Dispatch<React.SetStateAction<AppState>>;
    onOpenScriptGen?: () => void;
    onSavePreset?: () => void;
}

const ToolButton: React.FC<{ active?: boolean, icon: any, onClick: () => void, title?: string }> = ({ active, icon: Icon, onClick, title }) => (
    <button onClick={onClick} title={title} className={clsx("p-1.5 rounded transition-all", active ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100")}>
        <Icon size={16} />
    </button>
);

export const EditorToolbar: React.FC<EditorToolbarProps> = ({ state, setState, onOpenScriptGen, onSavePreset }) => {
    // Compute nodes that use the current template
    const nodesForCurrentTemplate = useMemo(() => {
        if (state.viewMode !== 'templates') return [];
        const templateId = state.selectedTemplateId;
        return Object.values(state.nodes).filter(node => node.type === templateId);
    }, [state.viewMode, state.selectedTemplateId, state.nodes]);

    // Determine the effective preview node
    const effectivePreviewNodeId = useMemo(() => {
        if (state.viewMode !== 'templates') return state.selectedNodeId;
        if (state.templatePreviewNodeId) {
            const node = state.nodes[state.templatePreviewNodeId];
            if (node && node.type === state.selectedTemplateId) {
                return state.templatePreviewNodeId;
            }
        }
        if (nodesForCurrentTemplate.length > 0) {
            return nodesForCurrentTemplate[0].id;
        }
        return state.rootId;
    }, [state.viewMode, state.templatePreviewNodeId, state.selectedTemplateId, state.nodes, state.rootId, nodesForCurrentTemplate]);

    const handleAlign = (type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'dist-h' | 'dist-v') => {
        const { selectedElementIds, templates, selectedTemplateId } = state;
        if (selectedElementIds.length < 2) return;

        const template = templates[selectedTemplateId];
        if (!template) return;

        // Find selected elements from the array
        const selectedElements = template.elements.filter(el => selectedElementIds.includes(el.id));
        if (selectedElements.length < 2) return;

        let finalElements = [...template.elements];

        if (type === 'left') {
            const minX = Math.min(...selectedElements.map(el => el.x));
            finalElements = finalElements.map(el =>
                selectedElementIds.includes(el.id) ? { ...el, x: minX } : el
            );
        } else if (type === 'right') {
            const maxRight = Math.max(...selectedElements.map(el => el.x + el.w));
            finalElements = finalElements.map(el =>
                selectedElementIds.includes(el.id) ? { ...el, x: maxRight - el.w } : el
            );
        } else if (type === 'center') {
            const minX = Math.min(...selectedElements.map(el => el.x));
            const maxRight = Math.max(...selectedElements.map(el => el.x + el.w));
            const centerX = (minX + maxRight) / 2;
            finalElements = finalElements.map(el =>
                selectedElementIds.includes(el.id) ? { ...el, x: centerX - (el.w / 2) } : el
            );
        } else if (type === 'top') {
            const minY = Math.min(...selectedElements.map(el => el.y));
            finalElements = finalElements.map(el =>
                selectedElementIds.includes(el.id) ? { ...el, y: minY } : el
            );
        } else if (type === 'bottom') {
            const maxBottom = Math.max(...selectedElements.map(el => el.y + el.h));
            finalElements = finalElements.map(el =>
                selectedElementIds.includes(el.id) ? { ...el, y: maxBottom - el.h } : el
            );
        } else if (type === 'middle') {
            const minY = Math.min(...selectedElements.map(el => el.y));
            const maxBottom = Math.max(...selectedElements.map(el => el.y + el.h));
            const centerY = (minY + maxBottom) / 2;
            finalElements = finalElements.map(el =>
                selectedElementIds.includes(el.id) ? { ...el, y: centerY - (el.h / 2) } : el
            );
        } else if (type === 'dist-h') {
            const sorted = [...selectedElements].sort((a, b) => a.x - b.x);
            const minX = sorted[0].x;
            const maxRight = sorted[sorted.length - 1].x + sorted[sorted.length - 1].w;
            const totalWidth = sorted.reduce((sum, el) => sum + el.w, 0);
            const totalGap = (maxRight - minX) - totalWidth;
            const gap = totalGap / (sorted.length - 1);

            // Map of Id -> New X
            const newXById: Record<string, number> = {};
            let currentX = minX;
            sorted.forEach((el, i) => {
                if (i === 0) {
                    newXById[el.id] = el.x; // Keep first fixed? Usually distribute keeps first/last fixed.
                    currentX += el.w + gap;
                    return;
                }
                newXById[el.id] = currentX;
                currentX += el.w + gap;
            });
            // Ensure last is fixed exactly to avoid float drift? 
            // In typical distribute: First and Last define the range.
            newXById[sorted[sorted.length - 1].id] = sorted[sorted.length - 1].x;

            finalElements = finalElements.map(el =>
                newXById[el.id] !== undefined ? { ...el, x: newXById[el.id] } : el
            );

        } else if (type === 'dist-v') {
            const sorted = [...selectedElements].sort((a, b) => a.y - b.y);
            const minY = sorted[0].y;
            const maxBottom = sorted[sorted.length - 1].y + sorted[sorted.length - 1].h;
            const totalHeight = sorted.reduce((sum, el) => sum + el.h, 0);
            const totalGap = (maxBottom - minY) - totalHeight;
            const gap = totalGap / (sorted.length - 1);

            const newYById: Record<string, number> = {};
            let currentY = minY;
            sorted.forEach((el, i) => {
                if (i === 0) {
                    currentY += el.h + gap;
                    return;
                }
                newYById[el.id] = currentY;
                currentY += el.h + gap;
            });
            newYById[sorted[sorted.length - 1].id] = sorted[sorted.length - 1].y;

            finalElements = finalElements.map(el =>
                newYById[el.id] !== undefined ? { ...el, y: newYById[el.id] } : el
            );
        }

        setState(s => ({
            ...s,
            templates: {
                ...s.templates,
                [selectedTemplateId]: {
                    ...template,
                    elements: finalElements
                }
            }
        }));
    };

    return (
        <div className="h-10 bg-slate-50 border-b flex items-center justify-center gap-4 shadow-sm z-10 flex-shrink-0 px-4">
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

            {/* Alignment Tools - Only visible when multiple items selected */}
            {state.selectedElementIds.length > 1 && (
                <>
                    <div className="h-6 w-px bg-slate-300 mx-1"></div>
                    <div className="flex bg-white border border-slate-200 p-0.5 rounded gap-0.5 shadow-sm">
                        <ToolButton icon={AlignLeft} onClick={() => handleAlign('left')} title="Align Left" />
                        <ToolButton icon={AlignCenter} onClick={() => handleAlign('center')} title="Align Center (Horizontal)" />
                        <ToolButton icon={AlignRight} onClick={() => handleAlign('right')} title="Align Right" />
                        <div className="w-px bg-slate-200 mx-0.5"></div>
                        <ToolButton icon={AlignVerticalJustifyStart} onClick={() => handleAlign('top')} title="Align Top" />
                        <ToolButton icon={AlignVerticalJustifyCenter} onClick={() => handleAlign('middle')} title="Align Middle (Vertical)" />
                        <ToolButton icon={AlignVerticalJustifyEnd} onClick={() => handleAlign('bottom')} title="Align Bottom" />
                        <div className="w-px bg-slate-200 mx-0.5"></div>
                        <ToolButton icon={AlignHorizontalSpaceAround} onClick={() => handleAlign('dist-h')} title="Distribute Horizontally" />
                        <ToolButton icon={AlignVerticalSpaceAround} onClick={() => handleAlign('dist-v')} title="Distribute Vertically" />
                    </div>
                </>
            )}

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
