import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import ts from 'typescript';
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
const scriptKinds = new Map<string, ts.ScriptKind>([
  ['.cjs', ts.ScriptKind.JS],
  ['.js', ts.ScriptKind.JS],
  ['.jsx', ts.ScriptKind.JSX],
  ['.mjs', ts.ScriptKind.JS],
  ['.ts', ts.ScriptKind.TS],
  ['.tsx', ts.ScriptKind.TSX],
]);
const storageMutators = new Set(['setItem', 'removeItem', 'clear']);

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

const analyzeSource = (path: string, source: string): string[] => {
  const violations: string[] = [];
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

  const scriptKind = scriptKinds.get(extname(path));
  if (scriptKind === undefined) return violations;

  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const parseDiagnostics = (sourceFile as ts.SourceFile & {
    parseDiagnostics: readonly ts.Diagnostic[];
  }).parseDiagnostics;
  for (const diagnostic of parseDiagnostics) {
    const position = sourceFile.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
    violations.push(`${path}:${position.line + 1}: cannot parse source: ${message}`);
  }

  const initializers = new Map<string, ts.Expression>();
  const destructured = new Map<string, {
    receiver: ts.Expression;
    propertyName: ts.PropertyName;
  }>();

  const collectBindings = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
      if (node.initializer && ts.isIdentifier(node.name)) {
        initializers.set(node.name.text, node.initializer);
      } else if (node.initializer && ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          if (!ts.isIdentifier(element.name)) continue;
          const propertyName = element.propertyName ?? element.name;
          destructured.set(element.name.text, {
            receiver: node.initializer,
            propertyName,
          });
        }
      }
    }
    if (ts.isBinaryExpression(node)
      && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isIdentifier(node.left)) {
      initializers.set(node.left.text, node.right);
    }
    ts.forEachChild(node, collectBindings);
  };
  collectBindings(sourceFile);

  const unwrap = (input: ts.Expression): ts.Expression => {
    let expression = input;
    while (
      ts.isParenthesizedExpression(expression)
      || ts.isAsExpression(expression)
      || ts.isTypeAssertionExpression(expression)
      || ts.isNonNullExpression(expression)
      || ts.isSatisfiesExpression(expression)
    ) {
      expression = expression.expression;
    }
    return expression;
  };

  const staticString = (
    input: ts.Expression,
    seen = new Set<string>(),
  ): string | undefined => {
    const expression = unwrap(input);
    if (ts.isStringLiteralLike(expression)) return expression.text;
    if (ts.isIdentifier(expression)) {
      if (seen.has(expression.text)) return undefined;
      const initializer = initializers.get(expression.text);
      if (!initializer) return undefined;
      const nextSeen = new Set(seen);
      nextSeen.add(expression.text);
      return staticString(initializer, nextSeen);
    }
    if (ts.isBinaryExpression(expression)
      && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = staticString(expression.left, seen);
      const right = staticString(expression.right, seen);
      return left === undefined || right === undefined ? undefined : left + right;
    }
    if (ts.isTemplateExpression(expression)) {
      let value = expression.head.text;
      for (const span of expression.templateSpans) {
        const substitution = staticString(span.expression, seen);
        if (substitution === undefined) return undefined;
        value += substitution + span.literal.text;
      }
      return value;
    }
    return undefined;
  };

  const propertyName = (name: ts.PropertyName): string | undefined => {
    if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
      return name.text;
    }
    return ts.isComputedPropertyName(name) ? staticString(name.expression) : undefined;
  };

  const member = (input: ts.Expression): {
    receiver: ts.Expression;
    name: string | undefined;
  } | undefined => {
    const expression = unwrap(input);
    if (ts.isPropertyAccessExpression(expression)) {
      return { receiver: expression.expression, name: expression.name.text };
    }
    if (ts.isElementAccessExpression(expression) && expression.argumentExpression) {
      return {
        receiver: expression.expression,
        name: staticString(expression.argumentExpression),
      };
    }
    return undefined;
  };

  const isGlobalObject = (input: ts.Expression, seen = new Set<string>()): boolean => {
    const expression = unwrap(input);
    if (ts.isIdentifier(expression)) {
      if (expression.text === 'window' || expression.text === 'globalThis' || expression.text === 'self') {
        return true;
      }
      if (seen.has(expression.text)) return false;
      const initializer = initializers.get(expression.text);
      if (!initializer) return false;
      const nextSeen = new Set(seen);
      nextSeen.add(expression.text);
      return isGlobalObject(initializer, nextSeen);
    }
    return false;
  };

  const isLocalStorage = (input: ts.Expression, seen = new Set<string>()): boolean => {
    const expression = unwrap(input);
    if (ts.isIdentifier(expression)) {
      if (expression.text === 'localStorage') return true;
      if (seen.has(expression.text)) return false;
      const binding = destructured.get(expression.text);
      if (binding
        && propertyName(binding.propertyName) === 'localStorage'
        && isGlobalObject(binding.receiver, seen)) {
        return true;
      }
      const initializer = initializers.get(expression.text);
      if (!initializer) return false;
      const nextSeen = new Set(seen);
      nextSeen.add(expression.text);
      return isLocalStorage(initializer, nextSeen);
    }
    const accessed = member(expression);
    return Boolean(accessed?.name === 'localStorage' && isGlobalObject(accessed.receiver, seen));
  };

  interface CallableMember {
    method: string;
    localStorage: boolean;
  }

  const callableMember = (
    input: ts.Expression,
    seen = new Set<string>(),
  ): CallableMember | undefined => {
    const expression = unwrap(input);
    if (ts.isIdentifier(expression)) {
      if (seen.has(expression.text)) return undefined;
      const nextSeen = new Set(seen);
      nextSeen.add(expression.text);
      const binding = destructured.get(expression.text);
      if (binding) {
        const method = propertyName(binding.propertyName);
        return method === undefined
          ? undefined
          : { method, localStorage: isLocalStorage(binding.receiver) };
      }
      const initializer = initializers.get(expression.text);
      return initializer ? callableMember(initializer, nextSeen) : undefined;
    }
    if (ts.isCallExpression(expression)) {
      const called = member(expression.expression);
      if (called?.name === 'bind') return callableMember(called.receiver, seen);
      return undefined;
    }
    const accessed = member(expression);
    if (!accessed?.name) return undefined;
    return { method: accessed.name, localStorage: isLocalStorage(accessed.receiver) };
  };

  const invokedMember = (callee: ts.Expression): CallableMember | undefined => {
    const accessed = member(callee);
    if (accessed && (accessed.name === 'call' || accessed.name === 'apply')) {
      return callableMember(accessed.receiver);
    }
    return callableMember(callee);
  };

  const resolvesToRequire = (input: ts.Expression, seen = new Set<string>()): boolean => {
    const expression = unwrap(input);
    if (!ts.isIdentifier(expression)) return false;
    if (expression.text === 'require') return true;
    if (seen.has(expression.text)) return false;
    const initializer = initializers.get(expression.text);
    if (!initializer) return false;
    const nextSeen = new Set(seen);
    nextSeen.add(expression.text);
    return resolvesToRequire(initializer, nextSeen);
  };

  const isLegacyTypesModule = (specifier: string | undefined): boolean => {
    if (specifier === undefined) return false;
    const normalized = specifier.split(/[?#]/, 1)[0].replaceAll('\\', '/');
    const basename = normalized.slice(normalized.lastIndexOf('/') + 1);
    return /^legacyTypes(?:\..+)?$/.test(basename);
  };

  const importsAllowed = path.startsWith('services/localWorkspace/')
    || path === 'tests/helpers/localWorkspaceFixtures.ts';
  const localWorkspaceSource = path.startsWith('services/localWorkspace/');
  const productionSource = /^(?:pages|components|hooks|services)\//.test(path);
  const report = (node: ts.Node, message: string): void => {
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    violations.push(`${path}:${position.line + 1}: ${message}`);
  };
  const inspectModuleSpecifier = (node: ts.Node, expression: ts.Expression | undefined): void => {
    if (!importsAllowed && expression && isLegacyTypesModule(staticString(expression))) {
      report(node, 'imports local-workspace migration internals');
    }
  };

  const inspectNode = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      inspectModuleSpecifier(node, node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)) {
      inspectModuleSpecifier(node, node.moduleReference.expression);
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        inspectModuleSpecifier(node, node.arguments[0]);
      } else if (resolvesToRequire(node.expression)) {
        inspectModuleSpecifier(node, node.arguments[0]);
      }

      const invoked = invokedMember(node.expression);
      if (localWorkspaceSource && invoked && storageMutators.has(invoked.method)) {
        report(node, 'mutates storage during rollout epoch 1');
      }
      if (localWorkspaceSource && invoked?.method === 'createIndex') {
        report(node, 'creates an IndexedDB index');
      }
      if (productionSource && invoked?.method === 'clear' && invoked.localStorage) {
        report(node, 'clears all production local storage');
      }
    }
    ts.forEachChild(node, inspectNode);
  };
  inspectNode(sourceFile);

  return violations;
};

