import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { flagBool, flagString, type ParsedArgv } from '../argv';
import {
  activateLicenseKey,
  getStoredLicenseStatus,
  removeStoredLicense,
  type LicenseValidation,
} from '../license';

const execFileAsync = promisify(execFile);

export async function runLicense(parsed: ParsedArgv): Promise<number> {
  const action = parsed.positional[0];
  const json = flagBool(parsed, 'json');

  try {
    switch (action) {
      case 'activate':
        return await activate(parsed, json);
      case 'status':
        return await status(json);
      case 'remove':
        await removeStoredLicense();
        write(json, { ok: true, status: 'removed' }, 'License removed\n');
        return 0;
      case 'request': {
        const options: { out?: string; plan?: string } = {};
        const out = flagString(parsed, 'out') ?? flagString(parsed, 'output');
        const plan = flagString(parsed, 'plan');
        if (out) options.out = out;
        if (plan) options.plan = plan;
        const request = await createLicenseRequest(options);
        write(json, { ok: true, path: request.path }, `License request written: ${request.path}\n`);
        return 0;
      }
      default:
        process.stderr.write(
          `error: unknown license action "${action ?? ''}". Use activate, status, request or remove.\n`,
        );
        return 2;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (json) {
      process.stdout.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
    } else {
      process.stderr.write(`error: ${message}\n`);
    }
    return 2;
  }
}

async function activate(parsed: ParsedArgv, json: boolean): Promise<number> {
  const licenseKey = flagString(parsed, 'key') ?? parsed.positional[1];
  if (!licenseKey) {
    throw new Error('Missing license key. Usage: archora license activate <license-key>');
  }

  const validation = await activateLicenseKey(licenseKey);
  if (validation.status !== 'active') {
    throw new Error(validation.message);
  }

  write(
    json,
    { ok: true, status: validation.status, license: validation.payload },
    `License active for ${validation.payload?.customer ?? 'customer'}\n`,
  );
  return 0;
}

async function status(json: boolean): Promise<number> {
  const validation = await getStoredLicenseStatus();
  if (json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: validation.status === 'active',
          status: validation.status,
          message: validation.message,
          license: validation.payload,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    process.stdout.write(formatStatus(validation));
  }
  return validation.status === 'active' ? 0 : 1;
}

async function createLicenseRequest(options: {
  out?: string;
  plan?: string;
}): Promise<{ path: string }> {
  const plan = normalizePlan(options.plan);
  const outPath = resolve(options.out ?? 'license-request.md');
  const remoteHost = await readGitRemoteHost();
  const cwd = process.cwd();

  const markdown = [
    '# Archora License Request',
    '',
    `Plan: ${plan}`,
    `Created: ${new Date().toISOString()}`,
    `Node.js: ${process.version}`,
    `Platform: ${process.platform}/${process.arch}`,
    `Workspace: ${basename(cwd)}`,
    `Git remote host: ${remoteHost ?? 'not detected'}`,
    '',
    'Send this request to akotov@archora.dev or Telegram @akotofff.',
    '',
    '## Scope',
    '',
    '- Company/team:',
    '- Contact:',
    '- Developer seats:',
    '- Repositories:',
    '- Frontend stack:',
    '- Expected usage: local evaluation / CI / desktop / team rollout',
    '',
    '## Notes',
    '',
    '- Do not attach source code unless explicitly agreed.',
    '- Archora license requests do not require source code, environment variables or private absolute paths.',
    '',
  ].join('\n');

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, markdown, 'utf-8');
  return { path: outPath };
}

function normalizePlan(value: string | undefined): string {
  if (!value) return 'trial';
  if (value === 'trial' || value === 'solo' || value === 'team' || value === 'company') {
    return value;
  }
  throw new Error('Invalid plan. Use trial, solo, team or company.');
}

async function readGitRemoteHost(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], {
      cwd: process.cwd(),
      timeout: 2_000,
    });
    return sanitizeRemoteHost(stdout.trim());
  } catch {
    return null;
  }
}

function sanitizeRemoteHost(remote: string): string | null {
  if (!remote) return null;
  const sshMatch = remote.match(/^[^@]+@([^:/]+)[:/]/);
  if (sshMatch?.[1]) return sshMatch[1];

  try {
    const parsed = new URL(remote.replace(/^git\+/, ''));
    return parsed.hostname || null;
  } catch {
    return null;
  }
}

function formatStatus(validation: LicenseValidation): string {
  const lines = [`License status: ${validation.status}`];
  if (validation.payload) {
    lines.push(`Customer: ${validation.payload.customer}`);
    lines.push(`Plan: ${validation.payload.plan}`);
    lines.push(`Expires: ${validation.payload.expiresAt}`);
  } else {
    lines.push(validation.message);
  }
  return `${lines.join('\n')}\n`;
}

function write(json: boolean, payload: unknown, text: string): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stdout.write(text);
  }
}
