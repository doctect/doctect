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
const browserGlobalNames = new Set(['window', 'globalThis', 'self']);
const knownNonStorageBrowserGlobalProperties = new Set([
  'Reflect',
  'globalThis',
  'location',
  'self',
  'window',
]);
const staticStringCandidateLimit = 256;
const staticStringOverflow = '\0doctect-static-string-overflow';
const staticStringListOverflow = Symbol('static-string-list-overflow');
const staticStringOverflowMessage = `static string candidate expansion exceeds policy bound of ${staticStringCandidateLimit}`;
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

interface AnnexBFunctionEnvironment {
  assignments: ReadonlyMap<string, readonly number[]>;
  end: number;
  names: ReadonlySet<string>;
  start: number;
}

interface SourceInput {
  path: string;
  source: string;
  analysisStart?: number;
  annexBFunctionEnvironments?: readonly AnnexBFunctionEnvironment[];
  annexBFunctionAssignments?: ReadonlyMap<string, number>;
  annexBFunctionPositions?: ReadonlySet<number>;
  authoredScripts?: readonly SourceInput[];
  classicLinked?: boolean;
  classicVarAssignments?: ReadonlyMap<string, readonly number[]>;
  compilerPath?: string;
  directStorageBoundary?: boolean;
  findingGroup?: string;
  moduleGoal?: boolean;
  moduleStart?: number;
  parseFailure?: { message: string; offset: number };
  reportPath?: string;
  reportSource?: string;
  positionSegments?: readonly SourcePositionSegment[];
}

type DirectStorageBoundaryInput = SourceInput & { directStorageBoundary: true };

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

interface AnnexBSyntheticBinding {
  environment: AnnexBFunctionEnvironment;
  name: string;
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
  reflect: boolean;
  boundArguments: PositionedExpression[];
}

interface InvokedMember extends CallableMember {
  invocation: 'direct' | 'call' | 'apply';
}

type ResolutionTrail = Map<AnnexBSyntheticBinding | ts.Symbol, Set<number>>;

const isFunctionEnvironment = (node: ts.Node): node is ts.FunctionLikeDeclaration => (
  ts.isFunctionDeclaration(node)
  || ts.isMethodDeclaration(node)
  || ts.isGetAccessorDeclaration(node)
  || ts.isSetAccessorDeclaration(node)
  || ts.isConstructorDeclaration(node)
  || ts.isFunctionExpression(node)
  || ts.isArrowFunction(node)
);

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

const moduleParseFailureCache = new Map<string, SourceInput['parseFailure']>();
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

const locateModuleParseFailure = (source: string, fallbackMessage: string): SourceInput['parseFailure'] => {
  const result = spawnSync(process.execPath, ['--input-type=module', '--check'], {
    encoding: 'utf8',
    input: source,
    maxBuffer: 2 * 1024 * 1024,
    timeout: 5_000,
  });
  if (result.error) throw result.error;
  const stderr = result.stderr;
  const lines = stderr.split('\n');
  const headerIndex = lines.findIndex(line => /^\[stdin\]:\d+$/.test(line));
  const line = Number(lines[headerIndex]?.match(/:(\d+)$/)?.[1] ?? 1);
  const column = headerIndex === -1 ? 0 : Math.max(lines[headerIndex + 2]?.indexOf('^') ?? 0, 0);
  const message = stderr.match(/^SyntaxError: (.+)$/m)?.[1] ?? fallbackMessage;
  return { message, offset: generatedOffset(source, line, column) };
};

const cacheModuleParseFailure = (source: string, failure: SourceInput['parseFailure']): void => {
  if (moduleParseFailureCache.size >= 512) {
    const oldest = moduleParseFailureCache.keys().next().value as string | undefined;
    if (oldest !== undefined) moduleParseFailureCache.delete(oldest);
  }
  moduleParseFailureCache.set(source, failure);
};

const moduleParseFailures = (sources: readonly string[]): Map<string, SourceInput['parseFailure']> => {
  const failures = new Map<string, SourceInput['parseFailure']>();
  for (const source of sources) {
    if (moduleParseFailureCache.has(source)) {
      failures.set(source, moduleParseFailureCache.get(source));
    }
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
      cacheModuleParseFailure(
        source,
        message === null ? undefined : locateModuleParseFailure(source, message),
      );
      failures.set(source, moduleParseFailureCache.get(source));
    }
  }
  return failures;
};

interface ClassicGlobalDeclarations {
  annexBFunctionEnvironments: AnnexBFunctionEnvironment[];
  annexBFunctions: Array<{ assignmentPosition?: number; name: string; position: number }>;
  functionNames: Set<string>;
  lexicalNames: Set<string>;
  varAssignments: Array<{ name: string; position: number }>;
  varNames: Set<string>;
}

const bindingIdentifiers = (binding: ts.BindingName): ts.Identifier[] => {
  if (ts.isIdentifier(binding)) return [binding];
  return binding.elements.flatMap(element => (
    ts.isOmittedExpression(element) ? [] : bindingIdentifiers(element.name)
  ));
};

