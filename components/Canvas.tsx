

import React, { useRef, useState, useEffect, useLayoutEffect, MouseEvent } from 'react';
import { AppState, TemplateElement, PageTemplate, AppNode, TraversalStep } from '../types';
import clsx from 'clsx';
import { CanvasElement } from './canvas/CanvasElement';
import { OverlayTextEditor } from './canvas/OverlayTextEditor';
import { SelectionHandles } from './canvas/SelectionHandles';

interface CanvasProps {
    template: PageTemplate;
    elements: TemplateElement[];
    selectedElementIds: string[];
    scale: number;
    tool: string;
    nodes: Record<string, AppNode>;
    currentNodeId: string;
    snapToGrid: boolean;
    showGrid: boolean;
    onUpdateElements: (elements: TemplateElement[], saveHistory?: boolean) => void;
    onSelectElements: (ids: string[]) => void;
    onZoom: (newScale: number) => void;
    onInteractionStart: () => void;
    onSwitchToSelect?: () => void;
}

const MIN_DRAG_THRESHOLD = 5;

// Helper: Convert degrees to radians
const toRad = (deg: number) => deg * Math.PI / 180;

// Helper: Rotate a point around a center
const rotatePoint = (x: number, y: number, cx: number, cy: number, angle: number) => {
    const rad = toRad(angle);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = x - cx;
    const dy = y - cy;
    return {
        x: cx + dx * cos - dy * sin,
        y: cy + dx * sin + dy * cos
    };
};

const traverseGridData = (
    currentNodes: string[],
    steps: TraversalStep[],
    depth: number,
    nodes: Record<string, AppNode>
): string[] => {
    if (depth >= steps.length) return currentNodes;
    if (!currentNodes || currentNodes.length === 0) return [];

    const step = steps[depth];
    const nextLevelNodes: string[] = [];

    currentNodes.forEach(nodeId => {
        const node = nodes[nodeId];
        if (!node) return;

        let targetNode = node;
        if (node.referenceId && nodes[node.referenceId]) {
            targetNode = nodes[node.referenceId];
        }

        const children = targetNode.children || [];

        const start = step.sliceStart || 0;
        const end = step.sliceCount !== undefined ? start + step.sliceCount : undefined;
        const sliced = children.slice(start, end);

        nextLevelNodes.push(...sliced);
    });

    return traverseGridData(nextLevelNodes, steps, depth + 1, nodes);
};

// Helper: Calculate the "Visual" bounds of a group if it were rotated by 'rotation'.
// This finds the tightest box that, when rotated by 'rotation', encloses the elements.
const getRotatedGroupBounds = (elements: TemplateElement[], rotation: number) => {
    if (elements.length === 0) return null;

    // Robust Strategy: Un-rotate all points around (0,0) to find the aligned box in the un-rotated frame.
    // Then place that box back in the world.

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    elements.forEach(el => {
        // 1. Get Element World Corners
        const ox = el.transformOrigin ? el.transformOrigin.x : 0.5;
        const oy = el.transformOrigin ? el.transformOrigin.y : 0.5;
        const anchorX = el.x + el.w * ox;
        const anchorY = el.y + el.h * oy;
        const corners = [
            { x: el.x, y: el.y },
            { x: el.x + el.w, y: el.y },
            { x: el.x + el.w, y: el.y + el.h },
            { x: el.x, y: el.y + el.h }
        ].map(p => rotatePoint(p.x, p.y, anchorX, anchorY, el.rotation || 0));

        // 2. Un-rotate around (0,0)
        corners.forEach(p => {
            const up = rotatePoint(p.x, p.y, 0, 0, -rotation);
            minX = Math.min(minX, up.x);
            minY = Math.min(minY, up.y);
            maxX = Math.max(maxX, up.x);
            maxY = Math.max(maxY, up.y);
        });
    });

    const uW = maxX - minX;
    const uH = maxY - minY;

    // Center of the un-rotated box
    const uCx = minX + uW / 2;
    const uCy = minY + uH / 2;

    // 3. Rotate the center back
    const finalCenter = rotatePoint(uCx, uCy, 0, 0, rotation);

    const result = {
        x: finalCenter.x - uW / 2,
        y: finalCenter.y - uH / 2,
        w: uW,
        h: uH,
        rotation: rotation
    };

    return result;
};


