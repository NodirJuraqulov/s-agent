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
  // Kamera login/paroli endi backend'da (shifrlangan) saqlanadi — bular faqat
  // backend hali sozlanmagan holatlar uchun LOCAL FALLBACK (agentConfig.ts →
  // resolveCameraAuth()).
  cameraUsername: process.env.CAMERA_USERNAME || 'admin',
  cameraPassword: process.env.CAMERA_PASSWORD || 'admin',
  captureIntervalMs: Number(process.env.CAPTURE_INTERVAL_MS) || 2000,
  motionThreshold: Number(process.env.MOTION_THRESHOLD) || 20,
  // Sessiya yozish uchun ishlatiladigan umumiy aniqlik chegarasidan farqli —
  // shlagbaum FAQAT shu (yuqoriroq) chegaradan o'tgan holatlardagina ochiladi.
  barrierConfidenceThreshold: Number(process.env.BARRIER_CONFIDENCE_THRESHOLD) || 0.75,
};
