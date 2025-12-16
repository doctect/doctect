
import React, { useState } from 'react';
import { AppState, AppNode } from '../../types';
import { ChevronRight, ChevronDown, Plus, Trash2, Edit2, Link } from 'lucide-react';
import clsx from 'clsx';

interface NodeItemProps {
  nodeId: string;
  state: AppState;
  depth: number;
  onSelect: (id: string) => void;
  onAdd: (parentId: string) => void;
  onAddRef: (parentId: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<AppNode>) => void;
}

export const NodeItem: React.FC<NodeItemProps> = ({ nodeId, state, depth, onSelect, onAdd, onAddRef, onDelete, onUpdate }) => {
  const node = state.nodes[nodeId];
  const [expanded, setExpanded] = useState(depth < 1);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(node?.title || "");

  if (!node) return null;

  const isSelected = state.viewMode === 'hierarchy' && state.selectedNodeId === nodeId;
  const hasChildren = node.children.length > 0;
  const isReference = !!node.referenceId;

  const handleSubmitTitle = () => {
    if (editTitle.trim()) onUpdate(nodeId, { title: editTitle });
    setIsEditing(false);
  };

  return (
    <div>
      <div 
        className={clsx(
          "flex items-center group py-1 px-2 cursor-pointer select-none text-sm hover:bg-slate-100",
          isSelected && "bg-blue-50 text-blue-700 font-medium",
          isReference && "italic text-slate-600"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => onSelect(nodeId)}
      >
        <div 
          className="mr-1 p-0.5 rounded hover:bg-slate-200 text-slate-400"
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        >
          {hasChildren ? (
            expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : <div className="w-[14px]" />}
        </div>
        
        {isReference && <Link size={12} className="mr-1 text-indigo-500" />}

        {isEditing ? (
            <input 
                autoFocus
                className="flex-1 bg-white border border-blue-300 rounded px-1 min-w-0"
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                onBlur={handleSubmitTitle}
                onKeyDown={e => e.key === 'Enter' && handleSubmitTitle()}
                onClick={e => e.stopPropagation()}
            />
        ) : (
            <span className="truncate flex-1">{node.title}</span>
        )}

        <div className="hidden group-hover:flex items-center gap-1 ml-2">
            {!isReference && (
              <>
                <button type="button" className="p-1 hover:bg-slate-200 rounded text-slate-500" title="Edit Title"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditTitle(node.title); setIsEditing(true); }}>
                    <Edit2 size={12} className="pointer-events-none" />
                </button>
                <button type="button" className="p-1 hover:bg-green-100 hover:text-green-600 rounded text-slate-500" title="Add New Page"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAdd(nodeId); setExpanded(true); }}>
                    <Plus size={12} className="pointer-events-none" />
                </button>
                <button type="button" className="p-1 hover:bg-indigo-100 hover:text-indigo-600 rounded text-slate-500" title="Link Existing Page (Reference)"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAddRef(nodeId); setExpanded(true); }}>
                    <Link size={12} className="pointer-events-none" />
                </button>
              </>
            )}
            {node.parentId && (
              <button type="button" className="p-1 hover:bg-red-100 hover:text-red-600 rounded text-slate-500" title="Delete"
                onClick={(e) => { 
                    e.preventDefault(); 
                    e.stopPropagation(); 
                    onDelete(nodeId); 
                }}>
                <Trash2 size={12} className="pointer-events-none" />
              </button>
            )}
        </div>
      </div>
      
      {expanded && node.children.map(childId => (
        <NodeItem 
          key={childId} 
          nodeId={childId} 
          state={state} 
          depth={depth + 1}
          onSelect={onSelect}
          onAdd={onAdd}
          onAddRef={onAddRef}
          onDelete={onDelete}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  );
};
