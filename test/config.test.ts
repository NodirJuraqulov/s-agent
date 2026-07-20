import { describe, it, expect } from 'vitest';
import { parseNumberEnv } from '../src/config';

describe('parseNumberEnv', () => {
  it('"0" qiymatini togri qabul qiladi (defaultga tushmaydi)', () => {
    expect(parseNumberEnv('0', 20)).toBe(0);
  });

  it('togri sonli qiymatni parse qiladi', () => {
    expect(parseNumberEnv('42', 20)).toBe(42);
  });

  it('yoq qiymatda default qaytaradi', () => {
    expect(parseNumberEnv(undefined, 20)).toBe(20);
  });

  it('NaN qiymatda default qaytaradi', () => {
    expect(parseNumberEnv('not-a-number', 20)).toBe(20);
  });
});
