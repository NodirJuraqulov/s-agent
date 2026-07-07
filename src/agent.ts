import { captureFrame } from './camera';
import { detectMotion } from './motion';
import { initBarrier, openBarrier } from './barrier';
import { sendToServer } from './server';
import { config } from './config';
import { logger } from './logger';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let running = true;

/** Asosiy siklni to'xtatadi (SIGINT kabi holatlarda graceful shutdown uchun). */
export function stopAgent(): void {
  running = false;
}

export async function startAgent(): Promise<void> {
  logger.info('AutoStoyanka Local Agent ishga tushdi');
  logger.info(`Kamera: ${config.cameraUrl}`);
  logger.info(`Server: ${config.serverUrl}`);
  logger.info(`ORG_ID: ${config.orgId}`);

  initBarrier(config.barrierPort);

  while (running) {
    try {
      // Kameradan rasm ol
      const frame = await captureFrame(config.cameraUrl);

      // Harakat bormi?
      const motion = await detectMotion(frame, config.motionThreshold);

      if (motion) {
        logger.info('Harakat aniqlandi!');

        // 2 soniya kut (mashina to'xtasin)
        await sleep(2000);

        // Yangi rasm ol (to'xtagan holat)
        const snapshot = await captureFrame(config.cameraUrl);

        // s-backend ga yuborish
        const result = await sendToServer(snapshot);

        if (result.detected) {
          logger.info(`Nomer aniqlandi: ${result.session?.plate_number ?? "noma'lum"}`);
          // Shlagbaum och
          await openBarrier();
        } else {
          logger.warn('Nomer aniqlanmadi — operator xabardor');
        }

        // 5 soniya kut (bir mashina uchun qayta ishga tushmasin)
        await sleep(5000);
      }

      // Keyingi tekshiruv
      await sleep(config.captureIntervalMs);
    } catch (error) {
      logger.error(`Xato: ${(error as Error).message}`);
      await sleep(5000); // Xato bo'lsa 5s kut, qayta urinish
    }
  }

  logger.info("Local Agent to'xtatildi");
}
