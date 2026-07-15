import type { AppState } from '../types';

export type DocumentSnapshot = Pick<AppState,
    'nodes' | 'rootId' | 'variants' | 'activeVariantId' | 'schemaVersion'
    | 'generator' | 'selectedNodeId' | 'selectedNodeIds'
    | 'selectedTemplateId' | 'selectedTemplateIds' | 'selectedElementIds' | 'activeLayerId'>;

export const snapshotDocument = (state: AppState): DocumentSnapshot => structuredClone({
    nodes: state.nodes,
    rootId: state.rootId,
    variants: state.variants,
    activeVariantId: state.activeVariantId,
    schemaVersion: state.schemaVersion,
    generator: state.generator,
    selectedNodeId: state.selectedNodeId,
    selectedNodeIds: state.selectedNodeIds,
    selectedTemplateId: state.selectedTemplateId,
    selectedTemplateIds: state.selectedTemplateIds,
    selectedElementIds: state.selectedElementIds,
    activeLayerId: state.activeLayerId,
});

export const restoreDocument = (state: AppState, snapshot: DocumentSnapshot): AppState => ({
    ...state,
    ...structuredClone(snapshot),
});
