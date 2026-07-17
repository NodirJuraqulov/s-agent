import sharp from 'sharp';

const FRAME_WIDTH = 320;
const FRAME_HEIGHT = 240;

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
