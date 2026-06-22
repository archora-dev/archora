import { describe, expect, it } from 'vitest';
import { expandRename, parseGitLog } from '../parseGitLog';

const SOH = '\x01';

function commitHeader(
  sha: string,
  short: string,
  name: string,
  email: string,
  date: string,
  subject: string,
): string {
  return `__FS_COMMIT__${SOH}${sha}${SOH}${short}${SOH}${name}${SOH}${email}${SOH}${date}${SOH}${subject}`;
}

describe('parseGitLog', () => {
  it('parses a single commit with two file changes', () => {
    const raw =
      commitHeader(
        'a'.repeat(40),
        'aaaaaaa',
        'Alice',
        'alice@example.com',
        '2026-05-01T10:00:00+03:00',
        'feat: x',
      ) + '\n10\t2\tsrc/a.ts\n3\t0\tsrc/b.ts';
    const commits = parseGitLog(raw);
    expect(commits).toHaveLength(1);
    expect(commits[0]?.sha).toBe('a'.repeat(40));
    expect(commits[0]?.author).toBe('alice@example.com');
    expect(commits[0]?.subject).toBe('feat: x');
    expect(commits[0]?.changes).toEqual([
      { path: 'src/a.ts', added: 10, removed: 2 },
      { path: 'src/b.ts', added: 3, removed: 0 },
    ]);
  });

  it('lowercases author email', () => {
    const raw =
      commitHeader(
        'b'.repeat(40),
        'bbbbbbb',
        'Bob',
        'BOB@Example.COM',
        '2026-05-02T10:00:00+03:00',
        'fix',
      ) + '\n1\t1\tsrc/x.ts';
    expect(parseGitLog(raw)[0]?.author).toBe('bob@example.com');
  });

  it('parses two consecutive commits', () => {
    const raw =
      commitHeader('a'.repeat(40), 'aaaaaaa', 'A', 'a@x', '2026-05-01T10:00:00+03:00', 's1') +
      '\n1\t0\tsrc/a.ts' +
      commitHeader('b'.repeat(40), 'bbbbbbb', 'B', 'b@x', '2026-05-02T10:00:00+03:00', 's2') +
      '\n2\t3\tsrc/b.ts';
    const commits = parseGitLog(raw);
    expect(commits).toHaveLength(2);
    expect(commits[0]?.subject).toBe('s1');
    expect(commits[1]?.subject).toBe('s2');
  });

  it('treats binary-file diffs (-) as null lines', () => {
    const raw =
      commitHeader('c'.repeat(40), 'ccccccc', 'C', 'c@x', '2026-05-03T10:00:00+03:00', 'bin') +
      '\n-\t-\tassets/logo.png';
    expect(parseGitLog(raw)[0]?.changes).toEqual([
      { path: 'assets/logo.png', added: null, removed: null },
    ]);
  });

  it('handles whole-path rename "old => new"', () => {
    const raw =
      commitHeader('d'.repeat(40), 'ddddddd', 'D', 'd@x', '2026-05-04T10:00:00+03:00', 'mv') +
      '\n5\t5\tsrc/old/x.ts => src/new/x.ts';
    const c = parseGitLog(raw)[0]?.changes[0];
    expect(c).toEqual({
      path: 'src/new/x.ts',
      renamedFrom: 'src/old/x.ts',
      added: 5,
      removed: 5,
    });
  });

  it('handles braced rename "src/{old => new}/x.ts"', () => {
    const raw =
      commitHeader('e'.repeat(40), 'eeeeeee', 'E', 'e@x', '2026-05-05T10:00:00+03:00', 'mv2') +
      '\n0\t0\tsrc/{old => new}/x.ts';
    expect(parseGitLog(raw)[0]?.changes[0]).toEqual({
      path: 'src/new/x.ts',
      renamedFrom: 'src/old/x.ts',
      added: 0,
      removed: 0,
    });
  });

  it('returns empty array for empty input', () => {
    expect(parseGitLog('')).toEqual([]);
  });

  it('skips malformed segments without throwing', () => {
    const raw =
      '__FS_COMMIT__\x01garbage\nweird stuff\n' +
      commitHeader('f'.repeat(40), 'fffffff', 'F', 'f@x', '2026-05-06T10:00:00+03:00', 'ok') +
      '\n1\t1\tsrc/ok.ts';
    const commits = parseGitLog(raw);
    expect(commits).toHaveLength(1);
    expect(commits[0]?.subject).toBe('ok');
  });
});

describe('expandRename', () => {
  it('handles brace expansion with empty old part', () => {
    expect(expandRename('src/{ => new}/x.ts')).toEqual({ from: 'src/x.ts', to: 'src/new/x.ts' });
  });
  it('handles brace expansion with empty new part', () => {
    expect(expandRename('src/{old => }/x.ts')).toEqual({ from: 'src/old/x.ts', to: 'src/x.ts' });
  });
});
