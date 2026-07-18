import type { AppNode, TemplateElement } from '../types';

const evaluateMath = (expr: string | number, data: Record<string, string>): number => {
    const str = String(expr).trim();
    if (!str) return 0;
    if (/^-?\d+$/.test(str)) return parseInt(str, 10);
    const plusIdx = str.indexOf('+');
    if (plusIdx > -1) {
        return evaluateMath(str.substring(0, plusIdx).trim(), data)
            + evaluateMath(str.substring(plusIdx + 1).trim(), data);
    }
    const minusIdx = str.lastIndexOf('-');
    if (minusIdx > 0) {
        const previous = str.charAt(minusIdx - 1);
        if (previous !== '+' && previous !== '-') {
            return evaluateMath(str.substring(0, minusIdx).trim(), data)
                - evaluateMath(str.substring(minusIdx + 1).trim(), data);
        }
    }
    const value = data[str];
    return value !== undefined && value !== '' ? parseInt(value, 10) : 0;
};

const findChildReferrerNode = (
    currentNode: AppNode,
    allNodes: Record<string, AppNode>,
    startIndexValue: string | number,
    countValue: string | number,
    typeFilter?: string,
): AppNode | undefined => {
    const start = evaluateMath(startIndexValue, currentNode.data || {});
    const count = evaluateMath(countValue, currentNode.data || {});
    const direction = count >= 0 ? 1 : -1;
    for (let index = 0; index < Math.abs(count); index += 1) {
        const childIndex = start + index * direction;
        if (childIndex < 0) continue;
        const targetChildId = currentNode.children?.[childIndex];
        if (!targetChildId) continue;
        const referrers = Object.values(allNodes).filter(node => node.referenceId === targetChildId);
        let selected: AppNode | undefined;
        if (typeFilter?.trim()) {
            selected = referrers.find(referrer => {
                const parent = referrer.parentId ? allNodes[referrer.parentId] : undefined;
                return parent?.type === typeFilter;
            });
        }
        selected ??= referrers[0];
        if (selected?.parentId) return allNodes[selected.parentId];
    }
    return undefined;
};

const getContextNodes = (
    startNode: AppNode,
    nodes: Record<string, AppNode>,
): AppNode[] => {
    const result: AppNode[] = [];
    const seen = new Set<string>();
    const add = (node: AppNode | undefined) => {
        if (node && !seen.has(node.id)) {
            seen.add(node.id);
            result.push(node);
        }
    };
    let current: AppNode | undefined = startNode;
    while (current) {
        add(current);
        current = current.parentId ? nodes[current.parentId] : undefined;
    }
    if (startNode.referenceId && nodes[startNode.referenceId]) {
        current = nodes[startNode.referenceId];
        while (current) {
            add(current);
            current = current.parentId ? nodes[current.parentId] : undefined;
        }
    }
    const targets = [startNode.id];
    if (startNode.referenceId) targets.push(startNode.referenceId);
    Object.values(nodes)
        .filter(node => node.referenceId && targets.includes(node.referenceId))
        .forEach(referrer => {
            let ancestor: AppNode | undefined = referrer;
            while (ancestor) {
                add(ancestor);
                ancestor = ancestor.parentId ? nodes[ancestor.parentId] : undefined;
            }
        });
    startNode.children.forEach(childId => add(nodes[childId]));
    if (startNode.referenceId && nodes[startNode.referenceId]) {
        nodes[startNode.referenceId].children.forEach(childId => add(nodes[childId]));
    }
    return result;
};

export function resolveElementPreviewText(
    element: Pick<TemplateElement, 'text' | 'dataBinding'>,
    node: AppNode | undefined,
    nodes: Record<string, AppNode>,
): string {
    let content = element.dataBinding ? `{{${element.dataBinding}}}` : (element.text || '');
    if (!content.includes('{{') || !node) return content;
    content = content.replace(
        /\{\{child_referrer:([^:]+):([^:]+):([^:]*):([^}]+)\}\}/g,
        (_match, start, count, typeFilter, field) => {
            const parent = findChildReferrerNode(node, nodes, start, count, typeFilter);
            if (parent) {
                if (field === 'title') return parent.title;
                if (parent.data?.[field] !== undefined) return parent.data[field];
            }
            return '';
        },
    );
    const contextNodes = getContextNodes(node, nodes);
    return content.replace(/\{\{([^}]+)\}\}/g, (_match, key) => {
        const field = key.trim();
        for (const contextNode of contextNodes) {
            if (field === 'title') return contextNode.title;
            if (contextNode.data?.[field] !== undefined) return contextNode.data[field];
        }
        return '';
    });
}
