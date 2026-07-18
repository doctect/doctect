/**
 * JSON Schema Migration Service
 * 
 * This service handles migrating older JSON project files to the current schema.
 * Each version upgrade is handled by a dedicated migration function.
 * 
 * Migration Philosophy:
 * - Any JSON without schemaVersion is treated as version 0 (legacy)
 * - Migrations are applied sequentially (v0→v1→v2→...) 
 * - Each migration function only handles one version bump
 * - Old migrations are never removed to maintain upgrade paths from any version
 */

import { AppState } from '../types';
import { ensureTemplateLayers } from './layers';
import { normalizeTextOverflow } from './textOverflow';

/**
 * Current schema version. Increment this when making breaking changes.
 */
export const CURRENT_SCHEMA_VERSION = 10;

/**
 * Migration v0 → v1
 * 
 * Changes:
 * - Adds `autoWidth: false` to text elements that don't have the field
 *   (Prior to v1, text boxes with fixed width didn't have this field)
 */
function migrateV0ToV1(state: any): any {
    console.log('[Migration] Applying v0 → v1: Adding autoWidth to text elements');

    // Deep clone to avoid mutations
    const migrated = JSON.parse(JSON.stringify(state));

    // Migrate all templates
    if (migrated.templates) {
        Object.keys(migrated.templates).forEach(templateId => {
            const template = migrated.templates[templateId];
            if (template.elements && Array.isArray(template.elements)) {
                template.elements = template.elements.map((element: any) => {
                    // Add autoWidth: false to text elements that don't have it
                    if (element.type === 'text' && element.autoWidth === undefined) {
                        return { ...element, autoWidth: false };
                    }
                    return element;
                });
            }
        });
    }

    migrated.schemaVersion = 1;
    return migrated;
}

/**
 * Migration v1 → v2
 * 
 * Changes:
 * - Adds `templatePreviewNodeId` field for template preview node selection
 *   (New feature: users can select which node's data to use when previewing templates)
 */
function migrateV1ToV2(state: any): any {
    console.log('[Migration] Applying v1 → v2: Adding templatePreviewNodeId');

    // Deep clone to avoid mutations
    const migrated = JSON.parse(JSON.stringify(state));

    // Initialize templatePreviewNodeId if not present (optional field, undefined is valid)
    // No action needed since the field is optional - just bump version

    migrated.schemaVersion = 2;
    return migrated;
}

/**
 * Main migration function.
 * Takes a raw state object (possibly from an older version) and migrates it
 * to the current schema version.
 * 
 * @param state - Raw state object, possibly from localStorage or JSON import
 * @returns Migrated AppState at current schema version
 */
export function migrateState(state: any): AppState {
    if (!state || typeof state !== 'object') {
        throw new Error('Invalid state: expected an object');
    }

    // Determine current version (undefined or missing = version 0)
    let version = state.schemaVersion ?? 0;

    // Preserve unsupported future versions without rewriting their state.
    if (version > CURRENT_SCHEMA_VERSION) {
        return state as AppState;
    }

    console.log(`[Migration] Migrating from v${version} to v${CURRENT_SCHEMA_VERSION}`);

    let migratedState = state;

    // Apply migrations sequentially
    if (version < 1) {
        migratedState = migrateV0ToV1(migratedState);
        version = 1;
    }

    if (version < 2) {
        migratedState = migrateV1ToV2(migratedState);
        version = 2;
    }

    if (version < 3) {
        migratedState = migrateV2ToV3(migratedState);
        version = 3;
    }

    if (version < 4) {
        migratedState = migrateV3ToV4(migratedState);
        version = 4;
    }

    if (version < 5) {
        migratedState = migrateV4ToV5(migratedState);
        version = 5;
    }

    if (version < 6) {
        migratedState = migrateV5ToV6(migratedState);
        version = 6;
    }

    if (version < 7) {
        migratedState = migrateV6ToV7(migratedState);
        version = 7;
    }

    if (version < 8) {
        migratedState = migrateV7ToV8(migratedState);
        version = 8;
    }

    if (version < 9) {
        migratedState = migrateV8ToV9(migratedState);
        version = 9;
    }

    if (version < 10) {
        migratedState = migrateV9ToV10(migratedState);
        version = 10;
    }

    console.log(`[Migration] Migration complete. Now at v${CURRENT_SCHEMA_VERSION}`);

    return normalizeTextOverflow(migratedState as Record<string, any>) as AppState;
}