const addBindingNames = (names: Set<string>, binding: ts.BindingName): void => {
  for (const identifier of bindingIdentifiers(binding)) names.add(identifier.text);
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
  const varAssignments: ClassicGlobalDeclarations['varAssignments'] = [];
  const annexBFunctions: ClassicGlobalDeclarations['annexBFunctions'] = [];
  const annexBFunctionEnvironments: AnnexBFunctionEnvironment[] = [];
  const hasUseStrictDirective = (statements: readonly ts.Statement[]): boolean => {
    for (const statement of statements) {
      if (ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)) {
        const literal = statement.expression.getText(sourceFile);
        if (literal === '"use strict"' || literal === "'use strict'") return true;
      } else {
        break;
      }
    }
    return false;
  };
  const strict = hasUseStrictDirective(sourceFile.statements);
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
  const annexBEligible = (
    declaration: ts.FunctionDeclaration,
    boundary: ts.Node = sourceFile,
  ): boolean => {
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
      if (ancestor === boundary) return ts.isSourceFile(ancestor)
        ? !directLexicalNames(ancestor.statements, declaration).has(name)
        : true;
      if (ts.isSourceFile(ancestor)) return false;
    }
  };
  function expressionCompletesNormally(input: ts.Expression): boolean {
    const expression = unwrap(input);
    if (ts.isStringLiteralLike(expression)
      || ts.isNumericLiteral(expression)
      || ts.isBigIntLiteral(expression)
      || expression.kind === ts.SyntaxKind.TrueKeyword
      || expression.kind === ts.SyntaxKind.FalseKeyword
      || expression.kind === ts.SyntaxKind.NullKeyword
      || ts.isFunctionExpression(expression)
      || ts.isArrowFunction(expression)) return true;
    if (ts.isArrayLiteralExpression(expression)) {
      return expression.elements.every(element => (
        ts.isOmittedExpression(element)
        || (!ts.isSpreadElement(element) && expressionCompletesNormally(element))
      ));
    }
    if (ts.isObjectLiteralExpression(expression)) {
      return expression.properties.every(property => {
        if (ts.isSpreadAssignment(property)
          || ts.isShorthandPropertyAssignment(property)
          || ts.isComputedPropertyName(property.name)) return false;
        return !ts.isPropertyAssignment(property)
          || expressionCompletesNormally(property.initializer);
      });
    }
    return false;
  }
  function declarationCompletesNormally(declaration: ts.VariableDeclaration): boolean {
    return ts.isIdentifier(declaration.name)
      && (!declaration.initializer || expressionCompletesNormally(declaration.initializer));
  }
  function statementCompletesNormally(statement: ts.Statement): boolean {
    if (ts.isEmptyStatement(statement) || ts.isFunctionDeclaration(statement)) return true;
    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.every(declarationCompletesNormally);
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
  const definitelyReached = (node: ts.Node): boolean => {
    let child = node;
    for (let parent = node.parent; ; child = parent, parent = parent.parent) {
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
  const locallyDefinitelyReached = (
    declaration: ts.FunctionDeclaration,
    boundary: ts.Block,
  ): boolean => {
    let child: ts.Node = declaration;
    for (let parent = declaration.parent; ; child = parent, parent = parent.parent) {
      if (ts.isBlock(parent)) {
        const index = parent.statements.indexOf(child as ts.Statement);
        if (index === -1 || !parent.statements.slice(0, index).every(statement => (
          statementCompletesNormally(statement)
          || (parent === boundary && (
            ts.isVariableStatement(statement) || ts.isExpressionStatement(statement)
          ))
        ))) return false;
        if (parent === boundary) return true;
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
      if (ts.isVariableStatement(node.parent) && definitelyReached(node.parent)) {
        for (const [index, declaration] of node.declarations.entries()) {
          if (!declaration.initializer
            || !ts.isIdentifier(declaration.name)
            || !expressionCompletesNormally(declaration.initializer)
            || !node.declarations.slice(0, index).every(declarationCompletesNormally)) continue;
          varAssignments.push({ name: declaration.name.text, position: declaration.end });
        }
      }
    }
    ts.forEachChild(node, collectVarNames);
  };
  collectVarNames(sourceFile);
  function collectFunctionEnvironment(
    declaration: ts.FunctionLikeDeclaration,
    inheritedStrict: boolean,
  ): void {
    const body = declaration.body;
    const functionStrict = inheritedStrict || (body !== undefined
      && ts.isBlock(body)
      && hasUseStrictDirective(body.statements));
    const formalParameterNames = new Set<string>();
    for (const parameter of declaration.parameters) {
      addBindingNames(formalParameterNames, parameter.name);
      if (parameter.initializer) collectNestedFunctions(parameter.initializer, functionStrict);
    }
    if (!body) return;
    if (!ts.isBlock(body)) {
      collectNestedFunctions(body, functionStrict);
      return;
    }
    const names = new Set<string>();
    const assignments = new Map<string, number[]>();
    const visit = (node: ts.Node): void => {
      if (node !== body && isFunctionEnvironment(node)) {
        if (!functionStrict
          && ts.isFunctionDeclaration(node)
          && node.parent !== body
          && node.name
          && !formalParameterNames.has(node.name.text)
          && annexBEligible(node, body)) {
          const name = node.name.text;
          names.add(name);
          if (locallyDefinitelyReached(node, body)) {
            const positions = assignments.get(name) ?? [];
            positions.push(node.end);
            assignments.set(name, positions);
          }
        }
        collectFunctionEnvironment(node, functionStrict);
        return;
      }
      if (node !== body && (
        ts.isClassDeclaration(node)
        || ts.isClassExpression(node)
      )) return;
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(body, visit);
    if (names.size > 0) {
      annexBFunctionEnvironments.push({
        assignments,
        end: body.end,
        names,
        start: body.getStart(sourceFile),
      });
    }
  }
  function collectNestedFunctions(node: ts.Node, inheritedStrict: boolean): void {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) return;
    if (isFunctionEnvironment(node)) {
      collectFunctionEnvironment(node, inheritedStrict);
      return;
    }
    ts.forEachChild(node, child => collectNestedFunctions(child, inheritedStrict));
  }
  ts.forEachChild(sourceFile, node => collectNestedFunctions(node, strict));
  return {
    annexBFunctionEnvironments,
    annexBFunctions,
    functionNames,
    lexicalNames,
    varAssignments,
    varNames,
  };
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
    'annexBFunctionAssignments'
    | 'annexBFunctionEnvironments'
    | 'annexBFunctionPositions'
    | 'classicVarAssignments'
    | 'positionSegments'
    | 'source'> & {
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
    const annexBFunctionEnvironments: AnnexBFunctionEnvironment[] = [];
    const annexBFunctionPositions = new Set<number>();
    const classicVarAssignments = new Map<string, number[]>();
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
        directStorageBoundary: input.directStorageBoundary,
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
      for (const assignment of declarations.varAssignments) {
        if (!canAssignGlobal(assignment.name)) continue;
        classicVarAssignments.set(assignment.name, [
          ...(classicVarAssignments.get(assignment.name) ?? []),
          generatedStart + assignment.position,
        ]);
      }
      for (const environment of declarations.annexBFunctionEnvironments) {
        annexBFunctionEnvironments.push({
          assignments: new Map([...environment.assignments].map(([name, positions]) => [
            name,
            positions.map(position => generatedStart + position),
          ])),
          end: generatedStart + environment.end,
          names: environment.names,
          start: generatedStart + environment.start,
        });
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
        annexBFunctionEnvironments: [...annexBFunctionEnvironments],
        annexBFunctionPositions: new Set(annexBFunctionPositions),
        authoredScripts: [authoredScript],
        classicLinked: true,
        classicVarAssignments: new Map(classicVarAssignments),
        compilerPath: `\0doctect-inline/${input.path}/classic-${script.index}.js`,
        directStorageBoundary: input.directStorageBoundary,
        reportPath: input.path,
        reportSource: input.source,
        positionSegments: [...positionSegments],
        source,
      });
      pageGlobalStates.push({
        afterIndex: script.index,
        annexBFunctionAssignments: new Map(annexBFunctionAssignments),
        annexBFunctionEnvironments: [...annexBFunctionEnvironments],
        annexBFunctionPositions: new Set(annexBFunctionPositions),
        classicVarAssignments: new Map(classicVarAssignments),
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
      directStorageBoundary: input.directStorageBoundary,
      moduleGoal: true,
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
        annexBFunctionEnvironments: pageGlobals.annexBFunctionEnvironments,
        annexBFunctionPositions: pageGlobals.annexBFunctionPositions,
        authoredScripts: [authoredScript],
        classicLinked: true,
        classicVarAssignments: pageGlobals.classicVarAssignments,
        compilerPath: `\0doctect-inline/${input.path}/${script.index}-${pageGlobals.afterIndex}.js`,
        directStorageBoundary: input.directStorageBoundary,
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
  const approvedBrowserPreferencesBundle = inputs.some(input => (
    input.directStorageBoundary === true && input.path === 'onboarding/index.html'
  )) ? buildBrowserPreferencesBundle(root) : undefined;
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
  const authoredModuleFailures = moduleParseFailures(scripts.flatMap(input => (
    input.authoredScripts ?? [input]
  )).filter(input => input.moduleGoal).map(input => input.source));

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
  const functionForEnvironment = (
    node: ts.Node,
    environment: AnnexBFunctionEnvironment,
  ): ts.FunctionLikeDeclaration | undefined => {
    for (let ancestor: ts.Node | undefined = node.parent; ancestor; ancestor = ancestor.parent) {
      if (isFunctionEnvironment(ancestor)
        && ancestor.body
        && ts.isBlock(ancestor.body)
        && ancestor.body.getStart(ancestor.getSourceFile()) === environment.start) return ancestor;
    }
    return undefined;
  };
  const annexBEnvironmentAt = (
    input: SourceInput | undefined,
    position: number,
    name: string,
  ): AnnexBFunctionEnvironment | undefined => input?.annexBFunctionEnvironments
    ?.filter(environment => (
      environment.start <= position
      && position < environment.end
      && environment.names.has(name)
    ))
    .sort((left, right) => right.start - left.start || left.end - right.end)[0];
  const sameFunctionVariableEnvironmentBinding = (
    symbol: ts.Symbol,
    declaration: ts.FunctionLikeDeclaration,
  ): boolean => symbol.declarations?.some(binding => {
    if (ts.isFunctionDeclaration(binding)
      && declaration.body
      && ts.isBlock(declaration.body)
      && binding.parent === declaration.body) return true;
    for (let ancestor: ts.Node | undefined = binding; ancestor; ancestor = ancestor.parent) {
      if (ts.isParameter(ancestor)) return false;
      if (ts.isVariableDeclaration(ancestor)) {
        const declarationList = ancestor.parent;
        if (!ts.isVariableDeclarationList(declarationList)
          || (declarationList.flags & ts.NodeFlags.BlockScoped) !== 0) return false;
        for (let scope: ts.Node | undefined = declarationList.parent; scope; scope = scope.parent) {
          if (scope === declaration) return true;
          if (isFunctionEnvironment(scope) || ts.isClassStaticBlockDeclaration(scope)) return false;
        }
        return false;
      }
      if (ancestor !== binding
        && (isFunctionEnvironment(ancestor) || ts.isClassStaticBlockDeclaration(ancestor))) return false;
    }
    return false;
  }) ?? false;
  const symbolDeclaredWithinEnvironment = (
    symbol: ts.Symbol,
    sourceFile: ts.SourceFile,
    environment: AnnexBFunctionEnvironment,
  ): boolean => symbol.declarations?.some(declaration => (
    declaration.getSourceFile() === sourceFile
    && declaration.getStart(sourceFile) >= environment.start
    && declaration.end <= environment.end
  )) ?? false;
  const syntheticBindings = new Map<AnnexBFunctionEnvironment, Map<string, AnnexBSyntheticBinding>>();
  const syntheticBinding = (
    environment: AnnexBFunctionEnvironment,
    name: string,
  ): AnnexBSyntheticBinding => {
    let bindings = syntheticBindings.get(environment);
    if (!bindings) {
      bindings = new Map();
      syntheticBindings.set(environment, bindings);
    }
    let binding = bindings.get(name);
    if (!binding) {
      binding = { environment, name };
      bindings.set(name, binding);
    }
    return binding;
  };
  const syntheticBindingForIdentifier = (
    identifier: ts.Identifier,
    symbol: ts.Symbol | undefined,
  ): AnnexBSyntheticBinding | undefined => {
    const sourceFile = identifier.getSourceFile();
    const input = scriptsByFile.get(sourceFile.fileName);
    const environment = annexBEnvironmentAt(input, identifier.getStart(sourceFile), identifier.text);
    if (!environment) return undefined;
    const environmentFunction = functionForEnvironment(identifier, environment);
    if (!environmentFunction) return undefined;
    if (symbol
      && !sameFunctionVariableEnvironmentBinding(symbol, environmentFunction)
      && symbolDeclaredWithinEnvironment(symbol, sourceFile, environment)) return undefined;
    return syntheticBinding(environment, identifier.text);
  };
  const origins = new Map<ts.Symbol, Origin[]>();
  const syntheticOrigins = new Map<AnnexBSyntheticBinding, Origin[]>();

  const addOrigin = (
    identifier: ts.Identifier,
    origin: Origin,
  ): void => {
    const symbol = checker.getSymbolAtLocation(identifier);
    const binding = syntheticBindingForIdentifier(identifier, symbol);
    if (binding) {
      const existing = syntheticOrigins.get(binding);
      if (existing) existing.push(origin);
      else syntheticOrigins.set(binding, [origin]);
    }
    if (symbol) {
      const existing = origins.get(symbol);
      if (existing) existing.push(origin);
      else origins.set(symbol, [origin]);
    }
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
    const position = identifier.getStart(identifier.getSourceFile());
    if (syntheticBindingForIdentifier(identifier, symbol)) return false;
    const annexBAssignment = declarationInput?.annexBFunctionAssignments?.get(identifier.text);
    if (annexBAssignment !== undefined && annexBAssignment <= position) return false;
    if (declarationInput?.classicVarAssignments?.get(identifier.text)
      ?.some(assignment => assignment <= position)) return false;
    return !symbol?.declarations?.some(declaration => (
      declaration.getSourceFile() === identifier.getSourceFile()
      && scriptsByFile.has(declaration.getSourceFile().fileName)
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

  const withIdentifierOrigins = <T>(
    identifier: ts.Identifier,
    symbol: ts.Symbol | undefined,
    atPosition: number,
    trail: ResolutionTrail,
    resolve: (origin: Origin, trail: ResolutionTrail) => readonly T[],
  ): T[] => {
    const binding = syntheticBindingForIdentifier(identifier, symbol);
    if (!binding) {
      return symbol ? withSymbolOrigins(symbol, atPosition, trail, resolve) : [];
    }
    const { environment, name } = binding;
    const positions = trail.get(binding) ?? new Set<number>();
    if (positions.has(atPosition)) return [];
    positions.add(atPosition);
    trail.set(binding, positions);
    try {
      const assignment = (environment.assignments.get(name) ?? [])
        .filter(position => position <= atPosition)
        .reduce<number | undefined>((latest, position) => (
          latest === undefined || position > latest ? position : latest
        ), undefined);
      return (syntheticOrigins.get(binding) ?? [])
        .filter(origin => (
          origin.position <= atPosition
          && (assignment === undefined || origin.position > assignment)
        ))
        .flatMap(origin => resolve(origin, trail));
    } finally {
      positions.delete(atPosition);
      if (positions.size === 0) trail.delete(binding);
    }
  };

  const overflowStaticStrings = (): Set<string> => new Set([staticStringOverflow]);

  const boundedStaticStrings = (candidates: Iterable<string>): Set<string> => {
    const values = new Set<string>();
    for (const candidate of candidates) {
      if (candidate === staticStringOverflow) return overflowStaticStrings();
      if (!values.has(candidate) && values.size >= staticStringCandidateLimit) {
        return overflowStaticStrings();
      }
      values.add(candidate);
    }
    return values;
  };

  const combineStaticStrings = (
    left: ReadonlySet<string>,
    right: ReadonlySet<string>,
    combine: (leftValue: string, rightValue: string) => string,
  ): Set<string> => {
    if (left.has(staticStringOverflow) || right.has(staticStringOverflow)) {
      return overflowStaticStrings();
    }
    const values = new Set<string>();
    for (const leftValue of left) {
      for (const rightValue of right) {
        const candidate = combine(leftValue, rightValue);
        if (!values.has(candidate) && values.size >= staticStringCandidateLimit) {
          return overflowStaticStrings();
        }
        values.add(candidate);
      }
    }
    return values;
  };

  interface StaticStringList {
    elements: readonly ts.Expression[];
    position: number;
  }

  type StaticStringListCandidate = StaticStringList | typeof staticStringListOverflow;

  const boundedStaticStringLists = (
    candidates: Iterable<StaticStringListCandidate>,
  ): StaticStringListCandidate[] => {
    const values: StaticStringListCandidate[] = [];
    for (const candidate of candidates) {
      if (candidate === staticStringListOverflow) return [staticStringListOverflow];
      if (values.length >= staticStringCandidateLimit) return [staticStringListOverflow];
      values.push(candidate);
    }
    return values;
  };

  function staticStringLists(
    input: ts.Expression,
    atPosition: number,
    trail: ResolutionTrail = new Map(),
  ): StaticStringListCandidate[] {
    const expression = unwrap(input);
    if (ts.isArrayLiteralExpression(expression)) {
      const elements: ts.Expression[] = [];
      for (const element of expression.elements) {
        if (ts.isOmittedExpression(element) || ts.isSpreadElement(element)) return [];
        elements.push(element);
      }
      return [{ elements, position: atPosition }];
    }
    if (ts.isIdentifier(expression)) {
      const symbol = identifierSymbol(expression);
      return boundedStaticStringLists(withIdentifierOrigins(
        expression,
        symbol,
        atPosition,
        trail,
        (origin, nextTrail) => origin.value.kind === 'expression'
          ? staticStringLists(origin.value.expression, origin.position, nextTrail)
          : [],
      ));
    }
    if (ts.isConditionalExpression(expression)) {
      return boundedStaticStringLists([
        ...staticStringLists(expression.whenTrue, atPosition, trail),
        ...staticStringLists(expression.whenFalse, atPosition, trail),
      ]);
    }
    return [];
  }

  function staticJoinStrings(
    call: ts.CallExpression,
    atPosition: number,
    trail: ResolutionTrail,
  ): Set<string> {
    if (call.arguments.length > 1) return new Set();
    const callee = unwrap(call.expression);
    let receiver: ts.Expression;
    let computedName: ts.Expression | undefined;
    if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'join') {
      receiver = callee.expression;
    } else if (ts.isElementAccessExpression(callee) && callee.argumentExpression) {
      receiver = callee.expression;
      computedName = callee.argumentExpression;
    } else {
      return new Set();
    }

    const lists = staticStringLists(receiver, atPosition, trail);
    if (lists.length === 0) return new Set();
    if (computedName) {
      const names = staticStrings(computedName, atPosition, trail);
      if (names.has(staticStringOverflow)) return overflowStaticStrings();
      if (!names.has('join')) return new Set();
    }
    if (lists.includes(staticStringListOverflow)) return overflowStaticStrings();
    const separators = call.arguments.length === 0
      ? new Set([','])
      : staticStrings(call.arguments[0], atPosition, trail);
    if (separators.size === 0) return new Set();
    if (separators.has(staticStringOverflow)) return overflowStaticStrings();

    let values = new Set<string>();
    for (const candidate of lists) {
      if (candidate === staticStringListOverflow) return overflowStaticStrings();
      for (const separator of separators) {
        let joined = new Set(['']);
        for (const [index, element] of candidate.elements.entries()) {
          const elementValues = staticStrings(element, candidate.position, trail);
          if (elementValues.size === 0) {
            joined = new Set();
            break;
          }
          joined = combineStaticStrings(joined, elementValues, (prefix, value) => (
            index === 0 ? value : `${prefix}${separator}${value}`
          ));
          if (joined.has(staticStringOverflow)) return joined;
        }
        values = boundedStaticStrings([...values, ...joined]);
        if (values.has(staticStringOverflow)) return values;
      }
    }
    return values;
  }

  function staticStrings(
    input: ts.Expression,
    atPosition: number,
    trail: ResolutionTrail = new Map(),
  ): Set<string> {
    const expression = unwrap(input);
    if (ts.isStringLiteralLike(expression)) return new Set([expression.text]);
    if (ts.isIdentifier(expression)) {
      const symbol = identifierSymbol(expression);
      return boundedStaticStrings(withIdentifierOrigins(expression, symbol, atPosition, trail, (origin, nextTrail) => (
        origin.value.kind === 'expression'
          ? [...staticStrings(origin.value.expression, origin.position, nextTrail)]
          : []
      )));
    }
    if (ts.isBinaryExpression(expression)
      && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      return combineStaticStrings(
        staticStrings(expression.left, atPosition, trail),
        staticStrings(expression.right, atPosition, trail),
        (left, right) => left + right,
      );
    }
    if (ts.isTemplateExpression(expression)) {
      let values = new Set([expression.head.text]);
      for (const span of expression.templateSpans) {
        values = combineStaticStrings(
          values,
          staticStrings(span.expression, atPosition, trail),
          (prefix, substitution) => prefix + substitution + span.literal.text,
        );
        if (values.has(staticStringOverflow)) return values;
      }
      return values;
    }
    if (ts.isConditionalExpression(expression)) {
      return boundedStaticStrings([
        ...staticStrings(expression.whenTrue, atPosition, trail),
        ...staticStrings(expression.whenFalse, atPosition, trail),
      ]);
    }
    if (ts.isCallExpression(expression)) {
      return staticJoinStrings(expression, atPosition, trail);
    }
    return new Set();
  }

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

  const matchesStaticCandidate = (candidate: string, expected: string): boolean => (
    candidate === expected || candidate === staticStringOverflow
  );

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

  const directMemberName = (input: ts.Expression): string | undefined => {
    const expression = unwrap(input);
    if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
    if (!ts.isElementAccessExpression(expression) || !expression.argumentExpression) {
      return undefined;
    }
    const argument = unwrap(expression.argumentExpression);
    return ts.isStringLiteralLike(argument) ? argument.text : undefined;
  };

  const directMemberReceiver = (input: ts.Expression): ts.Expression | undefined => {
    const expression = unwrap(input);
    return ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)
      ? expression.expression
      : undefined;
  };

  const directStringLiteral = (input: ts.Expression | undefined): string | undefined => {
    if (!input) return undefined;
    const expression = unwrap(input);
    return ts.isStringLiteralLike(expression) ? expression.text : undefined;
  };

  const directPropertyName = (name: ts.PropertyName): string | undefined => {
    if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
    return ts.isComputedPropertyName(name)
      ? directStringLiteral(name.expression)
      : undefined;
  };

  const isGlobalObject = (
    input: ts.Expression,
    atPosition: number,
    trail: ResolutionTrail = new Map(),
  ): boolean => {
    const expression = unwrap(input);
    if (ts.isIdentifier(expression)) {
      const symbol = identifierSymbol(expression);
      if (isUnshadowedGlobal(expression, symbol, browserGlobalNames)) return true;
      return withIdentifierOrigins(expression, symbol, atPosition, trail, (origin, nextTrail) => {
        if (origin.value.kind === 'expression') {
          return isGlobalObject(origin.value.expression, origin.position, nextTrail) ? [true] : [];
        }
        const name = directPropertyName(origin.value.propertyName);
        return name && browserGlobalNames.has(name)
          && isGlobalObject(origin.value.receiver, origin.position, nextTrail)
          ? [true]
          : [];
      }).length > 0;
    }
    const name = directMemberName(expression);
    const receiver = directMemberReceiver(expression);
    return Boolean(name && receiver
      && browserGlobalNames.has(name)
      && isGlobalObject(receiver, atPosition, trail));
  };

  const isReflectObject = (
    input: ts.Expression,
    atPosition: number,
    trail: ResolutionTrail = new Map(),
  ): boolean => {
    const expression = unwrap(input);
    if (ts.isIdentifier(expression)) {
      const symbol = identifierSymbol(expression);
      if (isUnshadowedGlobal(expression, symbol, new Set(['Reflect']))) return true;
      return withIdentifierOrigins(expression, symbol, atPosition, trail, (origin, nextTrail) => {
        if (origin.value.kind === 'expression') {
          return isReflectObject(origin.value.expression, origin.position, nextTrail) ? [true] : [];
        }
        return directPropertyName(origin.value.propertyName) === 'Reflect'
          && isGlobalObject(origin.value.receiver, origin.position, nextTrail)
          ? [true]
          : [];
      }).length > 0;
    }
    const receiver = directMemberReceiver(expression);
    return directMemberName(expression) === 'Reflect'
      && receiver !== undefined
      && isGlobalObject(receiver, atPosition, trail);
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
      return withIdentifierOrigins(expression, symbol, atPosition, trail, (origin, nextTrail) => {
        if (origin.value.kind === 'expression') {
          return isLocalStorage(origin.value.expression, origin.position, nextTrail) ? [true] : [];
        }
        const names = propertyNames(origin.value.propertyName, origin.position, nextTrail);
        return [...names].some(name => matchesStaticCandidate(name, 'localStorage'))
          && isGlobalObject(origin.value.receiver, origin.position, nextTrail)
          ? [true]
          : [];
      }).length > 0;
    }
    return memberCandidates(expression, atPosition, trail).some(member => (
      matchesStaticCandidate(member.name, 'localStorage')
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
      return withIdentifierOrigins(expression, symbol, atPosition, trail, (origin, nextTrail) => {
        if (origin.value.kind === 'expression') {
          return callableMembers(origin.value.expression, origin.position, nextTrail);
        }
        const memberOrigin = origin.value;
        return [...propertyNames(memberOrigin.propertyName, origin.position, nextTrail)].map(method => ({
          method,
          localStorage: isLocalStorage(memberOrigin.receiver, origin.position, nextTrail),
          reflect: isReflectObject(memberOrigin.receiver, origin.position, nextTrail),
          boundArguments: [],
        }));
      });
    }
    if (ts.isCallExpression(expression)) {
      const bound = memberCandidates(expression.expression, atPosition, trail)
        .filter(member => matchesStaticCandidate(member.name, 'bind'));
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
      reflect: isReflectObject(member.receiver, atPosition, trail),
      boundArguments: [],
    }));
  };

  const invokedMembers = (call: ts.CallExpression): InvokedMember[] => {
    const atPosition = call.expression.getStart(call.getSourceFile());
    const wrappers = memberCandidates(call.expression, atPosition)
      .filter(member => (
        matchesStaticCandidate(member.name, 'call')
        || matchesStaticCandidate(member.name, 'apply')
      ));
    if (wrappers.length > 0) {
      const wrapped = wrappers.flatMap(wrapper => {
        const invocations: Array<'call' | 'apply'> = wrapper.name === staticStringOverflow
          ? ['call', 'apply']
          : [wrapper.name as 'call' | 'apply'];
        return callableMembers(wrapper.receiver, atPosition).flatMap(member => (
          invocations.map(invocation => ({ ...member, invocation }))
        ));
      });
      return wrappers.some(wrapper => wrapper.name === staticStringOverflow)
        ? [
          ...wrapped,
          ...callableMembers(call.expression, atPosition).map(member => ({
            ...member,
            invocation: 'direct' as const,
          })),
        ]
        : wrapped;
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
    return withIdentifierOrigins(expression, symbol, atPosition, trail, (origin, nextTrail) => (
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
      return withIdentifierOrigins(expression, symbol, atPosition, trail, (origin, nextTrail) => (
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
      return boundedStaticStrings(firstArrayElements(
        argumentArray,
        call.expression.getStart(),
      ).flatMap(candidate => (
        [...staticStrings(candidate.expression, candidate.position)]
      )));
    }
    const keyArgument = call.arguments[invoked.invocation === 'call' ? 1 : 0];
    return keyArgument
      ? staticStrings(keyArgument, call.expression.getStart())
      : new Set();
  };

  const firstInvocationArguments = (
    call: ts.CallExpression,
    invoked: InvokedMember,
  ): PositionedExpression[] => {
    if (invoked.boundArguments.length > 0) return [invoked.boundArguments[0]];
    const atPosition = call.expression.getStart(call.getSourceFile());
    if (invoked.invocation === 'apply') {
      const argumentArray = call.arguments[1];
      return argumentArray ? firstArrayElements(argumentArray, atPosition) : [];
    }
    const argument = call.arguments[invoked.invocation === 'call' ? 1 : 0];
    return argument ? [{ expression: argument, position: atPosition }] : [];
  };

  const invocationPropertyArgument = (
    call: ts.CallExpression,
    invoked: InvokedMember,
  ): ts.Expression | undefined => {
    if (invoked.boundArguments.length > 1) return invoked.boundArguments[1].expression;
    if (invoked.invocation === 'apply') {
      const argumentArray = call.arguments[1];
      const unwrappedArray = argumentArray ? unwrap(argumentArray) : undefined;
      return unwrappedArray && ts.isArrayLiteralExpression(unwrappedArray)
        ? unwrappedArray.elements[1] && ts.isExpression(unwrappedArray.elements[1])
          ? unwrappedArray.elements[1]
          : undefined
        : undefined;
    }
    const actualOffset = invoked.invocation === 'call' ? 1 : 0;
    const propertyOffset = invoked.boundArguments.length === 1 ? 0 : 1;
    return call.arguments[actualOffset + propertyOffset];
  };

  const privateConstInitializer = (
    sourceFile: ts.SourceFile,
    name: string,
  ): ts.Expression | undefined => {
    const containsIdentifier = (node: ts.Node): boolean => {
      if (ts.isIdentifier(node) && node.text === name) return true;
      let found = false;
      ts.forEachChild(node, child => {
        if (!found && containsIdentifier(child)) found = true;
      });
      return found;
    };
    const exported = sourceFile.statements.some(statement => {
      if (ts.isExportAssignment(statement)) {
        return containsIdentifier(statement.expression);
      }
      if (!ts.isExportDeclaration(statement)
        || !statement.exportClause
        || !ts.isNamedExports(statement.exportClause)) return false;
      return statement.exportClause.elements.some(element => (
        (element.propertyName ?? element.name).text === name
      ));
    });
    if (exported) return undefined;
    const matches = sourceFile.statements.flatMap(statement => {
      if (!ts.isVariableStatement(statement)
        || statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
        || (statement.declarationList.flags & ts.NodeFlags.Const) === 0) return [];
      return statement.declarationList.declarations.filter(declaration => (
        ts.isIdentifier(declaration.name) && declaration.name.text === name
      ));
    });
    return matches.length === 1 ? matches[0].initializer : undefined;
  };

  type FallbackKind = 'null' | 'false';

  const isFallbackExpression = (expression: ts.Expression, fallback: FallbackKind): boolean => (
    expression.kind === (fallback === 'null'
      ? ts.SyntaxKind.NullKeyword
      : ts.SyntaxKind.FalseKeyword)
  );

  const isFallbackReturn = (statement: ts.Statement, fallback: FallbackKind): boolean => (
    ts.isReturnStatement(statement)
    && statement.expression !== undefined
    && isFallbackExpression(statement.expression, fallback)
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

  const isRuntimeKeyGuard = (
    statement: ts.Statement,
    fallback: FallbackKind,
  ): boolean => {
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

  const isWindowGuard = (
    statement: ts.Statement,
    fallback: FallbackKind,
  ): boolean => {
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

  const browserPreferenceStorageApprovals = (
    sourceFile: ts.SourceFile,
  ): ts.CallExpression[] => {
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

  const exportedConstInitializer = (
    sourceFile: ts.SourceFile,
    name: string,
  ): ts.Expression | undefined => {
    const matches = sourceFile.statements.flatMap(statement => {
      if (!ts.isVariableStatement(statement)
        || !statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
        || (statement.declarationList.flags & ts.NodeFlags.Const) === 0) return [];
      return statement.declarationList.declarations.filter(declaration => (
        ts.isIdentifier(declaration.name) && declaration.name.text === name
      ));
    });
    return matches.length === 1 ? matches[0].initializer : undefined;
  };

  const localWorkspaceStorageApprovals = (
    sourceFile: ts.SourceFile,
  ): ts.CallExpression[] => {
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
      && ts.isIdentifier(property.name)
      && property.name.text === 'legacyStorage'
      && ts.isObjectLiteralExpression(property.initializer)
    ));
    if (legacyStorage.length !== 1 || !ts.isPropertyAssignment(legacyStorage[0])) return [];
    const legacyObject = legacyStorage[0].initializer;
    if (!ts.isObjectLiteralExpression(legacyObject)) return [];
    const getItems = legacyObject.properties.filter(property => (
      ts.isMethodDeclaration(property)
      && ts.isIdentifier(property.name)
      && property.name.text === 'getItem'
    ));
    if (getItems.length !== 1 || !ts.isMethodDeclaration(getItems[0])) return [];
    const getItem = getItems[0];
    if (!getItem.body || getItem.body.statements.length !== 1
      || getItem.parameters.length !== 1
      || !ts.isIdentifier(getItem.parameters[0].name)
      || getItem.parameters[0].name.text !== 'key') return [];
    const returnStatement = getItem.body.statements[0];
    if (!ts.isReturnStatement(returnStatement) || !returnStatement.expression) return [];
    const call = exactStorageCall(returnStatement.expression, 'getItem', ['key']);
    return call ? [call] : [];
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
    const enforceDirectStorageBoundary = input.directStorageBoundary === true
      && productionSource;
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
      (
        exactStorageApprovals.some(approval => (
          node.getStart(sourceFile) >= approval.getStart(sourceFile)
          && node.end <= approval.end
        ))
      )
      || (
        bundledPreferenceStart !== -1
        && node.getStart(sourceFile) >= bundledPreferenceStart
        && node.end <= bundledPreferenceEnd
      )
    );
    const directStorageLines = new Set<number>();
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
    const reportDirectStorage = (node: ts.Node): void => {
      const line = reportLine(input, node.getStart(sourceFile));
      if (directStorageLines.has(line)) return;
      directStorageLines.add(line);
      report(node, 'accesses production localStorage outside approved persistence modules');
    };
    const authoredScripts = input.authoredScripts ?? [input];
    let authoredParseFailed = false;
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
      const moduleGoal = authoredInput.moduleGoal === true;
      if (moduleGoal) {
        const moduleFailure = authoredModuleFailures.get(authoredInput.source);
        if (moduleFailure) {
          authoredParseFailed = true;
          appendFinding(
            `${policyPath}:${reportLine(authoredInput, moduleFailure.offset)}: could not be parsed: ${moduleFailure.message}`,
            `parse:${moduleFailure.offset}:${moduleFailure.message}`,
          );
        }
        continue;
      }
      for (const diagnostic of parseDiagnostics) {
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
        appendFinding(
          `${policyPath}:${reportLine(authoredInput, diagnostic.start ?? 0)}: could not be parsed: ${message}`,
          `parse:${diagnostic.start ?? 0}:${message}`,
        );
      }
    }
    if (authoredParseFailed) continue;

    const inspectModuleSpecifier = (node: ts.Node, expression: ts.Expression | undefined): void => {
      if (!importsAllowed && expression) {
        const candidates = staticStrings(expression, node.getStart(sourceFile));
        if (candidates.has(staticStringOverflow)) {
          report(node, staticStringOverflowMessage);
        } else if ([...candidates].some(isLegacyTypesModule)) {
          report(node, 'imports local-workspace migration internals');
        }
      }
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
        if (enforceDirectStorageBoundary && !directStorageApprovedAt(node)) {
          const reflectGlobalGets = invoked.filter(member => (
            member.reflect
            && matchesStaticCandidate(member.method, 'get')
            && firstInvocationArguments(node, member).some(argument => (
              isGlobalObject(argument.expression, argument.position)
            ))
          ));
          if (invoked.some(member => member.localStorage)
            || reflectGlobalGets.some(member => (
              directStringLiteral(invocationPropertyArgument(node, member)) === 'localStorage'
            ))) {
            reportDirectStorage(node);
          } else if (reflectGlobalGets.length > 0) {
            report(node, 'uses Reflect.get on a browser global outside approved persistence modules');
          }
        }
        let expansionReported = false;
        const reportExpansion = (): void => {
          if (expansionReported) return;
          expansionReported = true;
          report(node, staticStringOverflowMessage);
        };
        if (invoked.some(member => (
          member.method === staticStringOverflow
          && (localWorkspaceSource || member.localStorage)
        ))) {
          reportExpansion();
        }
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
        if (!allowed.has(policyPath)) {
          const storageKeyCandidates = invoked
            .filter(member => member.localStorage && keyedStorageMethods.has(member.method))
            .map(member => keyCandidates(node, member));
          if (storageKeyCandidates.some(candidates => candidates.has(staticStringOverflow))) {
            reportExpansion();
          } else if (storageKeyCandidates.some(candidates => (
            [...candidates].some(key => legacyKeys.includes(key))
          ))) {
            report(node, 'accesses legacy document key through localStorage');
          }
        }
      } else if (enforceDirectStorageBoundary
        && !directStorageApprovedAt(node)
        && ts.isElementAccessExpression(node)
        && isReflectObject(node.expression, node.getStart(sourceFile))) {
        report(node, 'uses computed Reflect member access outside approved persistence modules');
      } else if (enforceDirectStorageBoundary
        && !directStorageApprovedAt(node)
        && ts.isElementAccessExpression(node)
        && isGlobalObject(node.expression, node.getStart(sourceFile))) {
        const property = directStringLiteral(node.argumentExpression);
        if (property === 'localStorage') {
          reportDirectStorage(node);
        } else if (property === undefined
          || !knownNonStorageBrowserGlobalProperties.has(property)) {
          report(node, 'uses dynamic browser-global property access outside approved persistence modules');
        }
      } else if (enforceDirectStorageBoundary
        && !directStorageApprovedAt(node)
        && (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
        && (
          isLocalStorage(node, node.getStart(sourceFile))
          || isLocalStorage(node.expression, node.getStart(sourceFile))
        )) {
        reportDirectStorage(node);
      } else if (enforceDirectStorageBoundary
        && !directStorageApprovedAt(node)
        && ts.isIdentifier(node)
        && !(
          (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
          || (ts.isQualifiedName(node.parent) && node.parent.right === node)
        )
        && isLocalStorage(node, node.getStart(sourceFile))) {
        reportDirectStorage(node);
      }
      if (inAnalysisSegment) ts.forEachChild(node, inspectNode);
    };
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
    const inputs = repositorySourcePaths()
      .map(path => ({
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

  it('runs the migration release gate for every pull request', () => {
    const workflow = readFileSync(
      join(root, '.github/workflows/local-workspace-migration.yml'),
      'utf8',
    );
    expect(workflowRunsOnEveryPullRequest(workflow)).toBe(true);
  });

  it('runs the bounded complete Vitest suite without selected unit paths', () => {
    const workflow = readFileSync(
      join(root, '.github/workflows/local-workspace-migration.yml'),
      'utf8',
    );
    expect(workflow).toMatch(/^\s*run:\s+npx vitest run --maxWorkers=4\s*$/m);
    expect(workflow.match(/\bnpx vitest run\b/g)).toHaveLength(1);
    expect(workflow).not.toContain('Focused unit suites');
    expect(workflow).not.toMatch(/^\s+tests\/unit(?:\/|\b)/m);
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
      'a direct safe preference read',
      'components/DirectPreferenceRead.ts',
      "localStorage.getItem('doctect_last_fontSize');",
    ],
    [
      'a direct preference write',
      'components/DirectPreferenceWrite.ts',
      "globalThis.localStorage.setItem('doctect_last_fontSize', '16');",
    ],
    [
      'a window-qualified preference read',
      'components/WindowPreferenceRead.ts',
      "window.localStorage.getItem('doctect_last_fontSize');",
    ],
    [
      'a joined safe preference key',
      'components/JoinedPreferenceRead.ts',
      "localStorage.getItem(['doctect', 'last', 'fontSize'].join('_'));",
    ],
    [
      'a mutated array key',
      'components/MutatedJoinedRead.ts',
      "const parts = ['safe']; parts.splice(0, 1, 'hype', 'projects'); localStorage.getItem(parts.join('_'));",
    ],
    [
      'an overridden join method',
      'components/OverriddenJoinRead.ts',
      "const parts = ['safe']; parts.join = () => 'hype_' + 'projects'; localStorage.getItem(parts.join('_'));",
    ],
    [
      'extra join arguments',
      'components/ExtraJoinArgumentsRead.ts',
      "localStorage.getItem(['hype', 'projects'].join('_', 'ignored'));",
    ],
    [
      'a singleton array with a dynamic separator',
      'components/SingletonDynamicSeparatorRead.ts',
      "localStorage.getItem(['hype_' + 'projects'].join(suppliedSeparator));",
    ],
    [
      'aliased storage with a computed member',
      'components/AliasedComputedPreferenceRead.ts',
      "const storage = window['local' + 'Storage']; const read = storage['get' + 'Item']; read('doctect_last_fontSize');",
    ],
    [
      'an extracted member without invocation',
      'components/ExtractedPreferenceRead.ts',
      'const read = localStorage.getItem; void read;',
    ],
    [
      'a bare storage escape',
      'components/BareStorageEscape.ts',
      'consume(localStorage);',
    ],
    [
      'reflective storage access',
      'components/ReflectivePreferenceRead.ts',
      "Reflect.get(window, 'localStorage').getItem('doctect_last_fontSize');",
    ],
    [
      'aliased reflective storage access',
      'components/AliasedReflectivePreferenceRead.ts',
      "const get = Reflect.get; get(window, 'localStorage').getItem('doctect_last_fontSize');",
    ],
    [
      'an executable inline HTML preference read',
      'future-shell.html',
      "<script>localStorage.getItem('doctect_last_fontSize');</script>",
    ],
  ])('rejects production localStorage access through %s', (_case, path, source) => {
    expect(analyzeProductionSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining('accesses production localStorage outside approved persistence modules'),
    ]));
  });

  it.each([
    [
      'a mutated computed receiver key',
      'components/MutatedStorageReceiver.ts',
      "const parts = ['safe']; parts.splice(0, 1, 'local', 'Storage'); window[parts.join('')].getItem('x');",
    ],
    [
      'an overridden computed receiver join',
      'components/OverriddenStorageReceiver.ts',
      "const parts = ['safe']; parts.join = () => 'localStorage'; self[parts.join('')].getItem('x');",
    ],
    [
      'an extra-argument computed receiver join',
      'components/ExtraArgumentStorageReceiver.ts',
      "globalThis[['local', 'Storage'].join('', ignored)].getItem('x');",
    ],
    [
      'a coercing computed receiver key',
      'components/CoercingStorageReceiver.ts',
      "window[{ toString() { return 'localStorage'; } }].getItem('x');",
    ],
    [
      'an unknown computed browser-global key',
      'components/DynamicGlobalReceiver.ts',
      'void self[suppliedProperty];',
    ],
    [
      'an inline mutated computed receiver key',
      'computed-shell.html',
      "<script>const parts = ['safe']; parts.splice(0, 1, 'local', 'Storage'); window[parts.join('')].getItem('x');</script>",
    ],
  ])('rejects %s without reconstructing its property key', (_case, path, source) => {
    expect(analyzeProductionSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining('uses dynamic browser-global property access outside approved persistence modules'),
    ]));
  });

  it.each([
    [
      'a window.window alias',
      'components/QualifiedWindowAlias.ts',
      'const browser = window.window; void browser[suppliedProperty];',
      'uses dynamic browser-global property access outside approved persistence modules',
    ],
    [
      'a globalThis.self alias',
      'components/QualifiedSelfAlias.ts',
      'const browser = globalThis.self; void browser[suppliedProperty];',
      'uses dynamic browser-global property access outside approved persistence modules',
    ],
    [
      'a destructured qualified window alias',
      'components/DestructuredQualifiedWindowAlias.ts',
      'const { window: browser } = globalThis; void browser[suppliedProperty];',
      'uses dynamic browser-global property access outside approved persistence modules',
    ],
    [
      'a globalThis.Reflect alias',
      'components/QualifiedReflectAlias.ts',
      'const reflection = globalThis.Reflect; reflection.get(window, suppliedProperty);',
      'uses Reflect.get on a browser global outside approved persistence modules',
    ],
    [
      'a destructured qualified Reflect alias',
      'components/DestructuredQualifiedReflectAlias.ts',
      'const { Reflect: reflection } = window; reflection.get(globalThis, suppliedProperty);',
      'uses Reflect.get on a browser global outside approved persistence modules',
    ],
    [
      'an aliased window.Reflect.get and qualified target',
      'components/QualifiedReflectGetAlias.ts',
      'const reflection = window.Reflect; const get = reflection.get; get(globalThis.self, suppliedProperty);',
      'uses Reflect.get on a browser global outside approved persistence modules',
    ],
  ])('rejects dynamic browser access through %s', (_case, path, source, message) => {
    expect(analyzeProductionSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining(message),
    ]));
  });

  it.each([
    [
      'a mutated Reflect method key',
      'components/MutatedReflectMethod.ts',
      "const method = ['safe']; method.join = () => 'get'; Reflect[method.join('')](window, suppliedProperty);",
    ],
    [
      'a coercing Reflect method key',
      'components/CoercingReflectMethod.ts',
      "Reflect[{ toString() { return 'get'; } }](window, suppliedProperty);",
    ],
    [
      'an unknown qualified Reflect method',
      'components/QualifiedComputedReflect.ts',
      'globalThis.Reflect[suppliedMethod](window, suppliedProperty);',
    ],
    [
      'an aliased qualified Reflect method',
      'components/AliasedComputedReflect.ts',
      'const reflection = window.Reflect; reflection[suppliedMethod](window, suppliedProperty);',
    ],
    [
      'a known computed Reflect method',
      'components/KnownComputedReflect.ts',
      "const ownKeys = Reflect['ownKeys']; void ownKeys;",
    ],
  ])('rejects computed member acquisition through %s', (_case, path, source) => {
    expect(analyzeProductionSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining('uses computed Reflect member access outside approved persistence modules'),
    ]));
  });

  it.each([
    [
      'a direct mutated Reflect.get key',
      'components/MutatedReflectReceiver.ts',
      "const parts = ['safe']; parts.splice(0, 1, 'local', 'Storage'); Reflect.get(window, parts.join('')).getItem('x');",
    ],
    [
      'a direct overridden Reflect.get key',
      'components/OverriddenReflectReceiver.ts',
      "const parts = ['safe']; parts.join = () => 'localStorage'; Reflect.get(self, parts.join('')).getItem('x');",
    ],
    [
      'a direct extra-argument Reflect.get key',
      'components/ExtraArgumentReflectReceiver.ts',
      "Reflect.get(globalThis, ['local', 'Storage'].join('', ignored), suppliedReceiver).getItem('x');",
    ],
    [
      'a direct coercing Reflect.get key',
      'components/CoercingReflectReceiver.ts',
      "Reflect.get(window, { toString() { return 'localStorage'; } }).getItem('x');",
    ],
    [
      'an aliased mutated Reflect.get key',
      'components/AliasedMutatedReflectReceiver.ts',
      "const get = Reflect.get; const parts = ['safe']; parts.splice(0, 1, 'local', 'Storage'); get(window, parts.join('')).getItem('x');",
    ],
    [
      'an aliased overridden Reflect.get key',
      'components/AliasedOverriddenReflectReceiver.ts',
      "const get = Reflect.get; const parts = ['safe']; parts.join = () => 'localStorage'; get(self, parts.join('')).getItem('x');",
    ],
    [
      'an aliased extra-argument Reflect.get key',
      'components/AliasedExtraArgumentReflectReceiver.ts',
      "const get = Reflect.get; get(globalThis, ['local', 'Storage'].join('', ignored), suppliedReceiver).getItem('x');",
    ],
    [
      'an aliased coercing Reflect.get key',
      'components/AliasedCoercingReflectReceiver.ts',
      "const get = Reflect.get; get(window, { toString() { return 'localStorage'; } }).getItem('x');",
    ],
    [
      'a direct unknown Reflect.get key',
      'components/DynamicReflectReceiver.ts',
      'void Reflect.get(window, suppliedProperty, suppliedReceiver);',
    ],
    [
      'an aliased unknown Reflect.get key',
      'components/AliasedDynamicReflectReceiver.ts',
      'const get = Reflect.get; void get(window, suppliedProperty, suppliedReceiver);',
    ],
    [
      'an inline aliased coercing Reflect.get key',
      'reflect-shell.html',
      "<script>const get = Reflect.get; get(window, { toString() { return 'localStorage'; } }).getItem('x');</script>",
    ],
  ])('rejects %s from its browser-global target alone', (_case, path, source) => {
    expect(analyzeProductionSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining('uses Reflect.get on a browser global outside approved persistence modules'),
    ]));
  });

  it.each([
    ['components/ReflectOwnKeys.ts', 'Reflect.ownKeys(globalThis);'],
    ['components/ReflectErrorName.ts', "Reflect.get(error, 'name');"],
    ['components/AliasedReflectErrorName.ts', "const get = Reflect.get; get(error, suppliedProperty);"],
    ['components/QualifiedReflectErrorName.ts', "const reflection = globalThis.Reflect; reflection.get(error, 'name');"],
    ['components/ComputedObject.ts', 'void suppliedObject[suppliedProperty];'],
    ['components/KnownGlobalLocation.ts', "void window['location'];"],
    ['components/QualifiedGlobalLocation.ts', 'const browser = window.window; void browser.location;'],
  ])('preserves unrelated reflection and non-global computation in %s', (path, source) => {
    expect(analyzeProductionSource(path, source)).toEqual([]);
  });

  it('reports known literal Reflect.get without falsely claiming localStorage access', () => {
    const violations = analyzeProductionSource(
      'components/ReflectLocation.ts',
      "void Reflect.get(window, 'location');",
    );

    expect(violations).toEqual(expect.arrayContaining([
      expect.stringContaining('uses Reflect.get on a browser global outside approved persistence modules'),
    ]));
    expect(violations.join('\n')).not.toContain('accesses production localStorage');
  });

  it('skips type-only localStorage references', () => {
    expect(analyzeProductionSource(
      'components/StorageTypes.ts',
      'type BrowserStorage = typeof localStorage;',
    )).toEqual([]);
  });

  it('rejects emitted runtime typeof localStorage expressions', () => {
    expect(analyzeProductionSource(
      'components/RuntimeStorageType.ts',
      'const browserStorageType = typeof localStorage;',
    )).toEqual(expect.arrayContaining([
      expect.stringContaining('accesses production localStorage outside approved persistence modules'),
    ]));
  });

  it('rejects storage access in an emitted class extends expression', () => {
    expect(analyzeProductionSource(
      'components/RuntimeStorageHeritage.ts',
      'class RuntimeStorageHeritage extends (consume(localStorage), Object) {}',
    )).toEqual(expect.arrayContaining([
      expect.stringContaining('accesses production localStorage outside approved persistence modules'),
    ]));
  });

  it.each([
    ['an interface extends clause', 'interface StorageShape extends localStorage {}'],
    ['a class implements clause', 'class StorageImplementation implements localStorage {}'],
    ['a runtime call type argument', 'consume<typeof localStorage>(value);'],
  ])('skips localStorage in %s because it emits no reference', (_case, source) => {
    expect(analyzeProductionSource('components/StorageTypeRegions.ts', source)).toEqual([]);
  });

  it('keeps unrelated classic HTML globals from masking module storage access', () => {
    const modulePath = 'components/WindowPreferenceRead.ts';
    const violations = analyzeSources([
      {
        path: 'generated-shell.html',
        source: '<script>window.generatedData = {};</script>',
        directStorageBoundary: true,
      },
      {
        path: modulePath,
        source: "window.localStorage.getItem('doctect_last_fontSize');",
        directStorageBoundary: true,
      },
    ] as DirectStorageBoundaryInput[]).get(modulePath) ?? [];

    expect(violations).toEqual(expect.arrayContaining([
      expect.stringContaining('accesses production localStorage outside approved persistence modules'),
    ]));
  });

  it.each([
    'services/browserPreferences.ts',
    'services/localWorkspace/index.ts',
  ])('allows only the existing exact storage implementation in %s', path => {
    const source = readFileSync(join(root, path), 'utf8');
    expect(analyzeProductionSource(path, source)).toEqual([]);
  });

  it.each([
    [
      'services/browserPreferences.ts',
      "window.localStorage.setItem(suppliedKey, suppliedValue);",
    ],
    [
      'services/localWorkspace/index.ts',
      'export const leakedStorageValue = window.localStorage.getItem(suppliedKey);',
    ],
  ])('rejects additional direct storage access in %s', (path, appendedSource) => {
    const source = `${readFileSync(join(root, path), 'utf8')}\n${appendedSource}\n`;
    expect(analyzeProductionSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining('accesses production localStorage outside approved persistence modules'),
    ]));
  });

  it('contains no reusable raw preference Storage capability', () => {
    const source = readFileSync(join(root, 'services/browserPreferences.ts'), 'utf8');

    expect(source).not.toContain('storageFor');
    expect(source).not.toMatch(/:\s*Storage\s*\|\s*null/);
  });

  it.each([
    [
      'an arbitrary capability read',
      "export const unsafeRead = (key: string) => storageFor('doctect_last_fontSize')?.getItem(key);",
    ],
    ['an object capability export', 'export default { storageFor };'],
  ])('rejects historical raw preference capability through %s', (_case, appendedSource) => {
    const source = `
const isRuntimeBrowserPreferenceKey = (_key: unknown): boolean => true;
const storageFor = (key: unknown): Storage | null => {
  if (!isRuntimeBrowserPreferenceKey(key)) return null;
  try {
    return typeof window === 'undefined' ? null : window.localStorage ?? null;
  } catch {
    return null;
  }
};
${appendedSource}
`;

    expect(analyzeProductionSource('services/browserPreferences.ts', source)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('accesses production localStorage outside approved persistence modules'),
      ]),
    );
  });

  it.each([
    [
      'a read export modifier',
      (source: string) => source.replace(
        'const readRuntimeBrowserPreference =',
        'export const readRuntimeBrowserPreference =',
      ),
    ],
    [
      'a named write export',
      (source: string) => `${source}\nexport { writeRuntimeBrowserPreference };\n`,
    ],
    [
      'an object helper export',
      (source: string) => `${source}\nexport default { readRuntimeBrowserPreference, writeRuntimeBrowserPreference };\n`,
    ],
  ])('requires guarded preference operations to remain private from %s', (_case, mutate) => {
    const source = mutate(readFileSync(join(root, 'services/browserPreferences.ts'), 'utf8'));

    expect(analyzeProductionSource('services/browserPreferences.ts', source)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('accesses production localStorage outside approved persistence modules'),
      ]),
    );
  });

  it.each([
    ['read', 'return null'],
    ['write', 'return false'],
  ])('requires the exact runtime-key guard for the %s operation', (_operation, fallback) => {
    const original = readFileSync(join(root, 'services/browserPreferences.ts'), 'utf8');
    const source = original.replace(
      `if (!isRuntimeBrowserPreferenceKey(key)) ${fallback};`,
      `if (false) ${fallback};`,
    );

    expect(source).not.toBe(original);

    expect(analyzeProductionSource('services/browserPreferences.ts', source)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('accesses production localStorage outside approved persistence modules'),
      ]),
    );
  });

  it.each([
    ['read', 'return null'],
    ['write', 'return false'],
  ])('requires the exact window guard for the %s operation', (_operation, fallback) => {
    const original = readFileSync(join(root, 'services/browserPreferences.ts'), 'utf8');
    const source = original.replace(
      `if (typeof window === 'undefined') ${fallback};`,
      `if (false) ${fallback};`,
    );

    expect(source).not.toBe(original);
    expect(analyzeProductionSource('services/browserPreferences.ts', source)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('accesses production localStorage outside approved persistence modules'),
      ]),
    );
  });

  it.each([
    ['read', 'window.localStorage.getItem(key)', 'window.localStorage.getItem(suppliedKey)'],
    ['write', 'window.localStorage.setItem(key, value)', 'window.localStorage.setItem(suppliedKey, value)'],
  ])('requires exact key flow for the guarded %s operation', (_operation, expected, replacement) => {
    const original = readFileSync(join(root, 'services/browserPreferences.ts'), 'utf8');
    const source = original.replace(expected, replacement);

    expect(source).not.toBe(original);
    expect(analyzeProductionSource('services/browserPreferences.ts', source)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('accesses production localStorage outside approved persistence modules'),
      ]),
    );
  });

  it('rejects changing the guarded read into a raw Storage return', () => {
    const original = readFileSync(join(root, 'services/browserPreferences.ts'), 'utf8');
    const source = original.replace(
      'return window.localStorage.getItem(key);',
      'return window.localStorage;',
    );

    expect(source).not.toBe(original);
    expect(analyzeProductionSource('services/browserPreferences.ts', source)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('accesses production localStorage outside approved persistence modules'),
      ]),
    );
  });

  it('contains no named reusable local-workspace environment capability', () => {
    const source = readFileSync(join(root, 'services/localWorkspace/index.ts'), 'utf8');

    expect(source).not.toMatch(/\bconst browserEnvironment\b/);
    expect(source).toMatch(/createLocalWorkspaceStore\(\{/);
  });

  it.each([
    [
      'an arbitrary legacy read',
      'export const unsafeRead = (key: string) => browserEnvironment.legacyStorage.getItem(key);',
    ],
    ['an object environment export', 'export default { browserEnvironment };'],
  ])('rejects historical local-workspace capability through %s', (_case, appendedSource) => {
    const source = `
const browserEnvironment = {
  legacyStorage: {
    getItem(key: string) {
      return window.localStorage.getItem(key);
    },
  },
};
${appendedSource}
`;

    expect(analyzeProductionSource('services/localWorkspace/index.ts', source)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('accesses production localStorage outside approved persistence modules'),
      ]),
    );
  });

  it('requires the legacy adapter to call getItem with its key parameter', () => {
    const source = readFileSync(join(root, 'services/localWorkspace/index.ts'), 'utf8')
      .replace('window.localStorage.getItem(key)', 'window.localStorage.getItem(suppliedKey)');

    expect(analyzeProductionSource('services/localWorkspace/index.ts', source)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('accesses production localStorage outside approved persistence modules'),
      ]),
    );
  });

  it('retains exact legacy-key defense inside the preference module', () => {
    const exactLegacyKey = ['hype', 'projects'].join('_');
    expect(analyzeProductionSource(
      'services/browserPreferences.ts',
      `window.localStorage.getItem('${exactLegacyKey}');`,
    )).toEqual(expect.arrayContaining([
      expect.stringContaining(`exact legacy document key ${exactLegacyKey}`),
    ]));
  });

  it('allows only the byte-exact compiled preference module inside generated onboarding HTML', () => {
    const source = `<script>${buildBrowserPreferencesBundle(root)}</script>`;

    expect(analyzeProductionSource('onboarding/index.html', source)).toEqual([]);
  });

  it('rejects direct storage appended to the generated onboarding preference segment', () => {
    const source = `<script>${buildBrowserPreferencesBundle(root)}\nwindow.localStorage.getItem('x');</script>`;

    expect(analyzeProductionSource('onboarding/index.html', source)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('accesses production localStorage outside approved persistence modules'),
      ]),
    );
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
      'JavaScript with an explicit separator',
      'components/JoinedLegacyRead.js',
      "localStorage.getItem(['hype', 'projects'].join('_'));",
    ],
    [
      'TypeScript with a default separator and nested origin',
      'components/NestedJoinedLegacyRead.ts',
      "const parts = ['hype_' + 'projects']; const nested = parts; const key: string = nested.join(); localStorage.getItem(key);",
    ],
    [
      'TypeScript with static element and separator alternatives',
      'components/AlternativeJoinedLegacyRead.ts',
      "const parts = ['hype', choosePart ? 'projects' : 'preference']; const separator = chooseSeparator ? '_' : '-'; localStorage.getItem(parts.join(separator));",
    ],
  ])('rejects array join reconstructed legacy keys in %s', (_case, path, source) => {
    expect(analyzeSource(path, source)).toEqual(expect.arrayContaining([
      expect.stringContaining('accesses legacy document key through localStorage'),
    ]));
  });

  it('rejects array join reconstructed legacy keys inside executable inline HTML', () => {
    const source = [
      '<script type="module">',
      "const parts = ['hype', 'projects'];",
      "const separator = '_';",
      'const key = parts.join(separator);',
      'localStorage.getItem(key);',
      '</script>',
    ].join('\n');
    expect(analyzeSource('joined-shell.html', source)).toEqual(expect.arrayContaining([
      expect.stringContaining('joined-shell.html:5: accesses legacy document key'),
    ]));
  });

  it.each([
    [
      'a safe built-in array join',
      "localStorage.getItem(['doctect', 'last', 'fontSize'].join('_'));",
    ],
    [
      'a custom object join method',
      "const custom = { join: suppliedJoin }; localStorage.getItem(custom.join('_'));",
    ],
    [
      'an arbitrary nested join method',
      "const custom = supplied; const nested = custom; localStorage.getItem(nested.join('_'));",
    ],
    [
      'an array join with a dynamic separator',
      "localStorage.getItem(['hype', 'projects'].join(suppliedSeparator));",
    ],
  ])('does not infer %s as a legacy key', (_case, source) => {
    expect(analyzeSource('components/SafeJoin.ts', source)).toEqual([]);
  });

  it('fails closed when static join candidate expansion exceeds its bound', () => {
    const alternatives = (prefix: string, first: string): string => [
      `'${first}'`,
      ...Array.from({ length: 16 }, (_, index) => `'${prefix}-${index}'`),
    ].reduceRight((otherwise, value, index) => (
      `choice${prefix}${index} ? ${value} : (${otherwise})`
    ));
    const source = `localStorage.getItem([${alternatives('left', 'hype')}, ${alternatives('right', 'projects')}].join('_'));`;

    expect(analyzeSource('components/BoundedJoin.ts', source)).toEqual(expect.arrayContaining([
      expect.stringContaining('static string candidate expansion exceeds policy bound'),
    ]));
  });

  it('does not apply join evaluation to overflowing custom method alternatives', () => {
    const method = [
      "'join'",
      ...Array.from({ length: staticStringCandidateLimit }, (_, index) => `'custom-${index}'`),
    ].reduceRight((otherwise, value, index) => `choice${index} ? ${value} : (${otherwise})`);
    const source = `const custom = supplied; localStorage.getItem(custom[${method}]('_'));`;

    expect(analyzeSource('components/CustomJoin.ts', source)).toEqual([]);
  });

  it('fails closed when storage method candidate expansion exceeds its bound', () => {
    const method = [
      "'getItem'",
      ...Array.from({ length: staticStringCandidateLimit }, (_, index) => `'custom-${index}'`),
    ].reduceRight((otherwise, value, index) => `choice${index} ? ${value} : (${otherwise})`);
    const source = `const method = ${method}; localStorage[method](['hype', 'projects'].join('_'));`;

    expect(analyzeSource('components/BoundedMethod.ts', source)).toEqual(expect.arrayContaining([
      expect.stringContaining('static string candidate expansion exceeds policy bound'),
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

  it.each(([
    ['localStorage', 'localStorage'],
    ['window', 'window.localStorage'],
    ['self', 'self.localStorage'],
    ['globalThis', 'globalThis.localStorage'],
  ] as const).flatMap(([name, receiver]) => [
    [
      name,
      'before block',
      `const key = 'hype_' + 'projects'; ${receiver}.getItem(key); { function ${name}() {} }`,
    ],
    [
      name,
      'inside block',
      `{ function ${name}() {} const key = 'hype_' + 'projects'; ${receiver}.getItem(key); }`,
    ],
    [
      name,
      'after block',
      `{ function ${name}() {} } const key = 'hype_' + 'projects'; ${receiver}.getItem(key);`,
    ],
    [
      name,
      'inside nested closure',
      `{ function ${name}() {} } function nested() { const key = 'hype_' + 'projects'; `
        + `${receiver}.getItem(key); } nested();`,
    ],
  ]))('function-local Annex B %s binding shadows native access %s', (_name, _position, body) => {
    const source = `<script>function readSafely() { ${body} } readSafely();</script>`;
    expect(analyzeSource('annex-b-function-environment.html', source)).toEqual([]);
  });

  it.each([
    ['false conditional', 'if (false) function localStorage() {}'],
    ['labelled declaration', 'label: function localStorage() {}'],
  ])('function-local Annex B supports an eligible %s synthetic binding', (_case, declaration) => {
    const source = `<script>function readSafely() { ${declaration} `
      + "const key = 'hype_' + 'projects'; localStorage.getItem(key); } readSafely();</script>";
    expect(analyzeSource('annex-b-function-form.html', source)).toEqual([]);
  });

  it.each([
    [
      'strict containing function',
      'function read() { \'use strict\'; { function localStorage() {} } '
        + "const key = 'hype_' + 'projects'; localStorage.getItem(key); }",
    ],
    [
      'strict containing script',
      "'use strict'; function read() { { function localStorage() {} } "
        + "const key = 'hype_' + 'projects'; localStorage.getItem(key); }",
    ],
  ])('function-local Annex B excludes %s', (_case, declaration) => {
    const source = `<script>${declaration} read();</script>`;
    expect(analyzeSource('annex-b-function-strict.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it.each([
    ['generator', 'function* localStorage() {}'],
    ['async', 'async function localStorage() {}'],
    ['async generator', 'async function* localStorage() {}'],
  ])('function-local Annex B excludes nonordinary %s declarations', (_case, declaration) => {
    const source = `<script>function read() { { ${declaration} } `
      + "const key = 'hype_' + 'projects'; localStorage.getItem(key); } read();</script>";
    expect(analyzeSource('annex-b-function-nonordinary.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it.each([
    [
      'intervening lexical declaration',
      '{ let localStorage; { function localStorage() {} } }',
    ],
    [
      'same-name destructuring catch',
      'try { throw { localStorage: 1 }; } '
        + 'catch ({ localStorage }) { { function localStorage() {} } }',
    ],
  ])('function-local Annex B excludes %s', (_case, declaration) => {
    const source = `<script>function read() { ${declaration} `
      + "const key = 'hype_' + 'projects'; localStorage.getItem(key); } read();</script>";
    expect(analyzeSource('annex-b-function-ineligible.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it('function-local Annex B does not leak into an unrelated sibling function', () => {
    const source = '<script>function define() { { function localStorage() {} } } '
      + "function read() { const key = 'hype_' + 'projects'; localStorage.getItem(key); } "
      + 'define(); read();</script>';
    expect(analyzeSource('annex-b-function-sibling.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it('function-local Annex B does not leak from a nested function to its parent', () => {
    const source = '<script>function read() { function nested() { { function localStorage() {} } } '
      + "nested(); const key = 'hype_' + 'projects'; localStorage.getItem(key); } read();</script>";
    expect(analyzeSource('annex-b-function-nested-boundary.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it.each([
    ['parameter', 'function read(localStorage) {'],
    ['local var', 'function read() { var localStorage;'],
    ['local lexical', 'function read() { let localStorage;'],
  ])('function-local Annex B preserves ordinary %s shadowing', (_case, prefix) => {
    const source = `<script>${prefix} { function localStorage() {} } `
      + "const key = 'hype_' + 'projects'; localStorage.getItem(key); } read();</script>";
    expect(analyzeSource('annex-b-function-ordinary-shadow.html', source)).toEqual([]);
  });

  it.each([
    [
      'function expression',
      'const read = function () { { function localStorage() {} } '
        + "const key = 'hype_' + 'projects'; localStorage.getItem(key); }; read();",
    ],
    [
      'arrow function',
      'const read = () => { { function localStorage() {} } '
        + "const key = 'hype_' + 'projects'; localStorage.getItem(key); }; read();",
    ],
    [
      'object method',
      'const reader = { read() { { function localStorage() {} } '
        + "const key = 'hype_' + 'projects'; localStorage.getItem(key); } }; reader.read();",
    ],
  ])('function-local Annex B supports a non-strict %s environment', (_case, body) => {
    expect(analyzeSource('annex-b-function-kind.html', `<script>${body}</script>`)).toEqual([]);
  });

  it('function-local Annex B reaches a nested closure before block assignment', () => {
    const source = '<script>function read() { function nested() { '
      + "const key = 'hype_' + 'projects'; localStorage.getItem(key); } nested(); "
      + '{ function localStorage() {} } } read();</script>';
    expect(analyzeSource('annex-b-function-early-closure.html', source)).toEqual([]);
  });

  it.each([
    [
      'same-name simple catch',
      'try { throw 0; } catch (localStorage) { { function localStorage() {} } }',
    ],
    [
      'different-name destructuring catch',
      'try { throw null; } catch ({ value }) { { function localStorage() {} } }',
    ],
  ])('function-local Annex B preserves %s synthetic binding', (_case, declaration) => {
    const source = `<script>function read() { ${declaration} `
      + "const key = 'hype_' + 'projects'; localStorage.getItem(key); } read();</script>";
    expect(analyzeSource('annex-b-function-catch-control.html', source)).toEqual([]);
  });

  it('function-local Annex B excludes its own parameter initializer environment', () => {
    const source = '<script>const key = \'hype_\' + \'projects\'; '
      + 'function read(value = localStorage.getItem(key)) { { function localStorage() {} } } '
      + 'read();</script>';
    expect(analyzeSource('annex-b-function-parameter-environment.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it('function-local Annex B excludes strict class methods', () => {
    const source = '<script>class Reader { read() { { function localStorage() {} } '
      + "const key = 'hype_' + 'projects'; localStorage.getItem(key); } } new Reader().read();</script>";
    expect(analyzeSource('annex-b-function-class-method.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it.each([
    [
      'ordinary module file',
      'components/AnnexBFunction.js',
      'function read() { { function localStorage() {} } '
        + "const key = 'hype_' + 'projects'; localStorage.getItem(key); } read();",
    ],
    [
      'HTML module body',
      'annex-b-function-module.html',
      '<script type="module">function read() { { function localStorage() {} } '
        + "const key = 'hype_' + 'projects'; localStorage.getItem(key); } read();</script>",
    ],
  ])('function-local Annex B leaves %s unchanged', (_case, path, source) => {
    expect(analyzeSource(path, source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it.each([
    [
      'function expression in a parameter initializer',
      'function outer(run = function () { { function localStorage() {} '
        + "localStorage.getItem = () => 'safe'; } const key = 'hype_' + 'projects'; "
        + 'return localStorage.getItem(key); }) { return run(); } outer();',
    ],
    [
      'arrow in a parameter initializer',
      'function outer(run = () => { { function localStorage() {} '
        + "localStorage.getItem = () => 'safe'; } const key = 'hype_' + 'projects'; "
        + 'return localStorage.getItem(key); }) { return run(); } outer();',
    ],
    [
      'function expression in a concise arrow',
      'const make = () => function () { { function localStorage() {} '
        + "localStorage.getItem = () => 'safe'; } const key = 'hype_' + 'projects'; "
        + 'return localStorage.getItem(key); }; make()();',
    ],
    [
      'object method in a concise arrow',
      'const make = () => ({ read() { { function localStorage() {} '
        + "localStorage.getItem = () => 'safe'; } const key = 'hype_' + 'projects'; "
        + 'return localStorage.getItem(key); } }); make().read();',
    ],
  ])('nested Annex B environment discovery supports %s', (_case, body) => {
    expect(analyzeSource('annex-b-nested-expression.html', `<script>${body}</script>`)).toEqual([]);
  });

  it('nested Annex B environment discovery preserves strictness inheritance', () => {
    const source = '<script>\'use strict\'; function outer(run = function () { '
      + "{ function localStorage() {} } const key = 'hype_' + 'projects'; "
      + 'return localStorage.getItem(key); }) { return run(); } outer();</script>';
    expect(analyzeSource('annex-b-nested-expression-strict.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it.each([
    [
      'localStorage',
      'var localStorage = window.localStorage;',
      "localStorage.getItem = () => 'safe';",
      'localStorage',
    ],
    [
      'window',
      'var window = globalThis;',
      "window.localStorage = { getItem: () => 'safe' };",
      'window.localStorage',
    ],
    [
      'self',
      'var self = window;',
      "self.localStorage = { getItem: () => 'safe' };",
      'self.localStorage',
    ],
    [
      'globalThis',
      'var globalThis = window;',
      "globalThis.localStorage = { getItem: () => 'safe' };",
      'globalThis.localStorage',
    ],
  ])('local Annex B assignment kill masks an earlier native %s origin', (name, initial, safe, receiver) => {
    const source = `<script>function read() { ${initial} { function ${name}() {} ${safe} } `
      + `const key = 'hype_' + 'projects'; return ${receiver}.getItem(key); } read();</script>`;
    expect(analyzeSource('annex-b-local-assignment.html', source)).toEqual([]);
  });

  it('local Annex B assignment kill retains a native origin before assignment', () => {
    const source = '<script>function read() { var localStorage = window.localStorage; '
      + "const key = 'hype_' + 'projects'; localStorage.getItem(key); "
      + '{ function localStorage() {} } } read();</script>';
    expect(analyzeSource('annex-b-local-before-assignment.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it('local Annex B assignment kill allows a later native origin to taint again', () => {
    const source = '<script>function read() { var localStorage = window.localStorage; '
      + "{ function localStorage() {} } localStorage = window.localStorage; const key = 'hype_' + 'projects'; "
      + 'localStorage.getItem(key); } read();</script>';
    expect(analyzeSource('annex-b-local-retaint.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it('local Annex B assignment kill keeps an uncertain assignment conservative', () => {
    const source = '<script>function read() { var localStorage = window.localStorage; '
      + 'if (globalThis.condition) { function localStorage() {} } '
      + "const key = 'hype_' + 'projects'; localStorage.getItem(key); } read();</script>";
    expect(analyzeSource('annex-b-local-uncertain.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it('local Annex B assignment kill keeps a prior labelled break conservative', () => {
    const source = '<script>function read() { var localStorage = window.localStorage; exit: { break exit; '
      + '{ function localStorage() {} } } const key = \'hype_\' + \'projects\'; '
      + 'localStorage.getItem(key); } read();</script>';
    expect(analyzeSource('annex-b-local-break.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it('function-local Annex B origin boundary ignores an outer native origin before assignment', () => {
    const source = '<script>function outer() { var localStorage = window.localStorage; function inner() { '
      + "const key = 'hype_' + 'projects'; localStorage?.getItem(key); "
      + '{ function localStorage() {} } } inner(); } outer();</script>';
    expect(analyzeSource('annex-b-origin-boundary.html', source)).toEqual([]);
  });

  it.each([
    [
      'parameter',
      'function inner(localStorage = window.localStorage) { '
        + "const key = 'hype_' + 'projects'; localStorage.getItem(key); "
        + '{ function localStorage() {} } } inner();',
    ],
    [
      'local var initializer',
      'function inner() { var localStorage = window.localStorage; '
        + "const key = 'hype_' + 'projects'; localStorage.getItem(key); "
        + '{ function localStorage() {} } } inner();',
    ],
  ])('function-local Annex B origin boundary retains a same-function %s', (_case, body) => {
    expect(analyzeSource('annex-b-origin-local.html', `<script>${body}</script>`)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it('function-local Annex B origin boundary stays local after reached assignment', () => {
    const source = '<script>function outer() { var localStorage = window.localStorage; function inner() { '
      + "{ function localStorage() {} localStorage.getItem = () => 'safe'; } "
      + "const key = 'hype_' + 'projects'; localStorage.getItem(key); } inner(); } outer();</script>";
    expect(analyzeSource('annex-b-origin-after.html', source)).toEqual([]);
  });

  it('function-local Annex B origin boundary flows into a nested closure', () => {
    const source = '<script>function outer() { var localStorage = window.localStorage; function inner() { '
      + "const key = 'hype_' + 'projects'; const read = () => localStorage?.getItem(key); read(); "
      + '{ function localStorage() {} } } inner(); } outer();</script>';
    expect(analyzeSource('annex-b-origin-closure.html', source)).toEqual([]);
  });

  it('function-local Annex B origin boundary preserves a nested closure local binding', () => {
    const source = '<script>function outer() { { function localStorage() {} } function nested() { '
      + "var localStorage = window.localStorage; const key = 'hype_' + 'projects'; "
      + 'localStorage.getItem(key); } nested(); } outer();</script>';
    expect(analyzeSource('annex-b-origin-closure-local.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it('function-local Annex B origin boundary permits later same-binding native re-taint', () => {
    const source = '<script>function inner() { { function localStorage() {} } '
      + "localStorage = window.localStorage; const key = 'hype_' + 'projects'; "
      + 'localStorage.getItem(key); } inner();</script>';
    expect(analyzeSource('annex-b-origin-retaint.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it.each([
    [
      'reconstructed key',
      "{ function key() {} } key = 'hype_' + 'projects'; localStorage.getItem(key);",
      'accesses legacy document key',
    ],
    [
      'direct callable',
      "{ function read() {} } read = localStorage.getItem; read('hype_' + 'projects');",
      'accesses legacy document key',
    ],
    [
      'bound callable',
      "{ function read() {} } read = localStorage.getItem.bind(localStorage, 'hype_' + 'projects'); read();",
      'accesses legacy document key',
    ],
    [
      'call wrapper',
      "{ function read() {} } read = localStorage.getItem; read.call(localStorage, 'hype_' + 'projects');",
      'accesses legacy document key',
    ],
    [
      'apply wrapper and array alias',
      "{ function read() {} function args() {} } read = localStorage.getItem; args = ['hype_' + 'projects']; "
        + 'read.apply(localStorage, args);',
      'accesses legacy document key',
    ],
    [
      'require alias',
      "{ function load() {} } load = require; load('../services/localWorkspace/legacyTypes');",
      'imports local-workspace migration internals',
    ],
  ])('generic Annex B origin resolver follows later same-binding %s re-taint', (_case, body, finding) => {
    expect(analyzeSource('annex-b-generic-retaint.html', `<script>function inner() { ${body} } inner();</script>`))
      .toEqual([expect.stringContaining(finding)]);
  });

  it.each([
    [
      'key',
      "var key = 'hype_' + 'projects';",
      'localStorage.getItem(key); { function key() {} }',
    ],
    [
      'callable',
      'var read = localStorage.getItem.bind(localStorage);',
      "read('hype_' + 'projects'); { function read() {} }",
    ],
    [
      'apply-array',
      "var args = ['hype_' + 'projects'];",
      'localStorage.getItem.apply(localStorage, args); { function args() {} }',
    ],
    [
      'require',
      'var load = require;',
      "load('../services/localWorkspace/legacyTypes'); { function load() {} }",
    ],
  ])('generic Annex B origin resolver cuts off an outer %s origin', (_case, origin, body) => {
    const source = `<script>function outer() { ${origin} function inner() { ${body} } inner(); } outer();</script>`;
    expect(analyzeSource('annex-b-generic-outer.html', source)).toEqual([]);
  });

  it.each([
    [
      'key parameter',
      "function inner(key = 'hype_' + 'projects') { localStorage.getItem(key); { function key() {} } } inner();",
      'accesses legacy document key',
    ],
    [
      'callable var',
      "function inner() { var read = localStorage.getItem; read('hype_' + 'projects'); { function read() {} } } inner();",
      'accesses legacy document key',
    ],
    [
      'array var',
      "function inner() { var args = ['hype_' + 'projects']; localStorage.getItem.apply(localStorage, args); "
        + '{ function args() {} } } inner();',
      'accesses legacy document key',
    ],
    [
      'require var',
      "function inner() { var load = require; load('../services/localWorkspace/legacyTypes'); "
        + '{ function load() {} } } inner();',
      'imports local-workspace migration internals',
    ],
  ])('generic Annex B origin resolver preserves same-function %s before assignment', (_case, body, finding) => {
    expect(analyzeSource('annex-b-generic-before.html', `<script>${body}</script>`)).toEqual([
      expect.stringContaining(finding),
    ]);
  });

  it.each([
    [
      'key',
      "var key = 'hype_' + 'projects'; { function key() {} } localStorage.getItem(key);",
    ],
    [
      'callable',
      "var read = localStorage.getItem; { function read() {} } read('hype_' + 'projects');",
    ],
    [
      'array',
      "var args = ['hype_' + 'projects']; { function args() {} } "
        + 'localStorage.getItem.apply(localStorage, args);',
    ],
    [
      'require',
      "var load = require; { function load() {} } load('../services/localWorkspace/legacyTypes');",
    ],
  ])('generic Annex B origin resolver applies the reached %s assignment cutoff', (_case, body) => {
    expect(analyzeSource('annex-b-generic-after.html', `<script>function inner() { ${body} } inner();</script>`))
      .toEqual([]);
  });

  it.each([
    [
      'nested closure',
      "function inner() { { function key() {} } key = 'hype_' + 'projects'; "
        + 'const read = () => localStorage.getItem(key); read(); } inner();',
    ],
    [
      'containing parameter initializer',
      "const key = 'hype_' + 'projects'; function inner(value = localStorage.getItem(key)) { "
        + '{ function key() {} } return value; } inner();',
    ],
  ])('generic Annex B origin resolver supports %s scope', (_case, body) => {
    expect(analyzeSource('annex-b-generic-scope.html', `<script>${body}</script>`)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it.each([
    [
      'concise-arrow key',
      "{ function key() {} } key = 'hype_' + 'projects'; "
        + "const invoke = key => localStorage.getItem(key); invoke('safe');",
    ],
    [
      'block-arrow callable',
      '{ function read() {} } read = localStorage.getItem; '
        + "const invoke = read => { read('hype_' + 'projects'); }; invoke(() => undefined);",
    ],
    [
      'nested-function apply-array',
      "{ function args() {} } args = ['hype_' + 'projects']; "
        + "function invoke(args) { localStorage.getItem.apply(localStorage, args); } invoke(['safe']);",
    ],
    [
      'concise-arrow require',
      '{ function load() {} } load = require; '
        + "const invoke = load => load('../services/localWorkspace/legacyTypes'); invoke(() => undefined);",
    ],
  ])('Annex B binding identity preserves a distinct %s parameter', (_case, body) => {
    expect(analyzeSource(
      'annex-b-binding-parameter.html',
      `<script>function outer() { ${body} } outer();</script>`,
    )).toEqual([]);
  });

  it.each([
    [
      'block const',
      "{ function key() {} } key = 'hype_' + 'projects';",
      "{ const key = 'safe'; localStorage.getItem(key); }",
    ],
    [
      'block let',
      '{ function read() {} } read = localStorage.getItem;',
      "{ let read = () => undefined; read('hype_' + 'projects'); }",
    ],
    [
      'catch',
      "{ function key() {} } key = 'hype_' + 'projects';",
      "try { throw 'safe'; } catch (key) { localStorage.getItem(key); }",
    ],
    [
      'class',
      "{ function key() {} } key = 'hype_' + 'projects';",
      '{ class key {} localStorage.getItem(key); }',
    ],
    [
      'static-block var',
      "{ function key() {} } key = 'hype_' + 'projects';",
      "class Safe { static { var key = 'safe'; localStorage.getItem(key); } } void Safe;",
    ],
    [
      'nested-closure const',
      "{ function key() {} } key = 'hype_' + 'projects';",
      "const invoke = () => { const key = 'safe'; localStorage.getItem(key); }; invoke();",
    ],
  ])('Annex B binding identity preserves a distinct %s binding', (_case, synthetic, body) => {
    expect(analyzeSource(
      'annex-b-binding-lexical.html',
      `<script>function outer() { ${synthetic} ${body} } outer();</script>`,
    )).toEqual([]);
  });

  it('Annex B binding identity keeps block-function assignment lexical after its block', () => {
    const source = '<script>function outer() { { function key() {} '
      + "key = 'hype_' + 'projects'; } localStorage.getItem(key); } outer();</script>";
    expect(analyzeSource('annex-b-binding-block-function.html', source)).toEqual([]);
  });

  it('Annex B binding identity resolves block-function assignment inside its lexical block', () => {
    const source = '<script>function outer() { { function key() {} '
      + "key = 'hype_' + 'projects'; localStorage.getItem(key); } } outer();</script>";
    expect(analyzeSource('annex-b-binding-block-function.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it.each([
    [
      'key',
      "{ function key() {} } key = 'hype_' + 'projects'; localStorage.getItem(key);",
      'accesses legacy document key',
    ],
    [
      'callable',
      "{ function read() {} } read = localStorage.getItem; read('hype_' + 'projects');",
      'accesses legacy document key',
    ],
    [
      'apply-array',
      "{ function args() {} } args = ['hype_' + 'projects']; "
        + 'localStorage.getItem.apply(localStorage, args);',
      'accesses legacy document key',
    ],
    [
      'require',
      "{ function load() {} } load = require; load('../services/localWorkspace/legacyTypes');",
      'imports local-workspace migration internals',
    ],
  ])('Annex B binding identity retains genuine synthetic %s resolution', (_case, body, finding) => {
    expect(analyzeSource(
      'annex-b-binding-synthetic.html',
      `<script>function outer() { ${body} } outer();</script>`,
    )).toEqual([expect.stringContaining(finding)]);
  });

  it.each([
    [
      'destructured key parameter',
      "{ key = 'hype_' + 'projects' } = {}",
      '',
      'localStorage.getItem(key);',
      'key',
      'accesses legacy document key',
    ],
    [
      'simple callable parameter',
      'read',
      'read = localStorage.getItem.bind(localStorage);',
      "read('hype_' + 'projects');",
      'read',
      'accesses legacy document key',
    ],
    [
      'default apply-array parameter',
      "args = ['hype_' + 'projects']",
      '',
      'localStorage.getItem.apply(localStorage, args);',
      'args',
      'accesses legacy document key',
    ],
    [
      'rest require parameter',
      '...load',
      'load = require;',
      "load('../services/localWorkspace/legacyTypes');",
      'load',
      'imports local-workspace migration internals',
    ],
    [
      'parameter plus var',
      "key = 'hype_' + 'projects'",
      'var key;',
      'localStorage.getItem(key);',
      'key',
      'accesses legacy document key',
    ],
  ])('Annex B declaration instantiation preserves %s before and after block', (
    _case,
    parameters,
    setup,
    access,
    name,
    finding,
  ) => {
    const source = [
      '<script>',
      `function inner(${parameters}) {`,
      setup,
      access,
      `{ function ${name}() {} }`,
      access,
      '}',
      'inner();',
      '</script>',
    ].join('\n');
    expect(analyzeSource('annex-b-parameter-collision.html', source)).toEqual([
      expect.stringContaining(`annex-b-parameter-collision.html:4: ${finding}`),
      expect.stringContaining(`annex-b-parameter-collision.html:6: ${finding}`),
    ]);
  });

  it('Annex B declaration instantiation keeps a collided block function lexical inside its block', () => {
    const source = [
      '<script>',
      "function inner(key = 'safe') {",
      "{ function key() {} key = 'hype_' + 'projects'; localStorage.getItem(key); }",
      'localStorage.getItem(key);',
      '}',
      'inner();',
      '</script>',
    ].join('\n');
    expect(analyzeSource('annex-b-parameter-block.html', source)).toEqual([
      expect.stringContaining('annex-b-parameter-block.html:3: accesses legacy document key'),
    ]);
  });

  it.each([
    [
      'key before cutoff',
      "function key() {} key = 'hype_' + 'projects'; localStorage.getItem(key); { function key() {} }",
      true,
    ],
    [
      'key after cutoff',
      "function key() {} key = 'hype_' + 'projects'; { function key() {} } localStorage.getItem(key);",
      false,
    ],
    [
      'callable before cutoff',
      "function read() {} read = localStorage.getItem; read('hype_' + 'projects'); { function read() {} }",
      true,
    ],
    [
      'callable after cutoff',
      "function read() {} read = localStorage.getItem; { function read() {} } read('hype_' + 'projects');",
      false,
    ],
  ])('Annex B declaration instantiation handles direct function %s', (_case, body, reports) => {
    const violations = analyzeSource(
      'annex-b-direct-function.html',
      `<script>function outer() { ${body} } outer();</script>`,
    );
    expect(violations.some(violation => violation.includes('accesses legacy document key'))).toBe(reports);
  });

  it.each([
    ['boolean', 'true'],
    ['string', "'ready'"],
    ['number', '1'],
    ['null', 'null'],
  ])('Annex B safe completion proves a %s initializer before global assignment', (_case, initializer) => {
    const source = `<script>const ready = ${initializer}; { function self() {} `
      + "self.localStorage = { getItem: () => 'safe' }; }</script>"
      + '<script>const key = \'hype_\' + \'projects\'; self.localStorage.getItem(key);</script>';
    expect(analyzeSource('annex-b-safe-initializer.html', source)).toEqual([]);
  });

  it.each([
    ['getter access', 'supplied.ready'],
    ['call', 'getReady()'],
    ['computed property', '{ [getKey()]: true }'],
    ['spread', '{ ...supplied }'],
  ])('Annex B safe completion keeps %s initializer uncertain', (_case, initializer) => {
    const source = `<script>const ready = ${initializer}; { function self() {} }</script>`
      + '<script>const key = \'hype_\' + \'projects\'; self.localStorage.getItem(key);</script>';
    expect(analyzeSource('annex-b-unsafe-initializer.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it.each([
    ['self', 'self.localStorage'],
    ['globalThis', 'globalThis.localStorage'],
  ])('classic global var initializer replaces descriptor-accepted %s', (name, receiver) => {
    const source = `<script>var ${name} = { localStorage: { getItem: () => 'safe' } }; `
      + `const key = 'hype_' + 'projects'; ${receiver}.getItem(key);</script>`;
    expect(analyzeSource('classic-global-var-initializer.html', source)).toEqual([]);
  });

  it.each([
    ['window', 'window.localStorage'],
    ['localStorage', 'localStorage'],
  ])('classic global var initializer cannot replace getter-only %s', (name, receiver) => {
    const value = name === 'window'
      ? "{ localStorage: { getItem: () => 'safe' } }"
      : "{ getItem: () => 'safe' }";
    const source = `<script>var ${name} = ${value}; const key = 'hype_' + 'projects'; `
      + `${receiver}.getItem(key);</script>`;
    expect(analyzeSource('classic-global-var-getter.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it('classic global var initializer keeps native baseline before its write', () => {
    const source = '<script>const key = \'hype_\' + \'projects\'; self.localStorage.getItem(key); '
      + "var self = { localStorage: { getItem: () => 'safe' } };</script>";
    expect(analyzeSource('classic-global-var-before.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it('classic global var initializer allows a later native assignment to re-taint', () => {
    const source = '<script>var self = { localStorage: { getItem() {} } }; self = window; '
      + "const key = 'hype_' + 'projects'; self.localStorage.getItem(key);</script>";
    expect(analyzeSource('classic-global-var-retaint.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it('classic global var initializer keeps throwable writes conservative', () => {
    const source = '<script>var self = getSafeGlobal(); const key = \'hype_\' + \'projects\'; '
      + 'self.localStorage.getItem(key);</script>';
    expect(analyzeSource('classic-global-var-uncertain.html', source)).toEqual([
      expect.stringContaining('accesses legacy document key'),
    ]);
  });

  it.each([
    [
      'duplicate lexical declarations',
      ['let duplicate;', 'let duplicate;'],
      3,
    ],
    [
      'duplicate imported bindings',
      ["import { first as duplicate } from './first.js';", "import { second as duplicate } from './second.js';"],
      3,
    ],
    [
      'import and lexical collision',
      ["import { value as duplicate } from './value.js';", 'const duplicate = 1;'],
      3,
    ],
    [
      'duplicate exported names',
      ['const first = 1; const second = 2;', 'export { first as duplicate };', 'export { second as duplicate };'],
      4,
    ],
  ])('module binding early error rejects %s atomically', (_case, declarations, failureLine) => {
    const source = [
      '<script type="module">',
      ...declarations,
      "const key = 'hype_' + 'projects';",
      'localStorage.getItem(key);',
      '</script>',
    ].join('\n');
    const violations = analyzeSource('module-binding-error.html', source);
    expect(violations.filter(violation => violation.includes('could not be parsed'))).toEqual([
      expect.stringContaining(`module-binding-error.html:${failureLine}: could not be parsed`),
    ]);
    expect(violations.filter(violation => violation.includes('accesses legacy document key'))).toEqual([]);
  });

  it('module binding early error preserves valid imports, exports, and top-level await', () => {
    const source = [
      '<script type="module">',
      "import { first as one, second as two } from './values.js';",
      'export { one, two };',
      'await Promise.resolve();',
      "const key = 'hype_' + 'projects';",
      'localStorage.getItem(key);',
      '</script>',
    ].join('\n');
    const violations = analyzeSource('module-binding-valid.html', source);
    expect(violations.filter(violation => violation.includes('could not be parsed'))).toEqual([]);
    expect(violations.filter(violation => violation.includes('accesses legacy document key'))).toEqual([
      expect.stringContaining('module-binding-valid.html:6: accesses legacy document key'),
    ]);
  });

  it.each([
    ['undefined local export', 'export { missing };'],
    ['duplicate nested lexical binding', '{ let duplicate; let duplicate; }'],
    ['strict duplicate parameters', 'function invalid(value, value) {}'],
  ])('module goal parser rejects %s atomically', (_case, invalid) => {
    const source = [
      '<script type="module">',
      invalid,
      "const key = 'hype_' + 'projects';",
      'localStorage.getItem(key);',
      '</script>',
    ].join('\n');
    const violations = analyzeSource('module-goal-error.html', source);
    expect(violations.filter(violation => violation.includes('could not be parsed'))).toEqual([
      expect.stringContaining('module-goal-error.html:2: could not be parsed'),
    ]);
    expect(violations.filter(violation => violation.includes('accesses legacy document key'))).toEqual([]);
  });

  it('module goal parser preserves unresolved re-exports, dynamic import, and top-level await', () => {
    const source = [
      '<script type="module">',
      "import { first as one } from './values.js';",
      "export { remote } from './remote.js';",
      "await import('./dynamic.js');",
      "const key = 'hype_' + 'projects';",
      'localStorage.getItem(key);',
      '</script>',
    ].join('\n');
    const violations = analyzeSource('module-goal-valid.html', source);
    expect(violations.filter(violation => violation.includes('could not be parsed'))).toEqual([]);
    expect(violations.filter(violation => violation.includes('accesses legacy document key'))).toEqual([
      expect.stringContaining('module-goal-valid.html:6: accesses legacy document key'),
    ]);
  });

  it('module goal parser keeps separate authored module bindings isolated', () => {
    const source = '<script type="module">const isolated = 1;</script>'
      + '<script type="module">const isolated = 2; const key = \'hype_\' + \'projects\'; '
      + 'localStorage.getItem(key);</script>';
    const violations = analyzeSource('module-goal-isolation.html', source);
    expect(violations.filter(violation => violation.includes('could not be parsed'))).toEqual([]);
    expect(violations.filter(violation => violation.includes('accesses legacy document key'))).toEqual([
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

  it('does not classify approved preference keys as legacy document keys', () => {
    const source = `
      const storage = window['local' + 'Storage'];
      const setPreference = storage['set' + 'Item'];
      setPreference.call(storage, 'doctect_last_fontSize', '16');
      storage.removeItem('gallery-explainer-dismissed');
    `;

    expect(analyzeSource('services/browserPreferences.ts', source)).toEqual([]);
  });
});
