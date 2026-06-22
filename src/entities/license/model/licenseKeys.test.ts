import { describe, expect, it } from 'vitest';
import { validateLicenseKey, type LicensePayload } from './licenseKeys';

describe('license key validation', () => {
  it('accepts a signed license that has not expired', async () => {
    const { publicKey, privateKey } = await makeKeyPair();
    const key = await issueTestLicense(privateKey, {
      licenseId: 'lic_test',
      customer: 'Alex',
      issuedAt: '2026-05-22T00:00:00.000Z',
      expiresAt: '2026-06-21T00:00:00.000Z',
      plan: 'trial',
    });

    await expect(
      validateLicenseKey(key, {
        publicKey,
        now: new Date('2026-05-23T00:00:00.000Z'),
      }),
    ).resolves.toMatchObject({
      status: 'active',
      payload: { licenseId: 'lic_test', customer: 'Alex' },
    });
  });

  it('rejects expired licenses', async () => {
    const { publicKey, privateKey } = await makeKeyPair();
    const key = await issueTestLicense(privateKey, {
      licenseId: 'lic_expired',
      customer: 'Alex',
      issuedAt: '2026-05-01T00:00:00.000Z',
      expiresAt: '2026-05-20T00:00:00.000Z',
      plan: 'trial',
    });

    await expect(
      validateLicenseKey(key, {
        publicKey,
        now: new Date('2026-05-22T00:00:00.000Z'),
      }),
    ).resolves.toMatchObject({ status: 'expired' });
  });

  it('rejects clock rollback after activation', async () => {
    const { publicKey, privateKey } = await makeKeyPair();
    const key = await issueTestLicense(privateKey, {
      licenseId: 'lic_rollback',
      customer: 'Alex',
      issuedAt: '2026-05-22T00:00:00.000Z',
      expiresAt: '2026-06-21T00:00:00.000Z',
      plan: 'trial',
    });

    await expect(
      validateLicenseKey(key, {
        publicKey,
        now: new Date('2026-05-21T00:00:00.000Z'),
        lastSeenAt: '2026-05-22T00:00:00.000Z',
      }),
    ).resolves.toMatchObject({ status: 'clockRollback' });
  });
});

async function makeKeyPair(): Promise<{ publicKey: JsonWebKey; privateKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);

  return {
    publicKey: await crypto.subtle.exportKey('jwk', pair.publicKey),
    privateKey: pair.privateKey,
  };
}

async function issueTestLicense(privateKey: CryptoKey, payload: LicensePayload): Promise<string> {
  const payloadSegment = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(payloadSegment),
  );
  return `ARCHORA-${payloadSegment}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
