
import React, { useState } from 'react';
import { AppState, AppNode, TemplateElement, PageTemplate } from '../types';
import { Trash, Settings2, RectangleVertical, RectangleHorizontal } from 'lucide-react';
import { UNIT_CONVERSION, PAGE_PRESETS } from '../constants/editor';
import { SingleElementEditor } from './properties/SingleElementEditor';
import { NodeProperties } from './properties/NodeProperties';
import clsx from 'clsx';

interface PropertiesPanelProps {
  state: AppState;
  onUpdateElement: (id: string, updates: Partial<TemplateElement>) => void;
  onUpdateNode: (id: string, updates: Partial<AppNode>) => void;
  onDeleteElements: (ids: string[]) => void;
  onOpenNodeSelector: (mode: 'grid_source' | 'link_element', elementId: string) => void;
  onUpdateTemplate: (id: string, updates: Partial<PageTemplate>) => void;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ 
    state, onUpdateElement, onUpdateNode, onDeleteElements, onOpenNodeSelector, onUpdateTemplate
}) => {
  const isHierarchyMode = state.viewMode === 'hierarchy';
  let node: AppNode | undefined;
  let template: PageTemplate | undefined;

  const [dimUnit, setDimUnit] = useState<'pt'|'in'|'mm'>('pt');

  if (isHierarchyMode) {
      node = state.nodes[state.selectedNodeId];
      if (node) template = state.templates[node.type];
  } else {
      template = state.templates[state.selectedTemplateId];
  }
  
  const selectedElements = template ? template.elements.filter(el => state.selectedElementIds.includes(el.id)) : [];
  
  const updateDim = (dim: 'width'|'height', val: number) => {
      if (!template) return;
      onUpdateTemplate(template.id, { [dim]: val * UNIT_CONVERSION[dimUnit] });
  };
  const getDim = (dim: 'width'|'height') => template ? (template[dim] / UNIT_CONVERSION[dimUnit]).toFixed(2) : 0;

  const applyPreset = (key: string) => {
      const p = PAGE_PRESETS[key];
      if (p && template) {
          onUpdateTemplate(template.id, { width: p.w, height: p.h });
      }
  };

  const toggleOrientation = (mode: 'portrait' | 'landscape') => {
    if (!template) return;
    const { width, height } = template;
    const isPortrait = height >= width;
    
    if (mode === 'portrait' && !isPortrait) {
        onUpdateTemplate(template.id, { width: height, height: width });
    } else if (mode === 'landscape' && isPortrait) {
        onUpdateTemplate(template.id, { width: height, height: width });
    }
  };

  if (!template) return <div className="p-4 text-slate-400">Select a template</div>;

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-white border-l">
      <div className="p-4 border-b bg-slate-50">
        <h3 className="font-bold text-slate-700 flex items-center gap-2">
            <Settings2 size={16} /> 
            {isHierarchyMode ? 'Node Properties' : 'Template Settings'}
        </h3>
        
        {isHierarchyMode && node ? (
             <NodeProperties node={node} state={state} onUpdateNode={onUpdateNode} />
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
                        <optgroup label="E-Ink Devices">
                            <option value="note_10_3">10.3" Devices (RM2, A5X, Go 10.3)</option>
                            <option value="rm_pp">reMarkable Paper Pro (11.8")</option>
                            <option value="note_13_3">13.3" Devices (Note Max, Tab X)</option>
                            <option value="note_7_8">7.8" Devices (Nomad, Nova)</option>
                        </optgroup>
                    </select>

                    <div className="flex bg-slate-100 rounded p-0.5">
                        <button onClick={() => toggleOrientation('portrait')} className={clsx("flex-1 text-[10px] py-1 rounded flex items-center justify-center gap-1 transition-all", template.height >= template.width ? "bg-white text-blue-600 shadow-sm font-medium" : "text-slate-500 hover:text-slate-700")}><RectangleVertical size={12} /> Portrait</button>
                        <button onClick={() => toggleOrientation('landscape')} className={clsx("flex-1 text-[10px] py-1 rounded flex items-center justify-center gap-1 transition-all", template.width > template.height ? "bg-white text-blue-600 shadow-sm font-medium" : "text-slate-500 hover:text-slate-700")}><RectangleHorizontal size={12} /> Landscape</button>
                    </div>
                 </div>

                 <div className="flex justify-end mb-1">
                    <select value={dimUnit} onChange={e => setDimUnit(e.target.value as any)} className="text-xs border rounded bg-white">
                        <option value="pt">Points (pt)</option>
                        <option value="px">Pixels (px)</option>
                        <option value="in">Inches (in)</option>
                        <option value="mm">Millimeters (mm)</option>
                    </select>
                 </div>
                 <div className="grid grid-cols-2 gap-2">
                     <div><label className="text-[10px] text-slate-400">Width</label><input type="number" step="0.1" value={getDim('width')} onChange={e => updateDim('width', Number(e.target.value))} className="w-full border rounded px-2 py-1 text-sm" /></div>
                     <div><label className="text-[10px] text-slate-400">Height</label><input type="number" step="0.1" value={getDim('height')} onChange={e => updateDim('height', Number(e.target.value))} className="w-full border rounded px-2 py-1 text-sm" /></div>
                 </div>
            </div>
        )}
      </div>

      <div className="p-4 flex-1">
        <h3 className="font-bold text-slate-700 mb-4 flex justify-between items-center">
            Element Properties
            {selectedElements.length > 0 && (
                <button onClick={() => onDeleteElements(state.selectedElementIds)} className="text-red-500 hover:bg-red-50 p-1 rounded">
                    <Trash size={16} />
                </button>
            )}
        </h3>

        {selectedElements.length === 1 ? (
            <SingleElementEditor 
                element={selectedElements[0]} 
                onUpdate={(updates) => onUpdateElement(selectedElements[0].id, updates)} 
                onOpenNodeSelector={(mode) => onOpenNodeSelector(mode, selectedElements[0].id)}
                state={state}
                activeNode={node}
            />
        ) : (
            <div className="text-sm text-slate-400 italic text-center mt-10">Select an element</div>
        )}
      </div>
    </div>
  );
};
