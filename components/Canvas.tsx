

import React, { useRef, useState, useEffect, useLayoutEffect, MouseEvent } from 'react';
import { AppState, TemplateElement, PageTemplate, AppNode, TraversalStep } from '../types';
import clsx from 'clsx';
import { CanvasElement } from './canvas/CanvasElement';
import { OverlayTextEditor } from './canvas/OverlayTextEditor';

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
    const hasSavedHistory = useRef(false);

    // Drag State
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [initialPositions, setInitialPositions] = useState<Record<string, { x: number, y: number }>>({});
    const [panStart, setPanStart] = useState<{ x: number, y: number, scrollLeft: number, scrollTop: number } | null>(null);

    // Resize State
    const [resizeHandle, setResizeHandle] = useState<string | null>(null);
    const [initialResizeState, setInitialResizeState] = useState<{ x: number, y: number, w: number, h: number, flip?: boolean, rotation?: number } | null>(null);

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
            const rowCount = Math.max(1, Math.ceil((displayCount + (el.gridConfig.offsetStart || 0)) / colCount));

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

            // Check for Rotation Handle
            if (targetEl.closest('[data-rotate-handle]') && selectedElementIds.length === 1) {
                const el = elements.find(e => e.id === selectedElementIds[0]);
                if (el) {
                    setIsRotating(true);
                    setInitialRotation(el.rotation || 0);
                }
                e.stopPropagation();
                return;
            }

            // Check for Resize Handle
            if (targetEl.hasAttribute('data-resize-handle') && selectedElementIds.length === 1) {
                const handle = targetEl.getAttribute('data-resize-handle');
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

                    setInitialResizeState({ x, y, w, h, flip: el.flip, rotation: el.rotation });
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

        if (isSelecting) {
            const x = Math.min(dragStart.x, coords.x);
            const y = Math.min(dragStart.y, coords.y);
            const w = Math.abs(coords.x - dragStart.x);
            const h = Math.abs(coords.y - dragStart.y);
            setSelectionBox({ x, y, w, h });
            return;
        }

        if (isRotating && selectedElementIds.length === 1) {
            if (!hasSavedHistory.current) {
                onInteractionStart();
                hasSavedHistory.current = true;
            }

            const el = elements.find(e => e.id === selectedElementIds[0]);
            if (!el) return;

            // Calculate center of element
            const cx = el.x + el.w / 2;
            const cy = el.y + el.h / 2;

            // Calculate angle from center to mouse
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
        }
        else if (isResizing && initialResizeState && resizeHandle) {
            if (!hasSavedHistory.current) {
                onInteractionStart();
                hasSavedHistory.current = true;
            }

            const elId = selectedElementIds[0];
            const el = elements.find(e => e.id === elId);
            if (!el) return;

            let { x: startX, y: startY, w: startW, h: startH, rotation: startRot } = initialResizeState;
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

            // --- Line Specific Resizing (Point-to-Point) ---
            // Lines handle rotation freely, so we use world-space math
            if (el.type === 'line' && (resizeHandle === 'start' || resizeHandle === 'end')) {
                const { flip, rotation } = initialResizeState;
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

            // --- Standard & Grid Resizing Logic ---
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

            // Calculate New World Center
            // 1. Center shift in local space
            //    The old center was at (startW/2, startH/2) relative to old top-left.
            //    The new center is at (newW/2, newH/2) relative to new top-left.
            //    New Top-Left is at (deltaX_local, deltaY_local) relative to old top-left.
            //    So new center relative to old top-left is (deltaX_local + newW/2, deltaY_local + newH/2).
            //    Shift = NewCenter_rel_OldTL - OldCenter_rel_OldTL
            const midShiftX = (deltaX_local + newW / 2) - (startW / 2);
            const midShiftY = (deltaY_local + newH / 2) - (startH / 2);

            // 2. Rotate this shift to World Space
            //    Rotate by +angle
            const radPos = toRad(angle);
            const cosPos = Math.cos(radPos);
            const sinPos = Math.sin(radPos);

            const worldShiftX = midShiftX * cosPos - midShiftY * sinPos;
            const worldShiftY = midShiftX * sinPos + midShiftY * cosPos;

            // 3. New World Center
            const oldCenterWorldX = startX + startW / 2;
            const oldCenterWorldY = startY + startH / 2;

            const newCenterWorldX = oldCenterWorldX + worldShiftX;
            const newCenterWorldY = oldCenterWorldY + worldShiftY;

            // 4. Final Top-Left (which defines x,y props)
            const finalX = newCenterWorldX - newW / 2;
            const finalY = newCenterWorldY - newH / 2;

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
    };

    const handleMouseUp = () => {
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
        setIsSelecting(false);
        setIsPanning(false);
        setSelectionBox(null);
        setResizeHandle(null);
        setInitialPositions({});
        setInitialResizeState(null);
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
                <div className="absolute border-2 border-blue-500 bg-blue-500/20 rounded-full"
                    style={{ left: x, top: y, width: w, height: h, zIndex: 999 }}
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