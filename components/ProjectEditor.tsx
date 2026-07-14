import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AppState, AppNode, GeneratorProvenance, TemplateElement, PageTemplate, Variant, RM_PP_WIDTH, RM_PP_HEIGHT } from '../types';
import { Sidebar } from './Sidebar';
import { Canvas } from './Canvas';
import { PropertiesPanel } from './PropertiesPanel';
import { LayersPanel } from './LayersPanel';
import { CollapsibleSection } from './CollapsibleSection';
import { JsonModal } from './JsonModal';
import { NodeSelectorModal } from './NodeSelectorModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { HierarchyGeneratorModal } from './HierarchyGeneratorModal';
import { generatePDF } from '../services/pdfService';
import { CURRENT_SCHEMA_VERSION } from '../services/migration';
import { Download, Code, Undo2, Redo2, Loader2, Contrast, Layers } from 'lucide-react';
import { EditorToolbar } from './EditorToolbar';
import { saveCustomPreset } from '../services/presets';
import { SavePresetModal } from './SavePresetModal';
import { NewVariantModal, NewVariantConfig } from './NewVariantModal';
import { reflowTemplates } from '../services/reflow';
import clsx from 'clsx';
import { trackEvent } from '../services/analytics';
import { resolveActiveLayerId, nextZIndexInLayer, createDefaultLayer } from '../services/layers';
import { PLACEHOLDER_SVG, createPlacedSvgElement } from '../services/svgEditing';
import { DocumentSnapshot, restoreDocument, snapshotDocument } from '../services/projectDocumentSnapshot';
import type { GeneratedProject } from '../services/validateGeneratedProject';

interface HistoryState {
    past: DocumentSnapshot[];
    future: DocumentSnapshot[];
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

