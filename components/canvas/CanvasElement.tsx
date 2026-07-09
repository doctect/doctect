
import React from 'react';
import DOMPurify from 'dompurify';
import { TemplateElement, AppNode } from '../../types';
import { getElementBounds, traverseGridData } from './elementBounds';


// Font family mapping for CSS (defined outside component for performance)
const FONT_FAMILY_MAP: Record<string, string> = {
    // Sans-Serif
    'helvetica': 'Helvetica, Arial, sans-serif',
    'open-sans': '"Open Sans", sans-serif',
    'lato': 'Lato, sans-serif',
    'montserrat': 'Montserrat, sans-serif',
    'roboto': 'Roboto, sans-serif',
    'poppins': 'Poppins, sans-serif',
    'nunito': 'Nunito, sans-serif',
    'inter': 'Inter, sans-serif',
    'work-sans': '"Work Sans", sans-serif',
    'source-sans-pro': '"Source Sans Pro", sans-serif',
    'raleway': 'Raleway, sans-serif',
    'ubuntu': 'Ubuntu, sans-serif',
    'pt-sans': '"PT Sans", sans-serif',
    'noto-sans': '"Noto Sans", sans-serif',
    'oxygen': 'Oxygen, sans-serif',
    'fira-sans': '"Fira Sans", sans-serif',
    // Serif
    'times': '"Times New Roman", Times, serif',
    'lora': 'Lora, serif',
    'merriweather': 'Merriweather, serif',
    'playfair-display': '"Playfair Display", serif',
    'pt-serif': '"PT Serif", serif',
    'libre-baskerville': '"Libre Baskerville", serif',
    'crimson-text': '"Crimson Text", serif',
    'eb-garamond': '"EB Garamond", serif',
    'cormorant-garamond': '"Cormorant Garamond", serif',
    'noto-serif': '"Noto Serif", serif',
    // Monospace
    'courier': 'Courier, monospace',
    'roboto-mono': '"Roboto Mono", monospace',
    'fira-code': '"Fira Code", monospace',
    'source-code-pro': '"Source Code Pro", monospace',
    'jetbrains-mono': '"JetBrains Mono", monospace',
    'ubuntu-mono': '"Ubuntu Mono", monospace',
    // Handwriting / Script
    'caveat': 'Caveat, cursive',
    'dancing-script': '"Dancing Script", cursive',
    'patrick-hand': '"Patrick Hand", cursive',
    'pacifico': 'Pacifico, cursive',
    'great-vibes': '"Great Vibes", cursive',
    'satisfy': 'Satisfy, cursive',
    'sacramento': 'Sacramento, cursive',
    'allura': 'Allura, cursive',
    'amatic-sc': '"Amatic SC", cursive',
    'indie-flower': '"Indie Flower", cursive',
    'kalam': 'Kalam, cursive',
    'shadows-into-light': '"Shadows Into Light", cursive',
    // Display
    'bebas-neue': '"Bebas Neue", sans-serif',
    'oswald': 'Oswald, sans-serif',
    'anton': 'Anton, sans-serif',
    'righteous': 'Righteous, cursive',
    'archivo-black': '"Archivo Black", sans-serif',
};

interface CanvasElementProps {
    element: TemplateElement;
    selected: boolean;
    nodes: Record<string, AppNode>;
    currentNodeId: string;
    tool: string;
    // We only show handles if exactly one element is selected
    showHandles: boolean;
    onDoubleClick?: () => void;
    isEditing?: boolean;
}

