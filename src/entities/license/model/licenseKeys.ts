export interface LicensePayload {
  licenseId: string;
  customer: string;
  issuedAt: string;
  expiresAt: string;
  plan: 'trial' | 'solo' | 'team' | 'company';
}

export interface LicenseValidation {
  status: 'active' | 'expired' | 'invalid' | 'clockRollback' | 'missingPublicKey';
  payload: LicensePayload | null;
  message: string;
}

const LICENSE_PREFIX = 'ARCHORA-';
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export function publicLicenseKey(): JsonWebKey | null {
  const raw = import.meta.env.VITE_ARCHORA_LICENSE_PUBLIC_KEY_JWK as string | undefined;
  if (!raw) return null;

  try {
    return JSON.parse(raw) as JsonWebKey;
  } catch {
    return null;
  }
}

export async function validateLicenseKey(
  licenseKey: string,
  options: {
    now?: Date;
    lastSeenAt?: string | null;
    publicKey?: JsonWebKey | null;
  } = {},
): Promise<LicenseValidation> {
  const now = options.now ?? new Date();
  const publicKey = options.publicKey ?? publicLicenseKey();
  if (!publicKey) {
    return result('missingPublicKey', null, 'Missing license public key');
  }

  const parsed = parseLicenseKey(licenseKey);
  if (!parsed) {
    return result('invalid', null, 'Invalid license format');
  }

  const payload = parsePayload(parsed.payloadSegment);
  if (!payload) {
    return result('invalid', null, 'Invalid license payload');
  }

  const verified = await verifySignature(publicKey, parsed.payloadSegment, parsed.signature);
  if (!verified) {
    return result('invalid', null, 'Invalid license signature');
  }

  const rollback = isClockRollback(now, options.lastSeenAt);
  if (rollback) {
    return result('clockRollback', payload, 'System clock is earlier than the last app run');
  }

  const expiresAt = Date.parse(payload.expiresAt);
  if (!Number.isFinite(expiresAt) || now.getTime() > expiresAt) {
    return result('expired', payload, 'License has expired');
  }

  return result('active', payload, 'License is active');
}

function parseLicenseKey(input: string): { payloadSegment: string; signature: Uint8Array } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith(LICENSE_PREFIX)) return null;

  const body = trimmed.slice(LICENSE_PREFIX.length);
  const [payloadSegment, signatureSegment, extra] = body.split('.');
  if (!payloadSegment || !signatureSegment || extra) return null;

  try {
    return {
      payloadSegment,
      signature: base64UrlToBytes(signatureSegment),
    };
  } catch {
    return null;
  }
}

function parsePayload(segment: string): LicensePayload | null {
  try {
    const raw = new TextDecoder().decode(base64UrlToBytes(segment));
    const payload = JSON.parse(raw) as Partial<LicensePayload>;

    if (
      typeof payload.licenseId !== 'string' ||
      typeof payload.customer !== 'string' ||
      typeof payload.issuedAt !== 'string' ||
      typeof payload.expiresAt !== 'string' ||
      !isLicensePlan(payload.plan)
    ) {
      return null;
    }

    return {
      licenseId: payload.licenseId,
      customer: payload.customer,
      issuedAt: payload.issuedAt,
      expiresAt: payload.expiresAt,
      plan: payload.plan,
    };
  } catch {
    return null;
  }
}

function isLicensePlan(value: unknown): value is LicensePayload['plan'] {
  return value === 'trial' || value === 'solo' || value === 'team' || value === 'company';
}

async function verifySignature(
  publicKey: JsonWebKey,
  payloadSegment: string,
  signature: Uint8Array,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      publicKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );

    return crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      bytesToArrayBuffer(signature),
      new TextEncoder().encode(payloadSegment),
    );
  } catch {
    return false;
  }
}

function isClockRollback(now: Date, lastSeenAt: string | null | undefined): boolean {
  if (!lastSeenAt) return false;
  const lastSeen = Date.parse(lastSeenAt);
  if (!Number.isFinite(lastSeen)) return false;
  return now.getTime() + CLOCK_SKEW_MS < lastSeen;
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function result(
  status: LicenseValidation['status'],
  payload: LicensePayload | null,
  message: string,
): LicenseValidation {
  return { status, payload, message };
}
