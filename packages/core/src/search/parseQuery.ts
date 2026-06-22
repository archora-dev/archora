// Parser for the global-search query string. Supports the prefixes `path:`,
// `export:`, `import:`, `kind:`, separated by spaces; anything without a
// prefix is a free-text token that the ranker uses against both path and
// exports at once.
//
// Several prefixes in one string = AND intersection
// (`kind:component path:auth` → component modules whose path contains auth).
// Several identical prefixes = OR within a key
// (`kind:component kind:composable` → component OR composable).
//
// Prefix values may use quotes so spaces don't split the token:
// `path:"src/feature x"`. Quotes inside a value are not supported — this is a
// query string, not a shell parser.

export type SearchPrefix = 'path' | 'export' | 'import' | 'kind';

export interface ParsedQuery {
  /** Free tokens without a prefix. Empty array if all are prefixed. */
  free: string[];
  /** Values grouped by key. Empty object → no prefixes. */
  prefixes: Partial<Record<SearchPrefix, string[]>>;
}

const PREFIXES: ReadonlySet<string> = new Set(['path', 'export', 'import', 'kind']);

export function parseQuery(input: string): ParsedQuery {
  const result: ParsedQuery = { free: [], prefixes: {} };
  const tokens = tokenize(input);
  for (const tok of tokens) {
    const colon = tok.indexOf(':');
    if (colon > 0) {
      const key = tok.slice(0, colon).toLowerCase();
      const value = tok.slice(colon + 1);
      if (PREFIXES.has(key) && value.length > 0) {
        const k = key as SearchPrefix;
        const bucket = (result.prefixes[k] ??= []);
        bucket.push(value);
        continue;
      }
    }
    if (tok.length > 0) result.free.push(tok);
  }
  return result;
}

/**
 * Tokenize while respecting double-quoted spans so users can search for
 * paths/exports containing spaces (rare but real, e.g. fixture names).
 */
function tokenize(input: string): string[] {
  const out: string[] = [];
  let buf = '';
  let inQuotes = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (ch === ' ' || ch === '\t' || ch === '\n')) {
      if (buf.length > 0) {
        out.push(buf);
        buf = '';
      }
      continue;
    }
    buf += ch;
  }
  if (buf.length > 0) out.push(buf);
  return out;
}

export function isEmpty(q: ParsedQuery): boolean {
  return q.free.length === 0 && Object.keys(q.prefixes).length === 0;
}
