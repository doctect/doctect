import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const sourceRoots = ['pages', 'components', 'hooks', 'services', 'docs-capture', 'tests'];
const sourceExtensions = new Set([
  '.cjs',
  '.cts',
  '.css',
  '.html',
  '.js',
  '.jsx',
  '.json',
  '.md',
  '.mjs',
  '.mts',
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
  ['.cts', ts.ScriptKind.TS],
  ['.js', ts.ScriptKind.JS],
  ['.jsx', ts.ScriptKind.JSX],
  ['.mjs', ts.ScriptKind.JS],
  ['.mts', ts.ScriptKind.TS],
  ['.ts', ts.ScriptKind.TS],
  ['.tsx', ts.ScriptKind.TSX],
]);
const storageMutators = new Set(['setItem', 'removeItem', 'clear']);
const keyedStorageMethods = new Set(['getItem', 'setItem', 'removeItem']);

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

interface SourceInput {
  path: string;
  source: string;
}

type OriginValue = {
  kind: 'expression';
  expression: ts.Expression;
} | {
  kind: 'member';
  receiver: ts.Expression;
  propertyName: ts.PropertyName;
};

interface Origin {
  position: number;
  value: OriginValue;
}

interface MemberCandidate {
  receiver: ts.Expression;
  name: string;
}

interface PositionedExpression {
  expression: ts.Expression;
  position: number;
}

interface CallableMember {
  method: string;
  localStorage: boolean;
  boundArguments: PositionedExpression[];
}

interface InvokedMember extends CallableMember {
  invocation: 'direct' | 'call' | 'apply';
}

type ResolutionTrail = Map<ts.Symbol, Set<number>>;

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