    const [deleteConfirmState, setDeleteConfirmState] = useState<{ isOpen: boolean, nodeIds: string[] }>({ isOpen: false, nodeIds: [] });
    const [showScriptGenModal, setShowScriptGenModal] = useState(false);
    // Session-local: the Layers section always starts collapsed on load.
    const [layersExpanded, setLayersExpanded] = useState(false);
    const [showSavePresetModal, setShowSavePresetModal] = useState(false);
    const [showNewVariantModal, setShowNewVariantModal] = useState(false);
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
        historyRef.current.past.push(snapshotDocument(state));
        // Limit history size to 50
        if (historyRef.current.past.length > 50) historyRef.current.past.shift();
        historyRef.current.future = [];
    }, [state]);

    const undo = useCallback(() => {
        if (historyRef.current.past.length === 0) return;

        const previous = historyRef.current.past.pop();
        if (previous) {
            historyRef.current.future.push(snapshotDocument(state));
            setState(s => restoreDocument(s, previous));
        }
    }, [state]);

    const redo = useCallback(() => {
        if (historyRef.current.future.length === 0) return;

        const next = historyRef.current.future.pop();
        if (next) {
            historyRef.current.past.push(snapshotDocument(state));
            setState(s => restoreDocument(s, next));
        }
    }, [state]);

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
                } else if (state.viewMode === 'hierarchy' && state.selectedNodeIds?.length > 0) {
                    requestDeleteNodes(state.selectedNodeIds);
                } else if (state.viewMode === 'templates' && state.selectedTemplateIds?.length > 0) {
                    handleDeleteTemplates(state.selectedTemplateIds);
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
                } else if (state.viewMode === 'hierarchy' && state.selectedNodeIds?.length > 0) {
                    handleDuplicateNodes(state.selectedNodeIds);
                } else if (state.viewMode === 'templates' && state.selectedTemplateIds?.length > 0) {
                    handleDuplicateTemplates(state.selectedTemplateIds);
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

    const handleDuplicateNodes = (ids: string[]) => {
        saveToHistory();
        setState(prev => {
            const nextNodes = { ...prev.nodes };
            const newSelectedIds: string[] = [];

            // Helper to deep copy node + children
            const duplicateSubtree = (nodeId: string, parentId: string | null): string => {
                const node = nextNodes[nodeId];
                if (!node) return nodeId;
                
                const newId = `node_${Math.random().toString(36).substr(2, 6)}`;
                const newNode: AppNode = { 
                    ...JSON.parse(JSON.stringify(node)), 
                    id: newId, 
                    parentId, 
                    title: `${node.title} (Copy)`, 
                    children: [] 
                };
                
                if (parentId) {
                    const parent = nextNodes[parentId];
                    if (parent) {
                        const insertIdx = parent.children.indexOf(nodeId);
                        if (insertIdx !== -1) {
                            parent.children.splice(insertIdx + 1, 0, newId);
                        } else {
                            parent.children.push(newId);
                        }
                    }
                }
                
                nextNodes[newId] = newNode;
                
                node.children.forEach(childId => {
                    const newChildId = duplicateSubtree(childId, newId);
                    if (newChildId !== childId) {
                        newNode.children.push(newChildId);
                    }
                });
                return newId;
            };

            const rootDuplicated = ids.includes(prev.rootId);
            if (rootDuplicated) {
                alert("Cannot duplicate the root node.");
                return prev;
            }

            ids.forEach(id => {
                const node = prev.nodes[id];
                if (node && node.parentId) {
                    const newId = duplicateSubtree(id, node.parentId);
                    newSelectedIds.push(newId);
                }
            });

            return { 
                ...prev, 
                nodes: nextNodes, 
                selectedNodeIds: newSelectedIds, 
                selectedNodeId: newSelectedIds[0] || prev.selectedNodeId 
            };
        });
    };

    const handleDuplicateTemplates = (ids: string[]) => {
        saveToHistory();
        setState(prev => {
            const activeVariant = prev.variants[prev.activeVariantId];
            const nextTemplates = { ...activeVariant.templates };
            const newSelectedIds: string[] = [];

            ids.forEach(id => {
                const tpl = nextTemplates[id];
                if (tpl) {
                    const newId = `tpl_${Math.random().toString(36).substr(2, 6)}`;
                    nextTemplates[newId] = {
                        ...JSON.parse(JSON.stringify(tpl)),
                        id: newId,
                        name: `${tpl.name} (Copy)`
                    };
                    newSelectedIds.push(newId);
                }
            });

            return { 
                ...prev, 
                variants: { ...prev.variants, [prev.activeVariantId]: { ...activeVariant, templates: nextTemplates } },
                selectedTemplateIds: newSelectedIds,
                selectedTemplateId: newSelectedIds[0] || prev.selectedTemplateId
            };
        });
    };

    const handleSelectNode = (id: string, ctrlKey: boolean, shiftKey: boolean) => {
        setState(s => {
            let newIds = s.selectedNodeIds || [];
            if (shiftKey && newIds.length > 0) {
                const nodes = Array.from(document.querySelectorAll('[data-node-id]')).map(el => el.getAttribute('data-node-id') as string);
                const lastId = newIds[newIds.length - 1];
                const startIdx = nodes.indexOf(lastId);
                const endIdx = nodes.indexOf(id);
                if (startIdx !== -1 && endIdx !== -1) {
                    const min = Math.min(startIdx, endIdx);
                    const max = Math.max(startIdx, endIdx);
                    // range includes exactly what's visible
                    const range = nodes.slice(min, max + 1);
                    newIds = Array.from(new Set([...newIds, ...range]));
                }
            } else if (ctrlKey) {
                if (newIds.includes(id)) {
                    newIds = newIds.filter(i => i !== id);
                } else {
                    newIds = [...newIds, id];
                }
            } else {
                newIds = [id];
            }
            
            const activeId = newIds.length > 0 ? (ctrlKey && !newIds.includes(id) ? newIds[newIds.length - 1] : id) : s.rootId;
            return { 
                ...s, 
                selectedNodeId: activeId, 
                selectedNodeIds: newIds, 
                selectedElementIds: [] 
            };
        });
    };

    const handleSelectTemplate = (id: string, ctrlKey: boolean, shiftKey: boolean) => {
        setState(s => {
            let newIds = s.selectedTemplateIds || [];
            if (shiftKey && newIds.length > 0) {
                const templates = Array.from(document.querySelectorAll('[data-template-id]')).map(el => el.getAttribute('data-template-id') as string);
                const lastId = newIds[newIds.length - 1];
                const startIdx = templates.indexOf(lastId);
                const endIdx = templates.indexOf(id);
                if (startIdx !== -1 && endIdx !== -1) {
                    const min = Math.min(startIdx, endIdx);
                    const max = Math.max(startIdx, endIdx);
                    const range = templates.slice(min, max + 1);
                    newIds = Array.from(new Set([...newIds, ...range]));
                }
            } else if (ctrlKey) {
                if (newIds.includes(id)) {
                    newIds = newIds.filter(i => i !== id);
                } else {
                    newIds = [...newIds, id];
                }
            } else {
                newIds = [id];
            }
            
            const activeId = newIds.length > 0 ? (ctrlKey && !newIds.includes(id) ? newIds[newIds.length - 1] : id) : s.selectedTemplateId;
            return { 
                ...s, 
                selectedTemplateId: activeId, 
                selectedTemplateIds: newIds, 
                selectedElementIds: [] 
            };
        });
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
                const layerId = (original.layerId && template.layers?.some(l => l.id === original.layerId))
                    ? original.layerId
                    : resolveActiveLayerId(template, state.activeLayerId);
                newIds.push(newId);
                newElements.push({
                    ...JSON.parse(JSON.stringify(original)),
                    id: newId,
                    x: original.x + 20,
                    y: original.y + 20,
                    layerId,
                    zIndex: nextZIndexInLayer([...template.elements, ...newElements], layerId)
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
            const layerId = (item.layerId && template.layers?.some(l => l.id === item.layerId))
                ? item.layerId
                : resolveActiveLayerId(template, state.activeLayerId);
            newIds.push(newId);
            newElements.push({
                ...JSON.parse(JSON.stringify(item)),
                id: newId,
                x: item.x + offset,
                y: item.y + offset,
                layerId,
                zIndex: nextZIndexInLayer([...template.elements, ...newElements], layerId)
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

    const requestDeleteNodes = (ids: string[]) => {
        if (ids.includes(state.rootId)) {
            alert("Cannot delete root node.");
            return;
        }
        setDeleteConfirmState({ isOpen: true, nodeIds: ids });
    };

    const executeDeleteNode = () => {
        const ids = deleteConfirmState.nodeIds;
        if (!ids || ids.length === 0) return;
        saveToHistory();

        setState(prev => {
            const nextNodes = { ...prev.nodes };
            const idsToDelete = new Set<string>();
            const queue = [...ids];

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

            // Remove deleted children from their parents
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

            return { 
                ...prev, 
                nodes: nextNodes, 
                variants: nextVariants, 
                selectedNodeId: newSelectedId, 
                selectedNodeIds: [newSelectedId],
                selectedElementIds: [] 
            };
        });

        setDeleteConfirmState({ isOpen: false, nodeIds: [] });
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
        const newTemplate: PageTemplate = { id: newId, name: 'New Template', width: RM_PP_WIDTH, height: RM_PP_HEIGHT, elements: [], layers: [createDefaultLayer()] };
        setState(prev => {
            const activeVariant = prev.variants[prev.activeVariantId];
            const updatedVariant = { ...activeVariant, templates: { ...activeVariant.templates, [newId]: newTemplate } };
            return { ...prev, variants: { ...prev.variants, [prev.activeVariantId]: updatedVariant }, selectedTemplateId: newId };
        });
    };

    const handleAddVariant = () => {
        setShowNewVariantModal(true);
    };

    const handleCreateVariant = (config: NewVariantConfig) => {
        saveToHistory();
        const newId = `variant_${Math.random().toString(36).substr(2, 6)}`;
        const activeTemplates = getActiveTemplates();
        // Deep-copy all templates, optionally reflowing to new dimensions
        const newTemplates = reflowTemplates(
            activeTemplates,
            config.targetWidth,
            config.targetHeight,
            config.reflow,
            config.scaleFontSize
        );
        const newVariant: Variant = {
            id: newId,
            name: config.name,
            templates: newTemplates
        };
        setState(prev => ({
            ...prev,
            variants: { ...prev.variants, [newId]: newVariant },
            activeVariantId: newId,
            selectedTemplateId: Object.keys(newVariant.templates)[0] || prev.selectedTemplateId
        }));
        setShowNewVariantModal(false);
    };

    const handleImportSvg = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const svgText = e.target?.result as string;
            if (!svgText) return;

            // Warn on large SVGs
            if (svgText.length > 100000) {
                const proceed = window.confirm(
                    `This SVG is ${(svgText.length / 1024).toFixed(0)}KB. Large SVGs will significantly increase your project file size. Continue?`
                );
                if (!proceed) return;
            }

            // Parse SVG to extract dimensions
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
            const svgEl = svgDoc.documentElement;

            let svgW = 100, svgH = 100; // defaults
            const viewBox = svgEl.getAttribute('viewBox');
            if (viewBox) {
                const parts = viewBox.split(/[\s,]+/).map(Number);
                if (parts.length === 4 && !parts.some(isNaN)) {
                    svgW = parts[2];
                    svgH = parts[3];
                }
            } else {
                const wAttr = parseFloat(svgEl.getAttribute('width') || '');
                const hAttr = parseFloat(svgEl.getAttribute('height') || '');
                if (!isNaN(wAttr) && wAttr > 0) svgW = wAttr;
                if (!isNaN(hAttr) && hAttr > 0) svgH = hAttr;
            }

            // Scale down to fit within the destination template (hierarchy-aware) if necessary
            const template = getCurrentTemplate();
            const maxW = template ? template.width * 0.8 : 400;
            const maxH = template ? template.height * 0.8 : 400;
            const scale = Math.min(1, maxW / svgW, maxH / svgH);
            const finalW = Math.round(svgW * scale);
            const finalH = Math.round(svgH * scale);

            insertSvgElement(svgText, finalW, finalH);
        };
        reader.readAsText(file);
    };

    // Shared tail of every svg-adding path (file import, placeholder insert):
    // one history entry, placement via createPlacedSvgElement, select the new
    // element, switch to the select tool.
    const insertSvgElement = (svgText: string, w: number, h: number) => {
        saveToHistory();
        setState(prev => {
            const activeVariant = prev.variants[prev.activeVariantId];
            // Add to the template currently shown on the canvas. In hierarchy view that's
            // the selected node's template, not the Templates-tab selection — same
            // reconciliation the other element-mutating handlers already use.
            const tplId = prev.viewMode === 'hierarchy'
                ? prev.nodes[prev.selectedNodeId]?.type
                : prev.selectedTemplateId;
            const tpl = tplId ? activeVariant.templates[tplId] : undefined;
            if (!tpl) return prev;
            const placedElement = createPlacedSvgElement(svgText, w, h, tpl, prev.activeLayerId);
            const updatedTemplate = { ...tpl, elements: [...tpl.elements, placedElement] };
            const updatedVariant = { ...activeVariant, templates: { ...activeVariant.templates, [tplId]: updatedTemplate } };
            return {
                ...prev,
                variants: { ...prev.variants, [prev.activeVariantId]: updatedVariant },
                selectedElementIds: [placedElement.id],
                tool: 'select',
            };
        });
    };

    const handleInsertSvgPlaceholder = () => {
        insertSvgElement(PLACEHOLDER_SVG, 100, 100);
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
    const handleDeleteTemplates = (ids: string[]) => {
        const activeTemplates = getActiveTemplates();
        const templatesCount = Object.keys(activeTemplates).length;
        if (templatesCount - ids.length <= 0) return alert("Cannot delete all templates. Leave at least one.");
        
        saveToHistory();
        setState(prev => {
            const activeVariant = prev.variants[prev.activeVariantId];
            const nextTemplates = { ...activeVariant.templates }; 
            ids.forEach(id => delete nextTemplates[id]);
            const updatedVariant = { ...activeVariant, templates: nextTemplates };
            
            const firstRemaining = Object.keys(nextTemplates)[0];
            const newSelectedId = nextTemplates[prev.selectedTemplateId] ? prev.selectedTemplateId : firstRemaining;

            return { 
                ...prev, 
                variants: { ...prev.variants, [prev.activeVariantId]: updatedVariant }, 
                selectedTemplateId: newSelectedId,
                selectedTemplateIds: [newSelectedId]
            };
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
    const handleUpdateTemplate = (id: string, updates: Partial<PageTemplate>, autoReflow: boolean = false, scaleFontSize: boolean = true) => {
        saveToHistory();
        setState(prev => {
            const activeVariant = prev.variants[prev.activeVariantId];
            const currentTemplate = activeVariant.templates[id];
            
            let newTemplateData = { ...currentTemplate, ...updates };

            // If autoReflow is enabled and dimensions are actually changing
            if (autoReflow && (updates.width !== undefined || updates.height !== undefined)) {
                const targetWidth = updates.width ?? currentTemplate.width;
                const targetHeight = updates.height ?? currentTemplate.height;
                
                // Reflow just this one template by passing a mock single-item record
                const reflowedMap = reflowTemplates(
                    { [id]: currentTemplate },
                    targetWidth,
                    targetHeight,
                    true,
                    scaleFontSize
                );
                
                // Merge everything cleanly: start with reflowed result, apply any additional incoming updates (e.g. name change)
                newTemplateData = { ...reflowedMap[id], ...updates };
            }

            const updatedVariant = { ...activeVariant, templates: { ...activeVariant.templates, [id]: newTemplateData } };
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

    const handleApplyGenerated = (
        project: GeneratedProject,
        source: Pick<GeneratorProvenance, 'templateScript' | 'hierarchyScript'>,
    ) => {
        saveToHistory();
        const generatedAt = new Date().toISOString();
        setState(current => ({
            ...current,
            nodes: project.nodes,
            rootId: project.rootId,
            variants: project.variants,
            activeVariantId: project.activeVariantId,
            schemaVersion: CURRENT_SCHEMA_VERSION,
            generator: { formatVersion: 1, ...source, generatedAt },
            selectedNodeId: project.rootId,
            selectedNodeIds: [project.rootId],
            selectedTemplateId: '',
            selectedTemplateIds: [],
            selectedElementIds: [],
        }));
        trackEvent('generator_run', { rootId: project.rootId, nodeCount: Object.keys(project.nodes).length });
        return true;
    };

    const handleDetachSavedGenerator = () => {
        saveToHistory();
        setState(current => {
            const { generator: _generator, ...withoutGenerator } = current;
            return withoutGenerator;
        });
        return true;
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

    const handleExportPDF = async (options: { exportAllVariants?: boolean } = {}) => {
        setIsExporting(true);
        setTimeout(async () => {
            try {
                const variantsToExport = options.exportAllVariants ? Object.keys(state.variants) : [state.activeVariantId];
                for (const vid of variantsToExport) {
                    await generatePDF(state, {
                        isGreyscale: exportGreyscale,
                        variantId: vid,
                        projectName: projectId.split('-')[0]
                    });
                }
                trackEvent('pdf_exported', { 
                    projectId: projectId, 
                    pageCount: Object.keys(getActiveTemplates()).length, 
                    isGreyscale: exportGreyscale,
                    exportAllVariants: options.exportAllVariants
                });
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
            <div className="min-h-[40px] py-1 bg-white border-b flex flex-wrap items-center justify-between px-4 z-20 flex-shrink-0">
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

                        <div className="flex items-stretch ml-2 shadow-sm rounded">
                            <button
                                onClick={() => handleExportPDF()}
                                disabled={isExporting}
                                className={clsx(
                                    "text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-l flex items-center gap-2 text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-wait",
                                    isExporting && "opacity-75"
                                )}
                            >
                                {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                                {isExporting ? "Generating..." : "Export PDF"}
                            </button>
                            <button
                                onClick={() => handleExportPDF({ exportAllVariants: true })}
                                disabled={isExporting || Object.keys(state.variants).length <= 1}
                                className={clsx(
                                    "text-white bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded-r border-l border-blue-500/50 flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed",
                                    isExporting && "opacity-75 bg-blue-700"
                                )}
                                title="Export All Variants (Merged PDF)"
                            >
                                <Layers size={14} /> All
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                <div style={{ width: state.sidebarWidth }} className="flex-shrink-0 relative flex flex-col">
                    <Sidebar
                        state={state}
                        onSelectNode={handleSelectNode}
                        onAddNode={handleAddNode}
                        onAddReference={handleAddReference}
                        onDeleteNode={(id) => requestDeleteNodes(state.selectedNodeIds.includes(id) ? state.selectedNodeIds : [id])}
                        onDuplicateNode={(id) => handleDuplicateNodes(state.selectedNodeIds.includes(id) ? state.selectedNodeIds : [id])}
                        onUpdateNode={handleUpdateNode}
                        onChangeViewMode={(mode) => setState(s => ({ ...s, viewMode: mode, selectedElementIds: [] }))}
                        onSelectTemplate={handleSelectTemplate}
                        onAddTemplate={handleAddTemplate}
                        onDeleteTemplate={(id) => handleDeleteTemplates(state.selectedTemplateIds.includes(id) ? state.selectedTemplateIds : [id])}
                        onDuplicateTemplate={(id) => handleDuplicateTemplates(state.selectedTemplateIds.includes(id) ? state.selectedTemplateIds : [id])}
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
                        onImportSvg={handleImportSvg}
                        onInsertSvgPlaceholder={handleInsertSvgPlaceholder}
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
                            activeLayerId={state.activeLayerId}
                            greyscalePreview={exportGreyscale}
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
                        layersSlot={currentTemplate ? (
                            <CollapsibleSection
                                title="Layers"
                                icon={Layers}
                                testId="layers-section"
                                expanded={layersExpanded}
                                onToggle={() => setLayersExpanded(v => !v)}
                            >
                                <LayersPanel
                                    template={currentTemplate}
                                    selectedElementIds={state.selectedElementIds}
                                    activeLayerId={state.activeLayerId}
                                    onUpdateTemplate={(updates) => handleUpdateTemplate(currentTemplate.id, updates)}
                                    onUpdateElements={(els, save) => handleUpdateTemplateElements(els, save)}
                                    onSelectElements={(ids) => setState(s => ({ ...s, selectedElementIds: ids }))}
                                    onSetActiveLayer={(layerId) => setState(s => ({ ...s, activeLayerId: layerId }))}
                                />
                            </CollapsibleSection>
                        ) : null}
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
                savedGenerator={state.generator}
                onClose={() => setShowScriptGenModal(false)}
                onApplyGenerated={handleApplyGenerated}
                onDetachSavedGenerator={handleDetachSavedGenerator}
            />

            <SavePresetModal
                isOpen={showSavePresetModal}
                onClose={() => setShowSavePresetModal(false)}
                onSave={handleSavePreset}
                defaultTitle={state.nodes[state.rootId]?.title}
            />

            <NewVariantModal
                isOpen={showNewVariantModal}
                onClose={() => setShowNewVariantModal(false)}
                onCreate={handleCreateVariant}
                currentVariantName={state.variants[state.activeVariantId]?.name || 'Variant'}
                currentWidth={Object.values(getActiveTemplates())[0]?.width || 509}
                currentHeight={Object.values(getActiveTemplates())[0]?.height || 679}
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
                onClose={() => setDeleteConfirmState({ isOpen: false, nodeIds: [] })}
                onConfirm={executeDeleteNode}
                nodeTitle={deleteConfirmState.nodeIds.length > 1 ? `${deleteConfirmState.nodeIds.length} Nodes` : (state.nodes[deleteConfirmState.nodeIds[0] || '']?.title || 'Node')}
            />
        </div>
    );
}
