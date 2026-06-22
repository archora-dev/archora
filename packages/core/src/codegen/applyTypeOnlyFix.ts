import ts from 'typescript';

/**
 * Pure codegen for the `type-only-candidate` insight (see
 * `analyzer/typeOnlyCandidates.ts`). Detection finds an import edge where every
 * usage of the imported binding(s) is in a type position; this module rewrites
 * the import to drop the runtime edge.
 *
 * Two transformations:
 *   - all bindings of an import are type-only → flip the declaration to
 *     `import type { ... }`.
 *   - only some bindings are type-only → split into two declarations (one
 *     value, one `import type`) on the same module specifier. We deliberately
 *     do NOT use the per-specifier `type` modifier (`import { A, type B }`),
 *     because `verbatimModuleSyntax` projects accept either form and a hard
 *     split is the lowest-common-denominator that survives older TS configs.
 *
 * Vue/Svelte SFCs: we locate the first `<script>`/`<script setup>` block in
 * raw text and operate on the script body, then splice the patched script
 * back into the SFC at the original offset.
 */

export type ApplyTargetLanguage = 'ts' | 'js' | 'vue' | 'svelte';

export interface TextHunk {
  /** Inclusive start offset in the original `content`. */
  start: number;
  /** Exclusive end offset in the original `content`. */
  end: number;
  before: string;
  after: string;
}

export interface ApplyTypeOnlyFixInput {
  filePath: string;
  content: string;
  language: ApplyTargetLanguage;
  /** Module specifier of the import to rewrite, e.g. `'./b'`. */
  specifier: string;
  /** Names that should move to a type-only import. Subset of the import's bindings. */
  bindings: string[];
}

export interface ApplyTypeOnlyFixResult {
  /** Full file content after the patch. */
  patchedContent: string;
  /** Single-region textual edit (or empty when nothing changed). */
  hunks: TextHunk[];
}

export class ApplyTypeOnlyFixError extends Error {
  readonly code:
    | 'import-not-found'
    | 'already-type-only'
    | 'no-bindings-to-move'
    | 'unsupported-shape'
    | 'no-script-block';
  constructor(code: ApplyTypeOnlyFixError['code'], message: string) {
    super(message);
    this.name = 'ApplyTypeOnlyFixError';
    this.code = code;
  }
}

export function applyTypeOnlyFix(input: ApplyTypeOnlyFixInput): ApplyTypeOnlyFixResult {
  const { content, language } = input;
  if (language === 'vue' || language === 'svelte') {
    return applyToSfc(input);
  }
  const hunk = computeImportRewrite(content, 0, input);
  return { patchedContent: spliceHunk(content, hunk), hunks: [hunk] };
}

// ---- SFC ------------------------------------------------------------------

const SCRIPT_OPEN_RE = /<\s*script\b[^>]*>/iu;
const SCRIPT_CLOSE_RE = /<\/\s*script\s*>/iu;

interface ScriptBlock {
  bodyStart: number;
  bodyEnd: number;
  body: string;
}

function findScriptBlocks(sfc: string): ScriptBlock[] {
  const blocks: ScriptBlock[] = [];
  let cursor = 0;
  while (cursor < sfc.length) {
    const open = SCRIPT_OPEN_RE.exec(sfc.slice(cursor));
    if (!open) break;
    const tagStart = cursor + open.index;
    const bodyStart = tagStart + open[0].length;
    const close = SCRIPT_CLOSE_RE.exec(sfc.slice(bodyStart));
    if (!close) break;
    const bodyEnd = bodyStart + close.index;
    blocks.push({ bodyStart, bodyEnd, body: sfc.slice(bodyStart, bodyEnd) });
    cursor = bodyEnd + close[0].length;
  }
  return blocks;
}

function applyToSfc(input: ApplyTypeOnlyFixInput): ApplyTypeOnlyFixResult {
  const blocks = findScriptBlocks(input.content);
  if (blocks.length === 0) {
    throw new ApplyTypeOnlyFixError('no-script-block', `no <script> block in ${input.filePath}`);
  }
  // Find the block that actually contains the matching import.
  for (const block of blocks) {
    try {
      const hunk = computeImportRewrite(block.body, block.bodyStart, input);
      return { patchedContent: spliceHunk(input.content, hunk), hunks: [hunk] };
    } catch (e) {
      if (e instanceof ApplyTypeOnlyFixError && e.code === 'import-not-found') continue;
      throw e;
    }
  }
  throw new ApplyTypeOnlyFixError(
    'import-not-found',
    `import "${input.specifier}" not found in <script> blocks of ${input.filePath}`,
  );
}