const analyzeSources = (inputs: readonly SourceInput[]): Map<string, string[]> => {
  const results = new Map(inputs.map(input => [input.path, [] as string[]]));
  for (const input of inputs) {
    if (allowed.has(input.path)) continue;
    for (const [index, line] of input.source.split('\n').entries()) {
      for (const key of legacyKeys) {
        if (line.includes(key)) {
          results.get(input.path)!.push(
            `${input.path}:${index + 1}: exact legacy document key ${key}`,
          );
        }
      }
    }
  }

  const scripts = inputs.filter(input => scriptKinds.has(extname(input.path)));
  if (scripts.length === 0) return results;

  const compilerOptions: ts.CompilerOptions = {
    allowJs: true,
    checkJs: false,
    module: ts.ModuleKind.NodeNext,
    moduleDetection: ts.ModuleDetectionKind.Force,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    noLib: true,
    noResolve: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.Latest,
    types: [],
  };
  const scriptsByFile = new Map(scripts.map(input => [join(root, input.path), input]));
  const host: ts.CompilerHost = {
    fileExists: fileName => scriptsByFile.has(fileName),
    getCanonicalFileName: fileName => fileName,
    getCurrentDirectory: () => root,
    getDefaultLibFileName: () => 'lib.d.ts',
    getNewLine: () => '\n',
    getSourceFile(fileName, languageVersion) {
      const input = scriptsByFile.get(fileName);
      if (!input) return undefined;
      return ts.createSourceFile(
        fileName,
        input.source,
        languageVersion,
        true,
        scriptKinds.get(extname(input.path)),
      );
    },
    readFile: fileName => scriptsByFile.get(fileName)?.source,
    useCaseSensitiveFileNames: () => true,
    writeFile: () => undefined,
  };
  const program = ts.createProgram({
    rootNames: [...scriptsByFile.keys()],
    options: compilerOptions,
    host,
  });
  const checker = program.getTypeChecker();
  const origins = new Map<ts.Symbol, Origin[]>();

  const addOrigin = (identifier: ts.Identifier, origin: Origin): void => {
    const symbol = checker.getSymbolAtLocation(identifier);
    if (!symbol) return;
    const existing = origins.get(symbol);
    if (existing) existing.push(origin);
    else origins.set(symbol, [origin]);
  };

  const addBindingOrigins = (
    pattern: ts.ObjectBindingPattern,
    receiver: ts.Expression,
    position: number,
  ): void => {
    for (const element of pattern.elements) {
      if (element.dotDotDotToken || !ts.isIdentifier(element.name)) continue;
      addOrigin(element.name, {
        position,
        value: {
          kind: 'member',
          receiver,
          propertyName: element.propertyName ?? element.name,
        },
      });
      if (element.initializer) {
        addOrigin(element.name, {
          position,
          value: { kind: 'expression', expression: element.initializer },
        });
      }
    }
  };

  const assignmentTarget = (input: ts.Expression): ts.Identifier | undefined => {
    const target = unwrap(input);
    if (ts.isIdentifier(target)) return target;
    if (ts.isBinaryExpression(target)
      && target.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isIdentifier(unwrap(target.left))) {
      return unwrap(target.left) as ts.Identifier;
    }
    return undefined;
  };

  const addAssignmentOrigins = (
    pattern: ts.ObjectLiteralExpression,
    receiver: ts.Expression,
    position: number,
  ): void => {
    for (const property of pattern.properties) {
      if (ts.isPropertyAssignment(property)) {
        const target = assignmentTarget(property.initializer);
        if (!target) continue;
        addOrigin(target, {
          position,
          value: { kind: 'member', receiver, propertyName: property.name },
        });
      } else if (ts.isShorthandPropertyAssignment(property)) {
        addOrigin(property.name, {
          position,
          value: { kind: 'member', receiver, propertyName: property.name },
        });
      }
    }
  };

  const collectOrigins = (node: ts.Node): void => {
    if ((ts.isVariableDeclaration(node) || ts.isParameter(node)) && node.initializer) {
      if (ts.isIdentifier(node.name)) {
        addOrigin(node.name, {
          position: node.end,
          value: { kind: 'expression', expression: node.initializer },
        });
      } else if (ts.isObjectBindingPattern(node.name)) {
        addBindingOrigins(node.name, node.initializer, node.end);
      }
    } else if (ts.isBinaryExpression(node)
      && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const left = unwrap(node.left);
      if (ts.isIdentifier(left)) {
        addOrigin(left, {
          position: node.end,
          value: { kind: 'expression', expression: node.right },
        });
      } else if (ts.isObjectLiteralExpression(left)) {
        addAssignmentOrigins(left, node.right, node.end);
      }
    }
    ts.forEachChild(node, collectOrigins);
  };

  for (const fileName of scriptsByFile.keys()) {
    const sourceFile = program.getSourceFile(fileName);
    if (sourceFile) collectOrigins(sourceFile);
  }

  const isUnshadowedGlobal = (
    identifier: ts.Identifier,
    symbol: ts.Symbol | undefined,
    names: ReadonlySet<string>,
  ): boolean => names.has(identifier.text) && !symbol?.declarations?.some(declaration => (
    scriptsByFile.has(declaration.getSourceFile().fileName)
  ));

  const withSymbolOrigins = <T>(
    symbol: ts.Symbol,
    atPosition: number,
    trail: ResolutionTrail,
    resolve: (origin: Origin, trail: ResolutionTrail) => readonly T[],
  ): T[] => {
    const positions = trail.get(symbol) ?? new Set<number>();
    if (positions.has(atPosition)) return [];
    positions.add(atPosition);
    trail.set(symbol, positions);
    try {
      return (origins.get(symbol) ?? [])
        .filter(origin => origin.position <= atPosition)
        .flatMap(origin => resolve(origin, trail));
    } finally {
      positions.delete(atPosition);
      if (positions.size === 0) trail.delete(symbol);
    }
  };

  const staticStrings = (
    input: ts.Expression,
    atPosition: number,
    trail: ResolutionTrail = new Map(),
  ): Set<string> => {
    const expression = unwrap(input);
    if (ts.isStringLiteralLike(expression)) return new Set([expression.text]);
    if (ts.isIdentifier(expression)) {
      const symbol = checker.getSymbolAtLocation(expression);
      if (!symbol) return new Set();
      return new Set(withSymbolOrigins(symbol, atPosition, trail, (origin, nextTrail) => (
        origin.value.kind === 'expression'
          ? [...staticStrings(origin.value.expression, origin.position, nextTrail)]
          : []
      )));
    }
    if (ts.isBinaryExpression(expression)
      && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const values = new Set<string>();
      for (const left of staticStrings(expression.left, atPosition, trail)) {
        for (const right of staticStrings(expression.right, atPosition, trail)) {
          values.add(left + right);
        }
      }
      return values;
    }
    if (ts.isTemplateExpression(expression)) {
      let values = new Set([expression.head.text]);
      for (const span of expression.templateSpans) {
        const next = new Set<string>();
        for (const prefix of values) {
          for (const substitution of staticStrings(span.expression, atPosition, trail)) {
            next.add(prefix + substitution + span.literal.text);
          }
        }
        values = next;
      }
      return values;
    }
    if (ts.isConditionalExpression(expression)) {
      return new Set([
        ...staticStrings(expression.whenTrue, atPosition, trail),
        ...staticStrings(expression.whenFalse, atPosition, trail),
      ]);
    }
    return new Set();
  };

  const propertyNames = (
    name: ts.PropertyName,
    atPosition: number,
    trail: ResolutionTrail = new Map(),
  ): Set<string> => {
    if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
      return new Set([name.text]);
    }
    return ts.isComputedPropertyName(name)
      ? staticStrings(name.expression, atPosition, trail)
      : new Set();
  };

  const memberCandidates = (
    input: ts.Expression,
    atPosition: number,
    trail: ResolutionTrail = new Map(),
  ): MemberCandidate[] => {
    const expression = unwrap(input);
    if (ts.isPropertyAccessExpression(expression)) {
      return [{ receiver: expression.expression, name: expression.name.text }];
    }
    if (ts.isElementAccessExpression(expression) && expression.argumentExpression) {
      return [...staticStrings(expression.argumentExpression, atPosition, trail)]
        .map(name => ({ receiver: expression.expression, name }));
    }
    return [];
  };

  const isGlobalObject = (
    input: ts.Expression,
    atPosition: number,
    trail: ResolutionTrail = new Map(),
  ): boolean => {
    const expression = unwrap(input);
    if (!ts.isIdentifier(expression)) return false;
    const symbol = checker.getSymbolAtLocation(expression);
    if (isUnshadowedGlobal(
      expression,
      symbol,
      new Set(['window', 'globalThis', 'self']),
    )) return true;
    if (!symbol) return false;
    return withSymbolOrigins(symbol, atPosition, trail, (origin, nextTrail) => (
      origin.value.kind === 'expression'
        && isGlobalObject(origin.value.expression, origin.position, nextTrail)
        ? [true]
        : []
    )).length > 0;
  };

  const isLocalStorage = (
    input: ts.Expression,
    atPosition: number,
    trail: ResolutionTrail = new Map(),
  ): boolean => {
    const expression = unwrap(input);
    if (ts.isIdentifier(expression)) {
      const symbol = checker.getSymbolAtLocation(expression);
      if (isUnshadowedGlobal(expression, symbol, new Set(['localStorage']))) return true;
      if (!symbol) return false;
      return withSymbolOrigins(symbol, atPosition, trail, (origin, nextTrail) => {
        if (origin.value.kind === 'expression') {
          return isLocalStorage(origin.value.expression, origin.position, nextTrail) ? [true] : [];
        }
        const names = propertyNames(origin.value.propertyName, origin.position, nextTrail);
        return names.has('localStorage')
          && isGlobalObject(origin.value.receiver, origin.position, nextTrail)
          ? [true]
          : [];
      }).length > 0;
    }
    return memberCandidates(expression, atPosition, trail).some(member => (
      member.name === 'localStorage'
      && isGlobalObject(member.receiver, atPosition, trail)
    ));
  };

  const callableMembers = (
    input: ts.Expression,
    atPosition: number,
    trail: ResolutionTrail = new Map(),
  ): CallableMember[] => {
    const expression = unwrap(input);
    if (ts.isIdentifier(expression)) {
      const symbol = checker.getSymbolAtLocation(expression);
      if (!symbol) return [];
      return withSymbolOrigins(symbol, atPosition, trail, (origin, nextTrail) => {
        if (origin.value.kind === 'expression') {
          return callableMembers(origin.value.expression, origin.position, nextTrail);
        }
        const memberOrigin = origin.value;
        return [...propertyNames(memberOrigin.propertyName, origin.position, nextTrail)].map(method => ({
          method,
          localStorage: isLocalStorage(memberOrigin.receiver, origin.position, nextTrail),
          boundArguments: [],
        }));
      });
    }
    if (ts.isCallExpression(expression)) {
      const bound = memberCandidates(expression.expression, atPosition, trail)
        .filter(member => member.name === 'bind');
      const boundArguments = expression.arguments.slice(1).map(argument => ({
        expression: argument,
        position: expression.end,
      }));
      return bound.flatMap(member => callableMembers(member.receiver, atPosition, trail)
        .map(callable => ({
          ...callable,
          boundArguments: [...callable.boundArguments, ...boundArguments],
        })));
    }
    return memberCandidates(expression, atPosition, trail).map(member => ({
      method: member.name,
      localStorage: isLocalStorage(member.receiver, atPosition, trail),
      boundArguments: [],
    }));
  };

  const invokedMembers = (call: ts.CallExpression): InvokedMember[] => {
    const atPosition = call.expression.getStart(call.getSourceFile());
    const wrappers = memberCandidates(call.expression, atPosition)
      .filter(member => member.name === 'call' || member.name === 'apply');
    if (wrappers.length > 0) {
      return wrappers.flatMap(wrapper => callableMembers(wrapper.receiver, atPosition).map(member => ({
        ...member,
        invocation: wrapper.name as 'call' | 'apply',
      })));
    }
    return callableMembers(call.expression, atPosition).map(member => ({
      ...member,
      invocation: 'direct',
    }));
  };

  const resolvesToRequire = (
    input: ts.Expression,
    atPosition: number,
    trail: ResolutionTrail = new Map(),
  ): boolean => {
    const expression = unwrap(input);
    if (!ts.isIdentifier(expression)) return false;
    const symbol = checker.getSymbolAtLocation(expression);
    if (isUnshadowedGlobal(expression, symbol, new Set(['require']))) return true;
    if (!symbol) return false;
    return withSymbolOrigins(symbol, atPosition, trail, (origin, nextTrail) => (
      origin.value.kind === 'expression'
        && resolvesToRequire(origin.value.expression, origin.position, nextTrail)
        ? [true]
        : []
    )).length > 0;
  };

  const firstArrayElements = (
    input: ts.Expression,
    atPosition: number,
    trail: ResolutionTrail = new Map(),
  ): Array<{ expression: ts.Expression; position: number }> => {
    const expression = unwrap(input);
    if (ts.isArrayLiteralExpression(expression)) {
      const first = expression.elements[0];
      return first && ts.isExpression(first)
        ? [{ expression: first, position: atPosition }]
        : [];
    }
    if (ts.isIdentifier(expression)) {
      const symbol = checker.getSymbolAtLocation(expression);
      if (!symbol) return [];
      return withSymbolOrigins(symbol, atPosition, trail, (origin, nextTrail) => (
        origin.value.kind === 'expression'
          ? firstArrayElements(origin.value.expression, origin.position, nextTrail)
          : []
      ));
    }
    if (ts.isConditionalExpression(expression)) {
      return [
        ...firstArrayElements(expression.whenTrue, atPosition, trail),
        ...firstArrayElements(expression.whenFalse, atPosition, trail),
      ];
    }
    return [];
  };

  const keyCandidates = (call: ts.CallExpression, invoked: InvokedMember): Set<string> => {
    const boundKey = invoked.boundArguments[0];
    if (boundKey) return staticStrings(boundKey.expression, boundKey.position);
    if (invoked.invocation === 'apply') {
      const argumentArray = call.arguments[1];
      if (!argumentArray) return new Set();
      return new Set(firstArrayElements(argumentArray, call.expression.getStart()).flatMap(candidate => (
        [...staticStrings(candidate.expression, candidate.position)]
      )));
    }
    const keyArgument = call.arguments[invoked.invocation === 'call' ? 1 : 0];
    return keyArgument
      ? staticStrings(keyArgument, call.expression.getStart())
      : new Set();
  };

  const isLegacyTypesModule = (specifier: string): boolean => {
    const normalized = specifier.split(/[?#]/, 1)[0].replaceAll('\\', '/');
    const basename = normalized.slice(normalized.lastIndexOf('/') + 1);
    return /^legacyTypes(?:\..+)?$/.test(basename);
  };

  for (const [fileName, input] of scriptsByFile) {
    const sourceFile = program.getSourceFile(fileName);
    if (!sourceFile) continue;
    const violations = results.get(input.path)!;
    const parseDiagnostics = (sourceFile as ts.SourceFile & {
      parseDiagnostics: readonly ts.Diagnostic[];
    }).parseDiagnostics;
    for (const diagnostic of parseDiagnostics) {
      const position = sourceFile.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
      violations.push(`${input.path}:${position.line + 1}: cannot parse source: ${message}`);
    }

    const importsAllowed = input.path.startsWith('services/localWorkspace/')
      || input.path === 'tests/helpers/localWorkspaceFixtures.ts';
    const localWorkspaceSource = input.path.startsWith('services/localWorkspace/');
    const productionSource = /^(?:pages|components|hooks|services)\//.test(input.path);
    const report = (node: ts.Node, message: string): void => {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      violations.push(`${input.path}:${position.line + 1}: ${message}`);
    };
    const inspectModuleSpecifier = (node: ts.Node, expression: ts.Expression | undefined): void => {
      if (!importsAllowed && expression && [...staticStrings(expression, node.getStart(sourceFile))]
        .some(isLegacyTypesModule)) {
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
        } else if (resolvesToRequire(node.expression, node.expression.getStart(sourceFile))) {
          inspectModuleSpecifier(node, node.arguments[0]);
        }

        const invoked = invokedMembers(node);
        if (localWorkspaceSource
          && invoked.some(member => storageMutators.has(member.method))) {
          report(node, 'mutates storage during rollout epoch 1');
        }
        if (localWorkspaceSource && invoked.some(member => member.method === 'createIndex')) {
          report(node, 'creates an IndexedDB index');
        }
        if (productionSource
          && invoked.some(member => member.method === 'clear' && member.localStorage)) {
          report(node, 'clears all production local storage');
        }
        if (!allowed.has(input.path) && invoked.some(member => (
          member.localStorage
          && keyedStorageMethods.has(member.method)
          && [...keyCandidates(node, member)].some(key => legacyKeys.includes(key))
        ))) {
          report(node, 'accesses legacy document key through localStorage');
        }
      }
      ts.forEachChild(node, inspectNode);
    };
    inspectNode(sourceFile);
  }

  return results;
};

