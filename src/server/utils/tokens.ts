// Secret tokens (team devices, password reset links): only their hash is stored.

// 32 random bytes, URL-safe.
export function newToken() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
}

export function hashToken(token: string) {
  return new Bun.CryptoHasher('sha256').update(token).digest('hex');
}
