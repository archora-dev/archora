import ts from 'typescript';
import type { FileSource } from './fileSource';
import type { ModuleId, ModuleLanguage, ModuleNode } from './types';

/**
 * A feedback edge whose imported binding(s) are referenced only in type
 * positions in the source file. Rewriting the import as `import type {...}`
 * (or marking individual specifiers with `type`) drops the edge from cycle
 * detection without any architectural change - the cheapest possible fix.
 */
export interface TypeOnlyCandidate {
  from: ModuleId;
  to: ModuleId;
  specifier: string;
  /** Names from the import that can safely be moved to `import type`. */
  bindings: string[];
}

interface FeedbackEdge {
  from: ModuleId;
  to: ModuleId;
  specifier: string;
}

/**
 * For each feedback edge, parse the source file and walk usages of the
 * imported bindings. Emit a candidate iff every usage is in a type position
 * (and the import isn't already type-only).
 *
 * Vue/Svelte SFCs are read raw and the script blocks are stitched together;
 * we don't need symbol resolution, just AST positions, so a one-shot
 * `ts.createSourceFile` per file is enough.
 */
export async function findTypeOnlyCandidates(args: {
  edges: FeedbackEdge[];
  source: FileSource;
  modules: ModuleNode[];
}): Promise<TypeOnlyCandidate[]> {
  const { edges, source, modules } = args;
  if (edges.length === 0) return [];

  const langById = new Map(modules.map((m) => [m.id, m.language]));
  const byFrom = new Map<ModuleId, FeedbackEdge[]>();
  for (const e of edges) {
    if (!byFrom.has(e.from)) byFrom.set(e.from, []);
    byFrom.get(e.from)!.push(e);
  }

  const candidates: TypeOnlyCandidate[] = [];
  for (const [from, fromEdges] of byFrom) {
    const lang = langById.get(from);
    if (!lang) continue;
    let content: string;
    try {
      content = await source.read(from);
    } catch {
      continue;
    }
    const script = lang === 'vue' || lang === 'svelte' ? extractScripts(content) : content;
    // setParentNodes=true: isInTypePosition walks node.parent up to a type node
    const sf = ts.createSourceFile(
      from,
      script,
      ts.ScriptTarget.Latest,
      true,
      scriptKindFor(from, lang),
    );

    for (const edge of fromEdges) {
      const usage = inspectImport(sf, edge.specifier);
      if (usage && usage.allTypes && usage.bindings.length > 0) {
        candidates.push({
          from: edge.from,
          to: edge.to,
          specifier: edge.specifier,
          bindings: usage.bindings,
        });
      }
    }
  }
  return candidates;
}

const KIND_BY_EXT: Record<string, ts.ScriptKind> = {
  ts: ts.ScriptKind.TS,
  tsx: ts.ScriptKind.TSX,
  js: ts.ScriptKind.JS,
  jsx: ts.ScriptKind.JSX,
  mjs: ts.ScriptKind.JS,
  cjs: ts.ScriptKind.JS,
};

function scriptKindFor(relPath: ModuleId, lang: ModuleLanguage): ts.ScriptKind {
  if (lang === 'vue' || lang === 'svelte') return ts.ScriptKind.TS;
  const ext = relPath.slice(relPath.lastIndexOf('.') + 1).toLowerCase();
  return KIND_BY_EXT[ext] ?? ts.ScriptKind.TS;
}

interface ImportUsage {
  bindings: string[];
  allTypes: boolean;
}

