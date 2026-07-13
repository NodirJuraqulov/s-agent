import sharp from 'sharp';

const FRAME_WIDTH = 320;
const FRAME_HEIGHT = 240;

/**
 * Oldingi kadr bilan hozirgi kadrni grayscale piksel farqi orqali solishtiradi.
 * Pure function — holatni o'zida saqlamaydi: previousFrame chaqiruvchi tomonidan
 * uzatiladi va saqlanadi. Shu tufayli bir nechta mustaqil oqim (masalan Kirish
 * va Chiqish kameralari) bir-birining holatini buzmasdan parallel ishlatilishi
 * mumkin.
 */
export async function detectMotion(
  currentFrame: Buffer,
  previousFrame: Buffer | null,
  threshold: number
): Promise<boolean> {
  if (!previousFrame) {
    return false;
  }

  const prev = await sharp(previousFrame)
    .grayscale()
    .resize(FRAME_WIDTH, FRAME_HEIGHT)
    .raw()
    .toBuffer();

  const curr = await sharp(currentFrame)
    .grayscale()
    .resize(FRAME_WIDTH, FRAME_HEIGHT)
    .raw()
    .toBuffer();

  let diff = 0;
  for (let i = 0; i < prev.length; i++) {
    diff += Math.abs(prev[i] - curr[i]);
  }

  const avgDiff = diff / prev.length;
  return avgDiff > threshold;
}
