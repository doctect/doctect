import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AppState, AppNode, TemplateElement, PageTemplate, Variant, RM_PP_WIDTH, RM_PP_HEIGHT } from '../types';
import { Sidebar } from './Sidebar';
import { Canvas } from './Canvas';
import { PropertiesPanel } from './PropertiesPanel';
import { JsonModal } from './JsonModal';
import { NodeSelectorModal } from './NodeSelectorModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { HierarchyGeneratorModal } from './HierarchyGeneratorModal';
import { generatePDF } from '../services/pdfService';
import { migrateState } from '../services/migration';
import { Download, Code, Undo2, Redo2, Loader2, Contrast } from 'lucide-react';
import { EditorToolbar } from './EditorToolbar';
import { saveCustomPreset } from '../services/presets';
import { SavePresetModal } from './SavePresetModal';
import clsx from 'clsx';
import { trackEvent } from '../services/analytics';

interface HistoryState {
    past: { nodes: Record<string, AppNode>, variants: Record<string, Variant> }[];
    future: { nodes: Record<string, AppNode>, variants: Record<string, Variant> }[];
}

interface ProjectEditorProps {
    projectId: string;
    initialState: AppState;
    isActive: boolean;
    onNameChange: (name: string) => void;
    onStateChange?: (state: AppState) => void;
}

