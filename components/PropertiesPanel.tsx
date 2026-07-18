

import React, { useState, useCallback } from 'react';
import { AppState, AppNode, TemplateElement, PageTemplate } from '../types';
import { Trash, Settings2, RectangleVertical, RectangleHorizontal, ToggleRight, ToggleLeft } from 'lucide-react';

import { PAGE_PRESETS, RM_PP_WIDTH, RM_PP_HEIGHT, toDisplayUnit, fromDisplayUnit } from '../constants/editor';
import { SingleElementEditor } from './properties/SingleElementEditor';
import { NodeProperties } from './properties/NodeProperties';
import { CollapsibleSection } from './CollapsibleSection';
import clsx from 'clsx';

interface PropertiesPanelProps {
    state: AppState;
    activePreviewNode?: AppNode;
    onUpdateElements: (elements: TemplateElement[], saveHistory: boolean) => void;
    onUpdateNode: (id: string, updates: Partial<AppNode>) => void;
    onDeleteElements: (ids: string[]) => void;
    onOpenNodeSelector: (mode: 'grid_source' | 'link_element', elementId: string) => void; // Pass elementId context
    onUpdateTemplate: (id: string, updates: Partial<PageTemplate>, autoReflow?: boolean, scaleFontSize?: boolean) => void;
    layersSlot?: React.ReactNode;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ state, activePreviewNode, onUpdateElements, onUpdateNode, onDeleteElements, onOpenNodeSelector, onUpdateTemplate, layersSlot }) => {
    const { nodes, selectedNodeId, viewMode, selectedElementIds, variants, activeVariantId, selectedTemplateId } = state;
    // Session-local: Template Settings starts expanded, collapsible from its header.
    const [settingsExpanded, setSettingsExpanded] = React.useState(true);
    const node = nodes[selectedNodeId];
    const isHierarchyMode = viewMode === 'hierarchy';

    const effectiveTemplateId = isHierarchyMode ? node?.type : selectedTemplateId;
    const template = effectiveTemplateId ? variants[activeVariantId]?.templates[effectiveTemplateId] : undefined;

    // Derived selected elements
    const selectedElements = React.useMemo(() => {
        if (!template) return [];
        return selectedElementIds.map(id => template.elements.find(el => el.id === id)).filter(Boolean) as TemplateElement[];
    }, [selectedElementIds, template]);
    const selectionIsTextOnly = selectedElements.length > 0
        && selectedElements.every(element => element.type === 'text');
    const enabledAutoWidthCount = selectionIsTextOnly
        ? selectedElements.filter(element => !!element.autoWidth).length
        : 0;
    const autoWidthSelection: boolean | 'mixed' = enabledAutoWidthCount === 0
        ? false
        : enabledAutoWidthCount === selectedElements.length
            ? true
            : 'mixed';

    // Generate a "Synthetic" element for Multi-Edit
    // If values match across all selected, show key. If not, show "Mixed" or special value.
    const displayElement = React.useMemo(() => {
        if (selectedElements.length === 0) return null;
        if (selectedElements.length === 1) return selectedElements[0];

        // console.log("DEBUG: Calculating Mixed Element for", selectedElements.length, "items.");
        const base = { ...selectedElements[0] };
        const keys = Object.keys(base) as (keyof TemplateElement)[];

        keys.forEach(key => {
            const firstValue = base[key];
            const allMatch = selectedElements.every(el => el[key] === firstValue);
            if (!allMatch) {
                // console.log(`DEBUG: Property ${key} mismatch. Setting to Mixed.`);
                (base as any)[key] = "Mixed";
            }
        });

        // console.log("DEBUG: Final displayElement:", base);
        return base;
    }, [selectedElements]);


    // Inputs show/accept the selected display unit; the template stays canonical (pt).
    const updateDim = (dim: 'width' | 'height', val: number) => {
        if (template && !isNaN(val)) {
            onUpdateTemplate(template.id, { [dim]: fromDisplayUnit(val, dimUnit) }, autoReflow, scaleFontSize);
        }
    };

    const getDim = (dim: 'width' | 'height') => {
        if (!template) return 0;
        return toDisplayUnit(template[dim] || (dim === 'width' ? RM_PP_WIDTH : RM_PP_HEIGHT), dimUnit);
    };

    const [dimUnit, setDimUnit] = React.useState<'px' | 'pt' | 'in' | 'mm'>('px');
    const [autoReflow, setAutoReflow] = React.useState(true);
    const [scaleFontSize, setScaleFontSize] = React.useState(true);

    const applyPreset = (key: string) => {
        const p = PAGE_PRESETS[key];
        if (p && template) {
            onUpdateTemplate(template.id, { width: p.w, height: p.h }, autoReflow, scaleFontSize);
        }
    };

    const toggleOrientation = (mode: 'portrait' | 'landscape') => {
        if (!template) return;
        const { width, height } = template;
        const isPortrait = height >= width;

        if (mode === 'portrait' && !isPortrait) {
            onUpdateTemplate(template.id, { width: height, height: width }, autoReflow, scaleFontSize);
        } else if (mode === 'landscape' && isPortrait) {
            onUpdateTemplate(template.id, { width: height, height: width }, autoReflow, scaleFontSize);
        }
    };

    // Hooks must be called before any early returns
    const handleUpdate = useCallback((updates: Partial<TemplateElement> | ((prev: TemplateElement) => Partial<TemplateElement>), saveHistory: boolean = true) => {
        if (selectedElements.length > 0 && template) {
            // Apply updates to ALL selected elements
            const newElements = template.elements.map(el => {
                if (selectedElementIds.includes(el.id)) {
                    // Resolve updates if it's a function
                    const appliedUpdates = typeof updates === 'function' ? updates(el) : updates;

                    // Log for Z-Index debugging
                    if ('zIndex' in appliedUpdates) {
                        console.log(`DEBUG: Updating zIndex for ${el.id}. Prev: ${el.zIndex} (${typeof el.zIndex}). New: ${appliedUpdates.zIndex}`);
                    }

                    return { ...el, ...appliedUpdates };
                }
                return el;
            });
            onUpdateElements(newElements, saveHistory);
        }
    }, [onUpdateElements, selectedElements, template, selectedElementIds]);

    const handleOpenNodeSelector = useCallback((mode: 'grid_source' | 'link_element') => {
        if (selectedElements.length > 0) {
            onOpenNodeSelector(mode, selectedElements[0].id);
        }
    }, [onOpenNodeSelector, selectedElements]);

    if (!template) return <div className="p-4 text-slate-400">Select a template</div>;

    return (
        <div className="flex flex-col h-full overflow-y-auto bg-white border-l" data-prevent-finish-edit="true">
            <CollapsibleSection
                title={isHierarchyMode ? 'Node Properties' : 'Template Settings'}
                icon={Settings2}
                testId="template-settings-section"
                expanded={settingsExpanded}
                onToggle={() => setSettingsExpanded(v => !v)}
            >
                <div className="px-4 pb-4">

                {isHierarchyMode ? (
                    state.selectedNodeIds?.length > 1 ? (
                        <div className="mt-3 space-y-3 px-4">
                            <div className="bg-indigo-50 p-3 rounded border border-indigo-100 text-sm">
                                <div className="text-indigo-700 font-bold mb-1">
                                    {state.selectedNodeIds.length} Nodes Selected
                                </div>
                                <p className="text-slate-600 mb-2">
                                    Change template for all selected nodes.
                                </p>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase">Assigned Template</label>
                                <select className="w-full border rounded px-2 py-1 text-sm mt-1 bg-white"
                                    defaultValue=""
                                    onChange={(e) => {
                                        state.selectedNodeIds.forEach(id => onUpdateNode(id, { type: e.target.value }));
                                    }}>
                                    <option value="" disabled>Select Template...</option>
                                    {Object.values(state.variants[state.activeVariantId]?.templates || {}).map((t: any) => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    ) : node ? (
                        <NodeProperties node={node} state={state} onUpdateNode={onUpdateNode} />
                    ) : null
                ) : (
                    <div className="mt-3 space-y-3">
                        <div className="border-b pb-3 mb-2 border-slate-200">
                            <label className="text-[10px] text-slate-400 block mb-1">Page Presets</label>
                            <select onChange={(e) => applyPreset(e.target.value)} className="w-full border rounded px-1 text-xs py-1.5 mb-2 bg-white" defaultValue="">
                                <option value="" disabled>Select Size...</option>
                                <optgroup label="Standard Paper">
                                    <option value="a4">A4</option>
                                    <option value="letter">Letter</option>
                                    <option value="legal">Legal</option>
                                    <option value="a5">A5</option>
                                </optgroup>
                                <optgroup label="11.8&quot; Devices">
                                    <option value="rm_pp">reMarkable Paper Pro</option>
                                </optgroup>
                                <optgroup label="10.3&quot; Devices">
                                    <option value="rm2">reMarkable 2</option>
                                    <option value="boox_note_air">Boox Note Air 3 / 3C</option>
                                    <option value="boox_go_10">Boox Go 10.3</option>
                                    <option value="supernote_a5x">Supernote A5 X / Manta</option>
                                    <option value="kindle_scribe">Kindle Scribe</option>
                                    <option value="note_10_3">Generic 10.3"</option>
                                </optgroup>
                                <optgroup label="13.3&quot; Devices">
                                    <option value="boox_tab_x">Boox Tab X</option>
                                    <option value="boox_note_max">Boox Note Max</option>
                                    <option value="note_13_3">Generic 13.3"</option>
                                </optgroup>
                                <optgroup label="7.8&quot; Devices">
                                    <option value="supernote_nomad">Supernote Nomad</option>
                                    <option value="boox_nova_air">Boox Nova Air</option>
                                    <option value="note_7_8">Generic 7.8"</option>
                                </optgroup>
                                <optgroup label="7&quot; Devices">
                                    <option value="rm_pp_move">reMarkable Paper Pro Move</option>
                                </optgroup>
                            </select>

                            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 mb-2 items-end">
                                <div><label className="text-[10px] text-slate-400">Width</label><input type="number" step="0.1" value={getDim('width')} onChange={(e) => updateDim('width', parseFloat(e.target.value))} className="w-full border rounded px-1 text-sm" /></div>
                                <div><label className="text-[10px] text-slate-400">Height</label><input type="number" step="0.1" value={getDim('height')} onChange={(e) => updateDim('height', parseFloat(e.target.value))} className="w-full border rounded px-1 text-sm" /></div>
                                <div>
                                    <label className="text-[10px] text-slate-400">Unit</label>
                                    <select value={dimUnit} onChange={(e) => setDimUnit(e.target.value as any)} title="Dimension unit"
                                        className="block w-full border rounded px-0.5 py-[3px] text-xs bg-white text-slate-600 cursor-pointer">
                                        <option value="pt">pt</option>
                                        <option value="px">px</option>
                                        <option value="in">in</option>
                                        <option value="mm">mm</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <button onClick={() => toggleOrientation('portrait')} className="flex-1 text-[10px] bg-white border rounded py-1 hover:bg-slate-50 flex items-center justify-center gap-1"><RectangleVertical size={12} /> Portrait</button>
                                <button onClick={() => toggleOrientation('landscape')} className="flex-1 text-[10px] bg-white border rounded py-1 hover:bg-slate-50 flex items-center justify-center gap-1"><RectangleHorizontal size={12} /> Landscape</button>
                            </div>

                            <div className="mt-3 flex flex-col gap-1 p-2 bg-slate-50 rounded border border-slate-100">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-[10px] font-medium text-slate-700">Auto-Reflow Elements</div>
                                        <div className="text-[9px] text-slate-500 leading-tight mt-0.5 max-w-[140px]">
                                            {autoReflow ? 'Scale to fit new dimensions' : 'Keep original size/position'}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setAutoReflow(!autoReflow)}
                                        className="flex-shrink-0 text-indigo-600 focus:outline-none"
                                    >
                                        {autoReflow ? <ToggleRight size={22} /> : <ToggleLeft size={22} className="text-slate-400" />}
                                    </button>
                                </div>
                                
                                {autoReflow && (
                                    <div className="flex items-center justify-between pt-1 mt-1 border-t border-slate-200">
                                        <div>
                                            <div className="text-[10px] font-medium text-slate-700">Scale Typography</div>
                                            <div className="text-[9px] text-slate-500 leading-tight mt-0.5 max-w-[140px]">
                                                {scaleFontSize ? 'Fonts/strokes scale with page' : 'Keep original styling'}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setScaleFontSize(!scaleFontSize)}
                                            className="flex-shrink-0 text-indigo-600 focus:outline-none"
                                        >
                                            {scaleFontSize ? <ToggleRight size={22} /> : <ToggleLeft size={22} className="text-slate-400" />}
                                        </button>
                                    </div>
                                )}
                            </div>

                        </div>

                        {/* Redundant editor block removed from here; element deletion lives
                            in the Element Properties header (trash icon) only. */}
                    </div>
                )}
                {!isHierarchyMode && state.selectedTemplateIds?.length > 1 && (
                    <div className="mt-3 px-4 space-y-3">
                        <div className="bg-slate-50 p-3 rounded border border-slate-200 text-sm">
                            <div className="text-slate-700 font-bold mb-1">
                                {state.selectedTemplateIds.length} Templates Selected
                            </div>
                            <p className="text-slate-500 mb-2 text-xs">
                                Individual template settings are unavailable during bulk selection.
                            </p>
                        </div>
                    </div>
                )}
                </div>
            </CollapsibleSection>

            {layersSlot}

            <div className="p-4 flex-1">
                <h3 className="font-bold text-slate-700 mb-4 flex justify-between items-center">
                    Element Properties
                    {selectedElements.length > 0 && (
                        <button onClick={() => onDeleteElements(state.selectedElementIds)} className="text-red-500 hover:bg-red-50 p-1 rounded">
                            <Trash size={16} />
                        </button>
                    )}
                </h3>

                {selectedElements.length > 0 && displayElement ? (
                    <>
                        {selectedElements.length > 1 && (
                            <div className="bg-blue-50 text-blue-700 px-3 py-2 text-xs font-medium border-b border-blue-100 flex items-center justify-between mb-4 rounded">
                                <span>{selectedElements.length} items selected</span>
                                <span className="text-[10px] opacity-75">Editing all</span>
                            </div>
                        )}
                        <SingleElementEditor
                            key={selectedElements[0].id} // Stable key to avoid remounting jank, but updates on selection change
                            // (this also remounts SvgSourceSection on selection change, resetting its draft + pending debounce timer)
                            element={displayElement}
                            onUpdate={handleUpdate}
                            onOpenNodeSelector={handleOpenNodeSelector}
                            state={state}
                            selectionIsTextOnly={selectionIsTextOnly}
                            autoWidthSelection={autoWidthSelection}
                            activeNode={activePreviewNode}
                        />
                    </>
                ) : (
                    <div className="text-sm text-slate-400 italic text-center mt-10">Select an element</div>
                )}
            </div>
        </div >
    );
};
