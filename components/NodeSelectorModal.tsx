import React, { useState } from 'react';
import { AppState } from '../types';
import { X, ChevronRight, ChevronDown, Link } from 'lucide-react';
import clsx from 'clsx';

interface NodeSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  title: string;
  onSelect: (nodeId: string) => void;
}

const NodeItem: React.FC<{
  nodeId: string;
  state: AppState;
  depth: number;
  onSelect: (id: string) => void;
}> = ({ nodeId, state, depth, onSelect }) => {
  const node = state.nodes[nodeId];
  const [expanded, setExpanded] = useState(depth < 1);

  if (!node) return null;
  const hasChildren = node.children.length > 0;
  const isReference = !!node.referenceId;

  return (
    <div>
      <div 
        className={clsx(
            "flex items-center group py-2 px-2 cursor-pointer hover:bg-slate-100 rounded border-b border-slate-50",
            isReference && "opacity-60 bg-slate-50 italic"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(nodeId)}
      >
        <div 
          className="mr-2 p-1 rounded hover:bg-slate-200 text-slate-400"
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        >
          {hasChildren && !isReference ? (
            expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : <div className="w-[14px]" />}
        </div>
        
        {isReference && <Link size={12} className="mr-2 text-indigo-400"/>}
        <span className="truncate flex-1 font-medium text-slate-700">{node.title}</span>
        <div className="text-[10px] text-slate-400 bg-slate-100 px-1 rounded ml-2">{node.type}</div>
      </div>
      
      {expanded && !isReference && node.children.map(childId => (
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

export const NodeSelectorModal: React.FC<NodeSelectorModalProps> = ({ isOpen, onClose, state, title, onSelect }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full">
            <X className="w-5 h-5" />
          </button>
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