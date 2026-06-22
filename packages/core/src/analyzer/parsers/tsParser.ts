import ts from 'typescript';
import type { ModuleLanguage, ParsedFile, RawImport } from '../types';
import type { DynamicLoaderConfig } from '../../config/frontScopeConfig';

export interface TsParseInput {
  relPath: string;
  content: string;
  language: ModuleLanguage;
}

export interface TsParser {
  parse(input: TsParseInput): ParsedFile;
}

export interface TsParserOptions {
  dynamicLoaders?: DynamicLoaderConfig[];
}

const SCRIPT_KIND_BY_EXT: Record<string, ts.ScriptKind> = {
  ts: ts.ScriptKind.TS,
  tsx: ts.ScriptKind.TSX,
  js: ts.ScriptKind.JS,
  jsx: ts.ScriptKind.JSX,
  mjs: ts.ScriptKind.JS,
  cjs: ts.ScriptKind.JS,
};

export function createTsParser(options: TsParserOptions = {}): TsParser {
  const loaders = options.dynamicLoaders ?? [];
  return {
    parse(input: TsParseInput): ParsedFile {
      const sf = ts.createSourceFile(
        input.relPath,
        input.content,
        ts.ScriptTarget.Latest,
        false,
        scriptKindFor(input.relPath, input.language),
      );

      const imports: RawImport[] = [];
      const exports = new Set<string>();
      const callees = new Set<string>();
      let hasDefineStore = false;

      visit(
        sf,
        sf,
        imports,
        exports,
        callees,
        () => {
          hasDefineStore = true;
        },
        loaders,
      );

      const directives = readDirectivePrologue(sf);

      return {
        relPath: input.relPath,
        language: input.language,
        loc: countLines(input.content),
        imports,
        exports: [...exports].sort(),
        hasDefineStore: hasDefineStore || /\bdefineStore\s*\(/.test(input.content),
        ...(directives.length > 0 ? { directives } : {}),
        ...(callees.size > 0 ? { callIdentifiers: [...callees].sort() } : {}),
      };
    },
  };
}

function scriptKindFor(relPath: string, language: ModuleLanguage): ts.ScriptKind {
  if (language === 'vue') return ts.ScriptKind.TS;
  const ext = relPath.slice(relPath.lastIndexOf('.') + 1).toLowerCase();
  return SCRIPT_KIND_BY_EXT[ext] ?? ts.ScriptKind.TS;
}

function visit(
  node: ts.Node,
  sf: ts.SourceFile,
  imports: RawImport[],
  exports: Set<string>,
  callees: Set<string>,
  markDefineStore: () => void,
  loaders: DynamicLoaderConfig[],
): void {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    callees.add(node.expression.text);
  }

  if (ts.isImportDeclaration(node)) {
    const spec = literalText(node.moduleSpecifier);
    if (spec !== null) {
      imports.push({ specifier: spec, kind: classifyImport(node) });
    }
    return;
  }

  if (ts.isExportDeclaration(node)) {
    const spec = node.moduleSpecifier ? literalText(node.moduleSpecifier) : null;
    if (spec !== null) {
      imports.push({ specifier: spec, kind: node.isTypeOnly ? 'type-only' : 'static' });
    }
    if (node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const el of node.exportClause.elements) exports.add(el.name.text);
    } else if (node.exportClause && ts.isNamespaceExport(node.exportClause)) {
      exports.add(node.exportClause.name.text);
    }
    return;
  }

  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    node.arguments.length > 0
  ) {
    const arg = node.arguments[0];
    if (arg) {
      const spec = literalText(arg);
      if (spec !== null) {
        imports.push({ specifier: spec, kind: 'dynamic' });
      } else {
        // template-literal import() - keep the static prefix
        // TODO: handle the dynamic tail too (e.g. via a pattern marker), so
        // `./views/${name}.vue` resolves against actual files in ./views.
        const prefix = staticPrefix(arg);
        if (prefix !== null && prefix.length > 0) {
          imports.push({ specifier: prefix, kind: 'dynamic', pattern: 'prefix' });
        }
      }
    }
  }

  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'defineStore'
  ) {
    markDefineStore();
  }

  // CommonJS require() -> static dep
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'require' &&
    node.arguments.length > 0
  ) {
    const arg = node.arguments[0];
    if (arg) {
      const spec = literalText(arg);
      if (spec !== null) imports.push({ specifier: spec, kind: 'static' });
    }
  }

  // user-defined dynamic loaders from .archora.json (match by ident name only)
  if (
    loaders.length > 0 &&
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.arguments.length > 0
  ) {
    const fnName = node.expression.text;
    for (const loader of loaders) {
      if (loader.name !== fnName) continue;
      const idx = loader.argIndex ?? 0;
      const arg = node.arguments[idx];
      if (!arg) continue;
      const literal = literalText(arg);
      if (literal === null) continue;
      const resolved = loader.resolveAs.replace(/\{0\}/gu, literal);
      imports.push({ specifier: resolved, kind: 'dynamic' });
    }
  }

  // import.meta.glob / globEager - accepts a string or array; both eager and lazy modes count
  if (ts.isCallExpression(node) && isImportMetaGlob(node.expression) && node.arguments.length > 0) {
    const first = node.arguments[0];
    if (first) {
      const patterns = collectGlobPatterns(first);
      const globOptions = collectGlobOptions(
        node.arguments[1],
        isImportMetaGlobEager(node.expression),
      );
      for (const p of patterns) {
        imports.push({
          specifier: p,
          kind: 'dynamic',
          pattern: 'glob',
          confidence: globOptions.eager ? 'medium' : 'low',
          approximate: true,
          globEager: globOptions.eager,
          ...(globOptions.importName ? { globImport: globOptions.importName } : {}),
        });
      }
    }
  }

  if (ts.isVariableStatement(node) && hasExportModifier(node)) {
    for (const decl of node.declarationList.declarations) collectBindingNames(decl.name, exports);
  } else if (
    (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
    hasExportModifier(node)
  ) {
    if (node.name) exports.add(node.name.text);
    else if (hasDefaultModifier(node)) exports.add('default');
  } else if (
    (ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node)) &&
    hasExportModifier(node)
  ) {
    exports.add(node.name.text);
  } else if (ts.isExportAssignment(node)) {
    exports.add('default');
  }

  ts.forEachChild(node, (child) =>
    visit(child, sf, imports, exports, callees, markDefineStore, loaders),
  );
}

