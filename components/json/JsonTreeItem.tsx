
import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Trash2, Plus, Type, Hash } from 'lucide-react';

export type ValueType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';

export const getValType = (val: any): ValueType => {
    if (val === null) return 'null';
    if (Array.isArray(val)) return 'array';
    return typeof val as ValueType;
};

export interface NodeOption {
    id: string;
    title: string;
}

interface JsonTreeItemProps {
    label: string;
    value: any;
    depth: number;
    path: string[];
    onUpdate: (path: string[], newValue: any) => void;
    onAdd: (path: string[], key: string, newValue: any) => void;
    onDelete: (path: string[]) => void;
    isRoot?: boolean;
    getAvailableNodes?: () => NodeOption[];
}

export const JsonTreeItem: React.FC<JsonTreeItemProps> = ({ label, value, depth, path, onUpdate, onAdd, onDelete, isRoot, getAvailableNodes }) => {
    const [expanded, setExpanded] = useState(depth < 1); // Default collapse deeper levels
    const [isAdding, setIsAdding] = useState(false);
    const [newKey, setNewKey] = useState("");
    const [valueType, setValueType] = useState<ValueType>('string');
    const [newValue, setNewValue] = useState<string>("");

    const type = getValType(value);
    const isContainer = type === 'object' || type === 'array';
    const itemCount = isContainer ? Object.keys(value).length : 0;

    // Check if this is a "children" array of a Node to offer lookup
    // Path structure: ['nodes', NODE_ID, 'children']
    const isNodeChildrenArray = type === 'array' && path.length === 3 && path[0] === 'nodes' && path[2] === 'children';
    const availableNodes = isNodeChildrenArray && getAvailableNodes ? getAvailableNodes() : [];

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val: any = e.target.value;
        if (type === 'number') val = Number(val);
        if (type === 'boolean') val = e.target.checked;
        onUpdate(path, val);
    };

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

    if (isContainer) {
        return (
            <div className="font-mono text-sm">
                <div 
                    className="flex items-center gap-2 py-1 hover:bg-slate-100 rounded cursor-pointer group"
                    style={{ paddingLeft: `${depth * 16}px` }}
                    onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                >
                    <span className="text-slate-400 p-0.5 rounded hover:bg-slate-200">
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                    <span className="text-purple-700 font-semibold">{label}</span>
                    <span className="text-slate-400 text-xs">{type === 'array' ? `[${itemCount}]` : `{${itemCount}}`}</span>
                    
                    {!isRoot && (
                         <button 
                            onClick={(e) => { e.stopPropagation(); onDelete(path); }}
                            className="ml-auto opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 text-red-500 rounded transition-opacity"
                        >
                            <Trash2 size={12} />
                        </button>
                    )}
                </div>
                {expanded && (
                    <div className="border-l border-slate-200 ml-[6px]">
                        {Object.entries(value).map(([key, val]) => (
                            <JsonTreeItem 
                                key={key}
                                label={key}
                                value={val}
                                depth={depth + 1}
                                path={[...path, key]}
                                onUpdate={onUpdate}
                                onAdd={onAdd}
                                onDelete={onDelete}
                                getAvailableNodes={getAvailableNodes}
                            />
                        ))}
                        
                        {/* Add Item Control */}
                        {!isAdding ? (
                            <button 
                                onClick={(e) => { e.stopPropagation(); setIsAdding(true); }}
                                style={{ marginLeft: `${(depth + 1) * 16}px` }}
                                className="flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700 px-2 py-1 mt-1 opacity-60 hover:opacity-100 transition-opacity"
                            >
                                <Plus size={12} /> {type === 'array' ? 'Add Item' : 'Add Property'}
                            </button>
                        ) : (
                            <div style={{ marginLeft: `${(depth + 1) * 16}px` }} className="p-2 bg-slate-100 rounded my-1 text-xs flex flex-col gap-2 border border-slate-200 shadow-sm w-fit min-w-[250px]" onClick={e => e.stopPropagation()}>
                                <div className="font-semibold text-slate-500 text-[10px] uppercase">Add to {label}</div>
                                <div className="flex gap-2">
                                     <select className="border rounded bg-white px-1 py-0.5 text-xs h-7" value={valueType} onChange={e => setValueType(e.target.value as ValueType)}>
                                        <option value="string">String</option>
                                        {!isNodeChildrenArray && <option value="number">Number</option>}
                                        {!isNodeChildrenArray && <option value="boolean">Boolean</option>}
                                        {!isNodeChildrenArray && <option value="object">Object</option>}
                                        {!isNodeChildrenArray && <option value="array">Array</option>}
                                     </select>
                                     {type === 'object' && (
                                         <input 
                                            autoFocus
                                            placeholder="Key Name" 
                                            className="border rounded px-2 py-0.5 flex-1 min-w-0 h-7" 
                                            value={newKey} 
                                            onChange={e => setNewKey(e.target.value)}
                                         />
                                     )}
                                </div>
                                
                                {isNodeChildrenArray && availableNodes.length > 0 ? (
                                     <select 
                                        className="border rounded px-2 py-0.5 w-full h-7 bg-white"
                                        value={newValue}
                                        onChange={e => setNewValue(e.target.value)}
                                     >
                                        <option value="">Select Node ID...</option>
                                        {availableNodes.map(n => (
                                            <option key={n.id} value={n.id}>{n.title} ({n.id})</option>
                                        ))}
                                     </select>
                                ) : (
                                    <>
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
                                    </>
                                )}

                                <div className="flex justify-end gap-2 mt-1">
                                    <button onClick={() => setIsAdding(false)} className="text-slate-500 hover:bg-slate-200 px-2 py-1 rounded">Cancel</button>
                                    <button onClick={handleAddItem} disabled={type === 'object' && !newKey.trim()} className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">Add</button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }

    // Primitive Values
    return (
        <div className="font-mono text-sm flex items-center gap-2 py-1 hover:bg-slate-50 rounded group" style={{ paddingLeft: `${depth * 16 + 20}px` }}>
            <span className="text-slate-600 flex-shrink-0">{label}:</span>
            <div className="flex-1">
                {type === 'boolean' ? (
                     <input type="checkbox" checked={value} onChange={handleInputChange} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                ) : type === 'string' ? (
                     <div className="relative w-full">
                        <Type size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
                        <input 
                            className="w-full bg-white border border-slate-200 rounded px-2 pl-6 py-0.5 text-green-700 focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none transition-all"
                            value={value}
                            onChange={handleInputChange}
                        />
                     </div>
                ) : (
                     <div className="relative w-full">
                        <Hash size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
                        <input 
                            type="number"
                            className="w-full bg-white border border-slate-200 rounded px-2 pl-6 py-0.5 text-blue-600 focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none transition-all"
                            value={value}
                            onChange={handleInputChange}
                        />
                     </div>
                )}
            </div>
            <button 
                onClick={() => onDelete(path)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 text-red-500 rounded transition-opacity flex-shrink-0"
            >
                <Trash2 size={12} />
            </button>
        </div>
    );
};
