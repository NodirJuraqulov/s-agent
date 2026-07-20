import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { logger } from './logger';

dotenv.config();

const FATAL_LOG_PATH = path.join(process.cwd(), 'logs', 'fatal-startup-errors.log');
const FATAL_LOG_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function pruneOldFatalLogLines(content: string): string {
  const now = Date.now();

  return content
    .split('\n')
    .filter((line) => {
      if (!line) return false;
      const match = line.match(/^\[([^\]]+)]/);
      if (!match) return true;
      const timestamp = Date.parse(match[1]);
      if (Number.isNaN(timestamp)) return true;
      return now - timestamp <= FATAL_LOG_MAX_AGE_MS;
    })
    .join('\n');
}

function reportFatalConfigError(message: string): never {
  console.error(message);

  try {
    logger.error(message);
  } catch {

  }

  try {
    fs.mkdirSync(path.dirname(FATAL_LOG_PATH), { recursive: true });
    const existing = fs.existsSync(FATAL_LOG_PATH) ? fs.readFileSync(FATAL_LOG_PATH, 'utf-8') : '';
    const pruned = pruneOldFatalLogLines(existing);
    const newLine = `[${new Date().toISOString()}] [FATAL] ${message}`;
    fs.writeFileSync(FATAL_LOG_PATH, pruned ? `${pruned}\n${newLine}\n` : `${newLine}\n`);
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

export function parseNumberEnv(raw: string | undefined, defaultValue: number): number {
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
