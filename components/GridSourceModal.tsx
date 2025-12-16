import React, { useState } from 'react';
import { AppState, AppNode } from '../types';
import { X, ChevronRight, ChevronDown, Check } from 'lucide-react';
import clsx from 'clsx';

interface GridSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  onSelect: (nodeId: string) => void;
}

const NodeItem: React.FC<{
  nodeId: string;
  state: AppState;
  depth: number;
  onSelect: (id: string) => void;
}> = ({ nodeId, state, depth, onSelect }) => {
  const node = state.nodes[nodeId];
  const [expanded, setExpanded] = useState(true);

  if (!node) return null;
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div 
        className="flex items-center group py-2 px-2 cursor-pointer hover:bg-slate-100 rounded"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(nodeId)}
      >
        <div 
          className="mr-2 p-1 rounded hover:bg-slate-200 text-slate-400"
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        >
          {hasChildren ? (
            expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : <div className="w-[14px]" />}
        </div>
        <span className="truncate flex-1 font-medium text-slate-700">{node.title}</span>
        <div className="text-xs text-slate-400 bg-slate-100 px-1 rounded ml-2">{node.type}</div>
      </div>
      
      {expanded && node.children.map(childId => (
        <NodeItem 
          key={childId} 
          nodeId={childId} 
          state={state} 
          depth={depth + 1}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
};

export const GridSourceModal: React.FC<GridSourceModalProps> = ({ isOpen, onClose, state, onSelect }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-bold text-slate-800">Select Grid Data Source</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 bg-slate-50 border-b">
            <p className="text-sm text-slate-600">
                Pick a node below. The grid will display the <b>children</b> of the selected node.
            </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
            <NodeItem 
                nodeId={state.rootId} 
                state={state} 
                depth={0}
                onSelect={(id) => { onSelect(id); onClose(); }}
            />
        </div>
      </div>
    </div>
  );
};