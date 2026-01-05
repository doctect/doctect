
import React from 'react';
import { TemplateElement, AppNode, TraversalStep } from '../../types';
import { SelectionHandles } from './SelectionHandles';

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

    const getElementBounds = (el: TemplateElement) => {
        if (el.type === 'grid' && el.gridConfig) {
            const { cols, gapX, gapY, sourceType, sourceId, dataSliceStart, dataSliceCount, traversalPath } = el.gridConfig;
            let items: any[] = [];

            if (sourceType === 'current') {
                items = nodes[currentNodeId] ? [currentNodeId] : [];
                if (!traversalPath || traversalPath.length === 0) {
                    items = nodes[currentNodeId]?.children || [];
                }
            } else if (sourceType === 'specific' && sourceId) {
                items = [sourceId];
                if (!traversalPath || traversalPath.length === 0) {
                    items = nodes[sourceId]?.children || [];
                }
            }

            if (traversalPath && traversalPath.length > 0) {
                items = traverseGridData(items, traversalPath, 0, nodes);
            }

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

            return { w: totalW, h: totalH };
        }
        return { w: el.w, h: el.h };
    };

    const getBackgroundStyle = (el: TemplateElement): React.CSSProperties => {
        if (el.type === 'line') return {};
        const hasFill = el.fill || (el.fillType === 'pattern');
        const hasBorder = el.strokeWidth > 0;
        const strokeColor = el.stroke || '#000000';

        if (!hasFill && !hasBorder && el.type === 'text') return {};

        const bgStyle: React.CSSProperties = {
            backgroundColor: el.fillType === 'pattern' ? 'transparent' : (el.fill || 'transparent'),
            border: hasBorder ? `${el.strokeWidth}px ${el.borderStyle || 'solid'} ${strokeColor}` : undefined
        };

        if (hasBorder && el.borderStyle === 'double') {
            bgStyle.borderStyle = 'double';
            bgStyle.borderWidth = Math.max(3, el.strokeWidth);
        }

        if (el.fillType === 'pattern') {
            const color = el.fill || '#000000';
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

    const bounds = getElementBounds(element);
    const style: React.CSSProperties = {
        position: 'absolute',
        left: element.x, top: element.y,
        width: bounds.w,
        height: bounds.h,
        transform: `rotate(${element.rotation || 0}deg)`,
        opacity: element.opacity,
        zIndex: element.zIndex || 0,
        pointerEvents: (tool === 'select') ? 'auto' : 'none',
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

        return (
            <div key={element.id} data-element-id={element.id} className="absolute group border border-dashed border-slate-300" style={style}>
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

                    return (
                        <div key={idx} style={{
                            position: 'absolute', left: cx, top: cy, width: element.w, height: element.h,
                            ...getBackgroundStyle(element),
                            borderRadius: element.borderRadius || 0,
                            display: 'flex',
                            justifyContent: element.align === 'center' ? 'center' : element.align === 'right' ? 'flex-end' : 'flex-start',
                            alignItems: element.verticalAlign === 'top' ? 'flex-start' : element.verticalAlign === 'bottom' ? 'flex-end' : 'center',
                            fontSize: element.fontSize || 12,
                            color: element.textColor || '#000',
                            fontFamily: fontFamily,
                            fontWeight: element.fontWeight,
                            fontStyle: element.fontStyle,
                            textDecoration: element.textDecoration,
                            overflow: 'hidden'
                        }}><span className="truncate" style={{ padding: '0 1px' }}>{label}</span></div>
                    );
                })}
                {selected && <div className="absolute -inset-px border border-blue-500 pointer-events-none z-10" />}
                {showHandles && <SelectionHandles element={element} />}
            </div>
        );
    }

    if (element.type === 'line') {
        return (
            <div key={element.id} data-element-id={element.id} className="absolute group" style={style} onDoubleClick={props.onDoubleClick}>
                <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
                    {element.flip ? (
                        <line x1="0" y1="100%" x2="100%" y2="0" stroke={element.stroke} strokeWidth={element.strokeWidth} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : element.borderStyle === 'dotted' ? '2,2' : ''} />
                    ) : (
                        <line x1="0" y1="0" x2="100%" y2="100%" stroke={element.stroke} strokeWidth={element.strokeWidth} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : element.borderStyle === 'dotted' ? '2,2' : ''} />
                    )}
                </svg>
                {showHandles && <SelectionHandles element={element} />}
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

                {(element.strokeWidth > 0) && (
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
                        <polygon
                            points={`${element.w / 2},0 0,${element.h} ${element.w},${element.h}`}
                            fill="none"
                            stroke={element.stroke || 'transparent'}
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
                        textAlign: 'center',
                        whiteSpace: 'pre-wrap',
                        pointerEvents: 'none',
                        zIndex: 2
                    }}>
                        {resolveText(element.dataBinding ? `{{${element.dataBinding}}}` : (element.text || ""), contextNode, nodes)}
                    </div>
                )}

                {selected && <div className="absolute -inset-px border border-blue-500 pointer-events-none z-10" />}
                {showHandles && <SelectionHandles element={element} />}
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
                }} />
            )}

            {(element.text || element.dataBinding) && (
                <div className="absolute inset-0 flex" style={{
                    justifyContent: element.align === 'center' ? 'center' : element.align === 'right' ? 'flex-end' : 'flex-start',
                    alignItems: element.verticalAlign === 'top' ? 'flex-start' : element.verticalAlign === 'bottom' ? 'flex-end' : 'center',
                    color: element.textColor,
                    fontFamily: fontFamily,
                    fontSize: element.fontSize,
                    fontWeight: element.fontWeight,
                    fontStyle: element.fontStyle,
                    textDecoration: element.textDecoration,
                    textAlign: element.align || 'left',
                    whiteSpace: element.autoWidth ? 'pre' : 'pre-wrap',
                    pointerEvents: 'none',
                    zIndex: 2,
                    opacity: isEditing ? 0 : 1
                }}>
                    {resolveText(element.dataBinding ? `{{${element.dataBinding}}}` : (element.text || ""), contextNode, nodes)}
                </div>
            )}

            {selected && <div className="absolute -inset-px border border-blue-500 pointer-events-none z-10" />}
            {showHandles && <SelectionHandles element={element} />}
        </div>
    );
};
