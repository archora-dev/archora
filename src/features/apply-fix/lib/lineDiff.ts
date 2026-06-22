/**
 * Minimal LCS-based line diff. Sufficient for the apply-fix preview, where
 * the change region is one or two import statements - we don't need patience
 * diff or a full Myers implementation. O(n*m) memory but n+m is < 30 lines
 * for the slice we feed in.
 */
export type DiffOp = 'eq' | 'add' | 'del';

export interface DiffRow {
  /** Left-side line text (null when this is an addition). */
  left: string | null;
  /** Right-side line text (null when this is a deletion). */
  right: string | null;
  op: DiffOp;
  /** 1-based line number on the original side, or null. */
  leftNo: number | null;
  /** 1-based line number on the patched side, or null. */
  rightNo: number | null;
}

export function diffLines(a: string, b: string): DiffRow[] {
  const left = a.split('\n');
  const right = b.split('\n');
  const n = left.length;
  const m = right.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const a1 = dp[i + 1]?.[j + 1] ?? 0;
      const a2 = dp[i + 1]?.[j] ?? 0;
      const a3 = dp[i]?.[j + 1] ?? 0;
      const row = dp[i]!;
      row[j] = left[i] === right[j] ? a1 + 1 : Math.max(a2, a3);
    }
  }
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (left[i] === right[j]) {
      rows.push({
        left: left[i] ?? '',
        right: right[j] ?? '',
        op: 'eq',
        leftNo: i + 1,
        rightNo: j + 1,
      });
      i++;
      j++;
      continue;
    }
    const down = dp[i + 1]?.[j] ?? 0;
    const right2 = dp[i]?.[j + 1] ?? 0;
    if (down >= right2) {
      rows.push({ left: left[i] ?? '', right: null, op: 'del', leftNo: i + 1, rightNo: null });
      i++;
    } else {
      rows.push({ left: null, right: right[j] ?? '', op: 'add', leftNo: null, rightNo: j + 1 });
      j++;
    }
  }
  while (i < n) {
    rows.push({ left: left[i] ?? '', right: null, op: 'del', leftNo: i + 1, rightNo: null });
    i++;
  }
  while (j < m) {
    rows.push({ left: null, right: right[j] ?? '', op: 'add', leftNo: null, rightNo: j + 1 });
    j++;
  }
  return rows;
}

/**
 * Trim equal context to `±contextLines` around any change. Empty diff (no
 * change rows) returns an empty array.
 */
export function withContext(rows: DiffRow[], contextLines = 3): DiffRow[] {
  const keep = new Array<boolean>(rows.length).fill(false);
  let hasChange = false;
  for (let k = 0; k < rows.length; k++) {
    if (rows[k]!.op !== 'eq') {
      hasChange = true;
      const lo = Math.max(0, k - contextLines);
      const hi = Math.min(rows.length - 1, k + contextLines);
      for (let q = lo; q <= hi; q++) keep[q] = true;
    }
  }
  if (!hasChange) return [];
  return rows.filter((_, idx) => keep[idx]);
}

/** Build a unified-diff `.patch` snippet for the "Copy patch" action. */
export function buildUnifiedPatch(
  filePath: string,
  before: string,
  after: string,
  contextLines = 3,
): string {
  const rows = withContext(diffLines(before, after), contextLines);
  if (rows.length === 0) return '';
  const lines: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`];
  let leftStart: number | null = null;
  let rightStart: number | null = null;
  let leftCount = 0;
  let rightCount = 0;
  const body: string[] = [];
  for (const r of rows) {
    if (r.op === 'eq') {
      if (leftStart === null) leftStart = r.leftNo ?? 1;
      if (rightStart === null) rightStart = r.rightNo ?? 1;
      body.push(` ${r.left ?? ''}`);
      leftCount++;
      rightCount++;
    } else if (r.op === 'del') {
      if (leftStart === null) leftStart = r.leftNo ?? 1;
      if (rightStart === null) rightStart = r.rightNo ?? 1;
      body.push(`-${r.left ?? ''}`);
      leftCount++;
    } else {
      if (leftStart === null) leftStart = r.leftNo ?? 1;
      if (rightStart === null) rightStart = r.rightNo ?? 1;
      body.push(`+${r.right ?? ''}`);
      rightCount++;
    }
  }
  lines.push(`@@ -${leftStart ?? 1},${leftCount} +${rightStart ?? 1},${rightCount} @@`);
  lines.push(...body);
  return lines.join('\n') + '\n';
}