/**
 * Migration v2 → v3
 * 
 * Changes:
 * - Adds `transformOrigin` support (optional)
 * - Bumps schema version
 */
function migrateV2ToV3(state: any): any {
    console.log('[Migration] Applying v2 → v3: Bumping version for transform origin support');
    const migrated = JSON.parse(JSON.stringify(state));
    // Field is optional, no data transformation needed
    migrated.schemaVersion = 3;
    return migrated;
}

/**
 * Migration v3 → v4
 * 
 * Changes:
 * - Converts flat `templates` to `variants` structure
 * - Creates a "Default" variant containing existing templates
 * - Adds `activeVariantId` field
 */
function migrateV3ToV4(state: any): any {
    console.log('[Migration] Applying v3 → v4: Converting to variant structure');
    const migrated = JSON.parse(JSON.stringify(state));

    // Create default variant from existing templates
    const defaultVariant = {
        id: 'default',
        name: 'Default',
        templates: migrated.templates || {}
    };

    migrated.variants = { default: defaultVariant };
    migrated.activeVariantId = 'default';
    delete migrated.templates;  // Remove old field

    migrated.schemaVersion = 4;
    return migrated;
}

/**
 * Migration v4 → v5
 * 
 * Changes:
 * - Adds `selectedNodeIds` and `selectedTemplateIds` (Arrays) alongside singular selection
 */
function migrateV4ToV5(state: any): any {
    console.log('[Migration] Applying v4 → v5: Adding multi-select array fields');
    const migrated = JSON.parse(JSON.stringify(state));

    migrated.selectedNodeIds = migrated.selectedNodeId ? [migrated.selectedNodeId] : [];
    migrated.selectedTemplateIds = migrated.selectedTemplateId ? [migrated.selectedTemplateId] : [];
    
    migrated.schemaVersion = 5;
    return migrated;
}

/**
 * Migration v5 → v6
 * 
 * Changes:
 * - Adds `borderSides` support on TemplateElement (optional, defaults to all sides)
 * - Adds grid formatting options: gridBorderMode, header/first-column styling,
 *   alternating row/column colors on GridConfig (all optional)
 */
function migrateV5ToV6(state: any): any {
    console.log('[Migration] Applying v5 → v6: Adding border sides and grid formatting support');
    const migrated = JSON.parse(JSON.stringify(state));
    // All new fields are optional with sensible defaults, no data transformation needed
    migrated.schemaVersion = 6;
    return migrated;
}

/**
 * Migration v6 → v7
 * 
 * Changes:
 * - Grid elements: inherits outer border (stroke/strokeWidth/borderStyle) into
 *   gridBorderColor/gridBorderWidth/gridBorderStyle if not already set, so old
 *   grids that relied on element stroke for cell borders keep their appearance.
 * - Rect/text elements: creates borderSides from element stroke settings if not
 *   already set, so per-side border UI shows correct defaults.
 */