describe('local workspace static boundary', () => {
  it('confines legacy document storage and keeps IndexedDB schema index-free', { timeout: 15_000 }, () => {
    const violations = sourceRoots.flatMap(directory => sourceFiles(join(root, directory)))
      .flatMap(file => analyzeSource(repoPath(file), readFileSync(file, 'utf8')));

    expect(violations, `Workspace boundary violations:\n${violations.join('\n')}`).toEqual([]);
  });

  it.each([
    ['components/sideEffect.js', "import '../services/localWorkspace/legacyTypes.js';"],
    ['components/multiline.jsx', "const view = <div />;\nimport {\n  LEGACY_KEYS\n} from\n  '../services/localWorkspace/legacyTypes';"],
    ['components/importEquals.ts', "import legacy = require('../services/localWorkspace/legacyTypes.ts');"],
    ['components/dynamic.tsx', "const view: unknown = <div />;\nconst legacy = import(\n  '../services/localWorkspace/legacyTypes.js'\n);"],
    ['components/required.mjs', "const legacy = require('../services/localWorkspace/legacyTypes.mjs');"],
    ['components/required.cjs', "require('../services/localWorkspace/legacyTypes.cjs');"],
  ])('rejects every legacyTypes module form in %s', (path, source) => {
    expect(analyzeSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining('imports local-workspace migration internals'),
    ]));
  });

  it.each([
    [
      'services/localWorkspace/computed.ts',
      "const method = 'set' + 'Item'; const cache = supplied; cache[method]('preference', '1');",
    ],
    [
      'services/localWorkspace/aliased.ts',
      "const storageAlias = supplied; const erase = storageAlias['removeItem']; erase('preference');",
    ],
    [
      'services/localWorkspace/destructured.ts',
      'const { clear: wipe } = supplied; wipe();',
    ],
  ])('rejects aliased local-workspace mutators in %s', (path, source) => {
    expect(analyzeSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining('mutates storage during rollout epoch 1'),
    ]));
  });

  it.each([
    [
      'components/ComputedClear.tsx',
      "const name = 'local' + 'Storage'; const storage = window[name]; storage['cl' + 'ear']();",
    ],
    [
      'services/AliasedClear.mjs',
      "const storage = globalThis.localStorage; const { clear: wipe } = storage; wipe();",
    ],
  ])('rejects aliased production localStorage.clear in %s', (path, source) => {
    expect(analyzeSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining('clears all production local storage'),
    ]));
  });

  it('rejects computed createIndex aliases', () => {
    const violations = analyzeSource(
      'services/localWorkspace/schema.ts',
      "const create = store['create' + 'Index']; create('by-id', 'id');",
    );

    expect(violations).toEqual(expect.arrayContaining([
      expect.stringContaining('creates an IndexedDB index'),
    ]));
  });

  it('fails closed when a script source cannot be parsed', () => {
    expect(analyzeSource('components/Broken.tsx', 'const value = ;')).toEqual(expect.arrayContaining([
      expect.stringContaining('cannot parse source'),
    ]));
  });

  it('allows targeted production preference writes', () => {
    const source = `
      const storage = window['local' + 'Storage'];
      const setPreference = storage['set' + 'Item'];
      setPreference.call(storage, 'doctect_last_fontSize', '16');
      storage.removeItem('gallery-explainer-dismissed');
    `;

    expect(analyzeSource('components/Preferences.tsx', source)).toEqual([]);
  });
});