function inspectImport(sf: ts.SourceFile, specifier: string): ImportUsage | null {
  // collect import declarations matching the specifier
  let importDecl: ts.ImportDeclaration | null = null;
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const lit = stmt.moduleSpecifier;
    if (!ts.isStringLiteralLike(lit)) continue;
    if (lit.text !== specifier) continue;
    // already type-only at the declaration level - no further fix possible
    if (stmt.importClause?.isTypeOnly) return null;
    importDecl = stmt;
    break;
  }
  if (!importDecl || !importDecl.importClause) return null;

  // collect bindings to check; skip any that are declared `type` already
  const names: string[] = [];
  const clause = importDecl.importClause;
  if (clause.name) names.push(clause.name.text);
  if (clause.namedBindings) {
    if (ts.isNamespaceImport(clause.namedBindings)) {
      names.push(clause.namedBindings.name.text);
    } else if (ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) {
        if (el.isTypeOnly) continue;
        names.push(el.name.text);
      }
    }
  }
  if (names.length === 0) return null;

  const nameSet = new Set(names);
  const seen = new Set<string>();
  let allTypes = true;
  let anyUsed = false;

  const visit = (node: ts.Node): void => {
    if (!allTypes) return;
    if (ts.isIdentifier(node) && nameSet.has(node.text) && !isImportSpecifierNameNode(node)) {
      anyUsed = true;
      seen.add(node.text);
      if (!isInTypePosition(node)) {
        allTypes = false;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (!anyUsed) return null;
  // all referenced bindings are types; report only the bindings actually used
  return { bindings: [...seen].sort(), allTypes };
}

// the identifier inside `import { X }` is itself a name node, not a usage
function isImportSpecifierNameNode(id: ts.Identifier): boolean {
  const n: ts.Node | undefined = id.parent;
  if (!n) return false;
  if (ts.isImportSpecifier(n) && n.name === id) return true;
  if (ts.isImportClause(n) && n.name === id) return true;
  if (ts.isNamespaceImport(n) && n.name === id) return true;
  return false;
}

function isInTypePosition(id: ts.Identifier): boolean {
  let n: ts.Node | undefined = id.parent;
  while (n) {
    if (ts.isHeritageClause(n)) {
      // class `extends Base` needs Base as a runtime constructor; only
      // `interface extends T` and `class implements T` are type-only.
      if (n.token === ts.SyntaxKind.ImplementsKeyword) return true;
      if (n.parent && ts.isInterfaceDeclaration(n.parent)) return true;
      return false;
    }
    if (
      ts.isTypeReferenceNode(n) ||
      ts.isTypeAliasDeclaration(n) ||
      ts.isInterfaceDeclaration(n) ||
      ts.isTypeQueryNode(n) ||
      ts.isImportTypeNode(n) ||
      ts.isTypePredicateNode(n) ||
      ts.isTypeOperatorNode(n) ||
      ts.isIndexedAccessTypeNode(n) ||
      ts.isMappedTypeNode(n) ||
      ts.isConditionalTypeNode(n) ||
      ts.isUnionTypeNode(n) ||
      ts.isIntersectionTypeNode(n) ||
      ts.isParenthesizedTypeNode(n) ||
      ts.isLiteralTypeNode(n) ||
      ts.isTupleTypeNode(n) ||
      ts.isArrayTypeNode(n) ||
      ts.isTypeLiteralNode(n) ||
      ts.isFunctionTypeNode(n) ||
      ts.isConstructorTypeNode(n)
    ) {
      // typeQuery (`typeof X`) needs X to be a value at runtime, so it's NOT
      // safe to move to `import type` - bail out.
      if (ts.isTypeQueryNode(n)) return false;
      return true;
    }
    // satisfies / as expressions: the right-hand side is a type
    if ((ts.isAsExpression(n) || ts.isSatisfiesExpression(n)) && isAncestorTypeBranch(n, id)) {
      return true;
    }
    n = n.parent;
  }
  return false;
}

function isAncestorTypeBranch(
  n: ts.AsExpression | ts.SatisfiesExpression,
  id: ts.Identifier,
): boolean {
  // walk up from id; if we cross n.expression we're on the value side
  let cur: ts.Node = id;
  while (cur && cur !== n) {
    if (cur === n.expression) return false;
    cur = cur.parent;
  }
  return true;
}

const SCRIPT_RE = /<\s*script\b[^>]*>([\s\S]*?)<\/\s*script\s*>/giu;

function extractScripts(sfc: string): string {
  const out: string[] = [];
  for (const m of sfc.matchAll(SCRIPT_RE)) out.push(m[1] ?? '');
  return out.join('\n');
}
