import type { AppState } from '../types';
import { migrateState } from './migration';
import { normalizeGeneratorProvenance } from '../shared/generatorMetadata.js';

export interface ProjectLoadResult { state: AppState; warnings: string[] }

export const loadProjectState = (raw: unknown): ProjectLoadResult => {
  const migrated = migrateState(raw);
  const normalized = normalizeGeneratorProvenance((migrated as AppState).generator);
  if (!normalized.warning) return { state: { ...migrated, ...(normalized.generator ? { generator: normalized.generator } : {}) } as AppState, warnings: [] };
  const state = { ...migrated } as AppState;
  delete state.generator;
  return { state, warnings: [normalized.warning] };
};
