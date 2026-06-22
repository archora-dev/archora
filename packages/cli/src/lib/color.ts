/**
 * Minimal ANSI colorizer. No dependency — the CLI stays a thin wrapper over
 * core. Honors the de-facto conventions so output is safe in pipes and CI:
 *   - NO_COLOR set (any value)            -> disabled  (https://no-color.org)
 *   - FORCE_COLOR set to a truthy value   -> enabled
 *   - otherwise                           -> enabled only on a TTY stdout
 */
function resolveEnabled(): boolean {
  const env = process.env;
  if (env['NO_COLOR'] !== undefined && env['NO_COLOR'] !== '') return false;
  const force = env['FORCE_COLOR'];
  if (force !== undefined && force !== '' && force !== '0' && force !== 'false') return true;
  return process.stdout.isTTY === true;
}

const enabled = resolveEnabled();

export function colorEnabled(): boolean {
  return enabled;
}

const ESC = '\x1b';

function wrap(open: number, close: number): (s: string | number) => string {
  return (s) => (enabled ? `${ESC}[${open}m${s}${ESC}[${close}m` : String(s));
}

export const color = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  gray: wrap(90, 39),
};

/** Color a 0–100 architecture score / letter grade by seriousness. */
export function gradeColor(grade: string): (s: string | number) => string {
  const g = grade.toUpperCase();
  if (g === 'A' || g === 'B') return color.green;
  if (g === 'C') return color.yellow;
  return color.red;
}
