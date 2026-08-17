import { spawnSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
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
import { extname, join, posix, relative, sep } from 'node:path';
import { Script } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { buildBrowserPreferencesBundle } from '../../onboarding/build.mjs';

const root = process.cwd();
const executableExtensions = new Set([
  '.cjs',
  '.cts',
  '.htm',
  '.html',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
  '.svg',
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
const decodedSpecifier = (specifier: string): string => {
  const pathOnly = specifier.split(/[?#]/, 1)[0];
  try {
    return decodeURIComponent(pathOnly).replace(/\\/g, '/');
  } catch {
    return pathOnly.replace(/\\/g, '/');
  }
};

interface BrowserUrlBase {
  url?: string;
  invalid?: true;
}

const repositoryBrowserOrigin = 'https://doctect.invalid';
const browserUrlInput = (specifier: string): string =>
  specifier
    .replace(/[\t\n\r]/g, '')
    .replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '');

const repositoryBrowserBase = (path: string): BrowserUrlBase => ({
  url: new URL(`/${path}`, `${repositoryBrowserOrigin}/`).href,
});

const resolvedModuleEdge = (sourcePath: string, specifier: string): string | undefined => {
  const decoded = decodedSpecifier(specifier);
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(decoded)) return undefined;
  if (decoded.startsWith('@/')) return posix.normalize(decoded.slice(2));
  if (decoded.startsWith('/')) return posix.normalize(decoded.slice(1));
  if (!decoded.startsWith('./') && !decoded.startsWith('../')) return undefined;
  return posix.normalize(posix.join(posix.dirname(sourcePath), decoded));
};

const resolvedBrowserEdge = (
  base: BrowserUrlBase,
  specifier: string,
): string | null | undefined => {
  const input = browserUrlInput(specifier);
  let resolved: URL;
  try {
    resolved = base.invalid || !base.url ? new URL(input) : new URL(input, base.url);
  } catch {
    return null;
  }
  if (resolved.origin !== repositoryBrowserOrigin) return undefined;
  let decoded: string;
  try {
    decoded = decodeURIComponent(resolved.pathname).replace(/\\/g, '/');
  } catch {
    return null;
  }
  return posix.normalize(decoded.replace(/^\/+/, ''));
};

const excludedDirectorySegment = (segment: string, index: number): boolean => (
  excludedDirectories.has(segment) && (segment !== 'docs' || index === 0)
);

const resolvedEntersExcludedDirectory = (resolved: string | undefined): boolean => {
  if (!resolved || resolved === '..' || resolved.startsWith('../')) return false;
  const segments = resolved.split('/');
  return segments[0] === 'tests' || segments.some(excludedDirectorySegment);
};

const moduleEntersExcludedDirectory = (sourcePath: string, specifier: string): boolean =>
  resolvedEntersExcludedDirectory(resolvedModuleEdge(sourcePath, specifier));

const browserEntersExcludedDirectory = (base: BrowserUrlBase, specifier: string): boolean => {
  const resolved = resolvedBrowserEdge(base, specifier);
  return resolved === null || resolvedEntersExcludedDirectory(resolved);
};
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

interface ParsedExecutableDocument extends ParsedHtml {
  xml: boolean;
}

type ParsedExecutableDocumentResult =
  | { parsed: ParsedExecutableDocument; failure?: never }
  | { parsed?: never; failure: ParseFailure };

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
  browserBase?: BrowserUrlBase;
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
  JSDOM: new (
    source: string,
    options: { includeNodeLocations: true } | { contentType: 'image/svg+xml' },
  ) => ParsedHtml;
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
      const segments = relative(repositoryRoot, path).split(sep);
      return segments.some(excludedDirectorySegment) ? [] : sourceFiles(path, repositoryRoot, readEntries);
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

interface AuthoredXmlElement {
  name: string;
  location: HtmlNodeLocation;
}

class AuthoredXmlParseError extends Error {
  constructor(message: string, readonly offset: number) {
    super(message);
  }
}

const authoredXmlDoctypeOffset = (source: string): number | undefined => {
  let cursor = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (cursor < source.length) {
    while (cursor < source.length && /[\t\n\r ]/.test(source[cursor])) cursor += 1;
    if (source.startsWith('<!--', cursor)) {
      const close = source.indexOf('-->', cursor + 4);
      if (close === -1) return undefined;
      cursor = close + 3;
      continue;
    }
    if (source.startsWith('<?', cursor)) {
      const close = source.indexOf('?>', cursor + 2);
      if (close === -1) return undefined;
      cursor = close + 2;
      continue;
    }
    return source.startsWith('<!DOCTYPE', cursor) ? cursor : undefined;
  }
  return undefined;
};

const xmlMarkupEnd = (source: string, start: number, doctype = false): number => {
  let quote: string | undefined;
  let subsetDepth = 0;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (doctype && character === '[') {
      subsetDepth += 1;
    } else if (doctype && character === ']') {
      subsetDepth -= 1;
    } else if (character === '>' && subsetDepth === 0) {
      return index + 1;
    }
  }
  throw new Error('unterminated XML markup');
};

const authoredXmlLocations = (
  source: string,
): { elements: AuthoredXmlElement[]; characters: HtmlNodeLocation[] } => {
  // JSDOM exposes XML semantics without locations; validate lexical ranges against its DOM order.
  const elements: AuthoredXmlElement[] = [];
  const characters: HtmlNodeLocation[] = [];
  const stack: AuthoredXmlElement[] = [];
  const appendCharacters = (startOffset: number, endOffset: number): void => {
    if (stack.length > 0 && endOffset > startOffset) {
      characters.push({ startOffset, endOffset });
    }
  };
  let cursor = 0;
  while (cursor < source.length) {
    const open = source.indexOf('<', cursor);
    if (open === -1) {
      appendCharacters(cursor, source.length);
      break;
    }
    appendCharacters(cursor, open);
    if (source.startsWith('<!--', open)) {
      const close = source.indexOf('-->', open + 4);
      if (close === -1) throw new Error('unterminated XML comment');
      cursor = close + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', open)) {
      const close = source.indexOf(']]>', open + 9);
      if (close === -1) throw new Error('unterminated XML CDATA section');
      appendCharacters(open, close + 3);
      cursor = close + 3;
      continue;
    }
    if (source.startsWith('<?', open)) {
      const close = source.indexOf('?>', open + 2);
      if (close === -1) throw new Error('unterminated XML processing instruction');
      cursor = close + 2;
      continue;
    }
    if (source.startsWith('<!DOCTYPE', open)) {
      cursor = xmlMarkupEnd(source, open + 9, true);
      continue;
    }
    const end = xmlMarkupEnd(source, open + 1);
    if (source.startsWith('</', open)) {
      const name = source.slice(open + 2, end - 1).match(/^([^\t\n\r />]+)/)?.[1];
      const element = stack.pop();
      if (!name || !element || element.name !== name) throw new Error('XML element mapping mismatch');
      element.location.endTag = { startOffset: open, endOffset: end };
      element.location.endOffset = end;
      cursor = end;
      continue;
    }
    if (source.startsWith('<!', open)) {
      cursor = end;
      continue;
    }
    const name = source.slice(open + 1, end - 1).match(/^([^\t\n\r />]+)/)?.[1];
    if (!name) throw new Error('XML element mapping mismatch');
    let marker = end - 2;
    while (marker > open && /[\t\n\r ]/.test(source[marker])) marker -= 1;
    const element: AuthoredXmlElement = {
      name,
      location: {
        startOffset: open,
        endOffset: end,
        startTag: { startOffset: open, endOffset: end },
      },
    };
    elements.push(element);
    if (source[marker] !== '/') stack.push(element);
    cursor = end;
  }
  if (stack.length > 0) throw new Error('XML element mapping mismatch');
  return { elements, characters };
};

const standaloneSvgDocument = (source: string): ParsedExecutableDocument => {
  const dom = new JSDOM(source, { contentType: 'image/svg+xml' });
  const document = dom.window.document;
  if (document.doctype) {
    const offset = authoredXmlDoctypeOffset(source) ?? 0;
    throw new AuthoredXmlParseError('standalone SVG DTD syntax is not supported', offset);
  }
  const authored = authoredXmlLocations(source);
  const elements = [...document.getElementsByTagName('*')];
  const characters: Node[] = [];
  const visitCharacters = (node: Node): void => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3 || child.nodeType === 4) characters.push(child);
      else if (child.nodeType === 1) visitCharacters(child);
    }
  };
  visitCharacters(document.documentElement);
  if (elements.length !== authored.elements.length || characters.length !== authored.characters.length) {
    throw new Error('XML source location mapping mismatch');
  }
  const locations = new Map<Node, HtmlNodeLocation>();
  elements.forEach((element, index) => {
    if (element.tagName !== authored.elements[index].name) {
      throw new Error('XML source location mapping mismatch');
    }
    locations.set(element, authored.elements[index].location);
  });
  characters.forEach((node, index) => locations.set(node, authored.characters[index]));
  return {
    window: dom.window,
    xml: true,
    nodeLocation: node => locations.get(node) ?? null,
  };
};

const xmlParseFailure = (source: string, error: unknown): ParseFailure => {
  if (error instanceof AuthoredXmlParseError) {
    return { message: error.message, offset: error.offset };
  }
  if (!(error instanceof Error)) throw error;
  const location = error.message.match(/:(\d+):(\d+):\s*(.*)$/);
  return {
    message: location?.[3] ?? error.message,
    offset: location
      ? generatedOffset(source, Number(location[1]), Math.max(Number(location[2]) - 1, 0))
      : 0,
  };
};

const parseExecutableDocument = (input: SourceInput): ParsedExecutableDocumentResult => {
  if (extname(input.path) === '.svg') {
    try {
      return { parsed: standaloneSvgDocument(input.source) };
    } catch (error) {
      return { failure: xmlParseFailure(input.source, error) };
    }
  }
  const dom = new JSDOM(input.source, { includeNodeLocations: true });
  return {
    parsed: {
      window: dom.window,
      xml: false,
      nodeLocation: node => dom.nodeLocation(node),
    },
  };
};

