
import React, { useState } from 'react';
import { AppNode } from '../../types';

interface ChildIndexSelectorProps {
    label: string;
    value: string | undefined;
    onChange: (val: string) => void;
    activeNode?: AppNode;
    nodes: Record<string, AppNode>;
    allowNegative?: boolean;
}

export const ChildIndexSelector: React.FC<ChildIndexSelectorProps> = ({ label, value, onChange, activeNode, nodes, allowNegative }) => {
    const [manual, setManual] = useState(false);
    const hasChildren = activeNode && activeNode.children.length > 0;
    const effectiveValue = value === undefined || value === '' ? (allowNegative ? '-1' : '0') : value;

    if (hasChildren && !manual) {
        return (
             <div className="mb-2">
                <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] text-slate-400">{label}</label>
                    <button onClick={() => setManual(true)} className="text-[9px] text-blue-500 hover:underline flex items-center gap-0.5">
                         Edit Manual
                    </button>
                </div>
                <select 
                    className="w-full border rounded px-2 py-1 text-xs bg-white"
                    value={effectiveValue}
                    onChange={e => onChange(e.target.value)}
                >
                     {allowNegative && <option value="-1">-1: None</option>}
                     {activeNode!.children.map((childId, idx) => (
                         <option key={idx} value={idx}>{idx}: {nodes[childId]?.title || 'Unknown'}</option>
                     ))}
                     {/* Show option for out of bounds values to avoid hidden selection */}
                     {(() => {
                         const curr = parseInt(effectiveValue);
                         if (!isNaN(curr) && curr >= 0 && curr >= activeNode!.children.length) {
                             return <option value={curr}>{curr}: (Index out of range)</option>;
                         }
                         return null;
                     })()}
                </select>
             </div>
        );
    }

    return (
         <div className="mb-2">
            <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] text-slate-400">{label}</label>
                {hasChildren && (
                    <button onClick={() => setManual(false)} className="text-[9px] text-blue-500 hover:underline flex items-center gap-0.5">
                         Select from List
                    </button>
                )}
            </div>
            <input 
                type="number" 
                min={allowNegative ? "-1" : "0"}
                className="w-full border rounded px-2 py-1 text-xs" 
                value={effectiveValue} 
                onChange={e => onChange(e.target.value)} 
            />
            {!activeNode && <div className="text-[9px] text-slate-400 mt-0.5">Editing Template: Index is relative to page children.</div>}
            {activeNode && !hasChildren && <div className="text-[9px] text-amber-500 mt-0.5">Current page has no children.</div>}
         </div>
    );
};
