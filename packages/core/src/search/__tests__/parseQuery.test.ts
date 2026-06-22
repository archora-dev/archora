import { describe, expect, it } from 'vitest';
import { parseQuery, isEmpty } from '../parseQuery';

describe('parseQuery', () => {
  it('empty string → empty query', () => {
    const q = parseQuery('');
    expect(q.free).toEqual([]);
    expect(q.prefixes).toEqual({});
    expect(isEmpty(q)).toBe(true);
  });

  it('single free token without prefixes', () => {
    expect(parseQuery('useAuth')).toEqual({ free: ['useAuth'], prefixes: {} });
  });

  it('single path: prefix', () => {
    expect(parseQuery('path:src/features')).toEqual({
      free: [],
      prefixes: { path: ['src/features'] },
    });
  });

  it('several prefixes of different keys = AND intersection', () => {
    const q = parseQuery('kind:component path:auth');
    expect(q).toEqual({ free: [], prefixes: { kind: ['component'], path: ['auth'] } });
  });

  it('several identical prefixes = OR within a key', () => {
    const q = parseQuery('kind:component kind:composable');
    expect(q.prefixes.kind).toEqual(['component', 'composable']);
  });

  it('prefix + free-text mixed', () => {
    expect(parseQuery('useAuth kind:composable')).toEqual({
      free: ['useAuth'],
      prefixes: { kind: ['composable'] },
    });
  });

  it('quoted prefix value allows spaces', () => {
    const q = parseQuery('path:"src/feature x"');
    expect(q.prefixes.path).toEqual(['src/feature x']);
  });

  it('unknown prefix — falls back to free-text in full', () => {
    // `foo:bar` is not a known prefix → the whole token goes to free
    expect(parseQuery('foo:bar')).toEqual({ free: ['foo:bar'], prefixes: {} });
  });

  it('empty prefix value — ignored', () => {
    // `kind:` with no value — does not add a key
    const q = parseQuery('kind: hello');
    expect(q.prefixes.kind).toBeUndefined();
    expect(q.free).toContain('hello');
  });

  it('case-insensitive keys, case-sensitive values', () => {
    const q = parseQuery('KIND:Component PATH:Auth');
    expect(q.prefixes.kind).toEqual(['Component']);
    expect(q.prefixes.path).toEqual(['Auth']);
  });

  it('export / import prefixes work', () => {
    const q = parseQuery('export:useAuth import:react-query');
    expect(q.prefixes).toEqual({ export: ['useAuth'], import: ['react-query'] });
  });
});
