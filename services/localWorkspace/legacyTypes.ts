export const LEGACY_KEYS = {
  projects: 'hype_projects',
  activeProject: 'hype_active_project',
  customPresets: 'hype_custom_presets',
  pendingImport: 'hype_import_pending',
} as const;

export const LEGACY_DOCUMENT_KEYS = [
  LEGACY_KEYS.projects,
  LEGACY_KEYS.activeProject,
  LEGACY_KEYS.customPresets,
  LEGACY_KEYS.pendingImport,
] as const;

export type LegacyDocumentKey = typeof LEGACY_DOCUMENT_KEYS[number];

export type LegacySnapshot = Record<LegacyDocumentKey, {
  present: boolean;
  raw: string | null;
}>;
