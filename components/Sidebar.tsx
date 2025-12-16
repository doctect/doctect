
import React from 'react';
import { AppState, AppNode, PageTemplate } from '../types';
import { Layers, LayoutTemplate, Plus } from 'lucide-react';
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
}

export const Sidebar: React.FC<SidebarProps> = (props) => {
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
                {Object.values(props.state.templates).map(tpl => (
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