// ---- core rewrite ---------------------------------------------------------

interface ImportShape {
  defaultName: string | null;
  namespaceName: string | null;
  /** Named bindings that are NOT already `import { type X }` in source. */
  namedValueBindings: string[];
  /** Named bindings already marked `type` per-specifier - left untouched. */
  namedTypeBindings: string[];
}

function computeImportRewrite(
  script: string,
  scriptOffsetInFile: number,
  input: ApplyTypeOnlyFixInput,
): TextHunk {
  const sf = ts.createSourceFile(
    input.filePath,
    script,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(input.filePath, input.language),
  );

  let decl: ts.ImportDeclaration | null = null;
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const lit = stmt.moduleSpecifier;
    if (!ts.isStringLiteralLike(lit)) continue;
    if (lit.text !== input.specifier) continue;
    decl = stmt;
    break;
  }
  if (!decl) {
    throw new ApplyTypeOnlyFixError(
      'import-not-found',
      `import "${input.specifier}" not found in ${input.filePath}`,
    );
  }
  const clause = decl.importClause;
  if (!clause) {
    throw new ApplyTypeOnlyFixError(
      'unsupported-shape',
      `side-effect import has no bindings: ${input.specifier}`,
    );
  }
  if (clause.isTypeOnly) {
    throw new ApplyTypeOnlyFixError(
      'already-type-only',
      `import "${input.specifier}" is already type-only`,
    );
  }

  const shape = readShape(clause);
  const moveSet = new Set(input.bindings);

  // Sanity: every name we're asked to move must exist in the shape.
  const allNames = new Set<string>();
  if (shape.defaultName) allNames.add(shape.defaultName);
  if (shape.namespaceName) allNames.add(shape.namespaceName);
  for (const n of shape.namedValueBindings) allNames.add(n);
  const missing = [...moveSet].filter((n) => !allNames.has(n));
  if (missing.length > 0) {
    throw new ApplyTypeOnlyFixError(
      'no-bindings-to-move',
      `bindings not present in import: ${missing.join(', ')}`,
    );
  }

  // Mixed default + namespace is a TS rarity (`import D, * as N`); we don't
  // try to be clever. Bail rather than emit something that may not parse.
  if (shape.defaultName && shape.namespaceName) {
    throw new ApplyTypeOnlyFixError(
      'unsupported-shape',
      `combined default+namespace import is unsupported: ${input.specifier}`,
    );
  }

  const start = decl.getStart(sf);
  const end = decl.getEnd();
  const before = script.slice(start, end);
  const lineStart = script.lastIndexOf('\n', start - 1) + 1;
  const leading = script.slice(lineStart, start).match(/^[\t ]*/u)?.[0] ?? '';
  const quote = quoteOf(decl.moduleSpecifier.getText(sf));
  const semi = before.trimEnd().endsWith(';') ? ';' : '';

  const after = renderSplit(shape, moveSet, input.specifier, quote, semi, leading);

  return {
    start: scriptOffsetInFile + start,
    end: scriptOffsetInFile + end,
    before,
    after,
  };
}

function readShape(clause: ts.ImportClause): ImportShape {
  const out: ImportShape = {
    defaultName: clause.name ? clause.name.text : null,
    namespaceName: null,
    namedValueBindings: [],
    namedTypeBindings: [],
  };
  if (clause.namedBindings) {
    if (ts.isNamespaceImport(clause.namedBindings)) {
      out.namespaceName = clause.namedBindings.name.text;
    } else if (ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) {
        const name = el.name.text;
        if (el.isTypeOnly) out.namedTypeBindings.push(name);
        else out.namedValueBindings.push(name);
      }
    }
  }
  return out;
}

