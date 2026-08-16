import {
  type Dirent,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { extname, join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const executableExtensions = new Set([
  '.cjs',
  '.cts',
  '.html',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
]);
const excludedDirectories = new Set([
  '.claude',
  '.git',
  '.superpowers',
  '.worktrees',
  'archives',
  'build',
  'coverage',
  'dist',
  'docs',
  'docs-content',
  'gallery-samples',
  'node_modules',
  'playwright-report',
  'scratch',
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
const javascriptMimeEssences = new Set([
  'application/ecmascript',
  'application/javascript',
  'application/x-ecmascript',
  'application/x-javascript',
  'text/ecmascript',
  'text/javascript',
  'text/javascript1.0',
  'text/javascript1.1',
  'text/javascript1.2',
  'text/javascript1.3',
  'text/javascript1.4',
  'text/javascript1.5',
  'text/jscript',
  'text/livescript',
  'text/x-ecmascript',
  'text/x-javascript',
]);

interface HtmlNodeLocation {
  startOffset: number;
  endOffset: number;
  startTag?: HtmlNodeLocation;
  endTag?: HtmlNodeLocation;
}

interface ParsedHtml {
  window: { document: Document };
  nodeLocation(node: Node): HtmlNodeLocation | null;
}

const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (source: string, options: { includeNodeLocations: true }) => ParsedHtml;
};

const workflowRunsOnEveryPullRequest = (workflow: string): boolean => {
  const jobsStart = workflow.search(/^jobs:/m);
  const header = jobsStart === -1 ? workflow : workflow.slice(0, jobsStart);
  const activeLines = header.split(/\r?\n/).map(line => (
    line.replace(/^\s*#.*$/, '').replace(/\s+#.*$/, '').trimEnd()
  ));
  return activeLines.some(line => /^  pull_request:\s*\{\}$/.test(line))
    && !activeLines.some(line => /^    paths(?:-ignore)?:/.test(line));
};

type ReadDirectory = (directory: string) => Dirent[];

const readDirectory: ReadDirectory = directory => readdirSync(directory, { withFileTypes: true });

const sourceFiles = (
  directory: string,
  repositoryRoot = directory,
  readEntries = readDirectory,
): string[] => readEntries(directory)
  .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
  .flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      const policyPath = relative(repositoryRoot, path).split(sep).join('/');
      throw new Error(
        `Workspace boundary refuses symbolic link ${policyPath}; replace it with a regular in-repository entry`,
      );
    }
    if (entry.isDirectory()) {
      return excludedDirectories.has(entry.name) ? [] : sourceFiles(path, repositoryRoot, readEntries);
    }
    return entry.isFile() && executableExtensions.has(extname(entry.name)) ? [path] : [];
  });

const repositorySourcePaths = (repositoryRoot = root, readEntries = readDirectory): string[] =>
  sourceFiles(repositoryRoot, repositoryRoot, readEntries)
    .map(path => relative(repositoryRoot, path).split(sep).join('/'))
    .sort();

interface SourcePositionSegment {
  generatedStart: number;
  generatedEnd: number;
  originalStart: number;
}

interface SourceInput {
  path: string;
  source: string;
  analysisStart?: number;
  authoredScripts?: readonly SourceInput[];
  classicLinked?: boolean;
  compilerPath?: string;
  reportPath?: string;
  reportSource?: string;
  positionSegments?: readonly SourcePositionSegment[];
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

const trimAsciiWhitespace = (value: string): string =>
  value.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '');

const executableScriptType = (script: Element): 'classic' | 'module' | undefined => {
  if (script.namespaceURI === 'http://www.w3.org/1999/xhtml') {
    if (script.hasAttribute('src')) return undefined;
  } else if (script.namespaceURI === 'http://www.w3.org/2000/svg') {
    if (script.hasAttribute('href')
      || script.hasAttributeNS('http://www.w3.org/1999/xlink', 'href')) return undefined;
  } else {
    return undefined;
  }

  const attribute = script.getAttribute('type');
  let type: string;
  if (attribute === null) {
    if (script.namespaceURI === 'http://www.w3.org/2000/svg') return 'classic';
    const language = script.getAttribute('language');
    if (language === null || language === '') return 'classic';
    type = `text/${language}`;
  } else {
    if (attribute === '') return 'classic';
    type = attribute;
  }
  const normalized = trimAsciiWhitespace(type).toLowerCase();
  if (javascriptMimeEssences.has(normalized)) return 'classic';
  return normalized === 'module' ? 'module' : undefined;
};

const executableInputs = (inputs: readonly SourceInput[]): SourceInput[] => inputs.flatMap(input => {
  if (extname(input.path) !== '.html') return [input];
  const scripts: SourceInput[] = [];
  const classicScripts: Array<{ index: number; source: string; bodyStart: number }> = [];
  const document = new JSDOM(input.source, { includeNodeLocations: true });
  let index = 0;
  for (const script of document.window.document.querySelectorAll('script')) {
    const type = executableScriptType(script);
    if (!type) continue;
    const location = document.nodeLocation(script);
    if (!location?.startTag) throw new Error(`Workspace boundary could not locate script in ${input.path}`);
    const bodyStart = location.startTag.endOffset;
    const bodyEnd = location.endTag?.startOffset ?? location.endOffset;
    const source = input.source.slice(bodyStart, bodyEnd);
    const body = source.trim();
    const onboardingSlot = input.path === 'onboarding/src/shell.html'
      && /^<!--SLOT:(?:DATA|DIFF|RUNTIME)-->$/.test(body);
    if (body.length === 0 || onboardingSlot) continue;
    if (type === 'classic') {
      classicScripts.push({ index, source, bodyStart });
    } else {
      scripts.push({
        path: `${input.path}.__inline_${index}.js`,
        compilerPath: `\0doctect-inline/${input.path}/${index}.js`,
        reportPath: input.path,
        reportSource: input.source,
        positionSegments: [{ generatedStart: 0, generatedEnd: source.length, originalStart: bodyStart }],
        source,
      });
    }
    index += 1;
  }
  if (classicScripts.length > 0) {
    let source = '';
    const positionSegments: SourcePositionSegment[] = [];
    const linkedScripts: SourceInput[] = [];
    for (const script of classicScripts) {
      if (source.length > 0) source += '\n;\n';
      const generatedStart = source.length;
      source += script.source.startsWith('#!') ? `//${script.source.slice(2)}` : script.source;
      positionSegments.push({
        generatedStart,
        generatedEnd: source.length,
        originalStart: script.bodyStart,
      });
      const authoredScript: SourceInput = {
        path: `${input.path}.__inline_${script.index}.js`,
        compilerPath: `\0doctect-inline/${input.path}/authored-${script.index}.js`,
        reportPath: input.path,
        reportSource: input.source,
        positionSegments: [{
          generatedStart: 0,
          generatedEnd: script.source.length,
          originalStart: script.bodyStart,
        }],
        source: script.source,
      };
      linkedScripts.push({
        path: authoredScript.path,
        analysisStart: generatedStart,
        authoredScripts: [authoredScript],
        classicLinked: true,
        compilerPath: `\0doctect-inline/${input.path}/classic-${script.index}.js`,
        reportPath: input.path,
        reportSource: input.source,
        positionSegments: [...positionSegments],
        source,
      });
    }
    scripts.unshift(...linkedScripts);
  }
  return scripts;
});

const originalOffset = (input: SourceInput, generatedOffset: number): number => {
  if (!input.positionSegments) return generatedOffset;
  for (const segment of input.positionSegments) {
    if (generatedOffset < segment.generatedStart) return segment.originalStart;
    if (generatedOffset <= segment.generatedEnd) {
      return segment.originalStart + generatedOffset - segment.generatedStart;
    }
  }
  const last = input.positionSegments.at(-1)!;
  return last.originalStart + last.generatedEnd - last.generatedStart;
};

const sourceLine = (source: string, offset: number): number => {
  let line = 1;
  for (let index = 0; index < offset && index < source.length; index += 1) {
    const character = source.charCodeAt(index);
    if (character === 13) {
      line += 1;
      if (source.charCodeAt(index + 1) === 10 && index + 1 < offset) index += 1;
    } else if (character === 10 || character === 0x2028 || character === 0x2029) {
      line += 1;
    }
  }
  return line;
};

const reportLine = (input: SourceInput, generatedOffset: number): number =>
  sourceLine(input.reportSource ?? input.source, originalOffset(input, generatedOffset));

const analyzeSources = (inputs: readonly SourceInput[]): Map<string, string[]> => {
  const results = new Map(inputs.map(input => [input.path, [] as string[]]));
  for (const input of inputs) {
    if (allowed.has(input.path)) continue;
    for (const [index, line] of input.source.split(/\r\n|[\r\n\u2028\u2029]/).entries()) {
      for (const key of legacyKeys) {
        if (line.includes(key)) {
          results.get(input.path)!.push(
            `${input.path}:${index + 1}: exact legacy document key ${key}`,
          );
        }
      }
    }
  }

  const scripts = executableInputs(inputs)
    .filter(input => scriptKinds.has(extname(input.path)));
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
  const scriptsByFile = new Map(scripts.map(input => [
    input.compilerPath ?? join(root, input.path),
    input,
  ]));
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

  const isClassicGlobalVar = (declaration: ts.Declaration): boolean => {
    const declarationInput = scriptsByFile.get(declaration.getSourceFile().fileName);
    if (!declarationInput?.classicLinked) return false;
    let current: ts.Node | undefined = declaration;
    while (current && !ts.isSourceFile(current) && !ts.isVariableDeclaration(current)) {
      if (ts.isFunctionLike(current) || ts.isClassStaticBlockDeclaration(current)) return false;
      current = current.parent;
    }
    if (!current || !ts.isVariableDeclaration(current)) return false;
    const declarationList = current.parent;
    if (!ts.isVariableDeclarationList(declarationList)
      || (declarationList.flags & ts.NodeFlags.BlockScoped) !== 0) return false;
    for (let ancestor: ts.Node = declarationList.parent;
      !ts.isSourceFile(ancestor);
      ancestor = ancestor.parent) {
      if (ts.isFunctionLike(ancestor) || ts.isClassStaticBlockDeclaration(ancestor)) return false;
    }
    return true;
  };

  const isUnshadowedGlobal = (
    identifier: ts.Identifier,
    symbol: ts.Symbol | undefined,
    names: ReadonlySet<string>,
  ): boolean => names.has(identifier.text) && !symbol?.declarations?.some(declaration => (
    scriptsByFile.has(declaration.getSourceFile().fileName) && !isClassicGlobalVar(declaration)
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
    const policyPath = input.reportPath ?? input.path;
    const violations = results.get(policyPath)!;
    const importsAllowed = policyPath.startsWith('services/localWorkspace/')
      || policyPath === 'tests/helpers/localWorkspaceFixtures.ts';
    const localWorkspaceSource = policyPath.startsWith('services/localWorkspace/');
    const productionSource = !policyPath.startsWith('tests/');
    const report = (node: ts.Node, message: string): void => {
      violations.push(`${policyPath}:${reportLine(input, node.getStart(sourceFile))}: ${message}`);
    };
    const authoredScripts = input.authoredScripts ?? [input];
    for (const authoredInput of authoredScripts) {
      const authoredSourceFile = authoredInput === input
        ? sourceFile
        : ts.createSourceFile(
          authoredInput.compilerPath ?? authoredInput.path,
          authoredInput.source,
          ts.ScriptTarget.Latest,
          true,
          scriptKinds.get(extname(authoredInput.path)),
        );
      const parseDiagnostics = (authoredSourceFile as ts.SourceFile & {
        parseDiagnostics: readonly ts.Diagnostic[];
      }).parseDiagnostics;
      for (const diagnostic of parseDiagnostics) {
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
        violations.push(
          `${policyPath}:${reportLine(authoredInput, diagnostic.start ?? 0)}: could not be parsed: ${message}`,
        );
      }
    }

    const inspectModuleSpecifier = (node: ts.Node, expression: ts.Expression | undefined): void => {
      if (!importsAllowed && expression && [...staticStrings(expression, node.getStart(sourceFile))]
        .some(isLegacyTypesModule)) {
        report(node, 'imports local-workspace migration internals');
      }
    };

    const inspectNode = (node: ts.Node): void => {
      const inAnalysisSegment = node.getStart(sourceFile) >= (input.analysisStart ?? 0);
      if (!inAnalysisSegment) {
        ts.forEachChild(node, inspectNode);
      } else if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
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
        if (!allowed.has(policyPath) && invoked.some(member => (
          member.localStorage
          && keyedStorageMethods.has(member.method)
          && [...keyCandidates(node, member)].some(key => legacyKeys.includes(key))
        ))) {
          report(node, 'accesses legacy document key through localStorage');
        }
      }
      if (inAnalysisSegment) ts.forEachChild(node, inspectNode);
    };
    inspectNode(sourceFile);
  }

  return results;
};

const analyzeSource = (path: string, source: string): string[] =>
  analyzeSources([{ path, source }]).get(path) ?? [];

describe('local workspace static boundary', () => {
  it('confines legacy document storage and keeps IndexedDB schema index-free', { timeout: 15_000 }, () => {
    const inputs = repositorySourcePaths()
      .map(path => ({ path, source: readFileSync(join(root, path), 'utf8') }));
    const violations = [...analyzeSources(inputs).values()].flat();

    expect(violations, `Workspace boundary violations:\n${violations.join('\n')}`).toEqual([]);
  });

  it.each([
    'App.tsx',
    'index.tsx',
    'index.html',
    'types.ts',
    'vite.config.ts',
    'lib/auth-client.ts',
    'shared/validateAppState.js',
    'constants/editor.ts',
    'server/index.js',
    'onboarding/build.mjs',
    'scripts/run-lighthouse.js',
    'tutorial/lib/servers.js',
  ])('discovers production path %s without a root allowlist', path => {
    expect(repositorySourcePaths()).toContain(path);
  });

  it('discovers executable files in future source roots without allowlist edits', () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'workspace-policy-'));
    try {
      mkdirSync(join(temporaryRoot, 'future-feature'));
      writeFileSync(join(temporaryRoot, 'future-feature', 'entry.ts'), 'export const ready = true;');
      mkdirSync(join(temporaryRoot, 'docs'));
      writeFileSync(join(temporaryRoot, 'docs', 'example.ts'), 'localStorage.clear();');
      expect(repositorySourcePaths(temporaryRoot)).toEqual(['future-feature/entry.ts']);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('runs the migration release gate for every pull request', () => {
    const workflow = readFileSync(
      join(root, '.github/workflows/local-workspace-migration.yml'),
      'utf8',
    );
    expect(workflowRunsOnEveryPullRequest(workflow)).toBe(true);
  });

  it.each([
    [
      'commented trigger',
      '# pull_request: {}\non:\n  push: {}\njobs: {}\n',
    ],
    [
      'active paths',
      '# pull_request: {}\non:\n  pull_request:\n    paths:\n      - src/**\njobs: {}\n',
    ],
    [
      'active paths-ignore',
      '# pull_request: {}\non:\n  pull_request:\n    paths-ignore:\n      - docs/**\njobs: {}\n',
    ],
  ])('workflow trigger policy rejects %s', (_case, workflow) => {
    expect(workflowRunsOnEveryPullRequest(workflow)).toBe(false);
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

  it('rejects reconstructed legacy access inside executable inline HTML', () => {
    const source = [
      '<script type="module">',
      "const key = 'hype_' + 'projects';",
      'const read = localStorage.getItem.bind(localStorage, key);',
      'read();',
      '</script>',
    ].join('\n');
    expect(analyzeSource('future-shell.html', source)).toEqual(expect.arrayContaining([
      expect.stringContaining('future-shell.html:4:'),
      expect.stringContaining('accesses legacy document key'),
    ]));
  });

  it('skips import maps but reports malformed executable inline scripts', () => {
    expect(analyzeSource('shell.html', '<script type="importmap">{"imports":{}}</script>'))
      .toEqual([]);
    expect(analyzeSource('shell.html', '<script>const broken = ;</script>'))
      .toEqual(expect.arrayContaining([expect.stringContaining('could not be parsed')]));
  });

  it.each([
    [
      'end-tag whitespace',
      '<script>const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script >',
    ],
    [
      'an entity-decoded MIME type',
      '<script type="text&#x2F;javascript">const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script>',
    ],
    [
      'a JavaScript MIME alias',
      '<script type="text/ecmascript">const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script>',
    ],
    [
      'ASCII whitespace around the type',
      '<script type=" \ttext/javascript\r\n">const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script>',
    ],
  ])('browser HTML parsing analyzes %s', (_case, source) => {
    expect(analyzeSource('browser-shell.html', source)).toEqual(expect.arrayContaining([
      expect.stringContaining('accesses legacy document key'),
    ]));
  });

  it.each([
    ['quoted', '<script type="importmap">{"imports":{"x":"/x.js"}}</script>'],
    ['unquoted', '<script type=importmap>{"imports":{"x":"/x.js"}}</script>'],
    ['spaced unquoted', '<script type = importmap>{"imports":{"x":"/x.js"}}</script>'],
  ])('browser HTML parsing skips %s import maps', (_case, source) => {
    expect(analyzeSource('import-map.html', source)).toEqual([]);
  });

  it.each([
    [
      'an external src body',
      '<script src="/app.js">const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script>',
    ],
    [
      'a whitespace-only type',
      '<script type=" \t\r\n">const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script>',
    ],
    [
      'a parameterized MIME type',
      '<script type="application/javascript; charset=utf-8">const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script>',
    ],
    [
      'a non-JavaScript language',
      '<script language="json">const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script>',
    ],
  ])('browser script preparation skips %s', (_case, source) => {
    expect(analyzeSource('inert-shell.html', source)).toEqual([]);
  });

  it.each([
    [
      'a missing type',
      '<script>const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script>',
    ],
    [
      'an exactly empty type',
      '<script type="">const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script>',
    ],
    [
      'an empty language',
      '<script language="">const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script>',
    ],
    [
      'a JavaScript language',
      '<script language="javascript">const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script>',
    ],
    [
      'a module type',
      '<script type="module">const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script>',
    ],
  ])('browser script preparation analyzes %s', (_case, source) => {
    expect(analyzeSource('prepared-shell.html', source)).toEqual(expect.arrayContaining([
      expect.stringContaining('accesses legacy document key'),
    ]));
  });

  it('browser script preparation retains exact-literal scanning for inert bodies', () => {
    const key = ['hype', 'projects'].join('_');
    const source = `<script src="/app.js">localStorage.getItem('${key}');</script>`;
    expect(analyzeSource('inert-literal.html', source)).toEqual(expect.arrayContaining([
      expect.stringContaining(`exact legacy document key ${key}`),
    ]));
  });

  it.each([
    [
      'src attribute',
      '<svg><script src="/ignored.js">const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script></svg>',
    ],
    [
      'language attribute',
      '<svg><script language="json">const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script></svg>',
    ],
    [
      'missing type',
      '<svg><script>const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script></svg>',
    ],
    [
      'empty type',
      '<svg><script type="">const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script></svg>',
    ],
    [
      'JavaScript MIME type',
      '<svg><script type="text/javascript">const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script></svg>',
    ],
    [
      'module type',
      '<svg><script type="module">const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script></svg>',
    ],
  ])('SVG script namespace executes inline body with %s', (_case, source) => {
    expect(analyzeSource('svg-shell.html', source)).toEqual(expect.arrayContaining([
      expect.stringContaining('accesses legacy document key'),
    ]));
  });

  it.each([
    [
      'whitespace-only type',
      '<svg><script type=" ">const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script></svg>',
    ],
    [
      'parameterized type',
      '<svg><script type="text/javascript; charset=utf-8">const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script></svg>',
    ],
    [
      'data-block type',
      '<svg><script type="importmap">const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script></svg>',
    ],
    [
      'href',
      '<svg><script href="/external.js">const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script></svg>',
    ],
    [
      'xlink:href',
      '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><script xlink:href="/external.js">const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script></svg>',
    ],
  ])('SVG script namespace skips inert body selected by %s', (_case, source) => {
    expect(analyzeSource('svg-inert.html', source)).toEqual([]);
  });

  it('foreign script namespace skips inert MathML script bodies', () => {
    const source = '<math><script>const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script></math>';
    expect(analyzeSource('math-shell.html', source)).toEqual([]);
  });

  it.each([
    ['U+2028', '\u2028'],
    ['U+2029', '\u2029'],
  ])('Annex B Unicode separator %s does not hide executable access', (_case, separator) => {
    const source = `<script><!--${separator}const key = 'hype_' + 'projects'; localStorage.getItem(key);//--></script>`;
    expect(analyzeSource('unicode-shell.html', source)).toEqual(expect.arrayContaining([
      expect.stringContaining('unicode-shell.html:2: accesses legacy document key'),
    ]));
  });

  it.each([
    [
      'key',
      '<script>const key = \'hype_\' + \'projects\';</script><script>localStorage.getItem(key);</script>',
    ],
    [
      'storage',
      '<script>const storage = localStorage;</script><script>storage.getItem(\'hype_\' + \'projects\');</script>',
    ],
    [
      'callable',
      '<script>const read = localStorage.getItem.bind(localStorage);</script><script>read(\'hype_\' + \'projects\');</script>',
    ],
  ])('classic script shared scope resolves a cross-script %s alias', (_case, source) => {
    expect(analyzeSource('classic-shell.html', source)).toEqual(expect.arrayContaining([
      expect.stringContaining('accesses legacy document key'),
    ]));
  });

  it('classic script shared scope does not join module scripts', () => {
    const source = '<script type="module">const key = \'hype_\' + \'projects\';</script>'
      + '<script type="module">localStorage.getItem(key);</script>';
    expect(analyzeSource('module-shell.html', source)).toEqual([]);
  });

  it.each([
    [
      'single uninitialized localStorage',
      '<script>var localStorage; const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script>',
    ],
    [
      'cross-script initialized localStorage',
      '<script>var localStorage = localStorage;</script><script>const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script>',
    ],
    [
      'single uninitialized window',
      '<script>var window; const key = \'hype_\' + \'projects\'; window.localStorage.getItem(key);</script>',
    ],
    [
      'cross-script initialized window',
      '<script>var window = window;</script><script>const key = \'hype_\' + \'projects\'; window.localStorage.getItem(key);</script>',
    ],
    [
      'single uninitialized self',
      '<script>var self; const key = \'hype_\' + \'projects\'; self.localStorage.getItem(key);</script>',
    ],
    [
      'cross-script initialized self',
      '<script>var self = self;</script><script>const key = \'hype_\' + \'projects\'; self.localStorage.getItem(key);</script>',
    ],
    [
      'single uninitialized globalThis',
      '<script>var globalThis; const key = \'hype_\' + \'projects\'; globalThis.localStorage.getItem(key);</script>',
    ],
    [
      'cross-script initialized globalThis',
      '<script>var globalThis = globalThis;</script><script>const key = \'hype_\' + \'projects\'; globalThis.localStorage.getItem(key);</script>',
    ],
  ])('classic protected globals retain taint for %s', (_case, source) => {
    expect(analyzeSource('protected-classic.html', source)).toEqual(expect.arrayContaining([
      expect.stringContaining('accesses legacy document key'),
    ]));
  });

  it.each([
    [
      'ordinary localStorage',
      'components/ProtectedShadow.ts',
      "var localStorage; const key = 'hype_' + 'projects'; localStorage.getItem(key);",
    ],
    [
      'ordinary window',
      'components/GlobalShadow.ts',
      "var window; const key = 'hype_' + 'projects'; window.localStorage.getItem(key);",
    ],
    [
      'module localStorage',
      'module-shadow.html',
      '<script type="module">var localStorage; const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script>',
    ],
    [
      'module window',
      'module-global-shadow.html',
      '<script type="module">var window; const key = \'hype_\' + \'projects\'; window.localStorage.getItem(key);</script>',
    ],
  ])('classic protected globals preserve %s lexical shadowing', (_case, path, source) => {
    expect(analyzeSource(path, source)).toEqual([]);
  });

  it.each((['localStorage', 'window', 'self', 'globalThis'] as const).flatMap(name => [
    [name, 'let', `let ${name};`],
    [name, 'const', `const ${name} = supplied;`],
    [name, 'class', `class ${name} {}`],
    [name, 'function', `function ${name}() {}`],
  ]))('temporal classic scope keeps earlier %s access ahead of later %s declaration', (name, _kind, declaration) => {
    const receiver = name === 'localStorage' ? name : `${name}.localStorage`;
    const source = '<script>const key = \'hype_\' + \'projects\'; '
      + `${receiver}.getItem(key);</script><script>${declaration}</script>`;
    expect(analyzeSource('temporal-reverse.html', source)).toEqual(expect.arrayContaining([
      expect.stringContaining('accesses legacy document key'),
    ]));
  });

  it.each(['localStorage', 'window', 'self', 'globalThis'])(
    'temporal classic scope preserves same-script %s lexical shadowing',
    name => {
      const receiver = name === 'localStorage' ? name : `${name}.localStorage`;
      const value = name === 'localStorage'
        ? '{ getItem() {} }'
        : '{ localStorage: { getItem() {} } }';
      const source = `<script>let ${name} = ${value}; const key = 'hype_' + 'projects'; `
        + `${receiver}.getItem(key);</script>`;
      expect(analyzeSource('temporal-same.html', source)).toEqual([]);
    },
  );

  it.each(['localStorage', 'window', 'self', 'globalThis'])(
    'temporal classic scope carries prior-script %s lexical shadowing forward',
    name => {
      const receiver = name === 'localStorage' ? name : `${name}.localStorage`;
      const value = name === 'localStorage'
        ? '{ getItem() {} }'
        : '{ localStorage: { getItem() {} } }';
      const source = `<script>let ${name} = ${value};</script>`
        + `<script>const key = 'hype_' + 'projects'; ${receiver}.getItem(key);</script>`;
      expect(analyzeSource('temporal-forward.html', source)).toEqual([]);
    },
  );

  it('independent inline parse boundaries report malformed bodies repaired by concatenation', () => {
    const source = [
      '<script>',
      'if (true) {',
      '</script>',
      '<script>',
      '}',
      '</script>',
    ].join('\n');
    const parseFailures = analyzeSource('parse-boundaries.html', source)
      .filter(violation => violation.includes('could not be parsed'));
    expect(parseFailures).toEqual(expect.arrayContaining([
      expect.stringContaining('parse-boundaries.html:3:'),
      expect.stringContaining('parse-boundaries.html:5:'),
    ]));
    expect(parseFailures).toHaveLength(2);
  });

  it('independent inline parse boundaries preserve repeated hashbangs and shared symbols', () => {
    const source = [
      '<script>#! first',
      "const key = 'hype_' + 'projects';</script>",
      '<script>#! second',
      'localStorage.getItem(key);</script>',
    ].join('\n');
    expect(analyzeSource('hashbang-shell.html', source)).toEqual([
      expect.stringContaining('hashbang-shell.html:4: accesses legacy document key'),
    ]);
  });

  it('compiler identity collision cannot replace an inline script with a real file', () => {
    const html = '<script>const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script>';
    const violations = analyzeSources([
      { path: 'collision.html', source: html },
      { path: 'collision.html.__inline_0.js', source: 'export const ready = true;' },
    ]);
    expect(violations.get('collision.html')).toEqual(expect.arrayContaining([
      expect.stringContaining('accesses legacy document key'),
    ]));
  });

  it('symbolic link discovery rejects executable file links', () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'workspace-policy-'));
    try {
      mkdirSync(join(temporaryRoot, 'future'));
      writeFileSync(join(temporaryRoot, 'target.ts'), 'export const ready = true;');
      symlinkSync(join(temporaryRoot, 'target.ts'), join(temporaryRoot, 'future', 'entry.ts'));
      expect(() => repositorySourcePaths(temporaryRoot)).toThrow(/symbolic link.*future\/entry\.ts/i);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('symbolic link discovery rejects directory links', () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'workspace-policy-'));
    try {
      mkdirSync(join(temporaryRoot, 'actual'));
      writeFileSync(join(temporaryRoot, 'actual', 'entry.ts'), 'export const ready = true;');
      symlinkSync(join(temporaryRoot, 'actual'), join(temporaryRoot, 'future'));
      expect(() => repositorySourcePaths(temporaryRoot)).toThrow(/symbolic link.*future/i);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('symbolic link discovery rejects links into excluded directories', () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'workspace-policy-'));
    try {
      mkdirSync(join(temporaryRoot, 'docs'));
      writeFileSync(join(temporaryRoot, 'docs', 'entry.ts'), 'export const ready = true;');
      mkdirSync(join(temporaryRoot, 'future'));
      symlinkSync(join(temporaryRoot, 'docs', 'entry.ts'), join(temporaryRoot, 'future', 'entry.ts'));
      expect(() => repositorySourcePaths(temporaryRoot)).toThrow(/symbolic link.*future\/entry\.ts/i);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('symbolic link discovery rejects links outside the repository root', () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'workspace-policy-'));
    const externalRoot = mkdtempSync(join(tmpdir(), 'workspace-policy-external-'));
    try {
      writeFileSync(join(externalRoot, 'entry.ts'), 'export const ready = true;');
      mkdirSync(join(temporaryRoot, 'future'));
      symlinkSync(join(externalRoot, 'entry.ts'), join(temporaryRoot, 'future', 'entry.ts'));
      expect(() => repositorySourcePaths(temporaryRoot)).toThrow(/symbolic link.*future\/entry\.ts/i);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
      rmSync(externalRoot, { recursive: true, force: true });
    }
  });

  it('deterministic symlink diagnostics select the lexically first path', () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'workspace-policy-'));
    try {
      writeFileSync(join(temporaryRoot, 'target.ts'), 'export const ready = true;');
      symlinkSync(join(temporaryRoot, 'target.ts'), join(temporaryRoot, 'z-last.ts'));
      symlinkSync(join(temporaryRoot, 'target.ts'), join(temporaryRoot, 'a-first.ts'));
      const reverseDirectory: ReadDirectory = directory =>
        readDirectory(directory).sort((left, right) => right.name.localeCompare(left.name));
      expect(() => repositorySourcePaths(temporaryRoot, reverseDirectory))
        .toThrow(/symbolic link a-first\.ts/i);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it.each([
    ['CRLF', '\r\n'],
    ['CR', '\r'],
  ])('HTML source locations preserve %s lines across classic scripts', (_case, newline) => {
    const source = [
      '<script>const key = \'hype_\' + \'projects\';</script>',
      '<div></div>',
      '<script>',
      'localStorage.getItem(key);',
      '</script>',
    ].join(newline);
    expect(analyzeSource('line-shell.html', source)).toEqual(expect.arrayContaining([
      expect.stringContaining('line-shell.html:4: accesses legacy document key'),
    ]));
  });

  it('HTML source locations preserve CR-only parse diagnostic lines', () => {
    const source = ['<div></div>', '<script>', 'const broken = ;', '</script>'].join('\r');
    expect(analyzeSource('broken-shell.html', source)).toEqual(expect.arrayContaining([
      expect.stringContaining('broken-shell.html:3: could not be parsed'),
    ]));
  });

  it('HTML source locations use the parsed end of a tag containing quoted >', () => {
    const source = [
      '<script data-marker=">">',
      "const key = 'hype_' + 'projects';",
      'localStorage.getItem(key);',
      '</script>',
    ].join('\n');
    expect(analyzeSource('quoted-marker.html', source)).toEqual([
      expect.stringContaining('quoted-marker.html:3: accesses legacy document key'),
    ]);
  });

  it('exact onboarding SLOT placeholders remain non-executable', () => {
    const source = [
      '<script><!--SLOT:DATA--></script>',
      '<script><!--SLOT:DIFF--></script>',
      '<script><!--SLOT:RUNTIME--></script>',
    ].join('\n');
    expect(analyzeSource('onboarding/src/shell.html', source)).toEqual([]);
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
      expect.stringContaining('could not be parsed'),
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