const executableScriptElements = (document: ParsedExecutableDocument): Element[] => {
  if (!document.xml) return [...document.window.document.querySelectorAll('script')];
  return [...document.window.document.getElementsByTagName('*')].filter(element => (
    element.localName === 'script'
    && (element.namespaceURI === 'http://www.w3.org/2000/svg'
      || element.namespaceURI === 'http://www.w3.org/1999/xhtml')
  ));
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
    if (node.nodeType === 3 || node.nodeType === 4) {
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

interface ExecutableScriptEligibility {
  type: 'classic' | 'module';
  externalSpecifier?: string;
}

const executableScriptEligibility = (script: Element): ExecutableScriptEligibility | undefined => {
  const html = script.namespaceURI === 'http://www.w3.org/1999/xhtml';
  const svg = script.namespaceURI === 'http://www.w3.org/2000/svg';
  if (!html && !svg) return undefined;
  const classic = (): 'classic' | undefined => (
    html && script.hasAttribute('nomodule') ? undefined : 'classic'
  );
  const attribute = script.getAttribute('type');
  let type: 'classic' | 'module' | undefined;
  if (attribute === null) {
    const language = html ? script.getAttribute('language') : null;
    if (language === null || language === '') type = classic();
    else type = javascriptMimeEssences.has(`text/${language}`.toLowerCase())
      ? classic()
      : undefined;
  } else {
    const normalized = trimAsciiWhitespace(attribute).toLowerCase();
    if (attribute === '') type = classic();
    else if (javascriptMimeEssences.has(normalized)) type = classic();
    else if (attribute.toLowerCase() === 'module') type = 'module';
  }
  if (!type) return undefined;
  const externalSpecifier = html
    ? script.getAttribute('src')
    : script.getAttribute('href')
      ?? script.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
  return externalSpecifier === null ? { type } : { type, externalSpecifier };
};

interface ExternalScriptEdge {
  specifier: string;
  offset: number;
  browserBase: BrowserUrlBase;
}

const staticDocumentBrowserBase = (
  document: Document,
  documentPath: string,
): BrowserUrlBase => {
  const fallback = repositoryBrowserBase(documentPath);
  const base = [...document.querySelectorAll('base[href]')].find(element => (
    element.namespaceURI === 'http://www.w3.org/1999/xhtml'
  ));
  if (!base) return fallback;
  try {
    return { url: new URL(browserUrlInput(base.getAttribute('href') ?? ''), fallback.url).href };
  } catch {
    return { invalid: true };
  }
};

const externalScriptEdges = (input: SourceInput): ExternalScriptEdge[] => {
  const extension = extname(input.path);
  if (extension !== '.html' && extension !== '.htm' && extension !== '.svg') return [];
  const document = parseExecutableDocument(input);
  if (document.failure) return [];
  const browserBase = document.parsed.xml
    ? repositoryBrowserBase(input.path)
    : staticDocumentBrowserBase(document.parsed.window.document, input.path);
  const edges: ExternalScriptEdge[] = [];
  for (const script of executableScriptElements(document.parsed)) {
    const eligibility = executableScriptEligibility(script);
    if (eligibility?.externalSpecifier === undefined) continue;
    const location = document.parsed.nodeLocation(script);
    if (!location?.startTag) throw new Error(`Workspace boundary could not locate script in ${input.path}`);
    edges.push({
      specifier: eligibility.externalSpecifier,
      offset: location.startTag.startOffset,
      browserBase,
    });
  }
  return edges;
};

const executableInputs = (inputs: readonly SourceInput[]): SourceInput[] => inputs.flatMap(input => {
  const extension = extname(input.path);
  if (extension !== '.html' && extension !== '.htm' && extension !== '.svg') return [input];
  const document = parseExecutableDocument(input);
  if (document.failure) {
    return [{
      path: `${input.path}.__xml_parse.js`,
      source: input.source,
      parseFailure: document.failure,
      reportPath: input.path,
      reportSource: input.source,
    }];
  }
  const scripts: SourceInput[] = [];
  const browserBase = document.parsed.xml
    ? repositoryBrowserBase(input.path)
    : staticDocumentBrowserBase(document.parsed.window.document, input.path);
  let index = 0;
  for (const script of executableScriptElements(document.parsed)) {
    const eligibility = executableScriptEligibility(script);
    if (!eligibility || eligibility.externalSpecifier !== undefined) continue;
    const location = document.parsed.nodeLocation(script);
    if (!location?.startTag) throw new Error(`Workspace boundary could not locate script in ${input.path}`);
    const bodyStart = location.startTag.endOffset;
    const bodyEnd = location.endTag?.startOffset ?? location.endOffset;
    const rawSource = input.source.slice(bodyStart, bodyEnd);
    const prepared = document.parsed.xml
      || script.namespaceURI === 'http://www.w3.org/2000/svg'
      ? svgScriptSource(script, input.source, document.parsed)
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
      browserBase,
      directStorageBoundary: input.directStorageBoundary,
      moduleGoal: eligibility.type === 'module',
      parseFailure: eligibility.type === 'classic'
        ? classicScriptParseFailure(prepared.source)
        : undefined,
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

const syntaxFingerprint = (source: string): string => {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    source,
  );
  const tokens: string[] = [];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    tokens.push(`${token}:${scanner.getTokenText()}`);
  }
  return createHash('sha256').update(tokens.join('\n')).digest('hex');
};

const lineSensitiveSyntaxFingerprint = (source: string): string =>
  createHash('sha256').update(source.replace(/\r\n?/g, '\n')).digest('hex');

// Any syntax change at a privileged seam requires an explicit policy update.
const approvedBrowserPreferenceSyntax = '7af5f5c562faed881be020c3c7ee2ad624b46ab771178c0ce1a85a0dc2e50f4c';
const approvedGeneratorEvaluatorSyntax = 'dbe902dcb1f1ae81ed1fe600b84e88837c703ddbb68e382a01dd02845ddeda42';
const approvedRestoreIndexedDbSyntax = 'b374e90adbabba0e5f5feb7792d155a60ff238d93a68754b611aacbc245ac0ca';
const approvedOpenWithFactorySyntax = 'caf87c7f6d3ff1817db584990469483e9ec871a6788fd3cfcce59d96880f6bad';
const browserPreferencesBundleStart = '/* doctect-browser-preferences:start */';
const browserPreferencesBundleEnd = '/* doctect-browser-preferences:end */';
const approvedBrowserPreferencesBundleBytes = 2279;
const approvedBrowserPreferencesBundleHash = 'e109a96e4e6eff1c1b1394606dfd79cdd569f35846928d21a9eeb785d90c9fe1';
const approvedBrowserPreferencesBuilderSyntax = '76ab1bab13d122e17ec40ea821f77ff23f9349ceb19fefe6e68ee07c57b6734d';

const exactOccurrenceCount = (source: string, value: string): number =>
  source.split(value).length - 1;

const exactBrowserPreferencesBundle = (
  source: string,
): { source: string; start: number; end: number } | undefined => {
  if (exactOccurrenceCount(source, browserPreferencesBundleStart) !== 1
    || exactOccurrenceCount(source, browserPreferencesBundleEnd) !== 1) return undefined;
  const start = source.indexOf(browserPreferencesBundleStart);
  const end = source.indexOf(browserPreferencesBundleEnd) + browserPreferencesBundleEnd.length;
  if (start < 0 || end <= start) return undefined;
  const bundle = source.slice(start, end);
  return Buffer.byteLength(bundle, 'utf8') === approvedBrowserPreferencesBundleBytes
    && createHash('sha256').update(bundle).digest('hex') === approvedBrowserPreferencesBundleHash
    ? { source: bundle, start, end }
    : undefined;
};

const browserPreferencesBundleStatementSyntax = (bundle: string): string | undefined => {
  const sourceFile = ts.createSourceFile(
    'approved-browser-preferences.js',
    bundle,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  return sourceFile.statements.length === 1 && ts.isVariableStatement(sourceFile.statements[0])
    ? lineSensitiveSyntaxFingerprint(sourceFile.statements[0].getText(sourceFile))
    : undefined;
};

const bindingIdentifiers = (name: ts.BindingName): ts.Identifier[] => {
  if (ts.isIdentifier(name)) return [name];
  return name.elements.flatMap(element => ts.isOmittedExpression(element)
    ? []
    : bindingIdentifiers(element.name));
};

const sourceValueBindings = (sourceFile: ts.SourceFile, name: string): ts.Identifier[] => {
  const bindings = new Map<number, ts.Identifier>();
  const add = (identifier: ts.Identifier | undefined): void => {
    if (identifier?.text === name) bindings.set(identifier.getStart(sourceFile), identifier);
  };
  const addBindingName = (bindingName: ts.BindingName | undefined): void => {
    if (!bindingName) return;
    for (const identifier of bindingIdentifiers(bindingName)) add(identifier);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) {
      addBindingName(node.name);
    } else if (ts.isFunctionDeclaration(node)
      || ts.isFunctionExpression(node)
      || ts.isClassDeclaration(node)
      || ts.isClassExpression(node)
      || ts.isEnumDeclaration(node)) {
      add(node.name);
    } else if (ts.isImportClause(node)) {
      add(node.name);
    } else if (ts.isImportSpecifier(node) || ts.isNamespaceImport(node)) {
      add(node.name);
    } else if (ts.isImportEqualsDeclaration(node)) {
      add(node.name);
    } else if (ts.isModuleDeclaration(node) && ts.isIdentifier(node.name)) {
      add(node.name);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...bindings.values()];
};

const assignmentOperators = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.AsteriskAsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
  ts.SyntaxKind.PercentEqualsToken,
  ts.SyntaxKind.LessThanLessThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.AmpersandEqualsToken,
  ts.SyntaxKind.BarEqualsToken,
  ts.SyntaxKind.CaretEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

const directStaticMember = (
  expression: ts.Expression,
): { root: string; member: string | undefined } | undefined => {
  const candidate = unwrap(expression);
  if (ts.isPropertyAccessExpression(candidate) && ts.isIdentifier(unwrap(candidate.expression))) {
    return { root: (unwrap(candidate.expression) as ts.Identifier).text, member: candidate.name.text };
  }
  if (ts.isElementAccessExpression(candidate) && ts.isIdentifier(unwrap(candidate.expression))) {
    return {
      root: (unwrap(candidate.expression) as ts.Identifier).text,
      member: directStringLiteral(candidate.argumentExpression),
    };
  }
  return undefined;
};

const sourceHasRuntimeWrite = (
  sourceFile: ts.SourceFile,
  rootName: string,
  memberName?: string,
): boolean => {
  let found = false;
  const matchesTarget = (expression: ts.Expression): boolean => {
    const candidate = unwrap(expression);
    if (memberName === undefined) {
      if (ts.isIdentifier(candidate) && candidate.text === rootName) return true;
    } else {
      const member = directStaticMember(candidate);
      if (member?.root === rootName
        && (member.member === undefined || member.member === memberName)) return true;
    }
    if (ts.isArrayLiteralExpression(candidate)) {
      return candidate.elements.some(element => (
        !ts.isOmittedExpression(element)
        && matchesTarget(ts.isSpreadElement(element) ? element.expression : element)
      ));
    }
    if (ts.isObjectLiteralExpression(candidate)) {
      return candidate.properties.some(property => {
        if (ts.isPropertyAssignment(property)) return matchesTarget(property.initializer);
        if (ts.isShorthandPropertyAssignment(property)) return matchesTarget(property.name);
        return ts.isSpreadAssignment(property) && matchesTarget(property.expression);
      });
    }
    return ts.isBinaryExpression(candidate)
      && candidate.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && matchesTarget(candidate.left);
  };
  const reflectiveWrite = (call: ts.CallExpression): boolean => {
    const operation = directStaticMember(call.expression);
    if (!operation || call.arguments.length < 2) return false;
    const target = unwrap(call.arguments[0]);
    const targetMatches = memberName === undefined
      ? ts.isIdentifier(target) && browserGlobalNames.has(target.text)
      : ts.isIdentifier(target) && target.text === rootName;
    if (!targetMatches) return false;
    if (operation.root === 'Object'
      && (operation.member === 'assign' || operation.member === 'defineProperties')) return true;
    if (!((operation.root === 'Object' && operation.member === 'defineProperty')
      || (operation.root === 'Reflect'
        && ['defineProperty', 'deleteProperty', 'set'].includes(operation.member ?? '')))) return false;
    const key = directStringLiteral(call.arguments[1]);
    return key === (memberName ?? rootName);
  };
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isBinaryExpression(node)
      && assignmentOperators.has(node.operatorToken.kind)
      && matchesTarget(node.left)) {
      found = true;
      return;
    }
    if (((ts.isPrefixUnaryExpression(node)
        && (node.operator === ts.SyntaxKind.PlusPlusToken
          || node.operator === ts.SyntaxKind.MinusMinusToken))
      || ts.isPostfixUnaryExpression(node))
      && matchesTarget(node.operand)) {
      found = true;
      return;
    }
    if (ts.isDeleteExpression(node) && matchesTarget(node.expression)) {
      found = true;
      return;
    }
    if ((ts.isForInStatement(node) || ts.isForOfStatement(node))
      && !ts.isVariableDeclarationList(node.initializer)
      && matchesTarget(node.initializer)) {
      found = true;
      return;
    }
    if (ts.isCallExpression(node) && reflectiveWrite(node)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
};

const uniqueConstInitializer = (sourceFile: ts.SourceFile, name: string): ts.Expression | undefined => {
  const declarations: ts.VariableDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === name
      && ts.isVariableDeclarationList(node.parent)
      && (node.parent.flags & ts.NodeFlags.Const) !== 0) {
      declarations.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return declarations.length === 1 ? declarations[0].initializer : undefined;
};

const uniqueTopLevelFunction = (
  sourceFile: ts.SourceFile,
  name: string,
): ts.FunctionLikeDeclaration | undefined => {
  const declarations: ts.FunctionLikeDeclaration[] = [];
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
      declarations.push(statement);
      continue;
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== name || !declaration.initializer) {
        continue;
      }
      const initializer = unwrap(declaration.initializer);
      if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
        declarations.push(initializer);
      }
    }
  }
  return declarations.length === 1 ? declarations[0] : undefined;
};

