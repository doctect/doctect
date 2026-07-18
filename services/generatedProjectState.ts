import type { AppState } from '../types';
import { resolveActiveLayerId } from './layers';
import { createBlankProject } from './presets';
import type { GeneratedProject } from './validateGeneratedProject';
import type { GeneratorSourceDraft } from './generatorVisualPreview';
import { CURRENT_SCHEMA_VERSION } from './migration';

export function createGeneratedAppState(
  base: AppState,
  project: GeneratedProject,
  source: GeneratorSourceDraft,
  generatedAt: string,
): AppState {
  const rootTemplateId = project.nodes[project.rootId]?.type;
  const rootTemplate = project.variants[project.activeVariantId]?.templates[rootTemplateId];
  return {
    ...structuredClone(base),
    nodes: structuredClone(project.nodes),
    rootId: project.rootId,
    variants: structuredClone(project.variants),
    activeVariantId: project.activeVariantId,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    scale: createBlankProject().scale,
    generator: { ...source, generatedAt },
    selectedNodeId: project.rootId,
    selectedNodeIds: [project.rootId],
    selectedTemplateId: '',
    selectedTemplateIds: [],
    selectedElementIds: [],
    templatePreviewNodeId: project.rootId,
    activeLayerId: rootTemplate ? resolveActiveLayerId(rootTemplate) : '',
    clipboard: [],
    viewMode: 'hierarchy',
    showJsonModal: false,
  };
}
