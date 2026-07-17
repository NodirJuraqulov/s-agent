import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import FormData from 'form-data';
import axios from 'axios';
import { config } from './config';
import { logger } from './logger';
import { describeError } from './errors';

export type ParkingEventType = 'entry' | 'exit';

// s-backend'ga har bir HTTP so'rov (postToServer/verifyPlate) shu vaqtdan
// ko'p kutmaydi. index.ts'dagi SHUTDOWN_SAFETY_TIMEOUT_MS ATAYLAB shu
// qiymatdan KATTA qilib hisoblanadi (shu konstantadan import qilib) — aks
// holda shutdown paytida hali javob kutayotgan so'rov ma'lumot yo'qotmasdan
// yakunlanishga (yoki navbatga saqlanishga) ulgurmay, process majburan
// o'chirilib qolishi mumkin edi.
export const BACKEND_REQUEST_TIMEOUT_MS = 15000;

export interface EntryResult {
  detected: boolean;
  queued?: boolean;
  confidence?: number;
  session?: {
    id?: number;
    plate_number?: string;
  };
  // `detected: false` bo'lganda SABABNI aniq ko'rsatadi — agent.ts buni
  // to'g'ri, chalg'itmaydigan log yozish uchun ishlatadi:
  //  - 'ocr_failed'    — so'rov muvaffaqiyatli bajarildi, lekin OCR nomer topmadi (haqiqiy OCR muammosi)
  //  - 'auth_error'    — backend 401 qaytardi (Agent API Key noto'g'ri/eskirgan)
  //  - 'duplicate'     — backend 409 qaytardi (mashina allaqachon stoyankada)
  //  - 'client_error'  — boshqa qayta urinishga arzimaydigan 4xx (masalan 400/422)
  //  - 'network_error' — tarmoq/timeout/5xx, rasm navbatga saqlandi (`queued: true`)
  reason?: 'ocr_failed' | 'auth_error' | 'duplicate' | 'client_error' | 'network_error';
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

/** Qayta urinishga arzimaydigan (4xx) xatoning ANIQ sababini aniqlaydi — faqat isRetryableError false qaytarganda chaqiriladi. */
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
    timeout: BACKEND_REQUEST_TIMEOUT_MS,
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

/**
 * Ikkinchi (mustaqil) kadrni tekshiradi — sessiya YARATMAYDI, bazaga
 * yozmaydi, faqat OCR natijasini qaytaradi. Shlagbaumni ochishdan oldingi
 * qo'shimcha tasdiqlash (`agent.ts`) uchun ishlatiladi. Bu — navbat (queue)
 * mantig'iga kirmaydi: xato bo'lsa fail-closed tarzda "aniqlanmadi" deb
 * qaytaradi (noaniq holatda shlagbaum ochilmasligi kerak).
 */
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

/**
 * Backend'ga "men tirikman" signalini yuboradi — juda kichik, tez so'rov.
 * `cameraEntryOk`/`cameraExitOk` — har bir kamera turining ENG SO'NGGI
 * `captureFrame()` urinishi muvaffaqiyatli bo'lgan-bo'lmaganini bildiradi
 * (`agent.ts` dagi `lastCameraEntryOk`/`lastCameraExitOk`) — hali hech
 * qanday urinish bo'lmagan bo'lsa `null`. `failedQueueCount` — `queue/failed/`
 * papkasida qolib ketgan (MAX_ATTEMPTS marta yuborilmagan) so'rovlar soni,
 * shunda operator navbat orqasida to'planib qolgan yo'qolgan hodisalar
 * borligini (papkani qo'lda tekshirmasdan) heartbeat orqali bilib oladi.
 * Shunda backend/operator s-agent DASTURI ishlab turgani bilan birga,
 * KAMERANING o'zi ham ulanganligini bilib oladi. Xato bo'lsa tashlaydi —
 * chaqiruvchi (`agent.ts`) buni faqat log yozib o'tkazib yuborishi kerak,
 * chunki heartbeat vaqtincha yetib bormasligi tizimni to'xtatadigan sabab
 * emas.
 */
export async function sendHeartbeat(
  cameraEntryOk: boolean | null,
  cameraExitOk: boolean | null,
  failedQueueCount: number
): Promise<void> {
  await axios.post(
    `${config.serverUrl}${HEARTBEAT_PATH}`,
    { camera_entry_ok: cameraEntryOk, camera_exit_ok: cameraExitOk, failed_queue_count: failedQueueCount },
    {
      headers: { 'X-Agent-Key': config.agentApiKey },
      timeout: 5000,
    }
  );
}
