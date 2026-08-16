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
import { Script } from 'node:vm';
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
  annexBFunctionAssignments?: ReadonlyMap<string, number>;
  annexBFunctionPositions?: ReadonlySet<number>;
  authoredScripts?: readonly SourceInput[];
  classicLinked?: boolean;
  compilerPath?: string;
  findingGroup?: string;
  moduleStart?: number;
  parseFailure?: { message: string; offset: number };
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

const generatedOffset = (source: string, line: number, column: number): number => {
  let currentLine = 1;
  let offset = 0;
  while (offset < source.length && currentLine < line) {
    const character = source.charCodeAt(offset);
    offset += 1;
    if (character === 13) {
      if (source.charCodeAt(offset) === 10) offset += 1;
      currentLine += 1;
    } else if (character === 10 || character === 0x2028 || character === 0x2029) {
      currentLine += 1;
    }
  }
  return Math.min(offset + column, source.length);
};

const classicScriptParseFailure = (source: string): SourceInput['parseFailure'] => {
  try {
    new Script(source, { filename: 'doctect-inline-classic.js' });
    return undefined;
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    const stack = error.stack?.split('\n') ?? [];
    const line = Number(stack[0]?.match(/:(\d+)$/)?.[1] ?? 1);
    const caret = stack[2]?.indexOf('^') ?? -1;
    return {
      message: error.message,
      offset: generatedOffset(source, line, Math.max(caret, 0)),
    };
  }
};

interface ClassicGlobalDeclarations {
  annexBFunctions: Array<{ assignmentPosition?: number; name: string; position: number }>;
  functionNames: Set<string>;
  lexicalNames: Set<string>;
  varNames: Set<string>;
}

const addBindingNames = (names: Set<string>, binding: ts.BindingName): void => {
  if (ts.isIdentifier(binding)) {
    names.add(binding.text);
    return;
  }
  for (const element of binding.elements) {
    if (!ts.isOmittedExpression(element)) addBindingNames(names, element.name);
  }
};

const classicGlobalDeclarations = (source: string): ClassicGlobalDeclarations => {
  const sourceFile = ts.createSourceFile(
    'doctect-inline-classic.js',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const functionNames = new Set<string>();
  const lexicalNames = new Set<string>();
  const varNames = new Set<string>();
  const annexBFunctions: ClassicGlobalDeclarations['annexBFunctions'] = [];
  let strict = false;
  for (const statement of sourceFile.statements) {
    if (ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)) {
      const literal = statement.expression.getText(sourceFile);
      if (literal === '"use strict"' || literal === "'use strict'") strict = true;
    } else {
      break;
    }
  }
  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)
      && (statement.declarationList.flags & ts.NodeFlags.BlockScoped) !== 0) {
      for (const declaration of statement.declarationList.declarations) {
        addBindingNames(lexicalNames, declaration.name);
      }
    } else if (ts.isClassDeclaration(statement) && statement.name) {
      lexicalNames.add(statement.name.text);
    } else if (ts.isFunctionDeclaration(statement) && statement.name) {
      functionNames.add(statement.name.text);
      varNames.add(statement.name.text);
    }
  }
  const isPlainFunctionDeclaration = (declaration: ts.FunctionDeclaration): boolean => (
    declaration.asteriskToken === undefined
    && !declaration.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword)
  );
  const directLexicalNames = (
    statements: readonly ts.Statement[],
    ignored: ts.FunctionDeclaration,
  ): Set<string> => {
    const names = new Set<string>();
    for (const statement of statements) {
      if (statement === ignored) continue;
      if (ts.isVariableStatement(statement)
        && (statement.declarationList.flags & ts.NodeFlags.BlockScoped) !== 0) {
        for (const declaration of statement.declarationList.declarations) {
          addBindingNames(names, declaration.name);
        }
      } else if (ts.isClassDeclaration(statement) && statement.name) {
        names.add(statement.name.text);
      } else if (ts.isFunctionDeclaration(statement)
        && statement.name
        && !isPlainFunctionDeclaration(statement)) {
        names.add(statement.name.text);
      }
    }
    return names;
  };
  const annexBEligible = (declaration: ts.FunctionDeclaration): boolean => {
    const name = declaration.name?.text;
    if (!name || !isPlainFunctionDeclaration(declaration)) return false;
    const parent = declaration.parent;
    if (!(ts.isBlock(parent)
      || ts.isCaseClause(parent)
      || ts.isDefaultClause(parent)
      || (ts.isIfStatement(parent)
        && (parent.thenStatement === declaration || parent.elseStatement === declaration))
      || (ts.isLabeledStatement(parent) && parent.statement === declaration))) return false;
    for (let ancestor: ts.Node = parent; ; ancestor = ancestor.parent) {
      if (ts.isBlock(ancestor)
        && directLexicalNames(ancestor.statements, declaration).has(name)) return false;
      if (ts.isCaseBlock(ancestor)) {
        const statements = ancestor.clauses.flatMap(clause => [...clause.statements]);
        if (directLexicalNames(statements, declaration).has(name)) return false;
      }
      if (ts.isForStatement(ancestor)
        || ts.isForInStatement(ancestor)
        || ts.isForOfStatement(ancestor)) {
        const initializer = ancestor.initializer;
        if (initializer && ts.isVariableDeclarationList(initializer)
          && (initializer.flags & ts.NodeFlags.BlockScoped) !== 0) {
          const names = new Set<string>();
          for (const item of initializer.declarations) addBindingNames(names, item.name);
          if (names.has(name)) return false;
        }
      }
      if (ts.isCatchClause(ancestor)) {
        const catchBinding = ancestor.variableDeclaration?.name;
        if (catchBinding && !ts.isIdentifier(catchBinding)) {
          const names = new Set<string>();
          addBindingNames(names, catchBinding);
          if (names.has(name)) return false;
        }
      }
      if (ts.isSourceFile(ancestor)) {
        return !directLexicalNames(ancestor.statements, declaration).has(name);
      }
    }
  };
  function statementCompletesNormally(statement: ts.Statement): boolean {
    if (ts.isEmptyStatement(statement) || ts.isFunctionDeclaration(statement)) return true;
    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.every(declaration => !declaration.initializer);
    }
    if (ts.isExpressionStatement(statement)) {
      const expression = unwrap(statement.expression);
      return ts.isStringLiteral(expression)
        || ts.isNumericLiteral(expression)
        || expression.kind === ts.SyntaxKind.TrueKeyword
        || expression.kind === ts.SyntaxKind.FalseKeyword
        || expression.kind === ts.SyntaxKind.NullKeyword;
    }
    if (ts.isBlock(statement)) return statement.statements.every(statementCompletesNormally);
    return false;
  }
  const priorStatementsComplete = (
    statements: readonly ts.Statement[],
    child: ts.Node,
  ): boolean => {
    const index = statements.indexOf(child as ts.Statement);
    return index !== -1 && statements.slice(0, index).every(statementCompletesNormally);
  };
  function statementDefinitelyThrows(statement: ts.Statement): boolean {
    if (ts.isThrowStatement(statement)) return true;
    if (ts.isBlock(statement)) return statementsDefinitelyThrow(statement.statements);
    if (ts.isIfStatement(statement)) {
      const condition = unwrap(statement.expression);
      if (condition.kind === ts.SyntaxKind.TrueKeyword) {
        return statementDefinitelyThrows(statement.thenStatement);
      }
      if (condition.kind === ts.SyntaxKind.FalseKeyword && statement.elseStatement) {
        return statementDefinitelyThrows(statement.elseStatement);
      }
    }
    return false;
  }
  function statementsDefinitelyThrow(statements: readonly ts.Statement[]): boolean {
    for (const statement of statements) {
      if (statementDefinitelyThrows(statement)) return true;
      if (!statementCompletesNormally(statement)) return false;
    }
    return false;
  }
  const definitelyReached = (declaration: ts.FunctionDeclaration): boolean => {
    let child: ts.Node = declaration;
    for (let parent = declaration.parent; ; child = parent, parent = parent.parent) {
      if (ts.isSourceFile(parent)) return priorStatementsComplete(parent.statements, child);
      if (ts.isBlock(parent)) {
        if (!priorStatementsComplete(parent.statements, child)) return false;
        continue;
      }
      if (ts.isCaseClause(parent) || ts.isDefaultClause(parent)) {
        if (!priorStatementsComplete(parent.statements, child)) return false;
        continue;
      }
      if (ts.isLabeledStatement(parent)) {
        if (parent.statement !== child) return false;
        continue;
      }
      if (ts.isIfStatement(parent)) {
        const condition = unwrap(parent.expression);
        const selected = condition.kind === ts.SyntaxKind.TrueKeyword
          ? parent.thenStatement
          : condition.kind === ts.SyntaxKind.FalseKeyword ? parent.elseStatement : undefined;
        if (selected !== child) return false;
        continue;
      }
      if (ts.isCatchClause(parent)) {
        if (parent.block !== child) return false;
        continue;
      }
      if (ts.isTryStatement(parent)) {
        if (parent.tryBlock === child) continue;
        const catchBinding = parent.catchClause?.variableDeclaration?.name;
        if (parent.catchClause === child
          && (!catchBinding || ts.isIdentifier(catchBinding))
          && statementsDefinitelyThrow(parent.tryBlock.statements)) continue;
        return false;
      }
      return false;
    }
  };
  const collectVarNames = (node: ts.Node): void => {
    if (!strict
      && ts.isFunctionDeclaration(node)
      && node.parent !== sourceFile
      && node.name
      && annexBEligible(node)) {
      const name = node.name.text;
      annexBFunctions.push({
        assignmentPosition: definitelyReached(node) ? node.end : undefined,
        name,
        position: node.getStart(sourceFile),
      });
      varNames.add(name);
      return;
    }
    if (node !== sourceFile && (
      ts.isFunctionLike(node)
      || ts.isClassDeclaration(node)
      || ts.isClassExpression(node)
    )) return;
    if (ts.isVariableDeclarationList(node)
      && (node.flags & ts.NodeFlags.BlockScoped) === 0) {
      for (const declaration of node.declarations) addBindingNames(varNames, declaration.name);
    }
    ts.forEachChild(node, collectVarNames);
  };
  collectVarNames(sourceFile);
  return { annexBFunctions, functionNames, lexicalNames, varNames };
};

