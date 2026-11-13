import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const SCRYPT_N = 2 ** 17;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 192 * 1024 * 1024;
const TOTP_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_PERIOD_SECONDS = 30;

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: Buffer,
  keyLength: number,
  options: { N: number; maxmem: number; p: number; r: number },
) => Promise<Buffer>;

function purposeKey(secret: string, purpose: string): Buffer {
  return createHmac("sha256", secret).update(purpose, "utf8").digest();
}

function pepperedPassword(password: string, pepper: string): Buffer {
  return createHmac("sha256", purposeKey(pepper, "password-pepper-v1"))
    .update(password, "utf8")
    .digest();
}

export async function hashPassword(
  password: string,
  pepper: string,
): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(
    pepperedPassword(password, pepper),
    salt,
    SCRYPT_KEY_LENGTH,
    { N: SCRYPT_N, maxmem: SCRYPT_MAX_MEMORY, p: SCRYPT_P, r: SCRYPT_R },
  );
  return [
    "scrypt-v1",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  encoded: string,
  pepper: string,
): Promise<boolean> {
  const [version, n, r, p, saltValue, hashValue] = encoded.split("$");
  if (
    version !== "scrypt-v1" ||
    n !== String(SCRYPT_N) ||
    r !== String(SCRYPT_R) ||
    p !== String(SCRYPT_P) ||
    !saltValue ||
    !hashValue
  ) {
    return false;
  }
  const expected = Buffer.from(hashValue, "base64url");
  const actual = await scryptAsync(
    pepperedPassword(password, pepper),
    Buffer.from(saltValue, "base64url"),
    expected.length,
    { N: SCRYPT_N, maxmem: SCRYPT_MAX_MEMORY, p: SCRYPT_P, r: SCRYPT_R },
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function encodeBase32(value: Buffer): string {
  let bits = 0;
  let buffer = 0;
  let output = "";
  for (const byte of value) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += TOTP_ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += TOTP_ALPHABET[(buffer << (5 - bits)) & 31];
  return output;
}

function decodeBase32(value: string): Buffer {
  let bits = 0;
  let buffer = 0;
  const output: number[] = [];
  for (const character of value.toUpperCase().replaceAll("=", "")) {
    const index = TOTP_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("Invalid base32 TOTP secret");
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(20));
}

function totpAt(secret: string, unixTimeSeconds: number): string {
  const counter = Math.floor(unixTimeSeconds / TOTP_PERIOD_SECONDS);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret))
    .update(message)
    .digest();
  const offset = digest.at(-1)! & 15;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}

export function verifyTotp(
  token: string,
  secret: string,
  now = Date.now(),
): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  const supplied = Buffer.from(token, "utf8");
  const seconds = Math.floor(now / 1_000);
  return [-1, 0, 1].some((offset) => {
    const expected = Buffer.from(
      totpAt(secret, seconds + offset * TOTP_PERIOD_SECONDS),
      "utf8",
    );
    return timingSafeEqual(supplied, expected);
  });
}

function encryptionKey(secret: string): Buffer {
  return purposeKey(secret, "totp-encryption-v1");
}

export function encryptTotpSecret(
  secret: string,
  encryptionSecret: string,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    encryptionKey(encryptionSecret),
    iv,
  );
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptTotpSecret(
  encrypted: string,
  encryptionSecret: string,
): string {
  const [version, ivValue, tagValue, ciphertextValue] = encrypted.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Unsupported encrypted TOTP secret");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(encryptionSecret),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function createSessionToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashSessionToken(raw) };
}

export function hashSessionToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function createIpHash(ip: string, secret: string): string {
  return createHmac("sha256", purposeKey(secret, "ip-hash-v1"))
    .update(ip, "utf8")
    .digest("hex");
}
