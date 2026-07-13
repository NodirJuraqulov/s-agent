import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import FormData from 'form-data';
import axios from 'axios';
import { config } from './config';
import { logger } from './logger';

export type ParkingEventType = 'entry' | 'exit';

export interface EntryResult {
  detected: boolean;
  queued?: boolean;
  session?: {
    id?: number;
    plate_number?: string;
  };
}

const PATHS: Record<ParkingEventType, string> = {
  entry: '/api/agent/parking/entry',
  exit: '/api/agent/parking/exit',
};

const LABELS: Record<ParkingEventType, string> = {
  entry: 'Kirish',
  exit: 'Chiqish',
};

export const QUEUE_DIR = path.join(process.cwd(), 'queue');

/**
 * Xato qayta urinishga arziydimi? Server javob bermagan (tarmoq/timeout) yoki
 * 5xx qaytargan bo'lsa — ha (vaqtinchalik muammo). 401/409 kabi 4xx xatolar
 * — yo'q, chunki qayta urinish ularni tuzatmaydi (masalan token yaroqsiz).
 */
function isRetryableError(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return true;
    }
    return error.response.status >= 500;
  }
  return true;
}

async function saveToQueue(type: ParkingEventType, image: Buffer, capturedAt: string): Promise<string> {
  await fs.mkdir(QUEUE_DIR, { recursive: true });

  const filename = `${Date.now()}-${crypto.randomUUID()}.json`;
  const entry = {
    type,
    imageBase64: image.toString('base64'),
    capturedAt,
    attempts: 0,
  };

  await fs.writeFile(path.join(QUEUE_DIR, filename), JSON.stringify(entry));
  return filename;
}

/** Rasmni s-backend ga to'g'ridan-to'g'ri yuboradi (navbatga saqlamaydi, xatoni tashlaydi). */
export async function postToServer(
  type: ParkingEventType,
  image: Buffer,
  capturedAt: string
): Promise<EntryResult> {
  const form = new FormData();
  form.append('image', image, {
    filename: 'snapshot.jpg',
    contentType: 'image/jpeg',
  });
  form.append('captured_at', capturedAt);

  const response = await axios.post<EntryResult>(`${config.serverUrl}${PATHS[type]}`, form, {
    headers: {
      ...form.getHeaders(),
      'X-Agent-Key': config.agentApiKey,
    },
    timeout: 15000,
  });

  return response.data;
}

/**
 * Rasmni s-backend ga yuboradi. Tarmoq/5xx xatosi bo'lsa — rasmni yo'qotmaslik
 * uchun `queue/`ga saqlaydi (keyinroq `queueProcessor` orqali qayta yuboriladi).
 */
export async function sendToServer(
  type: ParkingEventType,
  image: Buffer,
  capturedAt: string = new Date().toISOString()
): Promise<EntryResult> {
  try {
    return await postToServer(type, image, capturedAt);
  } catch (error) {
    if (!isRetryableError(error)) {
      logger.error(`Server ga yuborishda xato (${type}): ${(error as Error).message}`);
      return { detected: false };
    }

    try {
      const filename = await saveToQueue(type, image, capturedAt);
      logger.warn(`[${LABELS[type]}] Server bilan aloqa yo'q — rasm navbatga saqlandi (queue/${filename})`);
    } catch (queueError) {
      logger.error(`Navbatga saqlashda xato: ${(queueError as Error).message}`);
    }

    return { detected: false, queued: true };
  }
}
