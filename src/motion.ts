import sharp from 'sharp';

const FRAME_WIDTH = 320;
const FRAME_HEIGHT = 240;

let previousFrame: Buffer | null = null;

/**
 * Oldingi kadr bilan hozirgi kadrni grayscale piksel farqi orqali solishtiradi.
 * Birinchi chaqiruvda (previousFrame yo'q) har doim false qaytaradi.
 */
export async function detectMotion(currentFrame: Buffer, threshold: number = 20): Promise<boolean> {
  if (!previousFrame) {
    previousFrame = currentFrame;
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

  previousFrame = currentFrame;

  const avgDiff = diff / prev.length;
  return avgDiff > threshold;
}