export const ProjectEditor: React.FC<ProjectEditorProps> = ({ projectId, initialState, isActive, onNameChange, onStateChange }) => {
    const [state, setState] = useState<AppState>(initialState);

    const [deleteConfirmState, setDeleteConfirmState] = useState<{ isOpen: boolean, nodeId: string | null }>({ isOpen: false, nodeId: null });
    const [showScriptGenModal, setShowScriptGenModal] = useState(false);
    const [showSavePresetModal, setShowSavePresetModal] = useState(false);
    const [resizingPanel, setResizingPanel] = useState<'sidebar' | 'properties' | null>(null);

    const [isExporting, setIsExporting] = useState(false);

    // History Management
    const historyRef = useRef<HistoryState>({ past: [], future: [] });

    const onNameChangeRef = useRef(onNameChange);
    const onStateChangeRef = useRef(onStateChange);

    useEffect(() => {
        onNameChangeRef.current = onNameChange;
        onStateChangeRef.current = onStateChange;
    }, [onNameChange, onStateChange]);

    // Update parent name when root title changes
    useEffect(() => {
        const rootNode = state.nodes[state.rootId];
        if (rootNode) {
            onNameChangeRef.current(rootNode.title);
        }
    }, [state.nodes[state.rootId]?.title]);

    // Debounce state changes to parent for persistence
    useEffect(() => {
        const timer = setTimeout(() => {
            if (onStateChangeRef.current) {
                onStateChangeRef.current(state);
            }
        }, 1000);
        return () => clearTimeout(timer);
    }, [state]);

    const saveToHistory = useCallback(() => {
        historyRef.current.past.push({
            nodes: JSON.parse(JSON.stringify(state.nodes)),
            variants: JSON.parse(JSON.stringify(state.variants))
        });
        // Limit history size to 50
        if (historyRef.current.past.length > 50) historyRef.current.past.shift();
        historyRef.current.future = [];
    }, [state.nodes, state.variants]);

    const undo = useCallback(() => {
        if (historyRef.current.past.length === 0) return;

        const previous = historyRef.current.past.pop();
        if (previous) {
            historyRef.current.future.push({
                nodes: JSON.parse(JSON.stringify(state.nodes)),
                variants: JSON.parse(JSON.stringify(state.variants))
            });
            setState(s => ({ ...s, nodes: previous.nodes, variants: previous.variants, selectedElementIds: [] }));
        }
    }, [state.nodes, state.variants]);

    const redo = useCallback(() => {
        if (historyRef.current.future.length === 0) return;

        const next = historyRef.current.future.pop();
        if (next) {
            historyRef.current.past.push({
                nodes: JSON.parse(JSON.stringify(state.nodes)),
                variants: JSON.parse(JSON.stringify(state.variants))
            });
            setState(s => ({ ...s, nodes: next.nodes, variants: next.variants, selectedElementIds: [] }));
        }
    }, [state.nodes, state.variants]);

    // Panel Resizing Logic
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!resizingPanel) return;
            // Only prevent default if we are actively resizing
            e.preventDefault();
            if (resizingPanel === 'sidebar') {
                const newWidth = Math.max(200, Math.min(600, e.clientX));
                setState(s => ({ ...s, sidebarWidth: newWidth }));
            } else if (resizingPanel === 'properties') {
                const newWidth = Math.max(250, Math.min(600, window.innerWidth - e.clientX));
                setState(s => ({ ...s, propertiesPanelWidth: newWidth }));
            }
        };
        const handleMouseUp = () => setResizingPanel(null);

        if (resizingPanel) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'col-resize';
        } else {
            document.body.style.cursor = 'default';
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [resizingPanel]);

    // Global Keyboard Shortcuts
    useEffect(() => {
        if (!isActive) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (state.showJsonModal || state.showNodeSelector || deleteConfirmState.isOpen || showScriptGenModal || showSavePresetModal) return;
            const activeTag = document.activeElement?.tagName.toLowerCase();
            if (activeTag === 'input' || activeTag === 'textarea') return;

            // Undo: Ctrl+Z
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) redo();
                else undo();
                return;
            }

            // Redo: Ctrl+Y
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                redo();
                return;
            }

            // Delete
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (state.selectedElementIds.length > 0) {
                    saveToHistory();
                    handleDeleteElements(state.selectedElementIds);
                }
            }

            // --- Clipboard Operations ---

            // Copy: Ctrl+C
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                if (state.selectedElementIds.length > 0) {
                    e.preventDefault();
                    const template = getCurrentTemplate();
                    if (template) {
                        const elementsToCopy = template.elements.filter(el => state.selectedElementIds.includes(el.id));
                        setState(s => ({ ...s, clipboard: elementsToCopy }));
                    }
                }
            }

            // Cut: Ctrl+X
            if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
                if (state.selectedElementIds.length > 0) {
                    e.preventDefault();
                    saveToHistory();
                    const template = getCurrentTemplate();
                    if (template) {
                        const elementsToCopy = template.elements.filter(el => state.selectedElementIds.includes(el.id));
                        setState(s => ({ ...s, clipboard: elementsToCopy }));
                        handleDeleteElements(state.selectedElementIds);
                    }
                }
            }

            // Paste: Ctrl+V or Ctrl+P
            if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'p')) {
                if (state.clipboard.length > 0) {
                    e.preventDefault();
                    saveToHistory();
                    handlePaste();
                }
            }

            // Duplicate: Ctrl+D
            if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
                e.preventDefault();
                if (state.selectedElementIds.length > 0) {
                    saveToHistory();
                    handleDuplicate();
                }
            }

            // --- Tool Switching Shortcuts ---
            if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                switch (e.key.toLowerCase()) {
                    case 'v': setState(s => ({ ...s, tool: 'select' })); break;
                    case 'h': setState(s => ({ ...s, tool: 'hand' })); break;
                    case 't': setState(s => ({ ...s, tool: 'text' })); break;
                    case 'r': setState(s => ({ ...s, tool: 'rect' })); break;
                    case 'e': setState(s => ({ ...s, tool: 'ellipse' })); break;
                    case 'y': setState(s => ({ ...s, tool: 'triangle' })); break;
                    case 'l': setState(s => ({ ...s, tool: 'line' })); break;
                    case 'g': setState(s => ({ ...s, tool: 'grid' })); break;
                }
            }

            // --- Arrow Key Movement ---
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                if (state.selectedElementIds.length > 0) {
                    e.preventDefault();
                    saveToHistory();

                    const delta = e.shiftKey ? 10 : (state.snapToGrid ? 10 : 1);
                    const dx = e.key === 'ArrowLeft' ? -delta : e.key === 'ArrowRight' ? delta : 0;
                    const dy = e.key === 'ArrowUp' ? -delta : e.key === 'ArrowDown' ? delta : 0;

                    const template = getCurrentTemplate();
                    if (template) {
                        const newElements = template.elements.map(el => {
                            if (state.selectedElementIds.includes(el.id)) {
                                return { ...el, x: el.x + dx, y: el.y + dy };
                            }
                            return el;
                        });
                        handleUpdateTemplateElements(newElements, false); // false = don't double save history
                    }
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [state, undo, redo, saveToHistory, isActive, showScriptGenModal, showSavePresetModal]);


    // Helper: Get templates from active variant
    const getActiveTemplates = useCallback((): Record<string, PageTemplate> => {
        return state.variants[state.activeVariantId]?.templates || {};
    }, [state.variants, state.activeVariantId]);

    const getCurrentTemplate = (): PageTemplate | null => {
        let targetTemplateId = state.selectedTemplateId;
        if (state.viewMode === 'hierarchy') targetTemplateId = state.nodes[state.selectedNodeId]?.type;
        if (!targetTemplateId) return null;
        return getActiveTemplates()[targetTemplateId];
    };

    const handleDuplicate = () => {
        const template = getCurrentTemplate();
        if (!template) return;

        const newElements: TemplateElement[] = [];
        const newIds: string[] = [];

        state.selectedElementIds.forEach(id => {
            const original = template.elements.find(e => e.id === id);
            if (original) {
                const newId = Math.random().toString(36).substr(2, 9);
                newIds.push(newId);
                newElements.push({
                    ...JSON.parse(JSON.stringify(original)),
                    id: newId,
                    x: original.x + 20,
                    y: original.y + 20,
                    zIndex: (Math.max(...template.elements.map(e => e.zIndex || 0), 0)) + 1
                });
            }
        });

        if (newElements.length > 0) {
            handleUpdateTemplateElements([...template.elements, ...newElements], false);
            setState(s => ({ ...s, selectedElementIds: newIds }));
        }
    };

    const handlePaste = () => {
        const template = getCurrentTemplate();
        if (!template || state.clipboard.length === 0) return;

        const newElements: TemplateElement[] = [];
        const newIds: string[] = [];
        const offset = 20;

        state.clipboard.forEach(item => {
            const newId = Math.random().toString(36).substr(2, 9);
            newIds.push(newId);
            newElements.push({
                ...JSON.parse(JSON.stringify(item)),
                id: newId,
                x: item.x + offset,
                y: item.y + offset,
                zIndex: (Math.max(...template.elements.map(e => e.zIndex || 0), 0)) + 1
            });
        });

        handleUpdateTemplateElements([...template.elements, ...newElements], false);
        setState(s => ({ ...s, selectedElementIds: newIds }));
    };

    const handleUpdateNode = (id: string, updates: Partial<AppNode>) => {
        saveToHistory();
        setState(prev => ({ ...prev, nodes: { ...prev.nodes, [id]: { ...prev.nodes[id], ...updates } } }));
    };

    const handleAddNode = (parentId: string | null) => {
        saveToHistory();
        const newId = Math.random().toString(36).substr(2, 9);
        const parentNode = parentId ? state.nodes[parentId] : null;
        const activeTemplates = getActiveTemplates();
        let newType = 'day_view';
        if (activeTemplates['day_view']) {
            if (parentNode?.type === 'year_view') newType = 'month_view';
            if (!parentNode) newType = 'year_view';
        } else {
            newType = Object.keys(activeTemplates)[0];
        }

        const newNode: AppNode = { id: newId, parentId, type: newType, title: 'New Page', data: {}, children: [] };
        setState(prev => {
            const nextNodes = { ...prev.nodes, [newId]: newNode };
            if (parentId) nextNodes[parentId] = { ...nextNodes[parentId], children: [...nextNodes[parentId].children, newId] };
            return { ...prev, nodes: nextNodes };
        });
    };

    const handleAddReference = (parentId: string) => {
        setState(prev => ({ ...prev, showNodeSelector: true, nodeSelectorMode: 'create_reference', selectedNodeId: parentId }));
    };

    const requestDeleteNode = (id: string) => {
        if (id === state.rootId) {
            alert("Cannot delete root node.");
            return;
        }
        setDeleteConfirmState({ isOpen: true, nodeId: id });
    };

    const executeDeleteNode = () => {
        const id = deleteConfirmState.nodeId;
        if (!id) return;
        saveToHistory();

        setState(prev => {
            const nextNodes = { ...prev.nodes };
            const idsToDelete = new Set<string>();
            const queue = [id];

            while (queue.length > 0) {
                const currentId = queue.shift()!;
                if (idsToDelete.has(currentId)) continue;
                idsToDelete.add(currentId);
                const node = nextNodes[currentId];
                if (!node) continue;
                if (node.children) queue.push(...node.children);
                Object.values(nextNodes).forEach(n => {
                    if (n.referenceId === currentId && !idsToDelete.has(n.id)) queue.push(n.id);
                });
            }

            idsToDelete.forEach(deletedId => {
                const node = nextNodes[deletedId];
                if (node && node.parentId) {
                    const parent = nextNodes[node.parentId];
                    if (parent && !idsToDelete.has(node.parentId)) {
                        nextNodes[node.parentId] = {
                            ...parent,
                            children: parent.children.filter(childId => childId !== deletedId)
                        };
                    }
                }
            });

            idsToDelete.forEach(nodeId => { delete nextNodes[nodeId]; });

            // Clean up templates in all variants when nodes are deleted
            const nextVariants = { ...prev.variants };
            Object.keys(nextVariants).forEach(variantId => {
                const variant = nextVariants[variantId];
                const nextTemplates = { ...variant.templates };
                let variantChanged = false;
                Object.keys(nextTemplates).forEach(tplId => {
                    const tpl = nextTemplates[tplId];
                    let tplChanged = false;
                    const newElements = tpl.elements.map(el => {
                        let elChanged = false;
                        let newEl = { ...el };
                        if (newEl.type === 'grid' && newEl.gridConfig?.sourceType === 'specific' && newEl.gridConfig.sourceId && idsToDelete.has(newEl.gridConfig.sourceId)) {
                            newEl.gridConfig = { ...newEl.gridConfig, sourceType: 'current', sourceId: undefined };
                            elChanged = true;
                        }
                        if (newEl.linkTarget === 'specific_node' && newEl.linkValue && idsToDelete.has(newEl.linkValue)) {
                            newEl.linkTarget = 'none';
                            newEl.linkValue = undefined;
                            elChanged = true;
                        }
                        if (elChanged) tplChanged = true;
                        return newEl;
                    });
                    if (tplChanged) {
                        nextTemplates[tplId] = { ...tpl, elements: newElements };
                        variantChanged = true;
                    }
                });
                if (variantChanged) {
                    nextVariants[variantId] = { ...variant, templates: nextTemplates };
                }
            });

            let newSelectedId = prev.selectedNodeId;
            if (idsToDelete.has(newSelectedId) || !nextNodes[newSelectedId]) newSelectedId = prev.rootId;

            return { ...prev, nodes: nextNodes, variants: nextVariants, selectedNodeId: newSelectedId, selectedElementIds: [] };
        });

        setDeleteConfirmState({ isOpen: false, nodeId: null });
    };

    const handleCreateReference = (targetId: string) => {
        const parentId = state.selectedNodeId;
        const targetNode = state.nodes[targetId];
        if (!parentId || !targetNode) return;
        saveToHistory();

        const newId = `ref_${Math.random().toString(36).substr(2, 9)}`;
        const newNode: AppNode = { id: newId, parentId, type: targetNode.type, title: targetNode.title, data: {}, children: [], referenceId: targetId };

        setState(prev => {
            const nextNodes = { ...prev.nodes, [newId]: newNode };
            nextNodes[parentId] = { ...nextNodes[parentId], children: [...nextNodes[parentId].children, newId] };
            return { ...prev, nodes: nextNodes };
        });
    };

    const handleAddTemplate = () => {
        saveToHistory();
        const newId = `tpl_${Math.random().toString(36).substr(2, 6)}`;
        const newTemplate: PageTemplate = { id: newId, name: 'New Template', width: RM_PP_WIDTH, height: RM_PP_HEIGHT, elements: [] };
        setState(prev => {
            const activeVariant = prev.variants[prev.activeVariantId];
            const updatedVariant = { ...activeVariant, templates: { ...activeVariant.templates, [newId]: newTemplate } };
            return { ...prev, variants: { ...prev.variants, [prev.activeVariantId]: updatedVariant }, selectedTemplateId: newId };
        });
    };

    const handleAddVariant = () => {
        saveToHistory();
        const newId = `variant_${Math.random().toString(36).substr(2, 6)}`;
        // Create a new variant with a copy of the first template from active variant as a starting point
        const activeTemplates = getActiveTemplates();
        const firstTemplateId = Object.keys(activeTemplates)[0];
        const newVariant: Variant = {
            id: newId,
            name: `New Variant`,
            templates: firstTemplateId ? { [firstTemplateId]: { ...activeTemplates[firstTemplateId], elements: [] } } : {}
        };
        setState(prev => ({
            ...prev,
            variants: { ...prev.variants, [newId]: newVariant },
            activeVariantId: newId,
            selectedTemplateId: Object.keys(newVariant.templates)[0] || prev.selectedTemplateId
        }));
    };

    const handleSelectVariant = (variantId: string) => {
        if (!state.variants[variantId]) return;
        const firstTemplateId = Object.keys(state.variants[variantId].templates)[0];
        setState(prev => ({
            ...prev,
            activeVariantId: variantId,
            selectedTemplateId: firstTemplateId || prev.selectedTemplateId,
            selectedElementIds: []
        }));
    };

    const handleRenameVariant = (variantId: string, name: string) => {
        if (!state.variants[variantId]) return;
        saveToHistory();
        setState(prev => ({
            ...prev,
            variants: {
                ...prev.variants,
                [variantId]: { ...prev.variants[variantId], name }
            }
        }));
    };

    const handleDeleteVariant = (variantId: string) => {
        if (Object.keys(state.variants).length <= 1) {
            alert("Cannot delete the last variant.");
            return;
        }
        saveToHistory();
        const remainingVariants = { ...state.variants };
        delete remainingVariants[variantId];
        const newActiveId = Object.keys(remainingVariants)[0];
        const firstTemplateId = Object.keys(remainingVariants[newActiveId].templates)[0];
        setState(prev => ({
            ...prev,
            variants: remainingVariants,
            activeVariantId: newActiveId,
            selectedTemplateId: firstTemplateId || prev.selectedTemplateId,
            selectedElementIds: []
        }));
    };

    const handleDuplicateVariant = (variantId: string) => {
        if (!state.variants[variantId]) return;
        saveToHistory();
        const sourceVariant = state.variants[variantId];
        const newId = `variant_${Math.random().toString(36).substr(2, 6)}`;
        const newVariant: Variant = {
            id: newId,
            name: `${sourceVariant.name} (Copy)`,
            templates: JSON.parse(JSON.stringify(sourceVariant.templates)) // Deep copy templates
        };
        setState(prev => ({
            ...prev,
            variants: { ...prev.variants, [newId]: newVariant },
            activeVariantId: newId,
            selectedTemplateId: Object.keys(newVariant.templates)[0] || prev.selectedTemplateId
        }));
    };
    const handleDeleteTemplate = (id: string) => {
        const activeTemplates = getActiveTemplates();
        if (Object.keys(activeTemplates).length <= 1) return alert("Cannot delete the last template.");
        saveToHistory();
        setState(prev => {
            const activeVariant = prev.variants[prev.activeVariantId];
            const nextTemplates = { ...activeVariant.templates }; delete nextTemplates[id];
            const updatedVariant = { ...activeVariant, templates: nextTemplates };
            return { ...prev, variants: { ...prev.variants, [prev.activeVariantId]: updatedVariant }, selectedTemplateId: Object.keys(nextTemplates)[0] };
        });
    };
    const handleUpdateTemplateName = (id: string, name: string) => {
        saveToHistory();
        setState(prev => {
            const activeVariant = prev.variants[prev.activeVariantId];
            const updatedVariant = { ...activeVariant, templates: { ...activeVariant.templates, [id]: { ...activeVariant.templates[id], name } } };
            return { ...prev, variants: { ...prev.variants, [prev.activeVariantId]: updatedVariant } };
        });
    };
    const handleUpdateTemplate = (id: string, updates: Partial<PageTemplate>) => {
        saveToHistory();
        setState(prev => {
            const activeVariant = prev.variants[prev.activeVariantId];
            const updatedVariant = { ...activeVariant, templates: { ...activeVariant.templates, [id]: { ...activeVariant.templates[id], ...updates } } };
            return { ...prev, variants: { ...prev.variants, [prev.activeVariantId]: updatedVariant } };
        });
    };

    const handleUpdateTemplateElements = (newElements: TemplateElement[], shouldSaveHistory = true) => {
        let targetTemplateId = state.selectedTemplateId;
        if (state.viewMode === 'hierarchy') {
            const currentNode = state.nodes[state.selectedNodeId];
            if (!currentNode) return;
            targetTemplateId = currentNode.type;
        }
        if (shouldSaveHistory) saveToHistory();
        setState(prev => {
            const activeVariant = prev.variants[prev.activeVariantId];
            const updatedVariant = { ...activeVariant, templates: { ...activeVariant.templates, [targetTemplateId]: { ...activeVariant.templates[targetTemplateId], elements: newElements } } };
            return { ...prev, variants: { ...prev.variants, [prev.activeVariantId]: updatedVariant } };
        });
    };

    const handleDeleteElements = (ids: string[]) => {
        let targetTemplateId = state.selectedTemplateId;
        if (state.viewMode === 'hierarchy') targetTemplateId = state.nodes[state.selectedNodeId]?.type;
        if (!targetTemplateId) return;
        const activeTemplates = getActiveTemplates();
        const currentTemplate = activeTemplates[targetTemplateId];
        const newElements = currentTemplate.elements.filter(el => !ids.includes(el.id));
        handleUpdateTemplateElements(newElements, false);
        setState(prev => ({ ...prev, selectedElementIds: [] }));
    };

    const handleUpdateElement = (id: string, updates: Partial<TemplateElement>) => {
        let targetTemplateId = state.selectedTemplateId;
        if (state.viewMode === 'hierarchy') targetTemplateId = state.nodes[state.selectedNodeId]?.type;
        if (!targetTemplateId) return;
        saveToHistory();
        const activeTemplates = getActiveTemplates();
        const tpl = activeTemplates[targetTemplateId];
        const newElements = tpl.elements.map(el => el.id === id ? { ...el, ...updates } : el);
        handleUpdateTemplateElements(newElements, false);
    };

    const handleImportGenerated = (newState: Partial<AppState> & { templates?: Record<string, PageTemplate> }) => {
        console.group("ProjectEditor: Import Debug");
        try {
            if (!newState) throw new Error("Import state is null or undefined");
            if (!newState.nodes || typeof newState.nodes !== 'object') throw new Error("Import Error: 'nodes' must be a valid object");
            // Accept either old format (templates) or new format (variants)
            const hasTemplates = newState.templates && typeof newState.templates === 'object';
            const hasVariants = newState.variants && typeof newState.variants === 'object';
            if (!hasTemplates && !hasVariants) throw new Error("Import Error: 'templates' or 'variants' must be provided");
            if (!newState.rootId) throw new Error("Import Error: 'rootId' is missing");

            const cleanNodes: Record<string, AppNode> = {};
            for (const key in newState.nodes) {
                if (Object.prototype.hasOwnProperty.call(newState.nodes, key)) {
                    const node = newState.nodes[key];
                    if (node && typeof node === 'object') {
                        cleanNodes[key] = {
                            ...node,
                            data: node.data || {},
                            children: Array.isArray(node.children) ? node.children : []
                        };
                    }
                }
            }

            // Clean templates if provided (old format), else use variants
            let cleanTemplates: Record<string, PageTemplate> | undefined;
            if (hasTemplates && newState.templates) {
                cleanTemplates = {};
                for (const key in newState.templates) {
                    if (Object.prototype.hasOwnProperty.call(newState.templates, key)) {
                        const tpl = newState.templates[key];
                        if (tpl && typeof tpl === 'object') {
                            cleanTemplates[key] = tpl;
                        }
                    }
                }
            }

            saveToHistory();

            const newRootId = newState.rootId;
            if (!cleanNodes[newRootId]) throw new Error(`Root node '${newRootId}' missing from generated nodes.`);

            // Build a partial state and migrate it to ensure schema compatibility
            // If old format with templates, migration will convert to variants
            const stateToMigrate: any = {
                ...state,
                nodes: cleanNodes,
                rootId: newRootId,
            };
            if (cleanTemplates) {
                stateToMigrate.templates = cleanTemplates;
                delete stateToMigrate.variants; // Remove variants so migration creates from templates
                stateToMigrate.schemaVersion = 3; // Force migration from v3 to v4
            } else if (newState.variants) {
                stateToMigrate.variants = newState.variants;
                stateToMigrate.activeVariantId = newState.activeVariantId || Object.keys(newState.variants)[0];
            }
            const migratedState = migrateState(stateToMigrate);

            setState(s => ({
                ...s,
                nodes: migratedState.nodes,
                variants: migratedState.variants,
                activeVariantId: migratedState.activeVariantId,
                rootId: migratedState.rootId,
                schemaVersion: migratedState.schemaVersion,
                selectedNodeId: newRootId,
                selectedElementIds: []
            }));
            trackEvent('generator_run', { rootId: newRootId, nodeCount: Object.keys(cleanNodes).length });
        } catch (e: any) {
            console.error("Critical Import Error:", e);
            alert(`Import Failed: ${e.message}`);
        } finally {
            console.groupEnd();
        }
    };

    const handleSavePreset = (title: string, desc: string) => {
        // Clean up UI state before saving to minimize size
        const stateToSave = {
            ...state,
            selectedElementIds: [],
            selectedNodeId: state.rootId,
            clipboard: [],
            // We don't save history or undo stack
        };

        const success = saveCustomPreset({
            id: `custom_${Date.now()}`,
            title,
            desc: desc || "",
            initialState: stateToSave,
            isCustom: true
        });

        setShowSavePresetModal(false);

        if (success) {
            trackEvent('preset_saved', { title: title });
            alert("Preset saved successfully! You can now access it from the 'New Project' menu.");
        } else {
            alert("Failed to save preset. Local storage might be full.");
        }
    };

    const [exportGreyscale, setExportGreyscale] = useState(false);

    const handleExportPDF = async () => {
        setIsExporting(true);
        // Allow UI update before freezing
        setTimeout(async () => {
            try {
                await generatePDF(state, { isGreyscale: exportGreyscale });
                trackEvent('pdf_exported', { projectId: projectId, pageCount: Object.keys(getActiveTemplates()).length, isGreyscale: exportGreyscale });
            } catch (e) {
                console.error(e);
                alert("Failed to export PDF");
            } finally {
                setIsExporting(false);
            }
        }, 50);
    };

    const currentTemplateId = state.viewMode === 'hierarchy' ? state.nodes[state.selectedNodeId]?.type : state.selectedTemplateId;
    const activeTemplateMap = getActiveTemplates();
    const currentTemplate = activeTemplateMap[currentTemplateId] || Object.values(activeTemplateMap)[0];

    // Compute the effective node ID for preview/context
    // In hierarchy mode: use the selected node
    // In template mode: use templatePreviewNodeId if valid, or first matching node, or root
    const effectivePreviewNodeId = useMemo(() => {
        if (state.viewMode === 'hierarchy') {
            return state.selectedNodeId;
        }

        // Template mode - find a suitable node for preview
        const templateId = state.selectedTemplateId;

        // If a preview node is explicitly set and it matches the template, use it
        if (state.templatePreviewNodeId) {
            const node = state.nodes[state.templatePreviewNodeId];
            if (node && node.type === templateId) {
                return state.templatePreviewNodeId;
            }
        }

        // Otherwise find first node using this template
        const matchingNode = Object.values(state.nodes).find(n => n.type === templateId);
        if (matchingNode) {
            return matchingNode.id;
        }

        // Fallback to root
        return state.rootId;
    }, [state.viewMode, state.selectedNodeId, state.selectedTemplateId, state.templatePreviewNodeId, state.nodes, state.rootId]);

    return (
        <div className="flex h-full w-full flex-col bg-slate-100 text-slate-900 overflow-hidden">
            {/* Editor Toolbar */}
            <div className="h-10 bg-white border-b flex items-center justify-between px-4 z-20 flex-shrink-0">
                <div className="text-xs text-slate-400 font-mono">
                    {projectId.split('-')[0]}
                </div>

                <div className="flex gap-2">
                    <div className="flex items-center bg-slate-100 rounded p-0.5 mr-2">
                        <button onClick={undo} disabled={historyRef.current.past.length === 0} className="p-1 text-slate-600 hover:bg-white hover:shadow-sm rounded disabled:opacity-30 transition-all" title="Undo (Ctrl+Z)">
                            <Undo2 size={14} />
                        </button>
                        <button onClick={redo} disabled={historyRef.current.future.length === 0} className="p-1 text-slate-600 hover:bg-white hover:shadow-sm rounded disabled:opacity-30 transition-all" title="Redo (Ctrl+Y)">
                            <Redo2 size={14} />
                        </button>
                    </div>
                    <button onClick={() => setState(s => ({ ...s, showJsonModal: true }))} className="p-1 px-2 text-slate-600 hover:bg-slate-100 rounded flex items-center gap-2 text-xs font-medium"><Code size={14} /> JSON</button>
                    <div className="h-4 w-px bg-slate-300 mx-1 self-center"></div>

                    <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-md p-1 pl-1">
                        <button
                            onClick={() => setExportGreyscale(!exportGreyscale)}
                            className={clsx(
                                "p-1.5 rounded transition-all mr-1 focus:outline-none focus:ring-1 focus:ring-blue-500",
                                exportGreyscale ? "bg-blue-100 text-blue-600" : "text-slate-400 hover:text-slate-600 hover:bg-slate-200"
                            )}
                            title={exportGreyscale ? "Greyscale Export: ON" : "Greyscale Export: OFF"}
                        >
                            <Contrast size={14} />
                        </button>

                        <button
                            onClick={handleExportPDF}
                            disabled={isExporting}
                            className={clsx(
                                "text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded flex items-center gap-2 text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-wait shadow-sm",
                                isExporting && "opacity-75"
                            )}
                        >
                            {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                            {isExporting ? "Generating..." : "Export PDF"}
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                <div style={{ width: state.sidebarWidth }} className="flex-shrink-0 relative flex flex-col">
                    <Sidebar
                        state={state}
                        onSelectNode={(id) => setState(s => ({ ...s, selectedNodeId: id, selectedElementIds: [] }))}
                        onAddNode={handleAddNode}
                        onAddReference={handleAddReference}
                        onDeleteNode={requestDeleteNode}
                        onUpdateNode={handleUpdateNode}
                        onChangeViewMode={(mode) => setState(s => ({ ...s, viewMode: mode, selectedElementIds: [] }))}
                        onSelectTemplate={(id) => setState(s => ({ ...s, selectedTemplateId: id, selectedElementIds: [] }))}
                        onAddTemplate={handleAddTemplate}
                        onDeleteTemplate={handleDeleteTemplate}
                        onUpdateTemplateName={handleUpdateTemplateName}
                        onSelectVariant={handleSelectVariant}
                        onAddVariant={handleAddVariant}
                        onRenameVariant={handleRenameVariant}
                        onDeleteVariant={handleDeleteVariant}
                        onDuplicateVariant={handleDuplicateVariant}
                    />
                    <div
                        className="absolute right-0 top-0 bottom-0 w-1 hover:bg-blue-400 cursor-col-resize z-30 transition-colors"
                        onMouseDown={() => setResizingPanel('sidebar')}
                    />
                </div>

                <div className="flex-1 flex flex-col relative min-w-0">
                    <EditorToolbar
                        state={state}
                        setState={setState}
                        onOpenScriptGen={() => setShowScriptGenModal(true)}
                        onSavePreset={() => setShowSavePresetModal(true)}
                    />

                    <div className="flex-1 bg-slate-200 overflow-hidden relative flex flex-col">
                        <Canvas
                            template={currentTemplate}
                            elements={currentTemplate?.elements || []}
                            selectedElementIds={state.selectedElementIds}
                            scale={state.scale}
                            tool={state.tool}
                            nodes={state.nodes}
                            currentNodeId={effectivePreviewNodeId}
                            snapToGrid={state.snapToGrid}
                            showGrid={state.showGrid}
                            onInteractionStart={saveToHistory}
                            onUpdateElements={(els, save) => handleUpdateTemplateElements(els, save)}
                            onSelectElements={(ids) => setState(s => ({ ...s, selectedElementIds: ids }))}
                            onZoom={(newScale) => setState(s => ({ ...s, scale: newScale }))}
                            onSwitchToSelect={() => setState(s => ({ ...s, tool: 'select' }))}
                        />
                    </div>
                </div>

                <div style={{ width: state.propertiesPanelWidth }} className="flex-shrink-0 relative flex flex-col">
                    <div
                        className="absolute left-0 top-0 bottom-0 w-1 hover:bg-blue-400 cursor-col-resize z-30 transition-colors"
                        onMouseDown={() => setResizingPanel('properties')}
                    />
                    <PropertiesPanel
                        state={state}
                        onUpdateElements={(els, save) => handleUpdateTemplateElements(els, save)}
                        onUpdateNode={handleUpdateNode}
                        onDeleteElements={(ids) => { saveToHistory(); handleDeleteElements(ids); }}
                        onOpenNodeSelector={(mode, elId) => setState(s => ({ ...s, showNodeSelector: true, nodeSelectorMode: mode, editingElementId: elId }))}
                        onUpdateTemplate={handleUpdateTemplate}
                    />
                </div>
            </div>

            <JsonModal
                isOpen={state.showJsonModal}
                onClose={() => setState(s => ({ ...s, showJsonModal: false }))}
                currentState={state}
                onSave={(newState) => { saveToHistory(); setState(newState); }}
            />

            <HierarchyGeneratorModal
                isOpen={showScriptGenModal}
                onClose={() => setShowScriptGenModal(false)}
                onImport={handleImportGenerated}
            />

            <SavePresetModal
                isOpen={showSavePresetModal}
                onClose={() => setShowSavePresetModal(false)}
                onSave={handleSavePreset}
                defaultTitle={state.nodes[state.rootId]?.title}
            />

            <NodeSelectorModal
                isOpen={state.showNodeSelector}
                onClose={() => setState(s => ({ ...s, showNodeSelector: false, editingElementId: null }))}
                state={state}
                title={state.nodeSelectorMode === 'create_reference' ? 'Select Reference Target' : 'Select Source Node'}
                onSelect={(nodeId) => {
                    saveToHistory();
                    if (state.nodeSelectorMode === 'create_reference') {
                        handleCreateReference(nodeId);
                    } else if (state.editingElementId) {
                        const activeTemplates = getActiveTemplates();
                        const templateToUpdate = state.viewMode === 'hierarchy'
                            ? activeTemplates[state.nodes[state.selectedNodeId].type]
                            : activeTemplates[state.selectedTemplateId];

                        const newElements = templateToUpdate.elements.map(el => {
                            if (el.id === state.editingElementId) {
                                if (state.nodeSelectorMode === 'grid_source' && el.gridConfig) {
                                    return { ...el, gridConfig: { ...el.gridConfig, sourceType: 'specific' as const, sourceId: nodeId } };
                                }
                                if (state.nodeSelectorMode === 'link_element') {
                                    return { ...el, linkTarget: 'specific_node' as const, linkValue: nodeId };
                                }
                            }
                            return el;
                        });
                        handleUpdateTemplateElements(newElements, false);
                    }
                }}
            />

            <DeleteConfirmModal
                isOpen={deleteConfirmState.isOpen}
                onClose={() => setDeleteConfirmState({ isOpen: false, nodeId: null })}
                onConfirm={executeDeleteNode}
                nodeTitle={deleteConfirmState.nodeId ? (state.nodes[deleteConfirmState.nodeId]?.title || 'Node') : ''}
            />
        </div>
    );
}