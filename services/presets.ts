
import { AppState } from "../types";
import { migrateState, CURRENT_SCHEMA_VERSION } from "./migration";
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

const STORAGE_KEY = 'hype_custom_presets';

export const saveCustomPreset = (preset: PresetDefinition): boolean => {
    try {
        const existing = getCustomPresets();
        const filtered = existing.filter(p => p.id !== preset.id);
        const updated = [...filtered, preset];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return true;
    } catch (e) {
        console.error("Failed to save custom preset", e);
        return false;
    }
};

export const deleteCustomPreset = (id: string) => {
    try {
        const existing = getCustomPresets();
        const updated = existing.filter(p => p.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
        console.error("Failed to delete custom preset", e);
    }
};

export const getCustomPresets = (): PresetDefinition[] => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const presets = JSON.parse(stored);
            // Migrate each custom preset's initialState to current schema
            return presets.map((preset: PresetDefinition) => {
                if (preset.initialState) {
                    return {
                        ...preset,
                        initialState: migrateState(preset.initialState)
                    };
                }
                return preset;
            });
        }
    } catch (e) {
        console.warn("Failed to load custom presets", e);
    }
    return [];
};

// Helper to hydrate the loaded JSON into a full AppState
const loadPreset = (data: any): AppState => {
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
        nodes: data.nodes,
        rootId: data.rootId,
        viewMode: 'hierarchy',
        selectedNodeId: data.rootId,
        selectedTemplateId: firstTemplateId,
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

    // Pass through templates or variants as-is - migration will handle conversion
    if (hasTemplates) {
        baseState.templates = data.templates;
        baseState.schemaVersion = 3; // Force v3 -> v4 migration
    } else {
        baseState.variants = data.variants;
        baseState.activeVariantId = data.activeVariantId || Object.keys(data.variants)[0];
        baseState.schemaVersion = CURRENT_SCHEMA_VERSION;
    }

    // Migrate to ensure all elements have required fields
    return migrateState(baseState);
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
