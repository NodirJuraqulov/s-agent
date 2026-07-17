import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { logger } from './logger';

dotenv.config();

function reportFatalConfigError(message: string): never {
  console.error(message);

  try {
    logger.error(message);
  } catch {

  }

  try {
    const logDir = path.join(process.cwd(), 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(
      path.join(logDir, 'fatal-startup-errors.log'),
      `[${new Date().toISOString()}] [FATAL] ${message}\n`
    );
  } catch {

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

function parseNumberEnv(raw: string | undefined, defaultValue: number): number {
  if (raw === undefined) return defaultValue;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

export const config = {
  serverUrl: required('SERVER_URL'),
  agentApiKey: required('AGENT_API_KEY'),
  cameraUsername: process.env.CAMERA_USERNAME || 'admin',
  cameraPassword: process.env.CAMERA_PASSWORD || 'admin',
  captureIntervalMs: parseNumberEnv(process.env.CAPTURE_INTERVAL_MS, 2000),
  motionThreshold: parseNumberEnv(process.env.MOTION_THRESHOLD, 20),
  barrierConfidenceThreshold: parseNumberEnv(process.env.BARRIER_CONFIDENCE_THRESHOLD, 0.75),
};
