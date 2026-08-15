
import { AppState } from "../types";
import { CURRENT_SCHEMA_VERSION } from "./migration";
import { loadProjectState } from "./loadProjectState";
import { ensureTemplateLayers } from "./layers";
import { normalizeTextPaddingTemplate } from "./textPadding";
import { normalizeTextOverflowTemplate } from "./textOverflow";
import { blankPresetData } from "./blank_preset";
import { notebookPresetData } from "./notebook_preset";
import { plannerPresetData } from "./planner_preset";

export type ProjectPreset = 'blank' | 'notebook' | 'planner_2026' | string;

export interface PresetDefinition {
    id: ProjectPreset;
    title: string;
    desc: string;
    icon?: any; // Component type
    color?: string;
    isCustom?: boolean;
    initialState?: AppState; // For custom presets
}

// Helper to hydrate the loaded JSON into a full AppState.
// Exported so tests can drive the same variants-shaped path the create*Project fns use.
export const loadPreset = (data: any): AppState => {
    // Basic validation - accept either old templates format or new variants format
    const hasTemplates = data.templates && typeof data.templates === 'object';
    const hasVariants = data.variants && typeof data.variants === 'object';
    if (!data.nodes || (!hasTemplates && !hasVariants) || !data.rootId) {
        console.error("Invalid preset data:", data);
        throw new Error("Preset data is missing required fields");
    }

    // Determine first template ID for selectedTemplateId
    const firstTemplateId = hasVariants
        ? Object.keys(data.variants[Object.keys(data.variants)[0]]?.templates || {})[0] || 'default'
        : Object.keys(data.templates)[0] || 'year';

    // Build base state - let migration handle conversion from templates to variants
    const baseState: any = {
        nodes: structuredClone(data.nodes),
        rootId: data.rootId,
        viewMode: 'hierarchy',
        selectedNodeId: data.rootId,
        selectedNodeIds: [data.rootId],
        selectedTemplateId: firstTemplateId,
        selectedTemplateIds: [firstTemplateId],
        selectedElementIds: [],
        scale: 0.8,
        tool: 'select',
        showJsonModal: false,
        showNodeSelector: false,
        nodeSelectorMode: 'grid_source',
        editingElementId: null,
        sidebarWidth: 288,
        propertiesPanelWidth: 320,
        snapToGrid: false,
        showGrid: false,
        clipboard: [],
    };

    const declaredVersion = Object.hasOwn(data, 'schemaVersion') ? data.schemaVersion : undefined;
    if (Number.isInteger(declaredVersion)) {
        return loadProjectState({
            ...baseState,
            ...(hasTemplates ? { templates: structuredClone(data.templates) } : {}),
            ...(hasVariants ? {
                variants: structuredClone(data.variants),
                activeVariantId: data.activeVariantId || Object.keys(data.variants)[0],
            } : {}),
            schemaVersion: declaredVersion,
        }).state;
    }

    const variants = hasVariants
        ? structuredClone(data.variants)
        : { default: { id: 'default', name: 'Default', templates: structuredClone(data.templates) } };
    const current = {
        ...baseState,
        variants,
        activeVariantId: data.activeVariantId || Object.keys(variants)[0],
        schemaVersion: CURRENT_SCHEMA_VERSION,
    };
    for (const variant of Object.values<any>(current.variants)) {
        for (const [templateId, template] of Object.entries<any>(variant.templates)) {
            variant.templates[templateId] = normalizeTextPaddingTemplate(
                normalizeTextOverflowTemplate(ensureTemplateLayers(template)),
            );
        }
    }
    return current as AppState;
};

// --- PRESET 1: BLANK PROJECT ---
export const createBlankProject = (): AppState => {
    return loadPreset(blankPresetData);
};

// --- PRESET 2: SIMPLE NOTEBOOK ---
export const createNotebookProject = (): AppState => {
    return loadPreset(notebookPresetData);
};

// --- PRESET 3: 2026 PLANNER (STARTER) ---
export const createPlannerProject = (): AppState => {
    return loadPreset(plannerPresetData);
};