function literalText(node: ts.Node): string | null {
  if (ts.isStringLiteralLike(node)) return node.text;
  return null;
}

// matches `import.meta.glob`, `import.meta.globEager`, and bracket variants
function isImportMetaGlob(expr: ts.Expression): boolean {
  const name = importMetaPropertyName(expr);
  return name === 'glob' || name === 'globEager';
}

function isImportMetaGlobEager(expr: ts.Expression): boolean {
  return importMetaPropertyName(expr) === 'globEager';
}

function importMetaPropertyName(expr: ts.Expression): string | null {
  if (!ts.isPropertyAccessExpression(expr) && !ts.isElementAccessExpression(expr)) return null;
  const obj = expr.expression;
  if (!ts.isMetaProperty(obj)) return null;
  if (obj.keywordToken !== ts.SyntaxKind.ImportKeyword) return null;
  if (obj.name.text !== 'meta') return null;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  return literalText(expr.argumentExpression);
}

function collectGlobPatterns(node: ts.Node): string[] {
  const out: string[] = [];
  if (ts.isStringLiteralLike(node)) {
    out.push(node.text);
  } else if (ts.isArrayLiteralExpression(node)) {
    for (const el of node.elements) {
      const t = literalText(el);
      if (t !== null) out.push(t);
    }
  }
  return out;
}

function collectGlobOptions(
  node: ts.Node | undefined,
  legacyEager = false,
): { eager: boolean; importName?: string } {
  if (!node || !ts.isObjectLiteralExpression(node)) return { eager: legacyEager };
  let eager = legacyEager;
  let importName: string | undefined;
  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = propertyNameText(prop.name);
    if (key === 'eager' && prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
      eager = true;
    } else if (key === 'import') {
      const literal = literalText(prop.initializer);
      if (literal !== null) importName = literal;
    }
  }
  return importName ? { eager, importName } : { eager };
}

function propertyNameText(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
  return null;
}

// extracts the static prefix from `./mfes/${name}` or `'./mfes/' + name`.
// buildGraph uses it for prefix expansion of MFE-style loaders.
function staticPrefix(node: ts.Node): string | null {
  if (ts.isTemplateExpression(node)) {
    return node.head.text;
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticPrefix(node.left);
    if (left !== null) return left;
    return null;
  }
  if (ts.isStringLiteralLike(node)) {
    return node.text;
  }
  return null;
}

function classifyImport(node: ts.ImportDeclaration): RawImport['kind'] {
  if (node.importClause?.isTypeOnly) return 'type-only';
  const clause = node.importClause;
  if (!clause) return 'side-effect';
  const namedBindings = clause.namedBindings;
  if (
    namedBindings &&
    ts.isNamedImports(namedBindings) &&
    !clause.name &&
    namedBindings.elements.length > 0 &&
    namedBindings.elements.every((el) => el.isTypeOnly)
  ) {
    return 'type-only';
  }
  return 'static';
}

function hasExportModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node)
    ? !!ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    : false;
}

function hasDefaultModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node)
    ? !!ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
    : false;
}

function collectBindingNames(name: ts.BindingName, out: Set<string>): void {
  if (ts.isIdentifier(name)) {
    out.add(name.text);
    return;
  }
  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const el of name.elements) {
      if (ts.isBindingElement(el)) collectBindingNames(el.name, out);
    }
  }
}

// Directive prologue: a sequence of plain string-literal expression statements
// at the top of the file (and the top of each function body, but for our
// purposes the top of the file is enough). Stops at the first non-directive.
function readDirectivePrologue(sf: ts.SourceFile): ('use server' | 'use client')[] {
  const out: ('use server' | 'use client')[] = [];
  for (const stmt of sf.statements) {
    if (
      ts.isExpressionStatement(stmt) &&
      ts.isStringLiteralLike(stmt.expression) &&
      !stmt.expression.getText(sf).startsWith('`')
    ) {
      const text = stmt.expression.text;
      if (text === 'use server' || text === 'use client') {
        out.push(text);
        continue;
      }
      // Other prologue strings (e.g. 'use strict') are tolerated.
      continue;
    }
    break;
  }
  return out;
}

function countLines(content: string): number {
  if (content.length === 0) return 0;
  let n = 1;
  for (let i = 0; i < content.length; i++) if (content[i] === '\n') n++;
  return n;
}
