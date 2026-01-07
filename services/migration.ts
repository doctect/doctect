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

/**
 * Current schema version. Increment this when making breaking changes.
 */
export const CURRENT_SCHEMA_VERSION = 1;

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

    // If already at current version, no migration needed
    if (version >= CURRENT_SCHEMA_VERSION) {
        return state as AppState;
    }

    console.log(`[Migration] Migrating from v${version} to v${CURRENT_SCHEMA_VERSION}`);

    let migratedState = state;

    // Apply migrations sequentially
    if (version < 1) {
        migratedState = migrateV0ToV1(migratedState);
        version = 1;
    }

    // Future migrations go here:
    // if (version < 2) {
    //     migratedState = migrateV1ToV2(migratedState);
    //     version = 2;
    // }

    console.log(`[Migration] Migration complete. Now at v${CURRENT_SCHEMA_VERSION}`);

    return migratedState as AppState;
}

/**
 * Utility to check if a state needs migration
 */
export function needsMigration(state: any): boolean {
    if (!state || typeof state !== 'object') return false;
    const version = state.schemaVersion ?? 0;
    return version < CURRENT_SCHEMA_VERSION;
}