// Helper: Evaluate simple arithmetic expression or look up field
const evaluateMath = (expr: string | number, data: Record<string, string>): number => {
    const str = String(expr).trim();
    if (!str) return 0;

    // Simple integer
    if (/^-?\d+$/.test(str)) return parseInt(str, 10);

    // Addition
    const plusIdx = str.indexOf('+');
    if (plusIdx > -1) {
        const l = str.substring(0, plusIdx).trim();
        const r = str.substring(plusIdx + 1).trim();
        return evaluateMath(l, data) + evaluateMath(r, data);
    }

    // Subtraction (Right-most minus that isn't start)
    const minusIdx = str.lastIndexOf('-');
    if (minusIdx > 0) {
        const prevChar = str.charAt(minusIdx - 1);
        if (prevChar !== '+' && prevChar !== '-') {
            const l = str.substring(0, minusIdx).trim();
            const r = str.substring(minusIdx + 1).trim();
            return evaluateMath(l, data) - evaluateMath(r, data);
        }
    }

    // Variable lookup
    const val = data[str];
    if (val !== undefined && val !== "") return parseInt(val, 10);

    return 0;
};

// Helper: Find a node that refers to a specific child of the current node
const findChildReferrerNode = (
    currentNode: AppNode,
    allNodes: Record<string, AppNode>,
    startIndexVal: string | number,
    countVal: string | number,
    typeFilter?: string
): AppNode | undefined => {
    // 1. Resolve Start Index & Count with arithmetic
    const start = evaluateMath(startIndexVal, currentNode.data || {});
    const count = evaluateMath(countVal, currentNode.data || {});

    // 2. Iterate
    const direction = count >= 0 ? 1 : -1;
    const absCount = Math.abs(count);

    for (let i = 0; i < absCount; i++) {
        const idx = start + (i * direction);
        if (idx < 0) continue;

        let targetChildId = (currentNode.children && currentNode.children[idx]) ? currentNode.children[idx] : undefined;
        if (!targetChildId) continue;

        const allReferrers = Object.values(allNodes).filter(n => n.referenceId === targetChildId);
        let bestReferrer: AppNode | undefined;

        if (typeFilter && typeFilter.trim() !== '') {
            bestReferrer = allReferrers.find(ref => {
                const parent = ref.parentId ? allNodes[ref.parentId] : null;
                return parent && parent.type === typeFilter;
            });
        }

        if (!bestReferrer && allReferrers.length > 0) {
            bestReferrer = allReferrers[0];
        }

        if (bestReferrer && bestReferrer.parentId) {
            return allNodes[bestReferrer.parentId];
        }
    }
    return undefined;
};

// Helper: Get all nodes that provide context to the current node
const getContextNodes = (startNode: AppNode, nodes: Record<string, AppNode>): AppNode[] => {
    const result: AppNode[] = [];
    const seen = new Set<string>();

    const add = (n: AppNode) => {
        if (n && !seen.has(n.id)) {
            seen.add(n.id);
            result.push(n);
        }
    };

    // 1. Self & Ancestors
    let curr: AppNode | undefined = startNode;
    while (curr) {
        add(curr);
        curr = curr.parentId ? nodes[curr.parentId] : undefined;
    }

    // 2. Reference Target & its Ancestors
    if (startNode.referenceId && nodes[startNode.referenceId]) {
        let target: AppNode | undefined = nodes[startNode.referenceId];
        while (target) {
            add(target);
            target = target.parentId ? nodes[target.parentId] : undefined;
        }
    }

    // 3. Referrers & their Ancestors
    const potentialTargets = [startNode.id];
    if (startNode.referenceId) potentialTargets.push(startNode.referenceId);

    const referrers = Object.values(nodes).filter(n =>
        n.referenceId && potentialTargets.includes(n.referenceId)
    );

    referrers.forEach(ref => {
        let r: AppNode | undefined = ref;
        while (r) {
            add(r);
            r = r.parentId ? nodes[r.parentId] : undefined;
        }
    });

    // 4. Children (Immediate only)
    startNode.children.forEach(childId => {
        if (nodes[childId]) add(nodes[childId]);
    });
    if (startNode.referenceId && nodes[startNode.referenceId]) {
        nodes[startNode.referenceId].children.forEach(childId => {
            if (nodes[childId]) add(nodes[childId]);
        });
    }

    return result;
};

