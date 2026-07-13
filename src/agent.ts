import { captureFrame } from './camera';
import { detectMotion } from './motion';
import { initBarrier, openBarrier } from './barrier';
import { sendToServer, ParkingEventType } from './server';
import { getQueueSize, processQueue } from './queueProcessor';
import { config } from './config';
import { logger } from './logger';

const QUEUE_CHECK_INTERVAL_MS = 30000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let running = true;

/** Asosiy sikllarni to'xtatadi (SIGINT kabi holatlarda graceful shutdown uchun). */
export function stopAgent(): void {
  running = false;
}

/**
 * Bitta kamera oqimini (Kirish yoki Chiqish) kuzatadi. Har bir oqim o'zining
 * previousFrame holatini mustaqil saqlaydi — boshqa oqimga ta'sir qilmaydi.
 */
async function watchCamera(type: ParkingEventType, cameraUrl: string, label: string): Promise<void> {
  let previousFrame: Buffer | null = null;

  while (running) {
    try {
      const frame = await captureFrame(cameraUrl);

      const motion = await detectMotion(frame, previousFrame, config.motionThreshold);
      previousFrame = frame;

      if (motion) {
        logger.info(`${label}: harakat aniqlandi!`);

        // 2 soniya kut (mashina to'xtasin)
        await sleep(2000);

        // Yangi rasm ol (to'xtagan holat)
        const snapshot = await captureFrame(cameraUrl);
        const capturedAt = new Date().toISOString();

        // s-backend ga yuborish
        const result = await sendToServer(type, snapshot, capturedAt);

        if (result.detected) {
          logger.info(`${label}: nomer aniqlandi: ${result.session?.plate_number ?? "noma'lum"}`);
          // Shlagbaum och
          await openBarrier();
        } else if (!result.queued) {
          // queued=true holatda sendToServer o'zi "navbatga saqlandi" logini allaqachon yozgan
          logger.warn(`${label}: nomer aniqlanmadi — operator xabardor`);
        }

        // 5 soniya kut (bir mashina uchun qayta ishga tushmasin)
        await sleep(5000);
      }

      // Keyingi tekshiruv
      await sleep(config.captureIntervalMs);
    } catch (error) {
      logger.error(`${label} xatosi: ${(error as Error).message}`);
      await sleep(5000); // Xato bo'lsa 5s kut, qayta urinish
    }
  }

  logger.info(`${label}: oqim to'xtatildi`);
}

function watchEntry(): Promise<void> {
  return watchCamera('entry', config.cameraEntryUrl, 'Kirish');
}

function watchExit(): Promise<void> {
  return watchCamera('exit', config.cameraExitUrl, 'Chiqish');
}

/**
 * Kirish/Chiqish oqimlaridan mustaqil: har QUEUE_CHECK_INTERVAL_MS da
 * navbatni (queue/) tekshiradi va bo'sh bo'lmasa qayta yuborishga harakat qiladi.
 */
async function watchQueue(): Promise<void> {
  while (running) {
    await sleep(QUEUE_CHECK_INTERVAL_MS);

    try {
      const queueSize = await getQueueSize();
      if (queueSize > 0) {
        logger.info(`Navbatda ${queueSize} ta yuborilmagan so'rov bor, qayta urinilmoqda...`);
        await processQueue();
      }
    } catch (error) {
      logger.error(`Navbatni tekshirishda xato: ${(error as Error).message}`);
    }
  }

  logger.info("Navbat kuzatuvi to'xtatildi");
}

export async function startAgent(): Promise<void> {
  logger.info('AutoStoyanka Local Agent ishga tushdi');
  logger.info(`Kirish kamerasi: ${config.cameraEntryUrl}`);
  logger.info(`Chiqish kamerasi: ${config.cameraExitUrl}`);
  logger.info(`Server: ${config.serverUrl}`);
  logger.info(`ORG_ID: ${config.orgId}`);

  initBarrier(config.barrierPort);

  // Kirish, Chiqish va Navbat oqimlari bir vaqtda, mustaqil ishlaydi
  await Promise.all([watchEntry(), watchExit(), watchQueue()]);

  logger.info("Local Agent to'xtatildi");
}
