import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import FormData from 'form-data';
import axios from 'axios';
import { config } from './config';
import { logger } from './logger';
import { describeError } from './errors';

export type ParkingEventType = 'entry' | 'exit';

export const BACKEND_REQUEST_TIMEOUT_MS = 15000;

export interface EntryResult {
  detected: boolean;
  queued?: boolean;
  confidence?: number;
  session?: {
    id?: number;
    plate_number?: string;
  };
  reason?: 'ocr_failed' | 'no_candidate' | 'auth_error' | 'duplicate' | 'client_error' | 'network_error';
}

export interface VerifyResult {
  plate: string | null;
  confidence: number;
}

const PATHS: Record<ParkingEventType, string> = {
  entry: '/api/agent/parking/entry',
  exit: '/api/agent/parking/exit',
};

const VERIFY_PATH = '/api/agent/parking/verify';
const HEARTBEAT_PATH = '/api/agent/heartbeat';

const LABELS: Record<ParkingEventType, string> = {
  entry: 'Kirish',
  exit: 'Chiqish',
};

export const QUEUE_DIR = path.join(process.cwd(), 'queue');

function isRetryableError(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return true;
    }
    return error.response.status >= 500;
  }
  return true;
}

function describeNonRetryableReason(error: unknown): 'auth_error' | 'duplicate' | 'client_error' {
  if (axios.isAxiosError(error) && error.response) {
    if (error.response.status === 401) return 'auth_error';
    if (error.response.status === 409) return 'duplicate';
  }
  return 'client_error';
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
    timeout: BACKEND_REQUEST_TIMEOUT_MS,
  });

  return response.data;
}

export async function sendToServer(
  type: ParkingEventType,
  image: Buffer,
  capturedAt: string = new Date().toISOString()
): Promise<EntryResult> {
  try {
    const result = await postToServer(type, image, capturedAt);
    if (!result.detected && !result.reason) {
      return { ...result, reason: 'ocr_failed' };
    }
    return result;
  } catch (error) {
    if (!isRetryableError(error)) {
      const reason = describeNonRetryableReason(error);
      logger.error(`Server ga yuborishda xato (${type}): ${describeError(error)}`);
      return { detected: false, reason };
    }

    try {
      const filename = await saveToQueue(type, image, capturedAt);
      logger.warn(`[${LABELS[type]}] Server bilan aloqa yo'q — rasm navbatga saqlandi (queue/${filename})`);
    } catch (queueError) {
      logger.error(`Navbatga saqlashda xato: ${describeError(queueError)}`);
    }

    return { detected: false, queued: true, reason: 'network_error' };
  }
}

export async function verifyPlate(image: Buffer): Promise<VerifyResult> {
  try {
    const form = new FormData();
    form.append('image', image, {
      filename: 'snapshot.jpg',
      contentType: 'image/jpeg',
    });

    const response = await axios.post<VerifyResult>(`${config.serverUrl}${VERIFY_PATH}`, form, {
      headers: {
        ...form.getHeaders(),
        'X-Agent-Key': config.agentApiKey,
      },
      timeout: BACKEND_REQUEST_TIMEOUT_MS,
    });

    return response.data;
  } catch (error) {
    logger.error(`Ikkinchi tasdiqlashda xato: ${describeError(error)}`);
    return { plate: null, confidence: 0 };
  }
}

export async function sendHeartbeat(
  cameraEntryOk: boolean | null,
  cameraExitOk: boolean | null,
  failedQueueCount: number,
  corruptedQueueCount: number
): Promise<void> {
  await axios.post(
    `${config.serverUrl}${HEARTBEAT_PATH}`,
    {
      camera_entry_ok: cameraEntryOk,
      camera_exit_ok: cameraExitOk,
      failed_queue_count: failedQueueCount,
      corrupted_queue_count: corruptedQueueCount,
    },
    {
      headers: { 'X-Agent-Key': config.agentApiKey },
      timeout: 5000,
    }
  );
}
