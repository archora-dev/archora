// Pure parser for the output of:
//
//   git log --no-merges --numstat --date=iso-strict \
//           --pretty=format:'__FS_COMMIT__%x01%H%x01%h%x01%aN%x01%aE%x01%aI%x01%s'
//
// We use a sentinel (`__FS_COMMIT__`) at the start of each commit's header
// line so we can split the output without worrying about newlines in
// subjects (`%s` is single-line by definition, but renames in --numstat
// without `-z` produce path strings of the form "{old => new}" which we
// handle directly).
//
// Each commit yields:
//
//   __FS_COMMIT__<SOH>sha<SOH>short<SOH>name<SOH>email<SOH>date<SOH>subject\n
//   <numstat>\t<numstat>\t<path>\n           (zero or more)
//   ...

import type { GitCommit, GitFileChange } from './types';

const COMMIT_SENTINEL = '__FS_COMMIT__';
const HEADER_SEP = '\x01';
const NUMSTAT_RE = /^(\d+|-)\t(\d+|-)\t(.+)$/u;

export function parseGitLog(raw: string): GitCommit[] {
  if (!raw) return [];
  const out: GitCommit[] = [];
  // Split on the sentinel; the first segment is empty (raw starts with it).
  const segments = raw.split(COMMIT_SENTINEL);
  for (const segment of segments) {
    if (!segment) continue;
    const newlineIdx = segment.indexOf('\n');
    const headerLine = newlineIdx === -1 ? segment : segment.slice(0, newlineIdx);
    const header = parseHeader(headerLine);
    if (!header) continue;
    const changes: GitFileChange[] = [];
    if (newlineIdx !== -1) {
      const tail = segment.slice(newlineIdx + 1);
      for (const line of tail.split('\n')) {
        if (!line) continue;
        const change = parseNumstatLine(line);
        if (change) changes.push(change);
      }
    }
    out.push({ ...header, changes });
  }
  return out;
}

interface ParsedHeader {
  sha: string;
  shortSha: string;
  authorName: string;
  author: string;
  authoredAt: string;
  subject: string;
}

function parseHeader(line: string): ParsedHeader | null {
  // Leading HEADER_SEP comes from the `%x01` in the format string after the
  // sentinel. Trim it and split.
  const trimmed = line.startsWith(HEADER_SEP) ? line.slice(1) : line;
  const parts = trimmed.split(HEADER_SEP);
  if (parts.length < 6) return null;
  const [sha, shortSha, authorName, email, authoredAt, ...rest] = parts;
  if (!sha || sha.length < 7) return null;
  return {
    sha,
    shortSha: shortSha ?? sha.slice(0, 7),
    authorName: authorName ?? '',
    author: (email ?? '').toLowerCase(),
    authoredAt: authoredAt ?? '',
    subject: rest.join(HEADER_SEP),
  };
}

const RENAME_PATH_RE = /^(.*)\{([^{}]*?)\s*=>\s*([^{}]*?)\}(.*)$/u;

function parseNumstatLine(line: string): GitFileChange | null {
  const m = NUMSTAT_RE.exec(line);
  if (!m) return null;
  const rawPath = m[3]!;
  const added = m[1] === '-' ? null : Number(m[1]);
  const removed = m[2] === '-' ? null : Number(m[2]);
  // Rename: "src/old/file.ts => src/new/file.ts" or "src/{old => new}/file.ts".
  if (rawPath.includes(' => ')) {
    const expanded = expandRename(rawPath);
    if (expanded) {
      return { path: expanded.to, renamedFrom: expanded.from, added, removed };
    }
  }
  return { path: rawPath, added, removed };
}

interface ExpandedRename {
  from: string;
  to: string;
}

export function expandRename(spec: string): ExpandedRename | null {
  const braced = RENAME_PATH_RE.exec(spec);
  if (braced) {
    const [, prefix = '', oldPart = '', newPart = '', suffix = ''] = braced;
    const from = collapseSlashes(`${prefix}${oldPart}${suffix}`);
    const to = collapseSlashes(`${prefix}${newPart}${suffix}`);
    if (!from || !to) return null;
    return { from, to };
  }
  // Whole-path rename: "old/path => new/path".
  const arrowIdx = spec.indexOf(' => ');
  if (arrowIdx !== -1) {
    return {
      from: spec.slice(0, arrowIdx),
      to: spec.slice(arrowIdx + ' => '.length),
    };
  }
  return null;
}

function collapseSlashes(p: string): string {
  // Brace expansions like `src/{ => new}/foo.ts` produce `src//foo.ts` — fold
  // doubled slashes that result from empty segments. We preserve a single
  // leading slash if it was present.
  return p.replace(/\/+/gu, '/');
}
