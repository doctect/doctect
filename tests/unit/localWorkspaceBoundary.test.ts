import { spawnSync } from 'node:child_process';
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
import { buildBrowserPreferencesBundle } from '../../onboarding/build.mjs';

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
const exactLegacyKeyAllowed = new Set([
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
const reflectiveLocalStorageMethods = new Map([
  ['Object', new Set(['defineProperty', 'getOwnPropertyDescriptor', 'hasOwn'])],
  ['Reflect', new Set([
    'defineProperty',
    'deleteProperty',
    'get',
    'getOwnPropertyDescriptor',
    'has',
    'set',
  ])],
]);
const browserGlobalNames = new Set(['window', 'globalThis', 'self']);
const approvedBrowserRootProperties = new Set([
  'DOCTECT',
  'DoctectDiff',
  'HTMLTextAreaElement',
  'Reflect',
  '__tutCursor',
  'addEventListener',
  'alert',
  'clearTimeout',
  'close',
  'confirm',
  'crypto',
  'getSelection',
  'indexedDB',
  'innerHeight',
  'innerWidth',
  'location',
  'matchMedia',
  'onmessage',
  'prompt',
  'removeEventListener',
  'scrollTo',
  'scrollX',
  'scrollY',
  'sessionStorage',
  'setTimeout',
]);
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

interface SourcePositionSegment {
  generatedStart: number;
  generatedEnd: number;
  originalStart: number;
}

interface ParseFailure {
  message: string;
  offset: number;
}

interface SourceInput {
  path: string;
  source: string;
  directStorageBoundary?: boolean;
  moduleGoal?: boolean;
  parseFailure?: ParseFailure;
  positionSegments?: readonly SourcePositionSegment[];
  reportPath?: string;
  reportSource?: string;
}

type DirectStorageBoundaryInput = SourceInput & { directStorageBoundary: true };
type ReadDirectory = (directory: string) => Dirent[];

const nodeRequire = createRequire(import.meta.url);
const { JSDOM } = nodeRequire('jsdom') as {
  JSDOM: new (source: string, options: { includeNodeLocations: true }) => ParsedHtml;
};
const DirectSourceTextModule = (nodeRequire('node:vm') as {
  SourceTextModule?: new (source: string, options: { identifier: string }) => object;
}).SourceTextModule;

const workflowRunsOnEveryPullRequest = (workflow: string): boolean => {
  const jobsStart = workflow.search(/^jobs:/m);
  const header = jobsStart === -1 ? workflow : workflow.slice(0, jobsStart);
  const activeLines = header.split(/\r?\n/).map(line => (
    line.replace(/^\s*#.*$/, '').replace(/\s+#.*$/, '').trimEnd()
  ));
  return activeLines.some(line => /^  pull_request:\s*\{\}$/.test(line))
    && !activeLines.some(line => /^    paths(?:-ignore)?:/.test(line));
};

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

const classicScriptParseFailure = (source: string): ParseFailure | undefined => {
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

const moduleParseFailureCache = new Map<string, ParseFailure | undefined>();
const moduleParserProgram = `
const { SourceTextModule } = require('node:vm');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  const sources = JSON.parse(input);
  const results = sources.map((source, index) => {
    try {
      new SourceTextModule(source, { identifier: 'doctect-inline-module-' + index + '.js' });
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });
  process.stdout.write(JSON.stringify(results));
});
`;

const locateModuleParseFailure = (source: string, fallbackMessage: string): ParseFailure => {
  const result = spawnSync(process.execPath, ['--input-type=module', '--check'], {
    encoding: 'utf8',
    input: source,
    maxBuffer: 2 * 1024 * 1024,
    timeout: 5_000,
  });
  if (result.error) throw result.error;
  const lines = result.stderr.split('\n');
  const headerIndex = lines.findIndex(line => /^\[stdin\]:\d+$/.test(line));
  const line = Number(lines[headerIndex]?.match(/:(\d+)$/)?.[1] ?? 1);
  const column = headerIndex === -1 ? 0 : Math.max(lines[headerIndex + 2]?.indexOf('^') ?? 0, 0);
  const message = result.stderr.match(/^SyntaxError: (.+)$/m)?.[1] ?? fallbackMessage;
  return { message, offset: generatedOffset(source, line, column) };
};

const cacheModuleParseFailure = (source: string, failure: ParseFailure | undefined): void => {
  if (moduleParseFailureCache.size >= 512) {
    const oldest = moduleParseFailureCache.keys().next().value as string | undefined;
    if (oldest !== undefined) moduleParseFailureCache.delete(oldest);
  }
  moduleParseFailureCache.set(source, failure);
};

const moduleParseFailures = (sources: readonly string[]): Map<string, ParseFailure | undefined> => {
  const failures = new Map<string, ParseFailure | undefined>();
  for (const source of sources) {
    if (moduleParseFailureCache.has(source)) failures.set(source, moduleParseFailureCache.get(source));
  }
  const pending = [...new Set(sources)].filter(source => !moduleParseFailureCache.has(source));
  for (let start = 0; start < pending.length; start += 64) {
    const batch = pending.slice(start, start + 64);
    const messages = DirectSourceTextModule
      ? batch.map((source, index) => {
        try {
          new DirectSourceTextModule(source, { identifier: `doctect-inline-module-${index}.js` });
          return null;
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      })
      : (() => {
        const result = spawnSync(
          process.execPath,
          ['--no-warnings', '--experimental-vm-modules', '-e', moduleParserProgram],
          {
            encoding: 'utf8',
            input: JSON.stringify(batch),
            maxBuffer: 2 * 1024 * 1024,
            timeout: 5_000,
          },
        );
        if (result.error) throw result.error;
        if (result.status !== 0) {
          throw new Error(`Workspace boundary module parser failed: ${result.stderr.trim()}`);
        }
        return JSON.parse(result.stdout) as Array<string | null>;
      })();
    if (messages.length !== batch.length) {
      throw new Error('Workspace boundary module parser returned an invalid result count');
    }
    for (const [index, source] of batch.entries()) {
      const message = messages[index];
      const failure = message === null ? undefined : locateModuleParseFailure(source, message);
      cacheModuleParseFailure(source, failure);
      failures.set(source, failure);
    }
  }
  return failures;
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
  for (const node of script.childNodes) appendText(node);
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
    if (!html) return classic();
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
    const onboardingSlot = input.path === 'onboarding/src/shell.html'
      && /^<!--SLOT:(?:DATA|DIFF|RUNTIME)-->$/.test(rawSource.trim());
    if (prepared.source.trim().length === 0 || onboardingSlot) continue;
    scripts.push({
      path: `${input.path}.__inline_${index}.js`,
      source: prepared.source,
      directStorageBoundary: input.directStorageBoundary,
      moduleGoal: type === 'module',
      parseFailure: type === 'classic' ? classicScriptParseFailure(prepared.source) : undefined,
      positionSegments: prepared.positionSegments,
      reportPath: input.path,
      reportSource: input.source,
    });
    index += 1;
  }
  return scripts;
});

const originalOffset = (input: SourceInput, generated: number): number => {
  if (!input.positionSegments) return generated;
  for (const segment of input.positionSegments) {
    if (generated < segment.generatedStart) return segment.originalStart;
    if (generated <= segment.generatedEnd) {
      return segment.originalStart + generated - segment.generatedStart;
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

const reportLine = (input: SourceInput, generated: number): number =>
  sourceLine(input.reportSource ?? input.source, originalOffset(input, generated));

const directStringLiteral = (input: ts.Expression | undefined): string | undefined => {
  if (!input) return undefined;
  const expression = unwrap(input);
  return ts.isStringLiteralLike(expression) ? expression.text : undefined;
};

const directPropertyName = (name: ts.PropertyName): string | undefined => {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return ts.isComputedPropertyName(name) ? directStringLiteral(name.expression) : undefined;
};

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean => (
  ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some(modifier => modifier.kind === kind) ?? false)
);

const privateConstInitializer = (sourceFile: ts.SourceFile, name: string): ts.Expression | undefined => {
  const matches = sourceFile.statements.flatMap(statement => {
    if (!ts.isVariableStatement(statement)
      || hasModifier(statement, ts.SyntaxKind.ExportKeyword)
      || (statement.declarationList.flags & ts.NodeFlags.Const) === 0) return [];
    return statement.declarationList.declarations.filter(declaration => (
      ts.isIdentifier(declaration.name) && declaration.name.text === name
    ));
  });
  return matches.length === 1 ? matches[0].initializer : undefined;
};

type FallbackKind = 'null' | 'false';

const isFallbackReturn = (statement: ts.Statement, fallback: FallbackKind): boolean => (
  ts.isReturnStatement(statement)
  && statement.expression?.kind === (fallback === 'null'
    ? ts.SyntaxKind.NullKeyword
    : ts.SyntaxKind.FalseKeyword)
);

const privateArrowBody = (
  sourceFile: ts.SourceFile,
  name: string,
  parameters: readonly string[],
): ts.Block | undefined => {
  const initializer = privateConstInitializer(sourceFile, name);
  if (!initializer
    || !ts.isArrowFunction(initializer)
    || !ts.isBlock(initializer.body)
    || initializer.parameters.length !== parameters.length
    || initializer.parameters.some((parameter, index) => (
      !ts.isIdentifier(parameter.name)
      || parameter.name.text !== parameters[index]
      || parameter.initializer !== undefined
      || parameter.dotDotDotToken !== undefined
    ))) return undefined;
  return initializer.body;
};

const isRuntimeKeyGuard = (statement: ts.Statement, fallback: FallbackKind): boolean => {
  if (!ts.isIfStatement(statement)
    || statement.elseStatement !== undefined
    || !isFallbackReturn(statement.thenStatement, fallback)) return false;
  const condition = unwrap(statement.expression);
  if (!ts.isPrefixUnaryExpression(condition)
    || condition.operator !== ts.SyntaxKind.ExclamationToken) return false;
  const call = unwrap(condition.operand);
  return ts.isCallExpression(call)
    && ts.isIdentifier(call.expression)
    && call.expression.text === 'isRuntimeBrowserPreferenceKey'
    && call.arguments.length === 1
    && ts.isIdentifier(call.arguments[0])
    && call.arguments[0].text === 'key';
};

const isWindowGuard = (statement: ts.Statement, fallback: FallbackKind): boolean => {
  if (!ts.isIfStatement(statement)
    || statement.elseStatement !== undefined
    || !isFallbackReturn(statement.thenStatement, fallback)) return false;
  const condition = unwrap(statement.expression);
  return ts.isBinaryExpression(condition)
    && condition.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
    && ts.isTypeOfExpression(condition.left)
    && ts.isIdentifier(condition.left.expression)
    && condition.left.expression.text === 'window'
    && ts.isStringLiteralLike(condition.right)
    && condition.right.text === 'undefined';
};

const exactStorageCall = (
  expression: ts.Expression,
  method: string,
  argumentNames: readonly string[],
): ts.CallExpression | undefined => {
  const call = unwrap(expression);
  if (!ts.isCallExpression(call)
    || call.arguments.length !== argumentNames.length
    || call.arguments.some((argument, index) => (
      !ts.isIdentifier(argument) || argument.text !== argumentNames[index]
    ))) return undefined;
  const member = unwrap(call.expression);
  if (!ts.isPropertyAccessExpression(member) || member.name.text !== method) return undefined;
  const storage = unwrap(member.expression);
  return ts.isPropertyAccessExpression(storage)
    && ts.isIdentifier(storage.expression)
    && storage.expression.text === 'window'
    && storage.name.text === 'localStorage'
    ? call
    : undefined;
};

const hasExactCatch = (statement: ts.TryStatement, fallback: FallbackKind): boolean => (
  statement.finallyBlock === undefined
  && statement.catchClause !== undefined
  && statement.catchClause.variableDeclaration === undefined
  && statement.catchClause.block.statements.length === 1
  && isFallbackReturn(statement.catchClause.block.statements[0], fallback)
);

const browserPreferenceStorageApprovals = (sourceFile: ts.SourceFile): ts.CallExpression[] => {
  const readBody = privateArrowBody(sourceFile, 'readRuntimeBrowserPreference', ['key']);
  const writeBody = privateArrowBody(sourceFile, 'writeRuntimeBrowserPreference', ['key', 'value']);
  if (!readBody || !writeBody
    || readBody.statements.length !== 2
    || writeBody.statements.length !== 2
    || !isRuntimeKeyGuard(readBody.statements[0], 'null')
    || !isRuntimeKeyGuard(writeBody.statements[0], 'false')) return [];
  const readTry = readBody.statements[1];
  const writeTry = writeBody.statements[1];
  if (!ts.isTryStatement(readTry)
    || !ts.isTryStatement(writeTry)
    || !hasExactCatch(readTry, 'null')
    || !hasExactCatch(writeTry, 'false')
    || readTry.tryBlock.statements.length !== 2
    || writeTry.tryBlock.statements.length !== 3
    || !isWindowGuard(readTry.tryBlock.statements[0], 'null')
    || !isWindowGuard(writeTry.tryBlock.statements[0], 'false')) return [];
  const readReturn = readTry.tryBlock.statements[1];
  const writeExpression = writeTry.tryBlock.statements[1];
  const writeReturn = writeTry.tryBlock.statements[2];
  if (!ts.isReturnStatement(readReturn)
    || !readReturn.expression
    || !ts.isExpressionStatement(writeExpression)
    || !ts.isReturnStatement(writeReturn)
    || writeReturn.expression?.kind !== ts.SyntaxKind.TrueKeyword) return [];
  const readCall = exactStorageCall(readReturn.expression, 'getItem', ['key']);
  const writeCall = exactStorageCall(writeExpression.expression, 'setItem', ['key', 'value']);
  return readCall && writeCall ? [readCall, writeCall] : [];
};

const exportedConstInitializer = (sourceFile: ts.SourceFile, name: string): ts.Expression | undefined => {
  const matches = sourceFile.statements.flatMap(statement => {
    if (!ts.isVariableStatement(statement)
      || !hasModifier(statement, ts.SyntaxKind.ExportKeyword)
      || (statement.declarationList.flags & ts.NodeFlags.Const) === 0) return [];
    return statement.declarationList.declarations.filter(declaration => (
      ts.isIdentifier(declaration.name) && declaration.name.text === name
    ));
  });
  return matches.length === 1 ? matches[0].initializer : undefined;
};

const localWorkspaceStorageApprovals = (sourceFile: ts.SourceFile): ts.CallExpression[] => {
  const initializer = exportedConstInitializer(sourceFile, 'localWorkspaceStore');
  const storeCall = initializer ? unwrap(initializer) : undefined;
  if (!storeCall
    || !ts.isCallExpression(storeCall)
    || !ts.isIdentifier(storeCall.expression)
    || storeCall.expression.text !== 'createLocalWorkspaceStore'
    || storeCall.arguments.length !== 1) return [];
  const environment = unwrap(storeCall.arguments[0]);
  if (!ts.isObjectLiteralExpression(environment)) return [];
  const legacyStorage = environment.properties.filter(property => (
    ts.isPropertyAssignment(property)
    && directPropertyName(property.name) === 'legacyStorage'
    && ts.isObjectLiteralExpression(property.initializer)
  ));
  if (legacyStorage.length !== 1 || !ts.isPropertyAssignment(legacyStorage[0])) return [];
  const legacyObject = legacyStorage[0].initializer;
  if (!ts.isObjectLiteralExpression(legacyObject)) return [];
  const getItems = legacyObject.properties.filter(property => (
    ts.isMethodDeclaration(property) && directPropertyName(property.name) === 'getItem'
  ));
  if (getItems.length !== 1 || !ts.isMethodDeclaration(getItems[0])) return [];
  const getItem = getItems[0];
  if (!getItem.body
    || getItem.body.statements.length !== 1
    || getItem.parameters.length !== 1
    || !ts.isIdentifier(getItem.parameters[0].name)
    || getItem.parameters[0].name.text !== 'key') return [];
  const returnStatement = getItem.body.statements[0];
  if (!ts.isReturnStatement(returnStatement) || !returnStatement.expression) return [];
  const call = exactStorageCall(returnStatement.expression, 'getItem', ['key']);
  return call ? [call] : [];
};

const hasExactBrowserPreferenceExports = (sourceFile: ts.SourceFile): boolean => {
  const expectedValues = new Map<string, {
    body: string;
    parameters: ReadonlyArray<readonly [name: string, type: string]>;
    returnType: string;
  }>([
    ['markMigrationReceiptSeen', {
      body: "(typeofreceiptId==='string'&&writeRuntimeBrowserPreference(migrationReceiptKey(receiptId),'1'))",
      parameters: [['receiptId', 'string']],
      returnType: 'boolean',
    }],
    ['readBrowserPreference', {
      body: '(isBrowserPreferenceKey(key)?readRuntimeBrowserPreference(key):null)',
      parameters: [['key', 'BrowserPreferenceKey']],
      returnType: 'string|null',
    }],
    ['wasMigrationReceiptSeen', {
      body: "(typeofreceiptId==='string'&&readRuntimeBrowserPreference(migrationReceiptKey(receiptId))==='1')",
      parameters: [['receiptId', 'string']],
      returnType: 'boolean',
    }],
    ['writeBrowserPreference', {
      body: '(isBrowserPreferenceKey(key)&&writeRuntimeBrowserPreference(key,value))',
      parameters: [['key', 'BrowserPreferenceKey'], ['value', 'string']],
      returnType: 'boolean',
    }],
  ]);
  const compact = (node: ts.Node): string => node.getText(sourceFile).replace(/\s+/g, '');
  const exactValueImplementation = (name: string, initializer: ts.Expression): boolean => {
    const expected = expectedValues.get(name);
    const arrow = unwrap(initializer);
    return expected !== undefined
      && ts.isArrowFunction(arrow)
      && arrow.typeParameters === undefined
      && arrow.parameters.length === expected.parameters.length
      && arrow.parameters.every((parameter, index) => (
        ts.isIdentifier(parameter.name)
        && parameter.name.text === expected.parameters[index][0]
        && parameter.type !== undefined
        && compact(parameter.type) === expected.parameters[index][1]
        && parameter.dotDotDotToken === undefined
        && parameter.initializer === undefined
        && parameter.questionToken === undefined
      ))
      && arrow.type !== undefined
      && compact(arrow.type) === expected.returnType
      && compact(arrow.body) === expected.body;
  };
  const valueCounts = new Map<string, number>();
  let typeCount = 0;
  let fixedTypeCount = 0;
  let invalidExport = false;
  for (const statement of sourceFile.statements) {
    if (ts.isTypeAliasDeclaration(statement)
      && !hasModifier(statement, ts.SyntaxKind.ExportKeyword)
      && statement.name.text === 'FixedBrowserPreferenceKey') {
      if (compact(statement.type) === 'typeoffixedBrowserPreferenceKeys[number]') fixedTypeCount += 1;
      else invalidExport = true;
      continue;
    }
    if (ts.isVariableStatement(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0) {
        invalidExport = true;
        continue;
      }
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)
          || !expectedValues.has(declaration.name.text)
          || !declaration.initializer
          || !exactValueImplementation(declaration.name.text, declaration.initializer)) {
          invalidExport = true;
          continue;
        }
        valueCounts.set(declaration.name.text, (valueCounts.get(declaration.name.text) ?? 0) + 1);
      }
    } else if (ts.isTypeAliasDeclaration(statement)
      && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      if (statement.name.text === 'BrowserPreferenceKey'
        && compact(statement.type) === 'FixedBrowserPreferenceKey') typeCount += 1;
      else invalidExport = true;
    } else if (ts.isExportDeclaration(statement)
      || ts.isExportAssignment(statement)
      || hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      invalidExport = true;
    }
  }
  return !invalidExport
    && typeCount === 1
    && fixedTypeCount === 1
    && valueCounts.size === expectedValues.size
    && [...expectedValues.keys()].every(name => valueCounts.get(name) === 1);
};

const isLegacyTypesModule = (specifier: string): boolean => {
  const normalized = specifier.split(/[?#]/, 1)[0].replaceAll('\\', '/');
  const basename = normalized.slice(normalized.lastIndexOf('/') + 1);
  return /^legacyTypes(?:\..+)?$/.test(basename);
};

const analyzeSources = (inputs: readonly SourceInput[]): Map<string, string[]> => {
  const results = new Map(inputs.map(input => [input.path, [] as string[]]));
  const resultIdentities = new Map(inputs.map(input => [input.path, new Set<string>()]));
  const approvedBrowserPreferencesBundle = inputs.some(input => (
    input.directStorageBoundary === true && input.path === 'onboarding/index.html'
  )) ? buildBrowserPreferencesBundle(root) : undefined;

  for (const input of inputs) {
    if (exactLegacyKeyAllowed.has(input.path)) continue;
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

  const executable = executableInputs(inputs).filter(input => scriptKinds.has(extname(input.path)));
  const moduleFailures = moduleParseFailures(
    executable.filter(input => input.moduleGoal).map(input => input.source),
  );
  for (const input of executable) {
    const policyPath = input.reportPath ?? input.path;
    const violations = results.get(policyPath)!;
    const identities = resultIdentities.get(policyPath)!;
    const appendFinding = (finding: string): void => {
      if (identities.has(finding)) return;
      identities.add(finding);
      violations.push(finding);
    };
    const reportOffset = (offset: number, message: string): void => {
      appendFinding(`${policyPath}:${reportLine(input, offset)}: ${message}`);
    };
    const parseFailure = input.parseFailure ?? (input.moduleGoal
      ? moduleFailures.get(input.source)
      : undefined);
    if (parseFailure) {
      reportOffset(parseFailure.offset, `could not be parsed: ${parseFailure.message}`);
      continue;
    }

    const sourceFile = ts.createSourceFile(
      input.path,
      input.source,
      ts.ScriptTarget.Latest,
      true,
      scriptKinds.get(extname(input.path)),
    );
    const parseDiagnostics = (sourceFile as ts.SourceFile & {
      parseDiagnostics: readonly ts.Diagnostic[];
    }).parseDiagnostics;
    if (parseDiagnostics.length > 0) {
      for (const diagnostic of parseDiagnostics) {
        reportOffset(
          diagnostic.start ?? 0,
          `could not be parsed: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`,
        );
      }
      continue;
    }

    const importsAllowed = policyPath.startsWith('services/localWorkspace/')
      || policyPath === 'tests/helpers/localWorkspaceFixtures.ts';
    const localWorkspaceSource = policyPath.startsWith('services/localWorkspace/');
    const productionSource = !policyPath.startsWith('tests/');
    const enforceDirectStorageBoundary = input.directStorageBoundary === true && productionSource;
    const bundledPreferenceStart = policyPath === 'onboarding/index.html'
      && approvedBrowserPreferencesBundle
      ? input.source.indexOf(approvedBrowserPreferencesBundle)
      : -1;
    const bundledPreferenceEnd = bundledPreferenceStart === -1
      ? -1
      : bundledPreferenceStart + approvedBrowserPreferencesBundle!.length;
    const exactStorageApprovals = policyPath === 'services/browserPreferences.ts'
      ? browserPreferenceStorageApprovals(sourceFile)
      : policyPath === 'services/localWorkspace/index.ts'
        ? localWorkspaceStorageApprovals(sourceFile)
        : [];
    const directStorageApprovedAt = (node: ts.Node): boolean => (
      exactStorageApprovals.some(approval => (
        node.getStart(sourceFile) >= approval.getStart(sourceFile) && node.end <= approval.end
      ))
      || (bundledPreferenceStart !== -1
        && node.getStart(sourceFile) >= bundledPreferenceStart
        && node.end <= bundledPreferenceEnd)
    );
    const report = (node: ts.Node, message: string): void => {
      reportOffset(node.getStart(sourceFile), message);
    };
    const directStorageLines = new Set<number>();
    const reportDirectStorage = (node: ts.Node): void => {
      const line = reportLine(input, node.getStart(sourceFile));
      if (directStorageLines.has(line)) return;
      directStorageLines.add(line);
      report(node, 'accesses production localStorage outside approved persistence modules');
    };
    const inspectModuleSpecifier = (node: ts.Node, expression: ts.Expression | undefined): void => {
      if (importsAllowed) return;
      const specifier = directStringLiteral(expression);
      if (specifier && isLegacyTypesModule(specifier)) {
        report(node, 'imports local-workspace migration internals');
      }
    };
    const transparentExpression = (node: ts.Identifier): ts.Expression => {
      let expression: ts.Expression = node;
      while (
        (ts.isParenthesizedExpression(expression.parent)
          || ts.isAsExpression(expression.parent)
          || ts.isTypeAssertionExpression(expression.parent)
          || ts.isNonNullExpression(expression.parent)
          || ts.isSatisfiesExpression(expression.parent))
        && expression.parent.expression === expression
      ) {
        expression = expression.parent;
      }
      return expression;
    };
    const exactWorkerBlockDescriptor = (expression: ts.Expression | undefined): boolean => {
      const descriptor = expression && unwrap(expression);
      if (!descriptor || !ts.isObjectLiteralExpression(descriptor)) return false;
      const values = new Map<string, ts.Expression>();
      for (const property of descriptor.properties) {
        if (!ts.isPropertyAssignment(property)) return false;
        const name = directPropertyName(property.name);
        if (!name || values.has(name)) return false;
        values.set(name, property.initializer);
      }
      return values.size === 3
        && ts.isIdentifier(values.get('value')!)
        && (values.get('value') as ts.Identifier).text === 'undefined'
        && values.get('configurable')?.kind === ts.SyntaxKind.FalseKeyword
        && values.get('writable')?.kind === ts.SyntaxKind.FalseKeyword;
    };
    const approvedRootReflection = (expression: ts.Expression): boolean => {
      const call = expression.parent;
      if (!ts.isCallExpression(call) || call.arguments[0] !== expression) return false;
      const callee = unwrap(call.expression);
      const key = directStringLiteral(call.arguments[1]);
      if (policyPath === 'services/localWorkspace/indexedDbAdapter.ts'
        && key === 'indexedDB'
        && ts.isPropertyAccessExpression(callee)
        && ts.isIdentifier(callee.expression)) {
        return (callee.expression.text === 'Object'
          && (callee.name.text === 'defineProperty'
            || callee.name.text === 'getOwnPropertyDescriptor'))
          || (callee.expression.text === 'Reflect' && callee.name.text === 'deleteProperty');
      }
      if (policyPath !== 'services/generatorSandbox.ts'
        || !ts.isIdentifier(expression)
        || expression.text !== 'self') return false;
      if (ts.isPropertyAccessExpression(callee)
        && ts.isIdentifier(callee.expression)
        && callee.expression.text === 'Object'
        && callee.name.text === 'defineProperty'
        && ts.isIdentifier(call.arguments[1])
        && call.arguments[1].text === 'name') {
        return exactWorkerBlockDescriptor(call.arguments[2]);
      }
      if (!ts.isIdentifier(callee) || callee.text !== 'trustedObjectAssign') return false;
      const patch = call.arguments[1] && unwrap(call.arguments[1]);
      return Boolean(patch
        && ts.isObjectLiteralExpression(patch)
        && patch.properties.length === 1
        && ts.isPropertyAssignment(patch.properties[0])
        && ts.isComputedPropertyName(patch.properties[0].name)
        && ts.isIdentifier(patch.properties[0].name.expression)
        && patch.properties[0].name.expression.text === 'name'
        && ts.isIdentifier(patch.properties[0].initializer)
        && patch.properties[0].initializer.text === 'undefined');
    };
    const approvedBrowserRootUse = (node: ts.Identifier): boolean => {
      const expression = transparentExpression(node);
      const parent = expression.parent;
      if (ts.isTypeOfExpression(parent) && parent.expression === expression) return true;
      if (ts.isPropertyAccessExpression(parent) && parent.expression === expression) {
        return approvedBrowserRootProperties.has(parent.name.text);
      }
      if (ts.isElementAccessExpression(parent) && parent.expression === expression) {
        const property = directStringLiteral(parent.argumentExpression);
        return property !== undefined && approvedBrowserRootProperties.has(property);
      }
      return approvedRootReflection(expression);
    };
    const propertyAccessName = (node: ts.Identifier): boolean => (
      (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
      || (ts.isQualifiedName(node.parent) && node.parent.right === node)
    );
    const nonValueBrowserRootName = (node: ts.Identifier): boolean => (
      propertyAccessName(node)
      || (ts.isPropertyAssignment(node.parent) && node.parent.name === node)
      || (ts.isBindingElement(node.parent) && node.parent.propertyName === node)
      || ((ts.isMethodDeclaration(node.parent)
        || ts.isGetAccessorDeclaration(node.parent)
        || ts.isSetAccessorDeclaration(node.parent)
        || ts.isPropertyDeclaration(node.parent)
        || ts.isPropertySignature(node.parent)
        || ts.isMethodSignature(node.parent)
        || ts.isEnumMember(node.parent))
        && node.parent.name === node)
    );
    const reflectiveLocalStorageKey = (node: ts.Node): boolean => {
      if (ts.isBindingElement(node)) {
        return node.propertyName !== undefined
          && directPropertyName(node.propertyName) === 'localStorage';
      }
      if (!ts.isStringLiteralLike(node) || node.text !== 'localStorage') return false;
      const reflectiveMember = (input: ts.Expression): boolean => {
        const member = unwrap(input);
        return ts.isPropertyAccessExpression(member)
          && ts.isIdentifier(member.expression)
          && (reflectiveLocalStorageMethods.get(member.expression.text)?.has(member.name.text) ?? false);
      };
      if (ts.isCallExpression(node.parent) && node.parent.arguments[1] === node) {
        return reflectiveMember(node.parent.expression);
      }
      const array = node.parent;
      if (!ts.isArrayLiteralExpression(array) || array.elements[1] !== node) return false;
      const call = array.parent;
      if (!ts.isCallExpression(call) || call.arguments[2] !== array) return false;
      const callee = unwrap(call.expression);
      return ts.isPropertyAccessExpression(callee)
        && ts.isIdentifier(callee.expression)
        && callee.expression.text === 'Reflect'
        && callee.name.text === 'apply'
        && call.arguments[0] !== undefined
        && reflectiveMember(call.arguments[0]);
    };
    const localStorageSyntax = (node: ts.Node): boolean => {
      if (ts.isPropertyAccessExpression(node)) return node.name.text === 'localStorage';
      if (ts.isElementAccessExpression(node)) {
        return directStringLiteral(node.argumentExpression) === 'localStorage';
      }
      if (reflectiveLocalStorageKey(node)) return true;
      return ts.isIdentifier(node)
        && node.text === 'localStorage'
        && !propertyAccessName(node);
    };
    const directSyntaxMemberName = (node: ts.Node): string | undefined => {
      if (ts.isPropertyAccessExpression(node)) return node.name.text;
      if (ts.isElementAccessExpression(node)) return directStringLiteral(node.argumentExpression);
      return ts.isBindingElement(node) && node.propertyName
        ? directPropertyName(node.propertyName)
        : undefined;
    };

    const inspectNode = (node: ts.Node): void => {
      if (ts.isExpressionWithTypeArguments(node)
        && ts.isHeritageClause(node.parent)
        && node.parent.token === ts.SyntaxKind.ExtendsKeyword
        && (ts.isClassDeclaration(node.parent.parent) || ts.isClassExpression(node.parent.parent))) {
        inspectNode(node.expression);
        return;
      }
      if (ts.isTypeNode(node)) return;
      if (enforceDirectStorageBoundary
        && !directStorageApprovedAt(node)
        && localStorageSyntax(node)) {
        reportDirectStorage(node);
      }
      if (enforceDirectStorageBoundary
        && !directStorageApprovedAt(node)
        && ts.isIdentifier(node)
        && browserGlobalNames.has(node.text)
        && !nonValueBrowserRootName(node)
        && !approvedBrowserRootUse(node)) {
        report(node, 'passes a browser global outside approved static access');
      }
      const syntaxMember = localWorkspaceSource ? directSyntaxMemberName(node) : undefined;
      if (syntaxMember && storageMutators.has(syntaxMember)) {
        report(node, 'mutates storage during rollout epoch 1');
      }
      if (syntaxMember === 'createIndex') {
        report(node, 'creates an IndexedDB index');
      }
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        inspectModuleSpecifier(node, node.moduleSpecifier);
      } else if (ts.isImportEqualsDeclaration(node)
        && ts.isExternalModuleReference(node.moduleReference)) {
        inspectModuleSpecifier(node, node.moduleReference.expression);
      } else if (ts.isCallExpression(node)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          inspectModuleSpecifier(node, node.arguments[0]);
        } else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
          inspectModuleSpecifier(node, node.arguments[0]);
        }
      }
      ts.forEachChild(node, inspectNode);
    };

    if (enforceDirectStorageBoundary
      && policyPath === 'services/browserPreferences.ts'
      && !hasExactBrowserPreferenceExports(sourceFile)) {
      report(sourceFile, 'exports browser preference API outside its approved surface');
    }
    inspectNode(sourceFile);
  }
  return results;
};

const analyzeSource = (path: string, source: string): string[] =>
  analyzeSources([{ path, source }]).get(path) ?? [];

const analyzeProductionSource = (path: string, source: string): string[] =>
  analyzeSources([{ path, source, directStorageBoundary: true } as DirectStorageBoundaryInput])
    .get(path) ?? [];

describe('local workspace static boundary', () => {
  it('confines legacy document storage and keeps IndexedDB schema index-free', { timeout: 30_000 }, () => {
    const inputs = repositorySourcePaths().map(path => ({
      path,
      source: readFileSync(join(root, path), 'utf8'),
      directStorageBoundary: true,
    } as DirectStorageBoundaryInput));
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
    'components/workspace/WorkspaceBootstrapGate.tsx',
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

  it.each(['file', 'directory'])('rejects executable %s symbolic links', kind => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'workspace-policy-link-'));
    try {
      const target = join(temporaryRoot, kind === 'file' ? 'target.ts' : 'target');
      if (kind === 'file') writeFileSync(target, 'export {};');
      else mkdirSync(target);
      symlinkSync(target, join(temporaryRoot, 'linked'));
      expect(() => repositorySourcePaths(temporaryRoot)).toThrow('refuses symbolic link linked');
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('runs complete migration checks for every pull request', () => {
    const workflow = readFileSync(
      join(root, '.github/workflows/local-workspace-migration.yml'),
      'utf8',
    );
    expect(workflowRunsOnEveryPullRequest(workflow)).toBe(true);
    expect(workflow).toMatch(/^\s*run:\s+npx vitest run --maxWorkers=4\s*$/m);
    expect(workflow.match(/\bnpx vitest run\b/g)).toHaveLength(1);
  });

  it.each([
    ['commented trigger', '# pull_request: {}\non:\n  push: {}\njobs: {}\n'],
    ['active paths', '# pull_request: {}\non:\n  pull_request:\n    paths:\n      - src/**\njobs: {}\n'],
    ['active paths-ignore', '# pull_request: {}\non:\n  pull_request:\n    paths-ignore:\n      - docs/**\njobs: {}\n'],
  ])('workflow trigger policy rejects %s', (_case, workflow) => {
    expect(workflowRunsOnEveryPullRequest(workflow)).toBe(false);
  });

  it.each([
    ['components/sideEffect.js', "import '../services/localWorkspace/legacyTypes.js';"],
    ['components/importEquals.ts', "import legacy = require('../services/localWorkspace/legacyTypes.ts');"],
    ['components/dynamic.tsx', "const legacy = import('../services/localWorkspace/legacyTypes.js');"],
    ['components/required.cjs', "require('../services/localWorkspace/legacyTypes.cjs');"],
  ])('rejects direct legacyTypes module access in %s', (path, source) => {
    expect(analyzeSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining('imports local-workspace migration internals'),
    ]));
  });

  it.each([
    ['services/localWorkspace/write.ts', "cache.setItem('preference', '1');"],
    ['services/localWorkspace/remove.ts', "cache['removeItem']('preference');"],
    ['services/localWorkspace/clear.ts', 'cache.clear();'],
    ['services/localWorkspace/alias.ts', 'const write = cache.setItem; write();'],
    ['services/localWorkspace/destructure.ts', 'const { clear: wipe } = cache; wipe();'],
  ])('rejects local-workspace mutator syntax in %s', (path, source) => {
    expect(analyzeSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining('mutates storage during rollout epoch 1'),
    ]));
  });

  it('rejects direct IndexedDB index creation', () => {
    expect(analyzeSource(
      'services/localWorkspace/indexedDbAdapter.ts',
      "store.createIndex('by-title', 'title');",
    )).toEqual(expect.arrayContaining([
      expect.stringContaining('creates an IndexedDB index'),
    ]));
  });

  it('rejects IndexedDB index method acquisition', () => {
    expect(analyzeSource(
      'services/localWorkspace/indexedDbAdapter.ts',
      'const makeIndex = store.createIndex; void makeIndex;',
    )).toEqual(expect.arrayContaining([
      expect.stringContaining('creates an IndexedDB index'),
    ]));
  });

  it.each([
    ['bare storage', "localStorage.getItem('x');"],
    ['window storage', "window.localStorage.getItem('x');"],
    ['computed storage', "supplied['localStorage'].getItem('x');"],
    ['computed destructuring', "const { ['localStorage']: storage } = supplied; storage.getItem('x');"],
    ['optional storage', "supplied?.localStorage?.getItem('x');"],
    ['Reflect.get key', "Reflect.get(supplied, 'localStorage').getItem('x');"],
    [
      'Reflect.apply key',
      "Reflect.apply(Reflect.get, Reflect, [supplied, 'localStorage']).getItem('x');",
    ],
    [
      'descriptor key',
      "Object.getOwnPropertyDescriptor(supplied, 'localStorage')?.get?.call(supplied);",
    ],
    ['type query at runtime', 'const storageType = typeof localStorage;'],
    ['sequence receiver', "(0, window).localStorage.getItem('x');"],
    ['direct parameter', "function read(root) { return root.localStorage.getItem('x'); } read(window);"],
    ['computed parameter', "function read(root) { return root['localStorage'].getItem('x'); } read(window);"],
    ['optional IIFE', "(root => root?.['localStorage']?.getItem('x'))(window);"],
    ['object rest', "const { ...root } = window; root.localStorage.getItem('x');"],
  ])('rejects production localStorage through %s', (_case, source) => {
    expect(analyzeProductionSource('components/ClosedStorage.ts', source)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('accesses production localStorage outside approved persistence modules'),
      ]),
    );
  });

  it.each([
    ['a function argument', 'consume(window);'],
    ['an array', 'const roots = [self];'],
    ['array destructuring', 'const [root] = [window]; void root.localStorage;'],
    ['a conditional', 'const root = condition ? window : self; void root.localStorage;'],
    ['a return', 'function browser() { return globalThis; }'],
    ['Object conversion', 'Object(window);'],
    ['Object.assign', 'Object.assign({}, window);'],
    ['a promise callback', 'Promise.resolve(self).then(consume);'],
    ['Reflect.apply', "Reflect.apply(Reflect.get, Reflect, [window, 'localStorage']);"],
    ['a descriptor', "Object.getOwnPropertyDescriptor(window, 'localStorage');"],
    [
      'out-of-module IndexedDB reflection',
      "Object.defineProperty(globalThis, 'indexedDB', { value: supplied });",
    ],
    ['Reflect.ownKeys', 'Reflect.ownKeys(globalThis);'],
    ['a root-returning member', 'const browser = window.window;'],
    ['dynamic computation', 'void self[suppliedProperty];'],
  ])('rejects browser-root escape through %s', (_case, source) => {
    expect(analyzeProductionSource('components/ClosedRoot.ts', source)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('passes a browser global outside approved static access'),
      ]),
    );
  });

  it.each([
    'void window.location;',
    "void window['location'];",
    'void window?.location;',
    "void window?.['location'];",
    "const reflection = globalThis.Reflect; reflection.get(error, 'name');",
    "const get = Reflect.get; get(error, 'name');",
    "void suppliedObject[suppliedProperty];",
  ])('allows closed static or non-global access: %s', source => {
    expect(analyzeProductionSource('components/SafeBrowserSyntax.ts', source)).toEqual([]);
  });

  it('reports Reflect.get on a browser root without a false localStorage claim', () => {
    const findings = analyzeProductionSource(
      'components/ReflectLocation.ts',
      "Reflect.get(window, 'location');",
    );
    expect(findings).toEqual(expect.arrayContaining([
      expect.stringContaining('passes a browser global outside approved static access'),
    ]));
    expect(findings.join('\n')).not.toContain('accesses production localStorage');
  });

  it.each([
    ['named', 'export const browser = window;', "import { browser } from './root'; void browser.localStorage;"],
    ['default', 'export default window;', "import browser from './root'; void browser.localStorage;"],
    ['namespace', 'export const browser = window;', "import * as roots from './root'; void roots.browser.localStorage;"],
  ])('rejects a browser root at its export site before a %s import can launder it', (
    _case,
    providerSource,
    consumerSource,
  ) => {
    const providerPath = 'services/browserRoot.ts';
    const findings = analyzeSources([
      { path: providerPath, source: providerSource, directStorageBoundary: true },
      {
        path: 'components/BrowserRootConsumer.ts',
        source: consumerSource,
        directStorageBoundary: true,
      },
    ] as DirectStorageBoundaryInput[]).get(providerPath) ?? [];
    expect(findings).toEqual(expect.arrayContaining([
      expect.stringContaining('passes a browser global outside approved static access'),
    ]));
  });

  it('skips true type-only storage references', () => {
    expect(analyzeProductionSource(
      'components/StorageTypes.ts',
      'type StorageType = typeof localStorage; interface Shape extends localStorage {}',
    )).toEqual([]);
  });

  it('checks emitted class heritage expressions', () => {
    expect(analyzeProductionSource(
      'components/RuntimeStorageHeritage.ts',
      'class RuntimeStorageHeritage extends (consume(localStorage), Object) {}',
    )).toEqual(expect.arrayContaining([
      expect.stringContaining('accesses production localStorage outside approved persistence modules'),
    ]));
  });

  it.each([
    'services/browserPreferences.ts',
    'services/localWorkspace/index.ts',
  ])('allows only current exact storage implementation in %s', path => {
    expect(analyzeProductionSource(path, readFileSync(join(root, path), 'utf8'))).toEqual([]);
  });

  it.each([
    [
      'services/browserPreferences.ts',
      "window.localStorage.setItem(suppliedKey, suppliedValue);",
    ],
    [
      'services/localWorkspace/index.ts',
      'export const leakedStorage = window.localStorage;',
    ],
  ])('rejects additional direct storage access in %s', (path, appended) => {
    const source = `${readFileSync(join(root, path), 'utf8')}\n${appended}\n`;
    expect(analyzeProductionSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining('accesses production localStorage outside approved persistence modules'),
    ]));
  });

  it.each([
    ['runtime-key guard', "if (!isRuntimeBrowserPreferenceKey(key)) return null;", 'if (false) return null;'],
    ['window guard', "if (typeof window === 'undefined') return null;", 'if (false) return null;'],
    ['read key flow', 'window.localStorage.getItem(key)', 'window.localStorage.getItem(suppliedKey)'],
    ['raw return', 'return window.localStorage.getItem(key);', 'return window.localStorage;'],
  ])('revokes preference storage approval after %s mutation', (_case, expected, replacement) => {
    const original = readFileSync(join(root, 'services/browserPreferences.ts'), 'utf8');
    const source = original.replace(expected, replacement);
    expect(source).not.toBe(original);
    expect(analyzeProductionSource('services/browserPreferences.ts', source)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('accesses production localStorage outside approved persistence modules'),
      ]),
    );
  });

  it('requires localWorkspace legacy adapter key flow', () => {
    const source = readFileSync(join(root, 'services/localWorkspace/index.ts'), 'utf8')
      .replace('window.localStorage.getItem(key)', 'window.localStorage.getItem(suppliedKey)');
    expect(analyzeProductionSource('services/localWorkspace/index.ts', source)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('accesses production localStorage outside approved persistence modules'),
      ]),
    );
  });

  it.each([
    ['a private operation export', (source: string) => `${source}\nexport { writeRuntimeBrowserPreference };\n`],
    ['a direct operation alias', (source: string) => `${source}\nexport const leakedWrite = writeRuntimeBrowserPreference;\n`],
    [
      'an object alias default',
      (source: string) => `${source}\nconst capability = { write: writeRuntimeBrowserPreference };\nexport default capability;\n`,
    ],
    [
      'an indirect named export',
      (source: string) => `${source}\nconst leakedWrite = writeRuntimeBrowserPreference;\nexport { leakedWrite };\n`,
    ],
    ['an unrelated value export', (source: string) => `${source}\nexport const extra = 1;\n`],
    ['an unrelated type export', (source: string) => `${source}\nexport type Extra = string;\n`],
    [
      'a broadened public key type',
      (source: string) => source.replace(
        'export type BrowserPreferenceKey = FixedBrowserPreferenceKey;',
        'export type BrowserPreferenceKey = string;',
      ),
    ],
    ['a star re-export', (source: string) => `${source}\nexport * from './internals';\n`],
    [
      'an aliased public implementation',
      (source: string) => `${source.replace(
        'export const readBrowserPreference =',
        'const readBrowserPreferenceImplementation =',
      )}\nexport const readBrowserPreference = readBrowserPreferenceImplementation;\n`,
    ],
    [
      'a public operation capability return',
      (source: string) => source.replace(
        `export const readBrowserPreference = (key: BrowserPreferenceKey): string | null => (
  isBrowserPreferenceKey(key) ? readRuntimeBrowserPreference(key) : null
);`,
        'export const readBrowserPreference = () => readRuntimeBrowserPreference;',
      ),
    ],
  ])('rejects browserPreferences export surface mutation through %s', (_case, mutate) => {
    const source = mutate(readFileSync(join(root, 'services/browserPreferences.ts'), 'utf8'));
    expect(analyzeProductionSource('services/browserPreferences.ts', source)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('exports browser preference API outside its approved surface'),
      ]),
    );
  });

  it('keeps preference and workspace raw capabilities private', () => {
    const preferences = readFileSync(join(root, 'services/browserPreferences.ts'), 'utf8');
    const workspace = readFileSync(join(root, 'services/localWorkspace/index.ts'), 'utf8');
    expect(preferences).not.toContain('storageFor');
    expect(preferences).not.toMatch(/:\s*Storage\s*\|\s*null/);
    expect(workspace).not.toMatch(/\bconst browserEnvironment\b/);
    expect(workspace).toMatch(/createLocalWorkspaceStore\(\{/);
  });

  it('allows only byte-exact compiled preference code in generated onboarding HTML', () => {
    const bundle = buildBrowserPreferencesBundle(root);
    expect(analyzeProductionSource('onboarding/index.html', `<script>${bundle}</script>`)).toEqual([]);
    expect(analyzeProductionSource(
      'onboarding/index.html',
      `<script>${bundle}\nwindow.localStorage.getItem('x');</script>`,
    )).toEqual(expect.arrayContaining([
      expect.stringContaining('accesses production localStorage outside approved persistence modules'),
    ]));
  });

  it.each([
    ['classic', '<script>window.localStorage.getItem(\'x\');</script>'],
    ['module', '<script type="module">window.localStorage.getItem(\'x\');</script>'],
    ['SVG', '<svg><script>window.localStorage.getItem(\'x\');</script></svg>'],
  ])('analyzes executable %s HTML scripts', (_case, source) => {
    expect(analyzeProductionSource('shell.html', source)).toEqual(expect.arrayContaining([
      expect.stringContaining('accesses production localStorage outside approved persistence modules'),
    ]));
  });

  it.each([
    '<script type="importmap">{"imports":{"x":"localStorage"}}</script>',
    '<script src="app.js">window.localStorage.getItem(\'x\');</script>',
    '<script nomodule>window.localStorage.getItem(\'x\');</script>',
    '<script type="application/json">window.localStorage.getItem(\'x\');</script>',
  ])('skips inert HTML script: %s', source => {
    expect(analyzeProductionSource('inert.html', source)).toEqual([]);
  });

  it.each([
    ['classic import', '<script>import value from \'./value.js\';</script>'],
    ['malformed classic', '<script>if (true) {</script>'],
    ['undefined module export', '<script type="module">export { missing };</script>'],
  ])('fails closed for %s parse errors', (_case, source) => {
    expect(analyzeProductionSource('invalid.html', source)).toEqual(expect.arrayContaining([
      expect.stringContaining('could not be parsed'),
    ]));
  });

  it('keeps independent inline module bindings isolated', () => {
    const source = '<script type="module">const isolated = 1;</script>'
      + '<script type="module">const isolated = 2;</script>';
    expect(analyzeProductionSource('modules.html', source)).toEqual([]);
  });

  it('maps inline findings to authored HTML lines', () => {
    const source = ['<html>', '<script>', "window.localStorage.getItem('x');", '</script>', '</html>'].join('\r\n');
    expect(analyzeProductionSource('line-map.html', source)).toEqual(expect.arrayContaining([
      expect.stringContaining('line-map.html:3: accesses production localStorage'),
    ]));
  });

  it('keeps exact onboarding SLOT placeholders non-executable', () => {
    const source = '<script>\n<!--SLOT:RUNTIME-->\n</script>';
    expect(analyzeProductionSource('onboarding/src/shell.html', source)).toEqual([]);
  });

  it('retains exact legacy-key defense without expression evaluation', () => {
    const key = ['hype', 'projects'].join('_');
    expect(analyzeSource('components/legacy.ts', `void '${key}';`)).toEqual([
      expect.stringContaining(`exact legacy document key ${key}`),
    ]);
    expect(analyzeSource(
      'services/localWorkspace/legacyTypes.ts',
      `export const key = '${key}';`,
    )).toEqual([]);
  });
});