function migrateV6ToV7(state: any): any {
    console.log('[Migration] Applying v6 → v7: Inheriting border settings into grid cells and per-side borders');
    const migrated = JSON.parse(JSON.stringify(state));

    const migrateElements = (elements: any[]) => {
        if (!elements || !Array.isArray(elements)) return;
        elements.forEach((el: any) => {
            const stroke = el.stroke;
            const strokeWidth = Number(el.strokeWidth) || 0;
            const borderStyle = el.borderStyle || 'solid';

            // Grid elements: inherit outer border into grid cell border config
            if (el.type === 'grid' && el.gridConfig && strokeWidth > 0 && stroke) {
                const gc = el.gridConfig;
                if (gc.gridBorderColor === undefined) gc.gridBorderColor = stroke;
                if (gc.gridBorderWidth === undefined) gc.gridBorderWidth = strokeWidth;
                if (gc.gridBorderStyle === undefined) gc.gridBorderStyle = borderStyle;
            }

            // Rect/text elements: create borderSides from element stroke if not set
            if ((el.type === 'rect' || el.type === 'text') && !el.borderSides && strokeWidth > 0 && stroke) {
                const side = { width: strokeWidth, color: stroke, style: borderStyle };
                el.borderSides = { top: { ...side }, right: { ...side }, bottom: { ...side }, left: { ...side } };
            }
        });
    };

    // Migrate across all variants
    if (migrated.variants) {
        Object.keys(migrated.variants).forEach(variantId => {
            const variant = migrated.variants[variantId];
            if (variant.templates) {
                Object.keys(variant.templates).forEach(templateId => {
                    migrateElements(variant.templates[templateId]?.elements);
                });
            }
        });
    }
    // Also handle legacy flat templates structure
    if (migrated.templates) {
        Object.keys(migrated.templates).forEach(templateId => {
            migrateElements(migrated.templates[templateId]?.elements);
        });
    }

    migrated.schemaVersion = 7;
    return migrated;
}

/**
 * Migration v7 → v8
 *
 * Changes:
 * - Adds the named-layer system (Shape B): `PageTemplate.layers: Layer[]` plus a
 *   `layerId` tag on every `TemplateElement`. Elements stay in a flat array.
 * - Every template (across all variants AND the legacy flat `templates` structure)
 *   gets a single default layer { name: "Layer 1", order: 0, visible: true, locked: false }
 *   and all its elements are tagged with that layer's id.
 * - zIndex values are preserved untouched (it now means within-layer stacking, and with a
 *   single layer the migrated document renders identically). Idempotent.
 */
function migrateV7ToV8(state: any): any {
    console.log('[Migration] Applying v7 → v8: Adding layer system (default "Layer 1" per template)');
    const migrated = JSON.parse(JSON.stringify(state));

    const migrateTemplates = (templates: any) => {
        if (!templates || typeof templates !== 'object') return;
        Object.keys(templates).forEach(templateId => {
            const tpl = templates[templateId];
            if (tpl && typeof tpl === 'object') {
                templates[templateId] = ensureTemplateLayers(tpl);
            }
        });
    };

    // Migrate across all variants
    if (migrated.variants) {
        Object.values(migrated.variants).forEach((variant: any) => migrateTemplates(variant?.templates));
    }
    // Also handle legacy flat templates structure
    migrateTemplates(migrated.templates);

    migrated.schemaVersion = 8;
    return migrated;
}

/**
 * Migration v8 → v9
 *
 * Changes:
 * - Adds optional generator provenance.
 */
function migrateV8ToV9(state: any): any {
    console.log('[Migration] Applying v8 → v9: Adding optional generator provenance');
    const migrated = JSON.parse(JSON.stringify(state));
    migrated.schemaVersion = 9;
    return migrated;
}

/**
 * Migration v9 → v10
 *
 * Preserves legacy rendering while adding canonical text overflow settings.
 */
function migrateV9ToV10(state: any): any {
    console.log('[Migration] Applying v9 → v10: Adding text overflow settings');
    const migrated = JSON.parse(JSON.stringify(state));

    const migrateTemplates = (templates: any) => {
        if (!templates || typeof templates !== 'object') return;
        Object.values(templates).forEach((template: any) => {
            if (!Array.isArray(template?.elements)) return;
            template.elements.forEach((element: any) => {
                if (element.type === 'text') {
                    element.textOverflow = 'visible';
                    element.textWrap = true;
                } else if (element.type === 'grid') {
                    element.textOverflow = 'ellipsis';
                    element.textWrap = false;
                }
            });
        });
    };

    if (migrated.variants && typeof migrated.variants === 'object') {
        Object.values(migrated.variants).forEach((variant: any) => migrateTemplates(variant?.templates));
    }
    migrateTemplates(migrated.templates);

    migrated.schemaVersion = 10;
    return migrated;
}

/**
 * Utility to check if a state needs migration
 */
export function needsMigration(state: any): boolean {
    if (!state || typeof state !== 'object') return false;
    const version = state.schemaVersion ?? 0;
    return version < CURRENT_SCHEMA_VERSION;
}
