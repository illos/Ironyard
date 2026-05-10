// 26-char Crockford-Base32 ULID. 48-bit timestamp prefix + 80-bit random suffix.
// Cross-runtime: crypto.getRandomValues exists in browsers, Node 19+, and Workers.

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford Base32 (no I, L, O, U)
const TIME_LEN = 10;
const RANDOM_LEN = 16;

function encodeTime(ms: number, len: number): string {
  let n = ms;
  let result = '';
  for (let i = len - 1; i >= 0; i--) {
    const mod = n % 32;
    result = (ENCODING[mod] ?? '0') + result;
    n = (n - mod) / 32;
  }
  return result;
}

function encodeRandom(len: number): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let result = '';
  for (let i = 0; i < len; i++) {
    const byte = bytes[i] ?? 0;
    result += ENCODING[byte % 32];
  }
  return result;
}

export function ulid(now: number = Date.now()): string {
  return encodeTime(now, TIME_LEN) + encodeRandom(RANDOM_LEN);
}
