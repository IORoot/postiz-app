import { normalizeIdempotencyKey } from './public.pipeline.enqueue';

const digest = 'ab'.repeat(32);

describe('normalizeIdempotencyKey', () => {
  it('returns no key when the value is missing or empty', () => {
    expect(normalizeIdempotencyKey(undefined)).toEqual({});
    expect(normalizeIdempotencyKey(null)).toEqual({});
    expect(normalizeIdempotencyKey('')).toEqual({});
  });

  it('lowercases a 64-character hex digest', () => {
    expect(normalizeIdempotencyKey(digest.toUpperCase())).toEqual({
      key: digest,
    });
  });

  it('rejects a value that is not a SHA-256 hex digest', () => {
    const error = {
      error: 'idempotencyKey must be a SHA-256 hex digest',
    };

    expect(normalizeIdempotencyKey('abc')).toEqual(error);
    expect(normalizeIdempotencyKey(`${digest}g`)).toEqual(error);
    expect(normalizeIdempotencyKey(digest.slice(0, 63))).toEqual(error);
    expect(normalizeIdempotencyKey(12)).toEqual(error);
    expect(normalizeIdempotencyKey(` ${digest} `)).toEqual(error);
  });
});
