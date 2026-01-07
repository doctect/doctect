
import React, { useState, useEffect, useRef } from 'react';
import { AppState } from '../types';
import { migrateState } from '../services/migration';
import { X, Save, AlertTriangle, FileJson, CheckCircle, Braces, AlignLeft, ListTree, FileText, Plus, Copy, MoreHorizontal } from 'lucide-react';
import clsx from 'clsx';
import { JsonTreeItem, NodeOption } from './json/JsonTreeItem';
import { MainCollectionItem } from './json/MainCollectionItem';

interface JsonModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentState: AppState;
    onSave: (newState: AppState) => void;
}

export const JsonModal: React.FC<JsonModalProps> = ({ isOpen, onClose, currentState, onSave }) => {
    const [mode, setMode] = useState<'visual' | 'text'>('visual');
    const [jsonString, setJsonString] = useState('');
    const [jsonObject, setJsonObject] = useState<any>({});

    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [scrollToId, setScrollToId] = useState<string | null>(null);

    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Initialize state when opening
    useEffect(() => {
        if (isOpen) {
            const formatted = JSON.stringify(currentState, null, 2);
            setJsonString(formatted);
            setJsonObject(JSON.parse(JSON.stringify(currentState))); // Deep copy
            setError(null);
            setSuccessMsg(null);
        }
    }, [isOpen, currentState]);

    // Handle scrolling to newly added items
    useEffect(() => {
        if (scrollToId) {
            // Add a small delay to ensure the DOM has updated with the new item
            const timer = setTimeout(() => {
                const el = document.getElementById(`item-${scrollToId}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Visual cue
                    el.classList.add('bg-blue-100', 'ring-1', 'ring-blue-300');
                    setTimeout(() => {
                        el.classList.remove('bg-blue-100', 'ring-1', 'ring-blue-300');
                    }, 2000);
                }
            }, 100);

            const clearTimer = setTimeout(() => {
                setScrollToId(null);
            }, 200);

            return () => {
                clearTimeout(timer);
                clearTimeout(clearTimer);
            };
        }
    }, [scrollToId, jsonObject]);

    const getAvailableNodes = (): NodeOption[] => {
        if (!jsonObject.nodes) return [];
        return Object.values(jsonObject.nodes).map((n: any) => ({
            id: n.id,
            title: n.title || 'Untitled'
        })).sort((a, b) => a.title.localeCompare(b.title));
    };

    const handleModeSwitch = (newMode: 'visual' | 'text') => {
        if (newMode === 'visual') {
            // Validate Text before switching to Visual
            try {
                const parsed = JSON.parse(jsonString);
                setJsonObject(parsed);
                setError(null);
                setMode('visual');
            } catch (e: any) {
                setError("Invalid JSON: Fix errors before switching to Visual Mode.");
            }
        } else {
            // Visual to Text is always safe (object to string)
            setJsonString(JSON.stringify(jsonObject, null, 2));
            setMode('text');
            setError(null);
        }
    };

    const handleVisualUpdate = (path: string[], newValue: any) => {
        setJsonObject((prev: any) => {
            const next = JSON.parse(JSON.stringify(prev)); // Deep clone
            let curr = next;
            for (let i = 0; i < path.length - 1; i++) {
                curr = curr[path[i]];
            }
            curr[path[path.length - 1]] = newValue;
            return next;
        });
    };

    const handleVisualAdd = (path: string[], key: string, newValue: any) => {
        setJsonObject((prev: any) => {
            const next = JSON.parse(JSON.stringify(prev));
            let curr = next;
            for (let i = 0; i < path.length; i++) {
                curr = curr[path[i]];
            }
            if (Array.isArray(curr)) {
                curr.push(newValue);
            } else if (curr && typeof curr === 'object') {
                curr[key] = newValue;
            }
            return next;
        });
    };

    const handleVisualDelete = (path: string[]) => {
        setJsonObject((prev: any) => {
            const next = JSON.parse(JSON.stringify(prev));
            let curr = next;
            for (let i = 0; i < path.length - 1; i++) {
                curr = curr[path[i]];
            }
            if (Array.isArray(curr)) {
                // Path endpoint is index for array
                const idx = Number(path[path.length - 1]);
                curr.splice(idx, 1);
            } else {
                delete curr[path[path.length - 1]];
            }
            return next;
        });
    };

    const handleAddNode = () => {
        const id = `node_${Math.random().toString(36).substr(2, 6)}`;
        const newNode = {
            id,
            parentId: null,
            type: Object.keys(jsonObject.templates || {})[0] || 'unknown',
            title: 'New Node',
            data: {},
            children: []
        };
        setJsonObject((prev: any) => ({
            ...prev,
            nodes: { ...prev.nodes, [id]: newNode }
        }));
        setSuccessMsg("Node added");
        setScrollToId(id);
        setTimeout(() => setSuccessMsg(null), 2000);
    };

    const handleAddTemplate = () => {
        const id = `tpl_${Math.random().toString(36).substr(2, 6)}`;
        const newTpl = {
            id,
            name: 'New Template',
            width: 595,
            height: 842,
            elements: []
        };
        setJsonObject((prev: any) => ({
            ...prev,
            templates: { ...prev.templates, [id]: newTpl }
        }));
        setSuccessMsg("Template added");
        setScrollToId(id);
        setTimeout(() => setSuccessMsg(null), 2000);
    };

    const handleSave = () => {
        try {
            let finalState: AppState;
            if (mode === 'text') {
                finalState = JSON.parse(jsonString);
            } else {
                finalState = jsonObject;
            }

            if (!finalState.nodes || !finalState.templates || !finalState.rootId) {
                throw new Error("Missing required properties (nodes, templates, or rootId)");
            }

            // Migrate to current schema version
            const migratedState = migrateState(finalState);

            onSave(migratedState);
            onClose();
        } catch (e: any) {
            setError(e.message);
        }
    };

    // Text Editor Helpers
    const formatTextJson = () => {
        try {
            const parsed = JSON.parse(jsonString);
            setJsonString(JSON.stringify(parsed, null, 2));
            setError(null);
        } catch (e) {
            setError("Invalid JSON");
        }
    };

    const insertAtCursor = (textToInsert: string) => {
        if (!textareaRef.current) return;
        const start = textareaRef.current.selectionStart;
        const end = textareaRef.current.selectionEnd;
        const text = jsonString;
        const newText = text.substring(0, start) + textToInsert + text.substring(end);
        setJsonString(newText);
        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                const newPos = start + textToInsert.length;
                textareaRef.current.setSelectionRange(newPos, newPos);
            }
        }, 0);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b bg-slate-50 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                            <FileJson size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">Project JSON Editor</h2>
                            <p className="text-xs text-slate-500">Edit raw structure directly.</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 bg-white p-1 rounded-lg border border-slate-200">
                        <button
                            onClick={() => handleModeSwitch('visual')}
                            className={clsx(
                                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                                mode === 'visual' ? "bg-blue-100 text-blue-700 shadow-sm" : "text-slate-500 hover:bg-slate-50"
                            )}
                        >
                            <ListTree size={16} /> Visual
                        </button>
                        <button
                            onClick={() => handleModeSwitch('text')}
                            className={clsx(
                                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                                mode === 'text' ? "bg-blue-100 text-blue-700 shadow-sm" : "text-slate-500 hover:bg-slate-50"
                            )}
                        >
                            <FileText size={16} /> Text
                        </button>
                    </div>

                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Editor Body */}
                <div className="flex-1 overflow-hidden relative bg-slate-50">
                    {mode === 'text' ? (
                        <>
                            {/* Text Toolbar */}
                            <div className="flex items-center gap-2 p-2 border-b bg-white overflow-x-auto">
                                <button onClick={formatTextJson} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-200 transition-colors whitespace-nowrap">
                                    <AlignLeft size={14} /> Format
                                </button>
                                <div className="w-px h-6 bg-slate-200 mx-2"></div>
                                <button onClick={() => insertAtCursor('{},')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 rounded border border-slate-100 transition-colors whitespace-nowrap">
                                    <Braces size={14} /> Object
                                </button>
                            </div>
                            <textarea
                                ref={textareaRef}
                                className={clsx(
                                    "w-full h-full p-4 font-mono text-sm outline-none resize-none leading-relaxed",
                                    error ? "bg-red-50/20" : "bg-slate-50 focus:bg-white transition-colors"
                                )}
                                value={jsonString}
                                onChange={(e) => {
                                    setJsonString(e.target.value);
                                    setError(null);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Tab') {
                                        e.preventDefault();
                                        insertAtCursor('  ');
                                    }
                                }}
                                spellCheck={false}
                            />
                        </>
                    ) : (
                        <div className="w-full h-full overflow-y-auto p-6 scroll-smooth">
                            <div className="max-w-4xl mx-auto space-y-8">

                                {/* NODES SECTION */}
                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                    <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex justify-between items-center">
                                        <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                            <ListTree size={18} className="text-blue-500" />
                                            Nodes
                                            <span className="text-xs font-normal text-slate-400 bg-white px-2 py-0.5 rounded border ml-2">
                                                {Object.keys(jsonObject.nodes || {}).length}
                                            </span>
                                        </h3>
                                        <button onClick={handleAddNode} className="flex items-center gap-1 text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 transition-colors shadow-sm">
                                            <Plus size={14} /> Add Node
                                        </button>
                                    </div>
                                    <div className="divide-y divide-slate-100">
                                        {jsonObject.nodes && Object.entries(jsonObject.nodes).map(([key, val]: [string, any]) => (
                                            <MainCollectionItem
                                                key={key}
                                                id={key}
                                                data={val}
                                                primaryKey="title"
                                                icon={<FileText size={16} />}
                                                path={['nodes', key]}
                                                onUpdate={handleVisualUpdate}
                                                onAdd={handleVisualAdd}
                                                onDelete={handleVisualDelete}
                                                getAvailableNodes={getAvailableNodes}
                                            />
                                        ))}
                                    </div>
                                </div>

                                {/* TEMPLATES SECTION */}
                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                    <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex justify-between items-center">
                                        <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                            <Copy size={18} className="text-indigo-500" />
                                            Templates
                                            <span className="text-xs font-normal text-slate-400 bg-white px-2 py-0.5 rounded border ml-2">
                                                {Object.keys(jsonObject.templates || {}).length}
                                            </span>
                                        </h3>
                                        <button onClick={handleAddTemplate} className="flex items-center gap-1 text-xs bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700 transition-colors shadow-sm">
                                            <Plus size={14} /> Add Template
                                        </button>
                                    </div>
                                    <div className="divide-y divide-slate-100">
                                        {jsonObject.templates && Object.entries(jsonObject.templates).map(([key, val]: [string, any]) => (
                                            <MainCollectionItem
                                                key={key}
                                                id={key}
                                                data={val}
                                                primaryKey="name"
                                                icon={<Copy size={16} />}
                                                path={['templates', key]}
                                                onUpdate={handleVisualUpdate}
                                                onAdd={handleVisualAdd}
                                                onDelete={handleVisualDelete}
                                            />
                                        ))}
                                    </div>
                                </div>

                                {/* OTHER SETTINGS */}
                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-4">
                                    <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><MoreHorizontal size={18} /> Other Settings</h3>
                                    <div className="space-y-1">
                                        {Object.entries(jsonObject).map(([key, val]) => {
                                            if (key === 'nodes' || key === 'templates') return null;
                                            return (
                                                <JsonTreeItem
                                                    key={key}
                                                    label={key}
                                                    value={val}
                                                    depth={0}
                                                    path={[key]}
                                                    onUpdate={handleVisualUpdate}
                                                    onAdd={handleVisualAdd}
                                                    onDelete={handleVisualDelete}
                                                    isRoot={true}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t bg-white flex justify-between items-center gap-4 flex-shrink-0">
                    <div className="flex-1 min-w-0">
                        {error ? (
                            <div className="text-red-700 text-sm flex items-center gap-2 bg-red-50 px-3 py-2 rounded border border-red-200 animate-in slide-in-from-bottom-2 fade-in">
                                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                                <span className="truncate font-medium">{error}</span>
                            </div>
                        ) : successMsg ? (
                            <div className="text-green-700 text-sm flex items-center gap-2 bg-green-50 px-3 py-2 rounded border border-green-200 animate-in slide-in-from-bottom-2 fade-in">
                                <CheckCircle className="w-4 h-4" />
                                <span className="font-medium">{successMsg}</span>
                            </div>
                        ) : (
                            <div className="text-slate-400 text-xs flex items-center gap-2 px-1">
                                {mode === 'visual' ? (
                                    <span>Visual Mode: Changes update internal state immediately. Click Apply to save.</span>
                                ) : (
                                    <span>Text Mode: Standard JSON editing.</span>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex gap-3 flex-shrink-0">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium text-sm transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm flex items-center gap-2 shadow-sm transition-all hover:shadow"
                        >
                            <Save className="w-4 h-4" />
                            Apply Changes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
