import { AppNode, TemplateElement, TraversalStep } from '../../types';

export const traverseGridData = (
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

export const getElementBounds = (
    el: TemplateElement,
    nodes: Record<string, AppNode>,
    currentNodeId: string
): { w: number; h: number } => {
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
