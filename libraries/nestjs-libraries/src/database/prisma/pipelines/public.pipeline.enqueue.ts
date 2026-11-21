const sha256Hex = /^[a-f0-9]{64}$/i;

export function normalizeIdempotencyKey(
  value: unknown
): { key?: string } | { error: string } {
  if (value === undefined || value === null || value === '') {
    return {};
  }
  if (typeof value !== 'string' || !sha256Hex.test(value)) {
    return { error: 'idempotencyKey must be a SHA-256 hex digest' };
  }
  return { key: value.toLowerCase() };
}
