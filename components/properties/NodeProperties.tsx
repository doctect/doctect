
import React, { useState } from 'react';
import { AppState, AppNode } from '../../types';
import { Link, Plus, X } from 'lucide-react';

interface NodePropertiesProps {
    node: AppNode;
    state: AppState;
    onUpdateNode: (id: string, updates: Partial<AppNode>) => void;
}

export const NodeProperties: React.FC<NodePropertiesProps> = ({ node, state, onUpdateNode }) => {
    const [isAddingField, setIsAddingField] = useState(false);
    const [newFieldName, setNewFieldName] = useState("");

    const handleAddField = () => {
        if (newFieldName.trim()) {
            onUpdateNode(node.id, { data: { ...(node.data || {}), [newFieldName.trim()]: "" } });
            setIsAddingField(false);
            setNewFieldName("");
        }
    };

    if (node.referenceId) {
        return (
            <div className="mt-3 space-y-3">
                <div className="bg-indigo-50 p-3 rounded border border-indigo-100 text-sm">
                    <div className="flex items-center gap-2 text-indigo-700 font-bold mb-1">
                        <Link size={14}/> Reference Node
                    </div>
                    <p className="text-slate-600 mb-2">
                        This node links to <span className="font-mono bg-white px-1 rounded">{state.nodes[node.referenceId]?.title || 'Unknown'}</span>.
                    </p>
                </div>
            </div>
        );
    }
    
    // Safety check: ensure node.data exists
    const data = node.data || {};

    return (
        <div className="mt-3 space-y-3">
            <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Title</label>
                <input className="w-full border rounded px-2 py-1 text-sm mt-1"
                    value={node.title} onChange={(e) => onUpdateNode(node.id, { title: e.target.value })} />
            </div>
            <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Assigned Template</label>
                <select className="w-full border rounded px-2 py-1 text-sm mt-1 bg-white"
                    value={node.type} onChange={(e) => onUpdateNode(node.id, { type: e.target.value })}>
                    {Object.values(state.templates).map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                </select>
            </div>

            <div className="pt-2 border-t mt-2">
                <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-semibold text-slate-500 uppercase">Data Fields</label>
                <button onClick={() => setIsAddingField(true)} className="text-[10px] text-blue-600 hover:underline flex items-center gap-1">
                    <Plus size={10} /> Add
                </button>
                </div>
                
                {isAddingField && (
                    <div className="mb-2 p-2 bg-slate-100 rounded border border-slate-200">
                        <input 
                        autoFocus
                        placeholder="Field Name" 
                        className="w-full border rounded px-1 py-1 text-xs mb-1"
                        value={newFieldName}
                        onChange={e => setNewFieldName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddField()}
                        />
                        <div className="flex gap-1 justify-end">
                            <button onClick={() => setIsAddingField(false)} className="text-[10px] text-slate-500 hover:text-slate-700 px-1">Cancel</button>
                            <button onClick={handleAddField} className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded hover:bg-blue-700">Add</button>
                        </div>
                    </div>
                )}

                <div className="space-y-2">
                {Object.entries(data).map(([key, val]) => (
                    <div key={key}>
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] text-slate-500">{key}</label>
                            <button 
                                onClick={() => {
                                    const newData = {...data};
                                    delete newData[key];
                                    onUpdateNode(node.id, { data: newData });
                                }}
                                className="text-slate-400 hover:text-red-500 p-0.5"
                                title="Delete Field"
                            >
                                <X size={10} />
                            </button>
                        </div>
                        <input 
                            className="w-full border rounded px-2 py-1 text-xs bg-white" 
                            value={val}
                            onChange={(e) => onUpdateNode(node.id, { data: { ...data, [key]: e.target.value } })}
                        />
                    </div>
                ))}
                {Object.keys(data).length === 0 && !isAddingField && (
                    <div className="text-[10px] text-slate-400 italic">No custom data fields.</div>
                )}
                </div>
            </div>
        </div>
    );
};
