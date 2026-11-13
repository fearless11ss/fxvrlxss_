import { describe, expect, it } from "vitest";

import {
  createSessionToken,
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSecret,
  hashPassword,
  verifyPassword,
  verifyTotp,
} from "./credentials.js";

describe("credentials", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("correct horse battery staple", "pepper");
    await expect(
      verifyPassword("correct horse battery staple", hash, "pepper"),
    ).resolves.toBe(true);
    await expect(verifyPassword("wrong", hash, "pepper")).resolves.toBe(false);
  });

  it("encrypts TOTP secrets with authenticated encryption", () => {
    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret, "encryption-key");
    expect(encrypted).not.toContain(secret);
    expect(decryptTotpSecret(encrypted, "encryption-key")).toBe(secret);
  });

  it("accepts RFC 6238 SHA-1 test vector output", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(verifyTotp("287082", secret, 59_000)).toBe(true);
  });

  it("creates opaque session tokens and stable hashes", () => {
    const first = createSessionToken();
    const second = createSessionToken();
    expect(first.raw).not.toBe(first.hash);
    expect(first.hash).not.toBe(second.hash);
  });
});
