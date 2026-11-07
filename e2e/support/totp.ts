import { createHmac } from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(secret: string): Buffer {
  const clean = secret.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error(`Secret TOTP invalide : ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Pas TOTP (30 s) d'un instant donné. */
export function totpStep(epochMs = Date.now()): number {
  return Math.floor(epochMs / 1000 / 30);
}

/** Code TOTP RFC 6238 (SHA1, 6 chiffres, pas de 30 s), comme l'émetteur « PsyMate ». */
export function totp(secret: string, step = totpStep()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(binary).padStart(6, '0');
}
