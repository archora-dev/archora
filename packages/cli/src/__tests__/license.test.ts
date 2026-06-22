import { Buffer } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TextEncoder } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseArgv } from '../argv';
import { runLicense } from '../commands/license';
import { validateLicenseKey, type LicensePayload } from '../license';

describe('cli license', () => {
  const originalPublicKey = process.env['ARCHORA_LICENSE_PUBLIC_KEY_JWK'];
  const originalLicenseFile = process.env['ARCHORA_LICENSE_FILE'];

  afterEach(() => {
    restoreEnv('ARCHORA_LICENSE_PUBLIC_KEY_JWK', originalPublicKey);
    restoreEnv('ARCHORA_LICENSE_FILE', originalLicenseFile);
    vi.restoreAllMocks();
  });

  it('writes a safe license request file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'archora-license-request-'));
    const out = join(dir, 'request.md');
    const stdout = captureStdout();

    await expect(
      runLicense(parseArgv(['license', 'request', '--plan', 'team', '--out', out])),
    ).resolves.toBe(0);

    expect(stdout.flush()).toContain('License request written:');
    const request = await readFile(out, 'utf-8');
    expect(request).toContain('# Archora License Request');
    expect(request).toContain('Plan: team');
    expect(request).toContain('Do not attach source code');
    expect(request).not.toContain(process.cwd());
  });

  it('activates, reports and removes a signed key', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'archora-license-store-'));
    const licenseFile = join(dir, 'license.json');
    const { publicKey, privateKey } = await makeKeyPair();
    process.env['ARCHORA_LICENSE_PUBLIC_KEY_JWK'] = JSON.stringify(publicKey);
    process.env['ARCHORA_LICENSE_FILE'] = licenseFile;

    const key = await issueTestLicense(privateKey, {
      licenseId: 'lic_team',
      customer: 'Team',
      issuedAt: '2026-05-22T00:00:00.000Z',
      // Far-future expiry: the activate path validates against the real clock, so
      // a fixed near-term date would make this test expire on a calendar day.
      expiresAt: '2099-12-31T00:00:00.000Z',
      plan: 'team',
    });

    const stdout = captureStdout();
    await expect(runLicense(parseArgv(['license', 'activate', key]))).resolves.toBe(0);
    expect(stdout.flush()).toContain('License active for Team');

    await expect(runLicense(parseArgv(['license', 'status', '--json']))).resolves.toBe(0);
    expect(JSON.parse(stdout.flush())).toMatchObject({
      ok: true,
      status: 'active',
      license: { customer: 'Team', plan: 'team' },
    });

    await expect(runLicense(parseArgv(['license', 'remove']))).resolves.toBe(0);
    stdout.flush();
    await expect(runLicense(parseArgv(['license', 'status']))).resolves.toBe(1);
    expect(stdout.flush()).toContain('License status: missing');
  });

  it('validates team and company plans', async () => {
    const { publicKey, privateKey } = await makeKeyPair();
    const key = await issueTestLicense(privateKey, {
      licenseId: 'lic_company',
      customer: 'Company',
      issuedAt: '2026-05-22T00:00:00.000Z',
      expiresAt: '2027-05-22T00:00:00.000Z',
      plan: 'company',
    });

    await expect(
      validateLicenseKey(key, {
        publicKey,
        now: new Date('2026-05-23T00:00:00.000Z'),
      }),
    ).resolves.toMatchObject({
      status: 'active',
      payload: { customer: 'Company', plan: 'company' },
    });
  });
});

function captureStdout(): { flush(): string } {
  let output = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    output += String(chunk);
    return true;
  });
  return {
    flush() {
      const value = output;
      output = '';
      return value;
    },
  };
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

async function makeKeyPair(): Promise<{ publicKey: JsonWebKey; privateKey: CryptoKey }> {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);

  return {
    publicKey: await webcrypto.subtle.exportKey('jwk', pair.publicKey),
    privateKey: pair.privateKey,
  };
}

async function issueTestLicense(privateKey: CryptoKey, payload: LicensePayload): Promise<string> {
  const payloadSegment = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await webcrypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(payloadSegment),
  );
  return `ARCHORA-${payloadSegment}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
