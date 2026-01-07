
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
    // Basic validation
    if (!data.nodes || !data.templates || !data.rootId) {
        console.error("Invalid preset data:", data);
        throw new Error("Preset data is missing required fields");
    }

    const baseState: AppState = {
        nodes: data.nodes,
        rootId: data.rootId,
        templates: data.templates,
        viewMode: 'hierarchy',
        selectedNodeId: data.rootId,
        selectedTemplateId: Object.keys(data.templates)[0] || 'year',
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
        schemaVersion: CURRENT_SCHEMA_VERSION
    };

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
