import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const sourceRoots = ['pages', 'components', 'hooks', 'services', 'docs-capture', 'tests'];
const sourceExtensions = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.jsx',
  '.json',
  '.md',
  '.mjs',
  '.scss',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);
const excludedDirectories = new Set([
  '.claude',
  '.worktrees',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
]);
const legacyKeys = [
  ['hype', 'projects'].join('_'),
  ['hype', 'active', 'project'].join('_'),
  ['hype', 'custom', 'presets'].join('_'),
  ['hype', 'import', 'pending'].join('_'),
];
const allowed = new Set([
  'services/localWorkspace/legacyTypes.ts',
  'tests/e2e/fixtures/localWorkspaceMigration.js',
]);

const sourceFiles = (directory: string): string[] => readdirSync(directory, {
  withFileTypes: true,
}).flatMap(entry => {
  const path = join(directory, entry.name);
  if (entry.isDirectory()) {
    return excludedDirectories.has(entry.name) ? [] : sourceFiles(path);
  }
  return entry.isFile() && sourceExtensions.has(extname(entry.name)) ? [path] : [];
});

const repoPath = (path: string): string => relative(root, path).split(sep).join('/');

describe('local workspace static boundary', () => {
  it('confines legacy document storage and keeps IndexedDB schema index-free', () => {
    const violations: string[] = [];

    for (const file of sourceRoots.flatMap(directory => sourceFiles(join(root, directory)))) {
      const path = repoPath(file);
      const source = readFileSync(file, 'utf8');
      const lines = source.split('\n');

      if (!allowed.has(path)) {
        for (const [index, line] of lines.entries()) {
          for (const key of legacyKeys) {
            if (line.includes(key)) {
              violations.push(`${path}:${index + 1}: exact legacy document key ${key}`);
            }
          }
        }
      }

      if (
        !path.startsWith('services/localWorkspace/')
        && path !== 'tests/helpers/localWorkspaceFixtures.ts'
      ) {
        for (const [index, line] of lines.entries()) {
          if (/\b(?:from|import\s*\()\s*['"][^'"]*legacyTypes(?:\.[^'"]*)?['"]/.test(line)) {
            violations.push(`${path}:${index + 1}: imports local-workspace migration internals`);
          }
        }
      }

      if (path.startsWith('services/localWorkspace/')) {
        for (const [index, line] of lines.entries()) {
          if (/\b(?:legacyStorage|storage|localStorage)\s*\.\s*(?:setItem|removeItem|clear)\s*\(/.test(line)) {
            violations.push(`${path}:${index + 1}: mutates legacy storage during rollout epoch 1`);
          }
          if (/\.createIndex\s*\(/.test(line)) {
            violations.push(`${path}:${index + 1}: creates an IndexedDB index`);
          }
        }
      }

      if (/^(?:pages|components|hooks|services)\//.test(path)) {
        for (const [index, line] of lines.entries()) {
          if (/\b(?:window\.)?localStorage\s*\.\s*clear\s*\(/.test(line)) {
            violations.push(`${path}:${index + 1}: clears all production local storage`);
          }
        }
      }
    }

    expect(violations, `Workspace boundary violations:\n${violations.join('\n')}`).toEqual([]);
  });
});