const positionSegments = (offsets: readonly number[]): SourcePositionSegment[] => {
  if (offsets.length === 0) return [];
  const segments: SourcePositionSegment[] = [];
  let start = 0;
  for (let index = 1; index < offsets.length; index += 1) {
    if (offsets[index] === offsets[start] + index - start) continue;
    segments.push({
      generatedStart: start,
      generatedEnd: index - 1,
      originalStart: offsets[start],
    });
    start = index;
  }
  segments.push({
    generatedStart: start,
    generatedEnd: offsets.length - 1,
    originalStart: offsets[start],
  });
  return segments;
};

const svgTextOffsets = (
  raw: string,
  decoded: string,
  rawStart: number,
  decodeEntity: (value: string) => string,
): number[] => {
  const offsets = new Array<number>(decoded.length + 1);
  let decodedIndex = 0;
  let inCdata = false;
  let rawIndex = 0;
  offsets[0] = rawStart;
  while (rawIndex < raw.length && decodedIndex < decoded.length) {
    if (!inCdata && raw.startsWith('<![CDATA[', rawIndex)) {
      rawIndex += '<![CDATA['.length;
      offsets[decodedIndex] = rawStart + rawIndex;
      inCdata = true;
      continue;
    }
    if (inCdata && raw.startsWith(']]>', rawIndex)) {
      rawIndex += ']]>'.length;
      offsets[decodedIndex] = rawStart + rawIndex;
      inCdata = false;
      continue;
    }
    if (!inCdata && raw[rawIndex] === '&') {
      const entity = raw.slice(rawIndex).match(
        /^&(?:#[xX][\dA-Fa-f]+;?|#\d+;?|[A-Za-z][\dA-Za-z]+;?)/,
      )?.[0];
      if (entity) {
        const value = decodeEntity(entity);
        if (value !== entity && decoded.startsWith(value, decodedIndex)) {
          for (let index = 0; index < value.length; index += 1) {
            offsets[decodedIndex + index] = rawStart + rawIndex;
          }
          decodedIndex += value.length;
          rawIndex += entity.length;
          offsets[decodedIndex] = rawStart + rawIndex;
          continue;
        }
      }
    }
    const crlf = raw[rawIndex] === '\r' && raw[rawIndex + 1] === '\n';
    const value = raw[rawIndex] === '\r' ? '\n' : raw[rawIndex];
    offsets[decodedIndex] = rawStart + rawIndex;
    decodedIndex += 1;
    rawIndex += crlf ? 2 : 1;
    offsets[decodedIndex] = rawStart + rawIndex;
    if (decoded[decodedIndex - 1] !== value) {
      while (rawIndex < raw.length && raw[rawIndex] !== decoded[decodedIndex]) rawIndex += 1;
      offsets[decodedIndex] = rawStart + rawIndex;
    }
  }
  while (decodedIndex < decoded.length) {
    offsets[decodedIndex] = rawStart + rawIndex;
    decodedIndex += 1;
  }
  offsets[decoded.length] ??= rawStart + rawIndex;
  return offsets;
};

const svgScriptSource = (
  script: Element,
  htmlSource: string,
  parsedHtml: ParsedHtml,
): { source: string; positionSegments: SourcePositionSegment[] } => {
  const decoder = parsedHtml.window.document.createElementNS('http://www.w3.org/2000/svg', 'text');
  const decodeEntity = (value: string): string => {
    decoder.innerHTML = value;
    return decoder.textContent ?? '';
  };
  let source = '';
  const offsets: number[] = [];
  const appendText = (node: Node): void => {
    if (node.nodeType === 3) {
      const location = parsedHtml.nodeLocation(node);
      if (!location) throw new Error('Workspace boundary could not locate SVG script text');
      const text = (node as Text).data;
      const raw = htmlSource.slice(location.startOffset, location.endOffset);
      const nodeOffsets = svgTextOffsets(raw, text, location.startOffset, decodeEntity);
      const generatedStart = source.length;
      source += text;
      for (let index = 0; index < nodeOffsets.length; index += 1) {
        offsets[generatedStart + index] = nodeOffsets[index];
      }
      return;
    }
    for (const child of node.childNodes) appendText(child);
  };
  for (const node of script.childNodes) {
    appendText(node);
  }
  return { source, positionSegments: positionSegments(offsets) };
};

const executableScriptType = (script: Element): 'classic' | 'module' | undefined => {
  const html = script.namespaceURI === 'http://www.w3.org/1999/xhtml';
  if (html) {
    if (script.hasAttribute('src')) return undefined;
  } else if (script.namespaceURI === 'http://www.w3.org/2000/svg') {
    if (script.hasAttribute('href')
      || script.hasAttributeNS('http://www.w3.org/1999/xlink', 'href')) return undefined;
  } else {
    return undefined;
  }
  const classic = (): 'classic' | undefined => (
    html && script.hasAttribute('nomodule') ? undefined : 'classic'
  );

  const attribute = script.getAttribute('type');
  let type: string;
  if (attribute === null) {
    if (script.namespaceURI === 'http://www.w3.org/2000/svg') return classic();
    const language = script.getAttribute('language');
    if (language === null || language === '') return classic();
    type = `text/${language}`;
  } else {
    if (attribute === '') return classic();
    type = attribute;
  }
  const normalized = trimAsciiWhitespace(type).toLowerCase();
  if (javascriptMimeEssences.has(normalized)) return classic();
  return normalized === 'module' ? 'module' : undefined;
};

const executableInputs = (inputs: readonly SourceInput[]): SourceInput[] => inputs.flatMap(input => {
  if (extname(input.path) !== '.html') return [input];
  const scripts: SourceInput[] = [];
  const moduleScripts: Array<{
    async: boolean;
    index: number;
    positionSegments: readonly SourcePositionSegment[];
    source: string;
  }> = [];
  const classicScripts: Array<{
    index: number;
    positionSegments: readonly SourcePositionSegment[];
    source: string;
  }> = [];
  const document = new JSDOM(input.source, { includeNodeLocations: true });
  let index = 0;
  for (const script of document.window.document.querySelectorAll('script')) {
    const type = executableScriptType(script);
    if (!type) continue;
    const location = document.nodeLocation(script);
    if (!location?.startTag) throw new Error(`Workspace boundary could not locate script in ${input.path}`);
    const bodyStart = location.startTag.endOffset;
    const bodyEnd = location.endTag?.startOffset ?? location.endOffset;
    const rawSource = input.source.slice(bodyStart, bodyEnd);
    const prepared = script.namespaceURI === 'http://www.w3.org/2000/svg'
      ? svgScriptSource(script, input.source, document)
      : {
        source: rawSource,
        positionSegments: [{
          generatedStart: 0,
          generatedEnd: rawSource.length,
          originalStart: bodyStart,
        }],
      };
    const { source } = prepared;
    const body = source.trim();
    const onboardingSlot = input.path === 'onboarding/src/shell.html'
      && /^<!--SLOT:(?:DATA|DIFF|RUNTIME)-->$/.test(rawSource.trim());
    if (body.length === 0 || onboardingSlot) continue;
    if (type === 'classic') {
      classicScripts.push({ index, positionSegments: prepared.positionSegments, source });
    } else {
      moduleScripts.push({
        async: script.namespaceURI === 'http://www.w3.org/1999/xhtml'
          && script.hasAttribute('async'),
        index,
        positionSegments: prepared.positionSegments,
        source,
      });
    }
    index += 1;
  }
  type PageGlobalState = Pick<SourceInput,
    'annexBFunctionAssignments' | 'annexBFunctionPositions' | 'positionSegments' | 'source'> & {
    afterIndex: number;
  };
  const pageGlobalStates: PageGlobalState[] = [{
    afterIndex: -1,
    positionSegments: [],
    source: '',
  }];
  if (classicScripts.length > 0) {
    let source = '';
    const activeLexicalNames = new Set<string>();
    const activeVarNames = new Set<string>();
    const annexBFunctionAssignments = new Map<string, number>();
    const annexBFunctionPositions = new Set<number>();
    const globalObject = document.window;
    const globalDescriptors = Object.getOwnPropertyDescriptors(globalObject);
    const globalExtensible = Object.isExtensible(globalObject);
    const restrictedGlobalNames = new Set(Object.entries(globalDescriptors)
      .filter(([, descriptor]) => descriptor.configurable === false)
      .map(([name]) => name));
    const ownGlobalDescriptor = (name: string): PropertyDescriptor | undefined => (
      Object.prototype.hasOwnProperty.call(globalDescriptors, name)
        ? globalDescriptors[name]
        : undefined
    );
    const canDeclareGlobalFunction = (name: string): boolean => {
      const descriptor = ownGlobalDescriptor(name);
      if (!descriptor) return globalExtensible;
      return descriptor.configurable === true || (
        'value' in descriptor
        && descriptor.writable === true
        && descriptor.enumerable === true
      );
    };
    const canDeclareGlobalVar = (name: string): boolean => (
      ownGlobalDescriptor(name) !== undefined || globalExtensible
    );
    const canAssignGlobal = (name: string): boolean => {
      const descriptor = ownGlobalDescriptor(name);
      if (!descriptor) return globalExtensible;
      return 'value' in descriptor
        ? descriptor.writable === true
        : descriptor.set !== undefined;
    };
    const positionSegments: SourcePositionSegment[] = [];
    const classicInputs: SourceInput[] = [];
    for (const script of classicScripts) {
      const authoredScript: SourceInput = {
        path: `${input.path}.__inline_${script.index}.js`,
        compilerPath: `\0doctect-inline/${input.path}/authored-${script.index}.js`,
        reportPath: input.path,
        reportSource: input.source,
        positionSegments: script.positionSegments,
        source: script.source,
      };
      const parseFailure = classicScriptParseFailure(script.source);
      if (parseFailure) {
        classicInputs.push({ ...authoredScript, parseFailure });
        continue;
      }
      const declarations = classicGlobalDeclarations(script.source);
      const activationFails = [...declarations.lexicalNames].some(name => (
        activeLexicalNames.has(name)
        || activeVarNames.has(name)
        || restrictedGlobalNames.has(name)
      )) || [...declarations.varNames].some(name => (
        activeLexicalNames.has(name) || !canDeclareGlobalVar(name)
      )) || [...declarations.functionNames].some(name => !canDeclareGlobalFunction(name));
      if (activationFails) continue;
      for (const name of declarations.lexicalNames) activeLexicalNames.add(name);
      for (const name of declarations.varNames) activeVarNames.add(name);
      if (source.length > 0) source += '\n;\n';
      const generatedStart = source.length;
      source += script.source.startsWith('#!') ? `//${script.source.slice(2)}` : script.source;
      for (const annexBFunction of declarations.annexBFunctions) {
        annexBFunctionPositions.add(generatedStart + annexBFunction.position);
        if (annexBFunction.assignmentPosition === undefined
          || !canAssignGlobal(annexBFunction.name)) continue;
        const assignmentPosition = generatedStart + annexBFunction.assignmentPosition;
        const priorAssignment = annexBFunctionAssignments.get(annexBFunction.name);
        if (priorAssignment === undefined || assignmentPosition < priorAssignment) {
          annexBFunctionAssignments.set(annexBFunction.name, assignmentPosition);
        }
      }
      for (const segment of script.positionSegments) {
        positionSegments.push({
          generatedStart: generatedStart + segment.generatedStart,
          generatedEnd: generatedStart + segment.generatedEnd,
          originalStart: segment.originalStart,
        });
      }
      classicInputs.push({
        path: authoredScript.path,
        analysisStart: generatedStart,
        annexBFunctionAssignments: new Map(annexBFunctionAssignments),
        annexBFunctionPositions: new Set(annexBFunctionPositions),
        authoredScripts: [authoredScript],
        classicLinked: true,
        compilerPath: `\0doctect-inline/${input.path}/classic-${script.index}.js`,
        reportPath: input.path,
        reportSource: input.source,
        positionSegments: [...positionSegments],
        source,
      });
      pageGlobalStates.push({
        afterIndex: script.index,
        annexBFunctionAssignments: new Map(annexBFunctionAssignments),
        annexBFunctionPositions: new Set(annexBFunctionPositions),
        positionSegments: [...positionSegments],
        source,
      });
    }
    scripts.unshift(...classicInputs);
  }
  for (const script of moduleScripts) {
    const authoredScript: SourceInput = {
      path: `${input.path}.__inline_${script.index}.js`,
      compilerPath: `\0doctect-inline/${input.path}/authored-module-${script.index}.js`,
      reportPath: input.path,
      reportSource: input.source,
      positionSegments: script.positionSegments,
      source: script.source,
    };
    const priorStates = pageGlobalStates.filter(state => state.afterIndex < script.index);
    const states = script.async
      ? [
        priorStates.at(-1)!,
        ...pageGlobalStates.filter(state => state.afterIndex > script.index),
      ]
      : [pageGlobalStates.at(-1)!];
    for (const pageGlobals of states) {
      let source = pageGlobals.source;
      if (source.length > 0) source += '\n;\n';
      const moduleStart = source.length;
      source += script.source.startsWith('#!') ? `//${script.source.slice(2)}` : script.source;
      scripts.push({
        path: authoredScript.path,
        analysisStart: moduleStart,
        annexBFunctionAssignments: pageGlobals.annexBFunctionAssignments,
        annexBFunctionPositions: pageGlobals.annexBFunctionPositions,
        authoredScripts: [authoredScript],
        classicLinked: true,
        compilerPath: `\0doctect-inline/${input.path}/${script.index}-${pageGlobals.afterIndex}.js`,
        findingGroup: script.async ? authoredScript.path : undefined,
        moduleStart,
        reportPath: input.path,
        reportSource: input.source,
        positionSegments: [
          ...(pageGlobals.positionSegments ?? []),
          ...script.positionSegments.map(segment => ({
            generatedStart: moduleStart + segment.generatedStart,
            generatedEnd: moduleStart + segment.generatedEnd,
            originalStart: segment.originalStart,
          })),
        ],
        source,
      });
    }
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

  const executable = executableInputs(inputs)
    .filter(input => scriptKinds.has(extname(input.path)));
  for (const input of executable) {
    if (!input.parseFailure) continue;
    const policyPath = input.reportPath ?? input.path;
    const line = reportLine(input, input.parseFailure.offset);
    results.get(policyPath)!.push(
      `${policyPath}:${line}: could not be parsed: ${input.parseFailure.message}`,
    );
  }
  const scripts = executable.filter(input => !input.parseFailure);
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
  const findingIdentities = new Set<string>();
  const moduleLocalSymbols = new Map<string, Map<string, ts.Symbol>>();
  for (const [fileName, input] of scriptsByFile) {
    if (input.moduleStart === undefined) continue;
    const sourceFile = program.getSourceFile(fileName);
    if (!sourceFile) continue;
    const symbols = new Map<string, ts.Symbol>();
    const addIdentifier = (identifier: ts.Identifier): void => {
      const symbol = checker.getSymbolAtLocation(identifier);
      if (symbol) symbols.set(identifier.text, symbol);
    };
    const addBindings = (binding: ts.BindingName): void => {
      if (ts.isIdentifier(binding)) {
        addIdentifier(binding);
        return;
      }
      for (const element of binding.elements) {
        if (!ts.isOmittedExpression(element)) addBindings(element.name);
      }
    };
    const collectModuleVars = (node: ts.Node): void => {
      if (node !== sourceFile && (
        ts.isFunctionLike(node)
        || ts.isClassDeclaration(node)
        || ts.isClassExpression(node)
      )) return;
      if (ts.isVariableDeclarationList(node)
        && (node.flags & ts.NodeFlags.BlockScoped) === 0) {
        for (const declaration of node.declarations) addBindings(declaration.name);
      }
      ts.forEachChild(node, collectModuleVars);
    };
    for (const statement of sourceFile.statements) {
      if (statement.getStart(sourceFile) < input.moduleStart) continue;
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          addBindings(declaration.name);
        }
      } else if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement))
        && statement.name) {
        addIdentifier(statement.name);
      } else if (ts.isImportDeclaration(statement) && statement.importClause) {
        if (statement.importClause.name) addIdentifier(statement.importClause.name);
        const bindings = statement.importClause.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) addIdentifier(bindings.name);
        else if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) addIdentifier(element.name);
        }
      } else if (ts.isImportEqualsDeclaration(statement)) {
        addIdentifier(statement.name);
      }
      collectModuleVars(statement);
    }
    moduleLocalSymbols.set(fileName, symbols);
  }
  const identifierSymbol = (identifier: ts.Identifier): ts.Symbol | undefined => {
    const symbol = checker.getSymbolAtLocation(identifier);
    const fileName = identifier.getSourceFile().fileName;
    const input = scriptsByFile.get(fileName);
    if (input?.moduleStart === undefined
      || identifier.getStart(identifier.getSourceFile()) < input.moduleStart) return symbol;
    if (symbol?.declarations?.some(declaration => (
      declaration.getSourceFile().fileName === fileName
      && declaration.getStart(declaration.getSourceFile()) >= input.moduleStart!
    ))) return symbol;
    return moduleLocalSymbols.get(fileName)?.get(identifier.text) ?? symbol;
  };
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

  const isClassicGlobalVar = (
    declaration: ts.Declaration,
    reference: ts.Identifier,
  ): boolean => {
    const declarationInput = scriptsByFile.get(declaration.getSourceFile().fileName);
    if (!declarationInput?.classicLinked) return false;
    if (declarationInput.moduleStart !== undefined
      && declaration.getStart(declaration.getSourceFile()) >= declarationInput.moduleStart) return false;
    if (ts.isFunctionDeclaration(declaration)
      && declarationInput.annexBFunctionPositions?.has(
        declaration.getStart(declaration.getSourceFile()),
      )) {
      const parent = declaration.parent;
      const lexicalScope = ts.isCaseClause(parent) || ts.isDefaultClause(parent)
        ? parent.parent
        : ts.isBlock(parent) ? parent : declaration;
      if (reference.getSourceFile() === declaration.getSourceFile()
        && reference.getStart(reference.getSourceFile()) >= lexicalScope.getStart()
        && reference.end <= lexicalScope.end) return false;
      return true;
    }
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
  ): boolean => {
    if (!names.has(identifier.text)) return false;
    const declarationInput = scriptsByFile.get(identifier.getSourceFile().fileName);
    const annexBAssignment = declarationInput?.annexBFunctionAssignments?.get(identifier.text);
    if (annexBAssignment !== undefined && annexBAssignment <= identifier.getStart()) return false;
    return !symbol?.declarations?.some(declaration => (
      scriptsByFile.has(declaration.getSourceFile().fileName)
      && !isClassicGlobalVar(declaration, identifier)
    ));
  };

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
      const moduleStart = symbol.declarations?.map(declaration => {
        const declarationInput = scriptsByFile.get(declaration.getSourceFile().fileName);
        return declarationInput?.moduleStart !== undefined
          && declaration.getStart(declaration.getSourceFile()) >= declarationInput.moduleStart
          ? declarationInput.moduleStart
          : undefined;
      }).find((start): start is number => start !== undefined);
      return (origins.get(symbol) ?? [])
        .filter(origin => origin.position <= atPosition && (
          moduleStart === undefined || atPosition < moduleStart || origin.position >= moduleStart
        ))
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
      const symbol = identifierSymbol(expression);
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
    const symbol = identifierSymbol(expression);
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
      const symbol = identifierSymbol(expression);
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
      const symbol = identifierSymbol(expression);
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
    const symbol = identifierSymbol(expression);
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
      const symbol = identifierSymbol(expression);
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
    const appendFinding = (finding: string, identity: string): void => {
      if (input.findingGroup) {
        const groupedIdentity = `${input.findingGroup}\0${identity}`;
        if (findingIdentities.has(groupedIdentity)) return;
        findingIdentities.add(groupedIdentity);
      }
      violations.push(finding);
    };
    const report = (node: ts.Node, message: string): void => {
      const start = node.getStart(sourceFile);
      appendFinding(
        `${policyPath}:${reportLine(input, start)}: ${message}`,
        `${start - (input.moduleStart ?? 0)}:${message}`,
      );
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
        appendFinding(
          `${policyPath}:${reportLine(authoredInput, diagnostic.start ?? 0)}: could not be parsed: ${message}`,
          `parse:${diagnostic.start ?? 0}:${message}`,
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

  it('browser script preparation skips HTML nomodule classic bodies', () => {
    const source = '<script nomodule>const key = \'hype_\' + \'projects\'; '
      + 'localStorage.getItem(key);</script>';
    expect(analyzeSource('nomodule-classic.html', source)).toEqual([]);
  });

  it.each([
    [
      'HTML module',
      '<script type="module" nomodule>const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script>',
    ],
    [
      'SVG classic',
      '<svg><script nomodule>const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script></svg>',
    ],
    [
      'SVG module',
      '<svg><script type="module" nomodule>const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script></svg>',
    ],
  ])('browser script preparation keeps nomodule active for %s', (_case, source) => {
    expect(analyzeSource('nomodule-control.html', source)).toEqual(expect.arrayContaining([
      expect.stringContaining('accesses legacy document key'),
    ]));
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
    ['classic', '', 'hype_&#112;rojects'],
    ['classic named', '', 'hype&lowbar;projects'],
    ['module', ' type="module"', 'hype_&#112;rojects'],
    ['module named', ' type="module"', 'hype&lowbar;projects'],
  ])('SVG parser text decodes %s character references', (_case, type, key) => {
    const source = [
      '<svg>',
      `<script${type}>`,
      `localStorage.getItem("${key}");`,
      '</script>',
      '</svg>',
    ].join('\n');
    expect(analyzeSource('svg-decoded.html', source)).toEqual([
      expect.stringContaining('svg-decoded.html:3: accesses legacy document key'),
    ]);
  });

  it('SVG parser text removes valid CDATA delimiters', () => {
    const source = [
      '<svg>',
      '<script><![CDATA[',
      'window.ready = true;',
      ']]></script>',
      '</svg>',
    ].join('\n');
    expect(analyzeSource('svg-cdata-valid.html', source)).toEqual([]);
  });

  it('SVG parser text detects reconstructed access inside CDATA on its authored line', () => {
    const source = [
      '<svg>',
      '<script><![CDATA[',
      "const key = 'hype_' + 'projects';",
      'localStorage.getItem(key);',
      ']]></script>',
      '</svg>',
    ].join('\n');
    expect(analyzeSource('svg-cdata-access.html', source)).toEqual([
      expect.stringContaining('svg-cdata-access.html:4: accesses legacy document key'),
    ]);
  });

  it('SVG parser text includes descendant text nodes in execution order', () => {
    const source = [
      '<svg>',
      '<script>',
      'localStorage.getItem("hype_<tspan>pro</tspan>jects");',
      '</script>',
      '</svg>',
    ].join('\n');
    expect(analyzeSource('svg-descendant-text.html', source)).toEqual([
      expect.stringContaining('svg-descendant-text.html:3: accesses legacy document key'),
    ]);
  });

  it('HTML raw-text script keeps character references encoded', () => {
    const source = '<script>localStorage.getItem("hype_&#112;rojects");</script>';
    expect(analyzeSource('html-raw-reference.html', source)).toEqual([]);
  });

  it('HTML raw-text script keeps CDATA delimiters as invalid JavaScript', () => {
    const source = '<script><![CDATA[window.ready = true;]]></script>';
    expect(analyzeSource('html-raw-cdata.html', source)).toEqual([
      expect.stringContaining('html-raw-cdata.html:1: could not be parsed'),
    ]);
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
      'classic before module',
      '<script>const key = \'hype_\' + \'projects\';</script>'
        + '<script type="module">localStorage.getItem(key);</script>',
    ],
    [
      'module before classic',
      '<script type="module">localStorage.getItem(key);</script>'
        + '<script>const key = \'hype_\' + \'projects\';</script>',
    ],
  ])('deferred module resolves classic lexical key with %s', (_case, source) => {
    expect(analyzeSource('deferred-module-order.html', source)).toEqual(expect.arrayContaining([
      expect.stringContaining('accesses legacy document key'),
    ]));
  });

  it('deferred module resolves a classic var key', () => {
    const source = '<script>var key = \'hype_\' + \'projects\';</script>'
      + '<script type="module">localStorage.getItem(key);</script>';
    expect(analyzeSource('deferred-module-var.html', source)).toEqual(expect.arrayContaining([
      expect.stringContaining('accesses legacy document key'),
    ]));
  });

  it('deferred module resolves a classic storage alias', () => {
    const source = '<script>const storage = localStorage;</script>'
      + '<script type="module">storage.getItem(\'hype_\' + \'projects\');</script>';
    expect(analyzeSource('deferred-module-storage.html', source)).toEqual(expect.arrayContaining([
      expect.stringContaining('accesses legacy document key'),
    ]));
  });

  it('deferred module resolves a classic callable alias', () => {
    const source = '<script>const read = localStorage.getItem.bind(localStorage);</script>'
      + '<script type="module">read(\'hype_\' + \'projects\');</script>';
    expect(analyzeSource('deferred-module-callable.html', source)).toEqual(expect.arrayContaining([
      expect.stringContaining('accesses legacy document key'),
    ]));
  });

  it('deferred module keeps a failed classic body out of page globals', () => {
    const source = '<script>let location; let self;</script>'
      + '<script type="module">const key = \'hype_\' + \'projects\'; '
      + 'self.localStorage.getItem(key);</script>';
    expect(analyzeSource('deferred-module-failed-classic.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it('deferred module local declaration shadows a classic page global', () => {
    const source = '<script>const key = \'hype_\' + \'projects\';</script>'
      + '<script type="module">const key = \'preference\'; localStorage.getItem(key);</script>';
    expect(analyzeSource('deferred-module-shadow.html', source)).toEqual([]);
  });

  it('deferred module protected-name declaration shadows a classic global var', () => {
    const source = '<script>var localStorage;</script>'
      + '<script type="module">const localStorage = { getItem() {} }; '
      + 'const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script>';
    expect(analyzeSource('deferred-module-protected-shadow.html', source)).toEqual([]);
  });

  it('deferred module declarations stay isolated from other modules', () => {
    const source = '<script>const pageReady = true;</script>'
      + '<script type="module">const key = \'hype_\' + \'projects\';</script>'
      + '<script type="module">void pageReady; localStorage.getItem(key);</script>';
    expect(analyzeSource('deferred-module-isolation.html', source)).toEqual([]);
  });

  it('deferred module declarations never flow back into classic scripts', () => {
    const source = '<script type="module">const key = \'hype_\' + \'projects\';</script>'
      + '<script>localStorage.getItem(key);</script>';
    expect(analyzeSource('deferred-module-reverse-isolation.html', source)).toEqual([]);
  });

  it('deferred module keeps its parse goal and hashbang while resolving classic globals', () => {
    const source = '<script>const key = \'hype_\' + \'projects\';</script>'
      + '<script type="module">#! module\nlocalStorage.getItem(key);</script>';
    expect(analyzeSource('deferred-module-hashbang.html', source)).toEqual([
      expect.stringContaining('deferred-module-hashbang.html:2: accesses legacy document key'),
    ]);
  });

  it('async module timing reports the streamed schedule before a future receiver replacement', () => {
    const source = [
      '<script>var key = \'hype_\' + \'projects\';</script>',
      '<script type="module" async>',
      'self.localStorage.getItem(key);',
      '</script>',
      '<script>{ function self() {} }</script>',
    ].join('\n');
    const accesses = analyzeSource('async-module-streamed.html', source)
      .filter(violation => violation.includes('accesses legacy document key'));
    expect(accesses).toEqual([
      expect.stringContaining('async-module-streamed.html:3: accesses legacy document key'),
    ]);
  });

  it('async module timing reports module-before-future-classic native access', () => {
    const source = '<script type="module" async>const key = \'hype_\' + \'projects\'; '
      + 'self.localStorage.getItem(key);</script>'
      + '<script>{ function self() {} }</script>';
    expect(analyzeSource('async-module-before-classic.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it.each([
    [
      'key',
      'localStorage.getItem(key);',
      'const key = \'hype_\' + \'projects\';',
    ],
    [
      'storage alias',
      'storage.getItem(\'hype_\' + \'projects\');',
      'const storage = localStorage;',
    ],
    [
      'callable alias',
      'read(\'hype_\' + \'projects\');',
      'const read = localStorage.getItem.bind(localStorage);',
    ],
  ])('async module timing includes a late schedule with a future classic %s', (_case, moduleBody, classicBody) => {
    const source = `<script type="module" async>${moduleBody}</script>`
      + `<script>${classicBody}</script>`;
    expect(analyzeSource('async-module-future-origin.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it('async module timing deduplicates a finding exposed by multiple classic states', () => {
    const source = '<script>const key = \'hype_\' + \'projects\';</script>'
      + '<script type="module" async>localStorage.getItem(key);</script>'
      + '<script>const ready = true;</script>';
    const accesses = analyzeSource('async-module-deduplicated.html', source)
      .filter(violation => violation.includes('accesses legacy document key'));
    expect(accesses).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it('async module timing excludes a failed future classic body', () => {
    const source = '<script type="module" async>const key = \'hype_\' + \'projects\'; '
      + 'self.localStorage.getItem(key);</script>'
      + '<script>let location; let self;</script>';
    expect(analyzeSource('async-module-failed-classic.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it('async module timing retains a prior classic receiver replacement', () => {
    const source = '<script>{ function self() {} }</script>'
      + '<script type="module" async>const key = \'hype_\' + \'projects\'; '
      + 'self.localStorage.getItem(key);</script>';
    expect(analyzeSource('async-module-prior-replacement.html', source)).toEqual([]);
  });

  it('async module timing leaves ordinary deferred modules on final classic state', () => {
    const source = '<script>var key = \'hype_\' + \'projects\';</script>'
      + '<script type="module">self.localStorage.getItem(key);</script>'
      + '<script>{ function self() {} }</script>';
    expect(analyzeSource('ordinary-module-final-state.html', source)).toEqual([]);
  });

  it('async module timing examines an intermediate future classic state', () => {
    const source = '<script type="module" async>self.localStorage.getItem(key);</script>'
      + '<script>const key = \'hype_\' + \'projects\';</script>'
      + '<script>{ function self() {} }</script>';
    expect(analyzeSource('async-module-intermediate-state.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it('async module timing keeps sibling async module declarations isolated', () => {
    const source = '<script type="module" async>const key = \'hype_\' + \'projects\';</script>'
      + '<script type="module" async>localStorage.getItem(key);</script>'
      + '<script>const ready = true;</script>';
    expect(analyzeSource('async-module-sibling-isolation.html', source)).toEqual([]);
  });

  it('async module timing does not apply HTML async scheduling to SVG modules', () => {
    const source = '<svg><script type="module" async>const key = \'hype_\' + \'projects\'; '
      + 'self.localStorage.getItem(key);</script></svg>'
      + '<script>{ function self() {} }</script>';
    expect(analyzeSource('svg-module-async-attribute.html', source)).toEqual([]);
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

  it.each([
    ['let', 'let window;'],
    ['const', 'const window = {};'],
    ['class', 'class window {}'],
    ['function', 'function window() {}'],
  ])('classic activation rejects the whole body for a top-level %s window declaration', (_kind, declaration) => {
    const source = [
      '<script>',
      declaration,
      "const failedKey = 'hype_' + 'projects';",
      'localStorage.getItem(failedKey);',
      '</script>',
      '<script>',
      "const key = 'hype_' + 'projects';",
      'window.localStorage.getItem(key);',
      '</script>',
    ].join('\n');
    const accesses = analyzeSource('activation-window.html', source)
      .filter(violation => violation.includes('accesses legacy document key'));
    expect(accesses).toEqual([
      expect.stringContaining('activation-window.html:8: accesses legacy document key'),
    ]);
  });

  it.each(['window', 'document', 'location', 'top', 'Infinity', 'NaN', 'undefined'])(
    'descriptor activation atomically rejects lexical %s',
    name => {
      const source = [
        '<script>',
        `let ${name};`,
        'let self;',
        "const failedKey = 'hype_' + 'projects';",
        'globalThis.localStorage.getItem(failedKey);',
        '</script>',
        '<script>',
        "const key = 'hype_' + 'projects';",
        'self.localStorage.getItem(key);',
        '</script>',
      ].join('\n');
      const accesses = analyzeSource('descriptor-lexical.html', source)
        .filter(violation => violation.includes('accesses legacy document key'));
      expect(accesses).toEqual([
        expect.stringContaining('descriptor-lexical.html:9: accesses legacy document key'),
      ]);
    },
  );

  it.each(['window', 'document', 'location', 'top', 'Infinity', 'NaN', 'undefined'])(
    'descriptor activation atomically rejects function %s',
    name => {
      const source = [
        '<script>',
        `function ${name}() {}`,
        'let self;',
        "const failedKey = 'hype_' + 'projects';",
        'globalThis.localStorage.getItem(failedKey);',
        '</script>',
        '<script>',
        "const key = 'hype_' + 'projects';",
        'self.localStorage.getItem(key);',
        '</script>',
      ].join('\n');
      const accesses = analyzeSource('descriptor-function.html', source)
        .filter(violation => violation.includes('accesses legacy document key'));
      expect(accesses).toEqual([
        expect.stringContaining('descriptor-function.html:9: accesses legacy document key'),
      ]);
    },
  );

  it.each(['window', 'document', 'location', 'top', 'Infinity', 'NaN', 'undefined'])(
    'descriptor activation permits global var for existing own %s',
    name => {
      const source = `<script>var ${name}; let self;</script>`
        + '<script>const key = \'hype_\' + \'projects\'; self.localStorage.getItem(key);</script>';
      expect(analyzeSource('descriptor-var.html', source)).toEqual([]);
    },
  );

  it.each([
    ['configurable lexical property', 'let Object; let self;'],
    ['configurable function property', 'function Object() {} let self;'],
    ['absent function property', 'function projectScoped() {} let self;'],
    ['inherited object name', 'function toString() {} let self;'],
  ])('descriptor activation permits %s', (_case, declaration) => {
    const source = `<script>${declaration}</script>`
      + '<script>const key = \'hype_\' + \'projects\'; self.localStorage.getItem(key);</script>';
    expect(analyzeSource('descriptor-configurable.html', source)).toEqual([]);
  });

  it.each([
    ['false block', 'if (false) { function occupied() {} }'],
    ['false conditional', 'if (false) function occupied() {}'],
    ['labelled function', 'label: function occupied() {}'],
  ])('Annex B %s contributes a global var name before execution', (_case, annexBDeclaration) => {
    const source = [
      `<script>${annexBDeclaration}</script>`,
      '<script>',
      'let occupied;',
      'let self;',
      "const failedKey = 'hype_' + 'projects';",
      'globalThis.localStorage.getItem(failedKey);',
      '</script>',
      '<script>',
      "const key = 'hype_' + 'projects';",
      'self.localStorage.getItem(key);',
      '</script>',
    ].join('\n');
    const accesses = analyzeSource('annex-b-collision.html', source)
      .filter(violation => violation.includes('accesses legacy document key'));
    expect(accesses).toEqual([
      expect.stringContaining('annex-b-collision.html:10: accesses legacy document key'),
    ]);
  });

  it.each([
    ['unconditional block', '{ function self() {} }'],
    ['true conditional', 'if (true) function self() {}'],
    ['false alternate', 'if (false) {} else function self() {}'],
    ['labelled function', 'label: function self() {}'],
  ])('Annex B %s replaces the protected global before a later script', (_case, declaration) => {
    const source = `<script>${declaration}</script>`
      + '<script>const key = \'hype_\' + \'projects\'; self.localStorage.getItem(key);</script>';
    expect(analyzeSource('annex-b-executed.html', source)).toEqual([]);
  });

  it('Annex B false conditional leaves the protected global value native', () => {
    const source = '<script>if (false) function self() {}</script>'
      + '<script>const key = \'hype_\' + \'projects\'; self.localStorage.getItem(key);</script>';
    expect(analyzeSource('annex-b-false.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it.each([
    ['window', 'window.localStorage'],
    ['localStorage', 'localStorage'],
  ])('Annex B reached %s assignment retains native taint when its descriptor rejects writes', (name, receiver) => {
    const source = `<script>{ function ${name}() {} }</script>`
      + `<script>const key = 'hype_' + 'projects'; ${receiver}.getItem(key);</script>`;
    expect(analyzeSource('annex-b-getter-only.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it.each([
    ['self', 'self.localStorage'],
    ['globalThis', 'globalThis.localStorage'],
  ])('Annex B reached %s assignment replaces a writable or settable global', (name, receiver) => {
    const source = `<script>{ function ${name}() {} }</script>`
      + `<script>const key = 'hype_' + 'projects'; ${receiver}.getItem(key);</script>`;
    expect(analyzeSource('annex-b-writable.html', source)).toEqual([]);
  });

  it.each([
    ['prior labelled break', 'outer: { break outer; function self() {} }'],
    ['prior handled throw', 'try { throw 0; function self() {} } catch {}'],
    ['prior continue', 'for (let index = 0; index < 1; index += 1) { continue; function self() {} }'],
    ['uncertain branch', 'if (globalThis.condition) { function self() {} }'],
  ])('Annex B %s reserves its name without proving global replacement', (_case, declaration) => {
    const source = `<script>${declaration}</script>`
      + '<script>const key = \'hype_\' + \'projects\'; self.localStorage.getItem(key);</script>';
    expect(analyzeSource('annex-b-unreached.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it('Annex B intervening lexical declaration prevents global promotion', () => {
    const source = '<script>{ let self; { function self() {} } }</script>'
      + '<script>const key = \'hype_\' + \'projects\'; self.localStorage.getItem(key);</script>';
    expect(analyzeSource('annex-b-intervening-lexical.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it('Annex B ineligible function leaves its name available to later lexical activation', () => {
    const source = '<script>{ let occupied; { function occupied() {} } }</script>'
      + '<script>let occupied; let self;</script>'
      + '<script>const key = \'hype_\' + \'projects\'; self.localStorage.getItem(key);</script>';
    expect(analyzeSource('annex-b-ineligible-activation.html', source)).toEqual([]);
  });

  it('Annex B function in a definitely reached catch replaces a settable global', () => {
    const source = '<script>try { throw 0; } catch { function self() {} }</script>'
      + '<script>const key = \'hype_\' + \'projects\'; self.localStorage.getItem(key);</script>';
    expect(analyzeSource('annex-b-reached-catch.html', source)).toEqual([]);
  });

  it('Annex B destructuring catch failure does not reach its block function', () => {
    const source = '<script>try { throw null; } catch ({ value }) { function self() {} }</script>'
      + '<script>const key = \'hype_\' + \'projects\'; self.localStorage.getItem(key);</script>';
    expect(analyzeSource('annex-b-catch-binding.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it('Annex B sibling block functions remain eligible for global replacement', () => {
    const source = '<script>{ function self() {} function self() {} }</script>'
      + '<script>const key = \'hype_\' + \'projects\'; self.localStorage.getItem(key);</script>';
    expect(analyzeSource('annex-b-sibling-functions.html', source)).toEqual([]);
  });

  it.each([
    ['generator', 'function* self() {}'],
    ['async', 'async function self() {}'],
    ['async generator', 'async function* self() {}'],
  ])('Annex B non-ordinary %s declaration does not replace a protected receiver', (_case, declaration) => {
    const source = `<script>{ ${declaration} }</script>`
      + '<script>const key = \'hype_\' + \'projects\'; self.localStorage.getItem(key);</script>';
    expect(analyzeSource('annex-b-non-ordinary-receiver.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it.each([
    ['generator', 'function* occupied() {}'],
    ['async', 'async function occupied() {}'],
    ['async generator', 'async function* occupied() {}'],
  ])('Annex B non-ordinary %s declaration permits later lexical activation', (_case, declaration) => {
    const source = `<script>{ ${declaration} }</script>`
      + '<script>let occupied; const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script>';
    expect(analyzeSource('annex-b-non-ordinary-activation.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it.each([
    ['generator', 'function* self() {}'],
    ['async', 'async function self() {}'],
    ['async generator', 'async function* self() {}'],
  ])('Annex B non-ordinary %s declaration blocks nested same-name promotion', (_case, declaration) => {
    const source = `<script>{ ${declaration} { function self() {} } }</script>`
      + '<script>const key = \'hype_\' + \'projects\'; self.localStorage.getItem(key);</script>';
    expect(analyzeSource('annex-b-non-ordinary-intervening.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it('Annex B non-ordinary filtering retains ordinary block-function promotion', () => {
    const source = '<script>{ function self() {} }</script>'
      + '<script>const key = \'hype_\' + \'projects\'; self.localStorage.getItem(key);</script>';
    expect(analyzeSource('annex-b-ordinary-control.html', source)).toEqual([]);
  });

  it('Annex B catch eligibility rejects a same-name destructuring catch binding', () => {
    const source = '<script>try { throw { self: 1 }; } '
      + 'catch ({ self }) { { function self() {} } }</script>'
      + '<script>let self; const key = \'hype_\' + \'projects\'; localStorage.getItem(key);</script>';
    expect(analyzeSource('annex-b-catch-destructuring-name.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it('Annex B catch eligibility preserves same-name simple catch promotion', () => {
    const source = '<script>try { throw 0; } catch (self) { { function self() {} } }</script>'
      + '<script>const key = \'hype_\' + \'projects\'; self.localStorage.getItem(key);</script>';
    expect(analyzeSource('annex-b-catch-simple-name.html', source)).toEqual([]);
  });

  it('Annex B catch eligibility keeps different-name destructuring reachability conservative', () => {
    const source = '<script>try { throw { value: 1 }; } '
      + 'catch ({ value }) { { function self() {} } }</script>'
      + '<script>const key = \'hype_\' + \'projects\'; self.localStorage.getItem(key);</script>';
    expect(analyzeSource('annex-b-catch-destructuring-control.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it.each([
    ['localStorage', 'localStorage'],
    ['window', 'window.localStorage'],
    ['self', 'self.localStorage'],
    ['globalThis', 'globalThis.localStorage'],
  ])('Annex B block lexical %s binding shadows native access before and after its declaration', (name, receiver) => {
    const source = `<script>{ const beforeKey = 'hype_' + 'projects'; ${receiver}.getItem(beforeKey); `
      + `function ${name}() {} const afterKey = 'hype_' + 'projects'; `
      + `${receiver}.getItem(afterKey); }</script>`;
    expect(analyzeSource('annex-b-block-lexical-order.html', source)).toEqual([]);
  });

  it.each([
    ['localStorage', 'localStorage'],
    ['window', 'window.localStorage'],
    ['self', 'self.localStorage'],
    ['globalThis', 'globalThis.localStorage'],
  ])('Annex B block lexical %s binding shadows native access inside its function body', (name, receiver) => {
    const source = `<script>{ function ${name}() { const key = 'hype_' + 'projects'; `
      + `${receiver}.getItem(key); } }</script>`;
    expect(analyzeSource('annex-b-block-lexical-body.html', source)).toEqual([]);
  });

  it.each([
    ['getter-only localStorage', 'localStorage', 'localStorage', true],
    ['getter-only window', 'window', 'window.localStorage', true],
    ['settable self', 'self', 'self.localStorage', false],
    ['writable globalThis', 'globalThis', 'globalThis.localStorage', false],
  ])('Annex B block lexical keeps %s outside-block synthetic-global behavior', (_case, name, receiver, reports) => {
    const source = `<script>{ function ${name}() {} }</script>`
      + `<script>const key = 'hype_' + 'projects'; ${receiver}.getItem(key);</script>`;
    const accesses = analyzeSource('annex-b-block-lexical-outside.html', source)
      .filter(violation => violation.includes('accesses legacy document key'));
    expect(accesses).toHaveLength(reports ? 1 : 0);
  });

  it('Annex B block lexical handling preserves ordinary top-level function shadowing', () => {
    const source = '<script>function localStorage() {} const key = \'hype_\' + \'projects\'; '
      + 'localStorage.getItem(key);</script>';
    expect(analyzeSource('top-level-function-shadow.html', source)).toEqual([]);
  });

  it('Annex B block lexical binding covers its complete switch case block', () => {
    const source = '<script>switch (0) { case 0: const key = \'hype_\' + \'projects\'; '
      + 'localStorage.getItem(key); function localStorage() {} }</script>';
    expect(analyzeSource('annex-b-case-block-lexical.html', source)).toEqual([]);
  });

  it.each([
    ['getter-only localStorage', 'localStorage', 'localStorage'],
    ['settable self', 'self', 'self.localStorage'],
  ])('Annex B block lexical keeps native %s before outside-block assignment', (_case, name, receiver) => {
    const source = `<script>const key = 'hype_' + 'projects'; ${receiver}.getItem(key); `
      + `{ function ${name}() {} }</script>`;
    expect(analyzeSource('annex-b-before-global-assignment.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it('strict block function remains block-local for later declaration activation', () => {
    const source = '<script>"use strict"; { function occupied() {} }</script>'
      + '<script>let occupied; let self;</script>'
      + '<script>const key = \'hype_\' + \'projects\'; self.localStorage.getItem(key);</script>';
    expect(analyzeSource('annex-b-strict-activation.html', source)).toEqual([]);
  });

  it('strict block function does not replace a protected global', () => {
    const source = '<script>"use strict"; { function self() {} }</script>'
      + '<script>const key = \'hype_\' + \'projects\'; self.localStorage.getItem(key);</script>';
    expect(analyzeSource('annex-b-strict-global.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it.each([
    ['lexical/lexical', 'let occupied;', 'let occupied;'],
    ['lexical/var', 'let occupied;', 'var occupied;'],
    ['lexical/function', 'let occupied;', 'function occupied() {}'],
    ['var/lexical', 'var occupied;', 'let occupied;'],
  ])('classic activation installs nothing after a prior %s collision', (_case, prior, conflicting) => {
    const source = [
      `<script>${prior}</script>`,
      '<script>',
      conflicting,
      'let self;',
      "const failedKey = 'hype_' + 'projects';",
      'globalThis.localStorage.getItem(failedKey);',
      '</script>',
      '<script>',
      "const key = 'hype_' + 'projects';",
      'self.localStorage.getItem(key);',
      '</script>',
    ].join('\n');
    const accesses = analyzeSource('activation-atomic.html', source)
      .filter(violation => violation.includes('accesses legacy document key'));
    expect(accesses).toEqual([
      expect.stringContaining('activation-atomic.html:10: accesses legacy document key'),
    ]);
  });

  it.each((['localStorage', 'self', 'globalThis'] as const).flatMap(name => [
    [name, 'let', `let ${name};`],
    [name, 'const', `const ${name} = {};`],
    [name, 'class', `class ${name} {}`],
    [name, 'function', `function ${name}() {}`],
  ]))('classic activation carries successful prior %s %s declaration forward', (name, _kind, declaration) => {
    const receiver = name === 'localStorage' ? name : `${name}.localStorage`;
    const source = `<script>${declaration}</script>`
      + `<script>const key = 'hype_' + 'projects'; ${receiver}.getItem(key);</script>`;
    expect(analyzeSource('temporal-forward.html', source)).toEqual([]);
  });

  it.each([
    ['default import', "import value from './value.js';"],
    ['named import', "import { value } from './value.js';"],
    ['named export declaration', 'export const value = 1;'],
    ['default export', 'export default 1;'],
    ['export list', 'const value = 1; export { value };'],
    ['export assignment', 'const value = 1; export = value;'],
    ['import.meta', 'void import.meta;'],
  ])('classic Script parse goal rejects %s', (_case, statement) => {
    const source = ['<script>', '', statement, '</script>'].join('\n');
    const parseFailures = analyzeSource('classic-script-goal.html', source)
      .filter(violation => violation.includes('could not be parsed'));
    expect(parseFailures).toEqual([
      expect.stringContaining('classic-script-goal.html:3: could not be parsed'),
    ]);
  });

  it('classic Script parse failure neither executes nor seeds later linked scope', () => {
    const source = [
      '<script>',
      "import value from './value.js';",
      'let self;',
      "const failedKey = 'hype_' + 'projects';",
      'localStorage.getItem(failedKey);',
      '</script>',
      '<script>',
      "const key = 'hype_' + 'projects';",
      'self.localStorage.getItem(key);',
      '</script>',
    ].join('\n');
    const violations = analyzeSource('classic-invalid-prefix.html', source);
    expect(violations.filter(violation => violation.includes('could not be parsed'))).toEqual([
      expect.stringContaining('classic-invalid-prefix.html:2: could not be parsed'),
    ]);
    expect(violations.filter(violation => violation.includes('accesses legacy document key'))).toEqual([
      expect.stringContaining('classic-invalid-prefix.html:9: accesses legacy document key'),
    ]);
  });

  it('classic Script parse goal allows dynamic import expressions', () => {
    const source = '<script>void import(\'./value.js\');</script>';
    expect(analyzeSource('classic-dynamic-import.html', source)).toEqual([]);
  });

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

  it.each([
    [
      'classic entity newline',
      '',
      '<script>const value = 1;&#10;const broken = ;</script>',
      2,
    ],
    [
      'module entity newline',
      ' type="module"',
      '<script type="module">const value = 1;&#10;const broken = ;</script>',
      2,
    ],
    [
      'classic CDATA text',
      '',
      '<script><![CDATA[const value = 1;\nconst broken = ;]]></script>',
      3,
    ],
    [
      'module CDATA text',
      ' type="module"',
      '<script type="module"><![CDATA[const value = 1;\nconst broken = ;]]></script>',
      3,
    ],
    [
      'classic descendant text',
      '',
      '<script>const value = 1;<tspan\n data-marker="x">const broken = ;</tspan></script>',
      3,
    ],
    [
      'module descendant text',
      ' type="module"',
      '<script type="module">const value = 1;<tspan\n data-marker="x">const broken = ;</tspan></script>',
      3,
    ],
  ])('SVG parse diagnostic maps %s to its authored raw line', (_case, _type, script, line) => {
    const source = ['<svg>', script, '</svg>'].join('\n');
    const parseFailures = analyzeSource('svg-parse-location.html', source)
      .filter(violation => violation.includes('could not be parsed'));
    expect(parseFailures).toEqual([
      expect.stringContaining(`svg-parse-location.html:${line}: could not be parsed`),
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
