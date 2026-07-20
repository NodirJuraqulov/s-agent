import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { detectMotion } from '../src/motion';

async function solidImage(gray: number): Promise<Buffer> {
  return sharp({
    create: {
      width: 320,
      height: 240,
      channels: 3,
      background: { r: gray, g: gray, b: gray },
    },
  })
    .jpeg()
    .toBuffer();
}

describe('detectMotion', () => {
  it('kichik farqda harakat YOQ deb topadi', async () => {
    const previous = await solidImage(100);
    const current = await solidImage(102);

    const result = await detectMotion(current, previous, 20);

    expect(result).toBe(false);
  });

  it('katta farqda harakat BOR deb topadi', async () => {
    const previous = await solidImage(0);
    const current = await solidImage(255);

    const result = await detectMotion(current, previous, 20);

    expect(result).toBe(true);
  });

  it('previousFrame null bolganda xato bermaydi va false qaytaradi', async () => {
    const current = await solidImage(128);

    const result = await detectMotion(current, null, 20);

    expect(result).toBe(false);
  });
});
