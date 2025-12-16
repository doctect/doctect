
import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Trash2, Plus } from 'lucide-react';
import { JsonTreeItem, ValueType, NodeOption } from './JsonTreeItem';
import clsx from 'clsx';

interface MainCollectionItemProps {
    id: string;
    data: any;
    primaryKey: string; // 'title' or 'name'
    icon: React.ReactNode;
    path: string[];
    onUpdate: (path: string[], val: any) => void;
    onAdd: (path: string[], key: string, val: any) => void;
    onDelete: (path: string[]) => void;
    getAvailableNodes?: () => NodeOption[];
}

export const MainCollectionItem: React.FC<MainCollectionItemProps> = ({ id, data, primaryKey, icon, path, onUpdate, onAdd, onDelete, getAvailableNodes }) => {
    const [expanded, setExpanded] = useState(false);
    
    // Add Property State
    const [isAdding, setIsAdding] = useState(false);
    const [newKey, setNewKey] = useState("");
    const [valueType, setValueType] = useState<ValueType>('string');
    const [newValue, setNewValue] = useState<string>("");

    const handleAddItem = () => {
        let finalVal: any = newValue;
        if (valueType === 'number') finalVal = Number(newValue);
        if (valueType === 'boolean') finalVal = newValue === 'true';
        if (valueType === 'object') finalVal = {};
        if (valueType === 'array') finalVal = [];
        
        onAdd(path, newKey, finalVal);
        setIsAdding(false);
        setNewKey("");
        setNewValue("");
        setValueType("string");
    };
    
    return (
        <div id={`item-${id}`} className="border-b border-slate-100 last:border-0 transition-colors duration-500">
             <div 
                className={clsx(
                    "flex items-center gap-3 p-2 hover:bg-slate-50 cursor-pointer group transition-colors",
                    expanded && "bg-slate-50"
                )}
                onClick={() => setExpanded(!expanded)}
            >
                <span className="text-slate-400 p-1 rounded hover:bg-slate-200 transition-colors">
                    {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
                <div className="text-slate-500">{icon}</div>
                <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-700 truncate">{data[primaryKey] || 'Untitled'}</div>
                    <div className="text-xs text-slate-400 font-mono truncate">{id}</div>
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                        onClick={(e) => { e.stopPropagation(); onDelete(path); }}
                        className="p-1.5 hover:bg-red-100 text-red-500 rounded"
                        title="Delete Item"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>
            
            {expanded && (
                <div className="pl-4 pr-2 pb-2 bg-slate-50/50">
                    <div className="border-l-2 border-slate-200 pl-2">
                        {Object.entries(data).map(([key, val]) => {
                            if (key === 'id') return null; // Skip ID editing in details
                            return (
                                <JsonTreeItem 
                                    key={key} 
                                    label={key} 
                                    value={val} 
                                    depth={0} 
                                    path={[...path, key]} 
                                    onUpdate={onUpdate}
                                    onAdd={onAdd}
                                    onDelete={onDelete}
                                    getAvailableNodes={getAvailableNodes}
                                />
                            );
                        })}

                        {/* Add Property Button for Node Object */}
                        {!isAdding ? (
                            <button 
                                onClick={(e) => { e.stopPropagation(); setIsAdding(true); }}
                                className="flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700 px-2 py-1 mt-1 opacity-60 hover:opacity-100 transition-opacity"
                            >
                                <Plus size={12} /> Add Property
                            </button>
                        ) : (
                            <div className="p-2 bg-white rounded my-1 text-xs flex flex-col gap-2 border border-slate-200 shadow-sm w-fit min-w-[250px]" onClick={e => e.stopPropagation()}>
                                <div className="font-semibold text-slate-500 text-[10px] uppercase">Add to {data[primaryKey] || id}</div>
                                <div className="flex gap-2">
                                     <select className="border rounded bg-white px-1 py-0.5 text-xs h-7" value={valueType} onChange={e => setValueType(e.target.value as ValueType)}>
                                        <option value="string">String</option>
                                        <option value="number">Number</option>
                                        <option value="boolean">Boolean</option>
                                        <option value="object">Object</option>
                                        <option value="array">Array</option>
                                     </select>
                                     <input 
                                        autoFocus
                                        placeholder="Key Name" 
                                        className="border rounded px-2 py-0.5 flex-1 min-w-0 h-7" 
                                        value={newKey} 
                                        onChange={e => setNewKey(e.target.value)}
                                     />
                                </div>
                                
                                {['string', 'number'].includes(valueType) && (
                                    <input 
                                        placeholder={valueType === 'number' ? "0" : "Value"} 
                                        className="border rounded px-2 py-0.5 w-full h-7"
                                        type={valueType === 'number' ? 'number' : 'text'}
                                        value={newValue}
                                        onChange={e => setNewValue(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleAddItem()}
                                    />
                                )}
                                
                                {valueType === 'boolean' && (
                                    <div className="flex gap-3 items-center h-7">
                                        <label className="flex items-center gap-1 cursor-pointer"><input type="radio" checked={newValue === 'true'} onChange={() => setNewValue('true')} /> True</label>
                                        <label className="flex items-center gap-1 cursor-pointer"><input type="radio" checked={newValue !== 'true'} onChange={() => setNewValue('false')} /> False</label>
                                    </div>
                                )}

                                <div className="flex justify-end gap-2 mt-1">
                                    <button onClick={() => setIsAdding(false)} className="text-slate-500 hover:bg-slate-200 px-2 py-1 rounded">Cancel</button>
                                    <button onClick={handleAddItem} disabled={!newKey.trim()} className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">Add</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