const enclosingFunction = (node: ts.Node): ts.FunctionLikeDeclaration | undefined => {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isFunctionLike(current)) return current as ts.FunctionLikeDeclaration;
    current = current.parent;
  }
  return undefined;
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
    || call.questionDotToken !== undefined
    || call.arguments.length !== argumentNames.length
    || call.arguments.some((argument, index) => (
      !ts.isIdentifier(argument) || argument.text !== argumentNames[index]
    ))) return undefined;
  const member = unwrap(call.expression);
  if (!ts.isPropertyAccessExpression(member)
    || member.questionDotToken !== undefined
    || member.name.text !== method) return undefined;
  const storage = unwrap(member.expression);
  return ts.isPropertyAccessExpression(storage)
    && storage.questionDotToken === undefined
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
    ts.isMethodDeclaration(property)
    && ts.isIdentifier(property.name)
    && property.name.text === 'getItem'
    && property.name.getText(sourceFile) === 'getItem'
  ));
  if (getItems.length !== 1 || !ts.isMethodDeclaration(getItems[0])) return [];
  const getItem = getItems[0];
  const parameter = getItem.parameters[0];
  if (!getItem.body
    || getItem.body.statements.length !== 1
    || getItem.parameters.length !== 1
    || getItem.modifiers !== undefined
    || getItem.asteriskToken !== undefined
    || getItem.questionToken !== undefined
    || getItem.typeParameters !== undefined
    || getItem.type !== undefined
    || !parameter
    || parameter.modifiers !== undefined
    || parameter.dotDotDotToken !== undefined
    || parameter.questionToken !== undefined
    || parameter.initializer !== undefined
    || !ts.isIdentifier(parameter.name)
    || parameter.name.text !== 'key'
    || parameter.name.getText(sourceFile) !== 'key'
    || parameter.type?.kind !== ts.SyntaxKind.StringKeyword) return [];
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

  for (const input of inputs) {
    if (input.path.startsWith('tests/')) continue;
    for (const edge of externalScriptEdges(input)) {
      if (!browserEntersExcludedDirectory(edge.browserBase, edge.specifier)) continue;
      const finding = `${input.path}:${sourceLine(input.source, edge.offset)}: `
        + 'loads executable code from excluded repository paths';
      if (resultIdentities.get(input.path)!.has(finding)) continue;
      resultIdentities.get(input.path)!.add(finding);
      results.get(input.path)!.push(finding);
    }
  }

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
    const approvedBrowserPreferencesBundle = policyPath === 'onboarding/index.html'
      ? exactBrowserPreferencesBundle(input.source)
      : undefined;
    const approvedBundleStatementSyntax = approvedBrowserPreferencesBundle
      ? browserPreferencesBundleStatementSyntax(approvedBrowserPreferencesBundle.source)
      : undefined;
    const bundleStatements: ts.VariableStatement[] = [];
    if (policyPath === 'onboarding/index.html' && approvedBundleStatementSyntax) {
      const collectBundleStatements = (node: ts.Node): void => {
        if (ts.isVariableStatement(node)
          && lineSensitiveSyntaxFingerprint(node.getText(sourceFile)) === approvedBundleStatementSyntax) {
          bundleStatements.push(node);
        }
        ts.forEachChild(node, collectBundleStatements);
      };
      collectBundleStatements(sourceFile);
    }
    const approvedBundlePlacement = (statement: ts.VariableStatement): boolean => {
      if (statement.parent === sourceFile) return true;
      const block = statement.parent;
      if (!ts.isBlock(block)
        || block.statements[0] !== statement
        || block.statements.length < 2
        || (!ts.isArrowFunction(block.parent) && !ts.isFunctionExpression(block.parent))
        || block.parent.parameters.length !== 0) return false;
      const parenthesized = block.parent.parent;
      if (!ts.isParenthesizedExpression(parenthesized) || parenthesized.expression !== block.parent) return false;
      const call = parenthesized.parent;
      return ts.isCallExpression(call)
        && call.questionDotToken === undefined
        && call.expression === parenthesized
        && call.arguments.length === 0
        && ts.isExpressionStatement(call.parent)
        && call.parent.parent === sourceFile;
    };
    const approvedBundleStatement = approvedBrowserPreferencesBundle !== undefined
      && bundleStatements.length === 1
      && approvedBundlePlacement(bundleStatements[0])
      ? bundleStatements[0]
      : undefined;
    const exactStorageApprovals = policyPath === 'services/browserPreferences.ts'
      ? browserPreferenceStorageApprovals(sourceFile)
      : policyPath === 'services/localWorkspace/index.ts'
        ? localWorkspaceStorageApprovals(sourceFile)
        : [];
    const directStorageApprovedAt = (node: ts.Node): boolean => (
      exactStorageApprovals.some(approval => (
        node.getStart(sourceFile) >= approval.getStart(sourceFile) && node.end <= approval.end
      ))
      || (approvedBundleStatement !== undefined
        && node.getStart(sourceFile) >= approvedBundleStatement.getStart(sourceFile)
        && node.end <= approvedBundleStatement.end)
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
      const specifier = directStringLiteral(expression);
      if (!specifier) return;
      if (productionSource && moduleEntersExcludedDirectory(policyPath, specifier)) {
        report(node, 'loads executable code from excluded repository paths');
      }
      if (!importsAllowed && isLegacyTypesModule(specifier)) {
        report(node, 'imports local-workspace migration internals');
      }
    };
    const importMetaUrl = (expression: ts.Expression | undefined): boolean => {
      const url = expression && unwrap(expression);
      if (!url) return false;
      let receiver: ts.Expression;
      if (ts.isPropertyAccessExpression(url)) {
        if (url.name.text !== 'url') return false;
        receiver = url.expression;
      } else if (ts.isElementAccessExpression(url)) {
        if (directStringLiteral(url.argumentExpression) !== 'url') return false;
        receiver = url.expression;
      } else {
        return false;
      }
      const meta = unwrap(receiver);
      return ts.isMetaProperty(meta)
        && meta.keywordToken === ts.SyntaxKind.ImportKeyword
        && meta.name.text === 'meta';
    };
    const workerEntry = (
      node: ts.NewExpression,
    ): { specifier: string; context: 'browser' | 'source-url' } | undefined => {
      const constructor = unwrap(node.expression);
      if (!ts.isIdentifier(constructor)
        || (constructor.text !== 'Worker' && constructor.text !== 'SharedWorker')) return undefined;
      const entrypoint = node.arguments?.[0];
      const direct = directStringLiteral(entrypoint);
      if (direct !== undefined) return { specifier: direct, context: 'browser' };
      const url = entrypoint && unwrap(entrypoint);
      if (!url || !ts.isNewExpression(url)) return undefined;
      const urlConstructor = unwrap(url.expression);
      const specifier = directStringLiteral(url.arguments?.[0]);
      return ts.isIdentifier(urlConstructor)
        && urlConstructor.text === 'URL'
        && specifier !== undefined
        && importMetaUrl(url.arguments?.[1])
        ? { specifier, context: 'source-url' }
        : undefined;
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
    const exactIndexedDbPatchDescriptor = (expression: ts.Expression | undefined): boolean => {
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
        && values.get('configurable')?.kind === ts.SyntaxKind.TrueKeyword
        && values.get('writable')?.kind === ts.SyntaxKind.TrueKeyword
        && ts.isIdentifier(values.get('value')!)
        && (values.get('value') as ts.Identifier).text === 'indexedDB';
    };
    const generatorEvaluator = uniqueTopLevelFunction(sourceFile, 'generatorEvaluatorMain');
    const restoreGlobalIndexedDB = uniqueTopLevelFunction(sourceFile, 'restoreGlobalIndexedDB');
    const openWithFactory = uniqueTopLevelFunction(sourceFile, 'openWithFactory');
    const exactDeclarationSyntax = (
      declaration: ts.FunctionLikeDeclaration | undefined,
      approvedSyntax: string,
    ): boolean => declaration !== undefined
      && lineSensitiveSyntaxFingerprint(declaration.getText(sourceFile)) === approvedSyntax;
    const exactGeneratorEvaluator = exactDeclarationSyntax(
      generatorEvaluator,
      approvedGeneratorEvaluatorSyntax,
    );
    const exactRestoreGlobalIndexedDB = exactDeclarationSyntax(
      restoreGlobalIndexedDB,
      approvedRestoreIndexedDbSyntax,
    );
    const exactOpenWithFactory = exactDeclarationSyntax(
      openWithFactory,
      approvedOpenWithFactorySyntax,
    );
    const runtimeWriteCache = new Map<string, boolean>();
    const hasRuntimeWrite = (rootName: string, memberName?: string): boolean => {
      const key = memberName === undefined ? rootName : `${rootName}.${memberName}`;
      if (!runtimeWriteCache.has(key)) {
        runtimeWriteCache.set(key, sourceHasRuntimeWrite(sourceFile, rootName, memberName));
      }
      return runtimeWriteCache.get(key)!;
    };
    const unshadowedBuiltIn = (name: string): boolean => (
      sourceValueBindings(sourceFile, name).length === 0 && !hasRuntimeWrite(name)
    );
    const exactBuiltInMember = (
      expression: ts.Expression,
      rootName: string,
      memberName: string,
    ): boolean => {
      const member = unwrap(expression);
      return ts.isPropertyAccessExpression(member)
        && member.questionDotToken === undefined
        && ts.isIdentifier(member.expression)
        && member.expression.text === rootName
        && member.name.text === memberName
        && unshadowedBuiltIn(rootName)
        && !hasRuntimeWrite(rootName, memberName);
    };
    const exactTrustedAlias = (
      expression: ts.Expression,
      aliasName: string,
      rootName: string,
      memberName: string,
    ): boolean => {
      const alias = unwrap(expression);
      if (!ts.isIdentifier(alias)
        || alias.text !== aliasName
        || sourceValueBindings(sourceFile, aliasName).length !== 1
        || hasRuntimeWrite(aliasName)) return false;
      const initializer = uniqueConstInitializer(sourceFile, aliasName);
      return initializer !== undefined && exactBuiltInMember(initializer, rootName, memberName);
    };
    const approvedRootReflection = (expression: ts.Expression): boolean => {
      const call = expression.parent;
      if (!ts.isCallExpression(call)
        || call.questionDotToken !== undefined
        || call.arguments[0] !== expression) return false;
      const key = directStringLiteral(call.arguments[1]);
      if (policyPath === 'services/localWorkspace/indexedDbAdapter.ts' && key === 'indexedDB') {
        const declaration = enclosingFunction(call);
        if (declaration === restoreGlobalIndexedDB && exactRestoreGlobalIndexedDB) {
          return (call.arguments.length === 3
            && ts.isIdentifier(call.arguments[2])
            && call.arguments[2].text === 'descriptor'
            && exactBuiltInMember(call.expression, 'Object', 'defineProperty'))
            || (call.arguments.length === 2
              && exactBuiltInMember(call.expression, 'Reflect', 'deleteProperty'));
        }
        if (declaration === openWithFactory && exactOpenWithFactory) {
          return (call.arguments.length === 2
            && exactBuiltInMember(call.expression, 'Object', 'getOwnPropertyDescriptor'))
            || (call.arguments.length === 3
              && exactIndexedDbPatchDescriptor(call.arguments[2])
              && exactBuiltInMember(call.expression, 'Object', 'defineProperty'));
        }
        return false;
      }
      if (policyPath !== 'services/generatorSandbox.ts'
        || !ts.isIdentifier(expression)
        || expression.text !== 'self'
        || enclosingFunction(call) !== generatorEvaluator
        || !exactGeneratorEvaluator) return false;
      if (call.arguments.length === 3
        && exactBuiltInMember(call.expression, 'Object', 'defineProperty')
        && ts.isIdentifier(call.arguments[1])
        && call.arguments[1].text === 'name') {
        return exactWorkerBlockDescriptor(call.arguments[2]);
      }
      if (call.arguments.length !== 2
        || !exactTrustedAlias(call.expression, 'trustedObjectAssign', 'Object', 'assign')) return false;
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
    const generatorBlockedGlobals = [
      'fetch', 'XMLHttpRequest', 'WebSocket', 'localStorage', 'sessionStorage',
      'cookieStore', 'indexedDB', 'caches', 'importScripts',
      'Worker', 'SharedWorker', 'BroadcastChannel', 'MessageChannel', 'postMessage',
    ];
    const approvedInertLocalStorageData = (node: ts.Node): boolean => {
      if (policyPath !== 'services/generatorSandbox.ts'
        || !ts.isStringLiteralLike(node)
        || node.text !== 'localStorage'
        || enclosingFunction(node) !== generatorEvaluator) return false;
      const array = node.parent;
      if (!ts.isArrayLiteralExpression(array)
        || array.elements.length !== generatorBlockedGlobals.length
        || array.elements.some((element, index) => (
          !ts.isStringLiteralLike(element) || element.text !== generatorBlockedGlobals[index]
        ))) return false;
      const declaration = array.parent;
      return ts.isVariableDeclaration(declaration)
        && ts.isIdentifier(declaration.name)
        && declaration.name.text === 'blockedGlobals'
        && uniqueConstInitializer(sourceFile, 'blockedGlobals') === array
        && sourceValueBindings(sourceFile, 'blockedGlobals').length === 1;
    };
    const localStorageSyntax = (node: ts.Node): boolean => (
      (ts.isIdentifier(node) || ts.isStringLiteralLike(node))
      && node.text === 'localStorage'
      && !approvedInertLocalStorageData(node)
    );
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
      if (productionSource && ts.isNewExpression(node)) {
        const edge = workerEntry(node);
        const excluded = edge?.context === 'source-url'
          ? browserEntersExcludedDirectory(repositoryBrowserBase(policyPath), edge.specifier)
          : edge?.context === 'browser'
            ? browserEntersExcludedDirectory(
              input.browserBase ?? repositoryBrowserBase('index.html'),
              edge.specifier,
            )
            : false;
        if (excluded) {
          report(node, 'loads executable code from excluded repository paths');
        }
      }
      ts.forEachChild(node, inspectNode);
    };

    if (enforceDirectStorageBoundary
      && policyPath === 'services/browserPreferences.ts'
      && syntaxFingerprint(input.source) !== approvedBrowserPreferenceSyntax) {
      report(sourceFile, 'browser preference module does not match the approved exact syntax');
    }
    if (enforceDirectStorageBoundary
      && policyPath === 'onboarding/index.html'
      && (input.source.includes(browserPreferencesBundleStart)
        || input.source.includes(browserPreferencesBundleEnd))
      && approvedBundleStatement === undefined) {
      report(sourceFile, 'generated browser preference code does not match the approved exact syntax');
    }
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
    'pages/docs/DocsSection.tsx',
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
    ['static import', 'components/excluded.ts', "import value from '../tests/unit/value';"],
    ['named import', 'components/excluded.ts', "import { value } from '../tests/unit/value';"],
    ['default import', 'components/excluded.ts', "import value from '../tests/unit/value';"],
    ['namespace import', 'components/excluded.ts', "import * as value from '../tests/unit/value';"],
    ['re-export', 'components/excluded.ts', "export { value } from '../tests/unit/value';"],
    ['star re-export', 'components/excluded.ts', "export * from '../docs/value';"],
    ['dynamic import', 'components/excluded.ts', "void import('../tests/unit/value');"],
    ['require', 'components/excluded.cjs', "require('../scratch/value.cjs');"],
    [
      'worker URL',
      'components/excluded.ts',
      "new Worker(new URL('../tests/unit/worker.ts', import.meta.url));",
    ],
    ['direct worker', 'components/excluded.ts', "new Worker('../tests/unit/worker.ts');"],
    [
      'shared worker URL',
      'components/excluded.ts',
      "new SharedWorker(new URL('../tests/unit/worker.ts', import.meta.url));",
    ],
    [
      'parenthesized import.meta Worker URL',
      'pages/shell.ts',
      "new Worker(new URL('../tests/unit/worker.ts', (import.meta).url));",
    ],
    [
      'computed import.meta SharedWorker URL',
      'pages/shell.ts',
      "new SharedWorker(new URL('../tests/unit/worker.ts', import.meta['url']));",
    ],
    [
      'wrapped literal import.meta Worker URL',
      'pages/shell.ts',
      "new Worker(new URL('../tests/unit/worker.ts', ((import.meta as ImportMeta)[(`url` as 'url')] as string)));",
    ],
    [
      'normalized traversal',
      'components/excluded.ts',
      "import value from '../components/../tests/unit/value';",
    ],
    ['root alias', 'components/excluded.ts', "import value from '@/tests/unit/value';"],
    ['HTML script', 'shell.html', '<script src="./tests/unit/value.js"></script>'],
    [
      'SVG script',
      'assets/image.svg',
      '<svg xmlns="http://www.w3.org/2000/svg"><script '
        + 'href="../tests/unit/value.js"></script></svg>',
    ],
    [
      'SVG href over competing src',
      'shell.html',
      '<svg><script src="/app.js" href="/tests/unit/value.js"></script></svg>',
    ],
    [
      'SVG xlink fallback over competing src',
      'shell.html',
      '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><script src="/app.js" '
        + 'xlink:href="/tests/unit/value.js"></script></svg>',
    ],
    [
      'SVG href over competing xlink',
      'shell.html',
      '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><script href="/tests/unit/value.js" '
        + 'xlink:href="/app.js"></script></svg>',
    ],
    [
      'HTML src over competing href',
      'shell.html',
      '<script src="/tests/unit/value.js" href="/app.js"></script>',
    ],
  ])('rejects production executable edges into excluded paths through %s', (_case, path, source) => {
    expect(analyzeProductionSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining('loads executable code from excluded repository paths'),
    ]));
  });

  it.each([
    ['bare HTML URL', 'shell.html', '<script src="tests/unit/value.js"></script>'],
    ['root HTML URL', 'shell.html', '<script src="/tests/unit/value.js"></script>'],
    ['whitespace-padded HTML URL', 'shell.html', '<script src="  tests/unit/value.js  "></script>'],
    ['query/hash HTML URL', 'shell.html', '<script src="tests/unit/value.js?raw#entry"></script>'],
    ['encoded HTML URL', 'shell.html', '<script src="%74ests/unit/value.js"></script>'],
    ['encoded HTML separator', 'shell.html', '<script src=".%5ctests/unit/value.js"></script>'],
    [
      'bare SVG URL',
      'assets/icon.svg',
      '<svg xmlns="http://www.w3.org/2000/svg"><script '
        + 'href="../tests/unit/value.js"></script></svg>',
    ],
    ['bare direct worker URL', 'components/excluded.ts', "new Worker('tests/unit/worker.ts');"],
    ['dot direct worker URL', 'components/excluded.ts', "new Worker('./tests/unit/worker.ts');"],
    ['root direct worker URL', 'components/excluded.ts', "new Worker('/tests/unit/worker.ts');"],
    [
      'encoded direct worker separator',
      'components/excluded.ts',
      "new Worker('.%5ctests/unit/worker.ts');",
    ],
    [
      'encoded source-relative module worker URL',
      'components/excluded.ts',
      "new Worker(new URL('..%5ctests/unit/worker.ts', import.meta.url));",
    ],
  ])('rejects excluded browser URL through %s', (_case, path, source) => {
    expect(analyzeProductionSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining('loads executable code from excluded repository paths'),
    ]));
  });

  it.each([
    ['embedded HTML tab', 'shell.html', '<script src="te\tsts/unit/value.js"></script>'],
    ['embedded HTML newline', 'shell.html', '<script src="te\nsts/unit/value.js"></script>'],
    [
      'embedded SVG carriage return',
      'shell.html',
      '<svg><script href="te\rsts/unit/value.js"></script></svg>',
    ],
    ['embedded direct Worker tab', 'components/excluded.ts', "new Worker('te\\tsts/unit/worker.ts');"],
    [
      'embedded direct Worker newline',
      'components/excluded.ts',
      "new Worker('te\\nsts/unit/worker.ts');",
    ],
    [
      'embedded source-relative URL newline',
      'components/excluded.ts',
      "new Worker(new URL('..\\n/tests/unit/worker.ts', import.meta.url));",
    ],
  ])('rejects excluded browser URL through %s', (_case, path, source) => {
    expect(analyzeProductionSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining('loads executable code from excluded repository paths'),
    ]));
  });

  it.each([
    [
      'a root base',
      'pages/shell.html',
      '<base href="/"><script src="tests/unit/value.js"></script>',
    ],
    [
      'a parent-relative base',
      'pages/shell.html',
      '<base href="../"><script src="tests/unit/value.js"></script>',
    ],
    [
      'the first of multiple bases',
      'pages/shell.html',
      '<base href="/"><base href="https://cdn.example/"><script src="tests/unit/value.js"></script>',
    ],
    [
      'the first base with href',
      'pages/shell.html',
      '<base target="_blank"><base href="/"><script src="tests/unit/value.js"></script>',
    ],
    [
      'an HTML base applied to SVG script',
      'pages/shell.html',
      '<base href="/"><svg><script href="tests/unit/value.js"></script></svg>',
    ],
    [
      'an HTML base applied to an inline Worker',
      'pages/shell.html',
      '<base href="/"><script>new Worker(\'tests/unit/worker.js\');</script>',
    ],
    [
      'an invalid static base',
      'pages/shell.html',
      '<base href="http://["><script src="app.js"></script>',
    ],
    [
      'source-relative import.meta.url despite a remote base',
      'pages/shell.html',
      '<base href="https://cdn.example/"><script type="module">'
        + 'new Worker(new URL(\'../tests/unit/worker.js\', import.meta.url));</script>',
    ],
  ])('resolves executable edges against %s', (_case, path, source) => {
    expect(analyzeProductionSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining('loads executable code from excluded repository paths'),
    ]));
  });

  it.each([
    ['source import', 'components/allowed.ts', "import value from '../services/browserPreferences';"],
    ['bare package import', 'components/allowed.ts', "import value from 'tests/unit/value';"],
    ['scoped package import', 'components/allowed.ts', "import value from '@scope/tests';"],
    ['nested docs source', 'components/allowed.ts', "import value from './feature/docs/value';"],
    [
      'Blob worker',
      'components/allowed.ts',
      'const workerUrl = URL.createObjectURL(new Blob([])); new Worker(workerUrl);',
    ],
    ['direct app worker', 'components/allowed.ts', "new Worker('workers/entry.js');"],
    [
      'source-local module worker',
      'components/allowed.ts',
      "new Worker(new URL('./worker.ts', import.meta.url));",
    ],
    [
      'source-local parenthesized import.meta Worker',
      'components/allowed.ts',
      "new Worker(new URL('./worker.ts', (import.meta).url));",
    ],
    [
      'source-local computed import.meta SharedWorker',
      'components/allowed.ts',
      "new SharedWorker(new URL('./worker.ts', import.meta['url']));",
    ],
    [
      'source-local wrapped literal import.meta Worker',
      'components/allowed.ts',
      "new Worker(new URL('./worker.ts', ((import.meta as ImportMeta)[(`url` as 'url')] as string)));",
    ],
    [
      'variable import.meta receiver remains uninterpreted',
      'pages/shell.ts',
      "const meta = import.meta; new Worker(new URL('../tests/unit/worker.ts', meta.url));",
    ],
    [
      'computed import.meta key remains uninterpreted',
      'pages/shell.ts',
      "new SharedWorker(new URL('../tests/unit/worker.ts', import.meta['ur' + 'l']));",
    ],
    ['root HTML script', 'shell.html', '<script type="module" src="/index.tsx"></script>'],
    ['remote HTML script', 'shell.html', '<script src="https://cdn.example/app.js"></script>'],
    [
      'SVG src ignored when href is app-local',
      'shell.html',
      '<svg><script src="/tests/unit/value.js" href="/app.js"></script></svg>',
    ],
    [
      'SVG src-only attribute ignored',
      'shell.html',
      '<svg><script src="/tests/unit/value.js"></script></svg>',
    ],
    [
      'SVG href precedes excluded xlink',
      'shell.html',
      '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><script href="/app.js" '
        + 'xlink:href="/tests/unit/value.js"></script></svg>',
    ],
    [
      'HTML href ignored when src is app-local',
      'shell.html',
      '<script src="/app.js" href="/tests/unit/value.js"></script>',
    ],
    [
      'HTML href-only attribute ignored',
      'shell.html',
      '<script href="/tests/unit/value.js"></script>',
    ],
    [
      'other namespace external attributes ignored',
      'shell.html',
      '<math><script src="/tests/unit/value.js" href="/tests/unit/value.js"></script></math>',
    ],
    [
      'remote HTML base',
      'pages/shell.html',
      '<base href="https://cdn.example/assets/"><script src="tests/unit/value.js"></script>',
    ],
    [
      'first remote base wins',
      'pages/shell.html',
      '<base href="https://cdn.example/"><base href="/"><script src="tests/unit/value.js"></script>',
    ],
    [
      'remote inline Worker base',
      'pages/shell.html',
      '<base href="https://cdn.example/"><script>new Worker(\'tests/unit/worker.js\');</script>',
    ],
    [
      'embedded control in remote URL',
      'shell.html',
      '<script src="https:\t//cdn.example/app.js"></script>',
    ],
    [
      'absolute remote URL under invalid base',
      'pages/shell.html',
      '<base href="http://["><script src="https://cdn.example/app.js"></script>',
    ],
    [
      'remote direct Worker URL',
      'components/allowed.ts',
      "new Worker('https:\\t//cdn.example/worker.js');",
    ],
    [
      'inert script under invalid base',
      'pages/shell.html',
      '<base href="http://["><script type="application/json" src="tests/unit/data.json"></script>',
    ],
    [
      'inert external data',
      'shell.html',
      '<script type="application/json" src="./tests/unit/data.json"></script>',
    ],
  ])('allows production executable edge through %s', (_case, path, source) => {
    expect(analyzeProductionSource(path, source)).toEqual([]);
  });

  it.each([
    [
      'HTML empty type before language',
      'shell.html',
      '<script type="" language="json" src="/tests/edge.js"></script>',
    ],
    [
      'HTML module despite nomodule',
      'shell.html',
      '<script type="module" nomodule src="/tests/edge.js"></script>',
    ],
    [
      'HTML normalized JavaScript MIME',
      'shell.html',
      '<script type=" Text/JavaScript " src="/tests/edge.js"></script>',
    ],
    [
      'HTML exact mixed-case module',
      'shell.html',
      '<script type="MoDuLe" src="/tests/edge.js"></script>',
    ],
    [
      'SVG exact mixed-case module',
      'assets/types.svg',
      '<svg xmlns="http://www.w3.org/2000/svg"><script type="MoDuLe" '
        + 'href="../tests/edge.js"/></svg>',
    ],
    [
      'XHTML exact mixed-case module',
      'assets/types.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/1999/xhtml">'
        + '<h:script type="MoDuLe" src="../tests/edge.js"/></svg>',
    ],
    [
      'SVG absent type ignoring language and nomodule',
      'assets/types.svg',
      '<svg xmlns="http://www.w3.org/2000/svg"><script language="json" nomodule="" '
        + 'href="../tests/edge.js"/></svg>',
    ],
    [
      'SVG empty type ignoring language and nomodule',
      'assets/types.svg',
      '<svg xmlns="http://www.w3.org/2000/svg"><script type="" language="json" nomodule="" '
        + 'href="../tests/edge.js"/></svg>',
    ],
    [
      'XHTML empty type before language',
      'assets/types.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/1999/xhtml">'
        + '<h:script type="" language="json" src="../tests/edge.js"/></svg>',
    ],
    [
      'XHTML absent type with JavaScript language',
      'assets/types.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/1999/xhtml">'
        + '<h:script language="javascript" src="../tests/edge.js"/></svg>',
    ],
    [
      'XHTML module despite nomodule',
      'assets/types.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/1999/xhtml">'
        + '<h:script type="module" nomodule="" src="../tests/edge.js"/></svg>',
    ],
  ])('rejects excluded external script through %s', (_case, path, source) => {
    expect(analyzeProductionSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining('loads executable code from excluded repository paths'),
    ]));
  });

  it.each([
    [
      'HTML absent type with non-JavaScript language',
      'shell.html',
      '<script language="json" src="/tests/edge.js"></script>',
    ],
    [
      'HTML absent type with trailing language whitespace',
      'shell.html',
      '<script language="javascript " src="/tests/edge.js"></script>',
    ],
    [
      'HTML absent type with leading language whitespace',
      'shell.html',
      '<script language=" javascript" src="/tests/edge.js"></script>',
    ],
    [
      'HTML whitespace-only type',
      'shell.html',
      '<script type=" " src="/tests/edge.js"></script>',
    ],
    [
      'HTML padded module',
      'shell.html',
      '<script type=" module " src="/tests/edge.js"></script>',
    ],
    [
      'HTML classic nomodule',
      'shell.html',
      '<script type="text/javascript" nomodule src="/tests/edge.js"></script>',
    ],
    [
      'SVG non-JavaScript type despite language',
      'assets/types.svg',
      '<svg xmlns="http://www.w3.org/2000/svg"><script type="application/json" '
        + 'language="javascript" nomodule="" href="../tests/edge.js"/></svg>',
    ],
    [
      'SVG whitespace-only type',
      'assets/types.svg',
      '<svg xmlns="http://www.w3.org/2000/svg"><script type=" " '
        + 'href="../tests/edge.js"/></svg>',
    ],
    [
      'SVG padded module',
      'assets/types.svg',
      '<svg xmlns="http://www.w3.org/2000/svg"><script type=" module " '
        + 'href="../tests/edge.js"/></svg>',
    ],
    [
      'XHTML absent type with non-JavaScript language',
      'assets/types.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/1999/xhtml">'
        + '<h:script language="json" src="../tests/edge.js"/></svg>',
    ],
    [
      'XHTML absent type with trailing language whitespace',
      'assets/types.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/1999/xhtml">'
        + '<h:script language="javascript " src="../tests/edge.js"/></svg>',
    ],
    [
      'XHTML absent type with leading language whitespace',
      'assets/types.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/1999/xhtml">'
        + '<h:script language=" javascript" src="../tests/edge.js"/></svg>',
    ],
    [
      'XHTML whitespace-only type',
      'assets/types.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/1999/xhtml">'
        + '<h:script type=" " src="../tests/edge.js"/></svg>',
    ],
    [
      'XHTML padded module',
      'assets/types.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/1999/xhtml">'
        + '<h:script type=" module " src="../tests/edge.js"/></svg>',
    ],
    [
      'XHTML classic nomodule',
      'assets/types.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/1999/xhtml">'
        + '<h:script type="text/javascript" nomodule="" src="../tests/edge.js"/></svg>',
    ],
  ])('allows inert external script through %s', (_case, path, source) => {
    expect(analyzeProductionSource(path, source)).toEqual([]);
  });

  it.each([
    [
      'HTML empty type before language',
      'shell.html',
      '<script type="" language="json">window.localStorage.getItem(\'x\');</script>',
    ],
    [
      'HTML module despite nomodule',
      'shell.html',
      '<script type="module" nomodule>window.localStorage.getItem(\'x\');</script>',
    ],
    [
      'HTML exact mixed-case module',
      'shell.html',
      '<script type="MoDuLe">window.localStorage.getItem(\'x\');</script>',
    ],
    [
      'SVG exact mixed-case module',
      'assets/types.svg',
      '<svg xmlns="http://www.w3.org/2000/svg"><script type="MoDuLe">'
        + "window.localStorage.getItem('x');</script></svg>",
    ],
    [
      'XHTML exact mixed-case module',
      'assets/types.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/1999/xhtml">'
        + '<h:script type="MoDuLe">window.localStorage.getItem(\'x\');</h:script></svg>',
    ],
    [
      'SVG absent type ignoring language and nomodule',
      'assets/types.svg',
      '<svg xmlns="http://www.w3.org/2000/svg"><script language="json" nomodule="">'
        + "window.localStorage.getItem('x');</script></svg>",
    ],
    [
      'SVG empty type ignoring language and nomodule',
      'assets/types.svg',
      '<svg xmlns="http://www.w3.org/2000/svg"><script type="" language="json" nomodule="">'
        + "window.localStorage.getItem('x');</script></svg>",
    ],
    [
      'XHTML empty type before language',
      'assets/types.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/1999/xhtml">'
        + '<h:script type="" language="json">window.localStorage.getItem(\'x\');</h:script></svg>',
    ],
    [
      'XHTML module despite nomodule',
      'assets/types.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/1999/xhtml">'
        + '<h:script type="module" nomodule="">'
        + "window.localStorage.getItem('x');</h:script></svg>",
    ],
  ])('analyzes eligible inline script through %s', (_case, path, source) => {
    expect(analyzeProductionSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining('accesses production localStorage outside approved persistence modules'),
    ]));
  });

  it.each([
    [
      'HTML absent type with non-JavaScript language',
      'shell.html',
      '<script language="json">window.localStorage.getItem(\'x\');</script>',
    ],
    [
      'HTML absent type with trailing language whitespace',
      'shell.html',
      '<script language="javascript ">window.localStorage.getItem(\'x\');</script>',
    ],
    [
      'HTML absent type with leading language whitespace',
      'shell.html',
      '<script language=" javascript">window.localStorage.getItem(\'x\');</script>',
    ],
    [
      'HTML whitespace-only type',
      'shell.html',
      '<script type=" ">window.localStorage.getItem(\'x\');</script>',
    ],
    [
      'HTML padded module',
      'shell.html',
      '<script type=" module ">window.localStorage.getItem(\'x\');</script>',
    ],
    [
      'HTML classic nomodule',
      'shell.html',
      '<script type="text/javascript" nomodule>window.localStorage.getItem(\'x\');</script>',
    ],
    [
      'SVG non-JavaScript type despite language',
      'assets/types.svg',
      '<svg xmlns="http://www.w3.org/2000/svg"><script type="application/json" '
        + 'language="javascript" nomodule="">window.localStorage.getItem(\'x\');</script></svg>',
    ],
    [
      'SVG whitespace-only type',
      'assets/types.svg',
      '<svg xmlns="http://www.w3.org/2000/svg"><script type=" ">'
        + "window.localStorage.getItem('x');</script></svg>",
    ],
    [
      'SVG padded module',
      'assets/types.svg',
      '<svg xmlns="http://www.w3.org/2000/svg"><script type=" module ">'
        + "window.localStorage.getItem('x');</script></svg>",
    ],
    [
      'XHTML absent type with non-JavaScript language',
      'assets/types.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/1999/xhtml">'
        + '<h:script language="json">window.localStorage.getItem(\'x\');</h:script></svg>',
    ],
    [
      'XHTML absent type with trailing language whitespace',
      'assets/types.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/1999/xhtml">'
        + '<h:script language="javascript ">window.localStorage.getItem(\'x\');</h:script></svg>',
    ],
    [
      'XHTML absent type with leading language whitespace',
      'assets/types.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/1999/xhtml">'
        + '<h:script language=" javascript">window.localStorage.getItem(\'x\');</h:script></svg>',
    ],
    [
      'XHTML whitespace-only type',
      'assets/types.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/1999/xhtml">'
        + '<h:script type=" ">window.localStorage.getItem(\'x\');</h:script></svg>',
    ],
    [
      'XHTML padded module',
      'assets/types.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/1999/xhtml">'
        + '<h:script type=" module ">window.localStorage.getItem(\'x\');</h:script></svg>',
    ],
    [
      'XHTML classic nomodule',
      'assets/types.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/1999/xhtml">'
        + '<h:script type="text/javascript" nomodule="">'
        + "window.localStorage.getItem('x');</h:script></svg>",
    ],
  ])('skips inert inline script through %s', (_case, path, source) => {
    expect(analyzeProductionSource(path, source)).toEqual([]);
  });

  it.each([
    [
      'a prefixed SVG script',
      'assets/prefixed.svg',
      [
        '<?xml version="1.0"?>',
        '<s:svg xmlns:s="http://www.w3.org/2000/svg">',
        '  <s:script href="../tests/edge.js"/>',
        '</s:svg>',
      ].join('\n'),
      3,
    ],
    [
      'an arbitrary XLink prefix after inert competing attributes',
      'assets/xlink.svg',
      [
        '<svg xmlns="http://www.w3.org/2000/svg"',
        '  xmlns:load="http://www.w3.org/1999/xlink" xmlns:other="urn:other">',
        '  <?edge value=">"?>',
        '  <script src="../app.js" HREF="../app.js" other:href="../app.js"',
        '    load:href="../tests/edge.js"/>',
        '</svg>',
      ].join('\n'),
      4,
    ],
    [
      'an XHTML script',
      'assets/xhtml.svg',
      [
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/1999/xhtml">',
        '  <h:script href="../app.js" src="../tests/edge.js"/>',
        '</svg>',
      ].join('\n'),
      2,
    ],
  ])('rejects standalone SVG external edge through %s', (_case, path, source, line) => {
    expect(analyzeProductionSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining(`${path}:${line}: loads executable code from excluded repository paths`),
    ]));
  });

  it.each([
    [
      'namespace-free script',
      '<svg xmlns="http://www.w3.org/2000/svg"><script xmlns="" href="../tests/edge.js"/></svg>',
    ],
    [
      'uppercase SVG element',
      '<svg xmlns="http://www.w3.org/2000/svg"><SCRIPT href="../tests/edge.js"/></svg>',
    ],
    [
      'uppercase SVG attribute',
      '<svg xmlns="http://www.w3.org/2000/svg"><script HREF="../tests/edge.js"/></svg>',
    ],
    [
      'other-namespace script',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:o="urn:other">'
        + '<o:script href="../tests/edge.js"/></svg>',
    ],
    [
      'SVG href before XLink with inert src',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:any="http://www.w3.org/1999/xlink">'
        + '<script src="../tests/edge.js" href="../app.js" any:href="../tests/edge.js"/></svg>',
    ],
    [
      'XHTML src before inert href',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/1999/xhtml">'
        + '<h:script href="../tests/edge.js" src="../app.js"/></svg>',
    ],
  ])('allows standalone SVG external %s', (_case, source) => {
    expect(analyzeProductionSource('assets/inert.svg', source)).toEqual([]);
  });

  it.each([
    [
      'prefixed SVG CDATA',
      [
        '<s:svg xmlns:s="http://www.w3.org/2000/svg">',
        '  <s:script><![CDATA[',
        "window.localStorage.getItem('x');",
        '  ]]></s:script>',
        '</s:svg>',
      ].join('\n'),
      3,
    ],
    [
      'XHTML entity text',
      [
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/1999/xhtml">',
        '  <h:script>',
        'window.localStorage.getItem(&apos;x&apos;);',
        '  </h:script>',
        '</svg>',
      ].join('\n'),
      3,
    ],
    [
      'uppercase inert href with inline SVG source',
      [
        '<svg xmlns="http://www.w3.org/2000/svg">',
        '  <script HREF="../tests/edge.js">',
        "window.localStorage.getItem('x');",
        '  </script>',
        '</svg>',
      ].join('\n'),
      3,
    ],
    [
      'comments, processing instructions, quoted greater-than, and CDATA',
      [
        '<?xml version="1.0"?>',
        '<svg xmlns="http://www.w3.org/2000/svg" data-note=">">',
        '  <!-- authored > comment -->',
        '  <script>',
        '    <?inside value=">"?>',
        '    <![CDATA[',
        "window.localStorage.getItem('x');",
        '    ]]>',
        '  </script>',
        '</svg>',
      ].join('\n'),
      7,
    ],
  ])('maps standalone SVG inline %s to its authored line', (_case, source, line) => {
    const path = 'assets/inline.svg';
    expect(analyzeProductionSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining(`${path}:${line}: accesses production localStorage`),
    ]));
  });

  it.each([
    [
      'namespace-free script',
      '<svg xmlns="http://www.w3.org/2000/svg"><script xmlns="">'
        + "window.localStorage.getItem('x');</script></svg>",
    ],
    [
      'uppercase SVG element',
      '<svg xmlns="http://www.w3.org/2000/svg"><SCRIPT>'
        + "window.localStorage.getItem('x');</SCRIPT></svg>",
    ],
    [
      'other-namespace script',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:o="urn:other"><o:script>'
        + "window.localStorage.getItem('x');</o:script></svg>",
    ],
  ])('skips standalone SVG inline %s', (_case, source) => {
    expect(analyzeProductionSource('assets/inert-inline.svg', source)).toEqual([]);
  });

  it.each([
    [
      'external general-entity expansion',
      'assets/external-entity.svg',
      [
        '<?xml version="1.0"?>',
        '<!DOCTYPE svg [',
        '  <!ENTITY payload "<script xmlns=\'http://www.w3.org/2000/svg\' '
          + 'href=\'../tests/edge.js\'/>">',
        ']>',
        '<svg xmlns="http://www.w3.org/2000/svg">&payload;</svg>',
      ].join('\n'),
      2,
    ],
    [
      'inline general-entity expansion',
      'assets/inline-entity.svg',
      [
        '<?xml version="1.0"?>',
        '<!DOCTYPE svg [',
        '  <!ENTITY payload "<script xmlns=\'http://www.w3.org/2000/svg\'>'
          + 'window.localStorage.getItem(\'x\');</script>">',
        ']>',
        '<svg xmlns="http://www.w3.org/2000/svg">&payload;</svg>',
      ].join('\n'),
      2,
    ],
    [
      'valid internal-subset comment',
      'assets/comment-subset.svg',
      [
        '<?xml version="1.0"?>',
        '<!DOCTYPE svg [<!-- ]] -->]>',
        '<svg xmlns="http://www.w3.org/2000/svg"/>',
      ].join('\n'),
      2,
    ],
    [
      'valid internal-subset processing instruction',
      'assets/pi-subset.svg',
      [
        '<?xml version="1.0"?>',
        '<!DOCTYPE svg [<?policy keep?>]>',
        '<svg xmlns="http://www.w3.org/2000/svg"/>',
      ].join('\n'),
      2,
    ],
    [
      'legal prolog comment containing a DOCTYPE decoy',
      'assets/comment-decoy.svg',
      [
        '<?xml version="1.0"?>',
        '<!-- <!DOCTYPE decoy> -->',
        '<!DOCTYPE svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"/>',
      ].join('\n'),
      3,
    ],
    [
      'legal prolog processing instruction containing a DOCTYPE decoy',
      'assets/pi-decoy.svg',
      [
        '<?xml version="1.0"?>',
        '<?audit <!DOCTYPE decoy>?>',
        '<!DOCTYPE svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"/>',
      ].join('\n'),
      3,
    ],
    [
      'CRLF multiline prolog trivia and declaration',
      'assets/multiline-decoy.svg',
      [
        '<?xml version="1.0"?>',
        '<!--',
        '  <!DOCTYPE comment-decoy>',
        '-->',
        '<?audit',
        '  <!DOCTYPE pi-decoy>',
        '?>',
        '<!DOCTYPE',
        '  svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"/>',
      ].join('\r\n'),
      8,
    ],
  ])('rejects standalone SVG DTD through %s', (_case, path, source, line) => {
    expect(analyzeProductionSource(path, source)).toEqual([
      `${path}:${line}: could not be parsed: standalone SVG DTD syntax is not supported`,
    ]);
  });

  it('fails closed for malformed standalone SVG XML at the authored line', () => {
    const path = 'assets/malformed.svg';
    const source = [
      '<svg xmlns="http://www.w3.org/2000/svg">',
      '  <script>',
      "window.localStorage.getItem('x');",
      '</svg>',
    ].join('\n');
    expect(analyzeProductionSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining(`${path}:4: could not be parsed`),
    ]));
  });

  it('rejects a production import that launders executable code from tests', () => {
    const consumerPath = 'components/TestProviderConsumer.ts';
    const findings = analyzeSources([
      {
        path: 'tests/helpers/provider.ts',
        source: "export const read = () => window.localStorage.getItem('x');",
        directStorageBoundary: true,
      },
      {
        path: consumerPath,
        source: "import { read } from '../tests/helpers/provider'; void read();",
        directStorageBoundary: true,
      },
    ] as DirectStorageBoundaryInput[]).get(consumerPath) ?? [];
    expect(findings).toEqual(expect.arrayContaining([
      expect.stringContaining('loads executable code from excluded repository paths'),
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
    ['identifier declaration', 'const localStorage = {};'],
    ['string data', "const key = 'localStorage';"],
    ['template data', 'const key = `localStorage`;'],
    ['computed Reflect', "Reflect['get'](supplied, 'localStorage');"],
    ['aliased Reflect.get', "const get = Reflect.get; get(supplied, 'localStorage');"],
    ['qualified Reflect', "globalThis.Reflect.get(supplied, 'localStorage');"],
    [
      'aliased Reflect.apply',
      "const apply = Reflect.apply; apply(Reflect.get, Reflect, [supplied, 'localStorage']);",
    ],
    [
      'computed destructuring alias',
      "const key = 'localStorage'; const { [key]: storage } = supplied; void storage;",
    ],
    ['object property', 'const value = { localStorage: true };'],
    ['class property', 'class Value { localStorage = true; }'],
    ['shorthand property', 'const localStorage = true; const value = { localStorage };'],
  ])('reserves exact executable localStorage syntax in %s', (_case, source) => {
    expect(analyzeProductionSource('components/ReservedStorage.ts', source)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('accesses production localStorage outside approved persistence modules'),
      ]),
    );
  });

  it('allows only the current inert generatorSandbox blocked-global entry', () => {
    expect(analyzeProductionSource(
      'services/generatorSandbox.ts',
      readFileSync(join(root, 'services/generatorSandbox.ts'), 'utf8'),
    )).toEqual([]);
  });

  it.each([
    ['classic', "<script>const key = 'localStorage';</script>"],
    ['module', "<script type=\"module\">const key = `localStorage`;</script>"],
  ])('reserves exact localStorage data syntax in %s HTML', (_case, source) => {
    expect(analyzeProductionSource('shell.html', source)).toEqual(expect.arrayContaining([
      expect.stringContaining('accesses production localStorage outside approved persistence modules'),
    ]));
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

  it.each([
    [
      'generatorSandbox trustedObjectAssign',
      'services/generatorSandbox.ts',
      (source: string) => source.replace(
        'const trustedObjectAssign = Object.assign;',
        'const trustedObjectAssign = (root: unknown): unknown => root;',
      ),
    ],
    [
      'generatorSandbox Object parameter',
      'services/generatorSandbox.ts',
      (source: string) => source.replace(
        'function generatorEvaluatorMain(maxOutputBytes: number) {',
        'function generatorEvaluatorMain(maxOutputBytes: number, Object: { defineProperty: (...args: unknown[]) => unknown }) {',
      ),
    ],
    [
      'indexedDbAdapter Object',
      'services/localWorkspace/indexedDbAdapter.ts',
      (source: string) => source.replace(
        'const openWithFactory = <T>(indexedDB: IDBFactory, operation: () => T): T => {',
        `const openWithFactory = <T>(indexedDB: IDBFactory, operation: () => T): T => {
  const Object = {
    defineProperty: (..._args: unknown[]) => undefined,
    getOwnPropertyDescriptor: (..._args: unknown[]) => undefined,
  };`,
      ),
    ],
    [
      'indexedDbAdapter Reflect',
      'services/localWorkspace/indexedDbAdapter.ts',
      (source: string) => `${source}\nfunction Reflect() {}\n`,
    ],
  ])('revokes browser-root exceptions when %s is shadowed', (_case, path, mutate) => {
    const original = readFileSync(join(root, path), 'utf8');
    const source = mutate(original);
    expect(source).not.toBe(original);
    expect(analyzeProductionSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining('passes a browser global outside approved static access'),
    ]));
  });

  it.each([
    ['value namespace', 'namespace Object { export const defineProperty = suppliedMethod; }'],
    ['Object reassignment', 'Object = suppliedObject;'],
    ['Reflect reassignment', 'Reflect = suppliedReflect;'],
    ['computed method assignment', "Object['defineProperty'] = suppliedMethod;"],
    ['method update', 'Object.defineProperty++;'],
    ['method deletion', 'delete Reflect.deleteProperty;'],
    ['Reflect.set method write', "Reflect.set(Object, 'defineProperty', suppliedMethod);"],
    [
      'Object.defineProperty method write',
      "Object.defineProperty(Reflect, 'deleteProperty', { value: suppliedMethod });",
    ],
  ])('revokes reflection exceptions after %s', (_case, mutation) => {
    const path = 'services/localWorkspace/indexedDbAdapter.ts';
    const original = readFileSync(join(root, path), 'utf8');
    const source = `${original}\n${mutation}\n`;
    expect(analyzeProductionSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining('passes a browser global outside approved static access'),
    ]));
  });

  it.each([
    ['an array member target', '[Object.defineProperty] = [replacement];'],
    [
      'an object property target',
      '({ value: Object.defineProperty } = { value: replacement });',
    ],
    ['a for-of member target', 'for (Object.defineProperty of [replacement]) {}'],
    ['a for-in member target', "for (Object['defineProperty'] in replacement) {}"],
    ['an array root target', '[Object] = [replacement];'],
    ['a for-of root target', 'for (Object of [replacement]) {}'],
    ['a computed array member target', "[Object['defineProperty']] = [replacement];"],
    ['a nested array target', '[[Object.defineProperty]] = [[replacement]];'],
    [
      'a nested object target',
      '({ outer: { value: Object.defineProperty } } = replacement);',
    ],
    ['an array rest target', '[...Object.defineProperty] = replacement;'],
    ['an object rest target', '({...Object} = replacement);'],
    ['a default target', '[Object.defineProperty = replacement] = supplied;'],
    ['a shorthand target', '({ Object } = replacement);'],
    ['a shorthand default target', '({ Object = replacement } = supplied);'],
    ['a parenthesized target', '[((Object.defineProperty))] = [replacement];'],
    ['an assertion-wrapped target', '[(Object.defineProperty as any)] = [replacement];'],
  ])('revokes reflection exceptions after %s', (_case, mutation) => {
    const path = 'services/localWorkspace/indexedDbAdapter.ts';
    const original = readFileSync(join(root, path), 'utf8');
    const source = `${original}\n${mutation}\n`;
    expect(analyzeProductionSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining('passes a browser global outside approved static access'),
    ]));
  });

  it.each([
    'services/generatorSandbox.ts',
    'services/localWorkspace/indexedDbAdapter.ts',
  ])('allows current trusted reflection syntax in %s', path => {
    expect(analyzeProductionSource(path, readFileSync(join(root, path), 'utf8'))).toEqual([]);
  });

  it.each([
    ['an array pattern', '[trustedObjectAssign] = [Object.assign];'],
    ['a for-of target', 'for (trustedObjectAssign of [Object.assign]) {}'],
  ])('revokes the trusted assignment alias through %s', (_case, mutation) => {
    const path = 'services/generatorSandbox.ts';
    const original = readFileSync(join(root, path), 'utf8');
    const source = `${original}\n${mutation}\n`;
    expect(analyzeProductionSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining('passes a browser global outside approved static access'),
    ]));
  });

  it.each([
    [
      'ASI changes a return into a separate call',
      (source: string) => source.replace(
        '    return operation();\n  } finally {',
        '    return\n      operation();\n  } finally {',
      ),
    ],
    [
      'same tokens are regrouped onto another line',
      (source: string) => source.replace(
        "  if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor);",
        "  if (descriptor)\n    Object.defineProperty(globalThis, 'indexedDB', descriptor);",
      ),
    ],
  ])('revokes exact reflection declaration approval when %s', (_case, mutate) => {
    const path = 'services/localWorkspace/indexedDbAdapter.ts';
    const original = readFileSync(join(root, path), 'utf8');
    const source = mutate(original);
    expect(source).not.toBe(original);
    expect(analyzeProductionSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining('passes a browser global outside approved static access'),
    ]));
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
      'an arbitrary default',
      (source: string) => source.replace(
        'getItem(key: string) {',
        "getItem(key: string = 'arbitrary-preference') {",
      ),
    ],
    [
      'an escaped legacy-key default',
      (source: string) => source.replace(
        'getItem(key: string) {',
        "getItem(key: string = '\\x68ype_projects') {",
      ),
    ],
    [
      'escaped parameter spelling',
      (source: string) => source.replace('getItem(key: string) {', 'getItem(k\\u0065y: string) {'),
    ],
    [
      'escaped method spelling',
      (source: string) => source.replace('getItem(key: string) {', 'g\\u0065tItem(key: string) {'),
    ],
    [
      'an optional parameter',
      (source: string) => source.replace('getItem(key: string) {', 'getItem(key?: string) {'),
    ],
    [
      'a rest parameter',
      (source: string) => source.replace('getItem(key: string) {', 'getItem(...key: string[]) {'),
    ],
    [
      'an any parameter',
      (source: string) => source.replace('getItem(key: string) {', 'getItem(key: any) {'),
    ],
    [
      'a missing parameter type',
      (source: string) => source.replace('getItem(key: string) {', 'getItem(key) {'),
    ],
    [
      'a parenthesized parameter type',
      (source: string) => source.replace('getItem(key: string) {', 'getItem(key: (string)) {'),
    ],
    [
      'a type parameter',
      (source: string) => source.replace('getItem(key: string) {', 'getItem<T>(key: string) {'),
    ],
    [
      'an async modifier',
      (source: string) => source.replace('getItem(key: string) {', 'async getItem(key: string) {'),
    ],
    [
      'a generator method',
      (source: string) => source.replace('getItem(key: string) {', '*getItem(key: string) {'),
    ],
    [
      'a computed method name',
      (source: string) => source.replace('getItem(key: string) {', "['getItem'](key: string) {"),
    ],
    [
      'a string-literal method name',
      (source: string) => source.replace('getItem(key: string) {', "'getItem'(key: string) {"),
    ],
    [
      'an explicit return type',
      (source: string) => source.replace(
        'getItem(key: string) {',
        'getItem(key: string): string | null {',
      ),
    ],
    [
      'an arbitrary identifier',
      (source: string) => source
        .replace('getItem(key: string) {', 'getItem(value: string) {')
        .replace('window.localStorage.getItem(key)', 'window.localStorage.getItem(value)'),
    ],
    [
      'a wrapped call argument',
      (source: string) => source.replace(
        'window.localStorage.getItem(key)',
        'window.localStorage.getItem((key))',
      ),
    ],
    [
      'an optional call',
      (source: string) => source.replace(
        'window.localStorage.getItem(key)',
        'window.localStorage.getItem?.(key)',
      ),
    ],
  ])('revokes localWorkspace storage approval after %s', (_case, mutate) => {
    const path = 'services/localWorkspace/index.ts';
    const original = readFileSync(join(root, path), 'utf8');
    const source = mutate(original);
    expect(source).not.toBe(original);
    expect(analyzeProductionSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining('accesses production localStorage outside approved persistence modules'),
    ]));
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

  it.each([
    [
      'an any annotation',
      (source: string) => source.replace(
        'export const readBrowserPreference =',
        'export const readBrowserPreference: any =',
      ),
    ],
    [
      'an any assertion',
      (source: string) => source.replace(
        `export const writeBrowserPreference = (
  key: BrowserPreferenceKey,
  value: string,
): boolean => (
  isBrowserPreferenceKey(key) && writeRuntimeBrowserPreference(key, value)
);`,
        `export const writeBrowserPreference = (
  key: BrowserPreferenceKey,
  value: string,
): boolean => (
  isBrowserPreferenceKey(key) && writeRuntimeBrowserPreference(key, value)
) as any;`,
      ),
    ],
    [
      'an added fixed key',
      (source: string) => source.replace(
        "  'doctect-onboarding',",
        "  'doctect-onboarding',\n  'extra-preference',",
      ),
    ],
    [
      'an always-true runtime guard',
      (source: string) => source.replace(
        `const isRuntimeBrowserPreferenceKey = (key: unknown): key is RuntimeBrowserPreferenceKey => (
  isBrowserPreferenceKey(key)
  || (typeof key === 'string' && key.startsWith(migrationReceiptPrefix))
);`,
        'const isRuntimeBrowserPreferenceKey = (_key: unknown): _key is RuntimeBrowserPreferenceKey => true;',
      ),
    ],
    [
      'an optional read call',
      (source: string) => source.replace(
        'window.localStorage.getItem(key)',
        'window.localStorage.getItem?.(key)',
      ),
    ],
    [
      'an optional write call',
      (source: string) => source.replace(
        'window.localStorage.setItem(key, value)',
        'window.localStorage.setItem?.(key, value)',
      ),
    ],
    [
      'a private operation property leak',
      (source: string) => `${source}\nObject.assign(readBrowserPreference, { leakedWrite: writeRuntimeBrowserPreference });\n`,
    ],
    [
      'a raw key use',
      (source: string) => source.replace(
        '  try {\n    if (typeof window',
        '  void key;\n  try {\n    if (typeof window',
      ),
    ],
    [
      'a decorated receipt prefix',
      (source: string) => source.replace(
        '`${migrationReceiptPrefix}${receiptId}`',
        '`${migrationReceiptPrefix}x${receiptId}`',
      ),
    ],
    [
      'a tautological public guard',
      (source: string) => source.replace(
        'isBrowserPreferenceKey(key) ? readRuntimeBrowserPreference(key) : null',
        '(isBrowserPreferenceKey(key) || true) ? readRuntimeBrowserPreference(key) : null',
      ),
    ],
    [
      'a wrapped public read',
      (source: string) => source.replace(
        'readRuntimeBrowserPreference(key) : null',
        '(readRuntimeBrowserPreference(key)) : null',
      ),
    ],
  ])('rejects non-exact browserPreferences syntax through %s', (_case, mutate) => {
    const original = readFileSync(join(root, 'services/browserPreferences.ts'), 'utf8');
    const source = mutate(original);
    expect(source).not.toBe(original);
    expect(analyzeProductionSource('services/browserPreferences.ts', source)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('does not match the approved exact syntax'),
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

  it('pins builder source, output, and committed preference region independently', () => {
    const bundle = buildBrowserPreferencesBundle(root);
    const committed = readFileSync(join(root, 'onboarding/index.html'), 'utf8');
    const builderSource = readFileSync(join(root, 'onboarding/build.mjs'), 'utf8');
    const builderSourceFile = ts.createSourceFile(
      'onboarding/build.mjs',
      builderSource,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
    const builderDeclaration = uniqueTopLevelFunction(
      builderSourceFile,
      'buildBrowserPreferencesBundle',
    );
    const builtRegion = exactBrowserPreferencesBundle(bundle);
    const committedRegion = exactBrowserPreferencesBundle(committed);

    expect(exactOccurrenceCount(bundle, browserPreferencesBundleStart)).toBe(1);
    expect(exactOccurrenceCount(bundle, browserPreferencesBundleEnd)).toBe(1);
    expect(exactOccurrenceCount(committed, browserPreferencesBundleStart)).toBe(1);
    expect(exactOccurrenceCount(committed, browserPreferencesBundleEnd)).toBe(1);
    expect(Buffer.byteLength(bundle, 'utf8')).toBe(approvedBrowserPreferencesBundleBytes);
    expect(createHash('sha256').update(bundle).digest('hex')).toBe(approvedBrowserPreferencesBundleHash);
    expect(builderDeclaration).toBeDefined();
    expect(lineSensitiveSyntaxFingerprint(builderDeclaration!.getText(builderSourceFile)))
      .toBe(approvedBrowserPreferencesBuilderSyntax);
    expect(browserPreferencesBundleStatementSyntax(bundle)).toBeDefined();
    expect(builtRegion?.source).toBe(bundle);
    expect(committedRegion?.source).toBe(bundle);
    expect(analyzeProductionSource('onboarding/index.html', `<script>${bundle}</script>`)).toEqual([]);
    expect(analyzeProductionSource(
      'onboarding/index.html',
      `<script>${bundle}\nwindow.localStorage.getItem('x');</script>`,
    )).toEqual(expect.arrayContaining([
      expect.stringContaining('accesses production localStorage outside approved persistence modules'),
    ]));
  });

  it('rejects exact-marker preference capability mutations', () => {
    const publicReturn = 'return { readBrowserPreference, writeBrowserPreference, '
      + 'wasMigrationReceiptSeen, markMigrationReceiptSeen };';
    const original = buildBrowserPreferencesBundle(root);
    const malicious = original.replace(publicReturn, `
Object.defineProperty(readBrowserPreference, 'leakedWrite', {
  value: writeRuntimeBrowserPreference,
});
Object.defineProperty(writeBrowserPreference, Symbol('rawStorage'), {
  value: window.localStorage,
});
${publicReturn}`);
    expect(malicious).not.toBe(original);
    expect(exactBrowserPreferencesBundle(malicious)).toBeUndefined();
    expect(analyzeProductionSource('onboarding/index.html', `<script>${malicious}</script>`)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('generated browser preference code does not match the approved exact syntax'),
      ]),
    );
  });

  it.each([
    ['duplicate start marker', (bundle: string) => `${browserPreferencesBundleStart}\n${bundle}`],
    ['duplicate end marker', (bundle: string) => `${bundle}\n${browserPreferencesBundleEnd}`],
    ['missing start marker', (bundle: string) => bundle.replace(browserPreferencesBundleStart, '')],
    ['missing end marker', (bundle: string) => bundle.replace(browserPreferencesBundleEnd, '')],
  ])('rejects generated preference code with %s', (_case, mutate) => {
    const bundle = mutate(buildBrowserPreferencesBundle(root));
    expect(analyzeProductionSource('onboarding/index.html', `<script>${bundle}</script>`)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('generated browser preference code does not match the approved exact syntax'),
      ]),
    );
  });

  it('keeps onboarding approval independent from the mutable bundle builder', () => {
    const policySource = readFileSync(join(root, 'tests/unit/localWorkspaceBoundary.test.ts'), 'utf8');
    const analyzer = policySource.slice(
      policySource.indexOf('const analyzeSources ='),
      policySource.indexOf('const analyzeSource ='),
    );
    expect(analyzer).not.toContain('buildBrowserPreferencesBundle(');
  });

  it('rejects a control-flow wrapper around the generated preference bundle', () => {
    const bundle = buildBrowserPreferencesBundle(root);
    expect(analyzeProductionSource(
      'onboarding/index.html',
      `<script>if (true) {\n${bundle}\n}</script>`,
    )).toEqual(expect.arrayContaining([
      expect.stringContaining('does not match the approved exact syntax'),
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
