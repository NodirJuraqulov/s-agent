import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { logger } from './logger';

dotenv.config();

/**
 * Majburiy .env o'zgaruvchisi yo'q/bo'lsa, xato darhol (throw orqali,
 * shu funksiya oxirida) process'ni yiqitadi — lekin winston'ning
 * DailyRotateFile transporti fayl yozuvini ASINXRON bajaradi, shuning
 * uchun sinovda tasdiqlandi: logger.error() + throw ketma-ketligida
 * konsolga xabar chiqadi, LEKIN log faylga yozib ulgurmaydi (process
 * uncaught exception bilan fayl yozuvidan OLDIN o'ladi). Shu sabab bu
 * yerda UCHTA mustaqil qatlam bor: (1) console.error — sinxron, HAR
 * DOIM ko'rinadi; (2) logger.error — odatiy formatlangan yozuv (best
 * effort); (3) to'g'ridan-to'g'ri SINXRON fayl yozuvi (fs.appendFileSync)
 * — winston'ga bog'liq bo'lmagan, kafolatlangan yozuv.
 */
function reportFatalConfigError(message: string): never {
  console.error(message);

  try {
    logger.error(message);
  } catch {
    // logger o'zi ishlamasa ham (1) allaqachon konsolda ko'ringan
  }

  try {
    const logDir = path.join(process.cwd(), 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(
      path.join(logDir, 'fatal-startup-errors.log'),
      `[${new Date().toISOString()}] [FATAL] ${message}\n`
    );
  } catch {
    // fayl yozuvi ham muvaffaqiyatsiz bo'lsa ham, (1) console.error baribir kafolatlangan
  }

  throw new Error(message);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    reportFatalConfigError(
      `XATOLIK: .env faylida MAJBURIY o'zgaruvchi topilmadi: "${name}". Dastur ishga tushmaydi — .env faylini tekshiring.`
    );
  }
  return value;
}

/**
 * `Number(process.env.X) || default` ATAYLAB ishlatilmaydi — foydalanuvchi
 * ataylab "0" qiymatini bersa (masalan pastroq chegara sifatida), `|| `
 * buni "0 = falsy" deb hisoblab, xato ravishda default'ga qaytarib
 * yuborardi. Bu yerda faqat (a) o'zgaruvchi umuman berilmagan, YOKI
 * (b) berilgan qiymat raqam EMAS (NaN) bo'lgandagina default ishlatiladi —
 * "0" har doim TO'G'RI, o'z holicha qabul qilinadi.
 */
function parseNumberEnv(raw: string | undefined, defaultValue: number): number {
  if (raw === undefined) return defaultValue;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? defaultValue : parsed;
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
  captureIntervalMs: parseNumberEnv(process.env.CAPTURE_INTERVAL_MS, 2000),
  motionThreshold: parseNumberEnv(process.env.MOTION_THRESHOLD, 20),
  // Sessiya yozish uchun ishlatiladigan umumiy aniqlik chegarasidan farqli —
  // shlagbaum FAQAT shu (yuqoriroq) chegaradan o'tgan holatlardagina ochiladi.
  barrierConfidenceThreshold: parseNumberEnv(process.env.BARRIER_CONFIDENCE_THRESHOLD, 0.75),
};
