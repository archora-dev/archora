// long flags + a few short aliases. supports --flag, --flag=v, --flag v, --no-flag, --
const SHORT_ALIASES: Record<string, string> = {
  o: 'output',
  h: 'help',
  q: 'quiet',
  v: 'version',
};

export interface ParsedArgv {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean | string[]>;
}

export function parseArgv(argv: readonly string[]): ParsedArgv {
  const [rawCommand, ...rest] = argv;
  const command = rawCommand && !rawCommand.startsWith('-') ? rawCommand : '';
  const args = command ? rest : argv;

  const positional: string[] = [];
  const flags: Record<string, string | boolean | string[]> = {};
  let endOfFlags = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (endOfFlags) {
      positional.push(a);
      continue;
    }
    if (a === '--') {
      endOfFlags = true;
      continue;
    }
    if (!a.startsWith('-') || a === '-') {
      positional.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    const dashes = a.startsWith('--') ? 2 : 1;
    const key = (eq === -1 ? a : a.slice(0, eq)).slice(dashes);
    const longKey = SHORT_ALIASES[key] ?? key;
    const inline = eq === -1 ? null : a.slice(eq + 1);
    let value: string | boolean;
    if (inline !== null) {
      value = inline;
    } else {
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        value = next;
        i += 1;
      } else {
        value = true;
      }
    }
    if (longKey.startsWith('no-') && value === true) {
      flags[longKey.slice(3)] = false;
      continue;
    }
    const existing = flags[longKey];
    if (existing === undefined) {
      flags[longKey] = value;
    } else if (Array.isArray(existing)) {
      if (typeof value === 'string') existing.push(value);
    } else if (typeof existing === 'string' && typeof value === 'string') {
      flags[longKey] = [existing, value];
    } else {
      flags[longKey] = value;
    }
  }

  return { command, positional, flags };
}

export function flagString(parsed: ParsedArgv, name: string): string | undefined {
  const v = parsed.flags[name];
  return typeof v === 'string' ? v : undefined;
}

export function flagStringList(parsed: ParsedArgv, name: string): string[] {
  const v = parsed.flags[name];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') return [v];
  return [];
}

export function flagBool(parsed: ParsedArgv, name: string, def = false): boolean {
  const v = parsed.flags[name];
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return def;
}
