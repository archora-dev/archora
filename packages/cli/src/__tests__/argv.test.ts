import { describe, it, expect } from 'vitest';
import { parseArgv, flagString, flagStringList, flagBool } from '../argv';

describe('parseArgv', () => {
  it('extracts command and positional path', () => {
    const r = parseArgv(['analyze', '/repo/path']);
    expect(r.command).toBe('analyze');
    expect(r.positional).toEqual(['/repo/path']);
  });

  it('parses --flag value and --flag=value forms', () => {
    const r = parseArgv(['analyze', '.', '--output', 'out.json', '--format=md']);
    expect(flagString(r, 'output')).toBe('out.json');
    expect(flagString(r, 'format')).toBe('md');
  });

  it('handles -o short alias for --output', () => {
    const r = parseArgv(['report', '.', '-o', 'r.md']);
    expect(flagString(r, 'output')).toBe('r.md');
  });

  it('collects repeated --fail-on into a string list', () => {
    const r = parseArgv(['check', '.', '--fail-on', 'grade:D', '--fail-on', 'cycles:0']);
    expect(flagStringList(r, 'fail-on')).toEqual(['grade:D', 'cycles:0']);
  });

  it('parses ci as a command alias for gate rules', () => {
    const r = parseArgv(['ci', '.', '--fail-on', 'signals:high']);
    expect(r.command).toBe('ci');
    expect(flagStringList(r, 'fail-on')).toEqual(['signals:high']);
  });

  it('treats trailing --flag without value as boolean', () => {
    const r = parseArgv(['analyze', '.', '--quiet']);
    expect(flagBool(r, 'quiet')).toBe(true);
  });

  it('--no-flag negates a boolean', () => {
    const r = parseArgv(['analyze', '.', '--no-quiet']);
    expect(flagBool(r, 'quiet', true)).toBe(false);
  });

  it('-- ends flag parsing', () => {
    const r = parseArgv(['analyze', '.', '--', '--not-a-flag']);
    expect(r.positional).toEqual(['.', '--not-a-flag']);
  });
});