export const Canvas: React.FC<CanvasProps> = ({
    template,
    elements,
    selectedElementIds,
    scale,
    tool,
    nodes,
    currentNodeId,
    snapToGrid,
    showGrid,
    onUpdateElements,
    onSelectElements,
    onZoom,
    onInteractionStart,
    onSwitchToSelect
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const outerContainerRef = useRef<HTMLDivElement>(null);
    const zoomTarget = useRef<{ mx: number; my: number; cx: number; cy: number } | null>(null);

    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [isRotating, setIsRotating] = useState(false);
    const [isPanning, setIsPanning] = useState(false);
    const [isDraggingPivot, setIsDraggingPivot] = useState(false);
    const [temporaryGroupPivot, setTemporaryGroupPivot] = useState<{ x: number, y: number } | null>(null); // Visual only pivot for groups
    const hasSavedHistory = useRef(false);

    // Drag State
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [initialPositions, setInitialPositions] = useState<Record<string, { x: number, y: number }>>({});
    const [panStart, setPanStart] = useState<{ x: number, y: number, scrollLeft: number, scrollTop: number } | null>(null);

    // Resize State
    const [resizeHandle, setResizeHandle] = useState<string | null>(null);
    const initialResizeStateRef = useRef<any>(null); // For resize start state
    const initialGroupPivotRef = useRef<{ x: number, y: number } | null>(null); // To track pivot movement during drag
    // Rotation State
    const [initialRotation, setInitialRotation] = useState<number>(0);

    // Ghost element for creation
    const [newShapeStart, setNewShapeStart] = useState<{ x: number, y: number } | null>(null);
    const [newShapeCurrent, setNewShapeCurrent] = useState<{ x: number, y: number } | null>(null);

    // Marquee Selection State
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectionBox, setSelectionBox] = useState<{ x: number, y: number, w: number, h: number } | null>(null);

    // Inline Editing State
    const [editingElementId, setEditingElementId] = useState<string | null>(null);

    // Group Transform State
    const initialGroupElements = useRef<TemplateElement[]>([]);
    const initialGroupBoundsRef = useRef<TemplateElement | null>(null); // For rotating group visualization
    const [persistentGroupRotation, setPersistentGroupRotation] = useState(0);

    // Reset persistent rotation and pivots when selection changes
    useEffect(() => {
        setPersistentGroupRotation(0);
        initialGroupBoundsRef.current = null;
        setTemporaryGroupPivot(null); // Reset group pivot
    }, [selectedElementIds.join(',')]);

    const getGroupBounds = (ids: string[]) => {
        if (ids.length === 0) return null;
        // Even for single items in a group selection, we might want consistent logic, but single works fine.

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        // ... (rest of logic same)

        ids.forEach(id => {
            const el = elements.find(e => e.id === id);
            if (!el) return;

            // Calculate corners of rotated element
            const ox = el.transformOrigin ? el.transformOrigin.x : 0.5;
            const oy = el.transformOrigin ? el.transformOrigin.y : 0.5;
            const cx = el.x + el.w * ox;
            const cy = el.y + el.h * oy;
            const r = el.rotation || 0;

            const corners = [
                { x: el.x, y: el.y },
                { x: el.x + el.w, y: el.y },
                { x: el.x + el.w, y: el.y + el.h },
                { x: el.x, y: el.y + el.h }
            ];

            corners.forEach(p => {
                const rotated = rotatePoint(p.x, p.y, cx, cy, r);
                minX = Math.min(minX, rotated.x);
                maxX = Math.max(maxX, rotated.x);
                minY = Math.min(minY, rotated.y);
                maxY = Math.max(maxY, rotated.y);
            });
        });

        if (minX === Infinity) return null;

        return {
            id: 'selection-group',
            type: 'group' as const, // Cast to any to satisfy TemplateElement type constraint slightly loosely or use a compatible object
            x: minX,
            y: minY,
            w: maxX - minX,
            h: maxY - minY,
            rotation: 0,
            zIndex: 9999
        } as unknown as TemplateElement;
    };

    const groupBounds = React.useMemo(() => {
        return selectedElementIds.length > 1 ? getGroupBounds(selectedElementIds) : null;
    }, [selectedElementIds, elements]); // Recalculate when selection or elements change


    // Dynamic Grid Calculation
    const effectiveGridSize = React.useMemo(() => {
        if (scale >= 4) return 1;
        if (scale >= 1.5) return 5;
        return 10;
    }, [scale]);

    // Handle Wheel Zoom (Ctrl + Scroll)
    useEffect(() => {
        const el = outerContainerRef.current;
        if (!el) return;

        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();

                const rect = el.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;

                // Calculate content coordinates under the mouse
                const cx = (mx + el.scrollLeft) / scale;
                const cy = (my + el.scrollTop) / scale;

                // Use standard multiplicative zoom
                const zoomFactor = -e.deltaY * 0.002;
                let newScale = scale * (1 + zoomFactor);

                // Clamp scale
                newScale = Math.max(0.2, Math.min(3, newScale));

                if (Math.abs(newScale - scale) > 0.001) {
                    zoomTarget.current = { mx, my, cx, cy };
                    onZoom(newScale);
                }
            }
        };

        el.addEventListener('wheel', handleWheel, { passive: false });
        return () => el.removeEventListener('wheel', handleWheel);
    }, [scale, onZoom]);

    // Adjust scroll position after zoom to keep cursor over the same content point
    useLayoutEffect(() => {
        if (zoomTarget.current && outerContainerRef.current) {
            const { mx, my, cx, cy } = zoomTarget.current;
            const el = outerContainerRef.current;

            const newScrollLeft = cx * scale - mx;
            const newScrollTop = cy * scale - my;

            el.scrollLeft = newScrollLeft;
            el.scrollTop = newScrollTop;

            zoomTarget.current = null;
        }
    }, [scale]);


    const getMouseCoords = (e: MouseEvent) => {
        if (!containerRef.current) return { x: 0, y: 0 };
        const rect = containerRef.current.getBoundingClientRect();
        let x = (e.clientX - rect.left) / scale;
        let y = (e.clientY - rect.top) / scale;
        return { x, y };
    };

    const snapVal = (val: number) => snapToGrid ? Math.round(val / effectiveGridSize) * effectiveGridSize : val;

    const getElementBounds = (el: TemplateElement) => {
        if (el.type === 'grid' && el.gridConfig) {
            const { cols, gapX, gapY, sourceType, sourceId, dataSliceStart, dataSliceCount, traversalPath } = el.gridConfig;
            let items: any[] = [];

            let roots: string[] = [];
            if (sourceType === 'current') {
                if (nodes[currentNodeId]) roots = [currentNodeId];
            } else if (sourceType === 'specific' && sourceId) {
                if (nodes[sourceId]) roots = [sourceId];
            }

            if (traversalPath && traversalPath.length > 0) {
                items = traverseGridData(roots, traversalPath, 0, nodes);
            } else {
                if (roots.length > 0) {
                    const r = nodes[roots[0]];
                    if (r) items = r.children || [];
                }
            }

            // Apply Slice
            const start = dataSliceStart || 0;
            const limit = dataSliceCount;
            if (start > 0 || limit !== undefined) {
                const end = limit !== undefined ? start + limit : undefined;
                items = items.slice(start, end);
            }

            const displayCount = items.length > 0 ? items.length : 6;
            const colCount = Math.max(1, cols || 3);

            // Calculate Offset (Logic synced from CanvasElement)
            let offset = el.gridConfig.offsetStart || 0;
            const { offsetMode, offsetField, offsetAdjustment } = el.gridConfig;

            if (offsetMode === 'dynamic' && offsetField && items.length > 0) {
                const firstId = items[0];
                let firstNode = nodes[firstId];
                if (firstNode && firstNode.referenceId && nodes[firstNode.referenceId]) {
                    firstNode = nodes[firstNode.referenceId];
                }

                if (firstNode && firstNode.data && firstNode.data[offsetField]) {
                    const parsed = parseInt(firstNode.data[offsetField], 10);
                    if (!isNaN(parsed)) {
                        offset = parsed + (offsetAdjustment || 0);
                    }
                }
            }

            if (offset < 0) {
                offset += colCount;
            }

            const rowCount = Math.max(1, Math.ceil((displayCount + offset) / colCount));

            const totalW = colCount * el.w + (colCount - 1) * (gapX || 0);
            const totalH = rowCount * el.h + (rowCount - 1) * (gapY || 0);

            return { x: el.x, y: el.y, w: totalW, h: totalH };
        }
        return { x: el.x, y: el.y, w: el.w, h: el.h };
    };

    // Cancel operation on Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setNewShapeStart(null);
                setNewShapeCurrent(null);
                setIsSelecting(false);
                setSelectionBox(null);
                setIsDragging(false);
                setIsResizing(false);
                setIsRotating(false);
                setIsPanning(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Helper to calculate visual bounds handling persistent rotation
    const calculateVisualGroupBounds = (currentGroupBounds: TemplateElement, rotation: number) => {
        const cx = currentGroupBounds.x + currentGroupBounds.w / 2;
        const cy = currentGroupBounds.y + currentGroupBounds.h / 2;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        selectedElementIds.forEach(id => {
            const el = elements.find(e => e.id === id);
            if (!el) return;
            const elCx = el.x + el.w / 2;
            const elCy = el.y + el.h / 2;
            const corners = [
                { x: el.x, y: el.y },
                { x: el.x + el.w, y: el.y },
                { x: el.x + el.w, y: el.y + el.h },
                { x: el.x, y: el.y + el.h }
            ];
            const r = el.rotation || 0;
            const worldCorners = corners.map(p => rotatePoint(p.x, p.y, elCx, elCy, r));

            worldCorners.forEach(p => {
                const unrotated = rotatePoint(p.x, p.y, cx, cy, -rotation);
                minX = Math.min(minX, unrotated.x);
                maxX = Math.max(maxX, unrotated.x);
                minY = Math.min(minY, unrotated.y);
                maxY = Math.max(maxY, unrotated.y);
            });
        });

        if (minX !== Infinity) {
            const uw = maxX - minX;
            const uh = maxY - minY;
            const uCx = minX + uw / 2;
            const uCy = minY + uh / 2;
            const center = rotatePoint(uCx, uCy, cx, cy, rotation);

            return {
                id: 'selection-group',
                type: 'group' as any,
                x: center.x - uw / 2,
                y: center.y - uh / 2,
                w: uw,
                h: uh,
                rotation: rotation,
                zIndex: 9999
            } as any;
        }
        return currentGroupBounds;
    };

    const handleMouseDown = (e: MouseEvent) => {
        // Reset history save flag for new interactions
        hasSavedHistory.current = false;

        // 1. Panning Logic (Hand Tool or Spacebar or Middle Click)
        if (tool === 'hand' || e.button === 1) {
            setIsPanning(true);
            if (outerContainerRef.current) {
                setPanStart({
                    x: e.clientX,
                    y: e.clientY,
                    scrollLeft: outerContainerRef.current.scrollLeft,
                    scrollTop: outerContainerRef.current.scrollTop
                });
            }
            e.preventDefault();
            return;
        }

        const coords = getMouseCoords(e);

        // 2. Creation Mode
        if (['rect', 'ellipse', 'triangle', 'text', 'grid', 'line'].includes(tool)) {
            const snappedCoords = { x: snapVal(coords.x), y: snapVal(coords.y) };
            setNewShapeStart(snappedCoords);
            setNewShapeCurrent(snappedCoords);
            return;
        }

        // 3. Selection / Transform Logic
        if (tool === 'select') {
            const targetEl = e.target as HTMLElement;
            const clickedId = targetEl.closest('[data-element-id]')?.getAttribute('data-element-id');

            // Check for Pivot Handle (Transform Origin)
            if (targetEl.closest('[data-pivot-handle]')) {
                setIsDraggingPivot(true);
                setDragStart(coords); // Track mouse start

                // Snapshot initial states
                // We use initialGroupElements even for single element to store the snapshot
                initialGroupElements.current = elements.filter(el => selectedElementIds.includes(el.id));

                if (selectedElementIds.length > 1) {
                    // For group, we just initialize/confirm the pivot
                    // If no explicit pivot yet, start at center
                    // ... existing logic ...
                    if (!temporaryGroupPivot && groupBounds) {
                        setTemporaryGroupPivot({
                            x: groupBounds.x + groupBounds.w / 2,
                            y: groupBounds.y + groupBounds.h / 2
                        });
                    }
                } else if (selectedElementIds.length === 1) {
                    // Single element persistence handled in Move
                }

                e.stopPropagation();
                return;
            }

            // Check for Rotation Handle
            if (targetEl.closest('[data-rotate-handle]')) {
                if (selectedElementIds.length > 1 && groupBounds) {
                    // Group Rotation
                    setIsRotating(true);

                    // Snapshot initial states for all selected elements
                    initialGroupElements.current = elements.filter(el => selectedElementIds.includes(el.id));

                    let initialBounds = groupBounds;
                    // IF we have persistent rotation, use the VISUAL bounds as initial, not the AABB
                    if (persistentGroupRotation !== 0) {
                        const vb = getRotatedGroupBounds(initialGroupElements.current, persistentGroupRotation);
                        if (vb) initialBounds = { ...initialBounds, ...vb };
                    }
                    initialGroupBoundsRef.current = initialBounds;

                    // Calculate initial mouse angle for delta rotation
                    const cx = initialBounds.x + initialBounds.w / 2;
                    const cy = initialBounds.y + initialBounds.h / 2;
                    // Fix: Use pivot if it exists for initial angle too!
                    let pivotX = cx, pivotY = cy;
                    if (temporaryGroupPivot) {
                        pivotX = temporaryGroupPivot.x;
                        pivotY = temporaryGroupPivot.y;
                    }

                    const radians = Math.atan2(coords.y - pivotY, coords.x - pivotX);
                    const startDegrees = radians * (180 / Math.PI) + 90;

                    setInitialRotation(startDegrees);

                } else if (selectedElementIds.length === 1) {
                    const el = elements.find(e => e.id === selectedElementIds[0]);
                    if (el) {
                        setIsRotating(true);
                        setInitialRotation(el.rotation || 0);
                    }
                }
                e.stopPropagation();
                return;
            }

            // Check for Resize Handle - allow for single or group
            if (targetEl.hasAttribute('data-resize-handle')) {
                const handle = targetEl.getAttribute('data-resize-handle');

                if (selectedElementIds.length > 1 && groupBounds && handle) {
                    // Group Resizing
                    setIsResizing(true);
                    setResizeHandle(handle);
                    setDragStart(coords);
                    initialResizeStateRef.current = groupBounds; // Use group bounds as the resizing target

                    // Snapshot initial states
                    initialGroupElements.current = elements.filter(el => selectedElementIds.includes(el.id));
                }
                else if (selectedElementIds.length === 1) {
                    const el = elements.find(e => e.id === selectedElementIds[0]);
                    if (handle && el) {
                        setIsResizing(true);
                        setResizeHandle(handle);
                        setDragStart(coords);

                        let { x, y, w, h } = el;
                        // For Grid, resize using the bounding box, not the single cell
                        if (el.type === 'grid' && el.gridConfig) {
                            const bounds = getElementBounds(el);
                            w = bounds.w;
                            h = bounds.h;
                        }

                        initialResizeStateRef.current = { x, y, w, h, flip: el.flip, rotation: el.rotation };
                    }
                }
                e.stopPropagation();
                return;
            }

            if (clickedId) {
                let newSelection = selectedElementIds;

                if (e.shiftKey) {
                    newSelection = selectedElementIds.includes(clickedId)
                        ? selectedElementIds.filter(id => id !== clickedId)
                        : [...selectedElementIds, clickedId];
                    onSelectElements(newSelection);
                } else if (!selectedElementIds.includes(clickedId)) {
                    newSelection = [clickedId];
                    onSelectElements(newSelection);
                }

                const initialPos: Record<string, { x: number, y: number }> = {};
                elements.forEach(el => {
                    if (newSelection.includes(el.id)) {
                        initialPos[el.id] = { x: el.x, y: el.y };
                    }
                });
                setInitialPositions(initialPos);

                // Fix: Snapshot pivot loop
                initialGroupPivotRef.current = temporaryGroupPivot;

                setIsDragging(true);
                setDragStart(coords);
                return;
            }

            // Start Marquee Selection
            onSelectElements([]);
            setIsSelecting(true);
            setDragStart(coords);
            setSelectionBox({ x: coords.x, y: coords.y, w: 0, h: 0 });
        }
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (isPanning && panStart && outerContainerRef.current) {
            const dx = e.clientX - panStart.x;
            const dy = e.clientY - panStart.y;
            outerContainerRef.current.scrollLeft = panStart.scrollLeft - dx;
            outerContainerRef.current.scrollTop = panStart.scrollTop - dy;
            return;
        }

        const coords = getMouseCoords(e);

        if (newShapeStart) {
            setNewShapeCurrent({ x: snapVal(coords.x), y: snapVal(coords.y) });
            return;
        }

        if (isDraggingPivot) {
            if (!hasSavedHistory.current) {
                onInteractionStart();
                hasSavedHistory.current = true;
            }

            // Group Pivot Drag (Visual Only)
            if (selectedElementIds.length > 1) {
                setTemporaryGroupPivot({ x: coords.x, y: coords.y });
            }
            // Single Element Pivot Drag (Persistent)
            else if (selectedElementIds.length === 1) {
                // Use IO snapshot to prevent error accumulation
                const initialEl = initialGroupElements.current.find(e => e.id === selectedElementIds[0]);

                if (initialEl) {
                    // Calculate based on INITIAL state + CURRENT mouse position
                    // We want to move the pivot to 'coords'
                    // We want the element to visually stay exactly where it was in the snapshot.

                    // 1. Where was the Top-Left of the element in World Space INITIALLY?
                    let initialPivot = { x: initialEl.x + initialEl.w / 2, y: initialEl.y + initialEl.h / 2 };
                    if (initialEl.transformOrigin) {
                        initialPivot = {
                            x: initialEl.x + initialEl.w * initialEl.transformOrigin.x,
                            y: initialEl.y + initialEl.h * initialEl.transformOrigin.y
                        };
                    }

                    // Initial World Top-Left
                    const worldTL = rotatePoint(initialEl.x, initialEl.y, initialPivot.x, initialPivot.y, initialEl.rotation || 0);

                    // 2. We want to find a NEW (x, y) for the unrotated box such that:
                    // Rotate(newX, newY, Mouse, rotation) == worldTL
                    // So: (newX, newY) = Rotate(worldTL, Mouse, -rotation)

                    const newUnrotatedTL = rotatePoint(worldTL.x, worldTL.y, coords.x, coords.y, -(initialEl.rotation || 0));

                    const newX = newUnrotatedTL.x;
                    const newY = newUnrotatedTL.y;

                    // 3. Transform Origin is relative to this new box
                    const relX = (coords.x - newX) / initialEl.w;
                    const relY = (coords.y - newY) / initialEl.h;

                    onUpdateElements(elements.map(item => item.id === initialEl.id ? {
                        ...item,
                        x: newX,
                        y: newY,
                        transformOrigin: { x: relX, y: relY }
                    } : item), false);
                }
            }
            return;
        }

        if (isSelecting) {
            const x = Math.min(dragStart.x, coords.x);
            const y = Math.min(dragStart.y, coords.y);
            const w = Math.abs(coords.x - dragStart.x);
            const h = Math.abs(coords.y - dragStart.y);
            setSelectionBox({ x, y, w, h });
            return;
        }

        if (isRotating) {
            if (!hasSavedHistory.current) {
                onInteractionStart();
                hasSavedHistory.current = true;
            }

            // Group Rotation
            if (selectedElementIds.length > 1 && initialGroupBoundsRef.current) {
                const initialBounds = initialGroupBoundsRef.current;

                // Use Temporary Pivot if available, else Bounds Center
                let cx = initialBounds.x + initialBounds.w / 2;
                let cy = initialBounds.y + initialBounds.h / 2;
                if (temporaryGroupPivot) {
                    cx = temporaryGroupPivot.x;
                    cy = temporaryGroupPivot.y;
                }

                const radians = Math.atan2(coords.y - cy, coords.x - cx);
                const rawMouseDegrees = radians * (180 / Math.PI) + 90;

                // Calculate Raw Projected Rotation
                // Final = StartGroupRot + (MouseCurrent - MouseStart)
                const startGroupRotation = initialBounds.rotation || 0;
                const rawDelta = rawMouseDegrees - initialRotation;
                let finalRotation = startGroupRotation + rawDelta;

                if (snapToGrid) {
                    // Snap the RESULTING rotation to cardinals
                    const cardinals = [0, 90, 180, 270, 360];
                    const normalized = (finalRotation % 360 + 360) % 360;
                    const closest = cardinals.find(c => Math.abs(c - normalized) < 10);
                    if (closest !== undefined) {
                        finalRotation = closest === 360 ? 0 : closest;
                    }
                } else if (e.shiftKey) {
                    finalRotation = Math.round(finalRotation / 15) * 15;
                }

                // Recalculate Delta based on the Snapped Final Rotation
                const delta = finalRotation - startGroupRotation;

                // Apply rotation to all elements relative to pivot (Group Center or Custom)
                const updatedElements = elements.map(item => {
                    const initial = initialGroupElements.current.find(i => i.id === item.id);
                    if (!initial) return item;

                    // Robust "World Anchor" Rotation Logic
                    // 1. Determine the Element's Anchor Point (Transform Origin) in Initial World Space
                    const ox = initial.transformOrigin ? initial.transformOrigin.x : 0.5;
                    const oy = initial.transformOrigin ? initial.transformOrigin.y : 0.5;

                    const initialAnchorX = initial.x + initial.w * ox;
                    const initialAnchorY = initial.y + initial.h * oy;

                    // 2. Rotate this Anchor Point around the Group Pivot by delta
                    const rotatedAnchor = rotatePoint(initialAnchorX, initialAnchorY, cx, cy, delta);

                    // 3. Calculate new Top-Left (x, y) such that the Anchor lands at rotatedAnchor
                    // x + w * ox = rotatedAnchor.x  =>  x = rotatedAnchor.x - w * ox

                    return {
                        ...item,
                        x: rotatedAnchor.x - initial.w * ox,
                        y: rotatedAnchor.y - initial.h * oy,
                        rotation: (initial.rotation || 0) + delta
                    };
                });
                onUpdateElements(updatedElements, false);
                return;
            }

            // Single Element Rotation
            else if (selectedElementIds.length === 1) {
                const el = elements.find(e => e.id === selectedElementIds[0]);
                if (!el) return;

                // Calculate Center of Rotation (Default Center or Custom TransformOrigin)
                let cx = el.x + el.w / 2;
                let cy = el.y + el.h / 2;

                if (el.transformOrigin) {
                    // Calculate absolute position of transform origin
                    // With CSS transform-origin, the rotation happens around this point.
                    // The 'x' and 'y' of the element define the unrotated top-left.
                    // So this point is stationary relative to the element's position.
                    cx = el.x + el.w * el.transformOrigin.x;
                    cy = el.y + el.h * el.transformOrigin.y;
                }

                // Calculate angle from Pivot to Mouse
                const radians = Math.atan2(coords.y - cy, coords.x - cx);
                let degrees = radians * (180 / Math.PI) + 90; // +90 to align with top handle

                if (snapToGrid) {
                    // Magnetic snap to cardinals (0, 90, 180, 270) with 10 degree threshold
                    const cardinals = [0, 90, 180, 270, 360];
                    const normalized = (degrees % 360 + 360) % 360;
                    const closest = cardinals.find(c => Math.abs(c - normalized) < 10);
                    if (closest !== undefined) {
                        degrees = closest;
                    }
                } else if (e.shiftKey) {
                    degrees = Math.round(degrees / 15) * 15;
                }

                onUpdateElements(elements.map(item => item.id === el.id ? { ...item, rotation: degrees } : item), false);
                return;
            }
        }

        if (isDragging && Object.keys(initialPositions).length > 0) {
            if (!hasSavedHistory.current) {
                onInteractionStart();
                hasSavedHistory.current = true;
            }

            const rawDx = coords.x - dragStart.x;
            const rawDy = coords.y - dragStart.y;
            const dx = snapToGrid ? Math.round(rawDx / effectiveGridSize) * effectiveGridSize : rawDx;
            const dy = snapToGrid ? Math.round(rawDy / effectiveGridSize) * effectiveGridSize : rawDy;

            const updatedElements = elements.map(el => {
                if (initialPositions[el.id]) {
                    return { ...el, x: initialPositions[el.id].x + dx, y: initialPositions[el.id].y + dy };
                }
                return el;
            });
            onUpdateElements(updatedElements, false);

            // Fix: Move custom pivot along with the group
            if (initialGroupPivotRef.current) {
                setTemporaryGroupPivot({
                    x: initialGroupPivotRef.current.x + dx,
                    y: initialGroupPivotRef.current.y + dy
                });
            }
        }
        else if (isResizing && initialResizeStateRef.current && resizeHandle) {
            if (!hasSavedHistory.current) {
                onInteractionStart();
                hasSavedHistory.current = true;
            }

            // Identify Resizing Target (Group or Single)
            const isGroup = selectedElementIds.length > 1;

            let { x: startX, y: startY, w: startW, h: startH, rotation: startRot } = initialResizeStateRef.current;
            const angle = startRot || 0;

            // 1. Calculate Screen Delta
            const screenDx = coords.x - dragStart.x;
            const screenDy = coords.y - dragStart.y;

            // 2. Rotate Delta to Local Space (Unrotate) to align with element axes
            // We rotate by -angle 
            const rad = toRad(-angle);
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            let localDx = screenDx * cos - screenDy * sin;
            let localDy = screenDx * sin + screenDy * cos;

            // 3. Apply Snap to local dimensions if enabled
            if (snapToGrid) {
                localDx = Math.round(localDx / effectiveGridSize) * effectiveGridSize;
                localDy = Math.round(localDy / effectiveGridSize) * effectiveGridSize;
            }

            // --- Single Line Resizing ---
            if (!isGroup && elements.find(e => e.id === selectedElementIds[0])?.type === 'line' && (resizeHandle === 'start' || resizeHandle === 'end')) {
                // (Existing line resize logic preserved below...)
                const elId = selectedElementIds[0];
                const el = elements.find(e => e.id === elId);
                if (!el) return;

                const { flip, rotation } = initialResizeStateRef.current;
                const angle = rotation || 0;
                const cx = startX + startW / 2;
                const cy = startY + startH / 2;

                const startLocal = { x: -startW / 2, y: flip ? startH / 2 : -startH / 2 };
                const endLocal = { x: startW / 2, y: flip ? -startH / 2 : startH / 2 };

                // Absolute Coordinates
                let pStart = rotatePoint(cx + startLocal.x, cy + startLocal.y, cx, cy, angle);
                let pEnd = rotatePoint(cx + endLocal.x, cy + endLocal.y, cx, cy, angle);

                // Use Snapped Screen Deltas for Line endpoints
                const dx = snapToGrid ? Math.round(screenDx / effectiveGridSize) * effectiveGridSize : screenDx;
                const dy = snapToGrid ? Math.round(screenDy / effectiveGridSize) * effectiveGridSize : screenDy;

                // Apply Delta
                if (resizeHandle === 'start') {
                    pStart.x += dx; pStart.y += dy;
                } else {
                    pEnd.x += dx; pEnd.y += dy;
                }

                const newX = Math.min(pStart.x, pEnd.x);
                const newY = Math.min(pStart.y, pEnd.y);
                const newW = Math.abs(pStart.x - pEnd.x);
                const newH = Math.abs(pStart.y - pEnd.y);

                const dxSeg = pEnd.x - pStart.x;
                const dySeg = pEnd.y - pStart.y;
                const newFlip = (dxSeg * dySeg) < 0;

                onUpdateElements(elements.map(item => item.id === elId ? {
                    ...item,
                    x: newX, y: newY, w: newW, h: newH,
                    flip: newFlip,
                    rotation: 0
                } : item), false);
                return;
            }

            // --- Standard / Group Resizing Logic ---
            let newW = startW;
            let newH = startH;
            let deltaX_local = 0; // Shift of top-left corner in local space
            let deltaY_local = 0;

            const minSize = 5;

            // Calculate new Dimensions and Local Origin Shift
            if (resizeHandle.includes('e')) {
                newW = Math.max(minSize, startW + localDx);
            }
            if (resizeHandle.includes('w')) {
                newW = Math.max(minSize, startW - localDx);
                deltaX_local = startW - newW; // If we grew left, x moves left.
            }
            if (resizeHandle.includes('s')) {
                newH = Math.max(minSize, startH + localDy);
            }
            if (resizeHandle.includes('n')) {
                newH = Math.max(minSize, startH - localDy);
                deltaY_local = startH - newH;
            }

            // Calculate New World Bounds (Target)
            // Center shift in local space
            const midShiftX = (deltaX_local + newW / 2) - (startW / 2);
            const midShiftY = (deltaY_local + newH / 2) - (startH / 2);

            // Rotate shift to World Space (if group is rotated, though group bounds usually 0 rot)
            const radPos = toRad(angle);
            const cosPos = Math.cos(radPos);
            const sinPos = Math.sin(radPos);

            const worldShiftX = midShiftX * cosPos - midShiftY * sinPos;
            const worldShiftY = midShiftX * sinPos + midShiftY * cosPos;

            const oldCenterWorldX = startX + startW / 2;
            const oldCenterWorldY = startY + startH / 2;

            const newCenterWorldX = oldCenterWorldX + worldShiftX;
            const newCenterWorldY = oldCenterWorldY + worldShiftY;

            const finalX = newCenterWorldX - newW / 2;
            const finalY = newCenterWorldY - newH / 2;

            if (isGroup) {
                // Apply proportional scaling to all elements
                const scaleX = newW / startW;
                const scaleY = newH / startH;

                const updatedElements = elements.map(el => {
                    const initial = initialGroupElements.current.find(i => i.id === el.id);
                    if (!initial) return el; // Don't touch non-selected

                    // Calculate relative position normalized to old group
                    const relX = (initial.x - startX) / startW;
                    const relY = (initial.y - startY) / startH;
                    // const relW = initial.w / startW; // Not needed for scaling
                    // const relH = initial.h / startH; // Not needed for scaling

                    // Project to new group
                    return {
                        ...el,
                        x: finalX + relX * newW,
                        y: finalY + relY * newH,
                        w: initial.w * scaleX,
                        h: initial.h * scaleY,
                        autoWidth: el.type === 'text' ? false : el.autoWidth
                    };
                });
                onUpdateElements(updatedElements, false);
            } else {
                // Single Element Update
                const elId = selectedElementIds[0];
                const el = elements.find(e => e.id === elId);
                if (!el) return;

                // Update Grid Config if applicable
                if (el.type === 'grid' && el.gridConfig) {
                    const { cols, gapX, gapY, sourceType, sourceId, dataSliceStart, dataSliceCount, traversalPath } = el.gridConfig;

                    // Recalculate item count to determine row count correctly
                    let items: any[] = [];

                    let roots: string[] = [];
                    if (sourceType === 'current') {
                        if (nodes[currentNodeId]) roots = [currentNodeId];
                    } else if (sourceType === 'specific' && sourceId) {
                        if (nodes[sourceId]) roots = [sourceId];
                    }

                    if (traversalPath && traversalPath.length > 0) {
                        items = traverseGridData(roots, traversalPath, 0, nodes);
                    } else {
                        if (roots.length > 0 && nodes[roots[0]]) {
                            items = nodes[roots[0]].children || [];
                        }
                    }

                    // Apply Slice
                    const start = dataSliceStart || 0;
                    const limit = dataSliceCount;
                    if (start > 0 || limit !== undefined) {
                        const end = limit !== undefined ? start + limit : undefined;
                        items = items.slice(start, end);
                    }

                    const displayCount = items.length > 0 ? items.length : 6;
                    const colCount = Math.max(1, cols || 3);
                    const rowCount = Math.max(1, Math.ceil((displayCount + (el.gridConfig.offsetStart || 0)) / colCount));

                    // newW is the TOTAL width. Convert to Cell W.
                    // TotalW = cols * cellW + (cols-1)*gap
                    // cellW = (TotalW - (cols-1)*gap) / cols
                    const newCellW = (newW - ((colCount - 1) * (gapX || 0))) / colCount;
                    const newCellH = (newH - ((rowCount - 1) * (gapY || 0))) / rowCount;

                    onUpdateElements(elements.map(item => item.id === elId ? {
                        ...item, x: finalX, y: finalY, w: newCellW, h: newCellH
                    } : item), false);
                } else {
                    onUpdateElements(elements.map(item => item.id === elId ? {
                        ...item, x: finalX, y: finalY, w: newW, h: newH,
                        autoWidth: item.type === 'text' ? false : item.autoWidth
                    } : item), false);
                }
            }
        }
    };

    const handleMouseUp = (e: MouseEvent) => {
        if (isRotating && selectedElementIds.length > 1 && initialGroupBoundsRef.current) {
            // Initial relative rotation was 0 for group, so we add to the group's starting rotation
            // Use delta from initial interaction start
            const coords = getMouseCoords(e);
            const initialBounds = initialGroupBoundsRef.current;

            // Consolidate pivot logic: Use custom pivot if available, else bounds center
            let cx = initialBounds.x + initialBounds.w / 2;
            let cy = initialBounds.y + initialBounds.h / 2;
            if (temporaryGroupPivot) {
                cx = temporaryGroupPivot.x;
                cy = temporaryGroupPivot.y;
            }

            // Re-calculate basic angles (same as move)
            const radians = Math.atan2(coords.y - cy, coords.x - cx);
            const rawMouseDegrees = radians * (180 / Math.PI) + 90;

            const startGroupRotation = initialBounds.rotation || 0;
            const rawDelta = rawMouseDegrees - initialRotation;
            let finalRotation = startGroupRotation + rawDelta;

            if (snapToGrid) {
                const cardinals = [0, 90, 180, 270, 360];
                const normalized = (finalRotation % 360 + 360) % 360;
                const closest = cardinals.find(c => Math.abs(c - normalized) < 10);
                if (closest !== undefined) {
                    finalRotation = closest === 360 ? 0 : closest;
                }
            } else if (e.shiftKey) {
                finalRotation = Math.round(finalRotation / 15) * 15;
            }

            const delta = finalRotation - startGroupRotation;

            // CRITICAL FIX: Ensure elements are updated to match this final rotation exactly
            // This prevents stale element state from causing bounding box drift

            const updatedElements = elements.map(item => {
                const initial = initialGroupElements.current.find(i => i.id === item.id);
                if (!initial) return item;

                // 1. Determine the Element's Anchor Point (Transform Origin) in Initial World Space
                const ox = initial.transformOrigin ? initial.transformOrigin.x : 0.5;
                const oy = initial.transformOrigin ? initial.transformOrigin.y : 0.5;

                const initialAnchorX = initial.x + initial.w * ox;
                const initialAnchorY = initial.y + initial.h * oy;

                // 2. Rotate this Anchor Point around the Group Pivot by delta
                const rotatedAnchor = rotatePoint(initialAnchorX, initialAnchorY, cx, cy, delta);

                // 3. Calculate new Top-Left (x, y)
                return {
                    ...item,
                    x: rotatedAnchor.x - initial.w * ox,
                    y: rotatedAnchor.y - initial.h * oy,
                    rotation: (initial.rotation || 0) + delta
                };
            });
            onUpdateElements(updatedElements, true); // Save history

            setPersistentGroupRotation(finalRotation);
        }
        setIsRotating(false);
        // setTemporaryGroupPivot(null); // Fix: Don't clear pivot on release, keep it for next rotation
        if (newShapeStart && newShapeCurrent) {
            let x = Math.min(newShapeStart.x, newShapeCurrent.x);
            let y = Math.min(newShapeStart.y, newShapeCurrent.y);
            let w = Math.abs(newShapeCurrent.x - newShapeStart.x);
            let h = Math.abs(newShapeCurrent.y - newShapeStart.y);


            if (w < MIN_DRAG_THRESHOLD && h < MIN_DRAG_THRESHOLD) {
                if (tool === 'text') {
                    onInteractionStart();
                    const maxZ = elements.reduce((max, el) => Math.max(max, el.zIndex || 0), 0);
                    const fontSize = parseInt(localStorage.getItem('doctect_last_fontSize') || '16');
                    const newEl: TemplateElement = {
                        id: Math.random().toString(36).substr(2, 9),
                        type: 'text',
                        x: newShapeStart.x,
                        y: newShapeStart.y,
                        w: Math.max(10, fontSize * 1), // Width for ~1 char
                        h: Math.max(20, fontSize * 1.5), // Height based on line height
                        rotation: 0,
                        fill: '',
                        fillType: 'solid',
                        stroke: '',
                        strokeWidth: 0,
                        borderStyle: 'solid',
                        opacity: 1,
                        zIndex: maxZ + 1,
                        text: '',
                        autoWidth: true,
                        fontSize: parseInt(localStorage.getItem('doctect_last_fontSize') || '16'),
                        fontFamily: localStorage.getItem('doctect_last_fontFamily') || 'helvetica',
                        fontWeight: (localStorage.getItem('doctect_last_fontWeight') as 'normal' | 'bold') || 'normal',
                        fontStyle: (localStorage.getItem('doctect_last_fontStyle') as 'normal' | 'italic') || 'normal',
                        textDecoration: (localStorage.getItem('doctect_last_textDecoration') as 'none' | 'underline') || 'none',
                        textColor: localStorage.getItem('doctect_last_textColor') || '#000000',
                        align: (localStorage.getItem('doctect_last_align') as 'left' | 'center' | 'right') || 'center',
                    };
                    onUpdateElements([...elements, newEl], false);
                    onSelectElements([newEl.id]);
                    setEditingElementId(newEl.id);
                }
                setNewShapeStart(null);
                setNewShapeCurrent(null);
                return;
            }

            // Save history before creating new element
            onInteractionStart();

            const maxZ = elements.reduce((max, el) => Math.max(max, el.zIndex || 0), 0);
            let cellW = w;
            let cellH = h;
            let gridConfig = undefined;
            let flip = false;

            if (tool === 'grid') {
                const defaultCols = 3;
                const defaultGap = 10;
                const defaultRows = 2;
                cellW = (w - (defaultCols - 1) * defaultGap) / defaultCols;
                cellH = (h - (defaultRows - 1) * defaultGap) / defaultRows;
                if (cellW < 5) cellW = w;
                if (cellH < 5) cellH = h;

                gridConfig = {
                    cols: defaultCols,
                    gapX: defaultGap,
                    gapY: defaultGap,
                    sourceType: 'current',
                    displayField: 'title',
                    offsetStart: 0
                };
            } else if (tool === 'line') {
                const dx = newShapeCurrent.x - newShapeStart.x;
                const dy = newShapeCurrent.y - newShapeStart.y;
                if ((dx > 0 && dy < 0) || (dx < 0 && dy > 0)) {
                    flip = true;
                }
            }

            const newEl: TemplateElement = {
                id: Math.random().toString(36).substr(2, 9),
                type: tool as any,
                x, y,
                w: tool === 'grid' ? cellW : w,
                h: tool === 'grid' ? cellH : h,
                rotation: 0,
                fill: tool === 'grid' ? '#ffffff' : (tool === 'line' ? '#000000' : (tool === 'text' ? '' : '#e2e8f0')),
                fillType: 'solid',
                stroke: tool === 'text' ? '' : '#000000',
                strokeWidth: tool === 'text' ? 0 : 1,
                borderStyle: 'solid',
                opacity: 1,
                zIndex: maxZ + 1,
                text: tool === 'text' ? '' : undefined,
                fontSize: parseInt(localStorage.getItem('doctect_last_fontSize') || '16'),
                fontFamily: localStorage.getItem('doctect_last_fontFamily') || 'helvetica',
                fontWeight: (localStorage.getItem('doctect_last_fontWeight') as 'normal' | 'bold') || 'normal',
                fontStyle: (localStorage.getItem('doctect_last_fontStyle') as 'normal' | 'italic') || 'normal',
                textDecoration: (localStorage.getItem('doctect_last_textDecoration') as 'none' | 'underline') || 'none',
                textColor: localStorage.getItem('doctect_last_textColor') || '#000000',
                align: (localStorage.getItem('doctect_last_align') as 'left' | 'center' | 'right') || 'center',
                gridConfig: gridConfig as any,
                flip: flip
            };
            // Pass false for saveHistory because we already called onInteractionStart manually above
            onUpdateElements([...elements, newEl], false);
            onSelectElements([newEl.id]);
            if (tool === 'text') {
                setEditingElementId(newEl.id);
            }
        } else if (isSelecting && selectionBox) {
            const ids: string[] = [];
            elements.forEach(el => {
                const bounds = getElementBounds(el);
                const elRight = bounds.x + bounds.w;
                const elBottom = bounds.y + bounds.h;
                const selRight = selectionBox.x + selectionBox.w;
                const selBottom = selectionBox.y + selectionBox.h;

                if (bounds.x < selRight && elRight > selectionBox.x && bounds.y < selBottom && elBottom > selectionBox.y) {
                    ids.push(el.id);
                }
            });
            onSelectElements(ids);
        }

        setNewShapeStart(null);
        setNewShapeCurrent(null);
        setIsDragging(false);
        setIsResizing(false);
        setIsRotating(false);
        setIsDraggingPivot(false);
        setIsSelecting(false);
        setIsPanning(false);
        setSelectionBox(null);
        setResizeHandle(null);
        setInitialPositions({});
        initialResizeStateRef.current = null;
        setPanStart(null);
    };

    const renderCreationPreview = () => {
        if (!newShapeStart || !newShapeCurrent) return null;

        // Calculate dimensions consistently
        const x = Math.min(newShapeStart.x, newShapeCurrent.x);
        const y = Math.min(newShapeStart.y, newShapeCurrent.y);
        const w = Math.abs(newShapeCurrent.x - newShapeStart.x);
        const h = Math.abs(newShapeCurrent.y - newShapeStart.y);

        if (tool === 'line') {
            return (
                <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{ zIndex: 999 }}>
                    <line
                        x1={newShapeStart.x}
                        y1={newShapeStart.y}
                        x2={newShapeCurrent.x}
                        y2={newShapeCurrent.y}
                        stroke="#3b82f6"
                        strokeWidth={2}
                    />
                </svg>
            );
        }

        // Use SVG for precise shape preview
        if (tool === 'triangle') {
            return (
                <svg className="absolute pointer-events-none" style={{ left: x, top: y, width: w, height: h, zIndex: 999, overflow: 'visible' }}>
                    <polygon
                        points={`${w / 2},0 0,${h} ${w},${h}`}
                        fill="rgba(59, 130, 246, 0.2)"
                        stroke="#3b82f6"
                        strokeWidth={2}
                    />
                </svg>
            );
        }

        if (tool === 'ellipse' || tool === 'circle') {
            return (
                <div className="absolute border-2 border-blue-500 bg-blue-500/20"
                    style={{ left: x, top: y, width: w, height: h, zIndex: 999, borderRadius: '50%' }}
                />
            );
        }

        // Default for Rect, Text, Grid
        return (
            <div className="absolute border-2 border-blue-500 bg-blue-500/20"
                style={{ left: x, top: y, width: w, height: h, zIndex: 999 }}
            />
        );
    };

    const containerCursor = tool === 'hand' || isPanning ? (isPanning ? 'grabbing' : 'grab') : (tool === 'select' ? 'default' : 'crosshair');

    return (
        <div
            ref={outerContainerRef}
            className={clsx("w-full h-full bg-slate-200 overflow-auto flex relative select-none canvas-scroll-container")}
            style={{ cursor: containerCursor }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            {/* Inner container wrapper to handle centering vs scrolling */}
            <div className="m-auto p-12 min-w-fit min-h-fit">
                <div
                    ref={containerRef}
                    data-testid="editor-canvas"
                    className="bg-white shadow-lg relative overflow-hidden"
                    style={{
                        width: template.width * scale,
                        height: template.height * scale,
                    }}
                >
                    <div style={{
                        transform: `scale(${scale})`,
                        transformOrigin: 'top left',
                        width: template.width,
                        height: template.height,
                    }}>
                        {showGrid && (
                            <div className="absolute inset-0 pointer-events-none opacity-20"
                                style={{
                                    backgroundImage: `radial-gradient(#94a3b8 ${Math.max(0.5, 1.5 / scale)}px, transparent ${Math.max(0.5, 1.5 / scale)}px)`,
                                    backgroundSize: `${effectiveGridSize}px ${effectiveGridSize}px`,
                                    zIndex: 0
                                }}></div>
                        )}
                        {elements.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0)).map(el => (
                            <CanvasElement
                                key={el.id}
                                element={el}
                                selected={selectedElementIds.includes(el.id)}
                                nodes={nodes}
                                currentNodeId={currentNodeId}
                                tool={tool}
                                showHandles={selectedElementIds.includes(el.id) && selectedElementIds.length === 1}
                                onDoubleClick={() => setEditingElementId(el.id)}
                                isEditing={editingElementId === el.id}
                            />
                        ))}

                        {/* Group Selection Overlay */}
                        {(() => {
                            let visualBounds = groupBounds;
                            // 1. Rotation Interaction: Use initial snapshot + delta
                            if (isRotating && selectedElementIds.length > 1 && initialGroupBoundsRef.current && initialGroupElements.current.length > 0) {
                                const firstCurrent = elements.find(e => e.id === selectedElementIds[0]);
                                const firstInitial = initialGroupElements.current.find(e => e.id === selectedElementIds[0]);
                                if (firstCurrent && firstInitial) {
                                    // Valid delta calculation based on element update
                                    const delta = (firstCurrent.rotation || 0) - (firstInitial.rotation || 0);

                                    // Rotate the Group Center around the PIVOT by delta
                                    const initial = initialGroupBoundsRef.current;

                                    // Determine Pivot (Same logic as rotation handler)
                                    let cx = initial.x + initial.w / 2;
                                    let cy = initial.y + initial.h / 2;
                                    if (temporaryGroupPivot) {
                                        cx = temporaryGroupPivot.x;
                                        cy = temporaryGroupPivot.y;
                                    }

                                    // Rotate the INITIAL CENTER around the PIVOT
                                    const initialCenter = { x: initial.x + initial.w / 2, y: initial.y + initial.h / 2 };
                                    const newCenter = rotatePoint(initialCenter.x, initialCenter.y, cx, cy, delta);

                                    visualBounds = {
                                        ...initial,
                                        x: newCenter.x - initial.w / 2,
                                        y: newCenter.y - initial.h / 2,
                                        rotation: (initial.rotation || 0) + delta
                                    };
                                }
                            }
                            // 2. Persistent Rotation (Static): Calculate Tight Bounds
                            else if (selectedElementIds.length > 1 && persistentGroupRotation !== 0) {
                                const vb = getRotatedGroupBounds(elements.filter(e => selectedElementIds.includes(e.id)), persistentGroupRotation);
                                if (vb) visualBounds = vb;
                            }
                            /*
                            else if (selectedElementIds.length > 1 && persistentGroupRotation !== 0) {
                                // around the center of the current AABB, find the bounds of those un-rotated points,
                                // and then rotate that box back.

                                // 1. Current AABB (to find pivot/center)
                                const currentAABB = groupBounds; // Standard AABB of rotated elements
                                if (currentAABB) {
                                    const cx = currentAABB.x + currentAABB.w / 2;
                                    const cy = currentAABB.y + currentAABB.h / 2;

                                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

                                    const selectedEls = elements.filter(e => selectedElementIds.includes(e.id));

                                    selectedEls.forEach(el => {
                                        // Get corners of the element in world space
                                        const elBounds = getElementBounds(el);
                                        // Element corners (considering its own rotation)
                                        // We need absolute world coordinates of the 4 corners
                                        // Visual Center
                                        const elOx = el.transformOrigin ? el.transformOrigin.x : 0.5;
                                        const elOy = el.transformOrigin ? el.transformOrigin.y : 0.5;
                                        const anchorX = el.x + el.w * elOx;
                                        const anchorY = el.y + el.h * elOy;

                                        // Corners relative to anchor unrotated
                                        // TL: (el.x, el.y)
                                        // Just use rotatePoint for each corner around Anchor
                                        const corners = [
                                            { x: el.x, y: el.y },
                                            { x: el.x + el.w, y: el.y },
                                            { x: el.x + el.w, y: el.y + el.h },
                                            { x: el.x, y: el.y + el.h }
                                        ].map(p => rotatePoint(p.x, p.y, anchorX, anchorY, el.rotation || 0));

                                        // Now Un-Rotate these world corners around the Group Center by -persistentGroupRotation
                                        corners.forEach(p => {
                                            const unrotated = rotatePoint(p.x, p.y, cx, cy, -persistentGroupRotation);
                                            minX = Math.min(minX, unrotated.x);
                                            minY = Math.min(minY, unrotated.y);
                                            maxX = Math.max(maxX, unrotated.x);
                                            maxY = Math.max(maxY, unrotated.y);
                                        });
                                    });

                                    if (minX !== Infinity) {
                                        visualBounds = {
                                            x: minX,
                                            y: minY,
                                            w: maxX - minX,
                                            h: maxY - minY,
                                            rotation: persistentGroupRotation
                                        };

                                        // Re-center the box?
                                        // The unrotated box is at (minX, minY).
                                        // We rotate it around (cx, cy).
                                        // Wait. We unrotated around (cx, cy).
                                        // So we should rotate the CENTER of the new box around (cx, cy) to find its final position?
                                        // Or does transform: rotate handle it?
                                        // transform: translate(Box.x, Box.y) rotate(R).
                                        // Rotate(R) rotates around the box center (by default 50% 50% or if we set transformOrigin).

                                        // My logic used cx, cy (Center of AABB) as the pivot for unrotation.
                                        // The Unrotated Box has center:
                                        const unrotatedCx = minX + (maxX - minX) / 2;
                                        const unrotatedCy = minY + (maxY - minY) / 2;

                                        // We need to place the Final Box such that its Center is at:
                                        // Rotate(unrotatedCenter, cx, cy, persistentRotation).

                                        const reRotatedCenter = rotatePoint(unrotatedCx, unrotatedCy, cx, cy, persistentGroupRotation);

                                        visualBounds.x = reRotatedCenter.x - visualBounds.w / 2;
                                        visualBounds.y = reRotatedCenter.y - visualBounds.h / 2;
                            */

                            if (selectedElementIds.length > 1 && visualBounds) {
                                const PADDING = 16;
                                const offsetBounds = {
                                    x: visualBounds.x - PADDING / 2,
                                    y: visualBounds.y - PADDING / 2,
                                    w: visualBounds.w + PADDING,
                                    h: visualBounds.h + PADDING,
                                    rotation: visualBounds.rotation
                                };

                                // Calculate Group Pivot relative to Visual Bounds
                                let pivotX = 0.5;
                                let pivotY = 0.5;
                                if (temporaryGroupPivot) {
                                    // Project world pivot into rotated local space of visual bounds?
                                    // Actually SelectionHandles renders pivot based on percentage of bounding box.
                                    // If we are rotating, the box rotates. 
                                    // temporaryGroupPivot is World Coords.

                                    // Unrotate pivot relative to box center to get "local" bounds position?
                                    // No, transformOrigin is relative to the unrotated box top-left.

                                    const cx = visualBounds.x + visualBounds.w / 2;
                                    const cy = visualBounds.y + visualBounds.h / 2;
                                    const r = visualBounds.rotation || 0;

                                    // Unrotate the pivot point to find where it sits in the unrotated box frame
                                    const unrotatedPivot = rotatePoint(temporaryGroupPivot.x, temporaryGroupPivot.y, cx, cy, -r);

                                    // Fix: Calculate relative to OFFSET BOUNDS (Padded), which is what SelectionHandles uses
                                    pivotX = (unrotatedPivot.x - offsetBounds.x) / offsetBounds.w;
                                    pivotY = (unrotatedPivot.y - offsetBounds.y) / offsetBounds.h;
                                }

                                return (
                                    <>
                                        <div
                                            className="absolute border border-blue-500 pointer-events-none"
                                            style={{
                                                left: 0,
                                                top: 0,
                                                width: offsetBounds.w,
                                                height: offsetBounds.h,
                                                transform: `translate(${offsetBounds.x}px, ${offsetBounds.y}px) rotate(${offsetBounds.rotation || 0}deg)`,
                                                zIndex: 9999
                                            }}
                                        />
                                        <div style={{
                                            position: 'absolute',
                                            left: 0,
                                            top: 0,
                                            width: offsetBounds.w,
                                            height: offsetBounds.h,
                                            transform: `translate(${offsetBounds.x}px, ${offsetBounds.y}px) rotate(${offsetBounds.rotation || 0}deg)`,
                                            zIndex: 10000,
                                            pointerEvents: 'none' // Let clicks pass through to container, handles capture events themselves
                                        }}>
                                            <SelectionHandles element={{
                                                ...visualBounds,
                                                ...offsetBounds,
                                                id: 'group-handles',
                                                type: 'group',
                                                transformOrigin: { x: pivotX, y: pivotY }
                                            } as any} />
                                        </div>
                                    </>
                                );
                            }
                            return null;
                        })()}

                        {editingElementId && (() => {
                            const el = elements.find(e => e.id === editingElementId);
                            if (el && el.type === 'text') {
                                return (
                                    <OverlayTextEditor
                                        key={el.id}
                                        element={el}
                                        onChange={(id, updates) => onUpdateElements(elements.map(e => e.id === id ? { ...e, ...updates } : e), false)}
                                        onFinish={() => setEditingElementId(null)}
                                        onSwitchToSelect={onSwitchToSelect}
                                    />
                                );
                            }
                            return null;
                        })()}

                        {/* Selection Overlay - Rendered on top to prevent occlusion */}
                        {selectedElementIds.map(id => {
                            const el = elements.find(e => e.id === id);
                            if (!el) return null;
                            const bounds = getElementBounds(el);

                            // Lines don't use the standard box, they handle their own selection visual via handles
                            const showBorder = el.type !== 'line';

                            return (
                                <div
                                    key={id}
                                    className="absolute pointer-events-none z-[100]"
                                    style={{
                                        left: 0,
                                        top: 0,
                                        width: bounds.w,
                                        height: bounds.h,
                                        transform: `translate(${el.x}px, ${el.y}px) rotate(${el.rotation || 0}deg)`,
                                        transformOrigin: el.transformOrigin ? `${el.transformOrigin.x * bounds.w}px ${el.transformOrigin.y * bounds.h}px` : 'center'
                                    }}
                                >
                                    {/* Selection Border (4px padded, rounded) */}
                                    {showBorder && (
                                        <div className="absolute -inset-1 border border-blue-500 rounded-md" />
                                    )}

                                    {/* Handles (Use existing component, it has pointer-events-auto) */}
                                    {selectedElementIds.length === 1 && <SelectionHandles element={el} />}
                                </div>
                            );
                        })}

                        {renderCreationPreview()}

                        {isSelecting && selectionBox && (
                            <div className="absolute border border-blue-500 bg-blue-500/10 z-[1000]"
                                style={{
                                    left: selectionBox.x, top: selectionBox.y, width: selectionBox.w, height: selectionBox.h, pointerEvents: 'none'
                                }}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};