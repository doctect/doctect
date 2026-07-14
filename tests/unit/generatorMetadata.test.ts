import { describe, expect, it } from 'vitest';
import {
  generatorProvenanceEqual,
  normalizeGeneratorProvenance,
  validateGeneratorProvenance,
} from '../../shared/generatorMetadata.js';

const source = {
  formatVersion: 1 as const,
  templateScript: 'const café = "☕";\nreturn {};',
  hierarchyScript: 'return { nodes: {}, rootId: "root" };\n',
  generatedAt: '2026-07-13T12:00:00.000Z',
};

describe('generator provenance metadata', () => {
  it('preserves valid source byte-exactly and compares every field', () => {
    expect(validateGeneratorProvenance(source, { strictUnknownFields: true })).toEqual({
      ok: true,
      value: source,
    });
    expect(generatorProvenanceEqual(source, structuredClone(source))).toBe(true);
    expect(generatorProvenanceEqual(source, { ...source, templateScript: `${source.templateScript} ` })).toBe(false);
    expect(generatorProvenanceEqual(undefined, undefined)).toBe(true);
  });

  it('rejects unknown fields in strict mode', () => {
    expect(validateGeneratorProvenance({ ...source, extra: true }, { strictUnknownFields: true }).ok).toBe(false);
  });

  it('enforces UTF-8 script byte limits', () => {
    expect(validateGeneratorProvenance({ ...source, templateScript: 'x'.repeat(512 * 1024 + 1) }).ok).toBe(false);
    expect(validateGeneratorProvenance({
      ...source,
      templateScript: 'x'.repeat(512 * 1024),
      hierarchyScript: 'y'.repeat(512 * 1024 + 1),
    }).ok).toBe(false);
    expect(validateGeneratorProvenance({ ...source, templateScript: '☕'.repeat(174_763) }).ok).toBe(false);
  });

  it('normalizes absent metadata and detaches invalid metadata with a warning', () => {
    expect(normalizeGeneratorProvenance(undefined)).toEqual({});
    expect(normalizeGeneratorProvenance({ ...source, formatVersion: 2 })).toEqual({
      warning: 'Saved generator was detached: Unsupported generator format version.',
    });
  });
});