function renderSplit(
  shape: ImportShape,
  moveSet: Set<string>,
  specifier: string,
  quote: string,
  semi: string,
  leading: string,
): string {
  // Partition: stay (value side), move (type side).
  const stayDefault =
    shape.defaultName && !moveSet.has(shape.defaultName) ? shape.defaultName : null;
  const moveDefault =
    shape.defaultName && moveSet.has(shape.defaultName) ? shape.defaultName : null;
  const stayNs =
    shape.namespaceName && !moveSet.has(shape.namespaceName) ? shape.namespaceName : null;
  const moveNs =
    shape.namespaceName && moveSet.has(shape.namespaceName) ? shape.namespaceName : null;
  const stayNamed = shape.namedValueBindings.filter((n) => !moveSet.has(n));
  const moveNamed = shape.namedValueBindings.filter((n) => moveSet.has(n));

  // Existing per-specifier `type`-named bindings are preserved as-is on the
  // value side (TS allows mixing `import { type T, V }`); they were already
  // type-only so we don't move them.
  const stayNamedWithExisting = [...stayNamed, ...shape.namedTypeBindings.map((n) => `type ${n}`)];

  const stmts: string[] = [];
  // Value-side statements
  if (stayDefault || stayNs || stayNamedWithExisting.length > 0) {
    stmts.push(
      ...renderSide(stayDefault, stayNs, stayNamedWithExisting, false, specifier, quote, semi),
    );
  }
  // Type-side statements
  if (moveDefault || moveNs || moveNamed.length > 0) {
    stmts.push(...renderSide(moveDefault, moveNs, moveNamed, true, specifier, quote, semi));
  }
  if (stmts.length === 0) {
    // Pathological: nothing to keep, nothing to move. Re-emit declaration as-is would be
    // a no-op; surface as no-bindings rather than silently corrupting the file.
    throw new ApplyTypeOnlyFixError('no-bindings-to-move', `nothing to keep or move`);
  }
  return stmts.join(`\n${leading}`);
}

/**
 * Render one side (value or type) of the split. `import type` does not allow
 * default + named in the same statement, so we emit two when needed.
 */
function renderSide(
  defaultName: string | null,
  namespaceName: string | null,
  named: string[],
  asType: boolean,
  specifier: string,
  quote: string,
  semi: string,
): string[] {
  const kw = asType ? 'import type' : 'import';
  const tail = ` from ${quote}${specifier}${quote}${semi}`;
  const out: string[] = [];

  // namespace: must be alone (TS forbids default + namespace)
  if (namespaceName) {
    out.push(`${kw} * as ${namespaceName}${tail}`);
  }
  if (asType) {
    // `import type` - default and named cannot mix. Emit separately.
    if (defaultName) out.push(`${kw} ${defaultName}${tail}`);
    if (named.length > 0) out.push(`${kw} { ${named.join(', ')} }${tail}`);
  } else {
    // value side - default and named can mix in one statement.
    if (defaultName && named.length > 0) {
      out.push(`${kw} ${defaultName}, { ${named.join(', ')} }${tail}`);
    } else if (defaultName) {
      out.push(`${kw} ${defaultName}${tail}`);
    } else if (named.length > 0) {
      out.push(`${kw} { ${named.join(', ')} }${tail}`);
    }
  }
  return out;
}

function quoteOf(rawSpecifier: string): string {
  const ch = rawSpecifier.charAt(0);
  return ch === '"' || ch === "'" || ch === '`' ? ch : "'";
}

function spliceHunk(content: string, hunk: TextHunk): string {
  return content.slice(0, hunk.start) + hunk.after + content.slice(hunk.end);
}

const KIND_BY_EXT: Record<string, ts.ScriptKind> = {
  ts: ts.ScriptKind.TS,
  tsx: ts.ScriptKind.TSX,
  js: ts.ScriptKind.JS,
  jsx: ts.ScriptKind.JSX,
  mjs: ts.ScriptKind.JS,
  cjs: ts.ScriptKind.JS,
};

function scriptKindFor(filePath: string, language: ApplyTargetLanguage): ts.ScriptKind {
  if (language === 'vue' || language === 'svelte') return ts.ScriptKind.TS;
  const ext = filePath.slice(filePath.lastIndexOf('.') + 1).toLowerCase();
  return KIND_BY_EXT[ext] ?? ts.ScriptKind.TS;
}