const analyzeSource = (path: string, source: string): string[] =>
  analyzeSources([{ path, source }]).get(path) ?? [];

describe('local workspace static boundary', () => {
  it('confines legacy document storage and keeps IndexedDB schema index-free', { timeout: 15_000 }, () => {
    const inputs = sourceRoots.flatMap(directory => sourceFiles(join(root, directory)))
      .map(file => ({ path: repoPath(file), source: readFileSync(file, 'utf8') }));
    const violations = [...analyzeSources(inputs).values()].flat();

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

  it.each([
    [
      'components/OuterReceiver.ts',
      'const storage = localStorage; { const storage = supplied; void storage; } storage.clear();',
    ],
    [
      'components/LaterCallable.ts',
      'const wipe = localStorage.clear; wipe(); function later() { const wipe = supplied.clear; return wipe; }',
    ],
    [
      'components/ReassignedReceiver.ts',
      'let storage = localStorage; storage = supplied; storage.clear();',
    ],
    [
      'components/ReassignedCallable.ts',
      'let wipe = localStorage.clear; wipe = supplied.clear; wipe();',
    ],
    [
      'components/ReassignedDestructure.ts',
      'let wipe; ({ clear: wipe } = localStorage); ({ clear: wipe } = supplied); wipe();',
    ],
  ])('keeps every prior lexical localStorage origin tainted in %s', (path, source) => {
    expect(analyzeSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining('clears all production local storage'),
    ]));
  });

  it.each([
    [
      'components/InnerReceiver.ts',
      'const storage = supplied; { const storage = localStorage; void storage; } storage.clear();',
    ],
    [
      'components/LaterReceiverAssignment.ts',
      'let storage = supplied; storage.clear(); storage = localStorage;',
    ],
    [
      'components/LaterCallableAssignment.ts',
      'let wipe = supplied.clear; wipe(); wipe = localStorage.clear;',
    ],
    [
      'components/LaterDestructureAssignment.ts',
      'let wipe; ({ clear: wipe } = supplied); wipe(); ({ clear: wipe } = localStorage);',
    ],
  ])('does not flow nested or later localStorage origins backward in %s', (path, source) => {
    expect(analyzeSource(path, source)).toEqual([]);
  });

  it.each([
    [
      'components/ShadowedRequire.ts',
      "const load = require; { const load = supplied; void load; } load('../services/localWorkspace/legacyTypes');",
    ],
    [
      'components/ReassignedRequire.ts',
      "let load = require; load = supplied; load('../services/localWorkspace/legacyTypes');",
    ],
  ])('keeps every prior lexical require origin tainted in %s', (path, source) => {
    expect(analyzeSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining('imports local-workspace migration internals'),
    ]));
  });

  it('does not flow a later require assignment backward', () => {
    const source = "let load = supplied; load('../services/localWorkspace/legacyTypes'); load = require;";

    expect(analyzeSource('components/LaterRequire.ts', source)).toEqual([]);
  });

  it.each([
    [
      'components/DirectLegacyRead.ts',
      "localStorage.getItem('hype_' + 'projects');",
    ],
    [
      'components/ComputedLegacyWrite.ts',
      "window['local' + 'Storage']['set' + 'Item'](`hype_${'active'}_project`, 'value');",
    ],
    [
      'components/DestructuredLegacyRemove.ts',
      "const suffix = 'custom_' + 'presets'; const { removeItem: remove } = globalThis.localStorage; remove('hype_' + suffix);",
    ],
    [
      'components/BoundLegacyRead.ts',
      "const read = localStorage.getItem.bind(localStorage); const key = `hype_${'import'}_pending`; read(key);",
    ],
    [
      'components/CalledLegacyRemove.ts',
      "const key = 'hype_' + 'projects'; localStorage.removeItem.call(localStorage, key);",
    ],
    [
      'components/AppliedLegacyRead.ts',
      "const args = ['hype_' + 'projects']; const read = localStorage.getItem; read.apply(localStorage, args);",
    ],
    [
      'components/ReassignedLegacyKey.ts',
      "let key = 'hype_' + 'projects'; key = 'doctect_last_fontSize'; localStorage.getItem(key);",
    ],
    [
      'components/ShadowedLegacyKey.ts',
      "const part = 'hype'; { const part = 'other'; void part; } localStorage.getItem(`${part}_${'projects'}`);",
    ],
    [
      'components/ReassignedLegacyReader.ts',
      "let read = localStorage.getItem; read = supplied.getItem; read('hype_' + 'projects');",
    ],
  ])('rejects statically reconstructed localStorage legacy keys in %s', (path, source) => {
    expect(analyzeSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining('accesses legacy document key through localStorage'),
    ]));
  });

  it.each([
    [
      'components/PreboundLegacyRead.ts',
      "const key = 'hype_' + 'projects'; const read = localStorage.getItem.bind(localStorage, key); read();",
    ],
    [
      'components/AliasedPreboundLegacyWrite.ts',
      "const key = `hype_${'active'}_project`; const write = localStorage.setItem.bind(localStorage, key); const alias = write; alias('value');",
    ],
    [
      'components/CalledPreboundLegacyRemove.ts',
      "const remove = localStorage.removeItem.bind(localStorage, 'hype_' + 'custom_' + 'presets'); remove.call(null, 'doctect_last_fontSize');",
    ],
    [
      'components/AppliedPreboundLegacyRead.ts',
      "const read = localStorage.getItem.bind(localStorage, `hype_${'import'}_pending`); read.apply(null, ['gallery-explainer-dismissed']);",
    ],
    [
      'components/NestedPreboundLegacyRead.ts',
      "const read = localStorage.getItem.bind(localStorage).bind(null, 'hype_' + 'projects'); read();",
    ],
  ])('rejects reconstructed legacy keys carried by bound callables in %s', (path, source) => {
    expect(analyzeSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining('accesses legacy document key through localStorage'),
    ]));
  });

  it.each([
    [
      'components/PreboundPreferenceRead.ts',
      "const read = localStorage.getItem.bind(localStorage, 'doctect_last_fontSize'); read('hype_' + 'projects');",
    ],
    [
      'components/CalledPreboundPreferenceWrite.ts',
      "const write = localStorage.setItem.bind(localStorage, 'doctect_last_fontStyle'); write.call(null, 'hype_' + 'projects');",
    ],
    [
      'components/AppliedPreboundPreferenceRemove.ts',
      "const remove = localStorage.removeItem.bind(localStorage, 'gallery-explainer-dismissed'); remove.apply(null, ['hype_' + 'projects']);",
    ],
    [
      'components/UnresolvedPreboundRead.ts',
      "const read = localStorage.getItem.bind(localStorage, suppliedKey); read('hype_' + 'projects');",
    ],
  ])('keeps the first pre-bound key authoritative in %s', (path, source) => {
    expect(analyzeSource(path, source)).toEqual([]);
  });

  it.each([
    [
      'components/LaterLegacyKey.ts',
      "let key = 'doctect_last_fontSize'; localStorage.getItem(key); key = 'hype_' + 'projects';",
    ],
    [
      'components/LaterLegacyReader.ts',
      "let read = supplied.getItem; read('hype_' + 'projects'); read = localStorage.getItem;",
    ],
    [
      'components/PreferenceCalls.ts',
      "const storage = localStorage; const { getItem: get } = storage; const set = storage.setItem.bind(storage); const remove = storage.removeItem; get('doctect_last_fontSize'); set.call(storage, 'doctect_last_fontStyle', 'italic'); remove.apply(storage, ['gallery-explainer-dismissed']);",
    ],
    [
      'tests/e2e/fixtures/localWorkspaceMigration.js',
      "localStorage.getItem('hype_' + 'projects'); localStorage.removeItem(`hype_${'import'}_pending`);",
    ],
  ])('allows non-legacy, later, or allowlisted key origins in %s', (path, source) => {
    expect(analyzeSource(path, source)).toEqual([]);
  });

  it.each([
    ['components/legacy-import.mts', "import type { LegacySnapshot } from '../services/localWorkspace/legacyTypes.js';"],
    ['components/legacy-import.cts', "const legacy: unknown = require('../services/localWorkspace/legacyTypes.cjs');"],
  ])('rejects legacyTypes imports in %s', (path, source) => {
    expect(analyzeSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining('imports local-workspace migration internals'),
    ]));
  });

  it.each([
    ['services/localWorkspace/mutator.mts', "const wipe: () => void = supplied['clear']; wipe();"],
    ['services/localWorkspace/mutator.cts', "const method: 'removeItem' = 'removeItem'; supplied[method]('preference');"],
  ])('rejects local-workspace mutators in %s', (path, source) => {
    expect(analyzeSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining('mutates storage during rollout epoch 1'),
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
