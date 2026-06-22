/**
 * Commands that require a paid Pro license. Empty under the open-core model:
 * every current CLI command is free. Add command names here when paid CLI
 * features land (the desktop app gates Pro separately via its own LicenseGate).
 */
const PRO_COMMANDS = new Set<string>();

export function requiresPro(command: string): boolean {
  return PRO_COMMANDS.has(command);
}