// Helper to resolve text content with data binding
const resolveText = (text: string | undefined, node: AppNode | undefined, nodes: Record<string, AppNode>): string => {
    let content = text || "";
    if (!content.includes('{{')) return content;
    if (!node) return content;

    // 1. Handle explicit Child Referrer lookups first
    content = content.replace(/\{\{child_referrer:([^:]+):([^:]+):([^:]*):([^}]+)\}\}/g, (_, startStr, countStr, typeFilter, field) => {
        const referrerParent = findChildReferrerNode(node, nodes, startStr, countStr, typeFilter);

        if (referrerParent) {
            if (field === 'title') return referrerParent.title;
            if (referrerParent.data && referrerParent.data[field] !== undefined) return referrerParent.data[field];
        }
        return "";
    });

    // 2. Build the context chain
    const contextNodes = getContextNodes(node, nodes);

    return content.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
        const trimmedKey = key.trim();

        for (const ctxNode of contextNodes) {
            if (trimmedKey === 'title') return ctxNode.title;
            if (ctxNode.data && ctxNode.data[trimmedKey] !== undefined) {
                return ctxNode.data[trimmedKey];
            }
        }
        return "";
    });
};

export const CanvasElement: React.FC<CanvasElementProps> = (props) => {
    const { element, selected, nodes, currentNodeId, tool, showHandles, onDoubleClick, isEditing } = props;

    const contextNode = nodes[currentNodeId];

    const getBackgroundStyle = (el: TemplateElement): React.CSSProperties => {
        if (el.type === 'line') return {};
        const hasFill = el.fill || (el.fillType === 'pattern');
        const hasBorder = el.strokeWidth > 0 && !!el.stroke && el.borderStyle !== 'none';

        if (!hasFill && !hasBorder && el.type === 'text' && !el.borderSides) return {};

        const bgStyle: React.CSSProperties = {
            backgroundColor: el.fillType === 'pattern' ? 'transparent' : (el.fill || 'transparent'),
            boxSizing: 'border-box',
        };

        if (el.borderSides) {
            // Per-side border configs
            const makeBorder = (side: { width: number; color: string; style: string }) =>
                `${side.width}px ${side.style === 'double' ? 'double' : side.style} ${side.color}`;
            if (el.borderSides.top) bgStyle.borderTop = makeBorder(el.borderSides.top);
            if (el.borderSides.right) bgStyle.borderRight = makeBorder(el.borderSides.right);
            if (el.borderSides.bottom) bgStyle.borderBottom = makeBorder(el.borderSides.bottom);
            if (el.borderSides.left) bgStyle.borderLeft = makeBorder(el.borderSides.left);
        } else if (hasBorder) {
            const borderValue = `${el.strokeWidth}px ${el.borderStyle || 'solid'} ${el.stroke}`;
            const doubleBorderValue = `${Math.max(3, el.strokeWidth)}px double ${el.stroke}`;
            const isDouble = el.borderStyle === 'double';
            bgStyle.border = isDouble ? doubleBorderValue : borderValue;
        }

        if (el.fillType === 'pattern' && el.fill) {
            const color = el.fill;
            const spacing = el.patternSpacing || 10;
            const weight = el.patternWeight || 1;
            if (el.patternType === 'lines-h') bgStyle.backgroundImage = `repeating-linear-gradient(180deg, ${color}, ${color} ${weight}px, transparent ${weight}px, transparent ${spacing}px)`;
            else if (el.patternType === 'lines-v') bgStyle.backgroundImage = `repeating-linear-gradient(90deg, ${color}, ${color} ${weight}px, transparent ${weight}px, transparent ${spacing}px)`;
            else if (el.patternType === 'dots') {
                const radius = weight / 2;
                bgStyle.backgroundImage = `radial-gradient(circle, ${color} ${radius}px, transparent ${radius}px)`;
                bgStyle.backgroundSize = `${spacing}px ${spacing}px`;
            }
        }
        return bgStyle;
    };

    const bounds = getElementBounds(element, nodes, currentNodeId);
    const style: React.CSSProperties = {
        position: 'absolute',
        left: 0,
        top: 0,
        width: bounds.w,
        height: bounds.h,
        transform: `translate(${element.x}px, ${element.y}px) rotate(${element.rotation || 0}deg)`,
        transformOrigin: element.transformOrigin ? `${element.transformOrigin.x * bounds.w}px ${element.transformOrigin.y * bounds.h}px` : 'center',
        opacity: element.opacity,
        zIndex: element.zIndex || 0,
        pointerEvents: (tool === 'select') ? 'auto' : 'none',
        // Apply flip if needed (scaleX/Y) - wait, flip is usually separate or part of transform?
        // Looking at previous code, flip wasn't in the main transform here?
        // Ah, flip logic might be inside specific renderers or I missed it.
        // Let's check if I missed 'flip'.
        // Original code: `transform: rotate(...)`. Flip wasn't there.
        // So just translate + rotate.
        whiteSpace: element.autoWidth ? 'pre' : undefined,
        minWidth: element.autoWidth ? 20 : undefined,
        minHeight: element.autoWidth ? 20 : undefined,
    };

    const fontFamily = FONT_FAMILY_MAP[element.fontFamily || 'helvetica'] || element.fontFamily;

    // Grid
    if (element.type === 'grid' && element.gridConfig) {
        const { cols, gapX, gapY, sourceType, sourceId, displayField, offsetMode, offsetField, offsetAdjustment, dataSliceStart, dataSliceCount, traversalPath } = element.gridConfig;

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

        const start = dataSliceStart || 0;
        const limit = dataSliceCount;
        if (start > 0 || limit !== undefined) {
            const end = limit !== undefined ? start + limit : undefined;
            items = items.slice(start, end);
        }

        const isMock = items.length === 0;
        let offset = element.gridConfig.offsetStart || 0;
        const colCount = cols || 3;

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

        const displayItems = isMock ? Array.from({ length: 6 }) : items;
        const safeGapX = gapX ?? 10;
        const safeGapY = gapY ?? 10;

        let templatePattern = displayField || '{{title}}';
        if (!templatePattern.includes('{{')) {
            templatePattern = `{{${templatePattern}}}`;
        }

        // Outer border for the whole grid element (from Appearance section stroke)
        const hasOuterBorder = element.strokeWidth > 0 && !!element.stroke && element.borderStyle !== 'none';
        const hasOuterBorderSides = !!element.borderSides;

        // Compute total rows for border mode logic
        const totalItems = displayItems.length + offset;
        const totalRows = Math.max(1, Math.ceil(totalItems / colCount));

        const gridBorderMode = element.gridConfig.gridBorderMode || 'all';
        const gc = element.gridConfig;

        // Per-cell border config — uses ONLY grid-specific settings (independent from element stroke)
        const cellBorderWidth = gc.gridBorderWidth ?? 0;
        const cellBorderColor = gc.gridBorderColor || '';
        const cellBorderStyle = gc.gridBorderStyle || 'solid';
        const hasCellBorderDef = cellBorderWidth > 0 && !!cellBorderColor && cellBorderStyle !== 'none';
        const defaultBorderSide = hasCellBorderDef ? { width: cellBorderWidth, color: cellBorderColor, style: cellBorderStyle as any } : null;

        // Helper: compute border sides config for a cell based on gridBorderMode
        type SideConfig = { width: number; color: string; style: 'solid' | 'dashed' | 'dotted' | 'none' | 'double' } | undefined;
        const getCellBorderSides = (row: number, col: number): { top?: SideConfig; right?: SideConfig; bottom?: SideConfig; left?: SideConfig } | undefined => {
            if (!defaultBorderSide) return undefined;

            if (gridBorderMode === 'none') return {};
            if (gridBorderMode === 'all') {
                return { top: defaultBorderSide, right: defaultBorderSide, bottom: defaultBorderSide, left: defaultBorderSide };
            }
            const isTop = row === 0;
            const isBottom = row === totalRows - 1;
            const isLeft = col === 0;
            const isRight = col === colCount - 1;

            if (gridBorderMode === 'outside') {
                return {
                    top: isTop ? defaultBorderSide : undefined,
                    right: isRight ? defaultBorderSide : undefined,
                    bottom: isBottom ? defaultBorderSide : undefined,
                    left: isLeft ? defaultBorderSide : undefined,
                };
            }
            if (gridBorderMode === 'inside') {
                return {
                    top: !isTop ? defaultBorderSide : undefined,
                    right: !isRight ? defaultBorderSide : undefined,
                    bottom: !isBottom ? defaultBorderSide : undefined,
                    left: !isLeft ? defaultBorderSide : undefined,
                };
            }
            return { top: defaultBorderSide, right: defaultBorderSide, bottom: defaultBorderSide, left: defaultBorderSide };
        };

        // Helper to build a cell's border CSS style
        const buildCellBorderStyle = (cellBorderSides: { top?: SideConfig; right?: SideConfig; bottom?: SideConfig; left?: SideConfig } | undefined): React.CSSProperties => {
            if (!cellBorderSides) return {};
            const make = (side: SideConfig) => side ? `${side.width}px ${side.style === 'double' ? 'double' : side.style} ${side.color}` : undefined;
            const style: React.CSSProperties = {};
            if (cellBorderSides.top) style.borderTop = make(cellBorderSides.top);
            if (cellBorderSides.right) style.borderRight = make(cellBorderSides.right);
            if (cellBorderSides.bottom) style.borderBottom = make(cellBorderSides.bottom);
            if (cellBorderSides.left) style.borderLeft = make(cellBorderSides.left);
            return style;
        };

        // Compute empty cell positions (offset cells at start + trailing cells to fill last row)
        const emptyCells: { row: number; col: number; pos: number }[] = [];
        if (gc.showEmptyCellBorders && gridBorderMode !== 'none') {
            // Offset cells at the beginning
            for (let i = 0; i < offset; i++) {
                const row = Math.floor(i / colCount);
                const col = ((i % colCount) + colCount) % colCount;
                emptyCells.push({ row, col, pos: i });
            }
            // Trailing cells to fill the last row
            const lastItemPos = displayItems.length + offset - 1;
            const lastRow = Math.floor(lastItemPos / colCount);
            const lastCol = ((lastItemPos % colCount) + colCount) % colCount;
            for (let c = lastCol + 1; c < colCount; c++) {
                emptyCells.push({ row: lastRow, col: c, pos: lastRow * colCount + c });
            }
        }

        return (
            <div key={element.id} data-element-id={element.id} className="absolute group outline outline-1 outline-dashed outline-slate-300" style={style}>

                {/* Empty cells (offset + trailing) */}
                {emptyCells.map(({ row, col, pos }) => {
                    const cx = col * (element.w + safeGapX);
                    const cy = row * (element.h + safeGapY);
                    const cellBorderSidesEmpty = getCellBorderSides(row, col);
                    return (
                        <div key={`empty-${pos}`} style={{
                            position: 'absolute', left: cx, top: cy,
                            width: element.w, height: element.h,
                            boxSizing: 'border-box',
                            backgroundColor: 'transparent',
                            ...buildCellBorderStyle(cellBorderSidesEmpty),
                            borderRadius: gc.gridBorderRadius ?? 0,
                        }} />
                    );
                })}

                {displayItems.map((childId: any, idx: number) => {
                    const pos = idx + offset;
                    const row = Math.floor(pos / colCount);
                    const col = ((pos % colCount) + colCount) % colCount;
                    const cx = col * (element.w + safeGapX);
                    const cy = row * (element.h + safeGapY);

                    let label = `Item ${idx + 1}`;
                    if (!isMock && nodes[childId]) {
                        let n = nodes[childId];
                        if (n.referenceId && nodes[n.referenceId]) n = nodes[n.referenceId];
                        label = resolveText(templatePattern, n, nodes);
                    }

                    // Compute cell-specific fill and text overrides
                    let cellFill = element.fill;
                    let cellTextColor = element.textColor || '#000';
                    let cellFontWeight = element.fontWeight;

                    // Alternating row/column colors FIRST (lowest priority)
                    const dataRow = gc.headerRow ? row - 1 : row;
                    if (gc.alternateRows && gc.alternateRowFill && dataRow >= 0 && dataRow % 2 === 1) {
                        cellFill = gc.alternateRowFill;
                    }
                    if (gc.alternateColumns && gc.alternateColumnFill && col % 2 === 1) {
                        cellFill = gc.alternateColumnFill;
                    }

                    // Header row overrides (higher priority)
                    if (gc.headerRow && row === 0) {
                        if (gc.headerRowFill) cellFill = gc.headerRowFill;
                        if (gc.headerRowTextColor) cellTextColor = gc.headerRowTextColor;
                        if (gc.headerRowFontWeight) cellFontWeight = gc.headerRowFontWeight;
                    }
                    // First column overrides (highest priority)
                    if (gc.firstColumn && col === 0) {
                        if (gc.firstColumnFill) cellFill = gc.firstColumnFill;
                        if (gc.firstColumnTextColor) cellTextColor = gc.firstColumnTextColor;
                        if (gc.firstColumnFontWeight) cellFontWeight = gc.firstColumnFontWeight;
                    }

                    // Compute cell border sides
                    const cellBorderSides = getCellBorderSides(row, col);

                    // Build pattern fill CSS if needed
                    const patternStyle: React.CSSProperties = {};
                    if (element.fillType === 'pattern' && cellFill) {
                        const spacing = element.patternSpacing || 10;
                        const weight = element.patternWeight || 1;
                        if (element.patternType === 'lines-h') patternStyle.backgroundImage = `repeating-linear-gradient(180deg, ${cellFill}, ${cellFill} ${weight}px, transparent ${weight}px, transparent ${spacing}px)`;
                        else if (element.patternType === 'lines-v') patternStyle.backgroundImage = `repeating-linear-gradient(90deg, ${cellFill}, ${cellFill} ${weight}px, transparent ${weight}px, transparent ${spacing}px)`;
                        else if (element.patternType === 'dots') {
                            const radius = weight / 2;
                            patternStyle.backgroundImage = `radial-gradient(circle, ${cellFill} ${radius}px, transparent ${radius}px)`;
                            patternStyle.backgroundSize = `${spacing}px ${spacing}px`;
                        }
                    }

                    return (
                        <div key={idx} style={{
                            position: 'absolute', left: cx, top: cy, width: element.w, height: element.h,
                            boxSizing: 'border-box',
                            backgroundColor: element.fillType === 'pattern' ? 'transparent' : (cellFill || 'transparent'),
                            ...patternStyle,
                            ...buildCellBorderStyle(cellBorderSides),
                            borderRadius: gc.gridBorderRadius ?? 0,
                            display: 'flex',
                            justifyContent: element.align === 'left' ? 'flex-start' : element.align === 'right' ? 'flex-end' : 'center',
                            alignItems: element.verticalAlign === 'top' ? 'flex-start' : element.verticalAlign === 'bottom' ? 'flex-end' : 'center',
                            fontSize: element.fontSize || 12,
                            color: cellTextColor,
                            fontFamily: fontFamily,
                            fontWeight: cellFontWeight,
                            fontStyle: element.fontStyle,
                            textDecoration: element.textDecoration,
                            textDecorationColor: cellTextColor,
                            overflow: 'hidden'
                        }}><span className="truncate" style={{ padding: '0 1px' }}>{label}</span></div>
                    );
                })}

                {/* Outer grid border — rendered AFTER cells so it appears on top */}
                {(hasOuterBorder || hasOuterBorderSides) && (
                    <div style={{
                        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                        boxSizing: 'border-box',
                        borderRadius: element.borderRadius || 0,
                        pointerEvents: 'none',
                        ...(hasOuterBorderSides ? (() => {
                            const makeBorder = (side: { width: number; color: string; style: string }) =>
                                `${side.width}px ${side.style === 'double' ? 'double' : side.style} ${side.color}`;
                            const s: React.CSSProperties = {};
                            if (element.borderSides!.top) s.borderTop = makeBorder(element.borderSides!.top);
                            if (element.borderSides!.right) s.borderRight = makeBorder(element.borderSides!.right);
                            if (element.borderSides!.bottom) s.borderBottom = makeBorder(element.borderSides!.bottom);
                            if (element.borderSides!.left) s.borderLeft = makeBorder(element.borderSides!.left);
                            return s;
                        })() : {
                            border: `${element.strokeWidth}px ${element.borderStyle || 'solid'} ${element.stroke}`,
                        }),
                    }} />
                )}

            </div>
        );
    }

    if (element.type === 'line') {
        return (
            <div key={element.id} data-element-id={element.id} className="absolute group" style={style} onDoubleClick={props.onDoubleClick}>
                <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
                    {element.flip ? (
                        <line x1="0" y1="100%" x2="100%" y2="0" stroke={element.stroke || 'none'} strokeWidth={element.strokeWidth} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : element.borderStyle === 'dotted' ? '2,2' : ''} />
                    ) : (
                        <line x1="0" y1="0" x2="100%" y2="100%" stroke={element.stroke || 'none'} strokeWidth={element.strokeWidth} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : element.borderStyle === 'dotted' ? '2,2' : ''} />
                    )}
                </svg>

            </div>
        );
    }

    // SVG Image
    if (element.type === 'svg' && element.svgContent) {
        // Prepare the SVG content: ensure it scales to fill the bounding box.
        // Only the ROOT <svg> tag's width/height may be stripped — an unanchored
        // replace would eat the first child's width/height when the root has none.
        const svgMarkup = element.svgContent.replace(/<svg[^>]*>/, rootTag =>
            rootTag
                .replace(/\s(?:width|height)="[^"]*"/g, '')
                .replace(/<svg/, '<svg preserveAspectRatio="xMidYMid meet"')
        );

        // Security: svgContent is untrusted user-supplied content (it can arrive from
        // another user's published gallery project via "Open in editor", fork, or a
        // merge-request preview). Sanitize with DOMPurify's svg/svgFilters profile —
        // this strips <script> tags and event-handler attributes (onload, etc.) while
        // preserving legitimate SVG shapes/paths/styling — as the FINAL step before
        // this string is ever passed to dangerouslySetInnerHTML.
        const sanitizedSvgMarkup = DOMPurify.sanitize(
            svgMarkup.replace(/<svg/, '<svg width="100%" height="100%"'),
            { USE_PROFILES: { svg: true, svgFilters: true } }
        );

        return (
            <div key={element.id} data-element-id={element.id} className="absolute group" style={style} onDoubleClick={props.onDoubleClick}>
                <div
                    style={{
                        width: '100%',
                        height: '100%',
                        overflow: 'hidden',
                        pointerEvents: 'none',
                    }}
                    dangerouslySetInnerHTML={{
                        __html: sanitizedSvgMarkup
                    }}
                />
            </div>
        );
    }

    if (element.type === 'triangle') {
        const bgStyle = getBackgroundStyle(element);
        const bgStyleNoBorder = { ...bgStyle, border: 'none', borderWidth: 0 };

        return (
            <div key={element.id} data-element-id={element.id} className="absolute group" style={style} onDoubleClick={props.onDoubleClick}>
                <div style={{
                    width: '100%', height: '100%',
                    clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)',
                    ...bgStyleNoBorder
                }} />

                {(element.strokeWidth > 0 && element.stroke) && (
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
                        <polygon
                            points={`${element.w / 2},0 0,${element.h} ${element.w},${element.h}`}
                            fill="none"
                            stroke={element.stroke}
                            strokeWidth={element.strokeWidth}
                            strokeLinejoin="round"
                            strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : element.borderStyle === 'dotted' ? '2,2' : ''}
                        />
                    </svg>
                )}

                {(element.text || element.dataBinding) && (
                    <div className="absolute inset-0 flex" style={{
                        justifyContent: 'center',
                        alignItems: element.verticalAlign === 'top' ? 'flex-start' : element.verticalAlign === 'bottom' ? 'flex-end' : 'center',
                        paddingTop: element.verticalAlign === 'top' ? element.h / 3 : 0,
                        paddingBottom: element.verticalAlign === 'bottom' ? 5 : 0,
                        color: element.textColor,
                        fontFamily: fontFamily,
                        fontSize: element.fontSize,
                        fontWeight: element.fontWeight,
                        fontStyle: element.fontStyle,
                        textDecoration: element.textDecoration,
                        textDecorationColor: element.textColor,
                        textAlign: 'center',
                        whiteSpace: 'pre-wrap',
                        pointerEvents: 'none',
                        zIndex: 2
                    }}>
                        {resolveText(element.dataBinding ? `{{${element.dataBinding}}}` : (element.text || ""), contextNode, nodes)}
                    </div>
                )}


            </div>
        );
    }

    return (
        <div key={element.id} data-element-id={element.id} className="absolute group" style={style} onDoubleClick={props.onDoubleClick}>
            {(element.type === 'rect' || element.type === 'text') && (
                <div style={{
                    width: '100%', height: '100%',
                    ...getBackgroundStyle(element),
                    borderRadius: element.borderRadius,
                    position: 'absolute', top: 0, left: 0,
                }} />
            )}
            {element.type === 'ellipse' && (
                <div style={{
                    width: '100%', height: '100%',
                    ...getBackgroundStyle(element),
                    borderRadius: '50%',
                    position: 'absolute', top: 0, left: 0,
                }} />
            )}

            {(element.text || element.dataBinding) && (
                <div className="absolute flex" style={{
                    // Position at element origin with full height for vertical alignment
                    top: 0, left: 0,
                    height: '100%', // Required for vertical alignment to work
                    minWidth: '100%', // At least cover element width, but can grow for overflow
                    overflow: 'visible', // Allow text to visually overflow
                    justifyContent: element.align === 'left' ? 'flex-start' : element.align === 'right' ? 'flex-end' : 'center',
                    alignItems: element.verticalAlign === 'top' ? 'flex-start' : element.verticalAlign === 'bottom' ? 'flex-end' : 'center',
                    color: element.textColor,
                    fontFamily: fontFamily,
                    fontSize: element.fontSize,
                    lineHeight: 1.2, // Explicit line-height to match PDF rendering
                    fontWeight: element.fontWeight,
                    fontStyle: element.fontStyle,
                    textDecoration: element.textDecoration,
                    textDecorationColor: element.textColor,
                    textAlign: element.align || 'center',
                    whiteSpace: element.autoWidth ? 'pre' : 'pre-wrap',
                    pointerEvents: 'auto',
                    zIndex: 2,
                    opacity: isEditing ? 0 : 1
                }}>
                    {resolveText(element.dataBinding ? `{{${element.dataBinding}}}` : (element.text || ""), contextNode, nodes)}
                </div>
            )}


        </div>
    );
};
