import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Majburiy .env o'zgaruvchisi topilmadi: ${name}`);
  }
  return value;
}

/**
 * Faqat LOCAL (stoyanka kompyuteriga xos) sozlamalar. Kamera URL'lari va
 * shlagbaum sozlamalari endi bu yerda emas — ular backend'dan dinamik
 * olinadi va yangilanadi (`agentConfig.ts` / `configFetcher.ts` ga qarang).
 */
export const config = {
  serverUrl: required('SERVER_URL'),
  agentApiKey: required('AGENT_API_KEY'),
  cameraUsername: process.env.CAMERA_USERNAME || 'admin',
  cameraPassword: process.env.CAMERA_PASSWORD || 'admin',
  captureIntervalMs: Number(process.env.CAPTURE_INTERVAL_MS) || 2000,
  motionThreshold: Number(process.env.MOTION_THRESHOLD) || 20,
};
